/*
 * Parents Go To — keeps the site's data in step with the backend.
 *
 * The rest of the frontend still reads and writes window.localStorage the way
 * it always has. This file sits underneath:
 *
 *   - For each key listed in ADAPTERS below, a write to localStorage is
 *     compared with what was there before. The records that changed go into
 *     an outbox, and the outbox is sent to the API a moment later.
 *   - After signing in, on a timer and when the tab comes back into focus,
 *     each key is refreshed from the API. Changes still waiting in the outbox
 *     are laid back on top, so nothing typed offline is lost.
 *   - After a refresh the module's usual change event fires (for example
 *     "ptg:board"), plus "ptg:synced" with { key }, so the page repaints.
 *
 * The server is the source of truth: it decides moderation, ids it assigns,
 * who may see what. Anything it refuses is rolled back on the next refresh.
 *
 * Signing out removes the synced keys from this browser.
 */
(function() {
  "use strict";
  var Api = window.PTGApi;
  var noop = function() {
    return Promise.resolve();
  };
  if (!Api || !Api.enabled || !window.localStorage || !window.Storage) {
    window.PTGSync = {
      enabled: false,
      start: noop,
      stop: noop,
      pull: noop,
      pullAll: noop,
      flush: noop,
      pause: function() {},
      resume: function() {},
      active: function() {
        return false;
      },
      toast: function() {}
    };
    return;
  }

  var LS = window.localStorage;
  var nativeGet = window.Storage.prototype.getItem;
  var nativeSet = window.Storage.prototype.setItem;
  var nativeRemove = window.Storage.prototype.removeItem;
  var OUTBOX_KEY = "ptg-sync-outbox-v1";
  var POLL_MS = Math.max(5, Number((window.PTG_CONFIG || {}).pollSeconds) || 20) * 1e3;

  var adapters = {};
  var order = [];
  var ctx = null; // { email, role } while signed in
  var paused = 0;
  var silent = 0;
  var timers = {};
  var retries = {};
  var chains = {};
  var firstPull = {};
  var lastPullAll = 0;
  var pollTimer = null;
  var stopping = Promise.resolve();
  var closing = false; // signing out: send what's left, fetch nothing new
  var offline = false;

  /* ------------------------------------------------------------ helpers */

  function lower(v) {
    return String(v || "").trim().toLowerCase();
  }

  function parse(raw) {
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // JSON with sorted keys, leaving out null/undefined object fields, so two
  // values that mean the same thing compare equal.
  function canon(v) {
    if (v === null || v === undefined) {
      return "null";
    }
    if (Array.isArray(v)) {
      return "[" + v.map(canon).join(",") + "]";
    }
    if (typeof v === "object") {
      return "{" + Object.keys(v).sort().filter(function(k) {
        return v[k] !== null && v[k] !== undefined;
      }).map(function(k) {
        return JSON.stringify(k) + ":" + canon(v[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(v);
  }

  function same(a, b) {
    return canon(a) === canon(b);
  }

  function values(map) {
    return Object.keys(map).map(function(k) {
      return map[k];
    });
  }

  function copy(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function fire(name, detail, target) {
    var ev;
    try {
      ev = detail === undefined ? new window.Event(name) : new window.CustomEvent(name, {
        detail: detail
      });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(name, false, false, detail === undefined ? null : detail);
    }
    (target || window).dispatchEvent(ev);
  }

  function readKey(key) {
    return parse(nativeGet.call(LS, key));
  }

  function writeSilently(key, value) {
    silent++;
    try {
      if (value === null || value === undefined) {
        nativeRemove.call(LS, key);
      } else {
        nativeSet.call(LS, key, JSON.stringify(value));
      }
    } catch (e) {} finally {
      silent--;
    }
  }

  function transient(err) {
    return !err || !err.status || err.status >= 500 || err.status === 429 || err.status === 408;
  }

  /* ------------------------------------------------------------- toasts */

  var toastEl = null;
  var toastTimer = null;
  function toast(message, ms) {
    if (!document.body) {
      return;
    }
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "ptgSyncToast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" + "max-width:min(92vw,520px);padding:12px 16px;border-radius:12px;z-index:2147483000;" + "background:#0D3B32;color:#fff;font:500 14px/1.4 'Public Sans',system-ui,sans-serif;" + "box-shadow:0 8px 28px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;pointer-events:none";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.style.opacity = "1";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function() {
      toastEl.style.opacity = "0";
    }, ms || 5e3);
  }

  window.addEventListener("ptg:online", function(e) {
    var online = !!(e.detail && e.detail.online);
    if (!online && !offline) {
      offline = true;
      if (ctx) {
        toast("You're offline. Your changes will be saved when the connection is back.", 7e3);
      }
    } else if (online && offline) {
      offline = false;
      if (ctx) {
        toast("Back online — saving your changes.");
        flushAll();
      }
    }
  });

  /* ------------------------------------------------------------- outbox */

  // { owner: email, keys: { key: { recordKey: { before, after, v } } } }
  var outbox = parse(nativeGet.call(LS, OUTBOX_KEY)) || {
    owner: "",
    keys: {}
  };
  if (!outbox.keys) {
    outbox.keys = {};
  }

  function saveOutbox() {
    try {
      nativeSet.call(LS, OUTBOX_KEY, JSON.stringify(outbox));
    } catch (e) {}
  }

  function box(key) {
    return outbox.keys[key] || (outbox.keys[key] = {});
  }

  function pending(key) {
    return Object.keys(box(key)).length > 0;
  }

  /* ---------------------------------------------------------- the engine */

  function guestCtx() {
    return {
      email: "",
      role: "guest"
    };
  }

  function allowed(a, kind) {
    if (!ctx) {
      return kind === "push" && !!a.publicPush;
    }
    var roles = (kind === "pull" ? a.pullRoles : a.pushRoles) || a.roles;
    return roles.indexOf(ctx.role) !== -1;
  }

  function chain(key, fn) {
    var prev = chains[key] || Promise.resolve();
    var next = prev.then(fn, fn);
    chains[key] = next["catch"](function(err) {
      if (window.console && console.warn) {
        console.warn("[sync]", key, err);
      }
    });
    return chains[key];
  }

  function localChange(key, beforeRaw, afterRaw) {
    var a = adapters[key];
    if (paused || !allowed(a, "push")) {
      return;
    }
    var c = ctx || guestCtx();
    var b = a.records(parse(beforeRaw) || a.empty(c), c);
    var n = a.records(parse(afterRaw) || a.empty(c), c);
    var bx = box(key);
    var changed = false;
    var seen = {};
    Object.keys(b).concat(Object.keys(n)).forEach(function(rk) {
      if (seen[rk]) {
        return;
      }
      seen[rk] = true;
      if (same(b[rk], n[rk])) {
        return;
      }
      // Signed out, only brand-new records (like a contact message) are sent.
      if (!ctx && (b[rk] !== undefined || n[rk] === undefined)) {
        return;
      }
      var entry = bx[rk];
      if (!entry) {
        entry = bx[rk] = {
          before: b[rk] === undefined ? null : copy(b[rk]),
          v: 0
        };
      }
      entry.after = n[rk] === undefined ? null : copy(n[rk]);
      entry.v++;
      if (same(entry.before, entry.after)) {
        delete bx[rk];
      }
      changed = true;
    });
    if (changed) {
      if (ctx && !outbox.owner) {
        outbox.owner = ctx.email;
      }
      saveOutbox();
      schedulePush(key, a.delay || 400);
    }
  }

  // Watch localStorage writes for the keys we sync.
  window.Storage.prototype.setItem = function(key, value) {
    if (this === LS && !silent && adapters[key]) {
      var before = nativeGet.call(LS, key);
      nativeSet.call(LS, key, value);
      var after = String(value);
      if (before !== after) {
        localChange(key, before, after);
      }
      return;
    }
    return nativeSet.apply(this, arguments);
  };
  window.Storage.prototype.removeItem = function(key) {
    if (this === LS && !silent && adapters[key]) {
      var before = nativeGet.call(LS, key);
      nativeRemove.call(LS, key);
      if (before !== null) {
        localChange(key, before, null);
      }
      return;
    }
    return nativeRemove.apply(this, arguments);
  };

  function schedulePush(key, ms) {
    window.clearTimeout(timers[key]);
    timers[key] = window.setTimeout(function() {
      chain(key, function() {
        return push(key);
      });
    }, ms);
  }

  // Lay the outbox on top of a value from the server.
  function overlay(a, key, serverValue, c) {
    var bx = box(key);
    if (!Object.keys(bx).length) {
      return serverValue;
    }
    var recs = a.records(serverValue, c);
    Object.keys(bx).forEach(function(rk) {
      if (bx[rk].after === null) {
        delete recs[rk];
      } else {
        recs[rk] = copy(bx[rk].after);
      }
    });
    return a.build(recs, serverValue, c);
  }

  function install(a, key, serverValue, c) {
    // A page can ask us to wait (for example while an edit dialog is open),
    // so a refresh never swaps data out from under someone typing.
    if (a.ready && !a.ready()) {
      window.clearTimeout(timers["retry:" + key]);
      timers["retry:" + key] = window.setTimeout(function() {
        if (ctx === c) {
          chain(key, function() {
            return install(a, key, serverValue, c);
          });
        }
      }, 1500);
      return false;
    }
    window.clearTimeout(timers["retry:" + key]);
    // Let the page save anything it is still holding before we read.
    fire("ptg:before-sync", {
      key: key
    });
    var next = overlay(a, key, serverValue, c);
    var cur = readKey(key);
    if (cur !== null && same(cur, next)) {
      return false;
    }
    writeSilently(key, next);
    if (a.notify) {
      try {
        a.notify(c);
      } catch (e) {}
    }
    fire("ptg:synced", {
      key: key
    });
    return true;
  }

  // The API client adapters use. While signing out, requests are pinned to
  // the departing person's token so a quick new sign-in can't mix them up.
  function client(token) {
    return token ? Api.withToken(token) : Api;
  }

  function pull(key) {
    var a = adapters[key];
    if (!a || !ctx || closing || !allowed(a, "pull") || !a.pull) {
      return Promise.resolve();
    }
    var c = ctx;
    var localBefore = readKey(key);
    return a.pull(c, client()).then(function(serverValue) {
      if (ctx !== c) {
        return;
      }
      if (!firstPull[key]) {
        firstPull[key] = true;
        // First time on the server for this shelf: upload what this browser has.
        if (a.adopt && a.adopt(serverValue, localBefore, c) && !pending(key)) {
          localChange(key, JSON.stringify(serverValue), JSON.stringify(localBefore));
        }
      }
      install(a, key, serverValue, c);
    }, function(err) {
      if (err && err.status && err.status !== 401 && err.status !== 403 && window.console) {
        console.warn("[sync] refresh failed", key, err.status, err.message);
      }
    });
  }

  function settle(key, entries, result) {
    var bx = box(key);
    var done = result.done || [];
    var dropped = result.dropped || [];
    entries.forEach(function(e) {
      var now = bx[e.rk];
      if (!now) {
        return;
      }
      var finished = done.indexOf(e.rk) !== -1 || dropped.some(function(d) {
        return d.rk === e.rk;
      });
      if (!finished) {
        return;
      }
      if (now.v === e.v) {
        delete bx[e.rk];
      } else {
        // Changed again while we were sending: next time, send it as a change.
        now.before = e.after;
      }
    });
    saveOutbox();
    if (dropped.length && ctx) {
      toast(dropped[0].message ? "Couldn't save that change: " + dropped[0].message : "Some changes couldn't be saved and were undone.", 7e3);
    }
  }

  function push(key, token) {
    var a = adapters[key];
    var bx = box(key);
    if (!a || paused || !Object.keys(bx).length || !allowed(a, "push")) {
      return Promise.resolve();
    }
    var c = ctx || guestCtx();
    var entries = Object.keys(bx).map(function(rk) {
      return {
        rk: rk,
        before: copy(bx[rk].before),
        after: copy(bx[rk].after),
        v: bx[rk].v
      };
    });
    if (!ctx) {
      entries = entries.filter(function(e) {
        return e.before === null && e.after !== null;
      });
    }
    return Promise.resolve(a.push(entries, c, client(token))).then(function(result) {
      result = result || {};
      if (!result.done && !result.dropped && !result.retry) {
        result.done = entries.map(function(e) {
          return e.rk;
        });
      }
      settle(key, entries, result);
      retries[key] = 0;
      if (result.retry && result.retry.length) {
        backoff(key);
      }
      if (!ctx || ctx !== c && c.role !== "guest") {
        return;
      }
      if (result.value !== undefined) {
        return install(a, key, result.value, c);
      }
      return pull(key);
    }, function(err) {
      if (transient(err)) {
        backoff(key);
        return;
      }
      settle(key, entries, {
        dropped: entries.map(function(e) {
          return {
            rk: e.rk,
            message: Api.errorMessage(err)
          };
        })
      });
      return pull(key);
    });
  }

  function backoff(key) {
    var n = retries[key] = (retries[key] || 0) + 1;
    var wait = [ 2e3, 5e3, 15e3, 3e4, 6e4 ][Math.min(n - 1, 4)];
    schedulePush(key, wait);
  }

  function pullAll() {
    if (!ctx) {
      return Promise.resolve();
    }
    lastPullAll = Date.now();
    return Promise.all(order.filter(function(key) {
      return allowed(adapters[key], "pull");
    }).map(function(key) {
      return chain(key, function() {
        return pull(key);
      });
    }));
  }

  function poll() {
    if (!ctx || document.visibilityState === "hidden") {
      return;
    }
    order.forEach(function(key) {
      var a = adapters[key];
      if (a.poll && allowed(a, "pull") && !pending(key)) {
        chain(key, function() {
          return pull(key);
        });
      }
    });
  }

  function flush(key, token) {
    window.clearTimeout(timers[key]);
    return chain(key, function() {
      return push(key, token);
    });
  }

  function flushAll(token) {
    return Promise.all(Object.keys(adapters).map(function(key) {
      return flush(key, token);
    }));
  }

  function onFocus() {
    if (ctx && Date.now() - lastPullAll > 5e3) {
      pullAll();
    }
  }
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
      onFocus();
    }
  });
  window.addEventListener("focus", onFocus);

  function clearLocal() {
    order.forEach(function(key) {
      writeSilently(key, null);
    });
    outbox = {
      owner: "",
      keys: {}
    };
    saveOutbox();
  }

  function withTimeout(promise, ms) {
    return new Promise(function(resolve) {
      var t = window.setTimeout(resolve, ms);
      promise.then(function() {
        window.clearTimeout(t);
        resolve();
      }, function() {
        window.clearTimeout(t);
        resolve();
      });
    });
  }

  /* --------------------------------------------------------- public API */

  window.PTGSync = {
    enabled: true,
    active: function() {
      return !!ctx;
    },
    session: function() {
      return ctx ? {
        email: ctx.email,
        role: ctx.role
      } : null;
    },
    // Called after signing in or restoring a session. Resolves once every
    // key has been refreshed from the server.
    start: function(session) {
      return stopping.then(function() {
        var email = lower(session && session.email);
        if (!email) {
          return;
        }
        if (outbox.owner && outbox.owner !== email) {
          // Leftover changes from someone else on this browser: never send them as this person.
          outbox = {
            owner: email,
            keys: {}
          };
          saveOutbox();
        }
        outbox.owner = email;
        ctx = {
          email: email,
          role: session.role === "admin" ? "admin" : "parent"
        };
        firstPull = {};
        window.clearInterval(pollTimer);
        pollTimer = window.setInterval(poll, POLL_MS);
        flushAll();
        return pullAll();
      });
    },
    // Called when signing out. Sends anything still waiting (briefly), then
    // forgets this person's data in this browser when clear is true.
    stop: function(opts) {
      window.clearInterval(pollTimer);
      pollTimer = null;
      Object.keys(timers).forEach(function(k) {
        window.clearTimeout(timers[k]);
      });
      var was = ctx;
      var token = Api.token();
      closing = !!was;
      stopping = withTimeout(was ? flushAll(token) : Promise.resolve(), 2500).then(function() {
        if (ctx === was) {
          ctx = null;
        }
        closing = false;
        Object.keys(timers).forEach(function(k) {
          window.clearTimeout(timers[k]);
        });
        if (opts && opts.clear) {
          clearLocal();
        }
      });
      return stopping;
    },
    // When the person's email changes, everything is reloaded under the new one.
    rekey: function(email) {
      if (!ctx) {
        return Promise.resolve();
      }
      ctx = {
        email: lower(email),
        role: ctx.role
      };
      outbox = {
        owner: ctx.email,
        keys: {}
      };
      saveOutbox();
      firstPull = {};
      return pullAll();
    },
    pull: function(key) {
      return chain(key, function() {
        return pull(key);
      });
    },
    pullAll: pullAll,
    flush: flush,
    flushAll: flushAll,
    // Pause while a page rewrites lots of keys that shouldn't be sent
    // (resume, then pullAll, to take the server's version).
    pause: function() {
      paused++;
    },
    resume: function() {
      paused = Math.max(0, paused - 1);
    },
    pending: pending,
    toast: toast,
    register: register
  };

  function register(a) {
    adapters[a.key] = a;
    order.push(a.key);
    // Stop modules from writing their built-in sample data before the server
    // has answered: an empty value means "nothing yet".
    if (nativeGet.call(LS, a.key) === null && a.seedBlocker) {
      writeSilently(a.key, a.empty(guestCtx()));
    }
  }

  /* ------------------------------------------------------------ adapters */

  var enc = Api.enc;

  // Runs record changes one by one; a refused change is dropped, a network
  // problem stops the run so the rest is retried later.
  function sequential(entries, handler) {
    var result = {
      done: [],
      dropped: [],
      retry: []
    };
    var i = 0;
    function next() {
      if (i >= entries.length) {
        return Promise.resolve(result);
      }
      var e = entries[i++];
      var p;
      try {
        p = handler(e);
      } catch (err) {
        p = Promise.reject(err);
      }
      return Promise.resolve(p).then(function() {
        result.done.push(e.rk);
        return next();
      }, function(err) {
        if (transient(err)) {
          result.retry = entries.slice(i - 1).map(function(x) {
            return x.rk;
          });
          return result;
        }
        result.dropped.push({
          rk: e.rk,
          message: Api.errorMessage(err)
        });
        return next();
      });
    }
    return next();
  }

  function moderationChanged(b, a) {
    return b && a && (b.state !== a.state || (b.reason || "") !== (a.reason || ""));
  }

  // Keys shaped { items: [ {id, ...} ] }.
  function listAdapter(o) {
    var field = o.field || "items";
    return {
      key: o.key,
      roles: o.roles,
      pushRoles: o.pushRoles,
      pullRoles: o.pullRoles,
      publicPush: o.publicPush,
      poll: o.poll,
      seedBlocker: o.seedBlocker,
      empty: function() {
        var v = {};
        v[field] = [];
        return v;
      },
      records: function(value) {
        var out = {};
        var list = value && Array.isArray(value[field]) ? value[field] : [];
        list.forEach(function(r) {
          if (r && r.id !== undefined && r.id !== null) {
            out[String(r.id)] = r;
          }
        });
        return out;
      },
      build: function(recs, template) {
        var v = {};
        Object.keys(template || {}).forEach(function(k) {
          v[k] = template[k];
        });
        v[field] = values(recs);
        return v;
      },
      pull: function(c, api) {
        return api.get(o.path).then(function(d) {
          var v = {};
          v[field] = d.items || [];
          return v;
        });
      },
      push: function(entries, c, api) {
        return sequential(entries, function(e) {
          return o.change(e.before, e.after, c, api);
        });
      },
      notify: function() {
        if (o.event) {
          fire(o.event, o.eventDetail);
        }
      }
    };
  }

  /* Accounts: the admin console's list of people (or just yourself). */
  register({
    key: "ptg-accounts-v1",
    roles: [ "parent", "admin" ],
    pushRoles: [],
    empty: function() {
      return {
        accounts: {},
        order: []
      };
    },
    records: function() {
      return {};
    },
    build: function(recs, template) {
      return template;
    },
    pull: function(c, api) {
      var shape = function(u) {
        return {
          id: u.id,
          email: u.email,
          name: u.name || "",
          role: u.role,
          status: u.status,
          lockedOut: !!u.lockedOut,
          tempPassword: !!u.tempPassword,
          createdAt: u.createdAt || (u.createdAt === 0 ? 0 : null),
          lastSeen: u.lastSeen || null,
          passwordChangedAt: u.passwordChangedAt || null,
          shelf: u.shelf || null
        };
      };
      var build = function(list) {
        var v = {
          accounts: {},
          order: []
        };
        list.forEach(function(u) {
          var k = lower(u.email);
          v.accounts[k] = shape(u);
          v.order.push(k);
        });
        return v;
      };
      if (c.role === "admin") {
        return api.admin.users().then(function(d) {
          return build(d.users || []);
        });
      }
      return api.auth.me().then(function(d) {
        var u = d.user || {};
        u.createdAt = u.createdAt ? new Date(u.createdAt).getTime() : null;
        u.lastSeen = u.lastSeen ? new Date(u.lastSeen).getTime() : null;
        u.passwordChangedAt = u.passwordChangedAt ? new Date(u.passwordChangedAt).getTime() : null;
        return build([ u ]);
      });
    },
    poll: true
  });

  /* Settings: your own preferences, plus the platform rules. */
  var PLATFORM_PROFILE = "admin::~platform";
  register({
    key: "ptg-settings-v1",
    roles: [ "parent", "admin" ],
    empty: function() {
      return {
        profiles: {}
      };
    },
    records: function(value, c) {
      var p = value && value.profiles ? value.profiles[c.role + "::" + c.email] : undefined;
      return p === undefined ? {} : {
        own: p
      };
    },
    build: function(recs, template, c) {
      var v = copy(template) || {
        profiles: {}
      };
      if (!v.profiles) {
        v.profiles = {};
      }
      if (recs.own === undefined) {
        delete v.profiles[c.role + "::" + c.email];
      } else {
        v.profiles[c.role + "::" + c.email] = recs.own;
      }
      return v;
    },
    pull: function(c, api) {
      return Promise.all([ api.get("/api/me/data/prefs"), api.get("/api/settings/platform") ]).then(function(r) {
        var v = {
          profiles: {}
        };
        var platform = r[1].settings || {};
        platform.savedAt = 0;
        v.profiles[PLATFORM_PROFILE] = platform;
        if (r[0].value) {
          v.profiles[c.role + "::" + c.email] = r[0].value;
        }
        return v;
      });
    },
    push: function(entries, c, api) {
      return sequential(entries, function(e) {
        return e.after ? api.put("/api/me/data/prefs", {
          value: e.after
        }) : api.del("/api/me/data/prefs");
      });
    }
  });

  /* The family shelf: children, library, wishlist, reading log. */
  var SHELF_TYPES = {
    children: "child",
    books: "book",
    wishlist: "wish",
    sessions: "session"
  };
  function shelfOf(value, c) {
    return value && typeof value === "object" ? value[c.email] || null : null;
  }
  function shelfHasContent(s) {
    return !!(s && ((s.children || []).length || (s.books || []).length || (s.wishlist || []).length || (s.sessions || []).length));
  }
  register({
    key: "ptg-shelves-v1",
    roles: [ "parent" ],
    seedBlocker: true,
    delay: 600,
    ready: function() {
      return !document.querySelector("#page-app dialog[open]");
    },
    empty: function() {
      return {};
    },
    records: function(value, c) {
      var s = shelfOf(value, c);
      var out = {};
      if (!s) {
        return out;
      }
      var ord = {};
      Object.keys(SHELF_TYPES).forEach(function(list) {
        ord[list] = [];
        (s[list] || []).forEach(function(r) {
          if (r && r.id !== undefined && r.id !== null) {
            out[SHELF_TYPES[list] + ":" + r.id] = r;
            ord[list].push(String(r.id));
          }
        });
      });
      out.order = ord;
      out.meta = {
        colour: s.parent && s.parent.colour || "#0D3B32",
        activity: s.activity || [],
        bedtime: s.bedtime || null
      };
      return out;
    },
    build: function(recs, template, c) {
      var base = shelfOf(template, c) || {
        parent: {
          name: "there",
          email: c.email,
          colour: "#0D3B32"
        },
        children: [],
        books: [],
        wishlist: [],
        sessions: [],
        activity: []
      };
      var s = copy(base);
      var ord = recs.order || {};
      Object.keys(SHELF_TYPES).forEach(function(list) {
        var prefix = SHELF_TYPES[list] + ":";
        var items = {};
        Object.keys(recs).forEach(function(rk) {
          if (rk.indexOf(prefix) === 0) {
            items[rk.slice(prefix.length)] = recs[rk];
          }
        });
        var out = [];
        (ord[list] || []).forEach(function(id) {
          if (items[id]) {
            out.push(items[id]);
            delete items[id];
          }
        });
        s[list] = values(items).concat(out);
      });
      if (recs.meta) {
        s.parent = s.parent || {};
        s.parent.colour = recs.meta.colour || s.parent.colour;
        s.activity = recs.meta.activity || [];
        if (recs.meta.bedtime) {
          s.bedtime = recs.meta.bedtime;
        }
      }
      var v = {};
      v[c.email] = s;
      return v;
    },
    pull: function(c, api) {
      return api.get("/api/shelf").then(function(d) {
        var v = {};
        v[c.email] = d.shelf;
        return v;
      });
    },
    adopt: function(serverValue, localValue, c) {
      return !shelfHasContent(shelfOf(serverValue, c)) && shelfHasContent(shelfOf(localValue, c));
    },
    push: function(entries, c, api) {
      var body = {
        ops: []
      };
      var index = {};
      entries.forEach(function(e) {
        if (e.rk === "order") {
          body.order = e.after || undefined;
          return;
        }
        if (e.rk === "meta") {
          body.meta = e.after || undefined;
          return;
        }
        var cut = e.rk.indexOf(":");
        var type = e.rk.slice(0, cut);
        var id = e.rk.slice(cut + 1);
        index[body.ops.length] = e.rk;
        body.ops.push(e.after ? {
          op: "put",
          type: type,
          id: id,
          data: e.after
        } : {
          op: "delete",
          type: type,
          id: id
        });
      });
      return api.patch("/api/shelf", body).then(function(d) {
        var dropped = (d.rejected || []).map(function(r) {
          return {
            rk: index[r.index],
            message: r.message
          };
        });
        var v = {};
        v[c.email] = d.shelf;
        return {
          done: entries.map(function(e) {
            return e.rk;
          }).filter(function(rk) {
            return !dropped.some(function(x) {
              return x.rk === rk;
            });
          }),
          dropped: dropped,
          value: v
        };
      });
    }
  });

  /* Admin console: the team's resources and the suggestions queue. */
  register({
    key: "ptg-console-v1",
    roles: [ "parent", "admin" ],
    pushRoles: [ "admin" ],
    poll: true,
    seedBlocker: true,
    ready: function() {
      return !document.querySelector("#page-admin dialog[open]");
    },
    empty: function() {
      return {
        posts: [],
        submissions: []
      };
    },
    records: function(value) {
      var out = {};
      ((value || {}).posts || []).forEach(function(p) {
        if (p && p.id) {
          out["p:" + p.id] = p;
        }
      });
      ((value || {}).submissions || []).forEach(function(s) {
        if (s && s.id) {
          out["s:" + s.id] = s;
        }
      });
      return out;
    },
    build: function(recs) {
      var v = {
        posts: [],
        submissions: []
      };
      Object.keys(recs).forEach(function(rk) {
        (rk.indexOf("p:") === 0 ? v.posts : v.submissions).push(recs[rk]);
      });
      return v;
    },
    pull: function(c, api) {
      return Promise.all([ api.get("/api/resources"), api.get("/api/community/suggestions") ]).then(function(r) {
        return {
          posts: r[0].items || [],
          submissions: r[1].items || []
        };
      });
    },
    push: function(entries, c, api) {
      return sequential(entries, function(e) {
        var b = e.before, a = e.after;
        if (e.rk.indexOf("p:") === 0) {
          if (!b && a) {
            return api.post("/api/resources", a);
          }
          if (b && !a) {
            return api.del("/api/resources/" + enc(b.id));
          }
          return api.put("/api/resources/" + enc(a.id), a);
        }
        if (moderationChanged(b, a)) {
          return api.patch("/api/community/suggestions/" + enc(a.id) + "/moderation", {
            state: a.state,
            reason: a.reason || ""
          });
        }
      });
    }
  });

  /* Suggestions parents send (the console moderates them). */
  register(listAdapter({
    key: "ptg-suggestions-v1",
    roles: [ "parent", "admin" ],
    pushRoles: [ "parent" ],
    path: "/api/community/suggestions",
    event: "ptg:suggestions",
    poll: true,
    change: function(b, a, c, api) {
      if (!b && a) {
        return api.post("/api/community/suggestions", {
          id: a.id,
          title: a.title,
          body: a.body,
          link: a.link,
          category: a.category,
          ages: a.ages
        });
      }
      if (b && !a) {
        return api.del("/api/community/suggestions/" + enc(b.id));
      }
    }
  }));

  /* Message board. */
  register(listAdapter({
    key: "ptg-board-v1",
    roles: [ "parent", "admin" ],
    path: "/api/community/board",
    event: "ptg:board",
    poll: true,
    seedBlocker: true,
    change: function(b, a, c, api) {
      if (!b && a) {
        return api.post("/api/community/board", {
          id: a.id,
          body: a.body,
          ages: a.ages,
          parentId: a.parentId || undefined
        });
      }
      if (b && !a) {
        return api.del("/api/community/board/" + enc(b.id));
      }
      if (c.role === "admin" && moderationChanged(b, a)) {
        return api.patch("/api/community/board/" + enc(a.id) + "/moderation", {
          state: a.state === "approved" ? "published" : a.state,
          reason: a.reason || ""
        });
      }
    }
  }));

  /* Parents' book reviews. */
  register(listAdapter({
    key: "ptg-reviews-v1",
    roles: [ "parent", "admin" ],
    path: "/api/community/reviews",
    event: "ptg:reviews",
    poll: true,
    seedBlocker: true,
    change: function(b, a, c, api) {
      if (!b && a) {
        return api.post("/api/community/reviews", {
          id: a.id,
          bookTitle: a.bookTitle,
          bookAuthor: a.bookAuthor,
          rating: a.rating,
          body: a.body
        });
      }
      if (b && !a) {
        return api.del("/api/community/reviews/" + enc(b.id));
      }
      if (lower(a.owner) === c.email && (a.rating !== b.rating || a.body !== b.body)) {
        return api.patch("/api/community/reviews/" + enc(a.id), {
          rating: a.rating,
          body: a.body
        });
      }
      if (c.role === "admin" && moderationChanged(b, a)) {
        return api.patch("/api/community/reviews/" + enc(a.id) + "/moderation", {
          state: a.state === "approved" ? "published" : a.state,
          reason: a.reason || ""
        });
      }
    }
  }));

  /* Carers invited to share the shelf. */
  register(listAdapter({
    key: "ptg-family-v1",
    roles: [ "parent" ],
    path: "/api/family",
    event: "ptg:family",
    poll: true,
    change: function(b, a, c, api) {
      if (!b && a) {
        return api.post("/api/family", {
          id: a.id,
          ref: a.ref,
          name: a.name,
          email: a.email
        });
      }
      if (b && a && a.state !== b.state) {
        if (a.state === "withdrawn") {
          return api.post("/api/family/" + enc(a.id) + "/withdraw");
        }
        if (a.state === "accepted") {
          return api.post("/api/family/" + enc(a.id) + "/accept");
        }
      }
    }
  }));

  /* Chat: threads, messages and read markers. */
  register({
    key: "ptg-chat-v1",
    roles: [ "parent" ],
    poll: true,
    delay: 250,
    empty: function() {
      return {
        threads: [],
        msgs: {},
        reads: {}
      };
    },
    records: function(value) {
      var out = {};
      value = value || {};
      (value.threads || []).forEach(function(t) {
        if (t && t.id) {
          out["t:" + t.id] = t;
        }
      });
      Object.keys(value.msgs || {}).forEach(function(tid) {
        (value.msgs[tid] || []).forEach(function(m) {
          if (m && m.id) {
            out["m:" + m.id] = m;
          }
        });
      });
      Object.keys(value.reads || {}).forEach(function(k) {
        out["r:" + k] = value.reads[k];
      });
      return out;
    },
    build: function(recs) {
      var v = {
        threads: [],
        msgs: {},
        reads: {}
      };
      Object.keys(recs).forEach(function(rk) {
        var r = recs[rk];
        if (rk.indexOf("t:") === 0) {
          v.threads.push(r);
        } else if (rk.indexOf("m:") === 0) {
          (v.msgs[r.thread] = v.msgs[r.thread] || []).push(r);
        } else if (rk.indexOf("r:") === 0) {
          v.reads[rk.slice(2)] = r;
        }
      });
      v.threads.sort(function(a, b) {
        return (b.at || 0) - (a.at || 0);
      });
      Object.keys(v.msgs).forEach(function(tid) {
        v.msgs[tid].sort(function(a, b) {
          return (a.at || 0) - (b.at || 0);
        });
      });
      return v;
    },
    pull: function(c, api) {
      return api.get("/api/chat").then(function(d) {
        return d.chat || {
          threads: [],
          msgs: {},
          reads: {}
        };
      });
    },
    push: function(entries, c, api) {
      // Threads first, then messages, then read markers.
      var rank = function(e) {
        return e.rk.charAt(0) === "t" ? 0 : e.rk.charAt(0) === "m" ? 1 : 2;
      };
      entries.sort(function(x, y) {
        return rank(x) - rank(y);
      });
      return sequential(entries, function(e) {
        var b = e.before, a = e.after;
        var kind = e.rk.charAt(0);
        if (kind === "t") {
          if (!b && a) {
            return api.post("/api/chat/threads", a);
          }
          if (b && !a) {
            return api.del("/api/chat/threads/" + enc(b.id));
          }
          if (a.state !== b.state) {
            return api.patch("/api/chat/threads/" + enc(a.id), {
              state: a.state
            });
          }
          return;
        }
        if (kind === "m") {
          if (!b && a) {
            return api.post("/api/chat/threads/" + enc(a.thread) + "/messages", {
              id: a.id,
              from: a.from,
              name: a.name,
              body: a.body
            });
          }
          return;
        }
        if (a) {
          var key = e.rk.slice(2);
          var cut = key.indexOf("|");
          return api.put("/api/chat/threads/" + enc(key.slice(0, cut)) + "/read", {
            member: key.slice(cut + 1),
            at: a
          });
        }
      });
    },
    notify: function() {
      fire("ptg:chat", {
        t: "sync"
      });
    }
  });

  /* Notifications (the bell). */
  register(listAdapter({
    key: "ptg-notes-v1",
    roles: [ "parent", "admin" ],
    path: "/api/notifications",
    event: "ptg:notes",
    eventDetail: null,
    poll: true,
    change: function(b, a, c, api) {
      if (!b && a) {
        return api.post("/api/notifications", {
          id: a.id,
          to: a.to,
          kind: a.kind,
          tone: a.tone,
          title: a.title,
          body: a.body,
          go: a.go,
          tag: a.tag
        });
      }
      if (b && !a) {
        return api.del("/api/notifications/" + enc(b.id));
      }
      if (a.read && !b.read) {
        return api.post("/api/notifications/" + enc(a.id) + "/read");
      }
      if ((a.count || 1) > (b.count || 1)) {
        // The same notification again: the server merges it and counts it.
        return api.post("/api/notifications", {
          to: a.to,
          kind: a.kind,
          tone: a.tone,
          title: a.title,
          body: a.body,
          go: a.go,
          tag: a.tag
        });
      }
    }
  }));

  /* Support reports and contact messages (visitors can send these too). */
  register(listAdapter({
    key: "ptg-support-v1",
    field: "tickets",
    roles: [ "parent", "admin" ],
    publicPush: true,
    path: "/api/support",
    event: "ptg:contact",
    poll: true,
    change: function(b, a, c, api) {
      if (!b && a) {
        var body = copy(a);
        body.from = a.from;
        return api.post("/api/support", body, {
          auth: c.role !== "guest"
        });
      }
      if (b && a && c.role === "admin" && a.state !== b.state) {
        return api.patch("/api/support/" + enc(a.id), {
          state: a.state
        });
      }
      if (b && a && b.shot && !a.shot) {
        return api.del("/api/support/" + enc(a.id) + "/screenshot");
      }
    }
  }));

  /* Activity log: everyone adds; administrators read. */
  register({
    key: "ptg-audit-v1",
    roles: [ "parent", "admin" ],
    pullRoles: [ "admin" ],
    poll: true,
    empty: function() {
      return [];
    },
    records: function(value) {
      var out = {};
      (Array.isArray(value) ? value : []).forEach(function(e) {
        if (e && e.id) {
          out[e.id] = e;
        }
      });
      return out;
    },
    build: function(recs) {
      return values(recs).sort(function(a, b) {
        return (b.at || 0) - (a.at || 0);
      });
    },
    pull: function(c, api) {
      return api.get("/api/audit?limit=400").then(function(d) {
        return d.items || [];
      });
    },
    push: function(entries, c, api) {
      return sequential(entries, function(e) {
        if (!e.before && e.after) {
          return api.post("/api/audit", {
            id: e.after.id,
            kind: e.after.kind,
            what: e.after.what,
            detail: e.after.detail
          });
        }
      });
    }
  });

  /* Wishlist share link. */
  register({
    key: "ptg-wishlist-share-v1",
    roles: [ "parent" ],
    empty: function() {
      return {
        byToken: {},
        byOwner: {}
      };
    },
    records: function(value, c) {
      value = value || {};
      var token = (value.byOwner || {})[c.email];
      var rec = token && value.byToken ? value.byToken[token] : null;
      return rec ? {
        mine: rec
      } : {};
    },
    build: function(recs, template, c) {
      var v = {
        byToken: {},
        byOwner: {}
      };
      if (recs.mine) {
        v.byToken[recs.mine.token] = recs.mine;
        v.byOwner[c.email] = recs.mine.token;
      }
      return v;
    },
    pull: function(c, api) {
      return api.get("/api/share/mine").then(function(d) {
        var v = {
          byToken: {},
          byOwner: {}
        };
        if (d.item) {
          d.item.owner = c.email;
          v.byToken[d.item.token] = d.item;
          v.byOwner[c.email] = d.item.token;
        }
        return v;
      });
    },
    push: function(entries, c, api) {
      return sequential(entries, function(e) {
        return e.after ? api.put("/api/share/mine", e.after) : api.del("/api/share/mine");
      });
    }
  });

  /* Small per-person documents kept as { email: value } in the browser. */
  function perEmailDoc(key, dataKey, roles) {
    return {
      key: key,
      roles: roles,
      empty: function() {
        return {};
      },
      records: function(value, c) {
        var rec = value && typeof value === "object" ? value[c.email] : undefined;
        return rec === undefined ? {} : {
          mine: rec
        };
      },
      build: function(recs, template, c) {
        var v = {};
        if (recs.mine !== undefined) {
          v[c.email] = recs.mine;
        }
        return v;
      },
      pull: function(c, api) {
        return api.get("/api/me/data/" + dataKey).then(function(d) {
          var v = {};
          if (d.value) {
            v[c.email] = d.value;
          }
          return v;
        });
      },
      push: function(entries, c, api) {
        return sequential(entries, function(e) {
          return e.after ? api.put("/api/me/data/" + dataKey, {
            value: e.after
          }) : api.del("/api/me/data/" + dataKey);
        });
      }
    };
  }
  register(perEmailDoc("ptg-genres-v1", "genres", [ "parent" ]));
  register(perEmailDoc("ptg-welcome-v1", "welcome", [ "parent" ]));

  /* Children's avatar choices: { childId: look } for this account. */
  register({
    key: "ptg-kid-looks",
    roles: [ "parent" ],
    empty: function() {
      return {};
    },
    records: function(value) {
      return value && typeof value === "object" && Object.keys(value).length ? {
        all: value
      } : {};
    },
    build: function(recs) {
      return recs.all || {};
    },
    pull: function(c, api) {
      return api.get("/api/me/data/kidLooks").then(function(d) {
        return d.value || {};
      });
    },
    push: function(entries, c, api) {
      return sequential(entries, function(e) {
        return e.after ? api.put("/api/me/data/kidLooks", {
          value: e.after
        }) : api.del("/api/me/data/kidLooks");
      });
    },
    notify: function() {
      fire("ptg:look", {
        childId: null
      }, document);
    }
  });
})();
