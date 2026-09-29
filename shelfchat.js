(function() {
  "use strict";
  var C = window.PTGChat;
  var UI = window.PTGChatBox;
  var F = window.PTGFamily;
  if (!C || !UI || !F) {
    return;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(id) {
    return document.getElementById(id);
  }
  function owner() {
    var s = window.PTGSession;
    var v = s && typeof s.email === "function" ? s.email() : "";
    return String(v || "").trim().toLowerCase() || "guest";
  }
  var box = null;
  var active = null;
  function threadFor(rec) {
    var me = C.ADULT(owner());
    var them = C.ADULT(rec.email);
    var names = {};
    names[me] = (window.PTGSession && typeof window.PTGSession.name === "function" ? window.PTGSession.name() : "") || "You";
    names[them] = rec.name || rec.email;
    return C.open({
      kind: "shelf",
      key: "shelf:" + owner() + ":" + rec.id,
      title: rec.name || rec.email,
      members: [ me, them ],
      names: names
    });
  }
  var painting = false;
  function paint() {
    if (painting) {
      return;
    }
    painting = true;
    try {
      render();
    } finally {
      painting = false;
    }
  }
  function render() {
    var host = $("shareChat");
    if (!host) {
      return;
    }
    var who = owner();
    var live = F.accepted(who);
    var waiting = F.list(who).filter(function(r) {
      return r.state === "invited";
    });
    if (!live.length && !waiting.length) {
      host.innerHTML = '<p class="share-chat-off">Invite someone to this shelf and you can talk here ' + "once they accept.</p>";
      if (box) {
        box.destroy();
        box = null;
      }
      return;
    }
    if (!live.length) {
      host.innerHTML = '<p class="share-chat-off">' + esc(waiting.length === 1 ? (waiting[0].name || waiting[0].email) + " has not accepted yet." : waiting.length + " invitations are still waiting to be accepted.") + " Chat opens as soon as they do.</p>";
      if (box) {
        box.destroy();
        box = null;
      }
      return;
    }
    var i, t, rows = [];
    for (i = 0; i < live.length; i++) {
      t = threadFor(live[i]);
      if (t) {
        rows.push({
          rec: live[i],
          th: t
        });
      }
    }
    if (!rows.length) {
      return;
    }
    if (!active || !rows.some(function(r) {
      return r.th.id === active;
    })) {
      active = rows[0].th.id;
    }
    var tabs = "";
    if (rows.length > 1) {
      tabs = '<div class="share-chat-who" role="group" aria-label="Who to message">';
      for (i = 0; i < rows.length; i++) {
        var n = C.unread(rows[i].th.id);
        tabs += '<button type="button" class="share-chat-b" data-sc="' + esc(rows[i].th.id) + '" aria-pressed="' + (rows[i].th.id === active ? "true" : "false") + '">' + esc(rows[i].rec.name || rows[i].rec.email) + (n ? ' <span class="share-chat-n">' + n + "</span>" : "") + "</button>";
      }
      tabs += "</div>";
    }
    var note = waiting.length ? '<p class="share-chat-wait">' + waiting.length + (waiting.length === 1 ? " invitation is" : " invitations are") + " still waiting to be accepted.</p>" : "";
    host.innerHTML = tabs + '<div id="shareChatBox"></div>' + note;
    if (box) {
      box.destroy();
    }
    box = UI.mount($("shareChatBox"), {
      threadId: active,
      placeholder: "Write a message",
      empty: "No messages yet. Tell them what you have added to the shelf."
    });
  }
  function boot() {
    var dlg = $("shareDialog");
    if (!dlg || $("shareChat")) {
      return;
    }
    var fields = dlg.querySelector(".fields");
    if (!fields) {
      return;
    }
    var wrap = document.createElement("div");
    wrap.className = "f wide share-chat";
    wrap.innerHTML = "<h3>Messages</h3>" + '<p class="share-chat-sub">Talk to the people you share this shelf with. ' + "Text only &mdash; there are no calls here.</p>" + '<div id="shareChat"></div>';
    fields.appendChild(wrap);
    wrap.addEventListener("click", function(e) {
      var t = e.target.closest ? e.target.closest("[data-sc]") : null;
      if (!t) {
        return;
      }
      active = t.getAttribute("data-sc");
      paint();
    });
    paint();
    F.onChange(paint);
    C.onChange(function(e) {
      var d = e && e.detail;
      if (d && d.t === "thread") {
        paint();
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
