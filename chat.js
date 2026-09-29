(function() {
  "use strict";
  var KEY = "ptg-chat-v1";
  var EVENT = "ptg:chat";
  var CHANNEL = "ptg-chat";
  var BODY_MAX = 2e3;
  var THREAD_MAX = 200;
  var MSG_MAX = 500;
  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }
  function mail(v) {
    return String(v == null ? "" : v).trim().toLowerCase();
  }
  function token() {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "", i, arr;
    if (window.crypto && window.crypto.getRandomValues) {
      arr = new window.Uint8Array(10);
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
  function blank() {
    return {
      threads: [],
      msgs: {},
      reads: {}
    };
  }
  function read() {
    var raw;
    try {
      raw = JSON.parse(window.localStorage.getItem(KEY));
    } catch (e) {
      raw = null;
    }
    if (!raw || typeof raw !== "object") {
      return blank();
    }
    if (!isArray(raw.threads)) {
      raw.threads = [];
    }
    if (!raw.msgs || typeof raw.msgs !== "object") {
      raw.msgs = {};
    }
    if (!raw.reads || typeof raw.reads !== "object") {
      raw.reads = {};
    }
    return raw;
  }
  function write(store) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      return false;
    }
  }
  var bc = null;
  try {
    if (window.BroadcastChannel) {
      bc = new window.BroadcastChannel(CHANNEL);
    }
  } catch (e) {
    bc = null;
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
  function post(detail) {
    if (!bc) {
      return;
    }
    try {
      bc.postMessage(detail || {
        t: "chat"
      });
    } catch (e) {}
  }
  if (bc) {
    bc.onmessage = function(e) {
      fire(e && e.data);
    };
  }
  window.addEventListener("storage", function(e) {
    if (!e || e.key !== KEY) {
      return;
    }
    if (!bc) {
      fire({
        t: "chat"
      });
    }
  });
  function meEmail() {
    var s = window.PTGSession;
    var v = s && typeof s.email === "function" ? s.email() : "";
    return mail(v) || "guest";
  }
  function meName() {
    var s = window.PTGSession;
    var v = s && typeof s.name === "function" ? s.name() : "";
    v = String(v || "").trim();
    return v || "You";
  }
  function adultId(email) {
    return "mail:" + (mail(email) || "guest");
  }
  function childId(account, kid) {
    return "kid:" + (mail(account) || "guest") + ":" + String(kid || "");
  }
  function isChild(who) {
    return String(who || "").indexOf("kid:") === 0;
  }
  function childAccount(who) {
    var bits = String(who || "").split(":");
    return bits.length >= 3 ? bits[1] : "";
  }
  function allowed(thread, who) {
    if (!thread || !who) {
      return false;
    }
    var id = String(who);
    if (isChild(id)) {
      if (thread.kind !== "family") {
        return false;
      }
      if (thread.account !== childAccount(id)) {
        return false;
      }
    }
    if (thread.kind !== "family" && isChild(id)) {
      return false;
    }
    return thread.members.indexOf(id) !== -1;
  }
  function findThread(store, id) {
    var i;
    for (i = 0; i < store.threads.length; i++) {
      if (store.threads[i].id === id) {
        return store.threads[i];
      }
    }
    return null;
  }
  function trim(store) {
    if (store.threads.length > THREAD_MAX) {
      var dropped = store.threads.slice(THREAD_MAX);
      store.threads = store.threads.slice(0, THREAD_MAX);
      for (var i = 0; i < dropped.length; i++) {
        delete store.msgs[dropped[i].id];
      }
    }
  }
  var transport = null;
  var Chat = {
    ADULT: adultId,
    CHILD: childId,
    isChild: isChild,
    me: function() {
      return adultId(meEmail());
    },
    meName: meName,
    threads: function(kind, who) {
      var id = who || this.me();
      var store = read();
      return store.threads.filter(function(t) {
        if (kind && t.kind !== kind) {
          return false;
        }
        return allowed(t, id);
      }).sort(function(a, b) {
        return (b.at || 0) - (a.at || 0);
      });
    },
    thread: function(threadId) {
      return findThread(read(), threadId);
    },
    messages: function(threadId, who) {
      var store = read();
      var t = findThread(store, threadId);
      if (!t || !allowed(t, who || this.me())) {
        return [];
      }
      return isArray(store.msgs[threadId]) ? store.msgs[threadId] : [];
    },
    open: function(spec) {
      var store = read();
      var kind = spec.kind === "family" || spec.kind === "shelf" ? spec.kind : "community";
      var members = (spec.members || []).slice();
      var i;
      if (kind === "community") {
        return null;
      }
      if (kind === "family") {
        for (i = 0; i < members.length; i++) {
          if (isChild(members[i]) && childAccount(members[i]) !== mail(spec.account)) {
            return null;
          }
        }
      } else {
        for (i = 0; i < members.length; i++) {
          if (isChild(members[i])) {
            return null;
          }
        }
      }
      if (spec.key) {
        for (i = 0; i < store.threads.length; i++) {
          if (store.threads[i].key === spec.key) {
            return store.threads[i];
          }
        }
      }
      var row = {
        id: "th-" + token(),
        key: spec.key || "",
        kind: kind,
        title: String(spec.title || "").slice(0, 120),
        account: mail(spec.account),
        members: members,
        names: spec.names || {},
        state: spec.state || "open",
        at: Date.now(),
        createdAt: Date.now()
      };
      store.threads.unshift(row);
      trim(store);
      if (!write(store)) {
        return null;
      }
      fire({
        t: "thread",
        id: row.id
      });
      post({
        t: "thread",
        id: row.id
      });
      return row;
    },
    send: function(threadId, body, who) {
      var store = read();
      var t = findThread(store, threadId);
      var id = who || this.me();
      if (!t) {
        return null;
      }
      if (!allowed(t, id)) {
        return null;
      }
      if (t.state === "closed") {
        return null;
      }
      var text = String(body == null ? "" : body).replace(/\s+$/, "");
      if (!text) {
        return null;
      }
      text = text.slice(0, BODY_MAX);
      var msg = {
        id: "m-" + token(),
        thread: threadId,
        from: id,
        name: t.names[id] || (isChild(id) ? "Them" : meName()),
        body: text,
        at: Date.now()
      };
      if (!isArray(store.msgs[threadId])) {
        store.msgs[threadId] = [];
      }
      store.msgs[threadId].push(msg);
      if (store.msgs[threadId].length > MSG_MAX) {
        store.msgs[threadId] = store.msgs[threadId].slice(-MSG_MAX);
      }
      t.at = msg.at;
      if (!write(store)) {
        return null;
      }
      if (transport && typeof transport.send === "function") {
        try {
          transport.send(threadId, msg);
        } catch (e) {}
      }
      fire({
        t: "msg",
        id: threadId
      });
      post({
        t: "msg",
        id: threadId
      });
      return msg;
    },
    receive: function(threadId, msg) {
      var store = read();
      var t = findThread(store, threadId);
      if (!t || !msg || !msg.id) {
        return false;
      }
      if (!isArray(store.msgs[threadId])) {
        store.msgs[threadId] = [];
      }
      var seen = store.msgs[threadId].some(function(m) {
        return m.id === msg.id;
      });
      if (seen) {
        return false;
      }
      store.msgs[threadId].push(msg);
      store.msgs[threadId].sort(function(a, b) {
        return a.at - b.at;
      });
      t.at = Math.max(t.at || 0, msg.at || 0);
      if (!write(store)) {
        return false;
      }
      fire({
        t: "msg",
        id: threadId
      });
      return true;
    },
    markRead: function(threadId, who) {
      var store = read();
      var id = who || this.me();
      var key = threadId + "|" + id;
      var seenAt = Number(store.reads[key] || 0);
      var list = isArray(store.msgs[threadId]) ? store.msgs[threadId] : [];
      var newest = list.reduce(function(max, m) {
        return m.from !== id && (m.at || 0) > max ? m.at : max;
      }, 0);
      if (!newest || newest <= seenAt) {
        return false;
      }
      store.reads[key] = Date.now();
      write(store);
      fire({
        t: "read",
        id: threadId
      });
      return true;
    },
    unread: function(threadId, who) {
      var store = read();
      var id = who || this.me();
      var seenAt = Number(store.reads[threadId + "|" + id] || 0);
      var list = isArray(store.msgs[threadId]) ? store.msgs[threadId] : [];
      return list.filter(function(m) {
        return m.from !== id && (m.at || 0) > seenAt;
      }).length;
    },
    unreadTotal: function(kind, who) {
      var id = who || this.me();
      var self = this;
      return this.threads(kind, id).reduce(function(n, t) {
        return n + self.unread(t.id, id);
      }, 0);
    },
    setState: function(threadId, state) {
      var store = read();
      var t = findThread(store, threadId);
      if (!t) {
        return false;
      }
      t.state = state;
      if (!write(store)) {
        return false;
      }
      fire({
        t: "thread",
        id: threadId
      });
      post({
        t: "thread",
        id: threadId
      });
      return true;
    },
    remove: function(threadId) {
      var store = read();
      store.threads = store.threads.filter(function(t) {
        return t.id !== threadId;
      });
      delete store.msgs[threadId];
      if (!write(store)) {
        return false;
      }
      fire({
        t: "thread",
        id: threadId
      });
      post({
        t: "thread",
        id: threadId
      });
      return true;
    },
    onChange: function(fn) {
      window.addEventListener(EVENT, fn);
    },
    offChange: function(fn) {
      window.removeEventListener(EVENT, fn);
    }
  };
  Object.defineProperty(Chat, "transport", {
    get: function() {
      return transport;
    },
    set: function(v) {
      transport = v || null;
      if (transport && typeof transport.subscribe === "function") {
        try {
          transport.subscribe(function(threadId, msg) {
            Chat.receive(threadId, msg);
          });
        } catch (e) {}
      }
    }
  });
  window.PTGChat = Chat;
})();
