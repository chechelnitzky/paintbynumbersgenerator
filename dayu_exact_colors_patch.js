// dayu_kitmode_patch.js
// MODO KIT: pintable + EXACTAMENTE N colores Dayu en el resultado final (aunque pierda fidelidad)

(() => {
  // ======= AJUSTES RÁPIDOS (puedes tunear) =======
  const KITMODE_ENABLED = true;

  // “Pintabilidad” (sube si sigues viendo micro-zonas)
  const MIN_FACET_BASE_16 = 320;     // min pixels para N=16 (recomendado 250–600)
  const MAX_FACETS_16 = 12000;       // límite de facets para N=16 (más bajo = más simple)
  const NARROW_CLEANUP_RUNS = 2;     // 0–3
  const BORDER_HALVE_TIMES = 3;      // 2–4
  const PROCESS_MAX_RES = 900;       // baja detalle global (ej 700–1200)

  // Cuando “faltan” colores, ¿cuántas regiones grandes recolorear para introducirlos?
  // (normalmente faltan 1-4 colores, esto basta)
  const MAX_INJECT_TRIES = 50;

  // ==============================================

  const DAYU_HEX = () => (window.DAYU_HEX || {});
  const ALL_CODES = () => new Set(Object.keys(DAYU_HEX()));

  function hexToRgb(hex) {
    const h = (hex || "").replace("#","").trim();
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function dist2(a,b){
    const dr=a.r-b.r, dg=a.g-b.g, db=a.b-b.b;
    return dr*dr+dg*dg+db*db;
  }
  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

  // 1) Auto-fill del textarea de restricciones con los 167 RGB Dayu
  function fillRestrictionsTextarea() {
    const ta = document.getElementById("txtKMeansColorRestrictions");
    if (!ta) return;
    if (!window.DAYU_PALETTE || !window.DAYU_PALETTE.length) return;

    const lines = [
      "// DAYU palette (auto) - 167 colors",
      "// Formato: r,g,b (uno por línea)"
    ].concat(window.DAYU_PALETTE.map(p => p.rgb.join(",")));

    ta.value = lines.join("\n");
    try { if (window.M?.textareaAutoResize) window.M.textareaAutoResize(ta); } catch(_) {}
  }

  // 2) Setea valores “pintables” automáticamente antes de procesar
  function hookPaintableDefaults() {
    const btn = document.getElementById("btnProcess");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!KITMODE_ENABLED) return;

      const n = parseInt(document.getElementById("txtNrOfClusters")?.value || "16", 10) || 16;

      const minFacet = clamp(Math.round(MIN_FACET_BASE_16 * (16 / n)), 120, 1200);
      const maxFacets = clamp(Math.round(MAX_FACETS_16 * (n / 16)), 6000, 40000);

      const narrow = document.getElementById("txtNarrowPixelStripCleanupRuns");
      const removeSmall = document.getElementById("txtRemoveFacetsSmallerThan");
      const maxF = document.getElementById("txtMaximumNumberOfFacets");
      const halve = document.getElementById("txtNrOfTimesToHalveBorderSegments");

      if (narrow) narrow.value = String(NARROW_CLEANUP_RUNS);
      if (removeSmall) removeSmall.value = String(minFacet);
      if (maxF) maxF.value = String(maxFacets);
      if (halve) halve.value = String(BORDER_HALVE_TIMES);

      // Baja detalle global (procesar a resolución menor = menos micro-zonas)
      const chkResize = document.getElementById("chkResizeImage");
      const rw = document.getElementById("txtResizeWidth");
      const rh = document.getElementById("txtResizeHeight");
      if (chkResize) chkResize.checked = true;
      if (rw) rw.value = String(PROCESS_MAX_RES);
      if (rh) rh.value = String(PROCESS_MAX_RES);
    }, true); // capture: corre antes del handler original
  }

  // Helpers SVG
  function getSvg() {
    const c = document.getElementById("svgContainer");
    if (!c) return null;
    return c.querySelector("svg");
  }

  function findShapeForText(t) {
    const p = t?.parentElement;
    if (!p) return null;

    // 1) dentro del mismo grupo
    let shape = p.querySelector("path,polygon,rect");
    if (shape) return shape;

    // 2) hermanos previos
    let s = t.previousElementSibling;
    while (s) {
      if (s.matches && s.matches("path,polygon,rect")) return s;
      s = s.previousElementSibling;
    }

    // 3) buscar hacia arriba un nivel
    const pp = p.parentElement;
    if (pp) {
      shape = pp.querySelector("path,polygon,rect");
      if (shape) return shape;
    }
    return null;
  }

  function getFacets(svg) {
    const codes = ALL_CODES();
    const facets = [];

    svg.querySelectorAll("text").forEach(t => {
      const code = (t.textContent || "").trim();
      if (!codes.has(code)) return;

      const shape = findShapeForText(t);
      if (!shape) return;

      let area = 0;
      try {
        const bb = (shape.getBBox ? shape.getBBox() : t.getBBox());
        area = Math.max(0, bb.width * bb.height);
      } catch(_) {}

      facets.push({ code, text: t, shape, area });
    });

    return facets;
  }

  function rebuildPaletteUI(codesInOrder) {
    const paletteDiv = document.getElementById("palette");
    if (!paletteDiv) return;

    paletteDiv.innerHTML = "";

    codesInOrder.forEach(code => {
      const hex = DAYU_HEX()[code];
      const sw = document.createElement("div");
      sw.style.display = "inline-flex";
      sw.style.alignItems = "center";
      sw.style.justifyContent = "center";
      sw.style.width = "44px";
      sw.style.height = "44px";
      sw.style.marginRight = "8px";
      sw.style.borderRadius = "6px";
      sw.style.border = "1px solid rgba(0,0,0,.2)";
      sw.style.background = hex || "#fff";
      sw.style.fontSize = "14px";
      sw.style.fontWeight = "700";
      sw.style.color = "#000";
      sw.textContent = code;
      paletteDiv.appendChild(sw);
    });
  }

  function setFacetToCode(facet, newCode) {
    const hex = DAYU_HEX()[newCode];
    if (!hex) return;

    facet.text.textContent = newCode;
    facet.shape.setAttribute("fill", hex);
  }

  // Selección de N códigos "principales" por área total (prioriza colores que realmente dominan la imagen)
  function pickTopCodesByArea(facets, desiredN) {
    const totals = new Map();
    facets.forEach(f => totals.set(f.code, (totals.get(f.code) || 0) + (f.area || 0)));
    const list = Array.from(totals.entries()).sort((a,b) => b[1]-a[1]).map(x => x[0]);
    return list.slice(0, desiredN);
  }

  // Si faltan colores, elige códigos Dayu "parecidos" a los ya usados (para que el cambio sea menos brutal)
  function pickClosestUnusedCodes(usedCodes, needed) {
    const all = Object.keys(DAYU_HEX());
    const usedSet = new Set(usedCodes);

    const usedRgbs = usedCodes
      .map(c => DAYU_HEX()[c])
      .filter(Boolean)
      .map(hexToRgb);

    const candidates = all.filter(c => !usedSet.has(c)).map(c => {
      const rgb = hexToRgb(DAYU_HEX()[c]);
      let best = Infinity;
      for (const u of usedRgbs) best = Math.min(best, dist2(rgb, u));
      return { c, score: best };
    });

    candidates.sort((a,b) => a.score - b.score);
    return candidates.slice(0, needed).map(x => x.c);
  }

  // ======= CORE: FORZAR EXACTAMENTE N CÓDIGOS EN EL SVG =======
  function enforceExactN() {
    const svg = getSvg();
    if (!svg) return;

    const desiredN = parseInt(document.getElementById("txtNrOfClusters")?.value || "16", 10) || 16;

    const facets = getFacets(svg);
    if (!facets.length) return;

    // Conteos por código (para no “matar” un código al recolorear su única región)
    const countByCode = new Map();
    facets.forEach(f => countByCode.set(f.code, (countByCode.get(f.code) || 0) + 1));

    // Códigos usados actualmente
    let usedCodes = Array.from(new Set(facets.map(f => f.code)));

    // Caso A: hay MÁS de N → colapsamos extras hacia los N top
    if (usedCodes.length > desiredN) {
      const keep = pickTopCodesByArea(facets, desiredN);
      const keepSet = new Set(keep);

      // Remap: cualquier código fuera de keep se cambia al “más cercano” dentro de keep (por color)
      const keepRgb = keep.map(c => ({ c, rgb: hexToRgb(DAYU_HEX()[c]) }));

      facets.forEach(f => {
        if (keepSet.has(f.code)) return;

        const srcHex = DAYU_HEX()[f.code];
        const srcRgb = srcHex ? hexToRgb(srcHex) : null;

        let best = keep[0];
        let bestD = Infinity;

        if (srcRgb) {
          for (const k of keepRgb) {
            const d = dist2(srcRgb, k.rgb);
            if (d < bestD) { bestD = d; best = k.c; }
          }
        }

        setFacetToCode(f, best);
      });

      rebuildPaletteUI(keep);
      return;
    }

    // Caso B: hay MENOS de N → inyectamos colores faltantes recoloreando REGIONES GRANDES
    if (usedCodes.length < desiredN) {
      const missingCount = desiredN - usedCodes.length;
      const addCodes = pickClosestUnusedCodes(usedCodes, missingCount);

      // Ordenamos facets por área (grandes primero)
      const byArea = facets.slice().sort((a,b) => (b.area||0) - (a.area||0));

      // Vamos recoloreando facets grandes cuyo código tenga más de 1 aparición (para no perder variedad)
      let injected = 0;
      let tries = 0;

      const remainingCount = new Map(countByCode);

      while (injected < addCodes.length && tries < MAX_INJECT_TRIES) {
        tries++;

        // Busca un “donor facet” grande que no sea la última de su código
        const donor = byArea.find(f => (remainingCount.get(f.code) || 0) > 1);
        if (!donor) break;

        const newCode = addCodes[injected];
        setFacetToCode(donor, newCode);

        // Actualiza conteos locales
        remainingCount.set(donor.code, (remainingCount.get(donor.code) || 1) - 1);
        remainingCount.set(newCode, (remainingCount.get(newCode) || 0) + 1);

        injected++;
      }

      // Recalcular usados y reconstruir paleta EXACTA N:
      const facets2 = getFacets(svg);
      const finalUsed = Array.from(new Set(facets2.map(f => f.code)));

      // Si todavía falta (caso extremo), completamos paleta igual (pero normalmente ya queda exacta)
      const finalSet = new Set(finalUsed);
      const stillMissing = desiredN - finalUsed.length;
      if (stillMissing > 0) {
        const more = pickClosestUnusedCodes(finalUsed, stillMissing);
        more.forEach(c => finalUsed.push(c));
      }

      // Orden: primero los dominantes, luego inyectados
      const top = pickTopCodesByArea(facets2, Math.min(desiredN, finalUsed.length));
      const topSet = new Set(top);
      const rest = finalUsed.filter(c => !topSet.has(c));
      const ordered = top.concat(rest).slice(0, desiredN);

      rebuildPaletteUI(ordered);
      return;
    }

    // Caso C: ya son EXACTAMENTE N → solo reconstruimos paleta limpia
    const ordered = pickTopCodesByArea(facets, desiredN);
    rebuildPaletteUI(ordered);
  }

  // Observa cuando se genera el SVG y aplica el “KIT mode” automáticamente
  function observeSvgGeneration() {
    const container = document.getElementById("svgContainer");
    if (!container) return;

    let t = null;
    const debounced = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        enforceExactN();
      }, 150);
    };

    const obs = new MutationObserver(debounced);
    obs.observe(container, { childList: true, subtree: true });
  }

  // Init
  window.addEventListener("DOMContentLoaded", () => {
    fillRestrictionsTextarea();
    hookPaintableDefaults();
    observeSvgGeneration();
    console.log("[DAYU KIT MODE] ready");
  });
})();
