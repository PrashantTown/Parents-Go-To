(function() {
  "use strict";
  var W = 1200, H = 800;
  function attrs(o) {
    var s = "";
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) {
        s += " " + k + '="' + o[k] + '"';
      }
    }
    return s;
  }
  function tag(n, o, inner) {
    return inner == null ? "<" + n + attrs(o) + "/>" : "<" + n + attrs(o) + ">" + inner + "</" + n + ">";
  }
  function rect(x, y, w, h, fill, o) {
    return tag("rect", mix({
      x: x,
      y: y,
      width: w,
      height: h,
      fill: fill
    }, o));
  }
  function circ(cx, cy, r, fill, o) {
    return tag("circle", mix({
      cx: cx,
      cy: cy,
      r: r,
      fill: fill
    }, o));
  }
  function ell(cx, cy, rx, ry, fill, o) {
    return tag("ellipse", mix({
      cx: cx,
      cy: cy,
      rx: rx,
      ry: ry,
      fill: fill
    }, o));
  }
  function pth(d, fill, o) {
    return tag("path", mix({
      d: d,
      fill: fill
    }, o));
  }
  function mix(a, b) {
    if (b) {
      for (var k in b) {
        if (Object.prototype.hasOwnProperty.call(b, k)) {
          a[k] = b[k];
        }
      }
    }
    return a;
  }
  function vgrad(id, stops) {
    var s = "";
    for (var i = 0; i < stops.length; i++) {
      s += tag("stop", {
        offset: stops[i][0],
        "stop-color": stops[i][1]
      });
    }
    return tag("linearGradient", {
      id: id,
      x1: "0",
      y1: "0",
      x2: "0",
      y2: "1"
    }, s);
  }
  function rgrad(id, stops, cx, cy, r) {
    var s = "";
    for (var i = 0; i < stops.length; i++) {
      s += tag("stop", {
        offset: stops[i][0],
        "stop-color": stops[i][1],
        "stop-opacity": stops[i][2]
      });
    }
    return tag("radialGradient", {
      id: id,
      cx: cx == null ? ".5" : cx,
      cy: cy == null ? ".5" : cy,
      r: r == null ? ".6" : r
    }, s);
  }
  function rng(seed) {
    var t = seed >>> 0;
    return function() {
      t += 1831565813;
      var r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }
  function stars(seed, count, maxR, colour) {
    var rand = rng(seed), out = "";
    for (var i = 0; i < count; i++) {
      var r = .7 + rand() * maxR;
      out += circ(Math.round(rand() * W), Math.round(rand() * H), Math.round(r * 10) / 10, colour || "#FFFFFF", {
        opacity: (.28 + rand() * .6).toFixed(2)
      });
    }
    return out;
  }
  function twinkle(x, y, s, colour, op) {
    return pth("M" + x + "," + (y - s) + "Q" + (x + s * .18) + "," + (y - s * .18) + " " + (x + s) + "," + y + "Q" + (x + s * .18) + "," + (y + s * .18) + " " + x + "," + (y + s) + "Q" + (x - s * .18) + "," + (y + s * .18) + " " + (x - s) + "," + y + "Q" + (x - s * .18) + "," + (y - s * .18) + " " + x + "," + (y - s) + "z", colour || "#FFFFFF", {
      opacity: op == null ? .85 : op
    });
  }
  function cloud(x, y, k, op) {
    return pth("M22 62C7 62 3 45 16 40 14 25 33 17 44 26 51 8 81 6 89 24 101 14 123 22 119 40 135 42 135 62 118 62Z", "#FFFFFF", {
      opacity: op || ".9",
      transform: "translate(" + x + " " + y + ") scale(" + k + ")"
    });
  }
  var LIST = [ {
    id: "night",
    name: "Starry night",
    ink: "light",
    draw: function() {
      return tag("defs", {}, rgrad("g", [ [ ".0", "#1B4A40", "1" ], [ "1", "#06120F", "1" ] ], ".5", "0", "1") + rgrad("mg", [ [ ".0", "#FFF3CE", ".55" ], [ "1", "#FFF3CE", "0" ] ]) + tag("filter", {
        id: "mw",
        x: "-20%",
        y: "-50%",
        width: "140%",
        height: "200%"
      }, tag("feGaussianBlur", {
        stdDeviation: "40"
      }))) + rect(0, 0, W, H, "url(#g)") + pth("M-100,520Q400,260 1300,140", "none", {
        stroke: "#9FD8C4",
        "stroke-width": 120,
        opacity: ".09",
        filter: "url(#mw)"
      }) + stars(7, 130, 1.8) + circ(960, 170, 150, "url(#mg)") + pth("M960,116A54,54 0 1,0 960,224A30,54 0 1,1 960,116Z", "#FFF3CE") + twinkle(180, 150, 16, "#FFF3CE") + twinkle(1060, 300, 12, "#FFF3CE", .7) + twinkle(640, 96, 9, "#FFFFFF", .6) + ell(1010, 640, 300, 120, "#0E2E27", {
        opacity: ".7"
      }) + ell(220, 720, 340, 130, "#0E2E27", {
        opacity: ".55"
      });
    }
  }, {
    id: "aurora",
    name: "Northern lights",
    ink: "light",
    draw: function() {
      var band = function(d, c, op) {
        return pth(d, "none", {
          stroke: c,
          "stroke-width": 150,
          opacity: op,
          filter: "url(#blur)"
        });
      };
      return tag("defs", {}, vgrad("sky", [ [ "0", "#0A1B33" ], [ "1", "#050B18" ] ]) + tag("filter", {
        id: "blur",
        x: "-30%",
        y: "-30%",
        width: "160%",
        height: "160%"
      }, tag("feGaussianBlur", {
        stdDeviation: "62"
      }))) + rect(0, 0, W, H, "url(#sky)") + stars(21, 110, 1.5) + band("M-60,300Q260,120 560,290T1260,210", "#5BCF7C", ".5") + band("M-60,430Q300,250 620,410T1260,330", "#01C4B2", ".42") + band("M-60,540Q340,400 700,520T1260,470", "#7B5EA7", ".38") + ell(600, 800, 700, 180, "#071224", {
        opacity: ".85"
      });
    }
  }, {
    id: "cosmos",
    name: "Outer space",
    ink: "light",
    draw: function() {
      return tag("defs", {}, rgrad("core", [ [ ".0", "#2A1550", "1" ], [ "1", "#08040F", "1" ] ], ".5", ".45", ".8") + rgrad("n1", [ [ ".0", "#C05BD8", ".55" ], [ "1", "#C05BD8", "0" ] ]) + rgrad("n2", [ [ ".0", "#3B7BE0", ".5" ], [ "1", "#3B7BE0", "0" ] ]) + rgrad("n3", [ [ ".0", "#E9A13B", ".34" ], [ "1", "#E9A13B", "0" ] ])) + rect(0, 0, W, H, "url(#core)") + ell(330, 260, 340, 240, "url(#n1)") + ell(880, 520, 380, 260, "url(#n2)") + ell(640, 170, 260, 150, "url(#n3)") + stars(3, 200, 2) + twinkle(250, 520, 18, "#FFFFFF") + twinkle(900, 180, 14, "#FFE9A8", .8) + circ(1020, 660, 46, "#F6E4A8", {
        opacity: ".9"
      }) + circ(1004, 648, 12, "#E4CE92") + circ(1040, 676, 8, "#E4CE92");
    }
  }, {
    id: "ocean",
    name: "Under the sea",
    ink: "light",
    draw: function() {
      var wave = function(y, c, op) {
        return pth("M0," + y + "Q200," + (y - 70) + " 400," + y + "T800," + y + "T1200," + y + "V" + H + "H0z", c, {
          opacity: op
        });
      };
      return tag("defs", {}, vgrad("sea", [ [ "0", "#0C5C77" ], [ "1", "#04202E" ] ])) + rect(0, 0, W, H, "url(#sea)") + circ(200, 150, 5, "#BFEAF7", {
        opacity: ".5"
      }) + circ(260, 90, 8, "#BFEAF7", {
        opacity: ".38"
      }) + circ(900, 130, 6, "#BFEAF7", {
        opacity: ".45"
      }) + circ(950, 210, 10, "#BFEAF7", {
        opacity: ".3"
      }) + circ(560, 60, 7, "#BFEAF7", {
        opacity: ".35"
      }) + wave(300, "#0E6E8C", ".85") + wave(420, "#0B5570", ".9") + wave(540, "#083F58", ".95") + wave(660, "#052A3D", "1");
    }
  }, {
    id: "bubbles",
    name: "Bubbles",
    ink: "light",
    draw: function() {
      var rand = rng(11), out = "";
      for (var i = 0; i < 26; i++) {
        var r = 14 + rand() * 74;
        var x = rand() * W, y = rand() * H;
        out += circ(x, y, r, "none", {
          stroke: "#DFF6FF",
          "stroke-width": 3,
          opacity: (.12 + rand() * .22).toFixed(2)
        }) + circ(x - r * .3, y - r * .34, r * .16, "#FFFFFF", {
          opacity: (.14 + rand() * .2).toFixed(2)
        });
      }
      return tag("defs", {}, rgrad("bg", [ [ ".0", "#0F5C6E", "1" ], [ "1", "#03202A", "1" ] ], ".35", ".25", ".95")) + rect(0, 0, W, H, "url(#bg)") + out;
    }
  }, {
    id: "peaks",
    name: "Mountains",
    ink: "light",
    draw: function() {
      var ridge = function(base, pts, c) {
        var d = "M0," + H;
        for (var i = 0; i < pts.length; i++) {
          d += "L" + pts[i][0] + "," + pts[i][1];
        }
        return pth(d + "L" + W + "," + H + "z", c);
      };
      return tag("defs", {}, vgrad("dusk", [ [ "0", "#3D2C5E" ], [ ".55", "#6B4470" ], [ "1", "#C4736B" ] ])) + rect(0, 0, W, H, "url(#dusk)") + circ(880, 250, 70, "#F6D08A", {
        opacity: ".95"
      }) + stars(5, 50, 1.4, "#FFE9C4") + ridge(H, [ [ 0, 520 ], [ 170, 330 ], [ 330, 470 ], [ 520, 250 ], [ 700, 450 ], [ 880, 300 ], [ 1060, 460 ], [ 1200, 380 ] ], "#4A3568") + ridge(H, [ [ 0, 640 ], [ 200, 480 ], [ 420, 610 ], [ 640, 430 ], [ 860, 590 ], [ 1080, 500 ], [ 1200, 570 ] ], "#33254A") + ridge(H, [ [ 0, 730 ], [ 260, 640 ], [ 520, 720 ], [ 800, 620 ], [ 1040, 700 ], [ 1200, 660 ] ], "#1E1633");
    }
  }, {
    id: "confetti",
    name: "Confetti",
    ink: "light",
    draw: function() {
      var cols = [ "#F6C801", "#5BCF7C", "#E0719A", "#57C7E8", "#F08F45", "#B39CE8" ];
      var rand = rng(29), out = "";
      for (var i = 0; i < 70; i++) {
        var x = rand() * W, y = rand() * H, c = cols[i % cols.length], a = Math.round(rand() * 360);
        out += rand() > .45 ? rect(x, y, 10 + rand() * 16, 8 + rand() * 8, c, {
          rx: 3,
          opacity: ".78",
          transform: "rotate(" + a + " " + x + " " + y + ")"
        }) : circ(x, y, 5 + rand() * 6, c, {
          opacity: ".78"
        });
      }
      return tag("defs", {}, rgrad("p", [ [ ".0", "#4B3778", "1" ], [ "1", "#241A3D", "1" ] ], ".5", ".3", ".9")) + rect(0, 0, W, H, "url(#p)") + out;
    }
  }, {
    id: "checks",
    name: "Checkers",
    ink: "dark",
    draw: function() {
      var out = "", n = 10, sq = W / n;
      for (var r = 0; r * sq < H + sq; r++) {
        for (var c = 0; c < n; c++) {
          if ((r + c) % 2 === 0) {
            out += rect(c * sq, r * sq, sq, sq, "#D9EFE5");
          }
        }
      }
      return rect(0, 0, W, H, "#FAF4E6") + out + tag("defs", {}, rgrad("vig", [ [ ".5", "#F6C801", "0" ], [ "1", "#E9A13B", ".3" ] ], ".5", ".5", ".8")) + rect(0, 0, W, H, "url(#vig)");
    }
  }, {
    id: "stripes",
    name: "Candy stripes",
    ink: "dark",
    draw: function() {
      var cols = [ "#F7B7CE", "#FDE8A6", "#B7E3D4", "#CDBDEC", "#FFD2B0" ];
      var out = "", w = 130, i = 0;
      for (var x = -H; x < W + H; x += w) {
        out += pth("M" + x + ",0 L" + (x + w) + ",0 L" + (x + w - H) + "," + H + " L" + (x - H) + "," + H + "z", cols[i % cols.length]);
        i++;
      }
      return rect(0, 0, W, H, "#FBF6EA") + out + rect(0, 0, W, H, "#FFFFFF", {
        opacity: ".42"
      });
    }
  }, {
    id: "dots",
    name: "Polka dots",
    ink: "dark",
    draw: function() {
      var out = "", s = 100;
      for (var r = 0; r * s < H + s; r++) {
        for (var c = 0; c * s < W + s; c++) {
          out += circ(c * s + (r % 2 ? s / 2 : 0), r * s, 15, "#FFF6E0", {
            opacity: ".55"
          });
        }
      }
      return tag("defs", {}, vgrad("d", [ [ "0", "#FBE4A8" ], [ "1", "#F2BF6A" ] ])) + rect(0, 0, W, H, "url(#d)") + out;
    }
  }, {
    id: "blobs",
    name: "Lava lamp",
    ink: "dark",
    draw: function() {
      return tag("defs", {}, vgrad("cream", [ [ "0", "#FBF6EA" ], [ "1", "#EFE4D2" ] ]) + tag("filter", {
        id: "soft",
        x: "-25%",
        y: "-25%",
        width: "150%",
        height: "150%"
      }, tag("feGaussianBlur", {
        stdDeviation: "26"
      }))) + rect(0, 0, W, H, "url(#cream)") + tag("g", {
        filter: "url(#soft)",
        opacity: ".72"
      }, ell(240, 220, 210, 170, "#F2B5C6") + ell(880, 180, 190, 150, "#F6D98E") + ell(1010, 600, 230, 180, "#A7DCC8") + ell(380, 640, 250, 170, "#B7CDEE") + ell(640, 400, 180, 140, "#E2CDEF"));
    }
  }, {
    id: "meadow",
    name: "Sunny hills",
    ink: "dark",
    draw: function() {
      return tag("defs", {}, vgrad("sky2", [ [ "0", "#BFE6F2" ], [ "1", "#EAF6DC" ] ])) + rect(0, 0, W, H, "url(#sky2)") + circ(950, 170, 78, "#F9D96A") + circ(950, 170, 108, "#F9D96A", {
        opacity: ".28"
      }) + cloud(170, 130, 1.5, ".95") + cloud(600, 70, 1.1, ".8") + pth("M0,520Q300,400 620,510T1200,450V800H0z", "#93CE7C") + pth("M0,620Q280,520 600,610T1200,560V800H0z", "#6FB863") + pth("M0,720Q320,640 660,710T1200,670V800H0z", "#4E9A52");
    }
  }, {
    id: "sherbet",
    name: "Sherbet",
    ink: "dark",
    draw: function() {
      return tag("defs", {}, tag("linearGradient", {
        id: "sh",
        x1: "0",
        y1: "0",
        x2: "1",
        y2: "1"
      }, tag("stop", {
        offset: "0",
        "stop-color": "#FBD3E0"
      }) + tag("stop", {
        offset: ".45",
        "stop-color": "#FDE8C8"
      }) + tag("stop", {
        offset: "1",
        "stop-color": "#BFE6DC"
      })) + tag("filter", {
        id: "soft2",
        x: "-25%",
        y: "-25%",
        width: "150%",
        height: "150%"
      }, tag("feGaussianBlur", {
        stdDeviation: "40"
      }))) + rect(0, 0, W, H, "url(#sh)") + tag("g", {
        filter: "url(#soft2)",
        opacity: ".5"
      }, ell(300, 560, 260, 180, "#F7B7CE") + ell(900, 260, 240, 170, "#FFE3A6") + ell(1100, 700, 220, 160, "#A9DCD0"));
    }
  }, {
    id: "sunburst",
    name: "Sunburst",
    ink: "dark",
    draw: function() {
      var out = "", n = 24, cx = 600, cy = 300, R = 1600;
      for (var i = 0; i < n; i++) {
        if (i % 2) {
          continue;
        }
        var a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        out += pth("M" + cx + "," + cy + "L" + (cx + Math.cos(a0) * R) + "," + (cy + Math.sin(a0) * R) + "L" + (cx + Math.cos(a1) * R) + "," + (cy + Math.sin(a1) * R) + "z", "#F6C801", {
          opacity: ".5"
        });
      }
      return tag("defs", {}, rgrad("sb", [ [ ".0", "#FFE9A8", "1" ], [ "1", "#EF9A3C", "1" ] ], ".5", ".38", ".9")) + rect(0, 0, W, H, "url(#sb)") + out + circ(cx, cy, 120, "#FFF3CE", {
        opacity: ".9"
      });
    }
  }, {
    id: "reef",
    name: "Coral reef",
    ink: "light",
    draw: function() {
      var rand = rng(53), out = "";
      var cols = [ "#E0719A", "#F08F45", "#9B7BD4", "#01C4B2", "#F6C801" ];
      for (var i = 0; i < 14; i++) {
        var x = 40 + rand() * (W - 80), h = 260 + rand() * 300, c = cols[i % cols.length];
        var w = 46 + rand() * 34;
        out += pth("M" + x + "," + H + "q-" + w + ",-" + h * .55 + " 0,-" + h + "q" + w + "," + h * .45 + " 0," + h + "z", c, {
          opacity: ".5"
        }) + pth("M" + (x - w * 1.1) + "," + H + "q-" + w * .6 + ",-" + h * .34 + " " + w * .2 + ",-" + h * .6 + "q" + w * .8 + "," + h * .3 + " -" + w * .2 + "," + h * .6 + "z", c, {
          opacity: ".45"
        }) + pth("M" + (x + w * 1.1) + "," + H + "q" + w * .6 + ",-" + h * .34 + " -" + w * .2 + ",-" + h * .55 + "q-" + w * .8 + "," + h * .28 + " " + w * .2 + "," + h * .55 + "z", c, {
          opacity: ".45"
        });
      }
      return tag("defs", {}, vgrad("rf", [ [ "0", "#0A6E86" ], [ "1", "#03222F" ] ])) + rect(0, 0, W, H, "url(#rf)") + circ(180, 150, 7, "#CFEFF7", {
        opacity: ".45"
      }) + circ(1020, 220, 10, "#CFEFF7", {
        opacity: ".35"
      }) + circ(700, 110, 6, "#CFEFF7", {
        opacity: ".4"
      }) + circ(420, 200, 5, "#CFEFF7", {
        opacity: ".3"
      }) + out + rect(0, 0, W, H, "#03222F", {
        opacity: ".4"
      });
    }
  } ];
  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) {
    BY_ID[LIST[i].id] = LIST[i];
  }
  function get(id) {
    return BY_ID[id] || BY_ID.night;
  }
  function svg(id) {
    var b = get(id);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid slice" width="' + W + '" height="' + H + '">' + b.draw() + "</svg>";
  }
  function uri(id) {
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(id)).replace(/'/g, "%27").replace(/"/g, "%22") + '")';
  }
  function apply(elm, id) {
    if (!elm) {
      return;
    }
    var b = get(id);
    elm.setAttribute("data-bd", b.id);
    elm.setAttribute("data-bd-ink", b.ink);
    elm.style.backgroundImage = uri(b.id);
  }
  var AMBIENT = {
    night: "stars",
    aurora: "stars",
    cosmos: "stars",
    peaks: "stars",
    ocean: "bubbles",
    bubbles: "bubbles",
    reef: "bubbles",
    meadow: "clouds",
    sunburst: "motes",
    blobs: "motes",
    sherbet: "motes",
    confetti: "confetti"
  };
  var AMB_COUNT = {
    stars: 22,
    bubbles: 14,
    clouds: 4,
    motes: 12,
    confetti: 16
  };
  var AMB_COLS = [ "#F6C801", "#5BCF7C", "#E0719A", "#57C7E8", "#F08F45", "#B39CE8" ];
  function ambient(elm, id) {
    if (!elm) {
      return;
    }
    var kind = id ? AMBIENT[get(id).id] || "" : "";
    var layer = elm.querySelector(":scope > .bd-amb");
    if (!kind) {
      if (layer) {
        layer.remove();
      }
      return;
    }
    if (layer && layer.getAttribute("data-amb") === kind) {
      return;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "bd-amb";
      layer.setAttribute("aria-hidden", "true");
      elm.insertBefore(layer, elm.firstChild);
    }
    layer.setAttribute("data-amb", kind);
    var rand = rng(kind.length * 97 + 13), out = "";
    for (var i = 0; i < AMB_COUNT[kind]; i++) {
      var st = "--x:" + (rand() * 100).toFixed(1) + "%;--y:" + (rand() * 100).toFixed(1) + "%;--s:" + (.5 + rand()).toFixed(2) + ";--d:" + (rand() * -20).toFixed(1) + "s;--t:" + (.8 + rand() * .7).toFixed(2);
      if (kind === "confetti") {
        st += ";--c:" + AMB_COLS[i % AMB_COLS.length] + ";--r:" + Math.round(rand() * 360) + "deg";
      }
      out += '<i style="' + st + '"></i>';
    }
    layer.innerHTML = out;
  }
  window.PTGBackdrop = {
    ambient: ambient,
    svg: svg,
    uri: uri,
    apply: apply,
    get: get,
    LIST: LIST,
    DEFAULT: "night"
  };
})();
