(function() {
  "use strict";
  var KEY = "ptg-notes-v1";
  var SEEN_KEY = "ptg-notes-seen-v1";
  var EVENT = "ptg:notes";
  var CHANNEL = "ptg-notes";
  var MAX = 80;
  var SW_PATH = "sw.js";
  function $(id) {
    return document.getElementById(id);
  }
  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function read() {
    var raw;
    try {
      raw = JSON.parse(window.localStorage.getItem(KEY));
    } catch (e) {
      raw = null;
    }
    return raw && isArray(raw.items) ? raw.items : [];
  }
  function write(items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        items: items.slice(0, MAX * 4)
      }));
      return true;
    } catch (e) {
      return false;
    }
  }
  function token() {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "", i;
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new window.Uint8Array(10);
      window.crypto.getRandomValues(arr);
      for (i = 0; i < 10; i++) {
        out += abc.charAt(arr[i] % abc.length);
      }
    } else {
      for (i = 0; i < 10; i++) {
        out += abc.charAt(Math.floor(Math.random() * abc.length));
      }
    }
    return out;
  }
  function addr(role, email) {
    return (role === "admin" ? "admin" : "parent") + "::" + (String(email || "").trim().toLowerCase() || "guest");
  }
  function since(at) {
    if (!at) {
      return "";
    }
    var mins = Math.round((Date.now() - at) / 6e4);
    if (mins < 1) {
      return "just now";
    }
    if (mins < 60) {
      return mins + (mins === 1 ? " minute ago" : " minutes ago");
    }
    var hrs = Math.round(mins / 60);
    if (hrs < 24) {
      return hrs + (hrs === 1 ? " hour ago" : " hours ago");
    }
    var days = Math.round(hrs / 24);
    if (days === 1) {
      return "yesterday";
    }
    if (days < 30) {
      return days + " days ago";
    }
    return "a while ago";
  }
  function fire(detail) {
    var ev;
    try {
      ev = new window.CustomEvent(EVENT, {
        detail: detail || null
      });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(EVENT, false, false, detail || null);
    }
    window.dispatchEvent(ev);
  }
  function prefs(role, email) {
    var s;
    try {
      s = JSON.parse(window.localStorage.getItem("ptg-settings-v1"));
    } catch (e) {
      s = null;
    }
    if (!s || !s.profiles) {
      return {};
    }
    return s.profiles[addr(role, email)] || {};
  }
  function wanted(rec, role, email) {
    var p = prefs(role, email);
    if (p.deviceNotes === false) {
      return false;
    }
    if (rec.kind === "reminder" && p.reminders === false) {
      return false;
    }
    if (rec.kind === "news" && !p.news) {
      return false;
    }
    if (rec.kind === "account" && p.signinAlerts === false) {
      return false;
    }
    return true;
  }
  (function compact() {
    var all = read(), out = [], seen = {};
    all.forEach(function(r) {
      var k = r.to + "|" + r.tag + "|" + r.title;
      if (r.read) {
        out.push(r);
      } else if (seen[k]) {
        seen[k].count = (seen[k].count || 1) + (r.count || 1);
      } else {
        seen[k] = r;
        out.push(r);
      }
    });
    if (out.length !== all.length) {
      write(out);
    }
  })();
  var Notes = {
    list: function(role, email) {
      var me = addr(role, email);
      var all = (role === "admin" ? "admin" : "parent") + "::*";
      return read().filter(function(r) {
        return r.to === me || r.to === all;
      }).slice(0, MAX);
    },
    unread: function(role, email) {
      return this.list(role, email).filter(function(r) {
        return !r.read;
      }).length;
    },
    push: function(rec) {
      var row = {
        id: "n-" + token(),
        to: String(rec.to || "parent::*"),
        kind: String(rec.kind || "system"),
        tone: String(rec.tone || "info"),
        title: String(rec.title || "").trim(),
        body: String(rec.body || "").trim(),
        go: String(rec.go || ""),
        tag: String(rec.tag || rec.kind || "system"),
        at: Date.now(),
        read: false
      };
      if (!row.title) {
        return null;
      }
      var all = read();
      for (var d = 0; d < all.length; d++) {
        if (!all[d].read && all[d].to === row.to && all[d].tag === row.tag && all[d].title === row.title) {
          row.id = all[d].id;
          row.count = (all[d].count || 1) + 1;
          all.splice(d, 1);
          break;
        }
      }
      all.unshift(row);
      write(all);
      fire(row);
      post({
        type: "push",
        rec: row
      });
      return row;
    },
    markRead: function(id) {
      var all = read(), i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i].read = true;
          break;
        }
      }
      write(all);
      fire(null);
      post({
        type: "sync"
      });
    },
    markAllRead: function(role, email) {
      var me = addr(role, email);
      var any = (role === "admin" ? "admin" : "parent") + "::*";
      var all = read(), i;
      for (i = 0; i < all.length; i++) {
        if (all[i].to === me || all[i].to === any) {
          all[i].read = true;
        }
      }
      write(all);
      fire(null);
      post({
        type: "sync"
      });
    },
    dismiss: function(id) {
      var all = read().filter(function(r) {
        return r.id !== id;
      });
      write(all);
      fire(null);
      post({
        type: "sync"
      });
    },
    clear: function(role, email) {
      var me = addr(role, email);
      var any = (role === "admin" ? "admin" : "parent") + "::*";
      var all = read().filter(function(r) {
        return r.to !== me && r.to !== any;
      });
      write(all);
      fire(null);
      post({
        type: "sync"
      });
    },
    onChange: function(fn) {
      window.addEventListener(EVENT, fn);
    }
  };
  var bc = null;
  try {
    if (window.BroadcastChannel) {
      bc = new window.BroadcastChannel(CHANNEL);
    }
  } catch (e) {
    bc = null;
  }
  function post(msg) {
    if (!bc) {
      return;
    }
    try {
      bc.postMessage(msg);
    } catch (e) {}
  }
  if (bc) {
    bc.onmessage = function(e) {
      var data = e && e.data ? e.data : null;
      fire(data && data.type === "push" ? data.rec : null);
    };
  }
  window.addEventListener("storage", function(e) {
    if (e.key === KEY || e.key === null) {
      fire(null);
    }
  });
  var swReg = null;
  var iconUrl = "";
  function hasApi() {
    return typeof window.Notification === "function";
  }
  function permission() {
    return hasApi() ? window.Notification.permission : "unsupported";
  }
  function pageRouteWorks() {
    if (!hasApi()) {
      return false;
    }
    return !/Android/i.test(navigator.userAgent);
  }
  function channel() {
    if (!hasApi()) {
      return "in-app";
    }
    if (swReg && swReg.showNotification) {
      return "service-worker";
    }
    if (pageRouteWorks()) {
      return "page";
    }
    return "in-app";
  }
  function makeIcon() {
    if (iconUrl) {
      return iconUrl;
    }
    try {
      var c = document.createElement("canvas");
      c.width = 192;
      c.height = 192;
      var g = c.getContext("2d");
      if (!g) {
        return "";
      }
      var sky = g.createLinearGradient(0, 0, 0, 192);
      sky.addColorStop(0, "#5BCF7C");
      sky.addColorStop(.5, "#25C497");
      sky.addColorStop(1, "#01A79A");
      g.fillStyle = sky;
      g.fillRect(0, 0, 192, 192);
      g.fillStyle = "#08251F";
      g.globalAlpha = .9;
      g.beginPath();
      g.moveTo(96, 148);
      g.bezierCurveTo(30, 108, 34, 60, 66, 56);
      g.bezierCurveTo(84, 54, 94, 68, 96, 76);
      g.bezierCurveTo(98, 68, 108, 54, 126, 56);
      g.bezierCurveTo(158, 60, 162, 108, 96, 148);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      iconUrl = c.toDataURL("image/png");
      return iconUrl;
    } catch (e) {
      return "";
    }
  }
  function register() {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      return;
    }
    navigator.serviceWorker.register(SW_PATH).then(function(reg) {
      swReg = reg;
      fire(null);
    })["catch"](function() {
      swReg = null;
    });
    navigator.serviceWorker.addEventListener("message", function(e) {
      var d = e && e.data ? e.data : null;
      if (d && d.type === "ptg:open" && d.go) {
        openFromNotification(d.go);
      }
    });
  }
  function openFromNotification(go) {
    try {
      window.focus();
    } catch (e) {}
    if (!go) {
      return;
    }
    if (window.PTGSession && window.PTGSession.role() === "admin") {
      if (window.PTGAdmin) {
        window.PTGAdmin.open("#" + go);
      }
    } else if (window.PTGApp) {
      window.PTGApp.open("#" + go);
    }
  }
  var delivered = {};
  var startedAt = Date.now();
  function seenKey() {
    return SEEN_KEY;
  }
  function alreadySeen(id) {
    if (delivered[id]) {
      return true;
    }
    try {
      var raw = JSON.parse(window.sessionStorage.getItem(seenKey())) || {};
      return !!raw[id];
    } catch (e) {
      return false;
    }
  }
  function markSeen(id) {
    delivered[id] = true;
    try {
      var raw = JSON.parse(window.sessionStorage.getItem(seenKey())) || {};
      raw[id] = 1;
      window.sessionStorage.setItem(seenKey(), JSON.stringify(raw));
    } catch (e) {}
  }
  function show(rec, force) {
    if (!hasApi() || permission() !== "granted") {
      return false;
    }
    if (!force && alreadySeen(rec.id)) {
      return false;
    }
    markSeen(rec.id);
    var opts = {
      body: rec.body || "",
      tag: "ptg-" + rec.tag,
      icon: makeIcon(),
      badge: makeIcon(),
      renotify: false,
      requireInteraction: false,
      silent: false,
      data: {
        go: rec.go || "",
        id: rec.id
      }
    };
    if (swReg && swReg.showNotification) {
      try {
        swReg.showNotification(rec.title, opts);
        return true;
      } catch (e) {}
    }
    if (pageRouteWorks()) {
      try {
        var n = new window.Notification(rec.title, opts);
        n.onclick = function() {
          openFromNotification(rec.go || "");
          n.close();
        };
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }
  function ask() {
    if (!hasApi()) {
      return Promise.resolve("unsupported");
    }
    if (window.Notification.permission !== "default") {
      return Promise.resolve(window.Notification.permission);
    }
    var out;
    try {
      out = window.Notification.requestPermission();
    } catch (e) {
      out = null;
    }
    if (!out || typeof out.then !== "function") {
      return new Promise(function(resolve) {
        try {
          window.Notification.requestPermission(function(p) {
            resolve(p);
          });
        } catch (e2) {
          resolve("denied");
        }
      });
    }
    return out;
  }
  function badge(n) {
    try {
      if (n > 0 && navigator.setAppBadge) {
        navigator.setAppBadge(n);
      } else if (navigator.clearAppBadge) {
        navigator.clearAppBadge();
      }
    } catch (e) {}
  }
  register();
  var GLYPH = {
    moderation: '<path d="M4 5.4h12M4 10h12M4 14.6h7"/>',
    support: '<circle cx="10" cy="10" r="7.2"/><path d="M7.8 7.7a2.3 2.3 0 1 1 2.6 2.5v1.4M10 14.3v.1"/>',
    shelf: '<path d="M3 4.2A1.2 1.2 0 0 1 4.2 3H8v14H4.2A1.2 1.2 0 0 1 3 15.8Z"/><path d="M8 3h3.8A1.2 1.2 0 0 1 13 4.2v11.6a1.2 1.2 0 0 1-1.2 1.2H8Z"/>',
    account: '<circle cx="10" cy="7" r="3.2"/><path d="M3.6 17a6.6 6.6 0 0 1 12.8 0"/>',
    reminder: '<circle cx="10" cy="10" r="7.2"/><path d="M10 5.8V10l2.8 1.7"/>',
    news: '<path d="M3.4 5.2h9.2v9.6H4.6a1.2 1.2 0 0 1-1.2-1.2Z"/><path d="M12.6 7.4h2.8a1.2 1.2 0 0 1 1.2 1.2v4.8a1.2 1.2 0 0 1-2.4 0"/><path d="M5.6 7.6h4.8M5.6 10h4.8M5.6 12.4h3"/>',
    system: '<circle cx="10" cy="10" r="7.2"/><path d="M10 6.4v4.2M10 13.4v.1"/>'
  };
  function glyph(kind) {
    return GLYPH[kind] || GLYPH.system;
  }
  function wire(scope) {
    var btn = $(scope.btnId);
    var panel = $(scope.panelId);
    var listEl = $(scope.listId);
    var countEl = $(scope.countId);
    var liveEl = $(scope.liveId);
    var askRow = $(scope.askId);
    var clearBtn = $(scope.clearId);
    var readBtn = $(scope.readAllId);
    if (!btn || !panel || !listEl) {
      return null;
    }
    function me() {
      if (!window.PTGSession || !window.PTGSession.active()) {
        return null;
      }
      if (window.PTGSession.role() !== scope.role) {
        return null;
      }
      return window.PTGSession.email();
    }
    var scrim = null;
    function backdrop(on) {
      if (!on && !scrim) {
        return;
      }
      if (!scrim) {
        scrim = document.createElement("div");
        scrim.className = "bell-scrim";
        scrim.hidden = true;
        document.body.appendChild(scrim);
      }
      scrim.hidden = !on;
    }
    function open(on) {
      panel.hidden = !on;
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      backdrop(on);
      if (window.PTGLock) {
        if (on) {
          window.PTGLock.lock(panel);
        } else {
          window.PTGLock.unlock(panel);
        }
      }
      if (on) {
        paint();
      }
    }
    function paintAsk() {
      if (!askRow) {
        return;
      }
      var p = permission();
      var mode = channel();
      if (p === "granted" || p === "unsupported" || mode === "in-app") {
        askRow.hidden = true;
        return;
      }
      askRow.hidden = false;
      askRow.setAttribute("data-state", p);
    }
    function paint() {
      var email = me();
      var rows = email === null ? [] : Notes.list(scope.role, email);
      var unread = rows.filter(function(r) {
        return !r.read;
      }).length;
      if (countEl) {
        countEl.textContent = unread > 99 ? "99+" : String(unread);
        countEl.hidden = unread === 0;
      }
      btn.setAttribute("aria-label", unread === 0 ? "Notifications, nothing new" : "Notifications, " + unread + (unread === 1 ? " unread" : " unread"));
      btn.classList.toggle("has-unread", unread > 0);
      if (liveEl) {
        liveEl.textContent = unread === 0 ? "" : unread + (unread === 1 ? " new notification" : " new notifications");
      }
      if (scope.role === "parent") {
        badge(unread);
      }
      paintAsk();
      if (!rows.length) {
        listEl.innerHTML = '<li class="note-empty">' + "<p><b>" + esc(scope.emptyTitle) + "</b></p>" + "<p>" + esc(scope.emptyBody) + "</p>" + "</li>";
        if (readBtn) {
          readBtn.hidden = true;
        }
        if (clearBtn) {
          clearBtn.hidden = true;
        }
        return;
      }
      if (readBtn) {
        readBtn.hidden = unread === 0;
      }
      if (clearBtn) {
        clearBtn.hidden = false;
      }
      var out = "", i, r;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        out += '<li class="note' + (r.read ? "" : " is-new") + '" data-tone="' + esc(r.tone) + '">' + '<button type="button" class="note-open" data-note-open="' + esc(r.id) + '"' + (r.go ? " data-" + scope.goAttr + '="' + esc(r.go) + '"' : "") + ">" + '<span class="note-ico" aria-hidden="true">' + '<svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + glyph(r.kind) + "</svg>" + "</span>" + '<span class="note-text">' + '<b class="note-title">' + esc(r.title) + "</b>" + (r.body ? '<span class="note-body">' + esc(r.body) + "</span>" : "") + '<span class="note-when">' + esc(since(r.at)) + (r.count > 1 ? ' <span class="note-times">' + r.count + " times</span>" : "") + (r.read ? "" : ' <span class="note-dot" aria-hidden="true"></span>' + '<span class="vh">Unread</span>') + "</span>" + "</span>" + "</button>" + '<button type="button" class="note-x" data-note-drop="' + esc(r.id) + '" ' + 'aria-label="Remove: ' + esc(r.title) + '">' + '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' + 'stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' + '<path d="m4.4 4.4 7.2 7.2M11.6 4.4l-7.2 7.2"/></svg>' + "</button>" + "</li>";
      }
      listEl.innerHTML = out;
    }
    function refocusAfterDrop(seat) {
      if (seat < 0) {
        return;
      }
      var live = document.activeElement;
      if (live && live !== document.body && panel.contains(live)) {
        return;
      }
      var rows = listEl.querySelectorAll("[data-note-drop]");
      var next = rows.length ? rows[Math.min(seat, rows.length - 1)] : clearBtn && !clearBtn.hidden ? clearBtn : btn;
      if (next && next.focus) {
        try {
          next.focus();
        } catch (e) {}
      }
    }
    btn.addEventListener("click", function() {
      open(panel.hidden);
    });
    var startedInside = false;
    document.addEventListener("click", function(e) {
      startedInside = panel.contains(e.target) || btn.contains(e.target);
    }, true);
    document.addEventListener("click", function() {
      if (panel.hidden) {
        return;
      }
      if (!startedInside) {
        open(false);
      }
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && !panel.hidden) {
        open(false);
        btn.focus();
      }
    });
    panel.addEventListener("click", function(e) {
      var t = e.target.closest ? e.target : null;
      if (!t) {
        return;
      }
      var drop = t.closest("[data-note-drop]");
      if (drop) {
        var all = listEl.querySelectorAll("[data-note-drop]");
        var seat = -1, k;
        for (k = 0; k < all.length; k++) {
          if (all[k] === drop) {
            seat = k;
            break;
          }
        }
        Notes.dismiss(drop.getAttribute("data-note-drop"));
        paint();
        refocusAfterDrop(seat);
        return;
      }
      var go = t.closest("[data-note-open]");
      if (go) {
        Notes.markRead(go.getAttribute("data-note-open"));
        open(false);
        return;
      }
      if (readBtn && t.closest("#" + scope.readAllId)) {
        var e1 = me();
        if (e1 !== null) {
          Notes.markAllRead(scope.role, e1);
        }
        paint();
        return;
      }
      if (clearBtn && t.closest("#" + scope.clearId)) {
        var e2 = me();
        if (e2 !== null) {
          Notes.clear(scope.role, e2);
        }
        paint();
        return;
      }
      if (askRow && t.closest("[data-note-ask]")) {
        ask().then(function(p) {
          paintAsk();
          if (p === "granted") {
            Notes.push({
              to: addr(scope.role, me()),
              kind: "system",
              tone: "good",
              title: "Notifications are on",
              body: "Anything new will also appear in this device's notification bar.",
              tag: "welcome"
            });
          }
        });
        return;
      }
      if (t.closest("[data-note-test]")) {
        API.test(scope.role, me());
        paint();
      }
    });
    return {
      paint: paint,
      open: open,
      me: me
    };
  }
  var PARENT = {
    role: "parent",
    goAttr: "app-go",
    btnId: "bellBtn",
    panelId: "bellPanel",
    listId: "bellList",
    countId: "bellCount",
    liveId: "bellLive",
    askId: "bellAsk",
    clearId: "bellClear",
    readAllId: "bellReadAll",
    emptyTitle: "Nothing new",
    emptyBody: "Replies about resources you suggest, and anything an administrator " + "sends you, turn up here."
  };
  var ADMIN = {
    role: "admin",
    goAttr: "admin-go",
    btnId: "admBellBtn",
    panelId: "admBellPanel",
    listId: "admBellList",
    countId: "admBellCount",
    liveId: "admBellLive",
    askId: "admBellAsk",
    clearId: "admBellClear",
    readAllId: "admBellReadAll",
    emptyTitle: "The queue is quiet",
    emptyBody: "New parent suggestions and problem reports appear here as they arrive."
  };
  var bells = [];
  function paintAll() {
    for (var i = 0; i < bells.length; i++) {
      if (bells[i]) {
        bells[i].paint();
      }
    }
  }
  var REMIND_KEY = "ptg-notes-remind-v1";
  function today() {
    var d = new Date;
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function remindCheck() {
    if (!window.PTGSession || !window.PTGSession.active()) {
      return;
    }
    if (window.PTGSession.role() !== "parent") {
      return;
    }
    var email = window.PTGSession.email();
    var p = prefs("parent", email);
    if (p.reminders === false) {
      return;
    }
    var hour = (new Date).getHours();
    if (hour < 18 || hour > 21) {
      return;
    }
    var stampToday = today();
    var last;
    try {
      last = window.localStorage.getItem(REMIND_KEY);
    } catch (e) {
      last = null;
    }
    if (last === email.toLowerCase() + "|" + stampToday) {
      return;
    }
    if (!window.PTGApp || typeof window.PTGApp.loggedToday !== "function") {
      return;
    }
    if (window.PTGApp.loggedToday()) {
      return;
    }
    try {
      window.localStorage.setItem(REMIND_KEY, email.toLowerCase() + "|" + stampToday);
    } catch (e2) {}
    API.toParent(email, {
      kind: "reminder",
      tone: "info",
      title: "No reading logged today",
      body: "A few minutes still counts. Open the shelf to add tonight's session.",
      go: "dashboard",
      tag: "reminder-" + stampToday
    });
  }
  var API = {
    push: function(rec) {
      var row = Notes.push(rec);
      return row;
    },
    toParent: function(email, rec) {
      rec.to = addr("parent", email);
      return this.push(rec);
    },
    toAllParents: function(rec) {
      rec.to = "parent::*";
      return this.push(rec);
    },
    toAdmins: function(rec) {
      rec.to = "admin::*";
      return this.push(rec);
    },
    list: function(role, email) {
      return Notes.list(role, email);
    },
    unread: function(role, email) {
      return Notes.unread(role, email);
    },
    rename: function(role, oldEmail, newEmail) {
      var from = addr(role, oldEmail), to = addr(role, newEmail);
      if (from === to) {
        return;
      }
      var all = read(), hit = false;
      all.forEach(function(r) {
        if (r.to === from) {
          r.to = to;
          hit = true;
        }
      });
      if (hit) {
        write(all);
        fire(null);
      }
    },
    markAllRead: function(role, email) {
      Notes.markAllRead(role, email);
    },
    clear: function(role, email) {
      Notes.clear(role, email);
    },
    ask: ask,
    permission: permission,
    channel: channel,
    supported: hasApi,
    refresh: paintAll,
    onChange: Notes.onChange,
    newDevice: function(to, label) {
      var key = "ptg-known-devices-v1", map;
      try {
        map = JSON.parse(window.localStorage.getItem(key)) || {};
      } catch (e) {
        map = {};
      }
      var list = isArray(map[to]) ? map[to] : [];
      if (list.indexOf(label) !== -1) {
        return false;
      }
      list.push(label);
      map[to] = list;
      try {
        window.localStorage.setItem(key, JSON.stringify(map));
      } catch (e2) {}
      return true;
    },
    deviceLabel: function() {
      var ua = navigator.userAgent;
      var kind = "this computer";
      if (/iPad|Tablet/i.test(ua) || /Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
        kind = "a tablet";
      } else if (/Mobi|Android|iPhone/i.test(ua)) {
        kind = "a phone";
      }
      var os = "";
      if (/Windows/.test(ua)) {
        os = "Windows";
      } else if (/Android/.test(ua)) {
        os = "Android";
      } else if (/iPhone|iPad|iPod/.test(ua)) {
        os = "iOS";
      } else if (/Mac OS X/.test(ua)) {
        os = "macOS";
      } else if (/Linux/.test(ua)) {
        os = "Linux";
      }
      return os ? kind + " running " + os : kind;
    },
    test: function(role, email, rec) {
      rec = rec || {};
      var row = this.push({
        to: addr(role || "parent", email),
        kind: "system",
        tone: "info",
        title: rec.title || "Test notification",
        body: rec.body || "If this only appears in the bell, the device " + "notification bar is not available here.",
        tag: "test-" + Date.now()
      });
      if (row) {
        show(row, true);
      }
      paintAll();
      return row;
    },
    enable: function() {
      return ask().then(function(p) {
        paintAll();
        return p;
      });
    }
  };
  window.PTGNotify = API;
  function watchPermission() {
    var repaint = function() {
      paintAll();
    };
    if (navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions.query({
          name: "notifications"
        }).then(function(status) {
          if (!status) {
            return;
          }
          if (status.addEventListener) {
            status.addEventListener("change", repaint);
          } else {
            status.onchange = repaint;
          }
        })["catch"](function() {});
      } catch (e) {}
    }
    window.addEventListener("focus", repaint);
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") {
        repaint();
      }
    });
  }
  function boot() {
    bells = [ wire(PARENT), wire(ADMIN) ];
    paintAll();
    watchPermission();
    Notes.onChange(function(e) {
      paintAll();
      var rec = e && e.detail ? e.detail : null;
      if (!rec || !window.PTGSession || !window.PTGSession.active()) {
        return;
      }
      var role = window.PTGSession.role();
      var email = window.PTGSession.email();
      var mine = rec.to === addr(role, email) || rec.to === role + "::*";
      if (!mine) {
        return;
      }
      if (rec.at < startedAt - 2e3) {
        return;
      }
      if (!wanted(rec, role, email)) {
        return;
      }
      var p = prefs(role, email);
      if (document.visibilityState === "visible" && p.notesAlways !== true) {
        return;
      }
      show(rec, false);
    });
    window.setInterval(function() {
      paintAll();
    }, 6e4);
    window.setInterval(remindCheck, 3e5);
    window.setTimeout(remindCheck, 2e4);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
