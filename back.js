"use strict";

(function() {
  if (!window.history || !window.history.pushState || !document.querySelectorAll) return;

  var KEY = "ptgLayer";
  var armed = false;
  var ownPops = 0;
  var queued = false;

  function shown(el) {
    if (!el || !el.isConnected || el.closest("[hidden]")) return false;
    return el.getClientRects().length > 0;
  }

  function layers() {
    var found = [];
    var all = document.querySelectorAll("dialog[open]");
    for (var i = all.length - 1; i >= 0; i--) if (shown(all[i])) found.push(all[i]);

    all = document.querySelectorAll('[aria-modal="true"]');
    for (i = all.length - 1; i >= 0; i--) {
      if (all[i].tagName !== "DIALOG" && shown(all[i])) found.push(all[i]);
    }

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
      var cancel = new Event("cancel", { cancelable: true });
      el.dispatchEvent(cancel);
      if (!cancel.defaultPrevented && el.open) el.close();
      return;
    }
    escapeFrom(el.hasAttribute("aria-controls") ? (document.getElementById(el.getAttribute("aria-controls")) || el) : el);
    if (isOpen(el) && el.hasAttribute("aria-expanded")) el.click();
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
    if (onLayerState()) {
      ownPops++;
      history.back();
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    setTimeout(check, 30);
  }

  window.addEventListener("popstate", function() {
    if (ownPops) { ownPops--; return; }
    var top = layers()[0];
    if (armed && top && !onLayerState()) {
      armed = false;
      close(top);
      setTimeout(function() { if (layers().length) arm(); }, 30);
      return;
    }
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
