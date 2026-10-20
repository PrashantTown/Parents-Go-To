"use strict";

(function() {
  try {
    var href = window.location.href;
    var page = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase().split(/[\/?&=]/)[0];
    var returning = /access_token=|refresh_token=|[?&]code=/.test(href);
    var saved = false;
    [ window.localStorage, window.sessionStorage ].forEach(function(s) {
      for (var i = 0; i < s.length; i++) {
        if (/^sb-.+-auth-token$/.test(s.key(i)) || s.key(i) === "ptg-token-v1") {
          saved = true;
        }
      }
    });
    var member = /^(app|dashboard|profiles|library|resources|wishlist|settings|admin|overview|accounts|moderation|support|log)$/.test(page);
    if (returning || saved && member) {
      document.documentElement.classList.add("ptg-loading");
      window.setTimeout(function() {
        document.documentElement.classList.remove("ptg-loading");
      }, 15000);
    }
  } catch (e) {}
})();
