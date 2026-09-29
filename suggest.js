(function() {
  "use strict";
  var KEY = "ptg-suggestions-v1";
  var MAX = 200;
  var EVENT = "ptg:suggestions";
  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }
  function read() {
    var raw;
    try {
      raw = JSON.parse(window.localStorage.getItem(KEY));
    } catch (e) {
      raw = null;
    }
    if (!raw || !isArray(raw.items)) {
      return [];
    }
    return raw.items;
  }
  function write(items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        items: items.slice(0, MAX)
      }));
      return true;
    } catch (e) {
      return false;
    }
  }
  function fire() {
    var ev;
    try {
      ev = new window.Event(EVENT);
    } catch (e) {
      ev = document.createEvent("Event");
      ev.initEvent(EVENT, false, false);
    }
    window.dispatchEvent(ev);
  }
  function token() {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "", i;
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new window.Uint8Array(8);
      window.crypto.getRandomValues(arr);
      for (i = 0; i < 8; i++) {
        out += abc.charAt(arr[i] % abc.length);
      }
    } else {
      for (i = 0; i < 8; i++) {
        out += abc.charAt(Math.floor(Math.random() * abc.length));
      }
    }
    return out;
  }
  var Suggest = {
    list: function() {
      return read();
    },
    mine: function(email) {
      var who = String(email || "").trim().toLowerCase() || "guest";
      return read().filter(function(r) {
        return String(r.owner || "") === who;
      });
    },
    add: function(rec) {
      var all = read();
      var row = {
        id: "psub-" + token(),
        origin: "parent",
        title: String(rec.title || "").trim(),
        body: String(rec.body || "").trim(),
        link: String(rec.link || "").trim(),
        category: String(rec.category || ""),
        ages: String(rec.ages || ""),
        from: String(rec.from || "A parent"),
        owner: String(rec.owner || "").trim().toLowerCase() || "guest",
        at: Date.now(),
        state: "pending",
        reason: "",
        decidedBy: "",
        decidedAt: null
      };
      all.unshift(row);
      if (!write(all)) {
        return null;
      }
      fire();
      return row;
    },
    decide: function(id, state, reason, by) {
      var all = read(), hit = false, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i].state = state;
          all[i].reason = state === "rejected" ? String(reason || "") : "";
          all[i].decidedBy = state === "pending" ? "" : String(by || "");
          all[i].decidedAt = state === "pending" ? null : Date.now();
          hit = true;
          break;
        }
      }
      if (!hit) {
        return false;
      }
      write(all);
      fire();
      return true;
    },
    countFor: function(email) {
      return this.mine(email).length;
    },
    onChange: function(fn) {
      window.addEventListener(EVENT, fn);
    }
  };
  window.PTGSuggest = Suggest;
})();
