/* Recolor add-on (v8.2) - STABLE + UI fixes
   - Original list sorted by ORIGINAL TAG numeric asc (0..)
   - Original swatch shows ORIGINAL TAG centered
   - Replacement swatch keeps Excel tag badge (corner)
   - Picker shows an X overlay if that Excel color is already in use (indicator only)
   - "Renombrar" input is integrated into EACH original-row (same container),
     small width, and "Renombrar" title appears only in container header.
   - Toggles do NOT overwrite text fill colors anymore (keeps previously assigned number color)
   - Prevents infinite loading by throttling observer work + strong guards
*/

(function () {
  // ------------------- CONFIG / GLOBALS -------------------
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map(x => x.hex);

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);

  const STATE = {
    mounted: false,
    lastSvgSig: "",
    selectedOldHex: null,
    oldToNew: new Map(), // oldHex -> {hex:newHex, tag:newTag}
  };

  // ------------------- HELPERS -------------------
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

  // ------------------- FIND OUTPUT SVG (simple + stable) -------------------
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 120 && r.height > 120 && r.bottom > 0 && r.right > 0;
  }

  function findFinalOutputSvg() {
    const svgs = Array.from(document.querySelectorAll("svg")).filter(isVisible);
    if (!svgs.length) return null;

    // Prefer SVGs inside/near the output area by choosing biggest visible
    let best = null, bestScore = 0;
    for (const s of svgs) {
      const box = s.getBoundingClientRect();
      const score = box.width * box.height;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  // ------------------- DOWNLOAD ROW + HOST -------------------
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

  // ------------------- GROUPS -------------------
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

  // ------------------- DOWNLOAD HELPERS -------------------
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

  // ------------------- SVG STYLE INJECTION (TOGGLES) -------------------
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

  // IMPORTANT: do NOT force text fill to #000. Keep whatever the SVG has.
  function setColorFills(svg, on) {
    const style = ensureSvgStyle(svg, "recolor-fills-style");
    style.textContent = on
      ? ""
      : `
        /* hide paint area fills (but do not touch text color) */
        path, polygon, rect, circle, ellipse {
          fill: none !important;
        }
      `;
  }

  // ------------------- UI PIECES -------------------
  function makeBadgeCorner(text) {
    const b = document.createElement("span");
    b.textContent = text;
    b.setAttribute("style", `
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
    `.trim());
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
    box.setAttribute("style", `
      width:56px !important;
      height:44px !important;
      border-radius:12px !important;
      border:1px ${dashed ? "dashed" : "solid"} rgba(0,0,0,.20) !important;
      background:${hex || "transparent"} !important;
      position:relative !important;
      overflow:hidden !important;
      flex: 0 0 auto !important;
    `.trim());
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

  function makeXOverlay() {
    const x = document.createElement("div");
    x.textContent = "✕";
    x.style.cssText = `
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:1000;
      font-size:22px;
      color: rgba(0,0,0,.55);
      text-shadow: 0 1px 0 rgba(255,255,255,.6);
      pointer-events:none;
    `;
    return x;
  }

  function renderGridPicker(onPick, isUsedFn) {
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
      if (isUsedFn && isUsedFn(hex)) tile.appendChild(makeXOverlay());

      tile.addEventListener("click", () => onPick({hex, tag}));
      grid.appendChild(tile);
    });

    return grid;
  }

  // ------------------- ORIGINAL TAG MAPPING -------------------
  function buildOriginalTagByHexFromTopSwatches() {
    const map = {}; // hex -> originalTag
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

  function tagSortKey(tag) {
    const t = (tag || "").toString().trim();
    if (/^\d+$/.test(t)) return { n: parseInt(t, 10), s: t };
    // Non-numeric go last
    return { n: Number.POSITIVE_INFINITY, s: t.toLowerCase() };
  }

  // ------------------- EDITOR -------------------
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

    // Build original tag map (priority: legend > top swatches)
    const topMap = buildOriginalTagByHexFromTopSwatches();
    const legendMap = buildOriginalTagByHexFromSvgLegend(originalSvg);
    const origTagByHex = { ...topMap, ...legendMap };

    // Defaults
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

    // Fill groups
    const fillGroups = collectFillGroups(recolorSvg);

    // Sort by original tag asc (0..)
    const entries = Array.from(fillGroups.entries())
      .map(([oldHex, nodes]) => {
        const tagOriginal = origTagByHex[oldHex] || "";
        const key = tagSortKey(tagOriginal);
        return { oldHex, nodes, tagOriginal, key };
      })
      .sort((a, b) => (a.key.n - b.key.n) || a.key.s.localeCompare(b.key.s) || a.oldHex.localeCompare(b.oldHex));

    // Controls layout (left = originals+rename integrated, right = picker)
    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1.25fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    const left = document.createElement("div");
    left.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `
      <div style="font-weight:800; margin-bottom:8px;">
        Colores originales (TAG + hex → reemplazo + renombrar)
      </div>
    `;
    controls.appendChild(left);

    const right = document.createElement("div");
    right.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Picker (grilla con tags del Excel)</div>`;
    controls.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Click en un color original (izquierda). Luego elige el color nuevo en la grilla.";
    right.appendChild(info);

    // "Used" checker for X overlay
    const isPickerHexUsed = (pickerHex) => {
      const h = norm(pickerHex);
      for (const v of STATE.oldToNew.values()) {
        if (v && norm(v.hex) === h) return true;
      }
      return false;
    };

    // Grid picker for replacement colors
    let gridEl = null;
    const renderPicker = () => {
      if (gridEl) gridEl.remove();
      gridEl = renderGridPicker(({hex:newHex, tag:newTag}) => {
        if (!STATE.selectedOldHex) {
          alert("Primero selecciona un color original (panel izquierdo).");
          return;
        }

        const nodes = fillGroups.get(STATE.selectedOldHex) || [];
        nodes.forEach((el) => {
          el.setAttribute("fill", newHex);
          if (el.hasAttribute("style")) {
            el.setAttribute("style", el.getAttribute("style").replace(/fill:\s*[^;]+;?/gi, ""));
          }
        });

        // Save mapping (for X indicator)
        STATE.oldToNew.set(STATE.selectedOldHex, { hex: newHex, tag: newTag });

        // Update row UI
        const row = left.querySelector(`[data-oldhex="${STATE.selectedOldHex}"]`);
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

        // Re-render picker to show X overlays
        renderPicker();
      }, isPickerHexUsed);

      right.appendChild(gridEl);
    };
    renderPicker();

    // Original colors list (with integrated rename inputs)
    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 520px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG.";
      list.appendChild(empty);
    } else {
      // Prepare text groups once (for rename mapping)
      const textGroups = collectTextGroups(recolorSvg); // textContent -> nodes
      const textKeySet = new Set(Array.from(textGroups.keys()).map(s => s.trim()));
      // For numeric tags, we rename matching text keys (e.g., "0", "1", "10"...)
      const getNodesForLabel = (label) => textGroups.get(String(label)) || [];

      entries.forEach(({ oldHex, tagOriginal }) => {
        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 170px 1fr 140px; /* swatches | meta | rename input */
          gap: 10px;
          align-items:center;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.12);
          background: white;
          cursor: pointer;
        `;

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

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = tagOriginal
          ? `Tag original: ${tagOriginal} | Color: ${oldHex}`
          : `Color: ${oldHex}`;

        const repl = document.createElement("div");
        repl.className = "row-text";
        repl.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        repl.textContent = "Reemplazo: —";

        stack.appendChild(meta);
        stack.appendChild(repl);

        // Rename input (small, not stretched)
        const renameWrap = document.createElement("div");
        renameWrap.style.cssText = "display:grid; gap:6px; align-items:start;";

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Renombrar";
        input.value = tagOriginal || ""; // default = same label
        input.style.cssText = `
          width: 100%;
          max-width: 140px;
          padding: 8px 10px;
          border-radius: 10px;
          border:1px solid rgba(0,0,0,.22);
          font-size: 13px;
        `;

        // Only rename if there are text nodes matching the original label
        // (e.g., label "0" exists in SVG). If not, typing just does nothing.
        input.addEventListener("input", () => {
          const oldLabel = (tagOriginal || "").toString().trim();
          if (!oldLabel) return;
          if (!textKeySet.has(oldLabel)) return;

          const nodes = getNodesForLabel(oldLabel);
          const v = input.value;
          nodes.forEach((t) => (t.textContent = v));
        });

        renameWrap.appendChild(input);

        row.appendChild(swWrap);
        row.appendChild(stack);
        row.appendChild(renameWrap);

        row.addEventListener("click", (e) => {
          // If user clicked inside input, don't change selection style weirdly
          if (e && e.target && (e.target.tagName || "").toLowerCase() === "input") return;

          STATE.selectedOldHex = oldHex;
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
    hint.textContent = "Colores OFF = descarga solo bordes + números (mantiene color de texto actual).";

    togglesLeft.appendChild(btnColors);
    togglesLeft.appendChild(btnBorders);

    togglesRow.appendChild(togglesLeft);
    togglesRow.appendChild(hint);
    host.appendChild(togglesRow);

    // Download buttons (recolored)
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
        alert("No pude exportar PNG. Revisa CORS o dime navegador.");
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);
  }

  // ------------------- LAUNCHER (STABLE, NO INFINITE LOAD) -------------------
  function svgSignature(svg) {
    if (!svg) return "";
    // A lightweight signature that changes when a new output appears
    const vb = svg.getAttribute("viewBox") || "";
    const childCount = svg.querySelectorAll("*").length;
    const tCount = svg.querySelectorAll("text").length;
    return `${vb}|${childCount}|${tCount}`;
  }

  function ensureLauncher(svg) {
    const host = ensureHostBelowDownloads();
    if (!host) return;

    let bar = host.querySelector("#recolor-launchbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "recolor-launchbar";
      bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
      bar.innerHTML = `<div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>`;
      host.appendChild(bar);

      const btn = document.createElement("button");
      btn.id = "btn-recolor-launch";
      btn.type = "button";
      btn.textContent = "Abrir Recolorear";
      btn.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
      btn.addEventListener("click", () => {
        const current = findFinalOutputSvg();
        if (!current) {
          alert("Aún no detecto el SVG final. Aprieta PROCESS IMAGE y espera el output.");
          return;
        }
        openEditor(current);
      });
      bar.appendChild(btn);

      const hint = document.createElement("div");
      hint.id = "recolor-hint";
      hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-top: 6px;";
      hint.textContent = "Original: tag centrado. Reemplazo: tag Excel en esquina. Renombrar: input a la derecha.";
      host.appendChild(hint);
    }

    // Update signature (not strictly needed, but helps avoid weird state)
    STATE.lastSvgSig = svgSignature(svg);
  }

  // Throttled observer to avoid “page never finishes”
  let scheduled = false;
  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const svg = findFinalOutputSvg();
      if (!svg) return;

      const sig = svgSignature(svg);
      // Only ensure launcher when new output appears OR first time
      if (!STATE.mounted || sig !== STATE.lastSvgSig) {
        STATE.mounted = true;
        ensureLauncher(svg);
      }
    }, 120);
  }

  const observer = new MutationObserver(() => scheduleCheck());
  observer.observe(document.documentElement, { subtree: true, childList: true });

  window.addEventListener("load", () => setTimeout(scheduleCheck, 300));
  // initial kick
  scheduleCheck();
})();
