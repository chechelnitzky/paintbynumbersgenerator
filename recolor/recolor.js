/* Recolor add-on (v7.2 UI)
   - Fix 1 OK: Original colors sorted by ORIGINAL TAG ascending (0..n)
   - Fix 2 UPDATED: "Renombrar labels" input is embedded INSIDE each original color row (left panel)
   - Fix 3 OK: Picker tiles show an X overlay when that hex is already used as replacement (not blocked)
   - Toggles inject SVG <style> only (no loss of edits)
*/

(function () {
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map(x => x.hex);

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);

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
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    const y = (0.2126*r + 0.7152*g + 0.0722*b);
    return y > 140 ? "#000" : "#fff";
  }

  function getElementFill(el) {
    const fAttr = el.getAttribute && el.getAttribute("fill");
    if (fAttr && fAttr !== "none" && fAttr !== "transparent") {
      const f = norm(fAttr);
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f.toLowerCase();
    }

    const styleAttr = el.getAttribute && el.getAttribute("style");
    if (styleAttr && /fill\s*:/i.test(styleAttr)) {
      const m = styleAttr.match(/fill:\s*([^;]+)/i);
      if (m && m[1]) {
        const v = norm(m[1]);
        if (v.startsWith("rgb")) return rgbToHex(v) || null;
        if (v.startsWith("#") && v.length === 7) return v.toLowerCase();
      }
    }

    try {
      const cs = window.getComputedStyle(el);
      const f = cs && cs.fill ? norm(cs.fill) : "";
      if (!f || f === "none" || f === "transparent") return null;
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f.toLowerCase();
    } catch (_) {}

    return null;
  }

  // ---------- SVG sizing ----------
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

  // ---------- Find main output SVG ----------
  function findFinalOutputSvg() {
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;

    let best = null;
    let bestScore = 0;

    for (const s of svgs) {
      const box = s.getBoundingClientRect();
      const visible = box.width > 50 && box.height > 50 && box.bottom > 0 && box.right > 0;
      if (!visible) continue;
      const score = box.width * box.height;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  // ---------- Locate download row and mount host ----------
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

    const downloadsRow = findDownloadButtonsRow();
    if (downloadsRow && downloadsRow.parentElement) {
      downloadsRow.parentElement.insertBefore(host, downloadsRow.nextSibling);
    } else {
      document.body.appendChild(host);
    }
    return host;
  }

  // ---------- Group fills + texts ----------
  function collectFillGroups(svg) {
    const groups = new Map();
    const nodes = Array.from(svg.querySelectorAll("*"))
      .filter((el) => el instanceof SVGElement)
      .filter((el) => ["path","polygon","rect","circle","ellipse"].includes(el.tagName.toLowerCase()));

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

  function collectTextGroups(svg) {
    const groups = new Map();
    svg.querySelectorAll("text").forEach((t) => {
      const s = (t.textContent || "").trim();
      if (!s) return;
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(t);
    });
    return groups;
  }

  // ---------- Download helpers ----------
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

  async function downloadSvgAsPng(svgEl, filename) {
    const svgText = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.decoding = "async";

    const vb = svgEl.getAttribute("viewBox");
    let w = 1600, h = 1600;
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        w = Math.round(parts[2]);
        h = Math.round(parts[3]);
      }
    }

    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e);
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob) => {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
    }, "image/png", 1.0);
  }

  // ---------- SVG style injection ----------
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

  // Keep text colors as-is
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

  // ---------- UI components ----------
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

  function makeCenteredTag(tag, bgHex) {
    const d = document.createElement("div");
    d.textContent = String(tag);
    d.style.cssText = `
      position:absolute !important;
      inset:0 !important;
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      font-weight:900 !important;
      font-size:20px !important;
      line-height:1 !important;
      color:${textColorForBg(bgHex)} !important;
      pointer-events:none !important;
      text-shadow: 0 1px 0 rgba(0,0,0,.15);
    `;
    return d;
  }

  function makeSwatchBase(hex, dashed=false) {
    const box = document.createElement("div");
    box.setAttribute(
      "style",
      `
        width:56px !important;
        height:44px !important;
        border-radius:12px !important;
        border:1px ${dashed ? "dashed" : "solid"} rgba(0,0,0,.20) !important;
        background:${hex || "transparent"} !important;
        position:relative !important;
        overflow:hidden !important;
        flex: 0 0 auto !important;
      `.trim()
    );
    return box;
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

  function makeUsedXOverlay() {
    const o = document.createElement("div");
    o.textContent = "✕";
    o.style.cssText = `
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:22px;
      font-weight:1000;
      color: rgba(0,0,0,.75);
      text-shadow: 0 1px 0 rgba(255,255,255,.55);
      pointer-events:none;
      mix-blend-mode: multiply;
    `;
    return o;
  }

  function renderGridPicker(getUsedSet, onPick) {
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

    const items = PALETTE_ITEMS.length ? PALETTE_ITEMS : PALETTE.map(hex => ({tag: "", hex}));

    const tilesByHex = new Map();

    function paintUsed() {
      const used = getUsedSet();
      for (const [hex, tile] of tilesByHex.entries()) {
        const has = used.has(hex);
        const marker = tile.querySelector(".used-x");
        if (has && !marker) {
          const x = makeUsedXOverlay();
          x.className = "used-x";
          tile.appendChild(x);
        } else if (!has && marker) {
          marker.remove();
        }
      }
    }

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
      tile.addEventListener("click", () => onPick({hex, tag}));

      tilesByHex.set(hex, tile);
      grid.appendChild(tile);
    });

    grid.__refreshUsed = paintUsed;
    setTimeout(paintUsed, 0);

    return grid;
  }

  // ---------- ORIGINAL tag mapping ----------
  function buildOriginalTagByHexFromTopSwatches() {
    const map = {};

    const candidates = Array.from(document.querySelectorAll("button, div, span"))
      .filter(el => {
        if (!el || !el.textContent) return false;
        if (el.closest && el.closest("#recolor-host")) return false;
        const t = (el.textContent || "").trim();
        if (!t) return false;
        if (!/^[a-z0-9]{1,6}$/i.test(t)) return false;

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

    const rects = Array.from(svg.querySelectorAll("rect"))
      .filter(r => {
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

      const near = kids.slice(idx + 1, idx + 6).find(n =>
        n.tagName && n.tagName.toLowerCase() === "text" && (n.textContent || "").trim()
      );

      if (near) {
        const tag = (near.textContent || "").trim();
        if (tag && /^[a-z0-9]{1,6}$/i.test(tag) && !map[hex]) map[hex] = tag;
      }
    }

    return map;
  }

  function parseSortableTag(tag) {
    const t = (tag || "").toString().trim();
    if (!t) return { kind: "none", val: Infinity };
    if (/^\d+$/.test(t)) return { kind: "num", val: Number(t) };
    return { kind: "str", val: t.toLowerCase() };
  }

  // ---------- Editor ----------
  function openEditor(originalSvg) {
    const host = ensureHostBelowDownloads();
    host.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        Selecciona color original → elige reemplazo → toggles (colores/bordes) → descarga
      </div>
    `;
    host.appendChild(header);

    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

    const topMap = buildOriginalTagByHexFromTopSwatches();
    const legendMap = buildOriginalTagByHexFromSvgLegend(originalSvg);
    const origTagByHex = { ...topMap, ...legendMap };

    let colorsOn = true;
    let bordersOn = true;
    setColorFills(recolorSvg, colorsOn);
    setBorders(recolorSvg, bordersOn);

    // Previews
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

    // Data
    const fillGroups = collectFillGroups(recolorSvg);
    const textGroups = collectTextGroups(recolorSvg); // label rename groups

    let entries = Array.from(fillGroups.entries()).map(([hex, nodes]) => {
      const tagOriginal = origTagByHex[hex] || "";
      const sortable = parseSortableTag(tagOriginal);
      return { hex, nodes, tagOriginal, sortable };
    });

    // Sort by tag asc (0..n)
    entries.sort((a, b) => {
      const ak = a.sortable.kind, bk = b.sortable.kind;
      if (ak === "num" && bk === "num") return a.sortable.val - b.sortable.val;
      if (ak === "num" && bk !== "num") return -1;
      if (ak !== "num" && bk === "num") return 1;

      if (ak === "str" && bk === "str") {
        const cmp = String(a.sortable.val).localeCompare(String(b.sortable.val), "es");
        if (cmp !== 0) return cmp;
      } else if (ak === "none" && bk !== "none") return 1;
      else if (ak !== "none" && bk === "none") return -1;

      return a.hex.localeCompare(b.hex);
    });

    // Layout: 2 columns only now (Left: originals+rename, Right: picker)
    const controlsWrap = document.createElement("div");
    controlsWrap.style.cssText = `
      display:grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 12px;
      margin-top: 12px;
      align-items:start;
    `;
    host.appendChild(controlsWrap);

    const left = document.createElement("div");
    left.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (TAG + hex → reemplazo + renombrar)</div>`;
    controlsWrap.appendChild(left);

    const right = document.createElement("div");
    right.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Picker (grilla con tags del Excel)</div>`;
    controlsWrap.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Click en un color original (izquierda). Luego elige el color nuevo en la grilla.";
    right.appendChild(info);

    let selectedOldHex = null;
    const chosenReplacementByOldHex = new Map();

    const getUsedReplacementHexSet = () => {
      const s = new Set();
      for (const v of chosenReplacementByOldHex.values()) {
        if (v && v.hex && isHex6(v.hex)) s.add(norm(v.hex));
      }
      return s;
    };

    const grid = renderGridPicker(getUsedReplacementHexSet, ({hex:newHex, tag:newTag}) => {
      if (!selectedOldHex) {
        alert("Primero selecciona un color original (panel izquierdo).");
        return;
      }

      const nodes = fillGroups.get(selectedOldHex) || [];
      nodes.forEach((el) => {
        el.setAttribute("fill", newHex);
        if (el.hasAttribute("style")) {
          el.setAttribute("style", el.getAttribute("style").replace(/fill:\s*[^;]+;?/gi, ""));
        }
      });

      chosenReplacementByOldHex.set(selectedOldHex, { hex: newHex, tag: newTag || "" });

      const row = left.querySelector(`[data-oldhex="${selectedOldHex}"]`);
      if (row) {
        const swNew = row.querySelector(".sw-new");
        const txt = row.querySelector(".row-text");
        swNew.style.background = newHex;
        swNew.style.borderStyle = "solid";

        const badgeHost = row.querySelector(".new-badge-host");
        if (badgeHost) {
          badgeHost.innerHTML = "";
          if (newTag) badgeHost.appendChild(makeBadgeCorner(newTag));
        }

        txt.textContent = newTag ? `Reemplazo: ${newTag} (${newHex})` : `Reemplazo: ${newHex}`;
      }

      if (grid && typeof grid.__refreshUsed === "function") grid.__refreshUsed();
    });
    right.appendChild(grid);

    // Left list
    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 560px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    // Helper: get a stable "label key" based on tagOriginal
    function findTextGroupForTag(tagOriginal) {
      const key = (tagOriginal || "").toString().trim();
      if (!key) return null;
      return textGroups.get(key) || null;
    }

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG.";
      list.appendChild(empty);
    } else {
      entries.forEach((entry) => {
        const oldHex = entry.hex;
        const tagOriginal = entry.tagOriginal || "";

        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);

        // IMPORTANT: row is a button for selection, but we will stopPropagation on input so typing works
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 150px 1fr 220px;
          gap: 10px;
          align-items:center;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.12);
          background: white;
          cursor: pointer;
        `;

        // swatches
        const swWrap = document.createElement("div");
        swWrap.style.cssText = "display:flex; gap:8px; align-items:center;";

        const swOld = makeSwatchBase(oldHex, false);
        if (tagOriginal) swOld.appendChild(makeCenteredTag(tagOriginal, oldHex));

        const arrow = document.createElement("div");
        arrow.textContent = "→";
        arrow.style.cssText = "font-weight:900; color: rgba(0,0,0,.55);";

        const swNew = makeSwatchBase("transparent", true);
        swNew.className = "sw-new";

        const newBadgeHost = document.createElement("div");
        newBadgeHost.className = "new-badge-host";
        newBadgeHost.setAttribute("style", "position:absolute !important; inset:0 !important;");
        swNew.appendChild(newBadgeHost);

        swWrap.appendChild(swOld);
        swWrap.appendChild(arrow);
        swWrap.appendChild(swNew);

        // meta text
        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = tagOriginal
          ? `Tag original: ${tagOriginal}  |  Color: ${oldHex}`
          : `Color: ${oldHex}`;

        const repl = document.createElement("div");
        repl.className = "row-text";
        repl.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        repl.textContent = "Reemplazo: —";

        stack.appendChild(meta);
        stack.appendChild(repl);

        // rename input (embedded)
        const renameWrap = document.createElement("div");
        renameWrap.style.cssText = "display:grid; gap:6px;";

        const renameLabel = document.createElement("div");
        renameLabel.style.cssText = "font-size:12px; font-weight:800; color: rgba(0,0,0,.70)";
        renameLabel.textContent = "Renombrar";

        const input = document.createElement("input");
        input.type = "text";
        input.value = tagOriginal || "";
        input.placeholder = tagOriginal ? tagOriginal : "—";
        input.style.cssText = "padding: 10px; border-radius: 10px; border:1px solid rgba(0,0,0,.22); width:100%;";

        // Link input to SVG text nodes matching tagOriginal
        const nodes = findTextGroupForTag(tagOriginal);
        if (!nodes) {
          // if there's no matching text group, still allow typing but it won't change anything
          input.title = "No encontré <text> con este valor en el SVG.";
        }

        input.addEventListener("click", (e) => {
          e.stopPropagation(); // so clicking input doesn't change selection unexpectedly
        });
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
        });
        input.addEventListener("input", () => {
          const v = input.value;
          if (nodes && nodes.length) nodes.forEach((t) => (t.textContent = v));
        });

        renameWrap.appendChild(renameLabel);
        renameWrap.appendChild(input);

        row.appendChild(swWrap);
        row.appendChild(stack);
        row.appendChild(renameWrap);

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
      });
    }

    // Toggles row
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

    const hint = document.createElement("div");
    hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
    hint.textContent = "Colores OFF = descarga solo bordes + números. No se pierden tus ediciones.";

    togglesLeft.appendChild(btnColors);
    togglesLeft.appendChild(btnBorders);

    togglesRow.appendChild(togglesLeft);
    togglesRow.appendChild(hint);
    host.appendChild(togglesRow);

    // Download buttons
    const dl = document.createElement("div");
    dl.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; margin-top: 12px;";
    host.appendChild(dl);

    const btnSvg = document.createElement("button");
    btnSvg.type = "button";
    btnSvg.textContent = "DOWNLOAD RECOLORED SVG";
    btnSvg.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
    btnSvg.addEventListener("click", () => {
      const svgText = new XMLSerializer().serializeToString(recolorSvg);
      downloadText("paintbynumber_recolored.svg", svgText, "image/svg+xml");
    });

    const btnPng = document.createElement("button");
    btnPng.type = "button";
    btnPng.textContent = "DOWNLOAD RECOLORED PNG";
    btnPng.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
    btnPng.addEventListener("click", async () => {
      try {
        await downloadSvgAsPng(recolorSvg, "paintbynumber_recolored.png");
      } catch (e) {
        alert("No pude exportar PNG. Dime qué navegador usas y lo ajusto.");
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);

    if (grid && typeof grid.__refreshUsed === "function") grid.__refreshUsed();
  }

  // ---------- Launcher ----------
  function addLaunchButtonOnceReady() {
    const svg = findFinalOutputSvg();
    if (!svg) return;

    const host = ensureHostBelowDownloads();
    if (document.getElementById("btn-recolor-launch")) return;

    const bar = document.createElement("div");
    bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    bar.innerHTML = `<div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>`;

    const btn = document.createElement("button");
    btn.id = "btn-recolor-launch";
    btn.type = "button";
    btn.textContent = "Abrir Recolorear";
    btn.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
    btn.addEventListener("click", () => openEditor(svg));

    bar.appendChild(btn);
    host.appendChild(bar);

    const hint = document.createElement("div");
    hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-top: 6px;";
    hint.textContent = "Izquierda: tag original + reemplazo + renombrar. En el picker: ✕ = color ya usado (igual se puede seleccionar).";
    host.appendChild(hint);
  }

  const observer = new MutationObserver(() => addLaunchButtonOnceReady());
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener("load", () => setTimeout(addLaunchButtonOnceReady, 300));
})();
