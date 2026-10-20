"use strict";

(function() {
  [ "localStorage", "sessionStorage" ].forEach(function(name) {
    try {
      var s = window[name], old = [], i, k;
      for (i = 0; i < s.length; i++) {
        k = s.key(i);
        if (k && k.indexOf("pgt") === 0) {
          old.push(k);
        }
      }
      old.forEach(function(k) {
        var n = "ptg" + k.slice(3);
        if (s.getItem(n) === null) {
          s.setItem(n, s.getItem(k));
        }
        s.removeItem(k);
      });
    } catch (e) {}
  });
})();
