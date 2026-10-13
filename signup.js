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
    window.location.href = "mailto:tsander2@usc.edu.au?subject=" + encodeURIComponent("Keep me posted") + "&body=" + encodeURIComponent("Please let me know at " + email + " when a new service opens near me.");
    result.textContent = "Your email app should open with the request ready to send.";
    field.value = "";
  }
  button.addEventListener("click", submit);
  field.addEventListener("keydown", function(event) {
    if (event.key === "Enter") { event.preventDefault(); submit(); }
  });
})();
