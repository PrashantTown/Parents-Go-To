"use strict";

(function() {
  var send = document.getElementById("cf-send");
  var name = document.getElementById("cf-name");
  var email = document.getElementById("cf-email");
  var topic = document.getElementById("cf-topic");
  var message = document.getElementById("cf-message");
  var result = document.getElementById("cf-result");
  if (!send) return;
  function reference() {
    var stamp = Date.now().toString(36).toUpperCase();
    return "PTG-" + stamp.slice(-6);
  }
  function fail(field, text) {
    result.classList.add("error");
    result.textContent = text;
    field.focus();
  }
  send.addEventListener("click", function() {
    result.classList.remove("error");
    if (name.value.trim() === "") {
      return fail(name, "Tell us what to call you.");
    }
    var address = email.value.trim();
    if (address === "") {
      return fail(email, "Add an email address so we can reply.");
    }
    if (address.indexOf("@") === -1 || address.indexOf(".") === -1) {
      return fail(email, "That address is missing an @ or a full stop.");
    }
    if (message.value.trim() === "") {
      return fail(message, "Tell us what you need — a sentence or two is plenty.");
    }
    result.textContent = "Thanks. Your reference is " + reference() + ", filed under “" + topic.value + "”. If you need a reply soon, use the email address on this page.";
    name.value = "";
    email.value = "";
    message.value = "";
  });
  // Not inside a form, so Enter in a one-line field (or "Go" on a phone keyboard) needs wiring up.
  [name, email].forEach(function(field) {
    field.addEventListener("keydown", function(event) {
      if (event.key === "Enter") { event.preventDefault(); send.click(); }
    });
  });
})();
