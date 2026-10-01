(function() {
  "use strict";
  var root = document.documentElement;
  function on(el, ev, fn, opts) {
    if (el && el.addEventListener) el.addEventListener(ev, fn, opts);
  }
  function bar() {
    var page = document.querySelector("#page-app:not([hidden]), #page-admin:not([hidden])");
    return page ? page.querySelector(".app-bar") : null;
  }
  function syncBarHeight() {
    var el = bar();
    if (!el) return;
    var h = Math.round(el.getBoundingClientRect().height);
    if (h > 0) root.style.setProperty("--app-bar-h", h + "px");
  }
  syncBarHeight();
  on(window, "resize", syncBarHeight, {
    passive: true
  });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(syncBarHeight);
    document.querySelectorAll(".app-bar").forEach(function(b) {
      ro.observe(b);
    });
  }
  on(window, "hashchange", function() {
    setTimeout(syncBarHeight, 250);
  });
  function device() {
    var w = window.innerWidth;
    if (w <= 720) return "phone";
    if (w <= 1180) return "tablet";
    return "desktop";
  }
  function syncDevice() {
    var d = device();
    if (root.dataset.device !== d) {
      root.dataset.device = d;
      root.dispatchEvent(new CustomEvent("devicechange", {
        detail: {
          device: d
        }
      }));
    }
  }
  syncDevice();
  on(window, "resize", syncDevice, {
    passive: true
  });
  var STRIPS = [ "appTabs", "admTabs" ];
  function fitStrip(nav) {
    if (!nav) return;
    if (root.dataset.device !== "tablet") {
      nav.classList.remove("is-tight");
      return;
    }
    nav.classList.remove("is-tight");
    var overflows = nav.scrollWidth > nav.clientWidth + 1;
    if (!overflows) return;
    nav.classList.add("is-tight");
    if (nav.scrollWidth > nav.clientWidth + 1) {
      nav.classList.remove("is-tight");
    }
  }
  function fitAll() {
    STRIPS.forEach(function(id) {
      fitStrip(document.getElementById(id));
    });
    syncBarHeight();
  }
  var fitTimer = 0;
  function fitSoon(delay) {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitAll, delay || 60);
  }
  fitAll();
  on(window, "resize", function() {
    fitSoon();
  }, {
    passive: true
  });
  on(root, "devicechange", function() {
    fitAll();
  });
  setTimeout(fitAll, 400);
  setTimeout(fitAll, 1400);
  if (window.MutationObserver) {
    STRIPS.forEach(function(id) {
      var nav = document.getElementById(id);
      if (!nav) return;
      new MutationObserver(function() {
        fitSoon(120);
      }).observe(nav, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
  }
  function afterRotate() {
    syncDevice();
    fitSoon(80);
    setTimeout(fitAll, 350);
  }
  on(window, "orientationchange", afterRotate);
  if (window.screen && screen.orientation) {
    on(screen.orientation, "change", afterRotate);
  }
  function syncSwipe() {
    var w = window.innerWidth;
    window.PTGSwipeMinX = Math.max(60, Math.round(w * .09));
  }
  syncSwipe();
  on(window, "resize", syncSwipe, {
    passive: true
  });
  // On a phone, hide the bottom tab bar while the on-screen keyboard is up.
  var TYPING = /^(text|search|email|password|tel|url|number|date|time|datetime-local|month|week)$/;
  function typingField(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && TYPING.test(el.type || "text");
  }
  var kbTimer = 0;
  on(document, "focusin", function(e) {
    clearTimeout(kbTimer);
    root.classList.toggle("kb-open", root.dataset.device === "phone" && typingField(e.target));
  });
  on(document, "focusout", function() {
    clearTimeout(kbTimer);
    // Moving from one field to the next fires focusout then focusin; wait for it.
    kbTimer = setTimeout(function() {
      if (!typingField(document.activeElement)) root.classList.remove("kb-open");
    }, 120);
  });
  // Landscape phones: tuck the header away while scrolling down, bring it back on
  // the way up, so it does not cover a third of a short screen.
  var shortLand = window.matchMedia ? window.matchMedia("(max-height: 460px) and (orientation: landscape)") : null;
  var lastY = window.pageYOffset || 0;
  var tuckQueued = false;
  function syncTuck() {
    tuckQueued = false;
    var y = window.pageYOffset || 0;
    var b = bar();
    if (!shortLand || !shortLand.matches || !b || root.classList.contains("dialog-open")) {
      root.classList.remove("bar-tucked");
      lastY = y;
      return;
    }
    var h = b.offsetHeight;
    if (y <= h) root.classList.remove("bar-tucked");
    else if (y > lastY + 6) root.classList.add("bar-tucked");
    else if (y < lastY - 6) root.classList.remove("bar-tucked");
    if (Math.abs(y - lastY) > 6) lastY = y;
  }
  on(window, "scroll", function() {
    if (tuckQueued) return;
    tuckQueued = true;
    window.requestAnimationFrame(syncTuck);
  }, {
    passive: true
  });
  // Keyboard users tabbing into the header always get it back.
  on(document, "focusin", function(e) {
    var b = bar();
    if (b && b.contains(e.target)) root.classList.remove("bar-tucked");
  });
  on(window, "hashchange", function() {
    root.classList.remove("bar-tucked");
  });
  if (window.visualViewport) {
    var vv = window.visualViewport;
    on(vv, "resize", function() {
      root.classList.toggle("is-zoomed", vv.scale > 1.05);
    }, {
      passive: true
    });
  }
})();
