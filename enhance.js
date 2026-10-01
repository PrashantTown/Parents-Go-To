(function() {
  "use strict";
  var root = document.documentElement;
  var mqCoarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  var mqNoHover = window.matchMedia ? window.matchMedia("(hover: none)") : null;
  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function on(el, ev, fn, opts) {
    if (el && el.addEventListener) el.addEventListener(ev, fn, opts);
  }
  var supportsDvh = window.CSS && CSS.supports && CSS.supports("height", "100dvh");
  function syncVh() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    root.style.setProperty("--app-vh", h + "px");
  }
  if (!supportsDvh) {
    syncVh();
    on(window, "resize", syncVh, {
      passive: true
    });
    on(window, "orientationchange", function() {
      setTimeout(syncVh, 120);
    });
    if (window.visualViewport) on(window.visualViewport, "resize", syncVh, {
      passive: true
    });
  }
  function syncInput() {
    root.classList.toggle("is-touch", !!(mqCoarse && mqCoarse.matches));
    root.classList.toggle("no-hover", !!(mqNoHover && mqNoHover.matches));
  }
  syncInput();
  if (mqCoarse && mqCoarse.addEventListener) {
    mqCoarse.addEventListener("change", syncInput);
    if (mqNoHover) mqNoHover.addEventListener("change", syncInput);
  }
  function shell(el, extraClass) {
    if (!el || !el.parentNode || el.dataset.scrollShell === "1") return null;
    var box = document.createElement("div");
    box.className = "scroll-x" + (extraClass ? " " + extraClass : "");
    el.parentNode.insertBefore(box, el);
    box.appendChild(el);
    el.dataset.scrollShell = "1";
    return box;
  }
  function trackEdges(scroller, box) {
    if (!scroller || !box) return;
    var raf = 0;
    function measure() {
      raf = 0;
      var max = scroller.scrollWidth - scroller.clientWidth;
      if (max <= 1) {
        box.classList.remove("can-scroll-left", "can-scroll-right");
        return;
      }
      var x = scroller.scrollLeft;
      box.classList.toggle("can-scroll-left", x > 1);
      box.classList.toggle("can-scroll-right", x < max - 1);
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(measure);
    }
    on(scroller, "scroll", schedule, {
      passive: true
    });
    on(window, "resize", schedule, {
      passive: true
    });
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(scroller);
    measure();
    setTimeout(measure, 300);
    setTimeout(measure, 1200);
  }
  [ "appTabs", "admTabs" ].forEach(function(id) {
    var nav = document.getElementById(id);
    if (!nav) return;
    trackEdges(nav, shell(nav, "app-nav-shell"));
  });
  document.querySelectorAll(".adm-table-wrap").forEach(function(w) {
    w.classList.add("scroll-x");
    trackEdges(w, w);
  });
  function revealSelected(nav) {
    var sel = nav.querySelector('[aria-selected="true"]');
    if (!sel) return;
    var max = nav.scrollWidth - nav.clientWidth;
    if (max <= 1) return;
    var navBox = nav.getBoundingClientRect();
    var tabBox = sel.getBoundingClientRect();
    var target = nav.scrollLeft + (tabBox.left - navBox.left) - (navBox.width - tabBox.width) / 2;
    target = Math.max(0, Math.min(max, target));
    if (Math.abs(target - nav.scrollLeft) < 4) return;
    try {
      nav.scrollTo({
        left: target,
        behavior: mqReduce && mqReduce.matches ? "auto" : "smooth"
      });
    } catch (e) {
      nav.scrollLeft = target;
    }
  }
  [ "appTabs", "admTabs" ].forEach(function(id) {
    var nav = document.getElementById(id);
    if (!nav) return;
    if (window.MutationObserver) {
      var mo = new MutationObserver(function() {
        revealSelected(nav);
      });
      nav.querySelectorAll('[role="tab"]').forEach(function(t) {
        mo.observe(t, {
          attributes: true,
          attributeFilter: [ "aria-selected" ]
        });
      });
    }
    on(nav, "click", function() {
      setTimeout(function() {
        revealSelected(nav);
      }, 30);
    });
    setTimeout(function() {
      revealSelected(nav);
    }, 400);
  });
  function scrollableAncestor(node, container) {
    while (node && node !== container) {
      if (node.nodeType === 1) {
        var can = node.scrollWidth - node.clientWidth > 4;
        if (can) {
          var ox = getComputedStyle(node).overflowX;
          if (ox === "auto" || ox === "scroll") return node;
        }
      }
      node = node.parentNode;
    }
    return null;
  }
  function wireSwipe(pageId, navId) {
    var page = document.getElementById(pageId);
    var nav = document.getElementById(navId);
    if (!page || !nav) return;
    var main = page.querySelector('[role="main"]');
    if (!main) return;
    var x0 = 0, y0 = 0, t0 = 0, live = false;
    on(main, "touchstart", function(e) {
      if (e.touches.length !== 1) {
        live = false;
        return;
      }
      if (root.classList.contains("dialog-open")) {
        live = false;
        return;
      }
      if (scrollableAncestor(e.target, main)) {
        live = false;
        return;
      }
      if (e.target.closest && e.target.closest('input, textarea, select, [role="tablist"]')) {
        live = false;
        return;
      }
      var t = e.touches[0];
      // A swipe from the very edge is the phone's own back / forward gesture
      // (iOS Safari, Android gesture navigation). Switching tabs as well made one
      // swipe do two things.
      var edge = Math.max(24, window.innerWidth * .06);
      if (t.clientX < edge || t.clientX > window.innerWidth - edge) {
        live = false;
        return;
      }
      // Selecting text by dragging is not a swipe either.
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed) {
        live = false;
        return;
      }
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = Date.now();
      live = true;
    }, {
      passive: true
    });
    on(main, "touchend", function(e) {
      if (!live) return;
      live = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - x0;
      var dy = t.clientY - y0;
      var dt = Date.now() - t0;
      var minX = window.PTGSwipeMinX || 60;
      if (dt > 700) return;
      if (Math.abs(dx) < minX) return;
      if (Math.abs(dx) < Math.abs(dy) * 2) return;
      var tabs = Array.prototype.slice.call(nav.querySelectorAll('[role="tab"]'));
      if (tabs.length < 2) return;
      var i = tabs.findIndex(function(b) {
        return b.getAttribute("aria-selected") === "true";
      });
      if (i < 0) return;
      var next = dx < 0 ? i + 1 : i - 1;
      if (next < 0 || next >= tabs.length) return;
      tabs[next].click();
    }, {
      passive: true
    });
  }
  wireSwipe("page-app", "appTabs");
  wireSwipe("page-admin", "admTabs");
  function markZeros() {
    document.querySelectorAll(":is(#page-app,#page-admin) .app-nav .count").forEach(function(c) {
      var n = parseInt((c.textContent || "").trim(), 10);
      c.dataset.zero = !n || isNaN(n) ? "true" : "false";
    });
  }
  markZeros();
  if (window.MutationObserver) {
    document.querySelectorAll(":is(#page-app,#page-admin) .app-nav .count").forEach(function(c) {
      new MutationObserver(markZeros).observe(c, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
  }
  function anyDialogOpen() {
    return !!document.querySelector("dialog[open]");
  }
  function syncDialog() {
    root.classList.toggle("dialog-open", anyDialogOpen());
  }
  document.querySelectorAll("dialog").forEach(function(d) {
    if (window.MutationObserver) {
      new MutationObserver(syncDialog).observe(d, {
        attributes: true,
        attributeFilter: [ "open" ]
      });
    }
    on(d, "close", syncDialog);
  });
  syncDialog();
  var GO_KEYS = {
    d: "dashboard",
    p: "profiles",
    l: "library",
    w: "wishlist"
  };
  var goArmed = false, goTimer = 0;
  function typing(el) {
    if (!el) return false;
    var t = el.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
  }
  on(document, "keydown", function(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target)) return;
    if (root.classList.contains("dialog-open")) return;
    var app = document.getElementById("page-app");
    if (!app || app.hidden) return;
    if (e.key === "/") {
      var s = document.getElementById("appSearch");
      if (s) {
        e.preventDefault();
        s.focus();
        s.select && s.select();
      }
      return;
    }
    if (goArmed) {
      var dest = GO_KEYS[e.key.toLowerCase()];
      goArmed = false;
      clearTimeout(goTimer);
      if (dest) {
        var tab = document.getElementById("tab-" + dest);
        if (tab) {
          e.preventDefault();
          tab.click();
        }
      }
      return;
    }
    if (e.key.toLowerCase() === "g") {
      goArmed = true;
      clearTimeout(goTimer);
      goTimer = setTimeout(function() {
        goArmed = false;
      }, 1200);
    }
  });
})();
