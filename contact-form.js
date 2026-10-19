"use strict";

(function() {
  var send = document.getElementById("cf-send");
  var name = document.getElementById("cf-name");
  var email = document.getElementById("cf-email");
  var topic = document.getElementById("cf-topic");
  var message = document.getElementById("cf-message");
  var result = document.getElementById("cf-result");
  if (!send) return;
  var TO = "tsander2@usc.edu.au";
  var sending = false;
  function fail(field, text) {
    result.classList.add("error");
    result.textContent = text;
    field.focus();
  }
  function clear() {
    name.value = "";
    email.value = "";
    message.value = "";
  }
  // Without the server (or if it can't be reached) fall back to the
  // visitor's email app, as before.
  function byEmail(address, body) {
    window.location.href = "mailto:" + TO + "?subject=" + encodeURIComponent("Parents Go To: " + topic.value) + "&body=" + encodeURIComponent(body);
    result.textContent = "Your email app should open with the message ready to send. If it does not, email " + TO + " directly.";
    clear();
  }
  send.addEventListener("click", function() {
    if (sending) return;
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
    var body = message.value.trim() + "\n\n— " + name.value.trim() + " (" + address + ")";
    var Api = window.PTGApi;
    if (!Api || !Api.enabled) {
      return byEmail(address, body);
    }
    // Sent to the team's inbox in the admin console (Settings → Reports).
    sending = true;
    send.disabled = true;
    result.textContent = "Sending…";
    Api.post("/api/support", {
      id: "tk" + Date.now() + "-c",
      name: name.value.trim(),
      from: address,
      replyTo: address,
      area: "Contact page: " + topic.value,
      severity: "med",
      severityText: "Sent from the contact page",
      body: message.value.trim()
    }, {
      auth: false
    }).then(function(d) {
      sending = false;
      send.disabled = false;
      result.textContent = "Thanks — your message is with the team" + (d.item && d.item.ref ? " (reference " + d.item.ref + ")" : "") + ". We will reply to " + address + ".";
      clear();
    }, function(err) {
      sending = false;
      send.disabled = false;
      if (err && err.status && err.status < 500 && err.status !== 429) {
        return fail(message, Api.errorMessage(err));
      }
      byEmail(address, body);
    });
  });
  [name, email].forEach(function(field) {
    field.addEventListener("keydown", function(event) {
      if (event.key === "Enter") { event.preventDefault(); send.click(); }
    });
  });
})();
