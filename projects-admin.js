"use strict";

(function() {
  var KEY = "ptg-projects-v1";
  var RES = "ptg-resources-v1";
  var MAIN = "reading-for-pleasure";
  var BUILT_IN = [ "reading-for-pleasure", "four-voices" ];
  var STATUS = { open: "Open now", soon: "Coming soon", hidden: "Hidden" };
  var editing = null;
  var opener = null;
  var slugTouched = false;

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
  }
  function read() {
    try {
      var v = JSON.parse(window.PTGStore.getItem(KEY));
      return v && Array.isArray(v.items) ? v.items.slice().sort(function(a, b) {
        return (Number(a.sort) || 0) - (Number(b.sort) || 0);
      }) : [];
    } catch (e) {
      return [];
    }
  }
  function write(items) {
    window.PTGStore.setItem(KEY, JSON.stringify({ items: items }));
    window.dispatchEvent(new CustomEvent("ptg:projects"));
  }
  function resourcesFor(slug) {
    try {
      var v = JSON.parse(window.PTGStore.getItem(RES));
      return (v && Array.isArray(v.items) ? v.items : []).filter(function(r) {
        return (r.project || MAIN) === slug;
      }).length;
    } catch (e) {
      return 0;
    }
  }
  function audit(what) {
    if (window.PTGAudit && window.PTGAudit.write) {
      var S = window.PTGSession;
      window.PTGAudit.write("content", what, S ? S.email() : "", "");
    }
  }
  function say(text) {
    $("projSay").textContent = text;
  }
  function render() {
    var list = $("projList");
    if (!list) {
      return;
    }
    var all = read();
    var shown = all.filter(function(p) {
      return p.status !== "hidden";
    }).length;
    $("projCountA").textContent = !all.length ? "No projects yet. If you have just set this up, run the projects migration in Supabase first." : all.length + (all.length === 1 ? " project" : " projects") + " · " + shown + " shown on the home page";
    list.innerHTML = all.map(function(p, i) {
      var builtIn = BUILT_IN.indexOf(p.slug) !== -1;
      var n = resourcesFor(p.slug);
      var cats = p.slug === MAIN ? "Uses the book categories" : (p.categories || []).length + ((p.categories || []).length === 1 ? " category" : " categories");
      var pill = '<span class="pill ' + (p.status === "open" ? "pill--published" : "pill--draft") + '">' + esc(STATUS[p.status] || p.status) + "</span>";
      return '<li class="cat-row' + (p.status === "hidden" ? " is-hidden" : "") + '">' + '<div class="cat-row-main">' + '<p class="cat-row-title">' + esc(p.title) + " " + pill + "</p>" + '<p class="cat-row-meta">' + esc([ p.link || "project.html?p=" + p.slug, cats, n + (n === 1 ? " resource" : " resources") ].join(" · ")) + "</p>" + (p.blurb ? '<p class="cat-row-note">' + esc(p.blurb) + "</p>" : "") + "</div>" + '<div class="cat-row-acts">' + '<button class="btn btn--quiet btn--sm" type="button" data-proj-up="' + esc(p.id) + '"' + (i === 0 ? " disabled" : "") + ">Move up<span class=\"vh\"> " + esc(p.title) + "</span></button>" + '<button class="btn btn--quiet btn--sm" type="button" data-proj-down="' + esc(p.id) + '"' + (i === all.length - 1 ? " disabled" : "") + ">Move down<span class=\"vh\"> " + esc(p.title) + "</span></button>" + '<button class="btn btn--ghost btn--sm" type="button" data-proj-edit="' + esc(p.id) + '">Edit<span class="vh"> ' + esc(p.title) + "</span></button>" + (builtIn ? "" : '<button class="btn btn--quiet btn--sm cat-del" type="button" data-proj-del="' + esc(p.id) + '">Delete<span class="vh"> ' + esc(p.title) + "</span></button>") + "</div></li>";
    }).join("");
  }
  function setErr(id, on) {
    var el = $(id + "Err");
    if (el) {
      el.classList.toggle("is-on", !!on);
    }
    if (on) {
      $(id).setAttribute("aria-invalid", "true");
    } else {
      $(id).removeAttribute("aria-invalid");
    }
  }
  function openForm(item, from) {
    editing = item || null;
    opener = from || null;
    slugTouched = !!item;
    var p = item || { status: "soon", categories: [] };
    $("projDlgTitle").textContent = item ? "Edit project" : "Add a project";
    $("projTitleI").value = p.title || "";
    $("projSlug").value = p.slug || "";
    $("projSlug").readOnly = !!item;
    $("projSlugHint").textContent = item ? "The short web name cannot be changed." : "Lower-case letters, numbers and dashes. It cannot be changed later.";
    $("projStatus").value = p.status || "soon";
    $("projBlurb").value = p.blurb || "";
    $("projLink").value = p.link || "";
    $("projImage").value = p.image || "";
    var main = p.slug === MAIN;
    $("projCats").value = (p.categories || []).map(function(c) {
      return c.name;
    }).join("\n");
    $("projCats").disabled = main;
    $("projCatsHint").textContent = main ? "Reading for Pleasure uses the book categories (Picture books, Chapter books and so on)." : "Admins pick one of these when posting a resource for this project. Families can filter by them.";
    [ "projTitleI", "projSlug", "projStatus", "projLink", "projImage" ].forEach(function(id) {
      setErr(id, false);
    });
    var dlg = $("projDialog");
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
    window.setTimeout(function() {
      $("projTitleI").focus();
    }, 40);
  }
  function closeForm() {
    var dlg = $("projDialog");
    if (typeof dlg.close === "function") {
      dlg.close();
    } else {
      dlg.removeAttribute("open");
    }
  }
  function move(items, id, by) {
    var i = items.map(function(p) {
      return p.id;
    }).indexOf(id);
    var j = i + by;
    if (i < 0 || j < 0 || j >= items.length) {
      return false;
    }
    var t = items[i];
    items[i] = items[j];
    items[j] = t;
    items.forEach(function(p, k) {
      p.sort = (k + 1) * 10;
    });
    return true;
  }
  function boot() {
    if (!$("projList") || !$("projDialog") || !window.PTGStore) {
      return;
    }
    $("projNew").addEventListener("click", function() {
      openForm(null, $("projNew"));
    });
    $("projTitleI").addEventListener("input", function() {
      if (!editing && !slugTouched) {
        $("projSlug").value = slugify($("projTitleI").value);
      }
    });
    $("projSlug").addEventListener("input", function() {
      slugTouched = true;
    });
    $("projList").addEventListener("click", function(e) {
      var t = e.target.closest ? e.target.closest("[data-proj-up], [data-proj-down], [data-proj-edit], [data-proj-del]") : null;
      if (!t || t.disabled) {
        return;
      }
      var id = t.getAttribute("data-proj-up") || t.getAttribute("data-proj-down") || t.getAttribute("data-proj-edit") || t.getAttribute("data-proj-del");
      var items = read();
      var p = items.filter(function(x) {
        return x.id === id;
      })[0];
      if (!p) {
        return;
      }
      if (t.hasAttribute("data-proj-edit")) {
        openForm(p, t);
        return;
      }
      if (t.hasAttribute("data-proj-up") || t.hasAttribute("data-proj-down")) {
        var up = t.hasAttribute("data-proj-up");
        if (move(items, id, up ? -1 : 1)) {
          write(items);
          audit("Reordered the project “" + p.title + "”");
          say(p.title + " moved " + (up ? "up." : "down."));
          render();
          var again = $("projList").querySelector("[data-proj-" + (up ? "up" : "down") + '="' + id + '"]');
          if (again && !again.disabled) {
            again.focus();
          } else {
            var edit = $("projList").querySelector('[data-proj-edit="' + id + '"]');
            if (edit) {
              edit.focus();
            }
          }
        }
        return;
      }
      var n = resourcesFor(p.slug);
      if (n) {
        window.alert(p.title + " still has " + n + (n === 1 ? " resource" : " resources") + ". Move or delete them first, or hide the project instead.");
        return;
      }
      if (!window.confirm("Delete the project “" + p.title + "”? Its tile disappears from the home page.")) {
        return;
      }
      write(items.filter(function(x) {
        return x.id !== id;
      }));
      audit("Deleted the project “" + p.title + "”");
      say(p.title + " was deleted.");
      render();
      $("h-adm-projects").focus();
    });
    $("projForm").addEventListener("submit", function(e) {
      e.preventDefault();
      var items = read();
      var title = $("projTitleI").value.trim();
      var slug = editing ? editing.slug : slugify($("projSlug").value);
      var status = $("projStatus").value;
      var link = $("projLink").value.trim();
      var image = $("projImage").value.trim();
      var taken = items.some(function(p) {
        return p.slug === slug && (!editing || p.id !== editing.id);
      });
      var bad = {
        projTitleI: !title,
        projSlug: !editing && (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || taken),
        projStatus: slug === MAIN && status === "hidden",
        projLink: !!link && !/^https:\/\/[^\s"'<>]+$/i.test(link) && !/^[a-z0-9-]+\.html$/.test(link),
        projImage: !!image && !/^https:\/\/[^\s"'<>]+$/i.test(image) && !/^[a-z0-9_-]+\.(png|jpe?g|svg|webp)$/.test(image)
      };
      Object.keys(bad).forEach(function(id) {
        setErr(id, bad[id]);
      });
      var first = Object.keys(bad).filter(function(id) {
        return bad[id];
      })[0];
      if (first) {
        $(first).focus();
        return;
      }
      if (!editing) {
        $("projSlug").value = slug;
      }
      var seen = {};
      var cats = slug === MAIN ? [] : $("projCats").value.split(/\n+/).map(function(line) {
        var name = line.trim().slice(0, 40);
        return { id: slugify(name), name: name };
      }).filter(function(c) {
        if (!c.id || !c.name || seen[c.id]) {
          return false;
        }
        seen[c.id] = true;
        return true;
      }).slice(0, 30);
      var data = { title: title, status: status, blurb: $("projBlurb").value.trim().slice(0, 400), link: link, image: image, categories: cats };
      if (editing) {
        items.forEach(function(p) {
          if (p.id === editing.id) {
            Object.keys(data).forEach(function(k) {
              p[k] = data[k];
            });
          }
        });
        audit("Edited the project “" + title + "”");
        say("Saved changes to " + title + ".");
      } else {
        data.id = window.PTGStore.uuid();
        data.slug = slug;
        data.sort = items.reduce(function(mx, p) {
          return Math.max(mx, Number(p.sort) || 0);
        }, 0) + 10;
        items.push(data);
        audit("Added the project “" + title + "”");
        say(title + " was added." + (status === "hidden" ? " It is hidden until you show it." : " Its tile is on the home page."));
      }
      write(items);
      closeForm();
      render();
      if (opener && document.contains(opener)) {
        opener.focus();
      } else {
        $("h-adm-projects").focus();
      }
    });
    window.addEventListener("ptg:projects", render);
    window.addEventListener("ptg:resources", render);
    window.addEventListener("ptg:store", function(e) {
      if (e.detail && (e.detail.key === KEY || e.detail.key === RES)) {
        render();
      }
    });
    render();
  }
  window.PTGProjects = {
    list: read,
    main: MAIN
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
