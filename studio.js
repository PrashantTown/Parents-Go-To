(function() {
  "use strict";
  var A = window.PTGAvatar;
  var B = window.PTGBackdrop;
  if (!A || !B) {
    return;
  }
  var root = null;
  var current = {
    id: null,
    name: "",
    colour: "#0D3B32"
  };
  var tab = "chars";
  var lastFocus = null;
  function icon(d, size) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 20 20" fill="none" ' + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(id) {
    return document.getElementById(id);
  }
  function build() {
    if (root) {
      return;
    }
    root = document.createElement("div");
    root.id = "lookStudio";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "lkTitle");
    root.innerHTML = '<div class="lk-sheet">' + '<div class="lk-head">' + '<h2 id="lkTitle" tabindex="-1">Make it yours</h2>' + '<button class="lk-done" type="button" id="lkDone">' + icon('<path d="M4 10.5 8 14.5 16 6"/>', 17) + "Done</button>" + "</div>" + '<div class="lk-stage" id="lkStage">' + '<span class="lk-av" id="lkPreview"></span>' + '<span class="lk-nm" id="lkName"></span>' + "</div>" + '<div class="lk-tabs" role="tablist" aria-label="What to change">' + '<button type="button" role="tab" id="lktab-chars" aria-controls="lkpanel-chars" aria-selected="true" data-lk-tab="chars">' + icon('<circle cx="10" cy="10" r="7"/><path d="M7.5 8.5h.01M12.5 8.5h.01M7.4 12.2a3.4 3.4 0 0 0 5.2 0"/>') + "<span>Character</span></button>" + '<button type="button" role="tab" id="lktab-bg" aria-controls="lkpanel-bg" aria-selected="false" tabindex="-1" data-lk-tab="bg">' + icon('<rect x="2.6" y="4" width="14.8" height="12" rx="2"/><path d="M2.6 12.4 7 8.6l4 3.4 2.6-2.2 3.8 3"/>') + "<span>Background</span></button>" + "</div>" + '<div class="lk-body">' + '<div class="lk-panel" id="lkpanel-chars" role="tabpanel" aria-labelledby="lktab-chars" tabindex="-1"></div>' + '<div class="lk-panel" id="lkpanel-bg" role="tabpanel" aria-labelledby="lktab-bg" tabindex="-1" hidden></div>' + "</div>" + '<p class="lk-live" id="lkLive" role="status" aria-live="polite"></p>' + "</div>";
    document.body.appendChild(root);
    wire();
  }
  function say(msg) {
    var l = $("lkLive");
    if (l) {
      l.textContent = msg;
    }
  }
  function look() {
    return A.get(current.id);
  }
  var shown = "";
  function paintPreview() {
    var lk = look();
    B.apply($("lkStage"), lk.backdrop);
    if (B.ambient) {
      B.ambient($("lkStage"), lk.backdrop);
    }
    var sig = JSON.stringify(lk.avatar) + lk.backdrop;
    if (shown && sig !== shown) {
      var pv = $("lkPreview");
      pv.classList.remove("is-pop");
      void pv.offsetWidth;
      pv.classList.add("is-pop");
    }
    shown = sig;
    $("lkPreview").innerHTML = A.svg(lk.avatar, current.name, 150);
    $("lkPreview").setAttribute("aria-label", A.label(lk.avatar, current.name));
    $("lkName").textContent = current.name;
  }
  function paintChars() {
    var lk = look();
    var cur = lk.avatar;
    var html = "";
    for (var g = 0; g < A.GROUPS.length; g++) {
      var grp = A.GROUPS[g];
      html += '<h3 class="lk-h">' + esc(grp.name) + "</h3>" + '<div class="lk-grid">';
      for (var id in A.CHARACTERS) {
        if (!Object.prototype.hasOwnProperty.call(A.CHARACTERS, id)) {
          continue;
        }
        var c = A.CHARACTERS[id];
        if (c.group !== grp.id) {
          continue;
        }
        var on = cur.kind === "char" && cur.id === id;
        var spec = {
          kind: "char",
          id: id,
          bg: on ? cur.bg : c.bg
        };
        html += '<button class="lk-pick" type="button" data-char="' + esc(id) + '" aria-pressed="' + on + '">' + '<span class="lk-pick-av">' + A.svg(spec, current.name, 68) + "</span>" + '<span class="lk-pick-nm">' + esc(c.name) + "</span></button>";
      }
      html += "</div>";
    }
    var isLetter = cur.kind === "letter";
    html += '<h3 class="lk-h">Just my letter</h3><div class="lk-grid">' + '<button class="lk-pick" type="button" data-letter="1" aria-pressed="' + isLetter + '">' + '<span class="lk-pick-av">' + A.svg({
      kind: "letter",
      bg: current.colour
    }, current.name, 68) + "</span>" + '<span class="lk-pick-nm">' + esc(current.name.charAt(0).toUpperCase() || "?") + "</span></button></div>";
    html += colourRow("Circle colour", "charbg", cur.bg, A.PALETTE);
    $("lkpanel-chars").innerHTML = html;
  }
  function colourRow(label, key, active, list) {
    var html = '<h3 class="lk-h">' + esc(label) + '</h3><div class="lk-cols" role="group" aria-label="' + esc(label) + '">';
    for (var i = 0; i < list.length; i++) {
      var hex = list[i].hex || list[i];
      var nm = list[i].name || hex;
      html += '<button class="lk-col" type="button" data-col="' + key + '" data-hex="' + esc(hex) + '" style="--c:' + esc(hex) + '" aria-pressed="' + (String(active).toLowerCase() === String(hex).toLowerCase()) + '"><span class="vh">' + esc(nm) + "</span></button>";
    }
    return html + "</div>";
  }
  function paintBg() {
    var now = look().backdrop;
    var html = '<div class="lk-bgs" role="group" aria-label="Background">';
    for (var i = 0; i < B.LIST.length; i++) {
      var b = B.LIST[i];
      html += '<button class="lk-bg" type="button" data-bg="' + esc(b.id) + '" aria-pressed="' + (b.id === now) + '">' + '<span class="lk-bg-img" data-bd-swatch="' + esc(b.id) + '"></span>' + '<span class="lk-bg-nm">' + esc(b.name) + "</span></button>";
    }
    $("lkpanel-bg").innerHTML = html + "</div>";
    var sw = $("lkpanel-bg").querySelectorAll("[data-bd-swatch]");
    for (var s = 0; s < sw.length; s++) {
      sw[s].style.backgroundImage = B.uri(sw[s].getAttribute("data-bd-swatch"));
    }
  }
  function show(name) {
    tab = name;
    var names = [ "chars", "bg" ];
    for (var i = 0; i < names.length; i++) {
      var on = names[i] === name;
      var t = $("lktab-" + names[i]);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $("lkpanel-" + names[i]).hidden = !on;
    }
    if (name === "chars") {
      paintChars();
    }
    if (name === "bg") {
      paintBg();
    }
    $("lkpanel-" + name).scrollTop = 0;
  }
  function repaint() {
    paintPreview();
    if (tab === "chars") {
      paintChars();
    }
    if (tab === "bg") {
      paintBg();
    }
  }
  function wire() {
    root.addEventListener("click", function(e) {
      var t = e.target.closest ? e.target.closest("button") : null;
      if (!t || !root.contains(t)) {
        return;
      }
      if (t.id === "lkDone") {
        close();
        return;
      }
      var tabName = t.getAttribute("data-lk-tab");
      if (tabName) {
        show(tabName);
        return;
      }
      var ch = t.getAttribute("data-char");
      if (ch) {
        A.setAvatar(current.id, {
          kind: "char",
          id: ch,
          bg: A.CHARACTERS[ch].bg
        });
        say(A.CHARACTERS[ch].name + " chosen.");
        repaint();
        return;
      }
      if (t.getAttribute("data-letter")) {
        A.setAvatar(current.id, {
          kind: "letter",
          bg: current.colour
        });
        say("Back to your letter.");
        repaint();
        return;
      }
      var colKey = t.getAttribute("data-col");
      if (colKey) {
        var hex = t.getAttribute("data-hex");
        if (colKey === "charbg") {
          var cur = look().avatar;
          A.setAvatar(current.id, {
            kind: cur.kind,
            id: cur.id,
            parts: cur.parts,
            bg: hex
          });
        }
        repaint();
        return;
      }
      var bg = t.getAttribute("data-bg");
      if (bg) {
        A.setBackdrop(current.id, bg);
        say(B.get(bg).name + " background.");
        repaint();
        return;
      }
    });
    root.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("role") === "tab") {
        var names = [ "chars", "bg" ];
        var i = names.indexOf(t.getAttribute("data-lk-tab"));
        var n = -1;
        if (e.key === "ArrowRight") {
          n = (i + 1) % names.length;
        }
        if (e.key === "ArrowLeft") {
          n = (i - 1 + names.length) % names.length;
        }
        if (e.key === "Home") {
          n = 0;
        }
        if (e.key === "End") {
          n = names.length - 1;
        }
        if (n >= 0) {
          e.preventDefault();
          show(names[n]);
          $("lktab-" + names[n]).focus();
        }
      }
      if (e.key === "Tab") {
        var f = root.querySelectorAll("button, [tabindex]:not([tabindex='-1'])");
        var list = [];
        for (var k = 0; k < f.length; k++) {
          if (f[k].offsetParent !== null || f[k] === document.activeElement) {
            list.push(f[k]);
          }
        }
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
  function open(childId, name, colour) {
    build();
    current.id = String(childId);
    shown = "";
    current.name = String(name || "You");
    current.colour = colour || "#0D3B32";
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add("lk-open");
    show("chars");
    paintPreview();
    $("lkTitle").textContent = "Make it yours, " + current.name;
    $("lkTitle").focus();
  }
  function close() {
    if (!root || root.hidden) {
      return;
    }
    root.hidden = true;
    document.documentElement.classList.remove("lk-open");
    if (lastFocus && lastFocus.focus) {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }
  window.PTGStudio = {
    open: open,
    close: close
  };
})();
