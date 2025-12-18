/* dayu_kitmode_patch.js
   POST-MAP MODE:
   - No restringe k-means.
   - Genera normal con colores libres.
   - Luego mapea cada cluster (0..K-1) al color DAYU más cercano
     SIN REPETIR códigos (si está ocupado -> 2do, 3ro...).
   Requiere: dayu_palette.js (window.DAYU_PALETTE) cargado antes.
*/

(function () {
  "use strict";

  // =========================
  // HELPERS
  // =========================
  const $ = (id) => document.getElementById(id);

  function dist2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function sanitizeHex(hex) {
    if (!hex) return null;
    hex = String(hex).trim().replace(/^#/, "");
    if (hex === "0") return "000000";
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(hex)) return hex.split("").map((c) => c + c).join("").toLowerCase();
    return null;
  }

  function hexToRgb(hex) {
    const h = sanitizeHex(hex);
    if (!h) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbKey(rgb) {
    return `${rgb[0]},${rgb[1]},${rgb[2]}`;
  }

  function parseRgbText(t) {
    const m = (t || "").match(/RGB:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function getDesiredK() {
    const el = $("txtNrOfClusters");
    const k = el ? parseInt(el.value || "16", 10) : 16;
    return Number.isFinite(k) && k > 0 ? k : 16;
  }

  function getDayuList() {
    const raw = Array.isArray(window.DAYU_PALETTE) ? window.DAYU_PALETTE : [];
    const out = [];

    for (const item of raw) {
      if (!item) continue;
      const code = String(item.code || "").trim();
      if (!code) continue;

      // prefer rgb, fallback a hex
      let rgb = item.rgb;
      if (!rgb || !Array.isArray(rgb) || rgb.length !== 3) {
        const fromHex = hexToRgb(item.hex);
        if (!fromHex) continue;
        rgb = fromHex;
      }
      const hex = sanitizeHex(item.hex) || null;
      out.push({ code, rgb: [rgb[0], rgb[1], rgb[2]], hex });
    }
    return out;
  }

  // =========================
  // 1) Leer paleta final (K clusters) desde #palette
  //    La forma más robusta: tomar los textos "RGB: r,g,b" en orden,
  //    y asignarlos a índices 0..K-1 por aparición.
  // =========================
  function buildIdxToRgbFromPalette() {
    const palette = $("palette");
    if (!palette) return new Map();

    const rgbEls = Array.from(palette.querySelectorAll("*"))
      .filter(el => /RGB:\s*\d+\s*,\s*\d+\s*,\s*\d+/i.test((el.textContent || "").trim()));

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
  // 2) Asignación 1:1 SIN REPETIR:
  //    Para cada idx (cluster), crea ranking de DAYU por distancia.
  //    Luego asigna greedily global por el menor costo disponible.
  //
  //    Esto evita duplicados: si el mejor ya está usado,
  //    toma el siguiente.
  // =========================
  function buildUniqueIdxToDayu(idxToRgb, dayuList) {
    const idxs = Array.from(idxToRgb.keys()).sort((a, b) => Number(a) - Number(b));
    const dayu = dayuList;

    // matriz de pares (i,j,dist) para greedy global
    const pairs = [];
    for (let i = 0; i < idxs.length; i++) {
      const rgb = idxToRgb.get(idxs[i]);
      for (let j = 0; j < dayu.length; j++) {
        pairs.push({ i, j, d: dist2(rgb, dayu[j].rgb) });
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

      const idxLabel = idxs[p.i];      // "0","1","2"...
      const code = dayu[p.j].code;     // "64","WG3","BG5"...
      const hex = sanitizeHex(dayu[p.j].hex) || null; // puede ser null si no lo guardaste

      idxToDayu.set(idxLabel, { code, hex, rgb: dayu[p.j].rgb });

      if (idxToDayu.size === idxs.length) break;
    }

    return idxToDayu;
  }

  // =========================
  // 3) Aplicar a SVG:
  //    - Cambiar textos 0..K-1 -> DAYU code
  //    - Cambiar fill de la zona al color DAYU (hex o rgb)
  // =========================
  function findFacetShapeFromText(textEl) {
    const g = textEl.closest("g") || textEl.parentElement;
    if (!g) return null;
    // Buscamos una forma con fill
    const shapes = g.querySelectorAll("path,polygon,rect");
    for (const s of shapes) {
      const fill = (s.getAttribute("fill") || "").trim();
      const style = (s.getAttribute("style") || "");
      if (fill && fill !== "none") return s;
      if (/fill\s*:\s*[^;]+/i.test(style) && !/fill\s*:\s*none/i.test(style)) return s;
    }
    return null;
  }

  function setShapeFill(shapeEl, dayuHex, dayuRgb) {
    const color = dayuHex ? `#${dayuHex}` : `rgb(${dayuRgb[0]},${dayuRgb[1]},${dayuRgb[2]})`;
    shapeEl.setAttribute("fill", color);

    const style = shapeEl.getAttribute("style") || "";
    if (/fill\s*:/i.test(style)) {
      shapeEl.setAttribute("style", style.replace(/fill\s*:\s*[^;]+/i, `fill:${color}`));
    } else {
      shapeEl.setAttribute("style", `${style}${style && !style.trim().endsWith(";") ? ";" : ""}fill:${color};`);
    }
  }

  function relabelAndRecolorSvg(idxToDayu) {
    const svg = document.querySelector("#svgContainer svg");
    if (!svg) return false;

    let changed = false;
    const texts = svg.querySelectorAll("text");

    texts.forEach((t) => {
      const v = (t.textContent || "").trim();
      if (!/^\d+$/.test(v)) return;
      const map = idxToDayu.get(v);
      if (!map) return;

      // text
      t.textContent = map.code;
      changed = true;

      // fill
      const shape = findFacetShapeFromText(t);
      if (shape) setShapeFill(shape, map.hex, map.rgb);
    });

    return changed;
  }

  // =========================
  // 4) Actualizar la paleta visual (opcional):
  //    - si el UI muestra cuadritos con background-color, intentamos
  //      reemplazarlos por los dayu colors.
  //    - Esto es “best effort” porque el HTML exacto depende del repo.
  // =========================
  function recolorPaletteSwatches(idxToDayu) {
    const palette = $("palette");
    if (!palette) return false;

    const swatches = Array.from(palette.querySelectorAll("*")).filter(el => {
      const cls = (el.className || "").toString();
      return /swatch|color|palette/i.test(cls) || el.tagName === "DIV";
    });

    // Best-effort: buscar los elementos que contienen el número idx
    // y pintar su bloque cercano.
    let changed = false;

    // Busca textos "0".."K-1" dentro del palette
    const idxNodes = Array.from(palette.querySelectorAll("*"))
      .filter(el => /^\d+$/.test((el.textContent || "").trim()));

    for (const n of idxNodes) {
      const idx = (n.textContent || "").trim();
      const map = idxToDayu.get(idx);
      if (!map) continue;

      // intenta pintar el contenedor
      const container = n.closest("div") || n.parentElement;
      if (!container) continue;

      const color = map.hex ? `#${map.hex}` : `rgb(${map.rgb[0]},${map.rgb[1]},${map.rgb[2]})`;
      container.style.background = color;
      container.style.backgroundColor = color;

      changed = true;
    }

    return changed;
  }

  // =========================
  // 5) Orquestación
  // =========================
  function applyPostMap() {
    const dayu = getDayuList();
    if (!dayu.length) return false;

    const idxToRgb = buildIdxToRgbFromPalette();
    if (!idxToRgb.size) return false;

    // Asegurar que idxToRgb tenga tamaño K esperado (a veces el UI no pinta todos)
    // Si el UI trae menos, igual mapeamos lo que exista.
    const desiredK = getDesiredK();

    // Mapeo 1:1 sin repetir
    const idxToDayu = buildUniqueIdxToDayu(idxToRgb, dayu);

    // Aplicar a SVG + paleta
    const ok1 = relabelAndRecolorSvg(idxToDayu);
    recolorPaletteSwatches(idxToDayu);

    // Nota: si deseas “sí o sí K”, eso depende de cómo k-means encontró clusters.
    // Aquí NO alteramos k-means (como pediste), solo reemplazamos colores elegidos.
    return ok1 || idxToDayu.size > 0;
  }

  function debounce(fn, wait) {
    let t = null;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  function installObservers() {
    const runDebounced = debounce(applyPostMap, 150);

    const palette = $("palette");
    const svgContainer = $("svgContainer");

    // Observa solo salida (NO body para no romper inputs)
    if (palette) {
      new MutationObserver(runDebounced).observe(palette, { childList: true, subtree: true });
    }
    if (svgContainer) {
      new MutationObserver(runDebounced).observe(svgContainer, { childList: true, subtree: true });
    }

    // Post-run cuando aprietas Process
    const btn = $("btnProcess");
    if (btn) {
      btn.addEventListener("click", () => {
        // reintenta unos ticks después de que termine de renderizar
        let tries = 0;
        const timer = setInterval(() => {
          tries++;
          const ok = applyPostMap();
          if (ok || tries > 80) clearInterval(timer); // ~20s
        }, 250);
      }, true);
    }
  }

  function boot() {
    installObservers();

    // Primer intento (por si ya hay algo cargado)
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const ok = applyPostMap();
      if (ok || tries > 40) clearInterval(timer);
    }, 250);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
