/* Recolor add-on (v9.3 - SUGGEST 1:1 ΔE00 + MEMORY + TEXT OPACITY FIX + HIRES PNG + UX)
   ✅ Load/hard reload stable (no global MutationObserver, host mounts only when downloads exist)
   ✅ Rename input: auto-fills with picked TAG (e.g. WG7) but stays editable
   ✅ Text color system:
      - Default uses ORIGINAL SVG text color (no forced black)
      - Slider opacity always applies (whether "Color textos" ON or OFF)
      - Export respects text opacity (SVG + PNG)
   ✅ PNG export:
      - Always reads SVG size correctly
      - Uses high-res scale up to 10x (auto-caps to browser canvas limits)
      - Robust download (toBlob fallback)
   ✅ Button feedback: press effect + small spinner while generating downloads
   ✅ Sugerencia avanzada:
      - ΔE00 (CIEDE2000) + neutral bias + scale(L*) + hue
      - 1:1 assignment (no repeats) via Hungarian + refinement swaps (KNN graph)
      - UI toggle: “Sugerencia 1:1 (sin repetir) + Preservar escala” ON por defecto
      - 4ta cajita “Sugerido” por fila: click para auto-aplicar
   ✅ Memory:
      - Keeps selections if you close/reopen recolor UI
      - Resets only when a NEW image/output is generated (signature changes)
*/

