(function() {
  "use strict";
  var KEY = "ptg-board-v1";
  var MAX = 200;
  var EVENT = "ptg:board";
  var CHANNEL = "ptg-board";
  var BODY_MIN = 10;
  var BODY_MAX = 600;
  var AGE_BANDS = [ "0–3", "3–5", "5–7", "7–9", "9–12", "12+" ];
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
          t: "board"
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
    return name || "A parent";
  }
  function isAdmin() {
    var s = window.PTGSession;
    return !!(s && typeof s.role === "function" && s.role() === "admin");
  }
  function me() {
    var s = window.PTGSession;
    return s && typeof s.email === "function" && s.email() || "administrator";
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
  function seed() {
    return;
  }
  var Board = {
    list: function() {
      return read().sort(function(a, b) {
        return b.at - a.at;
      });
    },
    mine: function(email) {
      var who = String(email || "").trim().toLowerCase() || "guest";
      return read().filter(function(r) {
        return String(r.owner || "") === who;
      });
    },
    visibleTo: function(email) {
      var who = String(email || "").trim().toLowerCase() || "guest";
      return read().filter(function(r) {
        if (r.state === "published") {
          return true;
        }
        return String(r.owner || "") === who;
      }).sort(function(a, b) {
        return b.at - a.at;
      });
    },
    pending: function() {
      return read().filter(function(r) {
        return r.state === "pending";
      });
    },
    countPending: function() {
      return this.pending().length;
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
    add: function(rec) {
      var all = read();
      var row = {
        id: "bd-" + token(),
        from: String(rec.from || "A parent"),
        owner: String(rec.owner || "").trim().toLowerCase() || "guest",
        body: String(rec.body || "").trim(),
        ages: String(rec.ages || ""),
        at: Date.now(),
        state: "pending",
        reason: "",
        decidedBy: "",
        decidedAt: null,
        parentId: String(rec.parentId || "")
      };
      all.unshift(row);
      if (!write(all)) {
        return null;
      }
      fire();
      post();
      return row;
    },
    decide: function(id, state, reason, by) {
      var all = read(), hit = false, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i].state = state;
          all[i].reason = state === "removed" ? String(reason || "") : "";
          all[i].decidedBy = state === "pending" ? "" : String(by || "");
          all[i].decidedAt = state === "pending" ? null : Date.now();
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
  window.PTGBoard = Board;
  function initSwitch(box, onPick) {
    if (!box) {
      return;
    }
    var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
    if (!tabs.length) {
      return;
    }
    function select(tab, moveFocus) {
      tabs.forEach(function(t) {
        var on = t === tab;
        var panel = $(t.getAttribute("aria-controls"));
        t.setAttribute("aria-selected", on ? "true" : "false");
        if (on) {
          t.removeAttribute("tabindex");
        } else {
          t.setAttribute("tabindex", "-1");
        }
        if (panel) {
          panel.hidden = !on;
        }
      });
      if (moveFocus) {
        tab.focus();
      }
      if (onPick) {
        onPick(tab);
      }
    }
    box.addEventListener("click", function(e) {
      var tab = e.target.closest ? e.target.closest('[role="tab"]') : null;
      if (tab && tabs.indexOf(tab) !== -1) {
        select(tab, false);
      }
    });
    box.addEventListener("keydown", function(e) {
      var at = tabs.indexOf(document.activeElement);
      if (at === -1) {
        return;
      }
      var next = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = (at + 1) % tabs.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = (at - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = tabs.length - 1;
      }
      if (next !== -1) {
        e.preventDefault();
        tabs[next].focus();
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        select(tabs[at], false);
      }
    });
  }
  function say(message) {
    var region = $("bdSay");
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
      window.PTGAudit.write("moderation", what, me(), detail || "");
    }
  }
  function statePill(state) {
    if (state === "pending") {
      return '<span class="pill pill--pending">Awaiting review</span>';
    }
    if (state === "removed") {
      return '<span class="pill pill--rejected">Removed</span>';
    }
    return "";
  }
  function replyHtml(r, who) {
    var own = String(r.owner || "") === who;
    var why = r.state === "removed" && r.reason ? '<p class="bd-why"><b>Why it was removed:</b> ' + esc(r.reason) + "</p>" : "";
    return '<li class="bd-reply' + (r.state !== "published" ? " is-quiet" : "") + '">' + '<p class="bd-meta"><b>' + esc(r.from) + "</b> · " + '<span title="' + esc(stamp(r.at)) + '">' + esc(since(r.at)) + "</span>" + (own && r.state !== "published" ? " " + statePill(r.state) : "") + "</p>" + '<p class="bd-body">' + esc(r.body) + "</p>" + why + "</li>";
  }
  function postHtml(r, replies, who) {
    var own = String(r.owner || "") === who;
    var why = r.state === "removed" && r.reason ? '<p class="bd-why"><b>Why it was removed:</b> ' + esc(r.reason) + "</p>" : "";
    var band = r.ages ? ' · <span class="bd-band">Ages ' + esc(r.ages) + "</span>" : "";
    var kids = replies.map(function(x) {
      return replyHtml(x, who);
    }).join("");
    var acts = r.state === "published" ? '<div class="bd-acts">' + '<button class="btn btn--quiet btn--sm" type="button" data-bd-reply="' + esc(r.id) + '">' + 'Reply<span class="vh"> to the post from ' + esc(r.from) + "</span></button>" + '<button class="btn btn--quiet btn--sm" type="button" data-bd-report="' + esc(r.id) + '">' + 'Report this post<span class="vh"> from ' + esc(r.from) + "</span></button>" + "</div>" : "";
    return '<article class="bd-post' + (r.state !== "published" ? " is-quiet" : "") + '">' + '<p class="bd-meta"><b>' + esc(r.from) + "</b> · " + '<span title="' + esc(stamp(r.at)) + '">' + esc(since(r.at)) + "</span>" + band + (own && r.state !== "published" ? " " + statePill(r.state) : "") + "</p>" + '<p class="bd-body">' + esc(r.body) + "</p>" + why + (kids ? '<ul class="bd-replies">' + kids + "</ul>" : "") + acts + '<div class="bd-slot" id="bdslot-' + esc(r.id) + '"></div>' + "</article>";
  }
  function renderBoard() {
    var list = $("bdList");
    var empty = $("bdEmpty");
    var count = $("bdCount");
    if (!list) {
      return;
    }
    var who = whoEmail();
    var all = Board.visibleTo(who);
    var tops = all.filter(function(r) {
      return !r.parentId;
    });
    var byParent = {};
    all.forEach(function(r) {
      if (!r.parentId) {
        return;
      }
      if (!byParent[r.parentId]) {
        byParent[r.parentId] = [];
      }
      byParent[r.parentId].push(r);
    });
    Object.keys(byParent).forEach(function(k) {
      byParent[k].sort(function(a, b) {
        return a.at - b.at;
      });
    });
    if (count) {
      var live = tops.filter(function(r) {
        return r.state === "published";
      }).length;
      var waiting = tops.filter(function(r) {
        return r.state === "pending";
      }).length;
      count.textContent = live + (live === 1 ? " message" : " messages") + (waiting ? " · " + waiting + " of yours awaiting review" : "");
    }
    list.innerHTML = tops.map(function(r) {
      return postHtml(r, byParent[r.id] || [], who);
    }).join("");
    list.hidden = !tops.length;
    if (empty) {
      empty.hidden = !!tops.length;
    }
  }
  function countChars() {
    var box = $("bdBody"), out = $("bdChars");
    if (!box || !out) {
      return 0;
    }
    var n = box.value.length;
    out.textContent = n + " of " + BODY_MAX + " characters";
    out.classList.toggle("is-over", n > BODY_MAX);
    return n;
  }
  function closeSlots(except) {
    var slots = document.querySelectorAll(".bd-slot");
    [].slice.call(slots).forEach(function(s) {
      if (s !== except) {
        s.innerHTML = "";
        s.removeAttribute("data-bd-from");
      }
    });
  }
  function replyForm(id) {
    return '<form class="bd-sub" data-bd-replyform="' + esc(id) + '" novalidate>' + '<label for="bdReplyBody">Your reply</label>' + '<textarea id="bdReplyBody" rows="3" maxlength="' + BODY_MAX + '" ' + 'aria-describedby="bdReplyHint"></textarea>' + '<p class="bd-hint" id="bdReplyHint">Held for review before anyone else sees it. ' + "Please do not include a child’s name.</p>" + '<p class="err" id="bdReplyErr">Write at least ' + BODY_MIN + " characters so there is something to review.</p>" + '<div class="bd-sub-foot">' + '<button class="btn btn--quiet btn--sm" type="button" data-bd-cancel>Cancel</button>' + '<button class="btn btn--primary btn--sm" type="submit">Send for review</button>' + "</div></form>";
  }
  function reportForm(id) {
    return '<form class="bd-sub" data-bd-reportform="' + esc(id) + '" novalidate>' + '<label for="bdReportWhy">Why are you reporting this?</label>' + '<select id="bdReportWhy">' + '<option value="It includes information about a child">It includes information about a child</option>' + '<option value="It is unkind or personal">It is unkind or personal</option>' + '<option value="It is advertising something">It is advertising something</option>' + '<option value="It is not about reading">It is not about reading</option>' + '<option value="other">Something else — I’ll write it below</option>' + "</select>" + '<div class="bd-sub-other" id="bdReportOtherWrap" hidden>' + '<label for="bdReportOther">Your reason</label>' + '<textarea id="bdReportOther" rows="2" maxlength="400"></textarea>' + '<p class="err" id="bdReportOtherErr">Write the reason so it can be acted on.</p>' + "</div>" + '<p class="bd-hint">This goes to an administrator as a report, in the same queue ' + "a support message goes into. The post stays visible until somebody decides.</p>" + '<div class="bd-sub-foot">' + '<button class="btn btn--quiet btn--sm" type="button" data-bd-cancel>Cancel</button>' + '<button class="btn btn--primary btn--sm" type="submit">Send the report</button>' + "</div></form>";
  }
  function submitPost(bodyVal, ages) {
    var row = Board.add({
      from: whoName(),
      owner: whoEmail(),
      body: bodyVal,
      ages: ages,
      parentId: ""
    });
    return row;
  }
  function notifyAdmins(row, isReply) {
    if (!window.PTGNotify) {
      return;
    }
    window.PTGNotify.toAdmins({
      kind: "moderation",
      tone: "info",
      title: isReply ? "New board reply to review" : "New board post to review",
      body: "A message from " + row.from + " is waiting in the moderation queue.",
      go: "moderation",
      tag: "queue"
    });
  }
  function bootParent() {
    var form = $("bdForm");
    if (!form) {
      return;
    }
    var box = $("bdBody");
    if (box) {
      box.addEventListener("input", function() {
        countChars();
        if (box.getAttribute("aria-invalid") === "true") {
          markInvalid("bdBody", false);
          setErr("bdBodyErr", false);
        }
      });
      countChars();
    }
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var bodyVal = String((box || {}).value || "").trim();
      var ages = String(($("bdAge") || {}).value || "");
      var bad = bodyVal.length < BODY_MIN || bodyVal.length > BODY_MAX;
      setErr("bdBodyErr", bad);
      markInvalid("bdBody", bad);
      if (bad) {
        say("Your message needs fixing before it can be sent.");
        if (box) {
          box.focus();
        }
        return;
      }
      var row = submitPost(bodyVal, ages);
      if (!row) {
        say("This browser is blocking local storage, so your message was not saved. " + "Nothing has been kept and nobody will see it.");
        return;
      }
      if (box) {
        box.value = "";
      }
      countChars();
      audit("Posted to the message board", "Held for review");
      notifyAdmins(row, false);
      renderBoard();
      say("Sent for review. Nobody else can see it until an administrator publishes it. " + "You will find it below, marked as awaiting review.");
    });
    var list = $("bdList");
    if (!list) {
      return;
    }
    list.addEventListener("click", function(e) {
      var t = e.target;
      if (!t || !t.closest) {
        return;
      }
      var cancel = t.closest("[data-bd-cancel]");
      if (cancel) {
        var slot = cancel.closest(".bd-slot");
        var from = slot ? slot.getAttribute("data-bd-from") : "";
        var backTo = slot ? slot.parentNode.querySelector(from === "report" ? "[data-bd-report]" : "[data-bd-reply]") : null;
        closeSlots(null);
        if (backTo) {
          backTo.focus();
        }
        say("");
        return;
      }
      var rep = t.closest("[data-bd-reply]");
      if (rep) {
        var rid = rep.getAttribute("data-bd-reply");
        var rslot = $("bdslot-" + rid);
        if (!rslot) {
          return;
        }
        if (rslot.querySelector("[data-bd-replyform]")) {
          closeSlots(null);
          rep.focus();
          return;
        }
        closeSlots(rslot);
        rslot.setAttribute("data-bd-from", "reply");
        rslot.innerHTML = replyForm(rid);
        var rbox = $("bdReplyBody");
        if (rbox) {
          rbox.focus();
        }
        return;
      }
      var rpt = t.closest("[data-bd-report]");
      if (rpt) {
        var pid = rpt.getAttribute("data-bd-report");
        var pslot = $("bdslot-" + pid);
        if (!pslot) {
          return;
        }
        if (pslot.querySelector("[data-bd-reportform]")) {
          closeSlots(null);
          rpt.focus();
          return;
        }
        closeSlots(pslot);
        pslot.setAttribute("data-bd-from", "report");
        pslot.innerHTML = reportForm(pid);
        var sel = $("bdReportWhy");
        if (sel) {
          sel.focus();
        }
      }
    });
    list.addEventListener("change", function(e) {
      var t = e.target;
      if (!t || t.id !== "bdReportWhy") {
        return;
      }
      var other = t.value === "other";
      var wrap = $("bdReportOtherWrap");
      if (wrap) {
        wrap.hidden = !other;
      }
      if (other) {
        var el = $("bdReportOther");
        if (el) {
          el.focus();
        }
      }
    });
    list.addEventListener("submit", function(e) {
      var f = e.target;
      if (!f || !f.getAttribute) {
        return;
      }
      if (f.getAttribute("data-bd-replyform")) {
        e.preventDefault();
        sendReply(f);
        return;
      }
      if (f.getAttribute("data-bd-reportform")) {
        e.preventDefault();
        sendReport(f);
      }
    });
  }
  function sendReply(f) {
    var id = f.getAttribute("data-bd-replyform");
    var el = $("bdReplyBody");
    var val = String((el || {}).value || "").trim();
    var bad = val.length < BODY_MIN || val.length > BODY_MAX;
    setErr("bdReplyErr", bad);
    markInvalid("bdReplyBody", bad);
    if (bad) {
      say("Your reply needs fixing before it can be sent.");
      if (el) {
        el.focus();
      }
      return;
    }
    var row = Board.add({
      from: whoName(),
      owner: whoEmail(),
      body: val,
      ages: "",
      parentId: id
    });
    if (!row) {
      say("This browser is blocking local storage, so your reply was not saved.");
      return;
    }
    audit("Replied on the message board", "Held for review");
    notifyAdmins(row, true);
    closeSlots(null);
    renderBoard();
    say("Reply sent for review. It appears under the message once an administrator publishes it.");
    var back = $("bdList");
    if (back) {
      var again = back.querySelector('[data-bd-reply="' + id + '"]');
      if (again) {
        again.focus();
      }
    }
  }
  function sendReport(f) {
    var id = f.getAttribute("data-bd-reportform");
    var sel = $("bdReportWhy");
    var pick = String((sel || {}).value || "");
    var other = String(($("bdReportOther") || {}).value || "").trim();
    var reason = pick === "other" ? other : pick;
    if (pick === "other" && other.length < 4) {
      setErr("bdReportOtherErr", true);
      markInvalid("bdReportOther", true);
      say("Write the reason before sending the report.");
      var el = $("bdReportOther");
      if (el) {
        el.focus();
      }
      return;
    }
    setErr("bdReportOtherErr", false);
    markInvalid("bdReportOther", false);
    var target = Board.find(id);
    var support = window.PTGSupport;
    if (!support || typeof support.add !== "function") {
      say("Reporting is unavailable right now. Nothing has been sent.");
      return;
    }
    var ticket = support.add({
      from: whoEmail(),
      replyTo: whoEmail(),
      source: "parent",
      name: whoName(),
      area: "Report about a message board post",
      severity: "med",
      severityText: "Reported from the message board",
      body: reason + "\n\nThe post being reported, by " + (target ? target.from : "an unknown author") + ":\n" + (target ? target.body : "(the post could not be found)"),
      diag: "board-post:" + id
    });
    var saved = false;
    if (ticket && ticket.id) {
      support.list().forEach(function(t) {
        if (t.id === ticket.id) {
          saved = true;
        }
      });
    }
    if (!saved) {
      say("This browser would not store the report. Nothing has been sent.");
      return;
    }
    audit("Reported a message board post", "Reference " + ticket.ref);
    if (window.PTGNotify) {
      window.PTGNotify.toAdmins({
        kind: "support",
        tone: "warn",
        title: "A board post was reported — " + ticket.ref,
        body: reason,
        go: "settings",
        tag: "report-" + ticket.id
      });
    }
    closeSlots(null);
    say("Report sent. Your reference is " + ticket.ref + ".");
    var back = $("bdList");
    if (back) {
      var again = back.querySelector('[data-bd-report="' + id + '"]');
      if (again) {
        again.focus();
      }
    }
  }
  function admSay(message) {
    var region = $("admBoardSay");
    if (region) {
      region.textContent = message;
    }
  }
  function admStatePill(state) {
    if (state === "pending") {
      return '<span class="pill pill--pending">Waiting</span>';
    }
    if (state === "published") {
      return '<span class="pill pill--approved">Published</span>';
    }
    return '<span class="pill pill--rejected">Removed</span>';
  }
  function admRow(r) {
    var verdict = "";
    if (r.state === "published" && r.decidedBy) {
      verdict = '<p class="bd-verdict"><b>Published</b> by ' + esc(r.decidedBy) + " " + esc(since(r.decidedAt).toLowerCase()) + "</p>";
    } else if (r.state === "removed") {
      verdict = '<p class="bd-verdict"><b>Removed</b> by ' + esc(r.decidedBy) + " " + esc(since(r.decidedAt).toLowerCase()) + (r.reason ? " — " + esc(r.reason) : "") + "</p>";
    }
    var acts = '<div class="bd-acts">';
    if (r.state !== "published") {
      acts += '<button class="btn btn--primary btn--sm" type="button" data-bdadm-pub="' + esc(r.id) + '">Publish<span class="vh"> the message from ' + esc(r.from) + "</span></button>";
    }
    if (r.state !== "removed") {
      acts += '<button class="btn btn--danger btn--sm" type="button" data-bdadm-rm="' + esc(r.id) + '">Remove<span class="vh"> the message from ' + esc(r.from) + "</span></button>";
    }
    if (r.state !== "pending") {
      acts += '<button class="btn btn--quiet btn--sm" type="button" data-bdadm-back="' + esc(r.id) + '">Put back in the queue<span class="vh"> — the message from ' + esc(r.from) + "</span></button>";
    }
    acts += "</div>";
    var band = r.ages ? " · Ages " + esc(r.ages) : "";
    var kind = r.parentId ? " · a reply" : "";
    return '<article class="bd-adm">' + '<p class="bd-meta">' + admStatePill(r.state) + " <b>" + esc(r.from) + "</b> · " + '<span title="' + esc(stamp(r.at)) + '">' + esc(since(r.at)) + "</span>" + band + kind + "</p>" + '<blockquote class="bd-quote">' + esc(r.body) + "</blockquote>" + verdict + acts + "</article>";
  }
  function renderAdmin() {
    var list = $("admBoardList");
    if (!list) {
      return;
    }
    var pick = String(($("admBoardState") || {}).value || "pending");
    var all = Board.list();
    var rows = pick ? all.filter(function(r) {
      return r.state === pick;
    }) : all;
    var count = $("admBoardCount");
    if (count) {
      count.textContent = rows.length + (rows.length === 1 ? " message" : " messages") + (pick === "pending" ? " waiting for review" : " in this part of the queue");
    }
    list.innerHTML = rows.map(admRow).join("");
    list.hidden = !rows.length;
    var empty = $("admBoardEmpty");
    if (empty) {
      empty.classList.toggle("is-on", !rows.length);
    }
    var badge = $("admBoardPending");
    if (badge) {
      var n = Board.countPending();
      badge.textContent = n ? String(n) : "";
      badge.hidden = !n;
    }
  }
  var removing = null;
  var removeTrigger = null;
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
    var t = removeTrigger;
    removeTrigger = null;
    if (t && t.focus) {
      try {
        t.focus();
      } catch (e) {}
    }
  }
  function bootAdmin() {
    var list = $("admBoardList");
    var filter = $("admBoardState");
    var dlg = $("boardRemoveDialog");
    var form = $("boardRemoveForm");
    if (filter) {
      filter.addEventListener("change", renderAdmin);
    }
    if (list) {
      list.addEventListener("click", function(e) {
        var t = e.target;
        if (!t || !t.closest) {
          return;
        }
        var pub = t.closest("[data-bdadm-pub]");
        if (pub) {
          decideFromConsole(pub.getAttribute("data-bdadm-pub"), "published", "");
          return;
        }
        var back = t.closest("[data-bdadm-back]");
        if (back) {
          decideFromConsole(back.getAttribute("data-bdadm-back"), "pending", "");
          return;
        }
        var rm = t.closest("[data-bdadm-rm]");
        if (rm && dlg) {
          removing = Board.find(rm.getAttribute("data-bdadm-rm"));
          removeTrigger = rm;
          if (!removing) {
            return;
          }
          var what = $("bdrWhat");
          if (what) {
            what.textContent = removing.body;
          }
          var sel = $("bdrReason");
          if (sel) {
            sel.selectedIndex = 0;
          }
          var wrap = $("bdrOtherWrap");
          if (wrap) {
            wrap.hidden = true;
          }
          var other = $("bdrOther");
          if (other) {
            other.value = "";
          }
          setErr("bdrOtherErr", false);
          markInvalid("bdrOther", false);
          openDialog(dlg);
          window.setTimeout(function() {
            if (sel) {
              sel.focus();
            }
          }, 40);
        }
      });
    }
    var reasonSel = $("bdrReason");
    if (reasonSel) {
      reasonSel.addEventListener("change", function() {
        var other = reasonSel.value === "other";
        var wrap = $("bdrOtherWrap");
        if (wrap) {
          wrap.hidden = !other;
        }
        if (other) {
          var el = $("bdrOther");
          if (el) {
            el.focus();
          }
        }
      });
    }
    if (form) {
      form.addEventListener("submit", function(e) {
        if (!removing) {
          return;
        }
        var pick = String(($("bdrReason") || {}).value || "");
        var other = String(($("bdrOther") || {}).value || "").trim();
        var reason = pick === "other" ? other : pick;
        if (pick === "other" && other.length < 4) {
          e.preventDefault();
          setErr("bdrOtherErr", true);
          markInvalid("bdrOther", true);
          var el = $("bdrOther");
          if (el) {
            el.focus();
          }
          return;
        }
        setErr("bdrOtherErr", false);
        markInvalid("bdrOther", false);
        decideFromConsole(removing.id, "removed", reason);
        removing = null;
      });
    }
    if (dlg) {
      dlg.addEventListener("close", restoreFocus);
      dlg.addEventListener("click", function(e) {
        if (e.target.closest && e.target.closest("[data-close]")) {
          window.setTimeout(restoreFocus, 0);
        }
      });
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
  }
  function decideFromConsole(id, state, reason) {
    var row = Board.find(id);
    if (!row) {
      return;
    }
    var by = me();
    if (!Board.decide(id, state, reason, by)) {
      admSay("This browser would not store that decision. Nothing has changed.");
      return;
    }
    var word = state === "published" ? "Published" : state === "removed" ? "Removed" : "Put back in the queue";
    if (window.PTGAudit) {
      window.PTGAudit.write("moderation", word + " a message board post by " + row.from, by, reason || "");
    }
    if (window.PTGNotify && row.owner && row.owner !== "guest") {
      if (state === "published") {
        window.PTGNotify.toParent(row.owner, {
          kind: "moderation",
          tone: "good",
          title: "Your message board post was published",
          body: "It is now on the message board for other parents to read.",
          go: "resources",
          tag: "board-" + row.id
        });
      } else if (state === "removed") {
        window.PTGNotify.toParent(row.owner, {
          kind: "moderation",
          tone: "warn",
          title: "Your message board post was removed",
          body: reason ? "The reason given was: " + reason : "No reason was recorded.",
          go: "resources",
          tag: "board-" + row.id
        });
      }
    }
    renderAdmin();
    renderBoard();
    admSay(word + " the message from " + row.from + ".");
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
    initSwitch($("resViews"), function(tab) {
      if (tab && tab.id === "resv-tab-board") {
        renderBoard();
      }
    });
    initSwitch($("admModViews"), function(tab) {
      if (tab && tab.id === "admmod-tab-board") {
        renderAdmin();
      }
    });
    bootParent();
    bootAdmin();
    renderBoard();
    renderAdmin();
    Board.onChange(function() {
      renderBoard();
      renderAdmin();
    });
    watch("panel-resources", renderBoard);
    watch("admpanel-moderation", renderAdmin);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
