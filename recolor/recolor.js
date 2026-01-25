/* Recolor add-on (v10) — SIMPLE + ROBUST
   - Always tries to grab the real SVG output.
   - 1) Prefer: best <svg> in DOM (by element count), excluding our UI.
   - 2) Fallback: capture SVG from DOWNLOAD SVG Blob via URL.createObjectURL hook.
   - No heavy MutationObserver (prevents freezing).
*/

(function () {
  if (window.__RECOLOR_ADDON_V10__) return;
  window.__RECOLOR_ADDON_V10__ = true;

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

  // ---------- SVG parsing ----------
  function parseSvgTextToElement(svgText) {
    try {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.querySelector("svg");
      return svg ? svg : null;
    } catch (e) {
      return null;
    }
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

  // ---------- Find main output SVG (ROBUST: by element count, not viewport size) ----------
  function findBestOutputSvgInDom() {
    const svgs = Array.from(document.querySelectorAll("svg"))
      .filter(s => !s.closest("#recolor-host")); // exclude our UI

    if (!svgs.length) return null;

    let best = null;
    let bestScore = -1;

    for (const s of svgs) {
      // score = number of drawable elements + text count
      const shapes = s.querySelectorAll("path,polygon,rect,circle,ellipse").length;
      const texts  = s.querySelectorAll("text").length;
      const score = shapes * 2 + texts; // prioritize shapes
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }

    // sanity: require at least some shapes
    if (best && best.querySelectorAll("path,polygon,rect,circle,ellipse").length < 5) return null;
    return best;
  }

  // ---------- Locate DOWNLOAD buttons row ----------
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

  function findDownloadSvgControl() {
    const els = Array.from(document.querySelectorAll("button,a"));
    return els.find(el => norm(el.textContent).includes("download svg")) || null;
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

  // ---------- Fill/text grouping ----------
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
    setTimeout(() => URL.revokeObjectURL(url), 1500);
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
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1500);
    }, "image/png", 1.0);
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
    style.textContent = on ? "" : `
      [stroke] { stroke-opacity: 0 !important; }
    `;
  }

  function setColorFills(svg, on) {
    const style = ensureSvgStyle(svg, "recolor-fills-style");
    style.textContent = on ? "" : `
      path, polygon, rect, circle, ellipse { fill: none !important; }
      text { fill: #000 !important; }
    `;
  }

  // ---------- UI bits ----------
  function makeBadgeCorner(text) {
    const b = document.createElement("span");
    b.textContent = text;
    b.style.cssText = `
      position:absolute; left:4px; top:4px;
      padding:2px 6px; border-radius:999px;
      font-size:11px; font-weight:900;
      background: rgba(255,255,255,.90);
      border: 1px solid rgba(0,0,0,.12);
      color: rgba(0,0,0,.85);
      pointer-events:none; line-height: 1;
    `;
    return b;
  }

  function makeCenteredTag(tag, bgHex) {
    const d = document.createElement("div");
    d.textContent = String(tag);
    d.style.cssText = `
      position:absolute; inset:0;
      display:flex; align-items:center; justify-content:center;
      font-weight:900; font-size:20px; line-height:1;
      color:${textColorForBg(bgHex)};
      pointer-events:none;
      text-shadow: 0 1px 0 rgba(0,0,0,.15);
    `;
    return d;
  }

  function makeSwatchBase(hex, dashed=false) {
    const box = document.createElement("div");
    box.style.cssText = `
      width:56px; height:44px;
      border-radius:12px;
      border:1px ${dashed ? "dashed" : "solid"} rgba(0,0,0,.20);
      background:${hex || "transparent"};
      position:relative; overflow:hidden;
      flex: 0 0 auto;
    `;
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

  function renderGridPicker(onPick) {
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
      tile.addEventListener("click", () => onPick({hex, tag}));

      grid.appendChild(tile);
    });

    return grid;
  }

  // ---------- ORIGINAL tag mapping (read from top swatches OR SVG legend when present) ----------
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

  // ---------- Core: Resolve SVG NOW ----------
  function resolveSvgNow() {
    // 1) DOM
    const domSvg = findBestOutputSvgInDom();
    if (domSvg) return domSvg;

    // 2) cached text from blob hook or prior run
    if (window.__LAST_OUTPUT_SVG_TEXT__ && window.__LAST_OUTPUT_SVG_TEXT__.trim().startsWith("<svg")) {
      const parsed = parseSvgTextToElement(window.__LAST_OUTPUT_SVG_TEXT__);
      if (parsed) return parsed;
    }

    return null;
  }

  // ---------- Hook: capture SVG when DOWNLOAD SVG creates a Blob URL ----------
  function installSvgBlobCaptureHook() {
    if (window.__RECOLOR_SVG_BLOB_HOOK__) return;
    window.__RECOLOR_SVG_BLOB_HOOK__ = true;

    const originalCreate = URL.createObjectURL.bind(URL);

    URL.createObjectURL = function (blob) {
      try {
        if (blob && blob.type && String(blob.type).toLowerCase().includes("svg")) {
          // Capture SVG text asynchronously without blocking UI
          blob.text().then((txt) => {
            if (txt && txt.trim().startsWith("<svg")) {
              window.__LAST_OUTPUT_SVG_TEXT__ = txt;
            }
          }).catch(() => {});
        }
      } catch (_) {}
      return originalCreate(blob);
    };
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

    // Build original tag map (priority: SVG legend > top swatches)
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

    // Fill groups
    const fillGroups = collectFillGroups(recolorSvg);
    const entries = Array.from(fillGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Controls layout
    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    const left = document.createElement("div");
    left.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (TAG original + hex → reemplazo)</div>`;
    controls.appendChild(left);

    const right = document.createElement("div");
    right.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Picker (grilla con tags del Excel)</div>`;
    controls.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Click en un color original (izquierda). Luego elige el color nuevo en la grilla.";
    right.appendChild(info);

    let selectedOldHex = null;

    // Grid picker
    const grid = renderGridPicker(({hex:newHex, tag:newTag}) => {
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
    });
    right.appendChild(grid);

    // List of original colors
    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG.";
      list.appendChild(empty);
    } else {
      entries.forEach(([oldHex]) => {
        const tagOriginal = origTagByHex[oldHex] || "";

        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 150px 1fr;
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
        // ✅ tag original centered inside the ORIGINAL swatch
        if (tagOriginal) swOld.appendChild(makeCenteredTag(tagOriginal, oldHex));

        const arrow = document.createElement("div");
        arrow.textContent = "→";
        arrow.style.cssText = "font-weight:900; color: rgba(0,0,0,.55);";

        const swNew = makeSwatchBase("transparent", true);
        swNew.className = "sw-new";

        const newBadgeHost = document.createElement("div");
        newBadgeHost.className = "new-badge-host";
        newBadgeHost.style.cssText = "position:absolute; inset:0;";
        swNew.appendChild(newBadgeHost);

        swWrap.appendChild(swOld);
        swWrap.appendChild(arrow);
        swWrap.appendChild(swNew);

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

        row.appendChild(swWrap);
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

    // Rename texts
    const labelPanel = document.createElement("div");
    labelPanel.style.cssText = `
      border: 1px solid rgba(0,0,0,.12);
      border-radius: 12px;
      padding: 10px;
      background: white;
      margin-top: 12px;
    `;
    labelPanel.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Renombrar labels (texto dentro del SVG)</div>`;
    host.appendChild(labelPanel);

    const textGroups = collectTextGroups(recolorSvg);
    const textEntries = Array.from(textGroups.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));

    if (!textEntries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No encontré <text> en el SVG.";
      labelPanel.appendChild(empty);
    } else {
      const labelList = document.createElement("div");
      labelList.style.cssText = "display:grid; gap:10px; max-height: 260px; overflow:auto; padding-right:6px;";
      labelPanel.appendChild(labelList);

      for (const [originalText, nodes] of textEntries) {
        const row = document.createElement("div");
        row.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items:center;";

        const oldBox = document.createElement("div");
        oldBox.style.cssText = "font-size: 13px; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.04);";
        oldBox.textContent = originalText;

        const input = document.createElement("input");
        input.type = "text";
        input.value = originalText;
        input.style.cssText = "padding: 8px; border-radius: 10px; border:1px solid rgba(0,0,0,.22);";
        input.addEventListener("input", () => {
          const v = input.value;
          nodes.forEach((t) => (t.textContent = v));
        });

        row.appendChild(oldBox);
        row.appendChild(input);
        labelList.appendChild(row);
      }
    }

    // Toggles
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

    // Download recolored
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
        alert("No pude exportar PNG. Prueba Chrome/Edge.");
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);
  }

  // ---------- Launcher (simple) ----------
  function renderLauncher() {
    const downloadsRow = findDownloadButtonsRow();
    if (!downloadsRow) return;

    const host = ensureHostBelowDownloads();

    // avoid duplicate
    let bar = document.getElementById("recolor-launch-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "recolor-launch-bar";
      bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
      host.appendChild(bar);

      const title = document.createElement("div");
      title.style.cssText = "font-weight:900;";
      title.textContent = `Recoloreo (paleta ${PALETTE.length})`;
      bar.appendChild(title);

      const btn = document.createElement("button");
      btn.id = "btn-recolor-launch";
      btn.type = "button";
      btn.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900;";
      bar.appendChild(btn);

      const hint = document.createElement("div");
      hint.id = "recolor-launch-hint";
      hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-top: 6px;";
      host.appendChild(hint);

      btn.addEventListener("click", () => {
        const svg = resolveSvgNow();
        if (!svg) {
          alert("No detecto el SVG real aún. Si tu output es canvas, el SVG existe igual pero se captura al usar DOWNLOAD SVG.");
          return;
        }
        openEditor(svg);
      });
    }

    // Update state text
    const btn = document.getElementById("btn-recolor-launch");
    const hint = document.getElementById("recolor-launch-hint");
    const svgNow = resolveSvgNow();

    if (svgNow) {
      btn.textContent = "Abrir Recolorear";
      hint.textContent = "Listo: tomé el SVG real del output.";
    } else if (window.__LAST_OUTPUT_SVG_TEXT__) {
      btn.textContent = "Abrir Recolorear";
      hint.textContent = "Listo: capturé el SVG desde DOWNLOAD SVG.";
    } else {
      btn.textContent = "Recolor (esperando SVG...)";
      hint.textContent = "Genera el output. Si el SVG no está en el DOM, se captura al descargar SVG.";
    }
  }

  // ---------- Boot ----------
  installSvgBlobCaptureHook();

  // Also: when user clicks DOWNLOAD SVG, very often the blob gets created → hook captures it
  function attachDownloadSvgClickHint() {
    const dlSvg = findDownloadSvgControl();
    if (!dlSvg || dlSvg.__recolor_hooked) return;
    dlSvg.__recolor_hooked = true;

    dlSvg.addEventListener("click", () => {
      // after click, hook should capture; update launcher a bit later
      setTimeout(renderLauncher, 200);
      setTimeout(renderLauncher, 800);
    }, true);
  }

  // light poll (doesn't freeze)
  setInterval(() => {
    attachDownloadSvgClickHint();
    renderLauncher();
  }, 700);

  window.addEventListener("load", () => {
    setTimeout(() => {
      attachDownloadSvgClickHint();
      renderLauncher();
    }, 300);
  });

})();
