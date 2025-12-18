// dayu_exact_colors_patch.js
// 1) Auto-rellena "Restrict clustering colors" con los 167 Dayu.
// 2) Fuerza mapeo 1:1 (SIN repetidos) entre N clusters y N colores Dayu.
// 3) Evita que el sistema termine usando menos colores por colapsos (ej CG9 repetido).

(() => {
  // Actívalo si quieres que NO se "pierdan" colores por limpiezas posteriores.
  // Si te molesta que salgan demasiados detalles, ponlo en false.
  const FORCE_KEEP_COLORS_AFTER = true;

  function dist2(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return dr*dr + dg*dg + db*db;
  }

  function toRgbObj(colorLike) {
    // Color class del proyecto suele tener toRGB() => {r,g,b}
    const c = (colorLike && typeof colorLike.toRGB === "function") ? colorLike.toRGB() : colorLike;
    const r = (c && (c.r ?? c[0])) ?? 0;
    const g = (c && (c.g ?? c[1])) ?? 0;
    const b = (c && (c.b ?? c[2])) ?? 0;
    return { r: Number(r), g: Number(g), b: Number(b) };
  }

  function buildGreedyUniqueMap(centroidsRGB, specifiedRGB) {
    const k = centroidsRGB.length;
    const m = specifiedRGB.length;

    const pairs = [];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < m; j++) {
        pairs.push({ i, j, d: dist2(centroidsRGB[i], specifiedRGB[j]) });
      }
    }
    pairs.sort((a,b) => a.d - b.d);

    const usedI = new Array(k).fill(false);
    const usedJ = new Array(m).fill(false);
    const map = new Array(k).fill(-1);

    for (const p of pairs) {
      if (usedI[p.i] || usedJ[p.j]) continue;
      usedI[p.i] = true;
      usedJ[p.j] = true;
      map[p.i] = p.j;
      if (map.every(x => x !== -1)) break;
    }

    // fallback (por si algo raro pasa)
    for (let i = 0; i < k; i++) {
      if (map[i] !== -1) continue;
      for (let j = 0; j < m; j++) {
        if (!usedJ[j]) { usedJ[j] = true; map[i] = j; break; }
      }
    }

    return map;
  }

  function autoFillRestrictionsTextarea() {
    const ta = document.getElementById("txtKMeansColorRestrictions");
    if (!ta || !window.DAYU_PALETTE || !window.DAYU_PALETTE.length) return;

    const lines = [
      "// DAYU palette (auto) - 167 colors",
      "// Formato: r,g,b (uno por línea)"
    ].concat(window.DAYU_PALETTE.map(p => p.rgb.join(",")));

    ta.value = lines.join("\n");

    // Materialize resize (si existe)
    try {
      if (window.M && window.M.textareaAutoResize) window.M.textareaAutoResize(ta);
    } catch (_) {}
  }

  function forceKeepColorsUIOverrides() {
    if (!FORCE_KEEP_COLORS_AFTER) return;

    // Para que NO se eliminen colores por limpiezas posteriores:
    // - Narrow pixel cleanup: 0
    // - Remove small facets smaller than: 1 (equivale a "no remover por tamaño")
    const btn = document.getElementById("btnProcess");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const narrow = document.getElementById("txtNarrowPixelStripCleanupRuns");
      const removeSmall = document.getElementById("txtRemoveFacetsSmallerThan");
      if (narrow) narrow.value = "0";
      if (removeSmall) removeSmall.value = "1";
    }, true);
  }

  function patchColorReducer() {
    if (!window.requirejs) return;

    requirejs(["ColorReducer"], (ColorReducerMod) => {
      const ColorReducer = ColorReducerMod?.ColorReducer || ColorReducerMod?.default || ColorReducerMod;
      const proto = ColorReducer?.prototype;
      if (!proto?.updateKmeansOutputImageData) return;

      const original = proto.updateKmeansOutputImageData;

      proto.updateKmeansOutputImageData = function (kmeansImageData, ctx, outputImgData, restrictToSpecifiedColors, specifiedColors) {
        try {
          if (restrictToSpecifiedColors && Array.isArray(specifiedColors) && specifiedColors.length) {
            const k = (kmeansImageData?.meanCentroids || []).length;
            if (k > 0 && specifiedColors.length >= k) {
              // 1) Construimos asignación 1:1 centroid -> specifiedColor (SIN repetidos)
              const centroidsRGB = kmeansImageData.meanCentroids.map(toRgbObj);
              const specifiedRGB = specifiedColors.map(toRgbObj);

              const centroidToSpecifiedIdx = buildGreedyUniqueMap(centroidsRGB, specifiedRGB);
              const uniqueSpecifiedColors = centroidToSpecifiedIdx.map(j => specifiedColors[j]);

              // 2) “Engañamos” al render: reemplazamos meanCentroids por los Dayu únicos
              //    y llamamos al original SIN aplicar el snap interno (restrict=false).
              const saved = kmeansImageData.meanCentroids;
              kmeansImageData.meanCentroids = uniqueSpecifiedColors;

              const res = original.call(this, kmeansImageData, ctx, outputImgData, false, null);

              kmeansImageData.meanCentroids = saved;
              return res;
            }
          }
        } catch (e) {
          console.warn("[DAYU PATCH] error:", e);
        }

        return original.call(this, kmeansImageData, ctx, outputImgData, restrictToSpecifiedColors, specifiedColors);
      };

      console.log("[DAYU PATCH] Unique 1:1 mapping enabled (exact N colors).");
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    autoFillRestrictionsTextarea();
    forceKeepColorsUIOverrides();
    patchColorReducer();
  });
})();
