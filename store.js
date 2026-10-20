"use strict";

(function() {
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    var h = Array.prototype.map.call(b, function(x) {
      return (x + 256).toString(16).slice(1);
    }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  window.PTGStore = {
    getItem: function(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    setItem: function(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {}
    },
    removeItem: function(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {}
    },
    uuid: uuid
  };
})();
