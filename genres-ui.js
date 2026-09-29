"use strict";

(function() {
  var form = document.getElementById("genresForm");
  if (!form) return;

  var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="genre"]'));
  var tally = document.getElementById("gnTally");
  var picked = document.getElementById("gnPicked");
  var label = document.getElementById("gnSubmitLabel");
  var allBtn = document.getElementById("gnAll");
  var noneBtn = document.getElementById("gnNone");

  function nameOf(box) {
    var n = box.closest(".gn-tile").querySelector(".gn-name");
    return n ? n.textContent : box.value;
  }

  function sync() {
    var on = boxes.filter(function(b) { return b.checked; });
    var n = on.length;
    if (tally) tally.innerHTML = "<b>" + n + "</b> of " + boxes.length + " picked";
    if (picked) {
      var names = on.map(nameOf);
      picked.textContent = names.length > 3
        ? names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more"
        : names.join(", ");
    }
    if (label) label.textContent = n === 0 ? "Open my shelf" : n === 1 ? "Save 1 interest" : "Save " + n + " interests";
    if (allBtn) allBtn.disabled = n === boxes.length;
    if (noneBtn) noneBtn.disabled = n === 0;
    form.classList.toggle("has-picks", n > 0);
  }

  function setAll(value) {
    boxes.forEach(function(b) { b.checked = value; });
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (allBtn) allBtn.addEventListener("click", function() { setAll(true); });
  if (noneBtn) noneBtn.addEventListener("click", function() { setAll(false); });
  form.addEventListener("change", sync);
  form.addEventListener("reset", function() { window.setTimeout(sync, 0); });
  sync();
})();
