(function() {
  "use strict";
  var C = window.PTGChat;
  if (!C) {
    return;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function icon(d, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 20 20" ' + 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' + 'stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  var ICON = {
    send: '<path d="M3.2 9.6 16.8 3.4l-4.6 13.4-2.9-5.6-6.1-1.6Z"/><path d="m9.3 11.2 3.4-3.6"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.6a3 3 0 0 1 6 0V9"/>',
    back: '<path d="M12.4 4.4 6.8 10l5.6 5.6"/>',
    close: '<path d="m5 5 10 10M15 5 5 15"/>',
    search: '<circle cx="9" cy="9" r="5.8"/><path d="m13.4 13.4 3.8 3.8"/>',
    shield: '<path d="M10 2.8 4.2 5v4.4c0 3.8 2.5 6.6 5.8 7.8 3.3-1.2 5.8-4 5.8-7.8V5Z"/><path d="m7.6 10 1.7 1.7 3.2-3.4"/>'
  };
  var GROUP_GAP = 5 * 60 * 1e3;
  var SPARE = [ "#2F6E86", "#8A5BB5", "#C8672F", "#2C8A56", "#B3402E", "#5B6FB5" ];
  function clock(ts) {
    var d = new Date(Number(ts || 0));
    if (isNaN(d.getTime())) {
      return "";
    }
    try {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      });
    } catch (e) {
      return d.getHours() + ":" + d.getMinutes();
    }
  }
  function dayLabel(ts) {
    var d = new Date(Number(ts || 0));
    var now = new Date;
    if (isNaN(d.getTime())) {
      return "";
    }
    if (d.toDateString() === now.toDateString()) {
      return "Today";
    }
    var y = new Date(now.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) {
      return "Yesterday";
    }
    try {
      return d.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
    } catch (e) {
      return d.toDateString();
    }
  }
  function shortWhen(ts) {
    var d = new Date(Number(ts || 0));
    if (isNaN(d.getTime())) {
      return "";
    }
    var now = new Date;
    if (d.toDateString() === now.toDateString()) {
      return clock(ts);
    }
    var y = new Date(now.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) {
      return "Yesterday";
    }
    try {
      return d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short"
      });
    } catch (e) {
      return "";
    }
  }
  function initial(name) {
    var n = String(name || "").trim();
    return n ? n.charAt(0).toUpperCase() : "?";
  }
  function account() {
    var s = window.PTGSession;
    var v = s && typeof s.email === "function" ? s.email() : "";
    return String(v || "").trim().toLowerCase() || "guest";
  }
  function appData() {
    var app = window.PTGApp;
    return app && typeof app.data === "function" ? app.data() : null;
  }
  function kids() {
    var data = appData();
    var rows = data ? data.children : null;
    return Object.prototype.toString.call(rows) === "[object Array]" ? rows : [];
  }
  function colourFor(id) {
    var acct = account(), list = kids(), i, h = 0;
    for (i = 0; i < list.length; i++) {
      if (list[i] && C.CHILD(acct, list[i].id) === id) {
        return list[i].colour || "#0D3B32";
      }
    }
    if (id === C.ADULT(acct)) {
      var data = appData();
      return data && data.parent && data.parent.colour || "#0D3B32";
    }
    for (i = 0; i < String(id).length; i++) {
      h = h * 31 + String(id).charCodeAt(i) >>> 0;
    }
    return SPARE[h % SPARE.length];
  }
  function avatar(cls, name, colour) {
    return '<span class="' + cls + '" aria-hidden="true" style="--av:' + esc(colour) + '">' + esc(initial(name)) + "</span>";
  }
  var seq = 0;
  function mount(el, opts) {
    if (!el) {
      return null;
    }
    opts = opts || {};
    var uid = "cb" + ++seq;
    var who = opts.who || C.me();
    var threadId = opts.threadId;
    var pinned = true;
    el.classList.add("cb");
    el.innerHTML = '<div class="cb-log" id="' + uid + '-log" role="log" aria-live="polite" ' + 'aria-label="Messages" tabindex="0"></div>' + '<div class="cb-foot" id="' + uid + '-foot"></div>';
    var log = document.getElementById(uid + "-log");
    var foot = document.getElementById(uid + "-foot");
    function composer() {
      if (opts.locked) {
        foot.innerHTML = '<p class="cb-locked">' + icon(ICON.lock, 16) + esc(opts.locked) + "</p>";
        return;
      }
      foot.innerHTML = '<div class="cb-form">' + '<label class="cb-sr" for="' + uid + '-in">Write a message</label>' + '<div class="cb-field">' + '<textarea class="cb-in" id="' + uid + '-in" rows="1" maxlength="2000" ' + 'placeholder="' + esc(opts.placeholder || "Write a message") + '"></textarea>' + "</div>" + '<button class="cb-send" type="button" id="' + uid + '-send" ' + 'aria-label="Send message" disabled>' + icon(ICON.send, 19) + "</button>" + "</div>" + '<p class="cb-count" id="' + uid + '-count" hidden></p>';
      var input = document.getElementById(uid + "-in");
      var btn = document.getElementById(uid + "-send");
      var count = document.getElementById(uid + "-count");
      function grow() {
        input.style.height = "auto";
        var h = input.scrollHeight;
        input.style.height = h ? Math.min(h, 132) + "px" : "";
        var len = input.value.length;
        btn.disabled = !input.value.trim();
        count.hidden = len < 1800;
        count.textContent = len + " / 2000";
      }
      function submit() {
        var body = input.value;
        if (!String(body).trim()) {
          input.focus();
          return;
        }
        if (C.send(threadId, body, who)) {
          input.value = "";
          grow();
          pinned = true;
          paint();
        }
        input.focus();
      }
      input.addEventListener("input", grow);
      grow();
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
      btn.addEventListener("click", function(e) {
        e.preventDefault();
        submit();
      });
    }
    function paint() {
      var msgs = C.messages(threadId, who);
      var t = C.thread(threadId);
      var members = t && t.members ? t.members : [];
      var group = members.length > 2;
      var other = members.filter(function(m) {
        return m !== who;
      })[0];
      var html = "";
      var lastDay = "";
      var i, m, prev, next, mine, day, first, last, cls;
      if (!msgs.length) {
        html = '<div class="cb-empty">' + '<svg class="cb-empty-art" viewBox="0 0 120 84" aria-hidden="true">' + '<rect x="6" y="10" width="68" height="44" rx="14" class="a"/>' + '<path d="M22 54v14l14-14" class="a"/>' + '<rect x="46" y="30" width="68" height="40" rx="14" class="b"/>' + '<path d="M98 70v10L88 70" class="b"/>' + '<circle cx="66" cy="50" r="3.2" class="c"/><circle cx="80" cy="50" r="3.2" class="c"/><circle cx="94" cy="50" r="3.2" class="c"/>' + "</svg>" + "<p>" + esc(opts.empty || "No messages yet. Say hello.") + "</p>" + "</div>";
      }
      for (i = 0; i < msgs.length; i++) {
        m = msgs[i];
        prev = msgs[i - 1];
        next = msgs[i + 1];
        mine = m.from === who;
        day = dayLabel(m.at);
        if (day !== lastDay) {
          html += '<p class="cb-day"><span>' + esc(day) + "</span></p>";
          lastDay = day;
        }
        first = !prev || prev.from !== m.from || dayLabel(prev.at) !== day || m.at - prev.at > GROUP_GAP;
        last = !next || next.from !== m.from || dayLabel(next.at) !== day || next.at - m.at > GROUP_GAP;
        cls = "cb-msg" + (mine ? " is-mine" : "") + (first ? " is-first" : "") + (last ? " is-last" : "");
        html += '<div class="' + cls + '">' + (mine ? "" : last ? avatar("cb-who", m.name, colourFor(m.from)) : '<span class="cb-who is-gap" aria-hidden="true"></span>') + '<div class="cb-col">' + (!mine && first && group ? '<span class="cb-nm">' + esc(m.name) + "</span>" : "") + '<div class="cb-bub" title="' + esc(clock(m.at)) + '">' + '<span class="cb-sr">' + esc(mine ? "You" : m.name) + ": </span>" + '<span class="cb-tx">' + esc(m.body).replace(/\n/g, "<br>") + "</span>" + (last ? "" : '<span class="cb-sr"> at ' + esc(clock(m.at)) + "</span>") + "</div>" + (last ? '<span class="cb-meta"><time datetime="' + new Date(m.at).toISOString() + '">' + esc(clock(m.at)) + "</time>" + (mine && !next && other && C.unread(threadId, other) === 0 ? '<span class="cb-seen">· Seen</span>' : "") + "</span>" : "") + "</div>" + "</div>";
      }
      log.innerHTML = html;
      if (pinned) {
        log.scrollTop = log.scrollHeight;
      }
      if (t && t.state === "closed" && !opts.locked) {
        foot.innerHTML = '<p class="cb-locked">' + icon(ICON.lock, 16) + "This conversation is closed.</p>";
      }
      C.markRead(threadId, who);
    }
    log.addEventListener("scroll", function() {
      pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    });
    function onChange(e) {
      var d = e && e.detail;
      if (d && d.id && d.id !== threadId) {
        return;
      }
      paint();
    }
    C.onChange(onChange);
    composer();
    paint();
    return {
      refresh: paint,
      focus: function() {
        var input = document.getElementById(uid + "-in");
        if (input) {
          input.focus();
        }
      },
      setThread: function(id) {
        threadId = id;
        pinned = true;
        composer();
        paint();
      },
      destroy: function() {
        C.offChange(onChange);
        el.innerHTML = "";
        el.classList.remove("cb");
      }
    };
  }
  function contacts() {
    var acct = account();
    var me = C.ADULT(acct);
    var F = window.PTGFamily;
    var out = [];
    var list = kids();
    var names, i, k, kid, t, rec, them;
    for (i = 0; i < list.length; i++) {
      k = list[i];
      if (!k || !k.id) {
        continue;
      }
      kid = C.CHILD(acct, k.id);
      names = {};
      names[me] = C.meName();
      names[kid] = k.name;
      t = C.open({
        kind: "family",
        key: "family:" + acct + ":" + k.id,
        title: k.name,
        account: acct,
        members: [ me, kid ],
        names: names
      });
      if (t) {
        out.push({
          id: t.id,
          title: k.name,
          note: "Your child",
          kind: "family",
          colour: k.colour || colourFor(kid)
        });
      }
    }
    if (F && typeof F.list === "function") {
      list = F.list(acct);
      for (i = 0; i < list.length; i++) {
        rec = list[i];
        them = C.ADULT(rec.email);
        if (rec.state === "invited") {
          out.push({
            id: "wait:" + rec.id,
            title: rec.name || rec.email,
            note: "Invitation not accepted yet",
            kind: "waiting",
            colour: colourFor(them)
          });
          continue;
        }
        if (rec.state !== "accepted") {
          continue;
        }
        names = {};
        names[me] = C.meName();
        names[them] = rec.name || rec.email;
        t = C.open({
          kind: "shelf",
          key: "shelf:" + acct + ":" + rec.id,
          title: rec.name || rec.email,
          members: [ me, them ],
          names: names
        });
        if (t) {
          out.push({
            id: t.id,
            title: rec.name || rec.email,
            note: "Family member",
            kind: "shelf",
            colour: colourFor(them)
          });
        }
      }
    }
    return out;
  }
  function circle(el, opts) {
    if (!el) {
      return null;
    }
    opts = opts || {};
    var uid = "cr" + ++seq;
    var who = opts.who || C.me();
    var active = null;
    var box = null;
    var rows = [];
    var query = "";
    el.classList.add("cr");
    el.innerHTML = '<div class="cr-side">' + '<div class="cr-side-top">' + '<h3 class="cr-h">' + esc(opts.title || "Your family") + "</h3>" + '<div class="cr-find">' + icon(ICON.search, 16) + '<label class="cb-sr" for="' + uid + '-q">Search your family</label>' + '<input type="search" id="' + uid + '-q" placeholder="Search" autocomplete="off">' + "</div>" + "</div>" + '<div class="cr-list" id="' + uid + '-list" role="list"></div>' + '<p class="cr-scope">' + icon(ICON.shield, 16) + "<span>" + esc(opts.scope || "You can only message your children and the grown-ups you have " + "added to this shelf.") + "</span></p>" + "</div>" + '<div class="cr-main" id="' + uid + '-main"></div>';
    var list = document.getElementById(uid + "-list");
    var main = document.getElementById(uid + "-main");
    var find = document.getElementById(uid + "-q");
    function row(id) {
      var i;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].id === id) {
          return rows[i];
        }
      }
      return null;
    }
    var painting = false;
    function paintList() {
      if (painting) {
        return;
      }
      painting = true;
      try {
        drawList();
      } finally {
        painting = false;
      }
    }
    function drawList() {
      rows = contacts();
      var shown = rows.filter(function(r) {
        return !query || String(r.title).toLowerCase().indexOf(query) !== -1;
      });
      var html = "", i, r, n, last, preview;
      if (!rows.length) {
        html = '<p class="cr-none">' + esc(opts.empty || "Nobody to message yet. Add a child, or invite a grown-up to the " + "shelf, and they will show up here.") + "</p>";
      } else if (!shown.length) {
        html = '<p class="cr-none">Nobody called “' + esc(query) + "”.</p>";
      }
      for (i = 0; i < shown.length; i++) {
        r = shown[i];
        n = r.kind === "waiting" ? 0 : C.unread(r.id, who);
        last = r.kind === "waiting" ? null : C.messages(r.id, who).slice(-1)[0];
        preview = last ? (last.from === who ? "You: " : "") + String(last.body).replace(/\s+/g, " ").slice(0, 70) : r.note;
        html += '<button class="cr-row' + (r.id === active ? " is-on" : "") + (r.kind === "waiting" ? " is-waiting" : "") + (n ? " has-new" : "") + '" type="button" ' + 'role="listitem" data-th="' + esc(r.id) + '"' + (r.id === active ? ' aria-current="true"' : "") + ">" + avatar("cr-av", r.title, r.colour) + '<span class="cr-txt">' + '<span class="cr-top">' + '<span class="cr-nm">' + esc(r.title) + "</span>" + (last ? '<span class="cr-when">' + esc(shortWhen(last.at)) + "</span>" : "") + "</span>" + '<span class="cr-bottom">' + '<span class="cr-last">' + esc(preview) + "</span>" + (n ? '<span class="cr-n" aria-label="' + n + ' unread">' + n + "</span>" : "") + "</span>" + "</span>" + "</button>";
      }
      list.innerHTML = html;
    }
    function paintMain() {
      if (!active) {
        el.classList.remove("is-open");
        main.innerHTML = '<div class="cr-pick">' + '<svg class="cb-empty-art" viewBox="0 0 120 84" aria-hidden="true">' + '<rect x="6" y="10" width="68" height="44" rx="14" class="a"/>' + '<path d="M22 54v14l14-14" class="a"/>' + '<rect x="46" y="30" width="68" height="40" rx="14" class="b"/>' + '<path d="M98 70v10L88 70" class="b"/>' + '<circle cx="66" cy="50" r="3.2" class="c"/><circle cx="80" cy="50" r="3.2" class="c"/><circle cx="94" cy="50" r="3.2" class="c"/>' + "</svg>" + "<h4>" + esc(opts.pickTitle || "Your family chats") + "</h4>" + "<p>" + esc(opts.pick || "Pick someone to message.") + "</p>" + "</div>";
        box = null;
        return;
      }
      var r = row(active);
      if (!r) {
        active = null;
        paintMain();
        return;
      }
      var head = '<div class="cr-head">' + '<button class="cr-back" type="button" id="' + uid + '-back" aria-label="Back to your family">' + icon(ICON.back, 18) + "</button>" + avatar("cr-av cr-av--lg", r.title, r.colour) + '<div class="cr-head-txt">' + "<h4>" + esc(r.title) + "</h4>" + "<p>" + icon(ICON.lock, 13) + esc(r.kind === "family" ? "Private · just you two · text only" : r.kind === "waiting" ? r.note : "Private · text only") + "</p>" + "</div>" + "</div>";
      el.classList.add("is-open");
      if (r.kind === "waiting") {
        main.innerHTML = head + '<div class="cr-pick"><p>' + esc(r.title) + " has not accepted the invitation yet. " + "Messages open as soon as they do.</p></div>";
        box = null;
        return;
      }
      main.innerHTML = head + '<div class="cr-box" id="' + uid + '-box"></div>';
      box = mount(document.getElementById(uid + "-box"), {
        threadId: active,
        who: who,
        placeholder: opts.placeholder,
        empty: opts.empty2
      });
    }
    find.addEventListener("input", function() {
      query = find.value.trim().toLowerCase();
      paintList();
    });
    el.addEventListener("click", function(e) {
      var t = e.target.closest ? e.target.closest("button") : null;
      if (!t || !el.contains(t)) {
        return;
      }
      if (t.id === uid + "-back") {
        active = null;
        paintList();
        paintMain();
        var again = list.querySelector("button");
        if (again) {
          again.focus();
        }
        return;
      }
      var th = t.getAttribute("data-th");
      if (th) {
        active = th;
        paintList();
        paintMain();
        if (box) {
          box.focus();
        }
      }
    });
    function onChange() {
      paintList();
    }
    C.onChange(onChange);
    if (window.PTGFamily && typeof window.PTGFamily.onChange === "function") {
      window.PTGFamily.onChange(onChange);
    }
    paintList();
    paintMain();
    return {
      refresh: function() {
        paintList();
        paintMain();
      },
      reset: function() {
        active = null;
        query = "";
        find.value = "";
        el.classList.remove("is-open");
        if (box) {
          box.destroy();
          box = null;
        }
      },
      destroy: function() {
        C.offChange(onChange);
        if (box) {
          box.destroy();
        }
        el.innerHTML = "";
      }
    };
  }
  var recount = function() {};
  var panelEl = null;
  var panelRoster = null;
  var panelBtn = null;
  var lastFocus = null;
  function isOpen() {
    return !!panelEl && !panelEl.hidden;
  }
  function closePanel() {
    if (!isOpen()) {
      return;
    }
    panelEl.hidden = true;
    document.documentElement.classList.remove("cp-open");
    if (window.PTGLock) {
      window.PTGLock.unlock(panelEl);
    }
    if (panelBtn) {
      panelBtn.setAttribute("aria-expanded", "false");
    }
    if (panelRoster && panelRoster.reset) {
      panelRoster.reset();
    }
    if (lastFocus && lastFocus.focus) {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }
  function place() {
    if (!panelEl || !panelBtn) {
      return;
    }
    if (window.matchMedia("(max-width: 899px)").matches) {
      panelEl.style.top = "";
      panelEl.style.right = "";
      panelEl.style.left = "";
      panelEl.style.bottom = "";
      return;
    }
    var r = panelBtn.getBoundingClientRect();
    panelEl.style.top = Math.round(r.bottom + 10) + "px";
    panelEl.style.right = Math.round(window.innerWidth - r.right) + "px";
    panelEl.style.left = "auto";
    panelEl.style.bottom = "auto";
  }
  function openPanel() {
    if (!panelEl || isOpen()) {
      return;
    }
    lastFocus = document.activeElement;
    panelEl.hidden = false;
    place();
    document.documentElement.classList.add("cp-open");
    if (window.PTGLock) {
      window.PTGLock.lock(panelEl);
    }
    if (panelBtn) {
      panelBtn.setAttribute("aria-expanded", "true");
    }
    if (!panelRoster) {
      panelRoster = circle(document.getElementById("cpBody"), {
        title: "Your family",
        empty: "Nobody to message yet. Add a child, or invite a grown-up to " + "the shelf, and they will show up here.",
        empty2: "Say hello, or ask what they have been reading.",
        pickTitle: "Your family chats",
        pick: "Pick someone on the left to start a conversation. Chats stay private between the two of you.",
        placeholder: "Write a message…"
      });
    } else {
      panelRoster.refresh();
    }
    var h = document.getElementById("cpTitle");
    if (h && h.focus) {
      h.focus();
    }
  }
  function panel(btn) {
    if (panelEl) {
      return panelEl;
    }
    panelBtn = btn || document.getElementById("chatBtn");
    if (!panelBtn) {
      return null;
    }
    panelEl = document.createElement("div");
    panelEl.className = "cp";
    panelEl.id = "chatPanel";
    panelEl.hidden = true;
    panelEl.setAttribute("role", "dialog");
    panelEl.setAttribute("aria-modal", "true");
    panelEl.setAttribute("aria-labelledby", "cpTitle");
    panelEl.innerHTML = '<div class="cp-sheet">' + '<div class="cp-top">' + '<div class="cp-top-txt">' + '<h2 id="cpTitle" tabindex="-1">Messages</h2>' + "<p>Private chats with your family</p>" + "</div>" + '<button class="cp-x" type="button" id="cpX" aria-label="Close messages">' + icon(ICON.close, 18) + "</button>" + "</div>" + '<div class="cp-body" id="cpBody"></div>' + "</div>";
    document.body.appendChild(panelEl);
    panelBtn.setAttribute("aria-controls", "chatPanel");
    panelBtn.addEventListener("click", function() {
      if (isOpen()) {
        closePanel();
      } else {
        openPanel();
      }
    });
    panelEl.addEventListener("click", function(e) {
      if (e.target === panelEl) {
        closePanel();
        return;
      }
      var t = e.target.closest ? e.target.closest("button") : null;
      if (t && t.id === "cpX") {
        closePanel();
      }
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && isOpen()) {
        e.preventDefault();
        closePanel();
      }
    });
    window.addEventListener("resize", function() {
      if (isOpen()) {
        place();
      }
    });
    window.addEventListener("scroll", function() {
      if (isOpen()) {
        place();
      }
    }, true);
    var clickBeganInside = false;
    panelEl.addEventListener("click", function() {
      clickBeganInside = true;
    }, true);
    panelBtn.addEventListener("click", function() {
      clickBeganInside = true;
    }, true);
    document.addEventListener("click", function(e) {
      var inside = clickBeganInside;
      clickBeganInside = false;
      if (!isOpen()) {
        return;
      }
      if (window.matchMedia("(max-width: 899px)").matches) {
        return;
      }
      if (inside || panelEl.contains(e.target) || panelBtn.contains(e.target)) {
        return;
      }
      closePanel();
    });
    function count() {
      var badge = document.getElementById("chatCount");
      if (!badge) {
        return;
      }
      var n = C.unreadTotal("family") + C.unreadTotal("shelf");
      badge.hidden = !n;
      badge.textContent = n > 9 ? "9+" : String(n);
      panelBtn.setAttribute("aria-label", n ? "Chats, " + n + " unread" : "Chats");
    }
    C.onChange(count);
    recount = count;
    count();
    return panelEl;
  }
  window.PTGChatBox = {
    mount: mount,
    circle: circle,
    panel: panel,
    openPanel: openPanel,
    closePanel: closePanel,
    colourFor: colourFor,
    recount: function() {
      recount();
    }
  };
})();
