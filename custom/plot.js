/* The home page research card's chart, redrawn for the "custom" build.
 *
 * The card shows the post's Figure 3 (time horizon against release date) as a
 * white matplotlib PNG laid over the card's dark panel. This draws the same
 * chart as SVG straight onto the panel instead: the site's type and the live
 * --ar-* palette, no white box, and details on hover.
 *
 * The numbers were digitised from figure-03.png (marker centres, error-bar caps
 * and the band's edges), so they are close to, not exactly, the source data.
 * palette.js owns the choice (state.plot: "chart" or "original").
 */
(function () {
  "use strict";

  // name, release date, 50% horizon (minutes), lower, upper (null: no cap
  // drawn), in the trend fit, o3-mini reasoning token equivalent
  var MODELS = [
    ["GPT-2", "2019-02-13", 0.001, null, 0.00487, 0, "1"],
    ["GPT-3", "2020-05-15", 0.04761, 0.001, null, 0, "1"],
    ["GPT-3.5", "2022-03-12", 0.28754, 0.00925, 0.42543, 1, "123"],
    ["GPT-4", "2023-03-13", 0.89868, 0.19092, null, 1, "290"],
    ["GPT-4 Turbo", "2024-04-05", 0.80762, 0.05791, null, 0, "401"],
    ["GPT-4o", "2024-05-11", 0.80762, 0.02645, null, 0, "455"],
    ["Sonnet 3.7", "2025-02-23", 1.13274, 0.25385, null, 1, "584"],
    ["Opus 4", "2025-05-13", 1.15309, 0.33752, null, 1, "612"],
    ["Opus 4.1", "2025-08-02", 1.3535, 0.44085, 1.73667, 1, "825"],
    ["Opus 4.5", "2025-10-31", 2.43581, 0.38919, 93.72963, 1, "1.4k"],
    ["Opus 4.6", "2026-02-01", 2.47956, 0.54102, 40.5913, 1, "1.3k"],
    ["GPT-5.4", "2026-02-28", 1.37782, 0.11805, 6.72071, 0, "961"],
    ["GPT-5.5", "2026-03-29", 2.66261, 0.60741, 73.04946, 1, "1.5k"],
    ["Opus 4.7", "2026-04-21", 3.01604, 0.82948, 62.23308, 1, "1.5k"],
  ];
  // labelled models: [dx, dy, anchor] from the marker; fewer on narrow screens
  var LABELS = {
    "GPT-2": [8, 16], "GPT-3": [8, -9], "GPT-3.5": [8, -9], "GPT-4": [8, -9], "GPT-4o": [8, 16],
    "Opus 4.7": [-9, -9, "end"],
  };
  var LABELS_NARROW = { "GPT-2": [8, 16], "GPT-3": [8, 14], "GPT-4": [-8, -8, "end"] };
  // the post's rough estimate: 8 min to 1 hr, probably 15-40 min
  var ASTRA = { date: "2026-08-30", lo: 8, hi: 60, likelyLo: 15, likelyHi: 40 };
  // log-linear fit (doubling every 373 days), solid over the fitted models
  var TREND = [["2018-11-15", 0.01444], ["2028-03-02", 7.88879]];
  var FIT_SPAN = ["2022-03-12", "2026-04-21"];
  // band around the fit: date, lower, upper (minutes)
  var BAND = [
    ["2018-11-21", 0.00022, 0.11392], ["2019-04-15", 0.00038, 0.13136], ["2019-09-08", 0.00066, 0.15147],
    ["2020-01-31", 0.00119, 0.17779], ["2020-06-25", 0.00211, 0.20501], ["2020-11-17", 0.0036, 0.24064],
    ["2021-04-11", 0.00614, 0.28247], ["2021-09-04", 0.0103, 0.33156], ["2022-01-27", 0.01695, 0.38919],
    ["2022-06-22", 0.02693, 0.47339], ["2022-11-14", 0.04056, 0.57581], ["2023-04-09", 0.06001, 0.71298],
    ["2023-09-01", 0.09038, 0.93125], ["2024-01-25", 0.13136, 1.3535], ["2024-06-18", 0.18424, 2.189],
    ["2024-11-10", 0.24937, 3.60384], ["2025-04-05", 0.33752, 6.03974], ["2025-08-28", 0.45683, 10.48905],
    ["2026-01-21", 0.57581, 18.21607], ["2026-06-15", 0.73882, 31.07708], ["2026-11-08", 0.93125, 56.93208],
    ["2027-04-02", 1.15309, 102.45688], ["2027-08-26", 1.42777, 187.69732], ["2028-01-18", 1.73667, 325.9691],
    ["2028-02-28", 1.83196, 382.62389],
  ];
  var Y_TICKS = [[0.1 / 60, "0.1 s"], [1 / 60, "1 s"], [10 / 60, "10 s"], [1, "1 min"],
                 [10, "10 min"], [60, "1 hr"], [480, "8 hrs"]];
  var X_DOMAIN = [Date.UTC(2018, 9, 1), Date.UTC(2028, 3, 1)];
  var Y_DOMAIN = [0.03 / 60, 720];
  var SVGNS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var box = null, wrap = null, svg = null, tip = null, mode = "original", shown = false, lastW = 0;

  function cssColour(key, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--ar-" + key).trim();
    return v || fallback;
  }
  function t(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function duration(m) {
    if (m < 1 / 60) return (m * 60).toFixed(2) + " s";
    if (m < 1) { var s = m * 60; return (s < 10 ? s.toFixed(1) : Math.round(s)) + " s"; }
    if (m < 60) return (m < 10 ? m.toFixed(1) : Math.round(m)) + " min";
    var h = m / 60; return (h < 10 ? h.toFixed(1) : Math.round(h)) + " hrs";
  }
  function monthYear(iso) { var p = iso.split("-"); return MONTHS[+p[1] - 1] + " " + p[0]; }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  // --- drawing ----------------------------------------------------------------------
  function draw() {
    var W = wrap.clientWidth;
    if (!W) return;
    lastW = W;
    var narrow = W < 420, fs = narrow ? 10 : 11;
    var H = Math.round(Math.min(Math.max(W * 0.72, 260), 460));
    var m = { l: narrow ? 40 : 46, r: 10, t: 30, b: 24 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var ly0 = Math.log(Y_DOMAIN[0]), ly1 = Math.log(Y_DOMAIN[1]);
    var X = function (ms) { return m.l + (ms - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0]) * iw; };
    var Y = function (min) { return m.t + ih - (Math.log(min) - ly0) / (ly1 - ly0) * ih; };
    var c = {
      text: cssColour("d6d8f3", "#d6d8f3"), light: cssColour("b6bdfa", "#b6bdfa"),
      accent: cssColour("96a3ff", "#96a3ff"), panel: cssColour("190062", "#190062"),
      warm: cssColour("f8f3eb", "#f8f3eb"),
    };

    if (svg) svg.remove();
    svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img",
                      "aria-label": "Figure 3: Comparing our rough guess for Astra’s time horizon with the " +
                      "pre-existing no-CoT data. Task length models complete with 50% success, by release " +
                      "date, doubling every 373 days." });
    svg.style.cssText = "display:block;width:100%;height:auto;overflow:visible;font:inherit;" +
                        "font-variant-numeric:tabular-nums";
    var clip = el("clipPath", { id: "ar-plot-clip" }, el("defs", {}, svg));
    el("rect", { x: m.l, y: m.t, width: iw, height: ih }, clip);

    // grid and axes
    var grid = el("g", { "font-size": fs, fill: c.text }, svg);
    Y_TICKS.forEach(function (tk) {
      var y = Y(tk[0]);
      el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, stroke: c.text, "stroke-opacity": 0.1 }, grid);
      el("text", { x: m.l - 8, y: y + 3.5, "text-anchor": "end", "fill-opacity": 0.6 }, grid).textContent = tk[1];
    });
    for (var yr = 2019; yr <= 2028; yr++) {
      var x = X(Date.UTC(yr, 0, 1));
      el("line", { x1: x, x2: x, y1: m.t + ih, y2: m.t + ih + 4, stroke: c.text, "stroke-opacity": 0.3 }, grid);
      if (narrow && yr % 2) continue;
      el("text", { x: x, y: m.t + ih + 17, "text-anchor": "middle", "fill-opacity": 0.6 }, grid)
        .textContent = narrow ? "’" + String(yr).slice(2) : yr;
    }
    el("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, stroke: c.text, "stroke-opacity": 0.3 }, grid);
    el("text", { x: m.l - (narrow ? 34 : 40), y: 12, "fill-opacity": 0.75 }, grid)
      .textContent = "Task length models complete with 50% success";

    // trend band and line
    var plot = el("g", { "clip-path": "url(#ar-plot-clip)" }, svg);
    var upper = BAND.map(function (b) { return X(t(b[0])) + "," + Y(b[2]); });
    var lower = BAND.slice().reverse().map(function (b) { return X(t(b[0])) + "," + Y(b[1]); });
    el("polygon", { points: upper.concat(lower).join(" "), fill: c.light, "fill-opacity": 0.1,
                    class: "ar-plot-band" }, plot);
    var slope = (Math.log(TREND[1][1]) - Math.log(TREND[0][1])) / (t(TREND[1][0]) - t(TREND[0][0]));
    var at = function (ms) { return Math.exp(Math.log(TREND[0][1]) + slope * (ms - t(TREND[0][0]))); };
    var f0 = t(FIT_SPAN[0]), f1 = t(FIT_SPAN[1]), a0 = t(TREND[0][0]), a1 = t(TREND[1][0]);
    var dashed = { stroke: c.accent, "stroke-width": 2, "stroke-dasharray": "5 5", "stroke-opacity": 0.55,
                   class: "ar-plot-band" };
    el("line", Object.assign({ x1: X(a0), y1: Y(at(a0)), x2: X(f0), y2: Y(at(f0)) }, dashed), plot);
    el("line", Object.assign({ x1: X(f1), y1: Y(at(f1)), x2: X(a1), y2: Y(at(a1)) }, dashed), plot);
    var solid = el("line", { x1: X(f0), y1: Y(at(f0)), x2: X(f1), y2: Y(at(f1)), stroke: c.accent,
                             "stroke-width": 2.5, "stroke-linecap": "round", class: "ar-plot-trend" }, plot);

    // models: error bars, marker, a few labels
    var marks = el("g", {}, svg), targets = [];
    MODELS.forEach(function (d, i) {
      var x = X(t(d[1])), y = Y(d[2]);
      var g = el("g", { class: "ar-plot-pt" }, marks);
      g.style.setProperty("--i", i);
      var bar = { stroke: c.text, "stroke-opacity": 0.35, "stroke-width": 1.5 };
      el("line", Object.assign({ x1: x, x2: x, y1: Y(d[3] || d[2]), y2: Y(d[4] || d[2]) }, bar), g);
      [d[3], d[4]].forEach(function (v) {
        if (v) el("line", Object.assign({ x1: x - 3.5, x2: x + 3.5, y1: Y(v), y2: Y(v) }, bar), g);
      });
      var r = narrow ? 4.5 : 5.5;
      el("circle", d[5] ? { cx: x, cy: y, r: r, fill: c.light, stroke: c.panel, "stroke-width": 1.5 }
                        : { cx: x, cy: y, r: r - 0.75, fill: c.panel, stroke: c.text, "stroke-opacity": 0.6,
                            "stroke-width": 1.5 }, g);
      var lab = (narrow ? LABELS_NARROW : LABELS)[d[0]];
      if (lab) {
        el("text", { x: x + lab[0], y: y + lab[1], "text-anchor": lab[2] || "start", "font-size": fs,
                     fill: c.text, "fill-opacity": 0.75 }, g).textContent = d[0];
      }
      targets.push({ x: x, y: y, html: tipFor(d) });
    });

    // GPT-6 Astra: the full range, the likely part thicker, in the page's warm tone
    var ax = X(t(ASTRA.date));
    var astra = el("g", { class: "ar-plot-pt" }, svg);
    astra.style.setProperty("--i", MODELS.length + 2);
    el("line", { x1: ax, x2: ax, y1: Y(ASTRA.lo), y2: Y(ASTRA.hi), stroke: c.warm, "stroke-width": 2 }, astra);
    [ASTRA.lo, ASTRA.hi].forEach(function (v) {
      el("line", { x1: ax - 5, x2: ax + 5, y1: Y(v), y2: Y(v), stroke: c.warm, "stroke-width": 2 }, astra);
    });
    el("rect", { x: ax - 3.5, y: Y(ASTRA.likelyHi), width: 7, height: Y(ASTRA.likelyLo) - Y(ASTRA.likelyHi),
                 rx: 3.5, fill: c.warm }, astra);
    // beside the bar where there's room, else above it
    var lx = narrow ? ax + 6 : ax + 10, ly = narrow ? Y(ASTRA.hi) - 22 : Y(ASTRA.hi) + 4;
    var anchor = narrow ? "end" : "start";
    el("text", { x: lx, y: ly, "text-anchor": anchor, "font-size": fs + 1, "font-weight": 500,
                 fill: c.warm }, astra).textContent = "GPT-6 Astra";
    el("text", { x: lx, y: ly + 14, "text-anchor": anchor, "font-size": fs, fill: c.warm,
                 "fill-opacity": 0.75 }, astra).textContent = "rough estimate";
    targets.push({ x: ax, y: Y(Math.sqrt(ASTRA.likelyLo * ASTRA.likelyHi)), html:
      "<b>GPT-6 Astra</b> · rough estimate<br>50% no-CoT horizon: 8 min – 1 hr<br>Probably 15–40 min" });

    // legend and fit summary
    var key = el("g", { "font-size": fs, fill: c.text, "fill-opacity": 0.75 }, svg);
    var kx = m.l + 10, ky = m.t + 12;
    el("circle", { cx: kx, cy: ky - 3.5, r: 4, fill: c.light }, key);
    el("text", { x: kx + 9, y: ky }, key).textContent = "In trend fit";
    el("circle", { cx: kx, cy: ky + 12.5, r: 3.5, fill: "none", stroke: c.text, "stroke-opacity": 0.8,
                   "stroke-width": 1.5 }, key);
    el("text", { x: kx + 9, y: ky + 16 }, key).textContent = "Not in fit";
    el("text", { x: m.l + iw - 4, y: m.t + ih - 10, "text-anchor": "end", "font-size": fs + 1, fill: c.accent }, svg)
      .textContent = narrow ? "Doubles every 373 days · R² 0.84" : "Doubles every 373 days [167–691] · R² = 0.84";

    // hover: details for the nearest point within reach
    var nearest = function (px, py) {
      var best = null, bd = 28 * 28;
      targets.forEach(function (p) {
        var dd = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
        if (dd < bd) { bd = dd; best = p; }
      });
      return best;
    };
    svg.addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect(), k = W / r.width;
      showTip(nearest((e.clientX - r.left) * k, (e.clientY - r.top) * k), W);
    });
    svg.addEventListener("pointerleave", function () { showTip(null); });

    svg.dataset.trendLength = String(Math.hypot(X(f1) - X(f0), Y(at(f1)) - Y(at(f0))));
    if (!shown) svg.classList.add("ar-plot-hidden");
    wrap.insertBefore(svg, tip);
    return solid;
  }

  function tipFor(d) {
    var range = d[3] && d[4] ? duration(d[3]) + " – " + duration(d[4])
              : d[3] ? "down to " + duration(d[3]) : "up to " + duration(d[4]);
    return "<b>" + d[0] + "</b> · " + monthYear(d[1]) + "<br>50% horizon: " + duration(d[2]) +
           " <span style='opacity:.65'>(" + range + ")</span><br>o3-mini token equivalent: " + d[6] +
           (d[5] ? "" : "<br><span style='opacity:.65'>Not in the trend fit</span>");
  }
  function showTip(p, W) {
    if (!p) { tip.style.opacity = "0"; return; }
    tip.innerHTML = p.html;
    tip.style.opacity = "1";
    var k = wrap.clientWidth / W, x = p.x * k, y = p.y * k;
    var left = Math.min(Math.max(x - tip.offsetWidth / 2, 0), wrap.clientWidth - tip.offsetWidth);
    var above = y - tip.offsetHeight - 12;
    tip.style.transform = "translate(" + left + "px," + (above < 0 ? y + 14 : above) + "px)";
  }

  // --- mounting ------------------------------------------------------------------------
  var STYLE =
    "[data-ar-plot=chart]{background:transparent!important;padding:0!important}" +
    "[data-ar-plot=chart] > img{display:none}" +
    ".ar-plot{position:relative;z-index:10;cursor:pointer}" +
    ".ar-plot-tip{position:absolute;left:0;top:0;pointer-events:none;opacity:0;max-width:16rem;" +
    "padding:.5rem .65rem;border-radius:.5rem;font-size:.75rem;line-height:1.45;" +
    "background:var(--ar-f8f3eb,#f8f3eb);color:var(--ar-0e0c1c,#0e0c1c);" +
    "box-shadow:0 6px 20px rgb(0 0 0/.25);transition:opacity .15s}" +
    ".ar-plot-pt{transition:opacity .5s ease-out calc(var(--i)*45ms + .5s)," +
    "transform .5s cubic-bezier(.165,.84,.44,1) calc(var(--i)*45ms + .5s)}" +
    ".ar-plot-band{transition:opacity .9s ease-out}" +
    ".ar-plot-trend{transition:stroke-dashoffset 1.2s cubic-bezier(.625,.05,0,1) .2s}" +
    ".ar-plot-hidden .ar-plot-pt{opacity:0;transform:translateY(6px)}" +
    ".ar-plot-hidden .ar-plot-band{opacity:0}";

  function render() {
    var solid = draw();
    if (!solid || shown) return;
    var len = +svg.dataset.trendLength;
    solid.style.strokeDasharray = len; solid.style.strokeDashoffset = len;
  }
  function reveal() {
    shown = true;
    if (!svg) return;
    svg.classList.remove("ar-plot-hidden");
    var solid = svg.querySelector(".ar-plot-trend");
    if (solid) solid.style.strokeDashoffset = 0;
  }

  function mount() {
    var img = document.querySelector('article img[alt^="Figure 3"]');
    if (!img) return false;
    box = img.parentElement;
    if (!document.getElementById("ar-plot-style")) {
      var st = document.createElement("style"); st.id = "ar-plot-style"; st.textContent = STYLE;
      document.head.appendChild(st);
    }
    wrap = document.createElement("div");
    wrap.className = "ar-plot";
    tip = document.createElement("div"); tip.className = "ar-plot-tip"; tip.setAttribute("aria-hidden", "true");
    wrap.appendChild(tip);
    box.appendChild(wrap);
    // the whole card links to the post; keep that for clicks on the chart
    wrap.addEventListener("click", function () {
      var a = box.closest("article").querySelector("h2 a"); if (a) a.click();
    });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (mode === "chart" && wrap.clientWidth !== lastW) render(); }).observe(wrap);
    }
    if (reduceMotion || !window.IntersectionObserver) shown = true;
    else new IntersectionObserver(function (e, obs) {
      if (e[0].isIntersecting) { obs.disconnect(); requestAnimationFrame(reveal); }
    }, { threshold: 0.35 }).observe(wrap);
    return true;
  }

  var hydrated = false;
  function update() {
    if (!hydrated) return;
    var s = window.ArrowPalette && window.ArrowPalette.state();
    var next = (s && s.plot) || "original";
    if (next === "chart" && !wrap && !mount()) return;
    if (!wrap) return;
    mode = next;
    box.setAttribute("data-ar-plot", mode);
    wrap.style.display = mode === "chart" ? "" : "none";
    if (mode === "chart") render();
  }

  // wait for React to hydrate the card before touching it (see hero.js)
  function whenHydrated() {
    var img = document.querySelector('article img[alt^="Figure 3"]'), tries = 0;
    if (!img) return;  // not the home page
    (function check() {
      if (Object.keys(img).some(function (k) { return k.indexOf("__reactFiber$") === 0; }) || ++tries > 100) {
        requestAnimationFrame(function () { setTimeout(function () { hydrated = true; update(); }, 0); });
      } else setTimeout(check, 100);
    })();
  }
  if (document.readyState === "complete") whenHydrated(); else window.addEventListener("load", whenHydrated);
  window.addEventListener("arrow:palette", update);
})();
