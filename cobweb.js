(function() {
  "use strict";
  var THRESHOLD = 7;
  var FULL = 35;
  var GL_W = 300;
  var GL_H = 450;
  var root = document.documentElement;
  var targets = [];
  var glCanvas = null;
  var gl = null;
  var prog = null;
  var uni = {};
  var broken = false;
  var running = false;
  var lastFrame = 0;
  var startTime = 0;
  function reduced() {
    if (root.classList.contains("ptg-reduce")) {
      return true;
    }
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function level(days) {
    var d = Number(days);
    if (!isFinite(d) || d < THRESHOLD) {
      return 0;
    }
    var t = (d - THRESHOLD) / (FULL - THRESHOLD);
    return t > 1 ? 1 : t < 0 ? 0 : t;
  }
  function seedOf(str) {
    var h = 2166136261;
    var s = String(str || "web");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = h * 16777619 >>> 0;
    }
    return h % 1e4 / 1e4 * 100;
  }
  var VERT = [ "attribute vec2 a_pos;", "varying vec2 v_uv;", "void main(){", "  v_uv = a_pos * 0.5 + 0.5;", "  gl_Position = vec4(a_pos, 0.0, 1.0);", "}" ].join("\n");
  var FRAG = [ "precision highp float;", "varying vec2 v_uv;", "uniform float u_time;", "uniform float u_dust;", "uniform float u_seed;", "uniform vec2  u_res;", "uniform vec3  u_thread;", "uniform float u_fade;", "#define TAU 6.28318530718", "float hash1(vec2 p){", "  p = fract(p * vec2(233.34, 851.73));", "  p += dot(p, p + 23.45);", "  return fract(p.x * p.y);", "}", "float vnoise(vec2 p){", "  vec2 i = floor(p); vec2 f = fract(p);", "  f = f * f * (3.0 - 2.0 * f);", "  float a = hash1(i);", "  float b = hash1(i + vec2(1.0, 0.0));", "  float c = hash1(i + vec2(0.0, 1.0));", "  float d = hash1(i + vec2(1.0, 1.0));", "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);", "}", "float fbm(vec2 p){", "  float s = 0.0, a = 0.5;", "  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }", "  return s;", "}", "vec2 orbWeb(vec2 p, float spokes, float reach, float seed, float grow, float px){", "  float r = length(p);", "  if (r > reach * 1.3) { return vec2(0.0); }", "  float HALF = TAU * 0.25;", "  float ang = atan(max(p.y, 0.0), max(p.x, 1e-6));", "  float u = clamp(ang / HALF, 0.0, 1.0);", "  float k  = u * spokes + fract(seed * 0.37);", "  float fk = fract(k);", "  float ik = floor(k);", "  float dSpoke = min(fk, 1.0 - fk) * (HALF / spokes) * r;", "  float droop = 1.0 - 0.035 * (4.0 * fk * (1.0 - fk));", "  float rr = r / droop;", "  float ratio = 1.28;", "  float r0 = 0.040;", "  float q  = log(max(rr, 1e-4) / r0) / log(ratio);", "  float fq = fract(q);", "  float iq = floor(q);", "  float dRing = min(fq, 1.0 - fq) * rr * log(ratio);", "  float qMax = log(reach / r0) / log(ratio);", "  float built = qMax * grow;", "  float segLot = hash1(vec2(iq * 3.1 + seed * 17.0, ik * 7.7 - seed * 5.0));", "  float keep = step(0.34 - grow * 0.30, segLot);", "  float w  = 0.45 * px;", "  float hw = w * 2.6;", "  float ring   = (1.0 - smoothstep(w, w + px * 1.25, dRing)) * keep;", "  float spoke  = (1.0 - smoothstep(w * 1.05, w * 1.05 + px * 1.25, dSpoke));", "  float ringH  = (1.0 - smoothstep(hw, hw + px * 1.6, dRing)) * keep;", "  float spokeH = (1.0 - smoothstep(hw * 1.05, hw * 1.05 + px * 1.6, dSpoke));", "  float rmask = step(0.0, q) * (1.0 - smoothstep(built - 0.8, built + 0.2, q));", "  ring *= rmask; ringH *= rmask;", "  float spokeEnd = r0 * pow(ratio, built) *", "                   (0.86 + 0.28 * hash1(vec2(ik * 5.7 + seed, ik * 2.3 - seed)));", "  float smask = 1.0 - smoothstep(spokeEnd * 0.97, spokeEnd * 1.03, r);", "  spoke *= smask; spokeH *= smask;", "  float hub = smoothstep(0.0, r0 * 0.8, r);", "  float web  = max(ring,  spoke  * 0.88) * hub;", "  float halo = max(ringH, spokeH * 0.88) * hub;", "  float blob = (1.0 - smoothstep(r0 * 0.2, r0 * 1.3, r)) * 0.22 * grow;", "  return clamp(vec2(web + blob, halo + blob), 0.0, 1.0);", "}", "float motes(vec2 uv, float scale, float speed, float size, float t, float seed){", "  vec2 p = uv * scale;", "  p.y += t * speed;", "  p.x += sin(t * speed * 0.7 + p.y * 0.8 + seed) * 0.28;", "  vec2 c = floor(p), f = fract(p);", "  float sum = 0.0;", "  for (int j = -1; j <= 1; j++){", "    for (int i = -1; i <= 1; i++){", "      vec2 o = vec2(float(i), float(j));", "      vec2 cell = c + o;", "      float h = hash1(cell + seed);", "      if (h < 0.62) { continue; }", "      vec2 pos = o + vec2(hash1(cell + 1.7), hash1(cell + 4.3));", "      float d = length(f - pos);", "      float twinkle = 0.55 + 0.45 * sin(t * 1.6 + h * TAU);", "      sum += (1.0 - smoothstep(0.0, size, d)) * twinkle;", "    }", "  }", "  return clamp(sum, 0.0, 1.0);", "}", "void main(){", "  float dust = clamp(u_dust, 0.0, 1.0);", "  if (dust <= 0.001) { gl_FragColor = vec4(0.0); return; }", "  float aspect = u_res.x / u_res.y;", "  vec2 uv = v_uv;", "  float t = u_time;", "  vec2 sway = vec2(", "    sin(t * 0.34 + u_seed) * 0.0042 + (fbm(uv * 2.1 + t * 0.06) - 0.5) * 0.010,", "    cos(t * 0.27 + u_seed * 1.7) * 0.0030", "  ) * (0.45 + 0.55 * dust);", "  vec2 suv = uv + sway;", "  float px = 1.10 / u_res.y;", "  vec2 p1 = vec2(suv.x * aspect, 1.0 - suv.y);", "  float grow1 = clamp(0.30 + 0.70 * dust, 0.0, 1.0);", "  vec2  wv   = orbWeb(p1, 9.0, 0.26 + 0.32 * dust, u_seed, grow1, px);", "  float web  = wv.x;", "  float halo = wv.y;", "  float g2 = smoothstep(0.34, 1.0, dust);", "  if (g2 > 0.001){", "    vec2 p2 = vec2((1.0 - suv.x) * aspect, suv.y);", "    vec2 w2 = orbWeb(p2, 8.0, 0.15 + 0.20 * dust, u_seed + 3.9, 0.35 + 0.65 * g2, px);", "    web  = max(web,  w2.x * (0.55 + 0.45 * g2));", "    halo = max(halo, w2.y * (0.55 + 0.45 * g2));", "  }", "  float strandLot = smoothstep(0.18, 0.75, dust);", "  for (int s = 0; s < 2; s++){", "    float fs = float(s);", "    float y0 = 0.90 - fs * 0.13;", "    float sagAmt = 0.075 + fs * 0.035;", "    float bob = sin(t * (0.5 + fs * 0.21) + u_seed + fs) * 0.006;", "    float y = y0 - sagAmt * (4.0 * suv.x * (1.0 - suv.x)) + bob;", "    float d = abs(suv.y - y);", "    float line = 1.0 - smoothstep(px * 0.5, px * 1.6, d);", "    web  = max(web,  line * strandLot * 0.34);", "    halo = max(halo, (1.0 - smoothstep(px * 1.3, px * 3.0, d)) * strandLot * 0.34);", "  }", "  float clump = 0.55 + 0.6 * fbm(suv * 7.0 + u_seed);", "  float cl = clamp(clump, 0.0, 1.35);", "  web *= cl; halo *= cl;", "  float corner = 1.0 - smoothstep(0.0, 0.95, length((suv - 0.5) * vec2(aspect, 1.0)));", "  float film = (0.055 + 0.10 * dust) * (0.35 + 0.65 * (1.0 - corner));", "  film *= 0.6 + 0.8 * fbm(suv * 3.4 - u_seed * 0.5);", "  float m = 0.0;", "  m += motes(vec2(suv.x * aspect, suv.y),  9.0, -0.035, 0.10, t, u_seed)        * 0.55;", "  m += motes(vec2(suv.x * aspect, suv.y), 15.0, -0.055, 0.075, t, u_seed + 2.3) * 0.38;", "  m += motes(vec2(suv.x * aspect, suv.y), 24.0, -0.080, 0.055, t, u_seed + 6.1) * 0.26;", "  m *= smoothstep(0.0, 0.35, dust);", "  float a = clamp(web * 0.72 + halo * 0.20 + film + m * 0.5, 0.0, 1.0) * u_fade;", "  float mixv = clamp(web / max(a, 1e-4), 0.0, 1.0);", "  vec3 shadow = vec3(0.06, 0.06, 0.07);", "  vec3 col = mix(shadow, u_thread * (0.86 + 0.28 * web), mixv);", "  gl_FragColor = vec4(col * a, a);", "}" ].join("\n");
  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      if (window.console) {
        window.console.warn("[cobweb] shader:", gl.getShaderInfoLog(sh));
      }
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
  function initGL() {
    if (glCanvas || broken) {
      return !broken;
    }
    glCanvas = document.createElement("canvas");
    glCanvas.width = GL_W;
    glCanvas.height = GL_H;
    var opts = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: false
    };
    try {
      gl = glCanvas.getContext("webgl", opts) || glCanvas.getContext("experimental-webgl", opts);
    } catch (e) {
      gl = null;
    }
    if (!gl) {
      broken = true;
      return false;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      broken = true;
      return false;
    }
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (window.console) {
        window.console.warn("[cobweb] link:", gl.getProgramInfoLog(prog));
      }
      broken = true;
      return false;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1, -1, 3, -1, -1, 3 ]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    [ "u_time", "u_dust", "u_seed", "u_res", "u_thread", "u_fade" ].forEach(function(n) {
      uni[n] = gl.getUniformLocation(prog, n);
    });
    gl.viewport(0, 0, GL_W, GL_H);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    glCanvas.addEventListener("webglcontextlost", function(e) {
      e.preventDefault();
      broken = true;
    }, false);
    return true;
  }
  var threadRGB = [ .9, .91, .9 ];
  function readThread() {
    var raw = "";
    try {
      raw = getComputedStyle(root).getPropertyValue("--dust-thread").trim();
    } catch (e) {
      raw = "";
    }
    var m = raw.match(/^#?([0-9a-f]{6})$/i);
    if (m) {
      var n = parseInt(m[1], 16);
      threadRGB = [ (n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255 ];
    }
  }
  function draw2D(ctx, w, h, dust, seed, t) {
    ctx.clearRect(0, 0, w, h);
    if (dust <= .001) {
      return;
    }
    var rnd = function(s) {
      var x = s * 9301 + 49297;
      return function() {
        x = (x * 9301 + 49297) % 233280;
        return x / 233280;
      };
    }(seed * 1e3 + 7);
    var col = "rgb(" + Math.round(threadRGB[0] * 255) + "," + Math.round(threadRGB[1] * 255) + "," + Math.round(threadRGB[2] * 255) + ")";
    ctx.save();
    ctx.globalAlpha = .1 + .16 * dust;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    var ax = -w * .05, ay = -h * .05;
    var reach = Math.max(w, h) * (.62 + .3 * dust);
    var spokes = 11;
    var sway = Math.sin(t * .4 + seed) * w * .004;
    var a0 = -.06, a1 = Math.PI / 2 + .06;
    var rings = Math.round(3 + 5 * dust);
    var base = Math.max(1, w / 260);
    function strands(width, stroke, alphaMul) {
      var i, j;
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.globalAlpha = (.3 + .45 * dust) * alphaMul;
      for (i = 0; i <= spokes; i++) {
        var a = a0 + (a1 - a0) * (i / spokes);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * reach + sway, ay + Math.sin(a) * reach);
        ctx.stroke();
      }
      for (j = 1; j <= rings; j++) {
        var rr = reach * Math.pow(j / (rings + 1), 1.35);
        ctx.beginPath();
        for (i = 0; i <= spokes; i++) {
          var aa = a0 + (a1 - a0) * (i / spokes);
          var x = ax + Math.cos(aa) * rr + sway;
          var y = ay + Math.sin(aa) * rr;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            var pa = a0 + (a1 - a0) * ((i - 1) / spokes);
            var ma = (pa + aa) / 2;
            var sag = rr * .985;
            ctx.quadraticCurveTo(ax + Math.cos(ma) * sag + sway, ay + Math.sin(ma) * sag, x, y);
          }
        }
        ctx.globalAlpha = (.26 + .4 * dust) * alphaMul;
        ctx.stroke();
      }
      ctx.restore();
    }
    strands(base * 2.6, "rgba(14,14,18,.55)", .45);
    strands(base, col, 1);
    var n = Math.round(18 * dust);
    ctx.save();
    ctx.fillStyle = col;
    for (i = 0; i < n; i++) {
      var mx = rnd() * w;
      var my = (rnd() * h + t * 6 * (.4 + rnd())) % h;
      var rad = (.6 + rnd() * 1.6) * (w / 220);
      ctx.globalAlpha = .15 + .35 * rnd();
      ctx.beginPath();
      ctx.arc(mx, my, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function makeVeil(el) {
    var veil = el.querySelector(":scope > .dust-veil");
    if (!veil) {
      veil = document.createElement("canvas");
      veil.className = "dust-veil";
      veil.setAttribute("aria-hidden", "true");
      el.appendChild(veil);
    }
    var rec = {
      el: el,
      canvas: veil,
      ctx: veil.getContext("2d"),
      dust: 0,
      target: 0,
      seed: 0,
      w: 0,
      h: 0,
      fade: 0,
      visible: true,
      dirty: true
    };
    targets.push(rec);
    return rec;
  }
  function findRec(el) {
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].el === el) {
        return targets[i];
      }
    }
    return null;
  }
  function sizeVeil(rec) {
    var r = rec.el.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (w !== rec.w || h !== rec.h) {
      rec.w = w;
      rec.h = h;
      rec.canvas.width = w;
      rec.canvas.height = h;
      rec.dirty = true;
    }
  }
  function renderOne(rec, t) {
    if (!rec.w || !rec.h) {
      return;
    }
    var ctx = rec.ctx;
    if (rec.dust <= .002 && rec.fade <= .002) {
      ctx.clearRect(0, 0, rec.w, rec.h);
      return;
    }
    if (broken || !gl) {
      draw2D(ctx, rec.w, rec.h, rec.dust * rec.fade, rec.seed, t);
      return;
    }
    gl.useProgram(prog);
    gl.uniform1f(uni.u_time, t);
    gl.uniform1f(uni.u_dust, rec.dust);
    gl.uniform1f(uni.u_seed, rec.seed);
    gl.uniform2f(uni.u_res, GL_W, GL_H);
    gl.uniform3f(uni.u_thread, threadRGB[0], threadRGB[1], threadRGB[2]);
    gl.uniform1f(uni.u_fade, rec.fade);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.clearRect(0, 0, rec.w, rec.h);
    try {
      ctx.drawImage(glCanvas, 0, 0, GL_W, GL_H, 0, 0, rec.w, rec.h);
    } catch (e) {
      broken = true;
    }
  }
  function frame(now) {
    if (!running) {
      return;
    }
    if (now - lastFrame < 33) {
      window.requestAnimationFrame(frame);
      return;
    }
    var dt = Math.min((now - lastFrame) / 1e3, .1);
    lastFrame = now;
    var t = (now - startTime) / 1e3;
    var anyLive = false;
    for (var i = 0; i < targets.length; i++) {
      var rec = targets[i];
      if (!rec.el.isConnected) {
        rec.canvas.remove();
        targets.splice(i, 1);
        i--;
        continue;
      }
      if (!rec.visible) {
        continue;
      }
      if (Math.abs(rec.dust - rec.target) > .001) {
        rec.dust += (rec.target - rec.dust) * Math.min(dt * 3.2, 1);
        rec.dirty = true;
      } else {
        rec.dust = rec.target;
      }
      var wantFade = rec.target > 0 ? 1 : 0;
      if (Math.abs(rec.fade - wantFade) > .001) {
        rec.fade += (wantFade - rec.fade) * Math.min(dt * 2.6, 1);
        rec.dirty = true;
      } else {
        rec.fade = wantFade;
      }
      if (rec.dust <= .002 && rec.fade <= .002) {
        if (rec.dirty) {
          sizeVeil(rec);
          renderOne(rec, t);
          rec.dirty = false;
        }
        continue;
      }
      anyLive = true;
      sizeVeil(rec);
      if (reduced()) {
        if (rec.dirty) {
          renderOne(rec, 0);
          rec.dirty = false;
        }
      } else {
        renderOne(rec, t);
      }
    }
    if (!anyLive && !targets.length) {
      running = false;
      return;
    }
    window.requestAnimationFrame(frame);
  }
  function start() {
    if (running) {
      return;
    }
    running = true;
    lastFrame = window.performance ? window.performance.now() : Date.now();
    startTime = lastFrame;
    window.requestAnimationFrame(frame);
  }
  var io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        var rec = findRec(e.target);
        if (rec) {
          rec.visible = e.isIntersecting;
          if (e.isIntersecting) {
            rec.dirty = true;
            start();
          }
        }
      });
    }, {
      rootMargin: "120px"
    });
  }
  function apply(el, days, seedKey) {
    if (!el) {
      return;
    }
    initGL();
    readThread();
    var rec = findRec(el);
    var lv = level(days);
    if (lv <= 0) {
      if (rec) {
        rec.target = 0;
        rec.dirty = true;
        el.classList.remove("is-dusty");
        start();
      }
      return;
    }
    if (!rec) {
      rec = makeVeil(el);
      rec.dust = 0;
      rec.fade = 0;
      if (io) {
        io.observe(el);
      }
    }
    rec.seed = seedOf(seedKey || el.getAttribute("data-dust-seed") || el.textContent);
    rec.target = lv;
    rec.dirty = true;
    el.classList.add("is-dusty");
    start();
  }
  function clear(el) {
    var rec = findRec(el);
    if (!rec) {
      return;
    }
    rec.target = 0;
    rec.dirty = true;
    el.classList.remove("is-dusty");
    start();
  }
  function scan(scope) {
    var host = scope || document;
    var nodes = host.querySelectorAll("[data-dust]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var days = Number(el.getAttribute("data-dust"));
      apply(el, days, el.getAttribute("data-dust-seed") || "");
    }
    for (var j = 0; j < targets.length; j++) {
      if (!targets[j].el.hasAttribute("data-dust")) {
        targets[j].target = 0;
        targets[j].dirty = true;
      }
    }
    if (nodes.length) {
      start();
    }
  }
  window.addEventListener("resize", function() {
    for (var i = 0; i < targets.length; i++) {
      targets[i].dirty = true;
    }
    start();
  });
  document.addEventListener("visibilitychange", function() {
    if (!document.hidden) {
      start();
    }
  });
  window.PTGCobweb = {
    scan: scan,
    set: apply,
    clear: clear,
    level: level,
    seedOf: seedOf,
    THRESHOLD: THRESHOLD,
    FULL: FULL,
    usingWebGL: function() {
      return !broken && !!gl;
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      scan(document);
    });
  } else {
    scan(document);
  }
})();
