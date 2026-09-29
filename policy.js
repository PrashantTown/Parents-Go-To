(function() {
  "use strict";
  var landing = document.getElementById("page-landing");
  if (!landing) {
    return;
  }
  var main = landing.querySelector("main");
  if (!main) {
    return;
  }
  var PAGES = {};
  var TITLES = {};
  var LANDING_TITLE = document.title;
  var blocks = [];
  var found = false;
  var i;
  for (i = 0; i < main.children.length; i++) {
    var child = main.children[i];
    blocks.push(child);
    if (child.id && child.hasAttribute("data-landing-page")) {
      PAGES[child.id] = child;
      TITLES[child.id] = child.getAttribute("data-landing-page");
      found = true;
    }
  }
  if (!found) {
    return;
  }
  function hashName() {
    return (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
  }
  function wantedPage() {
    var h = hashName();
    var id;
    if (PAGES[h]) {
      return h;
    }
    var el = h ? document.getElementById(h) : null;
    if (el) {
      for (id in PAGES) {
        if (Object.prototype.hasOwnProperty.call(PAGES, id) && PAGES[id].contains(el)) {
          return id;
        }
      }
    }
    return null;
  }
  var showing = null;
  function apply() {
    var want = wantedPage();
    if (want === showing) {
      return;
    }
    var wasSub = !!showing;
    showing = want;
    for (var n = 0; n < blocks.length; n++) {
      var el = blocks[n];
      var isSub = !!(el.id && PAGES[el.id]);
      if (want) {
        el.hidden = isSub ? el.id !== want : true;
      } else {
        el.hidden = isSub;
      }
    }
    document.title = want ? TITLES[want] : LANDING_TITLE;
    if (want) {
      window.scrollTo(0, 0);
      var target = PAGES[want];
      window.setTimeout(function() {
        try {
          target.focus({
            preventScroll: true
          });
        } catch (e) {
          target.focus();
        }
      }, 0);
    } else if (wasSub) {
      window.scrollTo(0, 0);
    }
  }
  var root = document.documentElement;
  var from = null;
  var parked = [];
  var backLinks = landing.querySelectorAll(".policy-back");
  var backLabel = backLinks.length ? backLinks[0].lastChild.textContent : "";
  function role() {
    return window.PTGSession && window.PTGSession.role ? window.PTGSession.role() : null;
  }
  function openSide() {
    var app = document.getElementById("page-app");
    var admin = document.getElementById("page-admin");
    if (app && !app.hidden) {
      return "app";
    }
    if (admin && !admin.hidden) {
      return "admin";
    }
    return null;
  }
  document.addEventListener("click", function(e) {
    var a = e.target.closest ? e.target.closest("a[href^='#']") : null;
    if (!a || landing.contains(a)) {
      return;
    }
    var id = a.getAttribute("href").slice(1).toLowerCase();
    if (!PAGES[id]) {
      return;
    }
    from = {
      hash: window.location.hash,
      side: openSide()
    };
    parked = [];
    var open = document.querySelectorAll("dialog[open]");
    for (var d = 0; d < open.length; d++) {
      parked.push(open[d]);
      open[d].close();
    }
  }, true);
  var homeBtn = document.createElement("a");
  homeBtn.className = "btn btn--primary policy-home";
  homeBtn.href = "#app";
  homeBtn.hidden = true;
  var headerInner = document.querySelector("#siteHeader .header-inner");
  if (headerInner) {
    headerInner.appendChild(homeBtn);
  }
  function memberSide() {
    if (from && from.side) {
      return from.side;
    }
    var r = role();
    return r === "admin" ? "admin" : r === "parent" ? "app" : null;
  }
  function paintWayBack() {
    var side = showing ? memberSide() : null;
    var text = side === "admin" ? "Back to the console" : side === "app" ? "Back to your shelf" : showing && from && from.hash ? "Back" : backLabel;
    root.classList.toggle("policy-member", !!side);
    homeBtn.hidden = !side;
    homeBtn.textContent = text;
    for (var b = 0; b < backLinks.length; b++) {
      backLinks[b].lastChild.textContent = " " + text.trim();
    }
  }
  function goBack(e) {
    e.preventDefault();
    var side = memberSide();
    window.location.hash = from && from.hash ? from.hash : side === "admin" ? "#admin" : side === "app" ? "#app" : "#";
  }
  function reopenParked() {
    var list = parked;
    window.setTimeout(function() {
      for (var d = 0; d < list.length; d++) {
        if (!list[d].open && !list[d].closest("[hidden]") && list[d].showModal) {
          list[d].showModal();
        }
      }
    }, 60);
  }
  landing.addEventListener("click", function(e) {
    var b = e.target.closest ? e.target.closest(".policy-back, .policy-home") : null;
    if (b) {
      goBack(e);
    }
  });
  window.addEventListener("hashchange", function() {
    apply();
    if (!showing) {
      if (from && window.location.hash === from.hash) {
        reopenParked();
      }
      from = null;
      parked = [];
    }
    paintWayBack();
  });
  apply();
  paintWayBack();
  if (window.MutationObserver) {
    var wasHidden = landing.hidden;
    var watcher = new window.MutationObserver(function() {
      if (landing.hidden === wasHidden) {
        return;
      }
      wasHidden = landing.hidden;
      if (!wasHidden) {
        apply();
      }
    });
    watcher.observe(landing, {
      attributes: true,
      attributeFilter: [ "hidden" ]
    });
  }
})();
