/* Alternative hero visual for the "custom" build: the Arrow logo tiled across
 * the home page's hero panel, with ripples of light running through it.
 *
 * palette.js owns the choice (state.hero, set from the panel's "Hero animation"
 * dropdown, ?hero= or localStorage) and fires "arrow:palette" whenever it or the
 * colours change. This script then reads the choice and the --ar-* colour
 * variables. "original" leaves the site's own animation untouched.
 */
(function () {
  "use strict";

  // the logo from icon.svg (viewBox -4 0 40 40): rounded blocks forming the
  // arrow, plus four small sparkles, which flare as a ripple passes
  var BLOCKS = [
    [0, 15.5101, 3.26531, 8.97959], [6.53271, 7.34702, 4.89799, 8.16328],
    [19.4319, 7.34702, 5.71429, 8.16326], [14.5322, 0, 4.898, 7.34694],
    [14.5322, 32.6531, 4.898, 7.3469], [11.4321, 15.5101, 5.7143, 8.9796],
    [25.1443, 15.5101, 6.53061, 8.97959], [6.53271, 24.4899, 4.89799, 8.1633],
    [19.4319, 24.4899, 5.71429, 8.16326],
  ];
  var SPARKLES = [[11.4281, 15.5103], [19.4278, 7.34707], [19.4278, 32.6531], [25.1439, 15.5103],
                  [25.1439, 24.4899], [11.4281, 24.4898]];
  var RADIUS = 1.30613, LOGO_W = 31.675, LOGO_H = 40;
  var LEVELS = 24;  // pre-rendered brightness steps

  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var panel = null, canvas = null, ctx = null, mode = "original";
  var sprites = [], logos = [], size = 0, W = 0, H = 0, dpr = 1;
  var drops = [], raf = 0, visible = true, start = performance.now();

  // --- colours: follow the live palette -------------------------------------------
  function cssColour(key, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--ar-" + key).trim();
    return v || fallback;
  }
  function parseHex(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }); }
  function rgba(c, a) { return "rgba(" + c.join(",") + "," + a + ")"; }

  var colours = null;
  function readColours() {
    colours = {
      deep: parseHex(cssColour("190062", "#190062")),
      dark: parseHex(cssColour("280f85", "#280F85")),
      base: parseHex(cssColour("3820a9", "#3820A9")),
      mid: parseHex(cssColour("6b6fe8", "#6B6FE8")),
      peak: parseHex(cssColour("d6d8f3", "#D6D8F3")),
    };
  }

  // --- sprites: the logo at each brightness level, glow baked in ------------------
  function logoPath(sparkleScale) {
    var p = new Path2D();
    BLOCKS.forEach(function (b) { p.roundRect(b[0], b[1], b[2], b[3], RADIUS); });
    SPARKLES.forEach(function (s) {
      // four-point star of half-size 1.63 (as in the logo), scaled about its centre
      var r = 1.6327 * sparkleScale, x = s[0], y = s[1], k = 0.55;
      p.moveTo(x, y - r);
      p.bezierCurveTo(x, y - r * (1 - k), x + r * (1 - k), y, x + r, y);
      p.bezierCurveTo(x + r * (1 - k), y, x, y + r * (1 - k), x, y + r);
      p.bezierCurveTo(x, y + r * (1 - k), x - r * (1 - k), y, x - r, y);
      p.bezierCurveTo(x - r * (1 - k), y, x, y - r * (1 - k), x, y - r);
      p.closePath();
    });
    return p;
  }

  function buildSprites() {
    sprites = [];
    var scale = size / LOGO_H * dpr * 1.2;          // room for the 1.2x pop
    var pad = 20, w = Math.ceil(LOGO_W * scale + 2 * pad * dpr), h = Math.ceil(LOGO_H * scale + 2 * pad * dpr);
    for (var i = 0; i < LEVELS; i++) {
      var t = i / (LEVELS - 1);
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d");
      var fill = t < 0.5 ? mix(colours.base, colours.mid, t * 2) : mix(colours.mid, colours.peak, (t - 0.5) * 2);
      g.translate(w / 2, h / 2); g.scale(scale, scale); g.translate(-LOGO_W / 2, -LOGO_H / 2);
      if (t > 0) { g.shadowColor = rgba(colours.mid, 0.9 * t); g.shadowBlur = 18 * t * dpr; }
      g.fillStyle = rgba(fill, 0.42 + 0.58 * t);
      g.fill(logoPath(1 + 1.4 * t * t));
      sprites.push(c);
    }
  }

  // --- layout: a staggered grid of logos covering the panel -----------------------
  function layout() {
    // layout size, not the on-screen box: the panel is scaled while scrolling
    if (!panel.clientWidth || !panel.clientHeight) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = panel.clientWidth; H = panel.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    size = Math.max(22, Math.min(40, W / 34));
    var sx = size * 1.55, sy = size * 1.35;
    logos = [];
    for (var row = -1, y = -sy / 2; y < H + sy; row++, y += sy) {
      for (var x = (row % 2 ? sx / 2 : 0) - sx / 2; x < W + sx; x += sx) {
        logos.push({ x: x, y: y, phase: Math.random() * 6.283, rate: 0.6 + Math.random() * 0.8 });
      }
    }
    buildSprites();
  }

  // --- ripples ----------------------------------------------------------------------
  // a ring of light at distance r (sharp leading edge, softer tail) followed by
  // a fainter echo ring, like a ripple on water
  function ring(d, r, lead, tail) {
    var x = d - r, y = x + lead * 5;
    var main = x > 0 ? Math.exp(-(x * x) / (lead * lead)) : Math.exp(-(x * x) / (tail * tail));
    var echo = y > 0 ? Math.exp(-(y * y) / (lead * lead)) : Math.exp(-(y * y) / (tail * tail));
    return 1 - (1 - main) * (1 - 0.45 * echo);
  }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  // distance of a logo from a point, which makes circular ripples
  function from(x, y) { return function (L) { return Math.hypot(L.x - x, L.y - y); }; }

  // brightness 0..1 of every logo at time t (seconds)
  function field(t) {
    var diag = Math.hypot(W, H), lead = size * 0.9, tail = size * 2.2;
    var trail = lead * 5 + tail * 2;   // ring + echo: how far behind r light remains
    var out = new Float32Array(logos.length);
    var sources = [];
    if (mode === "ripple") {
      // rings from the centre, one every 3.2 s
      var P = 3.2, v = diag * 0.55 / 3.4, life = (diag * 0.55 + trail) / v;
      for (var k = Math.floor(t / P); k * P > t - life; k--) {
        sources.push({ dist: from(W / 2, H / 2), r: v * (t - k * P), amp: 1 });
      }
    } else if (mode === "sweep") {
      // a straight band crossing the panel diagonally, one every 3.2 s
      var P2 = 3.2, dir = [Math.cos(0.5), Math.sin(0.5)], span = W * dir[0] + H * dir[1];
      var v2 = (span + tail * 2) / 3.6;
      var along = function (L) { return L.x * dir[0] + L.y * dir[1]; };
      for (var k2 = Math.floor(t / P2); k2 * P2 > t - (span + tail + trail) / v2; k2--) {
        sources.push({ dist: along, r: v2 * (t - k2 * P2) - tail, amp: 1 });
      }
    } else if (mode === "arrow") {
      // a chevron pointing right (arms at 90 degrees) moving left to right, one
      // every 3.2 s; its echo follows as a second, fainter chevron
      var P4 = 3.2, cy = H / 2, span4 = (W + H / 2) * Math.SQRT1_2, v4 = (span4 + tail * 2) / 3.6;
      var chevron = function (L) { return (L.x + Math.abs(L.y - cy)) * Math.SQRT1_2; };
      for (var k4 = Math.floor(t / P4); k4 * P4 > t - (span4 + tail + trail) / v4; k4--) {
        sources.push({ dist: chevron, r: v4 * (t - k4 * P4) - tail, amp: 1 });
      }
    } else if (mode === "drops") {
      // rings from scattered points, a new one every 0.9 s, fading as they spread
      var P3 = 0.9, rmax = diag * 0.35, v3 = rmax / 2.6;
      for (var k3 = Math.floor(t / P3); k3 * P3 > t - 2.6; k3--) {
        var age = t - k3 * P3;
        sources.push({ dist: from(hash(k3) * W, hash(k3 + 0.5) * H), r: v3 * age, amp: 1 - age / 2.6 });
      }
    }
    // clicks/taps on the panel start a ring there too
    drops = drops.filter(function (d) { return t - d.t < 2.6; });
    drops.forEach(function (d) {
      var age = t - d.t; sources.push({ dist: from(d.x, d.y), r: diag * 0.4 / 2.6 * age, amp: 1 - age / 2.6 });
    });

    for (var i = 0; i < logos.length; i++) {
      var L = logos[i], dark = 1;
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j];
        dark *= 1 - s.amp * ring(s.dist(L), s.r, lead, tail);   // overlapping rings add like light
      }
      var twinkle = 0.05 * (1 + Math.sin(t * L.rate + L.phase));
      out[i] = Math.min(1, 1 - dark + twinkle);
    }
    return out;
  }

  function draw(now) {
    if (!ctx || !logos.length) return;
    var t = reduceMotion ? 1.6 : (now - start) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // panel background: deep colour with a soft lighter centre
    var g = ctx.createRadialGradient(canvas.width * 0.45, canvas.height * 0.4, 0,
                                     canvas.width * 0.45, canvas.height * 0.4, Math.hypot(canvas.width, canvas.height) * 0.6);
    g.addColorStop(0, rgba(colours.dark, 1)); g.addColorStop(1, rgba(colours.deep, 1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    var I = field(t), sw = sprites[0].width, sh = sprites[0].height;
    for (var i = 0; i < logos.length; i++) {
      var lvl = Math.round(I[i] * (LEVELS - 1)), k = (1 + 0.2 * I[i]) / 1.2;
      var w = sw * k, h = sh * k;
      ctx.drawImage(sprites[lvl], logos[i].x * dpr - w / 2, logos[i].y * dpr - h / 2, w, h);
    }
  }

  function loop(now) {
    raf = 0;
    if (mode === "original" || !canvas.isConnected) return;
    draw(now);
    if (!reduceMotion && visible) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && mode !== "original") raf = requestAnimationFrame(loop); }

  // --- mounting into the hero panel ----------------------------------------------------
  // hide the original canvas, its message overlay and its caption (opacity, as
  // the overlay's children set their own visibility)
  var STYLE = "[data-ar-hero] > canvas:not(.ar-hero-logos) { visibility: hidden }" +
              "[data-ar-hero] > div[aria-hidden=true], [data-ar-hero] > p { opacity: 0 }" +
              ".ar-hero-logos { position: absolute; inset: 0; width: 100%; height: 100%; display: block }";

  function mount() {
    panel = document.querySelector('[data-placeholder="panel"]');
    if (!panel) return false;
    if (!document.getElementById("ar-hero-style")) {
      var st = document.createElement("style"); st.id = "ar-hero-style"; st.textContent = STYLE;
      document.head.appendChild(st);
    }
    canvas = document.createElement("canvas");
    canvas.className = "ar-hero-logos"; canvas.setAttribute("aria-hidden", "true");
    ctx = canvas.getContext("2d");
    // just above the original canvas, so the panel's shading and card stay on top
    var orig = panel.querySelector("canvas");
    panel.insertBefore(canvas, orig ? orig.nextSibling : panel.firstChild);
    if (window.ResizeObserver) new ResizeObserver(function () { if (mode !== "original") { layout(); kick(); } }).observe(panel);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; kick(); }).observe(panel);
    }
    panel.addEventListener("pointerdown", function (e) {
      if (mode === "original") return;
      var r = panel.getBoundingClientRect(), k = panel.clientWidth / r.width;
      drops.push({ x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, t: (performance.now() - start) / 1000 });
      kick();
    });
    return true;
  }

  var hydrated = false;
  function update() {
    if (!hydrated) return;
    var s = window.ArrowPalette && window.ArrowPalette.state();
    var next = (s && s.hero) || "original";
    if (next !== "original" && !canvas && !mount()) return;
    if (!canvas) return;
    mode = next;
    if (mode === "original") { panel.removeAttribute("data-ar-hero"); canvas.style.display = "none"; return; }
    panel.setAttribute("data-ar-hero", mode);
    canvas.style.display = "";
    readColours();
    layout();
    kick();
  }

  // Touching the panel before React has hydrated it makes React throw the page
  // away and re-render it (error #418). React tags each node it has hydrated
  // with a __reactFiber$ key; wait for the panel's, then a frame more.
  function whenHydrated() {
    var el = document.querySelector('[data-placeholder="panel"]'), tries = 0;
    if (!el) return;  // no hero on this page
    (function check() {
      if (Object.keys(el).some(function (k) { return k.indexOf("__reactFiber$") === 0; }) || ++tries > 100) {
        requestAnimationFrame(function () { setTimeout(function () { hydrated = true; update(); }, 0); });
      } else setTimeout(check, 100);
    })();
  }
  if (document.readyState === "complete") whenHydrated(); else window.addEventListener("load", whenHydrated);
  window.addEventListener("arrow:palette", update);
})();
