/* dayu_kitmode_patch.js (FIXED: no touch min facet; observer only svg/palette)
   Requires: dayu_palette.js (window.DAYU_PALETTE) loaded BEFORE this file.
*/

(function () {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  let KITMODE_ENABLED = true;

  // Si el resultado usa MENOS colores que los pedidos, recolorea facets GRANDES
  // para llegar a K sin crear micro-zonas nuevas.
  const FORCE_EXACT_K_BY_RECOLORING_LARGE_FACETS = true;

  // Solo recoloreamos facets con bbox >= a esto (NO afecta el pruning)
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
    if (/^[0-9a-fA-F]{3}$/.test(hex)) return hex.split("").map((c) => c + c).join("").toLowerCase();
    return null;
  }

  function rgbToHex(rgb) {
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `${to2(rgb[0])}${to2(rgb[1])}${to2(rgb[2])}`;
  }

  function hexToRgb(hex) {
    const h = sanitizeHex(hex);
    if (!h) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbKey(rgb) {
    return `${rgb[0]},${rgb[1]},${rgb[2]}`;
  }

  function dist2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function parseRgbText(t) {
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

  // =========================
  // 1) Restrict clustering colors (Dayu 167) -> textarea
  // =========================
  function buildDayuRestrictionText(dayuList) {
    const header = [
      "// DAYU_RESTRICTION_AUTOGEN",
      "// Formato: r,g,b   // CODE #HEX",
      ""
    ].join("\n");

    const lines = dayuList.map((d) => `${d.rgb[0]},${d.rgb[1]},${d.rgb[2]}   // ${d.code} #${d.hex}`);
    return header + lines.join("\n") + "\n";
  }

  function applyDayuRestrictionsToTextarea() {
    if (!KITMODE_ENABLED) return false;

    const ta = $("txtKMeansColorRestrictions");
    if (!ta) return false;

    const dayu = getDayuList();
    if (!dayu.length) return false;

    const cur = String(ta.value || "");
    if (cur.includes("DAYU_RESTRICTION_AUTOGEN")) return true;

    ta.value = buildDayuRestrictionText(dayu);
    return true;
  }

  // =========================
  // 2) Build idx(0..K-1)->RGB from #palette by order of "RGB:" lines
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

  function buildIdxToCode(idxToRgb) {
    const dayu = getDayuList();
    if (!dayu.length) return new Map();

    const exact = new Map(dayu.map(d => [rgbKey(d.rgb), d.code]));
    const used = new Set();
    const idxToCode = new Map();

    const idxs = Array.from(idxToRgb.keys()).sort((a, b) => Number(a) - Number(b));
    for (const idx of idxs) {
      const rgb = idxToRgb.get(idx);
      const e = exact.get(rgbKey(rgb));

      if (e && !used.has(e)) {
        idxToCode.set(idx, e);
        used.add(e);
        continue;
      }

      // fallback nearest unused
      let best = null;
      for (const d of dayu) {
        if (used.has(d.code)) continue;
        const d2 = dist2(rgb, d.rgb);
        if (!best || d2 < best.d2) best = { code: d.code, d2 };
      }
      if (best) {
        idxToCode.set(idx, best.code);
        used.add(best.code);
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

  // =========================
  // 3) Force EXACT K by recoloring LARGE facets (plan B)
  // =========================
  function getDayuHexByCodeMap(dayuList) {
    const m = new Map();
    for (const d of dayuList) m.set(d.code, d.hex);
    return m;
  }

  function getBBoxSafe(el) {
    try { return el.getBBox(); } catch { return null; }
  }

  function findFacetShapeFromText(textEl) {
    const g = textEl.closest("g") || textEl.parentElement;
    if (!g) return null;
    const shapes = g.querySelectorAll("path,polygon,rect");
    for (const s of shapes) {
      const fill = (s.getAttribute("fill") || "").trim();
      const style = (s.getAttribute("style") || "");
      if (fill && fill !== "none") return s;
      if (/fill\s*:\s*[^;]+/i.test(style) && !/fill\s*:\s*none/i.test(style)) return s;
    }
    return null;
  }

  function setShapeFill(shapeEl, hex) {
    const color = `#${hex}`;
    shapeEl.setAttribute("fill", color);
    const style = shapeEl.getAttribute("style") || "";
    if (/fill\s*:/i.test(style)) {
      shapeEl.setAttribute("style", style.replace(/fill\s*:\s*[^;]+/i, `fill:${color}`));
    } else {
      shapeEl.setAttribute(
        "style",
        `${style}${style && !style.trim().endsWith(";") ? ";" : ""}fill:${color};`
      );
    }
  }

  function getCurrentCodesInSvg(svg) {
    const codes = new Set();
    svg.querySelectorAll("text").forEach((t) => {
      const v = (t.textContent || "").trim();
      if (v) codes.add(v);
    });
    return codes;
  }

  function forceExactKByRecoloringLargeFacets(desiredK) {
    if (!FORCE_EXACT_K_BY_RECOLORING_LARGE_FACETS) return false;

    const svg = document.querySelector("#svgContainer svg");
    if (!svg) return false;

    const dayu = getDayuList();
    if (!dayu.length) return false;

    const codeToHex = getDayuHexByCodeMap(dayu);

    const existing = Array.from(getCurrentCodesInSvg(svg)).filter(x => x && !/^\d+$/.test(x));
    const used = new Set(existing);

    const currentCount = used.size;
    if (currentCount >= desiredK) return true;

    const missing = desiredK - currentCount;
    const unused = dayu.map(d => d.code).filter(code => !used.has(code));
    if (!unused.length) return false;

    // candidates: facets grandes
    const candidates = [];
    svg.querySelectorAll("text").forEach((t) => {
      const shape = findFacetShapeFromText(t);
      if (!shape) return;

      const box = getBBoxSafe(shape) || getBBoxSafe(t.closest("g") || t);
      if (!box) return;

      if (box.width < MIN_BBOX_SIDE_FOR_RECOLOR || box.height < MIN_BBOX_SIDE_FOR_RECOLOR) return;

      candidates.push({ textEl: t, shapeEl: shape, area: box.width * box.height });
    });

    candidates.sort((a, b) => b.area - a.area);

    let recolored = 0;
    let i = 0;

    while (recolored < missing && i < candidates.length && unused.length) {
      const c = candidates[i++];
      const newCode = unused.shift();
      const hex = codeToHex.get(newCode);
      if (!hex) continue;

      c.textEl.textContent = newCode;
      setShapeFill(c.shapeEl, hex);

      recolored++;
    }

    return recolored > 0;
  }

  // =========================
  // 4) Orchestration (NO toca inputs de facets)
  // =========================
  function applyAllOnce() {
    if (KITMODE_ENABLED) applyDayuRestrictionsToTextarea();

    const svg = document.querySelector("#svgContainer svg");
    const palette = $("palette");
    if (!svg || !palette) return false;

    const idxToRgb = buildIdxToRgbFromPalette();
    if (!idxToRgb.size) return false;

    const idxToCode = buildIdxToCode(idxToRgb);
    if (!idxToCode.size) return false;

    relabelSvgTextsNumericToDayu(idxToCode);

    if (KITMODE_ENABLED && FORCE_EXACT_K_BY_RECOLORING_LARGE_FACETS) {
      forceExactKByRecoloringLargeFacets(getDesiredK());
    }

    return true;
  }

  // Debounce para no spamear
  function debounce(fn, wait) {
    let t = null;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  function installHooks() {
    const btn = $("btnProcess");
    if (btn) {
      btn.addEventListener(
        "click",
        () => {
          if (KITMODE_ENABLED) applyDayuRestrictionsToTextarea();
        },
        true
      );
    }

    const runDebounced = debounce(applyAllOnce, 150);

    // OBSERVAR SOLO output (NO el body)
    const palette = $("palette");
    const svgContainer = $("svgContainer");

    if (palette) {
      new MutationObserver(runDebounced).observe(palette, {
        childList: true,
        subtree: true
      });
    }

    if (svgContainer) {
      new MutationObserver(runDebounced).observe(svgContainer, {
        childList: true,
        subtree: true
      });
    }
  }

  function boot() {
    installHooks();

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const ok = applyAllOnce();
      if (ok || tries > 120) clearInterval(timer);
    }, 250);

    // Toggle desde consola si quieres:
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
