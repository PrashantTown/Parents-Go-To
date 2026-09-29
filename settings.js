(function() {
  "use strict";
  var PREF_KEY = "ptg-settings-v1";
  var SUPPORT_KEY = "ptg-support-v1";
  var APP_VERSION = "1.4.0";
  var MAX_UPLOAD = 2 * 1024 * 1024;
  var AVATAR_PX = 256;
  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function readStore(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
  }
  function isPhone(v) {
    var s = String(v || "").trim();
    return !s || /^[+0-9 ()-]{6,20}$/.test(s) && (s.match(/\d/g) || []).length >= 6;
  }
  function initial(name) {
    return (String(name || "").trim().charAt(0) || "?").toUpperCase();
  }
  function since(at) {
    if (!at) {
      return "";
    }
    var mins = Math.round((Date.now() - at) / 6e4);
    if (mins < 1) {
      return "just now";
    }
    if (mins < 60) {
      return mins + (mins === 1 ? " minute ago" : " minutes ago");
    }
    var hrs = Math.round(mins / 60);
    if (hrs < 24) {
      return hrs + (hrs === 1 ? " hour ago" : " hours ago");
    }
    var days = Math.round(hrs / 24);
    if (days === 1) {
      return "yesterday";
    }
    if (days < 30) {
      return days + " days ago";
    }
    return "a while ago";
  }
  function svgIcon(paths, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 20 20" fill="none" ' + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' + 'stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  function audit(kind, what, who, detail) {
    if (window.PTGAudit) {
      window.PTGAudit.write(kind, what, who || "system", detail || "");
    }
  }
  var Prefs = {
    all: function() {
      var s = readStore(PREF_KEY, null);
      return s && typeof s === "object" && s.profiles ? s : {
        profiles: {}
      };
    },
    key: function(role, email) {
      return role + "::" + String(email || "guest").trim().toLowerCase();
    },
    get: function(role, email) {
      var s = this.all();
      return s.profiles[this.key(role, email)] || {};
    },
    put: function(role, email, patch) {
      var s = this.all();
      var k = this.key(role, email);
      var cur = s.profiles[k] || {};
      for (var p in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, p)) {
          cur[p] = patch[p];
        }
      }
      s.profiles[k] = cur;
      return writeStore(PREF_KEY, s) ? cur : cur;
    },
    clear: function(role, email) {
      var s = this.all();
      delete s.profiles[this.key(role, email)];
      writeStore(PREF_KEY, s);
    }
  };
  var Support = {
    list: function() {
      var s = readStore(SUPPORT_KEY, null);
      return s && Object.prototype.toString.call(s.tickets) === "[object Array]" ? s.tickets : [];
    },
    save: function(tickets) {
      return writeStore(SUPPORT_KEY, {
        tickets: tickets.slice(0, 200)
      });
    },
    add: function(ticket) {
      var all = this.list();
      var n = all.length + 1;
      ticket.ref = "PTG-" + String(1e3 + n);
      ticket.id = "tk" + Date.now() + "-" + n;
      ticket.at = Date.now();
      ticket.state = "open";
      all.unshift(ticket);
      this.save(all);
      return ticket;
    },
    setState: function(id, state) {
      var all = this.list();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          all[i].state = state;
          all[i].decidedAt = Date.now();
          break;
        }
      }
      this.save(all);
    },
    openCount: function() {
      return this.list().filter(function(t) {
        return t.state !== "closed";
      }).length;
    }
  };
  window.PTGSupport = Support;
  function browserName() {
    var ua = navigator.userAgent;
    if (/Edg\//.test(ua)) {
      return "Edge";
    }
    if (/OPR\//.test(ua)) {
      return "Opera";
    }
    if (/Firefox\//.test(ua)) {
      return "Firefox";
    }
    if (/Chrome\//.test(ua)) {
      return "Chrome";
    }
    if (/Safari\//.test(ua)) {
      return "Safari";
    }
    return "your browser";
  }
  function deviceKind() {
    var ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || /Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
      return "Tablet";
    }
    if (/Mobi|Android|iPhone/i.test(ua)) {
      return "Phone";
    }
    return "Computer";
  }
  function platformName() {
    var ua = navigator.userAgent;
    if (/Windows/.test(ua)) {
      return "Windows";
    }
    if (/Android/.test(ua)) {
      return "Android";
    }
    if (/iPhone|iPad|iPod/.test(ua)) {
      return "iOS";
    }
    if (/Mac OS X/.test(ua)) {
      return "macOS";
    }
    if (/Linux/.test(ua)) {
      return "Linux";
    }
    return "an unknown system";
  }
  function diagnostics() {
    return {
      browser: browserName(),
      platform: platformName(),
      device: deviceKind(),
      screen: window.innerWidth + "×" + window.innerHeight,
      dpr: (window.devicePixelRatio || 1).toFixed(1),
      theme: window.PTGTheme ? window.PTGTheme.resolved() : "light",
      language: navigator.language || "en",
      zone: Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "unknown",
      online: navigator.onLine ? "online" : "offline"
    };
  }
  function diagLine() {
    var d = diagnostics();
    return d.browser + " on " + d.platform + " · " + d.device + " · " + d.screen + " at " + d.dpr + "× · " + d.theme + " theme · " + d.zone;
  }
  var root = document.documentElement;
  function applyGlobal(prefs) {
    root.classList.toggle("ptg-bigtext", !!prefs.bigText);
    root.classList.toggle("ptg-reduce", !!prefs.reduceMotion);
    root.classList.toggle("ptg-compact", prefs.density === "compact");
  }
  var toastTimer = null;
  function say(scope, message) {
    var bar = $(scope.toastId), text = $(scope.toastTextId);
    if (!bar || !text) {
      return;
    }
    text.textContent = message;
    bar.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function() {
      bar.classList.remove("is-on");
    }, 3200);
  }
  function flashSaved(el, message) {
    if (!el) {
      return;
    }
    el.textContent = message || "Saved";
    el.classList.add("is-on");
    window.setTimeout(function() {
      el.classList.remove("is-on");
    }, 2400);
  }
  function setErr(id, on, message) {
    var el = $(id);
    if (!el) {
      return;
    }
    if (message) {
      el.textContent = message;
    }
    el.classList.toggle("is-on", !!on);
  }
  function markInvalid(id, bad) {
    var el = $(id);
    if (el) {
      if (bad) {
        el.setAttribute("aria-invalid", "true");
      } else {
        el.removeAttribute("aria-invalid");
      }
    }
  }
  function paintAvatar(el, opts) {
    if (!el) {
      return;
    }
    if (opts.photo) {
      el.classList.add("has-photo");
      el.style.setProperty("--photo", 'url("' + opts.photo + '")');
    } else {
      el.classList.remove("has-photo");
      el.style.removeProperty("--photo");
    }
    if (opts.colour) {
      el.classList.add("has-tint");
      el.style.setProperty("--tint", opts.colour);
    } else {
      el.classList.remove("has-tint");
      el.style.removeProperty("--tint");
    }
    if (opts.letter) {
      el.textContent = opts.letter;
    }
  }
  function squareImage(file, done, fail) {
    var reader = new FileReader;
    reader.onerror = function() {
      fail("That file could not be read. Try another one.");
    };
    reader.onload = function() {
      var img = new Image;
      img.onerror = function() {
        fail("That does not look like an image we can read.");
      };
      img.onload = function() {
        try {
          var side = Math.min(img.width, img.height);
          var canvas = document.createElement("canvas");
          canvas.width = AVATAR_PX;
          canvas.height = AVATAR_PX;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
          done(canvas.toDataURL("image/jpeg", .86));
        } catch (e) {
          fail("That image could not be resized. Try a JPG or PNG.");
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  var SWATCHES = [ "#0D3B32", "#17564A", "#2C6B4F", "#2F6E86", "#123F5B", "#E9A13B", "#B3402E", "#8A5A9E", "#0A6280", "#6A6F3C" ];
  function buildSwatches(box, name, chosen) {
    if (!box) {
      return;
    }
    box.innerHTML = SWATCHES.map(function(hex, i) {
      var id = name + "-sw" + i;
      return '<input type="radio" name="' + name + '" id="' + id + '" value="' + hex + '"' + (hex.toLowerCase() === String(chosen || "").toLowerCase() ? " checked" : "") + ">" + '<label for="' + id + '" style="background:' + hex + '" title="' + hex + '">' + '<span class="vh">Colour ' + hex + "</span></label>";
    }).join("");
  }
  function strength(pw) {
    var s = String(pw || "");
    if (!s) {
      return 0;
    }
    var score = 0;
    if (s.length >= 8) {
      score++;
    }
    if (s.length >= 12) {
      score++;
    }
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) {
      score++;
    }
    if (/\d/.test(s) || /[^A-Za-z0-9]/.test(s)) {
      score++;
    }
    if (s.length >= 20) {
      score = 4;
    }
    if (/^(.)\1+$/.test(s)) {
      score = 1;
    }
    return Math.max(1, Math.min(4, score));
  }
  var STRENGTH_WORDS = {
    1: "Weak — a common password is guessed in seconds.",
    2: "Getting there — longer is the easiest thing to change.",
    3: "Good.",
    4: "Strong."
  };
  var PARENT = {
    role: "parent",
    pageId: "page-app",
    panelId: "panel-settings",
    railId: "setRail",
    toastId: "toast",
    toastTextId: "toastText",
    avatars: [ "whoAvatar", "greetAvatar", "setAvatarPreview" ],
    preview: "setAvatarPreview",
    swatchBox: "setColour",
    swatchName: "setColourPick",
    defaultColour: "#0D3B32",
    minPassword: 8,
    toggles: {
      setBigText: "bigText",
      setReduceMotion: "reduceMotion",
      setKidsFull: "kidsFullScreen",
      setTwoStep: "twoStep",
      setSigninAlerts: "signinAlerts",
      setKidsLock: "kidsLock",
      setAgeFilter: "ageFilter",
      setHideNames: "hideNames",
      setBlockLinks: "blockLinks",
      setAdminContact: "adminContact",
      setAnalytics: "analytics",
      setDeviceNotes: "deviceNotes",
      setNotesAlways: "notesAlways",
      setReminders: "reminders",
      setNews: "news"
    },
    selects: {
      setStartTab: "startTab",
      setDensity: "density",
      setAutoLock: "autoLock",
      setVisibility: "visibility",
      setShareStats: "shareStats",
      setRetention: "retention"
    },
    details: {
      setName: "name",
      setPronouns: "pronouns",
      setEmail: "email",
      setPhone: "phone",
      setRelation: "relation",
      setSuburb: "suburb",
      setLang: "language",
      setWeekStart: "weekStart",
      setBackup: "backupContact"
    },
    aboutId: "setAbout",
    devicesId: "setDevices",
    diagId: "setDiagLine",
    reportPrefix: "setRep",
    noteStateId: "setNoteState",
    noteTestId: "setNoteTest",
    noteSwitchId: "setDeviceNotes"
  };
  var ADMIN = {
    role: "admin",
    pageId: "page-admin",
    panelId: "admpanel-settings",
    railId: "admSetRail",
    toastId: "admToast",
    toastTextId: "admToastText",
    avatars: [ "admAvatar", "admGreetAvatar", "admSetAvatarPreview" ],
    preview: "admSetAvatarPreview",
    swatchBox: "admSetColour",
    swatchName: "admSetColourPick",
    defaultColour: "#123F5B",
    minPassword: 12,
    toggles: {
      admSetBigText: "bigText",
      admSetReduceMotion: "reduceMotion",
      admSetTwoStep: "twoStep",
      admSetConfirmSuspend: "confirmSuspend",
      admSetSigninAlerts: "signinAlerts",
      admSetHoldAll: "holdAll",
      admSetFlagNames: "flagNames",
      admSetLinkAllow: "linkAllow",
      admSetShowContact: "showContact",
      admSetOpenLogs: "openLogs",
      admSetLogViews: "logViews"
    },
    selects: {
      admSetStartTab: "startTab",
      admSetRows: "rowsPerTable",
      admSetAutoLock: "autoLock",
      admSetAttempts: "lockAttempts",
      admSetLogRetention: "logRetention",
      admSetSubRetention: "subRetention",
      admSetDormant: "dormantAfter"
    },
    details: {
      admSetName: "name",
      admSetTitle: "jobTitle",
      admSetEmail: "email",
      admSetPhone: "phone",
      admSetTeam: "team",
      admSetHours: "hours",
      admSetCover: "cover",
      admSetEscalate: "escalate"
    },
    aboutId: "admSetAbout",
    devicesId: "admSetDevices",
    diagId: "admSetDiagLine",
    reportPrefix: "admSetRep"
  };
  function wire(scope) {
    var panel = $(scope.panelId);
    if (!panel) {
      return null;
    }
    var prefs = {};
    var account = "";
    var hydrating = false;
    function currentEmail() {
      if (window.PTGSession && window.PTGSession.email()) {
        return window.PTGSession.email();
      }
      if (scope.role === "parent" && window.PTGApp && window.PTGApp.parentEmail) {
        return window.PTGApp.parentEmail();
      }
      return "guest";
    }
    function persist(patch) {
      prefs = Prefs.put(scope.role, account, patch);
      applyGlobal(prefs);
    }
    function paintAll() {
      var letter = initial(prefs.name || window.PTGSession && window.PTGSession.name() || account);
      scope.avatars.forEach(function(id) {
        paintAvatar($(id), {
          photo: prefs.photo || "",
          colour: prefs.colour || "",
          letter: letter
        });
      });
      var clear = $(scope.role === "parent" ? "setPhotoClear" : "admSetPhotoClear");
      if (clear) {
        clear.hidden = !prefs.photo;
      }
    }
    var themeInputs = panel.querySelectorAll('.set-themes input[type="radio"]');
    var themeNow = $(scope.role === "parent" ? "setThemeNow" : "admSetThemeNow");
    function paintTheme() {
      var now = window.PTGTheme ? window.PTGTheme.get() : "auto";
      for (var i = 0; i < themeInputs.length; i++) {
        themeInputs[i].checked = themeInputs[i].value === now;
      }
      if (themeNow) {
        var resolved = window.PTGTheme ? window.PTGTheme.resolved() : "light";
        themeNow.textContent = now === "auto" ? "Following your device, which is currently " + resolved + "." : "Set to " + now + " on this device, whatever your system is doing.";
      }
      var segs = document.querySelectorAll("#themeSeg button, #admThemeSeg button");
      for (var j = 0; j < segs.length; j++) {
        segs[j].setAttribute("aria-pressed", segs[j].getAttribute("data-theme-set") === now ? "true" : "false");
      }
    }
    for (var t = 0; t < themeInputs.length; t++) {
      themeInputs[t].addEventListener("change", function() {
        if (hydrating || !this.checked) {
          return;
        }
        if (window.PTGTheme) {
          window.PTGTheme.set(this.value);
        }
        paintTheme();
        say(scope, this.value === "auto" ? "Now following your device." : "Switched to the " + this.value + " theme.");
      });
    }
    if (window.matchMedia) {
      var dark = window.matchMedia("(prefers-color-scheme: dark)");
      var onScheme = function() {
        paintTheme();
      };
      if (dark.addEventListener) {
        dark.addEventListener("change", onScheme);
      } else if (dark.addListener) {
        dark.addListener(onScheme);
      }
    }
    Object.keys(scope.toggles).forEach(function(id) {
      var el = $(id);
      if (!el) {
        return;
      }
      el.addEventListener("change", function() {
        if (hydrating) {
          return;
        }
        var patch = {};
        patch[scope.toggles[id]] = el.checked;
        persist(patch);
        var label = el.closest(".set-switch");
        var name = label ? (label.querySelector("b") || {}).textContent : "That setting";
        if (id === scope.noteSwitchId && el.checked && window.PTGNotify) {
          window.PTGNotify.enable().then(function(state) {
            renderNoteState();
            if (state === "denied") {
              say(scope, "Your browser is blocking notifications for this site.");
            } else if (state === "granted") {
              say(scope, "Notifications are on for this device.");
            } else {
              say(scope, (name || "That setting") + " is on.");
            }
          });
          return;
        }
        say(scope, (name || "That setting") + (el.checked ? " is on." : " is off."));
        if (id === scope.noteSwitchId) {
          renderNoteState();
        }
        if (scope.role === "admin") {
          audit("account", "Platform setting changed: " + name + " " + (el.checked ? "on" : "off"), account);
        }
      });
    });
    Object.keys(scope.selects).forEach(function(id) {
      var el = $(id);
      if (!el) {
        return;
      }
      el.addEventListener("change", function() {
        if (hydrating) {
          return;
        }
        var patch = {};
        patch[scope.selects[id]] = el.value;
        persist(patch);
        var lab = panel.querySelector('label[for="' + id + '"]');
        var name = lab ? lab.textContent.replace(/\s*\(.*\)\s*$/, "").trim() : "That setting";
        say(scope, name + " set to “" + el.options[el.selectedIndex].text + "”.");
      });
    });
    var fileId = scope.role === "parent" ? "setPhotoFile" : "admSetPhotoFile";
    var clearId = scope.role === "parent" ? "setPhotoClear" : "admSetPhotoClear";
    var photoErrId = scope.role === "parent" ? "setPhotoErr" : "admSetPhotoErr";
    var fileEl = $(fileId);
    if (fileEl) {
      fileEl.addEventListener("change", function() {
        var file = fileEl.files && fileEl.files[0];
        setErr(photoErrId, false);
        if (!file) {
          return;
        }
        if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
          setErr(photoErrId, true, "Use a JPG, PNG or WebP image.");
          fileEl.value = "";
          return;
        }
        if (file.size > MAX_UPLOAD) {
          setErr(photoErrId, true, "That picture is over 2 MB. Pick a smaller one.");
          fileEl.value = "";
          return;
        }
        squareImage(file, function(dataUrl) {
          persist({
            photo: dataUrl
          });
          if (!prefs.photo) {
            setErr(photoErrId, true, "There was no room left to store the picture. Try removing an older one.");
            return;
          }
          paintAll();
          say(scope, "Profile picture updated.");
          fileEl.value = "";
        }, function(message) {
          setErr(photoErrId, true, message);
          fileEl.value = "";
        });
      });
    }
    var clearEl = $(clearId);
    if (clearEl) {
      clearEl.addEventListener("click", function() {
        persist({
          photo: ""
        });
        paintAll();
        setErr(photoErrId, false);
        say(scope, "Picture removed — back to your initial.");
      });
    }
    var swatchBox = $(scope.swatchBox);
    if (swatchBox) {
      swatchBox.addEventListener("change", function(e) {
        var hit = e.target.closest ? e.target.closest('input[type="radio"]') : null;
        if (!hit || hydrating) {
          return;
        }
        persist({
          colour: hit.value
        });
        if (scope.role === "parent" && window.PTGApp && window.PTGApp.setColour) {
          window.PTGApp.setColour(hit.value);
        }
        paintAll();
        say(scope, "Colour updated.");
      });
    }
    var detailsForm = $(scope.role === "parent" ? "setDetailsForm" : "admSetDetailsForm");
    var detailsSaved = $(scope.role === "parent" ? "setDetailsSaved" : "admSetDetailsSaved");
    var detailsUndo = $(scope.role === "parent" ? "setDetailsUndo" : "admSetDetailsUndo");
    function fillDetails() {
      Object.keys(scope.details).forEach(function(id) {
        var el = $(id);
        if (!el) {
          return;
        }
        var key = scope.details[id];
        var value = prefs[key];
        if (value == null) {
          if (key === "name") {
            value = window.PTGSession && window.PTGSession.name() || "";
          } else if (key === "email") {
            value = account === "guest" ? "" : account;
          } else if (el.tagName === "SELECT") {
            value = el.options.length ? el.options[0].value : "";
          } else {
            value = "";
          }
        }
        el.value = value;
      });
    }
    function validateDetails() {
      var ok = true;
      var nameId = scope.role === "parent" ? "setName" : "admSetName";
      var emailId = scope.role === "parent" ? "setEmail" : "admSetEmail";
      var phoneId = scope.role === "parent" ? "setPhone" : "admSetPhone";
      var extraId = scope.role === "parent" ? "setBackup" : "admSetCover";
      var nameBad = !String(($(nameId) || {}).value || "").trim();
      setErr(nameId + "Err", nameBad);
      markInvalid(nameId, nameBad);
      if (nameBad) {
        ok = false;
      }
      var emailBad = !isEmail(($(emailId) || {}).value);
      setErr(emailId + "Err", emailBad);
      markInvalid(emailId, emailBad);
      if (emailBad) {
        ok = false;
      }
      var phoneBad = !isPhone(($(phoneId) || {}).value);
      setErr(phoneId + "Err", phoneBad);
      markInvalid(phoneId, phoneBad);
      if (phoneBad) {
        ok = false;
      }
      var extraVal = String(($(extraId) || {}).value || "").trim();
      var extraBad = !!extraVal && !isEmail(extraVal);
      setErr(extraId + "Err", extraBad);
      markInvalid(extraId, extraBad);
      if (extraBad) {
        ok = false;
      }
      if (scope.role === "admin") {
        var escVal = String(($("admSetEscalate") || {}).value || "").trim();
        var escBad = !!escVal && !isEmail(escVal);
        setErr("admSetEscalateErr", escBad);
        markInvalid("admSetEscalate", escBad);
        if (escBad) {
          ok = false;
        }
      }
      return ok;
    }
    if (detailsForm) {
      detailsForm.addEventListener("submit", function(e) {
        e.preventDefault();
        if (!validateDetails()) {
          var bad = detailsForm.querySelector('[aria-invalid="true"]');
          if (bad) {
            bad.focus();
          }
          say(scope, "Some details need another look.");
          return;
        }
        var patch = {};
        Object.keys(scope.details).forEach(function(id) {
          var el = $(id);
          if (el) {
            patch[scope.details[id]] = String(el.value || "").trim();
          }
        });
        persist(patch);
        var newName = patch.name;
        if (window.PTGSession && window.PTGSession.rename) {
          window.PTGSession.rename(newName);
        }
        if (window.PTGAccounts && window.PTGAccounts.setName && account !== "guest") {
          window.PTGAccounts.setName(account, newName);
        }
        if (scope.role === "parent" && window.PTGApp && window.PTGApp.setDisplayName) {
          window.PTGApp.setDisplayName(newName);
        } else if (scope.role === "admin" && window.PTGAdmin && window.PTGAdmin.refresh) {
          window.PTGAdmin.refresh();
        }
        paintAll();
        audit("account", "Personal details updated", account);
        flashSaved(detailsSaved, "Saved");
        say(scope, "Your details are saved.");
      });
    }
    if (detailsUndo) {
      detailsUndo.addEventListener("click", function() {
        fillDetails();
        Object.keys(scope.details).forEach(function(id) {
          setErr(id + "Err", false);
          markInvalid(id, false);
        });
        say(scope, "Changes undone.");
      });
    }
    var pw = {
      form: $(scope.role === "parent" ? "setPassForm" : "admSetPassForm"),
      old: scope.role === "parent" ? "setPassOld" : "admSetPassOld",
      nw: scope.role === "parent" ? "setPassNew" : "admSetPassNew",
      copy: scope.role === "parent" ? "setPassCopy" : "admSetPassCopy",
      show: scope.role === "parent" ? "setPassShow" : "admSetPassShow",
      meter: scope.role === "parent" ? "setPwMeter" : "admSetPwMeter",
      hint: scope.role === "parent" ? "setPwHint" : "admSetPwHint",
      saved: scope.role === "parent" ? "setPassSaved" : "admSetPassSaved"
    };
    var newEl = $(pw.nw);
    if (newEl) {
      newEl.addEventListener("input", function() {
        var score = strength(newEl.value);
        var meter = $(pw.meter);
        if (meter) {
          meter.setAttribute("data-score", newEl.value ? String(score) : "0");
        }
        var hint = $(pw.hint);
        if (hint) {
          hint.textContent = newEl.value ? STRENGTH_WORDS[score] : scope.minPassword === 12 ? "At least 12 characters for an administrator. A passphrase of four unrelated words works well." : "At least 8 characters. A short phrase you will remember beats a clever one you will not.";
        }
      });
    }
    var showEl = $(pw.show);
    if (showEl) {
      showEl.addEventListener("change", function() {
        var kind = showEl.checked ? "text" : "password";
        [ pw.old, pw.nw, pw.copy ].forEach(function(id) {
          var el = $(id);
          if (el) {
            el.type = kind;
          }
        });
      });
    }
    if (pw.form) {
      pw.form.addEventListener("submit", function(e) {
        e.preventDefault();
        var oldVal = String(($(pw.old) || {}).value || "");
        var newVal = String(($(pw.nw) || {}).value || "");
        var copyVal = String(($(pw.copy) || {}).value || "");
        var ok = true;
        var seen = window.PTGAccounts ? window.PTGAccounts.check(account, oldVal) : {
          ok: oldVal.length > 0
        };
        var oldBad = !seen.ok;
        setErr(pw.old + "Err", oldBad);
        markInvalid(pw.old, oldBad);
        if (oldBad) {
          ok = false;
        }
        var newBad = newVal.length < scope.minPassword;
        setErr(pw.nw + "Err", newBad, "Use at least " + scope.minPassword + " characters.");
        markInvalid(pw.nw, newBad);
        if (newBad) {
          ok = false;
        }
        if (!newBad && newVal === oldVal) {
          setErr(pw.nw + "Err", true, "That is the password you already have.");
          markInvalid(pw.nw, true);
          ok = false;
        }
        var copyBad = newVal !== copyVal;
        setErr(pw.copy + "Err", copyBad);
        markInvalid(pw.copy, copyBad);
        if (copyBad) {
          ok = false;
        }
        if (!ok) {
          var bad = pw.form.querySelector('[aria-invalid="true"]');
          if (bad) {
            bad.focus();
          }
          return;
        }
        if (window.PTGAccounts && window.PTGAccounts.setPassword && account !== "guest") {
          window.PTGAccounts.setPassword(account, newVal);
        }
        persist({
          passwordChangedAt: Date.now()
        });
        audit("auth", "Password changed", account);
        pw.form.reset();
        var meter = $(pw.meter);
        if (meter) {
          meter.setAttribute("data-score", "0");
        }
        [ pw.old, pw.nw, pw.copy ].forEach(function(id) {
          var el = $(id);
          if (el) {
            el.type = "password";
          }
          markInvalid(id, false);
          setErr(id + "Err", false);
        });
        renderDevices();
        flashSaved($(pw.saved), "Password updated");
        say(scope, "Password updated. Use it next time you sign in.");
      });
    }
    var DEVICE_ICON = svgIcon('<rect x="2.6" y="3.4" width="14.8" height="10.2" rx="1.6"/><path d="M7 16.6h6"/>', 17);
    var PHONE_ICON = svgIcon('<rect x="5.4" y="2.4" width="9.2" height="15.2" rx="2"/><path d="M9 15.2h2"/>', 17);
    function renderDevices() {
      var box = $(scope.devicesId);
      if (!box) {
        return;
      }
      var d = diagnostics();
      var changed = prefs.passwordChangedAt;
      var rows = [ {
        icon: d.device === "Phone" ? PHONE_ICON : DEVICE_ICON,
        name: d.browser + " on " + d.platform,
        note: "This device · " + d.screen + " · signed in " + (changed ? "and password changed " + since(changed) : "now"),
        now: true
      } ];
      if (scope.role === "admin") {
        rows.push({
          icon: DEVICE_ICON,
          name: "Console session",
          note: "One-time code accepted · " + d.zone,
          now: false
        });
      }
      box.innerHTML = rows.map(function(r) {
        return "<li>" + '<span class="dev-ico">' + r.icon + "</span>" + '<span class="dev-what"><b>' + esc(r.name) + "</b><span>" + esc(r.note) + "</span></span>" + (r.now ? '<span class="dev-now">Now</span>' : "") + "</li>";
      }).join("");
    }
    var signOutAll = $(scope.role === "parent" ? "setSignOutAll" : "admSetSignOutAll");
    if (signOutAll) {
      signOutAll.addEventListener("click", function() {
        ask({
          title: "Sign out everywhere else?",
          body: scope.role === "admin" ? "Every other console session ends. You stay signed in here." : "Every other device is signed out. You stay signed in on this one.",
          yes: "Sign out other devices",
          danger: true
        }, function() {
          audit("auth", "Signed out of all other sessions", account);
          renderDevices();
          say(scope, "Every other session has been signed out.");
        });
      });
    }
    function renderAbout() {
      var box = $(scope.aboutId);
      if (!box) {
        return;
      }
      var d = diagnostics();
      var rows = [ [ "Version", APP_VERSION + (scope.role === "admin" ? " (console)" : "") ], [ "Signed in as", account === "guest" ? "Not signed in" : account ], [ "Browser", d.browser + " on " + d.platform ], [ "Screen", d.screen + " at " + d.dpr + "×" ], [ "Theme", (window.PTGTheme ? window.PTGTheme.get() : "auto") + " (showing " + d.theme + ")" ], [ "Time zone", d.zone ], [ "Where your data lives", "This browser only — nothing is sent to a server" ] ];
      box.innerHTML = rows.map(function(r) {
        return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>";
      }).join("");
      var diag = $(scope.diagId);
      if (diag) {
        diag.textContent = diagLine();
      }
    }
    var rep = {
      form: $(scope.role === "parent" ? "setReportForm" : "admSetReportForm"),
      area: scope.reportPrefix + "Area",
      severity: scope.reportPrefix + "Severity",
      what: scope.reportPrefix + "What",
      email: scope.reportPrefix + "Email",
      diag: scope.reportPrefix + "Diag",
      saved: scope.reportPrefix + "Saved"
    };
    if (rep.form) {
      rep.form.addEventListener("submit", function(e) {
        e.preventDefault();
        var ok = true;
        var whatVal = String(($(rep.what) || {}).value || "").trim();
        var whatBad = whatVal.length < 5;
        setErr(rep.what + "Err", whatBad);
        markInvalid(rep.what, whatBad);
        if (whatBad) {
          ok = false;
        }
        var mailVal = String(($(rep.email) || {}).value || "").trim();
        var mailBad = !isEmail(mailVal);
        setErr(rep.email + "Err", mailBad);
        markInvalid(rep.email, mailBad);
        if (mailBad) {
          ok = false;
        }
        if (!ok) {
          var bad = rep.form.querySelector('[aria-invalid="true"]');
          if (bad) {
            bad.focus();
          }
          return;
        }
        var areaEl = $(rep.area);
        var sevEl = $(rep.severity);
        var attach = !!($(rep.diag) || {}).checked;
        var ticket = Support.add({
          from: account === "guest" ? mailVal : account,
          replyTo: mailVal,
          source: scope.role,
          area: areaEl ? areaEl.options[areaEl.selectedIndex].text : "Somewhere else",
          severity: sevEl ? sevEl.value : "med",
          severityText: sevEl ? sevEl.options[sevEl.selectedIndex].text : "",
          body: whatVal,
          diag: attach ? diagLine() : ""
        });
        audit("account", "Technical problem reported (" + ticket.ref + ") — " + ticket.area, ticket.from, ticket.severityText);
        if (window.PTGNotify) {
          window.PTGNotify.toAdmins({
            kind: "support",
            tone: ticket.severity === "high" ? "alert" : "info",
            title: "New problem report — " + ticket.ref,
            body: ticket.area + ". Reported by " + ticket.from + ".",
            go: "settings",
            tag: "report-" + ticket.id
          });
        }
        rep.form.reset();
        var diagEl = $(rep.diag);
        if (diagEl) {
          diagEl.checked = true;
        }
        var mailEl = $(rep.email);
        if (mailEl && account !== "guest") {
          mailEl.value = account;
        }
        markInvalid(rep.what, false);
        markInvalid(rep.email, false);
        renderTickets();
        renderAdminReports();
        updateReportCounts();
        flashSaved($(rep.saved), "Sent — reference " + ticket.ref);
        say(scope, "Report sent. Your reference is " + ticket.ref + ".");
      });
    }
    function renderTickets() {
      if (scope.role !== "parent") {
        return;
      }
      var wrap = $("setTicketsWrap"), list = $("setTickets");
      if (!wrap || !list) {
        return;
      }
      var mine = Support.list().filter(function(t) {
        return t.source === "parent" && String(t.from).toLowerCase() === String(account).toLowerCase();
      });
      wrap.hidden = !mine.length;
      list.innerHTML = mine.map(function(t) {
        return "<li>" + '<div class="tk-head">' + '<span class="tk-pill tk-pill--' + esc(t.state === "closed" ? "closed" : t.state === "progress" ? "progress" : "open") + '">' + (t.state === "closed" ? "Closed" : t.state === "progress" ? "Being looked at" : "Open") + "</span>" + "<b>" + esc(t.area) + "</b>" + '<span class="tk-ref">' + esc(t.ref) + "</span>" + "</div>" + '<p class="tk-body">' + esc(t.body) + "</p>" + '<p class="tk-meta">Sent ' + esc(since(t.at)) + " · replies go to " + esc(t.replyTo) + "</p>" + "</li>";
      }).join("");
    }
    var reportFilter = "open";
    function tellReporter(id, state) {
      if (!window.PTGNotify) {
        return;
      }
      var all = Support.list(), t = null, i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          t = all[i];
          break;
        }
      }
      if (!t || t.source !== "parent" || !t.from || !isEmail(t.from)) {
        return;
      }
      if (state === "progress") {
        window.PTGNotify.toParent(t.from, {
          kind: "support",
          tone: "info",
          title: "Someone is looking at " + t.ref,
          body: "Your report about " + t.area.toLowerCase() + " has been picked up.",
          go: "settings",
          tag: "report-" + t.id
        });
      } else if (state === "closed") {
        window.PTGNotify.toParent(t.from, {
          kind: "support",
          tone: "good",
          title: t.ref + " has been closed",
          body: "Your report about " + t.area.toLowerCase() + " is marked as resolved.",
          go: "settings",
          tag: "report-" + t.id
        });
      }
    }
    function renderAdminReports() {
      if (scope.role !== "admin") {
        return;
      }
      var list = $("admReportList"), empty = $("admEmptyReports");
      if (!list || !empty) {
        return;
      }
      var all = Support.list().filter(function(t) {
        if (reportFilter === "all") {
          return true;
        }
        if (reportFilter === "closed") {
          return t.state === "closed";
        }
        return t.state !== "closed";
      });
      list.innerHTML = all.map(function(t) {
        var pill = t.state === "closed" ? "closed" : t.state === "progress" ? "progress" : "open";
        var pillText = t.state === "closed" ? "Closed" : t.state === "progress" ? "Being looked at" : "Open";
        var pub = t.source === "public";
        var srcPill = pub ? '<span class="tk-pill tk-pill--public">From the home page</span>' : '<span class="tk-pill tk-pill--signedin">Signed in</span>';
        var acts = t.state === "closed" ? '<button class="btn btn--ghost btn--sm" type="button" data-rep-open="' + esc(t.id) + '">Reopen</button>' : '<button class="btn btn--primary btn--sm" type="button" data-rep-progress="' + esc(t.id) + '">Being looked at</button>' + '<button class="btn btn--ghost btn--sm" type="button" data-rep-close="' + esc(t.id) + '">Close</button>';
        return "<li>" + '<div class="tk-head">' + '<span class="tk-pill tk-pill--' + pill + '">' + pillText + "</span>" + (t.severity === "high" ? '<span class="tk-pill tk-pill--high">Urgent</span>' : "") + srcPill + "<b>" + esc(t.area) + "</b>" + '<span class="tk-ref">' + esc(t.ref) + "</span>" + "</div>" + '<p class="tk-body">' + esc(t.body) + "</p>" + '<p class="tk-meta">' + esc(t.severityText) + " · from " + esc(pub && t.name ? t.name + " <" + t.from + ">" : t.from) + " · " + esc(since(t.at)) + " · reply to " + esc(t.replyTo) + (pub ? " · no account — reply by email" : "") + (t.diag ? "<br>" + esc(t.diag) : "") + "</p>" + '<div class="tk-acts">' + acts + "</div>" + "</li>";
      }).join("");
      empty.classList.toggle("is-on", !all.length);
      list.hidden = !all.length;
    }
    if (scope.role === "admin") {
      window.addEventListener("ptg:contact", function() {
        renderAdminReports();
        updateReportCounts();
      });
    }
    if (scope.role === "admin") {
      panel.addEventListener("click", function(e) {
        var t = e.target.closest ? e.target : null;
        if (!t) {
          return;
        }
        var chip = t.closest("[data-rep-filter]");
        if (chip) {
          reportFilter = chip.getAttribute("data-rep-filter");
          var chips = panel.querySelectorAll("[data-rep-filter]");
          for (var i = 0; i < chips.length; i++) {
            chips[i].setAttribute("aria-pressed", chips[i] === chip ? "true" : "false");
          }
          renderAdminReports();
          return;
        }
        var go = t.closest("[data-rep-progress]");
        if (go) {
          Support.setState(go.getAttribute("data-rep-progress"), "progress");
          audit("account", "Problem report picked up", account);
          tellReporter(go.getAttribute("data-rep-progress"), "progress");
          renderAdminReports();
          updateReportCounts();
          say(scope, "Marked as being looked at.");
          return;
        }
        var shut = t.closest("[data-rep-close]");
        if (shut) {
          Support.setState(shut.getAttribute("data-rep-close"), "closed");
          audit("account", "Problem report closed", account);
          tellReporter(shut.getAttribute("data-rep-close"), "closed");
          renderAdminReports();
          updateReportCounts();
          say(scope, "Report closed.");
          return;
        }
        var back = t.closest("[data-rep-open]");
        if (back) {
          Support.setState(back.getAttribute("data-rep-open"), "open");
          audit("account", "Problem report reopened", account);
          renderAdminReports();
          updateReportCounts();
          say(scope, "Report put back in the list.");
        }
      });
    }
    var download = $(scope.role === "parent" ? "setDownloadData" : "admSetExport");
    if (download) {
      download.addEventListener("click", function() {
        var payload;
        if (scope.role === "parent") {
          payload = {
            exported: (new Date).toISOString(),
            account: account,
            settings: prefs,
            shelf: window.PTGApp ? window.PTGApp.data() : null
          };
        } else {
          payload = {
            exported: (new Date).toISOString(),
            by: account,
            settings: prefs,
            accounts: window.PTGAccounts ? window.PTGAccounts.list() : [],
            submissions: window.PTGAdmin ? window.PTGAdmin.submissions() : [],
            posts: window.PTGAdmin ? window.PTGAdmin.posts() : [],
            reports: Support.list(),
            auditLog: window.PTGAudit ? window.PTGAudit.list() : []
          };
        }
        var blob = new Blob([ JSON.stringify(payload, null, 2) ], {
          type: "application/json"
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = (scope.role === "parent" ? "parents-go-to-my-data-" : "parents-go-to-platform-") + (new Date).toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(function() {
          URL.revokeObjectURL(url);
        }, 1e3);
        audit("account", scope.role === "parent" ? "Downloaded a copy of their data" : "Exported the platform record", account);
        say(scope, "Your download is on its way.");
      });
    }
    var wipe = $("setDeleteAccount");
    if (wipe && scope.role === "parent") {
      wipe.addEventListener("click", function() {
        ask({
          title: "Delete your account?",
          body: "This removes the account and everything on the shelf, and it cannot be undone. Download a copy first if you want to keep it.",
          type: "DELETE",
          yes: "Delete my account",
          danger: true
        }, function() {
          Prefs.clear(scope.role, account);
          audit("account", "Account deletion requested", account);
          var out = $("signOutBtn");
          if (out) {
            out.click();
          }
          if (window.PTGAuthNotice) {
            window.PTGAuthNotice("Your account is scheduled for deletion and you have been signed out.");
          }
        });
      });
    }
    var resetBtn = $(scope.role === "parent" ? "setResetAll" : "admSetResetAll");
    if (resetBtn) {
      resetBtn.addEventListener("click", function() {
        ask({
          title: "Reset settings to default?",
          body: "Every setting on this screen goes back to how it started. Your name, picture and contact details are kept.",
          yes: "Reset settings"
        }, function() {
          var keep = {
            name: prefs.name,
            email: prefs.email,
            phone: prefs.phone,
            photo: prefs.photo,
            colour: prefs.colour
          };
          Prefs.clear(scope.role, account);
          prefs = Prefs.put(scope.role, account, keep);
          if (window.PTGTheme) {
            window.PTGTheme.set("auto");
          }
          hydrate();
          say(scope, "Settings are back to their defaults.");
        });
      });
    }
    var rail = $(scope.railId);
    var railLinks = rail ? rail.querySelectorAll("[data-set-jump]") : [];
    var cards = panel.querySelectorAll(".set-card");
    var openId = "";
    panel.classList.add("set-tabbed");
    function closeAll() {
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove("is-open");
        cards[i].hidden = true;
      }
      openId = "";
      markRail("");
      panel.classList.remove("set-has-open");
    }
    function showSection(id, moveFocus) {
      var found = false;
      for (var i = 0; i < cards.length; i++) {
        var on = cards[i].id === id;
        cards[i].classList.toggle("is-open", on);
        cards[i].hidden = !on;
        if (on) {
          found = true;
        }
      }
      if (!found) {
        closeAll();
        return false;
      }
      openId = id;
      markRail(id);
      panel.classList.add("set-has-open");
      var target = $(id);
      if (target && moveFocus) {
        target.focus({
          preventScroll: true
        });
        var top = panel.getBoundingClientRect().top + window.pageYOffset - 130;
        window.scrollTo({
          top: top < 0 ? 0 : top,
          behavior: root.classList.contains("ptg-reduce") ? "auto" : "smooth"
        });
      }
      return true;
    }
    var wide = window.matchMedia("(min-width: 1024px)");
    var prefix = scope.role === "admin" ? "adm-set-" : "set-";
    var homeHash = scope.role === "admin" ? "#admin" : "#app";
    var page = $(scope.pageId);
    var ARROW = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10H4.6"/><path d="m9.4 4.8-5.2 5.2 5.2 5.2"/></svg>';
    var HOUSE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 9.4 10 3.6l6.8 5.8"/><path d="M5.2 8v8.4h9.6V8"/><path d="M8.4 16.4v-4.6h3.2v4.6"/></svg>';
    var homeBtn = document.createElement("button");
    homeBtn.type = "button";
    homeBtn.className = "set-home";
    homeBtn.innerHTML = ARROW + "<span>Back to Home</span>";
    panel.insertBefore(homeBtn, panel.firstElementChild);
    var subHead = document.createElement("div");
    subHead.className = "set-subhead";
    subHead.innerHTML = '<button type="button" class="set-subhead-btn" data-set-back aria-label="Back to all settings">' + ARROW + "</button>" + '<h2 class="set-subhead-title" tabindex="-1"></h2>' + '<button type="button" class="set-subhead-btn" data-set-home aria-label="Home">' + HOUSE + "</button>";
    var subTitle = subHead.querySelector(".set-subhead-title");
    var setBody = panel.querySelector(".set-body");
    if (setBody) {
      setBody.insertBefore(subHead, setBody.firstChild);
    }
    function goHome() {
      window.location.hash = homeHash;
    }
    homeBtn.addEventListener("click", goHome);
    subHead.addEventListener("click", function(e) {
      var hit = e.target.closest ? e.target.closest("[data-set-back], [data-set-home]") : null;
      if (!hit) {
        return;
      }
      if (hit.hasAttribute("data-set-home")) {
        goHome();
        return;
      }
      if (window.history.state && window.history.state.ptgSetList) {
        window.history.back();
      } else {
        window.history.replaceState(null, "", "#settings");
        syncRoute(true);
      }
    });
    function slugOf(id) {
      return id.indexOf(prefix) === 0 ? id.slice(prefix.length) : id;
    }
    function railFor(id) {
      for (var i = 0; i < railLinks.length; i++) {
        if (railLinks[i].getAttribute("data-set-jump") === id) {
          return railLinks[i];
        }
      }
      return null;
    }
    function hashSlug() {
      var m = /^#settings(?:\/([a-z0-9-]*))?$/i.exec(window.location.hash || "");
      return m ? (m[1] || "").toLowerCase() : null;
    }
    function paintMode() {
      var drill = !wide.matches;
      panel.classList.toggle("set-drill", drill);
      panel.classList.toggle("set-drill-in", drill && !!openId);
    }
    function ensureOpen() {
      if (wide.matches && !openId && !panel.hidden && railLinks.length) {
        showSection(railLinks[0].getAttribute("data-set-jump"), false);
      }
    }
    function syncRoute(moveFocus) {
      if (panel.hidden) {
        return;
      }
      var slug = hashSlug();
      if (slug === null) {
        return;
      }
      var id = slug ? prefix + slug : "";
      var card = id ? $(id) : null;
      if (slug && !(card && panel.contains(card) && railFor(id))) {
        window.history.replaceState(null, "", "#settings");
        id = "";
      }
      var was = openId;
      if (!wide.matches) {
        if (id) {
          showSection(id, false);
          subTitle.textContent = railFor(id).textContent.replace(/\s+/g, " ").trim();
          if (id !== was) {
            window.scrollTo(0, 0);
          }
          if (moveFocus) {
            subTitle.focus({
              preventScroll: true
            });
          }
        } else {
          closeAll();
          if (was) {
            window.scrollTo(0, 0);
            if (moveFocus && railFor(was)) {
              railFor(was).focus({
                preventScroll: true
              });
            }
          }
        }
      } else if (id) {
        if (id !== was) {
          showSection(id, moveFocus);
        }
      } else {
        ensureOpen();
      }
      paintMode();
    }
    function choose(id) {
      if (!wide.matches) {
        window.history.pushState({
          ptgSetList: 1
        }, "", "#settings/" + slugOf(id));
        syncRoute(true);
        return;
      }
      toggleSection(id, true);
      if (openId) {
        window.history.replaceState(null, "", "#settings/" + slugOf(openId));
      }
    }
    window.addEventListener("hashchange", function() {
      syncRoute(true);
    });
    window.addEventListener("popstate", function() {
      syncRoute(true);
    });
    wide.addEventListener && wide.addEventListener("change", function() {
      if (!wide.matches && !hashSlug()) {
        closeAll();
      }
      syncRoute(false);
      paintMode();
    });
    paintMode();
    function toggleSection(id, moveFocus) {
      if (id && id === openId && wide.matches) {
        return true;
      }
      if (id && id === openId) {
        closeAll();
        return false;
      }
      return showSection(id, moveFocus);
    }
    function markRail(id) {
      for (var i = 0; i < railLinks.length; i++) {
        var link = railLinks[i];
        var on = !!id && link.getAttribute("data-set-jump") === id;
        link.classList.toggle("is-here", on);
        link.setAttribute("aria-expanded", on ? "true" : "false");
        link.setAttribute("tabindex", on || !id && i === 0 ? "0" : "-1");
      }
    }
    if (rail) {
      rail.setAttribute("aria-orientation", "vertical");
      for (var r = 0; r < railLinks.length; r++) {
        var lk = railLinks[r];
        var pid = lk.getAttribute("data-set-jump");
        lk.setAttribute("role", "button");
        lk.setAttribute("aria-controls", pid);
        lk.setAttribute("aria-expanded", "false");
        lk.setAttribute("tabindex", r === 0 ? "0" : "-1");
        lk.removeAttribute("href");
        var pane = $(pid);
        if (pane) {
          pane.setAttribute("role", "region");
          if (!lk.id) {
            lk.id = pid + "-tab";
          }
          pane.setAttribute("aria-labelledby", lk.id);
        }
      }
      rail.addEventListener("click", function(e) {
        var link = e.target.closest ? e.target.closest("[data-set-jump]") : null;
        if (!link) {
          return;
        }
        e.preventDefault();
        choose(link.getAttribute("data-set-jump"));
      });
      rail.addEventListener("keydown", function(e) {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") {
          return;
        }
        var link = e.target.closest ? e.target.closest("[data-set-jump]") : null;
        if (!link) {
          return;
        }
        e.preventDefault();
        choose(link.getAttribute("data-set-jump"));
      });
      rail.addEventListener("keydown", function(e) {
        var k = e.key;
        if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "ArrowLeft" && k !== "ArrowRight" && k !== "Home" && k !== "End") {
          return;
        }
        var link = e.target.closest ? e.target.closest("[data-set-jump]") : null;
        if (!link) {
          return;
        }
        var idx = -1;
        for (var i = 0; i < railLinks.length; i++) {
          if (railLinks[i] === link) {
            idx = i;
          }
        }
        if (idx === -1) {
          return;
        }
        e.preventDefault();
        var next = idx;
        if (k === "ArrowDown" || k === "ArrowRight") {
          next = (idx + 1) % railLinks.length;
        } else if (k === "ArrowUp" || k === "ArrowLeft") {
          next = (idx - 1 + railLinks.length) % railLinks.length;
        } else if (k === "Home") {
          next = 0;
        } else {
          next = railLinks.length - 1;
        }
        for (var t = 0; t < railLinks.length; t++) {
          railLinks[t].setAttribute("tabindex", t === next || railLinks[t].getAttribute("data-set-jump") === openId ? "0" : "-1");
        }
        railLinks[next].focus();
      });
    }
    closeAll();
    if (window.MutationObserver) {
      var wasHidden = panel.hidden;
      var watcher = new window.MutationObserver(function() {
        var nowHidden = panel.hidden;
        if (nowHidden === wasHidden) {
          return;
        }
        wasHidden = nowHidden;
        if (page) {
          page.classList.toggle("is-settings", !nowHidden);
        }
        if (nowHidden && openId) {
          closeAll();
          paintMode();
        }
        if (!nowHidden) {
          syncRoute(false);
        }
      });
      watcher.observe(panel, {
        attributes: true,
        attributeFilter: [ "hidden" ]
      });
    }
    function renderNoteState() {
      var box = $(scope.noteStateId);
      if (!box) {
        return;
      }
      var titleEl = $(scope.noteStateId + "Title");
      var bodyEl = $(scope.noteStateId + "Body");
      var N = window.PTGNotify;
      var state = "in-app";
      var head = "Notifications stay inside the app";
      var text = "This browser will not put them in the device notification bar. " + "The bell at the top of the page still works.";
      if (N) {
        var perm = N.permission();
        var route = N.channel();
        if (perm === "unsupported" || route === "in-app") {
          if (location.protocol !== "http:" && location.protocol !== "https:") {
            text = "The page is open straight from the disk, so this browser will not " + "hand notifications to the device. Serve the folder over http:// to " + "turn that on. The bell at the top of the page still works.";
          }
        } else if (perm === "denied") {
          state = "denied";
          head = "This browser is blocking notifications";
          text = "Allow them for this site in your browser settings, then switch this " + "back on. Until then they only appear in the bell.";
        } else if (perm === "default") {
          state = "ask";
          head = "Not asked yet";
          text = "Switch on Show notifications on this device and your browser will ask " + "for permission.";
        } else {
          state = "granted";
          head = "Notifications are on for this device";
          text = route === "service-worker" ? "They will appear in the notification bar, including when this tab is closed." : "They will appear in the notification bar while this tab is open.";
        }
      }
      box.setAttribute("data-state", state);
      if (titleEl) {
        titleEl.textContent = head;
      }
      if (bodyEl) {
        bodyEl.textContent = text;
      }
    }
    var noteTest = $(scope.noteTestId);
    if (noteTest) {
      noteTest.addEventListener("click", function() {
        if (!window.PTGNotify) {
          return;
        }
        window.PTGNotify.enable().then(function() {
          renderNoteState();
          window.PTGNotify.test(scope.role, account, {
            title: "Test notification",
            body: "Sent from Settings. If you can only see this in the bell, the " + "device notification bar is not available here."
          });
          say(scope, "Test sent.");
        });
      });
    }
    function updateReportCounts() {
      var open = Support.openCount();
      var tab = $("admCountReports");
      if (tab) {
        tab.textContent = String(open);
        tab.hidden = !open;
      }
      var railBadge = $("admRailReports");
      if (railBadge) {
        railBadge.textContent = String(open);
        railBadge.hidden = !open;
      }
    }
    function hydrate() {
      hydrating = true;
      account = currentEmail();
      prefs = Prefs.get(scope.role, account);
      if (!prefs.colour) {
        prefs.colour = scope.defaultColour;
      }
      applyGlobal(prefs);
      paintTheme();
      Object.keys(scope.toggles).forEach(function(id) {
        var el = $(id);
        if (!el) {
          return;
        }
        var key = scope.toggles[id];
        el.checked = Object.prototype.hasOwnProperty.call(prefs, key) ? !!prefs[key] : el.defaultChecked;
      });
      Object.keys(scope.selects).forEach(function(id) {
        var el = $(id);
        if (!el) {
          return;
        }
        var key = scope.selects[id];
        if (Object.prototype.hasOwnProperty.call(prefs, key)) {
          el.value = prefs[key];
        }
      });
      fillDetails();
      buildSwatches($(scope.swatchBox), scope.swatchName, prefs.colour);
      paintAll();
      renderDevices();
      renderAbout();
      renderTickets();
      renderAdminReports();
      updateReportCounts();
      renderNoteState();
      var mailEl = $(rep.email);
      if (mailEl && !mailEl.value && account !== "guest") {
        mailEl.value = account;
      }
      hydrating = false;
      if (!dirtyCount()) {
        snap();
      }
    }
    var saved = [];
    function tracked(el) {
      return !el.closest("form") && el.type !== "file" && !el.disabled;
    }
    function valueOf(el) {
      return el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
    }
    function snap() {
      saved = [];
      var all = panel.querySelectorAll("input, select, textarea");
      for (var i = 0; i < all.length; i++) {
        if (tracked(all[i])) {
          saved.push({ el: all[i], value: valueOf(all[i]) });
        }
      }
      paintSaveBar();
    }
    function changed() {
      var out = [];
      for (var i = 0; i < saved.length; i++) {
        if (saved[i].el.isConnected && valueOf(saved[i].el) !== saved[i].value) {
          out.push(saved[i]);
        }
      }
      return out;
    }
    function dirtyCount() {
      var list = changed(), groups = {}, n = 0;
      for (var i = 0; i < list.length; i++) {
        var key = list[i].el.type === "radio" ? "r:" + list[i].el.name : "e:" + i;
        if (!groups[key]) {
          groups[key] = true;
          n++;
        }
      }
      return n;
    }
    var saveBar = document.createElement("div");
    saveBar.className = "set-savebar";
    saveBar.hidden = true;
    saveBar.setAttribute("role", "region");
    saveBar.setAttribute("aria-label", "Unsaved changes");
    saveBar.innerHTML = '<p class="set-savebar-msg" role="status" aria-live="polite"></p>' + '<div class="set-savebar-acts">' + '<button type="button" class="btn btn--ghost btn--sm" data-save-discard>Discard</button>' + '<button type="button" class="btn btn--primary btn--sm" data-save-keep>Save changes</button>' + "</div>";
    panel.appendChild(saveBar);
    var saveMsg = saveBar.querySelector(".set-savebar-msg");
    function paintSaveBar() {
      var n = dirtyCount();
      saveBar.hidden = !n;
      page && page.classList.toggle("set-dirty", !!n);
      saveMsg.innerHTML = n ? "<b>Unsaved changes</b><span>" + n + (n === 1 ? " setting" : " settings") + " changed</span>" : "";
      liftSaveBar();
    }
    function liftSaveBar() {
      var lift = 0;
      var tabs = page ? page.querySelector(".app-nav") : null;
      if (!saveBar.hidden && tabs && window.getComputedStyle(tabs).position === "fixed") {
        var top = tabs.getBoundingClientRect().top;
        if (top > window.innerHeight / 2) {
          lift = Math.max(0, window.innerHeight - top);
        }
      }
      page && page.style.setProperty("--set-bar-lift", lift + "px");
    }
    window.addEventListener("resize", liftSaveBar);
    function keepChanges() {
      if (!dirtyCount()) {
        return;
      }
      snap();
      say(scope, "Settings saved.");
    }
    function discardChanges() {
      var list = changed();
      if (!list.length) {
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var el = list[i].el;
        if (el.type === "radio" && !list[i].value) {
          continue;
        }
        if (el.type === "checkbox" || el.type === "radio") {
          el.checked = list[i].value;
        } else {
          el.value = list[i].value;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      snap();
      say(scope, "Changes discarded.");
    }
    panel.addEventListener("change", function(e) {
      if (!hydrating && e.target && tracked(e.target)) {
        paintSaveBar();
      }
    });
    panel.addEventListener("input", function(e) {
      if (!hydrating && e.target && tracked(e.target)) {
        paintSaveBar();
      }
    });
    saveBar.addEventListener("click", function(e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) {
        return;
      }
      if (b.hasAttribute("data-save-keep")) {
        keepChanges();
      } else if (b.hasAttribute("data-save-discard")) {
        discardChanges();
      }
    });
    var lastSetHash = "#settings";
    window.addEventListener("hashchange", function() {
      if (/^#settings(\/|$)/.test(window.location.hash)) {
        lastSetHash = window.location.hash;
      }
    });
    var leave = document.createElement("dialog");
    leave.className = "set-leave";
    leave.setAttribute("aria-labelledby", prefix + "leave-title");
    leave.innerHTML = '<h2 id="' + prefix + 'leave-title">Save your changes?</h2>' + '<p class="set-leave-msg"></p>' + '<div class="set-leave-acts">' + '<button type="button" class="btn btn--ghost" data-leave="edit">Keep editing</button>' + '<button type="button" class="btn btn--ghost" data-leave="discard">Discard</button>' + '<button type="button" class="btn btn--primary" data-leave="save">Save changes</button>' + "</div>";
    (page || document.body).appendChild(leave);
    leave.addEventListener("click", function(e) {
      var b = e.target.closest ? e.target.closest("[data-leave]") : null;
      if (!b) {
        return;
      }
      var act = b.getAttribute("data-leave");
      leave.close();
      if (act === "save") {
        keepChanges();
      } else if (act === "discard") {
        discardChanges();
      } else {
        window.location.hash = lastSetHash;
      }
    });
    leave.addEventListener("cancel", function(e) {
      e.preventDefault();
      leave.close();
      window.location.hash = lastSetHash;
    });
    var askDlg = document.createElement("dialog");
    askDlg.className = "set-leave set-ask";
    askDlg.setAttribute("aria-labelledby", prefix + "ask-title");
    askDlg.setAttribute("aria-describedby", prefix + "ask-msg");
    askDlg.innerHTML = '<h2 id="' + prefix + 'ask-title"></h2>' + '<p class="set-leave-msg" id="' + prefix + 'ask-msg"></p>' + '<div class="set-ask-type" hidden>' + '<label for="' + prefix + 'ask-input"></label>' + '<input id="' + prefix + 'ask-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">' + "</div>" + '<div class="set-leave-acts">' + '<button type="button" class="btn btn--ghost" data-ask="no">Cancel</button>' + '<button type="button" class="btn" data-ask="yes"></button>' + "</div>";
    (page || document.body).appendChild(askDlg);
    var askInput = askDlg.querySelector("input");
    var askYes = askDlg.querySelector('[data-ask="yes"]');
    var askWord = "";
    var askThen = null;
    var askFrom = null;
    function ask(o, then) {
      askWord = o.type || "";
      askThen = then;
      askFrom = document.activeElement;
      askDlg.querySelector("h2").textContent = o.title;
      askDlg.querySelector(".set-leave-msg").textContent = o.body;
      askDlg.querySelector(".set-ask-type").hidden = !askWord;
      askDlg.querySelector("label").textContent = "Type " + askWord + " to confirm";
      askInput.value = "";
      askYes.textContent = o.yes;
      askYes.className = "btn " + (o.danger ? "btn--danger" : "btn--primary");
      askYes.disabled = !!askWord;
      askDlg.showModal();
      (askWord ? askInput : askDlg.querySelector('[data-ask="no"]')).focus();
    }
    function askClose(ok) {
      var then = askThen;
      askThen = null;
      askDlg.close();
      if (ok && then) {
        then();
      } else if (askFrom && askFrom.focus && document.contains(askFrom)) {
        askFrom.focus();
      }
    }
    askInput.addEventListener("input", function() {
      askYes.disabled = askInput.value.trim().toUpperCase() !== askWord;
    });
    askInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !askYes.disabled) {
        e.preventDefault();
        askClose(true);
      }
    });
    askDlg.addEventListener("click", function(e) {
      var b = e.target.closest ? e.target.closest("[data-ask]") : null;
      if (b && !b.disabled) {
        askClose(b.getAttribute("data-ask") === "yes");
      }
    });
    askDlg.addEventListener("cancel", function(e) {
      e.preventDefault();
      askClose(false);
    });
    function onLeaveSettings() {
      var n = dirtyCount();
      if (!n) {
        return;
      }
      if (!page || page.hidden) {
        snap();
        return;
      }
      leave.querySelector(".set-leave-msg").textContent = "You changed " + n + (n === 1 ? " setting" : " settings") + " and have not saved " + (n === 1 ? "it" : "them") + " yet.";
      if (!leave.open && leave.showModal) {
        leave.showModal();
      }
    }
    window.addEventListener("beforeunload", function(e) {
      if (dirtyCount()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    if ("MutationObserver" in window) {
      var watch = new MutationObserver(function() {
        if (!panel.hidden) {
          hydrate();
        } else {
          window.setTimeout(onLeaveSettings, 0);
        }
      });
      watch.observe(panel, {
        attributes: true,
        attributeFilter: [ "hidden" ]
      });
      var page = $(scope.pageId);
      if (page) {
        var watchPage = new MutationObserver(function() {
          if (!page.hidden) {
            hydrate();
          }
        });
        watchPage.observe(page, {
          attributes: true,
          attributeFilter: [ "hidden" ]
        });
      }
    }
    return {
      hydrate: hydrate,
      prefs: function() {
        return prefs;
      },
      open: function(sectionId) {
        hydrate();
        if (!sectionId || !railFor(sectionId)) {
          return false;
        }
        window.history.replaceState(null, "", "#settings/" + slugOf(sectionId));
        if (wide.matches) {
          return showSection(sectionId, true);
        }
        syncRoute(true);
        return true;
      }
    };
  }
  function boot() {
    var parentPanel = wire(PARENT);
    var adminPanel = wire(ADMIN);
    var role = window.PTGSession && window.PTGSession.role();
    if (role === "admin" && adminPanel) {
      adminPanel.hydrate();
    } else if (parentPanel) {
      parentPanel.hydrate();
    }
    document.addEventListener("click", function(e) {
      var hit = e.target.closest ? e.target.closest("[data-theme-set]") : null;
      if (!hit) {
        return;
      }
      window.setTimeout(function() {
        if (parentPanel) {
          parentPanel.hydrate();
        }
        if (adminPanel) {
          adminPanel.hydrate();
        }
      }, 0);
    });
    window.PTGSettings = {
      get: function(roleName, email) {
        return Prefs.get(roleName || "parent", email || "");
      },
      support: Support,
      open: function(roleName, sectionId) {
        var panel = roleName === "admin" ? adminPanel : parentPanel;
        if (!panel || !panel.open) {
          return false;
        }
        return panel.open(sectionId);
      }
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
