"use strict";

(function() {
  var KEY = "ptg-projects-v1";
  var NUMBERS = [ "No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten" ];
  var ARROW = '<svg class="arrow" width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3.4 9h11M10 4.4 14.6 9 10 13.6"/></svg>';
  var box = document.querySelector("#services .offers");
  if (!box || !window.PTGStore) {
    return;
  }
  var head = document.querySelector("#services .sectionhead h2");
  var intro = document.querySelector("#services .sectionhead p:not(.eyebrow)");
  var originalHead = head ? head.textContent : "";
  var originalIntro = intro ? intro.innerHTML : "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function safeLink(v) {
    v = String(v || "");
    return /^https:\/\/[^\s"'<>]+$/i.test(v) || /^[a-z0-9-]+\.html$/.test(v) ? v : "";
  }
  function safeImage(v) {
    v = String(v || "");
    return /^https:\/\/[^\s"'<>]+$/i.test(v) || /^[a-z0-9_-]+\.(png|jpe?g|svg|webp)$/.test(v) ? v : "";
  }
  function read() {
    try {
      var v = JSON.parse(window.PTGStore.getItem(KEY));
      return v && Array.isArray(v.items) ? v.items : null;
    } catch (e) {
      return null;
    }
  }
  function hrefOf(p) {
    return safeLink(p.link) || "project.html?p=" + encodeURIComponent(p.slug);
  }
  function isOutside(url) {
    return /^https:/i.test(url);
  }
  function linkAttrs(url) {
    return 'href="' + esc(url) + '"' + (isOutside(url) ? ' target="_blank" rel="noopener"' : "");
  }
  function tile(p) {
    var rfp = p.slug === "reading-for-pleasure";
    var open = p.status === "open";
    var url = hrefOf(p);
    var img = safeImage(p.image);
    var media = !img ? "" : rfp ? '<img class="feature__mark" src="' + esc(img) + '" alt="" width="56" height="51" aria-hidden="true">' : '<span class="offer__logo"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></span>';
    var tag = open ? '<p class="feature__tag">Open now</p>' : '<p class="feature__tag feature__tag--soon">Coming soon</p>';
    var acts = rfp && open ? '<a class="btn btn--light" ' + linkAttrs(url) + ">Open " + esc(p.title) + " " + ARROW + "</a>" + '<a class="btn btn--onpine" href="services.html">Read the full details</a>' : open ? '<a class="btn btn--light" ' + linkAttrs(url) + ">Open " + esc(p.title) + " " + ARROW + "</a>" : '<a class="btn" ' + linkAttrs(url) + ">Take a look " + ARROW + "</a>";
    return '<div class="feature offer' + (open ? "" : " offer--soon") + '" data-href="' + esc(url) + '">' + media + tag + "<h3><a " + linkAttrs(url) + ">" + esc(p.title) + "</a></h3>" + (p.blurb ? "<p>" + esc(p.blurb) + "</p>" : "") + '<div class="actions">' + acts + "</div></div>";
  }
  function headline(open, soon) {
    var o = open === 1 ? "One project open now" : (NUMBERS[open] || String(open)) + " projects open now";
    if (!soon) {
      return o + ".";
    }
    return o + ", " + (soon === 1 ? (open ? "another" : "one") : (open ? (NUMBERS[soon] || String(soon)).toLowerCase() + " more" : (NUMBERS[soon] || String(soon)).toLowerCase())) + " on the way.";
  }
  function render() {
    var items = read();
    if (!items || !items.length) {
      return;
    }
    var shown = items.filter(function(p) {
      return p && p.slug && p.title && p.status !== "hidden";
    }).sort(function(a, b) {
      return (Number(a.sort) || 0) - (Number(b.sort) || 0);
    });
    if (!shown.length) {
      return;
    }
    box.innerHTML = shown.map(tile).join("");
    box.classList.toggle("offers--one", shown.length === 1);
    var open = shown.filter(function(p) {
      return p.status === "open";
    }).length;
    var soon = shown.length - open;
    var usual = shown.length === 2 && shown[0].slug === "reading-for-pleasure" && shown[0].status === "open" && shown[1].slug === "four-voices" && shown[1].status === "soon";
    if (head) {
      head.textContent = usual ? originalHead : headline(open, soon);
    }
    if (intro) {
      if (usual) {
        intro.innerHTML = originalIntro;
      } else {
        intro.textContent = "Each project has its own tile, and everything in it is checked before it is shared. Pick one to get started.";
      }
    }
  }
  window.addEventListener("ptg:projects", render);
  window.addEventListener("ptg:store", function(e) {
    if (e.detail && e.detail.key === KEY) {
      render();
    }
  });
  render();
})();
