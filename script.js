(function() {
  "use strict";
  var KEY = "ptg-theme";
  var OK = {
    light: 1,
    dark: 1,
    auto: 1
  };
  var root = document.documentElement;
  function read() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  var pick = read();
  root.setAttribute("data-theme", OK[pick] ? pick : "auto");
  window.PTGTheme = {
    get: function() {
      return root.getAttribute("data-theme") || "auto";
    },
    set: function(v) {
      if (!OK[v]) {
        v = "auto";
      }
      root.setAttribute("data-theme", v);
      try {
        window.localStorage.setItem(KEY, v);
      } catch (e) {}
      return v;
    },
    resolved: function() {
      var v = this.get();
      if (v !== "auto") {
        return v;
      }
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  };
})();

(function() {
  "use strict";
  var signedIn = false;
  var who = null;
  window.PTGSession = {
    start: function(email, role) {
      signedIn = true;
      who = {
        email: String(email || ""),
        role: role === "admin" ? "admin" : "parent",
        name: "",
        at: Date.now()
      };
      if (window.PTGAccounts) {
        window.PTGAccounts.touch(email, who.role);
        var acct = window.PTGAccounts.get(email);
        if (acct) {
          who.name = acct.name || "";
        }
      }
      if (window.PTGAudit) {
        window.PTGAudit.write("auth", who.role === "admin" ? "Administrator signed in" : "Parent signed in", who.email);
      }
      var noteTo = (who.role === "admin" ? "admin::" : "parent::") + who.email.toLowerCase();
      var kind = window.PTGNotify && window.PTGNotify.deviceLabel ? window.PTGNotify.deviceLabel() : "this device";
      if (window.PTGNotify && (!window.PTGNotify.newDevice || window.PTGNotify.newDevice(noteTo, kind))) {
        window.PTGNotify.push({
          to: noteTo,
          kind: "account",
          tone: "info",
          title: "Signed in on a new device",
          body: "Signed in on " + kind + ". If that was not you, change your password in Settings.",
          go: "settings",
          tag: "signin"
        });
      }
    },
    end: function() {
      if (signedIn && who && window.PTGAudit) {
        window.PTGAudit.write("auth", who.role === "admin" ? "Administrator signed out" : "Parent signed out", who.email);
      }
      signedIn = false;
      who = null;
    },
    active: function() {
      return signedIn;
    },
    role: function() {
      return who ? who.role : null;
    },
    email: function() {
      return who ? who.email : "";
    },
    name: function() {
      return who ? who.name : "";
    },
    rename: function(name) {
      if (who) {
        who.name = String(name || "").trim();
      }
      return who ? who.name : "";
    },
    canOpenShelf: function() {
      return signedIn && who.role === "parent";
    },
    canOpenConsole: function() {
      return signedIn && who.role === "admin";
    }
  };
  var DEMO_PASSWORD = "demo1234";
  var accounts = {};
  var order = [];
  function key(email) {
    return String(email || "").trim().toLowerCase();
  }
  function ensure(email, role) {
    var k = key(email);
    if (!k) {
      return null;
    }
    if (!Object.prototype.hasOwnProperty.call(accounts, k)) {
      accounts[k] = {
        email: String(email || "").trim(),
        name: "",
        password: null,
        role: role === "admin" ? "admin" : "parent",
        status: "active",
        createdAt: Date.now(),
        lastSeen: null
      };
      order.push(k);
    }
    return accounts[k];
  }
  window.PTGAccounts = {
    demoPassword: DEMO_PASSWORD,
    exists: function(email) {
      var a = accounts[key(email)];
      return !!(a && a.password !== null);
    },
    get: function(email) {
      return accounts[key(email)] || null;
    },
    list: function() {
      return order.map(function(k) {
        return accounts[k];
      });
    },
    create: function(email, name, password) {
      var a = ensure(email, "parent");
      if (!a) {
        return null;
      }
      a.email = String(email || "").trim();
      a.name = String(name || "").trim();
      a.password = String(password || "");
      a.createdAt = Date.now();
      return a;
    },
    touch: function(email, role) {
      var a = ensure(email, role);
      if (!a) {
        return null;
      }
      if (role === "admin") {
        a.role = "admin";
      }
      a.lastSeen = Date.now();
      if (!a.name) {
        var local = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
        if (local) {
          a.name = local.replace(/\S+/g, function(w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
          });
        }
      }
      return a;
    },
    setStatus: function(email, status) {
      var a = accounts[key(email)];
      if (a) {
        a.status = status === "suspended" ? "suspended" : "active";
      }
      return a;
    },
    setPassword: function(email, password) {
      var a = ensure(email, "parent");
      if (!a) {
        return null;
      }
      a.password = String(password || "");
      a.passwordChangedAt = Date.now();
      return a;
    },
    setName: function(email, name) {
      var a = ensure(email, "parent");
      if (!a) {
        return null;
      }
      a.name = String(name || "").trim();
      return a;
    },
    check: function(email, password) {
      var acct = accounts[key(email)];
      if (acct && acct.status === "suspended") {
        return {
          ok: false,
          suspended: true
        };
      }
      if (acct && acct.password !== null) {
        return acct.password === password ? {
          ok: true,
          demo: false,
          name: acct.name
        } : {
          ok: false
        };
      }
      return password === DEMO_PASSWORD ? {
        ok: true,
        demo: true,
        name: acct ? acct.name : ""
      } : {
        ok: false
      };
    }
  };
})();

(function() {
  "use strict";
  var entries = [];
  var seq = 0;
  window.PTGAudit = {
    write: function(kind, what, who, detail) {
      seq++;
      entries.unshift({
        id: "log" + seq,
        kind: kind || "account",
        what: String(what || ""),
        who: String(who || "system"),
        detail: detail ? String(detail) : "",
        at: Date.now()
      });
      if (entries.length > 400) {
        entries.pop();
      }
      if (window.PTGAdmin && window.PTGAdmin.refresh) {
        window.PTGAdmin.refresh();
      }
    },
    list: function() {
      return entries.slice();
    }
  };
})();

const BookField = (() => {
  "use strict";
  const AW = 768, AH = 720;
  const REG = {
    front: {
      x: 0 / AW,
      w: 496 / AW
    },
    spine: {
      x: 500 / AW,
      w: 84 / AW
    },
    edge: {
      x: 588 / AW,
      w: 32 / AW
    },
    back: {
      x: 624 / AW,
      w: 120 / AW
    },
    rim: {
      x: 748 / AW,
      w: 16 / AW
    }
  };
  const PAD = 1.25 / AW;
  const BOOK_W = 1, BOOK_H = 1.45, BOOK_D = .17;
  const SCHEMES = [ {
    g: "#0D3B32",
    i: "#F4EFE2",
    a: "#E9A13B",
    n: "bottle green"
  }, {
    g: "#073041",
    i: "#EDE6D6",
    a: "#01A79A",
    n: "deep teal"
  }, {
    g: "#A9483F",
    i: "#FCF4E4",
    a: "#F2C14E",
    n: "brick"
  }, {
    g: "#1E2A44",
    i: "#EAE3D4",
    a: "#D98E5A",
    n: "navy"
  }, {
    g: "#F1E4CB",
    i: "#22302B",
    a: "#B3402E",
    n: "oat"
  }, {
    g: "#4C6B2F",
    i: "#F6F3EA",
    a: "#EBD98B",
    n: "olive"
  }, {
    g: "#5B3E6E",
    i: "#F1EAF4",
    a: "#EFC04E",
    n: "plum"
  }, {
    g: "#2F6E86",
    i: "#F2F6F4",
    a: "#F0A868",
    n: "slate"
  }, {
    g: "#E4E9E1",
    i: "#13221E",
    a: "#2F6F62",
    n: "sage"
  }, {
    g: "#C4633F",
    i: "#FDF6E9",
    a: "#2F5D50",
    n: "terracotta"
  }, {
    g: "#13221E",
    i: "#EDE3CE",
    a: "#D9B25E",
    n: "ink"
  }, {
    g: "#EDE3CE",
    i: "#0D3B32",
    a: "#C4633F",
    n: "chalk"
  }, {
    g: "#7C2E3A",
    i: "#F7ECE4",
    a: "#E4B363",
    n: "claret"
  }, {
    g: "#F4F1E6",
    i: "#1E2A44",
    a: "#2F6E86",
    n: "paper"
  } ];
  const IMPRINTS = [ "Lantern & Vale", "Hollow Press", "Marrow House", "Ninth Field", "Quiet Editions", "Sparrow & Co.", "The Reading Room", "Bellweather" ];
  const KICKERS = [ "A NOVEL", "STORIES", "ESSAYS", "A MEMOIR", "POEMS", "A NOVEL", "A NOVEL", "NEW EDITION" ];
  const SHELF = [ [ "The Lantern Grove", "M. Adeyemi" ], [ "Small Weather", "Rosa Linde" ], [ "A Field Guide to Wonder", "J. Prakash" ], [ "Paper Boats", "Nia Okonkwo" ], [ "The Quiet Hour", "H. Bergström" ], [ "Moth & Moon", "Ivy Calder" ], [ "Everything Blooms Late", "T. Marchetti" ], [ "Notes on Rain", "S. Devkota" ], [ "The Sleeping Orchard", "A. Fontaine" ], [ "Cartography of Home", "Leo Vance" ], [ "A Diary of Light", "Mira Sen" ], [ "The Long Way Round", "D. Halloran" ], [ "Salt & Cedar", "K. Iwasaki" ], [ "How to Hold a River", "P. Nakamura" ], [ "The Sunday Bell", "E. Whitlock" ], [ "Fables for Fast Days", "R. Amado" ], [ "Blue Hour Almanac", "C. Oyelaran" ], [ "The Paper Kite", "Suri Thapa" ], [ "A Room of Small Doors", "V. Kaur" ], [ "Nine Kinds of Quiet", "B. Larsen" ], [ "The Garden Ledger", "O. Farrow" ], [ "Tide & Tinder", "M. Rahal" ], [ "Winter Grammar", "J. Ferreira" ], [ "The Borrowed Lamp", "A. Quintero" ], [ "Every Loud Thing", "N. Bassey" ], [ "A Short History of Naps", "G. Weiss" ], [ "The Map is Wet", "L. Tamang" ], [ "Songs for Slow Trains", "F. Osei" ], [ "Bright Ordinary Days", "H. Okafor" ], [ "The Hour Before Supper", "J. Mireles" ], [ "A Ladder of Afternoons", "P. Sørensen" ], [ "Keeping the Bees", "C. Nwosu" ] ];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.random() * arr.length | 0];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => (c /= 255) <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
    return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255);
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = i => {
      const c = (n >> i * 8 & 255) / 255;
      return Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (1 - c) * amt, 0, 1) * 255);
    };
    return "#" + [ ch(2), ch(1), ch(0) ].map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }
  const DISPLAY = w => `${w} %spx "Fraunces", "Iowan Old Style", Georgia, serif`;
  const UI = w => `${w} %spx "Public Sans", system-ui, sans-serif`;
  const font = (tpl, size) => tpl.replace("%s", size);
  function tracked(g, text, x, y, sp) {
    let cx = x;
    for (const ch of text) {
      g.fillText(ch, cx, y);
      cx += g.measureText(ch).width + sp;
    }
  }
  function trackedW(g, text, sp) {
    let w = 0;
    for (const ch of text) w += g.measureText(ch).width + sp;
    return w - sp;
  }
  function trackedC(g, text, cx, y, sp) {
    tracked(g, text, cx - trackedW(g, text, sp) / 2, y, sp);
  }
  function wrapAt(g, text, maxW) {
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (cur && g.measureText(t).width > maxW) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function fitTitle(g, text, tpl, maxW, maxH, hi, lo, lh) {
    lh = lh || 1.06;
    for (let size = hi; size >= lo; size -= 2) {
      g.font = font(tpl, size);
      const lines = wrapAt(g, text, maxW);
      const longest = lines.reduce((m, l) => Math.max(m, g.measureText(l).width), 0);
      if (longest <= maxW && lines.length * size * lh <= maxH) return {
        lines: lines,
        size: size,
        lh: lh
      };
    }
    g.font = font(tpl, lo);
    return {
      lines: wrapAt(g, text, maxW),
      size: lo,
      lh: lh
    };
  }
  function drawLines(g, fit, x, y, align) {
    g.font = font(fit.tpl, fit.size);
    g.textAlign = align || "left";
    fit.lines.forEach((l, i) => g.fillText(l, x, y + i * fit.size * fit.lh));
    g.textAlign = "left";
  }
  function foil(g, x, y, w, h, base) {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, shade(base, -.3));
    gr.addColorStop(.24, shade(base, .38));
    gr.addColorStop(.42, shade(base, -.14));
    gr.addColorStop(.62, shade(base, .46));
    gr.addColorStop(.82, shade(base, -.22));
    gr.addColorStop(1, shade(base, .18));
    return gr;
  }
  let GRAIN = null;
  function grainPattern(g) {
    if (!GRAIN) {
      GRAIN = document.createElement("canvas");
      GRAIN.width = GRAIN.height = 128;
      const t = GRAIN.getContext("2d");
      const img = t.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() - .5) * 78;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 26;
      }
      t.putImageData(img, 0, 0);
    }
    return g.createPattern(GRAIN, "repeat");
  }
  function drawFront(g, W, H, b) {
    const {title: title, author: author, scheme: scheme, kicker: kicker, imprint: imprint} = b;
    const G = scheme.g, I = scheme.i, A = scheme.a;
    const M = W * .128;
    const light = luminance(G) > .55;
    const onPaper = light ? scheme.i : shade(G, -.1);
    const deep = light ? shade(scheme.i, .04) : G;
    g.save();
    g.textBaseline = "alphabetic";
    switch (b.variant) {
     case 0:
      {
        g.fillStyle = G;
        g.fillRect(0, 0, W, H);
        g.fillStyle = rgba(I, .62);
        g.font = font(UI(600), W * .036);
        tracked(g, author.toUpperCase(), M, H * .142, W * .0065);
        g.fillStyle = A;
        g.fillRect(M, H * .6, W * .2, H * .006);
        const fit = fitTitle(g, title, DISPLAY(700), W - M * 2, H * .26, W * .155, W * .075);
        fit.tpl = DISPLAY(700);
        g.fillStyle = I;
        drawLines(g, fit, M, H * .7);
        g.fillStyle = rgba(I, .5);
        g.font = font(UI(600), W * .028);
        tracked(g, kicker, M, H * .915, W * .012);
        break;
      }

     case 1:
      {
        const ground = luminance(G) > .5 ? G : "#F3EDDF";
        const ink = luminance(ground) > .5 ? luminance(G) > .5 ? scheme.i : G : I;
        g.fillStyle = ground;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = A;
        g.lineWidth = W * .011;
        g.strokeRect(M * .62, M * .62, W - M * 1.24, H - M * 1.24);
        g.strokeStyle = rgba(ink, .55);
        g.lineWidth = W * .0032;
        g.strokeRect(M * .92, M * .92, W - M * 1.84, H - M * 1.84);
        g.fillStyle = rgba(ink, .6);
        g.font = font(UI(600), W * .031);
        trackedC(g, kicker, W / 2, H * .265, W * .014);
        const fit = fitTitle(g, title, DISPLAY(600), W - M * 2.4, H * .3, W * .135, W * .062, 1.1);
        fit.tpl = DISPLAY(600);
        g.fillStyle = ink;
        drawLines(g, fit, W / 2, H * .44, "center");
        g.fillStyle = A;
        g.fillRect(W / 2 - W * .07, H * .7, W * .14, H * .0045);
        g.fillStyle = rgba(ink, .72);
        g.font = font(UI(500), W * .04);
        trackedC(g, author.toUpperCase(), W / 2, H * .8, W * .01);
        break;
      }

     case 2:
      {
        const band = deep;
        const mid = light ? shade(G, .1) : "#F2EDE0";
        g.fillStyle = mid;
        g.fillRect(0, 0, W, H);
        g.fillStyle = band;
        g.fillRect(0, 0, W, H * .225);
        g.fillStyle = band;
        g.fillRect(0, H * .775, W, H * .225);
        g.fillStyle = rgba(mid, .95);
        g.font = font(UI(700), W * .034);
        trackedC(g, imprint.toUpperCase(), W / 2, H * .13, W * .016);
        const fit = fitTitle(g, title, DISPLAY(600), W - M * 2, H * .22, W * .118, W * .058, 1.08);
        fit.tpl = DISPLAY(600);
        g.fillStyle = "#22302B";
        drawLines(g, fit, W / 2, H * .43, "center");
        g.strokeStyle = "#22302B";
        g.lineWidth = W * .004;
        g.beginPath();
        g.arc(W / 2, H * .615, W * .072, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = onPaper;
        g.font = font(UI(700), W * .046);
        g.textAlign = "center";
        g.fillText(author[0], W / 2, H * .632);
        g.textAlign = "left";
        g.fillStyle = rgba(mid, .92);
        g.font = font(UI(600), W * .038);
        trackedC(g, author.toUpperCase(), W / 2, H * .9, W * .01);
        break;
      }

     case 3:
      {
        const sky = g.createLinearGradient(0, 0, 0, H * .58);
        sky.addColorStop(0, shade(deep, .34));
        sky.addColorStop(1, deep);
        g.fillStyle = sky;
        g.fillRect(0, 0, W, H * .58);
        g.fillStyle = A;
        g.beginPath();
        g.arc(W * .68, H * .2, W * .11, 0, Math.PI * 2);
        g.fill();
        const ridge = (yBase, amp, col) => {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(0, H);
          for (let x = 0; x <= W; x += W / 28) {
            g.lineTo(x, yBase + Math.sin(x / W * 5.6 + amp) * H * .045 + Math.sin(x / W * 13 + amp * 2) * H * .014);
          }
          g.lineTo(W, H);
          g.closePath();
          g.fill();
        };
        ridge(H * .4, 1.1, shade(deep, light ? .34 : -.22));
        ridge(H * .49, 2.7, shade(deep, light ? .1 : -.42));
        g.fillStyle = "#F4F1E6";
        g.fillRect(0, H * .58, W, H * .42);
        g.fillStyle = rgba(A, .9);
        g.fillRect(0, H * .58, W, H * .012);
        const fit = fitTitle(g, title, DISPLAY(700), W - M * 2, H * .21, W * .125, W * .058);
        fit.tpl = DISPLAY(700);
        g.fillStyle = onPaper;
        drawLines(g, fit, M, H * .7);
        g.fillStyle = rgba(onPaper, .62);
        g.font = font(UI(600), W * .032);
        tracked(g, author.toUpperCase(), M, H * .915, W * .012);
        break;
      }

     case 4:
      {
        g.fillStyle = "#F4F1E6";
        g.fillRect(0, 0, W, H);
        g.fillStyle = deep;
        g.fillRect(M * .55, H * .3, W - M * 1.1, H * .4);
        g.strokeStyle = "rgba(34,48,43,.22)";
        g.lineWidth = 1;
        [ H * .3, H * .7 ].forEach(y => {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        });
        g.fillStyle = "#22302B";
        g.font = font(UI(700), W * .03);
        tracked(g, kicker, M * .55, H * .175, W * .014);
        g.fillStyle = A;
        g.fillRect(M * .55, H * .205, W * .09, H * .006);
        const fit = fitTitle(g, title, DISPLAY(600), W - M * 1.9, H * .3, W * .112, W * .052, 1.12);
        fit.tpl = DISPLAY(600);
        g.fillStyle = light ? shade(G, .3) : I;
        drawLines(g, fit, M * .95, H * .415);
        g.fillStyle = "#22302B";
        g.font = font(UI(600), W * .036);
        tracked(g, author, M * .55, H * .805, W * .002);
        g.fillStyle = "rgba(34,48,43,.5)";
        g.font = font(UI(500), W * .026);
        tracked(g, imprint.toUpperCase(), M * .55, H * .93, W * .012);
        break;
      }

     case 5:
      {
        const cloth = light ? shade(scheme.i, .03) : G;
        g.fillStyle = cloth;
        g.fillRect(0, 0, W, H);
        const gl = foil(g, M, M, W - M * 2, H * .1, scheme.a === "#D9B25E" ? "#D9B25E" : "#D6B15F");
        g.strokeStyle = gl;
        g.lineWidth = W * .009;
        g.strokeRect(M * .7, M * .7, W - M * 1.4, H - M * 1.4);
        g.lineWidth = W * .003;
        g.strokeRect(M * 1.05, M * 1.05, W - M * 2.1, H - M * 2.1);
        [ .22, .78 ].forEach(fy => {
          [ .5 ].forEach(() => {
            g.beginPath();
            g.moveTo(W * .5 - W * .1, H * fy);
            g.lineTo(W * .5 + W * .1, H * fy);
            g.stroke();
            g.beginPath();
            g.arc(W * .5, H * fy, W * .018, 0, Math.PI * 2);
            g.stroke();
          });
        });
        const fit = fitTitle(g, title, DISPLAY(600), W - M * 2.6, H * .26, W * .118, W * .054, 1.14);
        fit.tpl = DISPLAY(600);
        g.fillStyle = gl;
        drawLines(g, fit, W / 2, H * .42, "center");
        g.fillStyle = gl;
        g.font = font(UI(600), W * .034);
        trackedC(g, author.toUpperCase(), W / 2, H * .885, W * .014);
        break;
      }

     case 6:
      {
        const pale = luminance(G) > .55 ? G : "#E7EBE4";
        g.fillStyle = pale;
        g.fillRect(0, 0, W, H);
        const disc = light ? deep : G;
        g.fillStyle = disc;
        g.beginPath();
        g.arc(W * .82, H * .27, W * .48, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rgba(A, .92);
        g.beginPath();
        g.arc(W * .82, H * .27, W * .48, Math.PI * .82, Math.PI * 1.28);
        g.fill();
        g.fillStyle = onPaper;
        g.font = font(UI(600), W * .03);
        tracked(g, kicker, M, H * .1, W * .014);
        const fit = fitTitle(g, title, DISPLAY(600), W - M * 2, H * .24, W * .125, W * .058);
        fit.tpl = DISPLAY(600);
        g.fillStyle = onPaper;
        drawLines(g, fit, M, H * .74);
        g.fillStyle = rgba(onPaper, .58);
        g.font = font(UI(600), W * .032);
        tracked(g, author.toUpperCase(), M, H * .9, W * .012);
        break;
      }

     case 7:
      {
        g.fillStyle = G;
        g.fillRect(0, 0, W, H);
        const words = title.toUpperCase().split(" ");
        const top = H * .18, avail = H * .58;
        const lh = avail / words.length;
        words.forEach((wd, i) => {
          let size = lh * .86;
          g.font = font(DISPLAY(700), size);
          while (g.measureText(wd).width > W - M * 1.4 && size > 10) {
            size -= 2;
            g.font = font(DISPLAY(700), size);
          }
          g.fillStyle = i % 2 ? A : I;
          g.fillText(wd, M * .7, top + i * lh + size * .82);
        });
        g.fillStyle = rgba(I, .28);
        g.fillRect(M * .7, H * .8, W - M * 1.4, H * .0035);
        g.fillStyle = rgba(I, .78);
        g.font = font(UI(600), W * .036);
        tracked(g, author.toUpperCase(), M * .7, H * .875, W * .01);
        break;
      }

     case 8:
      {
        g.fillStyle = "#FBFAF4";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "rgba(34,48,43,.11)";
        for (let i = 0; i < 46; i++) {
          const y = H * .085 + i * H * .0198;
          if (y > H * .94) break;
          g.fillRect(M * .8, y, (W - M * 1.6) * rnd(.42, 1), H * .0038);
        }
        g.fillStyle = "rgba(0,0,0,.22)";
        g.fillRect(M * .42 + W * .014, H * .295 + W * .014, W - M * .84, H * .345);
        g.fillStyle = deep;
        g.fillRect(M * .42, H * .295, W - M * .84, H * .345);
        const fit = fitTitle(g, title, DISPLAY(700), W - M * 1.5, H * .19, W * .112, W * .052, 1.1);
        fit.tpl = DISPLAY(700);
        g.fillStyle = light ? shade(G, .34) : I;
        drawLines(g, fit, M * .78, H * .4);
        g.fillStyle = rgba(light ? shade(G, .34) : I, .66);
        g.font = font(UI(600), W * .03);
        tracked(g, author.toUpperCase(), M * .78, H * .598, W * .012);
        break;
      }

     default:
      {
        g.fillStyle = deep;
        g.fillRect(0, 0, W, H * .55);
        g.fillStyle = "#F6F3EA";
        g.fillRect(0, H * .55, W, H * .45);
        g.fillStyle = A;
        g.beginPath();
        g.moveTo(M, H * .16);
        g.lineTo(M + W * .13, H * .16);
        g.lineTo(M + W * .065, H * .3);
        g.closePath();
        g.fill();
        g.fillStyle = rgba(I, .68);
        g.font = font(UI(600), W * .03);
        tracked(g, kicker, M, H * .43, W * .014);
        const fit = fitTitle(g, title, DISPLAY(700), W - M * 2, H * .22, W * .125, W * .058);
        fit.tpl = DISPLAY(700);
        g.fillStyle = onPaper;
        drawLines(g, fit, M, H * .7);
        g.fillStyle = rgba(onPaper, .58);
        g.font = font(UI(600), W * .032);
        tracked(g, author.toUpperCase(), M, H * .9, W * .012);
        break;
      }
    }
    g.restore();
    const hinge = g.createLinearGradient(0, 0, W * .1, 0);
    hinge.addColorStop(0, "rgba(0,0,0,.30)");
    hinge.addColorStop(.5, "rgba(0,0,0,.07)");
    hinge.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = hinge;
    g.fillRect(0, 0, W * .1, H);
    const lip = g.createLinearGradient(W - W * .05, 0, W, 0);
    lip.addColorStop(0, "rgba(255,255,255,0)");
    lip.addColorStop(1, "rgba(255,255,255,.16)");
    g.fillStyle = lip;
    g.fillRect(W - W * .05, 0, W * .05, H);
    const vig = g.createRadialGradient(W * .5, H * .45, W * .28, W * .5, H * .5, W * .9);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,.16)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    g.fillStyle = grainPattern(g);
    g.fillRect(0, 0, W, H);
  }
  function drawSpine(g, W, H, b) {
    const {scheme: scheme, title: title, author: author, imprint: imprint} = b;
    const cloth = shade(scheme.g, luminance(scheme.g) > .5 ? -.1 : -.14);
    const ink = scheme.i, A = scheme.a;
    g.fillStyle = cloth;
    g.fillRect(0, 0, W, H);
    const round = g.createLinearGradient(0, 0, W, 0);
    round.addColorStop(0, "rgba(0,0,0,.42)");
    round.addColorStop(.2, "rgba(0,0,0,.10)");
    round.addColorStop(.46, "rgba(255,255,255,.13)");
    round.addColorStop(.74, "rgba(0,0,0,.10)");
    round.addColorStop(1, "rgba(0,0,0,.42)");
    g.fillStyle = round;
    g.fillRect(0, 0, W, H);
    g.fillStyle = rgba(A, .85);
    g.fillRect(0, H * .085, W, H * .0075);
    g.fillRect(0, H * .705, W, H * .0075);
    g.save();
    g.translate(W * .52, H * .135);
    g.rotate(Math.PI / 2);
    const maxLen = H * .54;
    let size = W * .4;
    g.font = font(DISPLAY(600), size);
    while (g.measureText(title).width > maxLen && size > 4) {
      size -= 1;
      g.font = font(DISPLAY(600), size);
    }
    g.fillStyle = ink;
    g.textBaseline = "middle";
    g.fillText(title, 0, 0);
    g.restore();
    g.save();
    g.translate(W * .52, H * .735);
    g.rotate(Math.PI / 2);
    let asz = W * .27;
    g.font = font(UI(600), asz);
    while (g.measureText(author).width > H * .135 && asz > 3) {
      asz -= 1;
      g.font = font(UI(600), asz);
    }
    g.fillStyle = rgba(ink, .82);
    g.textBaseline = "middle";
    g.fillText(author, 0, 0);
    g.restore();
    g.textBaseline = "alphabetic";
    g.strokeStyle = rgba(ink, .6);
    g.lineWidth = Math.max(1, W * .03);
    g.beginPath();
    g.arc(W * .5, H * .935, W * .16, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = rgba(ink, .6);
    g.fillRect(W * .5 - W * .16, H * .935 - W * .02, W * .32, W * .04);
    g.fillStyle = grainPattern(g);
    g.fillRect(0, 0, W, H);
  }
  function drawBack(g, W, H, b) {
    const {scheme: scheme, imprint: imprint} = b;
    const G = scheme.g, I = scheme.i, A = scheme.a;
    const M = W * .13;
    g.fillStyle = G;
    g.fillRect(0, 0, W, H);
    g.fillStyle = rgba(I, .86);
    g.font = font(DISPLAY(600), W * .062);
    g.fillText("“", M, H * .155);
    g.fillStyle = rgba(I, .58);
    for (let i = 0; i < 3; i++) {
      g.fillRect(M + W * .05, H * .125 + i * H * .036, (W - M * 2 - W * .05) * [ .92, .86, .55 ][i], H * .009);
    }
    g.fillStyle = rgba(A, .9);
    g.fillRect(M + W * .05, H * .255, W * .18, H * .008);
    g.fillStyle = rgba(I, .38);
    for (let i = 0; i < 11; i++) {
      const y = H * .33 + i * H * .031;
      g.fillRect(M, y, (W - M * 2) * rnd(.55, 1), H * .0075);
    }
    const bx = W - M - W * .34, by = H * .78, bw = W * .34, bh = H * .13;
    g.fillStyle = "#F6F3EA";
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = "#1A1A1A";
    let x = bx + bw * .06;
    while (x < bx + bw * .94) {
      const w = rnd(bw * .006, bw * .022);
      g.fillRect(x, by + bh * .12, w, bh * .62);
      x += w + rnd(bw * .006, bw * .02);
    }
    g.font = font(UI(500), bh * .17);
    g.fillText("9 781234 567890", bx + bw * .08, by + bh * .93);
    g.fillStyle = rgba(I, .72);
    g.font = font(UI(600), W * .034);
    tracked(g, imprint.toUpperCase(), M, H * .855, W * .014);
    g.fillStyle = rgba(I, .45);
    g.font = font(UI(500), W * .028);
    g.fillText("parentsgoto.com.au", M, H * .905);
    g.fillStyle = "rgba(0,0,0,.14)";
    g.fillRect(0, 0, W, H);
    const hinge = g.createLinearGradient(W, 0, W * .88, 0);
    hinge.addColorStop(0, "rgba(0,0,0,.34)");
    hinge.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = hinge;
    g.fillRect(W * .88, 0, W * .12, H);
    g.fillStyle = grainPattern(g);
    g.fillRect(0, 0, W, H);
  }
  function drawEdge(g, W, H, b) {
    g.fillStyle = "#F1EADA";
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += .5) {
      const n = .05 + Math.abs(Math.sin(x * 3.1)) * .09 + Math.random() * .035;
      g.fillStyle = `rgba(128,114,88,${n})`;
      g.fillRect(x, 0, .5, H);
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = "rgba(96,86,66,.13)";
      g.fillRect(Math.round(W * (.09 + i * .095)), 0, Math.max(1, W * .01), H);
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(150,124,86,${.03 + Math.random() * .05})`;
      g.beginPath();
      g.ellipse(Math.random() * W, Math.random() * H, W * rnd(.1, .34), H * rnd(.004, .014), 0, 0, Math.PI * 2);
      g.fill();
    }
    const cap = g.createLinearGradient(0, 0, 0, H * .05);
    cap.addColorStop(0, "rgba(46,38,26,.50)");
    cap.addColorStop(1, "rgba(46,38,26,0)");
    g.fillStyle = cap;
    g.fillRect(0, 0, W, H * .05);
    const cap2 = g.createLinearGradient(0, H, 0, H * .95);
    cap2.addColorStop(0, "rgba(46,38,26,.50)");
    cap2.addColorStop(1, "rgba(46,38,26,0)");
    g.fillStyle = cap2;
    g.fillRect(0, H * .95, W, H * .05);
    const side = g.createLinearGradient(0, 0, W * .1, 0);
    side.addColorStop(0, "rgba(46,38,26,.42)");
    side.addColorStop(1, "rgba(46,38,26,0)");
    g.fillStyle = side;
    g.fillRect(0, 0, W * .1, H);
    const side2 = g.createLinearGradient(W, 0, W * .9, 0);
    side2.addColorStop(0, "rgba(46,38,26,.42)");
    side2.addColorStop(1, "rgba(46,38,26,0)");
    g.fillStyle = side2;
    g.fillRect(W * .9, 0, W * .1, H);
  }
  function drawRim(g, W, H, b) {
    const G = b.scheme.g;
    const outer = shade(G, luminance(G) > .5 ? -.06 : .04);
    const core = shade(G, luminance(G) > .5 ? -.34 : -.42);
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, shade(outer, -.06));
    gr.addColorStop(.34, outer);
    gr.addColorStop(.52, core);
    gr.addColorStop(.86, shade(core, -.2));
    gr.addColorStop(1, shade(core, -.42));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = grainPattern(g);
    g.fillRect(0, 0, W, H);
  }
  function sub(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(w));
    c.height = Math.max(2, Math.round(h));
    return c;
  }
  const SCRATCH = {};
  function scratch(slot, w, h) {
    let c = SCRATCH[slot];
    if (!c) c = SCRATCH[slot] = sub(w, h);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    return c;
  }
  function atlasCanvas(b, q) {
    const W = Math.round(AW * q), H = Math.round(AH * q);
    const c = sub(W, H), g = c.getContext("2d");
    g.fillStyle = "#8a8a8a";
    g.fillRect(0, 0, W, H);
    const px = r => ({
      x: Math.round(r.x * W),
      w: Math.round(r.w * W)
    });
    const paint = (r, logicalW, fn) => {
      g.save();
      g.beginPath();
      g.rect(r.x, 0, r.w, H);
      g.clip();
      g.translate(r.x, 0);
      g.scale(r.w / logicalW, 1);
      fn(g, logicalW, H);
      g.restore();
    };
    const fW = Math.max(8, Math.round(H * (BOOK_W * b.wf) / BOOK_H));
    const sW = Math.max(8, Math.round(H * (BOOK_D * b.df) / BOOK_H));
    paint(px(REG.front), fW, (x, w, h) => drawFront(x, w, h, b));
    paint(px(REG.edge), Math.max(10, sW), (x, w, h) => drawEdge(x, w, h, b));
    paint(px(REG.rim), Math.max(8, Math.round(sW * .22)), (x, w, h) => drawRim(x, w, h, b));
    const sr = px(REG.spine);
    const sc = scratch("spine", sW, H);
    drawSpine(sc.getContext("2d"), sW, H, b);
    g.drawImage(sc, sr.x, 0, sr.w, H);
    const br = px(REG.back);
    const bw = Math.max(24, Math.round(fW * .55)), bh = Math.max(24, Math.round(H * .55));
    const bc = scratch("back", bw, bh);
    drawBack(bc.getContext("2d"), bw, bh, b);
    g.drawImage(bc, br.x, 0, br.w, H);
    return c;
  }
  let NORMAL_MAP = null, ROUGH_MAP = null;
  function buildSurfaceMaps() {
    if (NORMAL_MAP) return;
    const W = AW >> 1, H = AH >> 1;
    const hc = sub(W, H), h = hc.getContext("2d");
    h.fillStyle = "#808080";
    h.fillRect(0, 0, W, H);
    const R = r => ({
      x: r.x * W,
      w: r.w * W
    });
    const fr = R(REG.front), sr = R(REG.spine), er = R(REG.edge), br = R(REG.back), rr = R(REG.rim);
    const tooth = (x, w) => {
      const img = h.getImageData(Math.round(x), 0, Math.round(w), H);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() - .5) * 20;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      }
      h.putImageData(img, Math.round(x), 0);
    };
    tooth(fr.x, fr.w);
    tooth(br.x, br.w);
    const groove = (x0, dir) => {
      const g0 = h.createLinearGradient(x0, 0, x0 + dir * W * .022, 0);
      g0.addColorStop(0, "#6a6a6a");
      g0.addColorStop(.5, "#3c3c3c");
      g0.addColorStop(1, "#8e8e8e");
      h.fillStyle = g0;
      h.fillRect(Math.min(x0, x0 + dir * W * .022), 0, W * .022, H);
    };
    groove(fr.x + W * .004, 1);
    groove(br.x + br.w - W * .026, 1);
    const sg = h.createLinearGradient(sr.x, 0, sr.x + sr.w, 0);
    sg.addColorStop(0, "#3a3a3a");
    sg.addColorStop(.5, "#d8d8d8");
    sg.addColorStop(1, "#3a3a3a");
    h.fillStyle = sg;
    h.fillRect(sr.x, 0, sr.w, H);
    h.fillStyle = "rgba(255,255,255,.5)";
    h.fillRect(sr.x, H * .085, sr.w, H * .012);
    h.fillRect(sr.x, H * .705, sr.w, H * .012);
    for (let y = 0; y < H; y += 2) {
      h.fillStyle = `rgba(255,255,255,${.05 + Math.random() * .05})`;
      h.fillRect(sr.x, y, sr.w, 1);
    }
    for (let x = 0; x < er.w; x++) {
      const v = 128 + Math.sin(x * 2.4) * 46;
      h.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      h.fillRect(er.x + x, 0, 1, H);
    }
    const src = h.getImageData(0, 0, W, H).data;
    const out = h.createImageData(W, H);
    const at = (x, y) => src[(clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)) * 4] / 255;
    const STR = 2.6;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * STR;
        const dy = (at(x, y + 1) - at(x, y - 1)) * STR;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const i = (y * W + x) * 4;
        out.data[i] = (nx * .5 + .5) * 255;
        out.data[i + 1] = (ny * .5 + .5) * 255;
        out.data[i + 2] = (nz * .5 + .5) * 255;
        out.data[i + 3] = 255;
      }
    }
    const nc = sub(W, H);
    nc.getContext("2d").putImageData(out, 0, 0);
    NORMAL_MAP = new THREE.CanvasTexture(nc);
    NORMAL_MAP.anisotropy = 8;
    const rc = sub(W, H), r = rc.getContext("2d");
    r.fillStyle = "#6f6f6f";
    r.fillRect(fr.x, 0, fr.w, H);
    r.fillStyle = "#8f8f8f";
    r.fillRect(br.x, 0, br.w, H);
    r.fillStyle = "#d2d2d2";
    r.fillRect(sr.x, 0, sr.w, H);
    r.fillStyle = "#ececec";
    r.fillRect(er.x, 0, er.w, H);
    r.fillStyle = "#c4c4c4";
    r.fillRect(rr.x, 0, rr.w, H);
    for (let i = 0; i < 2600; i++) {
      r.fillStyle = `rgba(255,255,255,${Math.random() * .16})`;
      r.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    ROUGH_MAP = new THREE.CanvasTexture(rc);
  }
  function buildEnv(renderer) {
    const c = sub(256, 128), g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, "#ffffff");
    sky.addColorStop(.42, "#eff3ed");
    sky.addColorStop(.56, "#d7ded6");
    sky.addColorStop(1, "#aab5ac");
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 128);
    const blob = (x, y, rr, a) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, `rgba(255,255,255,${a})`);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    };
    blob(64, 32, 54, 1);
    blob(186, 46, 38, .55);
    blob(128, 112, 76, .22);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    const pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    const env = pm.fromEquirectangular(t).texture;
    pm.dispose();
    t.dispose();
    return env;
  }
  function bookGeometry(wf, df) {
    const W = BOOK_W * wf, H = BOOK_H, D = BOOK_D * df;
    const hw = W / 2, hh = H / 2, hd = D / 2;
    const ov = Math.min(W, H) * .022;
    const bt = Math.min(D * .17, .034);
    const bulge = Math.min(D * .34, hw * .12);
    const SEG = 14;
    const pos = [], nor = [], uvs = [], idx = [];
    const U = (r, t) => r.x + PAD + t * (r.w - PAD * 2);
    const V = t => .004 + t * .992;
    function quad(p, uv, out, n) {
      const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
      const bx = p[3][0] - p[0][0], by = p[3][1] - p[0][1], bz = p[3][2] - p[0][2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      if (nx * out[0] + ny * out[1] + nz * out[2] < 0) {
        p = [ p[3], p[2], p[1], p[0] ];
        uv = [ uv[3], uv[2], uv[1], uv[0] ];
        if (n) n = [ n[3], n[2], n[1], n[0] ];
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      if (!n) {
        n = [ [ nx, ny, nz ] ];
        n[1] = n[2] = n[3] = n[0];
      }
      const base = pos.length / 3;
      for (let i = 0; i < 4; i++) {
        pos.push(p[i][0], p[i][1], p[i][2]);
        nor.push(n[i][0], n[i][1], n[i][2]);
        uvs.push(uv[i][0], uv[i][1]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const board = sign => {
      const zOut = sign * hd, zIn = sign * (hd - bt);
      const R = sign > 0 ? REG.front : REG.back;
      const ux = x => sign > 0 ? (x + hw) / W : 1 - (x + hw) / W;
      const c = [ [ -hw, hh ], [ hw, hh ], [ hw, -hh ], [ -hw, -hh ] ];
      const face = c.map(([x, y]) => [ x, y, zOut ]);
      const fuv = c.map(([x, y]) => [ U(R, ux(x)), V((y + hh) / H) ]);
      quad(face, fuv, [ 0, 0, sign ]);
      const rimA = [ U(REG.rim, 0), U(REG.rim, 1) ];
      const ruv = [ [ rimA[0], V(0) ], [ rimA[0], V(1) ], [ rimA[1], V(1) ], [ rimA[1], V(0) ] ];
      const rim = (out, a, b2, c2, d) => quad([ a, b2, c2, d ], ruv, out);
      rim([ 1, 0, 0 ], [ hw, -hh, zOut ], [ hw, hh, zOut ], [ hw, hh, zIn ], [ hw, -hh, zIn ]);
      rim([ 0, 1, 0 ], [ -hw, hh, zOut ], [ hw, hh, zOut ], [ hw, hh, zIn ], [ -hw, hh, zIn ]);
      rim([ 0, -1, 0 ], [ hw, -hh, zOut ], [ -hw, -hh, zOut ], [ -hw, -hh, zIn ], [ hw, -hh, zIn ]);
      const led = [ [ U(REG.rim, .92), V(0) ], [ U(REG.rim, .92), V(1) ], [ U(REG.rim, 1), V(1) ], [ U(REG.rim, 1), V(0) ] ];
      const ledge = (a, b2, c2, d) => quad([ a, b2, c2, d ], led, [ 0, 0, -sign ]);
      ledge([ hw - ov, -hh, zIn ], [ hw - ov, hh, zIn ], [ hw, hh, zIn ], [ hw, -hh, zIn ]);
      ledge([ -hw, hh - ov, zIn ], [ hw - ov, hh - ov, zIn ], [ hw - ov, hh, zIn ], [ -hw, hh, zIn ]);
      ledge([ -hw, -hh, zIn ], [ hw - ov, -hh, zIn ], [ hw - ov, -hh + ov, zIn ], [ -hw, -hh + ov, zIn ]);
    };
    board(1);
    board(-1);
    const arc = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, th = t * Math.PI;
      const s = Math.sin(th), co = Math.cos(th);
      const x = -hw - bulge * s, z = hd * co;
      let nx = -hd * s, nz = bulge * co;
      const l = Math.hypot(nx, nz) || 1;
      arc.push({
        x: x,
        z: z,
        nx: nx / l,
        nz: nz / l,
        u: U(REG.spine, t)
      });
    }
    for (let i = 0; i < SEG; i++) {
      const a = arc[i], b2 = arc[i + 1];
      quad([ [ a.x, hh, a.z ], [ b2.x, hh, b2.z ], [ b2.x, -hh, b2.z ], [ a.x, -hh, a.z ] ], [ [ a.u, V(1) ], [ b2.u, V(1) ], [ b2.u, V(0) ], [ a.u, V(0) ] ], [ (a.nx + b2.nx) / 2, 0, (a.nz + b2.nz) / 2 ], [ [ a.nx, 0, a.nz ], [ b2.nx, 0, b2.nz ], [ b2.nx, 0, b2.nz ], [ a.nx, 0, a.nz ] ]);
    }
    const bz0 = -hd + bt, bz1 = hd - bt;
    const uz = z => (bz1 - z) / (bz1 - bz0);
    const E = t => U(REG.edge, t);
    quad([ [ hw - ov, hh, bz1 ], [ hw - ov, hh, bz0 ], [ hw - ov, -hh, bz0 ], [ hw - ov, -hh, bz1 ] ], [ [ E(uz(bz1)), V(1) ], [ E(uz(bz0)), V(1) ], [ E(uz(bz0)), V(0) ], [ E(uz(bz1)), V(0) ] ], [ 1, 0, 0 ]);
    quad([ [ -hw, hh - ov, bz0 ], [ hw - ov, hh - ov, bz0 ], [ hw - ov, hh - ov, bz1 ], [ -hw, hh - ov, bz1 ] ], [ [ E(uz(bz0)), V(1) ], [ E(uz(bz0)), V(0) ], [ E(uz(bz1)), V(0) ], [ E(uz(bz1)), V(1) ] ], [ 0, 1, 0 ]);
    quad([ [ -hw, -hh + ov, bz1 ], [ hw - ov, -hh + ov, bz1 ], [ hw - ov, -hh + ov, bz0 ], [ -hw, -hh + ov, bz0 ] ], [ [ E(uz(bz1)), V(1) ], [ E(uz(bz1)), V(0) ], [ E(uz(bz0)), V(0) ], [ E(uz(bz0)), V(1) ] ], [ 0, -1, 0 ]);
    const g = new THREE.BufferGeometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  function mount(target, opts = {}) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) throw new Error("BookField: mount target not found");
    const cfg = Object.assign({
      density: 1,
      motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      interactive: true,
      onHover: null
    }, opts);
    if (!window.THREE || !hasWebGL()) return cssFallback(host, cfg);
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 620;
    const cores = navigator.hardwareConcurrency || 8;
    const mem = navigator.deviceMemory || 8;
    const lowPower = cores <= 4 || mem <= 4 || smallScreen;
    const ATLAS_Q = lowPower ? .55 : 1;
    const DPR_MAX = lowPower ? 1.25 : 1.75;
    let dprCap = DPR_MAX;
    let frameGap = 0;
    const scene = new THREE.Scene;
    scene.fog = new THREE.Fog(15330791, 15, 34);
    const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
    camera.position.set(0, 0, 13.5);
    const renderer = new THREE.WebGLRenderer({
      antialias: (window.devicePixelRatio || 1) < 1.5,
      alpha: true,
      stencil: false,
      depth: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    host.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    if (!cfg.interactive) canvas.style.pointerEvents = "none";
    scene.add(new THREE.HemisphereLight(16777215, 13029828, .62));
    const key = new THREE.DirectionalLight(16774372, 1.35);
    key.position.set(-4.5, 6, 8);
    const rim = new THREE.DirectionalLight(14477282, .55);
    rim.position.set(6, -2.5, -5);
    scene.add(key, rim);
    buildSurfaceMaps();
    const envMap = buildEnv(renderer);
    const group = new THREE.Group;
    scene.add(group);
    const books = [];
    let queue = [];
    let token = 0;
    const COMP = {
      inner: rnd(.46, .58),
      outer: rnd(1.12, 1.34),
      spin: Math.random() * Math.PI * 2,
      zLo: rnd(-6.4, -4.6),
      zHi: rnd(.5, 1.7),
      lean: rnd(.2, .38),
      bias: rnd(.66, .92)
    };
    function plan() {
      const myToken = ++token;
      disposeBooks();
      const w = host.clientWidth || window.innerWidth;
      const base = w < 560 ? 8 : w < 900 ? 12 : 16;
      const n = clamp(Math.round(base * cfg.density), 5, 26);
      const schemes = SCHEMES.slice();
      for (let i = schemes.length - 1; i > 0; i--) {
        const j = Math.random() * (i + 1) | 0;
        const t = schemes[i];
        schemes[i] = schemes[j];
        schemes[j] = t;
      }
      const sLo = n > 18 ? 1.3 : n > 11 ? 1.5 : 1.75;
      const sHi = n > 18 ? 2.15 : n > 11 ? 2.45 : 2.85;
      const specs = [];
      const offset = Math.random() * SHELF.length | 0;
      for (let i = 0; i < n; i++) {
        const [title, author] = SHELF[(i + offset) % SHELF.length];
        specs.push({
          token: myToken,
          index: i,
          total: n,
          title: title,
          author: author,
          sLo: sLo,
          sHi: sHi,
          scheme: schemes[(i * 5 + (Math.random() * 3 | 0)) % schemes.length],
          variant: (i * 3 + (Math.random() * 10 | 0)) % 10,
          kicker: KICKERS[Math.random() * KICKERS.length | 0],
          imprint: IMPRINTS[Math.random() * IMPRINTS.length | 0],
          wf: rnd(.92, 1.08),
          df: rnd(.62, 1.75)
        });
      }
      queue = specs;
    }
    function makeBook(spec) {
      if (spec.token !== token) return;
      const tex = new THREE.CanvasTexture(atlasCanvas(spec, ATLAS_Q));
      tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      tex.encoding = THREE.sRGBEncoding;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        normalMap: NORMAL_MAP,
        normalScale: new THREE.Vector2(.7, .7),
        roughnessMap: ROUGH_MAP,
        roughness: rnd(.82, 1),
        metalness: .05,
        envMap: envMap,
        envMapIntensity: .58
      });
      const geo = bookGeometry(spec.wf, spec.df);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      const s = rnd(spec.sLo, spec.sHi);
      const b = {
        mesh: mesh,
        mat: mat,
        tex: tex,
        geo: geo,
        title: spec.title,
        author: spec.author,
        baseScale: s,
        grow: 0,
        baseZRot: rnd(-.26, .26),
        ang: COMP.spin + spec.index / spec.total * Math.PI * 2 + rnd(-.22, .22),
        t: Math.random(),
        z: rnd(COMP.zLo, COMP.zHi),
        phase: Math.random() * Math.PI * 2,
        speed: rnd(.2, .46),
        tilt: rnd(-COMP.lean, COMP.lean),
        roll: rnd(-.55, .55),
        lift: 0,
        flip: 0,
        flipping: false,
        home: new THREE.Vector3
      };
      mesh.scale.set(.001, .001, .001);
      mesh.rotation.set(b.tilt, b.roll, b.baseZRot);
      books.push(b);
      group.add(mesh);
      layoutOne(b, true);
    }
    let kx = 0, ky = 0, ex = 0, ey = 0;
    function measure() {
      const halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
      const halfW = halfH * camera.aspect;
      kx = halfW * COMP.inner;
      ky = halfH * (COMP.inner * .88);
      ex = halfW * COMP.outer;
      ey = halfH * (COMP.outer * 1.03);
    }
    function layoutOne(b, snap) {
      const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
      const dIn = 1 / Math.hypot(dx / kx, dy / ky);
      const dOut = 1 / Math.hypot(dx / ex, dy / ey);
      const d = dIn + Math.pow(b.t, COMP.bias) * (dOut - dIn);
      const k = (camera.position.z - b.z) / camera.position.z;
      b.home.set(dx * d * k, dy * d * k, b.z);
      if (snap) b.mesh.position.copy(b.home);
    }
    function layout(snap) {
      measure();
      for (const b of books) layoutOne(b, snap);
    }
    const pointer = new THREE.Vector2(0, 0);
    const ray = new THREE.Raycaster;
    let hovered = null, overUI = false, dragging = false, pointerFresh = false;
    let px = 0, py = 0, velX = 0, velY = 0;
    let yaw = 0, pitch = 0;
    let pressed = null, downX = 0, downY = 0, touchLabelUntil = 0;
    function ndc(e) {
      const r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / r.width * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height * 2 - 1);
      pointerFresh = true;
    }
    function pickNow() {
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(group.children, false);
      for (const h of hits) {
        if (!h.object.visible) continue;
        return books.find(b => b.mesh === h.object) || null;
      }
      return null;
    }
    function onMove(e) {
      if (!cfg.interactive) return;
      const t = e.target;
      overUI = !!(t && t.closest && t.closest(".card,.brand,.skip,a,button,input"));
      ndc(e);
      if (dragging) {
        velX += (e.clientX - px) * 42e-5;
        velY += (e.clientY - py) * 3e-4;
        px = e.clientX;
        py = e.clientY;
      }
    }
    function onDown(e) {
      if (!cfg.interactive) return;
      if (e.target !== canvas) return;
      ndc(e);
      pressed = pickNow();
      if (pressed) {
        hovered = pressed;
        if (cfg.onHover) cfg.onHover(pressed);
        if (e.pointerType === "touch") touchLabelUntil = performance.now() + 1800;
      }
      downX = px = e.clientX;
      downY = py = e.clientY;
      dragging = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
    function onUp(e) {
      if (!cfg.interactive) return;
      if (!dragging) return;
      dragging = false;
      const travel = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (pressed && travel < 8 && !pressed.flipping) {
        pressed.flipping = true;
        pressed.flip = 0;
      }
      pressed = null;
    }
    function onCancel() {
      dragging = false;
      pressed = null;
    }
    function onLeave() {
      if (!cfg.interactive) return;
      hovered = null;
      if (cfg.onHover) cfg.onHover(null);
    }
    window.addEventListener("pointermove", onMove, {
      passive: true
    });
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    document.addEventListener("pointerleave", onLeave);
    let lastW = 0, lastH = 0, resizeTimer = 0;
    function applySize() {
      const w = Math.round(host.clientWidth || window.innerWidth);
      const h = Math.round(host.clientHeight || window.innerHeight);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      const portrait = h > w;
      camera.fov = portrait ? 54 : 42;
      camera.position.z = portrait ? 15 : 13.5;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setSize(w, h, false);
      layout(false);
    }
    function onResize() {
      const w = Math.round(host.clientWidth || window.innerWidth);
      if (w !== lastW) {
        clearTimeout(resizeTimer);
        applySize();
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applySize, 220);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    let last = performance.now(), time = 0, raf = 0, running = false;
    let frames = 0, acc = 0, culled = 0;
    function monitor(ms) {
      acc += ms;
      frames++;
      if (frames < 70) return;
      const avg = acc / frames;
      acc = 0;
      frames = 0;
      if (avg > 21) {
        if (books.length - culled > 6) culled += 2; else if (dprCap > 1) {
          dprCap = Math.max(1, dprCap - .25);
          lastW = 0;
          applySize();
        } else frameGap = 32;
      } else if (avg < 13) {
        if (frameGap) frameGap = 0; else if (dprCap < DPR_MAX) {
          dprCap = Math.min(DPR_MAX, dprCap + .25);
          lastW = 0;
          applySize();
        } else if (culled > 0) culled -= 1;
      }
    }
    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (frameGap && now - last < frameGap) return;
      const ms = now - last;
      last = now;
      const dt = Math.min(ms / 1e3, .05);
      time += dt;
      const work0 = performance.now();
      if (queue.length && ms < 34) makeBook(queue.shift());
      yaw += velX;
      pitch += velY;
      velX *= .9;
      velY *= .9;
      if (!dragging) {
        const lean = cfg.interactive ? pointer.x * .1 : 0;
        const yawT = lean + (cfg.motion ? Math.sin(time * .12) * .05 : 0);
        const pitchT = cfg.interactive ? -pointer.y * .07 : 0;
        yaw += (yawT - yaw) * .022;
        pitch += (pitchT - pitch) * .022;
      }
      group.rotation.y = yaw = clamp(yaw, -.55, .55);
      group.rotation.x = pitch = clamp(pitch, -.3, .3);
      if (cfg.interactive && pointerFresh && !dragging) {
        pointerFresh = false;
        const prev = hovered;
        hovered = overUI ? null : pickNow();
        if (hovered !== prev) {
          canvas.style.cursor = hovered ? "pointer" : "";
          if (cfg.onHover) cfg.onHover(hovered);
        }
      }
      if (touchLabelUntil && now > touchLabelUntil) {
        touchLabelUntil = 0;
        hovered = null;
        if (cfg.onHover) cfg.onHover(null);
      }
      const visibleCount = books.length - culled;
      for (let i = 0; i < books.length; i++) {
        const b = books[i], m = b.mesh;
        if (i >= visibleCount) {
          m.visible = false;
          continue;
        }
        m.visible = true;
        b.grow += (1 - b.grow) * .09;
        b.lift += ((b === hovered ? 1 : 0) - b.lift) * .13;
        const bob = cfg.motion ? Math.sin(time * b.speed + b.phase) * .32 : 0;
        const sway = cfg.motion ? Math.cos(time * b.speed * .7 + b.phase) * .2 : 0;
        m.position.set(b.home.x + sway, b.home.y + bob, b.home.z + b.lift * 1.5);
        const gs = b.grow * (1 + b.lift * .05);
        const us = b.baseScale * gs;
        m.scale.set(us, us, us);
        if (b.flipping) {
          b.flip += dt / 1.05;
          if (b.flip >= 1) {
            b.flip = 0;
            b.flipping = false;
          }
        }
        const flipAngle = b.flipping ? easeOut(b.flip) * Math.PI * 2 : 0;
        const idle = cfg.motion ? Math.sin(time * b.speed * .55 + b.phase) * .06 : 0;
        const drift = cfg.motion ? Math.sin(time * .3 + b.phase) * .045 : 0;
        m.rotation.x = (b.tilt + drift) * (1 - b.lift);
        m.rotation.y = (b.roll + idle) * (1 - b.lift) + flipAngle;
        m.rotation.z = b.baseZRot * (1 - b.lift);
        b.mat.envMapIntensity = .55 + b.lift * .5;
      }
      renderer.render(scene, camera);
      monitor(performance.now() - work0);
    }
    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    const onVis = () => document.hidden ? stop() : start();
    document.addEventListener("visibilitychange", onVis);
    canvas.addEventListener("webglcontextlost", e => {
      e.preventDefault();
      stop();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      lastW = 0;
      applySize();
      start();
    });
    function disposeBooks() {
      for (const b of books) {
        group.remove(b.mesh);
        b.tex.dispose();
        b.mat.dispose();
        b.geo.dispose();
      }
      books.length = 0;
      if (hovered && cfg.onHover) cfg.onHover(null);
      hovered = pressed = null;
      culled = 0;
    }
    applySize();
    plan();
    start();
    return {
      setMotion(on) {
        cfg.motion = !!on;
      },
      setDensity(d) {
        cfg.density = clamp(Number(d) || 1, .3, 2.2);
        plan();
      },
      shuffle() {
        for (const b of books) {
          b.ang = Math.random() * Math.PI * 2;
          b.t = Math.random();
          b.z = rnd(COMP.zLo, COMP.zHi);
          b.tilt = rnd(-COMP.lean, COMP.lean);
          b.roll = rnd(-.55, .55);
          b.phase = Math.random() * Math.PI * 2;
        }
        layout(false);
      },
      get hovered() {
        return hovered;
      },
      resume() {
        start();
      },
      pause() {
        stop();
      },
      destroy() {
        stop();
        ro.disconnect();
        clearTimeout(resizeTimer);
        queue.length = 0;
        token++;
        disposeBooks();
        envMap.dispose();
        document.removeEventListener("visibilitychange", onVis);
        document.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onCancel);
        canvas.removeEventListener("pointerdown", onDown);
        renderer.dispose();
        host.innerHTML = "";
      }
    };
  }
  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) {
      return false;
    }
  }
  function cssFallback(host, cfg) {
    const wrapEl = document.createElement("div");
    wrapEl.className = "fallback";
    const off = Math.random() * SHELF.length | 0;
    const soff = Math.random() * SCHEMES.length | 0;
    const n = clamp(Math.round((window.innerWidth < 560 ? 6 : 10) * cfg.density), 4, 14);
    for (let i = 0; i < n; i++) {
      const [title, author] = SHELF[(i + off) % SHELF.length];
      const spec = {
        title: title,
        author: author,
        scheme: SCHEMES[(i + soff) % SCHEMES.length],
        variant: (i * 3 + (Math.random() * 10 | 0)) % 10,
        kicker: KICKERS[i % KICKERS.length],
        imprint: IMPRINTS[i % IMPRINTS.length],
        wf: 1,
        df: 1
      };
      const w = rnd(96, 168);
      const c = sub(300, 435);
      drawFront(c.getContext("2d"), 300, 435, spec);
      c.className = "bk";
      const ang = i / n * Math.PI * 2;
      c.style.width = w + "px";
      c.style.height = w * 1.45 + "px";
      c.style.left = `calc(50% + ${Math.cos(ang) * rnd(30, 46)}vw - ${w / 2}px)`;
      c.style.top = `calc(50% + ${Math.sin(ang) * rnd(28, 44)}vh - ${w * .72}px)`;
      c.style.setProperty("--rot", rnd(-15, 15) + "deg");
      c.style.animationDelay = -i * 1.3 + "s";
      c.style.opacity = String(rnd(.6, .95));
      wrapEl.appendChild(c);
    }
    host.appendChild(wrapEl);
    return {
      setMotion(on) {
        wrapEl.querySelectorAll(".bk").forEach(el => {
          el.style.animationPlayState = on ? "running" : "paused";
        });
      },
      setDensity() {},
      shuffle() {},
      get hovered() {
        return null;
      },
      resume() {},
      pause() {},
      destroy() {
        host.innerHTML = "";
      }
    };
  }
  return {
    mount: mount
  };
})();

(function() {
  "use strict";
  var label = document.getElementById("spineLabel");
  label.innerHTML = "<b></b><span></span>";
  var labelTitle = label.querySelector("b");
  var labelAuthor = label.querySelector("span");
  var lx = 0, ly = 0, labelOn = false, labelQueued = false;
  function placeLabel() {
    labelQueued = false;
    label.style.transform = "translate3d(" + lx + "px," + ly + "px,0) translate(-50%,-140%)";
  }
  window.addEventListener("pointermove", function(e) {
    lx = e.clientX;
    ly = e.clientY;
    if (!labelOn || labelQueued) {
      return;
    }
    labelQueued = true;
    requestAnimationFrame(placeLabel);
  }, {
    passive: true
  });
  var DENSITIES = [ .45, .55, .55, .7, .7, .85, .85, 1 ];
  var SHELF_3D = true;
  var SHELF_INTERACTIVE = false;
  function boot() {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!SHELF_3D) {
      var host = document.getElementById("shelf");
      if (host) {
        host.style.display = "none";
      }
      return;
    }
    return BookField.mount("#shelf", {
      density: DENSITIES[Math.floor(Math.random() * DENSITIES.length)],
      motion: !reduced.matches,
      interactive: SHELF_INTERACTIVE,
      onHover: SHELF_INTERACTIVE ? function(book) {
        if (!book) {
          labelOn = false;
          label.dataset.on = "0";
          return;
        }
        labelTitle.textContent = book.title;
        labelAuthor.textContent = book.author;
        labelOn = true;
        placeLabel();
        label.dataset.on = "1";
      } : null
    });
  }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) {
      return Promise.resolve();
    }
    var wanted = [ "600 64px Fraunces", "700 64px Fraunces", '500 20px "Public Sans"', '600 20px "Public Sans"', '700 20px "Public Sans"' ].map(function(f) {
      return document.fonts.load(f).catch(function() {});
    });
    return Promise.race([ Promise.all(wanted), new Promise(function(r) {
      setTimeout(r, 2500);
    }) ]);
  }
  var field = null, booting = false;
  window.PTGShelf = {
    ensure: function() {
      if (booting) {
        return;
      }
      booting = true;
      fontsReady().then(function() {
        try {
          field = boot() || null;
          if (field && field.setMotion) {
            var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
            var onReduced = function(e) {
              field.setMotion(!e.matches);
            };
            if (reduced.addEventListener) {
              reduced.addEventListener("change", onReduced);
            } else if (reduced.addListener) {
              reduced.addListener(onReduced);
            }
          }
        } catch (err) {
          if (window.console) {
            console.warn("Shelf unavailable:", err);
          }
        }
      });
    },
    resume: function() {
      if (field && field.resume) {
        field.resume();
      }
    },
    pause: function() {
      if (field && field.pause) {
        field.pause();
      }
    }
  };
})();

(function() {
  "use strict";
  var $ = function(id) {
    return document.getElementById(id);
  };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var card = $("card");
  var route = $("route");
  var views = {
    signin: {
      el: $("view-signin"),
      head: $("h-signin"),
      title: "Sign in",
      first: $("email")
    },
    create: {
      el: $("view-create"),
      head: $("h-create"),
      title: "Create your account",
      first: $("cName")
    },
    forgot: {
      el: $("view-forgot"),
      head: $("h-forgot"),
      title: "Reset your password",
      first: $("fEmail")
    },
    sent: {
      el: $("view-sent"),
      head: $("h-sent"),
      title: "Check your inbox",
      first: null
    },
    code: {
      el: $("view-code"),
      head: $("h-code"),
      title: "Enter your one-time code",
      first: $("otp")
    },
    genres: {
      el: $("view-genres"),
      head: $("h-genres"),
      title: "What do they like to read?",
      first: null
    },
    done: {
      el: $("view-done"),
      head: $("h-done"),
      title: "Signed in",
      first: null
    }
  };
  var currentView = "signin";
  function go(name, opts) {
    var v = views[name];
    if (!v) {
      return;
    }
    opts = opts || {};
    Object.keys(views).forEach(function(k) {
      views[k].el.classList.toggle("is-active", k === name);
    });
    currentView = name;
    document.title = v.title + " — Parents Go To";
    v.head.focus();
    route.textContent = v.title;
    if (!opts.keepScroll) {
      card.scrollIntoView({
        block: "nearest",
        behavior: reduced.matches ? "auto" : "smooth"
      });
    }
  }
  document.addEventListener("click", function(e) {
    var t = e.target.closest ? e.target.closest("[data-go]") : null;
    if (t) {
      e.preventDefault();
      if (t.hasAttribute("data-signout")) {
        resetAuthForms();
      } else {
        carryEmail(currentView, t.getAttribute("data-go"));
      }
      go(t.getAttribute("data-go"));
      return;
    }
    var noop = e.target.closest ? e.target.closest("[data-noop]") : null;
    if (noop) {
      e.preventDefault();
    }
  });
  function carryEmail(from, to) {
    var sources = {
      signin: $("email"),
      create: $("cEmail"),
      forgot: $("fEmail")
    };
    var src = sources[from];
    var dst = sources[to];
    if (src && dst && src.value.trim() && !dst.value.trim()) {
      dst.value = src.value.trim();
    }
  }
  function resetAuthForms() {
    if (window.PTGSession) {
      window.PTGSession.end();
    }
    [ "signinForm", "createForm", "forgotForm", "codeForm", "genresForm" ].forEach(function(id) {
      var f = $(id);
      if (f) {
        f.reset();
      }
    });
    [].slice.call(card.querySelectorAll(".reveal")).forEach(function(btn) {
      var input = btn.parentNode.querySelector("input");
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Show password");
      if (input) {
        input.type = "password";
      }
    });
    [].slice.call(card.querySelectorAll("[aria-invalid]")).forEach(function(el) {
      el.removeAttribute("aria-invalid");
    });
    [].slice.call(card.querySelectorAll(".hint.is-on")).forEach(function(h) {
      h.classList.remove("is-on");
      var span = h.querySelector("span");
      if (span) {
        span.textContent = "";
      }
    });
    [].slice.call(card.querySelectorAll(".alert.is-on")).forEach(function(a) {
      a.classList.remove("is-on");
    });
    if (segment) {
      segment.dataset.role = "parent";
    }
    if (typeof cPassword !== "undefined" && cPassword) {
      cPassword.dispatchEvent(new Event("input", {
        bubbles: true
      }));
    }
  }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function setHint(input, hintId, message) {
    var hint = $(hintId);
    var span = hint.querySelector("span");
    if (message) {
      span.textContent = message;
      hint.classList.add("is-on");
      input.setAttribute("aria-invalid", "true");
    } else {
      hint.classList.remove("is-on");
      input.removeAttribute("aria-invalid");
      window.setTimeout(function() {
        if (!hint.classList.contains("is-on")) {
          span.textContent = "";
        }
      }, 280);
    }
    return !message;
  }
  function showAlert(boxId, textId, message) {
    var box = $(boxId);
    if (!message) {
      box.classList.remove("is-on");
      return;
    }
    $(textId).textContent = message;
    box.classList.add("is-on");
    if (!reduced.matches) {
      card.classList.add("is-wrong");
      window.setTimeout(function() {
        card.classList.remove("is-wrong");
      }, 450);
    }
  }
  window.PTGAuthNotice = function(message) {
    showAlert("signinAlert", "signinAlertText", message);
  };
  function busy(button, label, ms, then) {
    var span = button.querySelector("span");
    var was = span.textContent;
    button.classList.add("is-busy");
    span.textContent = label;
    window.setTimeout(function() {
      button.classList.remove("is-busy");
      span.textContent = was;
      then();
    }, ms);
  }
  function bindReveal(buttonId, inputId) {
    var btn = $(buttonId), input = $(inputId);
    btn.addEventListener("click", function() {
      var shown = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", String(!shown));
      input.type = shown ? "password" : "text";
      btn.setAttribute("aria-label", shown ? "Show password" : "Hide password");
      input.focus();
    });
  }
  function bindCaps(inputId, hintId) {
    var input = $(inputId), hint = $(hintId);
    [ "keydown", "keyup" ].forEach(function(evt) {
      input.addEventListener(evt, function(e) {
        if (typeof e.getModifierState !== "function") {
          return;
        }
        hint.classList.toggle("is-on", !!e.getModifierState("CapsLock"));
      });
    });
    input.addEventListener("blur", function() {
      hint.classList.remove("is-on");
    });
  }
  var segment = $("segment");
  [].slice.call(document.getElementsByName("role")).forEach(function(r) {
    r.addEventListener("change", function() {
      segment.dataset.role = r.value;
    });
  });
  bindReveal("reveal", "password");
  bindCaps("password", "capsHint");
  var signinForm = $("signinForm");
  var email = $("email"), password = $("password");
  function validateSignin() {
    var ok = true;
    var e = email.value.trim();
    if (!e) {
      ok = setHint(email, "emailHint", "Enter the email address on your account.") && ok;
    } else if (!EMAIL.test(e)) {
      ok = setHint(email, "emailHint", "That address is missing an @ or a domain — check it and try again.") && ok;
    } else {
      setHint(email, "emailHint", "");
    }
    if (!password.value) {
      ok = setHint(password, "pwHint", "Enter your password.") && ok;
    } else {
      setHint(password, "pwHint", "");
    }
    return ok;
  }
  [ email, password ].forEach(function(input) {
    input.addEventListener("input", function() {
      if (input.getAttribute("aria-invalid") === "true") {
        validateSignin();
      }
    });
  });
  signinForm.addEventListener("submit", function(e) {
    e.preventDefault();
    showAlert("signinAlert", "signinAlertText", "");
    if (!validateSignin()) {
      (card.querySelector('.view.is-active [aria-invalid="true"]') || email).focus();
      return;
    }
    var admin = $("role-admin").checked;
    var who = email.value.trim();
    busy($("signinSubmit"), "Checking…", 1150, function() {
      var seen = window.PTGAccounts ? window.PTGAccounts.check(who, password.value) : {
        ok: password.value === "demo1234",
        demo: true
      };
      if (seen.ok) {
        if (admin) {
          startAdminChallenge(who);
        } else {
          if (window.PTGSession) {
            window.PTGSession.start(who, "parent");
          }
          $("doneText").textContent = seen.demo ? "Signed in. Taking you to your shelf…" : "Taking you to your shelf…";
          $("doneAdmin").hidden = true;
          $("doneGo").hidden = false;
          $("doneAdminGo").hidden = true;
          go("done");
          if (window.PTGApp) {
            window.PTGApp.loadShelf(who, {
              demo: !!seen.demo,
              name: seen.name
            });
          }
          openShelfShortly();
        }
      } else if (seen.suspended) {
        showAlert("signinAlert", "signinAlertText", "That account has been suspended by an administrator. Contact the site owner to have it restored.");
        password.value = "";
        password.focus();
      } else {
        showAlert("signinAlert", "signinAlertText", "That email and password don’t match an account. Check the password, or reset it below.");
        password.value = "";
        password.focus();
      }
    });
  });
  var ADMIN_CODE = "246810";
  var codeFor = "", codeTries = 0;
  function startAdminChallenge(whoEmail) {
    codeFor = whoEmail;
    codeTries = 0;
    $("otp").value = "";
    $("codeEmail").textContent = whoEmail;
    setHint($("otp"), "otpHint", "");
    showAlert("codeAlert", "codeAlertText", "");
    go("code");
    window.setTimeout(function() {
      $("otp").focus();
    }, 60);
  }
  $("otp").addEventListener("input", function() {
    var cleaned = $("otp").value.replace(/\D+/g, "").slice(0, 6);
    if (cleaned !== $("otp").value) {
      $("otp").value = cleaned;
    }
    if ($("otp").getAttribute("aria-invalid") === "true") {
      setHint($("otp"), "otpHint", "");
    }
  });
  $("codeForm").addEventListener("submit", function(e) {
    e.preventDefault();
    var value = $("otp").value.trim();
    showAlert("codeAlert", "codeAlertText", "");
    if (value.length !== 6) {
      setHint($("otp"), "otpHint", "The code is six digits long.");
      $("otp").focus();
      return;
    }
    busy($("codeSubmit"), "Checking the code…", 900, function() {
      if (value !== ADMIN_CODE) {
        codeTries++;
        if (window.PTGAudit) {
          window.PTGAudit.write("auth", "Failed administrator one-time code (attempt " + codeTries + " of 3)", codeFor);
        }
        if (codeTries >= 3) {
          if (window.PTGAudit) {
            window.PTGAudit.write("auth", "Administrator sign-in abandoned after three wrong codes", codeFor);
          }
          resetAuthForms();
          go("signin");
          window.PTGAuthNotice("Three wrong codes — that sign-in was abandoned and logged. Start again when you have the right code.");
          return;
        }
        showAlert("codeAlert", "codeAlertText", "That code is not right. " + (3 - codeTries) + (3 - codeTries === 1 ? " attempt left." : " attempts left."));
        $("otp").value = "";
        $("otp").focus();
        return;
      }
      if (window.PTGSession) {
        window.PTGSession.start(codeFor, "admin");
      }
      $("doneText").textContent = "Signed in as an administrator. Opening the console…";
      $("doneAdmin").hidden = false;
      $("doneGo").hidden = true;
      $("doneAdminGo").hidden = false;
      go("done");
      openConsoleShortly();
    });
  });
  function openConsoleShortly() {
    window.setTimeout(function() {
      if ($("view-done").classList.contains("is-active")) {
        window.location.hash = "#admin";
      }
    }, 1e3);
  }
  $("doneAdminGo").addEventListener("click", function() {
    window.location.hash = "#admin";
  });
  function openShelfShortly() {
    window.setTimeout(function() {
      if ($("view-done").classList.contains("is-active")) {
        window.location.hash = "#app";
      }
    }, 1e3);
  }
  $("doneGo").addEventListener("click", function() {
    window.location.hash = "#app";
  });
  var genresForm = $("genresForm");
  var genresFor = "";
  function genresPicked() {
    if (!genresForm) {
      return [];
    }
    var boxes = genresForm.querySelectorAll('input[name="genre"]:checked');
    return Array.prototype.map.call(boxes, function(b) {
      return b.value;
    });
  }
  function genresCount() {
    var el = $("genresCount");
    if (!el) {
      return;
    }
    var n = genresPicked().length;
    el.textContent = n === 0 ? "Nothing picked yet — that is fine, you can skip this." : n === 1 ? "1 interest picked." : n + " interests picked.";
  }
  function genresFinish(text) {
    $("doneText").textContent = text;
    $("doneAdmin").hidden = true;
    $("doneGo").hidden = false;
    $("doneAdminGo").hidden = true;
    go("done");
    openShelfShortly();
  }
  function genresBegin(email) {
    genresFor = email || "";
    if (!genresForm || !views.genres || !views.genres.el) {
      genresFinish("Your account is ready. Setting up your shelf…");
      return;
    }
    genresForm.reset();
    genresCount();
    go("genres");
  }
  if (genresForm) {
    genresForm.addEventListener("change", genresCount);
    genresForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var picked = genresPicked();
      if (window.PTGGenres) {
        if (picked.length) {
          window.PTGGenres.save(genresFor, picked);
        } else {
          window.PTGGenres.skip(genresFor);
        }
      }
      genresFinish(picked.length ? "Saved. Setting up your shelf…" : "Your account is ready. Setting up your shelf…");
    });
  }
  if ($("genresSkip")) {
    $("genresSkip").addEventListener("click", function() {
      if (window.PTGGenres) {
        window.PTGGenres.skip(genresFor);
      }
      genresFinish("Your account is ready. Setting up your shelf…");
    });
  }
  bindReveal("cReveal", "cPassword");
  bindCaps("cPassword", "cCapsHint");
  var createForm = $("createForm");
  var cName = $("cName"), cEmail = $("cEmail"), cPassword = $("cPassword"), cConfirm = $("cConfirm"), cTerms = $("cTerms"), cGuardian = $("cGuardian");
  var meter = $("meter"), meterLabel = $("meterLabel"), meterTip = $("meterTip"), meterStatus = $("meterStatus");
  var WORDS = [ "Not set yet", "Too easy to guess", "Weak", "Good", "Strong" ];
  var COMMON = [ "password", "password1", "12345678", "123456789", "qwerty123", "letmein", "welcome1", "iloveyou", "abc12345", "demo1234", "parents", "children", "books" ];
  var RULES = [ {
    id: "len",
    lc: "ten or more characters",
    test: function(v) {
      return v.length >= 10;
    }
  }, {
    id: "upper",
    lc: "a capital letter",
    test: function(v) {
      return /\p{Lu}/u.test(v);
    }
  }, {
    id: "lower",
    lc: "a lowercase letter",
    test: function(v) {
      return /\p{Ll}/u.test(v);
    }
  }, {
    id: "digit",
    lc: "a number",
    test: function(v) {
      return /\p{Nd}/u.test(v);
    }
  }, {
    id: "sym",
    lc: "a symbol",
    test: function(v) {
      return /[^\p{L}\p{N}]/u.test(v);
    }
  } ];
  var ruleEls = [].slice.call($("pwRules").querySelectorAll("li"));
  function score(pw) {
    var met = RULES.map(function(r) {
      return r.test(pw);
    });
    var kept = met.filter(Boolean).length;
    var base = {
      met: met,
      kept: kept,
      common: false
    };
    if (!pw) {
      base.n = 0;
      base.tip = "Longer is stronger";
      return base;
    }
    var lower = pw.toLowerCase();
    for (var i = 0; i < COMMON.length; i++) {
      if (lower === COMMON[i] || lower.indexOf(COMMON[i]) === 0) {
        base.n = 1;
        base.common = true;
        base.tip = "This one is on every guessing list";
        return base;
      }
    }
    var n = 1;
    if (pw.length >= 10) {
      n++;
    }
    if (pw.length >= 14) {
      n++;
    }
    if (pw.length >= 20) {
      n++;
    }
    if (kept >= 4 && pw.length >= 12) {
      n++;
    }
    if (kept === RULES.length) {
      n = Math.max(n, 3);
    }
    if (/(.)\1{2,}/.test(pw)) {
      n--;
    }
    if (/^\p{Nd}+$/u.test(pw)) {
      n = 1;
    }
    base.n = Math.max(1, Math.min(4, n));
    if (base.n === 1) {
      base.tip = "Try a short phrase you will remember";
    }
    if (base.n === 2) {
      base.tip = "Longer beats more symbols";
    }
    if (base.n === 3) {
      base.tip = "A few more characters makes this strong";
    }
    if (base.n === 4) {
      base.tip = "Strong. A password manager can store this";
    }
    return base;
  }
  function paintRules(met) {
    for (var i = 0; i < ruleEls.length; i++) {
      ruleEls[i].setAttribute("data-met", met[i] ? "true" : "false");
    }
  }
  function asList(items) {
    if (items.length === 1) {
      return items[0];
    }
    return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
  }
  function stillNeeds(s) {
    return RULES.filter(function(r, i) {
      return !s.met[i];
    }).map(function(r) {
      return r.lc;
    });
  }
  var announceTimer = null;
  cPassword.addEventListener("input", function() {
    var s = score(cPassword.value);
    meter.dataset.score = String(s.n);
    meterLabel.textContent = WORDS[s.n];
    meterTip.textContent = s.tip;
    paintRules(s.met);
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(function() {
      if (!cPassword.value) {
        meterStatus.textContent = "";
        return;
      }
      var left = stillNeeds(s);
      meterStatus.textContent = "Password strength: " + WORDS[s.n] + ". " + (left.length ? s.kept + " of " + RULES.length + " requirements met. Still needs " + asList(left) + "." : "All requirements met. " + s.tip + ".");
    }, 700);
    if (cPassword.getAttribute("aria-invalid") === "true") {
      checkPassword();
    }
    if (cConfirm.value) {
      checkConfirm();
    }
  });
  function checkName() {
    var v = cName.value.trim();
    if (!v) {
      return setHint(cName, "cNameHint", "Enter your name so we know what to call you.");
    }
    if (v.length < 2) {
      return setHint(cName, "cNameHint", "That looks too short — enter your full name.");
    }
    return setHint(cName, "cNameHint", "");
  }
  function checkEmail() {
    var v = cEmail.value.trim();
    if (!v) {
      return setHint(cEmail, "cEmailHint", "Enter an email address — this is how you sign in.");
    }
    if (!EMAIL.test(v)) {
      return setHint(cEmail, "cEmailHint", "That address is missing an @ or a domain — check it and try again.");
    }
    if (window.PTGAccounts && window.PTGAccounts.exists(v)) {
      return setHint(cEmail, "cEmailHint", "There is already an account on that address — sign in instead.");
    }
    return setHint(cEmail, "cEmailHint", "");
  }
  function checkPassword() {
    var v = cPassword.value;
    if (!v) {
      return setHint(cPassword, "cPwHint", "Choose a password.");
    }
    var s = score(v);
    if (s.common) {
      return setHint(cPassword, "cPwHint", "That one is on every guessing list. Try a short phrase instead.");
    }
    var left = stillNeeds(s);
    if (left.length) {
      return setHint(cPassword, "cPwHint", "Your password still needs " + asList(left) + ".");
    }
    return setHint(cPassword, "cPwHint", "");
  }
  function checkConfirm() {
    if (!cConfirm.value) {
      return setHint(cConfirm, "cConfirmHint", "Type the password once more to confirm it.");
    }
    if (cConfirm.value !== cPassword.value) {
      return setHint(cConfirm, "cConfirmHint", "These two don’t match yet.");
    }
    return setHint(cConfirm, "cConfirmHint", "");
  }
  function checkTerms() {
    if (!cTerms.checked) {
      return setHint(cTerms, "cTermsHint", "You need to agree to the terms and the privacy notice before we can create the account.");
    }
    return setHint(cTerms, "cTermsHint", "");
  }
  function checkGuardian() {
    if (!cGuardian) {
      return true;
    }
    if (!cGuardian.checked) {
      return setHint(cGuardian, "cGuardianHint", "Please confirm you are the parent or legal guardian before creating the account.");
    }
    return setHint(cGuardian, "cGuardianHint", "");
  }
  cName.addEventListener("blur", checkName);
  cEmail.addEventListener("blur", checkEmail);
  cPassword.addEventListener("blur", checkPassword);
  cConfirm.addEventListener("input", function() {
    if (cConfirm.getAttribute("aria-invalid") === "true") {
      checkConfirm();
    }
  });
  cConfirm.addEventListener("blur", checkConfirm);
  cTerms.addEventListener("change", checkTerms);
  if (cGuardian) {
    cGuardian.addEventListener("change", checkGuardian);
  }
  [ cName, cEmail ].forEach(function(input) {
    input.addEventListener("input", function() {
      if (input.getAttribute("aria-invalid") === "true") {
        input === cName ? checkName() : checkEmail();
      }
    });
  });
  createForm.addEventListener("submit", function(e) {
    e.preventDefault();
    showAlert("createAlert", "createAlertText", "");
    var results = [ checkName(), checkEmail(), checkPassword(), checkConfirm(), checkTerms(), checkGuardian() ];
    var bad = results.filter(function(r) {
      return !r;
    }).length;
    if (bad) {
      showAlert("createAlert", "createAlertText", bad === 1 ? "There’s one thing to fix below." : "There are " + bad + " things to fix below.");
      var firstBad = $("view-create").querySelector('[aria-invalid="true"]');
      if (firstBad) {
        firstBad.focus();
      }
      return;
    }
    busy($("createSubmit"), "Creating your account…", 1400, function() {
      var who = cEmail.value.trim();
      var name = cName.value.trim();
      if (window.PTGAccounts) {
        window.PTGAccounts.create(who, name, cPassword.value);
      }
      if (window.PTGSession) {
        window.PTGSession.start(who, "parent");
      }
      if (window.PTGApp) {
        window.PTGApp.loadShelf(who, {
          demo: false,
          name: name
        });
      }
      genresBegin(who);
    });
  });
  var forgotForm = $("forgotForm"), fEmail = $("fEmail");
  function checkForgot() {
    var v = fEmail.value.trim();
    if (!v) {
      return setHint(fEmail, "fEmailHint", "Enter the email address on your account.");
    }
    if (!EMAIL.test(v)) {
      return setHint(fEmail, "fEmailHint", "That address is missing an @ or a domain — check it and try again.");
    }
    return setHint(fEmail, "fEmailHint", "");
  }
  fEmail.addEventListener("input", function() {
    if (fEmail.getAttribute("aria-invalid") === "true") {
      checkForgot();
    }
  });
  forgotForm.addEventListener("submit", function(e) {
    e.preventDefault();
    if (!checkForgot()) {
      fEmail.focus();
      return;
    }
    busy($("forgotSubmit"), "Sending…", 1200, function() {
      $("sentEmail").textContent = fEmail.value.trim();
      go("sent");
      startCooldown(30);
    });
  });
  var resend = $("resend"), resendLabel = $("resendLabel"), cooldown = null;
  function startCooldown(seconds) {
    var left = seconds;
    resend.disabled = true;
    resendLabel.innerHTML = 'Send it again in <span class="countdown">' + left + "</span>s";
    window.clearInterval(cooldown);
    cooldown = window.setInterval(function() {
      left--;
      if (left <= 0) {
        window.clearInterval(cooldown);
        resend.disabled = false;
        resendLabel.textContent = "Send it again";
        route.textContent = "You can request another reset link now.";
      } else {
        resendLabel.innerHTML = 'Send it again in <span class="countdown">' + left + "</span>s";
      }
    }, 1e3);
  }
  resend.addEventListener("click", function() {
    if (resend.disabled) {
      return;
    }
    busy(resend, "Sending…", 900, function() {
      route.textContent = "Another reset link has been sent.";
      startCooldown(30);
    });
  });
})();

(function() {
  "use strict";
  var VIEWS = {
    signin: "view-signin",
    create: "view-create",
    forgot: "view-forgot"
  };
  var TITLES = {
    signin: "Sign in",
    create: "Create your account",
    forgot: "Reset your password"
  };
  var timers = [];
  function requested() {
    var q = /[?&]view=([a-z]+)/i.exec(window.location.search || "");
    var name = q ? q[1] : (window.location.hash || "").replace(/^#/, "");
    name = String(name).toLowerCase();
    return VIEWS[name] ? name : null;
  }
  function active() {
    var el = document.querySelector(".view.is-active");
    return el ? el.id : null;
  }
  function force(name) {
    var views = document.querySelectorAll(".view");
    if (!views.length || !document.getElementById(VIEWS[name])) {
      return;
    }
    Array.prototype.forEach.call(views, function(v) {
      v.classList.toggle("is-active", v.id === VIEWS[name]);
    });
    document.title = TITLES[name] + " — Parents Go To";
    var head = document.getElementById("h-" + name);
    if (head) {
      head.focus();
    }
    var route = document.getElementById("route");
    if (route) {
      route.textContent = TITLES[name];
    }
  }
  function switchTo(name) {
    if (active() === VIEWS[name]) {
      return;
    }
    var btn = document.querySelector('[data-go="' + name + '"]');
    if (btn) {
      btn.click();
    }
    if (active() !== VIEWS[name]) {
      force(name);
    }
  }
  function stopCorrecting() {
    while (timers.length) {
      window.clearTimeout(timers.pop());
    }
  }
  function authOpen() {
    var p = document.getElementById("page-auth");
    return !!p && !p.hasAttribute("hidden");
  }
  function apply(isRestore) {
    stopCorrecting();
    var name = requested();
    if (!name) {
      if (!authOpen()) {
        return;
      }
      if (isRestore) {
        switchTo("signin");
      }
      return;
    }
    switchTo(name);
    [ 80, 300, 900 ].forEach(function(ms) {
      timers.push(window.setTimeout(function() {
        if (active() !== VIEWS[name]) {
          switchTo(name);
        }
      }, ms));
    });
  }
  document.addEventListener("click", function(e) {
    if (e.target.closest && e.target.closest("[data-go]")) {
      stopCorrecting();
    }
  }, true);
  window.PTGOpenSetting = function(sectionId, role) {
    if (!sectionId || !window.PTGSettings || !window.PTGSettings.open) {
      return;
    }
    window.setTimeout(function() {
      window.PTGSettings.open(role || "parent", sectionId);
    }, 60);
  };
  window.PTGApplyView = function() {
    apply(false);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      apply(false);
    });
  } else {
    apply(false);
  }
  window.addEventListener("hashchange", function() {
    apply(false);
  });
  window.addEventListener("pageshow", function(e) {
    apply(!!e.persisted);
  });
  document.addEventListener("click", function(e) {
    var btn = e.target.closest ? e.target.closest("[data-oauth]") : null;
    if (!btn) {
      return;
    }
    var provider = btn.getAttribute("data-oauth");
    var form = btn.closest("form");
    var note = form ? form.querySelector(".oauth-note") : null;
    if (note) {
      note.textContent = provider + " sign-in is not connected yet.";
      note.classList.add("is-on");
    }
  });
})();

(function() {
  "use strict";
  document.documentElement.classList.add("has-js");
  var header = document.getElementById("siteHeader");
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("primaryNav");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  function setMenu(open) {
    header.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  toggle.addEventListener("click", function() {
    setMenu(!header.classList.contains("is-open"));
  });
  nav.addEventListener("click", function(e) {
    if (e.target.closest("a")) {
      setMenu(false);
    }
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && header.classList.contains("is-open")) {
      setMenu(false);
      toggle.focus();
    }
  });
  // A tap anywhere outside the open menu closes it, as on a phone's own menus.
  document.addEventListener("click", function(e) {
    if (header.classList.contains("is-open") && !header.contains(e.target)) {
      setMenu(false);
    }
  });
  window.addEventListener("resize", function() {
    if (window.innerWidth >= 1000) {
      setMenu(false);
    }
  });
  var ticking = false, stuck = false;
  function applyScroll() {
    ticking = false;
    var next = window.scrollY > 8;
    if (next === stuck) {
      return;
    }
    stuck = next;
    header.classList.toggle("is-stuck", next);
  }
  function onScroll() {
    if (ticking) {
      return;
    }
    ticking = true;
    window.requestAnimationFrame(applyScroll);
  }
  applyScroll();
  window.addEventListener("scroll", onScroll, {
    passive: true
  });
  var items = document.querySelectorAll(".rise-in");
  if (!("IntersectionObserver" in window) || reduced.matches) {
    Array.prototype.forEach.call(items, function(el) {
      el.classList.add("is-in");
    });
  } else {
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: "0px 0px -12% 0px",
      threshold: .1
    });
    Array.prototype.forEach.call(items, function(el) {
      io.observe(el);
    });
  }
  var links = {};
  Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function(a) {
    links[a.getAttribute("href")] = a;
  });
  var sections = document.querySelectorAll("#about, #services, #contact");
  if ("IntersectionObserver" in window && sections.length) {
    var seen = {};
    var spy = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        seen[entry.target.id] = entry.isIntersecting;
      });
      var current = null;
      Array.prototype.forEach.call(sections, function(s) {
        if (seen[s.id]) {
          current = s.id;
        }
      });
      Object.keys(links).forEach(function(href) {
        links[href].classList.toggle("is-current", href === "#" + current);
      });
    }, {
      rootMargin: "-45% 0px -45% 0px"
    });
    Array.prototype.forEach.call(sections, function(s) {
      spy.observe(s);
    });
  }
  document.getElementById("year").textContent = (new Date).getFullYear();
})();

(function() {
  "use strict";
  var $ = function(id) {
    return document.getElementById(id);
  };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var CATEGORIES = [ {
    id: "picture",
    name: "Picture books",
    tint: "#F7E7E4",
    tone: "#8E3324",
    solid: "#B3402E",
    icon: '<rect x="3" y="4.2" width="14" height="11.6" rx="2"/><circle cx="7.4" cy="8.6" r="1.3"/><path d="m3.8 14 4-3.4 2.9 2.4 3-2.9 2.5 2.3"/>'
  }, {
    id: "early",
    name: "Early readers",
    tint: "#FBEEDA",
    tone: "#8A5A12",
    solid: "#E9A13B",
    icon: '<path d="M10 6.2C8.6 5 6.6 4.6 4 4.8V15c2.6-.2 4.6.2 6 1.4 1.4-1.2 3.4-1.6 6-1.4V4.8c-2.6-.2-4.6.2-6 1.4Z"/><path d="M10 6.2v10.2"/>'
  }, {
    id: "chapter",
    name: "Chapter books",
    tint: "#E1EDF2",
    tone: "#0A6280",
    solid: "#0A6280",
    icon: '<rect x="3" y="3.6" width="4.8" height="12.8" rx="1.2"/><rect x="8.6" y="3.6" width="4" height="12.8" rx="1.2"/><path d="m14.2 4.8 2.6 11.6"/>'
  }, {
    id: "nonfic",
    name: "Non-fiction",
    tint: "#DFF0E5",
    tone: "#245B41",
    solid: "#2C6B4F",
    icon: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14"/><path d="M10 3c1.9 2 2.9 4.4 2.9 7s-1 5-2.9 7c-1.9-2-2.9-4.4-2.9-7s1-5 2.9-7Z"/>'
  }, {
    id: "poetry",
    name: "Poetry & rhyme",
    tint: "#E2E9EF",
    tone: "#123F5B",
    solid: "#123F5B",
    icon: '<path d="M7.6 15.2V4.8l8-1.6v10.4"/><circle cx="5.6" cy="15.2" r="2"/><circle cx="13.6" cy="13.6" r="2"/>'
  }, {
    id: "graphic",
    name: "Graphic novels",
    tint: "#DBF1EF",
    tone: "#05635C",
    solid: "#01A79A",
    icon: '<path d="M17 11.4a2.5 2.5 0 0 1-2.5 2.5H8l-4 2.9v-2.9A2.5 2.5 0 0 1 3 11.4v-6A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.4Z"/>'
  }, {
    id: "bedtime",
    name: "Bedtime stories",
    tint: "#E3E8EC",
    tone: "#06283C",
    solid: "#06283C",
    icon: '<path d="M16.2 12.4A7 7 0 0 1 7.6 3.8a7 7 0 1 0 8.6 8.6Z"/><path d="M13.4 4.6h2.8M14.8 3.2V6"/>'
  }, {
    id: "bilingual",
    name: "Bilingual",
    tint: "#E4EDF1",
    tone: "#245566",
    solid: "#2F6E86",
    icon: '<path d="M2.6 5.2h7.2M6.2 3.4v1.8"/><path d="M8.8 5.2c0 3.8-2.6 6.6-5.6 7.8"/><path d="M4.6 9.2c1.2 1.9 2.9 3.2 4.8 3.8"/><path d="m10.8 16.6 3.4-8.4 3.4 8.4M12.2 13.8h4.4"/>'
  } ];
  var AGE_BANDS = [ "0–3", "3–5", "5–7", "7–9", "9–12", "12+" ];
  var SPINES = [ "#0D3B32", "#123F5B", "#0A6280", "#2F6E86", "#01A79A", "#2C6B4F", "#B3402E", "#E9A13B", "#06283C", "#8A5A12" ];
  var STATUS = {
    toread: {
      label: "To read",
      cls: "tag--toread"
    },
    reading: {
      label: "Being read",
      cls: "tag--reading"
    },
    read: {
      label: "Finished",
      cls: "tag--read"
    }
  };
  function daysAgo(n) {
    var d = new Date;
    d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function demoChildren() {
    return [ {
      id: "c1",
      name: "Harry",
      age: 6,
      band: "5–7",
      colour: "#B3402E",
      likes: [ "picture", "early", "poetry" ]
    }, {
      id: "c2",
      name: "Leo",
      age: 9,
      band: "7–9",
      colour: "#0A6280",
      likes: [ "graphic", "nonfic" ]
    } ];
  }
  function demoBooks() {
    return [ {
      id: "b1",
      title: "The Gruffalo",
      author: "Julia Donaldson",
      category: "picture",
      ages: "3–5",
      status: "reading",
      who: [ "c1" ],
      spine: "#0D3B32",
      cover: "",
      pages: 32,
      page: 18,
      started: daysAgo(3),
      notes: "Harry does all the voices. The mouse is his favourite."
    }, {
      id: "b2",
      title: "Frog and Toad Are Friends",
      author: "Arnold Lobel",
      category: "early",
      ages: "5–7",
      status: "toread",
      who: [ "c1" ],
      spine: "#B3402E",
      cover: "",
      pages: 64,
      added: daysAgo(16),
      notes: ""
    }, {
      id: "b3",
      title: "Charlotte's Web",
      author: "E. B. White",
      category: "chapter",
      ages: "7–9",
      status: "reading",
      who: [ "c2" ],
      spine: "#0A6280",
      cover: "",
      pages: 184,
      page: 96,
      started: daysAgo(9),
      notes: ""
    }, {
      id: "b4",
      title: "The Magic School Bus: Inside the Human Body",
      author: "Joanna Cole",
      category: "nonfic",
      ages: "7–9",
      status: "read",
      who: [ "c2" ],
      spine: "#2C6B4F",
      cover: "",
      pages: 40,
      page: 40,
      rating: 5,
      started: daysAgo(20),
      finished: daysAgo(6),
      notes: ""
    }, {
      id: "b5",
      title: "Goodnight Moon",
      author: "Margaret Wise Brown",
      category: "bedtime",
      ages: "0–3",
      status: "read",
      who: [],
      spine: "#06283C",
      cover: "",
      pages: 32,
      page: 32,
      rating: 4,
      started: daysAgo(48),
      finished: daysAgo(41),
      notes: ""
    }, {
      id: "b6",
      title: "Amulet: The Stonekeeper",
      author: "Kazu Kibuishi",
      category: "graphic",
      ages: "9–12",
      status: "toread",
      who: [ "c2" ],
      spine: "#123F5B",
      cover: "",
      pages: 192,
      added: daysAgo(2),
      notes: ""
    } ];
  }
  function demoWishlist() {
    return [ {
      id: "w1",
      title: "Where the Wild Things Are",
      author: "Maurice Sendak",
      category: "picture",
      ages: "3–5",
      status: "toread",
      who: [ "c1" ],
      spine: "#E9A13B",
      cover: "",
      notes: "Seen at the library — ask about it."
    }, {
      id: "w2",
      title: "Where the Sidewalk Ends",
      author: "Shel Silverstein",
      category: "poetry",
      ages: "5–7",
      status: "toread",
      who: [],
      spine: "#2F6E86",
      cover: "",
      notes: ""
    } ];
  }
  var children = [];
  var books = [];
  var wishlist = [];
  var sessions = [];
  var activity = [];
  var parent = {
    name: "there",
    email: "",
    colour: "#0D3B32"
  };
  var state = {
    tab: "dashboard",
    who: "all",
    q: "",
    cat: "",
    age: "",
    status: "",
    sort: "added",
    rCat: "",
    rAge: "",
    editing: null,
    editingList: null,
    editingChild: null
  };
  var seq = 100;
  function uid(p) {
    seq++;
    return p + seq;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function cat(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) {
        return CATEGORIES[i];
      }
    }
    return null;
  }
  function child(id) {
    for (var i = 0; i < children.length; i++) {
      if (children[i].id === id) {
        return children[i];
      }
    }
    return null;
  }
  function initial(name) {
    return (String(name).trim().charAt(0) || "?").toUpperCase();
  }
  function kidAvatar(k, cls) {
    if (window.PTGAvatar) {
      return window.PTGAvatar.markup(k.id, k.name, k.colour, cls || "avatar");
    }
    return '<span class="' + (cls || "avatar") + '" style="background:' + esc(k.colour) + '">' + esc(initial(k.name)) + "</span>";
  }
  function luminance(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    var f = function(c) {
      c /= 255;
      return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
    };
    return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255);
  }
  function inkOn(hex) {
    return luminance(hex) > .42 ? "#13221E" : "#FFFFFF";
  }
  function svg(paths, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 20 20" fill="none" ' + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' + 'stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  var STAR = "M10 2.6l2.3 4.9 5.2.7-3.8 3.7.9 5.3-4.6-2.6-4.6 2.6.9-5.3L2.5 8.2l5.2-.7Z";
  function stamp() {
    var d = new Date;
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function day(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function thisMonth(s) {
    var d = day(s), now = new Date;
    return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  function niceDate(s) {
    var d = day(s);
    return d ? d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short"
    }) : "";
  }
  function since(at) {
    if (!at) {
      return "";
    }
    var mins = Math.round((Date.now() - at) / 6e4);
    if (mins < 1) {
      return "Just now";
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
      return "Yesterday";
    }
    if (days < 30) {
      return days + " days ago";
    }
    return "A while ago";
  }
  function pct(b) {
    var total = Number(b.pages) || 0;
    if (total <= 0) {
      return null;
    }
    var at = clampPage(Number(b.page) || 0, total);
    return Math.round(at / total * 100);
  }
  function clampPage(n, total) {
    if (!(n > 0)) {
      return 0;
    }
    return n > total ? total : Math.floor(n);
  }
  var DUST_DAYS = 7;
  function lastTouched(b) {
    if (!b) {
      return null;
    }
    var best = null, i, d;
    for (i = 0; i < sessions.length; i++) {
      if (sessions[i].bookId !== b.id) {
        continue;
      }
      d = day(sessions[i].date);
      if (d && (!best || d > best)) {
        best = d;
      }
    }
    var alts = [ b.finished, b.started, b.added ];
    for (i = 0; i < alts.length; i++) {
      d = day(alts[i]);
      if (d && (!best || d > best)) {
        best = d;
      }
    }
    return best;
  }
  function daysShut(b) {
    var d = lastTouched(b);
    if (!d) {
      return null;
    }
    var n = Math.floor((Date.now() - d.getTime()) / 864e5);
    return n < 0 ? 0 : n;
  }
  function dustDays(b) {
    if (!b || b.status === "read") {
      return 0;
    }
    var n = daysShut(b);
    if (n === null || n < DUST_DAYS) {
      return 0;
    }
    return n;
  }
  function isStalled(b) {
    return dustDays(b) > 0;
  }
  function dustWord(n) {
    if (n >= 60) {
      return "Untouched for months";
    }
    if (n >= 28) {
      return "Untouched for " + Math.round(n / 7) + " weeks";
    }
    if (n >= 14) {
      return "Untouched for a fortnight";
    }
    return "Untouched for " + n + " days";
  }
  function dustFlagHtml(b, onCover) {
    var n = dustDays(b);
    if (!n) {
      return "";
    }
    var web = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + '<path d="M2 2 18 18M2 2v16M2 2h16"/>' + '<path d="M2 7.5A10.5 10.5 0 0 1 12.5 18"/>' + '<path d="M2 12.5A5.5 5.5 0 0 1 7.5 18"/>' + "</svg>";
    return '<span class="dust-flag' + (onCover ? " dust-flag--cover" : "") + '" title="' + esc(dustWord(n)) + '">' + web + dustWord(n) + "</span>";
  }
  function dustAttrs(b) {
    var n = dustDays(b);
    if (!n) {
      return "";
    }
    return ' data-dust="' + n + '" data-dust-seed="' + esc(b.id) + '"';
  }
  function progClass(b) {
    if (b.status === "read") {
      return "prog--done";
    }
    if (isStalled(b)) {
      return "prog--stalled";
    }
    if (b.status === "reading") {
      return "prog--live";
    }
    return "prog--idle";
  }
  function progHtml(b, thin) {
    var p = pct(b);
    if (p === null) {
      return "";
    }
    var total = Number(b.pages) || 0;
    var at = clampPage(Number(b.page) || 0, total);
    var stalled = isStalled(b);
    var label = b.status === "read" ? "Finished &middot; " + total + (total === 1 ? " page" : " pages") : at > 0 ? "Page " + at + " of " + total : "Not started &middot; " + total + (total === 1 ? " page" : " pages");
    var note = "";
    if (stalled) {
      note = '<p class="prog-note is-stalled">' + esc(dustWord(dustDays(b))) + " &middot; pick it back up?</p>";
    } else if (b.status === "reading" && total > 0 && at > 0 && p < 100) {
      note = '<p class="prog-note">' + (total - at) + " pages to go</p>";
    }
    return '<div class="prog-block">' + '<div class="prog-top">' + '<span class="prog-label">' + label + "</span>" + '<span class="prog-val' + (p >= 100 ? " is-done" : "") + '">' + p + "%</span>" + "</div>" + '<span class="prog ' + progClass(b) + (thin ? " prog--thin" : "") + (total >= 60 ? " prog--ticks" : "") + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="' + esc(b.title) + ' reading progress"><i style="width:' + p + '%"></i></span>' + note + "</div>";
  }
  function coverProgHtml(b) {
    var p = pct(b);
    if (p === null || b.status === "toread") {
      return "";
    }
    return '<span class="cprog" aria-hidden="true"><i style="width:' + p + '%"></i></span>';
  }
  function starsHtml(n) {
    var r = Math.round(Number(n) || 0);
    if (r < 1) {
      return "";
    }
    var out = "";
    for (var i = 1; i <= 5; i++) {
      out += '<svg class="' + (i <= r ? "on" : "off") + '" width="14" height="14" viewBox="0 0 20 20" ' + 'fill="' + (i <= r ? "currentColor" : "none") + '" stroke="currentColor" ' + 'stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="' + STAR + '"/></svg>';
    }
    return '<span class="stars" role="img" aria-label="Rated ' + r + ' out of 5">' + out + "</span>";
  }
  var toast = $("toast"), toastText = $("toastText"), toastTimer = null, undoBtn = null;
  function say(message, undo) {
    toastText.textContent = message;
    if (undoBtn) {
      undoBtn.remove();
      undoBtn = null;
    }
    if (undo) {
      undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "undo";
      undoBtn.textContent = "Undo";
      undoBtn.addEventListener("click", function() {
        undo();
        hideToast();
      });
      toast.appendChild(undoBtn);
    }
    toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, undo ? 7e3 : 3600);
  }
  function hideToast() {
    window.clearTimeout(toastTimer);
    toast.classList.remove("is-on");
  }
  function matchesWho(b) {
    if (state.who === "all") {
      return true;
    }
    return !b.who || !b.who.length || b.who.indexOf(state.who) !== -1;
  }
  function matchesQuery(b) {
    if (!state.q) {
      return true;
    }
    var hay = (b.title + " " + (b.author || "") + " " + (b.notes || "")).toLowerCase();
    var c = cat(b.category);
    if (c) {
      hay += " " + c.name.toLowerCase();
    }
    return hay.indexOf(state.q) !== -1;
  }
  function libraryList() {
    var out = books.filter(function(b) {
      if (!matchesWho(b) || !matchesQuery(b)) {
        return false;
      }
      if (state.cat && b.category !== state.cat) {
        return false;
      }
      if (state.age && b.ages !== state.age) {
        return false;
      }
      if (state.status && b.status !== state.status) {
        return false;
      }
      return true;
    });
    var by = state.sort;
    out.sort(function(a, b) {
      if (by === "title") {
        return a.title.localeCompare(b.title);
      }
      if (by === "author") {
        return (a.author || "").localeCompare(b.author || "");
      }
      if (by === "age") {
        return AGE_BANDS.indexOf(a.ages) - AGE_BANDS.indexOf(b.ages);
      }
      return 0;
    });
    return out;
  }
  function wishList() {
    return wishlist.filter(function(b) {
      return matchesWho(b) && matchesQuery(b);
    });
  }
  function coverHtml(b, kicker) {
    var slot = !!b.slot;
    var ink = slot ? "#4B5B55" : inkOn(b.spine || "#0A6280");
    var inner = '<span class="kicker">' + esc(kicker || (cat(b.category) ? cat(b.category).name : "Book")) + "</span>" + '<span class="ct">' + esc(b.title) + "</span>" + '<span class="ca">' + esc(b.author || "Author unknown") + "</span>";
    var img = b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" onerror="this.remove()">' : "";
    return '<span class="cover' + (slot ? " cover--slot" : "") + '"' + dustAttrs(b) + ' style="--spine:' + esc(b.spine || "#0A6280") + ";color:" + ink + '">' + img + inner + dustFlagHtml(b, true) + coverProgHtml(b) + "</span>";
  }
  function tagsHtml(b) {
    var c = cat(b.category);
    var s = STATUS[b.status] || STATUS.toread;
    var out = "";
    if (c) {
      out += '<span class="tag tag--cat" style="--tint:' + c.tint + ";--tone:" + c.tone + '">' + esc(c.name) + "</span>";
    }
    if (b.ages) {
      out += '<span class="tag">Ages ' + esc(b.ages) + "</span>";
    }
    out += '<span class="tag ' + s.cls + '">' + s.label + "</span>";
    if (b.who && b.who.length) {
      var names = b.who.map(function(id) {
        var k = child(id);
        return k ? k.name : null;
      }).filter(Boolean);
      if (names.length) {
        out += '<span class="tag">For ' + esc(names.join(" & ")) + "</span>";
      }
    }
    return out;
  }
  function bookCard(b, list) {
    var acts = list === "wishlist" ? '<button class="btn btn--ghost btn--sm" type="button" data-move="' + esc(b.id) + '">Move to library</button>' + '<button class="icon-btn" type="button" data-edit-wish="' + esc(b.id) + '" aria-label="Edit ' + esc(b.title) + '">' + svg('<path d="M13.4 3.6a1.9 1.9 0 0 1 2.7 2.7L7.4 15 3.6 16l1-3.8Z"/>', 17) + "</button>" : '<button class="btn btn--ghost btn--sm" type="button" data-cycle="' + esc(b.id) + '">' + (b.status === "read" ? "Read again" : b.status === "reading" ? "Mark finished" : "Start reading") + "</button>" + '<button class="icon-btn" type="button" data-edit-book="' + esc(b.id) + '" aria-label="Edit ' + esc(b.title) + '">' + svg('<path d="M13.4 3.6a1.9 1.9 0 0 1 2.7 2.7L7.4 15 3.6 16l1-3.8Z"/>', 17) + "</button>";
    var extra = "";
    if (list !== "wishlist") {
      extra = progHtml(b, true);
      if (b.status === "read") {
        var stars = starsHtml(b.rating);
        var when = b.finished ? niceDate(b.finished) : "";
        if (stars || when) {
          extra += '<p class="book-done">' + stars + (when ? "<span>Finished " + esc(when) + "</span>" : "") + "</p>";
        }
      }
    }
    return '<article class="book' + (b.slot ? " book--slot" : "") + '">' + coverHtml(b) + '<div class="book-body">' + '<h3 class="book-title">' + esc(b.title) + "</h3>" + '<p class="book-author">' + esc(b.author || "Author unknown") + "</p>" + extra + '<div class="book-meta">' + tagsHtml(b) + "</div>" + '<div class="book-acts">' + acts + '<button class="icon-btn" type="button" data-del="' + esc(b.id) + '" data-list="' + list + '" aria-label="Remove ' + esc(b.title) + '">' + svg('<path d="M4 6h12M8 6V4.4A1.4 1.4 0 0 1 9.4 3h1.2A1.4 1.4 0 0 1 12 4.4V6"/><path d="M5.6 6 6.3 16a1.4 1.4 0 0 0 1.4 1.3h4.6A1.4 1.4 0 0 0 13.7 16L14.4 6"/>', 17) + "</button>" + "</div>" + "</div>" + "</article>";
  }
  function addTile(kind) {
    var copy = kind === "wishlist" ? {
      lbl: "Add to wishlist",
      hint: "Something to borrow or ask for"
    } : {
      lbl: "Add a book",
      hint: "Type it in, or edit the list in the code"
    };
    return '<button class="add-book" type="button" data-add="' + kind + '">' + '<span class="plus" aria-hidden="true">' + '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' + 'stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>' + "</span>" + '<span class="lbl">' + copy.lbl + "</span>" + '<span class="hint">' + copy.hint + "</span>" + "</button>";
  }
  function renderCounts() {
    $("countProfiles").textContent = String(children.length + 1);
    $("countLibrary").textContent = String(books.length);
    $("countResources").textContent = String(approvedResources().length);
    $("countWishlist").textContent = String(wishlist.length);
  }
  function renderGreeting() {
    var h = (new Date).getHours();
    var part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    $("greetLine").textContent = part + ", " + parent.name;
    $("greetDate").textContent = (new Date).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    $("greetAvatar").textContent = initial(parent.name);
    $("greetAvatar").style.background = parent.colour;
    $("whoAvatar").textContent = initial(parent.name);
    $("whoAvatar").style.background = parent.colour;
    $("whoName").textContent = parent.name;
  }
  function renderWhoChips() {
    var html = '<button type="button" data-who="all" aria-pressed="' + (state.who === "all") + '"><span class="dot" style="background:' + parent.colour + '"></span>Everyone</button>';
    children.forEach(function(k) {
      html += '<button type="button" data-who="' + esc(k.id) + '" aria-pressed="' + (state.who === k.id) + '"><span class="dot" style="background:' + k.colour + '"></span>' + esc(k.name) + "</button>";
    });
    $("pgWhoMenu").innerHTML = html;
    $("sideWhoList").innerHTML = '<button type="button" class="side-kid" data-who="all" aria-pressed="' + (state.who === "all") + '"><span class="avatar avatar--sm" style="background:' + parent.colour + '">' + initial(parent.name) + "</span>Everyone</button>" + children.map(function(k) {
      return '<button type="button" class="side-kid" data-who="' + esc(k.id) + '" aria-pressed="' + (state.who === k.id) + '">' + kidAvatar(k, "avatar avatar--sm") + esc(k.name) + "</button>";
    }).join("");
    var picked = child(state.who);
    $("pgWhoLabel").textContent = picked ? picked.name : "Everyone";
    var menu = '<button type="button" data-who="all" aria-current="' + (state.who === "all") + '">' + '<span class="avatar avatar--sm" style="background:' + parent.colour + '">' + initial(parent.name) + "</span>Everyone" + (state.who === "all" ? '<span class="tick">' + svg('<path d="M4 10.5 8 14.5 16 6"/>', 15) + "</span>" : "") + "</button>";
    children.forEach(function(k) {
      menu += '<button type="button" data-who="' + esc(k.id) + '" aria-current="' + (state.who === k.id) + '">' + kidAvatar(k, "avatar avatar--sm") + esc(k.name) + (state.who === k.id ? '<span class="tick">' + svg('<path d="M4 10.5 8 14.5 16 6"/>', 15) + "</span>" : "") + "</button>";
    });
    $("whoMenuList").innerHTML = menu;
  }
  function renderDashboard() {
    var mine = books.filter(matchesWho);
    var now = mine.filter(function(b) {
      return b.status === "reading";
    });
    var toread = mine.filter(function(b) {
      return b.status === "toread";
    });
    var doneAll = mine.filter(function(b) {
      return b.status === "read";
    });
    var doneNow = doneAll.filter(function(b) {
      return thisMonth(b.finished);
    });
    $("statReading").textContent = String(now.length);
    $("statFinished").textContent = String(doneNow.length);
    var tracked = now.filter(function(b) {
      return pct(b) !== null;
    });
    var avg = tracked.length ? Math.round(tracked.reduce(function(t, b) {
      return t + pct(b);
    }, 0) / tracked.length) : null;
    $("statReadingSub").innerHTML = !now.length ? "Nothing open right now" : avg === null ? "Add a page count to track progress" : "<b>" + avg + "%</b> through on average";
    $("statFinishedSub").innerHTML = doneAll.length ? "<b>" + doneAll.length + "</b> finished all time" : "Finish a book and it lands here";
    renderProgress(avg, tracked.length);
    var shelf = $("shelfNow");
    shelf.innerHTML = now.map(function(b) {
      var p = pct(b);
      var line = p === null ? esc(b.author || "Author unknown") : "Page " + clampPage(Number(b.page) || 0, Number(b.pages)) + " of " + Number(b.pages);
      return '<button class="standing" type="button" data-edit-book="' + esc(b.id) + '">' + coverHtml(b) + '<span class="t">' + esc(b.title) + "</span>" + '<span class="a">' + line + "</span>" + "</button>";
    }).join("");
    shelf.parentNode.hidden = !now.length;
    $("emptyNow").classList.toggle("is-on", !now.length);
    renderReaders();
    renderSuggestions();
    renderBoard();
    $("catTiles").innerHTML = CATEGORIES.map(function(c) {
      var n = mine.filter(function(b) {
        return b.category === c.id;
      }).length;
      return '<button class="cat" type="button" data-cat="' + c.id + '">' + '<span class="ico" style="background:' + c.solid + '">' + svg(c.icon, 20) + "</span>" + '<span><span class="nm">' + esc(c.name) + "</span>" + '<span class="ct">' + n + (n === 1 ? " book" : " books") + "</span></span>" + "</button>";
    }).join("");
  }
  var pg = {
    sort: "added",
    week: 0
  };
  var PG_DAYS = [ "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" ];
  function pgKey(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function pgMonday(weeksBack) {
    var d = new Date;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7 - 7 * weeksBack);
    return d;
  }
  function pgWeekMinutes(weeksBack, childId) {
    var start = pgMonday(weeksBack), out = [], byDay = {};
    sessions.forEach(function(x) {
      if (childId && x.childId !== childId) {
        return;
      }
      byDay[x.date] = (byDay[x.date] || 0) + (Number(x.minutes) || 0);
    });
    for (var i = 0; i < 7; i++) {
      var d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({
        date: d,
        mins: byDay[pgKey(d)] || 0
      });
    }
    return out;
  }
  function pgNiceMax(n) {
    if (n <= 10) {
      return 10;
    }
    var step = n <= 60 ? 10 : n <= 150 ? 30 : 60;
    return Math.ceil(n / step) * step;
  }
  function sortedReaders() {
    var list = children.slice();
    var mins = {}, done = {};
    list.forEach(function(k) {
      mins[k.id] = pgWeekMinutes(0, k.id).reduce(function(t, d) {
        return t + d.mins;
      }, 0);
      done[k.id] = books.filter(function(b) {
        return b.who && b.who.indexOf(k.id) !== -1 && b.status === "read" && thisMonth(b.finished);
      }).length;
    });
    if (pg.sort === "name") {
      list.sort(function(a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
    } else if (pg.sort === "minutes") {
      list.sort(function(a, b) {
        return mins[b.id] - mins[a.id];
      });
    } else if (pg.sort === "finished") {
      list.sort(function(a, b) {
        return done[b.id] - done[a.id];
      });
    }
    return list;
  }
  function renderProgress(avg, trackedCount) {
    var who = state.who === "all" ? null : state.who;
    var now = pgWeekMinutes(pg.week, who);
    var was = pgWeekMinutes(pg.week + 1, who);
    var today = pgKey(new Date);
    var max = pgNiceMax(Math.max.apply(null, now.concat(was).map(function(d) {
      return d.mins;
    })));
    var h = function(m) {
      return (m / max * 100).toFixed(2) + "%";
    };
    var nowName = pg.week ? "Last week" : "This week";
    var wasName = pg.week ? "Week before" : "Last week";
    $("pgKeyNow").textContent = nowName;
    $("pgKeyWas").textContent = wasName;
    var axis = '<div class="pg-axis" aria-hidden="true">' + [ max, max / 2, 0 ].map(function(v) {
      return '<span style="bottom:' + h(v) + '">' + v + "</span>";
    }).join("") + "</div>";
    var cols = now.map(function(d, i) {
      var key = pgKey(d.date);
      var future = !pg.week && key > today;
      var when = d.date.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short"
      });
      var label = when + ": " + d.mins + " minutes. " + wasName + ": " + was[i].mins + " minutes.";
      return '<div class="pg-day' + (future ? " is-future" : "") + (key === today ? " is-today" : "") + '" data-pg-day="' + i + '" tabindex="0" aria-label="' + esc(label) + '">' + '<div class="pg-pair">' + '<span class="pg-b pg-b--was" style="height:' + h(was[i].mins) + '"></span>' + '<span class="pg-b pg-b--now" style="height:' + h(d.mins) + '"></span>' + "</div>" + '<span class="pg-d">' + PG_DAYS[i] + "</span>" + "</div>";
    }).join("");
    $("pgPlot").innerHTML = axis + '<div class="pg-cols">' + '<div class="pg-lines" aria-hidden="true"><i style="bottom:100%"></i><i style="bottom:50%"></i><i style="bottom:0"></i></div>' + cols + "</div>";
    $("pgPlot").setAttribute("data-now", JSON.stringify(now.map(function(d) {
      return d.mins;
    })));
    $("pgPlot").setAttribute("data-was", JSON.stringify(was.map(function(d) {
      return d.mins;
    })));
    $("pgTable").innerHTML = "<caption>Minutes read per day</caption><tr><th>Day</th><th>" + esc(nowName) + "</th><th>" + esc(wasName) + "</th></tr>" + now.map(function(d, i) {
      return "<tr><td>" + PG_DAYS[i] + "</td><td>" + d.mins + "</td><td>" + was[i].mins + "</td></tr>";
    }).join("");
    $("pgTip").hidden = true;
    var TICKS = 41, lit = avg === null ? -1 : Math.round(avg / 100 * (TICKS - 1)), dial = "";
    for (var t = 0; t < TICKS; t++) {
      var a = Math.PI - t / (TICKS - 1) * Math.PI;
      var c = Math.cos(a), sn = Math.sin(a);
      var inner = t % 5 === 0 ? 66 : 71;
      dial += '<line x1="' + (100 + c * inner).toFixed(2) + '" y1="' + (100 - sn * inner).toFixed(2) + '" x2="' + (100 + c * 92).toFixed(2) + '" y2="' + (100 - sn * 92).toFixed(2) + '"' + (avg && t <= lit ? ' class="on" style="--t:' + t + '"' : "") + "/>";
    }
    $("pgDial").innerHTML = '<svg viewBox="0 0 200 104">' + dial + "</svg>";
    $("pgPct").textContent = avg === null ? "—" : avg + "%";
    $("pgPctLbl").textContent = avg === null ? "Add page counts to see progress" : "Through " + (trackedCount === 1 ? "the book" : "the books") + " being read";
  }
  var PG_MENUS = [ [ "pgSortBtn", "pgSortMenu" ], [ "pgFilterBtn", "pgFilterMenu" ], [ "pgWhoBtn", "pgWhoMenu" ] ];
  function pgClose(except) {
    PG_MENUS.forEach(function(pair) {
      if (pair[0] === except) {
        return;
      }
      $(pair[1]).hidden = true;
      $(pair[0]).setAttribute("aria-expanded", "false");
    });
  }
  (function() {
    PG_MENUS.forEach(function(pair) {
      $(pair[0]).addEventListener("click", function() {
        var open = $(pair[1]).hidden;
        pgClose(pair[0]);
        $(pair[1]).hidden = !open;
        $(pair[0]).setAttribute("aria-expanded", String(open));
        if (open) {
          var first = $(pair[1]).querySelector('[aria-pressed="true"]') || $(pair[1]).querySelector("button");
          if (first) {
            first.focus();
          }
        }
      });
    });
    document.addEventListener("click", function(e) {
      if (!e.target.closest || !e.target.closest(".pg-drop")) {
        pgClose();
      }
    });
    document.addEventListener("keydown", function(e) {
      if (e.key !== "Escape") {
        return;
      }
      var open = document.querySelector(".pg-drop .pg-menu:not([hidden])");
      if (open) {
        pgClose();
        open.parentNode.querySelector(".pg-tool").focus();
      }
    });
    function choose(menu, attr, apply) {
      $(menu).addEventListener("click", function(e) {
        var b = e.target.closest("[" + attr + "]");
        if (!b) {
          return;
        }
        Array.prototype.forEach.call($(menu).querySelectorAll("[" + attr + "]"), function(x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        apply(b.getAttribute(attr), b.textContent);
        pgClose();
        $(menu).parentNode.querySelector(".pg-tool").focus();
        renderDashboard();
      });
    }
    choose("pgSortMenu", "data-pg-sort", function(v, text) {
      pg.sort = v;
      say("Children sorted by " + text.toLowerCase());
    });
    choose("pgFilterMenu", "data-pg-week", function(v) {
      pg.week = Number(v) || 0;
      say("Chart showing " + (pg.week ? "last week" : "this week"));
    });
    $("pgSearch").addEventListener("input", function() {
      $("appSearch").value = $("pgSearch").value;
      $("appSearch").dispatchEvent(new Event("input", {
        bubbles: true
      }));
    });
    $("pgLog").addEventListener("click", function() {
      $("kidsOpenDash").click();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-pg-status]"), function(b) {
      b.addEventListener("click", function() {
        state.status = b.getAttribute("data-pg-status");
        $("fStatus").value = state.status;
        renderLibrary();
        goTab("library", {
          focus: true
        });
      });
    });
    function tip(day) {
      var t = $("pgTip");
      if (!day) {
        t.hidden = true;
        return;
      }
      var i = +day.getAttribute("data-pg-day");
      var now = JSON.parse($("pgPlot").getAttribute("data-now") || "[]");
      var was = JSON.parse($("pgPlot").getAttribute("data-was") || "[]");
      t.innerHTML = "<b>" + PG_DAYS[i] + "</b>" + '<span><i class="pg-key pg-key--now"></i>' + esc($("pgKeyNow").textContent) + "<em>" + (now[i] || 0) + " min</em></span>" + '<span><i class="pg-key pg-key--was"></i>' + esc($("pgKeyWas").textContent) + "<em>" + (was[i] || 0) + " min</em></span>";
      t.hidden = false;
      var plot = $("pgPlot"), cell = t.parentNode.getBoundingClientRect(), r = day.getBoundingClientRect();
      var x = r.left - cell.left + r.width / 2;
      t.style.left = Math.max(84, Math.min(cell.width - 84, x)) + "px";
      t.style.top = plot.offsetTop + "px";
    }
    $("pgPlot").addEventListener("mouseover", function(e) {
      tip(e.target.closest(".pg-day"));
    });
    $("pgPlot").addEventListener("mouseleave", function() {
      tip(null);
    });
    $("pgPlot").addEventListener("focusin", function(e) {
      tip(e.target.closest(".pg-day"));
    });
    $("pgPlot").addEventListener("focusout", function() {
      tip(null);
    });
  })();
  function renderBoard() {
    var row = $("boardRow");
    if (!row) {
      return;
    }
    var items = [];
    if (window.PTGAdmin) {
      window.PTGAdmin.publishedPosts().forEach(function(p) {
        items.push({
          kind: "Post",
          title: p.title,
          body: p.body,
          category: p.category,
          ages: p.ages,
          link: p.link,
          at: p.at
        });
      });
      window.PTGAdmin.submissions().forEach(function(s) {
        if (s.state === "approved") {
          items.push({
            kind: "From a parent",
            title: s.title,
            body: s.body,
            category: s.category,
            ages: s.ages,
            link: s.link,
            at: s.decidedAt || s.at
          });
        }
      });
    }
    items.sort(function(a, b) {
      return (b.at || 0) - (a.at || 0);
    });
    items = items.slice(0, 6);
    row.hidden = !items.length;
    if (!items.length) {
      return;
    }
    $("boardCards").innerHTML = items.map(function(it) {
      var c = cat(it.category);
      var safeLink = /^https?:\/\/[^\s]+$/i.test(String(it.link || "")) ? it.link : "";
      return '<article class="board-card">' + '<span class="kind">' + esc(it.kind) + "</span>" + "<h3>" + esc(it.title) + "</h3>" + '<p class="body">' + esc(it.body) + "</p>" + '<p class="meta">' + (c ? '<span class="tag tag--cat" style="--tint:' + c.tint + ";--tone:" + c.tone + '">' + esc(c.name) + "</span>" : "") + (it.ages ? '<span class="tag">Ages ' + esc(it.ages) + "</span>" : "") + "</p>" + (safeLink ? '<a class="board-link" href="' + esc(safeLink) + '" rel="noopener nofollow" target="_blank">Open the resource</a>' : "") + "</article>";
    }).join("");
  }
  function renderReaders() {
    var row = $("readersRow");
    row.hidden = !children.length;
    if (!children.length) {
      return;
    }
    $("readerCards").innerHTML = sortedReaders().map(function(k) {
      var theirs = books.filter(function(b) {
        return b.who && b.who.indexOf(k.id) !== -1;
      });
      var open = theirs.filter(function(b) {
        return b.status === "reading";
      })[0];
      var done = theirs.filter(function(b) {
        return b.status === "read" && thisMonth(b.finished);
      }).length;
      var nowLine = open ? '<span class="now">' + esc(open.title) + "</span>" + progHtml(open, true) : '<span class="now"><em>Nothing open — pick something from the library</em></span>';
      return '<button class="reader" type="button" data-who="' + esc(k.id) + '" aria-pressed="' + (state.who === k.id) + '">' + '<span class="top">' + kidAvatar(k, "avatar avatar--sm") + '<span class="who">' + '<span class="nm">' + esc(k.name) + "</span>" + '<span class="sub">' + done + " finished this month · " + theirs.length + (theirs.length === 1 ? " book" : " books") + "</span>" + "</span>" + "</span>" + nowLine + "</button>";
    }).join("");
  }
  function scoreFor(b, k) {
    if (b.who && b.who.length && b.who.indexOf(k.id) === -1) {
      return null;
    }
    var s = 0, why = [];
    if (b.who && b.who.indexOf(k.id) !== -1) {
      s += 3;
      why.push("set aside for " + k.name);
    }
    if ((k.likes || []).indexOf(b.category) !== -1) {
      s += 2;
      var c = cat(b.category);
      why.push(k.name + " likes " + (c ? c.name.toLowerCase() : "these"));
    }
    if (b.ages && b.ages === k.band) {
      s += 2;
      why.push("right for ages " + b.ages);
    }
    if (!b.who || !b.who.length) {
      s += 1;
    }
    return {
      score: s,
      why: why
    };
  }
  function suggestions() {
    var target = children.filter(function(k) {
      return k.id === state.who;
    })[0] || null;
    var pool = target ? [ target ] : children;
    var out = [];
    function consider(b, list) {
      var best = 0, why = [];
      pool.forEach(function(k) {
        var r = scoreFor(b, k);
        if (r && r.score > best) {
          best = r.score;
          why = r.why;
        }
      });
      if (best > 0) {
        out.push({
          book: b,
          list: list,
          score: best,
          why: why
        });
      }
    }
    books.forEach(function(b) {
      if (b.status === "toread") {
        consider(b, "books");
      }
    });
    if (out.length < 3) {
      wishlist.forEach(function(b) {
        consider(b, "wishlist");
      });
    }
    out.sort(function(a, b) {
      return b.score - a.score;
    });
    return out.slice(0, 4);
  }
  function renderSuggestions() {
    var row = $("suggestRow");
    if (!row) {
      return;
    }
    var picks = children.length ? suggestions() : [];
    row.hidden = !picks.length;
    if (!picks.length) {
      return;
    }
    var target = children.filter(function(k) {
      return k.id === state.who;
    })[0];
    $("suggestTitle").textContent = target ? "Up next for " + target.name : "Up next";
    $("suggestNote").textContent = target ? "Matched to their favourites and reading level" : "Matched to what each child likes to read";
    $("suggestCards").innerHTML = picks.map(function(p) {
      var b = p.book;
      var wish = p.list === "wishlist";
      var why = wish ? "On the wishlist" + (p.why.length ? " · " + p.why[0] : "") : p.why[0] || "Not started yet";
      why = why.charAt(0).toUpperCase() + why.slice(1);
      var act = wish ? '<button class="btn btn--ghost btn--sm" type="button" data-move="' + esc(b.id) + '">Move to library</button>' : '<button class="btn btn--ghost btn--sm" type="button" data-cycle="' + esc(b.id) + '">Start reading</button>';
      return '<article class="suggest">' + '<span class="cover cover--mini' + (b.slot ? " cover--slot" : "") + '" style="--spine:' + esc(b.spine || "#0A6280") + '" aria-hidden="true">' + (b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>" + '<div class="grow">' + '<span class="t">' + esc(b.title) + "</span>" + '<span class="a">' + esc(b.author || "Author unknown") + "</span>" + '<span class="why">' + esc(why) + "</span>" + '<div class="acts">' + act + "</div>" + "</div>" + "</article>";
    }).join("");
  }
  function renderProfiles() {
    var html = "";
    html += '<article class="profile profile--parent">' + '<div class="profile-top">' + '<span class="avatar avatar--lg" style="background:' + parent.colour + '">' + initial(parent.name) + "</span>" + '<div><div class="nm">' + esc(parent.name) + "</div>" + '<span class="role">Parent &middot; account holder</span></div>' + "</div>" + "<dl>" + "<dt>Signs in with</dt><dd>" + esc(parent.email || "this device") + "</dd>" + "<dt>Children</dt><dd>" + children.length + "</dd>" + "<dt>Books added</dt><dd>" + books.length + "</dd>" + "</dl>" + '<div class="acts">' + '<button class="btn btn--ghost btn--sm" type="button" data-app-go="settings" data-set-open="set-account">Account settings</button>' + "</div>" + "</article>";
    children.forEach(function(k) {
      var owned = books.filter(function(b) {
        return b.who && b.who.indexOf(k.id) !== -1;
      });
      var done = owned.filter(function(b) {
        return b.status === "read";
      }).length;
      var likes = (k.likes || []).map(function(id) {
        var c = cat(id);
        return c ? '<span class="tag tag--cat" style="--tint:' + c.tint + ";--tone:" + c.tone + '">' + esc(c.name) + "</span>" : "";
      }).join("");
      var weekMins = pgWeekMinutes(0, k.id).reduce(function(t, d) {
        return t + d.mins;
      }, 0);
      var run = streakFor(k.id);
      var current = owned.filter(function(b) {
        return b.status === "reading";
      })[0];
      html += '<article class="profile profile--kid" style="--kid:' + esc(k.colour) + '">' + '<div class="profile-banner" aria-hidden="true"></div>' + '<div class="profile-top">' + kidAvatar(k, "avatar avatar--lg") + '<div><div class="nm">' + esc(k.name) + "</div>" + '<span class="role">Child' + (k.age ? " &middot; " + k.age + " years old" : "") + "</span></div>" + "</div>" + "<dl>" + "<dt>Reading level</dt><dd>Ages " + esc(k.band) + "</dd>" + "<dt>Books</dt><dd>" + owned.length + "</dd>" + "<dt>Finished</dt><dd>" + done + "</dd>" + "</dl>" + '<div class="profile-stats">' + '<span><b>' + weekMins + "</b> min this week</span>" + '<span><b>' + run + "</b> " + (run === 1 ? "day" : "days") + " in a row</span>" + "</div>" + (current ? '<p class="profile-now"><span>Reading now</span>' + esc(current.title) + "</p>" : "") + (likes ? '<div class="taglist">' + likes + "</div>" : "") + '<div class="acts">' + '<button class="btn btn--primary btn--sm" type="button" data-open-kid="' + esc(k.id) + '">Open ' + esc(k.name) + "&rsquo;s " + (suggestedMode() === "night" ? "bedtime mode" : "reading space") + "</button>" + '<button class="btn btn--ghost btn--sm" type="button" data-edit-child="' + esc(k.id) + '">Edit</button>' + '<button class="btn btn--quiet btn--sm" type="button" data-see="' + esc(k.id) + '">See their books</button>' + '<button class="btn btn--quiet btn--sm look-btn" type="button" data-look="' + esc(k.id) + '">Avatar &amp; background</button>' + '<button class="btn btn--quiet btn--sm chat-btn" type="button" data-chat="' + esc(k.id) + '">Messages' + kidChatBadge(k.id) + "</button>" + "</div>" + "</article>";
    });
    html += '<button class="add-card" type="button" data-add="child">' + '<span class="plus" aria-hidden="true">' + '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' + 'stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>' + "</span>" + '<span class="lbl">Add a child</span>' + '<span class="hint">Give them a shelf of their own</span>' + "</button>";
    $("profileCards").innerHTML = html;
  }
  function kidChatBadge(id) {
    var n = window.PTGKidChat ? window.PTGKidChat.unread(id) : 0;
    return n ? ' <span class="chat-n">' + (n > 9 ? "9+" : n) + "</span>" : "";
  }
  var libView = function() {
    try {
      return window.localStorage.getItem("ptg-lib-view") === "list" ? "list" : "grid";
    } catch (e) {
      return "grid";
    }
  }();
  document.addEventListener("click", function(e) {
    var b = e.target.closest ? e.target.closest("[data-lib-view]") : null;
    if (!b) {
      return;
    }
    libView = b.getAttribute("data-lib-view");
    try {
      window.localStorage.setItem("ptg-lib-view", libView);
    } catch (err) {}
    renderLibrary();
  });
  function renderLibrary() {
    var list = libraryList();
    var filtered = state.cat || state.age || state.status || state.q || state.who !== "all";
    $("libCount").textContent = list.length + (list.length === 1 ? " book" : " books") + (filtered ? " match your filters" : " on the shelf");
    $("libGrid").innerHTML = list.map(function(b) {
      return bookCard(b, "books");
    }).join("") + addTile("book");
    $("libGrid").classList.toggle("books--list", libView === "list");
    [].forEach.call(document.querySelectorAll("[data-lib-view]"), function(btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lib-view") === libView));
    });
    var going = filtered ? [] : books.filter(function(b) {
      return b.status === "reading" && matchesWho(b);
    });
    $("libContinue").hidden = !going.length;
    $("libContinueRow").innerHTML = going.map(function(b) {
      var p = pct(b);
      return '<button class="lib-go" type="button" data-edit-book="' + esc(b.id) + '">' + coverHtml(b) + '<span class="lib-go-txt"><span class="t">' + esc(b.title) + "</span>" + '<span class="a">' + esc(b.author || "Author unknown") + "</span>" + (p === null ? "" : '<span class="lib-go-bar" aria-hidden="true"><i style="width:' + p + '%"></i></span><span class="lib-go-pct">' + p + "% read</span>") + "</span></button>";
    }).join("");
    $("emptyLib").classList.toggle("is-on", !list.length && filtered);
    $("libGrid").hidden = !list.length && filtered;
  }
  function renderWishlist() {
    var list = wishList();
    $("wishCount").textContent = list.length + (list.length === 1 ? " book" : " books") + " waiting";
    $("wishGrid").innerHTML = list.map(function(b) {
      return bookCard(b, "wishlist");
    }).join("") + addTile("wishlist");
    $("emptyWish").classList.toggle("is-on", !list.length);
    $("wishGrid").hidden = !list.length;
    shareRow();
    shareSync();
  }
  var SG_MAX = 500;
  var suggestDialog = $("suggestDialog");
  var suggestForm = $("suggestForm");
  var suggestTrigger = null;
  function sgBad(id, errId, on) {
    var f = $(id);
    if (!f) {
      return;
    }
    $(errId).classList.toggle("is-on", !!on);
    if (on) {
      f.setAttribute("aria-invalid", "true");
    } else {
      f.removeAttribute("aria-invalid");
    }
  }
  function sgCount() {
    var box = $("sgBody"), out = $("sgCount");
    if (!box || !out) {
      return 0;
    }
    var n = box.value.length;
    out.textContent = n + " of " + SG_MAX + " characters";
    out.classList.toggle("is-over", n > SG_MAX);
    if (n <= SG_MAX) {
      sgBad("sgBody", "sgBodyErr", false);
    }
    return n;
  }
  function sgFrom() {
    var n = String(parent.name || "").trim();
    if (n && n.toLowerCase() !== "there") {
      return n;
    }
    return "A parent";
  }
  function openSuggest(trigger) {
    if (!suggestDialog) {
      return;
    }
    suggestTrigger = trigger || null;
    fillSelect($("sgCat"), catOptions());
    fillSelect($("sgAge"), ageOptions());
    $("sgTitle").value = "";
    $("sgBody").value = "";
    $("sgLink").value = "";
    $("sgCat").value = CATEGORIES[0].id;
    $("sgAge").value = AGE_BANDS[1];
    $("sgOk").checked = false;
    sgBad("sgTitle", "sgTitleErr", false);
    sgBad("sgBody", "sgBodyErr", false);
    sgBad("sgLink", "sgLinkErr", false);
    $("sgOkErr").classList.remove("is-on");
    $("sgOk").removeAttribute("aria-invalid");
    sgCount();
    openDialog(suggestDialog);
    window.setTimeout(function() {
      $("sgTitle").focus();
    }, 40);
  }
  function suggestRestoreFocus() {
    var t = suggestTrigger;
    suggestTrigger = null;
    if (t && t.focus) {
      try {
        t.focus();
      } catch (e) {}
    }
  }
  function renderMySuggestions() {
    var list = $("setSuggestList"), empty = $("setSuggestEmpty");
    if (!list || !empty) {
      return;
    }
    var mine = window.PTGSuggest ? window.PTGSuggest.mine(parent.email) : [];
    list.hidden = !mine.length;
    empty.hidden = !!mine.length;
    if (!mine.length) {
      return;
    }
    list.innerHTML = mine.map(function(r) {
      var label = r.state === "approved" ? "Approved" : r.state === "rejected" ? "Rejected" : "Waiting";
      var c = cat(r.category);
      var meta = (c ? c.name + " · " : "") + "Ages " + r.ages + " · sent " + since(r.at);
      var link = /^https?:\/\/[^\s]+$/i.test(String(r.link || "")) ? ' · <a href="' + esc(r.link) + '" rel="noopener nofollow" target="_blank">' + 'Open the link<span class="vh"> (opens in a new tab)</span></a>' : "";
      var why = r.state === "rejected" && r.reason ? '<p class="sg-why"><b>Why it was turned down:</b> ' + esc(r.reason) + "</p>" : "";
      return "<li>" + '<div class="sg-head">' + '<span class="pill pill--' + esc(r.state) + '">' + label + "</span>" + "<b>" + esc(r.title) + "</b>" + "</div>" + (r.body ? '<p class="sg-body">' + esc(r.body) + "</p>" : "") + '<p class="sg-meta">' + esc(meta) + link + "</p>" + why + "</li>";
    }).join("");
  }
  if (suggestForm) {
    [ "suggestOpen", "suggestOpenBoard", "suggestOpenSet" ].forEach(function(id) {
      var b = $(id);
      if (b) {
        b.addEventListener("click", function() {
          openSuggest(b);
        });
      }
    });
    $("sgBody").addEventListener("input", sgCount);
    suggestForm.addEventListener("submit", function(e) {
      var title = $("sgTitle").value.trim();
      var body = $("sgBody").value.trim();
      var link = $("sgLink").value.trim();
      if (!title) {
        e.preventDefault();
        sgBad("sgTitle", "sgTitleErr", true);
        $("sgTitle").focus();
        return;
      }
      sgBad("sgTitle", "sgTitleErr", false);
      if (body.length > SG_MAX) {
        e.preventDefault();
        sgBad("sgBody", "sgBodyErr", true);
        $("sgBody").focus();
        return;
      }
      sgBad("sgBody", "sgBodyErr", false);
      if (link && !/^https?:\/\/[^\s]+$/i.test(link)) {
        e.preventDefault();
        sgBad("sgLink", "sgLinkErr", true);
        $("sgLink").focus();
        return;
      }
      sgBad("sgLink", "sgLinkErr", false);
      if (!$("sgOk").checked) {
        e.preventDefault();
        $("sgOkErr").classList.add("is-on");
        $("sgOk").setAttribute("aria-invalid", "true");
        $("sgOk").focus();
        return;
      }
      $("sgOkErr").classList.remove("is-on");
      $("sgOk").removeAttribute("aria-invalid");
      if (!window.PTGSuggest) {
        e.preventDefault();
        say("Suggestions are unavailable right now. Try again in a moment.");
        return;
      }
      var saved = window.PTGSuggest.add({
        title: title,
        body: body,
        link: link,
        category: $("sgCat").value,
        ages: $("sgAge").value,
        from: sgFrom(),
        owner: parent.email
      });
      if (!saved) {
        e.preventDefault();
        say("This browser is blocking local storage, so the suggestion was not saved.");
        return;
      }
      note("Suggested " + title);
      say("Sent for review. You can follow it in Settings.");
      renderMySuggestions();
      if (window.PTGNotify) {
        window.PTGNotify.toAdmins({
          kind: "moderation",
          tone: "info",
          title: "New suggestion to review",
          body: "“" + title + "” from " + sgFrom() + " is waiting in the queue.",
          go: "moderation",
          tag: "queue"
        });
      }
    });
    suggestDialog.addEventListener("close", suggestRestoreFocus);
    suggestDialog.addEventListener("click", function(e) {
      if (e.target.closest && e.target.closest("[data-close]")) {
        window.setTimeout(suggestRestoreFocus, 0);
      }
    });
    document.addEventListener("keydown", function(e) {
      if (!suggestDialog.hasAttribute("open")) {
        return;
      }
      if (typeof suggestDialog.showModal === "function") {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog(suggestDialog);
        suggestRestoreFocus();
        return;
      }
      if (e.key !== "Tab") {
        return;
      }
      var f = suggestDialog.querySelectorAll("a[href], button:not([disabled]), " + "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), " + '[tabindex]:not([tabindex="-1"])');
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
    if (window.PTGSuggest) {
      window.PTGSuggest.onChange(function() {
        renderMySuggestions();
        renderBoard();
      });
    }
  }
  var WELCOME_KEY = "ptg-welcome-v1";
  function welcomeMine() {
    var all;
    try {
      all = JSON.parse(window.localStorage.getItem(WELCOME_KEY)) || {};
    } catch (e) {
      all = {};
    }
    var k = String(window.PTGSession && window.PTGSession.email() || "guest").toLowerCase();
    return {
      all: all,
      k: k,
      me: all[k] || {}
    };
  }
  function welcomeSave(patch) {
    var w = welcomeMine();
    for (var p in patch) {
      w.me[p] = patch[p];
    }
    w.all[w.k] = w.me;
    try {
      window.localStorage.setItem(WELCOME_KEY, JSON.stringify(w.all));
    } catch (e) {}
  }
  var WELCOME_STEPS = [ {
    id: "child",
    title: "Add your child’s profile",
    text: "Their name, age and the kinds of books they love.",
    act: "Add a child",
    done: function() {
      return children.length > 0;
    }
  }, {
    id: "book",
    title: "Put a book on the shelf",
    text: "Something they are reading now, or want to read next.",
    act: "Add a book",
    done: function() {
      return books.length > 0;
    }
  }, {
    id: "log",
    title: "Log the first reading night",
    text: "Open the reading space and let them tap the book they read.",
    act: "Open reading space",
    done: function() {
      return sessions.length > 0;
    }
  }, {
    id: "bed",
    title: "Set a bedtime",
    text: "The reading space dims and winds down from this time.",
    act: "Set bedtime",
    done: function() {
      return !!welcomeMine().me.bed;
    }
  } ];
  var welcomeShown = false;
  var welcomeWas = {};
  var welcomeFor = null;
  var WL_CHECK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.4 3 3 6-6.6"/></svg>';
  function renderWelcome() {
    var box = $("welcome");
    if (!box) {
      return;
    }
    var mine = welcomeMine(), me = mine.me;
    if (welcomeFor !== mine.k) {
      welcomeFor = mine.k;
      welcomeShown = false;
      welcomeWas = {};
    }
    var flags = WELCOME_STEPS.map(function(s) {
      return s.done();
    });
    var count = flags.filter(Boolean).length;
    var total = WELCOME_STEPS.length;
    var all = count === total;
    if (me.dismissed || all && !welcomeShown) {
      box.hidden = true;
      box.innerHTML = "";
      box.removeAttribute("aria-labelledby");
      return;
    }
    welcomeShown = true;
    var next = flags.indexOf(false);
    var left = total - count;
    var head = all ? "<h2 id=\"welcomeH\">You’re all set up</h2><p>Everything is ready. Happy reading!</p>" : "<h2 id=\"welcomeH\">Welcome! Let’s get your shelf ready</h2>" + "<p><b>" + count + " of " + total + "</b> done · about " + left * 1 + (left === 1 ? " minute" : " minutes") + " to go</p>";
    var steps = WELCOME_STEPS.map(function(s, i) {
      var done = flags[i];
      var fresh = done && welcomeWas[s.id] === false;
      var cls = "wl-step" + (done ? " is-done" : "") + (i === next ? " is-next" : "") + (fresh ? " is-fresh" : "");
      var btn = done ? '<span class="wl-done">Done</span>' : '<button type="button" class="btn btn--sm ' + (i === next ? "btn--primary" : "btn--ghost") + '" data-welcome="' + s.id + '">' + esc(s.act) + "</button>";
      return '<li class="' + cls + '" style="--i:' + i + '">' + '<span class="wl-check" aria-hidden="true">' + (done ? WL_CHECK : i + 1) + "</span>" + '<div class="wl-txt"><b>' + esc(s.title) + "</b><span>" + esc(s.text) + "</span></div>" + btn + '<span class="vh">' + (done ? "Done." : "Not done yet.") + "</span></li>";
    }).join("");
    WELCOME_STEPS.forEach(function(s, i) {
      welcomeWas[s.id] = flags[i];
    });
    var r = 19, circ = 2 * Math.PI * r;
    box.innerHTML = '<div class="wl-head">' + '<span class="wl-ring' + (all ? " is-full" : "") + '" aria-hidden="true">' + '<svg viewBox="0 0 44 44"><circle class="wl-ring-bg" cx="22" cy="22" r="' + r + '"/>' + '<circle class="wl-ring-fg" cx="22" cy="22" r="' + r + '" stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + (circ * (1 - count / total)).toFixed(2) + '"/></svg>' + '<span class="wl-ring-n">' + (all ? WL_CHECK : count + "/" + total) + "</span></span>" + '<div class="wl-intro">' + head + "</div>" + '<button type="button" class="wl-x" data-welcome="hide" aria-label="Hide the setup checklist">' + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m4.4 4.4 7.2 7.2M11.6 4.4l-7.2 7.2"/></svg>' + "</button></div>" + (all ? "" : '<ol class="wl-steps">' + steps + "</ol>");
    box.classList.toggle("is-complete", all);
    box.setAttribute("aria-labelledby", "welcomeH");
    box.hidden = false;
  }
  document.addEventListener("click", function(e) {
    var hit = e.target.closest ? e.target.closest("[data-welcome]") : null;
    if (!hit) {
      return;
    }
    var what = hit.getAttribute("data-welcome");
    if (what === "hide") {
      welcomeSave({
        dismissed: true
      });
      var box = $("welcome");
      box.classList.add("is-leaving");
      window.setTimeout(renderWelcome, reduced.matches ? 0 : 260);
      say("Setup checklist hidden");
    } else if (what === "child") {
      openChild(null);
    } else if (what === "book") {
      openBook(null, "books");
    } else if (what === "log") {
      $("kidsOpenDash").click();
    } else if (what === "bed") {
      window.location.hash = "#settings/bedtime";
    }
  });
  (function() {
    var bed = document.getElementById("set-bedtime");
    if (!bed) {
      return;
    }
    var mark = function() {
      if (!welcomeMine().me.bed) {
        welcomeSave({
          bed: true
        });
        renderWelcome();
      }
    };
    bed.addEventListener("change", mark);
    bed.addEventListener("input", mark);
  })();
  function renderAll() {
    renderCounts();
    renderGreeting();
    renderWhoChips();
    renderDashboard();
    renderWelcome();
    renderTonight();
    renderProfiles();
    renderLibrary();
    renderResources();
    renderWishlist();
    renderMySuggestions();
    dustSweep();
  }
  function dustSweep() {
    if (window.PTGCobweb) {
      window.PTGCobweb.scan(document);
    }
  }
  var TABS = [ "dashboard", "profiles", "library", "resources", "wishlist", "settings" ];
  var NAV_TABS = [ "dashboard", "profiles", "library", "resources", "wishlist" ];
  var TAB_TITLES = {
    dashboard: "Dashboard",
    profiles: "Profiles",
    library: "Library",
    resources: "Resources",
    wishlist: "Wishlist",
    settings: "Settings"
  };
  function swapPanels(change, after) {
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("ptg-reduce");
    if (!document.startViewTransition || calm || document.hidden) {
      change();
      after();
      return;
    }
    document.documentElement.classList.add("vt-tabs");
    var vt = document.startViewTransition(change);
    vt.ready["catch"](function() {});
    vt.updateCallbackDone.then(after, after);
    vt.finished.then(function() {
      document.documentElement.classList.remove("vt-tabs");
    }, function() {
      document.documentElement.classList.remove("vt-tabs");
    });
  }
  function goTab(name, opts) {
    if (TABS.indexOf(name) === -1) {
      name = "dashboard";
    }
    opts = opts || {};
    state.tab = name;
    if (window.history && window.history.replaceState) {
      if (!(name === "settings" && /^#settings(\/|$)/.test(window.location.hash))) {
        var tabHash = "#" + (name === "dashboard" ? "app" : name);
        // A tab the person picked gets its own history entry, so the phone's back
        // button or swipe-back steps through the tabs instead of leaving the app.
        if (!opts.keepScroll && window.location.hash !== tabHash) {
          window.history.pushState(null, "", tabHash);
        } else {
          window.history.replaceState(null, "", tabHash);
        }
      }
    }
    swapPanels(function() {
    TABS.forEach(function(t) {
      var btn = $("tab-" + t), panel = $("panel-" + t);
      var on = t === name;
      if (btn) {
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.tabIndex = on ? 0 : -1;
      }
      if (panel) {
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
      }
    });
    }, function() {
    document.title = TAB_TITLES[name] + " — Parents Go To";
    $("appRoute").textContent = TAB_TITLES[name];
    if (opts.focus) {
      var head = $("h-" + name);
      if (head) {
        head.focus();
      }
    }
    if (!opts.keepScroll) {
      window.scrollTo({
        top: 0,
        behavior: reduced.matches ? "auto" : "smooth"
      });
    }
    });
  }
  $("appTabs").addEventListener("keydown", function(e) {
    var i = NAV_TABS.indexOf(state.tab);
    var next = null;
    if (i === -1) {
      i = 0;
    }
    if (e.key === "ArrowRight") {
      next = NAV_TABS[(i + 1) % NAV_TABS.length];
    }
    if (e.key === "ArrowLeft") {
      next = NAV_TABS[(i - 1 + NAV_TABS.length) % NAV_TABS.length];
    }
    if (e.key === "Home") {
      next = NAV_TABS[0];
    }
    if (e.key === "End") {
      next = NAV_TABS[NAV_TABS.length - 1];
    }
    if (!next) {
      return;
    }
    e.preventDefault();
    goTab(next);
    var nextBtn = $("tab-" + next);
    if (nextBtn) {
      nextBtn.focus();
    }
  });
  var whoBtn = $("whoBtn"), whoMenu = $("whoMenu");
  function setMenu(open) {
    whoMenu.hidden = !open;
    whoBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  whoBtn.addEventListener("click", function() {
    setMenu(whoMenu.hidden);
  });
  document.addEventListener("click", function(e) {
    if (whoMenu.hidden) {
      return;
    }
    if (!whoMenu.contains(e.target) && !whoBtn.contains(e.target)) {
      setMenu(false);
    }
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && !whoMenu.hidden) {
      setMenu(false);
      whoBtn.focus();
    }
  });
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
  document.addEventListener("click", function(e) {
    var btn = e.target.closest ? e.target.closest("[data-close]") : null;
    if (btn && btn.closest("dialog")) {
      closeDialog(btn.closest("dialog"));
    }
  });
  function fillSelect(el, items, blank) {
    var html = blank ? '<option value="">' + blank + "</option>" : "";
    items.forEach(function(it) {
      html += '<option value="' + esc(it.value) + '">' + esc(it.label) + "</option>";
    });
    el.innerHTML = html;
  }
  function catOptions() {
    return CATEGORIES.map(function(c) {
      return {
        value: c.id,
        label: c.name
      };
    });
  }
  function ageOptions() {
    return AGE_BANDS.map(function(a) {
      return {
        value: a,
        label: "Ages " + a
      };
    });
  }
  function whoOptions() {
    return [ {
      value: "",
      label: "The whole family"
    } ].concat(children.map(function(k) {
      return {
        value: k.id,
        label: k.name
      };
    }));
  }
  function fillSwatches(box, name, colours) {
    box.innerHTML = colours.map(function(c, i) {
      var id = name + "-" + i;
      return '<input type="radio" name="' + name + '" id="' + id + '" value="' + c + '"' + (i === 0 ? " checked" : "") + ">" + '<label for="' + id + '" style="background:' + c + '">' + '<span class="vh">Colour ' + (i + 1) + "</span></label>";
    }).join("");
  }
  function pickSwatch(box, name, value) {
    var inputs = box.querySelectorAll("input");
    var hit = false;
    [].forEach.call(inputs, function(i) {
      i.checked = i.value.toLowerCase() === String(value).toLowerCase();
      if (i.checked) {
        hit = true;
      }
    });
    if (!hit && inputs.length) {
      inputs[0].checked = true;
    }
  }
  function fillStars(box, value) {
    var v = Math.round(Number(value) || 0);
    box.dataset.value = String(v);
    var html = "";
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" role="radio" class="' + (i <= v ? "on" : "") + '" data-star="' + i + '" aria-checked="' + (i === v) + '" ' + 'aria-label="' + i + (i === 1 ? " star" : " stars") + '">' + '<svg width="22" height="22" viewBox="0 0 20 20" fill="' + (i <= v ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.5" ' + 'stroke-linejoin="round" aria-hidden="true"><path d="' + STAR + '"/></svg>' + "</button>";
    }
    html += '<button type="button" class="clear" data-star="0">Clear</button>';
    box.innerHTML = html;
  }
  $("bRate").addEventListener("click", function(e) {
    var hit = e.target.closest("[data-star]");
    if (!hit) {
      return;
    }
    fillStars($("bRate"), Number(hit.getAttribute("data-star")));
  });
  function starValue() {
    return Number($("bRate").dataset.value) || 0;
  }
  function swatchValue(name) {
    var el = document.querySelector('#page-app input[name="' + name + '"]:checked');
    return el ? el.value : SPINES[0];
  }
  var bookDialog = $("bookDialog"), bookForm = $("bookForm");
  function openBook(book, list) {
    state.editing = book || null;
    state.editingList = list;
    fillSelect($("bCat"), catOptions());
    fillSelect($("bAge"), ageOptions());
    fillSelect($("bFor"), whoOptions());
    fillSwatches($("bSpine"), "bspine", SPINES);
    var isWish = list === "wishlist";
    $("bookDlgTitle").textContent = book ? "Edit " + book.title : isWish ? "Add to wishlist" : "Add a book";
    $("bookDlgSub").textContent = isWish ? "Only the title is required. Move it to the library once it arrives." : "Only the title is required. Everything else can wait.";
    $("bookSave").textContent = book ? "Save changes" : isWish ? "Add to wishlist" : "Add book";
    $("bStatus").closest(".f").hidden = isWish;
    $("bPages").closest(".f").hidden = isWish;
    $("bPage").closest(".f").hidden = isWish;
    $("bRate").closest(".f").hidden = isWish;
    $("bTitle").value = book ? book.title : "";
    $("bAuthor").value = book ? book.author || "" : "";
    $("bCat").value = book ? book.category : CATEGORIES[0].id;
    $("bAge").value = book ? book.ages : AGE_BANDS[1];
    $("bStatus").value = book ? book.status : "toread";
    $("bFor").value = book && book.who && book.who.length ? book.who[0] : "";
    $("bPages").value = book && book.pages ? String(book.pages) : "";
    $("bPage").value = book && book.page ? String(book.page) : "";
    $("bCover").value = book ? book.cover || "" : "";
    $("bNotes").value = book ? book.notes || "" : "";
    fillStars($("bRate"), book ? book.rating : 0);
    pickSwatch($("bSpine"), "bspine", book ? book.spine : SPINES[Math.floor(Math.random() * SPINES.length)]);
    if (book && !isWish && (book.started || book.finished)) {
      var told = [];
      if (book.started) {
        told.push("Started " + niceDate(book.started));
      }
      if (book.finished) {
        told.push("finished " + niceDate(book.finished));
      }
      $("bookDlgSub").textContent = told.join(", ") + ".";
    }
    $("bTitleErr").classList.remove("is-on");
    $("bTitle").removeAttribute("aria-invalid");
    $("bPageErr").classList.remove("is-on");
    $("bPage").removeAttribute("aria-invalid");
    openDialog(bookDialog);
    window.setTimeout(function() {
      $("bTitle").focus();
    }, 40);
  }
  bookForm.addEventListener("submit", function(e) {
    var title = $("bTitle").value.trim();
    if (!title) {
      e.preventDefault();
      $("bTitleErr").classList.add("is-on");
      $("bTitle").setAttribute("aria-invalid", "true");
      $("bTitle").focus();
      return;
    }
    var isWish = state.editingList === "wishlist";
    var pages = Math.max(0, Math.floor(Number($("bPages").value) || 0));
    var page = Math.max(0, Math.floor(Number($("bPage").value) || 0));
    if (!isWish && pages > 0 && page > pages) {
      e.preventDefault();
      $("bPageErr").classList.add("is-on");
      $("bPage").setAttribute("aria-invalid", "true");
      $("bPage").focus();
      return;
    }
    $("bPageErr").classList.remove("is-on");
    $("bPage").removeAttribute("aria-invalid");
    var who = $("bFor").value ? [ $("bFor").value ] : [];
    var data = {
      title: title,
      author: $("bAuthor").value.trim(),
      category: $("bCat").value,
      ages: $("bAge").value,
      status: isWish ? "toread" : $("bStatus").value,
      who: who,
      cover: $("bCover").value.trim(),
      notes: $("bNotes").value.trim(),
      spine: swatchValue("bspine")
    };
    if (!isWish) {
      data.pages = pages;
      data.page = page;
      data.rating = starValue();
    }
    if (state.editing) {
      var before = state.editing.status;
      Object.keys(data).forEach(function(k) {
        state.editing[k] = data[k];
      });
      if (!isWish && data.status !== before) {
        stampStatus(state.editing, data.status);
      }
      delete state.editing.slot;
      note("Updated " + data.title);
      say("Saved changes to " + data.title);
    } else {
      data.id = uid("b");
      (isWish ? wishlist : books).unshift(data);
      note("Added " + data.title + (isWish ? " to the wishlist" : " to the library"));
      say(data.title + (isWish ? " is on the wishlist" : " is on the shelf"));
    }
    renderAll();
  });
  var childDialog = $("childDialog"), childForm = $("childForm");
  var CHILD_COLOURS = [ "#B3402E", "#0A6280", "#2C6B4F", "#8A5A12", "#2F6E86", "#123F5B", "#0D3B32", "#06283C" ];
  function likeBoxes() {
    var box = $("kLikes");
    return box ? [].slice.call(box.querySelectorAll('input[type="checkbox"]')) : [];
  }
  function likesPaint() {
    var all = likeBoxes();
    var on = all.filter(function(b) {
      return b.checked;
    }).length;
    var master = $("kLikesAll");
    var count = $("kLikesCount");
    if (master) {
      master.checked = on > 0 && on === all.length;
      master.indeterminate = on > 0 && on < all.length;
      master.setAttribute("data-some", master.indeterminate ? "true" : "false");
    }
    if (count) {
      count.textContent = on === 0 ? "None chosen" : on === all.length ? "All chosen" : on + " chosen";
    }
  }
  if ($("kLikes")) {
    $("kLikes").addEventListener("change", likesPaint);
  }
  if ($("kLikesAll")) {
    $("kLikesAll").addEventListener("change", function() {
      var want = $("kLikesAll").checked;
      likeBoxes().forEach(function(b) {
        b.checked = want;
      });
      likesPaint();
    });
  }
  function openChild(k) {
    state.editingChild = k || null;
    fillSelect($("kBand"), ageOptions());
    $("kLikes").innerHTML = CATEGORIES.map(function(c) {
      return '<label class="pick"><input type="checkbox" value="' + esc(c.id) + '">' + '<span class="pick-box" aria-hidden="true">' + '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" ' + 'stroke-linecap="round" stroke-linejoin="round"><path class="tick" d="m3.6 8.4 2.9 2.9 5.9-6.2"/></svg>' + "</span>" + '<span class="pick-txt">' + esc(c.name) + "</span></label>";
    }).join("");
    fillSwatches($("kColour"), "kcolour", CHILD_COLOURS);
    $("childDlgTitle").textContent = k ? "Edit " + k.name + "’s profile" : "Add a child";
    $("childSave").textContent = k ? "Save changes" : "Add child";
    $("childDelete").hidden = !k;
    $("kName").value = k ? k.name : "";
    $("kAge").value = k && k.age != null ? k.age : "";
    $("kBand").value = k ? k.band : AGE_BANDS[1];
    likeBoxes().forEach(function(b) {
      b.checked = !!(k && k.likes && k.likes.indexOf(b.value) !== -1);
    });
    likesPaint();
    pickSwatch($("kColour"), "kcolour", k ? k.colour : CHILD_COLOURS[children.length % CHILD_COLOURS.length]);
    $("kNameErr").classList.remove("is-on");
    $("kName").removeAttribute("aria-invalid");
    $("kAgeErr").classList.remove("is-on");
    $("kAge").removeAttribute("aria-invalid");
    openDialog(childDialog);
    window.setTimeout(function() {
      $("kName").focus();
    }, 40);
  }
  childForm.addEventListener("submit", function(e) {
    var name = $("kName").value.trim();
    if (!name) {
      e.preventDefault();
      $("kNameErr").classList.add("is-on");
      $("kName").setAttribute("aria-invalid", "true");
      $("kName").focus();
      return;
    }
    var age = $("kAge").value === "" ? null : Number($("kAge").value);
    // The form is novalidate, so the field's min/max are not enforced by the browser.
    if (age !== null && !(age % 1 === 0 && age >= 0 && age <= 18)) {
      e.preventDefault();
      $("kAgeErr").classList.add("is-on");
      $("kAge").setAttribute("aria-invalid", "true");
      $("kAge").focus();
      return;
    }
    $("kAgeErr").classList.remove("is-on");
    $("kAge").removeAttribute("aria-invalid");
    var likes = likeBoxes().filter(function(b) {
      return b.checked;
    }).map(function(b) {
      return b.value;
    });
    var data = {
      name: name,
      age: age,
      band: $("kBand").value,
      likes: likes,
      colour: swatchValue("kcolour")
    };
    if (state.editingChild) {
      Object.keys(data).forEach(function(key) {
        state.editingChild[key] = data[key];
      });
      note("Updated " + name + "’s profile");
      say("Saved " + name + "’s profile");
    } else {
      data.id = uid("c");
      children.push(data);
      note(name + " was added to the family");
      say(name + " now has a shelf");
    }
    renderAll();
  });
  $("childDelete").addEventListener("click", function() {
    var k = state.editingChild;
    if (!k) {
      return;
    }
    var at = children.indexOf(k);
    children.splice(at, 1);
    books.concat(wishlist).forEach(function(b) {
      if (b.who) {
        b.who = b.who.filter(function(id) {
          return id !== k.id;
        });
      }
    });
    if (state.who === k.id) {
      state.who = "all";
    }
    closeDialog(childDialog);
    renderAll();
    note(k.name + "’s profile was removed");
    say(k.name + "’s profile was removed", function() {
      children.splice(at, 0, k);
      renderAll();
    });
  });
  function note(text) {
    activity.unshift({
      text: text,
      at: Date.now()
    });
    if (activity.length > 12) {
      activity.pop();
    }
  }
  function stampStatus(b, next) {
    if (next === "reading" && !b.started) {
      b.started = stamp();
    }
    if (next === "read") {
      b.finished = stamp();
      if (!b.started) {
        b.started = b.finished;
      }
      if (Number(b.pages) > 0) {
        b.page = Number(b.pages);
      }
    }
    if (next !== "read") {
      delete b.finished;
    }
    if (next === "toread") {
      b.page = 0;
    }
  }
  function openSetSection(sectionId, role) {
    if (window.PTGOpenSetting) {
      window.PTGOpenSetting(sectionId, role);
    }
  }
  $("page-app").addEventListener("click", function(e) {
    var t = e.target.closest ? e.target : null;
    if (!t) {
      return;
    }
    var hit;
    hit = t.closest("[data-app-go]");
    if (hit) {
      goTab(hit.getAttribute("data-app-go"));
      setMenu(false);
      openSetSection(hit.getAttribute("data-set-open"), "parent");
      return;
    }
    hit = t.closest("[data-who]");
    if (hit) {
      var fromMenu = !!hit.closest("#whoMenuList");
      var fromBar = !!hit.closest("#pgWhoMenu");
      var kind = hit.classList.contains("reader") ? ".reader" : ".chip";
      state.who = hit.getAttribute("data-who");
      setMenu(false);
      renderAll();
      pgClose();
      var back = fromMenu ? $("whoBtn") : fromBar ? $("pgWhoBtn") : document.querySelector("#page-app " + kind + '[data-who="' + state.who + '"]');
      if (back) {
        back.focus();
      }
      var k = child(state.who);
      say(k ? "Showing " + k.name + "’s books" : "Showing everyone’s books");
      return;
    }
    hit = t.closest("[data-cat]");
    if (hit) {
      state.cat = hit.getAttribute("data-cat");
      $("fCat").value = state.cat;
      renderLibrary();
      goTab("library", {
        focus: true
      });
      return;
    }
    hit = t.closest("[data-open-kid]");
    if (hit) {
      openKids(hit.getAttribute("data-open-kid"), suggestedMode());
      return;
    }
    hit = t.closest("[data-see]");
    if (hit) {
      state.who = hit.getAttribute("data-see");
      renderAll();
      goTab("library", {
        focus: true
      });
      return;
    }
    hit = t.closest("[data-add]");
    if (hit) {
      var kind = hit.getAttribute("data-add");
      if (kind === "child") {
        openChild(null);
      } else {
        openBook(null, kind === "wishlist" ? "wishlist" : "books");
      }
      return;
    }
    hit = t.closest("[data-edit-book]");
    if (hit) {
      openBook(byId(books, hit.getAttribute("data-edit-book")), "books");
      return;
    }
    hit = t.closest("[data-edit-wish]");
    if (hit) {
      openBook(byId(wishlist, hit.getAttribute("data-edit-wish")), "wishlist");
      return;
    }
    hit = t.closest("[data-edit-child]");
    if (hit) {
      openChild(child(hit.getAttribute("data-edit-child")));
      return;
    }
    hit = t.closest("[data-look]");
    if (hit) {
      var lk = child(hit.getAttribute("data-look"));
      if (lk && window.PTGStudio) {
        window.PTGStudio.open(lk.id, lk.name, lk.colour);
      }
      return;
    }
    hit = t.closest("[data-chat]");
    if (hit) {
      var ck = child(hit.getAttribute("data-chat"));
      if (ck && window.PTGKidChat) {
        window.PTGKidChat.open(ck.id, ck.name);
      }
      return;
    }
    hit = t.closest("[data-cycle]");
    if (hit) {
      var b = byId(books, hit.getAttribute("data-cycle"));
      if (!b) {
        return;
      }
      b.status = b.status === "toread" ? "reading" : b.status === "reading" ? "read" : "toread";
      stampStatus(b, b.status);
      delete b.slot;
      renderAll();
      note(b.title + " is now marked " + STATUS[b.status].label.toLowerCase());
      say(b.status === "read" ? "Finished " + b.title + " — " + niceDate(b.finished) : b.title + " — " + STATUS[b.status].label.toLowerCase());
      return;
    }
    hit = t.closest("[data-move]");
    if (hit) {
      var w = byId(wishlist, hit.getAttribute("data-move"));
      if (!w) {
        return;
      }
      var pos = wishlist.indexOf(w);
      wishlist.splice(pos, 1);
      w.status = "toread";
      books.unshift(w);
      renderAll();
      note(w.title + " moved from the wishlist to the library");
      say(w.title + " is on the shelf", function() {
        books.splice(books.indexOf(w), 1);
        wishlist.splice(pos, 0, w);
        renderAll();
      });
      return;
    }
    hit = t.closest("[data-del]");
    if (hit) {
      var which = hit.getAttribute("data-list") === "wishlist" ? wishlist : books;
      var item = byId(which, hit.getAttribute("data-del"));
      if (!item) {
        return;
      }
      var idx = which.indexOf(item);
      which.splice(idx, 1);
      renderAll();
      note(item.title + " was removed");
      say("Removed " + item.title, function() {
        which.splice(idx, 0, item);
        renderAll();
      });
      return;
    }
    hit = t.closest("[data-noop-app]");
    if (hit) {
      say("That screen is not available yet.");
      return;
    }
  });
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }
  var searchTimer = null;
  $("appSearch").addEventListener("input", function() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function() {
      state.q = $("appSearch").value.trim().toLowerCase();
      renderLibrary();
      renderWishlist();
      renderDashboard();
      if (state.q && state.tab === "dashboard") {
        goTab("library", {
          keepScroll: true
        });
      }
    }, 180);
  });
  var EXT_ICON = '<svg class="ext" width="14" height="14" viewBox="0 0 20 20" fill="none" ' + 'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' + 'aria-hidden="true"><path d="M11.4 3.4h5.2v5.2"/><path d="m16.6 3.4-7.2 7.2"/>' + '<path d="M14.6 12v3.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 15.4V6.6A1.6 1.6 0 0 1 4.6 5H8"/></svg>';
  function safeUrl(v) {
    return /^https?:\/\/[^\s]+$/i.test(String(v || "")) ? String(v) : "";
  }
  function hostOf(url) {
    var m = /^https?:\/\/([^\/?#:]+)/i.exec(String(url || ""));
    if (!m) {
      return "";
    }
    return m[1].toLowerCase().replace(/^www\./, "");
  }
  function onDay(at) {
    if (!at) {
      return "";
    }
    return new Date(at).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }
  function approvedResources() {
    var out = [];
    if (!window.PTGAdmin) {
      return out;
    }
    window.PTGAdmin.publishedPosts().forEach(function(p) {
      out.push({
        id: p.id,
        kind: "From the team",
        title: p.title,
        body: p.body,
        category: p.category,
        ages: p.ages,
        link: p.link,
        at: p.at
      });
    });
    window.PTGAdmin.submissions().forEach(function(s) {
      if (s.state !== "approved") {
        return;
      }
      out.push({
        id: s.id,
        kind: "Suggested by a parent",
        title: s.title,
        body: s.body,
        category: s.category,
        ages: s.ages,
        link: s.link,
        at: s.decidedAt || s.at
      });
    });
    out.sort(function(a, b) {
      return (b.at || 0) - (a.at || 0);
    });
    return out;
  }
  function resourceList() {
    return approvedResources().filter(function(r) {
      if (state.rCat && r.category !== state.rCat) {
        return false;
      }
      if (state.rAge && r.ages !== state.rAge) {
        return false;
      }
      return true;
    });
  }
  function resourceCard(r) {
    var c = cat(r.category);
    var url = safeUrl(r.link);
    var host = hostOf(url);
    var tags = (c ? '<span class="tag tag--cat" style="--tint:' + c.tint + ";--tone:" + c.tone + '">' + esc(c.name) + "</span>" : "") + (r.ages ? '<span class="tag">Ages ' + esc(r.ages) + "</span>" : "");
    var source = url ? '<span class="dom">' + esc(host) + "</span>" : '<span class="dom dom--none">No link &mdash; written for this site</span>';
    var when = r.at ? '<span class="when">Approved ' + esc(onDay(r.at)) + "</span>" : "";
    var open = url ? '<a class="res-open" href="' + esc(url) + '" target="_blank" rel="noopener nofollow">' + EXT_ICON + "Open the resource" + '<span class="vh"> (opens in a new tab)</span></a>' : "";
    return '<article class="res-card">' + '<div class="res-top">' + '<span class="kind">' + esc(r.kind) + "</span>" + "<h3>" + esc(r.title) + "</h3>" + "</div>" + '<p class="body">' + esc(r.body) + "</p>" + '<p class="meta">' + tags + "</p>" + '<p class="src">' + source + when + "</p>" + open + "</article>";
  }
  function renderResources() {
    var list = resourceList();
    var all = approvedResources().length;
    var filtered = !!(state.rCat || state.rAge);
    $("resCount").textContent = list.length + (list.length === 1 ? " resource" : " resources") + (filtered ? " match your filters" : " approved so far");
    $("resGrid").innerHTML = list.map(resourceCard).join("");
    $("resGrid").hidden = !list.length;
    $("emptyRes").classList.toggle("is-on", !list.length);
    if (!list.length) {
      $("emptyResTitle").textContent = filtered ? "No resources match those filters" : "Nothing has been approved yet";
      $("emptyResBody").textContent = filtered ? "Widen the search, or clear the filters to see everything that has been approved." : "When a moderator approves a guide or a link it will appear here.";
      $("emptyResClear").hidden = !filtered;
    }
  }
  function clearResFilters() {
    state.rCat = state.rAge = "";
    $("rCat").value = $("rAge").value = "";
    renderResources();
  }
  [ "rCat", "rAge" ].forEach(function(id) {
    $(id).addEventListener("change", function() {
      state.rCat = $("rCat").value;
      state.rAge = $("rAge").value;
      renderResources();
    });
  });
  $("clearResFilters").addEventListener("click", function() {
    clearResFilters();
  });
  $("emptyResClear").addEventListener("click", function() {
    clearResFilters();
    $("rCat").focus();
  });
  fillSelect($("rCat"), catOptions(), "All categories");
  fillSelect($("rAge"), ageOptions(), "Any age");
  [ "fCat", "fAge", "fStatus", "fSort" ].forEach(function(id) {
    $(id).addEventListener("change", function() {
      state.cat = $("fCat").value;
      state.age = $("fAge").value;
      state.status = $("fStatus").value;
      state.sort = $("fSort").value;
      renderLibrary();
    });
  });
  function clearFilters(opts) {
    opts = opts || {};
    state.cat = state.age = state.status = "";
    state.sort = "added";
    state.q = "";
    if (opts.keepReader !== true) {
      state.who = "all";
    }
    $("fCat").value = $("fAge").value = $("fStatus").value = "";
    $("fSort").value = "added";
    $("appSearch").value = "";
    renderAll();
  }
  $("clearFilters").addEventListener("click", clearFilters);
  $("emptyLibClear").addEventListener("click", function() {
    clearFilters();
    $("fCat").focus();
  });
  $("addBookTop").addEventListener("click", function() {
    openBook(null, "books");
  });
  $("addWishTop").addEventListener("click", function() {
    openBook(null, "wishlist");
  });
  $("emptyWishAdd").addEventListener("click", function() {
    openBook(null, "wishlist");
  });
  $("addChildTop").addEventListener("click", function() {
    openChild(null);
  });
  $("signOutBtn").addEventListener("click", function() {
    setMenu(false);
    var back = document.querySelector("#page-auth [data-signout]");
    if (back) {
      back.click();
    }
    window.location.hash = "#signin";
    window.dispatchEvent(new Event("hashchange"));
  });
  fillSelect($("fCat"), catOptions(), "All categories");
  fillSelect($("fAge"), ageOptions(), "Any age");
  var started = false;
  function demoSessions() {
    return [ {
      id: "s1",
      bookId: "b1",
      childId: "c1",
      date: daysAgo(1),
      minutes: 15,
      page: 18
    }, {
      id: "s2",
      bookId: "b1",
      childId: "c1",
      date: daysAgo(2),
      minutes: 10,
      page: 11
    }, {
      id: "s3",
      bookId: "b1",
      childId: "c1",
      date: daysAgo(3),
      minutes: 20,
      page: 6
    }, {
      id: "s4",
      bookId: "b3",
      childId: "c2",
      date: daysAgo(1),
      minutes: 30,
      page: 96
    }, {
      id: "s5",
      bookId: "b3",
      childId: "c2",
      date: daysAgo(4),
      minutes: 25,
      page: 71
    } ];
  }
  function anyBook(id) {
    return byId(books, id) || byId(wishlist, id) || null;
  }
  function logSession(book, childId, minutes, page) {
    var s = {
      id: uid("s"),
      bookId: book.id,
      childId: childId || null,
      date: stamp(),
      minutes: Math.max(0, Math.round(Number(minutes) || 0))
    };
    if (page !== null && page !== undefined && page !== "") {
      s.page = clampPage(Number(page) || 0, Number(book.pages) || 0);
    }
    sessions.unshift(s);
    delete book.slot;
    if (book.status === "toread") {
      book.status = "reading";
      stampStatus(book, "reading");
    }
    if (s.page !== undefined && s.page > (Number(book.page) || 0)) {
      book.page = s.page;
    }
    return s;
  }
  function dateKey(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function nightsRead(childId) {
    var set = {};
    sessions.forEach(function(s) {
      if (childId && s.childId !== childId) {
        return;
      }
      set[s.date] = true;
    });
    return set;
  }
  function streakFor(childId) {
    var set = nightsRead(childId);
    var d = new Date;
    if (!set[dateKey(d)]) {
      d.setDate(d.getDate() - 1);
      if (!set[dateKey(d)]) {
        return 0;
      }
    }
    var n = 0;
    while (set[dateKey(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function sessionsToday(childId) {
    var today = stamp();
    return sessions.filter(function(s) {
      return s.date === today && (!childId || s.childId === childId);
    });
  }
  function sessionsInRange(days) {
    var out = sessions.slice();
    if (days > 0) {
      var cut = new Date;
      cut.setDate(cut.getDate() - days);
      var cutKey = dateKey(cut);
      out = out.filter(function(s) {
        return s.date >= cutKey;
      });
    }
    out.sort(function(a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    return out;
  }
  function renderTonight() {
    var bar = $("tonightBar");
    var who = state.who === "all" ? null : state.who;
    var k = child(who);
    var mine = sessionsToday(who);
    var run = streakFor(who);
    var mins = mine.reduce(function(t, s) {
      return t + (Number(s.minutes) || 0);
    }, 0);
    bar.classList.toggle("is-lit", mine.length > 0);
    if (mine.length) {
      var titles = [];
      mine.forEach(function(s) {
        var b = anyBook(s.bookId);
        if (b && titles.indexOf(b.title) === -1) {
          titles.push(b.title);
        }
      });
      $("tonightLine").textContent = (k ? k.name + " read " : "Read ") + "tonight" + (mins ? " — " + mins + " minutes" : "");
      $("tonightSub").textContent = titles.slice(0, 2).join(" and ") + (titles.length > 2 ? " and more" : "") + (run > 1 ? " · " + run + " nights in a row" : "");
      $("kidsOpenDash").textContent = "Log another book";
    } else {
      $("tonightLine").textContent = "Nothing logged tonight";
      $("tonightSub").textContent = run > 0 ? run + (run === 1 ? " night" : " nights") + " in a row so far — keep it going" : "Open bedtime mode and let them tap the book they read.";
      $("kidsOpenDash").textContent = "Open bedtime mode";
    }
  }
  var kids = {
    who: null,
    book: null,
    mins: 15,
    open: false,
    mode: "day",
    sheet: null,
    returnTo: null
  };
  var bedtime = {
    start: "19:30",
    winddown: 15,
    autoSwitch: true
  };
  function bedtimeLabel(hhmm) {
    var p = String(hhmm || "").split(":");
    var h = Number(p[0]);
    var m = Number(p[1]);
    if (isNaN(h) || isNaN(m)) {
      return "";
    }
    var ap = h < 12 ? "am" : "pm";
    var h12 = h % 12;
    if (h12 === 0) {
      h12 = 12;
    }
    return h12 + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  }
  function minutesOf(hhmm) {
    var p = String(hhmm || "").split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function isPastBedtime() {
    var now = new Date;
    return now.getHours() * 60 + now.getMinutes() >= minutesOf(bedtime.start);
  }
  function suggestedMode() {
    return bedtime.autoSwitch && isPastBedtime() ? "night" : "day";
  }
  function kidsStep(name) {
    [ "Who", "Book", "Browse", "Wishlist", "Badges", "Messages", "Log", "Done" ].forEach(function(s) {
      $("kidsStep" + s).hidden = s !== name;
    });
    var night = kids.mode === "night";
    var tabbed = !night && (name === "Book" || name === "Browse" || name === "Wishlist" || name === "Badges" || name === "Messages");
    $("kidsBack").hidden = !(name === "Log" || name === "Book" && children.length > 1 || name === "Badges" && night);
    var showBadgeBtn = night && name === "Book" && !!kids.who;
    $("kidsBadgesBtn").hidden = !showBadgeBtn;
    if (showBadgeBtn) {
      var mini = $("kidsBadgesBtn").querySelector(".kb-open-flame");
      if (!mini.firstChild) {
        mini.innerHTML = flameSvg();
      }
      var run = streakFor(kids.who);
      mini.classList.toggle("is-out", run === 0);
      calmFlames(mini, run === 0);
      $("kidsBadgesBtnN").textContent = String(run);
      $("kidsBadgesBtnU").textContent = run === 1 ? "night in a row" : "nights in a row";
    }
    $("kidsTabs").hidden = !tabbed;
    $("kids").classList.toggle("kids--tabbed", tabbed);
    if (tabbed) {
      var tabName = name === "Book" ? "book" : name.toLowerCase();
      [].forEach.call($("kidsTabs").querySelectorAll("[data-ktab]"), function(btn) {
        btn.setAttribute("aria-selected", btn.getAttribute("data-ktab") === tabName ? "true" : "false");
      });
    }
    $("kidsBedBar").hidden = !(night && (name === "Book" || name === "Who"));
    if (kids.sheet) {
      closeKidsSheet();
    }
    var head = $("kidsStep" + name).querySelector("h1");
    if (head) {
      head.setAttribute("tabindex", "-1");
      head.focus();
    }
    $("kids").scrollTop = 0;
  }
  function kidsBackdrop() {
    var root = $("kids");
    var A = window.PTGAvatar, B = window.PTGBackdrop;
    var id = kids.who && A && A.chosenBackdrop ? A.chosenBackdrop(kids.who) : null;
    if (!id || !B) {
      root.removeAttribute("data-bd");
      root.removeAttribute("data-bd-ink");
      root.style.backgroundImage = "";
      if (B && B.ambient) {
        B.ambient(root, null);
      }
      return;
    }
    B.apply(root, id);
    if (kids.mode === "night") {
      root.setAttribute("data-bd-ink", "light");
    }
    if (B.ambient) {
      B.ambient(root, id);
    }
  }
  function kidsSetWho(id) {
    kids.who = id || null;
    $("kids").setAttribute("data-current-kid", kids.who || "");
    var k = child(kids.who);
    var show = !!k;
    $("kidsWho").hidden = !show;
    kidsBackdrop();
    if (show) {
      if (window.PTGAvatar) {
        $("kidsWhoAv").innerHTML = window.PTGAvatar.svg(window.PTGAvatar.get(k.id).avatar, k.name, 38);
        $("kidsWhoAv").style.background = window.PTGAvatar.get(k.id).avatar.bg || k.colour;
      } else {
        $("kidsWhoAv").textContent = initial(k.name);
        $("kidsWhoAv").style.background = k.colour;
      }
      $("kidsWhoName").textContent = k.name;
    }
  }
  function renderKidsWho() {
    $("kidsWhoList").innerHTML = children.map(function(k) {
      return '<button type="button" data-kid="' + esc(k.id) + '">' + kidAvatar(k, "av") + '<span class="nm">' + esc(k.name) + "</span>" + "</button>";
    }).join("");
  }
  function kidsBooks() {
    var pool = books.filter(function(b) {
      if (b.status === "read") {
        return false;
      }
      if (kids.who && b.who && b.who.length && b.who.indexOf(kids.who) === -1) {
        return false;
      }
      return true;
    });
    pool.sort(function(a, b) {
      var ra = a.status === "reading" ? 0 : 1;
      var rb = b.status === "reading" ? 0 : 1;
      return ra - rb;
    });
    return pool;
  }
  function kidsCoverHtml(b) {
    var p = pct(b);
    var ink = inkOn(b.spine || "#0A6280");
    var img = b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" onerror="this.remove()">' : "";
    return '<span class="kids-cover" style="--spine:' + esc(b.spine || "#0A6280") + ";color:" + ink + '">' + img + '<span class="ct">' + esc(b.title) + "</span>" + (p === null ? "" : '<span class="cbar"><i style="width:' + p + '%"></i></span>') + "</span>";
  }
  function renderKidsBooks() {
    var all = kidsBooks();
    var q = kidsQ("Book");
    var list = all.filter(function(b) {
      return kidsHits(b, q);
    });
    var k = child(kids.who);
    var done = {};
    sessionsToday(kids.who).forEach(function(s) {
      done[s.bookId] = true;
    });
    kidsPaintClear("Book");
    $("kidsBookHeading").textContent = k ? kids.mode === "night" ? "What did you read, " + k.name + "?" : "What are you reading, " + k.name + "?" : kids.mode === "night" ? "What did you read tonight?" : "What are you reading?";
    $("kidsBookLead").textContent = list.length ? "Tap the book." : "";
    $("kidsBookEmptyTxt").textContent = q ? "No books match “" + q + "”. Try a different word." : "There are no books on this shelf yet. Ask a grown-up to add one.";
    $("kidsBookSearchWrap").hidden = all.length === 0 && !q;
    $("kidsBookEmpty").hidden = list.length > 0;
    $("kidsBookList").hidden = list.length === 0;
    $("kidsBookList").innerHTML = list.map(function(b) {
      var p = pct(b);
      return '<button class="kids-book" type="button" data-kbook="' + esc(b.id) + '">' + kidsCoverHtml(b) + '<span class="nm">' + esc(b.title) + "</span>" + (done[b.id] ? '<span class="done">' + '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' + 'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + '<path d="M4 10.5 8 14.5 16 6"/></svg>' + (kids.mode === "night" ? "Read tonight" : "Read today") + '</span>' : '<span class="sub">' + (p ? p + "% through" : esc(b.author || "")) + "</span>") + "</button>";
    }).join("");
  }
  function kidsMatch(b) {
    return !kids.who || !b.who || !b.who.length || b.who.indexOf(kids.who) !== -1;
  }
  function kidsHits(b, q) {
    if (!q) {
      return true;
    }
    var hay = (String(b.title || "") + " " + String(b.author || "")).toLowerCase();
    return hay.indexOf(q) !== -1;
  }
  function kidsQ(which) {
    var el = $("kids" + which + "Q");
    return el ? el.value.trim().toLowerCase() : "";
  }
  function kidsPaintClear(which) {
    var btn = $("kids").querySelector('[data-kclear="' + which.toLowerCase() + '"]');
    if (btn) {
      btn.hidden = !kidsQ(which);
    }
  }
  function kidsIsWished(b) {
    return wishlist.some(function(w) {
      return w.sourceId === b.id;
    });
  }
  function demoPartnerNews() {
    return [];
  }
  function renderKidsBrowse() {
    var k = child(kids.who);
    var q = kidsQ("Browse");
    var all = books.filter(function(b) {
      return kidsMatch(b) && b.status !== "read" && b.status !== "reading";
    });
    var list = all.filter(function(b) {
      return kidsHits(b, q);
    });
    kidsPaintClear("Browse");
    $("kidsBrowseHeading").textContent = k ? "Find something new, " + k.name : "Find something new";
    $("kidsBrowseEmptyTxt").textContent = q ? "Nothing matches “" + q + "”. Try a different word." : "Nothing new to find right now — check back soon!";
    $("kidsBrowseEmpty").hidden = list.length > 0;
    $("kidsBrowseList").hidden = list.length === 0;
    $("kidsBrowseList").innerHTML = list.map(function(b) {
      var wished = kidsIsWished(b);
      return '<button class="kids-book' + (wished ? " is-added" : "") + '" type="button" data-kbrowse="' + esc(b.id) + '">' + kidsCoverHtml(b) + '<span class="nm">' + esc(b.title) + "</span>" + '<span class="sub">' + (wished ? "On your wishlist" : "Tap to wishlist") + "</span>" + "</button>";
    }).join("");
  }
  function renderKidsWishlist() {
    var q = kidsQ("Wish");
    var all = wishlist.filter(kidsMatch);
    var list = all.filter(function(b) {
      return kidsHits(b, q);
    });
    kidsPaintClear("Wish");
    $("kidsWishEmptyTxt").textContent = q ? "Nothing on your wishlist matches “" + q + "”." : "Nothing on your wishlist yet. Find a book on the Browse tab.";
    $("kidsWishSearchWrap").hidden = all.length === 0 && !q;
    $("kidsWishEmpty").hidden = list.length > 0;
    $("kidsWishList").hidden = list.length === 0;
    $("kidsWishList").innerHTML = list.map(function(b) {
      return '<div class="kids-book kids-book--wish is-added">' + kidsCoverHtml(b) + '<span class="nm">' + esc(b.title) + "</span>" + '<span class="sub">' + esc(b.author || "On your wishlist") + "</span>" + '<button class="kids-book-menu" type="button" data-kwishmenu="' + esc(b.id) + '" aria-label="Options for ' + esc(b.title) + '">' + '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' + '<circle cx="10" cy="4.4" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="10" cy="15.6" r="1.6"/></svg>' + "</button>" + "</div>";
    }).join("");
  }
  function openKidsSheet(w) {
    kids.sheet = w.id;
    $("kidsSheetTitle").textContent = w.title;
    $("kidsSheetSub").textContent = w.author ? "by " + w.author : "";
    $("kidsSheet").hidden = false;
    $("kidsSheetRemove").focus();
  }
  function closeKidsSheet() {
    kids.sheet = null;
    $("kidsSheet").hidden = true;
  }
  function renderKidsMessages() {}
  function kidsToggleWish(b) {
    var k = child(kids.who);
    var existing = wishlist.filter(function(w) {
      return w.sourceId === b.id;
    })[0];
    if (existing) {
      wishlist.splice(wishlist.indexOf(existing), 1);
      renderKidsBrowse();
      renderAll();
      note((k ? k.name + " took " : "Took ") + b.title + " off the wishlist");
      return;
    }
    wishlist.unshift({
      id: uid("w"),
      sourceId: b.id,
      title: b.title,
      author: b.author,
      category: b.category,
      ages: b.ages,
      status: "toread",
      who: kids.who ? [ kids.who ] : [],
      spine: b.spine,
      cover: b.cover,
      notes: kids.mode === "night" ? "Added from bedtime mode" : "Added from the reading space",
      slot: !!b.slot
    });
    renderKidsBrowse();
    renderAll();
    note((k ? k.name + " added " : "Added ") + b.title + " to the wishlist");
  }
  function kidsRemoveWish(w) {
    var idx = wishlist.indexOf(w);
    if (idx === -1) {
      return;
    }
    wishlist.splice(idx, 1);
    renderKidsWishlist();
    renderAll();
    note(w.title + " was taken off the wishlist");
  }
  function openKidsLog(b) {
    kids.book = b;
    kids.mins = 15;
    $("kidsLogCover").innerHTML = kidsCoverHtml(b);
    $("kidsLogTitle").textContent = "How long did you read?";
    $("kidsLogSub").textContent = b.title;
    [].forEach.call($("kidsMins").querySelectorAll("[data-mins]"), function(btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-mins") === "15" ? "true" : "false");
    });
    var total = Number(b.pages) || 0;
    $("kidsPageRow").hidden = total <= 0;
    if (total > 0) {
      $("kidsPage").max = String(total);
      $("kidsPage").value = String(clampPage(Number(b.page) || 0, total));
      $("kidsPageOf").textContent = "of " + total;
    }
    kidsStep("Log");
  }
  var BADGES = [ {
    id: "s3", kind: "streak", n: 3, tier: "bronze", title: "On a roll", text: "3 nights in a row"
  }, {
    id: "s7", kind: "streak", n: 7, tier: "silver", title: "Whole week", text: "7 nights in a row"
  }, {
    id: "s14", kind: "streak", n: 14, tier: "gold", title: "Two weeks strong", text: "14 nights in a row"
  }, {
    id: "s30", kind: "streak", n: 30, tier: "gold", title: "Reading month", text: "30 nights in a row"
  }, {
    id: "f1", kind: "finished", n: 1, tier: "bronze", title: "First finish", text: "Finish a book"
  }, {
    id: "f5", kind: "finished", n: 5, tier: "silver", title: "Five finished", text: "Finish 5 books"
  }, {
    id: "f10", kind: "finished", n: 10, tier: "gold", title: "Bookworm", text: "Finish 10 books"
  }, {
    id: "m60", kind: "minutes", n: 60, tier: "bronze", title: "First hour", text: "Read for 60 minutes"
  }, {
    id: "m300", kind: "minutes", n: 300, tier: "silver", title: "Five hours", text: "Read for 5 hours"
  }, {
    id: "m1000", kind: "minutes", n: 1e3, tier: "gold", title: "Marathon reader", text: "Read for 1,000 minutes"
  } ];
  var BADGE_ICON = {
    streak: '<path d="M10 17.6c-3.2 0-5.5-2.2-5.5-5.2 0-2.6 1.7-4.3 3-5.8.4 1.3 1.2 2.3 2.1 2.7-.3-2.7.8-4.9 2.9-6.4.2 2.5 1.4 4 2.5 5.4.9 1.2 1.5 2.5 1.5 4.1 0 3-2.3 5.2-5.5 5.2Z"/>',
    finished: '<path d="M3.4 4.6a1.1 1.1 0 0 1 1.1-1.1H9v13H4.5a1.1 1.1 0 0 1-1.1-1.1Z"/><path d="M9 3.5h6.5a1.1 1.1 0 0 1 1.1 1.1V9"/><path d="m11.2 14 2.1 2.1 3.7-4.1"/>',
    minutes: '<circle cx="10" cy="11" r="6.3"/><path d="M10 7.6v3.6l2.4 1.5M8 2.6h4"/>'
  };
  function bestStreak(childId) {
    var keys = Object.keys(nightsRead(childId)).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function(k) {
      var d = new Date(k + "T12:00:00");
      run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    return best;
  }
  function badgeStats(childId) {
    return {
      now: streakFor(childId),
      streak: bestStreak(childId),
      finished: books.filter(function(x) {
        return x.status === "read" && (!childId || !x.who || !x.who.length || x.who.indexOf(childId) !== -1);
      }).length,
      minutes: sessions.reduce(function(t, s) {
        return t + (!childId || s.childId === childId ? Number(s.minutes) || 0 : 0);
      }, 0)
    };
  }
  function earnedIds(st) {
    return BADGES.filter(function(b) {
      return st[b.kind] >= b.n;
    }).map(function(b) {
      return b.id;
    });
  }
  function badgeNum(b) {
    return b.n >= 1e3 ? b.n / 1e3 + "k" : String(b.n);
  }
  function badgeFront(b) {
    return '<span class="kb-mark"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + BADGE_ICON[b.kind] + "</svg><b>" + badgeNum(b) + "</b></span>";
  }
  function badgeRing(frac) {
    var c = 2 * Math.PI * 47;
    return '<svg class="kb-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="kb-ring-track" cx="50" cy="50" r="47"/>' + '<circle class="kb-ring-arc" cx="50" cy="50" r="47" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - frac)).toFixed(1) + '"/></svg>';
  }
  var TIER_NAME = {
    bronze: "Bronze",
    silver: "Silver",
    gold: "Gold"
  };
  var BADGE_GROUPS = [ {
    kind: "streak",
    title: "Reading streaks"
  }, {
    kind: "finished",
    title: "Books finished"
  }, {
    kind: "minutes",
    title: "Time spent reading"
  } ];
  function coinFaces(tier, front, back) {
    var edge = "";
    for (var i = 0; i < 7; i++) {
      edge += '<i style="--z:' + (i - 3) + '"></i>';
    }
    return '<span class="kb-spin kb-' + tier + '">' + '<span class="kb-edge" aria-hidden="true">' + edge + "</span>" + '<span class="kb-face kb-front" aria-hidden="true">' + front + "</span>" + '<span class="kb-face kb-back" aria-hidden="true">' + back + "</span></span>";
  }
  function badgeCoin(b, st, i) {
    var got = st[b.kind] >= b.n;
    var have = Math.min(st[b.kind], b.n);
    var unit = b.kind === "streak" ? "nights" : b.kind === "finished" ? "books" : "minutes";
    var togo = b.n - have;
    var backTxt = '<span class="kb-mark">' + (got ? WL_CHECK + "<small>Earned</small>" : "<b>" + togo + "</b><small>to go</small>") + "</span>";
    var label = b.title + ", " + TIER_NAME[b.tier] + ". " + b.text + ". " + (got ? "Earned." : have + " of " + b.n + " so far.");
    var coin = coinFaces(got ? b.tier : "locked", badgeFront(b), backTxt) + (got ? "" : badgeRing(have / b.n));
    return '<div class="kb-item' + (got ? " is-got" : " is-locked") + '" style="--i:' + i + '">' + '<button type="button" class="kb-coin kb-coin--' + b.tier + '" data-kbadge="' + b.id + '" aria-pressed="false" aria-label="' + esc(label) + '">' + coin + "</button>" + '<b class="kb-name">' + esc(b.title) + "</b>" + '<span class="kb-desc">' + (got ? '<span class="kb-tier">' + TIER_NAME[b.tier] + "</span> · " + esc(b.text) : have + " of " + b.n + " " + unit) + "</span></div>";
  }
  function renderKidsBadges() {
    var k = child(kids.who);
    var st = badgeStats(kids.who);
    var got = earnedIds(st).length;
    var night = kids.mode === "night";
    var unit = night ? st.now === 1 ? "night" : "nights" : st.now === 1 ? "day" : "days";
    $("kidsBadgesHeading").textContent = k ? k.name + "’s badges" : "Your badges";
    $("kidsBadgesLead").textContent = got ? got + " of " + BADGES.length + " badges earned. Tap a badge to flip it." : "Read a little every night to fill your shelf. Tap a badge to see how close you are.";
    $("kidsBadgesHero").innerHTML = '<div class="fl-tile' + (st.now > 0 ? "" : " is-out") + '" aria-hidden="true">' + '<span class="fl-glow"></span>' + '<span class="fl-art">' + flameSvg() + '<i class="fl-spark"></i><i class="fl-spark"></i><i class="fl-spark"></i></span>' + '<span class="fl-count"><b>' + st.now + "</b><small>" + unit + "</small></span></div>" + '<div class="kb-hero-txt"><b>' + (st.now > 1 ? st.now + " " + unit + " in a row!" : st.now === 1 ? "Streak started!" : "Start a streak tonight") + "</b>" + "<span>" + (st.now > 0 ? "Read again " + (night ? "tomorrow night" : "tomorrow") + " to keep your flame going." : "Log a book to light your flame.") + "</span>" + '<span class="kb-hero-best">Best ever: <b>' + st.streak + "</b> in a row</span></div>";
    var seq = 0;
    $("kidsBadgesGrid").innerHTML = BADGE_GROUPS.map(function(g) {
      var mine = BADGES.filter(function(b) {
        return b.kind === g.kind;
      });
      var have = mine.filter(function(b) {
        return st[b.kind] >= b.n;
      }).length;
      return '<section class="kb-group"><h2 class="kb-group-h">' + esc(g.title) + "<span>" + have + " of " + mine.length + "</span></h2>" + '<div class="kb-row">' + mine.map(function(b) {
        return badgeCoin(b, st, seq++);
      }).join("") + "</div></section>";
    }).join("");
    calmFlames($("kidsBadgesHero"), st.now === 0);
  }
  var FLAME = {
    outer: [ "M32 61C17.5 61 9.5 51.5 9.5 40.5C9.5 30 16 23 21 16.5C21 23 24 27 28 28C26 18.5 29.5 9.5 38.5 3.5C38.5 13 43.5 19 48 25.5C52 31 54.5 36 54.5 41.5C54.5 52.5 46.5 61 32 61Z", "M32 61C17.5 61 9.5 51.5 9.5 40.5C9.5 31 15 24.5 18.5 14.5C19.5 22 23 26 27 27C25 17.5 27.5 8.5 34 2.5C36 12 42 18 47 25C52 31 54.5 36 54.5 41.5C54.5 52.5 46.5 61 32 61Z", "M32 61C17.5 61 9.5 51.5 9.5 40.5C9.5 29.5 17 23.5 22 18C22 24 25 27 29 28C28 19 32.5 11 41.5 5C40.5 14 44.5 20 49.5 27C52 31 54.5 36 54.5 41.5C54.5 52.5 46.5 61 32 61Z" ],
    middle: [ "M32 61C23.5 61 18.5 54.5 18.5 47C18.5 41 23 36.5 26 32.5C27 37 29 39 31 39C30 33.5 32 27.5 37 24.5C38 31 41 35 43.5 39C45.5 42 46 45 46 48C46 55.5 40.5 61 32 61Z", "M32 61C23.5 61 18.5 54.5 18.5 47C18.5 40 22 35.5 25 30.5C26 35.5 28 37.5 30 38C29 31.5 31 26.5 35 22.5C37 29.5 40 34 42.5 38C45.5 42 46 45 46 48C46 55.5 40.5 61 32 61Z", "M32 61C23.5 61 18.5 54.5 18.5 47C18.5 42 24 37 27 34C28 38 30 40 32 40C31 35 34.5 29 39.5 26C39.5 32 42.5 36.5 44.5 40.5C45.5 42 46 45 46 48C46 55.5 40.5 61 32 61Z" ],
    core: [ "M32 61C27 61 24.5 57.5 24.5 53.5C24.5 49 28 46.5 30 43.5C30.5 47 32 48 33.5 48.5C33.5 46 34.5 43.5 36 42C38.5 45.5 40 48.5 40 52.5C40 57.5 37 61 32 61Z", "M32 61C27 61 24.5 57.5 24.5 53.5C24.5 48.5 27.5 45.5 29.5 42C30 45.5 31.5 47.5 33 48C33 44.5 34 42.5 35.5 40.5C38.5 44.5 40 48 40 52.5C40 57.5 37 61 32 61Z", "M32 61C27 61 24.5 57.5 24.5 53.5C24.5 49.5 28.5 47 30.5 45C31 47.5 32.5 48.5 34 49C34 46.5 35.5 44.5 37 43.5C38.5 46 40 49 40 52.5C40 57.5 37 61 32 61Z" ]
  };
  var flameSeq = 0;
  function flameSvg() {
    var n = ++flameSeq;
    var SPLINE = ".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1";
    function layer(name, dur, begin) {
      var s = FLAME[name];
      return '<path class="fl-' + name + '" fill="url(#fl-' + name + "-" + n + ')" d="' + s[0] + '">' + '<animate attributeName="d" dur="' + dur + '" begin="' + begin + '" repeatCount="indefinite" calcMode="spline" keyTimes="0;.25;.5;.75;1" keySplines="' + SPLINE + '" values="' + [ s[0], s[1], s[0], s[2], s[0] ].join(";") + '"/></path>';
    }
    function grad(name) {
      return '<linearGradient id="fl-' + name + "-" + n + '" x1="0" y1="0" x2="0" y2="1">' + '<stop offset="0" class="fl-' + name + '-top"/><stop offset="1" class="fl-' + name + '-bot"/></linearGradient>';
    }
    return '<svg class="fl-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>' + grad("outer") + grad("middle") + grad("core") + "</defs>" + layer("outer", "1.9s", "0s") + layer("middle", "1.45s", "-.4s") + layer("core", "1.1s", "-.2s") + "</svg>";
  }
  function calmFlames(box, out) {
    var calm = reduced.matches || document.documentElement.classList.contains("ptg-reduce");
    [].forEach.call(box.querySelectorAll(".fl-svg"), function(svg) {
      if ((calm || out) && svg.pauseAnimations) {
        svg.pauseAnimations();
      }
    });
  }
  $("kids").addEventListener("click", function(e) {
    var coin = e.target.closest ? e.target.closest("[data-kbadge]") : null;
    if (coin) {
      var on = coin.getAttribute("aria-pressed") !== "true";
      coin.setAttribute("aria-pressed", on ? "true" : "false");
      coin.classList.toggle("is-flipped", on);
      return;
    }
    if (e.target.closest && e.target.closest("#kidsBadgesBtn, #kidsDoneBadges")) {
      renderKidsBadges();
      kidsStep("Badges");
    }
  });
  function showNewBadge(before) {
    var box = $("kidsNewBadge");
    var now = earnedIds(badgeStats(kids.who));
    var fresh = BADGES.filter(function(b) {
      return now.indexOf(b.id) !== -1 && before.indexOf(b.id) === -1;
    });
    if (!fresh.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    var b = fresh[fresh.length - 1];
    box.innerHTML = '<span class="kb-new-coin" aria-hidden="true">' + coinFaces(b.tier, badgeFront(b), "<b>Yay!</b>") + "</span>" + '<span class="kb-new-txt"><small>New badge' + (fresh.length > 1 ? "s" : "") + "!</small><b>" + esc(b.title) + "</b><span>" + esc(b.text) + (fresh.length > 1 ? " · and " + (fresh.length - 1) + " more" : "") + "</span></span>";
    box.hidden = false;
  }
  function kidsSave(finished) {
    var b = kids.book;
    if (!b) {
      return;
    }
    var hadBadges = earnedIds(badgeStats(kids.who));
    var page = $("kidsPageRow").hidden ? null : $("kidsPage").value;
    logSession(b, kids.who, kids.mins, page);
    if (finished) {
      b.status = "read";
      stampStatus(b, "read");
      if (Number(b.pages) > 0) {
        b.page = Number(b.pages);
      }
    }
    var k = child(kids.who);
    var run = streakFor(kids.who);
    var mine = sessionsToday(kids.who);
    var mins = mine.reduce(function(t, s) {
      return t + (Number(s.minutes) || 0);
    }, 0);
    $("kidsStreak").textContent = String(run);
    var night = kids.mode === "night";
    var unit = night ? run === 1 ? "night" : "nights" : run === 1 ? "day" : "days";
    $("kidsStreakUnit").textContent = unit;
    $("kidsStepDone").classList.toggle("is-finished", !!finished);
    $("kidsDoneTitle").textContent = finished ? "You finished it!" : run > 1 ? run + " " + unit + " in a row!" : "Well read!";
    $("kidsDoneSub").textContent = finished ? b.title + " is done. That one goes on the finished shelf." : k ? k.name + ", that is " + kids.mins + " minutes logged." : "That is " + kids.mins + " minutes logged.";
    var doneCount = books.filter(function(x) {
      return x.status === "read" && (!kids.who || !x.who || !x.who.length || x.who.indexOf(kids.who) !== -1);
    }).length;
    $("kidsTally").innerHTML = "<div><b>" + mins + "</b><span>minutes " + (night ? "tonight" : "today") + "</span></div>" + "<div><b>" + mine.length + "</b><span>" + (mine.length === 1 ? "book" : "books") + " " + (night ? "tonight" : "today") + "</span></div>" + "<div><b>" + doneCount + "</b><span>finished all up</span></div>";
    showNewBadge(hadBadges);
    note((k ? k.name + " read " : "Read ") + b.title + " for " + kids.mins + " minutes");
    kidsStep("Done");
  }
  function paintBedtime() {
    if (!$("setBedStart")) {
      return;
    }
    $("setBedStart").value = bedtime.start;
    $("setBedWind").value = String(bedtime.winddown);
    $("setBedAuto").checked = !!bedtime.autoSwitch;
    $("setBedSummary").textContent = bedtime.autoSwitch ? "Bedtime mode takes over from " + bedtimeLabel(bedtime.start) + ". Before then, tapping a child's profile opens their daytime reading space." : "Bedtime mode only opens when someone taps it. Profiles always open the daytime reading space.";
    if ($("kidsBedAt")) {
      $("kidsBedAt").textContent = bedtimeLabel(bedtime.start);
    }
  }
  function wireBedtime() {
    if (!$("setBedStart")) {
      return;
    }
    $("setBedStart").addEventListener("change", function() {
      if (!this.value) {
        this.value = bedtime.start;
        return;
      }
      bedtime.start = this.value;
      paintBedtime();
      renderAll();
      say("Bedtime set to " + bedtimeLabel(bedtime.start));
    });
    $("setBedWind").addEventListener("change", function() {
      bedtime.winddown = Number(this.value) || 0;
      paintBedtime();
      renderAll();
    });
    $("setBedAuto").addEventListener("change", function() {
      bedtime.autoSwitch = this.checked;
      paintBedtime();
      renderAll();
      say(bedtime.autoSwitch ? "Bedtime mode will start itself at " + bedtimeLabel(bedtime.start) : "Bedtime mode will only open when you tap it");
    });
  }
  wireBedtime();
  paintBedtime();
  function applyKidsMode() {
    var night = kids.mode === "night";
    var root = $("kids");
    root.classList.toggle("kids--night", night);
    root.classList.toggle("kids--day", !night);
    kidsBackdrop();
    $("kidsExitLong").textContent = night ? " bedtime mode" : " reading space";
    $("kidsBedAt").textContent = bedtimeLabel(bedtime.start);
    $("kidsStepWho").querySelector("h1").textContent = night ? "Who is reading tonight?" : "Who is reading?";
    $("kidsBookHeading").textContent = night ? "What did you read tonight?" : "What are you reading?";
    $("kidsSave").textContent = night ? "We read it tonight" : "Save my reading";
    $("kidsFinish").textContent = night ? "We finished the whole book" : "I finished the whole book";
    $("kidsDoneExit").textContent = night ? "All done for tonight" : "All done for now";
    $("kidsDoneSub").textContent = night ? "Logged for tonight." : "Logged for today.";
  }
  function kidsClearSearches() {
    [ "kidsBookQ", "kidsBrowseQ", "kidsWishQ" ].forEach(function(id) {
      if ($(id)) {
        $(id).value = "";
      }
    });
    [ "Book", "Browse", "Wish" ].forEach(kidsPaintClear);
  }
  function openKids(childId, mode) {
    kids.open = true;
    kids.mode = mode === "night" ? "night" : "day";
    kids.returnTo = document.activeElement;
    kids.who = null;
    kids.book = null;
    kidsClearSearches();
    closeKidsSheet();
    closeKidsGate();
    var preset = childId && child(childId) ? childId : state.who !== "all" && child(state.who) ? state.who : null;
    if (preset) {
      kidsSetWho(preset);
    } else {
      kidsSetWho(null);
    }
    applyKidsMode();
    $("kids").hidden = false;
    document.documentElement.style.overflow = "hidden";
    if (!kids.who && children.length > 1) {
      renderKidsWho();
      kidsStep("Who");
    } else {
      if (!kids.who && children.length === 1) {
        kidsSetWho(children[0].id);
      }
      renderKidsBooks();
      kidsStep("Book");
    }
  }
  function closeKids() {
    kids.open = false;
    closeKidsGate();
    closeKidsSheet();
    kidsClearSearches();
    if (window.PTGKidChat && window.PTGKidChat.close) {
      window.PTGKidChat.close();
    }
    $("kids").hidden = true;
    document.documentElement.style.overflow = "";
    renderAll();
    if (kids.returnTo && kids.returnTo.focus) {
      kids.returnTo.focus();
    }
    kids.returnTo = null;
  }
  $("kidsOpenBtn").addEventListener("click", function() {
    setMenu(false);
    openKids(null, "night");
  });
  $("kidsOpenDash").addEventListener("click", function() {
    openKids(null, "night");
  });
  var kidsGateAnswer = null;
  var kidsGateThen = null;
  function openKidsGate(then) {
    var a = 3 + Math.floor(Math.random() * 6);
    var b = 2 + Math.floor(Math.random() * 6);
    kidsGateAnswer = a + b;
    kidsGateThen = then;
    $("kidsGateSum").textContent = a + " + " + b + " = ?";
    $("kidsGateA").value = "";
    $("kidsGateErr").hidden = true;
    $("kidsGate").hidden = false;
    $("kidsGateA").focus();
  }
  function closeKidsGate() {
    $("kidsGate").hidden = true;
    kidsGateThen = null;
    kidsGateAnswer = null;
  }
  function tryKidsGate() {
    var v = Number($("kidsGateA").value);
    if (v === kidsGateAnswer) {
      var then = kidsGateThen;
      closeKidsGate();
      if (then) {
        then();
      }
      return;
    }
    $("kidsGateErr").hidden = false;
    $("kidsGateA").value = "";
    $("kidsGateA").focus();
  }
  $("kidsGateGo").addEventListener("click", tryKidsGate);
  $("kidsGateCancel").addEventListener("click", closeKidsGate);
  $("kidsGateA").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      tryKidsGate();
    }
  });
  $("kidsGate").addEventListener("click", function(e) {
    if (e.target === $("kidsGate")) {
      closeKidsGate();
    }
  });
  $("kidsBedSet").addEventListener("click", function() {
    openKidsGate(function() {
      closeKids();
      goTab("settings");
      openSetSection("set-bedtime", "parent");
    });
  });
  $("kidsWho").addEventListener("click", function() {
    var k = child(kids.who);
    if (k && window.PTGStudio) {
      window.PTGStudio.open(k.id, k.name, k.colour);
    }
  });
  document.addEventListener("ptg:look", function() {
    renderKidsWho();
    kidsSetWho(kids.who);
    renderAll();
  });
  $("kidsExit").addEventListener("click", closeKids);
  $("kidsDoneExit").addEventListener("click", closeKids);
  $("kidsBack").addEventListener("click", function() {
    if (!$("kidsStepLog").hidden || !$("kidsStepBadges").hidden) {
      renderKidsBooks();
      kidsStep("Book");
      return;
    }
    if (!$("kidsStepBook").hidden && children.length > 1) {
      renderKidsWho();
      kidsStep("Who");
    }
  });
  $("kidsAgain").addEventListener("click", function() {
    kids.book = null;
    renderKidsBooks();
    kidsStep("Book");
  });
  $("kids").addEventListener("click", function(e) {
    var hit = e.target.closest ? e.target.closest("[data-ktab]") : null;
    if (hit) {
      var tab = hit.getAttribute("data-ktab");
      if (tab === "book") {
        renderKidsBooks();
        kidsStep("Book");
      } else if (tab === "browse") {
        renderKidsBrowse();
        kidsStep("Browse");
      } else if (tab === "wishlist") {
        renderKidsWishlist();
        kidsStep("Wishlist");
      } else if (tab === "messages") {
        renderKidsMessages();
        kidsStep("Messages");
      } else if (tab === "badges") {
        renderKidsBadges();
        kidsStep("Badges");
      }
      return;
    }
    hit = e.target.closest ? e.target.closest("[data-kid]") : null;
    if (hit) {
      kidsSetWho(hit.getAttribute("data-kid"));
      renderKidsBooks();
      kidsStep("Book");
      return;
    }
    hit = e.target.closest ? e.target.closest("[data-kbook]") : null;
    if (hit) {
      var b = byId(books, hit.getAttribute("data-kbook"));
      if (b) {
        openKidsLog(b);
      }
      return;
    }
    hit = e.target.closest ? e.target.closest("[data-kbrowse]") : null;
    if (hit) {
      var bb = byId(books, hit.getAttribute("data-kbrowse"));
      if (bb) {
        kidsToggleWish(bb);
      }
      return;
    }
    hit = e.target.closest ? e.target.closest("[data-kwishmenu]") : null;
    if (hit) {
      var wb = byId(wishlist, hit.getAttribute("data-kwishmenu"));
      if (wb) {
        openKidsSheet(wb);
      }
      return;
    }
    hit = e.target.closest ? e.target.closest("[data-kclear]") : null;
    if (hit) {
      var which = hit.getAttribute("data-kclear");
      var box = $("kids" + which.charAt(0).toUpperCase() + which.slice(1) + "Q");
      if (box) {
        box.value = "";
        box.focus();
      }
      if (which === "book") {
        renderKidsBooks();
      } else if (which === "browse") {
        renderKidsBrowse();
      } else {
        renderKidsWishlist();
      }
      return;
    }
    hit = e.target.closest ? e.target.closest("[data-mins]") : null;
    if (hit) {
      kids.mins = Number(hit.getAttribute("data-mins")) || 15;
      [].forEach.call($("kidsMins").querySelectorAll("[data-mins]"), function(btn) {
        btn.setAttribute("aria-pressed", btn === hit ? "true" : "false");
      });
    }
  });
  $("kidsBookQ").addEventListener("input", renderKidsBooks);
  $("kidsBrowseQ").addEventListener("input", renderKidsBrowse);
  $("kidsWishQ").addEventListener("input", renderKidsWishlist);
  [ "kidsBookQ", "kidsBrowseQ", "kidsWishQ" ].forEach(function(id) {
    $(id).addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.blur();
      } else if (e.key === "Escape" && this.value) {
        e.preventDefault();
        e.stopPropagation();
        this.value = "";
        this.dispatchEvent(new Event("input"));
      }
    });
  });
  $("kidsSheetCancel").addEventListener("click", closeKidsSheet);
  $("kidsSheet").addEventListener("click", function(e) {
    if (e.target === $("kidsSheet")) {
      closeKidsSheet();
    }
  });
  $("kidsSheetRemove").addEventListener("click", function() {
    var w = byId(wishlist, kids.sheet);
    closeKidsSheet();
    if (w) {
      kidsRemoveWish(w);
    }
  });
  $("kidsMsgAdult").addEventListener("click", function() {
    var k = child(kids.who);
    if (k && window.PTGKidChat) {
      window.PTGKidChat.open(k.id, k.name, {
        asKid: true
      });
    }
  });
  $("kidsSave").addEventListener("click", function() {
    kidsSave(false);
  });
  $("kidsFinish").addEventListener("click", function() {
    kidsSave(true);
  });
  document.addEventListener("keydown", function(e) {
    if (!kids.open) {
      return;
    }
    var kc = document.getElementById("kidChat");
    if (kc && !kc.hidden) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (!$("kidsGate").hidden) {
        closeKidsGate();
        return;
      }
      if (kids.sheet) {
        closeKidsSheet();
        return;
      }
      closeKids();
      return;
    }
    if (e.key !== "Tab") {
      return;
    }
    if (!$("kidsGate").hidden) {
      var gf = [].filter.call($("kidsGate").querySelectorAll("button, input"), function(el) {
        return el.offsetParent !== null;
      });
      if (!gf.length) {
        return;
      }
      var gFirst = gf[0], gLast = gf[gf.length - 1];
      if (e.shiftKey && document.activeElement === gFirst) {
        e.preventDefault();
        gLast.focus();
      } else if (!e.shiftKey && document.activeElement === gLast) {
        e.preventDefault();
        gFirst.focus();
      }
      return;
    }
    var trapIn = kids.sheet && !$("kidsSheet").hidden ? $("kidsSheet") : $("kids");
    var live = [].filter.call(trapIn.querySelectorAll("button, input"), function(el) {
      return el.offsetParent !== null;
    });
    if (!live.length) {
      return;
    }
    var first = live[0], last = live[live.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("hashchange", function() {
    if (kids.open) {
      closeKids();
    }
  });
  function paintThemeSeg() {
    var now = window.PTGTheme ? window.PTGTheme.get() : "auto";
    [].forEach.call($("themeSeg").querySelectorAll("[data-theme-set]"), function(btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-set") === now ? "true" : "false");
    });
  }
  $("themeSeg").addEventListener("click", function(e) {
    var hit = e.target.closest ? e.target.closest("[data-theme-set]") : null;
    if (!hit || !window.PTGTheme) {
      return;
    }
    var v = window.PTGTheme.set(hit.getAttribute("data-theme-set"));
    paintThemeSeg();
    say(v === "auto" ? "Appearance follows your device" : "Appearance set to " + v);
  });
  paintThemeSeg();
  var shelves = {};
  var current = null;
  function emptyShelf(name) {
    return {
      parent: {
        name: name || "there",
        email: "",
        colour: "#0D3B32"
      },
      children: [],
      books: [],
      wishlist: [],
      sessions: [],
      activity: [ {
        text: "Account created. Add a reading profile to begin.",
        at: Date.now()
      } ]
    };
  }
  function demoShelf() {
    return {
      parent: {
        name: "Sarah",
        email: "",
        colour: "#0D3B32"
      },
      children: demoChildren(),
      books: demoBooks(),
      wishlist: demoWishlist(),
      sessions: demoSessions(),
      activity: [ {
        text: "Shelf set up with six books for Harry and Leo",
        at: Date.now()
      } ]
    };
  }
  function install(shelf) {
    parent = shelf.parent;
    children = shelf.children;
    books = shelf.books;
    wishlist = shelf.wishlist;
    sessions = shelf.sessions;
    activity = shelf.activity;
    bedtime = {
      start: shelf.bedtime && shelf.bedtime.start ? shelf.bedtime.start : "19:30",
      winddown: shelf.bedtime && shelf.bedtime.winddown != null ? shelf.bedtime.winddown : 15,
      autoSwitch: !shelf.bedtime || shelf.bedtime.autoSwitch !== false
    };
    paintBedtime();
  }
  function capture() {
    return {
      parent: parent,
      children: children,
      books: books,
      wishlist: wishlist,
      sessions: sessions,
      activity: activity,
      bedtime: bedtime
    };
  }
  function resetView() {
    state.who = "all";
    state.q = "";
    state.cat = "";
    state.age = "";
    state.status = "";
    state.sort = "added";
    state.editing = null;
    state.editingList = null;
    state.editingChild = null;
    if ($("appSearch")) {
      $("appSearch").value = "";
    }
    if ($("fCat")) {
      $("fCat").value = "";
    }
    if ($("fAge")) {
      $("fAge").value = "";
    }
    if ($("fStatus")) {
      $("fStatus").value = "";
    }
    if ($("fSort")) {
      $("fSort").value = "added";
    }
    state.rCat = "";
    state.rAge = "";
    if ($("rCat")) {
      $("rCat").value = "";
    }
    if ($("rAge")) {
      $("rAge").value = "";
    }
  }
  function loadShelf(email, opts) {
    opts = opts || {};
    var key = String(email || "").trim().toLowerCase() || "guest";
    if (current && current !== key) {
      shelves[current] = capture();
    }
    var fresh = !shelves[key];
    if (fresh) {
      shelves[key] = opts.demo ? demoShelf() : emptyShelf(opts.name);
    }
    current = key;
    install(shelves[key]);
    parent.email = String(email || "");
    if (fresh) {
      if (opts.name) {
        parent.name = String(opts.name).trim();
      } else if (!(opts.demo && /^demo@/i.test(key))) {
        var local = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
        if (local) {
          parent.name = local.replace(/\S+/g, function(w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
          });
        }
      } else if (parent.name) {
        // The demo shelf keeps its own parent's name; make the account agree so the
        // avatar letter and the Settings name field match the greeting.
        if (window.PTGAccounts) {
          window.PTGAccounts.setName(email, parent.name);
        }
        if (window.PTGSession && window.PTGSession.email().toLowerCase() === key) {
          window.PTGSession.rename(parent.name);
        }
      }
    }
    resetView();
    if (started) {
      renderAll();
    }
  }
  var SHARE_KEY = "ptg-wishlist-share-v1";
  var shareDialog = $("shareDialog");
  var shareTrigger = null;
  function shareRead() {
    var v;
    try {
      v = JSON.parse(window.localStorage.getItem(SHARE_KEY));
    } catch (e) {
      v = null;
    }
    if (!v || typeof v !== "object") {
      v = {};
    }
    if (!v.byToken || typeof v.byToken !== "object") {
      v.byToken = {};
    }
    if (!v.byOwner || typeof v.byOwner !== "object") {
      v.byOwner = {};
    }
    return v;
  }
  function shareWrite(store) {
    try {
      window.localStorage.setItem(SHARE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      return false;
    }
  }
  function shareOwner() {
    return String(parent.email || "").trim().toLowerCase() || "guest";
  }
  function shareMakeToken() {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "", i;
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new Uint8Array(14);
      window.crypto.getRandomValues(arr);
      for (i = 0; i < 14; i++) {
        out += abc.charAt(arr[i] % abc.length);
      }
    } else {
      for (i = 0; i < 14; i++) {
        out += abc.charAt(Math.floor(Math.random() * abc.length));
      }
    }
    return out;
  }
  function shareUrl(token) {
    return String(window.location.href).split("#")[0] + "#wishlist/" + token;
  }
  function shareExpiresAt(created, expiry) {
    if (expiry === "7") {
      return created + 7 * 864e5;
    }
    if (expiry === "30") {
      return created + 30 * 864e5;
    }
    return null;
  }
  function shareLongDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }
  function shareSnapshot(hideNames) {
    return wishlist.map(function(b) {
      var c = cat(b.category);
      var names = [];
      (b.who || []).forEach(function(id) {
        var k = child(id);
        if (k) {
          names.push(hideNames ? initial(k.name) + "." : k.name);
        }
      });
      return {
        title: b.title,
        author: b.author || "",
        catName: c ? c.name : "",
        ages: b.ages || "",
        spine: b.spine || "#2F6E86",
        forNames: names
      };
    });
  }
  function shareCurrent() {
    var store = shareRead();
    var tok = store.byOwner[shareOwner()];
    return tok && store.byToken[tok] ? store.byToken[tok] : null;
  }
  function shareSave(rec) {
    var store = shareRead();
    store.byToken[rec.token] = rec;
    store.byOwner[rec.owner] = rec.token;
    return shareWrite(store);
  }
  function shareSync() {
    var rec = shareCurrent();
    if (!rec) {
      return;
    }
    var items = shareSnapshot(!!rec.initials);
    var name = parent.name || "";
    if (name === rec.ownerName && JSON.stringify(items) === JSON.stringify(rec.items)) {
      return;
    }
    rec.items = items;
    rec.ownerName = name;
    rec.updated = Date.now();
    shareSave(rec);
  }
  function shareEnsure() {
    var rec = shareCurrent();
    if (rec) {
      return rec;
    }
    var created = Date.now();
    rec = {
      token: shareMakeToken(),
      owner: shareOwner(),
      ownerName: parent.name || "",
      scope: "link",
      initials: false,
      expiry: "30",
      created: created,
      expires: shareExpiresAt(created, "30"),
      updated: created,
      items: shareSnapshot(false)
    };
    shareSave(rec);
    return rec;
  }
  function shareStop() {
    var store = shareRead();
    var owner = shareOwner();
    var tok = store.byOwner[owner];
    if (!tok) {
      return;
    }
    delete store.byToken[tok];
    delete store.byOwner[owner];
    shareWrite(store);
  }
  function shareRow() {
    var btn = $("shareWishTop");
    if (!btn) {
      return;
    }
    btn.hidden = !wishlist.length;
    var lbl = $("shareWishLabel");
    if (lbl) {
      lbl.textContent = shareCurrent() ? "Sharing settings" : "Share this wishlist";
    }
  }
  function shareSaid(msg) {
    var el = $("shareSaid");
    if (!el) {
      return;
    }
    el.textContent = "";
    window.setTimeout(function() {
      el.textContent = msg;
    }, 60);
  }
  function sharePaint(rec) {
    var n = rec.items.length;
    $("shareLink").value = shareUrl(rec.token);
    $("shareScopeNote").hidden = rec.scope !== "invite";
    $("shareCreated").textContent = shareLongDate(rec.created) + ".";
    $("shareExpiryNote").textContent = rec.expires ? "This link stops working on " + shareLongDate(rec.expires) + "." : "This link keeps working until you turn sharing off.";
  }
  function shareOpen() {
    var rec = shareEnsure();
    rec.items = shareSnapshot(!!rec.initials);
    rec.ownerName = parent.name || "";
    var saved = shareSave(rec);
    $("shareScopeLink").checked = rec.scope !== "invite";
    $("shareScopeInvite").checked = rec.scope === "invite";
    $("shareInitials").checked = !!rec.initials;
    $("shareExpiry").value = rec.expiry;
    $("shareSaid").textContent = "";
    sharePaint(rec);
    shareRow();
    if (!saved) {
      shareSaid("This browser is blocking local storage, so this link will not open " + "for anyone. Turn storage on for this site and try again.");
    }
    shareTrigger = $("shareWishTop");
    openDialog(shareDialog);
    window.setTimeout(function() {
      var link = $("shareLink");
      link.focus();
      link.select();
    }, 40);
  }
  function shareRestoreFocus() {
    var t = shareTrigger;
    shareTrigger = null;
    if (t && t.focus) {
      try {
        t.focus();
      } catch (e) {}
    }
  }
  function shareChanged(msg) {
    var rec = shareEnsure();
    var expiry = $("shareExpiry").value;
    rec.scope = $("shareScopeInvite").checked ? "invite" : "link";
    rec.initials = !!$("shareInitials").checked;
    if (expiry !== rec.expiry) {
      rec.expiry = expiry;
      rec.expires = shareExpiresAt(rec.created, expiry);
    }
    rec.items = shareSnapshot(rec.initials);
    rec.updated = Date.now();
    var ok = shareSave(rec);
    sharePaint(rec);
    if (!ok) {
      shareSaid("That change could not be saved — this browser is blocking local storage.");
    } else if (msg) {
      shareSaid(msg);
    }
  }
  function shareText() {
    var who = parent.name ? parent.name + "’s" : "Our";
    return who + " family wishlist — books we are hoping to read.";
  }
  function shareIntent(key, url, text) {
    var u = encodeURIComponent(url);
    var t = encodeURIComponent(text);
    switch (key) {
     case "whatsapp":
      return "https://wa.me/?text=" + encodeURIComponent(text + " " + url);

     case "telegram":
      return "https://t.me/share/url?url=" + u + "&text=" + t;

     case "facebook":
      return "https://www.facebook.com/sharer/sharer.php?u=" + u;

     case "x":
      return "https://twitter.com/intent/tweet?url=" + u + "&text=" + t;

     case "reddit":
      return "https://www.reddit.com/submit?url=" + u + "&title=" + t;

     case "pinterest":
      return "https://pinterest.com/pin/create/button/?url=" + u + "&description=" + t;

     case "gmail":
      return "https://mail.google.com/mail/?view=cm&fs=1&su=" + t + "&body=" + u;

     case "email":
      return "mailto:?subject=" + t + "&body=" + encodeURIComponent(text + "\n\n" + url);

     case "messenger":
      return "sms:?&body=" + encodeURIComponent(text + " " + url);

     default:
      return "";
    }
  }
  function shareNative(url, text) {
    if (!navigator.share) {
      return false;
    }
    try {
      navigator.share({
        title: "Family wishlist",
        text: text,
        url: url
      })["catch"](function() {});
      return true;
    } catch (e) {
      return false;
    }
  }
  function shareTo(key) {
    var rec = shareCurrent();
    if (!rec) {
      return;
    }
    var url = shareUrl(rec.token);
    var text = shareText();
    if (key === "native") {
      if (shareNative(url, text)) {
        return;
      }
      shareCopy();
      shareSaid("This browser has no share sheet, so the link is copied instead.");
      return;
    }
    if (key === "instagram") {
      if (shareNative(url, text)) {
        return;
      }
      shareCopy();
      shareSaid("Instagram has no link sharing on the web, so the link is copied — " + "paste it into a story or a direct message.");
      return;
    }
    var to = shareIntent(key, url, text);
    if (!to) {
      return;
    }
    if (to.indexOf("mailto:") === 0 || to.indexOf("sms:") === 0) {
      window.location.href = to;
    } else {
      window.open(to, "_blank", "noopener,noreferrer");
    }
    shareSaid("Opened in a new tab with the link filled in. You still press send.");
  }
  function shareCopy() {
    var input = $("shareLink");
    input.focus();
    input.select();
    var ok = function() {
      shareSaid("Link copied. Paste it into a message to whoever you want to share it with.");
    };
    var no = function() {
      var worked = false;
      try {
        worked = document.execCommand("copy");
      } catch (e) {}
      if (worked) {
        ok();
      } else {
        shareSaid("Could not copy for you — the link is selected, so press Ctrl+C or Cmd+C.");
      }
    };
    if (window.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(ok, no);
    } else {
      no();
    }
  }
  if (shareDialog) {
    $("shareWishTop").addEventListener("click", shareOpen);
    $("shareCopy").addEventListener("click", shareCopy);
    shareDialog.addEventListener("click", function(e) {
      var hit = e.target.closest ? e.target.closest("[data-share-to]") : null;
      if (hit) {
        shareTo(hit.getAttribute("data-share-to"));
      }
    });
    $("shareScopeLink").addEventListener("change", function() {
      shareChanged("Anyone with the link can open this wishlist.");
    });
    $("shareScopeInvite").addEventListener("change", function() {
      shareChanged("Marked as invited people only. Read the note below it.");
    });
    $("shareInitials").addEventListener("change", function() {
      shareChanged($("shareInitials").checked ? "Names removed. The shared copy now shows initials only." : "First names are shown on the shared copy again.");
    });
    $("shareExpiry").addEventListener("change", function() {
      shareChanged("Expiry updated.");
    });
    $("shareStop").addEventListener("click", function() {
      shareStop();
      closeDialog(shareDialog);
      shareRestoreFocus();
      shareRow();
      say("Sharing turned off. That link no longer opens anything.");
    });
    shareDialog.addEventListener("close", shareRestoreFocus);
    shareDialog.addEventListener("click", function(e) {
      if (e.target.closest && e.target.closest("[data-close]")) {
        window.setTimeout(shareRestoreFocus, 0);
      }
    });
    document.addEventListener("keydown", function(e) {
      if (!shareDialog.hasAttribute("open")) {
        return;
      }
      if (typeof shareDialog.showModal === "function") {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog(shareDialog);
        shareRestoreFocus();
        return;
      }
      if (e.key !== "Tab") {
        return;
      }
      var f = shareDialog.querySelectorAll("a[href], button:not([disabled]), " + "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), " + '[tabindex]:not([tabindex="-1"])');
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
  window.PTGApp = {
    open: function(hash) {
      var name = String(hash || "").replace(/^#/, "").toLowerCase().split("/")[0];
      if (!started) {
        started = true;
        renderAll();
      }
      if (name === "settings" && state.tab === "settings" && !$("panel-settings").hidden) {
        return;
      }
      if (name === "app" || !name) {
        name = "dashboard";
      }
      if (TABS.indexOf(name) === -1) {
        return;
      }
      goTab(name, {
        keepScroll: true
      });
    },
    loadShelf: loadShelf,
    loggedToday: function() {
      var key = dateKey(new Date);
      for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].date === key) {
          return true;
        }
      }
      return false;
    },
    shelfSummary: function(email) {
      var key = String(email || "").trim().toLowerCase();
      if (current && key === current) {
        return {
          children: children.length,
          books: books.length,
          wishlist: wishlist.length,
          sessions: sessions.length
        };
      }
      var s = shelves[key];
      if (!s) {
        return {
          children: 0,
          books: 0,
          wishlist: 0,
          sessions: 0
        };
      }
      return {
        children: s.children.length,
        books: s.books.length,
        wishlist: s.wishlist.length,
        sessions: s.sessions.length
      };
    },
    setParent: function(email, name) {
      if (!email) {
        return;
      }
      loadShelf(email, {
        name: name
      });
    },
    setDisplayName: function(name) {
      var n = String(name || "").trim();
      parent.name = n || "there";
      if (started) {
        renderGreeting();
        renderWhoChips();
      }
      return parent.name;
    },
    setColour: function(hex) {
      if (!/^#[0-9a-f]{6}$/i.test(String(hex || ""))) {
        return parent.colour;
      }
      parent.colour = hex;
      if (started) {
        renderGreeting();
        renderWhoChips();
      }
      return parent.colour;
    },
    parentEmail: function() {
      return parent.email || "";
    },
    data: function() {
      return {
        parent: parent,
        children: children,
        books: books,
        wishlist: wishlist,
        sessions: sessions
      };
    }
  };
})();

(function() {
  "use strict";
  var $ = function(id) {
    return document.getElementById(id);
  };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var CATEGORIES = [ {
    id: "picture",
    name: "Picture books"
  }, {
    id: "early",
    name: "Early readers"
  }, {
    id: "chapter",
    name: "Chapter books"
  }, {
    id: "nonfic",
    name: "Non-fiction"
  }, {
    id: "poetry",
    name: "Poetry & rhyme"
  }, {
    id: "graphic",
    name: "Graphic novels"
  }, {
    id: "bedtime",
    name: "Bedtime stories"
  }, {
    id: "bilingual",
    name: "Bilingual"
  } ];
  var AGE_BANDS = [ "0–3", "3–5", "5–7", "7–9", "9–12", "12+" ];
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function svg(paths, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 20 20" fill="none" ' + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' + 'stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  function initial(name) {
    return (String(name).trim().charAt(0) || "?").toUpperCase();
  }
  function kidAvatar(k, cls) {
    if (window.PTGAvatar) {
      return window.PTGAvatar.markup(k.id, k.name, k.colour, cls || "avatar");
    }
    return '<span class="' + (cls || "avatar") + '" style="background:' + esc(k.colour) + '">' + esc(initial(k.name)) + "</span>";
  }
  function catName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) {
        return CATEGORIES[i].name;
      }
    }
    return "";
  }
  function since(at) {
    if (!at) {
      return "Never";
    }
    var mins = Math.round((Date.now() - at) / 6e4);
    if (mins < 1) {
      return "Just now";
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
      return "Yesterday";
    }
    if (days < 30) {
      return days + " days ago";
    }
    return "A while ago";
  }
  function clockTime(at) {
    var d = new Date(at);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short"
    }) + " " + d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function stamp() {
    var d = new Date;
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function isHttpUrl(v) {
    return /^https?:\/\/[^\s]+$/i.test(String(v || "").trim());
  }
  var seq = 0;
  function uid(p) {
    seq++;
    return p + seq;
  }
  var submissions = [ {
    id: "sub1",
    title: "Local library storytime, Saturdays 10am",
    body: "A half-hour session for under-fives at the branch on the main street. Good for the 3–5 band and no booking needed.",
    category: "picture",
    ages: "3–5",
    link: "",
    from: "A parent",
    at: Date.now() - 36e5 * 5,
    state: "pending",
    reason: "",
    decidedBy: "",
    decidedAt: null
  }, {
    id: "sub2",
    title: "Bilingual picture books we borrowed and loved",
    body: "A short list of dual-language titles that worked well for a five-year-old reading in two languages at home.",
    category: "bilingual",
    ages: "3–5",
    link: "",
    from: "A parent",
    at: Date.now() - 36e5 * 26,
    state: "pending",
    reason: "",
    decidedBy: "",
    decidedAt: null
  }, {
    id: "sub3",
    title: "Reluctant readers: graphic novels that got us going",
    body: "Suggested for the 9–12 band after a slow year. Would suit anyone whose child says books are boring.",
    category: "graphic",
    ages: "9–12",
    link: "",
    from: "A parent",
    at: Date.now() - 36e5 * 50,
    state: "pending",
    reason: "",
    decidedBy: "",
    decidedAt: null
  }, {
    id: "sub4",
    title: "Ten-minute bedtime stories collection",
    body: "A collection that reliably lands inside the ten minutes most families have at bedtime.",
    category: "bedtime",
    ages: "0–3",
    link: "https://www.alia.org.au/region/national",
    from: "A parent",
    at: Date.now() - 36e5 * 96,
    state: "approved",
    reason: "",
    decidedBy: "seeded",
    decidedAt: Date.now() - 36e5 * 90
  } ];
  var posts = [ {
    id: "post1",
    title: "How to pick books at the right reading level",
    body: "A short guide to age bands, why they are only a starting point, and what to do when a child is ahead of or behind the band on their card.",
    category: "early",
    ages: "5–7",
    link: "https://raisingchildren.net.au/guides/activity-guides/letters-words-and-stories/reading-activities-children-2-4-years",
    state: "published",
    at: Date.now() - 36e5 * 120,
    by: "seeded"
  }, {
    id: "post2",
    title: "Reading together when you only have ten minutes",
    body: "Short, honest suggestions for families where bedtime is already tight. Ten minutes counts, and the streak matters more than the length.",
    category: "bedtime",
    ages: "3–5",
    link: "https://raisingchildren.net.au/babies/play-learning/literacy-reading-stories",
    state: "published",
    at: Date.now() - 36e5 * 200,
    by: "seeded"
  }, {
    id: "post3",
    title: "Term two reading challenge (draft)",
    body: "Outline for a challenge families can opt into next term. Still needs the stakeholder to confirm the prizes and the wording about school involvement.",
    category: "chapter",
    ages: "7–9",
    link: "",
    state: "draft",
    at: Date.now() - 36e5 * 8,
    by: "seeded"
  } ];
  var state = {
    tab: "overview",
    q: "",
    accStatus: "",
    accRole: "",
    accSort: "recent",
    modState: "pending",
    modCat: "",
    postState: "",
    postCat: "",
    postAge: "",
    logKind: "",
    editingPost: null,
    reviewing: null
  };
  var toast = $("admToast"), toastText = $("admToastText"), toastTimer = null, undoBtn = null;
  function say(message, undo) {
    toastText.textContent = message;
    if (undoBtn) {
      undoBtn.remove();
      undoBtn = null;
    }
    if (undo) {
      undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "undo";
      undoBtn.textContent = "Undo";
      undoBtn.addEventListener("click", function() {
        undo();
        hideToast();
      });
      toast.appendChild(undoBtn);
    }
    toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, undo ? 7e3 : 3600);
  }
  function hideToast() {
    window.clearTimeout(toastTimer);
    toast.classList.remove("is-on");
  }
  function me() {
    return window.PTGSession && window.PTGSession.email() || "administrator";
  }
  function log(kind, what, detail) {
    if (window.PTGAudit) {
      window.PTGAudit.write(kind, what, me(), detail);
    }
  }
  function accounts() {
    return window.PTGAccounts ? window.PTGAccounts.list() : [];
  }
  function shelfFor(email) {
    if (!window.PTGApp || !window.PTGApp.shelfSummary) {
      return {
        children: 0,
        books: 0
      };
    }
    return window.PTGApp.shelfSummary(email);
  }
  function matchesQ(haystack) {
    if (!state.q) {
      return true;
    }
    return String(haystack).toLowerCase().indexOf(state.q) !== -1;
  }
  function accountList() {
    var out = accounts().filter(function(a) {
      if (state.accStatus && a.status !== state.accStatus) {
        return false;
      }
      if (state.accRole && a.role !== state.accRole) {
        return false;
      }
      return matchesQ(a.name + " " + a.email);
    });
    out.sort(function(x, y) {
      if (state.accSort === "name") {
        return String(x.name).localeCompare(String(y.name));
      }
      if (state.accSort === "email") {
        return String(x.email).localeCompare(String(y.email));
      }
      if (state.accSort === "children") {
        return shelfFor(y.email).children - shelfFor(x.email).children;
      }
      return (y.lastSeen || y.createdAt || 0) - (x.lastSeen || x.createdAt || 0);
    });
    return out;
  }
  function submissionList() {
    return submissions.filter(function(s) {
      if (state.modState && s.state !== state.modState) {
        return false;
      }
      if (state.modCat && s.category !== state.modCat) {
        return false;
      }
      return matchesQ(s.title + " " + s.body + " " + s.from);
    }).sort(function(a, b) {
      return b.at - a.at;
    });
  }
  function postList() {
    return posts.filter(function(p) {
      if (state.postState && p.state !== state.postState) {
        return false;
      }
      if (state.postCat && p.category !== state.postCat) {
        return false;
      }
      if (state.postAge && p.ages !== state.postAge) {
        return false;
      }
      return matchesQ(p.title + " " + p.body);
    }).sort(function(a, b) {
      return b.at - a.at;
    });
  }
  function logList() {
    var all = window.PTGAudit ? window.PTGAudit.list() : [];
    return all.filter(function(e) {
      if (state.logKind && e.kind !== state.logKind) {
        return false;
      }
      return matchesQ(e.what + " " + e.who + " " + e.detail);
    });
  }
  function pendingCount() {
    return submissions.filter(function(s) {
      return s.state === "pending";
    }).length;
  }
  function suspendedCount() {
    return accounts().filter(function(a) {
      return a.status === "suspended";
    }).length;
  }
  function publishedCount() {
    return posts.filter(function(p) {
      return p.state === "published";
    }).length;
  }
  function renderCounts() {
    $("admCountAccounts").textContent = String(accounts().length);
    $("admCountPosts").textContent = String(posts.length);
    var q = pendingCount();
    var badge = $("admCountQueue");
    badge.textContent = String(q);
    badge.setAttribute("data-lit", q > 0 ? "1" : "0");
  }
  function renderGreeting() {
    var h = (new Date).getHours();
    var part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    var name = window.PTGSession && window.PTGSession.name() || "";
    $("admGreetLine").textContent = part + (name ? ", " + name : "");
    $("admGreetDate").textContent = (new Date).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    var who = me();
    $("admEmail").textContent = who;
    $("admName").textContent = name || "Administrator";
    $("admAvatar").textContent = initial(name || who);
    $("admGreetAvatar").textContent = initial(name || who);
  }
  function renderOverview() {
    var accs = accounts();
    var parents = accs.filter(function(a) {
      return a.role === "parent";
    }).length;
    var q = pendingCount(), sus = suspendedCount(), pub = publishedCount();
    var drafts = posts.length - pub;
    $("admStatAccounts").textContent = String(accs.length);
    $("admStatQueue").textContent = String(q);
    $("admStatPosts").textContent = String(pub);
    $("admStatFlags").textContent = String(sus);
    $("admStatAccountsSub").innerHTML = accs.length ? "<b>" + parents + "</b> " + (parents === 1 ? "parent account" : "parent accounts") : "No one has registered yet";
    $("admStatQueueSub").textContent = q ? "Oldest has waited " + since(oldestPending()).toLowerCase() : "Queue is clear";
    $("admStatPostsSub").innerHTML = drafts ? "<b>" + drafts + "</b> still in draft" : pub ? "Everything is published" : "Nothing written yet";
    $("admStatFlagsSub").textContent = sus ? "Sign-in is blocked for " + (sus === 1 ? "that account" : "those accounts") : "All in good standing";
    var triage = [];
    submissions.filter(function(s) {
      return s.state === "pending";
    }).sort(function(a, b) {
      return a.at - b.at;
    }).slice(0, 3).forEach(function(s) {
      triage.push('<article class="triage" style="--accent:#E9A13B">' + '<span class="kind">Waiting since ' + esc(since(s.at).toLowerCase()) + "</span>" + '<span class="t">' + esc(s.title) + "</span>" + '<span class="m">' + esc(catName(s.category)) + " · Ages " + esc(s.ages) + " · from " + esc(s.from) + "</span>" + '<div class="acts">' + '<button class="btn btn--primary btn--sm" type="button" data-approve="' + esc(s.id) + '">Approve</button>' + '<button class="btn btn--ghost btn--sm" type="button" data-reject="' + esc(s.id) + '">Reject</button>' + "</div>" + "</article>");
    });
    accounts().filter(function(a) {
      return a.status === "suspended";
    }).slice(0, 2).forEach(function(a) {
      triage.push('<article class="triage" style="--accent:#B3402E">' + '<span class="kind">Suspended account</span>' + '<span class="t">' + esc(a.name || a.email) + "</span>" + '<span class="m">' + esc(a.email) + " cannot sign in until this is lifted.</span>" + '<div class="acts">' + '<button class="btn btn--ghost btn--sm" type="button" data-restore="' + esc(a.email) + '">Restore access</button>' + "</div>" + "</article>");
    });
    posts.filter(function(p) {
      return p.state === "draft";
    }).slice(0, 2).forEach(function(p) {
      triage.push('<article class="triage" style="--accent:#2F6E86">' + '<span class="kind">Unpublished draft</span>' + '<span class="t">' + esc(p.title) + "</span>" + '<span class="m">Written ' + esc(since(p.at).toLowerCase()) + ". Nobody can see it yet.</span>" + '<div class="acts">' + '<button class="btn btn--primary btn--sm" type="button" data-publish="' + esc(p.id) + '">Publish</button>' + '<button class="btn btn--ghost btn--sm" type="button" data-edit-post="' + esc(p.id) + '">Edit</button>' + "</div>" + "</article>");
    });
    $("admTriage").innerHTML = triage.join("");
    $("admTriage").hidden = !triage.length;
    $("admEmptyTriage").classList.toggle("is-on", !triage.length);
  }
  function oldestPending() {
    var t = null;
    submissions.forEach(function(s) {
      if (s.state === "pending" && (t === null || s.at < t)) {
        t = s.at;
      }
    });
    return t;
  }
  function renderAccounts() {
    var list = accountList();
    var filtered = !!(state.accStatus || state.accRole || state.q);
    $("admAccCount").textContent = list.length + (list.length === 1 ? " account" : " accounts") + (filtered ? " match your filters" : " registered");
    $("admAccRows").innerHTML = list.map(function(a) {
      var s = shelfFor(a.email);
      var suspended = a.status === "suspended";
      var isMe = String(a.email).toLowerCase() === String(me()).toLowerCase();
      return '<tr data-state="' + esc(a.status) + '">' + "<td>" + '<span class="acct">' + '<span class="avatar avatar--sm" style="background:' + (a.role === "admin" ? "#123F5B" : "#0D3B32") + '">' + esc(initial(a.name || a.email)) + "</span>" + "<span>" + '<span class="nm">' + esc(a.name || "Unnamed") + (isMe ? " (you)" : "") + "</span>" + '<span class="em">' + esc(a.email) + "</span>" + "</span>" + "</span>" + "</td>" + '<td><span class="pill pill--' + esc(a.role) + '">' + (a.role === "admin" ? "Administrator" : "Parent") + "</span></td>" + '<td class="num">' + s.children + "</td>" + '<td class="num">' + s.books + "</td>" + "<td>" + esc(since(a.lastSeen)) + "</td>" + '<td><span class="pill pill--' + esc(a.status) + '">' + (suspended ? "Suspended" : "Active") + "</span></td>" + "<td>" + '<span class="row-acts">' + '<button class="btn btn--quiet btn--sm" type="button" data-reset="' + esc(a.email) + '">Send reset</button>' + (isMe ? '<button class="btn btn--quiet btn--sm" type="button" disabled title="You cannot suspend the account you are signed in with">Suspend</button>' : '<button class="btn btn--' + (suspended ? "ghost" : "danger") + ' btn--sm" type="button" data-' + (suspended ? "restore" : "suspend") + '="' + esc(a.email) + '">' + (suspended ? "Restore" : "Suspend") + "</button>") + "</span>" + "</td>" + "</tr>";
    }).join("");
    $("admEmptyAcc").classList.toggle("is-on", !list.length);
    $("admAccTable").parentNode.hidden = !list.length;
  }
  function renderModeration() {
    var list = submissionList();
    $("admModCount").textContent = list.length + (list.length === 1 ? " submission" : " submissions") + (state.modState === "pending" ? " waiting for review" : "");
    $("admModList").innerHTML = list.map(function(s) {
      var pending = s.state === "pending";
      var acts = pending ? '<button class="btn btn--primary btn--sm" type="button" data-approve="' + esc(s.id) + '">Approve</button>' + '<button class="btn btn--danger btn--sm" type="button" data-reject="' + esc(s.id) + '">Reject</button>' : '<button class="btn btn--ghost btn--sm" type="button" data-reopen="' + esc(s.id) + '">Put back in the queue</button>';
      var verdict = "";
      if (s.state === "rejected") {
        verdict = '<p class="verdict"><b>Rejected</b> by ' + esc(s.decidedBy) + " " + esc(since(s.decidedAt).toLowerCase()) + (s.reason ? " — " + esc(s.reason) : "") + "</p>";
      } else if (s.state === "approved") {
        verdict = '<p class="verdict"><b>Approved</b> by ' + esc(s.decidedBy) + " " + esc(since(s.decidedAt).toLowerCase()) + ". It is live on family dashboards.</p>";
      }
      return '<article class="sub-card" data-state="' + esc(s.state) + '">' + "<div>" + '<div class="head">' + '<span class="pill pill--' + esc(s.state) + '">' + (s.state === "pending" ? "Waiting" : s.state === "approved" ? "Approved" : "Rejected") + "</span>" + "<h3>" + esc(s.title) + "</h3>" + "</div>" + '<p class="body">' + esc(s.body) + "</p>" + '<p class="meta">' + esc(catName(s.category)) + " · Ages " + esc(s.ages) + " · from " + esc(s.from) + " · " + esc(since(s.at)) + (isHttpUrl(s.link) ? ' · <a href="' + esc(s.link) + '" rel="noopener nofollow" target="_blank">' + esc(s.link) + "</a>" : "") + "</p>" + verdict + "</div>" + '<div class="acts">' + acts + "</div>" + "</article>";
    }).join("");
    $("admEmptyMod").classList.toggle("is-on", !list.length);
    $("admModList").hidden = !list.length;
  }
  function renderPosts() {
    var list = postList();
    var filtered = !!(state.postState || state.postCat || state.postAge || state.q);
    $("admPostCount").textContent = list.length + (list.length === 1 ? " post" : " posts") + (filtered ? " match your filters" : "");
    $("admPostList").innerHTML = list.map(function(p) {
      return '<article class="post-card">' + '<div class="head">' + '<span class="pill pill--' + esc(p.state) + '">' + (p.state === "published" ? "Published" : "Draft") + "</span>" + "<h3>" + esc(p.title) + "</h3>" + "</div>" + '<p class="body">' + esc(p.body) + "</p>" + '<p class="meta">' + esc(catName(p.category)) + " · Ages " + esc(p.ages) + " · " + esc(since(p.at)) + (isHttpUrl(p.link) ? ' · <a href="' + esc(p.link) + '" rel="noopener nofollow" target="_blank">Linked resource</a>' : "") + "</p>" + '<div class="acts">' + '<button class="btn btn--' + (p.state === "published" ? "ghost" : "primary") + ' btn--sm" type="button" data-' + (p.state === "published" ? "unpublish" : "publish") + '="' + esc(p.id) + '">' + (p.state === "published" ? "Unpublish" : "Publish") + "</button>" + '<button class="btn btn--quiet btn--sm" type="button" data-edit-post="' + esc(p.id) + '">Edit</button>' + "</div>" + "</article>";
    }).join("");
    $("admEmptyPost").classList.toggle("is-on", !list.length);
    $("admPostList").hidden = !list.length;
  }
  function renderLog() {
    var list = logList();
    $("admLogCount").textContent = list.length + (list.length === 1 ? " entry" : " entries");
    $("admLogList").innerHTML = list.slice(0, 200).map(function(e) {
      return "<li>" + '<span class="tag-kind kind--' + esc(e.kind) + '">' + esc(e.kind) + "</span>" + "<span>" + esc(e.what) + (e.detail ? " — " + esc(e.detail) : "") + "</span>" + '<span class="when">' + esc(clockTime(e.at)) + "</span>" + '<span class="who">' + esc(e.who) + "</span>" + "</li>";
    }).join("");
    $("admEmptyLog").classList.toggle("is-on", !list.length);
    $("admLogList").hidden = !list.length;
  }
  function syncSuggestions() {
    if (!window.PTGSuggest) {
      return;
    }
    var incoming = window.PTGSuggest.list();
    for (var i = incoming.length - 1; i >= 0; i--) {
      var r = incoming[i];
      if (findSub(r.id)) {
        continue;
      }
      submissions.unshift({
        id: r.id,
        origin: "parent",
        title: r.title,
        body: r.body,
        category: r.category,
        ages: r.ages,
        link: r.link,
        from: r.from,
        owner: r.owner || "",
        at: r.at,
        state: r.state,
        reason: r.reason || "",
        decidedBy: r.decidedBy || "",
        decidedAt: r.decidedAt || null
      });
    }
  }
  function decideBack(s) {
    if (!s || s.origin !== "parent") {
      return;
    }
    if (window.PTGSuggest) {
      window.PTGSuggest.decide(s.id, s.state, s.reason, s.decidedBy);
    }
    if (!window.PTGNotify || !s.owner || s.owner === "guest") {
      return;
    }
    if (s.state === "approved") {
      window.PTGNotify.toParent(s.owner, {
        kind: "moderation",
        tone: "good",
        title: "Your suggestion was published",
        body: "“" + s.title + "” is now on the Resources tab for everyone.",
        go: "resources",
        tag: "sub-" + s.id
      });
    } else if (s.state === "rejected") {
      window.PTGNotify.toParent(s.owner, {
        kind: "moderation",
        tone: "warn",
        title: "Your suggestion was not published",
        body: (s.reason ? s.reason + " " : "") + "You can see the full reply under Your suggestions in Settings.",
        go: "settings",
        tag: "sub-" + s.id
      });
    }
  }
  function renderAll() {
    syncSuggestions();
    renderCounts();
    renderGreeting();
    renderOverview();
    renderAccounts();
    renderModeration();
    renderPosts();
    renderLog();
  }
  var TABS = [ "overview", "accounts", "moderation", "resources", "log", "settings" ];
  var NAV_TABS = [ "overview", "accounts", "moderation", "resources", "log" ];
  var TAB_TITLES = {
    overview: "Overview",
    accounts: "Accounts",
    moderation: "Moderation queue",
    resources: "Posts & resources",
    log: "Audit log",
    settings: "Settings"
  };
  var HEAD_IDS = {
    overview: "h-adm-overview",
    accounts: "h-adm-accounts",
    moderation: "h-adm-moderation",
    resources: "h-adm-resources",
    log: "h-adm-log",
    settings: "h-adm-settings"
  };
  function swapPanels(change, after) {
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("ptg-reduce");
    if (!document.startViewTransition || calm || document.hidden) {
      change();
      after();
      return;
    }
    document.documentElement.classList.add("vt-tabs");
    var vt = document.startViewTransition(change);
    vt.ready["catch"](function() {});
    vt.updateCallbackDone.then(after, after);
    vt.finished.then(function() {
      document.documentElement.classList.remove("vt-tabs");
    }, function() {
      document.documentElement.classList.remove("vt-tabs");
    });
  }
  function goTab(name, opts) {
    if (TABS.indexOf(name) === -1) {
      name = "overview";
    }
    opts = opts || {};
    state.tab = name;
    if (window.history && window.history.replaceState) {
      if (!(name === "settings" && /^#settings(\/|$)/.test(window.location.hash))) {
        var tabHash = "#" + (name === "overview" ? "admin" : name);
        // A tab the person picked gets its own history entry, so the phone's back
        // button or swipe-back steps through the tabs instead of leaving the app.
        if (!opts.keepScroll && window.location.hash !== tabHash) {
          window.history.pushState(null, "", tabHash);
        } else {
          window.history.replaceState(null, "", tabHash);
        }
      }
    }
    swapPanels(function() {
    TABS.forEach(function(t) {
      var btn = $("admtab-" + t), panel = $("admpanel-" + t);
      var on = t === name;
      if (btn) {
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.tabIndex = on ? 0 : -1;
      }
      if (panel) {
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
      }
    });
    }, function() {
    document.title = TAB_TITLES[name] + " — Admin console — Parents Go To";
    $("admRoute").textContent = TAB_TITLES[name];
    if (opts.focus) {
      var head = $(HEAD_IDS[name]);
      if (head) {
        head.focus();
      }
    }
    if (!opts.keepScroll) {
      window.scrollTo({
        top: 0,
        behavior: reduced.matches ? "auto" : "smooth"
      });
    }
    });
  }
  $("admTabs").addEventListener("keydown", function(e) {
    var i = NAV_TABS.indexOf(state.tab);
    var next = null;
    if (i === -1) {
      i = 0;
    }
    if (e.key === "ArrowRight") {
      next = NAV_TABS[(i + 1) % NAV_TABS.length];
    }
    if (e.key === "ArrowLeft") {
      next = NAV_TABS[(i - 1 + NAV_TABS.length) % NAV_TABS.length];
    }
    if (e.key === "Home") {
      next = NAV_TABS[0];
    }
    if (e.key === "End") {
      next = NAV_TABS[NAV_TABS.length - 1];
    }
    if (!next) {
      return;
    }
    e.preventDefault();
    goTab(next);
    var nextBtn = $("admtab-" + next);
    if (nextBtn) {
      nextBtn.focus();
    }
  });
  var whoBtn = $("admWhoBtn"), whoMenu = $("admWhoMenu");
  function setMenu(open) {
    whoMenu.hidden = !open;
    whoBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  whoBtn.addEventListener("click", function() {
    setMenu(whoMenu.hidden);
  });
  document.addEventListener("click", function(e) {
    if (whoMenu.hidden) {
      return;
    }
    if (!whoMenu.contains(e.target) && !whoBtn.contains(e.target)) {
      setMenu(false);
    }
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && !whoMenu.hidden) {
      setMenu(false);
      whoBtn.focus();
    }
  });
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
  function fillSelect(el, items, blank) {
    var html = blank ? '<option value="">' + blank + "</option>" : "";
    items.forEach(function(it) {
      html += '<option value="' + esc(it.value) + '">' + esc(it.label) + "</option>";
    });
    el.innerHTML = html;
  }
  function catOptions() {
    return CATEGORIES.map(function(c) {
      return {
        value: c.id,
        label: c.name
      };
    });
  }
  function ageOptions() {
    return AGE_BANDS.map(function(a) {
      return {
        value: a,
        label: "Ages " + a
      };
    });
  }
  fillSelect($("admModCat"), catOptions(), "All categories");
  fillSelect($("admPostCat"), catOptions(), "All categories");
  fillSelect($("admPostAge"), ageOptions(), "Any age");
  var postDialog = $("postDialog"), postForm = $("postForm");
  function openPost(p) {
    state.editingPost = p || null;
    fillSelect($("pCat"), catOptions());
    fillSelect($("pAge"), ageOptions());
    $("postDlgTitle").textContent = p ? "Edit post" : "New post";
    $("postSave").textContent = p ? "Save changes" : "Create post";
    $("postDelete").hidden = !p;
    $("pTitle").value = p ? p.title : "";
    $("pCat").value = p ? p.category : CATEGORIES[0].id;
    $("pAge").value = p ? p.ages : AGE_BANDS[1];
    $("pBody").value = p ? p.body : "";
    $("pLink").value = p ? p.link || "" : "";
    var wanted = p ? p.state : "draft";
    $("pstate-draft").checked = wanted === "draft";
    $("pstate-published").checked = wanted === "published";
    $("pStateSeg").dataset.role = wanted;
    [ "pTitleErr", "pBodyErr", "pLinkErr" ].forEach(function(id) {
      $(id).classList.remove("is-on");
    });
    [ "pTitle", "pBody", "pLink" ].forEach(function(id) {
      $(id).removeAttribute("aria-invalid");
    });
    openDialog(postDialog);
    window.setTimeout(function() {
      $("pTitle").focus();
    }, 40);
  }
  [].forEach.call(document.getElementsByName("pstate"), function(r) {
    r.addEventListener("change", function() {
      $("pStateSeg").dataset.role = r.value;
    });
  });
  function badField(inputId, errId, bad) {
    $(errId).classList.toggle("is-on", bad);
    if (bad) {
      $(inputId).setAttribute("aria-invalid", "true");
    } else {
      $(inputId).removeAttribute("aria-invalid");
    }
    return !bad;
  }
  postForm.addEventListener("submit", function(e) {
    var title = $("pTitle").value.trim();
    var body = $("pBody").value.trim();
    var link = $("pLink").value.trim();
    var okTitle = badField("pTitle", "pTitleErr", !title);
    var okBody = badField("pBody", "pBodyErr", body.length < 12);
    var okLink = badField("pLink", "pLinkErr", !!link && !isHttpUrl(link));
    if (!okTitle || !okBody || !okLink) {
      e.preventDefault();
      var firstBad = postDialog.querySelector('[aria-invalid="true"]');
      if (firstBad) {
        firstBad.focus();
      }
      return;
    }
    var wantState = $("pstate-published").checked ? "published" : "draft";
    var data = {
      title: title,
      body: body,
      category: $("pCat").value,
      ages: $("pAge").value,
      link: link,
      state: wantState
    };
    if (state.editingPost) {
      var before = state.editingPost.state;
      Object.keys(data).forEach(function(k) {
        state.editingPost[k] = data[k];
      });
      state.editingPost.at = Date.now();
      state.editingPost.by = me();
      log("content", "Edited post “" + title + "”", before !== wantState ? "status changed from " + before + " to " + wantState : "");
      say("Saved changes to “" + title + "”");
    } else {
      data.id = uid("post");
      data.at = Date.now();
      data.by = me();
      posts.unshift(data);
      log("content", (wantState === "published" ? "Published" : "Drafted") + " post “" + title + "”");
      say(wantState === "published" ? "“" + title + "” is live on family dashboards" : "“" + title + "” saved as a draft");
    }
    state.editingPost = null;
    renderAll();
  });
  $("postDelete").addEventListener("click", function() {
    var p = state.editingPost;
    if (!p) {
      return;
    }
    var at = posts.indexOf(p);
    posts.splice(at, 1);
    closeDialog(postDialog);
    state.editingPost = null;
    log("content", "Deleted post “" + p.title + "”");
    renderAll();
    say("Deleted “" + p.title + "”", function() {
      posts.splice(at, 0, p);
      log("content", "Restored post “" + p.title + "”");
      renderAll();
    });
  });
  var reviewDialog = $("reviewDialog"), reviewForm = $("reviewForm");
  $("rReason").addEventListener("change", function() {
    var other = $("rReason").value === "other";
    $("rOtherWrap").hidden = !other;
    if (other) {
      $("rOther").focus();
    }
  });
  function openReview(s) {
    state.reviewing = s;
    $("rWhat").textContent = s.title;
    $("rReason").selectedIndex = 0;
    $("rOtherWrap").hidden = true;
    $("rOther").value = "";
    $("rOtherErr").classList.remove("is-on");
    $("rOther").removeAttribute("aria-invalid");
    openDialog(reviewDialog);
    window.setTimeout(function() {
      $("rReason").focus();
    }, 40);
  }
  reviewForm.addEventListener("submit", function(e) {
    var s = state.reviewing;
    if (!s) {
      return;
    }
    var pick = $("rReason").value;
    var reason = pick === "other" ? $("rOther").value.trim() : pick;
    if (pick === "other" && reason.length < 4) {
      e.preventDefault();
      badField("rOther", "rOtherErr", true);
      $("rOther").focus();
      return;
    }
    badField("rOther", "rOtherErr", false);
    s.state = "rejected";
    s.reason = reason;
    s.decidedBy = me();
    s.decidedAt = Date.now();
    decideBack(s);
    state.reviewing = null;
    log("moderation", "Rejected “" + s.title + "”", reason);
    renderAll();
    say("Rejected “" + s.title + "”");
  });
  function findSub(id) {
    for (var i = 0; i < submissions.length; i++) {
      if (submissions[i].id === id) {
        return submissions[i];
      }
    }
    return null;
  }
  function findPost(id) {
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].id === id) {
        return posts[i];
      }
    }
    return null;
  }
  function openSetSection(sectionId, role) {
    if (window.PTGOpenSetting) {
      window.PTGOpenSetting(sectionId, role);
    }
  }
  $("page-admin").addEventListener("click", function(e) {
    var t = e.target;
    if (!t || !t.closest) {
      return;
    }
    var hit;
    hit = t.closest("[data-close]");
    if (hit && hit.closest("dialog")) {
      closeDialog(hit.closest("dialog"));
      return;
    }
    hit = t.closest("[data-admin-go]");
    if (hit) {
      goTab(hit.getAttribute("data-admin-go"), {
        focus: true
      });
      setMenu(false);
      openSetSection(hit.getAttribute("data-set-open"), "admin");
      return;
    }
    hit = t.closest("[data-approve]");
    if (hit) {
      var sa = findSub(hit.getAttribute("data-approve"));
      if (!sa) {
        return;
      }
      var wasA = sa.state;
      sa.state = "approved";
      sa.reason = "";
      sa.decidedBy = me();
      sa.decidedAt = Date.now();
      decideBack(sa);
      log("moderation", "Approved “" + sa.title + "”");
      renderAll();
      say("Approved “" + sa.title + "”", function() {
        sa.state = wasA;
        sa.decidedBy = "";
        sa.decidedAt = null;
        decideBack(sa);
        log("moderation", "Undid the approval of “" + sa.title + "”");
        renderAll();
      });
      return;
    }
    hit = t.closest("[data-reject]");
    if (hit) {
      var sr = findSub(hit.getAttribute("data-reject"));
      if (sr) {
        openReview(sr);
      }
      return;
    }
    hit = t.closest("[data-reopen]");
    if (hit) {
      var so = findSub(hit.getAttribute("data-reopen"));
      if (!so) {
        return;
      }
      so.state = "pending";
      so.reason = "";
      so.decidedBy = "";
      so.decidedAt = null;
      decideBack(so);
      log("moderation", "Put “" + so.title + "” back in the queue");
      renderAll();
      say("“" + so.title + "” is back in the queue");
      return;
    }
    hit = t.closest("[data-publish]");
    if (hit) {
      var pp = findPost(hit.getAttribute("data-publish"));
      if (!pp) {
        return;
      }
      pp.state = "published";
      pp.at = Date.now();
      log("content", "Published “" + pp.title + "”");
      renderAll();
      say("“" + pp.title + "” is live on family dashboards");
      return;
    }
    hit = t.closest("[data-unpublish]");
    if (hit) {
      var pu = findPost(hit.getAttribute("data-unpublish"));
      if (!pu) {
        return;
      }
      pu.state = "draft";
      log("content", "Unpublished “" + pu.title + "”");
      renderAll();
      say("“" + pu.title + "” is back to a draft");
      return;
    }
    hit = t.closest("[data-edit-post]");
    if (hit) {
      openPost(findPost(hit.getAttribute("data-edit-post")));
      return;
    }
    hit = t.closest("[data-suspend]");
    if (hit) {
      var em = hit.getAttribute("data-suspend");
      if (window.PTGAccounts) {
        window.PTGAccounts.setStatus(em, "suspended");
      }
      log("account", "Suspended the account " + em);
      renderAll();
      say("Suspended " + em, function() {
        if (window.PTGAccounts) {
          window.PTGAccounts.setStatus(em, "active");
        }
        log("account", "Restored the account " + em);
        renderAll();
      });
      return;
    }
    hit = t.closest("[data-restore]");
    if (hit) {
      var er = hit.getAttribute("data-restore");
      if (window.PTGAccounts) {
        window.PTGAccounts.setStatus(er, "active");
      }
      log("account", "Restored the account " + er);
      renderAll();
      say("Restored " + er);
      return;
    }
    hit = t.closest("[data-reset]");
    if (hit) {
      var ez = hit.getAttribute("data-reset");
      log("account", "Sent a password reset link to " + ez);
      renderAll();
      say("A reset link would be sent to " + ez + " — email is not connected yet");
      return;
    }
  });
  var searchTimer = null;
  $("admSearch").addEventListener("input", function() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function() {
      state.q = $("admSearch").value.trim().toLowerCase();
      renderAll();
    }, 180);
  });
  [ "admAccStatus", "admAccRole", "admAccSort" ].forEach(function(id) {
    $(id).addEventListener("change", function() {
      state.accStatus = $("admAccStatus").value;
      state.accRole = $("admAccRole").value;
      state.accSort = $("admAccSort").value;
      renderAccounts();
    });
  });
  function clearAcc() {
    state.accStatus = state.accRole = "";
    state.accSort = "recent";
    state.q = "";
    $("admAccStatus").value = $("admAccRole").value = "";
    $("admAccSort").value = "recent";
    $("admSearch").value = "";
    renderAll();
  }
  $("admAccClear").addEventListener("click", clearAcc);
  $("admEmptyAccClear").addEventListener("click", function() {
    clearAcc();
    $("admAccStatus").focus();
  });
  [ "admModState", "admModCat" ].forEach(function(id) {
    $(id).addEventListener("change", function() {
      state.modState = $("admModState").value;
      state.modCat = $("admModCat").value;
      renderModeration();
    });
  });
  $("admModClear").addEventListener("click", function() {
    state.modState = "pending";
    state.modCat = "";
    state.q = "";
    $("admModState").value = "pending";
    $("admModCat").value = "";
    $("admSearch").value = "";
    renderAll();
  });
  [ "admPostState", "admPostCat", "admPostAge" ].forEach(function(id) {
    $(id).addEventListener("change", function() {
      state.postState = $("admPostState").value;
      state.postCat = $("admPostCat").value;
      state.postAge = $("admPostAge").value;
      renderPosts();
    });
  });
  $("admPostClear").addEventListener("click", function() {
    state.postState = state.postCat = state.postAge = "";
    state.q = "";
    $("admPostState").value = $("admPostCat").value = $("admPostAge").value = "";
    $("admSearch").value = "";
    renderAll();
  });
  $("admLogKind").addEventListener("change", function() {
    state.logKind = $("admLogKind").value;
    renderLog();
  });
  $("admLogClear").addEventListener("click", function() {
    state.logKind = "";
    state.q = "";
    $("admLogKind").value = "";
    $("admSearch").value = "";
    renderAll();
  });
  $("admNewPost").addEventListener("click", function() {
    openPost(null);
  });
  $("admEmptyPostAdd").addEventListener("click", function() {
    openPost(null);
  });
  $("admNewPostQuick").addEventListener("click", function() {
    openPost(null);
  });
  function download(name, text, mime) {
    var blob = new Blob([ "\ufeff" + text ], {
      type: (mime || "text/plain") + ";charset=utf-8"
    });
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function() {
      window.URL.revokeObjectURL(url);
    }, 5e3);
  }
  function csvCell(v) {
    return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  }
  function csvRows(rows) {
    return rows.map(function(r) {
      return r.map(csvCell).join(",");
    }).join("\r\n");
  }
  function accountsCsv() {
    var rows = [ [ "Name", "Email", "Role", "Status", "Children", "Books", "Registered", "Last active" ] ];
    accountList().forEach(function(a) {
      var s = shelfFor(a.email);
      rows.push([ a.name, a.email, a.role, a.status, s.children, s.books, a.createdAt ? new Date(a.createdAt).toISOString() : "", a.lastSeen ? new Date(a.lastSeen).toISOString() : "" ]);
    });
    return csvRows(rows);
  }
  $("admAccountsCsv").addEventListener("click", function() {
    download("accounts-" + stamp() + ".csv", accountsCsv(), "text/csv");
    log("account", "Exported the account list as CSV");
    say("Account list downloaded");
  });
  $("admLogCsv").addEventListener("click", function() {
    var rows = [ [ "When", "Type", "Action", "Who", "Detail" ] ];
    logList().forEach(function(e) {
      rows.push([ new Date(e.at).toISOString(), e.kind, e.what, e.who, e.detail ]);
    });
    download("audit-log-" + stamp() + ".csv", csvRows(rows), "text/csv");
    say("Audit log downloaded");
  });
  $("admExportBtn").addEventListener("click", function() {
    setMenu(false);
    var report = {
      app: "Parents Go To",
      format: "ptg-admin-report",
      version: 1,
      exportedAt: (new Date).toISOString(),
      exportedBy: me(),
      accounts: accounts().map(function(a) {
        var s = shelfFor(a.email);
        return {
          name: a.name,
          email: a.email,
          role: a.role,
          status: a.status,
          children: s.children,
          books: s.books,
          lastSeen: a.lastSeen
        };
      }),
      submissions: submissions,
      posts: posts,
      auditLog: window.PTGAudit ? window.PTGAudit.list() : []
    };
    download("admin-report-" + stamp() + ".json", JSON.stringify(report, null, 2), "application/json");
    log("account", "Exported a full console report");
    say("Report downloaded");
  });
  var themeSeg = $("admThemeSeg");
  function paintThemeSeg() {
    var now = window.PTGTheme ? window.PTGTheme.get() : "auto";
    [].forEach.call(themeSeg.querySelectorAll("[data-theme-set]"), function(btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-set") === now ? "true" : "false");
    });
  }
  themeSeg.addEventListener("click", function(e) {
    var hit = e.target.closest ? e.target.closest("[data-theme-set]") : null;
    if (!hit || !window.PTGTheme) {
      return;
    }
    var v = window.PTGTheme.set(hit.getAttribute("data-theme-set"));
    paintThemeSeg();
    say(v === "auto" ? "Appearance follows your device" : "Appearance set to " + v);
  });
  paintThemeSeg();
  $("admSignOutBtn").addEventListener("click", function() {
    setMenu(false);
    var back = document.querySelector("#page-auth [data-signout]");
    if (back) {
      back.click();
    }
    window.location.hash = "#signin";
    window.dispatchEvent(new Event("hashchange"));
  });
  var started = false;
  if (window.PTGSuggest) {
    window.PTGSuggest.onChange(function() {
      if (started && !document.getElementById("page-admin").hidden) {
        renderAll();
      }
    });
  }
  window.PTGAdmin = {
    open: function(hash) {
      var name = String(hash || "").replace(/^#\/?/, "").toLowerCase().split("/")[0];
      if (!started) {
        started = true;
      }
      if (name === "settings" && state.tab === "settings" && !$("admpanel-settings").hidden) {
        return;
      }
      renderAll();
      paintThemeSeg();
      if (name === "admin" || !name) {
        name = "overview";
      }
      if (TABS.indexOf(name) === -1) {
        return;
      }
      goTab(name, {
        keepScroll: true
      });
    },
    refresh: function() {
      if (started && !document.getElementById("page-admin").hidden) {
        renderCounts();
        renderGreeting();
        renderOverview();
        renderLog();
      }
    },
    submissions: function() {
      syncSuggestions();
      return submissions.slice();
    },
    posts: function() {
      return posts.slice();
    },
    publishedPosts: function() {
      return posts.filter(function(p) {
        return p.state === "published";
      });
    }
  };
})();

(function() {
  "use strict";
  var SHARE_KEY = "ptg-wishlist-share-v1";
  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function store() {
    var v;
    try {
      v = JSON.parse(window.localStorage.getItem(SHARE_KEY));
    } catch (e) {
      v = null;
    }
    return v && v.byToken ? v.byToken : {};
  }
  function longDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }
  function icon(paths) {
    return '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" ' + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  function state(title, body, paths) {
    return '<div class="sh-state">' + icon(paths) + "<h2>" + esc(title) + "</h2>" + "<p>" + esc(body) + "</p>" + "</div>";
  }
  var LOCK = '<rect x="10" y="19" width="24" height="16" rx="3"/><path d="M15 19v-4a7 7 0 0 1 14 0v4"/>';
  var CLOCK = '<circle cx="22" cy="22" r="15"/><path d="M22 13v9l6 4"/>';
  var HEART = '<path d="M22 36S7 27.4 7 17.1A8.1 8.1 0 0 1 22 12.5a8.1 8.1 0 0 1 15 4.6C37 27.4 22 36 22 36Z"/>';
  function bookItem(b) {
    var tags = "";
    if (b.catName) {
      tags += '<span class="sh-tag">' + esc(b.catName) + "</span>";
    }
    if (b.ages) {
      tags += '<span class="sh-tag">Ages ' + esc(b.ages) + "</span>";
    }
    (b.forNames || []).forEach(function(n) {
      tags += '<span class="sh-tag sh-tag--for">For ' + esc(n) + "</span>";
    });
    return '<li class="sh-book">' + '<span class="sh-spine" style="background:' + esc(b.spine || "#2F6E86") + '"></span>' + '<div class="sh-book-body">' + '<h2 class="sh-title">' + esc(b.title) + "</h2>" + '<p class="sh-author">' + esc(b.author || "Author unknown") + "</p>" + (tags ? '<p class="sh-tags">' + tags + "</p>" : "") + "</div>" + "</li>";
  }
  function render(token) {
    var box = $("shareView");
    if (!box) {
      return;
    }
    var rec = store()[token];
    if (!rec) {
      document.title = "Link not available — Parents Go To";
      box.innerHTML = state("This link is not available", "The wishlist behind it may have been unshared, or the link may have been " + "copied incorrectly. Ask whoever sent it to share it again.", LOCK);
      return;
    }
    if (rec.expires && Date.now() > rec.expires) {
      document.title = "Link expired — Parents Go To";
      box.innerHTML = state("This link has expired", "It was set to stop working on " + longDate(rec.expires) + ". Ask whoever " + "sent it for a fresh link.", CLOCK);
      return;
    }
    var items = rec.items || [];
    var named = !rec.initials && rec.ownerName && rec.ownerName !== "there";
    var heading = named ? rec.ownerName + "’s family wishlist" : "A family wishlist";
    document.title = heading + " — Parents Go To";
    var html = '<p class="sh-eyebrow">Shared with you</p>' + "<h1>" + esc(heading) + "</h1>";
    html += '<p class="sh-sub">' + (items.length === 1 ? "One book this family is hoping to read next." : items.length + " books this family is hoping to read next.") + " You can look at the list, but nothing here can be changed, and you do not " + "need an account." + "</p>";
    html += '<p class="sh-meta">' + "<span>Shared on " + esc(longDate(rec.created)) + "</span>" + (rec.expires ? "<span>Link expires " + esc(longDate(rec.expires)) + "</span>" : "<span>No expiry set</span>") + "</p>";
    if (rec.scope === "invite") {
      html += '<p class="sh-note">' + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' + 'stroke-width="1.7" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/>' + '<path d="M8 4.8v4M8 10.8v.1"/></svg>' + "<span>The family marked this list for <strong>invited people only</strong>. " + "Please do not pass the link on." + "</span></p>";
    }
    if (!items.length) {
      html += state("Nothing on the wishlist yet", "The family has not added any books to this list so far. Check back later.", HEART);
    } else {
      html += '<ul class="sh-books">' + items.map(bookItem).join("") + "</ul>";
    }
    box.innerHTML = html;
  }
  window.PTGShareView = {
    open: render
  };
})();

(function() {
  "use strict";
  var AUTH = {
    signin: 1,
    "sign-in": 1,
    create: 1,
    forgot: 1,
    sent: 1,
    code: 1,
    done: 1,
    card: 1
  };
  var APP = {
    app: 1,
    dashboard: 1,
    profiles: 1,
    library: 1,
    resources: 1,
    wishlist: 1,
    "app-main": 1
  };
  var ADMIN = {
    admin: 1,
    overview: 1,
    accounts: 1,
    moderation: 1,
    resources: 1,
    log: 1,
    "admin-main": 1
  };
  var SHARED = {
    settings: 1
  };
  var LANDING_TITLE = "Parents Go To — Reading for Pleasure";
  var VIEW_TITLES = {
    "view-signin": "Sign in",
    "view-create": "Create your account",
    "view-forgot": "Reset your password",
    "view-sent": "Check your inbox",
    "view-code": "Enter your one-time code",
    "view-genres": "What do they like to read?",
    "view-done": "Signed in"
  };
  var SHARE_RE = /^wishlist\/([a-z0-9]{6,40})$/;
  var landing = document.getElementById("page-landing");
  var share = document.getElementById("page-share");
  var auth = document.getElementById("page-auth");
  var app = document.getElementById("page-app");
  var admin = document.getElementById("page-admin");
  var root = document.documentElement;
  var q = /[?&]view=([a-z-]+)/i.exec(window.location.search || "");
  var queryView = q && AUTH[q[1].toLowerCase()] ? "auth" : null;
  var showing = null;
  var landingScroll = 0;
  function hashName() {
    return (window.location.hash || "").replace(/^#\/?/, "").toLowerCase().replace(/^settings\/[a-z0-9-]*$/, "settings");
  }
  function mayOpenApp() {
    return !!(window.PTGSession && window.PTGSession.canOpenShelf());
  }
  function mayOpenConsole() {
    return !!(window.PTGSession && window.PTGSession.canOpenConsole());
  }
  function shareToken() {
    var m = SHARE_RE.exec(hashName());
    return m ? m[1] : null;
  }
  function wanted() {
    var h = hashName();
    if (SHARE_RE.test(h)) {
      return "share";
    }
    if (SHARED[h]) {
      if (mayOpenConsole()) {
        return "admin";
      }
      if (mayOpenApp()) {
        return "app";
      }
      return "auth";
    }
    if (ADMIN[h] && mayOpenConsole()) {
      return "admin";
    }
    if (APP[h] && mayOpenApp()) {
      return "app";
    }
    if (ADMIN[h] || APP[h]) {
      return "auth";
    }
    if (AUTH[h]) {
      return "auth";
    }
    if (h) {
      return "landing";
    }
    return queryView || "landing";
  }
  function backToWhereTheyWere() {
    var id = (window.location.hash || "").replace(/^#/, "");
    var el = id ? document.getElementById(id) : null;
    if (el && landing.contains(el)) {
      el.scrollIntoView({
        block: "start"
      });
      return;
    }
    window.scrollTo(0, landingScroll);
  }
  function show(page) {
    if (page === showing) {
      if (page === "share" && window.PTGShareView) {
        window.PTGShareView.open(shareToken());
      }
      if (page === "auth" && window.PTGApplyView) {
        window.PTGApplyView();
      }
      if (page === "app" && window.PTGApp) {
        window.PTGApp.open(window.location.hash);
      }
      if (page === "admin" && window.PTGAdmin) {
        window.PTGAdmin.open(window.location.hash);
      }
      return;
    }
    if (showing === "landing") {
      landingScroll = window.pageYOffset || 0;
    }
    showing = page;
    landing.hidden = page !== "landing";
    auth.hidden = page !== "auth";
    if (share) {
      share.hidden = page !== "share";
    }
    if (app) {
      app.hidden = page !== "app";
    }
    if (admin) {
      admin.hidden = page !== "admin";
    }
    root.classList.toggle("auth-open", page === "auth");
    root.classList.toggle("app-open", page === "app");
    root.classList.toggle("admin-open", page === "admin");
    root.classList.toggle("share-open", page === "share");
    if (page === "share") {
      if (window.PTGShelf) {
        window.PTGShelf.pause();
      }
      window.scrollTo(0, 0);
      if (window.PTGShareView) {
        window.PTGShareView.open(shareToken());
      }
    } else if (page === "admin") {
      if (window.PTGShelf) {
        window.PTGShelf.pause();
      }
      window.scrollTo(0, 0);
      if (window.PTGAdmin) {
        window.PTGAdmin.open(window.location.hash);
      }
    } else if (page === "auth") {
      window.scrollTo(0, 0);
      if (window.PTGShelf) {
        window.PTGShelf.ensure();
        window.PTGShelf.resume();
      }
      if (window.PTGApplyView) {
        window.PTGApplyView();
      }
      var v = document.querySelector("#page-auth .view.is-active");
      document.title = (v && VIEW_TITLES[v.id] || "Sign in") + " — Parents Go To";
    } else if (page === "app") {
      if (window.PTGShelf) {
        window.PTGShelf.pause();
      }
      window.scrollTo(0, 0);
      if (window.PTGApp) {
        window.PTGApp.open(window.location.hash);
      }
    } else {
      if (window.PTGShelf) {
        window.PTGShelf.pause();
      }
      document.title = LANDING_TITLE;
      backToWhereTheyWere();
    }
  }
  document.addEventListener("click", function(e) {
    var t = e.target.closest ? e.target.closest("[data-go]") : null;
    if (!t) {
      return;
    }
    var name = t.getAttribute("data-go");
    if (!AUTH[name] || !window.history || !window.history.replaceState) {
      return;
    }
    queryView = null;
    window.history.replaceState(null, "", "#" + name);
  }, true);
  function bounceToSignin(message) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "#signin");
      queryView = null;
      show("auth");
    } else {
      window.location.hash = "#signin";
    }
    if (window.PTGAuthNotice) {
      window.PTGAuthNotice(message);
    }
  }
  function route() {
    var h = hashName();
    var role = window.PTGSession ? window.PTGSession.role() : null;
    if (SHARE_RE.test(h)) {
      show("share");
      return;
    }
    if (SHARED[h]) {
      if (!mayOpenApp() && !mayOpenConsole()) {
        bounceToSignin("Please sign in first — settings are only open to a signed-in account.");
        return;
      }
      show(wanted());
      return;
    }
    // "resources" is both a shelf tab and a console section, so let either side through.
    if (APP[h] && ADMIN[h] && (mayOpenApp() || mayOpenConsole())) {
      show(wanted());
      return;
    }
    if (APP[h] && !mayOpenApp()) {
      bounceToSignin(role === "admin" ? "The shelf is the parent side of the product. Sign out and choose Parent to open it." : "Please sign in first — the shelf is only open to a signed-in account.");
      return;
    }
    if (ADMIN[h] && !mayOpenConsole()) {
      bounceToSignin(role === "parent" ? "The console is for administrators. Sign out and choose Administrator to open it." : "Please sign in as an administrator to open the console.");
      return;
    }
    show(wanted());
  }
  route();
  window.addEventListener("hashchange", route);
  window.addEventListener("pageshow", function(e) {
    if (e.persisted) {
      route();
    }
  });
})();
