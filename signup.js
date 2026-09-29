"use strict";

(function() {
  var button = document.getElementById("signup-btn");
  var field = document.getElementById("signup-email");
  var result = document.getElementById("signup-result");
  if (!button || !field || !result) return;
  function fail(text) {
    result.classList.add("error");
    result.textContent = text;
    field.focus();
  }
  function submit() {
    var email = field.value.trim();
    result.classList.remove("error");
    if (email === "") {
      return fail("Add an email address and we will let you know.");
    }
    if (email.indexOf("@") === -1 || email.indexOf(".") === -1) {
      return fail("That address is missing an @ or a full stop.");
    }
    result.textContent = "Done. We will email " + email + " when a new service opens near you.";
    field.value = "";
  }
  button.addEventListener("click", submit);
  // The field is not inside a form, so Enter (or "Go" on a phone keyboard) needs wiring up.
  field.addEventListener("keydown", function(event) {
    if (event.key === "Enter") { event.preventDefault(); submit(); }
  });
})();
