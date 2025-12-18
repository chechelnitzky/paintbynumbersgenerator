/* dayu_ui_patch.js
   Modo “opt-in”:
   - El generador base crea clusters 0..K-1 como siempre.
   - Debajo de la paleta aparece:
     [ ] Usar paleta Dayu
     (Aplicar) (Reset)
   - Al activar: asigna Dayu a cada cluster sin repetir códigos.
   - Cada swatch se vuelve editable: escribir "63" o "WG3" y ENTER -> actualiza imagen.
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // =========================
  // DAYU helpers
  // =========================
  function sanitizeHex(hex) {
    if (!hex) return null;
    hex = String(hex).trim().replace(/^#/, "");
    if (hex === "0") return "000000";
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(hex)) return hex.split("").map(c => c + c).join("").toLowerCase();
    return null;
  }

  function hexToRgb(hex) {
    const h = sanitizeHex(hex);
    if (!h) return null;
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function dist2(a, b) {
    const dr = a[0]-b[0], dg = a[1]-b[1], db = a[2]-b[2];
    return dr*dr + dg*dg + db*db;
  }

  function getDayuMap() {
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

      const obj = { code, hex, rgb };
      map.set(code.toUpperCase(), obj);
      list.push(obj);
    }
    return { map, list };
  }

  // =========================
  // Leer paleta base (clusters)
  // =========================
  function parseRgbText(t) {
    const m = (t || "").match(/RGB:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  // Toma los RGB de la paleta que el app ya muestra (los cuadritos 0..K-1).
  // Regla: dentro de #palette aparecen textos "RGB: r,g,b". Los tomamos en orden como 0..K-1
  function readClusterPaletteRgb() {
    const paletteEl = document.getElementById("palette");
    if (!paletteEl) return null;

    const rgbEls = $$("#palette *", paletteEl)
      .filter(el => /RGB:\s*\d+\s*,\s*\d+\s*,\s*\d+/i.test((el.textContent || "").trim()));

    if (!rgbEls.length) return null;

    const idxToRgb = new Map();
    let idx = 0;
    for (const el of rgbEls) {
      const rgb = parseRgbText((el.textContent || "").trim());
      if (!rgb) continue;
      idxToRgb.set(String(idx), rgb);
      idx++;
    }
    return idxToRgb;
  }

  // =========================
  // UI: switch + botones + inputs
  // =========================
  function ensureUi() {
    const paletteEl = document.getElementById("palette");
    if (!paletteEl) return null;

    let ui = document.getElementById("dayu-ui");
    if (ui) return ui;

    ui = document.createElement("div");
    ui.id = "dayu-ui";
    ui.style.marginTop = "12px";
    ui.style.padding = "12px";
    ui.style.border = "1px solid rgba(0,0,0,.12)";
    ui.style.borderRadius = "12px";
    ui.style.display = "flex";
    ui.style.alignItems = "center";
    ui.style.gap = "12px";
    ui.style.flexWrap = "wrap";

    ui.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="dayu-toggle" />
        <span><b>Usar paleta Dayu</b> (opcional)</span>
      </label>

      <button id="dayu-apply" class="btn waves-effect waves-light" type="button">Aplicar Dayu</button>
      <button id="dayu-reset" class="btn waves-effect waves-light" type="button">Reset (volver a 0..K-1)</button>

      <span id="dayu-msg" style="opacity:.75;"></span>
      <div style="flex-basis:100%;height:0;"></div>
      <span style="opacity:.8;font-size:13px;">
        Tip: puedes editar cualquier cajita: escribe <b>63</b> o <b>WG3</b> y presiona <b>Enter</b>.
      </span>
    `;

    // Insertar justo debajo del bloque de paleta
    paletteEl.parentElement.appendChild(ui);

    return ui;
  }

  // Convierte las “cajitas” visuales en inputs editables (overlay)
  // No sabemos la estructura exacta del repo, así que usamos una estrategia robusta:
  // buscamos dentro de #palette cualquier elemento con texto EXACTO "0","1","2"..., y le agregamos un input encima.
  function makeSwatchesEditable() {
    const paletteEl = document.getElementById("palette");
    if (!paletteEl) return false;

    // Detecta nodos que tengan solo números (índices)
    const numNodes = $$("#palette *", paletteEl)
      .filter(el => /^\d+$/.test((el.textContent || "").trim()));

    if (!numNodes.length) return false;

    for (const node of numNodes) {
      const idx = (node.textContent || "").trim();

      // evita duplicar
      if (node.dataset.dayuEditable === "1") continue;
      node.dataset.dayuEditable = "1";

      // contenedor visual
      const box = node.closest("div") || node.parentElement;
      if (!box) continue;

      box.style.position = box.style.position || "relative";

      // crea input overlay
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = idx; // por defecto muestra el índice (0..K-1)
      inp.dataset.clusterIdx = idx;

      inp.style.position = "absolute";
      inp.style.left = "0";
      inp.style.top = "0";
      inp.style.width = "100%";
      inp.style.height = "100%";
      inp.style.border = "0";
      inp.style.outline = "0";
      inp.style.background = "transparent";
      inp.style.textAlign = "center";
      inp.style.fontWeight = "700";
      inp.style.color = "inherit";
      inp.style.cursor = "text";

      // Oculta el texto original y pone input
      node.style.opacity = "0";
      box.appendChild(inp);

      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyManualCodeToCluster(idx, inp.value);
          inp.blur();
        }
      });
    }

    return true;
  }

  // =========================
  // Aplicar cambios al SVG
  // =========================
  function getSvg() {
    return document.querySelector("#svgContainer svg");
  }

  // Encuentra la forma del facet asociada a un <text> (en el mismo <g>)
  function findFacetShapeFromText(textEl) {
    const g = textEl.closest("g") || textEl.parentElement;
    if (!g) return null;
    const shapes = g.querySelectorAll("path,polygon,rect");
    for (const s of shapes) {
      const fill = (s.getAttribute("fill") || "").trim();
      const style = s.getAttribute("style") || "";
      if (fill && fill !== "none") return s;
      if (/fill\s*:\s*[^;]+/i.test(style) && !/fill\s*:\s*none/i.test(style)) return s;
    }
    return null;
  }

  function setShapeFill(shapeEl, hex) {
    const color = `#${sanitizeHex(hex)}`;
    shapeEl.setAttribute("fill", color);
    const style = shapeEl.getAttribute("style") || "";
    if (/fill\s*:/i.test(style)) {
      shapeEl.setAttribute("style", style.replace(/fill\s*:\s*[^;]+/i, `fill:${color}`));
    } else {
      shapeEl.setAttribute("style", `${style}${style && !style.trim().endsWith(";") ? ";" : ""}fill:${color};`);
    }
  }

  // Aplica DAYU code+color a TODOS los facets cuyo label original era idx
  function applyDayuToCluster(idx, dayuCode, dayuHex) {
    const svg = getSvg();
    if (!svg) return false;

    let changed = false;

    // Importante:
    // El label original es "idx" (0..K-1).
    // Pero si ya aplicaste Dayu antes, los textos ya no serán idx.
    // Solución: guardamos el idx original en data-attr la primera vez que tocamos un <text>.
    const texts = svg.querySelectorAll("text");

    texts.forEach(t => {
      const raw = (t.textContent || "").trim();
      const original = t.getAttribute("data-cluster-idx") || null;

      // Si no tiene data-cluster-idx todavía, y raw es numérico, lo seteamos.
      if (!original && /^\d+$/.test(raw)) {
        t.setAttribute("data-cluster-idx", raw);
      }

      const clusterIdx = t.getAttribute("data-cluster-idx");
      if (clusterIdx !== String(idx)) return;

      // Cambiar texto a dayuCode
      t.textContent = dayuCode;
      changed = true;

      // Cambiar fill del facet
      const shape = findFacetShapeFromText(t);
      if (shape) setShapeFill(shape, dayuHex);
    });

    return changed;
  }

  // Volver a labels originales (0..K-1) y NO cambiar colores (solo texto).
  // Nota: volver colores exactos base requeriría guardar los fills originales por facet.
  // Para “Reset” práctico: volvemos etiquetas a idx y NO tocamos fill.
  function resetLabelsToOriginal() {
    const svg = getSvg();
    if (!svg) return false;

    let changed = false;
    const texts = svg.querySelectorAll("text");

    texts.forEach(t => {
      const clusterIdx = t.getAttribute("data-cluster-idx");
      if (!clusterIdx) return;
      t.textContent = clusterIdx;
      changed = true;
    });

    return changed;
  }

  // =========================
  // Asignación automática (sin repetir)
  // =========================
  function assignDayuToAllClusters() {
    const { list: dayuList } = getDayuMap();
    if (!dayuList.length) {
      msg("No se encontró window.DAYU_PALETTE válido.");
      return;
    }

    const idxToRgb = readClusterPaletteRgb();
    if (!idxToRgb || !idxToRgb.size) {
      msg("Aún no hay paleta generada. Primero presiona Process image.");
      return;
    }

    const idxs = Array.from(idxToRgb.keys()).sort((a,b) => Number(a)-Number(b));
    const pairs = [];

    for (let i = 0; i < idxs.length; i++) {
      const rgb = idxToRgb.get(idxs[i]);
      for (let j = 0; j < dayuList.length; j++) {
        pairs.push({ i, j, d: dist2(rgb, dayuList[j].rgb) });
      }
    }
    pairs.sort((a,b) => a.d - b.d);

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

    // Aplicar al SVG y actualizar inputs
    for (const [idx, dayu] of idxToDayu.entries()) {
      applyDayuToCluster(idx, dayu.code, dayu.hex);

      // si existe input overlay para ese idx, actualizar su texto
      const inp = document.querySelector(`#palette input[data-cluster-idx="${idx}"]`);
      if (inp) inp.value = dayu.code;
    }

    msg(`Dayu aplicado: ${idxToDayu.size} clusters asignados sin repetir.`);
  }

  // =========================
  // Manual override
  // =========================
  function normalizeCode(v) {
    return String(v || "").trim().toUpperCase();
  }

  function applyManualCodeToCluster(idx, userValue) {
    const { map } = getDayuMap();
    const code = normalizeCode(userValue);

    if (!code) return;

    const dayu = map.get(code);
    if (!dayu) {
      msg(`Código Dayu inválido: "${code}".`);
      return;
    }

    // Evitar duplicados manuales (opcional): si ya está usado en otro cluster, avisar
    // (puedes permitirlo, pero tú pediste 1 nombre por color)
    const otherInputs = Array.from(document.querySelectorAll(`#palette input[data-cluster-idx]`));
    const usedBy = otherInputs.find(i => i.dataset.clusterIdx !== String(idx) && normalizeCode(i.value) === code);
    if (usedBy) {
      msg(`"${code}" ya está usado en el cluster ${usedBy.dataset.clusterIdx}. Elige otro.`);
      return;
    }

    applyDayuToCluster(idx, dayu.code, dayu.hex);
    msg(`Cluster ${idx} -> ${dayu.code}`);
  }

  function msg(t) {
    const el = document.getElementById("dayu-msg");
    if (el) el.textContent = t || "";
  }

  // =========================
  // Wiring
  // =========================
  function wireUi() {
    const ui = ensureUi();
    if (!ui) return;

    const toggle = document.getElementById("dayu-toggle");
    const applyBtn = document.getElementById("dayu-apply");
    const resetBtn = document.getElementById("dayu-reset");

    // Toggle: si lo prendes, aplica; si lo apagas, reset labels
    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        assignDayuToAllClusters();
      } else {
        resetLabelsToOriginal();
        msg("Reset: etiquetas originales restauradas (0..K-1).");
      }
    });

    applyBtn.addEventListener("click", () => {
      toggle.checked = true;
      assignDayuToAllClusters();
    });

    resetBtn.addEventListener("click", () => {
      toggle.checked = false;
      resetLabelsToOriginal();
      // volver inputs a idx
      const inputs = Array.from(document.querySelectorAll(`#palette input[data-cluster-idx]`));
      for (const inp of inputs) inp.value = inp.dataset.clusterIdx;
      msg("Reset aplicado.");
    });
  }

  function observeOutput() {
    const paletteEl = document.getElementById("palette");
    const svgContainer = document.getElementById("svgContainer");
    if (!paletteEl || !svgContainer) return;

    const ensureEditable = () => {
      makeSwatchesEditable();
      wireUi();
    };

    // Cuando cambia la paleta o el svg (después de Process), re-creamos inputs y UI si faltan
    new MutationObserver(() => ensureEditable()).observe(paletteEl, { childList: true, subtree: true });
    new MutationObserver(() => ensureEditable()).observe(svgContainer, { childList: true, subtree: true });

    // Intento inicial
    ensureEditable();
  }

  window.addEventListener("DOMContentLoaded", () => {
    observeOutput();

    // También enganchar al botón Process para asegurar que tras generar, quede listo
    const btn = document.getElementById("btnProcess");
    if (btn) {
      btn.addEventListener("click", () => {
        // esperar un poco a que termine render y luego activar editable/UI
        let tries = 0;
        const timer = setInterval(() => {
          tries++;
          makeSwatchesEditable();
          wireUi();
          if (getSvg() || tries > 60) clearInterval(timer);
        }, 250);
      }, true);
    }
  });
})();
