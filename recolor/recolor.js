/* 
  Recolor add-on for paintbynumbersgenerator
  - Adds "Recolorear" button once final SVG output exists
  - Clones SVG and lets you remap fills to your 168-color palette
  - Lets you edit labels/tags (SVG <text> nodes)
*/

(function () {
  const PALETTE = window.PALETTE_168 || [];

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isColor = (v) =>
    typeof v === "string" &&
    (v.startsWith("#") || v.startsWith("rgb(") || v.startsWith("rgba("));

  function rgbToHex(rgb) {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toLowerCase();
  }

  function getFill(el) {
    const f = el.getAttribute("fill");
    if (!f) return null;
    if (f.startsWith("rgb")) return rgbToHex(f) || f;
    return f;
  }

  function collectUniqueFills(svgEl) {
    const fills = new Set();
    svgEl.querySelectorAll("[fill]").forEach((el) => {
      const f = getFill(el);
      if (!f) return;
      const ff = norm(f);
      if (ff === "none" || ff === "transparent") return;
      if (isColor(ff)) fills.add(ff);
    });
    return Array.from(fills).sort();
  }

  function collectUniqueLabels(svgEl) {
    const labels = new Set();
    svgEl.querySelectorAll("text").forEach((t) => {
      const s = (t.textContent || "").trim();
      if (s) labels.add(s);
    });
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "es"));
  }

  function applyColorMap(svgEl, colorMap) {
    svgEl.querySelectorAll("[fill]").forEach((el) => {
      const f = getFill(el);
      if (!f) return;
      const key = norm(f);
      const newC = colorMap[key];
      if (newC) el.setAttribute("fill", newC);
    });
  }

  function applyLabelMap(svgEl, labelMap) {
    svgEl.querySelectorAll("text").forEach((t) => {
      const s = (t.textContent || "").trim();
      if (!s) return;
      if (Object.prototype.hasOwnProperty.call(labelMap, s)) {
        t.textContent = labelMap[s];
      }
    });
  }

  function findLikelyOutputSvg() {
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;

    // Prefer SVG inside common output containers if they exist
    const containerSelectors = [
      "#output", "#result", "#results", "#svg", "#svgOutput",
      ".output", ".result", ".results", ".svg-output"
    ];

    for (const sel of containerSelectors) {
      const c = document.querySelector(sel);
      if (!c) continue;
      const inside = c.querySelector("svg");
      if (inside) return inside;
    }

    // Fallback: pick largest visible SVG (likely the final output)
    let best = null;
    let bestScore = 0;
    for (const s of svgs) {
      const box = s.getBoundingClientRect();
      const score = box.width * box.height;
      if (score > bestScore && box.width > 150 && box.height > 150) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  function ensureHostNear(svgEl) {
    let host = document.getElementById("recolor-host");
    if (host) return host;

    host = document.createElement("div");
    host.id = "recolor-host";
    host.style.cssText = `
      margin-top: 12px;
      padding: 12px;
      border: 1px solid rgba(0,0,0,.12);
      border-radius: 12px;
      background: rgba(255,255,255,.95);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    // Put it right after the SVG output if possible
    const anchor = svgEl.closest("div, section, main, article") || svgEl.parentElement;
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(host, anchor.nextSibling);
    } else {
      document.body.appendChild(host);
    }
    return host;
  }

  function addButtonIfMissing(svgEl) {
    if (document.getElementById("btn-recolor")) return;

    const host = ensureHostNear(svgEl);

    const top = document.createElement("div");
    top.style.cssText = "display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:800;";
    title.textContent = `Recoloreo (paleta ${PALETTE.length})`;

    const btn = document.createElement("button");
    btn.id = "btn-recolor";
    btn.textContent = "Recolorear";
    btn.style.cssText = `
      display:inline-flex;
      align-items:center;
      padding:10px 14px;
      border-radius:10px;
      border:1px solid rgba(0,0,0,.22);
      cursor:pointer;
      background:white;
      font-weight:700;
    `;

    const hint = document.createElement("div");
    hint.style.cssText = "margin-top:8px; color: rgba(0,0,0,.65); font-size: 13px;";
    hint.textContent = "Clona tu SVG final y te deja cambiar colores (desde tu paleta) + editar tags/labels del dibujo.";

    top.appendChild(title);
    top.appendChild(btn);
    host.appendChild(top);
    host.appendChild(hint);

    btn.addEventListener("click", () => openEditor(svgEl));
  }

  function openEditor(originalSvg) {
    const host = document.getElementById("recolor-host") || ensureHostNear(originalSvg);

    const old = document.getElementById("recolor-editor");
    if (old) old.remove();

    const editor = document.createElement("div");
    editor.id = "recolor-editor";
    editor.style.cssText = "margin-top: 12px; display: grid; gap: 12px;";

    // previews
    const previews = document.createElement("div");
    previews.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start;";

    const mkPanel = (name) => {
      const p = document.createElement("div");
      p.style.cssText = "border:1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px;";
      const h = document.createElement("div");
      h.style.cssText = "font-weight:800; margin-bottom:8px;";
      h.textContent = name;
      p.appendChild(h);
      return p;
    };

    const p1 = mkPanel("Original");
    const o = originalSvg.cloneNode(true);
    o.style.maxWidth = "100%";
    o.style.height = "auto";
    p1.appendChild(o);

    const p2 = mkPanel("Recoloreada");
    const r = originalSvg.cloneNode(true);
    r.style.maxWidth = "100%";
    r.style.height = "auto";
    p2.appendChild(r);

    previews.appendChild(p1);
    previews.appendChild(p2);

    // controls
    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px;";

    // colors
    const colorPanel = mkPanel("Colores (fill → paleta)");
    const fills = collectUniqueFills(r);
    const colorMap = {};

    const colorsList = document.createElement("div");
    colorsList.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";

    const makeSelect = (selected) => {
      const sel = document.createElement("select");
      sel.style.cssText = "width: 100%; padding: 8px; border-radius: 10px; border:1px solid rgba(0,0,0,.22); background:white;";
      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = "— elegir color —";
      sel.appendChild(o0);
      PALETTE.forEach((hex) => {
        const op = document.createElement("option");
        op.value = hex;
        op.textContent = hex;
        if (norm(hex) === norm(selected)) op.selected = true;
        sel.appendChild(op);
      });
      return sel;
    };

    if (!fills.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté colores fill en el SVG. Asegúrate de que el resultado final sea SVG (no PNG).";
      colorPanel.appendChild(empty);
    } else {
      fills.forEach((oldHex) => {
        const row = document.createElement("div");
        row.style.cssText = "display:grid; grid-template-columns: 38px 1fr; gap: 10px; align-items:center;";

        const sw = document.createElement("div");
        sw.style.cssText = `width:38px; height:38px; border-radius:12px; border:1px solid rgba(0,0,0,.15); background:${oldHex};`;

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:6px;";

        const lab = document.createElement("div");
        lab.style.cssText = "font-size:12px; color: rgba(0,0,0,.7)";
        lab.textContent = `Actual: ${oldHex}`;

        const sel = makeSelect("");
        sel.addEventListener("change", () => {
          const v = sel.value;
          if (v) colorMap[norm(oldHex)] = v;
          else delete colorMap[norm(oldHex)];
          applyColorMap(r, colorMap);
        });

        stack.appendChild(lab);
        stack.appendChild(sel);

        row.appendChild(sw);
        row.appendChild(stack);
        colorsList.appendChild(row);
      });

      colorPanel.appendChild(colorsList);
    }

    // labels
    const labelPanel = mkPanel("Tags / Labels (texto en SVG)");
    const labels = collectUniqueLabels(r);
    const labelMap = {};

    if (!labels.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No encontré <text> en el SVG. Si tu proyecto tiene opción de labels, actívala y vuelve a generar.";
      labelPanel.appendChild(empty);
    } else {
      const labelList = document.createElement("div");
      labelList.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";

      labels.forEach((oldText) => {
        const row = document.createElement("div");
        row.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items:center;";

        const oldBox = document.createElement("div");
        oldBox.style.cssText = "font-size: 13px; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.04);";
        oldBox.textContent = oldText;

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Nuevo tag…";
        input.style.cssText = "padding: 8px; border-radius: 10px; border:1px solid rgba(0,0,0,.22);";
        input.addEventListener("input", () => {
          const v = input.value.trim();
          if (v) labelMap[oldText] = v;
          else labelMap[oldText] = oldText; // revert
          applyLabelMap(r, labelMap);
        });

        row.appendChild(oldBox);
        row.appendChild(input);
        labelList.appendChild(row);
      });

      labelPanel.appendChild(labelList);
    }

    controls.appendChild(colorPanel);
    controls.appendChild(labelPanel);

    // actions
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:10px; align-items:center; flex-wrap:wrap;";

    const btnCopy = document.createElement("button");
    btnCopy.textContent = "Copiar SVG recoloreado";
    btnCopy.style.cssText =
      "padding:10px 14px; border-radius:10px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:700;";
    btnCopy.addEventListener("click", async () => {
      const txt = new XMLSerializer().serializeToString(r);
      try {
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "✅ Copiado";
        setTimeout(() => (btnCopy.textContent = "Copiar SVG recoloreado"), 1200);
      } catch (e) {
        alert("No pude copiar al portapapeles. Revisa permisos del navegador.");
      }
    });

    const btnClose = document.createElement("button");
    btnClose.textContent = "Cerrar editor";
    btnClose.style.cssText =
      "padding:10px 14px; border-radius:10px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:700;";
    btnClose.addEventListener("click", () => editor.remove());

    actions.appendChild(btnCopy);
    actions.appendChild(btnClose);

    editor.appendChild(previews);
    editor.appendChild(controls);
    editor.appendChild(actions);

    host.appendChild(editor);
  }

  function boot() {
    const svg = findLikelyOutputSvg();
    if (!svg) return;
    addButtonIfMissing(svg);
  }

  const observer = new MutationObserver(() => boot());
  observer.observe(document.documentElement, { subtree: true, childList: true });

  window.addEventListener("load", () => setTimeout(boot, 250));
})();
