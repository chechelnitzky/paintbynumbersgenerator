/* Recolor add-on (v5)
   - Original color squares show TAG badge (from Excel palette)
   - Toggle to show/hide "facets" (strokes/lines) without losing edits
   - Grid picker uses PALETTE_ITEMS (tag+hex)
   - Downloads recolored SVG + PNG
*/

(function () {
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map(x => x.hex);
  const TAG_BY_HEX = window.PALETTE_TAG_BY_HEX || {}; // { "#rrggbb": "42" }

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);

  function getTagForHex(hex) {
    const h = norm(hex);
    return TAG_BY_HEX[h] != null ? String(TAG_BY_HEX[h]) : "";
  }

  function rgbToHex(rgb) {
    const m = (rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toLowerCase();
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

  function findFinalOutputSvg() {
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

  function makeBadge(text) {
    const b = document.createElement("div");
    b.textContent = text;
    b.style.cssText = `
      position:absolute;
      left:4px;
      top:4px;
      padding:2px 6px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 900;
      background: rgba(255,255,255,.90);
      border: 1px solid rgba(0,0,0,.12);
      color: rgba(0,0,0,.85);
      max-width: calc(100% - 8px);
      white-space: nowrap;
      overflow:hidden;
      text-overflow: ellipsis;
      pointer-events:none;
    `;
    return b;
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

      if (tag) tile.appendChild(makeBadge(tag));

      tile.addEventListener("click", () => onPick({hex, tag}));
      grid.appendChild(tile);
    });

    return grid;
  }

  // ---- FACETS TOGGLE (stroke/lines) ----
  function ensureFacetsStyle(svg) {
    let style = svg.querySelector("#recolor-facets-style");
    if (style) return style;
    style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("id", "recolor-facets-style");
    svg.insertBefore(style, svg.firstChild);
    return style;
  }

  function setFacets(svg, on) {
    const style = ensureFacetsStyle(svg);
    if (on) {
      style.textContent = ""; // show facets (default)
      return;
    }
    // Hide “facets”: usually elements with no fill but stroke, or thin stroked outlines.
    style.textContent = `
      /* hide facets/strokes without changing fills */
      [fill="none"][stroke], path[stroke][fill="none"], polyline[stroke], line[stroke] {
        stroke-opacity: 0 !important;
      }
      /* some generators use stroke + transparent fill for facets */
      [stroke][fill="transparent"], path[stroke][fill="transparent"] {
        stroke-opacity: 0 !important;
      }
    `;
  }

  function openEditor(originalSvg) {
    const host = ensureHostBelowDownloads();
    host.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        Selecciona color original → elige reemplazo (grilla) → descarga output recoloreado
      </div>
    `;
    host.appendChild(header);

    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

    // Facets default ON
    let facetsOn = true;
    setFacets(recolorSvg, facetsOn);

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
    const entries = Array.from(fillGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    const left = document.createElement("div");
    left.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (TAG + hex → reemplazo)</div>`;
    controls.appendChild(left);

    const right = document.createElement("div");
    right.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Picker (grilla con tags del Excel)</div>`;
    controls.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Haz click en un color original (izquierda). Luego elige el color nuevo en la grilla.";
    right.appendChild(info);

    let selectedOldHex = null;

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
        const swNewBadgeHost = row.querySelector(".sw-new-badgehost");
        const txt = row.querySelector(".row-text");
        swNew.style.background = newHex;
        swNew.style.borderStyle = "solid";
        txt.textContent = newTag ? `Reemplazo: ${newTag} (${newHex})` : `Reemplazo: ${newHex}`;

        // Update replacement badge on the new swatch
        swNewBadgeHost.innerHTML = "";
        if (newTag) swNewBadgeHost.appendChild(makeBadge(newTag));
      }
    });
    right.appendChild(grid);

    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG. Si el SVG usa CSS en vez de fill directo, dime y lo adapto.";
      list.appendChild(empty);
    } else {
      entries.forEach(([oldHex]) => {
        const tag = getTagForHex(oldHex) || ""; // FIX #1: show tag badge on original square

        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.style.cssText = `
          text-align:left;
          display:grid;
          grid-template-columns: 120px 1fr;
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

        // OLD swatch with badge
        const swOld = document.createElement("div");
        swOld.style.cssText = `
          width:54px; height:44px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,.15);
          background:${oldHex};
          position: relative;
          overflow:hidden;
        `;
        if (tag) swOld.appendChild(makeBadge(tag));

        const arrow = document.createElement("div");
        arrow.textContent = "→";
        arrow.style.cssText = "font-weight:900; color: rgba(0,0,0,.55);";

        // NEW swatch (badge updated after pick)
        const swNew = document.createElement("div");
        swNew.className = "sw-new";
        swNew.style.cssText = `
          width:54px; height:44px;
          border-radius:12px;
          border:1px dashed rgba(0,0,0,.25);
          background:transparent;
          position: relative;
          overflow:hidden;
        `;
        const swNewBadgeHost = document.createElement("div");
        swNewBadgeHost.className = "sw-new-badgehost";
        swNewBadgeHost.style.cssText = "position:absolute; inset:0;";
        swNew.appendChild(swNewBadgeHost);

        swWrap.appendChild(swOld);
        swWrap.appendChild(arrow);
        swWrap.appendChild(swNew);

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = tag ? `Tag: ${tag}  |  Original: ${oldHex}` : `Original: ${oldHex}`;

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

    // Labels rename
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

    // ---- FIX #2: Facets toggle just above download buttons ----
    const facetsRow = document.createElement("div");
    facetsRow.style.cssText = `
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

    const facetsLeft = document.createElement("div");
    facetsLeft.style.cssText = "display:flex; align-items:center; gap:10px;";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = facetsOn;
    chk.style.cssText = "transform: scale(1.2);";

    const lbl = document.createElement("div");
    lbl.style.cssText = "font-weight:900;";
    lbl.textContent = "Facets (bordes)";

    const desc = document.createElement("div");
    desc.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
    desc.textContent = "Apagar/prender bordes sin perder colores/tags/textos editados.";

    facetsLeft.appendChild(chk);
    facetsLeft.appendChild(lbl);

    facetsRow.appendChild(facetsLeft);
    facetsRow.appendChild(desc);
    host.appendChild(facetsRow);

    chk.addEventListener("change", () => {
      facetsOn = chk.checked;
      setFacets(recolorSvg, facetsOn);
    });

    // Downloads recolored
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
  }

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
    hint.textContent = "Los tags vienen del Excel (PALETTE_ITEMS).";
    host.appendChild(hint);
  }

  const observer = new MutationObserver(() => addLaunchButtonOnceReady());
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener("load", () => setTimeout(addLaunchButtonOnceReady, 300));
})();
