(function() {
  "use strict";
  var SLOTS = 3;
  var STORE_KEY = "ptg-kid-looks";
  var PALETTE = [ {
    id: "flag",
    hex: "#B3402E",
    name: "Poppy"
  }, {
    id: "marigold",
    hex: "#E9A13B",
    name: "Marigold"
  }, {
    id: "gilt",
    hex: "#D9B25E",
    name: "Honey"
  }, {
    id: "leaf",
    hex: "#3FA45F",
    name: "Leaf"
  }, {
    id: "sea",
    hex: "#01A79A",
    name: "Lagoon"
  }, {
    id: "sky",
    hex: "#2F6E86",
    name: "Deep sky"
  }, {
    id: "ink",
    hex: "#123F5B",
    name: "Midnight"
  }, {
    id: "plum",
    hex: "#7B5EA7",
    name: "Plum"
  }, {
    id: "blossom",
    hex: "#E0719A",
    name: "Blossom"
  }, {
    id: "clay",
    hex: "#8C5A3C",
    name: "Clay"
  } ];
  var SKINS = [ "#F4D3B8", "#E8B893", "#C98D63", "#9C6440", "#6B4429", "#43291A", "#F6C8D8", "#B9D7A8", "#A9CDE4", "#D8C2EC", "#F2D06B", "#DCE3DE" ];
  function el(tag, attrs, inner) {
    var s = "<" + tag;
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
        s += " " + k + '="' + attrs[k] + '"';
      }
    }
    return inner == null ? s + "/>" : s + ">" + inner + "</" + tag + ">";
  }
  function circle(cx, cy, r, fill, extra) {
    return el("circle", mix({
      cx: cx,
      cy: cy,
      r: r,
      fill: fill
    }, extra));
  }
  function ellipse(cx, cy, rx, ry, fill, extra) {
    return el("ellipse", mix({
      cx: cx,
      cy: cy,
      rx: rx,
      ry: ry,
      fill: fill
    }, extra));
  }
  function path(d, fill, extra) {
    return el("path", mix({
      d: d,
      fill: fill
    }, extra));
  }
  function stroke(d, colour, w, extra) {
    return el("path", mix({
      d: d,
      fill: "none",
      stroke: colour,
      "stroke-width": w,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }, extra));
  }
  function rect(x, y, w, h, r, fill, extra) {
    return el("rect", mix({
      x: x,
      y: y,
      width: w,
      height: h,
      rx: r,
      fill: fill
    }, extra));
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
  function grp(inner, attrs) {
    return el("g", attrs || {}, inner);
  }
  function dots(y, sp, r, col) {
    col = col || "#2A1B12";
    return circle(50 - sp, y, r, col) + circle(50 + sp, y, r, col);
  }
  function shine(y, sp, r, col) {
    col = col || "#2A1B12";
    return circle(50 - sp, y, r, col) + circle(50 + sp, y, r, col) + circle(50 - sp + r * .34, y - r * .34, r * .36, "#FFFFFF") + circle(50 + sp + r * .34, y - r * .34, r * .36, "#FFFFFF") + circle(50 - sp - r * .38, y + r * .4, r * .15, "#FFFFFF", {
      opacity: ".85"
    }) + circle(50 + sp - r * .38, y + r * .4, r * .15, "#FFFFFF", {
      opacity: ".85"
    });
  }
  function happyEyes(y, sp, w, col) {
    col = col || "#2A1B12";
    return stroke("M" + (50 - sp - w) + "," + y + "q" + w + ",-" + w * .9 + " " + w * 2 + ",0", col, 3) + stroke("M" + (50 + sp - w) + "," + y + "q" + w + ",-" + w * .9 + " " + w * 2 + ",0", col, 3);
  }
  function smile(y, w, col, weight) {
    col = col || "#2A1B12";
    return stroke("M" + (50 - w) + "," + y + "q" + w + "," + w * .85 + " " + w * 2 + ",0", col, weight || 2.6);
  }
  function blush(y, sp, col) {
    col = col || "rgba(226,110,110,.45)";
    return ellipse(50 - sp, y, 5.4, 3.6, col, {
      filter: "url(#__SOFT__)"
    }) + ellipse(50 + sp, y, 5.4, 3.6, col, {
      filter: "url(#__SOFT__)"
    });
  }
  var CHARACTERS = {
    moon: {
      group: "sky",
      name: "Moon",
      bg: "#123F5B",
      draw: function() {
        return path("M64,20a32,32 0 1 0 0,60a26,26 0 0 1 0,-60z", "#F6E4A8") + path("M62,20a32,32 0 0 0 0,60a30,30 0 0 1 2,-60z", "#FFF3CE") + circle(44, 40, 4.6, "#E7CE86") + circle(36, 56, 3.2, "#E7CE86") + circle(48, 62, 2.4, "#E7CE86") + happyEyes(46, 9, 4, "#6B5A22") + smile(56, 5, "#6B5A22", 2.4) + circle(24, 30, 2.2, "#FFFFFF") + circle(78, 66, 1.8, "#FFFFFF") + circle(22, 68, 1.6, "#FFFFFF");
      }
    },
    star: {
      group: "sky",
      name: "Star",
      bg: "#2F6E86",
      draw: function() {
        var d = "M50,16 61,40 87,43 68,61 73,86 50,74 27,86 32,61 13,43 39,40z";
        return path(d, "#F6C801") + path("M50,16 61,40 87,43 68,61 73,86 50,74z", "#EBB300") + shine(50, 9, 4.2, "#4A3A05") + smile(60, 5.5, "#4A3A05", 2.6) + blush(58, 19, "rgba(216,120,60,.4)");
      }
    },
    cloud: {
      group: "sky",
      name: "Cloud",
      bg: "#5EA3C4",
      draw: function() {
        return path("M28,64a13,13 0 0 1 1,-26a17,17 0 0 1 32,-5a12,12 0 0 1 12,12a11,11 0 0 1 -3,19z", "#F1F5FA") + path("M28,64a13,13 0 0 1 1,-26a17,17 0 0 1 12,-9a20,20 0 0 0 -4,35z", "#FFFFFF") + shine(48, 9, 3.6, "#4C5A66") + smile(56, 5, "#4C5A66", 2.4) + blush(55, 18, "rgba(120,160,200,.45)") + stroke("M36,74q4,6 8,0", "#BBD0E2", 3) + stroke("M52,76q4,6 8,0", "#BBD0E2", 3);
      }
    },
    comet: {
      group: "sky",
      name: "Comet",
      bg: "#123F5B",
      draw: function() {
        return stroke("M54,50 14,60", "#6FB6E0", 17, {
          opacity: ".28"
        }) + stroke("M56,58 22,82", "#A8D8F0", 13, {
          opacity: ".42"
        }) + stroke("M52,55 26,70", "#E4F4FF", 7, {
          opacity: ".8"
        }) + circle(62, 40, 21, "#DCF0FF") + circle(62, 40, 17, "#FFFFFF") + shine(38, 7.5, 3.6, "#3F5A6B") + smile(47, 5, "#3F5A6B", 2.4) + blush(46, 14, "rgba(130,180,215,.5)") + circle(24, 24, 2.6, "#FFE9A8") + circle(84, 72, 2.2, "#FFE9A8");
      }
    },
    planet: {
      group: "sky",
      name: "Planet",
      bg: "#123F5B",
      draw: function() {
        return circle(50, 48, 26, "#C86A94") + path("M24,48a26,26 0 0 1 26,-26a20,26 0 0 0 -8,52a26,26 0 0 1 -18,-26z", "#DD87AC") + circle(38, 34, 5, "#B0567E") + circle(62, 58, 6.5, "#B0567E") + circle(60, 32, 3, "#B0567E") + ellipse(50, 54, 40, 9, "none", {
          stroke: "#F6C801",
          "stroke-width": "5",
          transform: "rotate(-16 50 54)"
        }) + shine(46, 9, 4, "#4A2233") + smile(56, 5, "#4A2233", 2.4);
      }
    },
    rainbow: {
      group: "sky",
      name: "Rainbow",
      bg: "#2F6E86",
      draw: function() {
        var arc = function(r, c) {
          return stroke("M" + (50 - r) + ",86a" + r + "," + r + " 0 0 1 " + r * 2 + ",0", c, 6.5);
        };
        return arc(44, "#E05A4A") + arc(37, "#EFA13B") + arc(30, "#3FA45F") + arc(23, "#5B8BD0") + circle(28, 84, 13, "#F1F5FA") + circle(72, 84, 13, "#F1F5FA") + circle(50, 82, 15, "#FFFFFF") + rect(20, 84, 60, 16, 8, "#F7FAFD") + shine(80, 9, 3.8, "#4C5A66") + smile(88, 5, "#4C5A66", 2.4);
      }
    },
    fox: {
      group: "animal",
      name: "Fox",
      bg: "#2F6E86",
      draw: function() {
        return path("M27,40 22,14 46,28z", "#C9541F") + path("M29,37 26,20 40,29z", "#F6D3B4") + path("M73,40 78,14 54,28z", "#C9541F") + path("M71,37 74,20 60,29z", "#F6D3B4") + ellipse(50, 50, 26, 24, "#E8792F") + path("M50,26a26,24 0 0 0 -26,24a26,24 0 0 0 8,17a30,30 0 0 1 18,-41z", "#F08F45") + ellipse(50, 62, 18, 13, "#FFF3E6") + shine(48, 10, 4.2, "#33200F") + ellipse(50, 58, 4, 3, "#33200F") + stroke("M50,61v3", "#33200F", 2.2) + smile(64, 5, "#33200F", 2.4);
      }
    },
    owl: {
      group: "animal",
      name: "Owl",
      bg: "#123F5B",
      draw: function() {
        return path("M28,32 22,10 42,24z", "#8A6444") + path("M72,32 78,10 58,24z", "#8A6444") + ellipse(50, 54, 27, 26, "#B08655") + path("M50,28a27,26 0 0 0 -27,26a27,26 0 0 0 7,17a31,30 0 0 1 20,-43z", "#C2986A") + ellipse(50, 68, 18, 13, "#EBD6B4") + circle(39, 46, 12.5, "#FBF6EC") + circle(61, 46, 12.5, "#FBF6EC") + circle(39, 46, 6.6, "#2C1E12") + circle(61, 46, 6.6, "#2C1E12") + circle(41.2, 43.8, 2.3, "#FFFFFF") + circle(63.2, 43.8, 2.3, "#FFFFFF") + path("M50,55 55,63 45,63z", "#E9A13B") + stroke("M30,72q7,7 10,-1M70,72q-7,7 -10,-1", "#8A6444", 2.6);
      }
    },
    cat: {
      group: "animal",
      name: "Cat",
      bg: "#3E3A52",
      draw: function() {
        return path("M26,36 24,12 46,26z", "#8480A0") + path("M28,33 27,18 39,26z", "#E8A0B4") + path("M74,36 76,12 54,26z", "#8480A0") + path("M72,33 73,18 61,26z", "#E8A0B4") + ellipse(50, 52, 26, 24, "#9A95B4") + path("M50,28a26,24 0 0 0 -26,24a26,24 0 0 0 7,16a30,30 0 0 1 19,-40z", "#ACA7C4") + ellipse(50, 62, 15, 11, "#F4F1F8") + stroke("M28,56 12,52M28,61 11,61M72,56 88,52M72,61 89,61", "#F4F1F8", 1.5, {
          opacity: ".75"
        }) + shine(50, 10, 4.2, "#241F30") + path("M50,58 54,61 46,61z", "#E07E9A") + stroke("M50,62q-4,5 -7,1M50,62q4,5 7,1", "#241F30", 2.2);
      }
    },
    panda: {
      group: "animal",
      name: "Panda",
      bg: "#7B5EA7",
      draw: function() {
        return circle(28, 26, 11, "#2B2B33") + circle(72, 26, 11, "#2B2B33") + ellipse(50, 52, 27, 25, "#F7F5F2") + ellipse(37, 47, 10, 12, "#2B2B33", {
          transform: "rotate(-14 37 47)"
        }) + ellipse(63, 47, 10, 12, "#2B2B33", {
          transform: "rotate(14 63 47)"
        }) + circle(38, 48, 4.4, "#FFFFFF") + circle(62, 48, 4.4, "#FFFFFF") + circle(38, 48, 2.4, "#1A1A20") + circle(62, 48, 2.4, "#1A1A20") + ellipse(50, 62, 4.6, 3.4, "#2B2B33") + stroke("M50,65v3M50,68q-5,4 -8,-1M50,68q5,4 8,-1", "#2B2B33", 2.2) + blush(58, 19, "rgba(226,140,150,.35)");
      }
    },
    bunny: {
      group: "animal",
      name: "Bunny",
      bg: "#7B5EA7",
      draw: function() {
        return ellipse(38, 24, 8, 20, "#EFE6DE", {
          transform: "rotate(-9 38 24)"
        }) + ellipse(62, 24, 8, 20, "#EFE6DE", {
          transform: "rotate(9 62 24)"
        }) + ellipse(38, 25, 4, 14, "#F2B8C6", {
          transform: "rotate(-9 38 25)"
        }) + ellipse(62, 25, 4, 14, "#F2B8C6", {
          transform: "rotate(9 62 25)"
        }) + ellipse(50, 58, 24, 22, "#F7F1EB") + path("M50,36a24,22 0 0 0 -24,22a24,22 0 0 0 6,15a28,26 0 0 1 18,-37z", "#FFFFFF") + shine(54, 9.5, 4, "#3B2C2C") + path("M50,63 54,66 46,66z", "#E48CA0") + stroke("M50,67v2M50,69q-4,4 -7,0M50,69q4,4 7,0", "#3B2C2C", 2) + blush(66, 17, "rgba(226,130,150,.35)");
      }
    },
    frog: {
      group: "animal",
      name: "Frog",
      bg: "#8C5A3C",
      draw: function() {
        return circle(33, 33, 13, "#5FA84A") + circle(67, 33, 13, "#5FA84A") + circle(33, 32, 8, "#F7F7EF") + circle(67, 32, 8, "#F7F7EF") + circle(34, 33, 4.4, "#20301A") + circle(66, 33, 4.4, "#20301A") + circle(35.4, 31.4, 1.6, "#FFFFFF") + circle(67.4, 31.4, 1.6, "#FFFFFF") + ellipse(50, 58, 26, 22, "#6FBB55") + path("M50,36a26,22 0 0 0 -26,22a26,22 0 0 0 7,15a30,26 0 0 1 19,-37z", "#82CB68") + ellipse(50, 66, 15, 8, "#B4DFA0", {
          opacity: ".55"
        }) + stroke("M36,60q14,12 28,0", "#26421C", 3) + circle(38, 55, 1.8, "#3D6B2C") + circle(62, 55, 1.8, "#3D6B2C") + blush(58, 20, "rgba(230,140,120,.4)");
      }
    },
    penguin: {
      group: "animal",
      name: "Penguin",
      bg: "#5EA3C4",
      draw: function() {
        return ellipse(24, 58, 7, 15, "#22303E", {
          transform: "rotate(16 24 58)"
        }) + ellipse(76, 58, 7, 15, "#22303E", {
          transform: "rotate(-16 76 58)"
        }) + path("M42,78 32,86 48,84z", "#E9A13B") + path("M58,78 68,86 52,84z", "#E9A13B") + ellipse(50, 54, 26, 27, "#344354") + path("M50,27a26,27 0 0 0 -26,27a26,27 0 0 0 6,17a30,30 0 0 1 20,-44z", "#44566A") + ellipse(50, 60, 17, 20, "#F8F6F0") + circle(42, 45, 4.4, "#1B222B") + circle(58, 45, 4.4, "#1B222B") + circle(43.5, 43.5, 1.6, "#FFFFFF") + circle(59.5, 43.5, 1.6, "#FFFFFF") + path("M50,50 57.5,55 50,60 42.5,55z", "#E9A13B") + blush(54, 19, "rgba(226,130,140,.35)");
      }
    },
    dino: {
      group: "animal",
      name: "Dino",
      bg: "#123F5B",
      draw: function() {
        return path("M34,32 27,20 41,25zM25,46 13,40 27,35zM26,60 14,62 27,51z", "#8FD9A8") + ellipse(52, 54, 25, 24, "#57B27C") + path("M52,30a25,24 0 0 0 -25,24a25,24 0 0 0 6,16a29,28 0 0 1 19,-40z", "#69C48D") + ellipse(58, 64, 16, 11, "#C8EDD7") + shine(48, 9, 4.2, "#1D3A28") + circle(64, 60, 1.9, "#2E6647") + circle(70, 62, 1.7, "#2E6647") + stroke("M50,66q8,6 15,0", "#1D3A28", 2.6) + circle(40, 40, 3, "#3E8C5F") + circle(62, 38, 2.4, "#3E8C5F");
      }
    },
    bear: {
      group: "animal",
      name: "Bear",
      bg: "#2F6E86",
      draw: function() {
        return circle(28, 28, 11, "#A0714C") + circle(72, 28, 11, "#A0714C") + circle(28, 28, 6, "#D8A87E") + circle(72, 28, 6, "#D8A87E") + ellipse(50, 54, 26, 25, "#B87F55") + path("M50,29a26,25 0 0 0 -26,25a26,25 0 0 0 7,17a30,29 0 0 1 19,-42z", "#C89066") + ellipse(50, 64, 16, 12, "#EBD3B6") + shine(50, 10, 4.2, "#3A2517") + ellipse(50, 60, 4.6, 3.4, "#3A2517") + stroke("M50,63v3M50,66q-5,4 -8,-1M50,66q5,4 8,-1", "#3A2517", 2.2);
      }
    },
    narwhal: {
      group: "animal",
      name: "Narwhal",
      bg: "#123F5B",
      draw: function() {
        return path("M50,37 57,7 64,37z", "#F6E4A8") + stroke("M53,26 58,12M55,32 61,18", "#D9BE72", 2) + path("M74,44q14,-9 16,5q-11,5 -16,9z", "#5E9BCC") + ellipse(48, 56, 27, 23, "#6FA8D8") + path("M48,33a27,23 0 0 0 -27,23a27,23 0 0 0 7,15a31,27 0 0 1 20,-38z", "#8ABFEA") + ellipse(48, 65, 18, 11, "#DCEEFB") + shine(53, 10, 4.2, "#1E3B54") + smile(64, 6, "#1E3B54", 2.6) + blush(62, 20, "rgba(110,165,210,.55)") + stroke("M28,32q5,-7 10,-1", "#DCEEFB", 2.4);
      }
    },
    robot: {
      group: "space",
      name: "Robot",
      bg: "#3FA45F",
      draw: function() {
        return stroke("M50,24 50,14", "#8FA3B0", 2.6) + circle(50, 11, 4, "#E9A13B") + rect(24, 26, 52, 46, 12, "#9FB3C0") + path("M36,26h-1a11,11 0 0 0 -11,12v22a30,30 0 0 1 12,-34z", "#B4C7D2") + rect(31, 36, 38, 22, 8, "#20313D") + circle(41, 47, 5.2, "#5BE0C8") + circle(59, 47, 5.2, "#5BE0C8") + circle(42.6, 45.4, 1.8, "#FFFFFF") + circle(60.6, 45.4, 1.8, "#FFFFFF") + stroke("M43,64h14", "#20313D", 3) + rect(18, 42, 6, 14, 3, "#8FA3B0") + rect(76, 42, 6, 14, 3, "#8FA3B0") + circle(35, 68, 2, "#E9A13B") + circle(65, 68, 2, "#E9A13B");
      }
    },
    rocket: {
      group: "space",
      name: "Rocket",
      bg: "#123F5B",
      draw: function() {
        return path("M32,72q-8,-4 -6,-14l10,6zM68,72q8,-4 6,-14l-10,6z", "#D2513C") + path("M50,12q16,14 16,34v18H34V46q0,-20 16,-34z", "#F1F0EC") + path("M50,12q-16,14 -16,34v18h8V46q0,-20 8,-34z", "#FFFFFF") + path("M50,12q7,6 11,17H39q4,-11 11,-17z", "#D2513C") + circle(50, 46, 10, "#2C4A5E") + circle(50, 46, 7.4, "#8FD6EA") + circle(47.6, 43.6, 2.4, "#FFFFFF") + path("M44,78q6,10 12,0q-6,4 -12,0z", "#E9A13B") + path("M46,74q4,8 8,0q-4,3 -8,0z", "#F6C801");
      }
    },
    astronaut: {
      group: "space",
      name: "Astronaut",
      bg: "#123F5B",
      draw: function() {
        return rect(22, 38, 56, 22, 10, "#E8E6DF") + circle(50, 48, 30, "#F4F2EC") + circle(50, 48, 24, "#22303E") + path("M50,24a24,24 0 0 0 -24,24a24,24 0 0 0 3,11a30,30 0 0 1 21,-35z", "#3C5468", {
          opacity: ".85"
        }) + shine(46, 8.5, 4, "#8FD6EA") + smile(56, 5, "#8FD6EA", 2.4) + circle(78, 44, 5, "#E9A13B") + circle(30, 22, 2.2, "#FFFFFF") + circle(74, 20, 1.8, "#FFFFFF") + circle(20, 70, 2, "#FFFFFF");
      }
    },
    alien: {
      group: "space",
      name: "Alien",
      bg: "#B3402E",
      draw: function() {
        return stroke("M36,26 30,14M64,26 70,14", "#6FBB55", 2.4) + circle(29, 12, 3.6, "#F6C801") + circle(71, 12, 3.6, "#F6C801") + path("M50,24c16,0 26,12 26,26c0,16 -12,30 -26,30S24,66 24,50c0,-14 10,-26 26,-26z", "#7FCB62") + path("M50,24c-16,0 -26,12 -26,26c0,10 5,19 11,25a34,34 0 0 1 6,-49z", "#93DA76") + ellipse(39, 48, 8, 11, "#1E2E18", {
          transform: "rotate(-12 39 48)"
        }) + ellipse(61, 48, 8, 11, "#1E2E18", {
          transform: "rotate(12 61 48)"
        }) + circle(37, 44, 2.6, "#FFFFFF") + circle(59, 44, 2.6, "#FFFFFF") + smile(66, 6, "#1E2E18", 2.6) + blush(62, 20, "rgba(120,200,110,.5)");
      }
    },
    ghost: {
      group: "space",
      name: "Ghost",
      bg: "#7B5EA7",
      draw: function() {
        return path("M50,18c-15,0 -25,11 -25,26v34c0,4 4,5 6,2l4,-5 5,6c1,2 4,2 5,0l5,-6 5,6c1,2 4,2 5,0l5,-6 4,5c2,3 6,2 6,-2V44c0,-15 -10,-26 -25,-26z", "#F2F1F7") + path("M50,18c-15,0 -25,11 -25,26v34c0,3 2,4 4,3V44c0,-12 7,-21 17,-25a20,20 0 0 1 4,-1z", "#FFFFFF") + circle(41, 44, 4.6, "#3A3550") + circle(59, 44, 4.6, "#3A3550") + circle(42.6, 42.2, 1.6, "#FFFFFF") + circle(60.6, 42.2, 1.6, "#FFFFFF") + ellipse(50, 56, 5, 6, "#3A3550") + blush(54, 19, "rgba(150,140,190,.4)");
      }
    },
    dragon: {
      group: "space",
      name: "Dragon",
      bg: "#123F5B",
      draw: function() {
        return path("M30,28 24,12 40,22zM70,28 76,12 60,22z", "#4E9E86") + path("M32,26 28,16 38,22zM68,26 72,16 62,22z", "#96E2CC") + ellipse(50, 52, 26, 24, "#3F8F78") + path("M50,28a26,24 0 0 0 -26,24a26,24 0 0 0 7,16a30,28 0 0 1 19,-40z", "#4EA88D") + ellipse(50, 63, 17, 12, "#B7E8D8") + shine(48, 10, 4.2, "#12332A") + circle(45, 62, 2.2, "#2C6455") + circle(55, 62, 2.2, "#2C6455") + stroke("M42,68q8,6 16,0", "#12332A", 2.6) + path("M42,70 44,76 40,74zM58,70 56,76 60,74z", "#F6F4EE") + stroke("M50,26 50,20", "#96E2CC", 2.4);
      }
    },
    sunflower: {
      group: "garden",
      name: "Sunflower",
      bg: "#3FA45F",
      draw: function() {
        var pet = "";
        for (var i = 0; i < 12; i++) {
          var a = i * 30;
          pet += ellipse(50, 20, 6.5, 12, i % 2 ? "#F6C801" : "#E9A13B", {
            transform: "rotate(" + a + " 50 50)"
          });
        }
        return pet + circle(50, 50, 20, "#8C5A3C") + circle(50, 50, 16, "#A3703F") + shine(47, 7.5, 3.6, "#2E1D10") + smile(56, 5, "#2E1D10", 2.4) + blush(55, 15, "rgba(226,140,110,.4)");
      }
    },
    mushroom: {
      group: "garden",
      name: "Mushroom",
      bg: "#8C5A3C",
      draw: function() {
        return path("M50,18c-19,0 -32,14 -32,26 0,4 3,6 8,6h48c5,0 8,-2 8,-6 0-12-13-26-32-26z", "#D2513C") + path("M50,18c-19,0 -32,14 -32,26 0,3 2,5 5,6 0-16 9-28 27-32z", "#E2705C") + circle(34, 34, 6, "#F6F4EE") + circle(62, 30, 4.6, "#F6F4EE") + circle(68, 44, 5, "#F6F4EE") + circle(44, 44, 3.4, "#F6F4EE") + path("M32,50h36v18c0,8 -8,14 -18,14s-18,-6 -18,-14z", "#F2E5CE") + path("M32,50h9v30a17,17 0 0 1 -9,-12z", "#FBF3E4") + shine(62, 8, 3.4, "#5A4327") + smile(70, 4.5, "#5A4327", 2.2);
      }
    },
    bee: {
      group: "garden",
      name: "Bee",
      bg: "#123F5B",
      draw: function() {
        return ellipse(30, 34, 14, 10, "#DCEAF4", {
          transform: "rotate(-24 30 34)",
          opacity: ".9"
        }) + ellipse(70, 34, 14, 10, "#DCEAF4", {
          transform: "rotate(24 70 34)",
          opacity: ".9"
        }) + stroke("M42,24 38,12M58,24 62,12", "#3A3018", 2.2) + circle(38, 10, 3, "#3A3018") + circle(62, 10, 3, "#3A3018") + ellipse(50, 54, 24, 23, "#F6C801") + path("M31,42h38a24,23 0 0 1 3,8H29a24,23 0 0 1 2,-8z", "#3A3018") + path("M28,58h44a24,23 0 0 1 -3,8H31a24,23 0 0 1 -3,-8z", "#3A3018") + circle(42, 48, 3.6, "#2A2210") + circle(58, 48, 3.6, "#2A2210") + circle(43.2, 46.6, 1.3, "#FFFFFF") + circle(59.2, 46.6, 1.3, "#FFFFFF") + smile(72, 5, "#3A3018", 2.4);
      }
    },
    ladybug: {
      group: "garden",
      name: "Ladybug",
      bg: "#3FA45F",
      draw: function() {
        return stroke("M42,24 36,12M58,24 62,12", "#2A2118", 2.2) + circle(36, 10, 3, "#2A2118") + circle(64, 10, 3, "#2A2118") + circle(50, 54, 27, "#D2513C") + path("M50,27a27,27 0 0 0 -27,27a27,27 0 0 0 6,17a31,31 0 0 1 21,-44z", "#E2705C") + path("M50,27a27,27 0 0 0 -14,4v46a27,27 0 0 0 28,0V31a27,27 0 0 0 -14,-4z", "#2A2118", {
          opacity: "0"
        }) + rect(48.4, 27, 3.2, 54, 1.6, "#2A2118") + circle(36, 46, 5, "#2A2118") + circle(64, 46, 5, "#2A2118") + circle(34, 64, 4, "#2A2118") + circle(66, 64, 4, "#2A2118") + path("M50,27a27,27 0 0 0 -21,10h42a27,27 0 0 0 -21,-10z", "#2A2118") + circle(43, 33, 2.6, "#FFFFFF") + circle(57, 33, 2.6, "#FFFFFF") + circle(43, 33, 1.3, "#2A2118") + circle(57, 33, 1.3, "#2A2118");
      }
    },
    turtle: {
      group: "garden",
      name: "Turtle",
      bg: "#123F5B",
      draw: function() {
        return ellipse(18, 64, 10, 7, "#7FBF6A", {
          transform: "rotate(-20 18 64)"
        }) + ellipse(82, 64, 10, 7, "#7FBF6A", {
          transform: "rotate(20 82 64)"
        }) + ellipse(50, 80, 11, 7, "#7FBF6A") + circle(50, 34, 17, "#93D07C") + path("M50,17a17,17 0 0 0 -17,17a17,17 0 0 0 4,10a21,21 0 0 1 13,-27z", "#A9DD95") + shine(31, 6.5, 3.6, "#223E1A") + smile(40, 5, "#223E1A", 2.4) + blush(39, 12, "rgba(120,180,100,.55)") + path("M50,48c-21,0 -32,9 -32,17s11,14 32,14 32,-6 32,-14 -11,-17 -32,-17z", "#3F8C5C") + path("M50,48c-21,0 -32,9 -32,17 0,4 3,7 7,9 0-14 9-22 25-26z", "#4FA36D") + path("M50,55 60,62 56,73H44l-4,-11z", "#8FCB6E") + path("M28,66 39,60 41,72zM72,66 61,60 59,72z", "#8FCB6E");
      }
    },
    acorn: {
      group: "garden",
      name: "Acorn",
      bg: "#7B5EA7",
      draw: function() {
        return stroke("M50,20q6,-8 12,-6", "#5C8C4A", 3) + path("M22,40c0,-10 12,-18 28,-18s28,8 28,18c0,4 -3,6 -8,6H30c-5,0 -8,-2 -8,-6z", "#8C5A3C") + path("M22,40c0,-10 12,-18 28,-18a30,30 0 0 0 -12,4c-8,4 -12,9 -12,17a6,6 0 0 1 -4,-3z", "#A3703F") + stroke("M30,34h40M28,40h44", "#6E4429", 2) + path("M26,46h48c0,18 -10,34 -24,34S26,64 26,46z", "#D2A05E") + path("M26,46h10c0,16 4,27 12,32a18,18 0 0 1 -22,-32z", "#E0B274") + shine(58, 8, 3.6, "#5A3B1C") + smile(66, 5, "#5A3B1C", 2.4) + blush(65, 17, "rgba(200,120,80,.35)");
      }
    }
  };
  var GROUPS = [ {
    id: "sky",
    name: "Night sky"
  }, {
    id: "animal",
    name: "Creatures"
  }, {
    id: "space",
    name: "Far out"
  }, {
    id: "garden",
    name: "Garden"
  } ];
  var PARTS = {
    shape: {
      name: "Face",
      options: [ {
        id: "round",
        name: "Round",
        draw: function(c) {
          return circle(50, 52, 30, c);
        }
      }, {
        id: "egg",
        name: "Tall",
        draw: function(c) {
          return ellipse(50, 52, 24, 32, c);
        }
      }, {
        id: "wide",
        name: "Wide",
        draw: function(c) {
          return ellipse(50, 54, 33, 24, c);
        }
      }, {
        id: "block",
        name: "Blocky",
        draw: function(c) {
          return rect(20, 24, 60, 56, 15, c);
        }
      }, {
        id: "drop",
        name: "Pointy",
        draw: function(c) {
          return path("M50,16c17,9 31,21 31,36 0,17 -14,28 -31,28S19,69 19,52c0,-15 14,-27 31,-36z", c);
        }
      }, {
        id: "bean",
        name: "Tilted",
        draw: function(c) {
          return ellipse(50, 52, 31, 26, c, {
            transform: "rotate(-10 50 52)"
          });
        }
      } ]
    },
    eyes: {
      name: "Eyes",
      options: [ {
        id: "dot",
        name: "Dots",
        draw: function() {
          return dots(48, 11, 4.4);
        }
      }, {
        id: "big",
        name: "Big",
        draw: function() {
          return circle(39, 48, 9, "#FFFFFF") + circle(61, 48, 9, "#FFFFFF") + circle(40, 49, 5, "#2A1B12") + circle(62, 49, 5, "#2A1B12") + circle(41.8, 46.8, 1.9, "#FFFFFF") + circle(63.8, 46.8, 1.9, "#FFFFFF");
        }
      }, {
        id: "specs",
        name: "Glasses",
        draw: function() {
          return circle(38, 48, 10, "none", {
            stroke: "#2A1B12",
            "stroke-width": "2.6"
          }) + circle(62, 48, 10, "none", {
            stroke: "#2A1B12",
            "stroke-width": "2.6"
          }) + stroke("M48,48h4", "#2A1B12", 2.6) + circle(38, 48, 3.8, "#2A1B12") + circle(62, 48, 3.8, "#2A1B12");
        }
      }, {
        id: "sleepy",
        name: "Sleepy",
        draw: function() {
          return happyEyes(50, 11, 5.5);
        }
      }, {
        id: "wink",
        name: "Wink",
        draw: function() {
          return circle(39, 48, 4.6, "#2A1B12") + stroke("M55,49q6,-6 12,0", "#2A1B12", 3.2);
        }
      }, {
        id: "star",
        name: "Stars",
        draw: function() {
          var st = function(x) {
            return path("M" + x + ",39 " + (x + 3.4) + ",46 " + (x + 10) + ",47 " + (x + 4.5) + ",52 " + (x + 6.5) + ",59 " + x + ",55.5 " + (x - 6.5) + ",59 " + (x - 4.5) + ",52 " + (x - 10) + ",47 " + (x - 3.4) + ",46z", "#F6C801");
          };
          return st(39) + st(61);
        }
      } ]
    },
    mouth: {
      name: "Mouth",
      options: [ {
        id: "smile",
        name: "Smile",
        draw: function() {
          return smile(64, 8, "#2A1B12", 3);
        }
      }, {
        id: "grin",
        name: "Grin",
        draw: function() {
          return path("M36,62q14,16 28,0z", "#2A1B12") + path("M39.5,63.5h21q-2.5,3.5 -10.5,3.5t-10.5,-3.5z", "#FFFFFF");
        }
      }, {
        id: "small",
        name: "Small",
        draw: function() {
          return smile(64, 4.5, "#2A1B12", 2.8);
        }
      }, {
        id: "oh",
        name: "Oh!",
        draw: function() {
          return ellipse(50, 65, 5.5, 7, "#2A1B12") + ellipse(50, 68, 3.2, 3.6, "#E2705C");
        }
      }, {
        id: "cat",
        name: "Kitty",
        draw: function() {
          return stroke("M50,62q-5.5,6.5 -10,1M50,62q5.5,6.5 10,1", "#2A1B12", 2.8) + path("M50,57 54.5,60.5h-9z", "#E2705C");
        }
      }, {
        id: "tongue",
        name: "Cheeky",
        draw: function() {
          return path("M36,61q14,15 28,0z", "#2A1B12") + path("M45,69q5,9 10,0z", "#E2705C");
        }
      } ]
    },
    top: {
      name: "On top",
      options: [ {
        id: "none",
        name: "Nothing",
        draw: function() {
          return "";
        }
      }, {
        id: "cat",
        name: "Cat ears",
        draw: function(c) {
          return path("M27,32 24,6 48,24z", c) + path("M73,32 76,6 52,24z", c) + path("M30,29 28,14 41,24z", "#F0B0BE") + path("M70,29 72,14 59,24z", "#F0B0BE");
        }
      }, {
        id: "bunny",
        name: "Bunny ears",
        draw: function(c) {
          return ellipse(38, 18, 8, 20, c, {
            transform: "rotate(-10 38 18)"
          }) + ellipse(62, 18, 8, 20, c, {
            transform: "rotate(10 62 18)"
          }) + ellipse(38, 19, 4, 13, "#F0B0BE", {
            transform: "rotate(-10 38 19)"
          }) + ellipse(62, 19, 4, 13, "#F0B0BE", {
            transform: "rotate(10 62 19)"
          });
        }
      }, {
        id: "bear",
        name: "Round ears",
        draw: function(c) {
          return circle(26, 26, 12, c) + circle(74, 26, 12, c) + circle(26, 26, 6.5, "#F0B0BE") + circle(74, 26, 6.5, "#F0B0BE");
        }
      }, {
        id: "horn",
        name: "Horn",
        draw: function() {
          return path("M50,0 61,32H39z", "#F6C801") + stroke("M44,14h12M41,23h18", "#D9A400", 2.4);
        }
      }, {
        id: "bolt",
        name: "Antenna",
        draw: function(c) {
          return stroke("M50,26 50,13", c, 3.4) + circle(50, 8, 6, "#F6C801") + circle(48, 6, 2, "#FFF0AE");
        }
      }, {
        id: "bow",
        name: "Bow",
        draw: function() {
          return path("M50,20 31,8v24zM50,20 69,8v24z", "#E0719A") + circle(50, 20, 6, "#C85480");
        }
      }, {
        id: "crown",
        name: "Crown",
        draw: function() {
          return path("M26,30 24,6 38,18 50,2 62,18 76,6 74,30z", "#F6C801") + circle(50, 11, 3.2, "#D2513C") + circle(27, 13, 2.6, "#5BE0C8") + circle(73, 13, 2.6, "#5BE0C8");
        }
      }, {
        id: "hair",
        name: "Hair",
        draw: function(c) {
          return path("M24,30c-1,-13 8,-19 15,-15 3,-9 15,-11 20,-3 9,-2 15,5 13,14 -4,-6 -12,-8 -20,-5 -9,3 -20,3 -28,9z", c);
        }
      }, {
        id: "leaf",
        name: "Sprout",
        draw: function() {
          return stroke("M50,26 50,12", "#5C8C4A", 3.2) + path("M50,15q-13,-2 -13,-11q13,-2 13,11z", "#7FBF6A") + path("M50,20q13,-2 13,-11q-13,-2 -13,11z", "#93D07C");
        }
      } ]
    }
  };
  var DEFAULT_BUILD = {
    shape: "round",
    skin: "#F4D3B8",
    eyes: "big",
    mouth: "smile",
    top: "none",
    topColour: "#8C5A3C"
  };
  function partOption(part, id) {
    var list = PARTS[part].options;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return list[0];
  }
  function luminance(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    var f = function(c) {
      c /= 255;
      return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
    };
    return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255);
  }
  function tint(hex, amount) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) {
      return hex;
    }
    var ch = [ n >> 16 & 255, n >> 8 & 255, n & 255 ].map(function(c) {
      var v = amount > 0 ? c + (255 - c) * amount : c * (1 + amount);
      return ("0" + Math.round(v).toString(16)).slice(-2);
    });
    return "#" + ch.join("");
  }
  function inkOn(hex) {
    return luminance(hex) > .42 ? "#13221E" : "#FFFFFF";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var uidSeq = 0;
  function svg(spec, name, size) {
    spec = normalise(spec);
    size = size || 100;
    uidSeq++;
    var clipId = "ptgav" + uidSeq;
    var bg = spec.bg || "#0D3B32";
    var body = "";
    var art = "";
    if (spec.kind === "char" && CHARACTERS[spec.id]) {
      art = CHARACTERS[spec.id].draw();
    } else if (spec.kind === "build") {
      art = drawBuild(spec.parts);
    }
    if (art) {
      body = el("g", {
        filter: "url(#" + clipId + "k)"
      }, art.replace(/__SOFT__/g, clipId + "s"));
    } else {
      var letter = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
      body = el("text", {
        x: 50,
        y: 50,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-family": "Public Sans, system-ui, sans-serif",
        "font-size": 46,
        "font-weight": 700,
        fill: inkOn(bg)
      }, esc(letter));
    }
    var defs = '<clipPath id="' + clipId + '"><circle cx="50" cy="50" r="50"/></clipPath>' + '<radialGradient id="' + clipId + 'g" cx=".34" cy=".26" r=".85">' + '<stop offset="0" stop-color="' + tint(bg, .3) + '"/><stop offset=".62" stop-color="' + bg + '"/><stop offset="1" stop-color="' + tint(bg, -.22) + '"/></radialGradient>';
    if (art) {
      defs += '<filter id="' + clipId + 'k" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">' + '<feMorphology in="SourceAlpha" operator="dilate" radius="1.7" result="fat"/>' + '<feFlood flood-color="#FFFFFF" flood-opacity=".96"/><feComposite in2="fat" operator="in" result="line"/>' + '<feGaussianBlur in="fat" stdDeviation="1.8"/><feOffset dy="2.4" result="drop"/>' + '<feFlood flood-color="#08140F" flood-opacity=".32"/><feComposite in2="drop" operator="in" result="shadow"/>' + '<feMerge><feMergeNode in="shadow"/><feMergeNode in="line"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' + '<filter id="' + clipId + 's" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>';
    }
    var frame = circle(50, 50, 50, "url(#" + clipId + "g)") + circle(50, 50, 48.6, "none", {
      stroke: "#FFFFFF",
      "stroke-opacity": ".16",
      "stroke-width": "1.6"
    });
    return '<svg class="ptg-av-svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + "<defs>" + defs + "</defs>" + '<g clip-path="url(#' + clipId + ')">' + frame + body + "</g></svg>";
  }
  function drawBuild(p) {
    p = mix(mix({}, DEFAULT_BUILD), p || {});
    var skin = p.skin || DEFAULT_BUILD.skin;
    var topCol = p.topColour || skin;
    var behind = [ "cat", "bunny", "bear" ];
    var top = partOption("top", p.top);
    var topArt = top.draw(topCol);
    var isBehind = behind.indexOf(top.id) !== -1;
    return (isBehind ? topArt : "") + partOption("shape", p.shape).draw(skin) + (isBehind ? "" : topArt) + partOption("eyes", p.eyes).draw() + partOption("mouth", p.mouth).draw();
  }
  function normalise(spec) {
    if (!spec || typeof spec !== "object") {
      return {
        kind: "letter",
        bg: "#0D3B32"
      };
    }
    var out = {
      kind: spec.kind,
      bg: spec.bg || "#0D3B32"
    };
    if (spec.kind === "char") {
      out.id = CHARACTERS[spec.id] ? spec.id : "star";
      if (!spec.bg) {
        out.bg = CHARACTERS[out.id].bg || "#123F5B";
      }
    } else if (spec.kind === "build") {
      var p = spec.parts || {};
      out.parts = {
        shape: partOption("shape", p.shape).id,
        skin: /^#[0-9A-Fa-f]{6}$/.test(p.skin || "") ? p.skin : DEFAULT_BUILD.skin,
        eyes: partOption("eyes", p.eyes).id,
        mouth: partOption("mouth", p.mouth).id,
        top: partOption("top", p.top).id,
        topColour: /^#[0-9A-Fa-f]{6}$/.test(p.topColour || "") ? p.topColour : DEFAULT_BUILD.skin
      };
    } else {
      out.kind = "letter";
    }
    return out;
  }
  function label(spec, name) {
    spec = normalise(spec);
    if (spec.kind === "char") {
      return (name ? name + ", " : "") + CHARACTERS[spec.id].name + " avatar";
    }
    if (spec.kind === "build") {
      return (name ? name + ", " : "") + "avatar they made";
    }
    return name || "Avatar";
  }
  var cache = null;
  function all() {
    if (cache) {
      return cache;
    }
    try {
      cache = JSON.parse(window.localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      cache = {};
    }
    if (typeof cache !== "object" || !cache) {
      cache = {};
    }
    return cache;
  }
  function persist() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(all()));
    } catch (e) {}
  }
  function slot(childId) {
    var a = all();
    if (!a[childId]) {
      a[childId] = {};
    }
    return a[childId];
  }
  function get(childId) {
    var s = slot(childId);
    return {
      avatar: normalise(s.avatar),
      backdrop: s.backdrop || "night",
      customs: customs(childId)
    };
  }
  function setAvatar(childId, spec) {
    slot(childId).avatar = normalise(spec);
    persist();
    announce(childId);
  }
  function chosenBackdrop(childId) {
    return slot(childId).backdrop || null;
  }
  function setBackdrop(childId, id) {
    slot(childId).backdrop = String(id || "night");
    persist();
    announce(childId);
  }
  function customs(childId) {
    var c = slot(childId).customs;
    var out = [];
    for (var i = 0; i < SLOTS; i++) {
      out.push(c && c[i] ? normalise(c[i]) : null);
    }
    return out;
  }
  function saveCustom(childId, index, spec) {
    var s = slot(childId);
    if (!s.customs) {
      s.customs = [];
    }
    s.customs[index] = normalise(spec);
    persist();
    announce(childId);
  }
  function clearCustom(childId, index) {
    var s = slot(childId);
    if (s.customs) {
      s.customs[index] = null;
    }
    persist();
    announce(childId);
  }
  function announce(childId) {
    try {
      var ev;
      if (typeof window.CustomEvent === "function") {
        ev = new window.CustomEvent("ptg:look", {
          detail: {
            childId: childId
          }
        });
      } else {
        ev = document.createEvent("CustomEvent");
        ev.initCustomEvent("ptg:look", false, false, {
          childId: childId
        });
      }
      document.dispatchEvent(ev);
    } catch (e) {}
  }
  function markup(childId, name, colour, cls) {
    var look = get(childId);
    var spec = look.avatar;
    var bg = spec.bg || colour || "#0D3B32";
    if (spec.kind === "letter") {
      return '<span class="' + (cls || "avatar") + '" style="background:' + esc(colour || bg) + '">' + esc((String(name || "?").trim().charAt(0) || "?").toUpperCase()) + "</span>";
    }
    return '<span class="' + (cls || "avatar") + ' avatar--art" style="background:' + esc(bg) + '">' + svg(spec, name, 100) + "</span>";
  }
  window.PTGAvatar = {
    svg: svg,
    label: label,
    markup: markup,
    normalise: normalise,
    get: get,
    setAvatar: setAvatar,
    setBackdrop: setBackdrop,
    chosenBackdrop: chosenBackdrop,
    customs: customs,
    saveCustom: saveCustom,
    clearCustom: clearCustom,
    inkOn: inkOn,
    CHARACTERS: CHARACTERS,
    GROUPS: GROUPS,
    PARTS: PARTS,
    PALETTE: PALETTE,
    SKINS: SKINS,
    SLOTS: SLOTS,
    DEFAULT_BUILD: DEFAULT_BUILD
  };
})();
