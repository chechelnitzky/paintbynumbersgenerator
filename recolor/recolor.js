/* Recolor add-on (v8.5 - FIX LOAD ISSUE, keeps UI exactly as you want)
   ✅ FIX: removes global MutationObserver + avoids inserting host into <body> before downloads exist
      -> stops the “ruedita / carga infinita” side effects + restores example thumbnails (small/medium)
   ✅ Launcher now appears ONLY when the generator has the download row / output area
      (polls lightly after load + after clicking PROCESS IMAGE / DOWNLOAD SVG)
   ✅ Keeps all your current UI fixes:
      - Sorted by original TAG asc (0..n)
      - Rename input INSIDE the same row, 3 equal boxes
      - Picker shows X when a color is already used (indicator only)
      - Colores OFF hides fills but keeps text colors as-is
      - Bordes ON/OFF
*/

(function () {
  // ---------- Config ----------
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map((x) => x.hex);

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);

  // ---------- Color helpers ----------
  function rgbToHex(rgb) {
    const m = (rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]),
      g = Number(m[2]),
      b = Number(m[3]);
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

  // ---------- Find output SVG (no layout reads) ----------
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

  // ✅ FIX: DO NOT append host to body early.
  // Only create host when download row exists (i.e., when generator output area is ready).
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
    let w = 1600,
      h = 1600;
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

    canvas.toBlob(
      (pngBlob) => {
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
      },
      "image/png",
      1.0
    );
  }

  // ---------- SVG style injection (toggles without losing edits) ----------
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
        /* hide paint area fills */
        path, polygon, rect, circle, ellipse {
          fill: none !important;
        }
        /* IMPORTANT: keep existing text fill (do NOT force black) */
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

  // ---------- ORIGINAL tag mapping ----------
  function buildOriginalTagByHexFromTopSwatches() {
    const map = {}; // hex -> tagOriginal

    const candidates = Array.from(document.querySelectorAll("button, div, span")).filter((el) => {
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

  // ---------- Editor ----------
  function openEditor(originalSvg) {
    const host = ensureHostBelowDownloads();
    if (!host) return alert("Aún no está listo el output. Genera el SVG (PROCESS IMAGE) y vuelve a intentar.");
    host.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        Selecciona color original → elige reemplazo → (renombrar) → toggles (colores/bordes) → descarga
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

    const picker = renderGridPicker({
      isUsed: (hex) => usedReplacementHex.has(norm(hex)),
      onPick: ({ hex: newHex, tag: newTag }) => {
        if (!selectedOldHex) {
          alert("Primero selecciona un color original (panel izquierdo).");
          return;
        }

        newHex = norm(newHex);

        const row = left.querySelector(`[data-oldhex="${selectedOldHex}"]`);
        if (row) {
          const prev = row.getAttribute("data-replhex") || "";
          if (prev) usedReplacementHex.delete(norm(prev));
        }
        usedReplacementHex.add(newHex);

        const nodes = fillGroups.get(selectedOldHex) || [];
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
          grid-template-columns: 72px 72px 72px 1fr; /* 3 equal boxes */
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
      });
    }

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
        await downloadSvgAsPng(recolorSvg, "paintbynumber_recolored.png");
      } catch (e) {
        alert("No pude exportar PNG. Revisa si el navegador bloqueó el canvas.");
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);
  }

  // ------------------- LAUNCHER (LIGHT POLL, NO OBSERVER) -------------------
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
    bar.innerHTML = `<div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>`;

    const btn = document.createElement("button");
    btn.id = "btn-recolor-launch";
    btn.type = "button";
    btn.textContent = "Abrir Recolorear";
    btn.style.cssText =
      "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
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
      "Lista ordenada por tag. 3 cajas iguales: tag / reemplazo / renombrar. Picker marca X si el color ya está usado.";
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

  // Run a light poll on load (won’t touch DOM until downloads exist)
  window.addEventListener("load", () => {
    setTimeout(startPoll, 250);
    setTimeout(startPoll, 1200);
  });

  // Also poll after user actions that create output
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target && e.target.closest ? e.target.closest("button, a") : null;
      if (!el) return;

      const t = norm(el.textContent);
      if (t.includes("process image") || t.includes("download svg") || t.includes("download png") || t.includes("output")) {
        setTimeout(startPoll, 50);
      }
    },
    true
  );
})();
