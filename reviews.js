(function() {
  "use strict";
  var KEY = "ptg-reviews-v1";
  var MAX = 200;
  var EVENT = "ptg:reviews";
  var CHANNEL = "ptg-reviews";
  var BODY_MIN = 10;
  var BODY_MAX = 500;
  var WORDS = [ "", "Not for us", "It was all right", "Good", "Really good", "A favourite" ];
  var STAR = "M10 2.6l2.3 4.7 5.2.8-3.8 3.6.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.6 5.2-.8Z";
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
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
  }
  function bookKey(title, author) {
    return norm(title) + "|" + norm(author);
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
          t: "reviews"
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
  function shelf() {
    var app = window.PTGApp;
    var data = app && typeof app.data === "function" ? app.data() : null;
    var books = data && isArray(data.books) ? data.books : [];
    return books.filter(function(b) {
      return b && String(b.title || "").trim();
    });
  }
  function bookFor(key) {
    var all = shelf(), i;
    for (i = 0; i < all.length; i++) {
      if (bookKey(all[i].title, all[i].author) === key) {
        return all[i];
      }
    }
    return null;
  }
  var SEED = [ {
    title: "The Magic School Bus: Inside the Human Body",
    author: "Joanna Cole",
    from: "Priya",
    owner: "priya@example.invalid",
    rating: 5,
    body: "Read this one twice in a week, which has never happened before. The " + "chapters are short enough to stop at the end of one without an argument.",
    ago: 1e3 * 60 * 60 * 40
  }, {
    title: "Goodnight Moon",
    author: "Margaret Wise Brown",
    from: "Marcus",
    owner: "marcus@example.invalid",
    rating: 3,
    body: "Good for a first bedtime book — short, and the pictures carry most of " + "it. We had outgrown it within a couple of months, so borrow it from the library first.",
    ago: 1e3 * 60 * 60 * 70
  } ];
  function seed() {
    var existing;
    try {
      existing = window.localStorage.getItem(KEY);
    } catch (e) {
      return;
    }
    if (existing !== null) {
      return;
    }
    var rows = SEED.map(function(s) {
      return {
        id: "rv-" + token(),
        book: bookKey(s.title, s.author),
        bookTitle: s.title,
        bookAuthor: s.author,
        from: s.from,
        owner: s.owner,
        rating: s.rating,
        body: s.body,
        at: Date.now() - s.ago,
        edited: null,
        state: "published",
        reason: "",
        decidedBy: "moderator@example.invalid",
        decidedAt: Date.now() - s.ago + 1e3 * 60 * 45
      };
    });
    write(rows);
  }
  var Reviews = {
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
    visibleOn: function(key, email) {
      var who = String(email || "").trim().toLowerCase() || "guest";
      return read().filter(function(r) {
        if (r.book !== key) {
          return false;
        }
        if (r.state === "published") {
          return true;
        }
        return String(r.owner || "") === who;
      }).sort(function(a, b) {
        return b.at - a.at;
      });
    },
    ownOn: function(key, email) {
      var who = String(email || "").trim().toLowerCase() || "guest";
      var all = read(), i;
      for (i = 0; i < all.length; i++) {
        if (all[i].book === key && String(all[i].owner || "") === who) {
          return all[i];
        }
      }
      return null;
    },
    scoreOn: function(key) {
      var rows = read().filter(function(r) {
        return r.book === key && r.state === "published";
      });
      if (!rows.length) {
        return {
          count: 0,
          mean: 0
        };
      }
      var total = rows.reduce(function(t, r) {
        return t + (Number(r.rating) || 0);
      }, 0);
      return {
        count: rows.length,
        mean: Math.round(total / rows.length * 10) / 10
      };
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
        id: "rv-" + token(),
        book: bookKey(rec.bookTitle, rec.bookAuthor),
        bookTitle: String(rec.bookTitle || "").trim(),
        bookAuthor: String(rec.bookAuthor || "").trim(),
        from: String(rec.from || "A parent"),
        owner: String(rec.owner || "").trim().toLowerCase() || "guest",
        rating: Math.max(1, Math.min(5, Math.round(Number(rec.rating) || 0))),
        body: String(rec.body || "").trim(),
        at: Date.now(),
        edited: null,
        state: "pending",
        reason: "",
        decidedBy: "",
        decidedAt: null
      };
      all.unshift(row);
      if (!write(all)) {
        return null;
      }
      fire();
      post();
      return row;
    },
    update: function(id, rating, body) {
      var all = read(), hit = null, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i].rating = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));
          all[i].body = String(body || "").trim();
          all[i].edited = Date.now();
          all[i].state = "pending";
          all[i].reason = "";
          all[i].decidedBy = "";
          all[i].decidedAt = null;
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
    key: bookKey,
    onChange: function(fn) {
      window.addEventListener(EVENT, fn);
    }
  };
  window.PTGReviews = Reviews;
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
    var region = $("rvSay");
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
  function starsHtml(n) {
    var r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    var out = "", i;
    for (i = 1; i <= 5; i++) {
      out += '<svg class="rv-star' + (i <= r ? " is-on" : "") + '" width="15" height="15" ' + 'viewBox="0 0 20 20" fill="' + (i <= r ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" ' + 'aria-hidden="true"><path d="' + STAR + '"/></svg>';
    }
    return '<span class="rv-stars">' + out + '<span class="rv-stars-t">' + r + " out of 5" + (WORDS[r] ? " · " + esc(WORDS[r]) : "") + "</span></span>";
  }
  function makeRate(box, out) {
    var value = 0;
    function paint() {
      var html = "", i, on, focusable;
      for (i = 1; i <= 5; i++) {
        on = i === value;
        focusable = value ? on : i === 1;
        html += '<button type="button" role="radio" class="rv-pick' + (i <= value ? " is-on" : "") + '" data-rv-star="' + i + '" ' + 'aria-checked="' + (on ? "true" : "false") + '" ' + 'tabindex="' + (focusable ? "0" : "-1") + '" ' + 'aria-label="' + i + (i === 1 ? " star, " : " stars, ") + esc(WORDS[i]) + '">' + '<svg width="26" height="26" viewBox="0 0 20 20" fill="' + (i <= value ? "currentColor" : "none") + '" stroke="currentColor" ' + 'stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">' + '<path d="' + STAR + '"/></svg></button>';
      }
      box.innerHTML = html;
      if (out) {
        out.textContent = value ? value + " out of 5 · " + WORDS[value] : "No rating chosen yet";
        out.classList.toggle("is-set", !!value);
      }
    }
    function set(n, moveFocus) {
      value = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
      paint();
      if (value) {
        box.removeAttribute("aria-invalid");
      }
      if (moveFocus) {
        var el = box.querySelector('[data-rv-star="' + value + '"]');
        if (el) {
          el.focus();
        }
      }
    }
    box.addEventListener("click", function(e) {
      var hit = e.target.closest ? e.target.closest("[data-rv-star]") : null;
      if (hit) {
        set(hit.getAttribute("data-rv-star"), false);
      }
    });
    box.addEventListener("keydown", function(e) {
      var hit = document.activeElement;
      var at = hit && hit.getAttribute ? Number(hit.getAttribute("data-rv-star")) : 0;
      if (!at) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        set(at === 5 ? 1 : at + 1, true);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        set(at === 1 ? 5 : at - 1, true);
      } else if (e.key === "Home") {
        e.preventDefault();
        set(1, true);
      } else if (e.key === "End") {
        e.preventDefault();
        set(5, true);
      } else if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") {
        e.preventDefault();
        set(at, true);
      }
    });
    paint();
    return {
      get: function() {
        return value;
      },
      set: set
    };
  }
  var rate = null;
  function rateValue() {
    return rate ? rate.get() : 0;
  }
  function setRating(n) {
    if (rate) {
      rate.set(n, false);
    }
    if (n) {
      setErr("rvRateErr", false);
    }
  }
  function bootRate() {
    var box = $("rvRate");
    if (box) {
      rate = makeRate(box, $("rvRateOut"));
      rate.set(0, false);
    }
  }
  var chosen = "";
  function bookLabel(b) {
    return b.title + (b.author ? " — " + b.author : "");
  }
  function fillPicker() {
    var sel = $("rvBook");
    if (!sel) {
      return;
    }
    var books = shelf();
    var seen = {};
    var opts = [];
    books.forEach(function(b) {
      var k = bookKey(b.title, b.author);
      if (seen[k]) {
        return;
      }
      seen[k] = true;
      opts.push({
        key: k,
        label: bookLabel(b),
        gone: false
      });
    });
    Reviews.mine(whoEmail()).forEach(function(r) {
      if (seen[r.book]) {
        return;
      }
      seen[r.book] = true;
      opts.push({
        key: r.book,
        label: r.bookTitle + (r.bookAuthor ? " — " + r.bookAuthor : "") + " (no longer on your shelf)",
        gone: true
      });
    });
    opts.sort(function(a, b) {
      return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1;
    });
    var keep = chosen;
    sel.innerHTML = '<option value="">Choose a book…</option>' + opts.map(function(o) {
      return '<option value="' + esc(o.key) + '">' + esc(o.label) + "</option>";
    }).join("");
    if (keep && seen[keep]) {
      sel.value = keep;
    } else {
      sel.value = "";
      chosen = "";
    }
    var none = $("rvNoBooks");
    if (none) {
      none.hidden = !!opts.length;
    }
    var picker = $("rvPicker");
    if (picker) {
      picker.hidden = !opts.length;
    }
  }
  function paintBook() {
    var card = $("rvBookCard");
    if (!card) {
      return;
    }
    if (!chosen) {
      card.hidden = true;
      card.innerHTML = "";
      return;
    }
    var b = bookFor(chosen);
    var score = Reviews.scoreOn(chosen);
    var own = Reviews.ownOn(chosen, whoEmail());
    var title, author, spine, bits = [];
    if (b) {
      title = b.title;
      author = b.author || "Author unknown";
      spine = /^#[0-9a-f]{6}$/i.test(String(b.spine || "")) ? b.spine : "";
      if (b.ages) {
        bits.push("Ages " + b.ages);
      }
      if (b.pages) {
        bits.push(b.pages + " pages");
      }
    } else {
      title = own ? own.bookTitle : "This book";
      author = own && own.bookAuthor ? own.bookAuthor : "Author unknown";
      spine = "";
      bits.push("No longer on your shelf");
    }
    var line = score.count ? starsHtml(score.mean) + '<span class="rv-n">' + score.count + (score.count === 1 ? " review" : " reviews") + "</span>" : '<span class="rv-n">No published reviews yet</span>';
    card.innerHTML = '<span class="rv-cover"' + (spine ? ' style="background:' + esc(spine) + '"' : "") + ' aria-hidden="true"></span>' + '<span class="rv-book-body">' + '<h3 class="rv-book-t">' + esc(title) + "</h3>" + '<p class="rv-book-a">' + esc(author) + "</p>" + (bits.length ? '<p class="rv-book-m">' + esc(bits.join(" · ")) + "</p>" : "") + '<p class="rv-book-s">' + line + "</p>" + "</span>";
    card.hidden = false;
  }
  var editing = null;
  function countChars() {
    var box = $("rvBody"), out = $("rvChars");
    if (!box || !out) {
      return 0;
    }
    var n = box.value.length;
    out.textContent = n + " of " + BODY_MAX + " characters";
    out.classList.toggle("is-over", n > BODY_MAX);
    return n;
  }
  function paintForm() {
    var wrap = $("rvFormWrap");
    var head = $("rvFormHead");
    var send = $("rvSend");
    var note = $("rvEditNote");
    var body = $("rvBody");
    var mine = $("rvMineState");
    if (!wrap) {
      return;
    }
    if (!chosen) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var own = Reviews.ownOn(chosen, whoEmail());
    editing = own ? own.id : null;
    if (own) {
      if (head) {
        head.textContent = "Your review";
      }
      if (send) {
        send.textContent = "Save changes";
      }
      if (note) {
        note.hidden = false;
      }
      if (body && document.activeElement !== body) {
        body.value = own.body;
      }
      setRating(own.rating);
      if (mine) {
        mine.innerHTML = statePill(own.state) + (own.state === "removed" && own.reason ? '<span class="rv-why"><b>Why it was removed:</b> ' + esc(own.reason) + "</span>" : "");
        mine.hidden = own.state === "published";
      }
    } else {
      if (head) {
        head.textContent = "Write a review";
      }
      if (send) {
        send.textContent = "Send for review";
      }
      if (note) {
        note.hidden = true;
      }
      if (body && document.activeElement !== body) {
        body.value = "";
      }
      setRating(0);
      if (mine) {
        mine.innerHTML = "";
        mine.hidden = true;
      }
    }
    countChars();
    setErr("rvBodyErr", false);
    setErr("rvRateErr", false);
    markInvalid("rvBody", false);
    markInvalid("rvRate", false);
  }
  function reviewHtml(r, who) {
    var own = String(r.owner || "") === who;
    var why = own && r.state === "removed" && r.reason ? '<p class="rv-why"><b>Why it was removed:</b> ' + esc(r.reason) + "</p>" : "";
    var when = r.edited ? "edited " + since(r.edited) : since(r.at);
    return '<article class="rv-item' + (r.state !== "published" ? " is-quiet" : "") + (own ? " is-own" : "") + '">' + '<p class="rv-meta"><b>' + esc(r.from) + "</b>" + (own ? ' <span class="rv-you">your review</span>' : "") + " · " + '<span title="' + esc(stamp(r.at)) + '">' + esc(when) + "</span>" + (own && r.state !== "published" ? " " + statePill(r.state) : "") + "</p>" + '<p class="rv-rating">' + starsHtml(r.rating) + "</p>" + '<p class="rv-body">' + esc(r.body) + "</p>" + why + "</article>";
  }
  function renderReviews() {
    var list = $("rvList");
    if (!list) {
      return;
    }
    fillPicker();
    paintBook();
    paintForm();
    var count = $("rvCount");
    var empty = $("rvEmpty");
    var wrap = $("rvListWrap");
    if (!chosen) {
      list.innerHTML = "";
      if (wrap) {
        wrap.hidden = true;
      }
      if (count) {
        count.textContent = "";
      }
      if (empty) {
        empty.hidden = true;
      }
      return;
    }
    if (wrap) {
      wrap.hidden = false;
    }
    var who = whoEmail();
    var rows = Reviews.visibleOn(chosen, who);
    var others = rows.filter(function(r) {
      return String(r.owner || "") !== who;
    });
    if (count) {
      var live = others.filter(function(r) {
        return r.state === "published";
      }).length;
      count.textContent = live ? live + (live === 1 ? " review from another parent" : " reviews from other parents") : "No reviews from other parents yet";
    }
    list.innerHTML = others.map(function(r) {
      return reviewHtml(r, who);
    }).join("");
    list.hidden = !others.length;
    if (empty) {
      empty.hidden = !!others.length;
    }
  }
  function notifyAdmins(row, isEdit) {
    if (!window.PTGNotify) {
      return;
    }
    window.PTGNotify.toAdmins({
      kind: "moderation",
      tone: "info",
      title: isEdit ? "An edited book review to re-check" : "New book review to review",
      body: "A review of “" + row.bookTitle + "” by " + row.from + " is waiting in the moderation queue.",
      go: "moderation",
      tag: "queue"
    });
  }
  function bootParent() {
    var sel = $("rvBook");
    var form = $("rvForm");
    var body = $("rvBody");
    bootRate();
    if (sel) {
      sel.addEventListener("change", function() {
        chosen = sel.value;
        renderReviews();
        if (!chosen) {
          say("Choose a book to see its reviews.");
          return;
        }
        var b = bookFor(chosen);
        var own = Reviews.ownOn(chosen, whoEmail());
        say((b ? bookLabel(b) : "That book") + ". " + (own ? "Your review of it is below and can be changed." : "You have not reviewed it yet."));
      });
    }
    if (body) {
      body.addEventListener("input", function() {
        countChars();
        if (body.getAttribute("aria-invalid") === "true") {
          markInvalid("rvBody", false);
          setErr("rvBodyErr", false);
        }
      });
    }
    if (!form) {
      return;
    }
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      if (!chosen) {
        say("Choose a book before writing a review.");
        if (sel) {
          sel.focus();
        }
        return;
      }
      var val = String((body || {}).value || "").trim();
      var badBody = val.length < BODY_MIN || val.length > BODY_MAX;
      var stars = rateValue();
      var badRate = !stars;
      setErr("rvBodyErr", badBody);
      markInvalid("rvBody", badBody);
      setErr("rvRateErr", badRate);
      markInvalid("rvRate", badRate);
      if (badRate || badBody) {
        say("Your review needs fixing before it can be sent.");
        var first = badRate ? document.querySelector('#rvRate [data-rv-star="1"]') : body;
        if (first) {
          first.focus();
        }
        return;
      }
      var b = bookFor(chosen);
      var own = Reviews.ownOn(chosen, whoEmail());
      var row;
      if (own) {
        row = Reviews.update(own.id, stars, val);
      } else {
        row = Reviews.add({
          bookTitle: b ? b.title : chosen.split("|")[0],
          bookAuthor: b ? b.author || "" : "",
          from: whoName(),
          owner: whoEmail(),
          rating: stars,
          body: val
        });
      }
      if (!row) {
        say("This browser is blocking local storage, so your review was not saved. " + "Nothing has been kept and nobody will see it.");
        return;
      }
      audit(own ? "Edited a book review" : "Wrote a book review", "“" + row.bookTitle + "” — held for review");
      notifyAdmins(row, !!own);
      renderReviews();
      say(own ? "Saved and sent back for review. Your earlier version has come off the book " + "until an administrator looks at the change." : "Sent for review. Nobody else can see it until an administrator publishes it. " + "It is above, marked as awaiting review.");
    });
  }
  function admSay(message) {
    var region = $("admRevSay");
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
      verdict = '<p class="rv-verdict"><b>Published</b> by ' + esc(r.decidedBy) + " " + esc(since(r.decidedAt).toLowerCase()) + "</p>";
    } else if (r.state === "removed") {
      verdict = '<p class="rv-verdict"><b>Removed</b> by ' + esc(r.decidedBy) + " " + esc(since(r.decidedAt).toLowerCase()) + (r.reason ? " — " + esc(r.reason) : "") + "</p>";
    }
    var acts = '<div class="rv-acts">';
    if (r.state !== "published") {
      acts += '<button class="btn btn--primary btn--sm" type="button" data-rvadm-pub="' + esc(r.id) + '">Publish<span class="vh"> the review of ' + esc(r.bookTitle) + " by " + esc(r.from) + "</span></button>";
    }
    if (r.state !== "removed") {
      acts += '<button class="btn btn--danger btn--sm" type="button" data-rvadm-rm="' + esc(r.id) + '">Remove<span class="vh"> the review of ' + esc(r.bookTitle) + " by " + esc(r.from) + "</span></button>";
    }
    if (r.state !== "pending") {
      acts += '<button class="btn btn--quiet btn--sm" type="button" data-rvadm-back="' + esc(r.id) + '">Put back in the queue<span class="vh"> — the review of ' + esc(r.bookTitle) + " by " + esc(r.from) + "</span></button>";
    }
    acts += "</div>";
    var edited = r.edited ? ' · <span class="rv-edited">edited, so back for a second look</span>' : "";
    return '<article class="rv-adm">' + '<p class="rv-meta">' + admStatePill(r.state) + " <b>" + esc(r.from) + "</b> · " + '<span title="' + esc(stamp(r.at)) + '">' + esc(since(r.edited || r.at)) + "</span>" + edited + "</p>" + '<p class="rv-adm-book">on <b>' + esc(r.bookTitle) + "</b>" + (r.bookAuthor ? " by " + esc(r.bookAuthor) : "") + "</p>" + '<p class="rv-rating">' + starsHtml(r.rating) + "</p>" + '<blockquote class="rv-quote">' + esc(r.body) + "</blockquote>" + verdict + acts + "</article>";
  }
  function renderAdmin() {
    var list = $("admRevList");
    if (!list) {
      return;
    }
    var pick = String(($("admRevState") || {}).value || "pending");
    var all = Reviews.list();
    var rows = pick ? all.filter(function(r) {
      return r.state === pick;
    }) : all;
    var count = $("admRevCount");
    if (count) {
      count.textContent = rows.length + (rows.length === 1 ? " review" : " reviews") + (pick === "pending" ? " waiting for review" : " in this part of the queue");
    }
    list.innerHTML = rows.map(admRow).join("");
    list.hidden = !rows.length;
    var empty = $("admRevEmpty");
    if (empty) {
      empty.classList.toggle("is-on", !rows.length);
    }
    var badge = $("admRevPending");
    if (badge) {
      var n = Reviews.countPending();
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
    var list = $("admRevList");
    var filter = $("admRevState");
    var dlg = $("reviewRemoveDialog");
    var form = $("reviewRemoveForm");
    if (filter) {
      filter.addEventListener("change", renderAdmin);
    }
    if (list) {
      list.addEventListener("click", function(e) {
        var t = e.target;
        if (!t || !t.closest) {
          return;
        }
        var pub = t.closest("[data-rvadm-pub]");
        if (pub) {
          decideFromConsole(pub.getAttribute("data-rvadm-pub"), "published", "");
          return;
        }
        var back = t.closest("[data-rvadm-back]");
        if (back) {
          decideFromConsole(back.getAttribute("data-rvadm-back"), "pending", "");
          return;
        }
        var rm = t.closest("[data-rvadm-rm]");
        if (rm && dlg) {
          removing = Reviews.find(rm.getAttribute("data-rvadm-rm"));
          removeTrigger = rm;
          if (!removing) {
            return;
          }
          var what = $("rvrWhat");
          if (what) {
            what.textContent = removing.body;
          }
          var on = $("rvrBook");
          if (on) {
            on.textContent = removing.bookTitle + (removing.bookAuthor ? " — " + removing.bookAuthor : "");
          }
          var sel = $("rvrReason");
          if (sel) {
            sel.selectedIndex = 0;
          }
          var wrap = $("rvrOtherWrap");
          if (wrap) {
            wrap.hidden = true;
          }
          var other = $("rvrOther");
          if (other) {
            other.value = "";
          }
          setErr("rvrOtherErr", false);
          markInvalid("rvrOther", false);
          openDialog(dlg);
          window.setTimeout(function() {
            if (sel) {
              sel.focus();
            }
          }, 40);
        }
      });
    }
    var reasonSel = $("rvrReason");
    if (reasonSel) {
      reasonSel.addEventListener("change", function() {
        var other = reasonSel.value === "other";
        var wrap = $("rvrOtherWrap");
        if (wrap) {
          wrap.hidden = !other;
        }
        if (other) {
          var el = $("rvrOther");
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
        var pick = String(($("rvrReason") || {}).value || "");
        var other = String(($("rvrOther") || {}).value || "").trim();
        var reason = pick === "other" ? other : pick;
        if (pick === "other" && other.length < 4) {
          e.preventDefault();
          setErr("rvrOtherErr", true);
          markInvalid("rvrOther", true);
          var el = $("rvrOther");
          if (el) {
            el.focus();
          }
          return;
        }
        setErr("rvrOtherErr", false);
        markInvalid("rvrOther", false);
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
    var row = Reviews.find(id);
    if (!row) {
      return;
    }
    var by = me();
    if (!Reviews.decide(id, state, reason, by)) {
      admSay("This browser would not store that decision. Nothing has changed.");
      return;
    }
    var word = state === "published" ? "Published" : state === "removed" ? "Removed" : "Put back in the queue";
    if (window.PTGAudit) {
      window.PTGAudit.write("moderation", word + " a book review of “" + row.bookTitle + "” by " + row.from, by, reason || "");
    }
    if (window.PTGNotify && row.owner && row.owner !== "guest") {
      if (state === "published") {
        window.PTGNotify.toParent(row.owner, {
          kind: "moderation",
          tone: "good",
          title: "Your review was published",
          body: "Your review of “" + row.bookTitle + "” is now on that book for other parents to read.",
          go: "library",
          tag: "review-" + row.id
        });
      } else if (state === "removed") {
        window.PTGNotify.toParent(row.owner, {
          kind: "moderation",
          tone: "warn",
          title: "Your review was removed",
          body: reason ? "The reason given was: " + reason : "No reason was recorded.",
          go: "library",
          tag: "review-" + row.id
        });
      }
    }
    renderAdmin();
    renderReviews();
    admSay(word + " the review of “" + row.bookTitle + "” by " + row.from + ".");
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
    seed();
    initSwitch($("libViews"), function(tab) {
      if (tab && tab.id === "libv-tab-reviews") {
        renderReviews();
      }
    });
    bootParent();
    bootAdmin();
    renderReviews();
    renderAdmin();
    Reviews.onChange(function() {
      renderReviews();
      renderAdmin();
    });
    watch("panel-library", renderReviews);
    watch("admpanel-moderation", renderAdmin);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
