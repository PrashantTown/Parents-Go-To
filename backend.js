(function() {
  "use strict";
  // Connects the website to Supabase.
  //
  // The feature files (board.js, reviews.js, chat.js, ...) still call their
  // own read() and write(). Those now go through window.PTGStore instead of
  // localStorage: reads come from data loaded after sign-in, and every write
  // is compared with the last saved copy and only the differences are sent
  // to the database. Security is enforced by the database itself.
  var CFG = window.PTG_CONFIG || {};
  var lib = window.supabase;
  var sb = null;
  if (lib && lib.createClient && CFG.supabaseUrl && CFG.supabaseKey) {
    sb = lib.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  var REF = (/^https:\/\/([^.]+)\./.exec(CFG.supabaseUrl || "") || [])[1] || "";
  var ROLE_KEY = "ptg-active-role";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var TONES = { info: 1, good: 1, warn: 1, alert: 1 };

  function hasOwn(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }
  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }
  function isUuid(v) {
    return UUID_RE.test(String(v || ""));
  }
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    var h = Array.prototype.map.call(b, function(x) {
      return ("0" + x.toString(16)).slice(-2);
    }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function mail(v) {
    return String(v == null ? "" : v).trim().toLowerCase();
  }
  function iso(ms) {
    var n = Number(ms);
    return ms && !isNaN(n) ? new Date(n).toISOString() : null;
  }
  function ms(isoText) {
    var n = isoText ? Date.parse(isoText) : NaN;
    return isNaN(n) ? null : n;
  }
  function day(isoText) {
    return isoText ? String(isoText).slice(0, 10) : undefined;
  }
  function cut(v, n) {
    return String(v == null ? "" : v).slice(0, n);
  }
  function parse(text) {
    if (text == null) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }
  function json(v) {
    return JSON.stringify(v === undefined ? null : v);
  }
  function fireEvent(name, detail) {
    var ev;
    try {
      ev = new window.CustomEvent(name, { detail: detail || null });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(name, false, false, detail || null);
    }
    window.dispatchEvent(ev);
  }
  function localGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function localSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  }
  function nameFromEmail(email) {
    var local = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
    return local.replace(/\S+/g, function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }

  // ---------------------------------------------------------------------
  // Who is signed in
  // ---------------------------------------------------------------------

  var me = { id: null, email: "", role: "parent", profile: null, aal: "aal1" };
  var accountsById = {};
  var restoring = false;
  var arrivedFromLink = /access_token=|[?&]code=/.test(window.location.href);
  var recoveryLink = /type=recovery/.test(window.location.href);
  if (sb && REF) {
    restoring = !!localGet("sb-" + REF + "-auth-token") || arrivedFromLink;
  }
  function signedIn() {
    return !!me.id;
  }
  function isAdmin() {
    return signedIn() && me.role === "admin" && me.aal === "aal2";
  }
  function ownerOf(id) {
    if (!id) {
      return "guest";
    }
    if (id === me.id) {
      return mail(me.email);
    }
    return accountsById[id] ? mail(accountsById[id].email) : "user:" + id;
  }
  function labelOf(id) {
    if (!id) {
      return "";
    }
    if (id === me.id) {
      return me.email;
    }
    return accountsById[id] ? accountsById[id].email : "Moderator";
  }

  // ---------------------------------------------------------------------
  // Problems saving: a quiet banner, then automatic retries
  // ---------------------------------------------------------------------

  var banner = null, bannerTimer = null;
  function showProblem(text) {
    if (!document.body) {
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.setAttribute("role", "status");
      banner.className = "ptg-sync-note";
      banner.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;" + "max-width:min(92vw,520px);padding:10px 16px;border-radius:10px;font:14px/1.4 inherit;" + "background:#06283C;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25)";
      document.body.appendChild(banner);
    }
    banner.textContent = text;
    banner.hidden = false;
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(function() {
      banner.hidden = true;
    }, 6e3);
  }
  function report(what, error) {
    if (window.console) {
      console.warn("[backend] " + what + ":", error && error.message || error);
    }
  }

  // ---------------------------------------------------------------------
  // PTGStore: drop-in for localStorage, backed by the database
  // ---------------------------------------------------------------------

  var cache = {};
  var adapters = {};
  var chains = {};
  var retryTimers = {};
  var retryCount = {};

  // Saves wait until the data set has been loaded from the database, so an
  // empty screen drawn during sign-in can never overwrite saved data or
  // start duplicate chats. Notifications and support messages are the
  // exceptions: those may be sent before (or without) loading anything.
  function adapter(key, spec) {
    spec.key = key;
    spec.events = spec.events || [];
    spec.baseline = null;
    spec.loaded = false;
    if (spec.waitForLoad === undefined) {
      spec.waitForLoad = true;
    }
    adapters[key] = spec;
    return spec;
  }
  function announce(key) {
    var a = adapters[key];
    fireEvent("ptg:store", { key: key });
    if (a) {
      a.events.forEach(function(ev) {
        fireEvent(ev);
      });
    }
  }
  // Replace the cached value with what the database holds.
  function putRemote(key, value) {
    var a = adapters[key];
    cache[key] = value == null ? null : json(value);
    if (a) {
      a.baseline = parse(cache[key]);
      a.loaded = true;
    }
    announce(key);
  }
  // Change the cached value without sending it anywhere (server echoes).
  function patchLocal(key, fn) {
    var a = adapters[key];
    var value = parse(cache[key]);
    var base = a ? a.baseline : null;
    value = fn(value) || value;
    if (a && base) {
      a.baseline = fn(base) || base;
    }
    cache[key] = json(value);
    announce(key);
  }
  function schedulePush(key) {
    var a = adapters[key];
    if (!a || !signedIn() && !a.anonymous || a.waitForLoad && !a.loaded) {
      return;
    }
    chains[key] = (chains[key] || Promise.resolve()).then(function() {
      var next = parse(cache[key]);
      var prev = a.baseline;
      return Promise.resolve(a.push(prev, next)).then(function(saved) {
        a.baseline = saved === undefined ? next : saved;
        retryCount[key] = 0;
      });
    }).catch(function(err) {
      report("saving " + key, err);
      retryCount[key] = (retryCount[key] || 0) + 1;
      if (retryCount[key] === 1) {
        showProblem(navigator.onLine === false ? "You are offline. Changes will be saved when you reconnect." : "Some changes could not be saved yet. Trying again shortly.");
      }
      if (retryCount[key] <= 4) {
        window.clearTimeout(retryTimers[key]);
        retryTimers[key] = window.setTimeout(function() {
          schedulePush(key);
        }, [ 0, 5e3, 15e3, 6e4, 18e4 ][retryCount[key]]);
      }
    });
  }
  window.addEventListener("online", function() {
    Object.keys(adapters).forEach(function(key) {
      if (retryCount[key]) {
        retryCount[key] = 0;
        schedulePush(key);
      }
    });
  });

  window.PTGStore = {
    getItem: function(key) {
      if (!adapters[key]) {
        return localGet(key);
      }
      return hasOwn(cache, key) ? cache[key] : null;
    },
    setItem: function(key, value) {
      if (!adapters[key]) {
        localSet(key, value);
        return;
      }
      cache[key] = String(value);
      schedulePush(key);
    },
    removeItem: function(key) {
      if (!adapters[key]) {
        try {
          window.localStorage.removeItem(key);
        } catch (e) {}
        return;
      }
      cache[key] = null;
      schedulePush(key);
    },
    uuid: uuid
  };

  // ---------------------------------------------------------------------
  // Generic list sync: send inserts, updates and deletes by id
  // ---------------------------------------------------------------------

  function byId(list) {
    var out = {};
    (list || []).forEach(function(item) {
      if (item && item.id) {
        out[item.id] = item;
      }
    });
    return out;
  }
  function diff(prevList, nextList) {
    var a = byId(prevList), b = byId(nextList);
    var added = [], changed = [], removed = [];
    Object.keys(b).forEach(function(id) {
      if (!hasOwn(a, id)) {
        added.push(b[id]);
      } else if (json(a[id]) !== json(b[id])) {
        changed.push({ next: b[id], prev: a[id] });
      }
    });
    Object.keys(a).forEach(function(id) {
      if (!hasOwn(b, id)) {
        removed.push(a[id]);
      }
    });
    return { added: added, changed: changed, removed: removed };
  }
  function check(res, what) {
    if (res && res.error) {
      var e = new Error(what + ": " + res.error.message);
      e.cause = res.error;
      throw e;
    }
    return res ? res.data : null;
  }
  function changedFields(next, prev, fields) {
    var out = {}, any = false;
    fields.forEach(function(f) {
      if (json(next[f]) !== json(prev[f])) {
        out[f] = next[f];
        any = true;
      }
    });
    return any ? out : null;
  }
  // spec: { table, list(value), wrap(list, value), syncable(item),
  //         insert(item) -> row, update(next, prev) -> row|null,
  //         fromRow(row, item) -> item, afterInsert(item, row) }
  function listSync(spec) {
    return function(prev, next) {
      var d = diff(spec.list(prev), spec.list(next));
      var keep = spec.syncable || function(item) {
        return isUuid(item.id);
      };
      var jobs = [];
      d.added.filter(keep).forEach(function(item) {
        jobs.push(function() {
          if (spec.insertVia) {
            return spec.insertVia(item);
          }
          return sb.from(spec.table).insert(spec.insert(item)).select().single().then(function(res) {
            var row = check(res, "adding to " + spec.table);
            if (row && spec.fromRow) {
              mergeServerRow(spec, item.id, row);
            }
          });
        });
      });
      d.changed.forEach(function(c) {
        if (!keep(c.next)) {
          return;
        }
        var row = spec.update(c.next, c.prev);
        if (!row) {
          return;
        }
        jobs.push(function() {
          return sb.from(spec.table).update(row).eq("id", c.next.id).select().then(function(res) {
            var rows = check(res, "updating " + spec.table);
            if (rows && rows[0] && spec.fromRow && spec.echoUpdates) {
              mergeServerRow(spec, c.next.id, rows[0]);
            }
          });
        });
      });
      var gone = d.removed.filter(keep).map(function(item) {
        return item.id;
      });
      if (gone.length) {
        jobs.push(function() {
          return sb.from(spec.table).delete().in("id", gone).then(function(res) {
            check(res, "removing from " + spec.table);
          });
        });
      }
      return jobs.reduce(function(p, job) {
        return p.then(job);
      }, Promise.resolve());
    };
  }
  // After an insert the database may have changed fields (state, ref, ...).
  function mergeServerRow(spec, id, row) {
    window.setTimeout(function() {
      patchLocal(spec.key, function(value) {
        var list = spec.list(value);
        list.forEach(function(item, i) {
          if (item && item.id === id) {
            var fresh = spec.fromRow(row, item);
            Object.keys(fresh).forEach(function(k) {
              item[k] = fresh[k];
            });
            list[i] = item;
          }
        });
        return spec.wrap(list, value);
      });
    }, 0);
  }

  function itemsOf(value) {
    return value && isArray(value.items) ? value.items : [];
  }
  function wrapItems(list) {
    return { items: list };
  }

  // ---------------------------------------------------------------------
  // Message board, reviews, suggestions
  // ---------------------------------------------------------------------

  function decidedLabel(row) {
    if (row.decided_by) {
      return labelOf(row.decided_by);
    }
    return row.decided_at ? "Automatic" : "";
  }

  var boardSpec = {
    key: "ptg-board-v1",
    table: "board_posts",
    list: itemsOf,
    wrap: wrapItems,
    fromRow: function(r) {
      return {
        id: r.id,
        from: r.author_name,
        owner: ownerOf(r.author_id),
        body: r.body,
        ages: r.ages,
        at: ms(r.created_at),
        state: r.state,
        reason: r.reason,
        decidedBy: decidedLabel(r),
        decidedAt: ms(r.decided_at),
        parentId: r.reply_to || ""
      };
    },
    insert: function(item) {
      return {
        id: item.id,
        author_name: cut(item.from || "A parent", 60),
        body: item.body,
        ages: item.ages || "",
        reply_to: isUuid(item.parentId) ? item.parentId : null
      };
    },
    update: function(next, prev) {
      return changedFields(next, prev, [ "body", "ages", "state", "reason" ]);
    },
    echoUpdates: true
  };
  adapter(boardSpec.key, { events: [ "ptg:board" ], push: listSync(boardSpec) });

  var reviewSpec = {
    key: "ptg-reviews-v1",
    table: "reviews",
    list: itemsOf,
    wrap: wrapItems,
    fromRow: function(r) {
      return {
        id: r.id,
        book: r.book_key,
        bookTitle: r.book_title,
        bookAuthor: r.book_author,
        from: r.author_name,
        owner: ownerOf(r.author_id),
        rating: r.rating,
        body: r.body,
        at: ms(r.created_at),
        edited: ms(r.edited_at),
        state: r.state,
        reason: r.reason,
        decidedBy: decidedLabel(r),
        decidedAt: ms(r.decided_at)
      };
    },
    insert: function(item) {
      return {
        id: item.id,
        author_name: cut(item.from || "A parent", 60),
        book_key: cut(item.book, 330),
        book_title: cut(item.bookTitle, 200),
        book_author: cut(item.bookAuthor, 120),
        rating: item.rating,
        body: item.body
      };
    },
    update: function(next, prev) {
      return changedFields(next, prev, [ "rating", "body", "state", "reason" ]);
    },
    echoUpdates: true
  };
  adapter(reviewSpec.key, { events: [ "ptg:reviews" ], push: listSync(reviewSpec) });

  var suggestSpec = {
    key: "ptg-suggestions-v1",
    table: "suggestions",
    list: itemsOf,
    wrap: wrapItems,
    fromRow: function(r) {
      return {
        id: r.id,
        origin: "parent",
        title: r.title,
        body: r.body,
        link: r.link,
        category: r.category,
        ages: r.ages,
        from: r.author_name,
        owner: ownerOf(r.author_id),
        at: ms(r.created_at),
        state: r.state,
        reason: r.reason,
        decidedBy: decidedLabel(r),
        decidedAt: ms(r.decided_at)
      };
    },
    insert: function(item) {
      return {
        id: item.id,
        author_name: cut(item.from || "A parent", 60),
        title: cut(item.title, 160),
        body: cut(item.body, 1000),
        link: cut(item.link, 500),
        category: item.category || "",
        ages: item.ages || ""
      };
    },
    update: function(next, prev) {
      return changedFields(next, prev, [ "title", "body", "link", "category", "ages", "state", "reason" ]);
    },
    echoUpdates: true
  };
  adapter(suggestSpec.key, { events: [ "ptg:suggestions" ], push: listSync(suggestSpec) });

  // ---------------------------------------------------------------------
  // Resources written by admins
  // ---------------------------------------------------------------------

  var resourceSpec = {
    key: "ptg-resources-v1",
    table: "resources",
    list: itemsOf,
    wrap: wrapItems,
    fromRow: function(r) {
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        category: r.category,
        ages: r.ages,
        link: r.link,
        state: r.state,
        at: ms(r.updated_at),
        by: r.by_name
      };
    },
    insert: function(item) {
      return {
        id: item.id,
        title: cut(item.title, 200),
        body: cut(item.body, 4000),
        category: item.category || "",
        ages: item.ages || "",
        link: cut(item.link, 500),
        state: item.state === "published" ? "published" : "draft",
        by_name: cut(item.by, 254)
      };
    },
    update: function(next, prev) {
      var row = changedFields(next, prev, [ "title", "body", "category", "ages", "link", "state" ]);
      if (row && row.state) {
        row.state = row.state === "published" ? "published" : "draft";
      }
      return row;
    },
    syncable: function(item) {
      return isUuid(item.id) && isAdmin();
    }
  };
  adapter(resourceSpec.key, { events: [ "ptg:resources" ], push: listSync(resourceSpec) });

  // ---------------------------------------------------------------------
  // Family invitations
  // ---------------------------------------------------------------------

  var familySpec = {
    key: "ptg-family-v1",
    table: "family_members",
    list: itemsOf,
    wrap: wrapItems,
    fromRow: function(r) {
      return {
        id: r.id,
        ref: r.ref,
        owner: ownerOf(r.owner_id),
        name: r.name,
        email: r.email,
        role: r.role,
        state: r.state,
        by: r.invited_by === me.id ? mail(me.email) : "",
        byName: r.by_name,
        at: ms(r.created_at),
        acceptedAt: ms(r.accepted_at),
        withdrawnAt: ms(r.withdrawn_at),
        withdrawnBy: r.withdrawn_by ? labelOf(r.withdrawn_by) : "",
        memberId: r.member_id || ""
      };
    },
    insert: function(item) {
      return {
        id: item.id,
        ref: /^PTG-F[A-Z0-9]{4,8}$/.test(String(item.ref || "")) ? item.ref : undefined,
        name: cut(item.name, 60),
        email: mail(item.email),
        by_name: cut(item.byName || me.profile && me.profile.display_name || "", 60)
      };
    },
    update: function(next, prev) {
      return changedFields(next, prev, [ "name", "state" ]);
    },
    syncable: function(item) {
      return isUuid(item.id) && item.owner === mail(me.email);
    }
  };
  adapter(familySpec.key, { events: [ "ptg:family" ], push: listSync(familySpec) });

  // ---------------------------------------------------------------------
  // Notifications (only the signed-in person's own are stored)
  // ---------------------------------------------------------------------

  function myAddress(audience) {
    return (audience === "admin" ? "admin" : "parent") + "::" + mail(me.email);
  }
  var noteSpec = {
    key: "ptg-notes-v1",
    table: "notifications",
    list: itemsOf,
    wrap: function(list) {
      return { items: list };
    },
    fromRow: function(r) {
      return {
        id: r.id,
        to: myAddress(r.audience),
        kind: r.kind,
        tone: r.tone,
        title: r.title,
        body: r.body,
        go: r.go,
        tag: r.tag,
        at: ms(r.created_at),
        read: !!r.read_at
      };
    },
    insert: function(item) {
      return {
        id: item.id,
        recipient_id: me.id,
        audience: String(item.to || "").indexOf("admin::") === 0 ? "admin" : "parent",
        kind: cut(item.kind || "system", 40),
        tone: TONES[item.tone] ? item.tone : "info",
        title: cut(item.title, 160) || "Notice",
        body: cut(item.body, 600),
        go: cut(item.go, 60),
        tag: cut(item.tag, 120)
      };
    },
    update: function(next, prev) {
      if (!!next.read === !!prev.read) {
        return null;
      }
      return { read_at: next.read ? new Date().toISOString() : null };
    },
    syncable: function(item) {
      return isUuid(item.id) && (item.to === myAddress("parent") || item.to === myAddress("admin"));
    }
  };
  adapter(noteSpec.key, { events: [ "ptg:notes" ], push: listSync(noteSpec), waitForLoad: false });

  // ---------------------------------------------------------------------
  // Support tickets and the contact form
  // ---------------------------------------------------------------------

  function shotPath(ticketId) {
    return me.id + "/" + ticketId + ".png";
  }
  function uploadShot(ticketId, tries) {
    var shots = window.PTGShots;
    tries = tries || 0;
    if (!shots || !shots.get) {
      return Promise.resolve();
    }
    return shots.get(ticketId).then(function(blob) {
      if (!blob || !blob.size) {
        if (tries < 4) {
          return new Promise(function(r) {
            window.setTimeout(r, 700);
          }).then(function() {
            return uploadShot(ticketId, tries + 1);
          });
        }
        return;
      }
      var path = shotPath(ticketId);
      return sb.storage.from("support-attachments").upload(path, blob, {
        upsert: true,
        contentType: blob.type || "image/png"
      }).then(function(res) {
        check(res, "uploading the screenshot");
        return sb.from("support_tickets").update({ attachment_paths: [ path ] }).eq("id", ticketId);
      });
    }).catch(function(err) {
      report("screenshot upload", err);
    });
  }
  var supportSpec = {
    key: "ptg-support-v1",
    table: "support_tickets",
    list: function(value) {
      return value && isArray(value.tickets) ? value.tickets : [];
    },
    wrap: function(list) {
      return { tickets: list };
    },
    fromRow: function(r) {
      return {
        id: r.id,
        ref: r.ref,
        from: r.from_email || r.email,
        replyTo: r.email,
        source: r.source === "app" ? "parent" : r.source,
        name: r.name,
        area: r.area,
        severity: r.severity,
        severityText: r.severity_text,
        body: r.body,
        diag: r.diag,
        shot: r.attachment_paths && r.attachment_paths.length ? r.attachment_paths[0] : null,
        at: ms(r.created_at),
        state: r.state,
        decidedAt: r.state === "open" ? null : ms(r.updated_at)
      };
    },
    insertVia: function(item) {
      if (item.source === "public") {
        return sb.rpc("submit_contact_message", {
          sender_name: cut(item.name, 80),
          sender_email: item.replyTo || item.from,
          topic: cut(item.area, 80),
          message: cut(item.body, 4000),
          ticket_id: item.id
        }).then(function(res) {
          var ref = check(res, "sending the message");
          if (ref) {
            window.setTimeout(function() {
              patchLocal(supportSpec.key, function(value) {
                supportSpec.list(value).forEach(function(t) {
                  if (t.id === item.id) {
                    t.ref = ref;
                  }
                });
                return value;
              });
            }, 0);
          }
        });
      }
      var sev = { low: 1, med: 1, high: 1 };
      return sb.from("support_tickets").insert({
        id: item.id,
        source: item.source === "admin" ? "admin" : "parent",
        name: cut(item.name, 80),
        email: cut(item.replyTo || item.from || me.email, 254),
        area: cut(item.area, 80),
        severity: sev[item.severity] ? item.severity : "med",
        severity_text: cut(item.severityText, 200),
        body: cut(item.body, 4000) || "(no message)",
        diag: cut(item.diag, 4000)
      }).select().single().then(function(res) {
        var row = check(res, "filing the report");
        mergeServerRow(supportSpec, item.id, row);
        if (item.shot) {
          return uploadShot(item.id);
        }
      });
    },
    update: function(next, prev) {
      if (!isAdmin() || next.state === prev.state) {
        return null;
      }
      return { state: next.state === "progress" || next.state === "closed" ? next.state : "open" };
    },
    syncable: function(item) {
      return isUuid(item.id) && (signedIn() || item.source === "public");
    }
  };
  adapter(supportSpec.key, { events: [ "ptg:contact", "ptg:support" ], push: listSync(supportSpec), anonymous: true, waitForLoad: false });

  // ---------------------------------------------------------------------
  // Wishlist share links
  // ---------------------------------------------------------------------

  adapter("ptg-wishlist-share-v1", {
    events: [ "ptg:share" ],
    push: function(prev, next) {
      var mine = mail(me.email);
      var before = prev && prev.byToken || {}, after = next && next.byToken || {};
      var jobs = [];
      Object.keys(after).forEach(function(tok) {
        var rec = after[tok];
        if (!rec || rec.owner !== mine || json(rec) === json(before[tok])) {
          return;
        }
        jobs.push(function() {
          return sb.from("wishlist_shares").upsert({
            token: tok,
            owner_id: me.id,
            owner_name: cut(rec.ownerName, 60),
            scope: rec.scope === "invite" ? "invite" : "link",
            initials: !!rec.initials,
            expiry: String(rec.expiry || ""),
            expires_at: iso(rec.expires),
            items: rec.items || [],
            created_at: iso(rec.created) || new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: "token" }).then(function(res) {
            check(res, "saving the share link");
          });
        });
      });
      Object.keys(before).forEach(function(tok) {
        if (!after[tok] && before[tok] && before[tok].owner === mine) {
          jobs.push(function() {
            return sb.from("wishlist_shares").delete().eq("token", tok).then(function(res) {
              check(res, "turning off the share link");
            });
          });
        }
      });
      return jobs.reduce(function(p, job) {
        return p.then(job);
      }, Promise.resolve());
    }
  });

  // ---------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------

  function kidPart(from) {
    var bits = String(from || "").split(":");
    return bits.length >= 3 && bits[0] === "kid" && isUuid(bits[bits.length - 1]) ? bits[bits.length - 1] : null;
  }
  function familyMemberId(email) {
    var fam = itemsOf(parse(cache["ptg-family-v1"]));
    for (var i = 0; i < fam.length; i++) {
      if (mail(fam[i].email) === mail(email) && fam[i].state === "accepted" && isUuid(fam[i].memberId)) {
        return fam[i].memberId;
      }
    }
    return null;
  }
  function addShelfMembers(thread) {
    if (thread.kind !== "shelf") {
      return Promise.resolve();
    }
    var rows = [];
    (thread.members || []).forEach(function(m) {
      if (String(m).indexOf("mail:") === 0) {
        var id = familyMemberId(String(m).slice(5));
        if (id) {
          rows.push({ thread_id: thread.id, user_id: id });
        }
      }
    });
    if (!rows.length) {
      return Promise.resolve();
    }
    return sb.from("chat_members").upsert(rows, { onConflict: "thread_id,user_id", ignoreDuplicates: true }).then(function(res) {
      check(res, "adding chat members");
    });
  }
  adapter("ptg-chat-v1", {
    events: [ "ptg:chat" ],
    push: function(prev, next) {
      prev = prev || { threads: [], msgs: {}, reads: {} };
      next = next || { threads: [], msgs: {}, reads: {} };
      var jobs = [];
      var td = diff(prev.threads, next.threads);
      td.added.forEach(function(t) {
        if (!isUuid(t.id)) {
          return;
        }
        jobs.push(function() {
          return sb.from("chat_threads").insert({
            id: t.id,
            kind: t.kind,
            key: cut(t.key, 300),
            title: cut(t.title, 120),
            state: t.state === "closed" ? "closed" : "open",
            meta: { account: t.account || "", members: t.members || [], names: t.names || {} }
          }).then(function(res) {
            check(res, "starting the chat");
            return addShelfMembers(t);
          });
        });
      });
      td.changed.forEach(function(c) {
        var t = c.next;
        if (!isUuid(t.id) || t.account && t.account !== mail(me.email) && t.kind === "family") {
          return;
        }
        var row = {};
        if (t.state !== c.prev.state) {
          row.state = t.state === "closed" ? "closed" : "open";
        }
        if (t.title !== c.prev.title) {
          row.title = cut(t.title, 120);
        }
        if (json(t.names) !== json(c.prev.names) || json(t.members) !== json(c.prev.members) || t.account !== c.prev.account) {
          row.meta = { account: t.account || "", members: t.members || [], names: t.names || {} };
        }
        if (!Object.keys(row).length) {
          return;
        }
        jobs.push(function() {
          return sb.from("chat_threads").update(row).eq("id", t.id).then(function(res) {
            check(res, "updating the chat");
            return addShelfMembers(t);
          });
        });
      });
      var goneThreads = td.removed.map(function(t) {
        return t.id;
      }).filter(isUuid);
      var flat = function(store) {
        var out = [];
        Object.keys(store.msgs || {}).forEach(function(tid) {
          (store.msgs[tid] || []).forEach(function(m) {
            out.push(m);
          });
        });
        return out;
      };
      var md = diff(flat(prev), flat(next));
      md.added.forEach(function(m) {
        if (!isUuid(m.id) || !isUuid(m.thread) || goneThreads.indexOf(m.thread) !== -1) {
          return;
        }
        jobs.push(function() {
          return sb.from("chat_messages").insert({
            id: m.id,
            thread_id: m.thread,
            child_id: kidPart(m.from),
            sender_name: cut(m.name, 60),
            body: cut(m.body, 2000)
          }).then(function(res) {
            check(res, "sending the message");
          });
        });
      });
      var readThreads = {};
      Object.keys(next.reads || {}).forEach(function(k) {
        if (json(next.reads[k]) !== json((prev.reads || {})[k])) {
          readThreads[k.split("|")[0]] = true;
        }
      });
      Object.keys(readThreads).forEach(function(tid) {
        if (!isUuid(tid)) {
          return;
        }
        var mine = {};
        Object.keys(next.reads).forEach(function(k) {
          if (k.indexOf(tid + "|") === 0) {
            mine[k.slice(tid.length + 1)] = next.reads[k];
          }
        });
        jobs.push(function() {
          return sb.from("chat_members").update({ reads: mine, last_read_at: new Date().toISOString() }).eq("thread_id", tid).eq("user_id", me.id).then(function(res) {
            check(res, "marking messages read");
          });
        });
      });
      if (goneThreads.length) {
        jobs.push(function() {
          return sb.from("chat_threads").delete().in("id", goneThreads).then(function(res) {
            check(res, "removing the chat");
          });
        });
      }
      return jobs.reduce(function(p, job) {
        return p.then(job);
      }, Promise.resolve());
    }
  });
  function chatFromRows(threads, members, messages) {
    var store = { threads: [], msgs: {}, reads: {} };
    threads.forEach(function(t) {
      var meta = t.meta || {};
      store.threads.push({
        id: t.id,
        key: t.key,
        kind: t.kind,
        title: t.title,
        account: meta.account || "",
        members: isArray(meta.members) ? meta.members : [],
        names: meta.names || {},
        state: t.state,
        at: ms(t.updated_at),
        createdAt: ms(t.created_at)
      });
      store.msgs[t.id] = [];
    });
    messages.forEach(function(m) {
      if (!store.msgs[m.thread_id]) {
        store.msgs[m.thread_id] = [];
      }
      store.msgs[m.thread_id].push({
        id: m.id,
        thread: m.thread_id,
        from: m.sender_key,
        name: m.sender_name,
        body: m.body,
        at: ms(m.created_at)
      });
    });
    members.forEach(function(row) {
      Object.keys(row.reads || {}).forEach(function(who) {
        store.reads[row.thread_id + "|" + who] = row.reads[who];
      });
    });
    return store;
  }

  // ---------------------------------------------------------------------
  // Settings and small per-person stores, kept on the profile
  // ---------------------------------------------------------------------

  var prefDoc = { roles: {}, blobs: {} };
  var prefPending = null;
  // Several stores share one saved document, so they share one pending save
  // (it always sends the latest copy of everything).
  function savePrefDoc() {
    if (prefPending) {
      return prefPending;
    }
    prefPending = new Promise(function(resolve, reject) {
      window.setTimeout(function() {
        prefPending = null;
        if (!signedIn()) {
          resolve();
          return;
        }
        sb.from("profiles").update({ preferences: prefDoc }).eq("id", me.id).then(function(res) {
          try {
            check(res, "saving settings");
            resolve();
          } catch (e) {
            reject(e);
          }
        }, reject);
      }, 600);
    });
    return prefPending;
  }
  var PLATFORM_KEY = "admin::platform";
  adapter("ptg-settings-v1", {
    events: [ "ptg:settings-store" ],
    push: function(prev, next) {
      var profiles = next && next.profiles || {};
      var before = prev && prev.profiles || {};
      var roles = {};
      var adminChanged = false;
      [ "parent", "admin" ].forEach(function(role) {
        var k = role + "::" + mail(me.email);
        if (profiles[k]) {
          roles[role] = profiles[k];
          if (role === "admin" && json(profiles[k]) !== json(before[k])) {
            adminChanged = true;
          }
        }
      });
      prefDoc.roles = roles;
      var jobs = [ savePrefDoc() ];
      if (adminChanged && isAdmin()) {
        jobs.push(sb.from("platform_settings").update({ settings: roles.admin }).eq("id", 1).then(function(res) {
          check(res, "saving site rules");
        }));
      }
      return Promise.all(jobs);
    }
  });
  [ "ptg-genres-v1", "ptg-kid-looks", "ptg-welcome-v1" ].forEach(function(key) {
    adapter(key, {
      events: [],
      push: function(prev, next) {
        prefDoc.blobs[key] = next;
        return savePrefDoc();
      }
    });
  });

  // ---------------------------------------------------------------------
  // The shelf: children, books, wishlist, reading log, activity
  // ---------------------------------------------------------------------

  var CHILD_COLS = [ "id", "name", "age", "band", "colour", "likes" ];
  var BOOK_COLS = [ "id", "title", "author", "category", "ages", "status", "who", "spine", "cover", "pages", "page", "started", "finished", "notes" ];
  var SESSION_COLS = [ "id", "bookId", "childId", "date", "minutes", "page" ];
  function extra(item, cols) {
    var out = {};
    Object.keys(item).forEach(function(k) {
      if (cols.indexOf(k) === -1 && item[k] !== undefined) {
        out[k] = item[k];
      }
    });
    return out;
  }
  function num(v, lo, hi) {
    var n = Number(v);
    if (v === "" || v == null || isNaN(n)) {
      return null;
    }
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }
  function dateOrNull(v) {
    return /^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : null;
  }
  function childRow(k) {
    return {
      id: k.id,
      parent_id: me.id,
      name: cut(String(k.name || "").trim() || "Reader", 100),
      age: num(k.age, 0, 18),
      band: String(k.band || ""),
      colour: String(k.colour || "#0D3B32"),
      likes: isArray(k.likes) ? k.likes.map(String) : [],
      extra: extra(k, CHILD_COLS)
    };
  }
  function bookRow(b, list) {
    var status = { toread: 1, reading: 1, read: 1 };
    return {
      id: b.id,
      owner_id: me.id,
      list: list,
      title: cut(String(b.title || "").trim() || "Untitled", 500),
      author: cut(b.author, 300),
      category: String(b.category || ""),
      ages: String(b.ages || ""),
      status: status[b.status] ? b.status : "toread",
      reader_ids: (b.who || []).filter(isUuid),
      spine: String(b.spine || "#0D3B32"),
      cover: String(b.cover || ""),
      pages: num(b.pages, 0, 5e3),
      page: num(b.page, 0, 5e3),
      started_at: dateOrNull(b.started),
      finished_at: dateOrNull(b.finished),
      notes: cut(b.notes, 1e4),
      extra: extra(b, BOOK_COLS)
    };
  }
  function sessionRow(s) {
    return {
      id: s.id,
      owner_id: me.id,
      book_id: s.bookId,
      child_id: isUuid(s.childId) ? s.childId : null,
      read_on: dateOrNull(s.date) || new Date().toISOString().slice(0, 10),
      minutes: num(s.minutes, 0, 1440) || 0,
      page: num(s.page, 0, 5e3),
      extra: extra(s, SESSION_COLS)
    };
  }
  function childFromRow(r) {
    var k = Object.assign({}, r.extra || {});
    k.id = r.id;
    k.name = r.name;
    k.age = r.age == null ? "" : r.age;
    k.band = r.band;
    k.colour = r.colour;
    k.likes = r.likes || [];
    return k;
  }
  function bookFromRow(r) {
    var b = Object.assign({}, r.extra || {});
    b.id = r.id;
    b.title = r.title;
    b.author = r.author;
    b.category = r.category;
    b.ages = r.ages;
    b.status = r.status;
    b.who = r.reader_ids || [];
    b.spine = r.spine;
    b.cover = r.cover;
    if (r.pages != null) {
      b.pages = r.pages;
    }
    if (r.page != null) {
      b.page = r.page;
    }
    if (r.started_at) {
      b.started = day(r.started_at);
    }
    if (r.finished_at) {
      b.finished = day(r.finished_at);
    }
    b.notes = r.notes;
    return b;
  }
  function sessionFromRow(r) {
    var s = Object.assign({}, r.extra || {});
    s.id = r.id;
    s.bookId = r.book_id;
    s.childId = r.child_id || null;
    s.date = r.read_on;
    s.minutes = r.minutes;
    if (r.page != null) {
      s.page = r.page;
    }
    return s;
  }

  var shelf = { loaded: false, base: null, timer: null, busy: false };
  function shelfSnapshot() {
    var app = window.PTGApp;
    if (!app || !app.capture) {
      return null;
    }
    var cap = app.capture();
    (cap.activity || []).forEach(function(a) {
      if (a && !a.id) {
        a.id = uuid();
      }
    });
    return {
      parent: { name: cap.parent && cap.parent.name || "", colour: cap.parent && cap.parent.colour || "" },
      bedtime: cap.bedtime || null,
      children: (cap.children || []).filter(function(k) {
        return isUuid(k.id);
      }).map(childRow),
      books: (cap.books || []).filter(function(b) {
        return isUuid(b.id);
      }).map(function(b) {
        return bookRow(b, "shelf");
      }).concat((cap.wishlist || []).filter(function(b) {
        return isUuid(b.id);
      }).map(function(b) {
        return bookRow(b, "wishlist");
      })),
      sessions: (cap.sessions || []).filter(function(s) {
        return isUuid(s.id) && isUuid(s.bookId);
      }).map(sessionRow),
      activity: (cap.activity || []).slice(0, 12).map(function(a) {
        return { id: a.id, owner_id: me.id, text: cut(a.text, 300) || "Updated the shelf", created_at: iso(a.at) || new Date().toISOString() };
      })
    };
  }
  function upsertRows(table, rows) {
    if (!rows.length) {
      return Promise.resolve([]);
    }
    return sb.from(table).upsert(rows, { onConflict: "id" }).then(function(res) {
      if (!res.error) {
        return [];
      }
      // One bad row should not block the rest: retry one by one.
      return rows.reduce(function(p, row) {
        return p.then(function(failed) {
          return sb.from(table).upsert(row, { onConflict: "id" }).then(function(r) {
            if (r.error) {
              report("saving to " + table, r.error);
              failed.push(row.id);
            }
            return failed;
          });
        });
      }, Promise.resolve([]));
    });
  }
  function deleteRows(table, ids) {
    if (!ids.length) {
      return Promise.resolve();
    }
    return sb.from(table).delete().in("id", ids).then(function(res) {
      check(res, "removing from " + table);
    });
  }
  function syncShelf() {
    if (!shelf.loaded || shelf.busy || !signedIn() || me.role !== "parent") {
      return Promise.resolve();
    }
    var now = shelfSnapshot();
    if (!now) {
      return Promise.resolve();
    }
    var base = shelf.base;
    var dc = diff(base.children, now.children);
    var db = diff(base.books, now.books);
    var ds = diff(base.sessions, now.sessions);
    var da = diff(base.activity, now.activity);
    var profileRow = {};
    if (json(now.parent) !== json(base.parent)) {
      profileRow.display_name = cut(now.parent.name, 60);
      if (/^#[0-9a-f]{6}$/i.test(now.parent.colour)) {
        profileRow.colour = now.parent.colour;
      }
    }
    if (json(now.bedtime) !== json(base.bedtime) && now.bedtime) {
      profileRow.bedtime = now.bedtime;
    }
    var pick = function(d) {
      return d.added.concat(d.changed.map(function(c) {
        return c.next;
      }));
    };
    var nothing = !Object.keys(profileRow).length && [ dc, db, ds, da ].every(function(d) {
      return !d.added.length && !d.changed.length && !d.removed.length;
    });
    if (nothing) {
      return Promise.resolve();
    }
    shelf.busy = true;
    var failed = [];
    var collect = function(list) {
      failed = failed.concat(list || []);
    };
    var ids = function(d) {
      return d.removed.map(function(r) {
        return r.id;
      });
    };
    return Promise.resolve().then(function() {
      return Object.keys(profileRow).length ? sb.from("profiles").update(profileRow).eq("id", me.id).then(function(res) {
        check(res, "saving your name and bedtime");
      }) : null;
    }).then(function() {
      return upsertRows("children", pick(dc)).then(collect);
    }).then(function() {
      return upsertRows("books", pick(db)).then(collect);
    }).then(function() {
      return upsertRows("reading_sessions", pick(ds)).then(collect);
    }).then(function() {
      return upsertRows("activity", pick(da)).then(collect);
    }).then(function() {
      return deleteRows("reading_sessions", ids(ds));
    }).then(function() {
      return deleteRows("activity", ids(da));
    }).then(function() {
      return deleteRows("books", ids(db));
    }).then(function() {
      return deleteRows("children", ids(dc));
    }).then(function() {
      // Rows the database refused stay "unsaved" so they are retried later.
      var keepOld = function(list, oldList) {
        var old = byId(oldList);
        return list.filter(function(r) {
          return failed.indexOf(r.id) === -1;
        }).concat(failed.filter(function(id) {
          return old[id];
        }).map(function(id) {
          return old[id];
        }));
      };
      shelf.base = {
        parent: now.parent,
        bedtime: now.bedtime,
        children: keepOld(now.children, base.children),
        books: keepOld(now.books, base.books),
        sessions: keepOld(now.sessions, base.sessions),
        activity: keepOld(now.activity, base.activity)
      };
      if (failed.length) {
        showProblem("A few shelf changes could not be saved. Check the details and try again.");
      }
    }).catch(function(err) {
      report("saving the shelf", err);
      showProblem(navigator.onLine === false ? "You are offline. Your shelf will be saved when you reconnect." : "Your shelf could not be saved just now. Trying again shortly.");
    }).then(function() {
      shelf.busy = false;
    });
  }
  function startShelfSync() {
    window.clearInterval(shelf.timer);
    shelf.timer = window.setInterval(syncShelf, 1500);
  }
  window.addEventListener("pagehide", function() {
    syncShelf();
  });
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
      syncShelf();
    } else if (signedIn()) {
      refreshShared();
    }
  });

  function loadShelfData() {
    return Promise.all([
      sb.from("children").select("*").eq("parent_id", me.id).order("created_at", { ascending: true }),
      sb.from("books").select("*").eq("owner_id", me.id).order("created_at", { ascending: false }),
      sb.from("reading_sessions").select("*").eq("owner_id", me.id).order("read_on", { ascending: false }).order("created_at", { ascending: false }).limit(2e3),
      sb.from("activity").select("*").eq("owner_id", me.id).order("created_at", { ascending: false }).limit(12)
    ]).then(function(res) {
      var kids = check(res[0], "loading children") || [];
      var books = check(res[1], "loading books") || [];
      var sessions = check(res[2], "loading the reading log") || [];
      var activity = check(res[3], "loading activity") || [];
      var p = me.profile || {};
      var data = {
        parent: {
          name: p.display_name || nameFromEmail(me.email) || "there",
          email: me.email,
          colour: p.colour || "#0D3B32"
        },
        children: kids.map(childFromRow),
        books: books.filter(function(b) {
          return b.list === "shelf";
        }).map(bookFromRow),
        wishlist: books.filter(function(b) {
          return b.list === "wishlist";
        }).map(bookFromRow),
        sessions: sessions.map(sessionFromRow),
        activity: activity.length ? activity.map(function(a) {
          return { id: a.id, text: a.text, at: ms(a.created_at) };
        }) : [ { id: uuid(), text: "Account created. Add a reading profile to begin.", at: Date.now() } ],
        bedtime: p.bedtime || null
      };
      return data;
    });
  }

  // ---------------------------------------------------------------------
  // Loading everything after sign-in
  // ---------------------------------------------------------------------

  function rows(res, what) {
    return check(res, what) || [];
  }
  function loadCommunity() {
    return Promise.all([
      sb.from("board_posts").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("reviews").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("suggestions").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("resources").select("*").order("updated_at", { ascending: false }).limit(300)
    ]).then(function(res) {
      putRemote(boardSpec.key, { items: rows(res[0], "loading the message board").map(boardSpec.fromRow) });
      putRemote(reviewSpec.key, { items: rows(res[1], "loading reviews").map(reviewSpec.fromRow) });
      putRemote(suggestSpec.key, { items: rows(res[2], "loading suggestions").map(suggestSpec.fromRow) });
      putRemote(resourceSpec.key, { items: rows(res[3], "loading resources").map(resourceSpec.fromRow) });
    });
  }
  function loadNotes() {
    return sb.from("notifications").select("*").eq("recipient_id", me.id).order("created_at", { ascending: false }).limit(200).then(function(res) {
      putRemote(noteSpec.key, { items: rows(res, "loading notifications").map(noteSpec.fromRow) });
    });
  }
  function loadSupport() {
    return sb.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(300).then(function(res) {
      putRemote(supportSpec.key, { tickets: rows(res, "loading support messages").map(supportSpec.fromRow) });
    });
  }
  function loadFamily() {
    return sb.from("family_members").select("*").order("created_at", { ascending: false }).then(function(res) {
      var all = rows(res, "loading family");
      putRemote(familySpec.key, { items: all.map(familySpec.fromRow) });
      return all;
    });
  }
  function loadChat() {
    return Promise.all([
      sb.from("chat_threads").select("*").order("updated_at", { ascending: false }).limit(200),
      sb.from("chat_members").select("thread_id, reads").eq("user_id", me.id)
    ]).then(function(res) {
      var threads = rows(res[0], "loading chats");
      var members = rows(res[1], "loading chats");
      var ids = threads.map(function(t) {
        return t.id;
      });
      var msgs = ids.length ? sb.from("chat_messages").select("*").in("thread_id", ids).order("created_at", { ascending: true }).limit(3e3) : Promise.resolve({ data: [] });
      return msgs.then(function(r) {
        putRemote("ptg-chat-v1", chatFromRows(threads, members, rows(r, "loading messages")));
      });
    });
  }
  function loadShares() {
    return sb.from("wishlist_shares").select("*").eq("owner_id", me.id).is("revoked_at", null).then(function(res) {
      var store = { byToken: {}, byOwner: {} };
      rows(res, "loading share links").forEach(function(s) {
        store.byToken[s.token] = {
          token: s.token,
          owner: mail(me.email),
          ownerName: s.owner_name,
          scope: s.scope,
          initials: s.initials,
          expiry: s.expiry,
          created: ms(s.created_at),
          expires: ms(s.expires_at),
          updated: ms(s.updated_at),
          items: s.items || []
        };
        store.byOwner[mail(me.email)] = s.token;
      });
      putRemote("ptg-wishlist-share-v1", store);
    });
  }
  function loadSettings() {
    var doc = me.profile && me.profile.preferences || {};
    prefDoc = { roles: doc.roles || {}, blobs: doc.blobs || {} };
    return sb.from("platform_settings").select("settings").eq("id", 1).maybeSingle().then(function(res) {
      var platform = res && res.data ? res.data.settings || {} : {};
      var profiles = {};
      if (Object.keys(platform).length) {
        profiles[PLATFORM_KEY] = Object.assign({ savedAt: 0 }, platform);
      }
      Object.keys(prefDoc.roles).forEach(function(role) {
        profiles[role + "::" + mail(me.email)] = prefDoc.roles[role];
      });
      putRemote("ptg-settings-v1", { profiles: profiles });
      [ "ptg-genres-v1", "ptg-kid-looks", "ptg-welcome-v1" ].forEach(function(key) {
        putRemote(key, hasOwn(prefDoc.blobs, key) ? prefDoc.blobs[key] : null);
      });
    });
  }
  var accountList = [];
  var auditList = [];
  function loadAdmin() {
    if (!isAdmin()) {
      accountList = [];
      auditList = [];
      return Promise.resolve();
    }
    return Promise.all([
      sb.rpc("admin_accounts"),
      sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(400)
    ]).then(function(res) {
      accountList = rows(res[0], "loading accounts").map(function(a) {
        return {
          id: a.id,
          email: a.email,
          name: a.name || "",
          role: a.role,
          status: a.status,
          createdAt: ms(a.created_at),
          lastSeen: ms(a.last_seen_at),
          shelf: { children: a.children || 0, books: a.books || 0 }
        };
      });
      accountsById = {};
      accountList.forEach(function(a) {
        accountsById[a.id] = a;
      });
      auditList = rows(res[1], "loading the activity log").map(function(e) {
        var d = e.detail || {};
        return {
          id: "log" + e.id,
          kind: e.kind,
          what: e.what,
          who: e.actor_id ? labelOf(e.actor_id) : d.who || "system",
          detail: typeof d.detail === "string" ? d.detail : "",
          at: ms(e.created_at)
        };
      });
    });
  }
  function loadAll() {
    // Admins load the account list first so posts can show who wrote them.
    return loadAdmin().then(function() {
      return Promise.all([ loadSettings(), loadCommunity(), loadNotes(), loadSupport(), loadFamily(), loadShares(), loadChat() ]);
    }).then(function() {
      if (me.role !== "parent") {
        return null;
      }
      return loadShelfData();
    }).then(function(data) {
      if (data && window.PTGApp && window.PTGApp.loadShelf) {
        window.PTGApp.loadShelf(me.email, { shelf: data, name: data.parent.name });
        shelf.base = shelfSnapshot();
        shelf.loaded = !!shelf.base;
        startShelfSync();
      }
      subscribeLive();
      offerInvites();
      enablePush();
      fireEvent("ptg:data");
    });
  }
  var refreshing = null;
  function refreshShared() {
    if (refreshing || !signedIn()) {
      return refreshing;
    }
    refreshing = Promise.all([ loadCommunity(), loadNotes(), loadSupport(), loadAdmin() ]).catch(function(err) {
      report("refreshing", err);
    }).then(function() {
      refreshing = null;
      if (window.PTGAdmin && window.PTGAdmin.refresh) {
        window.PTGAdmin.refresh();
      }
    });
    return refreshing;
  }

  // Live updates for chat messages and notifications.
  var channel = null;
  function subscribeLive() {
    if (channel) {
      sb.removeChannel(channel);
    }
    channel = sb.channel("ptg-live-" + me.id).on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages"
    }, function(payload) {
      var m = payload.new;
      var store = parse(cache["ptg-chat-v1"]);
      if (!store || !m) {
        return;
      }
      var list = store.msgs[m.thread_id];
      if (!list) {
        loadChat();
        return;
      }
      if (list.some(function(x) {
        return x.id === m.id;
      })) {
        return;
      }
      var msg = { id: m.id, thread: m.thread_id, from: m.sender_key, name: m.sender_name, body: m.body, at: ms(m.created_at) };
      patchLocal("ptg-chat-v1", function(value) {
        value.msgs[m.thread_id] = (value.msgs[m.thread_id] || []).concat([ msg ]);
        value.threads.forEach(function(t) {
          if (t.id === m.thread_id) {
            t.at = Math.max(t.at || 0, msg.at || 0);
          }
        });
        return value;
      });
    }).on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: "recipient_id=eq." + me.id
    }, function(payload) {
      var r = payload.new;
      if (!r) {
        return;
      }
      patchLocal(noteSpec.key, function(value) {
        var list = itemsOf(value);
        if (!list.some(function(x) {
          return x.id === r.id;
        })) {
          list.unshift(noteSpec.fromRow(r));
        }
        return { items: list };
      });
    }).subscribe();
  }

  // Invitations sent to this person's email address.
  function offerInvites() {
    var fam = itemsOf(parse(cache[familySpec.key]));
    var mine = mail(me.email);
    var asked = {};
    try {
      asked = JSON.parse(window.sessionStorage.getItem("ptg-invites-asked") || "{}");
    } catch (e) {}
    var open = fam.filter(function(r) {
      return r.state === "invited" && mail(r.email) === mine && r.owner !== mine && !asked[r.id];
    });
    if (!open.length) {
      return;
    }
    window.setTimeout(function() {
      open.forEach(function(r) {
        asked[r.id] = 1;
        var who = r.byName || "A parent";
        if (window.confirm(who + " has invited you to see their family reading shelf on Parents Go To.\n\nAccept the invitation?")) {
          sb.rpc("accept_family_invite", { invite_ref: r.ref }).then(function(res) {
            if (res.error) {
              showProblem(res.error.message);
              return;
            }
            showProblem("Invitation accepted. " + who + " can now include you in their family.");
            loadFamily();
          });
        }
      });
      try {
        window.sessionStorage.setItem("ptg-invites-asked", JSON.stringify(asked));
      } catch (e) {}
    }, 1200);
  }

  // ---------------------------------------------------------------------
  // Push notifications to this device (needs vapidPublicKey in config.js)
  // ---------------------------------------------------------------------

  function keyBytes(base64) {
    var pad = "=".repeat((4 - base64.length % 4) % 4);
    var raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) {
      out[i] = raw.charCodeAt(i);
    }
    return out;
  }
  function pushSupported() {
    return !!(CFG.vapidPublicKey && "serviceWorker" in navigator && "PushManager" in window && window.Notification);
  }
  function enablePush() {
    if (!signedIn() || !pushSupported() || window.Notification.permission !== "granted") {
      return Promise.resolve(false);
    }
    return navigator.serviceWorker.ready.then(function(reg) {
      return reg.pushManager.getSubscription().then(function(sub) {
        return sub || reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(CFG.vapidPublicKey)
        });
      });
    }).then(function(sub) {
      var j = sub.toJSON();
      return sb.from("push_subscriptions").upsert({
        user_id: me.id,
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        user_agent: cut(navigator.userAgent, 300)
      }, { onConflict: "endpoint" });
    }).then(function(res) {
      return !(res && res.error);
    }).catch(function(err) {
      report("turning on push notifications", err);
      return false;
    });
  }
  // Stop sending this person's alerts to this device when they sign out.
  function dropPush() {
    if (!signedIn() || !pushSupported()) {
      return Promise.resolve();
    }
    return navigator.serviceWorker.ready.then(function(reg) {
      return reg.pushManager.getSubscription();
    }).then(function(sub) {
      return sub ? sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint) : null;
    }).catch(function() {});
  }

  function clearData() {
    window.clearInterval(shelf.timer);
    shelf.loaded = false;
    shelf.base = null;
    if (channel && sb) {
      sb.removeChannel(channel);
      channel = null;
    }
    accountList = [];
    auditList = [];
    accountsById = {};
    prefDoc = { roles: {}, blobs: {} };
    Object.keys(adapters).forEach(function(key) {
      cache[key] = null;
      adapters[key].baseline = null;
      adapters[key].loaded = false;
      announce(key);
    });
    // Do not leave the last person's shelf on screen.
    if (window.PTGApp && window.PTGApp.loadShelf) {
      window.PTGApp.loadShelf("", {
        shelf: {
          parent: { name: "there", email: "", colour: "#0D3B32" },
          children: [],
          books: [],
          wishlist: [],
          sessions: [],
          activity: []
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Sign-in, sign-up, passwords and the admin second step
  // ---------------------------------------------------------------------

  function siteUrl(hash) {
    return String(window.location.href).split("#")[0].split("?")[0] + (hash || "");
  }
  function friendly(error) {
    var m = String(error && error.message || error || "");
    if (/invalid login credentials/i.test(m)) {
      return "That email and password don’t match an account. Check the password, or reset it below.";
    }
    if (/email not confirmed/i.test(m)) {
      return "Please confirm your email address first — open the link we emailed you, then sign in.";
    }
    if (/rate limit|too many|security purposes/i.test(m)) {
      return "Too many attempts in a short time. Wait a minute and try again.";
    }
    if (/already registered|already been registered|already exists/i.test(m)) {
      return "There is already an account on that address — sign in instead.";
    }
    if (/password should|weak password|at least/i.test(m)) {
      return "That password is too weak. Use a longer one.";
    }
    if (/network|fetch/i.test(m)) {
      return "Could not reach the server. Check your internet connection and try again.";
    }
    return m || "Something went wrong. Please try again.";
  }
  function aalOf(session) {
    try {
      var payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.aal || "aal1";
    } catch (e) {
      return "aal1";
    }
  }
  function loadProfile(user) {
    return sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function(res) {
      return check(res, "loading your profile");
    });
  }
  // Called once the browser holds a valid session.
  function becomeUser(session, role) {
    var user = session.user;
    return loadProfile(user).then(function(profile) {
      if (!profile) {
        throw new Error("Your account is still being set up. Try again in a moment.");
      }
      if (profile.status === "suspended") {
        return sb.auth.signOut({ scope: "local" }).then(function() {
          var e = new Error("That account has been suspended by an administrator. Contact the site owner to have it restored.");
          e.suspended = true;
          throw e;
        });
      }
      me.id = user.id;
      me.email = user.email || profile.email;
      me.profile = profile;
      me.aal = aalOf(session);
      me.role = role === "admin" && profile.role === "admin" ? "admin" : "parent";
      localSet(ROLE_KEY, me.role);
      sb.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", me.id).then(function() {});
      return profile;
    });
  }
  function startSession(quiet) {
    if (window.PTGSession && window.PTGSession.start) {
      window.PTGSession.start(me.email, me.role, { quiet: !!quiet, name: me.profile && me.profile.display_name || "" });
    }
  }

  var Backend = {
    client: sb,
    ready: !!sb,
    get restoring() {
      return restoring;
    },
    me: function() {
      return { id: me.id, email: me.email, role: me.role, aal: me.aal, profile: me.profile };
    },
    isAdmin: isAdmin,
    uuid: uuid,
    // Password sign-in. For role "admin" the caller then runs the second step.
    signIn: function(email, password, role) {
      if (!sb) {
        return Promise.reject(new Error("The site is not connected to its database."));
      }
      return sb.auth.signInWithPassword({ email: String(email).trim(), password: password }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
        return becomeUser(res.data.session, role === "admin" ? "admin" : "parent").then(function(profile) {
          if (role === "admin" && profile.role !== "admin") {
            return sb.auth.signOut({ scope: "local" }).then(function() {
              me.id = null;
              throw new Error("That account is not an administrator. Choose Parent to open your shelf.");
            });
          }
          if (role === "admin") {
            return { needsCode: true, profile: profile };
          }
          startSession(false);
          return loadAll().then(function() {
            return { profile: profile };
          });
        });
      });
    },
    // Admin second step. Returns {enrol:true, qr, secret} the first time.
    adminFactor: function() {
      return sb.auth.mfa.listFactors().then(function(res) {
        var data = check(res, "checking your authenticator");
        var verified = (data.totp || []).filter(function(f) {
          return f.status === "verified";
        })[0];
        if (verified) {
          return { factorId: verified.id, enrol: false };
        }
        var stale = (data.all || []).filter(function(f) {
          return f.factor_type === "totp" && f.status !== "verified";
        });
        return Promise.all(stale.map(function(f) {
          return sb.auth.mfa.unenroll({ factorId: f.id });
        })).then(function() {
          return sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Parents Go To admin" });
        }).then(function(r) {
          var d = check(r, "setting up your authenticator");
          return { factorId: d.id, enrol: true, qr: d.totp.qr_code, secret: d.totp.secret };
        });
      });
    },
    verifyAdminCode: function(factorId, code) {
      return sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: String(code) }).then(function(res) {
        if (res.error) {
          var e = new Error(/invalid|expired/i.test(res.error.message) ? "That code is not right." : friendly(res.error));
          e.wrongCode = /invalid|expired/i.test(res.error.message);
          throw e;
        }
        return sb.auth.getSession();
      }).then(function(res) {
        return becomeUser(res.data.session, "admin");
      }).then(function() {
        startSession(false);
        return loadAll();
      });
    },
    signUp: function(name, email, password) {
      return sb.auth.signUp({
        email: String(email).trim(),
        password: password,
        options: {
          data: { name: String(name || "").trim() },
          emailRedirectTo: siteUrl("#app")
        }
      }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
        var user = res.data.user;
        if (user && isArray(user.identities) && !user.identities.length) {
          throw new Error(friendly("already registered"));
        }
        if (!res.data.session) {
          return { confirm: true };
        }
        return becomeUser(res.data.session, "parent").then(function() {
          startSession(false);
          return loadAll();
        }).then(function() {
          return { confirm: false };
        });
      });
    },
    resendConfirmation: function(email) {
      return sb.auth.resend({ type: "signup", email: String(email).trim(), options: { emailRedirectTo: siteUrl("#app") } }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
      });
    },
    // After choosing a new password from an emailed link: open the shelf.
    continueAfterRecovery: function() {
      return sb.auth.getSession().then(function(res) {
        var session = res.data && res.data.session;
        if (!session) {
          throw new Error("That reset link has expired. Ask for a new one.");
        }
        return becomeUser(session, "parent");
      }).then(function() {
        startSession(false);
        return loadAll();
      });
    },
    resetPassword: function(email) {
      return sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: siteUrl() }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
      });
    },
    // After following the emailed reset link.
    setNewPassword: function(password) {
      return sb.auth.updateUser({ password: password }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
      });
    },
    // Checks the current password without touching this browser's session.
    verifyPassword: function(password) {
      return fetch(CFG.supabaseUrl + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey },
        body: JSON.stringify({ email: me.email, password: password })
      }).then(function(r) {
        return r.ok;
      }).catch(function() {
        return false;
      });
    },
    changePassword: function(password, nonce) {
      var attrs = { password: password };
      if (nonce) {
        attrs.nonce = String(nonce);
      }
      return sb.auth.updateUser(attrs).then(function(res) {
        if (res.error) {
          var e = new Error(friendly(res.error));
          e.needsCode = /reauthenticat|nonce/i.test(res.error.message);
          e.wrongCode = !!nonce && /nonce|otp|token|invalid|expired/i.test(res.error.message);
          throw e;
        }
      });
    },
    // Emails a six-digit code used to confirm a password change.
    sendPasswordCode: function() {
      return sb.auth.reauthenticate().then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
      });
    },
    changeEmail: function(email) {
      return sb.auth.updateUser({ email: String(email).trim() }, { emailRedirectTo: siteUrl("#settings") }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
      });
    },
    rename: function(name) {
      if (!signedIn()) {
        return Promise.resolve();
      }
      if (me.profile) {
        me.profile.display_name = name;
      }
      return sb.from("profiles").update({ display_name: cut(name, 60) }).eq("id", me.id).then(function(res) {
        check(res, "saving your name");
      });
    },
    signOut: function(scope) {
      var flush = signedIn() ? Promise.all([ syncShelf(), dropPush() ]).catch(function() {}) : Promise.resolve();
      return flush.then(function() {
        clearData();
        me.id = null;
        me.email = "";
        me.profile = null;
        me.role = "parent";
        me.aal = "aal1";
        if (!sb) {
          return null;
        }
        return sb.auth.signOut({ scope: scope || "local" });
      }).then(function() {});
    },
    signOutOthers: function() {
      return sb.auth.signOut({ scope: "others" });
    },
    deleteAccount: function() {
      return sb.rpc("delete_my_account").then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
        return Backend.signOut();
      });
    },
    // Admin console
    accounts: function() {
      return accountList;
    },
    setAccountStatus: function(email, status) {
      var a = accountList.filter(function(x) {
        return mail(x.email) === mail(email);
      })[0];
      if (!a || !isAdmin()) {
        return Promise.resolve(false);
      }
      a.status = status === "suspended" ? "suspended" : "active";
      return sb.from("profiles").update({ status: a.status }).eq("id", a.id).then(function(res) {
        if (res.error) {
          report("changing account status", res.error);
          showProblem("That account change could not be saved.");
          return false;
        }
        return true;
      });
    },
    sendReset: function(email) {
      return Backend.resetPassword(email);
    },
    audit: function(kind, what, who, detail) {
      if (!signedIn() || !sb) {
        return;
      }
      sb.rpc("write_audit", {
        a_kind: cut(kind || "account", 40),
        a_what: cut(what, 300),
        a_detail: { who: who || "", detail: detail ? String(detail) : "" }
      }).then(function(res) {
        if (res.error) {
          report("writing the activity log", res.error);
        }
      });
    },
    auditList: function() {
      return auditList;
    },
    refresh: refreshShared,
    enablePush: enablePush,
    syncShelf: syncShelf,
    // Public wishlist links (no sign-in needed).
    sharedWishlist: function(token) {
      if (!sb) {
        return Promise.resolve(null);
      }
      return sb.rpc("get_shared_wishlist", { share_token: token }).then(function(res) {
        return res.error ? null : res.data;
      });
    },
    // Public contact form and newsletter (no sign-in needed).
    contact: function(name, email, topic, message) {
      return sb.rpc("submit_contact_message", {
        sender_name: name,
        sender_email: email,
        topic: topic,
        message: message,
        ticket_id: null
      }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
        return res.data;
      });
    },
    subscribe: function(email, area) {
      return sb.rpc("subscribe", { sub_email: email, sub_area: area || "" }).then(function(res) {
        if (res.error) {
          throw new Error(friendly(res.error));
        }
      });
    },
    // Admins open support screenshots stored in the database.
    downloadShot: function(path) {
      if (!sb || !path || String(path).indexOf("/") === -1) {
        return Promise.resolve(null);
      }
      return sb.storage.from("support-attachments").download(path).then(function(res) {
        return res.error ? null : res.data;
      });
    }
  };
  window.PTGBackend = Backend;

  // ---------------------------------------------------------------------
  // Start-up: restore a saved session, handle emailed links
  // ---------------------------------------------------------------------

  function finishRestore() {
    restoring = false;
    fireEvent("ptg:auth");
  }
  function restore(session) {
    if (!session) {
      finishRestore();
      return;
    }
    var wanted = localGet(ROLE_KEY) === "admin" ? "admin" : "parent";
    var aal = aalOf(session);
    if (wanted === "admin" && aal !== "aal2") {
      // The second step was never finished: start sign-in again.
      sb.auth.signOut({ scope: "local" }).then(finishRestore);
      return;
    }
    becomeUser(session, wanted).then(function() {
      startSession(true);
      return loadAll();
    }).then(function() {
      var h = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
      if (arrivedFromLink || /^(signin|sign-in|create|forgot|sent|code|done|card)$/.test(h) || /access_token|type=/.test(h)) {
        window.location.hash = me.role === "admin" ? "#admin" : "#app";
      }
      finishRestore();
    }).catch(function(err) {
      report("restoring your session", err);
      if (err && err.suspended && window.PTGAuthNotice) {
        window.location.hash = "#signin";
        window.PTGAuthNotice(err.message);
      }
      finishRestore();
    });
  }
  var domReady = new Promise(function(resolve) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve);
    } else {
      resolve();
    }
  });
  var recoveryShown = false;
  function showRecovery() {
    if (recoveryShown) {
      return;
    }
    recoveryShown = true;
    restoring = false;
    fireEvent("ptg:recovery");
  }
  function boot() {
    if (!sb) {
      domReady.then(finishRestore);
      return;
    }
    var started = false;
    sb.auth.onAuthStateChange(function(event, session) {
      // Supabase asks that no other Supabase call runs inside this callback,
      // and the page must be fully loaded before the app can be shown.
      domReady.then(function() {
        return new Promise(function(r) {
          window.setTimeout(r, 0);
        });
      }).then(function() {
        if (event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION" && recoveryLink && session) {
          started = true;
          showRecovery();
        } else if (event === "INITIAL_SESSION" && !started) {
          started = true;
          if (!document.getElementById("page-app")) {
            finishRestore();
            return;
          }
          restore(session);
        } else if (event === "SIGNED_OUT" && signedIn()) {
          clearData();
          me.id = null;
          if (window.PTGSession && window.PTGSession.active && window.PTGSession.active()) {
            window.PTGSession.end({ remote: true });
          }
        } else if (event === "USER_UPDATED" && session && signedIn() && session.user.email && mail(session.user.email) !== mail(me.email)) {
          var old = me.email;
          me.email = session.user.email;
          fireEvent("ptg:email-changed", { from: old, to: me.email });
        }
      });
    });
  }
  boot();
})();
