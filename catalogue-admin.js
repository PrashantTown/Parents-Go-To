"use strict";

(function() {
  var KEY = "ptg-catalogue-v1";
  var STEP = 24;
  var SOURCES = [
    [ "cbca", "CBCA Book of the Year" ],
    [ "slq", "State Library of Queensland" ],
    [ "aba", "Kids’ Reading Guide" ],
    [ "laureate", "Children’s Laureate" ],
    [ "commonsense", "Common Sense Media" ],
    [ "other", "Other" ]
  ];
  var AGES = [ "0–3", "3–5", "5–7", "7–9", "9–12", "12+" ];
  var CATS = [
    [ "picture", "Picture books" ], [ "early", "Early readers" ], [ "chapter", "Chapter books" ], [ "nonfic", "Non-fiction" ],
    [ "poetry", "Poetry & rhyme" ], [ "graphic", "Graphic novels" ], [ "bedtime", "Bedtime stories" ], [ "bilingual", "Bilingual" ]
  ];
  var TONES = {
    picture: [ "#F7E7E4", "#8E3324", "#B3402E" ], early: [ "#FBEEDA", "#8A5A12", "#E9A13B" ], chapter: [ "#E1EDF2", "#0A6280", "#0A6280" ],
    nonfic: [ "#DFF0E5", "#245B41", "#2C6B4F" ], poetry: [ "#E2E9EF", "#123F5B", "#123F5B" ], graphic: [ "#DBF1EF", "#05635C", "#01A79A" ],
    bedtime: [ "#E3E8EC", "#06283C", "#06283C" ], bilingual: [ "#E4EDF1", "#245566", "#2F6E86" ]
  };
  var LINKS = [ [ "catLink", "link" ], [ "catRead", "readLink" ], [ "catWatch", "watchLink" ], [ "catCover", "cover" ] ];
  var page = 1;
  var editing = null;
  var opener = null;

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function catLabel(id) {
    var hit = CATS.filter(function(c) {
      return c[0] === id;
    })[0];
    return hit ? hit[1] : "";
  }
  function inkOn(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    var lin = function(c) {
      c /= 255;
      return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
    };
    var l = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
    return l > .42 ? "#13221E" : "#FFFFFF";
  }
  function https(v) {
    return /^https:\/\/[^\s"'<>]+$/i.test(String(v || "")) ? String(v) : "";
  }
  function card(c) {
    var off = c.state === "hidden";
    var tone = TONES[c.category];
    var spine = tone ? tone[2] : "#0A6280";
    var img = https(c.cover) ? '<img src="' + esc(c.cover) + '" alt="" loading="lazy" data-drop-broken>' : "";
    var cover = '<span class="cover disc-cover" style="--spine:' + spine + ";color:" + inkOn(spine) + '">' + img + '<span class="ct">' + esc(c.title) + "</span>" + '<span class="ca">' + esc(c.author || "") + "</span></span>";
    var free = !!(https(c.readLink) || https(c.watchLink));
    var tags = (tone ? '<span class="tag tag--cat" style="--tint:' + tone[0] + ";--tone:" + tone[1] + '">' + esc(catLabel(c.category)) + "</span>" : "") + (c.ages ? '<span class="tag">Ages ' + esc(c.ages) + "</span>" : "") + (c.year ? '<span class="tag">' + esc(c.year) + "</span>" : "") + (c.pages ? '<span class="tag">' + esc(c.pages) + " pages</span>" : "") + (free ? '<span class="tag tag--free">Free to read</span>' : "") + (off ? '<span class="pill pill--draft">Hidden from families</span>' : "");
    var acts = '<button class="btn btn--ghost btn--sm" type="button" data-cat-edit="' + esc(c.id) + '">Edit<span class="vh"> ' + esc(c.title) + "</span></button>" + '<button class="btn btn--quiet btn--sm" type="button" data-cat-toggle="' + esc(c.id) + '">' + (off ? "Show" : "Hide") + '<span class="vh"> ' + esc(c.title) + "</span></button>" + '<button class="btn btn--quiet btn--sm cat-del" type="button" data-cat-del="' + esc(c.id) + '">Delete<span class="vh"> ' + esc(c.title) + "</span></button>";
    return '<article class="disc-card adm-cat-card' + (off ? " is-hidden" : "") + '">' + cover + '<div class="disc-body">' + '<p class="disc-src">' + esc(sourceName(c.source)) + "</p>" + '<h3 class="disc-title cat-row-title">' + esc(c.title) + "</h3>" + '<p class="disc-author">' + esc(c.author || "Author unknown") + "</p>" + (c.note ? '<p class="disc-note">' + esc(c.note) + "</p>" : "") + '<div class="book-meta">' + tags + "</div>" + '<div class="disc-acts">' + acts + "</div>" + "</div></article>";
  }
  function pagerHtml(at, pages) {
    var nums = [], i;
    for (i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - at) <= 1) {
        nums.push(i);
      } else if (nums[nums.length - 1] !== 0) {
        nums.push(0);
      }
    }
    var chev = function(d) {
      return '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    };
    return '<button type="button" class="pager-btn pager-step" data-page="' + (at - 1) + '"' + (at <= 1 ? " disabled" : "") + ">" + chev("m12 4.5-5.5 5.5 5.5 5.5") + '<span class="pager-word">Previous</span><span class="vh"> page</span></button>' + '<ol class="pager-nums">' + nums.map(function(n) {
      return n === 0 ? '<li class="pager-gap" aria-hidden="true">…</li>' : '<li><button type="button" class="pager-btn" data-page="' + n + '"' + (n === at ? ' aria-current="page"' : "") + '><span class="vh">Page </span>' + n + "</button></li>";
    }).join("") + "</ol>" + '<button type="button" class="pager-btn pager-step" data-page="' + (at + 1) + '"' + (at >= pages ? " disabled" : "") + '><span class="pager-word">Next</span><span class="vh"> page</span>' + chev("m8 4.5 5.5 5.5L8 15.5") + "</button>";
  }
  function sourceName(id) {
    var hit = SOURCES.filter(function(s) {
      return s[0] === id;
    })[0];
    return hit ? hit[1] : "Other";
  }
  function read() {
    try {
      var raw = JSON.parse(window.PTGStore.getItem(KEY));
      return raw && Array.isArray(raw.items) ? raw.items : [];
    } catch (e) {
      return [];
    }
  }
  function write(items) {
    window.PTGStore.setItem(KEY, JSON.stringify({ items: items }));
    window.dispatchEvent(new CustomEvent("ptg:catalogue"));
  }
  function audit(what, detail) {
    if (window.PTGAudit && window.PTGAudit.write) {
      var S = window.PTGSession;
      window.PTGAudit.write("content", what, S ? S.email() : "", detail || "");
    }
  }
  function say(text) {
    var el = $("catSay");
    if (el) {
      el.textContent = text;
    }
  }
  function options(list, blank) {
    return (blank ? '<option value="">' + esc(blank) + "</option>" : "") + list.map(function(o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '">' + esc(t) + "</option>";
    }).join("");
  }
  function render() {
    var list = $("catList");
    if (!list) {
      return;
    }
    var q = String($("catSearch").value || "").trim().toLowerCase();
    var src = $("catSourceF").value, st = $("catStateF").value;
    var all = read();
    var rows = all.filter(function(c) {
      if (src && (c.source || "other") !== src) {
        return false;
      }
      if (st && (c.state === "hidden" ? "hidden" : "published") !== st) {
        return false;
      }
      return !q || (c.title + " " + (c.author || "")).toLowerCase().indexOf(q) !== -1;
    });
    var hidden = all.filter(function(c) {
      return c.state === "hidden";
    }).length;
    $("catCount").textContent = !all.length ? "No books in the catalogue yet. If you have just set it up, run the catalogue migrations in Supabase first." : rows.length + " of " + all.length + " books" + (hidden ? " · " + hidden + " hidden from families" : "");
    var pages = Math.max(1, Math.ceil(rows.length / STEP));
    page = Math.min(Math.max(1, page), pages);
    list.innerHTML = rows.slice((page - 1) * STEP, page * STEP).map(card).join("");
    list.hidden = !rows.length;
    var pager = $("catPager");
    if (pager) {
      pager.hidden = pages < 2;
      pager.innerHTML = pages < 2 ? "" : pagerHtml(page, pages);
    }
  }
  function setErr(id, on) {
    var el = $(id + "Err");
    if (el) {
      el.classList.toggle("is-on", !!on);
    }
    var input = $(id);
    if (input) {
      if (on) {
        input.setAttribute("aria-invalid", "true");
      } else {
        input.removeAttribute("aria-invalid");
      }
    }
  }
  function openForm(item, from) {
    editing = item || null;
    opener = from || null;
    var c = item || { source: "other", ages: "", category: "", state: "published" };
    $("catDlgTitle").textContent = item ? "Edit book" : "Add a book";
    $("catTitle").value = c.title || "";
    $("catAuthor").value = c.author || "";
    $("catSource").value = c.source || "other";
    $("catYear").value = c.year || "";
    $("catPages").value = c.pages || "";
    $("catAges").value = c.ages || "";
    $("catCat").value = c.category || "";
    $("catNote").value = c.note || "";
    LINKS.forEach(function(l) {
      $(l[0]).value = c[l[1]] || "";
      setErr(l[0], false);
    });
    $("catShown").checked = c.state !== "hidden";
    setErr("catTitle", false);
    var dlg = $("catDialog");
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
    window.setTimeout(function() {
      $("catTitle").focus();
    }, 40);
  }
  function closeForm() {
    var dlg = $("catDialog");
    if (typeof dlg.close === "function") {
      dlg.close();
    } else {
      dlg.removeAttribute("open");
    }
  }
  function boot() {
    if (!$("catList") || !$("catDialog") || !window.PTGStore) {
      return;
    }
    $("catSourceF").innerHTML = options(SOURCES, "All lists");
    $("catSource").innerHTML = options(SOURCES);
    $("catAges").innerHTML = options(AGES, "Any age");
    $("catCat").innerHTML = options(CATS, "No category");
    var again = function() {
      page = 1;
      render();
    };
    $("catSearch").addEventListener("input", again);
    $("catSourceF").addEventListener("change", again);
    $("catStateF").addEventListener("change", again);
    $("catPager").addEventListener("click", function(e) {
      var b = e.target.closest ? e.target.closest("[data-page]") : null;
      if (!b || b.disabled) {
        return;
      }
      page = parseInt(b.getAttribute("data-page"), 10) || 1;
      render();
      var head = $("h-adm-catalogue");
      if (head) {
        head.scrollIntoView({ block: "start", behavior: "auto" });
        head.focus({ preventScroll: true });
      }
    });
    $("catNew").addEventListener("click", function() {
      openForm(null, $("catNew"));
    });
    $("catList").addEventListener("click", function(e) {
      var t = e.target.closest ? e.target.closest("[data-cat-edit], [data-cat-toggle], [data-cat-del]") : null;
      if (!t) {
        return;
      }
      var id = t.getAttribute("data-cat-edit") || t.getAttribute("data-cat-toggle") || t.getAttribute("data-cat-del");
      var items = read();
      var item = items.filter(function(c) {
        return c.id === id;
      })[0];
      if (!item) {
        return;
      }
      if (t.hasAttribute("data-cat-edit")) {
        openForm(item, t);
        return;
      }
      if (t.hasAttribute("data-cat-toggle")) {
        item.state = item.state === "hidden" ? "published" : "hidden";
        write(items);
        audit((item.state === "hidden" ? "Hid " : "Showed ") + "the catalogue book “" + item.title + "”");
        say(item.title + (item.state === "hidden" ? " is now hidden from families." : " is now shown to families."));
        render();
        var again2 = $("catList").querySelector('[data-cat-toggle="' + id + '"]');
        if (again2) {
          again2.focus();
        }
        return;
      }
      if (!window.confirm("Delete “" + item.title + "” from the catalogue? Families who already added it keep it on their shelf.")) {
        return;
      }
      write(items.filter(function(c) {
        return c.id !== id;
      }));
      audit("Deleted the catalogue book “" + item.title + "”");
      say(item.title + " was deleted from the catalogue.");
      render();
      $("h-adm-catalogue").focus();
    });
    $("catForm").addEventListener("submit", function(e) {
      e.preventDefault();
      var title = $("catTitle").value.trim();
      var ok = true;
      setErr("catTitle", !title);
      if (!title) {
        ok = false;
      }
      LINKS.forEach(function(l) {
        var v = $(l[0]).value.trim();
        var bad = !!v && !/^https:\/\/[^\s]+$/i.test(v);
        setErr(l[0], bad);
        if (bad) {
          ok = false;
        }
      });
      if (!ok) {
        var first = $("catForm").querySelector('[aria-invalid="true"]');
        if (first) {
          first.focus();
        }
        return;
      }
      var year = parseInt($("catYear").value, 10), pages = parseInt($("catPages").value, 10);
      var data = {
        title: title,
        author: $("catAuthor").value.trim(),
        source: $("catSource").value || "other",
        year: year >= 1600 && year <= 2100 ? year : null,
      pages: pages >= 1 && pages <= 5000 ? pages : null,
        ages: $("catAges").value,
        category: $("catCat").value,
        note: $("catNote").value.trim(),
        state: $("catShown").checked ? "published" : "hidden"
      };
      LINKS.forEach(function(l) {
        data[l[1]] = $(l[0]).value.trim();
      });
      var items = read();
      if (editing) {
        items.forEach(function(c) {
          if (c.id === editing.id) {
            Object.keys(data).forEach(function(k) {
              c[k] = data[k];
            });
          }
        });
        audit("Edited the catalogue book “" + title + "”");
        say("Saved changes to " + title + ".");
      } else {
        var top = items.reduce(function(m, c) {
          return Math.min(m, Number(c.sort) || 0);
        }, 0);
        data.id = window.PTGStore.uuid();
        data.sort = top - 10;
        items.unshift(data);
        audit("Added the catalogue book “" + title + "”");
        say(title + " was added to the catalogue. Families see it under Discover books.");
      }
      write(items);
      closeForm();
      if (!editing) {
        page = 1;
      }
      render();
      if (opener && document.contains(opener)) {
        opener.focus();
      } else {
        $("h-adm-catalogue").focus();
      }
    });
    window.addEventListener("ptg:catalogue", render);
    window.addEventListener("ptg:store", function(e) {
      if (e.detail && e.detail.key === KEY) {
        render();
      }
    });
    render();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
