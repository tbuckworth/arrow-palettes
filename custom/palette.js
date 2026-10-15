/* Live palette for the "custom" build of the Arrow Research mockup.
 *
 * build.py rewrites every brand colour in the site as var(--ar-<original hex>).
 * This script, loaded synchronously at the top of <head>, derives values for
 * those variables from one chosen main colour plus a background choice, applies
 * them before first paint, and adds a small "Colours" panel to change them live.
 *
 * Derivation works in OKLCH relative to the original primary (#3820A9): each
 * original brand colour keeps its lightness/chroma/hue relationship to the
 * primary, re-anchored on the chosen colour. Picking #3820A9 with the original
 * background reproduces the original site exactly.
 */
(function () {
  "use strict";

  var PRIMARY = "3820a9";
  var INK = "0e0c1c";
  var BRAND = ["0e0c1c", "190062", "280f85", "3820a9", "4b34cf", "6b6fe8", "8c84b8",
               "96a3ff", "a99bff", "b6bdfa", "d6d8f3"];
  var BACKGROUND = ["f8f3eb", "e5decf", "c4beb3", "3a2e22"];
  var PAGE = "f8f3eb";
  var UMBER = "3a2e22";
  var DEFAULT = { main: PRIMARY, bg: "original" };

  var MAIN_PRESETS = [
    ["Original purple", "3820a9"], ["Burnt orange", "a8460f"], ["Forest green", "2a5a35"],
    ["Navy", "1f4e99"], ["Teal", "0f6670"], ["Slate", "3d4a5c"],
  ];
  // Each background is the colour that replaces the original page beige
  // (#f8f3eb); the stone/umber tones follow it. "main" tints it with the main hue.
  var BG_PRESETS = [
    ["original", "Beige (original)", null],
    ["warm-grey", "Warm grey", "f3f2ef"],
    ["grey", "Neutral grey", "f3f3f3"],
    ["cool-grey", "Cool grey", "f0f2f5"],
    ["greige", "Greige", "efebe5"],
    ["stone", "Stone", "e9e4dc"],
    ["taupe", "Taupe", "e7e0d7"],
    ["mushroom", "Mushroom", "e1d9ce"],
    ["kraft", "Kraft brown", "e3d5c3"],
    ["tinted", "Tinted from main colour", "main"],
  ];

  // --- colour maths: sRGB <-> OKLab/OKLCH ------------------------------------
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function hexToRgb(h) { return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function rgbToHex(rgb) {
    return rgb.map(function (c) { return ("0" + Math.round(Math.min(255, Math.max(0, c))).toString(16)).slice(-2); }).join("");
  }
  function hexToOklch(h) {
    var rgb = hexToRgb(h).map(toLin);
    var l = Math.cbrt(0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2]);
    var m = Math.cbrt(0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2]);
    var s = Math.cbrt(0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2]);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
  }
  function oklchToLinear(L, C, h) {
    var a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function oklchToHex(L, C, h) {
    // keep lightness and hue, reduce chroma until the colour fits in sRGB
    L = Math.min(1, Math.max(0, L));
    var inGamut = function (c) {
      return oklchToLinear(L, c, h).every(function (v) { return v >= -1e-4 && v <= 1 + 1e-4; });
    };
    if (!inGamut(C)) {
      var lo = 0, hi = C;
      for (var i = 0; i < 24; i++) { var mid = (lo + hi) / 2; if (inGamut(mid)) lo = mid; else hi = mid; }
      C = lo;
    }
    return rgbToHex(oklchToLinear(L, C, h).map(function (v) { return fromLin(Math.min(1, Math.max(0, v))) * 255; }));
  }
  function luminance(h) {
    var c = hexToRgb(h).map(toLin);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(h1, h2) {
    var a = luminance(h1) + 0.05, b = luminance(h2) + 0.05;
    return Math.max(a, b) / Math.min(a, b);
  }

  // --- derivation ---------------------------------------------------------------
  var ORIG = {};
  BRAND.concat(BACKGROUND).forEach(function (k) { ORIG[k] = hexToOklch(k); });

  function deriveBrand(main) {
    var P = ORIG[PRIMARY], M = hexToOklch(main);
    var chromaRatio = P[1] > 0 ? M[1] / P[1] : 0;
    var hueShift = M[2] - P[2];
    var out = {};
    BRAND.forEach(function (k) {
      if (k === PRIMARY) { out[k] = main; return; }
      var o = ORIG[k], L;
      if (k === INK) {
        // ink is body text and the dark sections: stays near-black, takes a tint
        out[k] = oklchToHex(o[0], o[1] * Math.min(chromaRatio, 1.5), o[2] + hueShift);
        return;
      }
      // lightness: piecewise-linear map that sends the original primary's
      // lightness to the new one and keeps black/white fixed
      L = o[0] <= P[0] ? o[0] * M[0] / P[0] : M[0] + (o[0] - P[0]) * (1 - M[0]) / (1 - P[0]);
      out[k] = oklchToHex(L, o[1] * chromaRatio, o[2] + hueShift);
    });
    return out;
  }

  function deriveBackground(id, main) {
    var preset = BG_PRESETS.filter(function (p) { return p[0] === id; })[0] || BG_PRESETS[0];
    var out = {};
    if (!preset[2]) { BACKGROUND.forEach(function (k) { out[k] = k; }); return out; }
    var page = ORIG[PAGE];
    var target = preset[2] === "main" ? [page[0], 0.012, hexToOklch(main)[2]] : hexToOklch(preset[2]);
    // the other tones keep their lightness offset, chroma ratio and hue offset
    // from the page colour (umber, a dark overlay tint, keeps its lightness)
    BACKGROUND.forEach(function (k) {
      var o = ORIG[k];
      var L = k === UMBER ? o[0] : o[0] + target[0] - page[0];
      var C = Math.min(0.08, o[1] * target[1] / page[1]);
      out[k] = oklchToHex(L, C, o[2] + target[2] - page[2]);
    });
    if (preset[2] !== "main") out[PAGE] = preset[2];
    return out;
  }

  function derive(state) {
    var pal = deriveBrand(state.main), bg = deriveBackground(state.bg, state.main);
    Object.keys(bg).forEach(function (k) { pal[k] = bg[k]; });
    return pal;
  }

  // --- applying -------------------------------------------------------------------
  var current = null, canvasTimer = 0;

  // Canvas code can't read CSS variables; patched chunks call this instead.
  window.__arrowMap = function (str) {
    if (!current || typeof str !== "string") return str;
    var m = /^#([0-9a-f]{6})$/i.exec(str);
    if (m) { var k = m[1].toLowerCase(); return current[k] ? "#" + current[k] : str; }
    m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(str);
    if (m) {
      var key = rgbToHex([+m[1], +m[2], +m[3]]);
      if (!current[key]) return str;
      var rgb = hexToRgb(current[key]);
      return "rgba(" + rgb.join(",") + "," + (m[4] === undefined ? 1 : m[4]) + ")";
    }
    return str;
  };

  function apply(state, opts) {
    current = derive(state);
    var root = document.documentElement.style;
    Object.keys(current).forEach(function (k) { root.setProperty("--ar-" + k, "#" + current[k]); });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#" + current["190062"]);
    // canvases rebuild their colour ramps on this event; debounce while dragging
    clearTimeout(canvasTimer);
    canvasTimer = setTimeout(function () { window.dispatchEvent(new Event("arrow:palette")); },
                             opts && opts.immediate ? 0 : 150);
  }

  // --- state: ?main=&bg= in the URL, else localStorage, else the original ------------
  function validHex(h) { return typeof h === "string" && /^[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null; }
  function validBg(id) { return BG_PRESETS.some(function (p) { return p[0] === id; }) ? id : null; }
  function load() {
    var state = { main: DEFAULT.main, bg: DEFAULT.bg };
    try {
      var saved = JSON.parse(localStorage.getItem("arrow-palette") || "{}");
      state.main = validHex(saved.main) || state.main;
      state.bg = validBg(saved.bg) || state.bg;
    } catch (e) { /* storage unavailable: use defaults */ }
    var q = new URLSearchParams(location.search);
    state.main = validHex((q.get("main") || "").replace("#", "")) || state.main;
    state.bg = validBg(q.get("bg")) || state.bg;
    return state;
  }
  function save(state) {
    try { localStorage.setItem("arrow-palette", JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function shareUrl(state) {
    var u = new URL(location.href);
    u.searchParams.set("main", state.main);
    u.searchParams.set("bg", state.bg);
    return u.toString();
  }

  var state = load();
  apply(state, { immediate: true });

  // --- the panel ------------------------------------------------------------------
  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:8px;",
    " padding:8px 14px 8px 8px;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#fff;color:#111;",
    " font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px -8px rgba(0,0,0,.35)}",
    ".toggle .dot{width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2)}",
    ".panel{position:fixed;right:16px;bottom:68px;z-index:2147483000;width:340px;max-width:calc(100vw - 32px);",
    " max-height:calc(100vh - 100px);overflow:auto;padding:16px;border-radius:14px;background:#fff;color:#111;",
    " border:1px solid rgba(0,0,0,.1);box-shadow:0 24px 64px -16px rgba(0,0,0,.45);font-size:13px;line-height:1.4}",
    ".panel[hidden]{display:none}",
    "h3{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#555}",
    "section+section{margin-top:16px;padding-top:14px;border-top:1px solid #eee}",
    ".row{display:flex;align-items:center;gap:10px}",
    "input[type=color]{width:44px;height:44px;padding:0;border:1px solid #ccc;border-radius:10px;background:none;cursor:pointer}",
    "input[type=color]::-webkit-color-swatch-wrapper{padding:3px}input[type=color]::-webkit-color-swatch{border:none;border-radius:7px}",
    ".hex{flex:1;height:36px;padding:0 10px;border:1px solid #ccc;border-radius:8px;font:500 14px ui-monospace,Menlo,monospace;color:#111}",
    ".slider{display:grid;grid-template-columns:14px 1fr 34px;align-items:center;gap:8px;margin-top:8px}",
    ".slider b{font-size:12px;color:#444}.slider output{font:12px ui-monospace,Menlo,monospace;text-align:right;color:#333}",
    "input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:12px;border-radius:6px;margin:0;cursor:pointer}",
    "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #222;box-shadow:0 1px 3px rgba(0,0,0,.3)}",
    "input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #222}",
    ".presets{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}",
    ".presets button{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);cursor:pointer;padding:0}",
    ".presets button[aria-pressed=true]{box-shadow:0 0 0 2px #111}",
    "select{width:100%;height:36px;padding:0 8px;border:1px solid #ccc;border-radius:8px;background:#fff;font-size:14px;color:#111}",
    ".strip{display:grid;grid-template-columns:repeat(15,1fr);height:28px;border-radius:6px;overflow:hidden;border:1px solid rgba(0,0,0,.1)}",
    ".strip span{display:block}",
    ".note{margin-top:6px;color:#555}.warn{color:#a33}",
    ".actions{display:flex;gap:8px}",
    ".actions button{flex:1;height:34px;border-radius:8px;border:1px solid #ccc;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#111}",
    ".actions button.primary{background:#111;border-color:#111;color:#fff}",
  ].join("");

  function buildPanel() {
    var host = document.createElement("arrow-palette");
    var root = host.attachShadow({ mode: "open" });
    var sliders = ["R", "G", "B"].map(function (c, i) {
      return '<label class="slider"><b>' + c + '</b><input type="range" min="0" max="255" data-ch="' + i +
             '"><output></output></label>';
    }).join("");
    root.innerHTML = "<style>" + CSS + "</style>" +
      '<button class="toggle" aria-expanded="false"><span class="dot"></span>Colours</button>' +
      '<div class="panel" hidden role="dialog" aria-label="Colour settings">' +
      "<section><h3>Main colour</h3>" +
      '<div class="row"><input type="color" aria-label="Pick main colour">' +
      '<input class="hex" maxlength="7" spellcheck="false" aria-label="Hex code"></div>' + sliders +
      '<div class="presets"></div><div class="note contrast"></div></section>' +
      "<section><h3>Background</h3><select></select></section>" +
      '<section><h3>Derived palette</h3><div class="strip"></div>' +
      '<div class="note">Everything else is derived from the main colour.</div></section>' +
      '<section class="actions"><button class="reset">Reset</button><button class="primary copy">Copy link</button></section>' +
      "</div>";

    var $ = function (sel) { return root.querySelector(sel); };
    var toggle = $(".toggle"), panel = $(".panel"), picker = $("input[type=color]"), hex = $(".hex");
    var ranges = Array.prototype.slice.call(root.querySelectorAll("input[type=range]"));
    var select = $("select"), strip = $(".strip"), presets = $(".presets");

    BG_PRESETS.forEach(function (p) {
      var o = document.createElement("option"); o.value = p[0]; o.textContent = p[1]; select.appendChild(o);
    });
    MAIN_PRESETS.forEach(function (p) {
      var b = document.createElement("button");
      b.title = p[0]; b.setAttribute("aria-label", p[0]); b.style.background = "#" + p[1]; b.dataset.hex = p[1];
      b.addEventListener("click", function () { set({ main: p[1] }); });
      presets.appendChild(b);
    });

    function render() {
      var rgb = hexToRgb(state.main);
      toggle.querySelector(".dot").style.background = "#" + state.main;
      picker.value = "#" + state.main;
      if (root.activeElement !== hex) hex.value = "#" + state.main.toUpperCase();
      ranges.forEach(function (r, i) {
        var lo = rgb.slice(), hi = rgb.slice(); lo[i] = 0; hi[i] = 255;
        r.value = rgb[i];
        r.style.background = "linear-gradient(to right,#" + rgbToHex(lo) + ",#" + rgbToHex(hi) + ")";
        r.nextElementSibling.textContent = rgb[i];
      });
      select.value = state.bg;
      Array.prototype.forEach.call(presets.children, function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.hex === state.main));
      });
      strip.innerHTML = BRAND.concat(BACKGROUND).map(function (k) {
        return '<span title="#' + current[k].toUpperCase() + '" style="background:#' + current[k] + '"></span>';
      }).join("");
      var c = contrast(state.main, "ffffff");
      var el = $(".contrast");
      el.textContent = "White text on buttons: " + c.toFixed(1) + ":1" +
        (c >= 4.5 ? " (passes AA)" : c >= 3 ? " (AA for large text only)" : " (too low to read)");
      el.className = "note contrast" + (c < 3 ? " warn" : "");
    }

    function set(patch) {
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      apply(state);
      save(state);
      render();
    }

    toggle.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
    });
    picker.addEventListener("input", function () { set({ main: picker.value.slice(1).toLowerCase() }); });
    hex.addEventListener("input", function () {
      var v = validHex(hex.value.trim().replace("#", ""));
      if (v) set({ main: v });
    });
    hex.addEventListener("blur", render);
    ranges.forEach(function (r) {
      r.addEventListener("input", function () {
        var rgb = hexToRgb(state.main); rgb[+r.dataset.ch] = +r.value; set({ main: rgbToHex(rgb) });
      });
    });
    select.addEventListener("change", function () { set({ bg: select.value }); });
    $(".reset").addEventListener("click", function () { set({ main: DEFAULT.main, bg: DEFAULT.bg }); });
    $(".copy").addEventListener("click", function () {
      var btn = this, url = shareUrl(state);
      var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy link"; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt("Link:", url); });
      else prompt("Link:", url);
    });

    render();
    document.body.appendChild(host);
  }

  // add the panel once React has hydrated the page, so it sits outside React's tree
  function whenReady() { setTimeout(buildPanel, 0); }
  if (document.readyState === "complete") whenReady();
  else window.addEventListener("load", whenReady);

  window.ArrowPalette = { derive: derive, state: function () { return state; }, set: function (s) {
    Object.keys(s).forEach(function (k) { state[k] = s[k]; }); apply(state, { immediate: true }); save(state);
  } };
})();
