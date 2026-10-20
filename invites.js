(function() {
  "use strict";
  var queue = [];
  var box = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) {
      n.className = cls;
    }
    if (text) {
      n.textContent = text;
    }
    return n;
  }

  function host() {
    return document.getElementById("app-main");
  }

  function close() {
    if (box && box.parentNode) {
      box.parentNode.removeChild(box);
    }
    box = null;
    queue.shift();
    if (queue.length) {
      render();
    }
  }

  function render() {
    var main = host();
    var invite = queue[0];
    if (!main || !invite) {
      return;
    }
    if (box && box.parentNode) {
      box.parentNode.removeChild(box);
    }
    box = el("div", "wrap invite-banner-wrap");
    var card = el("section", "invite-banner");
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "Family invitation");
    box.appendChild(card);

    var text = el("div", "invite-banner-text");
    text.appendChild(el("b", "", invite.from + " invited you to their family reading shelf"));
    text.appendChild(el("span", "", "Accept to see what their children are reading and chat with the family."));

    var acts = el("div", "invite-banner-acts");
    var yes = el("button", "btn btn--primary btn--sm", "Accept");
    yes.type = "button";
    var no = el("button", "btn btn--ghost btn--sm", "Not now");
    no.type = "button";
    acts.appendChild(yes);
    acts.appendChild(no);

    var note = el("p", "invite-banner-note");
    note.setAttribute("role", "status");

    card.appendChild(text);
    card.appendChild(acts);
    card.appendChild(note);
    main.insertBefore(box, main.firstChild);

    no.addEventListener("click", close);
    yes.addEventListener("click", function() {
      if (!window.PTGBackend || !window.PTGBackend.acceptInvite) {
        note.textContent = "Invitations cannot be accepted right now. Try again later.";
        return;
      }
      yes.disabled = true;
      no.disabled = true;
      note.textContent = "Accepting…";
      window.PTGBackend.acceptInvite(invite.ref).then(function() {
        card.classList.add("is-done");
        acts.hidden = true;
        note.textContent = "Invitation accepted. " + invite.from + "’s shelf is now under Shelves shared with you on your Profiles tab. ";
        var see = el("a", "link", "Open it now");
        see.href = "#profiles";
        see.addEventListener("click", function() {
          window.setTimeout(function() {
            var h = document.getElementById("h-shared");
            if (h) {
              h.scrollIntoView({ block: "start" });
              h.focus();
            }
          }, 300);
          if (box === mine) {
            close();
          }
        });
        note.appendChild(see);
        var mine = box;
        window.setTimeout(function() {
          if (box === mine) {
            close();
          }
        }, 12000);
      }, function(err) {
        yes.disabled = false;
        no.disabled = false;
        note.textContent = err && err.message ? err.message : "That did not work. Try again.";
      });
    });
  }

  window.PTGInviteBanner = {
    show: function(list) {
      (list || []).forEach(function(item) {
        if (item && item.ref && !queue.some(function(q) {
          return q.ref === item.ref;
        })) {
          queue.push(item);
        }
      });
      if (!box) {
        render();
      }
    }
  };

  window.addEventListener("ptg:session", function() {
    if (window.PTGSession && window.PTGSession.active && !window.PTGSession.active()) {
      queue = [];
      if (box && box.parentNode) {
        box.parentNode.removeChild(box);
      }
      box = null;
    }
  });
})();
