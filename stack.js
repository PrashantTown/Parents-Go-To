"use strict";

(function() {
  var slots = Array.prototype.slice.call(document.querySelectorAll(".stack__slot"));
  if (!slots.length) return;
  var stack = slots[0].parentNode;

  var pinTops = [];
  var heights = [];
  var queued = false;
  var flat = false;
  var lastWidth = 0;

  function measure() {
    lastWidth = window.innerWidth;
    stack.classList.remove("stack--flat");
    pinTops = slots.map(function(slot) { return parseFloat(getComputedStyle(slot).top) || 0; });
    heights = slots.map(function(slot) { return slot.offsetHeight; });
    // A pinned card taller than the space below its pin gets its end covered by the
    // next card before anyone can read it (small phones), so lay the cards out flat.
    var vh = window.innerHeight;
    flat = slots.some(function(slot, i) {
      return i < slots.length - 1 && heights[i] > vh - pinTops[i];
    });
    stack.classList.toggle("stack--flat", flat);
    update();
  }

  function clamp(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  function update() {
    queued = false;
    if (flat) return;
    var vh = window.innerHeight;
    var tops = slots.map(function(slot) { return slot.getBoundingClientRect().top; });

    var cover = tops.map(function(top, j) {
      if (j === 0) return 0;
      var travel = Math.max(heights[j - 1] * .85, 1);
      return clamp(1 - (top - pinTops[j]) / travel);
    });

    slots.forEach(function(slot, i) {
      var rise = clamp((vh - tops[i]) / Math.max(vh - pinTops[i], 1));
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
  // change (rotation, window resize) should decide flat versus stacked again.
  function resized() {
    if (window.innerWidth !== lastWidth) { measure(); return; }
    queue();
  }

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", resized);
  window.addEventListener("load", measure);
  // On the Reading for Pleasure page the landing is hidden while the app is open,
  // so measure again once it is shown.
  window.addEventListener("hashchange", function() { setTimeout(measure, 60); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
})();
