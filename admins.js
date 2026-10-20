/*
 * Parents Go To — "Add an administrator" in the console's Accounts tab.
 * The new administrator gets an email with a link to choose their password
 * (PTGBackend.addAdmin -> POST /api/admin/admins).
 */
(function() {
  "use strict";
  function $(id) {
    return document.getElementById(id);
  }
  var button = $("admAddAdmin"), dialog = $("addAdminDialog"), form = $("addAdminForm");
  if (!button || !dialog || !form || !dialog.showModal) {
    return;
  }
  var opener = null;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function problem(text) {
    var p = $("aadmProblem");
    p.textContent = text || "";
    p.classList.toggle("is-on", !!text);
  }
  function badEmail(on) {
    $("aadmEmailErr").classList.toggle("is-on", !!on);
    if (on) {
      $("aadmEmail").setAttribute("aria-invalid", "true");
    } else {
      $("aadmEmail").removeAttribute("aria-invalid");
    }
  }
  function busy(on) {
    $("aadmSave").disabled = !!on;
    $("aadmSave").textContent = on ? "Sending…" : "Send the invitation";
  }
  function open() {
    opener = document.activeElement;
    form.reset();
    problem("");
    badEmail(false);
    busy(false);
    dialog.showModal();
    window.setTimeout(function() {
      $("aadmName").focus();
    }, 40);
  }
  function close() {
    if (dialog.open) {
      dialog.close();
    }
    if (opener && opener.focus && document.contains(opener)) {
      opener.focus();
    }
  }
  button.addEventListener("click", open);
  dialog.addEventListener("click", function(e) {
    if (e.target.closest && e.target.closest("[data-close]")) {
      e.preventDefault();
      close();
    }
  });
  $("aadmEmail").addEventListener("input", function() {
    if ($("aadmEmail").getAttribute("aria-invalid") === "true") {
      badEmail(!EMAIL.test($("aadmEmail").value.trim()));
    }
  });
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    var email = $("aadmEmail").value.trim();
    var name = $("aadmName").value.trim();
    if (!EMAIL.test(email)) {
      badEmail(true);
      $("aadmEmail").focus();
      return;
    }
    badEmail(false);
    problem("");
    if (!window.PTGBackend || !window.PTGBackend.addAdmin) {
      problem("The site cannot reach its database right now.");
      return;
    }
    busy(true);
    window.PTGBackend.addAdmin(email, name).then(function() {
      close();
      if (window.PTGSync && window.PTGSync.toast) {
        window.PTGSync.toast("Invitation sent to " + email + ". They choose a password from the email, then sign in as Administrator.", 7e3);
      }
      if (window.PTGAdmin && window.PTGAdmin.refresh) {
        window.PTGAdmin.refresh();
      }
    }, function(err) {
      busy(false);
      problem(err && err.message ? err.message : "That didn’t work. Try again.");
    });
  });
})();
