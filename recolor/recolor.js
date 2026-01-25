/* Recolor add-on (v3)
   - Inserts UI UNDER the original download buttons
   - Shows full SVG preview (no cropping / no blank due to missing viewBox)
   - Detects colors via computed style + fill/style attributes (robust)
   - Grid picker for replacement palette (PALETTE_168)
   - Shows original tag (0,1,cg1,bg7,...) if it can detect them from the palette UI
   - Adds download buttons for recolored SVG + PNG
*/

(function () {
  const PALETTE = window.PALETTE_168 || [];

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);

  function rgbToHex(rgb) {
    const m = (rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toLowerCase();
  }

  function getElementFill(el) {
    // 1) attribute fill
    const fAttr = el.getAttribute && el.getAttribute("fill");
    if (fAttr && fAttr !== "none" && fAttr !== "transparent") {
      const f = norm(fAttr);
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    }

    // 2) inline style fill
    const styleAttr = el.getAttribute && el.getAttribute("style");
    if (styleAttr && styleAttr.includes("fill:")) {
      const m = styleAttr.match(/fill:\s*([^;]+)/i);
      if (m && m[1]) {
        const v = norm(m[1]);
        if (v.startsWith("rgb")) return rgbToHex(v) || null;
        if (v.startsWith("#") && v.length === 7) return v;
      }
    }

    // 3) computed style fill (most robust)
    try {
      const cs = window.getComputedStyle(el);
      const f = cs && cs.fill ? norm(cs.fill) : "";
      if (!f || f === "none" || f === "transparent") return null;
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    } catch (_) {}

    return null;
  }

  function ensureViewBox(svg) {
    if (!svg || svg.tagName.toLowerCase() !== "svg") return;

    if (svg.getAttribute("viewBox")) return;

    // If width/height attributes exist, create viewBox from them
    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");

    const w = parseFloat(wAttr);
    const h = parseFloat(hAttr);

    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      return;
    }

    // Fallback: try getBBox (only works if in DOM)
    try {
      const bb = svg.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) {
        svg.setAttribute("viewBox", `0 0 ${bb.width} ${bb.height}`);
      }
    } catch (_) {}
  }

  function makePreview(svg) {
    // Keep intrinsic width/height if present, but force responsive rendering
    ensureViewBox(svg);

    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  function findFinalOutputSvg() {
    // Heuristics: pick largest visible SVG on page
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;

    let best = null;
    let bestScore = 0;
    for (const s of svgs) {
      const box = s.getBoundingClientRect();
      const score = box.width * box.height;
      if (score > bestScore && box.width > 200 && box.height > 200) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  function findDownloadButtonsRow() {
    // Your UI shows buttons like "DOWNLOAD SVG / PNG / PALETTE"
    // We'll look for a container that contains those texts.
    const btns = Array.from(document.querySelectorAll("button, a"));
    const hits = btns.filter((b) => {
      const t = norm(b.textContent);
      return t.includes("download svg") || t.includes("download png") || t.includes("download palette");
    });

    if (!hits.length) return null;

    // Try nearest common parent that contains 2-3 of them
    for (const b of hits) {
      const p = b.parentElement;
      if (!p) continue;
      const txt = norm(p.textContent);
      if (txt.includes("download svg") && (txt.includes("download png") || txt.includes("download palette"))) {
        return p;
      }
    }

    // fallback: use parent of first hit
    return hits[0].parentElement || null;
  }

  function detectOriginalTagsByColor() {
    // We try to map original color -> tag from palette UI swatches (0,1,2,cg1,bg7,...)
    // Strategy: look for elements with backgroundColor + readable text.
    const map = new Map(); // hex -> tag

    const candidates = Array.from(document.querySelectorAll("button, div, span, a"))
      .filter((el) => (el.textContent || "").trim().length > 0);

    for (const el of candidates) {
      const tag = (el.textContent || "").trim();
      if (!tag) continue;

      // ignore long texts
      if (tag.length > 8) continue;

      // require it to look like a tag: digits or letters+digits (cg1, bg7, wg9)
      if (!/^[a-zA-Z]{0,3}\d{1,3}$/.test(tag)) continue;

      let bg = "";
      try {
        bg = norm(window.getComputedStyle(el).backgroundColor || "");
      } catch (_) {}

      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;

      const hex = bg.startsWith("rgb") ? rgbToHex(bg) : null;
      if (hex && isHex6(hex)) {
        if (!map.has(hex)) map.set(hex, tag);
      }
    }

    return map;
  }

  function collectFillGroups(svg) {
    // Map<originalHex, Element[]>
    const groups = new Map();

    // collect likely paintable shapes
    const nodes = Array.from(svg.querySelectorAll("*"))
      .filter((el) => el instanceof SVGElement)
      .filter((el) => {
        const tn = el.tagName.toLowerCase();
        return ["path", "polygon", "rect", "circle", "ellipse"].includes(tn);
      });

    for (const el of nodes) {
      const fill = getElementFill(el);
      if (!fill) continue;
      if (fill === "#ffffff") continue; // optional: ignore pure white background
      if (!groups.has(fill)) groups.set(fill, []);
      groups.get(fill).push(el);
    }

    return groups;
  }

  function collectTextGroups(svg) {
    // Map<initialText, SVGTextElement[]>
    const groups = new Map();
    svg.querySelectorAll("text").forEach((t) => {
      const s = (t.textContent || "").trim();
      if (!s) return;
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(t);
    });
    return groups;
  }

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
    // Serialize SVG
    const svgText = new XMLSerializer().serializeToString(svgEl);

    // Make a blob url
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.decoding = "async";

    // Compute size from viewBox
    const vb = svgEl.getAttribute("viewBox");
    let w = 1200, h = 1200;
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

    // White background
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

  // ---------- UI ----------
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
      // fallback
      document.body.appendChild(host);
    }

    return host;
  }

  function renderGridPicker(onPick) {
    // Visual grid of replacement palette
    const grid = document.createElement("div");
    grid.style.cssText = `
      display:grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 6px;
      max-height: 320px;
      overflow:auto;
      padding: 6px;
      border: 1px solid rgba(0,0,0,.10);
      border-radius: 12px;
      background: rgba(0,0,0,.02);
    `;

    PALETTE.forEach((hex) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.title = hex;
      tile.style.cssText = `
        height: 34px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.16);
        background: ${hex};
        cursor: pointer;
      `;
      tile.addEventListener("click", () => onPick(hex));
      grid.appendChild(tile);
    });

    return grid;
  }

  function openEditor(originalSvg) {
    const host = ensureHostBelowDownloads();

    // reset UI
    host.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        1) Selecciona un color original → 2) elige el reemplazo en la grilla → 3) descarga el output
      </div>
    `;
    host.appendChild(header);

    // Clone SVGs
    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

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

    // Build mapping: original color -> tag (from palette UI)
    const tagByHex = detectOriginalTagsByColor();

    // Fill groups
    const fillGroups = collectFillGroups(recolorSvg);
    const entries = Array.from(fillGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Controls layout
    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    // Left: original colors list
    const left = document.createElement("div");
    left.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (tag → reemplazo)</div>`;
    controls.appendChild(left);

    // Right: grid picker
    const right = document.createElement("div");
    right.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Color picker (grilla visual)</div>`;
    controls.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Haz click en un color original (izquierda). Luego elige el color nuevo en la grilla.";
    right.appendChild(info);

    let selectedOldHex = null;

    // Grid picker
    const grid = renderGridPicker((newHex) => {
      if (!selectedOldHex) {
        alert("Primero selecciona un color original (panel izquierdo).");
        return;
      }
      const nodes = fillGroups.get(selectedOldHex) || [];
      nodes.forEach((el) => {
        // force fill attribute so it wins over CSS
        el.setAttribute("fill", newHex);
        // also remove inline style fill if any
        if (el.hasAttribute("style")) {
          el.setAttribute("style", el.getAttribute("style").replace(/fill:\s*[^;]+;?/gi, ""));
        }
      });

      // update row UI
      const row = left.querySelector(`[data-oldhex="${selectedOldHex}"]`);
      if (row) {
        const swNew = row.querySelector(".sw-new");
        const txt = row.querySelector(".row-text");
        swNew.style.background = newHex;
        swNew.style.borderStyle = "solid";
        txt.textContent = `Reemplazo: ${newHex}`;
      }
    });
    right.appendChild(grid);

    // Original colors list
    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent =
        "No detecté fills en el SVG. Esto pasa si el output no es SVG o si los colores vienen solo por CSS. " +
        "Puedo adaptarlo si me dices cómo se construye el SVG final (o me pegas un fragmento del SVG).";
      list.appendChild(empty);
    } else {
      entries.forEach(([oldHex]) => {
        const tag = tagByHex.get(oldHex) || oldHex;

        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 110px 1fr;
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

        const swOld = document.createElement("div");
        swOld.style.cssText = `width:38px; height:38px; border-radius:12px; border:1px solid rgba(0,0,0,.15); background:${oldHex};`;

        const arrow = document.createElement("div");
        arrow.textContent = "→";
        arrow.style.cssText = "font-weight:900; color: rgba(0,0,0,.55);";

        const swNew = document.createElement("div");
        swNew.className = "sw-new";
        swNew.style.cssText = `width:38px; height:38px; border-radius:12px; border:1px dashed rgba(0,0,0,.25); background:transparent;`;

        swWrap.appendChild(swOld);
        swWrap.appendChild(arrow);
        swWrap.appendChild(swNew);

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";

        const title = document.createElement("div");
        title.style.cssText = "font-weight:900;";
        title.textContent = `Tag: ${tag}`;

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = `Original: ${oldHex}`;

        const repl = document.createElement("div");
        repl.className = "row-text";
        repl.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        repl.textContent = "Reemplazo: —";

        stack.appendChild(title);
        stack.appendChild(meta);
        stack.appendChild(repl);

        row.appendChild(swWrap);
        row.appendChild(stack);

        row.addEventListener("click", () => {
          selectedOldHex = oldHex;
          // highlight selection
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

    // Labels/tags rename (stable)
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
      empty.textContent = "No encontré <text> en el SVG. Si el generador tiene 'labels', actívalo y vuelve a generar.";
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

    // NEW DOWNLOAD BUTTONS BELOW recolor block
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
        alert("No pude exportar PNG. Si pasa, dime qué navegador usas y lo ajusto.");
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);
  }

  function addMainButtonOnceReady() {
    const svg = findFinalOutputSvg();
    if (!svg) return;

    // place a small button under downloads (not inside editor)
    const host = ensureHostBelowDownloads();
    if (document.getElementById("btn-recolor-launch")) return;

    const bar = document.createElement("div");
    bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    bar.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
    `;

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
    hint.textContent = "Se abre debajo de los botones de descarga. Selecciona color original → elige reemplazo en la grilla → descarga output recoloreado.";
    host.appendChild(hint);
  }

  // Observe DOM changes (output SVG appears after generation)
  const observer = new MutationObserver(() => addMainButtonOnceReady());
  observer.observe(document.documentElement, { subtree: true, childList: true });

  window.addEventListener("load", () => setTimeout(addMainButtonOnceReady, 300));
})();