(function () {
  // ---------------- CONFIG ----------------
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map((x) => x.hex);
  const PALETTE_LIST = (PALETTE_ITEMS.length ? PALETTE_ITEMS : PALETTE.map((hex) => ({ tag: "", hex })))
    .map((it, idx) => ({
      idx,
      tag: (it.tag || "").toString().trim(),
      hex: normHex(it.hex),
    }))
    .filter((it) => isHex6(it.hex));

  const PARAMS_DEFAULT = {
    ALPHA: 1.2,
    BETA: 0.15,
    GAMMA: 0.08,
    DELTA: 0.35,
    C_NEUTRAL: 6.0,
    K: 3,
    ITER: 800,
    EPS_TIE: 0.35,
  };

  const PNG_MAX_SCALE = 10; // requested "svg 10 o superior" -> we cap to 10 but auto-limit by canvas max
  const CANVAS_MAX_DIM = 16384; // safe limit for many browsers

  const STORAGE_KEY = "pbn_recolor_state_v9";

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  function normHex(v) {
    const s = (v || "").toString().trim().toLowerCase();
    if (!s) return "";
    if (s[0] !== "#") return s.startsWith("rgb") ? (rgbToHex(s) || "") : "";
    return s;
  }
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test((s || "").trim());

  // ---------------- COLOR HELPERS ----------------
  function rgbToHex(rgb) {
    const m = (rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toLowerCase();
  }

  function textColorForBg(hex) {
    const h = (hex || "").replace("#", "");
    if (h.length !== 6) return "#000";
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return y > 140 ? "#000" : "#fff";
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

  function getTextFillHex(textEl) {
    // Try attribute first (most reliable for export consistency)
    const fAttr = textEl.getAttribute && textEl.getAttribute("fill");
    if (fAttr && fAttr !== "none" && fAttr !== "transparent") {
      const f = norm(fAttr);
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    }

    // style attr
    const styleAttr = textEl.getAttribute && textEl.getAttribute("style");
    if (styleAttr && /fill\s*:/i.test(styleAttr)) {
      const m = styleAttr.match(/fill:\s*([^;]+)/i);
      if (m && m[1]) {
        const v = norm(m[1]);
        if (v.startsWith("rgb")) return rgbToHex(v) || null;
        if (v.startsWith("#") && v.length === 7) return v;
      }
    }

    // computed style fallback
    try {
      const cs = window.getComputedStyle(textEl);
      const f = cs && cs.fill ? norm(cs.fill) : "";
      if (!f || f === "none" || f === "transparent") return null;
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    } catch (_) {}
    return null;
  }

  // ---------------- SVG SIZING ----------------
  function ensureViewBox(svg) {
    if (!svg || svg.tagName.toLowerCase() !== "svg") return;
    if (svg.getAttribute("viewBox")) return;

    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");
    const w = parseFloat(wAttr);
    const h = parseFloat(hAttr);

    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      return;
    }

    try {
      const bb = svg.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) {
        svg.setAttribute("viewBox", `0 0 ${bb.width} ${bb.height}`);
      }
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

  function getSvgIntrinsicSize(svgEl) {
    ensureViewBox(svgEl);
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { w: parts[2], h: parts[3] };
      }
    }
    // fallback: width/height attrs
    const w = parseFloat(svgEl.getAttribute("width") || "0");
    const h = parseFloat(svgEl.getAttribute("height") || "0");
    if (w > 0 && h > 0) return { w, h };

    // fallback bbox
    try {
      const bb = svgEl.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) return { w: bb.width, h: bb.height };
    } catch (_) {}
    return { w: 1600, h: 1600 };
  }

  // ---------------- FIND OUTPUT SVG ----------------
  function findFinalOutputSvgLight() {
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;

    let best = null;
    let bestScore = 0;
    for (const s of svgs) {
      const score =
        s.querySelectorAll("path,polygon,rect,circle,ellipse").length * 2 +
        s.querySelectorAll("text").length * 3;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  // ---------------- DOWNLOAD ROW / HOST ----------------
  function findDownloadButtonsRow() {
    const btns = Array.from(document.querySelectorAll("button, a"));
    const hits = btns.filter((b) => {
      const t = norm(b.textContent);
      return t.includes("download svg") || t.includes("download png") || t.includes("download palette");
    });
    if (!hits.length) return null;

    for (const b of hits) {
      const p = b.parentElement;
      if (!p) continue;
      const txt = norm(p.textContent);
      if (txt.includes("download svg") && (txt.includes("download png") || txt.includes("download palette"))) return p;
    }
    return hits[0].parentElement || null;
  }

  function ensureHostBelowDownloads() {
    let host = document.getElementById("recolor-host");
    if (host) return host;

    const downloadsRow = findDownloadButtonsRow();
    if (!downloadsRow || !downloadsRow.parentElement) return null;

    host = document.createElement("div");
    host.id = "recolor-host";
    host.style.cssText = `
      margin-top: 14px;
      padding: 14px;
      border: 1px solid rgba(0,0,0,.12);
      border-radius: 12px;
      background: rgba(255,255,255,.96);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    downloadsRow.parentElement.insertBefore(host, downloadsRow.nextSibling);
    return host;
  }

  // ---------------- GROUP FILLS ----------------
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

  // ---------------- DOWNLOAD HELPERS ----------------
  function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function downloadSvgAsPng(svgEl, filename, scaleWanted = PNG_MAX_SCALE) {
    // Clone and make sure it has explicit sizing and styles for export
    const clone = svgEl.cloneNode(true);
    ensureViewBox(clone);

    // Ensure text fill + fill-opacity are explicit for export consistency
    Array.from(clone.querySelectorAll("text")).forEach((t) => {
      const fill = getTextFillHex(t) || "#000000";
      if (!t.getAttribute("fill")) t.setAttribute("fill", fill);
      if (!t.getAttribute("fill-opacity")) {
        const csOp = (() => {
          const op = t.getAttribute("opacity");
          if (op != null) return op;
          const fo = t.getAttribute("fill-opacity");
          if (fo != null) return fo;
          return null;
        })();
        if (csOp != null) t.setAttribute("fill-opacity", csOp);
      }
    });

    const { w, h } = getSvgIntrinsicSize(clone);

    // choose scale up to 10, but cap canvas max dimension
    const maxDim = Math.max(w, h);
    const capScale = Math.max(1, Math.floor(CANVAS_MAX_DIM / maxDim));
    const scale = Math.max(1, Math.min(scaleWanted, capScale));

    // Force width/height to scaled pixels to avoid pixelation
    clone.setAttribute("width", String(Math.round(w * scale)));
    clone.setAttribute("height", String(Math.round(h * scale)));
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.decoding = "async";

    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e);
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // For line-art, smoothing sometimes reduces crispness; keep default but allow browser decide
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    URL.revokeObjectURL(url);

    // toBlob sometimes fails on huge canvases; fallback to dataURL
    const blobPng = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        "image/png",
        1.0
      );
      setTimeout(() => resolve(null), 5000);
    });

    if (blobPng) {
      const pngUrl = URL.createObjectURL(blobPng);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 4000);
    } else {
      // fallback
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ---------------- SVG STYLE INJECTION (toggles) ----------------
  function ensureSvgStyle(svg, id) {
    let style = svg.querySelector(`#${id}`);
    if (style) return style;
    style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("id", id);
    svg.insertBefore(style, svg.firstChild);
    return style;
  }

  function setBorders(svg, on) {
    const style = ensureSvgStyle(svg, "recolor-borders-style");
    style.textContent = on
      ? ""
      : `
        [fill="none"][stroke], path[stroke][fill="none"], polyline[stroke], line[stroke] {
          stroke-opacity: 0 !important;
        }
        [stroke][fill="transparent"], path[stroke][fill="transparent"] {
          stroke-opacity: 0 !important;
        }
      `;
  }

  function setColorFills(svg, on) {
    const style = ensureSvgStyle(svg, "recolor-fills-style");
    style.textContent = on
      ? ""
      : `
        path, polygon, rect, circle, ellipse {
          fill: none !important;
        }
      `;
  }

  // ---------------- UI ATOMS ----------------
  function makeBadgeCorner(text) {
    const b = document.createElement("span");
    b.textContent = text;
    b.setAttribute(
      "style",
      `
        position:absolute !important;
        left:4px !important;
        top:4px !important;
        padding:2px 6px !important;
        border-radius:999px !important;
        font-size:11px !important;
        font-weight:900 !important;
        background: rgba(255,255,255,.90) !important;
        border: 1px solid rgba(0,0,0,.12) !important;
        color: rgba(0,0,0,.85) !important;
        max-width: calc(100% - 8px) !important;
        white-space: nowrap !important;
        overflow:hidden !important;
        text-overflow: ellipsis !important;
        pointer-events:none !important;
        line-height: 1 !important;
      `.trim()
    );
    return b;
  }

  function makePressyButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = `
      padding:10px 14px;
      border-radius:12px;
      border:1px solid rgba(0,0,0,.22);
      background:white;
      cursor:pointer;
      font-weight:900;
      display:inline-flex;
      align-items:center;
      gap:8px;
      box-shadow: 0 2px 10px rgba(0,0,0,.08);
      transition: transform 80ms ease, box-shadow 120ms ease, background 120ms ease;
    `;
    btn.innerHTML = `<span class="btn-label">${label}</span><span class="btn-spin" style="display:none;width:14px;height:14px;border-radius:999px;border:2px solid rgba(0,0,0,.18);border-top-color:rgba(0,0,0,.55);animation:spin 700ms linear infinite;"></span>`;

    // inject keyframes once
    if (!document.getElementById("recolor-spin-style")) {
      const st = document.createElement("style");
      st.id = "recolor-spin-style";
      st.textContent = `@keyframes spin{to{transform:rotate(360deg)}}`;
      document.head.appendChild(st);
    }

    btn.addEventListener("mousedown", () => {
      btn.style.transform = "translateY(1px)";
      btn.style.boxShadow = "0 1px 6px rgba(0,0,0,.10)";
      btn.style.background = "rgba(0,0,0,.02)";
    });
    const up = () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 2px 10px rgba(0,0,0,.08)";
      btn.style.background = "white";
    };
    btn.addEventListener("mouseup", up);
    btn.addEventListener("mouseleave", up);

    btn._setLoading = (on) => {
      const sp = btn.querySelector(".btn-spin");
      if (sp) sp.style.display = on ? "inline-block" : "none";
    };

    return btn;
  }

  function makeToggleButton(label, initialOn, onChange) {
    let on = !!initialOn;
    const btn = document.createElement("button");
    btn.type = "button";

    const paint = () => {
      btn.textContent = `${label}: ${on ? "ON" : "OFF"}`;
      btn.style.cssText = `
        padding:10px 14px;
        border-radius:12px;
        border:1px solid rgba(0,0,0,.22);
        background:${on ? "white" : "rgba(0,0,0,.06)"};
        cursor:pointer;
        font-weight:900;
        box-shadow: ${on ? "0 2px 10px rgba(0,0,0,.08)" : "none"};
        transition: transform 80ms ease, box-shadow 120ms ease, background 120ms ease;
      `;
    };
    paint();

    btn.addEventListener("click", () => {
      on = !on;
      paint();
      onChange(on);
    });

    btn._get = () => on;
    btn._set = (v) => {
      on = !!v;
      paint();
    };

    return btn;
  }

  function makePickerTileX() {
    const x = document.createElement("div");
    x.className = "tile-used-x";
    x.style.cssText = `
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:1000;
      font-size:22px;
      color: rgba(0,0,0,.65);
      text-shadow: 0 1px 0 rgba(255,255,255,.55);
      pointer-events:none;
      opacity:0;
      transition: opacity 120ms ease;
    `;
    x.textContent = "✕";
    return x;
  }

  function renderGridPicker({ onPick, isUsed }) {
    const grid = document.createElement("div");
    grid.style.cssText = `
      display:grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 6px;
      max-height: 340px;
      overflow:auto;
      padding: 6px;
      border: 1px solid rgba(0,0,0,.10);
      border-radius: 12px;
      background: rgba(0,0,0,.02);
    `;

    const items = PALETTE_LIST;
    const tilesByHex = new Map();

    items.forEach((it) => {
      const hex = it.hex;
      const tag = it.tag;

      const tile = document.createElement("button");
      tile.type = "button";
      tile.title = tag ? `${tag} — ${hex}` : hex;
      tile.style.cssText = `
        height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.16);
        background: ${hex};
        cursor: pointer;
        position: relative;
        overflow: hidden;
      `;

      if (tag) tile.appendChild(makeBadgeCorner(tag));
      const x = makePickerTileX();
      tile.appendChild(x);

      tile.addEventListener("click", () => onPick({ hex, tag }));

      grid.appendChild(tile);
      tilesByHex.set(hex, tile);
    });

    function refreshUsedX() {
      for (const [hex, tile] of tilesByHex.entries()) {
        const x = tile.querySelector(".tile-used-x");
        if (!x) continue;
        x.style.opacity = isUsed(hex) ? "1" : "0";
      }
    }

    refreshUsedX();
    return { grid, refreshUsedX };
  }

  // ---------------- ORIGINAL TAG MAPPING (stable) ----------------
  function buildOriginalTagByHexFromSvgLegend(svg) {
    const map = {};
    if (!svg) return map;

    const rects = Array.from(svg.querySelectorAll("rect")).filter((r) => {
      const w = parseFloat(r.getAttribute("width") || "0");
      const h = parseFloat(r.getAttribute("height") || "0");
      return w > 6 && h > 6 && w <= 140 && h <= 140;
    });

    for (const rect of rects) {
      const fill = (rect.getAttribute("fill") || "").trim();
      let hex = "";
      if (fill.startsWith("#") && fill.length === 7) hex = fill.toLowerCase();
      else if (fill.startsWith("rgb")) hex = rgbToHex(fill) || "";
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
        if (tag && /^[a-z0-9]{1,6}$/i.test(tag) && !map[hex]) map[hex] = tag;
      }
    }
    return map;
  }

  function buildOriginalTagByHexFallback(svg) {
    // fallback: map most common text labels by scanning texts with numeric-ish tags
    const map = {};
    const texts = Array.from(svg.querySelectorAll("text"));
    // Try to find per-color legend not available; fallback returns empty
    // (kept for compatibility; legend-based is primary and stable)
    void texts;
    return map;
  }

  function isNumericTag(t) {
    return /^-?\d+(\.\d+)?$/.test((t || "").toString().trim());
  }

  function cmpTagAsc(a, b) {
    const ta = (a || "").toString().trim();
    const tb = (b || "").toString().trim();
    const na = isNumericTag(ta) ? Number(ta) : null;
    const nb = isNumericTag(tb) ? Number(tb) : null;

    if (na !== null && nb !== null) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return ta.localeCompare(tb, "es", { numeric: true, sensitivity: "base" });
  }

  // ---------------- COLOR SCIENCE (Lab + ΔE00) ----------------
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function hexToRgb01(hex) {
    const h = (hex || "").replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  function rgbToXyzD65(r, g, b) {
    // sRGB -> linear -> XYZ D65
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);

    // sRGB D65 matrix
    const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    const y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
    const z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
    return { x, y, z };
  }
  function xyzToLabD65(x, y, z) {
    // reference white D65
    const Xn = 0.95047;
    const Yn = 1.0;
    const Zn = 1.08883;

    let fx = x / Xn;
    let fy = y / Yn;
    let fz = z / Zn;

    const eps = 216 / 24389;
    const k = 24389 / 27;

    const f = (t) => (t > eps ? Math.cbrt(t) : (k * t + 16) / 116);

    fx = f(fx);
    fy = f(fy);
    fz = f(fz);

    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const b = 200 * (fy - fz);
    return { L, a, b };
  }
  function labExtras(lab) {
    const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
    if (h < 0) h += 360;
    return { ...lab, C, h };
  }
  function hexToLab(hex) {
    const { r, g, b } = hexToRgb01(hex);
    const xyz = rgbToXyzD65(r, g, b);
    return xyzToLabD65(xyz.x, xyz.y, xyz.z);
  }

  // CIEDE2000 (kL=kC=kH=1)
  function deltaE00(l1, l2) {
    const L1 = l1.L, a1 = l1.a, b1 = l1.b;
    const L2 = l2.L, a2 = l2.a, b2 = l2.b;

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

    const h1p = hp(a1p, b1);
    const h2p = hp(a2p, b2);

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp = h2p - h1p;
    if (C1p * C2p === 0) dhp = 0;
    else {
      if (dhp > 180) dhp -= 360;
      if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp / 2));

    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;

    let hbarp = h1p + h2p;
    if (C1p * C2p === 0) hbarp = h1p + h2p;
    else {
      if (Math.abs(h1p - h2p) > 180) {
        hbarp = (h1p + h2p + 360) / 2;
        if (h1p + h2p >= 360) hbarp = (h1p + h2p - 360) / 2;
      } else {
        hbarp = (h1p + h2p) / 2;
      }
    }

    const T =
      1 -
      0.17 * Math.cos(deg2rad(hbarp - 30)) +
      0.24 * Math.cos(deg2rad(2 * hbarp)) +
      0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
      0.20 * Math.cos(deg2rad(4 * hbarp - 63));

    const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
    const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;
    const RT = -Math.sin(deg2rad(2 * dTheta)) * RC;

    const dE = Math.sqrt(
      Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );

    return dE;

    function hp(ap, b) {
      if (ap === 0 && b === 0) return 0;
      let h = Math.atan2(b, ap) * (180 / Math.PI);
      if (h < 0) h += 360;
      return h;
    }
    function deg2rad(d) {
      return (d * Math.PI) / 180;
    }
  }

  function hueDist(h1, h2) {
    const d = Math.abs(h1 - h2) % 360;
    return d > 180 ? 360 - d : d;
  }

  function deltaE76(l1, l2) {
    const dL = l1.L - l2.L;
    const da = l1.a - l2.a;
    const db = l1.b - l2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  // ---------------- ADVANCED SUGGESTION ENGINE ----------------
  function buildPaletteCache(paletteList) {
    const out = paletteList.map((p) => {
      const lab = labExtras(hexToLab(p.hex));
      return { ...p, ...lab };
    });

    // rankL_pal: increasing L*
    const sortedIdx = out
      .map((p, i) => ({ i, L: p.L }))
      .sort((a, b) => a.L - b.L)
      .map((x) => x.i);
    const rankL = new Array(out.length);
    sortedIdx.forEach((idx, r) => (rankL[idx] = r));
    out.forEach((p, i) => (p.rankL_pal = rankL[i]));
    return out;
  }

  function buildOriginalCache(entries, weightsMap) {
    const out = entries.map((e, i) => {
      const lab = labExtras(hexToLab(e.oldHex));
      const w = weightsMap && weightsMap[e.oldHex] ? weightsMap[e.oldHex] : 1;
      return { i, tag: e.tagOriginal || "", hex: e.oldHex, ...lab, w };
    });

    // rankL_orig: increasing L*
    const sortedIdx = out
      .map((o, i) => ({ i, L: o.L }))
      .sort((a, b) => a.L - b.L)
      .map((x) => x.i);
    const rankL = new Array(out.length);
    sortedIdx.forEach((idx, r) => (rankL[idx] = r));
    out.forEach((o, i) => (o.rankL_orig = rankL[i]));
    return out;
  }

  function buildKNNGraph(originalCache, K) {
    const n = originalCache.length;
    const graph = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      const oi = originalCache[i];
      const dists = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const oj = originalCache[j];
        const d = deltaE76(oi, oj); // fast for neighbor selection
        dists.push({ j, d });
      }
      dists.sort((a, b) => a.d - b.d);
      graph[i] = dists.slice(0, Math.min(K, dists.length)).map((x) => x.j);
    }

    // edge list unique (i<j)
    const edges = [];
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      for (const j of graph[i]) {
        const a = Math.min(i, j), b = Math.max(i, j);
        const key = `${a}-${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const dOrig = deltaE00(originalCache[a], originalCache[b]); // accurate for grad term
        edges.push({ a, b, dOrig });
      }
    }
    return { graph, edges };
  }

  function buildCostMatrix(originalCache, paletteCache, params) {
    const { ALPHA, BETA, GAMMA, C_NEUTRAL } = params;
    const n = originalCache.length;
    const m = paletteCache.length;

    // C[i][j]
    const C = Array.from({ length: n }, () => new Float64Array(m));
    for (let i = 0; i < n; i++) {
      const o = originalCache[i];
      const neutralTarget = o.C < C_NEUTRAL;

      for (let j = 0; j < m; j++) {
        const p = paletteCache[j];

        const base = deltaE00(o, p);

        const scale = ALPHA * Math.abs(o.rankL_orig - p.rankL_pal);
        const hue = BETA * hueDist(o.h, p.h);

        const neutral = neutralTarget ? GAMMA * Math.max(0, p.C - o.C) : 0;

        const cost = o.w * (base + scale + hue + neutral);
        C[i][j] = cost;
      }
    }
    return C;
  }

  // Hungarian assignment for rectangular n x m with n <= m
  function hungarianAssign(costMatrix) {
    const n = costMatrix.length;
    const m = costMatrix[0].length;
    // u potentials (n+1), v (m+1), p (m+1), way (m+1)
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
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }
        j0 = j1;
      } while (p[j0] !== 0);

      // augmenting
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    // result: assignment for i (1..n) -> j
    const assign = new Int32Array(n);
    for (let j = 1; j <= m; j++) {
      if (p[j] > 0 && p[j] <= n) {
        assign[p[j] - 1] = j - 1;
      }
    }
    return assign; // length n, each is palette index
  }

  function refineBySwaps(assign, originalCache, paletteCache, graphObj, params) {
    const { edges } = graphObj;
    const { DELTA, ITER } = params;

    const n = originalCache.length;
    if (n <= 1) return assign;

    // cache palette-palette ΔE00
    const m = paletteCache.length;
    const palDE = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) {
      palDE[i][i] = 0;
      for (let j = i + 1; j < m; j++) {
        const d = deltaE00(paletteCache[i], paletteCache[j]);
        palDE[i][j] = d;
        palDE[j][i] = d;
      }
    }

    // helper: energy delta for swapping i1,i2
    function nodeCost(i, palIdx) {
      const o = originalCache[i];
      const p = paletteCache[palIdx];

      const base = deltaE00(o, p);
      const scale = params.ALPHA * Math.abs(o.rankL_orig - p.rankL_pal);
      const hue = params.BETA * hueDist(o.h, p.h);
      const neutral = o.C < params.C_NEUTRAL ? params.GAMMA * Math.max(0, p.C - o.C) : 0;
      return o.w * (base + scale + hue + neutral);
    }

    // build adjacency for incident edges fast
    const incident = Array.from({ length: n }, () => []);
    edges.forEach((e, idx) => {
      incident[e.a].push(idx);
      incident[e.b].push(idx);
    });

    function edgeCost(e, aPal, bPal) {
      const dPal = palDE[aPal][bPal];
      return DELTA * Math.abs(e.dOrig - dPal);
    }

    for (let it = 0; it < ITER; it++) {
      const i1 = (Math.random() * n) | 0;
      let i2 = (Math.random() * n) | 0;
      if (i2 === i1) i2 = (i2 + 1) % n;

      const p1 = assign[i1];
      const p2 = assign[i2];

      // node delta
      let deltaE = 0;
      deltaE += nodeCost(i1, p2) - nodeCost(i1, p1);
      deltaE += nodeCost(i2, p1) - nodeCost(i2, p2);

      // edges incident to i1 or i2
      const touched = new Set([...incident[i1], ...incident[i2]]);
      for (const eIdx of touched) {
        const e = edges[eIdx];
        const a = e.a, b = e.b;
        const paOld = assign[a];
        const pbOld = assign[b];

        // compute new assigned palettes after swap
        const paNew = a === i1 ? p2 : a === i2 ? p1 : paOld;
        const pbNew = b === i1 ? p2 : b === i2 ? p1 : pbOld;

        const oldC = edgeCost(e, paOld, pbOld);
        const newC = edgeCost(e, paNew, pbNew);
        deltaE += newC - oldC;
      }

      if (deltaE < 0) {
        assign[i1] = p2;
        assign[i2] = p1;
      }
    }

    return assign;
  }

  function suggestOneToOneMapping(originalEntries, weightsMap, params, paletteCache) {
    const originalCache = buildOriginalCache(originalEntries, weightsMap);
    const n = originalCache.length;
    const m = paletteCache.length;

    if (n === 0) return { mappingByOldHex: {}, meta: {} };

    // If N > 167, assign top 167 by weight, rest later (closest used)
    let activeIdx = [...Array(n).keys()];
    if (n > m) {
      activeIdx.sort((i, j) => (originalCache[j].w || 1) - (originalCache[i].w || 1));
      activeIdx = activeIdx.slice(0, m);
    }

    // build cost matrix for active
    const activeOriginal = activeIdx.map((i) => originalEntries[i]);
    const activeWeights = {};
    activeIdx.forEach((i) => (activeWeights[originalEntries[i].oldHex] = weightsMap[originalEntries[i].oldHex] || 1));

    const activeCache = buildOriginalCache(activeOriginal, activeWeights);
    const C = buildCostMatrix(activeCache, paletteCache, params);

    const assign = hungarianAssign(C); // length activeN, palette index
    const graphObj = buildKNNGraph(activeCache, params.K);
    const refined = refineBySwaps(assign, activeCache, paletteCache, graphObj, params);

    const mappingByOldHex = {};
    for (let i = 0; i < activeCache.length; i++) {
      const palIdx = refined[i];
      mappingByOldHex[activeOriginal[i].oldHex] = palIdx;
    }

    // Handle leftovers if any: map to closest USED palette (allowed repeats only for leftovers)
    if (n > m) {
      const usedPal = new Set(Object.values(mappingByOldHex));
      const usedArray = Array.from(usedPal);

      for (let i = 0; i < n; i++) {
        const oldHex = originalEntries[i].oldHex;
        if (mappingByOldHex[oldHex] != null) continue;

        const oLab = labExtras(hexToLab(oldHex));
        let best = usedArray[0];
        let bestD = Infinity;
        for (const pIdx of usedArray) {
          const d = deltaE00(oLab, paletteCache[pIdx]);
          if (d < bestD) {
            bestD = d;
            best = pIdx;
          }
        }
        mappingByOldHex[oldHex] = best;
      }
    }

    return { mappingByOldHex, meta: { activeN: activeIdx.length } };
  }

  // ---------------- MEMORY ----------------
  function hashSignatureFromEntries(entries, groups) {
    // signature for "new image": oldHex + count + sorted
    const parts = entries
      .map((e) => `${e.oldHex}:${(groups.get(e.oldHex) || []).length}`)
      .sort()
      .join("|");
    // cheap hash
    let h = 2166136261;
    for (let i = 0; i < parts.length; i++) {
      h ^= parts.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `sig_${(h >>> 0).toString(16)}`;
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function saveState(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  // ---------------- EDITOR ----------------
  const paletteCache = buildPaletteCache(PALETTE_LIST);

  function openEditor(originalSvg) {
    const host = ensureHostBelowDownloads();
    if (!host) return alert("Aún no está listo el output. Genera el SVG (PROCESS IMAGE) y vuelve a intentar.");
    host.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE_LIST.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        Selecciona color original → elige reemplazo / sugerencia → (renombrar) → toggles → descarga
      </div>
    `;
    host.appendChild(header);

    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

    // collect groups from recolorSvg (this is the editable one)
    const fillGroups = collectFillGroups(recolorSvg);

    // original tag map: legend is most reliable
    const legendMap = buildOriginalTagByHexFromSvgLegend(originalSvg);
    const fallbackMap = buildOriginalTagByHexFallback(originalSvg);
    const origTagByHex = { ...fallbackMap, ...legendMap };

    // build entries sorted by original TAG asc
    const rawEntries = Array.from(fillGroups.entries()).map(([oldHex, nodes]) => {
      const tagOriginal = origTagByHex[oldHex] || "";
      return { oldHex, nodes, tagOriginal };
    });

    rawEntries.sort((a, b) => {
      const ta = a.tagOriginal || "";
      const tb = b.tagOriginal || "";
      const hasA = !!ta;
      const hasB = !!tb;

      if (hasA && hasB) return cmpTagAsc(ta, tb);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      return a.oldHex.localeCompare(b.oldHex);
    });

    // weights = node count (proxy area)
    const weightsMap = {};
    rawEntries.forEach((e) => (weightsMap[e.oldHex] = (fillGroups.get(e.oldHex) || []).length || 1));

    // signature for state reset
    const signature = hashSignatureFromEntries(rawEntries, fillGroups);

    // load memory state (only if same signature)
    const saved = loadState();
    const state =
      saved && saved.signature === signature
        ? saved
        : {
            signature,
            replByOldHex: {},
            renameByOldHex: {},
            toggles: { colorsOn: true, bordersOn: true, textColorOn: false, suggestOneToOneOn: true },
            textOpacity: 0.3,
          };

    // toggles
    let colorsOn = !!state.toggles.colorsOn;
    let bordersOn = !!state.toggles.bordersOn;
    let textColorOn = !!state.toggles.textColorOn;
    let suggestOneToOneOn = state.toggles.suggestOneToOneOn !== false; // default ON
    let textOpacity = clamp01(state.textOpacity ?? 0.3);

    setColorFills(recolorSvg, colorsOn);
    setBorders(recolorSvg, bordersOn);

    // capture ORIGINAL text fill colors once (FIX: default not black)
    const textEls = Array.from(recolorSvg.querySelectorAll("text"));
    textEls.forEach((t) => {
      if (!t.getAttribute("data-orig-fill")) {
        const f = getTextFillHex(t) || "#000000";
        t.setAttribute("data-orig-fill", f);
      }
      // ensure default fill is whatever SVG had (do not override)
      // ensure fill-opacity exists and is driven by slider
      t.setAttribute("fill-opacity", String(textOpacity));
    });

    // UI previews
    const previews = document.createElement("div");
    previews.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";

    const panel = (title, node) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = `
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px;
        overflow: hidden;
        background: white;
      `;
      const h = document.createElement("div");
      h.textContent = title;
      h.style.cssText = "font-weight:800; margin-bottom: 8px;";
      const viewport = document.createElement("div");
      viewport.style.cssText = `
        width: 100%;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.10);
        background: white;
        overflow: hidden;
      `;
      viewport.appendChild(node);
      wrap.appendChild(h);
      wrap.appendChild(viewport);
      return wrap;
    };

    previews.appendChild(panel("Original", originalClone));
    previews.appendChild(panel("Recoloreada", recolorSvg));
    host.appendChild(previews);

    // used replacement set
    const usedReplacementHex = new Set();

    // controls layout
    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    const left = document.createElement("div");
    left.style.cssText =
      "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (TAG + reemplazo + renombrar + sugerido)</div>`;
    controls.appendChild(left);

    const right = document.createElement("div");
    right.style.cssText =
      "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Picker (grilla con tags del Excel)</div>`;
    controls.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Click en un color original (izquierda). Luego elige el color nuevo en la grilla.";
    right.appendChild(info);

    let selectedOldHex = null;

    // apply replacement helper
    function applyReplacement(oldHex, newHex, newTag, opts = {}) {
      oldHex = normHex(oldHex);
      newHex = normHex(newHex);
      if (!isHex6(oldHex) || !isHex6(newHex)) return;

      // update used set (if manual)
      const row = left.querySelector(`[data-oldhex="${oldHex}"]`);
      if (row) {
        const prev = row.getAttribute("data-replhex") || "";
        if (prev) usedReplacementHex.delete(normHex(prev));
        usedReplacementHex.add(newHex);
        row.setAttribute("data-replhex", newHex);
      } else {
        usedReplacementHex.add(newHex);
      }

      // update fills
      const nodes = fillGroups.get(oldHex) || [];
      nodes.forEach((el) => {
        el.setAttribute("fill", newHex);
        if (el.hasAttribute("style")) {
          el.setAttribute("style", el.getAttribute("style").replace(/fill:\s*[^;]+;?/gi, ""));
        }
      });

      // persist
      state.replByOldHex[oldHex] = { hex: newHex, tag: (newTag || "").toString().trim() };
      saveState(state);

      // update UI row
      if (row) {
        const swNew = row.querySelector(".sw-new");
        const txt = row.querySelector(".row-text");
        const badgeHost = row.querySelector(".new-badge-host");
        const input = row.querySelector("input[data-rename]");
        if (swNew) {
          swNew.style.background = newHex;
          swNew.style.borderStyle = "solid";
        }
        if (badgeHost) {
          badgeHost.innerHTML = "";
          if (newTag) badgeHost.appendChild(makeBadgeCorner(newTag));
        }
        if (txt) txt.textContent = newTag ? `Reemplazo: ${newTag} (${newHex})` : `Reemplazo: ${newHex}`;

        // IMPORTANT: auto-fill rename input with picker TAG (keeps editable)
        if (!opts.skipRenameAuto && input && newTag) {
          input.value = newTag;
          // update labels
          updateLabelsForOldHex(oldHex, newTag);
          state.renameByOldHex[oldHex] = newTag;
          saveState(state);
        }
      }

      // update text coloring mode if ON
      applyTextMode();

      picker.refreshUsedX();
    }

    // text labeling helpers
    function getLabelNodesForOldHex(oldHex) {
      const e = rawEntries.find((x) => x.oldHex === oldHex);
      const tagOriginal = e ? (e.tagOriginal || "").trim() : "";
      const savedRename = (state.renameByOldHex[oldHex] || "").trim();

      // Prefer matching saved rename if exists; else original
      const needle = savedRename || tagOriginal;
      if (!needle) return [];

      // Note: to avoid collisions, restrict to short tags
      const texts = Array.from(recolorSvg.querySelectorAll("text"));
      return texts.filter((t) => (t.textContent || "").trim() === needle);
    }

    function updateLabelsForOldHex(oldHex, newText) {
      const e = rawEntries.find((x) => x.oldHex === oldHex);
      if (!e) return;

      const tagOriginal = (e.tagOriginal || "").trim();
      const prevRename = (state.renameByOldHex[oldHex] || "").trim();

      const texts = Array.from(recolorSvg.querySelectorAll("text"));
      // update nodes that equal original OR previous rename (so reopening continues to work)
      const targets = texts.filter((t) => {
        const v = (t.textContent || "").trim();
        return (tagOriginal && v === tagOriginal) || (prevRename && v === prevRename);
      });

      targets.forEach((t) => (t.textContent = newText));
    }

    // picker
    const picker = renderGridPicker({
      isUsed: (hex) => usedReplacementHex.has(normHex(hex)),
      onPick: ({ hex: newHex, tag: newTag }) => {
        if (!selectedOldHex) {
          alert("Primero selecciona un color original (panel izquierdo).");
          return;
        }
        applyReplacement(selectedOldHex, newHex, newTag);
      },
    });
    right.appendChild(picker.grid);

    // suggestion toggle
    const suggestBar = document.createElement("div");
    suggestBar.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;";
    right.appendChild(suggestBar);

    const btnSuggestMode = makeToggleButton("Sugerencia 1:1 (sin repetir) + Preservar escala", suggestOneToOneOn, (on) => {
      suggestOneToOneOn = on;
      state.toggles.suggestOneToOneOn = on;
      saveState(state);
      computeAndRenderSuggestions();
    });
    suggestBar.appendChild(btnSuggestMode);

    // list
    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 420px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    // compute suggestion mapping (global 1:1 by default)
    let suggestionByOldHex = {}; // oldHex -> {hex, tag}
    function computeAndRenderSuggestions() {
      if (!rawEntries.length) return;

      if (suggestOneToOneOn) {
        const { mappingByOldHex } = suggestOneToOneMapping(rawEntries, weightsMap, { ...PARAMS_DEFAULT }, paletteCache);
        suggestionByOldHex = {};
        for (const oldHex of Object.keys(mappingByOldHex)) {
          const idx = mappingByOldHex[oldHex];
          const p = paletteCache[idx];
          suggestionByOldHex[oldHex] = { hex: p.hex, tag: p.tag || "" };
        }
      } else {
        // local closest ΔE00 only
        suggestionByOldHex = {};
        rawEntries.forEach((e) => {
          const o = labExtras(hexToLab(e.oldHex));
          let best = paletteCache[0];
          let bestD = Infinity;
          for (const p of paletteCache) {
            const d = deltaE00(o, p);
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
          suggestionByOldHex[e.oldHex] = { hex: best.hex, tag: best.tag || "" };
        });
      }

      // update UI suggestion boxes
      rawEntries.forEach((e) => {
        const row = list.querySelector(`button[data-oldhex="${e.oldHex}"]`);
        if (!row) return;
        const sug = suggestionByOldHex[e.oldHex];
        const sugBox = row.querySelector(".sw-sug");
        const sugBadgeHost = row.querySelector(".sug-badge-host");
        if (sugBox && sug) {
          sugBox.style.background = sug.hex;
          sugBox.style.borderStyle = "solid";
          if (sugBadgeHost) {
            sugBadgeHost.innerHTML = "";
            if (sug.tag) sugBadgeHost.appendChild(makeBadgeCorner(sug.tag));
          }
          row.setAttribute("data-sughex", sug.hex);
          row.setAttribute("data-sugtag", sug.tag || "");
        }
      });
    }

    if (!rawEntries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG.";
      list.appendChild(empty);
    } else {
      rawEntries.forEach(({ oldHex, tagOriginal }) => {
        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.setAttribute("data-replhex", "");
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 72px 72px 72px 72px 1fr; /* 4 equal boxes + meta */
          gap: 10px;
          align-items:center;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.12);
          background: white;
          cursor: pointer;
        `;

        // box 1: original tag swatch
        const boxTag = document.createElement("div");
        boxTag.style.cssText = `
          width:72px; height:44px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,.20);
          background:${oldHex};
          position:relative;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:900;
          font-size:18px;
          color:${textColorForBg(oldHex)};
        `;
        boxTag.textContent = tagOriginal || "";

        // box 2: replacement swatch
        const boxRepl = document.createElement("div");
        boxRepl.className = "sw-new";
        boxRepl.style.cssText = `
          width:72px; height:44px;
          border-radius:12px;
          border:1px dashed rgba(0,0,0,.20);
          background:transparent;
          position:relative;
          overflow:hidden;
        `;
        const newBadgeHost = document.createElement("div");
        newBadgeHost.className = "new-badge-host";
        newBadgeHost.style.cssText = "position:absolute; inset:0;";
        boxRepl.appendChild(newBadgeHost);

        // box 3: rename input
        const boxRename = document.createElement("div");
        boxRename.style.cssText = `
          width:72px; height:44px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,.22);
          background:white;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:0 6px;
        `;

        const input = document.createElement("input");
        input.type = "text";
        input.setAttribute("data-rename", "1");
        // initial: saved rename or original tag
        input.value = (state.renameByOldHex[oldHex] != null ? state.renameByOldHex[oldHex] : tagOriginal) || "";
        input.style.cssText = `
          width:100%;
          height:28px;
          border:0;
          outline:none;
          text-align:center;
          font-size:13px;
          background:transparent;
        `;
        boxRename.appendChild(input);

        // box 4: suggested swatch (click apply)
        const boxSug = document.createElement("div");
        boxSug.className = "sw-sug";
        boxSug.title = "Click para aplicar sugerencia";
        boxSug.style.cssText = `
          width:72px; height:44px;
          border-radius:12px;
          border:1px dashed rgba(0,0,0,.20);
          background:transparent;
          position:relative;
          overflow:hidden;
        `;
        const sugBadgeHost = document.createElement("div");
        sugBadgeHost.className = "sug-badge-host";
        sugBadgeHost.style.cssText = "position:absolute; inset:0;";
        boxSug.appendChild(sugBadgeHost);

        // meta stack
        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = tagOriginal ? `Tag original: ${tagOriginal} | Color: ${oldHex}` : `Color: ${oldHex}`;

        const repl = document.createElement("div");
        repl.className = "row-text";
        repl.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        repl.textContent = "Reemplazo: —";

        const sugLine = document.createElement("div");
        sugLine.className = "sug-text";
        sugLine.style.cssText = "font-size:12px; color: rgba(0,0,0,.60)";
        sugLine.textContent = "Sugerido: —";

        stack.appendChild(meta);
        stack.appendChild(repl);
        stack.appendChild(sugLine);

        // rename behavior
        input.addEventListener("input", () => {
          const v = input.value;
          updateLabelsForOldHex(oldHex, v);
          state.renameByOldHex[oldHex] = v;
          saveState(state);
          applyTextMode(); // if textColorOn, keep tint + opacity
        });

        // select row
        row.addEventListener("click", () => {
          selectedOldHex = oldHex;
          Array.from(list.querySelectorAll("button")).forEach((b) => {
            b.style.outline = "none";
            b.style.boxShadow = "none";
          });
          row.style.outline = "2px solid rgba(0,0,0,.28)";
          row.style.boxShadow = "0 0 0 4px rgba(0,0,0,.05)";
        });

        // apply suggestion click (stop bubbling so it doesn't require picker)
        boxSug.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const sugHex = row.getAttribute("data-sughex");
          const sugTag = row.getAttribute("data-sugtag") || "";
          if (!sugHex) return;
          selectedOldHex = oldHex;
          applyReplacement(oldHex, sugHex, sugTag);
        });

        row.appendChild(boxTag);
        row.appendChild(boxRepl);
        row.appendChild(boxRename);
        row.appendChild(boxSug);
        row.appendChild(stack);

        list.appendChild(row);
      });
    }

    // after rows exist, render suggestions (and update "Sugerido:" lines)
    computeAndRenderSuggestions();
    rawEntries.forEach((e) => {
      const row = list.querySelector(`button[data-oldhex="${e.oldHex}"]`);
      if (!row) return;
      const sug = suggestionByOldHex[e.oldHex];
      const sugLine = row.querySelector(".sug-text");
      if (sugLine && sug) sugLine.textContent = sug.tag ? `Sugerido: ${sug.tag} (${sug.hex})` : `Sugerido: ${sug.hex}`;
    });

    // restore saved replacements (memory)
    for (const oldHex of Object.keys(state.replByOldHex || {})) {
      const it = state.replByOldHex[oldHex];
      if (it && it.hex && isHex6(it.hex)) {
        applyReplacement(oldHex, it.hex, it.tag || "", { skipRenameAuto: true });
        // restore rename separately (so user’s rename persists even if tag differs)
        const row = list.querySelector(`button[data-oldhex="${oldHex}"]`);
        if (row) {
          const input = row.querySelector("input[data-rename]");
          if (input && state.renameByOldHex && state.renameByOldHex[oldHex] != null) {
            input.value = state.renameByOldHex[oldHex];
            updateLabelsForOldHex(oldHex, input.value);
          }
        }
      }
    }

    // toggles row (including text color + opacity)
    const togglesRow = document.createElement("div");
    togglesRow.style.cssText = `
      margin-top: 12px;
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      padding: 10px;
      border: 1px solid rgba(0,0,0,.10);
      border-radius: 12px;
      background: rgba(0,0,0,.02);
    `;

    const togglesLeft = document.createElement("div");
    togglesLeft.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; align-items:center;";

    const btnColors = makeToggleButton("Colores", colorsOn, (on) => {
      colorsOn = on;
      state.toggles.colorsOn = on;
      saveState(state);
      setColorFills(recolorSvg, colorsOn);
    });

    const btnBorders = makeToggleButton("Bordes", bordersOn, (on) => {
      bordersOn = on;
      state.toggles.bordersOn = on;
      saveState(state);
      setBorders(recolorSvg, bordersOn);
    });

    const btnTextColor = makeToggleButton("Color textos", textColorOn, (on) => {
      textColorOn = on;
      state.toggles.textColorOn = on;
      saveState(state);
      applyTextMode();
    });

    // opacity slider (works ON/OFF; always applies to current text color)
    const opWrap = document.createElement("div");
    opWrap.style.cssText = "display:flex; align-items:center; gap:10px; min-width: 320px;";

    const opLabel = document.createElement("div");
    opLabel.style.cssText = "font-size:12px; font-weight:800; color: rgba(0,0,0,.70);";
    opLabel.textContent = "Opacidad texto";

    const op = document.createElement("input");
    op.type = "range";
    op.min = "0";
    op.max = "100";
    op.value = String(Math.round(textOpacity * 100));
    op.style.cssText = "width: 140px;";

    const opVal = document.createElement("div");
    opVal.style.cssText = "font-size:12px; font-weight:900; color: rgba(0,0,0,.70); width:44px; text-align:right;";
    opVal.textContent = `${op.value}%`;

    op.addEventListener("input", () => {
      textOpacity = clamp01(Number(op.value) / 100);
      opVal.textContent = `${op.value}%`;
      state.textOpacity = textOpacity;
      saveState(state);
      applyTextMode(); // ALWAYS applies, regardless of textColorOn
    });

    opWrap.appendChild(opLabel);
    opWrap.appendChild(op);
    opWrap.appendChild(opVal);

    togglesLeft.appendChild(btnColors);
    togglesLeft.appendChild(btnBorders);
    togglesLeft.appendChild(btnTextColor);

    togglesRow.appendChild(togglesLeft);
    togglesRow.appendChild(opWrap);
    host.appendChild(togglesRow);

    // ---- apply text mode (FIX: default uses original SVG text color) ----
    function applyTextMode() {
      const texts = Array.from(recolorSvg.querySelectorAll("text"));
      const opacityStr = String(textOpacity);

      texts.forEach((t) => {
        // apply opacity ALWAYS
        t.setAttribute("fill-opacity", opacityStr);

        if (!textColorOn) {
          // restore original color (do NOT force black)
          const orig = t.getAttribute("data-orig-fill") || getTextFillHex(t) || "#000000";
          t.setAttribute("fill", orig);
          return;
        }

        // textColorOn: color each label according to its current replacement hex (if known)
        const label = (t.textContent || "").trim();
        if (!label) return;

        // find which original oldHex this label belongs to by rename mapping
        // build reverse map: label -> oldHex (best effort)
        let matchedOldHex = null;
        for (const e of rawEntries) {
          const rn = (state.renameByOldHex[e.oldHex] != null ? state.renameByOldHex[e.oldHex] : e.tagOriginal) || "";
          if ((rn || "").toString().trim() === label) {
            matchedOldHex = e.oldHex;
            break;
          }
        }
        if (!matchedOldHex) return;

        const repl = state.replByOldHex[matchedOldHex];
        if (repl && repl.hex && isHex6(repl.hex)) {
          t.setAttribute("fill", repl.hex);
        } else {
          // if no replacement yet, keep original fill
          const orig = t.getAttribute("data-orig-fill") || getTextFillHex(t) || "#000000";
          t.setAttribute("fill", orig);
        }
      });

      // make sure preview clone stays default (not required)
    }

    applyTextMode();

    // ---- downloads (with feedback + spinner) ----
    const dl = document.createElement("div");
    dl.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; margin-top: 12px;";
    host.appendChild(dl);

    const btnSvg = makePressyButton("DOWNLOAD RECOLORED SVG");
    btnSvg.addEventListener("click", async () => {
      btnSvg._setLoading(true);
      try {
        // ensure export consistency
        applyTextMode();
        const svgText = new XMLSerializer().serializeToString(recolorSvg);
        downloadText("paintbynumber_recolored.svg", svgText, "image/svg+xml");
      } finally {
        setTimeout(() => btnSvg._setLoading(false), 250);
      }
    });

    const btnPng = makePressyButton("DOWNLOAD RECOLORED PNG");
    btnPng.addEventListener("click", async () => {
      btnPng._setLoading(true);
      try {
        // ensure export consistency
        applyTextMode();
        await downloadSvgAsPng(recolorSvg, "paintbynumber_recolored.png", PNG_MAX_SCALE);
      } catch (e) {
        alert("No pude exportar PNG. (Posible límite de canvas / bloqueo del navegador).");
      } finally {
        setTimeout(() => btnPng._setLoading(false), 250);
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);

    // ---- done ----
  }

  function clamp01(x) {
    x = Number(x);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  // ---------------- LAUNCHER (LIGHT POLL) ----------------
  let launcherInjected = false;
  let polling = false;

  function ensureLauncher() {
    if (launcherInjected) return true;

    const host = ensureHostBelowDownloads();
    if (!host) return false;

    if (document.getElementById("btn-recolor-launch")) {
      launcherInjected = true;
      return true;
    }

    const svg = findFinalOutputSvgLight();
    if (!svg) return false;

    const bar = document.createElement("div");
    bar.id = "recolor-launchbar";
    bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    bar.innerHTML = `<div style="font-weight:900;">Recoloreo (paleta ${PALETTE_LIST.length})</div>`;

    const btn = makePressyButton("Abrir Recolorear");
    btn.id = "btn-recolor-launch";
    btn.addEventListener("click", () => {
      const current = findFinalOutputSvgLight();
      if (!current) return alert("Aún no detecto el SVG final. Aprieta PROCESS IMAGE y espera el output.");
      openEditor(current);
    });

    bar.appendChild(btn);
    host.appendChild(bar);

    const hint = document.createElement("div");
    hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-top: 6px;";
    hint.textContent =
      "Lista ordenada por tag. 4 cajas: tag / reemplazo / renombrar / sugerido. Sugerencia 1:1 por defecto. Memoria activa (se resetea solo al generar nueva imagen).";
    host.appendChild(hint);

    launcherInjected = true;
    return true;
  }

  function startPoll() {
    if (polling || launcherInjected) return;
    polling = true;

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const ok = ensureLauncher();
      if (ok || tries >= 40) {
        clearInterval(timer);
        polling = false;
      }
    }, 250);
  }

  window.addEventListener("load", () => {
    setTimeout(startPoll, 250);
    setTimeout(startPoll, 1200);
  });

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target && e.target.closest ? e.target.closest("button, a") : null;
      if (!el) return;

      const t = norm(el.textContent);
      if (t.includes("process image") || t.includes("download svg") || t.includes("download png") || t.includes("output")) {
        // new output likely -> allow launcher and new signature -> memory auto resets on open
        launcherInjected = false;
        setTimeout(startPoll, 60);
      }
    },
    true
  );
})();
