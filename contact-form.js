"use strict";

(function() {
  var send = document.getElementById("cf-send");
  var name = document.getElementById("cf-name");
  var email = document.getElementById("cf-email");
  var topic = document.getElementById("cf-topic");
  var message = document.getElementById("cf-message");
  var result = document.getElementById("cf-result");
  if (!send) return;
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
    if (!window.PTGBackend || !window.PTGBackend.ready) {
      result.classList.add("error");
      result.textContent = "We could not send that just now. Please email us using the address on this page.";
      return;
    }
    send.disabled = true;
    result.textContent = "Sending…";
    window.PTGBackend.contact(name.value.trim(), address, topic.value, message.value.trim()).then(function(ref) {
      result.textContent = "Thanks. Your reference is " + ref + ", filed under “" + topic.value + "”. If you need a reply soon, use the email address on this page.";
      name.value = "";
      email.value = "";
      message.value = "";
    }, function(err) {
      result.classList.add("error");
      result.textContent = err.message + " You can also email us using the address on this page.";
    }).then(function() {
      send.disabled = false;
    });
  });
  [name, email].forEach(function(field) {
    field.addEventListener("keydown", function(event) {
      if (event.key === "Enter") { event.preventDefault(); send.click(); }
    });
  });
})();
