"use strict";

(function() {
  var button = document.getElementById("signup-btn");
  var field = document.getElementById("signup-email");
  var result = document.getElementById("signup-result");
  if (!button || !field || !result) return;
  var sending = false;
  function fail(text) {
    result.classList.add("error");
    result.textContent = text;
    field.focus();
  }
  function byEmail(email) {
    window.location.href = "mailto:tsander2@usc.edu.au?subject=" + encodeURIComponent("Keep me posted") + "&body=" + encodeURIComponent("Please let me know at " + email + " when a new service opens near me.");
    result.textContent = "Your email app should open with the request ready to send.";
    field.value = "";
  }
  function submit() {
    if (sending) return;
    var email = field.value.trim();
    result.classList.remove("error");
    if (email === "") {
      return fail("Add an email address and we will let you know.");
    }
    if (email.indexOf("@") === -1 || email.indexOf(".") === -1) {
      return fail("That address is missing an @ or a full stop.");
    }
    var Api = window.PTGApi;
    if (!Api || !Api.enabled) {
      return byEmail(email);
    }
    // Goes to the team's inbox in the admin console.
    sending = true;
    button.disabled = true;
    Api.post("/api/support", {
      id: "tk" + Date.now() + "-k",
      name: "Website visitor",
      from: email,
      replyTo: email,
      area: "Keep me posted",
      severity: "low",
      severityText: "Asked to hear when a new service opens",
      body: "Please let me know at " + email + " when a new service opens near me."
    }, {
      auth: false
    }).then(function() {
      sending = false;
      button.disabled = false;
      result.textContent = "Thanks — we will let you know at " + email + ".";
      field.value = "";
    }, function(err) {
      sending = false;
      button.disabled = false;
      if (err && err.status && err.status < 500 && err.status !== 429) {
        return fail(Api.errorMessage(err));
      }
      byEmail(email);
    });
  }
  button.addEventListener("click", submit);
  field.addEventListener("keydown", function(event) {
    if (event.key === "Enter") { event.preventDefault(); submit(); }
  });
})();
