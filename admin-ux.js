"use strict";

(function() {
  var $ = function(id) { return document.getElementById(id); };

  var table = $("admAccTable"), sortSel = $("admAccSort");
  if (table && sortSel) {
    var COLS = { 0: { key: "name", label: "Account", dir: "ascending" }, 2: { key: "children", label: "Children", dir: "descending" }, 4: { key: "recent", label: "Last active", dir: "descending" } };
    var ths = table.querySelectorAll("thead th");
    Object.keys(COLS).forEach(function(i) {
      var th = ths[i], col = COLS[i];
      if (!th) return;
      th.innerHTML = '<button type="button" class="th-sort" data-sort="' + col.key + '">' + th.textContent + "</button>";
    });
    function mark() {
      Object.keys(COLS).forEach(function(i) {
        var th = ths[i];
        if (!th) return;
        if (COLS[i].key === sortSel.value) th.setAttribute("aria-sort", COLS[i].dir);
        else th.removeAttribute("aria-sort");
      });
    }
    table.querySelector("thead").addEventListener("click", function(e) {
      var b = e.target.closest ? e.target.closest("[data-sort]") : null;
      if (!b) return;
      sortSel.value = b.getAttribute("data-sort");
      sortSel.dispatchEvent(new Event("change", { bubbles: true }));
      mark();
    });
    sortSel.addEventListener("change", mark);
    mark();
  }

  var list = $("admModList");
  if (!list) return;
  var hint = document.createElement("p");
  hint.className = "kbd-hint";
  hint.id = "admModKeys";
  hint.innerHTML = "<span><kbd>J</kbd><kbd>K</kbd>next / previous</span><span><kbd>A</kbd>approve</span><span><kbd>R</kbd>reject</span>";
  list.parentNode.insertBefore(hint, list);

  function cards() {
    return Array.prototype.slice.call(list.querySelectorAll(".sub-card"));
  }
  function prepare() {
    cards().forEach(function(c) {
      if (!c.hasAttribute("tabindex")) {
        c.setAttribute("tabindex", "0");
        c.setAttribute("aria-describedby", "admModKeys");
      }
    });
    hint.hidden = !list.querySelector('.sub-card [data-approve]');
  }
  var pendingIndex = null;
  new MutationObserver(function() {
    prepare();
    if (pendingIndex !== null) {
      var all = cards();
      var next = all[Math.min(pendingIndex, all.length - 1)];
      pendingIndex = null;
      if (next) next.focus();
    }
  }).observe(list, { childList: true });
  prepare();

  list.addEventListener("keydown", function(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var card = e.target.closest && e.target.closest(".sub-card");
    if (!card || e.target !== card) return;
    var all = cards(), i = all.indexOf(card), k = e.key.toLowerCase();
    if (k === "j" || k === "arrowdown") {
      e.preventDefault();
      if (all[i + 1]) all[i + 1].focus();
    } else if (k === "k" || k === "arrowup") {
      e.preventDefault();
      if (all[i - 1]) all[i - 1].focus();
    } else if (k === "a" || k === "r") {
      var btn = card.querySelector(k === "a" ? "[data-approve]" : "[data-reject]");
      if (!btn) return;
      e.preventDefault();
      pendingIndex = i;
      btn.click();
    }
  });
})();
