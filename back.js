"use strict";

// Makes the device's own back control (Android back button, iOS / Android
// swipe-back, a tablet's back key, a mouse's back button) close whatever is open
// on top of the page first: the mobile menu, a dialog, a dropdown, the chat panel,
// the kids' screen. Only once nothing is open does back leave the page, the same
// way installed apps behave.
(function() {
  if (!window.history || !window.history.pushState || !document.querySelectorAll) return;

  var KEY = "ptgLayer";
  var armed = false;    // we have pushed a history entry for the open layer(s)
  var ownPops = 0;      // pops caused by our own history.back(), to ignore
  var queued = false;

  function shown(el) {
    if (!el || !el.isConnected || el.closest("[hidden]")) return false;
    return el.getClientRects().length > 0;
  }

  // Everything currently open on top of the page, topmost first.
  function layers() {
    var found = [];
    var all = document.querySelectorAll("dialog[open]");
    for (var i = all.length - 1; i >= 0; i--) if (shown(all[i])) found.push(all[i]);

    all = document.querySelectorAll('[aria-modal="true"]');
    for (i = all.length - 1; i >= 0; i--) {
      if (all[i].tagName !== "DIALOG" && shown(all[i])) found.push(all[i]);
    }

    // Menus and panels opened by a button (aria-expanded). Settings rail links use
    // aria-expanded for their accordion, which is not something back should close.
    all = document.querySelectorAll('[aria-expanded="true"]:not([data-set-jump])');
    for (i = all.length - 1; i >= 0; i--) {
      var btn = all[i];
      if (!shown(btn)) continue;
      var id = btn.getAttribute("aria-controls");
      var target = id ? document.getElementById(id) : null;
      if (id && !target) continue;
      if (target && !shown(target)) continue;
      found.push(btn);
    }
    return found;
  }

  function isOpen(el) {
    if (el.tagName === "DIALOG") return el.open;
    if (el.hasAttribute("aria-expanded")) return el.getAttribute("aria-expanded") === "true" && shown(el);
    return shown(el);
  }

  function escapeFrom(el) {
    var from = document.activeElement && el.contains(document.activeElement) ? document.activeElement : el;
    var ev;
    try {
      ev = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
    } catch (e) {
      ev = document.createEvent("Event");
      ev.initEvent("keydown", true, true);
      ev.key = "Escape";
    }
    from.dispatchEvent(ev);
  }

  function close(el) {
    if (el.tagName === "DIALOG") {
      // Same path as the Escape key: "cancel" lets a dialog refuse (unsaved changes).
      var cancel = new Event("cancel", { cancelable: true });
      el.dispatchEvent(cancel);
      if (!cancel.defaultPrevented && el.open) el.close();
      return;
    }
    escapeFrom(el.hasAttribute("aria-controls") ? (document.getElementById(el.getAttribute("aria-controls")) || el) : el);
    // A menu toggle that ignores Escape still closes when its button is pressed.
    if (isOpen(el) && el.hasAttribute("aria-expanded")) el.click();
    // Anything else that stays open (the locked kids' screen) is left alone on purpose.
  }

  function onLayerState() {
    if (!history.state || !history.state[KEY]) armed = false;
    return history.state && history.state[KEY];
  }

  function arm() {
    if (armed) return;
    var state = {};
    var cur = history.state;
    if (cur && typeof cur === "object") for (var k in cur) state[k] = cur[k];
    state[KEY] = 1;
    history.pushState(state, "", window.location.href);
    armed = true;
  }

  function check() {
    queued = false;
    var open = layers().length > 0;
    if (open) {
      arm();
      return;
    }
    if (!armed) return;
    armed = false;
    // Closed by its own button, a tap outside or Escape: drop the entry we added,
    // unless the person navigated somewhere from inside it (a menu link).
    if (onLayerState()) {
      ownPops++;
      history.back();
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    // Let click handlers and same-page link navigation finish first.
    setTimeout(check, 30);
  }

  window.addEventListener("popstate", function() {
    if (ownPops) { ownPops--; return; }
    var top = layers()[0];
    if (armed && top && !onLayerState()) {
      armed = false;
      close(top);
      // Something still open (a dialog over a menu, or a locked screen): keep
      // catching back for it.
      setTimeout(function() { if (layers().length) arm(); }, 30);
      return;
    }
    // Landed on an entry left behind by a layer that was closed by navigating
    // from inside it. Step over it so back does not look like it did nothing.
    if (!top && history.state && history.state[KEY]) {
      ownPops++;
      history.back();
    }
  });

  if (window.MutationObserver) {
    new MutationObserver(queue).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "hidden", "aria-expanded", "aria-modal"]
    });
  }
  document.addEventListener("close", queue, true);
  window.addEventListener("pageshow", function() { armed = !!onLayerState(); queue(); });
})();
