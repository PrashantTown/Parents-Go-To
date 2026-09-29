(function() {
  "use strict";
  var KEY = "ptg-family-v1";
  var EVENT = "ptg:family";
  var CHANNEL = "ptg-family";
  var MAX = 12;
  var NAME_MAX = 60;
  function $(id) {
    return document.getElementById(id);
  }
  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function read() {
    var raw;
    try {
      raw = JSON.parse(window.localStorage.getItem(KEY));
    } catch (e) {
      raw = null;
    }
    if (!raw || !isArray(raw.items)) {
      return [];
    }
    return raw.items;
  }
  function write(items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        items: items.slice(0, MAX)
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
  function token() {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "", i;
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new window.Uint8Array(8);
      window.crypto.getRandomValues(arr);
      for (i = 0; i < 8; i++) {
        out += abc.charAt(arr[i] % abc.length);
      }
    } else {
      for (i = 0; i < 8; i++) {
        out += abc.charAt(Math.floor(Math.random() * abc.length));
      }
    }
    return out;
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
          t: "family"
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
  function whoEmail() {
    var s = window.PTGSession;
    var mail = s && typeof s.email === "function" ? s.email() : "";
    return String(mail || "").trim().toLowerCase() || "guest";
  }
  function whoName() {
    var s = window.PTGSession;
    var name = s && typeof s.name === "function" ? s.name() : "";
    name = String(name || "").trim();
    return name || "The account holder";
  }
  function kids() {
    var app = window.PTGApp;
    var data = app && typeof app.data === "function" ? app.data() : null;
    return data && isArray(data.children) ? data.children : [];
  }
  function since(ts) {
    var secs = Math.floor((Date.now() - Number(ts || 0)) / 1e3);
    var mins, hours, days;
    if (secs < 60) {
      return "just now";
    }
    mins = Math.floor(secs / 60);
    if (mins < 60) {
      return mins + (mins === 1 ? " minute ago" : " minutes ago");
    }
    hours = Math.floor(mins / 60);
    if (hours < 24) {
      return hours + (hours === 1 ? " hour ago" : " hours ago");
    }
    days = Math.floor(hours / 24);
    if (days === 1) {
      return "yesterday";
    }
    if (days < 30) {
      return days + " days ago";
    }
    return "on " + stamp(ts);
  }
  function stamp(ts) {
    var d = new Date(Number(ts || 0));
    if (isNaN(d.getTime())) {
      return "";
    }
    try {
      return d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    } catch (e) {
      return d.toDateString();
    }
  }
  function initial(name) {
    var n = String(name || "").trim();
    return n ? n.charAt(0).toUpperCase() : "?";
  }
  function looksLikeEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
  }
  var Family = {
    list: function(owner) {
      var who = String(owner || "").trim().toLowerCase() || "guest";
      return read().filter(function(r) {
        return String(r.owner || "") === who;
      }).sort(function(a, b) {
        return b.at - a.at;
      });
    },
    active: function(owner) {
      return this.list(owner).filter(function(r) {
        return r.state === "invited" || r.state === "accepted";
      });
    },
    accepted: function(owner) {
      return this.list(owner).filter(function(r) {
        return r.state === "accepted";
      });
    },
    past: function(owner) {
      return this.list(owner).filter(function(r) {
        return r.state === "withdrawn";
      });
    },
    count: function(owner) {
      return this.active(owner).length;
    },
    find: function(id) {
      var all = read(), i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          return all[i];
        }
      }
      return null;
    },
    has: function(owner, email) {
      var mail = String(email || "").trim().toLowerCase();
      return this.active(owner).filter(function(r) {
        return String(r.email || "") === mail;
      }).length > 0;
    },
    full: function(owner) {
      return this.count(owner) >= MAX;
    },
    limit: MAX,
    invite: function(rec) {
      var all = read();
      var row = {
        id: "fam-" + token(),
        ref: "PTG-F" + token().slice(0, 4).toUpperCase(),
        owner: String(rec.owner || "").trim().toLowerCase() || "guest",
        name: String(rec.name || "").trim(),
        email: String(rec.email || "").trim().toLowerCase(),
        role: "carer",
        state: "invited",
        by: String(rec.by || "").trim().toLowerCase(),
        byName: String(rec.byName || ""),
        at: Date.now(),
        acceptedAt: null,
        withdrawnAt: null,
        withdrawnBy: ""
      };
      all.unshift(row);
      if (!write(all)) {
        return null;
      }
      fire();
      post();
      return row;
    },
    accept: function(id) {
      var all = read(), hit = null, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id && all[i].state === "invited") {
          all[i].state = "accepted";
          all[i].acceptedAt = Date.now();
          hit = all[i];
          break;
        }
      }
      if (!hit) {
        return null;
      }
      if (!write(all)) {
        return null;
      }
      fire();
      post();
      return hit;
    },
    withdraw: function(id, by) {
      var all = read(), hit = false, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i].state = "withdrawn";
          all[i].withdrawnAt = Date.now();
          all[i].withdrawnBy = String(by || "");
          hit = true;
          break;
        }
      }
      if (!hit) {
        return false;
      }
      if (!write(all)) {
        return false;
      }
      fire();
      post();
      return true;
    },
    onChange: function(fn) {
      window.addEventListener(EVENT, fn);
    }
  };
  window.PTGFamily = Family;
  function say(message) {
    var region = $("famSay");
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
  function audit(what, detail) {
    if (window.PTGAudit) {
      window.PTGAudit.write("account", what, whoEmail(), detail || "");
    }
  }
  function memberCard(r) {
    return '<article class="profile profile--carer">' + '<div class="profile-top">' + '<span class="avatar avatar--lg fam-avatar" aria-hidden="true">' + esc(initial(r.name)) + "</span>" + '<div><div class="nm">' + esc(r.name) + "</div>" + '<span class="role">Carer &middot; invited ' + esc(since(r.at)) + "</span></div>" + "</div>" + "<dl>" + "<dt>Invited as</dt><dd>" + esc(r.email) + "</dd>" + "<dt>Invited by</dt><dd>" + esc(r.byName || r.by || "the account holder") + "</dd>" + "<dt>Reference</dt><dd>" + esc(r.ref) + "</dd>" + "</dl>" + '<p class="fam-state"><span class="pill pill--pending">Invited</span>' + "<span>They can see this shelf until you withdraw access.</span></p>" + '<div class="acts">' + '<button class="btn btn--danger btn--sm" type="button" data-fam-wd="' + esc(r.id) + '">' + 'Withdraw access<span class="vh"> for ' + esc(r.name) + "</span></button>" + "</div>" + "</article>";
  }
  function pastRow(r) {
    return "<li>" + "<b>" + esc(r.name) + "</b> · " + esc(r.email) + '<span class="fam-past-when">Access withdrawn ' + esc(since(r.withdrawnAt)) + "</span>" + "</li>";
  }
  function renderFamily() {
    var box = $("famList");
    if (!box) {
      return;
    }
    var owner = whoEmail();
    var live = Family.active(owner);
    var gone = Family.past(owner);
    var count = $("famCount");
    if (count) {
      count.textContent = live.length ? live.length + (live.length === 1 ? " other adult" : " other adults") + " on this shelf" : "Nobody else has been added to this shelf";
    }
    box.innerHTML = live.map(memberCard).join("");
    box.hidden = !live.length;
    var empty = $("famEmpty");
    if (empty) {
      empty.hidden = !!live.length;
    }
    var pastWrap = $("famPastWrap");
    var pastList = $("famPast");
    if (pastList) {
      pastList.innerHTML = gone.map(pastRow).join("");
    }
    if (pastWrap) {
      pastWrap.hidden = !gone.length;
    }
    var full = $("famFull");
    var add = $("famAdd");
    if (full) {
      full.hidden = !Family.full(owner);
    }
    if (add) {
      add.hidden = Family.full(owner);
    }
  }
  var openedBy = null;
  function openDialog(dlg) {
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === "function") {
      dlg.close();
    } else {
      dlg.removeAttribute("open");
    }
  }
  function restoreFocus() {
    var t = openedBy;
    openedBy = null;
    if (t && t.focus) {
      try {
        t.focus();
      } catch (e) {}
    }
  }
  function paintWhatTheySee() {
    var box = $("famSees");
    if (!box) {
      return;
    }
    var names = kids().map(function(k) {
      return String(k.name || "").trim();
    }).filter(Boolean);
    if (!names.length) {
      box.innerHTML = "There are no children on this shelf yet, so there is nothing " + "about a child for them to see. If you add one later, they will see that child.";
      return;
    }
    box.innerHTML = "They will see " + (names.length === 1 ? "your child " : "your children ") + "<b>" + names.map(esc).join("</b>, <b>") + "</b> by name, with " + (names.length === 1 ? "their age and reading level" : "their ages and reading levels") + ", and everything on the shelf. Everywhere else in this app that stays inside " + "your account.";
  }
  function resetInviteForm() {
    var f = $("famForm");
    var wrap = $("famDoneWrap");
    var done = $("famDone");
    if (f) {
      f.hidden = false;
      f.reset();
    }
    if (wrap) {
      wrap.hidden = true;
    }
    if (done) {
      done.className = "cf-panel";
      done.innerHTML = "";
    }
    setErr("famNameErr", false);
    setErr("famEmailErr", false);
    setErr("famDupeErr", false);
    markInvalid("famName", false);
    markInvalid("famEmail", false);
  }
  function showConfirmation(row) {
    var f = $("famForm");
    var wrap = $("famDoneWrap");
    var done = $("famDone");
    if (!done) {
      return;
    }
    if (f) {
      f.hidden = true;
    }
    done.innerHTML = '<p class="cf-badge">' + '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + '<path d="m4.4 10.4 3.6 3.6 7.6-8"/></svg> Recorded</p>' + "<h3>" + esc(row.name) + " is on your Profiles tab</h3>" + "<p>They are listed as a carer on this shelf, and you can withdraw that at any " + "time from the card.</p>" + '<p class="cf-ref">' + esc(row.ref) + "</p>";
    if (wrap) {
      wrap.hidden = false;
    }
    try {
      done.focus();
    } catch (e) {}
  }
  function bootInvite() {
    var dlg = $("familyDialog");
    var form = $("famForm");
    var add = $("famAdd");
    if (add && dlg) {
      add.addEventListener("click", function() {
        openedBy = add;
        resetInviteForm();
        paintWhatTheySee();
        openDialog(dlg);
        window.setTimeout(function() {
          var el = $("famName");
          if (el) {
            el.focus();
          }
        }, 40);
      });
    }
    var name = $("famName");
    var mail = $("famEmail");
    if (name) {
      name.addEventListener("input", function() {
        if (name.getAttribute("aria-invalid") === "true") {
          markInvalid("famName", false);
          setErr("famNameErr", false);
        }
      });
    }
    if (mail) {
      mail.addEventListener("input", function() {
        if (mail.getAttribute("aria-invalid") === "true") {
          markInvalid("famEmail", false);
          setErr("famEmailErr", false);
          setErr("famDupeErr", false);
        }
      });
    }
    if (form) {
      form.addEventListener("submit", function(e) {
        e.preventDefault();
        var owner = whoEmail();
        var nameVal = String((name || {}).value || "").trim();
        var mailVal = String((mail || {}).value || "").trim().toLowerCase();
        var badName = !nameVal || nameVal.length > NAME_MAX;
        var badMail = !looksLikeEmail(mailVal);
        var dupe = !badMail && Family.has(owner, mailVal);
        var self = !badMail && mailVal === owner;
        setErr("famNameErr", badName);
        markInvalid("famName", badName);
        setErr("famEmailErr", badMail);
        setErr("famDupeErr", dupe || self);
        markInvalid("famEmail", badMail || dupe || self);
        if (dupe || self) {
          var note = $("famDupeErr");
          if (note) {
            note.textContent = self ? "That is the address this account signs in with, so it already has access." : "Somebody with that address is already on this shelf.";
          }
        }
        if (badName || badMail || dupe || self) {
          if (badName && name) {
            name.focus();
          } else if (mail) {
            mail.focus();
          }
          return;
        }
        if (Family.full(owner)) {
          setErr("famDupeErr", true);
          var full = $("famDupeErr");
          if (full) {
            full.textContent = "This shelf already has " + Family.limit + " other adults on it, which is the most it can hold.";
          }
          return;
        }
        var row = Family.invite({
          owner: owner,
          name: nameVal,
          email: mailVal,
          by: owner,
          byName: whoName()
        });
        if (!row) {
          var f2 = $("famForm");
          var wrap2 = $("famDoneWrap");
          var done = $("famDone");
          if (f2) {
            f2.hidden = true;
          }
          if (done) {
            done.className = "cf-panel cf-fail";
            done.innerHTML = '<p class="cf-badge">' + '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" ' + 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' + 'stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.4"/>' + '<path d="M10 6.2v4.4M10 13.6v.1"/></svg> Not saved</p>' + "<h3>This browser would not store it</h3>" + "<p>Nothing has been kept, and there is no reference number. " + "Nobody has been added to your shelf.</p>";
            if (wrap2) {
              wrap2.hidden = false;
            }
            try {
              done.focus();
            } catch (e) {}
          }
          return;
        }
        audit("Invited another adult to the family shelf", row.name + " — reference " + row.ref);
        renderFamily();
        showConfirmation(row);
        say(row.name + " has been added to your Profiles tab as a carer.");
      });
    }
    if (dlg) {
      dlg.addEventListener("close", restoreFocus);
      dlg.addEventListener("click", function(e) {
        if (e.target.closest && e.target.closest("[data-close]")) {
          window.setTimeout(restoreFocus, 0);
        }
      });
      trapFallback(dlg);
    }
  }
  var pulling = null;
  var pullTrigger = null;
  function bootWithdraw() {
    var list = $("famList");
    var dlg = $("familyWithdrawDialog");
    var form = $("familyWithdrawForm");
    if (list) {
      list.addEventListener("click", function(e) {
        var t = e.target;
        if (!t || !t.closest) {
          return;
        }
        var wd = t.closest("[data-fam-wd]");
        if (!wd || !dlg) {
          return;
        }
        pulling = Family.find(wd.getAttribute("data-fam-wd"));
        pullTrigger = wd;
        if (!pulling) {
          return;
        }
        var who = $("famwWho");
        if (who) {
          who.textContent = pulling.name + " (" + pulling.email + ")";
        }
        openDialog(dlg);
        window.setTimeout(function() {
          var cancel = dlg.querySelector("[data-close]");
          if (cancel) {
            cancel.focus();
          }
        }, 40);
      });
    }
    if (form) {
      form.addEventListener("submit", function() {
        if (!pulling) {
          return;
        }
        var name = pulling.name;
        if (!Family.withdraw(pulling.id, whoEmail())) {
          say("This browser would not store that change. " + name + " still has access as far as this shelf is concerned.");
          pulling = null;
          return;
        }
        audit("Withdrew another adult's access to the family shelf", name + " — reference " + pulling.ref);
        pulling = null;
        renderFamily();
        say(name + " no longer has access to this shelf. They are listed under " + "people who used to have access.");
      });
    }
    if (dlg) {
      dlg.addEventListener("close", function() {
        var t = pullTrigger;
        pullTrigger = null;
        if (t && document.contains(t) && t.focus) {
          try {
            t.focus();
          } catch (e) {}
          return;
        }
        var back = $("famAdd") && !$("famAdd").hidden ? $("famAdd") : $("h-family");
        if (back && back.focus) {
          try {
            back.focus();
          } catch (e) {}
        }
      });
      trapFallback(dlg);
    }
  }
  function trapFallback(dlg) {
    document.addEventListener("keydown", function(e) {
      if (!dlg.hasAttribute("open")) {
        return;
      }
      if (typeof dlg.showModal === "function") {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog(dlg);
        restoreFocus();
        return;
      }
      if (e.key !== "Tab") {
        return;
      }
      var f = dlg.querySelectorAll("a[href], button:not([disabled]), " + "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), " + '[tabindex]:not([tabindex="-1"])');
      if (!f.length) {
        return;
      }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }
  function watch(id, fn) {
    var el = $(id);
    if (!el || !window.MutationObserver) {
      return;
    }
    var obs = new window.MutationObserver(function() {
      if (!el.hidden) {
        fn();
      }
    });
    obs.observe(el, {
      attributes: true,
      attributeFilter: [ "hidden" ]
    });
  }
  function boot() {
    bootInvite();
    bootWithdraw();
    renderFamily();
    Family.onChange(renderFamily);
    watch("panel-profiles", renderFamily);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
