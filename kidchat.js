(function() {
  "use strict";
  var C = window.PTGChat;
  var UI = window.PTGChatBox;
  if (!C || !UI) {
    return;
  }
  var root = null;
  var box = null;
  var lastFocus = null;
  var current = {
    id: null,
    name: ""
  };
  var sendAs = "adult";
  var kidOnly = false;
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(id) {
    return document.getElementById(id);
  }
  function icon(d, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 20 20" ' + 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' + 'stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  function account() {
    var s = window.PTGSession;
    var v = s && typeof s.email === "function" ? s.email() : "";
    return String(v || "").trim().toLowerCase() || "guest";
  }
  function grownUpName() {
    var s = window.PTGSession;
    var v = s && typeof s.name === "function" ? s.name() : "";
    return String(v || "").trim() || "Grown-up";
  }
  function ids() {
    var acct = account();
    return {
      account: acct,
      adult: C.ADULT(acct),
      kid: C.CHILD(acct, current.id)
    };
  }
  function thread() {
    var i = ids();
    var names = {};
    names[i.adult] = grownUpName();
    names[i.kid] = current.name;
    return C.open({
      kind: "family",
      key: "family:" + i.account + ":" + current.id,
      title: current.name,
      account: i.account,
      members: [ i.adult, i.kid ],
      names: names
    });
  }
  function unread(childId) {
    var acct = account();
    var key = "family:" + acct + ":" + childId;
    var rows = C.threads("family", C.ADULT(acct)).filter(function(t) {
      return t.key === key;
    });
    return rows.length ? C.unread(rows[0].id, C.ADULT(acct)) : 0;
  }
  function build() {
    if (root) {
      return;
    }
    root = document.createElement("div");
    root.id = "kidChat";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "kcTitle");
    root.innerHTML = '<div class="kc-sheet">' + '<div class="kc-head">' + '<span class="kc-av" id="kcAv" aria-hidden="true"></span>' + '<div class="kc-head-txt">' + '<h2 id="kcTitle" tabindex="-1"></h2>' + '<p id="kcSub"></p>' + "</div>" + '<button class="kc-x" type="button" id="kcClose" aria-label="Close messages">' + icon('<path d="m5 5 10 10M15 5 5 15"/>', 18) + "</button>" + "</div>" + '<div class="kc-as" role="group" aria-label="Sending as">' + '<span class="kc-as-lbl">Sending as</span>' + '<span class="kc-as-seg">' + '<button type="button" class="kc-as-b" data-kc-as="adult" id="kcAsAdult"></button>' + '<button type="button" class="kc-as-b" data-kc-as="kid" id="kcAsKid"></button>' + "</span>" + "</div>" + '<div class="kc-box" id="kcBox"></div>' + "</div>";
    document.body.appendChild(root);
    root.addEventListener("click", function(e) {
      if (e.target === root) {
        close();
        return;
      }
      var t = e.target.closest ? e.target.closest("button") : null;
      if (!t || !root.contains(t)) {
        return;
      }
      if (t.id === "kcClose") {
        close();
        return;
      }
      var as = t.getAttribute("data-kc-as");
      if (as && !kidOnly && as !== sendAs) {
        sendAs = as;
        paint();
      }
    });
    document.addEventListener("keydown", function(e) {
      if (!root || root.hidden) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        var f = root.querySelectorAll("button, textarea, [tabindex]:not([tabindex='-1'])");
        var list = Array.prototype.filter.call(f, function(el) {
          return el.offsetParent !== null;
        });
        if (!list.length) {
          return;
        }
        var first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }
  function paint() {
    var t = thread();
    if (!t) {
      return;
    }
    var i = ids();
    var tint = function(id) {
      return UI.colourFor ? UI.colourFor(id) : "#0D3B32";
    };
    var dot = function(id, name) {
      return '<span class="kc-dot" style="--av:' + esc(tint(id)) + '">' + esc(String(name).charAt(0).toUpperCase()) + "</span>";
    };
    var them = kidOnly ? i.adult : i.kid;
    var av = $("kcAv");
    av.textContent = String(kidOnly ? grownUpName() : current.name).charAt(0).toUpperCase();
    av.style.setProperty("--av", tint(them));
    if (!kidOnly) {
      $("kcAsAdult").innerHTML = dot(i.adult, grownUpName()) + esc(grownUpName());
      $("kcAsAdult").setAttribute("aria-pressed", sendAs === "adult" ? "true" : "false");
      $("kcAsKid").innerHTML = dot(i.kid, current.name) + esc(current.name);
      $("kcAsKid").setAttribute("aria-pressed", sendAs === "kid" ? "true" : "false");
    }
    if (box) {
      box.destroy();
    }
    box = UI.mount($("kcBox"), {
      threadId: t.id,
      who: sendAs === "kid" ? i.kid : i.adult,
      placeholder: "Write a message…",
      empty: kidOnly ? "No messages yet. Say hello." : "No messages yet. Ask what they are reading."
    });
  }
  function open(childId, name, opts) {
    build();
    current.id = String(childId);
    current.name = String(name || "your child");
    kidOnly = !!(opts && opts.asKid);
    sendAs = kidOnly ? "kid" : "adult";
    lastFocus = document.activeElement;
    root.hidden = false;
    root.classList.toggle("kc--overlay", kidOnly);
    var asRow = root.querySelector(".kc-as");
    if (asRow) {
      asRow.hidden = kidOnly;
    }
    document.documentElement.classList.add("kc-open");
    $("kcTitle").textContent = "Messages with " + (kidOnly ? grownUpName() : current.name);
    $("kcSub").textContent = "Private · just you two · text only";
    paint();
    $("kcTitle").focus();
  }
  function close() {
    if (!root || root.hidden) {
      return;
    }
    if (box) {
      box.destroy();
      box = null;
    }
    root.hidden = true;
    document.documentElement.classList.remove("kc-open");
    if (lastFocus && lastFocus.focus) {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }
  function refreshBadges() {
    var btns = document.querySelectorAll("[data-chat]");
    var i, btn, n, pip;
    for (i = 0; i < btns.length; i++) {
      btn = btns[i];
      n = unread(btn.getAttribute("data-chat"));
      pip = btn.querySelector(".chat-n");
      if (!n) {
        if (pip) {
          pip.parentNode.removeChild(pip);
        }
        continue;
      }
      if (!pip) {
        pip = document.createElement("span");
        pip.className = "chat-n";
        btn.appendChild(document.createTextNode(" "));
        btn.appendChild(pip);
      }
      pip.textContent = n > 9 ? "9+" : String(n);
    }
  }
  function kidUnread(childId) {
    var acct = account();
    var key = "family:" + acct + ":" + childId;
    var me = C.CHILD(acct, childId);
    var rows = C.threads("family", me).filter(function(t) {
      return t.key === key;
    });
    return rows.length ? C.unread(rows[0].id, me) : 0;
  }
  function badge(host, n, label) {
    if (!host) {
      return;
    }
    var pip = host.querySelector(":scope > .unread-badge");
    if (!n) {
      if (pip) {
        host.removeChild(pip);
      }
      return;
    }
    if (!pip) {
      pip = document.createElement("span");
      pip.className = "unread-badge";
      host.appendChild(pip);
    }
    var text = n > 9 ? "9+" : String(n);
    if (pip.textContent !== text) {
      pip.textContent = text;
    }
    var aria = n + " new " + (n === 1 ? "message" : "messages") + (label ? " " + label : "");
    if (pip.getAttribute("aria-label") !== aria) {
      pip.setAttribute("role", "status");
      pip.setAttribute("aria-label", aria);
    }
  }
  function refreshKidBadges() {
    var space = $("kids");
    if (!space) {
      return;
    }
    var kid = space.getAttribute("data-current-kid") || "";
    var n = kid ? kidUnread(kid) : 0;
    badge(space.querySelector('#kidsTabs [data-ktab="messages"]'), n, "from your grown-up");
    badge($("kidsMsgAdult"), n, "from your grown-up");
    var who = $("kidsWhoList");
    if (who) {
      Array.prototype.forEach.call(who.querySelectorAll("[data-kid]"), function(b) {
        badge(b, kidUnread(b.getAttribute("data-kid")), "");
      });
    }
  }
  function refreshAll() {
    refreshBadges();
    refreshKidBadges();
  }
  function watchKids() {
    var space = $("kids");
    if (!space || !window.MutationObserver) {
      return;
    }
    new MutationObserver(refreshKidBadges).observe(space, {
      attributes: true,
      attributeFilter: [ "data-current-kid", "hidden" ]
    });
    if ($("kidsWhoList")) {
      new MutationObserver(refreshKidBadges).observe($("kidsWhoList"), {
        childList: true
      });
    }
  }
  C.onChange(refreshAll);
  window.addEventListener("ptg:session", refreshAll);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      watchKids();
      refreshAll();
    });
  } else {
    watchKids();
    refreshAll();
  }
  window.PTGKidChat = {
    open: open,
    close: close,
    unread: unread,
    kidUnread: kidUnread,
    refreshBadges: refreshAll
  };
})();
