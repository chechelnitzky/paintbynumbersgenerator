/* dayu_kitmode_patch.js
   Requires: dayu_palette.js (window.DAYU_PALETTE) loaded BEFORE this file.
   Works with: the Paint-by-number generator DOM used in your index.html
*/

(function () {
  "use strict";

  // =========================
  // CONFIG
  // =========================

  // Activa/desactiva todo el comportamiento Dayu (restricción + renombrado)
  let KITMODE_ENABLED = true;

  // Default mínimo pintable (NO lo forzamos siempre: solo si el input está vacío)
  const DEFAULT_MIN_FACET = "20";

  // Si el resultado usa MENOS colores que los pedidos, intentamos forzar EXACTO K
  // recoloreando facets grandes (sin crear zonas nuevas pequeñas).
  const FORCE_EXACT_K_BY_RECOLORING_LARGE_FACETS = true;

  // Mínimo de "tamaño" (bbox) para recolorear un facet cuando falten colores
  // (esto NO afecta la generación, solo el plan B post-SVG)
  const MIN_BBOX_SIDE_FOR_RECOLOR = 20;

  // =========================
  // HELPERS
  // =========================

  const $ = (id) => document.getElementById(id);

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function sanitizeHex(hex) {
    if (!hex) return null;
    hex = String(hex).trim().replace(/^#/, "");
    if (hex === "0") return "000000";
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      // expand 3-digit
      return hex.split("").map((c) => c + c).join("").toLowerCase();
    }
    return null;
  }

  function hexToRgb(hex) {
    const h = sanitizeHex(hex);
    if (!h) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
  }

  function rgbKey(rgb) {
    return `${rgb[0]},${rgb[1]},${rgb[2]}`;
  }

  function dist2(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function parseRgbText(t) {
    // "RGB: 116,140,92"
    const m = (t || "").match(/RGB:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function getDesiredK() {
    const el = $("txtNrOfClusters");
    const k = el ? parseInt(el.value || "16", 10) : 16;
    return clamp(isFinite(k) ? k : 16, 1, 167);
  }

  function getDayuList() {
    const raw = Array.isArray(window.DAYU_PALETTE) ? window.DAYU_PALETTE : [];
    const out = [];

    for (const item of raw) {
      if (!item) continue;
      const code = String(item.code || "").trim();
      if (!code) continue;

      let rgb = item.rgb;
      if (!rgb || !Array.isArray(rgb) || rgb.length !== 3) {
        const fromHex = hexToRgb(item.hex);
        if (!fromHex) continue;
        rgb = fromHex;
      }

      const hex = sanitizeHex(item.hex) || sanitizeHex(rgbToHex(rgb));
      if (!hex) continue;

      out.push({ code, rgb: [rgb[0], rgb[1], rgb[2]], hex });
    }

    return out;
  }

  function rgbToHex(rgb) {
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `${to2(rgb[0])}${to2(rgb[1])}${to2(rgb[2])}`;
  }

  // =========================
  // 1) DEFAULTS (NO tocar tu 20 salvo si está vacío)
  // =========================

  function ensureDefaultMinFacetIfEmpty() {
    const removeSmall = $("txtRemoveFacetsSmallerThan");
    if (!removeSmall) return;

    // Solo setea 20 si está vacío o inválido
    const v = String(removeSmall.value || "").trim();
    if (!v || !isFinite(parseInt(v, 10))) {
      removeSmall.value = DEFAULT_MIN_FACET;
    }
  }

  // =========================
  // 2) RESTRICT CLUSTERING COLORS (Dayu 167)
  // =========================

  function buildDayuRestrictionText(dayuList) {
    // Formato requerido: "r,g,b" por línea
    // Agrego comentario con code+hex para que sea auditable
    const header = [
      "// DAYU_RESTRICTION_AUTOGEN",
      "// No edites aquí si usas Kit Mode; se regenera al procesar.",
      "// Formato: r,g,b   // CODE #HEX",
      ""
    ].join("\n");

    const lines = dayuList.map((d) => {
      return `${d.rgb[0]},${d.rgb[1]},${d.rgb[2]}   // ${d.code} #${d.hex}`;
    });

    return header + lines.join("\n") + "\n";
  }

  function applyDayuRestrictionsToTextarea() {
    if (!KITMODE_ENABLED) return false;

    const ta = $("txtKMeansColorRestrictions");
    if (!ta) return false;

    const dayu = getDayuList();
    if (!dayu.length) return false;

    const txt = buildDayuRestrictionText(dayu);

    // Si ya está puesto, no lo machaco
    const cur = String(ta.value || "");
    if (cur.includes("DAYU_RESTRICTION_AUTOGEN")) return true;

    ta.value = txt;
    return true;
  }

  // =========================
  // 3) RENAMING: índice (0..K-1) -> código Dayu (WG4, BG5, 45...)
  // =========================

  // En vez de intentar adivinar el "número grande" del swatch,
  // tomamos el ORDEN de aparición de los "RGB:" dentro de #palette:
  // eso corresponde a 0..K-1.
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

  function buildRgbToDayuCodeMap(dayuList) {
    const m = new Map();
    for (const d of dayuList) {
      m.set(rgbKey(d.rgb), d.code);
    }
    return m;
  }

  // Asignación robusta: si hay match exacto, lo usa.
  // Si por alguna razón hay duplicados o no match exacto, usa nearest UNUSED.
  function buildIdxToCode(idxToRgb) {
    const dayu = getDayuList();
    if (!dayu.length) return new Map();

    const rgbToCodeExact = buildRgbToDayuCodeMap(dayu);

    const usedCodes = new Set();
    const idxToCode = new Map();

    const idxs = Array.from(idxToRgb.keys()).sort((a, b) => Number(a) - Number(b));

    for (const idx of idxs) {
      const rgb = idxToRgb.get(idx);
      const exact = rgbToCodeExact.get(rgbKey(rgb));

      if (exact && !usedCodes.has(exact)) {
        idxToCode.set(idx, exact);
        usedCodes.add(exact);
        continue;
      }

      // fallback nearest unused
      let best = null;
      for (const d of dayu) {
        if (usedCodes.has(d.code)) continue;
        const d2 = dist2(rgb, d.rgb);
        if (!best || d2 < best.d2) best = { code: d.code, d2 };
      }
      if (best) {
        idxToCode.set(idx, best.code);
        usedCodes.add(best.code);
      }
    }

    return idxToCode;
  }

  function relabelSvgTextsNumericToDayu(idxToCode) {
    const svg = document.querySelector("#svgContainer svg");
    if (!svg) return false;

    const texts = svg.querySelectorAll("text");
    if (!texts.length) return false;

    let changed = false;

    texts.forEach((t) => {
      const v = (t.textContent || "").trim();
      if (/^\d+$/.test(v) && idxToCode.has(v)) {
        t.textContent = idxToCode.get(v);
        changed = true;
      }
    });

    return changed;
  }

  // Intenta también cambiar numeritos en el panel de palette (si existen)
  function relabelPaletteDigits(idxToCode) {
    const palette = $("palette");
    if (!palette) return false;

    let changed = false;
    const all = Array.from(palette.querySelectorAll("*"));

    for (const el of all) {
      const v = (el.textContent || "").trim();
      if (/^\d+$/.test(v) && idxToCode.has(v)) {
        el.textContent = idxToCode.get(v);
        changed = true;
      }
    }
    return changed;
  }

  // =========================
  // 4) FORZAR EXACTO K (Plan B post-SVG)
  // =========================
  // Si el resultado trae menos colores que K, recoloreamos facets GRANDES
  // (sin crear nuevas zonas pequeñas) y ponemos labels Dayu nuevos.

  function getDayuHexByCodeMap(dayuList) {
    const m = new Map();
    for (const d of dayuList) m.set(d.code, d.hex);
    return m;
  }

  function getCurrentCodesInSvg(svg) {
    const codes = new Set();
    svg.querySelectorAll("text").forEach((t) => {
      const v = (t.textContent || "").trim();
      if (v) codes.add(v);
    });
    return codes;
  }

  function findFacetShapeFromText(textEl) {
    // Intentamos encontrar una figura rellenable cerca del label:
    // típicamente el text está dentro de un <g> que también contiene un <path/polygon>
    const p = textEl.closest("g") || textEl.parentElement;
    if (!p) return null;

    const shapes = p.querySelectorAll("path,polygon,rect");
    for (const s of shapes) {
      const fill = (s.getAttribute("fill") || "").trim();
      // si fill vacío, igual puede estar en style
      const style = (s.getAttribute("style") || "");
      if (fill && fill !== "none") return s;
      if (/fill\s*:\s*[^;]+/i.test(style) && !/fill\s*:\s*none/i.test(style)) return s;
    }
    return null;
  }

  function getBBoxSafe(el) {
    try {
      return el.getBBox();
    } catch {
      return null;
    }
  }

  function setShapeFill(shapeEl, hex) {
    const color = `#${hex}`;
    shapeEl.setAttribute("fill", color);

    // también en style por compatibilidad
    const style = shapeEl.getAttribute("style") || "";
    if (/fill\s*:/i.test(style)) {
      const next = style.replace(/fill\s*:\s*[^;]+/i, `fill:${color}`);
      shapeEl.setAttribute("style", next);
    } else {
      shapeEl.setAttribute("style", `${style}${style && !style.trim().endsWith(";") ? ";" : ""}fill:${color};`);
    }
  }

  function forceExactKByRecoloringLargeFacets(desiredK) {
    if (!FORCE_EXACT_K_BY_RECOLORING_LARGE_FACETS) return false;

    const svg = document.querySelector("#svgContainer svg");
    if (!svg) return false;

    const dayu = getDayuList();
    if (!dayu.length) return false;

    const codeToHex = getDayuHexByCodeMap(dayu);

    const existing = Array.from(getCurrentCodesInSvg(svg));
    // Filtramos números puros (si todavía quedaran) y strings vacíos
    const existingCodes = existing.filter((x) => x && !/^\d+$/.test(x));

    const currentCount = new Set(existingCodes).size;
    if (currentCount >= desiredK) return true;

    const missing = desiredK - currentCount;

    const used = new Set(existingCodes);
    const unused = dayu.map(d => d.code).filter(code => !used.has(code));

    if (!unused.length) return false;

    // Candidatos: texts grandes (facet labels), con shape + bbox decente
    const candidates = [];
    svg.querySelectorAll("text").forEach((t) => {
      const shape = findFacetShapeFromText(t);
      if (!shape) return;

      const box = getBBoxSafe(shape) || getBBoxSafe(t.closest("g") || t);
      if (!box) return;

      const w = box.width || 0;
      const h = box.height || 0;

      if (w < MIN_BBOX_SIDE_FOR_RECOLOR || h < MIN_BBOX_SIDE_FOR_RECOLOR) return;

      candidates.push({
        textEl: t,
        shapeEl: shape,
        area: w * h
      });
    });

    // Orden: recoloreamos los facets MÁS GRANDES (pintables)
    candidates.sort((a, b) => b.area - a.area);

    let recolored = 0;
    let ci = 0;

    while (recolored < missing && ci < candidates.length && unused.length) {
      const c = candidates[ci++];
      const newCode = unused.shift();
      const hex = codeToHex.get(newCode);
      if (!hex) continue;

      // Cambia label + fill
      c.textEl.textContent = newCode;
      setShapeFill(c.shapeEl, hex);

      recolored++;
    }

    return recolored > 0;
  }

  // =========================
  // 5) ORCHESTRATION
  // =========================

  function applyAllOnce() {
    // 0) defaults
    ensureDefaultMinFacetIfEmpty();

    // 1) restricciones
    if (KITMODE_ENABLED) applyDayuRestrictionsToTextarea();

    // 2) si aún no hay svg/palette, salimos
    const svg = document.querySelector("#svgContainer svg");
    const palette = $("palette");
    if (!svg || !palette) return false;

    // 3) mapping idx->rgb y idx->code
    const idxToRgb = buildIdxToRgbFromPalette();
    if (!idxToRgb.size) return false;

    const idxToCode = buildIdxToCode(idxToRgb);
    if (!idxToCode.size) return false;

    // 4) renombrado
    relabelSvgTextsNumericToDayu(idxToCode);
    relabelPaletteDigits(idxToCode);

    // 5) forzar exacto K (plan B) sin crear zonas nuevas
    if (KITMODE_ENABLED && FORCE_EXACT_K_BY_RECOLORING_LARGE_FACETS) {
      const k = getDesiredK();
      forceExactKByRecoloringLargeFacets(k);
    }

    return true;
  }

  function installHooks() {
    const btn = $("btnProcess");
    if (btn) {
      // Captura antes que el handler original
      btn.addEventListener(
        "click",
        () => {
          // Asegura defaults y restricciones justo antes de procesar
          ensureDefaultMinFacetIfEmpty();
          if (KITMODE_ENABLED) applyDayuRestrictionsToTextarea();
        },
        true
      );
    }

    // Observa cambios en svg/palette y re-aplica
    const target = document.body;
    const obs = new MutationObserver(() => {
      // evita loops violentos: aplicamos solo cuando ya hay output
      applyAllOnce();
    });
    obs.observe(target, { childList: true, subtree: true, characterData: true });
  }

  function boot() {
    ensureDefaultMinFacetIfEmpty();
    installHooks();

    // Reintentos suaves al cargar (cuando la app todavía está dibujando)
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const ok = applyAllOnce();
      if (ok || tries > 120) clearInterval(timer); // ~30s
    }, 250);

    // (Opcional) shortcut para apagar/encender rápido desde consola:
    // window.DAYU_KITMODE(false)
    window.DAYU_KITMODE = (on) => {
      KITMODE_ENABLED = !!on;
      if (KITMODE_ENABLED) applyDayuRestrictionsToTextarea();
      applyAllOnce();
      return KITMODE_ENABLED;
    };
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
