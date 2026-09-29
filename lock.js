(function() {
  "use strict";
  var HTML = document.documentElement;
  var CLASS = "ptg-locked";
  var held = [];
  var keptY = 0;
  function gap() {
    var w = window.innerWidth - HTML.clientWidth;
    return w > 0 ? w : 0;
  }
  function pageY() {
    return window.pageYOffset || HTML.scrollTop || 0;
  }
  function owner(node) {
    var i;
    for (i = 0; i < held.length; i++) {
      if (held[i] && held[i].contains && held[i].contains(node)) {
        return held[i];
      }
    }
    return null;
  }
  function ownScroller(node, root) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    var style, flow;
    while (el && el.nodeType === 1) {
      try {
        style = window.getComputedStyle(el);
      } catch (e) {
        style = null;
      }
      if (style) {
        flow = style.overflowY;
        if ((flow === "auto" || flow === "scroll") && el.scrollHeight - el.clientHeight > 1) {
          return true;
        }
      }
      if (el === root) {
        break;
      }
      el = el.parentElement;
    }
    return false;
  }
  function onTouchMove(e) {
    if (!held.length) {
      return;
    }
    if (e.touches && e.touches.length > 1) {
      return;
    }
    var root = owner(e.target);
    if (root && ownScroller(e.target, root)) {
      return;
    }
    if (e.cancelable) {
      e.preventDefault();
    }
  }
  var passive = false;
  try {
    window.addEventListener("ptg-probe", null, Object.defineProperty({}, "passive", {
      get: function() {
        passive = true;
        return false;
      }
    }));
  } catch (e) {
    passive = false;
  }
  document.addEventListener("touchmove", onTouchMove, passive ? {
    passive: false
  } : false);
  function lock(el) {
    var node = el || HTML;
    if (held.indexOf(node) !== -1) {
      return;
    }
    if (!held.length) {
      keptY = pageY();
      HTML.style.setProperty("--ptg-lock-gap", gap() + "px");
      HTML.classList.add(CLASS);
      if (pageY() !== keptY) {
        window.scrollTo(0, keptY);
      }
    }
    held.push(node);
  }
  function unlock(el) {
    var node = el || HTML;
    var at = held.indexOf(node);
    if (at === -1) {
      return;
    }
    held.splice(at, 1);
    if (held.length) {
      return;
    }
    HTML.classList.remove(CLASS);
    HTML.style.removeProperty("--ptg-lock-gap");
    if (pageY() !== keptY) {
      window.scrollTo(0, keptY);
    }
  }
  window.PTGLock = {
    lock: lock,
    unlock: unlock,
    held: function() {
      return held.length > 0;
    }
  };
})();
