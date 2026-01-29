/* Recolor add-on (v11.2.1) — Paint By Number Generator
   --------------------------------------------------------------------
   Fixes requested:
   1) Inject small version title above "Paint by number generator"
   2) Code always has a version number (ADDON_VERSION)
   3) Suggestion modes: OFF (Closest) [DEFAULT], SOFT (recommended), HARD (experimental)
      - OFF keeps current behavior: closest by ΔE00, repetitions allowed
      - SOFT: iterative optimization (context + reuse penalty + dark/neutral penalties + highlight/shadow filtering)
      - HARD: Hungarian 1:1 (no repeats), with N>167 handling (top 167 by weight)
   Also:
   - Text color: default uses original SVG text fill; slider changes opacity only (never forces black)
   - Does not depend on the page’s internal buttons; adds its own floating launcher
   -------------------------------------------------------------------- */

(function () {
  "use strict";

  // ============================================================
  // VERSION (required)
  // ============================================================
  const ADDON_VERSION = "11.2.1";
  const ADDON_NAME = `Recolor v${ADDON_VERSION}`;

  // ============================================================
  // Palette input
  // Expects ONE of:
  //   window.PALETTE_ITEMS = [{ tag:"A1", hex:"#112233" }, ...] (recommended)
  //   window.PALETTE_168   = ["#112233", ...]
  // If missing, UI still works but picker/suggestions will show warning.
  // ============================================================
  const PALETTE_ITEMS = Array.isArray(window.PALETTE_ITEMS) ? window.PALETTE_ITEMS : [];
  const PALETTE_HEXES = Array.isArray(window.PALETTE_168) ? window.PALETTE_168
    : (PALETTE_ITEMS.length ? PALETTE_ITEMS.map(x => x.hex) : []);

  // ============================================================
  // Small utilities
  // ============================================================
  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test((s || "").toString().trim());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }
  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ============================================================
  // FIX #1: Inject version title above H1
  // ============================================================
  function injectVersionTitleAboveH1() {
    const h1 = Array.from(document.querySelectorAll("h1, h2, header h1, header h2"))
      .find(el => /paint by number generator/i.test((el.textContent || "").trim()));
    if (!h1) return;
    if (document.getElementById("pbn-recolor-version-title")) return;

    const small = document.createElement("div");
    small.id = "pbn-recolor-version-title";
    small.textContent = ADDON_NAME;
    small.style.cssText = [
      "font-size:12px",
      "font-weight:900",
      "letter-spacing:.02em",
      "color:rgba(220,38,38,.95)",
      "margin:2px 0 6px 0",
      "line-height:1.1"
    ].join(";");

    h1.parentNode.insertBefore(small, h1);
  }

  // ============================================================
  // Local storage
  // ============================================================
  const STORAGE_KEY = `pbn_recolor_state_${ADDON_VERSION.replace(/\W+/g, "_")}`;

  function loadState() {
    return safeJsonParse(localStorage.getItem(STORAGE_KEY)) || { ui: {}, mappings: {}, renames: {}, svgSig: "" };
  }
  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function hashDjb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }
  function svgSignature(svgEl) {
    try {
      const s = new XMLSerializer().serializeToString(svgEl);
      const compact = s.replace(/\s+/g, " ").slice(0, 50000);
      return hashDjb2(`${compact.length}|${compact}`);
    } catch {
      return String(Date.now());
    }
  }

  // ============================================================
  // Basic CSS for UI
  // ============================================================
  function ensureStyle() {
    if (document.getElementById("pbn-recolor-style")) return;
    const st = document.createElement("style");
    st.id = "pbn-recolor-style";
    st.textContent = `
      .pbn-recolor-fab{position:fixed;left:18px;top:18px;z-index:2147483647;
        padding:12px 14px;border-radius:14px;border:1px solid rgba(0,0,0,.18);
        background:rgba(255,255,255,.94);backdrop-filter:blur(8px);
        box-shadow:0 16px 42px rgba(0,0,0,.18);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        font-weight:900;cursor:pointer;display:flex;align-items:center;gap:10px;}
      .pbn-recolor-fab small{font-weight:900;opacity:.65}
      .pbn-recolor-fab[disabled]{opacity:.55;cursor:not-allowed}
      .pbn-recolor-overlay{position:fixed;inset:0;background:rgba(0,0,0,.30);z-index:2147483647;overflow:auto;padding:22px;}
      .pbn-recolor-card{max-width:1250px;margin:0 auto;background:rgba(255,255,255,.98);border:1px solid rgba(0,0,0,.14);
        border-radius:18px;box-shadow:0 24px 90px rgba(0,0,0,.26);padding:14px 14px 18px;}
      .pbn-recolor-topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}
      .pbn-recolor-title{display:flex;flex-direction:column;gap:2px;}
      .pbn-recolor-title .v{font-size:12px;font-weight:1000;color:rgba(220,38,38,.95);}
      .pbn-recolor-title .t{font-size:14px;font-weight:1000;}
      .pbn-recolor-btn{padding:10px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.20);background:white;cursor:pointer;font-weight:900;}
      .pbn-recolor-btn:active{transform:translateY(1px) scale(.99);}
      .pbn-recolor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;}
      .pbn-panel{border:1px solid rgba(0,0,0,.12);border-radius:14px;padding:10px;background:white;}
      .pbn-panel h3{margin:0 0 8px 0;font-size:13px;font-weight:1000;}
      .pbn-viewport{border:1px solid rgba(0,0,0,.10);border-radius:12px;overflow:hidden;background:white;}
      .pbn-row{display:grid;grid-template-columns:120px 1fr 1fr 170px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.06);}
      .pbn-row:last-child{border-bottom:none;}
      .sw{width:100%;height:38px;border-radius:10px;border:1px solid rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;font-weight:1000;font-size:12px;position:relative;overflow:hidden;}
      .sw .tag{position:absolute;left:6px;top:6px;font-size:11px;font-weight:1000;background:rgba(255,255,255,.90);border:1px solid rgba(0,0,0,.12);padding:2px 6px;border-radius:999px;}
      .pbn-rename{width:100%;padding:10px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.18);font-weight:900;}
      .pbn-suggest{padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.18);background:rgba(0,0,0,.04);cursor:pointer;font-weight:1000;}
      .seg{display:inline-flex;border:1px solid rgba(0,0,0,.18);border-radius:12px;overflow:hidden;background:rgba(255,255,255,.88);}
      .seg button{border:0;background:transparent;padding:10px 12px;font-weight:1000;cursor:pointer;font-size:12px;}
      .seg button.active{background:white;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
      .picker{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:6px;max-height:380px;overflow:auto;padding:6px;border:1px solid rgba(0,0,0,.10);border-radius:12px;background:rgba(0,0,0,.02);}
      .tile{height:40px;border-radius:10px;border:1px solid rgba(0,0,0,.16);cursor:pointer;position:relative;overflow:hidden;}
      .tile .x{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:1200;font-size:22px;color:rgba(0,0,0,.60);opacity:0;pointer-events:none;}
      .tile.used .x{opacity:1;}
      .foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;}
      .note{font-size:12px;color:rgba(0,0,0,.65);}
      .warn{padding:10px 12px;border-radius:12px;border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);color:rgba(0,0,0,.80);font-weight:900;}
      .slider{display:flex;align-items:center;gap:10px;}
      .slider input[type="range"]{width:220px;}
    `;
    document.head.appendChild(st);
  }

  // ============================================================
  // SVG helpers
  // ============================================================
  function ensureViewBox(svg) {
    if (!svg || svg.tagName.toLowerCase() !== "svg") return;
    if (svg.getAttribute("viewBox")) return;

    const w = parseFloat(svg.getAttribute("width"));
    const h = parseFloat(svg.getAttribute("height"));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      return;
    }
    try {
      const bb = svg.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) svg.setAttribute("viewBox", `0 0 ${bb.width} ${bb.height}`);
    } catch (_) {}
  }

  function makePreview(svg) {
    ensureViewBox(svg);
    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  function getElementFill(el) {
    const fAttr = el.getAttribute && el.getAttribute("fill");
    if (fAttr && fAttr !== "none" && fAttr !== "transparent") {
      const f = norm(fAttr);
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    }
    const styleAttr = el.getAttribute && el.getAttribute("style");
    if (styleAttr && /fill\s*:/i.test(styleAttr)) {
      const m = styleAttr.match(/fill:\s*([^;]+)/i);
      if (m && m[1]) {
        const v = norm(m[1]);
        if (v.startsWith("rgb")) return rgbToHex(v) || null;
        if (v.startsWith("#") && v.length === 7) return v;
      }
    }
    try {
      const cs = window.getComputedStyle(el);
      const f = cs && cs.fill ? norm(cs.fill) : "";
      if (!f || f === "none" || f === "transparent") return null;
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    } catch (_) {}
    return null;
  }

  function rgbToHex(rgb) {
    const m = (rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toLowerCase();
  }

  function collectFillGroups(svg) {
    const groups = new Map();
    const nodes = Array.from(svg.querySelectorAll("*"))
      .filter((el) => el instanceof SVGElement)
      .filter((el) => ["path", "polygon", "rect", "circle", "ellipse"].includes(el.tagName.toLowerCase()));
    for (const el of nodes) {
      const fill = getElementFill(el);
      if (!fill) continue;
      const f = norm(fill);
      if (!isHex6(f)) continue;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(el);
    }
    return groups;
  }

  function findFinalOutputSvg() {
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;
    let best = null, bestScore = 0;
    for (const s of svgs) {
      const score =
        s.querySelectorAll("path,polygon,rect,circle,ellipse").length * 2 +
        s.querySelectorAll("text").length * 3;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  function isGeneratorReady() {
    // If output svg exists with enough content, consider ready.
    const s = findFinalOutputSvg();
    if (!s) return false;
    const shapes = s.querySelectorAll("path,polygon,rect,circle,ellipse").length;
    return shapes > 20;
  }

  // ============================================================
  // Download helpers
  // ============================================================
  function forceDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function downloadSvgAsPngHQ(svgEl, filename, scale = 10) {
    const MAX_SIDE = 20000;
    const MAX_PIXELS = 220e6;

    ensureViewBox(svgEl);

    const vb = svgEl.getAttribute("viewBox");
    let baseW = 1600, baseH = 1600;
    if (vb) {
      const p = vb.split(/\s+/).map(Number);
      if (p.length === 4 && p[2] > 0 && p[3] > 0) { baseW = p[2]; baseH = p[3]; }
    }

    let outW = Math.round(baseW * scale);
    let outH = Math.round(baseH * scale);

    if (outW > MAX_SIDE || outH > MAX_SIDE) {
      const s = Math.min(MAX_SIDE / outW, MAX_SIDE / outH);
      outW = Math.max(1, Math.round(outW * s));
      outH = Math.max(1, Math.round(outH * s));
    }
    const pixels = outW * outH;
    if (pixels > MAX_PIXELS) {
      const s = Math.sqrt(MAX_PIXELS / pixels);
      outW = Math.max(1, Math.round(outW * s));
      outH = Math.max(1, Math.round(outH * s));
    }

    const svgText = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });

    // Prefer createImageBitmap
    try {
      const bitmap = await createImageBitmap(svgBlob);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;

      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bitmap, 0, 0, outW, outH);

      const pngBlob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1.0));
      if (pngBlob) { forceDownloadBlob(pngBlob, filename); return; }
    } catch (_) {}

    // Fallback via img
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";

    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e);
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, outW, outH);

    URL.revokeObjectURL(url);

    const pngBlob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1.0));
    if (pngBlob) { forceDownloadBlob(pngBlob, filename); }
  }

  // ============================================================
  // TEXT COLOR FIX:
  // - Capture original text fill (computed) once into data-orig-fill
  // - Slider controls opacity only (never forces black)
  // ============================================================
  function captureOriginalTextFills(svg) {
    const texts = Array.from(svg.querySelectorAll("text"));
    for (const t of texts) {
      if (t.getAttribute("data-orig-fill")) continue;
      let fill = t.getAttribute("fill");
      if (!fill || fill === "none" || fill === "transparent") {
        try {
          const cs = window.getComputedStyle(t);
          fill = cs && cs.fill ? cs.fill : "";
        } catch (_) {}
      }
      let hex = "";
      const v = (fill || "").toString().trim();
      if (v.startsWith("#") && v.length === 7) hex = v.toLowerCase();
      else if (v.toLowerCase().startsWith("rgb")) hex = rgbToHex(v) || "";
      if (!hex) hex = "#000000"; // ultimate fallback
      t.setAttribute("data-orig-fill", hex);
    }
  }

  function applyTextOpacity(svg, opacity01) {
    const o = clamp(opacity01, 0, 1);
    const texts = Array.from(svg.querySelectorAll("text"));
    for (const t of texts) {
      // keep original fill
      const hex = t.getAttribute("data-orig-fill") || "#000000";
      t.setAttribute("fill", hex);
      t.setAttribute("fill-opacity", String(o));
    }
  }

  // ============================================================
  // Border / fill toggles (optional)
  // ============================================================
  function ensureSvgStyle(svg, id) {
    let style = svg.querySelector(`#${id}`);
    if (style) return style;
    style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("id", id);
    svg.insertBefore(style, svg.firstChild);
    return style;
  }

  function setBorders(svg, on) {
    const style = ensureSvgStyle(svg, "pbn-recolor-borders");
    style.textContent = on ? "" : `
      [fill="none"][stroke], path[stroke][fill="none"], polyline[stroke], line[stroke] { stroke-opacity: 0 !important; }
      [stroke][fill="transparent"], path[stroke][fill="transparent"] { stroke-opacity: 0 !important; }
    `;
  }

  function setShapeFills(svg, on) {
    const style = ensureSvgStyle(svg, "pbn-recolor-fills");
    style.textContent = on ? "" : `path, polygon, rect, circle, ellipse { fill: none !important; }`;
  }

  // ============================================================
  // Tag extraction (best-effort):
  // - Legend rect+text
  // - Proximity to region numbers
  // ============================================================
  function isTagLike(t) { return /^[a-z0-9]{1,6}$/i.test((t || "").toString().trim()); }

  function buildTagByHexFromSvgLegend(svg) {
    const map = {};
    if (!svg) return map;

    const rects = Array.from(svg.querySelectorAll("rect")).filter((r) => {
      const w = parseFloat(r.getAttribute("width") || "0");
      const h = parseFloat(r.getAttribute("height") || "0");
      return w > 6 && h > 6 && w <= 160 && h <= 160;
    });

    for (const rect of rects) {
      const fill = (rect.getAttribute("fill") || "").trim();
      let hex = "";
      if (fill.startsWith("#") && fill.length === 7) hex = fill.toLowerCase();
      else if (fill.toLowerCase().startsWith("rgb")) hex = rgbToHex(fill) || "";
      if (!hex) continue;

      const parent = rect.parentElement;
      if (!parent) continue;

      const kids = Array.from(parent.children);
      const idx = kids.indexOf(rect);
      if (idx === -1) continue;

      const near = kids.slice(idx + 1, idx + 6).find(
        (n) => n.tagName && n.tagName.toLowerCase() === "text" && (n.textContent || "").trim()
      );

      if (near) {
        const tag = (near.textContent || "").trim();
        if (tag && isTagLike(tag) && !map[hex]) map[hex] = tag;
      }
    }
    return map;
  }

  function buildTagByHexFromProximity(svg, fillGroups) {
    const map = {};
    if (!svg || !fillGroups) return map;

    const texts = Array.from(svg.querySelectorAll("text"))
      .map((t) => {
        const tag = (t.textContent || "").toString().trim();
        if (!tag || !isTagLike(tag)) return null;
        try {
          const bb = t.getBBox();
          return { tag, cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 };
        } catch (_) { return null; }
      })
      .filter(Boolean);

    if (!texts.length) return map;

    for (const [hex, nodes] of fillGroups.entries()) {
      let sumX = 0, sumY = 0, count = 0;
      const sample = nodes.slice(0, 50);
      for (const el of sample) {
        try {
          const bb = el.getBBox();
          sumX += bb.x + bb.width / 2;
          sumY += bb.y + bb.height / 2;
          count++;
        } catch (_) {}
      }
      if (!count) continue;
      const cx = sumX / count;
      const cy = sumY / count;

      let best = null, bestD = Infinity;
      for (const t of texts) {
        const dx = t.cx - cx;
        const dy = t.cy - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best && !map[hex]) map[hex] = best.tag;
    }
    return map;
  }

  function cmpTagAsc(a, b) {
    const ta = (a || "").toString().trim();
    const tb = (b || "").toString().trim();
    const na = /^-?\d+(\.\d+)?$/.test(ta) ? Number(ta) : null;
    const nb = /^-?\d+(\.\d+)?$/.test(tb) ? Number(tb) : null;
    if (na !== null && nb !== null) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return ta.localeCompare(tb, "es", { numeric: true, sensitivity: "base" });
  }

  // ============================================================
  // COLOR SCIENCE — REQUIRED FUNCTIONS
  // ============================================================
  function srgbToLinear(u) { return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function rgb01ToXyzD65(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    return {
      x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
      y: R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
      z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
    };
  }
  function fLab(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); }
  function xyzToLabD65(x, y, z) {
    const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
    const fx = fLab(x / Xn), fy = fLab(y / Yn), fz = fLab(z / Zn);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }
  function hexToLab(hex) {
    const h = (hex || "").replace("#", "").trim();
    if (h.length !== 6) return null;
    const r8 = parseInt(h.slice(0, 2), 16);
    const g8 = parseInt(h.slice(2, 4), 16);
    const b8 = parseInt(h.slice(4, 6), 16);
    if (!Number.isFinite(r8) || !Number.isFinite(g8) || !Number.isFinite(b8)) return null;
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    const { x, y, z } = rgb01ToXyzD65(r, g, b);
    const lab = xyzToLabD65(x, y, z);
    const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let hDeg = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
    if (hDeg < 0) hDeg += 360;
    return { L: lab.L, a: lab.a, b: lab.b, C, h: hDeg, lab };
  }

  // ΔE00 CIEDE2000
  function deltaE00(lab1, lab2) {
    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;
    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cbar = (C1 + C2) / 2;

    const Cbar7 = Math.pow(Cbar, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;

    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
    const h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp = 0;
    if (C1p * C2p !== 0) {
      const dh = h2p - h1p;
      if (Math.abs(dh) <= 180) dhp = dh;
      else if (dh > 180) dhp = dh - 360;
      else dhp = dh + 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((((dhp * Math.PI) / 180) / 2));

    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;

    let hbarp = 0;
    if (C1p * C2p === 0) {
      hbarp = h1p + h2p;
    } else {
      const dh = Math.abs(h1p - h2p);
      if (dh <= 180) hbarp = (h1p + h2p) / 2;
      else hbarp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
    }

    const T =
      1 -
      0.17 * Math.cos(((hbarp - 30) * Math.PI) / 180) +
      0.24 * Math.cos(((2 * hbarp) * Math.PI) / 180) +
      0.32 * Math.cos(((3 * hbarp + 6) * Math.PI) / 180) -
      0.20 * Math.cos(((4 * hbarp - 63) * Math.PI) / 180);

    const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));

    const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;

    const RT = -Math.sin(((2 * dTheta) * Math.PI) / 180) * RC;

    return Math.sqrt(
      Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );
  }

  // REQUIRED: computePaletteCache()
  function computePaletteCache() {
    const items = PALETTE_ITEMS.length
      ? PALETTE_ITEMS.map(x => ({ tag: (x.tag || "").toString().trim(), hex: norm(x.hex) }))
      : PALETTE_HEXES.map(h => ({ tag: "", hex: norm(h) }));

    const cache = [];
    for (let i = 0; i < items.length; i++) {
      const hex = items[i].hex;
      if (!isHex6(hex)) continue;
      const lab = hexToLab(hex);
      if (!lab) continue;
      cache.push({
        idx: i,
        hex,
        tag: items[i].tag,
        L: lab.L, a: lab.a, b: lab.b, C: lab.C, h: lab.h,
        lab: { L: lab.L, a: lab.a, b: lab.b }
      });
    }
    return cache;
  }

  // REQUIRED: computeTopKCandidates(tags, palette, params)
  function computeTopKCandidates(tags, paletteCache, params) {
    const K = params.K ?? 10;
    const wDark = params.wDark ?? 0.04;
    const wNeu = params.wNeu ?? 0.08;

    const topK = new Array(tags.length);
    const allScores = new Array(tags.length);

    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      const Lo = t.L;
      const Co = t.C;
      const labO = t.lab;

      const scores = new Float64Array(paletteCache.length);
      const raw = [];

      for (let p = 0; p < paletteCache.length; p++) {
        const pal = paletteCache[p];
        const dE = deltaE00(labO, pal.lab);

        const darkOver = Math.max(0, (Lo - pal.L) - 4);
        const darkPenalty = wDark * (darkOver * darkOver);

        const neutralPenalty = (Co < 6) ? (wNeu * Math.max(0, pal.C - Co)) : 0;

        const scoreBase = dE + darkPenalty + neutralPenalty;

        scores[p] = scoreBase;
        raw.push({
          palIdx: p,
          hex: pal.hex,
          tag: pal.tag,
          L: pal.L,
          C: pal.C,
          scoreBase
        });
      }

      // Highlight/shadow filters:
      let filtered = raw;
      if (Lo > 75) {
        const f = raw.filter(c => c.L >= 65);
        if (f.length >= Math.min(K, 5)) filtered = f;
      } else if (Lo < 25) {
        const f = raw.filter(c => c.L <= 40);
        if (f.length >= Math.min(K, 5)) filtered = f;
      }

      filtered.sort((a, b) => a.scoreBase - b.scoreBase || a.palIdx - b.palIdx);
      topK[i] = filtered.slice(0, K);
      allScores[i] = scores;
    }
    return { topK, allScores };
  }

  // REQUIRED: buildNeighborGraphFromSVG(...) + fallback KNN
  function buildNeighborGraphFromSVG(svgEl, rawEntries, tags, params) {
    const K = params.ctxK ?? 3;
    const n = tags.length;
    const graph = Array.from({ length: n }, () => []);

    function groupBBox(nodes) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let ok = false;
      const sample = nodes.slice(0, 60);
      for (const el of sample) {
        try {
          const bb = el.getBBox();
          if (!bb || !Number.isFinite(bb.x)) continue;
          ok = true;
          minX = Math.min(minX, bb.x);
          minY = Math.min(minY, bb.y);
          maxX = Math.max(maxX, bb.x + bb.width);
          maxY = Math.max(maxY, bb.y + bb.height);
        } catch (_) {}
      }
      if (!ok) return null;
      return { minX, minY, maxX, maxY };
    }

    function bboxDist(a, b) {
      const dx = (a.maxX < b.minX) ? (b.minX - a.maxX) : (b.maxX < a.minX) ? (a.minX - b.maxX) : 0;
      const dy = (a.maxY < b.minY) ? (b.minY - a.maxY) : (b.maxY < a.minY) ? (a.minY - b.maxY) : 0;
      return Math.sqrt(dx * dx + dy * dy);
    }

    const bboxes = new Array(n);
    let anyBBox = false;
    for (let i = 0; i < n; i++) {
      const nodes = rawEntries[i]?.nodes || [];
      const bb = groupBBox(nodes);
      bboxes[i] = bb;
      if (bb) anyBBox = true;
    }

    // Preferred: geometry proximity
    if (anyBBox) {
      for (let i = 0; i < n; i++) {
        if (!bboxes[i]) continue;
        const arr = [];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          if (!bboxes[j]) continue;
          arr.push({ j, d: bboxDist(bboxes[i], bboxes[j]) });
        }
        arr.sort((a, b) => a.d - b.d);
        const knn = arr.slice(0, Math.max(0, K));
        for (const e of knn) {
          graph[i].push({ j: e.j, dOrig: deltaE00(tags[i].lab, tags[e.j].lab) });
        }
      }
      // Fill missing nodes using Lab KNN fallback
      for (let i = 0; i < n; i++) {
        if (graph[i].length) continue;
        const arr = [];
        for (let j = 0; j < n; j++) if (i !== j) arr.push({ j, d: deltaE00(tags[i].lab, tags[j].lab) });
        arr.sort((a, b) => a.d - b.d);
        const knn = arr.slice(0, Math.max(0, K));
        for (const e of knn) graph[i].push({ j: e.j, dOrig: e.d });
      }
      return graph;
    }

    // Fallback: Lab KNN
    for (let i = 0; i < n; i++) {
      const arr = [];
      for (let j = 0; j < n; j++) if (i !== j) arr.push({ j, d: deltaE00(tags[i].lab, tags[j].lab) });
      arr.sort((a, b) => a.d - b.d);
      const knn = arr.slice(0, Math.max(0, K));
      for (const e of knn) graph[i].push({ j: e.j, dOrig: e.d });
    }
    return graph;
  }

  // REQUIRED: suggestClosest(...)
  function suggestClosest(tags, paletteCache, allScores) {
    const mapping = new Array(tags.length);
    for (let i = 0; i < tags.length; i++) {
      const scores = allScores[i];
      let best = 0;
      let bestV = scores[0];
      for (let p = 1; p < scores.length; p++) {
        const v = scores[p];
        if (v < bestV) { bestV = v; best = p; }
      }
      mapping[i] = best;
    }
    return mapping;
  }

  // Hungarian algorithm for n<=m
  function hungarianAssign(costMatrix) {
    const n = costMatrix.length;
    const m = costMatrix[0].length;
    if (n === 0) return [];
    const u = new Float64Array(n + 1);
    const v = new Float64Array(m + 1);
    const p = new Int32Array(m + 1);
    const way = new Int32Array(m + 1);

    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(m + 1);
      const used = new Uint8Array(m + 1);
      for (let j = 1; j <= m; j++) minv[j] = Infinity;

      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity;
        let j1 = 0;

        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }

        for (let j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else { minv[j] -= delta; }
        }
        j0 = j1;
      } while (p[j0] !== 0);

      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0);
    }

    const assign = new Int32Array(n);
    for (let j = 1; j <= m; j++) if (p[j] > 0) assign[p[j] - 1] = j - 1;
    return Array.from(assign);
  }

  // REQUIRED: suggestHardHungarian(...)
  function suggestHardHungarian(tags, paletteCache, allScores) {
    const m = paletteCache.length;
    const N = tags.length;

    let activeIdx = tags.map((_, i) => i);
    if (N > m) {
      activeIdx = tags
        .map((t, i) => ({ i, w: t.weight || 1 }))
        .sort((a, b) => b.w - a.w || a.i - b.i)
        .slice(0, m)
        .map(x => x.i);
    }

    const n = activeIdx.length;
    const cost = new Array(n);
    for (let r = 0; r < n; r++) {
      const i = activeIdx[r];
      const scores = allScores[i];
      const row = new Float64Array(m);
      for (let j = 0; j < m; j++) row[j] = scores[j];
      cost[r] = row;
    }

    const assign = hungarianAssign(cost); // row->pal
    const finalAssign = new Int32Array(N);
    finalAssign.fill(-1);

    const used = new Set();
    for (let r = 0; r < n; r++) {
      const i = activeIdx[r];
      const j = assign[r];
      finalAssign[i] = j;
      used.add(j);
    }

    // Remaining: closest among used palette (as per spec note)
    if (N > m) {
      const usedArr = Array.from(used);
      for (let i = 0; i < N; i++) {
        if (finalAssign[i] !== -1) continue;
        let bestJ = usedArr[0] ?? 0;
        let bestD = Infinity;
        for (const j of usedArr) {
          const d = deltaE00(tags[i].lab, paletteCache[j].lab);
          if (d < bestD) { bestD = d; bestJ = j; }
        }
        finalAssign[i] = bestJ;
      }
    } else {
      // If N<=m, any unassigned shouldn't happen
      for (let i = 0; i < N; i++) if (finalAssign[i] === -1) finalAssign[i] = 0;
    }
    return Array.from(finalAssign);
  }

  // REQUIRED: suggestSoftOptimize(...)
  function suggestSoftOptimize(tags, paletteCache, topK, neighborGraph, params) {
    const wCtx = params.wCtx ?? 0.25;
    const wReuse = params.wReuse ?? 0.8;
    const ITER = params.ITER ?? 800;

    const n = tags.length;
    const m = paletteCache.length;

    // Precompute palette ΔE matrix
    const palDE = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const d = deltaE00(paletteCache[i].lab, paletteCache[j].lab);
        palDE[i][j] = d;
        palDE[j][i] = d;
      }
    }

    const assign = new Int32Array(n);
    const baseScore = new Float64Array(n);
    const counts = new Int32Array(m);

    for (let i = 0; i < n; i++) {
      const c0 = topK[i][0];
      assign[i] = c0.palIdx;
      baseScore[i] = c0.scoreBase;
      counts[c0.palIdx] += 1;
    }

    function deltaReuse(oldIdx, newIdx) {
      if (oldIdx === newIdx) return 0;
      const cOld = counts[oldIdx];
      const cNew = counts[newIdx];
      return wReuse * (((cOld - 1) * (cOld - 1) + (cNew + 1) * (cNew + 1)) - (cOld * cOld + cNew * cNew));
    }

    function deltaCtx(i, oldPal, newPal) {
      if (oldPal === newPal) return 0;
      const edges = neighborGraph[i] || [];
      let d = 0;
      for (const e of edges) {
        const j = e.j;
        const aj = assign[j];
        const dOrig = e.dOrig;
        const oldTerm = Math.abs(dOrig - palDE[oldPal][aj]);
        const newTerm = Math.abs(dOrig - palDE[newPal][aj]);
        d += (newTerm - oldTerm);
      }
      return wCtx * d;
    }

    function pickProblematic() {
      let bestI = 0;
      let bestVal = -Infinity;
      const S = Math.min(18, n);
      for (let s = 0; s < S; s++) {
        const i = (Math.random() * n) | 0;
        const ai = assign[i];
        const reusePressure = counts[ai];
        const val = baseScore[i] + 0.35 * reusePressure;
        if (val > bestVal) { bestVal = val; bestI = i; }
      }
      return bestI;
    }

    for (let it = 0; it < ITER; it++) {
      const i = pickProblematic();
      const oldPal = assign[i];
      const oldBase = baseScore[i];

      let bestDelta = 0;
      let bestNew = oldPal;
      let bestNewBase = oldBase;

      const cands = topK[i];
      for (let k = 0; k < cands.length; k++) {
        const cand = cands[k];
        const newPal = cand.palIdx;
        if (newPal === oldPal) continue;

        const dBase = cand.scoreBase - oldBase;
        const dC = deltaCtx(i, oldPal, newPal);
        const dR = deltaReuse(oldPal, newPal);
        const dTotal = dBase + dC + dR;

        if (dTotal < bestDelta) {
          bestDelta = dTotal;
          bestNew = newPal;
          bestNewBase = cand.scoreBase;
        }
      }

      if (bestNew !== oldPal) {
        counts[oldPal] -= 1;
        counts[bestNew] += 1;
        assign[i] = bestNew;
        baseScore[i] = bestNewBase;
      }
    }

    return Array.from(assign);
  }

  // REQUIRED: suggestMapping(mode)
  function suggestMapping(mode, ctx) {
    if (mode === "OFF") return suggestClosest(ctx.tags, ctx.paletteCache, ctx.allScores);
    if (mode === "HARD") return suggestHardHungarian(ctx.tags, ctx.paletteCache, ctx.allScores);
    if (mode === "SOFT") return suggestSoftOptimize(ctx.tags, ctx.paletteCache, ctx.topK, ctx.neighborGraph, ctx.params);
    return suggestClosest(ctx.tags, ctx.paletteCache, ctx.allScores);
  }

  // ============================================================
  // UI Builder
  // ============================================================
  function openModal(originalSvg) {
    ensureStyle();

    const overlay = document.createElement("div");
    overlay.className = "pbn-recolor-overlay";

    const card = document.createElement("div");
    card.className = "pbn-recolor-card";

    const top = document.createElement("div");
    top.className = "pbn-recolor-topbar";

    const title = document.createElement("div");
    title.className = "pbn-recolor-title";
    title.innerHTML = `<div class="v">${ADDON_NAME}</div><div class="t">Recolorador (paleta ${PALETTE_HEXES.length || PALETTE_ITEMS.length || 0})</div>`;

    const close = document.createElement("button");
    close.className = "pbn-recolor-btn";
    close.textContent = "Cerrar";
    close.onclick = () => overlay.remove();

    top.appendChild(title);
    top.appendChild(close);
    card.appendChild(top);

    const body = document.createElement("div");
    body.className = "pbn-recolor-grid";
    card.appendChild(body);

    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    document.body.appendChild(overlay);
    buildEditor(body, originalSvg);

    return overlay;
  }

  function buildEditor(host, originalSvg) {
    host.innerHTML = "";

    // Clone SVGs
    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

    captureOriginalTextFills(recolorSvg); // text fix baseline

    // Left: previews + actions
    const left = document.createElement("div");
    left.className = "pbn-panel";
    left.innerHTML = `<h3>Previews</h3>`;
    const vwrap = document.createElement("div");
    vwrap.className = "pbn-viewport";
    vwrap.style.display = "grid";
    vwrap.style.gridTemplateColumns = "1fr 1fr";
    vwrap.style.gap = "0";
    vwrap.appendChild(originalClone);
    vwrap.appendChild(recolorSvg);
    left.appendChild(vwrap);

    // Build rows data
    const fillGroups = collectFillGroups(recolorSvg);
    const legendMap = buildTagByHexFromSvgLegend(originalSvg);
    const proxMap = buildTagByHexFromProximity(originalSvg, fillGroups);
    const tagByHex = { ...proxMap, ...legendMap };

    const rawEntries = Array.from(fillGroups.entries()).map(([oldHex, nodes]) => {
      const hex = norm(oldHex);
      // weight estimate (bbox area sum, sampled)
      let w = 0;
      const sample = nodes.slice(0, 60);
      for (const el of sample) {
        try {
          const bb = el.getBBox();
          w += Math.max(0, bb.width) * Math.max(0, bb.height);
        } catch (_) {}
      }
      return { oldHex: hex, nodes, tag: tagByHex[hex] || "", weight: w || nodes.length };
    });

    rawEntries.sort((a, b) => {
      const ta = a.tag || "";
      const tb = b.tag || "";
      const ha = !!ta;
      const hb = !!tb;
      if (ha && hb) return cmpTagAsc(ta, tb);
      if (ha && !hb) return -1;
      if (!ha && hb) return 1;
      return a.oldHex.localeCompare(b.oldHex);
    });

    // Load state (per SVG signature)
    const sig = svgSignature(originalSvg);
    const state = loadState();
    if (state.svgSig !== sig) {
      // reset mappings for new svg
      state.svgSig = sig;
      state.mappings = {};
      state.renames = {};
      // keep UI prefs
      saveState(state);
    }

    // UI prefs
    const ui = state.ui || {};
    let colorsOn = (typeof ui.colorsOn === "boolean") ? ui.colorsOn : true;
    let bordersOn = (typeof ui.bordersOn === "boolean") ? ui.bordersOn : true;
    let textOpacity = (typeof ui.textOpacity === "number") ? clamp(ui.textOpacity, 0, 1) : 0.70;

    // REQUIRED UX: default suggestion mode OFF
    let suggestMode = (typeof ui.suggestMode === "string" && ["OFF", "SOFT", "HARD"].includes(ui.suggestMode)) ? ui.suggestMode : "OFF";

    // Apply toggles
    setShapeFills(recolorSvg, colorsOn);
    setBorders(recolorSvg, bordersOn);
    applyTextOpacity(recolorSvg, textOpacity);

    // Controls row
    const foot = document.createElement("div");
    foot.className = "foot";

    const warn = document.createElement("div");
    warn.className = "warn";
    warn.style.display = (PALETTE_HEXES.length || PALETTE_ITEMS.length) ? "none" : "block";
    warn.textContent = "⚠️ No encontré PALETTE_ITEMS/PALETTE_168. El picker y sugerencias necesitan la paleta cargada como variable global.";
    left.appendChild(warn);

    const seg = document.createElement("div");
    seg.className = "seg";
    const mkSegBtn = (mode, label) => {
      const b = document.createElement("button");
      b.textContent = label;
      const paint = () => b.classList.toggle("active", suggestMode === mode);
      b.onclick = () => {
        suggestMode = mode;
        ui.suggestMode = suggestMode;
        state.ui = ui;
        saveState(state);
        paintAllSeg();
      };
      b._paint = paint;
      return b;
    };
    const bOff = mkSegBtn("OFF", "OFF (Closest)");
    const bSoft = mkSegBtn("SOFT", "SOFT ★");
    const bHard = mkSegBtn("HARD", "HARD");
    seg.appendChild(bOff); seg.appendChild(bSoft); seg.appendChild(bHard);
    function paintAllSeg(){ bOff._paint(); bSoft._paint(); bHard._paint(); }
    paintAllSeg();

    const btnApplySug = document.createElement("button");
    btnApplySug.className = "pbn-recolor-btn";
    btnApplySug.textContent = "Aplicar sugerencias";
    btnApplySug.onclick = () => applySuggestionsAll();

    const btnDlSvg = document.createElement("button");
    btnDlSvg.className = "pbn-recolor-btn";
    btnDlSvg.textContent = "Descargar SVG";
    btnDlSvg.onclick = () => {
      const svgText = new XMLSerializer().serializeToString(recolorSvg);
      forceDownloadBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), `pbn-recolor-${ADDON_VERSION}.svg`);
    };

    const btnDlPng = document.createElement("button");
    btnDlPng.className = "pbn-recolor-btn";
    btnDlPng.textContent = "Descargar PNG HQ";
    btnDlPng.onclick = () => downloadSvgAsPngHQ(recolorSvg, `pbn-recolor-${ADDON_VERSION}.png`, 10);

    const btnColors = document.createElement("button");
    btnColors.className = "pbn-recolor-btn";
    const paintColorsBtn = () => btnColors.textContent = `Colores: ${colorsOn ? "ON" : "OFF"}`;
    paintColorsBtn();
    btnColors.onclick = () => {
      colorsOn = !colorsOn;
      ui.colorsOn = colorsOn;
      state.ui = ui;
      saveState(state);
      setShapeFills(recolorSvg, colorsOn);
      paintColorsBtn();
    };

    const btnBorders = document.createElement("button");
    btnBorders.className = "pbn-recolor-btn";
    const paintBordersBtn = () => btnBorders.textContent = `Bordes: ${bordersOn ? "ON" : "OFF"}`;
    paintBordersBtn();
    btnBorders.onclick = () => {
      bordersOn = !bordersOn;
      ui.bordersOn = bordersOn;
      state.ui = ui;
      saveState(state);
      setBorders(recolorSvg, bordersOn);
      paintBordersBtn();
    };

    const sliderWrap = document.createElement("div");
    sliderWrap.className = "slider";
    sliderWrap.innerHTML = `<div style="font-weight:1000;font-size:12px;">Text opacity</div>`;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.01";
    slider.value = String(textOpacity);
    const sliderVal = document.createElement("div");
    sliderVal.style.cssText = "font-weight:1000;font-size:12px;opacity:.75;";
    sliderVal.textContent = textOpacity.toFixed(2);
    slider.oninput = () => {
      textOpacity = clamp(parseFloat(slider.value), 0, 1);
      sliderVal.textContent = textOpacity.toFixed(2);
      ui.textOpacity = textOpacity;
      state.ui = ui;
      saveState(state);
      applyTextOpacity(recolorSvg, textOpacity);
    };
    sliderWrap.appendChild(slider);
    sliderWrap.appendChild(sliderVal);

    foot.appendChild(seg);
    foot.appendChild(btnApplySug);
    foot.appendChild(btnColors);
    foot.appendChild(btnBorders);
    foot.appendChild(sliderWrap);
    foot.appendChild(btnDlSvg);
    foot.appendChild(btnDlPng);

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "OFF es el default. SOFT/HARD solo se aplican cuando los activas y haces 'Aplicar sugerencias'.";
    left.appendChild(foot);
    left.appendChild(note);

    host.appendChild(left);

    // Right: rows + picker
    const right = document.createElement("div");
    right.className = "pbn-panel";
    right.innerHTML = `<h3>Colores originales → reemplazos (y renombrar)</h3>`;

    const list = document.createElement("div");
    right.appendChild(list);

    const pickerPanel = document.createElement("div");
    pickerPanel.style.marginTop = "10px";
    pickerPanel.innerHTML = `<h3>Picker (paleta)</h3>`;
    const picker = document.createElement("div");
    picker.className = "picker";
    pickerPanel.appendChild(picker);
    right.appendChild(pickerPanel);

    host.appendChild(right);

    // Build palette grid
    const paletteCache = computePaletteCache();
    const paletteItems = paletteCache.map(p => ({ hex: p.hex, tag: p.tag }));

    let selectedOldHex = null;

    function usedReplacementSet() {
      const used = new Set();
      for (const k of Object.keys(state.mappings || {})) {
        const v = state.mappings[k];
        if (v && isHex6(v.hex)) used.add(norm(v.hex));
      }
      return used;
    }

    function renderPaletteGrid() {
      picker.innerHTML = "";
      const used = usedReplacementSet();
      for (const it of paletteItems) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.style.background = it.hex;
        tile.title = it.tag ? `${it.tag} — ${it.hex}` : it.hex;

        const tag = document.createElement("div");
        tag.className = "tag";
        tag.textContent = it.tag || "";
        tag.style.cssText = "position:absolute;left:6px;top:6px;font-size:11px;font-weight:1000;background:rgba(255,255,255,.90);border:1px solid rgba(0,0,0,.12);padding:2px 6px;border-radius:999px;max-width:calc(100% - 12px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        if (it.tag) tile.appendChild(tag);

        const x = document.createElement("div");
        x.className = "x";
        x.textContent = "✕";
        tile.appendChild(x);

        if (used.has(it.hex)) tile.classList.add("used");

        tile.onclick = () => {
          if (!selectedOldHex) return;
          setReplacement(selectedOldHex, it.hex, it.tag);
        };

        picker.appendChild(tile);
      }
    }

    function setReplacement(oldHex, newHex, newTag) {
      if (!state.mappings) state.mappings = {};
      state.mappings[oldHex] = { hex: norm(newHex), tag: (newTag || "").toString().trim() };
      saveState(state);
      applyAllReplacementsToSvg();
      renderRows();
      renderPaletteGrid();
    }

    function setRename(oldHex, renameText) {
      if (!state.renames) state.renames = {};
      state.renames[oldHex] = (renameText || "").toString().trim();
      saveState(state);
      applyRenamesToSvg();
    }

    function applyAllReplacementsToSvg() {
      // Apply fill replacements on recolorSvg
      const mappings = state.mappings || {};
      for (const entry of rawEntries) {
        const oldHex = entry.oldHex;
        const rep = mappings[oldHex];
        if (!rep || !isHex6(rep.hex)) continue;

        const newHex = norm(rep.hex);
        for (const el of entry.nodes) {
          el.setAttribute("fill", newHex);
          // remove style fill if present
          const style = el.getAttribute("style");
          if (style && /fill\s*:/i.test(style)) {
            const newStyle = style.replace(/fill\s*:\s*[^;]+;?/ig, "");
            el.setAttribute("style", newStyle);
          }
        }
      }
      // reapply toggles
      setShapeFills(recolorSvg, colorsOn);
      setBorders(recolorSvg, bordersOn);
      applyTextOpacity(recolorSvg, textOpacity);
    }

    function applyRenamesToSvg() {
      // Rename legend tags if present (best-effort):
      // replace text nodes that equal original tag with rename
      const ren = state.renames || {};
      const mapTagToRename = new Map();
      for (const e of rawEntries) {
        const r = ren[e.oldHex];
        if (r && e.tag) mapTagToRename.set(e.tag, r);
      }

      const texts = Array.from(recolorSvg.querySelectorAll("text"));
      for (const t of texts) {
        const txt = (t.textContent || "").toString().trim();
        if (!txt) continue;
        if (mapTagToRename.has(txt)) t.textContent = mapTagToRename.get(txt);
      }
    }

    // Build tags array for suggestions
    function buildTagsForSuggestion() {
      const tags = [];
      for (const e of rawEntries) {
        const labX = hexToLab(e.oldHex);
        if (!labX) continue;
        tags.push({
          tag: e.tag || "",
          hex: e.oldHex,
          L: labX.L,
          a: labX.a,
          b: labX.b,
          C: labX.C,
          h: labX.h,
          lab: { L: labX.L, a: labX.a, b: labX.b },
          weight: e.weight || 1
        });
      }
      return tags;
    }

    const params = { K: 10, wDark: 0.04, wNeu: 0.08, wCtx: 0.25, wReuse: 0.8, ITER: 800, ctxK: 3 };

    // Compute once per modal open
    const tagsForSug = buildTagsForSuggestion();
    const { topK, allScores } = computeTopKCandidates(tagsForSug, paletteCache, params);
    const neighborGraph = buildNeighborGraphFromSVG(recolorSvg, rawEntries, tagsForSug, params);

    function applySuggestionsAll() {
      if (!paletteCache.length) return;

      const ctx = { tags: tagsForSug, paletteCache, topK, allScores, neighborGraph, params };
      const assign = suggestMapping(suggestMode, ctx); // array of palIdx per tag index

      for (let i = 0; i < tagsForSug.length; i++) {
        const oldHex = tagsForSug[i].hex;
        const pal = paletteCache[assign[i]];
        if (!pal) continue;
        setReplacement(oldHex, pal.hex, pal.tag);
      }
    }

    // Rows render
    function textColorForBg(hex) {
      const h = (hex || "").replace("#", "");
      if (h.length !== 6) return "#000";
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return y > 140 ? "#000" : "#fff";
    }

    function renderRows() {
      list.innerHTML = "";
      const mappings = state.mappings || {};
      const ren = state.renames || {};

      for (const e of rawEntries) {
        const row = document.createElement("div");
        row.className = "pbn-row";

        // Tag label
        const tagBox = document.createElement("div");
        tagBox.style.cssText = "font-weight:1000;font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        tagBox.textContent = e.tag ? `TAG: ${e.tag}` : `HEX: ${e.oldHex}`;

        // Original swatch
        const swO = document.createElement("div");
        swO.className = "sw";
        swO.style.background = e.oldHex;
        swO.style.color = textColorForBg(e.oldHex);
        swO.innerHTML = `<div class="tag">${e.tag || ""}</div><div>${e.oldHex}</div>`;
        swO.onclick = () => { selectedOldHex = e.oldHex; };

        // Replacement swatch
        const rep = mappings[e.oldHex];
        const repHex = (rep && isHex6(rep.hex)) ? norm(rep.hex) : "";
        const swR = document.createElement("div");
        swR.className = "sw";
        swR.style.background = repHex || "rgba(0,0,0,.06)";
        swR.style.color = repHex ? textColorForBg(repHex) : "rgba(0,0,0,.70)";
        const repTag = rep?.tag ? `<div class="tag">${rep.tag}</div>` : "";
        swR.innerHTML = `${repTag}<div>${repHex || "—"}</div>`;
        swR.title = "Click para seleccionar este color original y luego elegir en el picker";
        swR.onclick = () => { selectedOldHex = e.oldHex; };

        // Rename input
        const inp = document.createElement("input");
        inp.className = "pbn-rename";
        inp.placeholder = "Renombrar TAG…";
        inp.value = ren[e.oldHex] || "";
        inp.onchange = () => setRename(e.oldHex, inp.value);

        // Suggest (single) button: applies suggestion for this one tag only, based on current mode
        const btnS = document.createElement("button");
        btnS.className = "pbn-suggest";
        btnS.textContent = "Sugerir";
        btnS.onclick = () => {
          // compute assignment for this tag index only (cheap): use mapping array and set one
          const idx = tagsForSug.findIndex(t => t.hex === e.oldHex);
          if (idx < 0) return;
          const ctx = { tags: tagsForSug, paletteCache, topK, allScores, neighborGraph, params };
          const assign = suggestMapping(suggestMode, ctx);
          const pal = paletteCache[assign[idx]];
          if (pal) setReplacement(e.oldHex, pal.hex, pal.tag);
        };

        row.appendChild(tagBox);
        row.appendChild(swO);
        row.appendChild(swR);

        const rightCell = document.createElement("div");
        rightCell.style.cssText = "display:grid;grid-template-columns:1fr 90px;gap:8px;align-items:center;";
        rightCell.appendChild(inp);
        rightCell.appendChild(btnS);

        row.appendChild(rightCell);
        list.appendChild(row);
      }
    }

    // Initial render/apply
    applyAllReplacementsToSvg();
    applyRenamesToSvg();
    renderRows();
    renderPaletteGrid();
  }

  // ============================================================
  // FAB launcher
  // ============================================================
  function ensureFab() {
    ensureStyle();
    let fab = document.getElementById("pbn-recolor-fab");
    if (fab) return fab;

    fab = document.createElement("button");
    fab.id = "pbn-recolor-fab";
    fab.className = "pbn-recolor-fab";
    fab.type = "button";
    fab.innerHTML = `<span>Recolor</span><small>${ADDON_VERSION}</small>`;
    document.body.appendChild(fab);

    fab.addEventListener("click", () => {
      if (!isGeneratorReady()) return;
      const svg = findFinalOutputSvg();
      if (svg) openModal(svg);
    });

    return fab;
  }

  function refreshFabState() {
    const fab = ensureFab();
    const ready = isGeneratorReady();
    fab.disabled = !ready;
    fab.title = ready ? "Abrir recolorador" : "Procesa una imagen para generar SVG y luego abre el recolorador";
  }

  // ============================================================
  // Boot
  // ============================================================
  function boot() {
    injectVersionTitleAboveH1();
    ensureFab();
    refreshFabState();

    const mo = new MutationObserver(debounce(() => {
      injectVersionTitleAboveH1();
      refreshFabState();
    }, 200));

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

})();
