"use strict";

(function() {
  if (!window.MutationObserver || typeof WeakMap !== "function") return;
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var SELECTOR = "#statReading, #statFinished, #pgPct, #page-admin .stat .n";
  var state = new WeakMap();

  function parse(text) {
    var m = /^(\D*?)(\d+)(\D*)$/.exec(String(text).trim());
    return m ? { pre: m[1], n: +m[2], post: m[3] } : null;
  }

  function write(el, s, text) {
    s.wrote = text;
    el.textContent = text;
  }

  function onChange(el) {
    var s = state.get(el) || { shown: 0, wrote: null, raf: 0 };
    state.set(el, s);
    if (el.textContent === s.wrote) return;
    var next = parse(el.textContent);
    cancelAnimationFrame(s.raf);
    if (!next) {
      s.wrote = null;
      return;
    }
    var from = s.shown, to = next.n;
    var still = (calm && calm.matches) || document.documentElement.classList.contains("ptg-reduce");
    if (from === to || still || !el.offsetParent) {
      s.shown = to;
      s.wrote = el.textContent;
      return;
    }
    var dur = Math.min(900, 380 + Math.abs(to - from) * 12), start = null;
    write(el, s, next.pre + from + next.post);
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var v = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      s.shown = v;
      write(el, s, next.pre + v + next.post);
      if (t < 1) s.raf = requestAnimationFrame(frame);
    }
    s.raf = requestAnimationFrame(frame);
  }

  var mo = new MutationObserver(function(records) {
    var seen = [];
    records.forEach(function(r) {
      var el = r.target.nodeType === 3 ? r.target.parentNode : r.target;
      if (el && el.matches && el.matches(SELECTOR) && seen.indexOf(el) === -1) seen.push(el);
    });
    seen.forEach(onChange);
  });

  var watched = typeof WeakSet === "function" ? new WeakSet() : { has: function() { return false; }, add: function() {} };
  function watchAll() {
    Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), function(el) {
      if (watched.has(el)) return;
      watched.add(el);
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
  watchAll();
  window.addEventListener("hashchange", function() { setTimeout(watchAll, 60); });
})();
