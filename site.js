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
  function go(card) {
    var url = card.dataset.href || "";
    if (/^https:/i.test(url)) {
      window.open(url, "_blank", "noopener");
    } else if (url) {
      window.location.href = url;
    }
  }
  document.addEventListener("click", function(event) {
    var card = event.target.closest && event.target.closest("[data-href]");
    if (!card || event.target.closest("a, button")) return;
    go(card);
  });
  document.addEventListener("keydown", function(event) {
    var card = event.target.closest && event.target.closest("[data-href]");
    if (!card || event.key !== "Enter" || event.target !== card) return;
    go(card);
  });
})();

document.querySelectorAll(".year").forEach(function(el) {
  el.textContent = (new Date).getFullYear();
});
