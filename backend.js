/*
 * Parents Go To — connects the site to its backend API.
 *
 * The pages talk to window.PTGBackend for everything that needs the server:
 * signing in and out, creating an account, the administrator code, changing
 * a name, email or password, deleting an account, the admin console's
 * account list and activity log, carers' shared shelves, the contact form
 * and "Keep me posted". The family shelf is sent to the server here too:
 * every second and a half the page's shelf (PTGApp.capture) is compared with
 * what the server last confirmed, and the differences go to PATCH /api/shelf.
 *
 * Everything else the pages store (board, reviews, chat, settings and so on)
 * is kept in step by sync.js.
 *
 * Load order: store.js, config.js, api.js, sync.js, this file, then the pages.
 */
(function() {
  "use strict";
  var Api = window.PTGApi;
  var Sync = window.PTGSync;
  if (!Api || !Api.enabled || !Sync) {
    return;
  }

  var ROLE_KEY = "ptg-active-role";
  var REMEMBER_KEY = "ptg-remember";
  var SHELF_EVERY_MS = 1500;
  var REFRESH_EVERY_MS = Math.max(5, Number((window.PTG_CONFIG || {}).pollSeconds) || 20) * 1e3;
  // Sign-ins, sign-outs, password changes and admin-code attempts are logged
  // by the server itself, so the page's copies aren't sent twice.
  var SERVER_LOGGED = /^(Parent|Administrator) signed (in|out)$|^Password changed$|^Failed administrator one-time code|^Administrator sign-in abandoned/;

  var restoring = true;
  var me = { id: null, email: "", role: "parent", name: "" };
  var pendingCode = null; // { challenge, remember } between the password and the admin code
  var tempLogin = null; // { user, token, remember, password } after signing in with a temporary password
  var checkedPassword = ""; // the current password, once Settings has confirmed it
  var accountList = [];
  var auditList = [];
  var sharedList = [];
  var refreshTimer = null;
  var noop = function() {};

  /* ------------------------------------------------------------ helpers */

  function lower(v) {
    return String(v || "").trim().toLowerCase();
  }
  function enc(v) {
    return encodeURIComponent(String(v == null ? "" : v));
  }
  function copy(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }
  function fire(name, detail) {
    var ev;
    try {
      ev = new window.CustomEvent(name, { detail: detail === undefined ? null : detail });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(name, false, false, detail === undefined ? null : detail);
    }
    window.dispatchEvent(ev);
  }
  function report(what, err) {
    if (window.console && console.warn) {
      console.warn("[backend] " + what + ":", err && err.message || err);
    }
  }
  function local(kind) {
    try {
      return window[kind];
    } catch (e) {
      return null;
    }
  }
  function localGet(key) {
    try {
      var s = local("localStorage");
      return s ? s.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }
  function localSet(key, value) {
    try {
      var s = local("localStorage");
      if (s) {
        s.setItem(key, value);
      }
    } catch (e) {}
  }
  function remembering() {
    return localGet(REMEMBER_KEY) !== "0";
  }
  function setRemember(on) {
    localSet(REMEMBER_KEY, on ? "1" : "0");
  }
  function uuid() {
    if (window.PTGStore && window.PTGStore.uuid) {
      return window.PTGStore.uuid();
    }
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function signedIn() {
    return !!me.id;
  }
  function isAdmin() {
    return signedIn() && me.role === "admin";
  }
  function error(message, extra) {
    var e = new Error(message);
    Object.keys(extra || {}).forEach(function(k) {
      e[k] = extra[k];
    });
    return e;
  }
  function message(err, fallback) {
    return Api.errorMessage(err, fallback);
  }
  function hashName() {
    return (window.location.hash || "").replace(/^#\/?/, "").toLowerCase().split(/[\/?&=]/)[0];
  }
  var domReady = new Promise(function(resolve) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve);
    } else {
      resolve();
    }
  });

  // The server's words, turned into what the sign-in page should say.
  function signinError(err) {
    var code = err && err.data && err.data.code;
    if (!err || err.status === 0) {
      return error("Could not reach the server. Check your internet connection and try again.");
    }
    if (code === "ACCOUNT_LOCKED") {
      return error("Too many wrong passwords, so this account is locked. An administrator can restore it — use “Forgot your password?” to let them know.", { suspended: true });
    }
    if (code === "ACCOUNT_SUSPENDED") {
      return error("That account has been suspended by an administrator. Contact the site owner to have it restored.", { suspended: true });
    }
    if (code === "NOT_ADMIN") {
      return error("That account is not an administrator. Choose Parent to open your shelf.");
    }
    if (code === "USE_ADMIN") {
      return error("This is an administrator account. Choose Administrator to sign in.");
    }
    if (err.status === 401) {
      var left = err.data && err.data.attemptsLeft;
      return error("That email and password don’t match an account." + (typeof left === "number" && left <= 3 ? " " + left + (left === 1 ? " try" : " tries") + " left before the account locks." : ""));
    }
    if (err.status === 409) {
      return error("There is already an account with that email. Sign in instead, or use “Forgot your password?”.");
    }
    return error(message(err));
  }

  /* ------------------------------------------------------- the session */

  function becomeUser(user, token, remember) {
    Api.setToken(token, remember);
    me.id = String(user.id || user._id || "");
    me.email = lower(user.email);
    me.role = user.role === "admin" ? "admin" : "parent";
    me.name = String(user.name || "");
    localSet(ROLE_KEY, me.role);
  }
  function startSession(quiet) {
    if (window.PTGSession && window.PTGSession.start) {
      window.PTGSession.start(me.email, me.role, { quiet: !!quiet, name: me.name });
    }
  }
  function clearData() {
    stopShelf();
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    accountList = [];
    auditList = [];
    sharedList = [];
    me = { id: null, email: "", role: "parent", name: "" };
    checkedPassword = "";
    pendingCode = null;
  }
  // Load everything for the person who just signed in.
  function loadAll() {
    var jobs = [ Sync.start({ email: me.email, role: me.role }) ];
    if (me.role === "admin") {
      jobs.push(loadAdmin());
    } else {
      jobs.push(loadShelf(), loadShared());
    }
    return Promise.all(jobs.map(function(p) {
      return p["catch"](function(err) {
        report("loading", err);
      });
    })).then(function() {
      window.clearInterval(refreshTimer);
      refreshTimer = window.setInterval(function() {
        if (document.visibilityState !== "hidden") {
          refreshShared();
        }
      }, REFRESH_EVERY_MS);
      offerInvites();
      fire("ptg:data");
      if (window.PTGAdmin && window.PTGAdmin.refresh) {
        window.PTGAdmin.refresh();
      }
    });
  }
  // A finished sign-in (or sign-up): { token, user } from the server.
  function finishLogin(d, remember, password) {
    if (d.user && d.user.tempPassword) {
      // Signed in with a temporary password from an administrator: choose a
      // new one before going any further.
      tempLogin = { user: d.user, token: d.token, remember: remember, password: password || "" };
      Api.setToken(d.token, remember);
      window.setTimeout(function() {
        fire("ptg:recovery");
      }, 0);
      return Promise.resolve({ tempPassword: true });
    }
    becomeUser(d.user, d.token, remember);
    startSession(false);
    return loadAll().then(function() {
      return { profile: { display_name: me.name } };
    });
  }

  /* ---------------------------------------------------------- the shelf */

  var shelf = { base: null, timer: null, busy: false, loaded: false };
  var SHELF_TYPES = { children: "child", books: "book", wishlist: "wish", sessions: "session" };

  function snapshot() {
    var app = window.PTGApp;
    return app && app.capture ? copy(app.capture()) : null;
  }
  function byId(list) {
    var out = {};
    (list || []).forEach(function(r) {
      if (r && r.id !== undefined && r.id !== null) {
        out[String(r.id)] = r;
      }
    });
    return out;
  }
  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function ids(list) {
    return (list || []).filter(function(r) {
      return r && r.id !== undefined && r.id !== null;
    }).map(function(r) {
      return String(r.id);
    });
  }
  // What changed between two shelves, as a PATCH /api/shelf body (or null).
  function shelfChanges(base, now) {
    var body = { ops: [] };
    Object.keys(SHELF_TYPES).forEach(function(list) {
      var before = byId(base[list]), after = byId(now[list]);
      Object.keys(after).forEach(function(id) {
        if (!before[id] || !same(before[id], after[id])) {
          body.ops.push({ op: "put", type: SHELF_TYPES[list], id: id, data: after[id] });
        }
      });
      Object.keys(before).forEach(function(id) {
        if (!after[id]) {
          body.ops.push({ op: "delete", type: SHELF_TYPES[list], id: id });
        }
      });
      if (!same(ids(base[list]), ids(now[list]))) {
        body.order = body.order || {};
        body.order[list] = ids(now[list]);
      }
    });
    var metaBefore = { colour: base.parent && base.parent.colour, activity: base.activity, bedtime: base.bedtime };
    var metaNow = { colour: now.parent && now.parent.colour, activity: now.activity, bedtime: now.bedtime };
    if (!same(metaBefore, metaNow)) {
      body.meta = {
        colour: metaNow.colour,
        activity: (metaNow.activity || []).slice(0, 12).map(function(a) {
          return { text: a.text, at: a.at };
        }),
        bedtime: metaNow.bedtime || undefined
      };
    }
    return body.ops.length || body.order || body.meta ? body : null;
  }
  function syncShelf(opts) {
    if (!shelf.loaded || shelf.busy || !signedIn() || me.role !== "parent") {
      return Promise.resolve();
    }
    var now = snapshot();
    if (!now) {
      return Promise.resolve();
    }
    var body = shelfChanges(shelf.base, now);
    if (!body) {
      return Promise.resolve();
    }
    shelf.busy = true;
    var email = me.email;
    return Api.patch("/api/shelf", body, opts && opts.keepalive ? { keepalive: true } : undefined).then(function(d) {
      if (email !== me.email) {
        return;
      }
      shelf.base = now;
      var rejected = d.rejected || [];
      if (rejected.length) {
        Sync.toast("Couldn’t save that change: " + (rejected[0].message || "the server refused it") + ".", 7e3);
      }
    }, function(err) {
      if (err && err.status && err.status < 500 && err.status !== 429 && err.status !== 401) {
        // Refused outright: don't send it again and again.
        shelf.base = now;
        Sync.toast("Couldn’t save that change: " + message(err), 7e3);
        return;
      }
      if (err && err.status === 0) {
        Sync.toast(navigator.onLine === false ? "You’re offline. Your shelf will be saved when the connection is back." : "Your shelf couldn’t be saved just now. Trying again shortly.", 6e3);
      }
    }).then(function() {
      shelf.busy = false;
    });
  }
  function startShelf() {
    window.clearInterval(shelf.timer);
    shelf.timer = window.setInterval(syncShelf, SHELF_EVERY_MS);
  }
  function stopShelf() {
    window.clearInterval(shelf.timer);
    shelf.timer = null;
    shelf.base = null;
    shelf.loaded = false;
  }
  function editing() {
    return !!document.querySelector("#page-app dialog[open]");
  }
  // First load, and later refreshes when another device changed the shelf.
  function loadShelf() {
    var email = me.email;
    return Api.get("/api/shelf").then(function(d) {
      if (email !== me.email || !window.PTGApp || !window.PTGApp.loadShelf) {
        return;
      }
      var server = d.shelf;
      if (shelf.loaded) {
        var now = snapshot();
        // Only take the server's copy when nothing here is waiting to be sent
        // and nobody is in the middle of an edit.
        if (!now || shelfChanges(shelf.base, now) || editing()) {
          return;
        }
        if (!shelfChanges(shelf.base, server)) {
          return;
        }
      }
      window.PTGApp.loadShelf(me.email, { shelf: server, name: me.name || server.parent && server.parent.name });
      shelf.base = snapshot();
      shelf.loaded = !!shelf.base;
      startShelf();
    });
  }
  window.addEventListener("pagehide", function() {
    syncShelf({ keepalive: true });
  });
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
      syncShelf({ keepalive: true });
    } else if (signedIn()) {
      refreshShared();
    }
  });

  /* ------------------------------------------- admin lists, carers, etc */

  function ms(v) {
    return v ? new Date(v).getTime() : null;
  }
  function loadAdmin() {
    if (!isAdmin()) {
      accountList = [];
      auditList = [];
      return Promise.resolve();
    }
    return Promise.all([ Api.get("/api/admin/users"), Api.get("/api/audit?limit=400") ]).then(function(r) {
      accountList = (r[0].users || []).map(function(u) {
        return {
          id: u.id,
          email: lower(u.email),
          name: u.name || "",
          role: u.role,
          status: u.status,
          lockedOut: !!u.lockedOut,
          tempPassword: !!u.tempPassword,
          createdAt: ms(u.createdAt),
          lastSeen: ms(u.lastSeen),
          shelf: u.shelf || { children: 0, books: 0 }
        };
      });
      auditList = (r[1].items || []).map(function(e) {
        return {
          id: "log" + e.id,
          kind: e.kind,
          what: e.what,
          who: e.who || "system",
          detail: e.detail || "",
          at: e.at
        };
      }).sort(function(a, b) {
        return (b.at || 0) - (a.at || 0);
      });
    });
  }
  function loadShared() {
    if (!signedIn() || me.role !== "parent") {
      sharedList = [];
      return Promise.resolve();
    }
    return Api.get("/api/family/shared").then(function(d) {
      var next = d.items || [];
      if (!same(next, sharedList)) {
        sharedList = next;
        fire("ptg:shared");
      }
    });
  }
  function familyItems() {
    try {
      var v = JSON.parse(localGet("ptg-family-v1"));
      return v && Array.isArray(v.items) ? v.items : [];
    } catch (e) {
      return [];
    }
  }
  // Invitations sent to this person's email that are still waiting.
  function offerInvites() {
    if (!signedIn() || me.role !== "parent" || !window.PTGInviteBanner) {
      return;
    }
    var waiting = familyItems().filter(function(r) {
      return r.incoming && r.state === "invited" && lower(r.email) === me.email;
    }).map(function(r) {
      return { ref: r.ref, from: r.byName || r.by || r.owner || "A family" };
    });
    if (waiting.length) {
      window.PTGInviteBanner.show(waiting);
    }
  }
  var refreshing = null;
  function refreshShared() {
    if (refreshing || !signedIn()) {
      return refreshing || Promise.resolve();
    }
    var jobs = [ Sync.pullAll(), loadAdmin(), loadShared() ];
    if (me.role === "parent" && shelf.loaded) {
      jobs.push(loadShelf());
    }
    refreshing = Promise.all(jobs.map(function(p) {
      return p["catch"](function(err) {
        report("refreshing", err);
      });
    })).then(function() {
      refreshing = null;
      if (window.PTGAdmin && window.PTGAdmin.refresh) {
        window.PTGAdmin.refresh();
      }
    });
    return refreshing;
  }
  function accountFor(email) {
    return accountList.filter(function(a) {
      return a.email === lower(email);
    })[0] || null;
  }

  // The session ended on the server (password changed elsewhere, account
  // suspended, signed out everywhere): sign out here too.
  window.addEventListener("ptg:unauthorized", function(e) {
    if (!signedIn() || restoring) {
      return;
    }
    var why = e.detail && /suspend/i.test(e.detail.message || "") ? "That account has been suspended by an administrator." : "You were signed out because your session ended — for example, the password was changed or you signed out everywhere from another device.";
    Sync.stop({ clear: true });
    Api.clearToken();
    clearData();
    if (window.PTGSession && window.PTGSession.active && window.PTGSession.active()) {
      window.PTGSession.end({ remote: true });
    }
    Sync.pullPublic();
    window.location.hash = "#signin";
    if (window.PTGAuthNotice) {
      window.PTGAuthNotice(why);
    }
  });

  /* ------------------------------------------------------- PTGBackend */

  var Backend = {
    ready: true,
    get restoring() {
      return restoring;
    },
    me: function() {
      return { id: me.id, email: me.email, role: me.role, aal: "aal2", profile: { display_name: me.name } };
    },
    isAdmin: isAdmin,
    uuid: uuid,
    remembering: remembering,

    signIn: function(email, password, role, remember) {
      remember = remember !== false;
      setRemember(remember);
      return Api.auth.login(String(email).trim(), password, role === "admin" ? "admin" : "parent").then(function(d) {
        if (d.codeRequired) {
          pendingCode = { challenge: d.challenge, remember: remember };
          return { needsCode: true };
        }
        return finishLogin(d, remember, password);
      }, function(err) {
        throw signinError(err);
      });
    },
    // Administrators enter the six-digit code set on the server.
    adminFactor: function() {
      return pendingCode ? Promise.resolve({ factorId: "admin-code", enrol: false }) : Promise.reject(error("That sign-in has expired. Start again."));
    },
    verifyAdminCode: function(factorId, code) {
      if (!pendingCode) {
        return Promise.reject(error("That sign-in has expired. Start again."));
      }
      var p = pendingCode;
      return Api.auth.adminCode(p.challenge, String(code)).then(function(d) {
        pendingCode = null;
        return finishLogin(d, p.remember);
      }, function(err) {
        var code2 = err && err.data && err.data.code;
        if (code2 === "WRONG_CODE" || code2 === "CODE_ABANDONED") {
          if (code2 === "CODE_ABANDONED") {
            pendingCode = null;
          }
          throw error("That code is not right.", { wrongCode: true });
        }
        if (code2 === "CHALLENGE_EXPIRED") {
          pendingCode = null;
          throw error("That sign-in has expired. Go back and sign in again.");
        }
        throw error(message(err));
      });
    },
    signUp: function(name, email, password) {
      setRemember(true);
      return Api.auth.register(String(name || "").trim(), String(email).trim(), password).then(function(d) {
        return finishLogin(d, true, password).then(function() {
          return { confirm: false };
        });
      }, function(err) {
        throw signinError(err);
      });
    },
    // There is no email service: accounts are ready straight away.
    resendConfirmation: function() {
      return Promise.resolve();
    },
    // "Forgot your password?" tells the administrators, who give the person
    // a temporary password.
    resetPassword: function(email) {
      return Api.auth.forgot(String(email).trim()).then(noop, function(err) {
        throw error(message(err));
      });
    },
    // After signing in with a temporary password.
    setNewPassword: function(password) {
      if (!tempLogin) {
        return Promise.reject(error("Sign in again with your temporary password, then choose a new one."));
      }
      if (!tempLogin.password) {
        return Promise.reject(error("For safety, sign in again with your temporary password first."));
      }
      return Api.put("/api/auth/password", {
        currentPassword: tempLogin.password,
        newPassword: password
      }, { token: tempLogin.token, quietAuth: true }).then(function(d) {
        tempLogin.token = d.token;
        tempLogin.user.tempPassword = false;
        tempLogin.password = "";
      }, function(err) {
        throw error(message(err));
      });
    },
    continueAfterRecovery: function() {
      if (!tempLogin || tempLogin.user.tempPassword) {
        return Promise.reject(error("Choose a new password first."));
      }
      var t = tempLogin;
      tempLogin = null;
      becomeUser(t.user, t.token, t.remember);
      startSession(false);
      return loadAll();
    },
    verifyPassword: function(password) {
      return Api.post("/api/auth/verify-password", { password: password }).then(function(d) {
        if (d.valid) {
          checkedPassword = password;
        }
        return !!d.valid;
      }, function() {
        return null;
      });
    },
    hasPassword: function() {
      return true;
    },
    changePassword: function(password) {
      if (!checkedPassword) {
        return Promise.reject(error("Enter your current password first."));
      }
      return Api.auth.changePassword(checkedPassword, password).then(function(d) {
        Api.setToken(d.token, Api.remembered());
        checkedPassword = password;
      }, function(err) {
        throw error(message(err));
      });
    },
    changeEmail: function(email) {
      var from = me.email;
      return Api.auth.updateMe({ email: String(email).trim() }).then(function(d) {
        me.email = lower(d.user && d.user.email || email);
        if (window.PTGSession && window.PTGSession.changeEmail) {
          window.PTGSession.changeEmail(me.email);
        }
        return Sync.rekey(me.email).then(function() {
          fire("ptg:email-changed", { from: from, to: me.email });
        });
      }, function(err) {
        throw error(err && err.status === 409 ? "That email already belongs to another account." : message(err));
      });
    },
    rename: function(name) {
      if (!signedIn()) {
        return Promise.resolve();
      }
      me.name = String(name || "").trim();
      return Api.auth.updateMe({ name: me.name }).then(noop, function(err) {
        report("saving your name", err);
      });
    },
    signOut: function() {
      var token = Api.token();
      var was = signedIn();
      var flush = was ? syncShelf()["catch"](noop) : Promise.resolve();
      return flush.then(function() {
        return Sync.stop({ clear: true });
      }).then(function() {
        if (token && was) {
          Api.auth.logout(token)["catch"](noop);
        }
        Api.clearToken();
        clearData();
        tempLogin = null;
        Sync.pullPublic();
      });
    },
    signOutOthers: function() {
      return Api.post("/api/auth/logout-others", {}, { quietAuth: true }).then(function(d) {
        Api.setToken(d.token, Api.remembered());
        return {};
      });
    },
    deleteAccount: function(password) {
      if (!password) {
        return Promise.reject(error("Enter your password to delete the account."));
      }
      return Api.auth.deleteMe(password).then(function() {
        stopShelf();
        Sync.stop({ clear: true });
        Api.clearToken();
        clearData();
      }, function(err) {
        throw error(err && err.status === 401 ? "That password isn’t right, so nothing was deleted." : message(err, "The account couldn’t be deleted just now."));
      });
    },

    /* The admin console. */
    accounts: function() {
      return accountList;
    },
    setAccountStatus: function(email, status) {
      var a = accountFor(email);
      if (!a || !isAdmin()) {
        return Promise.resolve(false);
      }
      return Api.admin.setStatus(a.id, status === "suspended" ? "suspended" : "active").then(function() {
        return loadAdmin().then(function() {
          return true;
        });
      }, function(err) {
        Sync.toast(message(err, "That account change couldn’t be saved."), 6e3);
        return false;
      });
    },
    // Gives the person a temporary password (shown once to the administrator).
    sendReset: function(email) {
      var a = accountFor(email);
      if (!a) {
        return Promise.reject(error("That account isn’t in the list any more. Refresh and try again."));
      }
      return Api.admin.tempPassword(a.id).then(function(d) {
        return loadAdmin().then(function() {
          return { password: d.password };
        });
      }, function(err) {
        throw error(message(err));
      });
    },
    adminDeleteAccount: function(email) {
      var a = accountFor(email);
      if (!a || !isAdmin()) {
        return Promise.reject(error("Only an administrator can delete accounts."));
      }
      if (a.id === me.id || a.role === "admin") {
        return Promise.reject(error("Administrator accounts cannot be deleted here."));
      }
      return Api.admin.remove(a.id).then(function() {
        return loadAdmin();
      }, function(err) {
        throw error(message(err));
      });
    },
    audit: function(kind, what, who, detail) {
      if (!signedIn() || SERVER_LOGGED.test(String(what || ""))) {
        return;
      }
      Api.post("/api/audit", {
        kind: String(kind || "account").slice(0, 40),
        what: String(what || "").slice(0, 300),
        detail: detail ? String(detail).slice(0, 1000) : ""
      }, { quietAuth: true })["catch"](function(err) {
        report("writing the activity log", err);
      });
    },
    auditList: function() {
      return auditList;
    },

    /* Shelves, sharing, carers. */
    refresh: refreshShared,
    syncShelf: syncShelf,
    sharedShelves: function() {
      return sharedList;
    },
    setupNeeds: function() {
      return null;
    },
    acceptInvite: function(ref) {
      var row = familyItems().filter(function(r) {
        return r.ref === ref && r.incoming;
      })[0];
      if (!row) {
        return Promise.reject(error("That invitation isn’t available any more. It may have been withdrawn."));
      }
      return Api.post("/api/family/" + enc(row.id) + "/accept").then(function() {
        return Promise.all([ Sync.pull("ptg-family-v1"), loadShared() ]);
      }, function(err) {
        throw error(message(err));
      }).then(function() {
        fire("ptg:family");
      });
    },
    sharedWishlist: function(token) {
      return Api.get("/api/share/" + enc(token), { auth: false }).then(function(d) {
        return d.item || null;
      }, function(err) {
        if (err && err.status === 410) {
          return { expires: err.data && err.data.expires || 1, items: [] };
        }
        return null;
      });
    },

    /* Messages to the team. */
    contact: function(name, email, topic, text) {
      return Api.post("/api/support", {
        id: uuid(),
        name: String(name || "").trim() || "Website visitor",
        from: String(email || "").trim(),
        replyTo: String(email || "").trim(),
        area: "Contact page: " + String(topic || "General"),
        severity: "med",
        severityText: "Sent from the contact page",
        body: String(text || "").trim()
      }, { auth: signedIn() }).then(function(d) {
        if (signedIn()) {
          Sync.pull("ptg-support-v1");
        }
        return d.item && d.item.ref || "";
      }, function(err) {
        throw error(message(err));
      });
    },
    subscribe: function(email, area) {
      var address = String(email || "").trim();
      return Api.post("/api/support", {
        id: uuid(),
        name: "Website visitor",
        from: address,
        replyTo: address,
        area: "Keep me posted",
        severity: "low",
        severityText: "Asked to hear when a new service opens" + (area ? " (" + area + ")" : ""),
        body: "Please let me know at " + address + " when a new service opens near me."
      }, { auth: false }).then(noop, function(err) {
        throw error(message(err));
      });
    },
    // Report screenshots stored on the server are named "api:<report id>".
    downloadShot: function(path) {
      var m = /^api:(.+)$/.exec(String(path || ""));
      if (!m || !signedIn()) {
        return Promise.resolve(null);
      }
      return Api.request("GET", "/api/support/" + enc(m[1]) + "/screenshot", undefined, { raw: true, quietAuth: true }).then(function(res) {
        return res.blob();
      }, function() {
        return null;
      });
    }
  };
  window.PTGBackend = Backend;

  /* ------------------------------------------------- opening the page */

  function finishRestore() {
    restoring = false;
    document.documentElement.classList.remove("ptg-loading");
    fire("ptg:auth");
  }
  function restore() {
    if (!Api.token()) {
      Sync.pullPublic();
      finishRestore();
      return;
    }
    var token = Api.token();
    Api.auth.me().then(function(d) {
      var u = d.user || {};
      if (u.tempPassword) {
        // Still on a temporary password: choose a new one first.
        tempLogin = { user: u, token: token, remember: Api.remembered(), password: "" };
        restoring = false;
        document.documentElement.classList.remove("ptg-loading");
        fire("ptg:recovery");
        return;
      }
      // Only pages with the app on them open the session.
      if (!document.getElementById("page-app")) {
        me.id = String(u.id || "");
        me.email = lower(u.email);
        me.role = u.role === "admin" ? "admin" : "parent";
        me.name = String(u.name || "");
        Sync.start({ email: me.email, role: me.role })["catch"](noop);
        finishRestore();
        return;
      }
      becomeUser(u, token, Api.remembered());
      startSession(true);
      return loadAll().then(function() {
        if (/^(signin|sign-in|create|forgot|sent|code|done|card|newpass)$/.test(hashName())) {
          window.location.hash = window.PTGReturnTo && window.PTGReturnTo.take(me.role) || (me.role === "admin" ? "#admin" : "#app");
        }
        finishRestore();
      });
    }, function(err) {
      if (err && (err.status === 401 || err.status === 403)) {
        Api.clearToken();
        Sync.stop({ clear: true });
        if (/suspend/i.test(err.message || "") && window.PTGAuthNotice) {
          window.location.hash = "#signin";
          window.PTGAuthNotice("That account has been suspended by an administrator.");
        }
      }
      Sync.pullPublic();
      finishRestore();
    })["catch"](function(err) {
      report("restoring your session", err);
      finishRestore();
    });
  }

  domReady.then(function() {
    var box = document.getElementById("remember");
    if (box && localGet(REMEMBER_KEY) === "1") {
      box.checked = true;
    }
    // Let every page script finish setting up before the session opens.
    window.setTimeout(restore, 0);
  });
})();
