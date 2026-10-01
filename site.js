"use strict";

(function() {
  var toggle = document.getElementById("navtoggle");
  var nav = document.getElementById("nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", function() {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close" : "Menu";
  });
  function closeMenu() {
    if (!nav.classList.contains("open")) return;
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menu";
  }
  nav.addEventListener("click", function(event) {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", function(event) {
    if (event.key !== "Escape" || !nav.classList.contains("open")) return;
    closeMenu();
    toggle.focus();
  });
  // A tap outside the open menu closes it, and so does widening past the menu breakpoint.
  document.addEventListener("click", function(event) {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) closeMenu();
  });
  window.addEventListener("resize", function() {
    if (window.innerWidth > 820) closeMenu();
  });
})();

(function() {
  var here = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach(function(link) {
    var href = (link.getAttribute("href") || "").split("#")[0];
    if (href && href === here) {
      link.setAttribute("aria-current", "page");
    }
  });
})();

(function() {
  document.querySelectorAll("[data-href]").forEach(function(card) {
    card.style.cursor = "pointer";
    card.addEventListener("click", function(event) {
      if (event.target.closest("a")) return;
      window.location.href = card.dataset.href;
    });
    card.addEventListener("keydown", function(event) {
      if (event.key !== "Enter" || event.target !== card) return;
      window.location.href = card.dataset.href;
    });
  });
})();

document.querySelectorAll(".year").forEach(function(el) {
  el.textContent = (new Date).getFullYear();
});
