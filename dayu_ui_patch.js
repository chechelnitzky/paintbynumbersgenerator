/* dayu_ui_patch.js (V3)
   - Lee palette REAL desde #palette (cuadritos 0..K-1) usando computedStyle backgroundColor.
   - Fallback: si #palette no existe, intenta leer desde SVG.
   - UI Dayu opt-in + Apply + Reset.
   - Manual override por cajita (Enter).
   - “Mapear a DAYU” arriba queda conectado a Apply y evita el popup antiguo.
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Color helpers ----------
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
  function rgbToHex(rgb) {
    const [r, g, b] = rgb;
    const to2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    return `${to2(r)}${to2(g)}${to2(b)}`;
  }
  function rgbFromCssColor(c) {
    if (!c) return null;
    c = String(c).trim();
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function dist2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  // ---------- Dayu palette ----------
  function getDayu() {
    const raw = Array.isArray(window.DAYU_PALETTE) ? window.DAYU_PALETTE : [];
    const map = new Map();
    const list = [];
    for (const it of raw) {
      if (!it) continue;
      const code = String(it.code || "").trim().toUpperCase();
      if (!code) continue;
      const hex = sanitizeHex(it.hex);
      const rgb = hexToRgb(hex);
      if (!hex || !rgb) continue;
      const obj = { code, hex, rgb };
      if (!map.has(code)) map.set(code, obj);
      list.push(obj);
    }
    return { map, list };
  }

  // ---------- SVG access ----------
  function getSvg() {
    return document.querySelector("#svgContainer svg") || document.querySelector("svg");
  }
  function getClusterTexts(svg) {
    return $$("text", svg).filter(t => /^\d+$/.test((t.textContent || "").trim()));
  }
  function findFacetShapeFromText(textEl) {
    const g = textEl.closest("g") || textEl.parentElement;
    if (!g) return null;
    const shapes = g.querySelectorAll("path,polygon,rect");
    for (const s of shapes) {
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

  // ---------- Read palette from UI (THIS is the key fix) ----------
  function buildIdxToRgbFromPaletteUI() {
    const pal = document.getElementById("palette");
    if (!pal) return new Map();

    // We look for “swatch” elements inside #palette:
    // anything with numeric text and non-transparent background
    const candidates = $$("*", pal).filter(el => {
      const txt = (el.textContent || "").trim();
      if (!/^\d+$/.test(txt)) return false;
      const bg = getComputedStyle(el).backgroundColor;
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
      return true;
    });

    const idxToRgb = new Map();
    for (const el of candidates) {
      const idx = (el.textContent || "").trim();
      if (idxToRgb.has(idx)) continue;
      const bg = getComputedStyle(el).backgroundColor;
      const rgb = rgbFromCssColor(bg);
      if (rgb) idxToRgb.set(idx, rgb);
    }
    return idxToRgb;
  }

  // Fallback: representative rgb per cluster from SVG fills (if UI palette not usable)
  function buildIdxToRgbFromSvg(svg) {
    const idxToRgb = new Map();
    const texts = getClusterTexts(svg);
    for (const t of texts) {
      const idx = (t.textContent || "").trim();
      if (idxToRgb.has(idx)) continue;
      if (!t.getAttribute("data-cluster-idx")) t.setAttribute("data-cluster-idx", idx);

      const shape = findFacetShapeFromText(t);
      const fillHex = getShapeFillHex(shape);
      if (!fillHex) continue;
      const rgb = hexToRgb(fillHex);
      if (rgb) idxToRgb.set(idx, rgb);
    }
    return idxToRgb;
  }

  function getKFromPaletteMap(idxToRgb) {
    const ks = Array.from(idxToRgb.keys()).map(k => Number(k)).filter(n => Number.isFinite(n));
    if (!ks.length) return 0;
    return Math.max(...ks) + 1;
  }

  // ---------- UI block ----------
  function ensureUi() {
    let host = document.getElementById("dayu-ui-host");
    if (host) return host;

    const svgContainer = document.getElementById("svgContainer") || document.body;

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

    svgContainer.parentElement.insertBefore(host, svgContainer);
    return host;
  }

  function msg(t) {
    const el = document.getElementById("dayu-msg");
    if (el) el.textContent = t || "";
  }

  function createSwatch(clusterIdx, hex, label) {
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
    bg.style.background = `#${sanitizeHex(hex) || "ffffff"}`;
    wrap.appendChild(bg);

    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = label;
    inp.dataset.clusterIdx = String(clusterIdx);
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
    inp.style.textShadow = "0 0 3px rgba(255,255,255,.95), 0 0 6px rgba(255,255,255,.75)";

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyManualCode(inp.dataset.clusterIdx, inp.value);
        inp.blur();
      }
    });

    wrap.appendChild(inp);
    return wrap;
  }

  // ---------- Apply/Reset ----------
  function resetLabels() {
    const svg = getSvg();
    if (!svg) return false;

    const texts = $$("text", svg);
    let changed = false;

    for (const t of texts) {
      const orig = t.getAttribute("data-cluster-idx");
      if (orig && /^\d+$/.test(orig)) {
        t.textContent = orig;
        changed = true;
      } else {
        const v = (t.textContent || "").trim();
        if (/^\d+$/.test(v)) t.setAttribute("data-cluster-idx", v);
      }
    }
    return changed;
  }

  function applyToCluster(clusterIdx, dayuCode, dayuHex) {
    const svg = getSvg();
    if (!svg) return false;

    let changed = false;
    const texts = $$("text", svg);

    for (const t of texts) {
      // Ensure original cluster label is stored
      if (!t.getAttribute("data-cluster-idx")) {
        const v = (t.textContent || "").trim();
        if (/^\d+$/.test(v)) t.setAttribute("data-cluster-idx", v);
      }

      const orig = t.getAttribute("data-cluster-idx");
      if (orig !== String(clusterIdx)) continue;

      t.textContent = dayuCode;
      changed = true;

      const shape = findFacetShapeFromText(t);
      if (shape) setShapeFill(shape, dayuHex);
    }

    return changed;
  }

  function renderSwatches() {
    ensureUi();

    // Prefer palette UI mapping
    let idxToRgb = buildIdxToRgbFromPaletteUI();

    // Fallback to SVG mapping
    if (!idxToRgb.size) {
      const svg = getSvg();
      if (svg) idxToRgb = buildIdxToRgbFromSvg(svg);
    }

    if (!idxToRgb.size) {
      msg("Aún no hay paleta detectable. Primero presiona Process image y espera el Output.");
      const sw = document.getElementById("dayu-swatches");
      if (sw) sw.innerHTML = "";
      return false;
    }

    const k = getKFromPaletteMap(idxToRgb);
    const sw = document.getElementById("dayu-swatches");
    sw.innerHTML = "";

    for (let i = 0; i < k; i++) {
      const idx = String(i);
      const rgb = idxToRgb.get(idx);
      const baseHex = rgb ? rgbToHex(rgb) : "ffffff";
      sw.appendChild(createSwatch(idx, baseHex, idx));
    }

    msg(`Paleta detectada: ${k} colores (0..${k - 1}).`);
    return true;
  }

  function applyDayuGreedyUnique() {
    const { list: dayuList } = getDayu();
    if (!dayuList.length) {
      msg("No encontré DAYU_PALETTE válido. Revisa dayu_palette.js.");
      return;
    }

    // Get current palette colors from UI (preferred)
    let idxToRgb = buildIdxToRgbFromPaletteUI();

    // Fallback
    if (!idxToRgb.size) {
      const svg = getSvg();
      if (svg) idxToRgb = buildIdxToRgbFromSvg(svg);
    }

    if (!idxToRgb.size) {
      alert("No se pudo extraer la paleta actual. Asegúrate de haber generado primero la imagen.");
      return;
    }

    const idxs = Array.from(idxToRgb.keys()).sort((a, b) => Number(a) - Number(b));

    // candidate pairs
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
      idxToDayu.set(idx, dayuList[p.j]);
      if (idxToDayu.size === idxs.length) break;
    }

    // Apply mapping + update swatches UI
    for (const [idx, dayu] of idxToDayu.entries()) {
      applyToCluster(idx, dayu.code, dayu.hex);

      const inp = document.querySelector(`#dayu-swatches input[data-cluster-idx="${idx}"]`);
      if (inp) inp.value = dayu.code;

      const wrap = inp ? inp.parentElement : null;
      if (wrap) wrap.firstChild.style.background = `#${dayu.hex}`;
    }

    msg(`Aplicado Dayu: ${idxToDayu.size} colores asignados sin repetir.`);
  }

  function normalizeCode(v) {
    return String(v || "").trim().toUpperCase();
  }

  function applyManualCode(clusterIdx, userValue) {
    const { map } = getDayu();
    const code = normalizeCode(userValue);
    if (!code) return;

    const dayu = map.get(code);
    if (!dayu) {
      msg(`Código Dayu inválido: "${code}".`);
      return;
    }

    // Prevent duplicates
    const inputs = $$("#dayu-swatches input[data-cluster-idx]");
    const usedBy = inputs.find(i => i.dataset.clusterIdx !== String(clusterIdx) && normalizeCode(i.value) === code);
    if (usedBy) {
      msg(`"${code}" ya está usado en el cluster ${usedBy.dataset.clusterIdx}. Elige otro.`);
      const self = inputs.find(i => i.dataset.clusterIdx === String(clusterIdx));
      if (self) self.value = self.value;
      return;
    }

    applyToCluster(clusterIdx, dayu.code, dayu.hex);

    const inp = document.querySelector(`#dayu-swatches input[data-cluster-idx="${clusterIdx}"]`);
    if (inp) inp.value = dayu.code;
    const wrap = inp ? inp.parentElement : null;
    if (wrap) wrap.firstChild.style.background = `#${dayu.hex}`;

    msg(`Cluster ${clusterIdx} -> ${dayu.code}`);
  }

  // ---------- Wire buttons (including your top "Mapear a DAYU") ----------
  function wireOnce() {
    ensureUi();
    const toggle = document.getElementById("dayu-toggle");
    const applyBtn = document.getElementById("dayu-apply");
    const resetBtn = document.getElementById("dayu-reset");
    if (toggle.dataset.wired === "1") return;
    toggle.dataset.wired = "1";

    toggle.addEventListener("change", () => {
      if (toggle.checked) applyDayuGreedyUnique();
      else {
        resetLabels();
        renderSwatches();
        msg("Reset: volví a 0..K-1.");
      }
    });

    applyBtn.addEventListener("click", () => {
      toggle.checked = true;
      applyDayuGreedyUnique();
    });

    resetBtn.addEventListener("click", () => {
      toggle.checked = false;
      resetLabels();
      renderSwatches();
      msg("Reset aplicado.");
    });

    // IMPORTANT: capture-click to neutralize old handler on the top button
    const topBtn = $$("button,a").find(el => /mapear\s*a\s*dayu/i.test((el.textContent || "").trim()));
    if (topBtn && !topBtn.dataset.dayuPatched) {
      topBtn.dataset.dayuPatched = "1";
      topBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Ensure swatches exist, then apply
        renderSwatches();
        toggle.checked = true;
        applyDayuGreedyUnique();
      }, true); // capture = true (mata el viejo)
    }
  }

  function hookProcess() {
    const btn = document.getElementById("btnProcess");
    if (!btn) return;

    btn.addEventListener("click", () => {
      // Wait for palette to be populated and SVG to exist
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        const palMap = buildIdxToRgbFromPaletteUI();
        const svg = getSvg();
        if (palMap.size || svg) {
          renderSwatches();
          clearInterval(t);
        }
        if (tries > 120) clearInterval(t);
      }, 200);
    }, true);
  }

  window.addEventListener("DOMContentLoaded", () => {
    wireOnce();
    hookProcess();

    // Keep swatches in sync when #palette or #svgContainer changes
    const pal = document.getElementById("palette");
    if (pal) new MutationObserver(() => renderSwatches()).observe(pal, { childList: true, subtree: true });

    const svgContainer = document.getElementById("svgContainer");
    if (svgContainer) new MutationObserver(() => renderSwatches()).observe(svgContainer, { childList: true, subtree: true });

    // First attempt
    renderSwatches();
  });
})();
