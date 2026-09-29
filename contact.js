(function() {
  "use strict";
  var KEY = "ptg-support-v1";
  var MAX = 200;
  var EVENT = "ptg:contact";
  var CHANNEL = "ptg-contact";
  var NAME_MIN = 2;
  var BODY_MIN = 10;
  var BODY_MAX = 2e3;
  var AREA = "Message from the home page";
  function $(id) {
    return document.getElementById(id);
  }
  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }
  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
  }
  function read() {
    var raw;
    try {
      raw = JSON.parse(window.localStorage.getItem(KEY));
    } catch (e) {
      raw = null;
    }
    if (!raw || !isArray(raw.tickets)) {
      return [];
    }
    return raw.tickets;
  }
  function write(tickets) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        tickets: tickets.slice(0, MAX)
      }));
      return true;
    } catch (e) {
      return false;
    }
  }
  function fire() {
    var ev;
    try {
      ev = new window.Event(EVENT);
    } catch (e) {
      ev = document.createEvent("Event");
      ev.initEvent(EVENT, false, false);
    }
    window.dispatchEvent(ev);
  }
  var bc = null;
  try {
    if (window.BroadcastChannel) {
      bc = new window.BroadcastChannel(CHANNEL);
    }
  } catch (e) {
    bc = null;
  }
  function post() {
    if (bc) {
      try {
        bc.postMessage({
          t: "contact"
        });
      } catch (e) {}
    }
  }
  if (bc) {
    bc.onmessage = function() {
      fire();
    };
  }
  window.addEventListener("storage", function(e) {
    if (!e || e.key !== KEY) {
      return;
    }
    if (!bc) {
      fire();
    }
  });
  var Contact = {
    list: function() {
      return read().filter(function(t) {
        return t.source === "public";
      });
    },
    count: function() {
      return this.list().length;
    },
    send: function(rec) {
      var support = window.PTGSupport;
      var ticket, saved, i;
      if (!support || typeof support.add !== "function") {
        return null;
      }
      if (!write(read())) {
        return null;
      }
      ticket = support.add({
        from: String(rec.email || "").trim(),
        replyTo: String(rec.email || "").trim(),
        source: "public",
        name: String(rec.name || "").trim(),
        area: AREA,
        severity: "med",
        severityText: "Sent from the contact form on the home page",
        body: String(rec.body || "").trim(),
        diag: ""
      });
      if (!ticket || !ticket.id) {
        return null;
      }
      saved = read();
      for (i = 0; i < saved.length; i++) {
        if (saved[i].id === ticket.id) {
          fire();
          post();
          return ticket;
        }
      }
      return null;
    },
    onChange: function(fn) {
      window.addEventListener(EVENT, fn);
    }
  };
  window.PTGContact = Contact;
  function say(message) {
    var region = $("contactSay");
    if (region) {
      region.textContent = message;
    }
  }
  function setErr(id, on) {
    var el = $(id);
    if (el) {
      el.classList.toggle("is-on", !!on);
    }
  }
  function markInvalid(id, bad) {
    var el = $(id);
    if (!el) {
      return;
    }
    if (bad) {
      el.setAttribute("aria-invalid", "true");
    } else {
      el.removeAttribute("aria-invalid");
    }
  }
  function audit(what, who, detail) {
    if (window.PTGAudit) {
      window.PTGAudit.write("account", what, who || "system", detail || "");
    }
  }
  function headerClearance() {
    var bar = document.querySelector("#page-landing .site-header");
    var pos;
    if (!bar) {
      return 0;
    }
    pos = window.getComputedStyle(bar).position;
    if (pos !== "sticky" && pos !== "fixed") {
      return 0;
    }
    return bar.getBoundingClientRect().height;
  }
  function reveal(el) {
    if (!el || !el.getBoundingClientRect) {
      return;
    }
    var box = el.closest && el.closest(".field") || el;
    var top = box.getBoundingClientRect().top;
    if (top >= headerClearance() + 16) {
      return;
    }
    try {
      box.scrollIntoView({
        block: "start",
        behavior: "auto"
      });
    } catch (e) {
      box.scrollIntoView(true);
    }
  }
  function boot() {
    var form = $("contactForm");
    var done = $("contactDone");
    var doneRef = $("contactDoneRef");
    var fail = $("contactFail");
    if (!form) {
      return;
    }
    function watch(inputId, errId) {
      var el = $(inputId);
      if (!el) {
        return;
      }
      el.addEventListener("input", function() {
        if (el.getAttribute("aria-invalid") === "true") {
          markInvalid(inputId, false);
          setErr(errId, false);
        }
      });
    }
    watch("cf-name", "cf-nameErr");
    watch("cf-email", "cf-emailErr");
    watch("cf-message", "cf-messageErr");
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      if (fail) {
        fail.classList.remove("is-on");
      }
      var nameVal = String(($("cf-name") || {}).value || "").trim();
      var mailVal = String(($("cf-email") || {}).value || "").trim();
      var bodyVal = String(($("cf-message") || {}).value || "").trim();
      var nameBad = nameVal.length < NAME_MIN;
      var mailBad = !isEmail(mailVal);
      var bodyBad = bodyVal.length < BODY_MIN || bodyVal.length > BODY_MAX;
      setErr("cf-nameErr", nameBad);
      markInvalid("cf-name", nameBad);
      setErr("cf-emailErr", mailBad);
      markInvalid("cf-email", mailBad);
      setErr("cf-messageErr", bodyBad);
      markInvalid("cf-message", bodyBad);
      var bad = nameBad + mailBad + bodyBad;
      if (bad) {
        say(bad === 1 ? "One thing needs fixing before this can be saved." : bad + " things need fixing before this can be saved.");
        var first = form.querySelector('[aria-invalid="true"]');
        if (first) {
          reveal(first);
          first.focus();
        }
        return;
      }
      var ticket = Contact.send({
        name: nameVal,
        email: mailVal,
        body: bodyVal
      });
      if (!ticket) {
        if (fail) {
          fail.classList.add("is-on");
        }
        say("Your message could not be saved in this browser. Nothing has been kept.");
        if (fail) {
          reveal(fail);
          fail.focus();
        }
        return;
      }
      audit("Message sent from the contact form (" + ticket.ref + ")", nameVal + " <" + mailVal + ">", "Not signed in");
      if (window.PTGNotify) {
        window.PTGNotify.toAdmins({
          kind: "support",
          tone: "info",
          title: "New message from the home page — " + ticket.ref,
          body: "Sent by " + nameVal + " (" + mailVal + "), who is not signed in.",
          go: "settings",
          tag: "report-" + ticket.id
        });
      }
      if (doneRef) {
        doneRef.textContent = ticket.ref;
      }
      form.hidden = true;
      if (done) {
        done.hidden = false;
        reveal(done);
        done.focus();
      }
      say("Message saved in this browser. Your reference is " + ticket.ref + ".");
    });
    var again = $("contactAgain");
    if (again) {
      again.addEventListener("click", function() {
        form.reset();
        markInvalid("cf-name", false);
        markInvalid("cf-email", false);
        markInvalid("cf-message", false);
        setErr("cf-nameErr", false);
        setErr("cf-emailErr", false);
        setErr("cf-messageErr", false);
        if (fail) {
          fail.classList.remove("is-on");
        }
        if (done) {
          done.hidden = true;
        }
        form.hidden = false;
        var name = $("cf-name");
        if (name) {
          reveal(name);
          name.focus();
        }
        say("");
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
