"use strict";

(function() {
  var slots = Array.prototype.slice.call(document.querySelectorAll(".stack__slot"));
  if (!slots.length) return;
  var stack = slots[0].parentNode;

  var pinTops = [];
  var heights = [];
  var queued = false;
  var lastWidth = 0;
  var viewH = 0;

  // The smallest viewport height (address bar showing), so a pinned card's
  // bottom edge is never hidden behind a phone's browser toolbar.
  var probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);

  function screenHeight() {
    var h = probe.offsetHeight;
    return Math.min(h || window.innerHeight, window.innerHeight || h);
  }

  function measure() {
    if (!stack.offsetParent && stack.getClientRects().length === 0) return; // landing hidden
    lastWidth = window.innerWidth;
    viewH = screenHeight();
    slots.forEach(function(slot) { slot.style.top = ""; });
    var base = slots.map(function(slot) { return parseFloat(getComputedStyle(slot).top) || 0; });
    heights = slots.map(function(slot) { return slot.offsetHeight; });
    // A card taller than the space below its pin would have its end covered by the
    // next card before anyone could read it (phones, short laptop windows, landscape
    // tablets). Pin those cards by their bottom edge instead: they scroll up until
    // the last line is on screen, then hold there while the next card slides over.
    var gap = Math.min(24, viewH * .04);
    pinTops = base.map(function(top, i) {
      var fit = viewH - heights[i] - gap;
      return fit < top ? fit : top;
    });
    slots.forEach(function(slot, i) {
      if (pinTops[i] !== base[i]) slot.style.top = pinTops[i] + "px";
    });
    update();
  }

  function clamp(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  function update() {
    queued = false;
    if (!heights.length) return;
    var vh = viewH || window.innerHeight;
    var tops = slots.map(function(slot) { return slot.getBoundingClientRect().top; });

    var cover = tops.map(function(top, j) {
      if (j === 0) return 0;
      var travel = Math.max(Math.min(heights[j - 1], vh) * .85, 1);
      return clamp(1 - (top - pinTops[j]) / travel);
    });

    slots.forEach(function(slot, i) {
      var rise = clamp((vh - tops[i]) / Math.max(Math.min(vh - pinTops[i], vh), 1));
      var depth = 0;
      for (var j = i + 1; j < slots.length; j++) depth += cover[j];
      slot.style.setProperty("--rise", rise.toFixed(4));
      slot.style.setProperty("--depth", depth.toFixed(4));
    });
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  // Phone address bars resize the viewport height while scrolling; only a width
  // change (rotation, window resize) or a real height change (a desktop window
  // being resized) should re-measure the pins.
  function resized() {
    if (window.innerWidth !== lastWidth || Math.abs(screenHeight() - viewH) > 140) {
      measure();
      return;
    }
    queue();
  }

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", resized);
  window.addEventListener("orientationchange", function() { setTimeout(measure, 250); });
  window.addEventListener("load", measure);
  window.addEventListener("pageshow", measure);
  // On the Reading for Pleasure page the landing is hidden while the app is open,
  // so measure again once it is shown.
  window.addEventListener("hashchange", function() { setTimeout(measure, 60); });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function() {
      var changed = slots.some(function(slot, i) { return slot.offsetHeight !== heights[i]; });
      if (changed) measure();
    });
    slots.forEach(function(slot) { ro.observe(slot); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
})();
