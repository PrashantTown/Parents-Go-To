"use strict";

(function() {
  var PROJECTS = "ptg-projects-v1";
  var RESOURCES = "ptg-resources-v1";
  var AGES = [ "0–3", "3–5", "5–7", "7–9", "9–12", "12+" ];
  var ARROW = '<svg class="arrow" width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3.4 9h11M10 4.4 14.6 9 10 13.6"/></svg>';
  var m = /[?&]p=([a-z0-9-]{2,40})(?:&|$)/.exec(window.location.search || "");
  var slug = m ? m[1] : "";
  var signedIn = null;
  var filled = false;

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function safeImage(v) {
    v = String(v || "");
    return /^https:\/\/[^\s"'<>]+$/i.test(v) || /^[a-z0-9_-]+\.(png|jpe?g|svg|webp)$/.test(v) ? v : "";
  }
  function safeHttp(v) {
    v = String(v || "");
    return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : "";
  }
  function items(key) {
    try {
      var v = JSON.parse(window.PTGStore.getItem(key));
      return v && Array.isArray(v.items) ? v.items : null;
    } catch (e) {
      return null;
    }
  }
  function project() {
    var all = items(PROJECTS);
    if (!all) {
      return undefined;
    }
    return all.filter(function(p) {
      return p.slug === slug && p.status !== "hidden";
    })[0] || null;
  }
  function catName(p, id) {
    var hit = (p.categories || []).filter(function(c) {
      return c.id === id;
    })[0];
    return hit ? hit.name : "";
  }
  function host(url) {
    var h = /^https?:\/\/([^/?#]+)/i.exec(url);
    return h ? h[1].replace(/^www\./, "") : "";
  }
  function card(p, r) {
    var url = safeHttp(r.link);
    var c = catName(p, r.category);
    var tags = (c ? '<span class="proj-tag">' + esc(c) + "</span>" : "") + (r.ages ? '<span class="proj-tag">Ages ' + esc(r.ages) + "</span>" : "");
    return '<article class="proj-card"><p class="proj-card__kind">From the team</p><h3>' + esc(r.title) + "</h3>" + (r.body ? '<p class="proj-card__body">' + esc(r.body) + "</p>" : "") + (tags ? '<p class="proj-card__tags">' + tags + "</p>" : "") + (url ? '<a class="proj-card__open" href="' + esc(url) + '" target="_blank" rel="noopener nofollow">Open the resource<span class="vh">: ' + esc(r.title) + " (opens in a new tab)</span> <span aria-hidden=\"true\">&rarr;</span></a>" + '<p class="proj-card__src">' + esc(host(url)) + "</p>" : "") + "</article>";
  }
  function head(p) {
    var open = p.status === "open";
    document.title = p.title + " — Parents Go To";
    $("projCrumb").textContent = p.title;
    $("projTitle").textContent = open ? p.title : p.title + ": coming soon";
    $("projBlurb").textContent = p.blurb || "";
    $("projTag").hidden = false;
    $("projTag").textContent = open ? "Open now" : "Coming soon";
    $("projTag").className = "feature__tag" + (open ? "" : " feature__tag--soon");
    var img = safeImage(p.image);
    $("projLogo").hidden = !img;
    $("projLogo").innerHTML = img ? '<img src="' + esc(img) + '" alt="">' : "";
  }
  function acts(html) {
    $("projActs").innerHTML = html;
  }
  function fillFilters(p) {
    if (filled) {
      return;
    }
    filled = true;
    $("projCat").innerHTML = '<option value="">All categories</option>' + (p.categories || []).map(function(c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
    }).join("");
    $("projAge").innerHTML = '<option value="">Any age</option>' + AGES.map(function(a) {
      return '<option value="' + esc(a) + '">' + esc(a) + "</option>";
    }).join("");
  }
  function render() {
    var p = project();
    if (p === undefined) {
      return;
    }
    if (!p) {
      document.title = "Project not found — Parents Go To";
      $("projCrumb").textContent = "Not found";
      $("projTitle").textContent = "We could not find that project";
      $("projBlurb").textContent = "It may have moved or is not open yet. Head back to the home page to see what is available.";
      $("projTag").hidden = true;
      $("projLogo").hidden = true;
      $("projRes").hidden = true;
      acts('<a class="btn btn--lg" href="index.html">Back to home ' + ARROW + "</a>");
      return;
    }
    head(p);
    if (p.status !== "open") {
      $("projRes").hidden = true;
      acts('<a class="btn btn--lg" href="reading-for-pleasure.html">Go to Reading for pleasure ' + ARROW + '</a><a class="btn btn--ghost btn--lg" href="index.html">Back to home</a>');
      return;
    }
    if (signedIn === null) {
      acts("");
      return;
    }
    if (!signedIn) {
      $("projRes").hidden = true;
      acts('<a class="btn btn--lg" href="reading-for-pleasure.html#signin">Sign in to see the resources ' + ARROW + '</a><a class="btn btn--ghost btn--lg" href="reading-for-pleasure.html#create">Create a free account</a>');
      return;
    }
    acts("");
    fillFilters(p);
    var cat = $("projCat").value, age = $("projAge").value;
    var all = (items(RESOURCES) || []).filter(function(r) {
      return r.state === "published" && r.project === p.slug;
    }).sort(function(a, b) {
      return (b.at || 0) - (a.at || 0);
    });
    var list = all.filter(function(r) {
      return (!cat || !r.category || r.category === cat) && (!age || !r.ages || r.ages === age);
    });
    $("projRes").hidden = false;
    $("projGrid").innerHTML = list.map(function(r) {
      return card(p, r);
    }).join("");
    $("projGrid").hidden = !list.length;
    $("projCount").textContent = all.length ? list.length + (list.length === 1 ? " resource" : " resources") + (cat || age ? " match your filters" : "") : "";
    $("projEmpty").hidden = !!list.length;
    $("projEmpty").textContent = all.length ? "Nothing matches those filters. Try a different category or age band." : "Nothing has been shared here yet. When the team adds a guide or a link, it will appear here.";
  }
  function auth() {
    var B = window.PTGBackend;
    if (!B || !B.ready) {
      signedIn = false;
    } else if (B.restoring) {
      return;
    } else {
      signedIn = !!(B.me && B.me().id);
    }
    render();
  }
  if (!slug) {
    window.location.replace("index.html");
    return;
  }
  [ "projCat", "projAge" ].forEach(function(id) {
    $(id).addEventListener("change", render);
  });
  window.addEventListener("ptg:projects", render);
  window.addEventListener("ptg:resources", render);
  window.addEventListener("ptg:auth", auth);
  window.addEventListener("ptg:data", auth);
  window.setTimeout(auth, 4000);
  window.setTimeout(function() {
    if (project() !== undefined) {
      return;
    }
    $("projTitle").textContent = "This page could not load";
    $("projBlurb").textContent = "Check your connection and refresh the page, or head back to the home page.";
    acts('<a class="btn btn--lg" href="index.html">Back to home ' + ARROW + "</a>");
  }, 8000);
  auth();
  render();
})();
