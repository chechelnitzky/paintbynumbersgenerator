/* dayu_ui_patch.js (V2)
   - NO depende de #palette.
   - Lee clusters y colores desde el SVG generado.
   - Crea su propia fila de “cajitas” (swatches) editables.
   - Toggle Dayu (opt-in) + Apply + Reset.
   - Asignación Dayu por similitud SIN repetir códigos (greedy por distancia).
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Dayu helpers ----------
  function sanitizeHex(hex) {
    if (!hex) return null;
    let h = String(hex).trim().replace(/^#/, "");
    if (h === "0") return "000000";
    if (/^[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(h)) return h.split("").map(c => c + c).join("").toLowerCase();
    return null;
  }

  function hexToRgb(hex) {
    const h = sanitizeHex(hex);
    if (!h) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbFromCssColor(c) {
    // Accepts: rgb(r,g,b) or #rrggbb
    if (!c) return null;
    c = String(c).trim();
    if (c.startsWith("#")) return hexToRgb(c);
    const m = c.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function dist2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function getDayu() {
    const raw = Array.isArray(window.DAYU_PALETTE) ? window.DAYU_PALETTE : [];
    const map = new Map();
    const list = [];

    for (const it of raw) {
      if (!it) continue;
      const code = String(it.code || "").trim();
      if (!code) continue;

      const hex = sanitizeHex(it.hex);
      const rgb = hexToRgb(hex);
      if (!hex || !rgb) continue;

      const obj = { code: code.toUpperCase(), hex, rgb };
      map.set(obj.code, obj);
      list.push(obj);
    }

    return { map, list };
  }

  // ---------- SVG access ----------
  function getSvg() {
    return document.querySelector("#svgContainer svg") || document.querySelector("svg");
  }

  function findFacetShapeFromText(textEl) {
    const g = textEl.closest("g") || textEl.parentElement;
    if (!g) return null;

    // Common shapes
    const shapes = g.querySelectorAll("path,polygon,rect");
    for (const s of shapes) {
      // Prefer a non-none fill
      const fill = (s.getAttribute("fill") || "").trim();
      const style = (s.getAttribute("style") || "").trim();

      if (fill && fill !== "none") return s;

      const m = style.match(/fill\s*:\s*([^;]+)/i);
      if (m && m[1] && m[1].trim() !== "none") return s;
    }
    return null;
  }

  function getShapeFillHex(shapeEl) {
    if (!shapeEl) return null;

    const fill = (shapeEl.getAttribute("fill") || "").trim();
    if (fill && fill !== "none") {
      if (fill.startsWith("#")) return sanitizeHex(fill);
      const rgb = rgbFromCssColor(fill);
      if (rgb) return rgbToHex(rgb);
    }

    const style = (shapeEl.getAttribute("style") || "");
    const m = style.match(/fill\s*:\s*([^;]+)/i);
    if (m && m[1]) {
      const v = m[1].trim();
      if (v.startsWith("#")) return sanitizeHex(v);
      const rgb = rgbFromCssColor(v);
      if (rgb) return rgbToHex(rgb);
    }

    return null;
  }

  function setShapeFill(shapeEl, hex) {
    const h = sanitizeHex(hex);
    if (!h || !shapeEl) return;
    const c = `#${h}`;
    shapeEl.setAttribute("fill", c);

    const style = shapeEl.getAttribute("style") || "";
    if (/fill\s*:/i.test(style)) {
      shapeEl.setAttribute("style", style.replace(/fill\s*:\s*[^;]+/i, `fill:${c}`));
    } else {
      const tail = style && !style.trim().endsWith(";") ? ";" : "";
      shapeEl.setAttribute("style", `${style}${tail}fill:${c};`);
    }
  }

  function rgbToHex(rgb) {
    const [r, g, b] = rgb;
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `${to2(r)}${to2(g)}${to2(b)}`;
  }

  // ---------- Read clusters from SVG ----------
  function getClusterTexts(svg) {
    // We only treat pure integer labels as clusters (0..K-1)
    const texts = $$("text", svg);
    const out = [];
    for (const t of texts) {
      const v = (t.textContent || "").trim();
      if (/^\d+$/.test(v)) out.push(t);
    }
    return out;
  }

  function getClusterCountFromSvg(svg) {
    const labels = getClusterTexts(svg)
      .map(t => Number((t.textContent || "").trim()))
      .filter(n => Number.isFinite(n));

    if (!labels.length) return 0;
    return Math.max(...labels) + 1;
  }

  // Build representative RGB for each cluster idx:
  // pick first facet we find for each idx, grab its fill color.
  function buildIdxToRgbFromSvg(svg) {
    const idxToRgb = new Map();
    const texts = getClusterTexts(svg);

    for (const t of texts) {
      const idx = (t.textContent || "").trim();
      if (idxToRgb.has(idx)) continue;

      // tag original cluster idx so we can reset labels later
      if (!t.getAttribute("data-cluster-idx")) t.setAttribute("data-cluster-idx", idx);

      const shape = findFacetShapeFromText(t);
      const fillHex = getShapeFillHex(shape);
      if (!fillHex) continue;

      const rgb = hexToRgb(fillHex);
      if (!rgb) continue;

      idxToRgb.set(idx, rgb);
    }

    return idxToRgb;
  }

  // ---------- UI ----------
  function ensureUiContainer() {
    // place UI near svgContainer
    const svgContainer = document.getElementById("svgContainer") || document.body;
    let host = document.getElementById("dayu-ui-host");
    if (host) return host;

    host = document.createElement("div");
    host.id = "dayu-ui-host";
    host.style.margin = "12px 0";
    host.style.padding = "12px";
    host.style.border = "1px solid rgba(0,0,0,.12)";
    host.style.borderRadius = "12px";
    host.style.display = "grid";
    host.style.gap = "10px";

    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="dayu-toggle" />
          <span><b>Usar paleta Dayu</b> (opcional)</span>
        </label>

        <button id="dayu-apply" class="btn waves-effect waves-light" type="button">APLICAR DAYU</button>
        <button id="dayu-reset" class="btn waves-effect waves-light" type="button">RESET (VOLVER A 0..K-1)</button>

        <span id="dayu-msg" style="opacity:.75;"></span>
      </div>

      <div id="dayu-swatches" style="display:flex;gap:8px;flex-wrap:wrap;"></div>

      <div style="opacity:.8;font-size:13px;">
        Tip: edita una cajita: escribe <b>63</b> o <b>WG3</b> y presiona <b>Enter</b>.
      </div>
    `;

    // Insert host ABOVE svgContainer so it's visible
    svgContainer.parentElement.insertBefore(host, svgContainer);
    return host;
  }

  function msg(text) {
    const el = document.getElementById("dayu-msg");
    if (el) el.textContent = text || "";
  }

  function createSwatch(idx, colorHex, labelValue) {
    const wrap = document.createElement("div");
    wrap.style.width = "56px";
    wrap.style.height = "56px";
    wrap.style.borderRadius = "8px";
    wrap.style.overflow = "hidden";
    wrap.style.position = "relative";
    wrap.style.border = "1px solid rgba(0,0,0,.12)";

    const bg = document.createElement("div");
    bg.style.position = "absolute";
    bg.style.inset = "0";
    bg.style.background = `#${sanitizeHex(colorHex) || "ffffff"}`;
    wrap.appendChild(bg);

    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = labelValue;
    inp.dataset.clusterIdx = String(idx);
    inp.style.position = "absolute";
    inp.style.inset = "0";
    inp.style.width = "100%";
    inp.style.height = "100%";
    inp.style.border = "0";
    inp.style.outline = "0";
    inp.style.background = "transparent";
    inp.style.textAlign = "center";
    inp.style.fontWeight = "800";
    inp.style.fontSize = "14px";
    inp.style.color = "#000";
    inp.style.textTransform = "uppercase";

    // Improve readability
    inp.style.textShadow = "0 0 3px rgba(255,255,255,.9), 0 0 6px rgba(255,255,255,.7)";

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyManualCodeToCluster(inp.dataset.clusterIdx, inp.value);
        inp.blur();
      }
    });

    wrap.appendChild(inp);
    return wrap;
  }

  function renderSwatchesFromSvg() {
    const svg = getSvg();
    if (!svg) {
      msg("Aún no hay SVG generado. Primero presiona Process image.");
      return false;
    }

    const k = getClusterCountFromSvg(svg);
    if (!k) {
      msg("No detecté labels numéricos (0..K-1) en el SVG.");
      return false;
    }

    const idxToRgb = buildIdxToRgbFromSvg(svg);
    const sw = document.getElementById("dayu-swatches");
    sw.innerHTML = "";

    for (let i = 0; i < k; i++) {
      const idx = String(i);
      const rgb = idxToRgb.get(idx);
      const baseHex = rgb ? rgbToHex(rgb) : "ffffff";
      sw.appendChild(createSwatch(idx, baseHex, idx));
    }

    msg(`Detecté ${k} clusters desde el SVG.`);
    return true;
  }

  // ---------- Apply / Reset ----------
  function resetLabelsToOriginal() {
    const svg = getSvg();
    if (!svg) return false;

    // restore labels to their original numeric cluster idx (stored in data-cluster-idx)
    const texts = $$("text", svg);
    let changed = false;

    for (const t of texts) {
      const orig = t.getAttribute("data-cluster-idx");
      if (orig && /^\d+$/.test(orig)) {
        t.textContent = orig;
        changed = true;
      }
    }
    return changed;
  }

  function applyDayuToCluster(idx, dayuCode, dayuHex) {
    const svg = getSvg();
    if (!svg) return false;

    let changed = false;
    const texts = $$("text", svg);

    for (const t of texts) {
      const orig = t.getAttribute("data-cluster-idx") || (t.textContent || "").trim();
      // ensure data-cluster-idx is set if numeric
      if (!t.getAttribute("data-cluster-idx") && /^\d+$/.test(orig)) {
        t.setAttribute("data-cluster-idx", orig);
      }

      const clusterIdx = t.getAttribute("data-cluster-idx");
      if (clusterIdx !== String(idx)) continue;

      t.textContent = dayuCode;
      changed = true;

      const shape = findFacetShapeFromText(t);
      if (shape) setShapeFill(shape, dayuHex);
    }

    return changed;
  }

  function assignDayuGreedyUnique() {
    const svg = getSvg();
    const { list: dayuList } = getDayu();

    if (!svg) {
      msg("Primero genera un SVG con Process image.");
      return;
    }
    if (!dayuList.length) {
      msg("No encontré DAYU_PALETTE válido. Revisa dayu_palette.js.");
      return;
    }

    const idxToRgb = buildIdxToRgbFromSvg(svg);
    const idxs = Array.from(idxToRgb.keys()).sort((a, b) => Number(a) - Number(b));

    if (!idxs.length) {
      msg("No pude leer colores desde el SVG. (No encontré fills).");
      return;
    }

    // build all candidate pairs
    const pairs = [];
    for (let i = 0; i < idxs.length; i++) {
      const rgb = idxToRgb.get(idxs[i]);
      for (let j = 0; j < dayuList.length; j++) {
        pairs.push({ i, j, d: dist2(rgb, dayuList[j].rgb) });
      }
    }
    pairs.sort((a, b) => a.d - b.d);

    const usedI = new Set();
    const usedJ = new Set();
    const idxToDayu = new Map();

    for (const p of pairs) {
      if (usedI.has(p.i) || usedJ.has(p.j)) continue;
      usedI.add(p.i);
      usedJ.add(p.j);

      const idx = idxs[p.i];
      const dayu = dayuList[p.j];
      idxToDayu.set(idx, dayu);

      if (idxToDayu.size === idxs.length) break;
    }

    // Apply mapping
    for (const [idx, dayu] of idxToDayu.entries()) {
      applyDayuToCluster(idx, dayu.code, dayu.hex);

      // update swatch UI label + color
      const inp = document.querySelector(`#dayu-swatches input[data-cluster-idx="${idx}"]`);
      if (inp) inp.value = dayu.code;

      const wrap = inp ? inp.parentElement : null;
      if (wrap) wrap.firstChild.style.background = `#${dayu.hex}`;
    }

    msg(`Aplicado Dayu: ${idxToDayu.size} clusters asignados sin repetir.`);
  }

  // ---------- Manual override ----------
  function normalizeCode(v) {
    return String(v || "").trim().toUpperCase();
  }

  function applyManualCodeToCluster(idx, userValue) {
    const { map } = getDayu();
    const code = normalizeCode(userValue);
    if (!code) return;

    const dayu = map.get(code);
    if (!dayu) {
      msg(`Código Dayu inválido: "${code}".`);
      return;
    }

    // prevent duplicates (your rule)
    const inputs = $$("#dayu-swatches input[data-cluster-idx]");
    const usedBy = inputs.find(i => i.dataset.clusterIdx !== String(idx) && normalizeCode(i.value) === code);
    if (usedBy) {
      msg(`"${code}" ya está usado en el cluster ${usedBy.dataset.clusterIdx}. Elige otro.`);
      // revert input
      const self = inputs.find(i => i.dataset.clusterIdx === String(idx));
      if (self) self.value = self.value; // no-op
      return;
    }

    applyDayuToCluster(idx, dayu.code, dayu.hex);

    // update swatch color
    const inp = document.querySelector(`#dayu-swatches input[data-cluster-idx="${idx}"]`);
    if (inp) inp.value = dayu.code;
    const wrap = inp ? inp.parentElement : null;
    if (wrap) wrap.firstChild.style.background = `#${dayu.hex}`;

    msg(`Cluster ${idx} -> ${dayu.code}`);
  }

  // ---------- Wiring / observers ----------
  function wireUiOnce() {
    ensureUiContainer();

    const toggle = document.getElementById("dayu-toggle");
    const applyBtn = document.getElementById("dayu-apply");
    const resetBtn = document.getElementById("dayu-reset");

    if (toggle.dataset.wired === "1") return; // prevent duplicate wiring
    toggle.dataset.wired = "1";

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        assignDayuGreedyUnique();
      } else {
        resetLabelsToOriginal();
        // reset swatch labels back to idx and colors back to base-from-SVG
        renderSwatchesFromSvg();
        msg("Reset: volví a 0..K-1 (y reconstruí cajitas).");
      }
    });

    applyBtn.addEventListener("click", () => {
      toggle.checked = true;
      assignDayuGreedyUnique();
    });

    resetBtn.addEventListener("click", () => {
      toggle.checked = false;
      resetLabelsToOriginal();
      renderSwatchesFromSvg();
      msg("Reset aplicado.");
    });
  }

  function tryInitAfterProcess() {
    wireUiOnce();
    renderSwatchesFromSvg();
  }

  window.addEventListener("DOMContentLoaded", () => {
    wireUiOnce();

    // Hook to Process button
    const btn = document.getElementById("btnProcess");
    if (btn) {
      btn.addEventListener("click", () => {
        // Wait until SVG appears/updates
        let tries = 0;
        const t = setInterval(() => {
          tries++;
          const svg = getSvg();
          if (svg) {
            tryInitAfterProcess();
            clearInterval(t);
          } else if (tries > 80) {
            msg("No apareció el SVG. Revisa si el proceso terminó.");
            clearInterval(t);
          }
        }, 200);
      }, true);
    }

    // Observe svgContainer changes (when generation finishes)
    const svgContainer = document.getElementById("svgContainer");
    if (svgContainer) {
      new MutationObserver(() => {
        // If SVG is present, keep swatches synced
        if (getSvg()) tryInitAfterProcess();
      }).observe(svgContainer, { childList: true, subtree: true });
    }
  });
})();
