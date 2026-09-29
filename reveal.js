"use strict";

(function() {
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (calm || !("IntersectionObserver" in window)) return;

  var GROUPS = [".sectionhead", ".feature", ".split > *", ".cards > .card", ".steps > li", ".points > li", ".details > li", "#questions details", ".section--pine .narrow"];
  var items = [];
  GROUPS.forEach(function(sel) {
    Array.prototype.forEach.call(document.querySelectorAll("main " + sel), function(el) {
      if (items.indexOf(el) !== -1) return;
      var siblings = el.parentNode ? Array.prototype.filter.call(el.parentNode.children, function(c) { return c.matches(sel.split(" ").pop()); }) : [];
      el.style.setProperty("--rv-i", String(Math.min(siblings.indexOf(el), 5)));
      el.classList.add("rv");
      items.push(el);
    });
  });
  if (!items.length) return;

  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  document.documentElement.classList.add("rv-on");
  items.forEach(function(el) {
    io.observe(el);
    el.addEventListener("transitionend", function done(e) {
      if (e.target !== el || !el.classList.contains("is-in")) return;
      el.classList.add("rv-done");
      el.removeEventListener("transitionend", done);
    });
  });

  requestAnimationFrame(function() {
    items.forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-in");
    });
  });
})();
