/* 
  Recolor add-on for paintbynumbersgenerator
  - Adds "Recolorear" button once final SVG output exists
  - Clones SVG and lets you remap fills to your palette
  - Lets you edit labels/tags (<text>) reliably (keeps working after edits)
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

  function makeSvgResponsive(svgEl) {
    // Make sure the SVG fits the container (no cropping)
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.style.display = "block";
    svgEl.style.width = "100%";
    svgEl.style.height = "auto";
    svgEl.style.maxWidth = "100%";

    // Ensure viewBox exists (some SVGs rely on width/height only)
    if (!svgEl.getAttribute("viewBox")) {
      try {
        const bb = svgEl.getBBox();
        if (bb && bb.width && bb.height) {
          svgEl.setAttribute("viewBox", `0 0 ${bb.width} ${bb.height}`);
        }
      } catch (_) {}
    }
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  function collectFillGroups(svgEl) {
    // returns Map<fillHex, Element[]>
    const groups = new Map();
    svgEl.querySelectorAll("[fill]").forEach((el) => {
      const f = getFill(el);
      if (!f) return;
      const ff = norm(f);
      if (ff === "none" || ff === "transparent") return;
      if (!isColor(ff)) return;

      if (!groups.has(ff)) groups.set(ff, []);
      groups.get(ff).push(el);
    });
    return groups;
  }

  function collectTextGroups(svgEl) {
    // returns Map<originalText, SVGTextElement[]>
    const groups = new Map();
    svgEl.querySelectorAll("text").forEach((t) => {
      const s = (t.textContent || "").trim();
      if (!s) return;
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(t);
    });
    return groups;
  }

  function findLikelyOutputSvg() {
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;

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

    // Fallback: pick largest visible SVG
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

    const previews = document.createElement("div");
    previews.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start;";

    const mkPanel = (name) => {
      const p = document.createElement("div");
      p.style.cssText = "border:1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; overflow:auto;";
      const h = document.createElement("div");
      h.style.cssText = "font-weight:800; margin-bottom:8px;";
      h.textContent = name;
      p.appendChild(h);
      return p;
    };

    const p1 = mkPanel("Original");
    const o = originalSvg.cloneNode(true);
    makeSvgResponsive(o);
    p1.appendChild(o);

    const p2 = mkPanel("Recoloreada");
    const r = originalSvg.cloneNode(true);
    makeSvgResponsive(r);
    p2.appendChild(r);

    previews.appendChild(p1);
    previews.appendChild(p2);

    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px;";

    // ---------- COLORS ----------
    const colorPanel = mkPanel("Colores (original → reemplazo)");
    const fillGroups = collectFillGroups(r);

    const colorsList = document.createElement("div");
    colorsList.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";

    const makeSelect = () => {
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
        sel.appendChild(op);
      });
      return sel;
    };

    if (!fillGroups.size) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté colores fill en el SVG. Asegúrate de que el resultado final sea SVG (no PNG).";
      colorPanel.appendChild(empty);
    } else {
      for (const [oldHex, nodes] of Array.from(fillGroups.entries()).sort((a,b)=>a[0].localeCompare(b[0]))) {
        const row = document.createElement("div");
        row.style.cssText = "display:grid; grid-template-columns: 84px 1fr; gap: 10px; align-items:center;";

        // two swatches (original + new)
        const swWrap = document.createElement("div");
        swWrap.style.cssText = "display:flex; gap:8px; align-items:center;";

        const swOld = document.createElement("div");
        swOld.style.cssText = `width:38px; height:38px; border-radius:12px; border:1px solid rgba(0,0,0,.15); background:${oldHex};`;

        const arrow = document.createElement("div");
        arrow.textContent = "→";
        arrow.style.cssText = "font-weight:800; color: rgba(0,0,0,.55);";

        const swNew = document.createElement("div");
        swNew.style.cssText = `width:38px; height:38px; border-radius:12px; border:1px dashed rgba(0,0,0,.25); background:transparent;`;

        swWrap.appendChild(swOld);
        swWrap.appendChild(arrow);
        swWrap.appendChild(swNew);

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:6px;";

        const lab = document.createElement("div");
        lab.style.cssText = "font-size:12px; color: rgba(0,0,0,.7)";
        lab.textContent = `Original: ${oldHex}   |   Reemplazo: —`;

        const sel = makeSelect();
        sel.addEventListener("change", () => {
          const v = sel.value;
          const newHex = v ? v : null;

          // apply directly to the elements for this original color
          nodes.forEach((el) => el.setAttribute("fill", newHex || oldHex));

          // UI update
          if (newHex) {
            swNew.style.background = newHex;
            lab.textContent = `Original: ${oldHex}   |   Reemplazo: ${newHex}`;
            swNew.style.borderStyle = "solid";
          } else {
            swNew.style.background = "transparent";
            lab.textContent = `Original: ${oldHex}   |   Reemplazo: —`;
            swNew.style.borderStyle = "dashed";
          }
        });

        stack.appendChild(lab);
        stack.appendChild(sel);

        row.appendChild(swWrap);
        row.appendChild(stack);

        colorsList.appendChild(row);
      }

      colorPanel.appendChild(colorsList);
    }

    // ---------- LABELS / TAGS ----------
    const labelPanel = mkPanel("Tags / Labels (texto en SVG)");
    const textGroups = collectTextGroups(r);

    if (!textGroups.size) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No encontré <text> en el SVG. Si tu proyecto tiene opción de labels, actívala y vuelve a generar.";
      labelPanel.appendChild(empty);
    } else {
      const labelList = document.createElement("div");
      labelList.style.cssText = "display:grid; gap:10px; max-height: 360px; overflow:auto; padding-right: 6px;";

      for (const [originalText, nodes] of Array.from(textGroups.entries()).sort((a,b)=>a[0].localeCompare(b[0], "es"))) {
        const row = document.createElement("div");
        row.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items:center;";

        const oldBox = document.createElement("div");
        oldBox.style.cssText = "font-size: 13px; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.04);";
        oldBox.textContent = originalText;

        const input = document.createElement("input");
        input.type = "text";
        input.value = originalText; // editable and keeps working
        input.style.cssText = "padding: 8px; border-radius: 10px; border:1px solid rgba(0,0,0,.22);";
        input.addEventListener("input", () => {
          const v = input.value;
          nodes.forEach((t) => (t.textContent = v));
        });

        row.appendChild(oldBox);
        row.appendChild(input);
        labelList.appendChild(row);
      }

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
