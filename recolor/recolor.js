/* Recolor add-on (v9.0 - ALL FIXES INCORPORATED)
   ✅ Hard reload safe: FAB + modal overlay (no early DOM injection)
   ✅ Restores ORIGINAL tag detection (0..n) + sort asc + renombrar edits real SVG texts
   ✅ Auto-rename on pick: rename input becomes picker tag (still editable)
   ✅ Picker shows X when a color is already used (indicator only)
   ✅ Colores ON/OFF, Bordes ON/OFF
   ✅ Color textos toggle:
        - ON  => text fill = replacement hex (by tag) else black
        - OFF => text fill = black
      Opacity slider ALWAYS applies (ON or OFF, color or black)
   ✅ PNG download fixed + HQ export:
        - Reads real SVG size (viewBox/attrs/bbox)
        - Exports at scale 10x by default (capped to avoid memory blowups)
        - Robust download (blob + dataURL fallback)
*/

(function () {
  // ---------- Config ----------
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map((x) => x.hex);

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);
  const isTagLike = (t) => /^[a-z0-9]{1,6}$/i.test((t || "").toString().trim());

  // ---------- Color helpers ----------
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

  // ---------- SVG sizing ----------
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

  function getSvgSize(svgEl) {
    ensureViewBox(svgEl);

    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { w: parts[2], h: parts[3] };
      }
    }

    const wAttr = parseFloat(svgEl.getAttribute("width") || "0");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "0");
    if (wAttr > 0 && hAttr > 0) return { w: wAttr, h: hAttr };

    try {
      const bb = svgEl.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) return { w: bb.width, h: bb.height };
    } catch (_) {}

    return { w: 1600, h: 1600 };
  }

  // ---------- Find output SVG ----------
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

  // ---------- Detect readiness ----------
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

  function isGeneratorReady() {
    return !!findDownloadButtonsRow() && !!findFinalOutputSvgLight();
  }

  // ---------- Group fills ----------
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

  // ---------- Download helpers ----------
  function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    forceDownloadBlob(blob, filename);
  }

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

    const { w: baseW, h: baseH } = getSvgSize(svgEl);

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

    // Try createImageBitmap first
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

      const pngBlob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 1.0);
      });

      if (pngBlob) {
        forceDownloadBlob(pngBlob, filename);
        return;
      }

      // fallback if toBlob fails
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch (_) {
      // Fallback to Image()
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
      ctx.setTransform(outW / baseW, 0, 0, outH / baseH, 0, 0);
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);

      const pngBlob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 1.0);
      });

      if (pngBlob) {
        forceDownloadBlob(pngBlob, filename);
        return;
      }

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ---------- SVG style injection (toggles) ----------
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

  // ---------- UI atoms ----------
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
      `;
    };
    paint();

    btn.addEventListener("click", () => {
      on = !on;
      paint();
      onChange(on);
    });

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

    const items = PALETTE_ITEMS.length ? PALETTE_ITEMS : PALETTE.map((hex) => ({ tag: "", hex }));
    const tilesByHex = new Map();

    items.forEach((it) => {
      const hex = norm(it.hex);
      const tag = (it.tag || "").toString().trim();

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

  // ---------- ORIGINAL TAG MAPPING ----------
  function buildOriginalTagByHexFromTopSwatches() {
    const map = {};
    const candidates = Array.from(document.querySelectorAll("button, div, span"))
      .filter((el) => el && el.textContent && !el.closest("#recolor-modal") && !el.closest("#recolor-fab"))
      .filter((el) => {
        const t = (el.textContent || "").trim();
        if (!t || !isTagLike(t)) return false;

        const r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 12 || r.width > 90 || r.height > 90) return false;

        const bg = getComputedStyle(el).backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return false;
        return true;
      });

    for (const el of candidates) {
      const tag = (el.textContent || "").trim();
      const bg = getComputedStyle(el).backgroundColor;
      const hex = rgbToHex(bg);
      if (hex && !map[hex]) map[hex] = tag;
    }
    return map;
  }

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
        if (tag && isTagLike(tag) && !map[hex]) map[hex] = tag;
      }
    }
    return map;
  }

  function buildOriginalTagByHexFromSvgProximity(svg, fillGroups) {
    const map = {};
    if (!svg || !fillGroups || !fillGroups.size) return map;

    const texts = Array.from(svg.querySelectorAll("text"))
      .map((t) => {
        const tag = (t.textContent || "").toString().trim();
        if (!tag || !isTagLike(tag)) return null;
        let bb;
        try { bb = t.getBBox(); } catch (_) { return null; }
        if (!bb) return null;
        return { tag, cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 };
      })
      .filter(Boolean);

    if (!texts.length) return map;

    for (const [hex, nodes] of fillGroups.entries()) {
      let sumX = 0, sumY = 0, count = 0;

      const sample = nodes.slice(0, 40);
      for (const el of sample) {
        let bb;
        try { bb = el.getBBox(); } catch (_) { continue; }
        if (!bb) continue;
        sumX += bb.x + bb.width / 2;
        sumY += bb.y + bb.height / 2;
        count++;
      }
      if (!count) continue;

      const cx = sumX / count;
      const cy = sumY / count;

      let best = null;
      let bestD = Infinity;
      for (const t of texts) {
        const dx = t.cx - cx;
        const dy = t.cy - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (best && !map[hex]) map[hex] = best.tag;
    }
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

  // ---------- Modal host ----------
  function openModal() {
    const existing = document.getElementById("recolor-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "recolor-modal";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.28);
      z-index: 2147483647;
      overflow: auto;
      padding: 22px;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      max-width: 1200px;
      margin: 0 auto;
      background: rgba(255,255,255,.98);
      border: 1px solid rgba(0,0,0,.14);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,.25);
      padding: 14px;
    `;

    const topbar = document.createElement("div");
    topbar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:900;";
    title.textContent = `Recoloreo (paleta ${PALETTE.length})`;

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Cerrar";
    close.style.cssText =
      "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
    close.addEventListener("click", () => overlay.remove());

    topbar.appendChild(title);
    topbar.appendChild(close);

    card.appendChild(topbar);

    const host = document.createElement("div");
    host.id = "recolor-host";
    host.style.cssText = `
      margin-top: 10px;
      padding: 14px;
      border: 1px solid rgba(0,0,0,.12);
      border-radius: 12px;
      background: rgba(255,255,255,.96);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;
    card.appendChild(host);

    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.addEventListener(
      "keydown",
      function onEsc(e) {
        if (e.key === "Escape") {
          overlay.remove();
          document.removeEventListener("keydown", onEsc);
        }
      },
      { once: true }
    );

    document.body.appendChild(overlay);
    return host;
  }

  // ---------- Editor ----------
  function openEditor(originalSvg) {
    const host = openModal();
    host.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        Selecciona color original → elige reemplazo → (renombrar) → toggles → descarga
      </div>
    `;
    host.appendChild(header);

    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

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

    const fillGroups = collectFillGroups(recolorSvg);

    // Build original tag map: priority top > legend > proximity
    const topMap = buildOriginalTagByHexFromTopSwatches();
    const legendMap = buildOriginalTagByHexFromSvgLegend(originalSvg);
    const proxMap = buildOriginalTagByHexFromSvgProximity(recolorSvg, fillGroups);
    const tagByHex = { ...proxMap, ...legendMap, ...topMap };

    const rawEntries = Array.from(fillGroups.entries()).map(([oldHex, nodes]) => {
      const hex = norm(oldHex);
      const tagOriginal = tagByHex[hex] || "";
      return { oldHex: hex, nodes, tagOriginal };
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

    // Toggles state
    let colorsOn = true;
    let bordersOn = true;
    let textColorModeOn = false; // OFF => black
    let textOpacity = 0.7;       // ALWAYS applied (0..1)

    setColorFills(recolorSvg, colorsOn);
    setBorders(recolorSvg, bordersOn);

    const usedReplacementHex = new Set();

    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    const left = document.createElement("div");
    left.style.cssText =
      "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (TAG + reemplazo + renombrar)</div>`;
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

    // Row state maps
    const rowByOldHex = new Map();
    const renameInputByOldHex = new Map();
    const labelNodesByOldHex = new Map();

    function buildTagToReplacementHexMap() {
      const map = new Map(); // tagLower -> hex
      for (const [oldHex, row] of rowByOldHex.entries()) {
        const replHex = norm(row.getAttribute("data-replhex") || "");
        const inp = renameInputByOldHex.get(oldHex);
        const tag = inp ? (inp.value || "").toString().trim() : "";
        if (!tag || !isTagLike(tag)) continue;
        if (!replHex || !isHex6(replHex)) continue;
        map.set(norm(tag), replHex);
      }
      return map;
    }

    // ✅ Slider must apply always; OFF => black, ON => replacement hex (else black)
    function applyTextColors() {
      const map = buildTagToReplacementHexMap();
      const texts = Array.from(recolorSvg.querySelectorAll("text"));

      texts.forEach((t) => {
        const raw = (t.textContent || "").toString().trim();
        if (!raw || !isTagLike(raw)) return;

        const key = norm(raw);
        const hex = textColorModeOn ? (map.get(key) || "#000000") : "#000000";

        t.setAttribute("fill", hex);
        t.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, textOpacity))));
      });
    }

    function setRenameForOldHex(oldHex, newLabel) {
      oldHex = norm(oldHex);
      const inp = renameInputByOldHex.get(oldHex);
      const nodes = labelNodesByOldHex.get(oldHex) || [];
      if (!inp) return;

      inp.value = (newLabel || "").toString();
      nodes.forEach((t) => (t.textContent = inp.value));
      applyTextColors();
    }

    const picker = renderGridPicker({
      isUsed: (hex) => usedReplacementHex.has(norm(hex)),
      onPick: ({ hex: newHex, tag: newTag }) => {
        if (!selectedOldHex) {
          alert("Primero selecciona un color original (panel izquierdo).");
          return;
        }

        newHex = norm(newHex);
        newTag = (newTag || "").toString().trim();

        const row = rowByOldHex.get(norm(selectedOldHex));
        if (row) {
          const prev = row.getAttribute("data-replhex") || "";
          if (prev) usedReplacementHex.delete(norm(prev));
        }
        usedReplacementHex.add(newHex);

        const nodes = fillGroups.get(norm(selectedOldHex)) || [];
        nodes.forEach((el) => {
          el.setAttribute("fill", newHex);
          if (el.hasAttribute("style")) {
            el.setAttribute("style", el.getAttribute("style").replace(/fill:\s*[^;]+;?/gi, ""));
          }
        });

        if (row) {
          row.setAttribute("data-replhex", newHex);

          const swNew = row.querySelector(".sw-new");
          const txt = row.querySelector(".row-text");
          if (swNew) {
            swNew.style.background = newHex;
            swNew.style.borderStyle = "solid";
          }

          const badgeHost = row.querySelector(".new-badge-host");
          if (badgeHost) {
            badgeHost.innerHTML = "";
            if (newTag) badgeHost.appendChild(makeBadgeCorner(newTag));
          }

          if (txt) txt.textContent = newTag ? `Reemplazo: ${newTag} (${newHex})` : `Reemplazo: ${newHex}`;

          // ✅ auto-rename becomes picker tag
          if (newTag) setRenameForOldHex(selectedOldHex, newTag);
          else applyTextColors();
        }

        picker.refreshUsedX();
      },
    });

    right.appendChild(picker.grid);

    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 420px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    if (!rawEntries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG.";
      list.appendChild(empty);
    } else {
      rawEntries.forEach(({ oldHex, tagOriginal }) => {
        const labelNodes =
          tagOriginal && tagOriginal.trim()
            ? Array.from(recolorSvg.querySelectorAll("text")).filter((t) => (t.textContent || "").trim() === tagOriginal)
            : [];

        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.setAttribute("data-replhex", "");
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 72px 72px 72px 1fr;
          gap: 10px;
          align-items:center;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.12);
          background: white;
          cursor: pointer;
        `;

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
        input.value = tagOriginal || "";
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

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = tagOriginal ? `Tag original: ${tagOriginal} | Color: ${oldHex}` : `Color: ${oldHex}`;

        const repl = document.createElement("div");
        repl.className = "row-text";
        repl.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        repl.textContent = "Reemplazo: —";

        stack.appendChild(meta);
        stack.appendChild(repl);

        input.addEventListener("input", () => {
          const v = input.value;
          labelNodes.forEach((t) => (t.textContent = v));
          applyTextColors();
        });

        row.appendChild(boxTag);
        row.appendChild(boxRepl);
        row.appendChild(boxRename);
        row.appendChild(stack);

        row.addEventListener("click", () => {
          selectedOldHex = oldHex;
          Array.from(list.querySelectorAll("button")).forEach((b) => {
            b.style.outline = "none";
            b.style.boxShadow = "none";
          });
          row.style.outline = "2px solid rgba(0,0,0,.28)";
          row.style.boxShadow = "0 0 0 4px rgba(0,0,0,.05)";
        });

        list.appendChild(row);

        rowByOldHex.set(oldHex, row);
        renameInputByOldHex.set(oldHex, input);
        labelNodesByOldHex.set(oldHex, labelNodes);
      });
    }

    // ---------- Toggles row ----------
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

    const btnColors = makeToggleButton("Colores", true, (on) => {
      colorsOn = on;
      setColorFills(recolorSvg, colorsOn);
    });

    const btnBorders = makeToggleButton("Bordes", true, (on) => {
      bordersOn = on;
      setBorders(recolorSvg, bordersOn);
    });

    const btnTextColor = makeToggleButton("Color textos", false, (on) => {
      textColorModeOn = on;
      applyTextColors(); // ✅ always
    });

    const sliderWrap = document.createElement("div");
    sliderWrap.style.cssText = `
      display:flex;
      align-items:center;
      gap:8px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,.12);
      background: rgba(255,255,255,.9);
    `;

    const sliderLabel = document.createElement("div");
    sliderLabel.style.cssText = "font-size:12px; color: rgba(0,0,0,.70); font-weight:800;";
    sliderLabel.textContent = "Opacidad texto";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "70";
    slider.style.cssText = "width: 180px; cursor: pointer;";

    const sliderVal = document.createElement("div");
    sliderVal.style.cssText =
      "font-size:12px; color: rgba(0,0,0,.70); font-weight:900; width:44px; text-align:right;";
    sliderVal.textContent = "70%";

    slider.addEventListener("input", () => {
      const v = Math.max(0, Math.min(100, Number(slider.value || 0)));
      sliderVal.textContent = `${v}%`;
      textOpacity = v / 100;
      applyTextColors(); // ✅ always (ON or OFF)
    });

    sliderWrap.appendChild(sliderLabel);
    sliderWrap.appendChild(slider);
    sliderWrap.appendChild(sliderVal);

    togglesLeft.appendChild(btnColors);
    togglesLeft.appendChild(btnBorders);
    togglesLeft.appendChild(btnTextColor);
    togglesLeft.appendChild(sliderWrap);

    const hint = document.createElement("div");
    hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
    hint.textContent =
      "Textos: OFF=negro con opacidad; ON=hex de reemplazo (si no hay reemplazo, negro). Opacidad siempre aplica.";

    togglesRow.appendChild(togglesLeft);
    togglesRow.appendChild(hint);
    host.appendChild(togglesRow);

    // Init text styling (black with slider opacity)
    applyTextColors();

    // ---------- Downloads ----------
    const dl = document.createElement("div");
    dl.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; margin-top: 12px;";
    host.appendChild(dl);

    const btnSvg = document.createElement("button");
    btnSvg.type = "button";
    btnSvg.textContent = "DOWNLOAD RECOLORED SVG";
    btnSvg.style.cssText =
      "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
    btnSvg.addEventListener("click", () => {
      const svgText = new XMLSerializer().serializeToString(recolorSvg);
      downloadText("paintbynumber_recolored.svg", svgText, "image/svg+xml");
    });

    const btnPng = document.createElement("button");
    btnPng.type = "button";
    btnPng.textContent = "DOWNLOAD RECOLORED PNG";
    btnPng.style.cssText =
      "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
    btnPng.addEventListener("click", async () => {
      try {
        await downloadSvgAsPngHQ(recolorSvg, "paintbynumber_recolored.png", 10);
      } catch (e) {
        console.error(e);
        alert("No pude exportar PNG. Revisa si el navegador bloqueó el canvas.");
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);
  }

  // ---------- Floating launcher ----------
  function ensureFab() {
    let fab = document.getElementById("recolor-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.id = "recolor-fab";
    fab.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483646;
      display: none;
      gap: 8px;
      align-items: center;
      padding: 10px;
      border-radius: 14px;
      background: rgba(255,255,255,.96);
      border: 1px solid rgba(0,0,0,.14);
      box-shadow: 0 12px 40px rgba(0,0,0,.18);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Abrir Recolorear";
    btn.style.cssText =
      "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";

    btn.addEventListener("click", () => {
      const current = findFinalOutputSvgLight();
      if (!current) return alert("Aún no detecto el SVG final. Aprieta PROCESS IMAGE y espera el output.");
      openEditor(current);
    });

    const status = document.createElement("div");
    status.id = "recolor-fab-status";
    status.style.cssText = "font-size: 12px; color: rgba(0,0,0,.65); white-space:nowrap;";
    status.textContent = "Esperando output…";

    fab.appendChild(btn);
    fab.appendChild(status);
    document.body.appendChild(fab);

    return fab;
  }

  function updateFab() {
    const fab = ensureFab();
    const status = document.getElementById("recolor-fab-status");
    const ready = isGeneratorReady();
    fab.style.display = ready ? "flex" : "none";
    if (status) status.textContent = ready ? "Output detectado" : "Esperando output…";
  }

  window.addEventListener("load", () => {
    setTimeout(updateFab, 650);
    setTimeout(updateFab, 1600);
  });

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target && e.target.closest ? e.target.closest("button, a") : null;
      if (!el) return;
      const t = norm(el.textContent);
      if (t.includes("process image") || t.includes("download svg") || t.includes("download png") || t.includes("output")) {
        setTimeout(updateFab, 120);
        setTimeout(updateFab, 600);
      }
    },
    true
  );

  try { updateFab(); } catch (_) {}
})();
