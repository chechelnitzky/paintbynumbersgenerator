/* Recolor add-on (v11.0 - GLOBAL 1:1 SUGGESTIONS + ΔE00 ENGINE + ALL FIXES)
   ✅ Hard reload safe: FAB + modal overlay
   ✅ ORIGINAL tag detection restored + sort asc
   ✅ Rename works on real SVG text nodes
   ✅ Auto-rename on pick: rename input becomes picker tag (still editable)
   ✅ Picker shows X when a color is already used (indicator only)
   ✅ Colores ON/OFF, Bordes ON/OFF
   ✅ Color textos toggle + Opacity slider ALWAYS applies (ON or OFF, color or black)
   ✅ EXPORT FIX: text opacity is “baked” before SVG/PNG export
   ✅ PNG download fixed + HQ export (scale 10x default) + robust download
   ✅ Buttons: press feedback + loading spinner while exporting
   ✅ Memory: persists mappings + UI between close/reopen, resets only on new output signature

   🆕 SUGGESTION ENGINE (FIX REQUESTED):
      - ΔE00 base + PBN neutral penalty (GAMMA) + anti-dark (tie) already available
      - GLOBAL 1:1 assignment (no repeats) with Hungarian + L* rank preservation + hue coherence
      - Refinement by swaps to preserve gradients/transitions (graph KNN, ITER)
      - UI toggle: “Sugerencia 1:1 (sin repetir) + Preservar escala” (default ON)

   Parameters default:
     ALPHA=1.2, BETA=0.15, GAMMA=0.08, DELTA=0.35,
     C_NEUTRAL=6.0, K=3, ITER=800, EPS_TIE=0.35
*/

(function () {
  // ---------- Config ----------
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map((x) => x.hex);

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);
  const isTagLike = (t) => /^[a-z0-9]{1,6}$/i.test((t || "").toString().trim());

  // ---------- Memory ----------
  const STORAGE_KEY = "recolor_state_v110";
  let saveTimer = null;

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }
  function hashDjb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }
  function svgSignature(svgEl) {
    try {
      const s = new XMLSerializer().serializeToString(svgEl);
      const compact = s.replace(/\s+/g, " ").slice(0, 40000);
      return hashDjb2(`${compact.length}|${compact}`);
    } catch {
      return String(Date.now());
    }
  }
  function loadStored() { return safeJsonParse(localStorage.getItem(STORAGE_KEY)) || null; }
  function writeStored(obj) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (_) {} }

  // ---------- Global UI CSS ----------
  function ensureUiStyle() {
    if (document.getElementById("recolor-ui-style")) return;
    const st = document.createElement("style");
    st.id = "recolor-ui-style";
    st.textContent = `
      @keyframes recolorSpin { to { transform: rotate(360deg); } }
      .recolor-btn { transition: transform 80ms ease, box-shadow 120ms ease, background 120ms ease, opacity 120ms ease; box-shadow: 0 10px 24px rgba(0,0,0,.10); }
      .recolor-btn:hover { box-shadow: 0 14px 30px rgba(0,0,0,.14); }
      .recolor-btn.is-pressed { transform: translateY(1px) scale(.99); box-shadow: 0 6px 14px rgba(0,0,0,.10); }
      .recolor-btn.is-loading { opacity: .85; cursor: progress !important; }
      .recolor-spinner { width: 14px; height: 14px; border-radius: 999px; border: 2px solid rgba(0,0,0,.22); border-top-color: rgba(0,0,0,.65); animation: recolorSpin .7s linear infinite; display: inline-block; }
      .recolor-suggest { transition: transform 80ms ease, box-shadow 120ms ease; }
      .recolor-suggest:hover { box-shadow: 0 10px 18px rgba(0,0,0,.12); }
      .recolor-suggest:active { transform: translateY(1px) scale(.99); }
    `;
    document.head.appendChild(st);
  }
  function enhanceButton(btn) {
    ensureUiStyle();
    btn.classList.add("recolor-btn");
    btn.addEventListener("pointerdown", () => btn.classList.add("is-pressed"));
    const up = () => btn.classList.remove("is-pressed");
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("mouseleave", up);
  }
  function setButtonLoading(btn, on) {
    ensureUiStyle();
    if (on) {
      btn.classList.add("is-loading");
      btn.disabled = true;
      if (!btn._spinner) {
        const sp = document.createElement("span");
        sp.className = "recolor-spinner";
        sp.style.marginLeft = "10px";
        btn._spinner = sp;
        btn.appendChild(sp);
      }
    } else {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      if (btn._spinner) { btn._spinner.remove(); btn._spinner = null; }
    }
  }

  // ---------- Color helpers ----------
  function rgbToHex(rgb) {
    const m = (rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toLowerCase();
  }
  function textColorForBg(hex) {
    const h = (hex || "").replace("#", "");
    if (h.length !== 6) return "#000";
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return y > 140 ? "#000" : "#fff";
  }

  function getElementFill(el) {
    const fAttr = el.getAttribute && el.getAttribute("fill");
    if (fAttr && fAttr !== "none" && fAttr !== "transparent") {
      const f = norm(fAttr);
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    }
    const styleAttr = el.getAttribute && el.getAttribute("style");
    if (styleAttr && /fill\s*:/i.test(styleAttr)) {
      const m = styleAttr.match(/fill:\s*([^;]+)/i);
      if (m && m[1]) {
        const v = norm(m[1]);
        if (v.startsWith("rgb")) return rgbToHex(v) || null;
        if (v.startsWith("#") && v.length === 7) return v;
      }
    }
    try {
      const cs = window.getComputedStyle(el);
      const f = cs && cs.fill ? norm(cs.fill) : "";
      if (!f || f === "none" || f === "transparent") return null;
      if (f.startsWith("rgb")) return rgbToHex(f) || null;
      if (f.startsWith("#") && f.length === 7) return f;
    } catch (_) {}
    return null;
  }

  // ========================================================================
  //  COLOR SCIENCE ENGINE (ΔE00 + GLOBAL 1:1 SUGGESTIONS)
  //  Deliverables requested:
  //   - buildPaletteCache(paletteHexes)
  //   - buildOriginalCache(originalHexesOrTags)
  //   - buildKNNGraph(originalCache, K)
  //   - buildCostMatrix(originalCache, paletteCache, weights, params)
  //   - hungarianAssign(costMatrix)
  //   - refineBySwaps(assign, originalCache, paletteCache, graph, params)
  //   - suggestOneToOneMapping(originalColorsUsed) -> mapping oldHex -> {hex,tag,meta}
  // ========================================================================

  // --- sRGB -> linear ---
  function srgbToLinear(u) {
    return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  }
  // --- linear -> XYZ D65 ---
  function rgb01ToXyzD65(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    return {
      x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
      y: R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
      z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
    };
  }
  function fLab(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); }
  // --- XYZ -> Lab (D65) ---
  function xyzToLabD65(x, y, z) {
    const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
    const fx = fLab(x / Xn), fy = fLab(y / Yn), fz = fLab(z / Zn);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  // hex -> Lab + C/h
  function hexToLab(hex) {
    const h = (hex || "").replace("#", "").trim();
    if (h.length !== 6) return null;
    const r8 = parseInt(h.slice(0, 2), 16);
    const g8 = parseInt(h.slice(2, 4), 16);
    const b8 = parseInt(h.slice(4, 6), 16);
    if (!Number.isFinite(r8) || !Number.isFinite(g8) || !Number.isFinite(b8)) return null;
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    const { x, y, z } = rgb01ToXyzD65(r, g, b);
    const lab = xyzToLabD65(x, y, z);
    const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let hDeg = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
    if (hDeg < 0) hDeg += 360;
    return { L: lab.L, a: lab.a, b: lab.b, C, h: hDeg };
  }

  // ΔE00 standard (kL=kC=kH=1)
  function deltaE00(lab1, lab2) {
    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;
    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cbar = (C1 + C2) / 2;

    const Cbar7 = Math.pow(Cbar, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;

    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
    const h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp = 0;
    if (C1p * C2p !== 0) {
      const dh = h2p - h1p;
      if (Math.abs(dh) <= 180) dhp = dh;
      else if (dh > 180) dhp = dh - 360;
      else dhp = dh + 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((((dhp * Math.PI) / 180) / 2));

    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;

    let hbarp = 0;
    if (C1p * C2p === 0) {
      hbarp = h1p + h2p;
    } else {
      const dh = Math.abs(h1p - h2p);
      if (dh <= 180) hbarp = (h1p + h2p) / 2;
      else hbarp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
    }

    const T =
      1 -
      0.17 * Math.cos(((hbarp - 30) * Math.PI) / 180) +
      0.24 * Math.cos(((2 * hbarp) * Math.PI) / 180) +
      0.32 * Math.cos(((3 * hbarp + 6) * Math.PI) / 180) -
      0.20 * Math.cos(((4 * hbarp - 63) * Math.PI) / 180);

    const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));

    const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;

    const RT = -Math.sin(((2 * dTheta) * Math.PI) / 180) * RC;

    return Math.sqrt(
      Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );
  }

  function hueDistDeg(h1, h2) {
    const d = Math.abs(h1 - h2);
    return Math.min(d, 360 - d); // 0..180
  }

  // ---------- Phase 0: caches ----------
  function buildPaletteCache(paletteItemsOrHexes) {
    const items = Array.isArray(paletteItemsOrHexes)
      ? paletteItemsOrHexes.map((x) => (typeof x === "string" ? { hex: x, tag: "" } : x))
      : [];

    const cache = [];
    for (let i = 0; i < items.length; i++) {
      const hex = norm(items[i].hex);
      if (!isHex6(hex)) continue;
      const lab = hexToLab(hex);
      if (!lab) continue;
      cache.push({
        idx: i,
        hex,
        tag: (items[i].tag || "").toString().trim(),
        L: lab.L,
        a: lab.a,
        b: lab.b,
        C: lab.C,
        h: lab.h,
        lab,
        rankL_pal: 0,
      });
    }
    // rankL_pal: order by L* ascending (dark->light) gives stable "scale"
    const sorted = cache.slice().sort((p, q) => p.L - q.L || p.idx - q.idx);
    sorted.forEach((p, r) => (p.rankL_pal = r));
    return cache;
  }

  function buildOriginalCache(originalItems) {
    // originalItems: [{tag, oldHex, weight}]
    const cache = [];
    for (let i = 0; i < originalItems.length; i++) {
      const it = originalItems[i];
      const hex = norm(it.oldHex);
      if (!isHex6(hex)) continue;
      const lab = hexToLab(hex);
      if (!lab) continue;
      cache.push({
        i,
        tag: (it.tag || "").toString().trim(),
        oldHex: hex,
        weight: Number.isFinite(it.weight) ? it.weight : 1,
        L: lab.L,
        a: lab.a,
        b: lab.b,
        C: lab.C,
        h: lab.h,
        lab,
        rankL_orig: 0,
      });
    }
    const sorted = cache.slice().sort((p, q) => p.L - q.L || p.i - q.i);
    sorted.forEach((o, r) => (o.rankL_orig = r));
    return cache;
  }

  function buildKNNGraph(originalCache, K) {
    const n = originalCache.length;
    const graph = Array.from({ length: n }, () => []);
    if (n <= 1) return graph;

    // For KNN selection use ΔE76 (fast) (still good for neighbor structure)
    function d76(l1, l2) {
      const dL = l1.L - l2.L;
      const da = l1.a - l2.a;
      const db = l1.b - l2.b;
      return Math.sqrt(dL * dL + da * da + db * db);
    }

    for (let i = 0; i < n; i++) {
      const li = originalCache[i].lab;
      const arr = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        arr.push({ j, d: d76(li, originalCache[j].lab) });
      }
      arr.sort((a, b) => a.d - b.d);
      const knn = arr.slice(0, Math.max(0, K));
      // store with dOrig00 (needed by phase2)
      for (const e of knn) {
        const d00 = deltaE00(originalCache[i].lab, originalCache[e.j].lab);
        graph[i].push({ j: e.j, dOrig: d00 });
      }
    }
    return graph;
  }

  function buildCostMatrix(originalCache, paletteCache, weights, params) {
    const {
      ALPHA = 1.2,
      BETA = 0.15,
      GAMMA = 0.08,
      C_NEUTRAL = 6.0,
    } = params || {};

    const n = originalCache.length;
    const m = paletteCache.length;
    const C = Array.from({ length: n }, () => new Float64Array(m));

    for (let i = 0; i < n; i++) {
      const o = originalCache[i];
      const w = (weights && Number.isFinite(weights[i]) ? weights[i] : o.weight) || 1;
      const oNeutral = o.C < C_NEUTRAL;

      for (let j = 0; j < m; j++) {
        const p = paletteCache[j];

        const base = deltaE00(o.lab, p.lab);
        const scale = ALPHA * Math.abs(o.rankL_orig - p.rankL_pal);
        const hue = BETA * hueDistDeg(o.h, p.h);
        const neutral = oNeutral ? GAMMA * Math.max(0, p.C - o.C) : 0;

        C[i][j] = w * (base + scale + hue + neutral);
      }
    }
    return C;
  }

  // Hungarian for rectangular n<=m (min cost). Returns array assign[i]=j
  function hungarianAssign(costMatrix) {
    const n = costMatrix.length;
    const m = costMatrix[0].length;
    if (n === 0) return [];

    // 1-indexed classic implementation (u,v potentials), O(n*m)
    const u = new Float64Array(n + 1);
    const v = new Float64Array(m + 1);
    const p = new Int32Array(m + 1);
    const way = new Int32Array(m + 1);

    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(m + 1);
      const used = new Uint8Array(m + 1);
      for (let j = 1; j <= m; j++) minv[j] = Infinity;

      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity;
        let j1 = 0;
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else { minv[j] -= delta; }
        }
        j0 = j1;
      } while (p[j0] !== 0);

      // augmenting
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0);
    }

    const assign = new Int32Array(n);
    for (let j = 1; j <= m; j++) {
      if (p[j] > 0) assign[p[j] - 1] = j - 1;
    }
    return Array.from(assign);
  }

  // Phase 2: refine by swaps (gradient preservation)
  function refineBySwaps(assign, originalCache, paletteCache, graph, params) {
    const {
      DELTA = 0.35,
      ITER = 800,
    } = params || {};

    const n = originalCache.length;
    const m = paletteCache.length;
    if (n <= 1) return assign;

    // Precompute palette-palette ΔE00 (167x167)
    const palDE = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) {
      palDE[i][i] = 0;
      for (let j = i + 1; j < m; j++) {
        const d = deltaE00(paletteCache[i].lab, paletteCache[j].lab);
        palDE[i][j] = d;
        palDE[j][i] = d;
      }
    }

    // We also want quick per-i cost access: rebuild cost matrix for selected originals only once
    const weights = originalCache.map((o) => o.weight);
    const baseCost = buildCostMatrix(originalCache, paletteCache, weights, params);

    // Helper edge cost between i and neighbor j
    function edgeCost(i, j) {
      const ai = assign[i];
      const aj = assign[j];
      const dPal = palDE[ai][aj];
      const dOrig = graph[i].find((e) => e.j === j)?.dOrig;
      const dO = Number.isFinite(dOrig) ? dOrig : deltaE00(originalCache[i].lab, originalCache[j].lab);
      return DELTA * Math.abs(dO - dPal);
    }

    // For delta calculation on swap only incident edges
    function incidentDelta(i, oldPal, newPal, otherAssign, neighbors) {
      let delta = 0;
      for (const e of neighbors) {
        const j = e.j;
        const aj = otherAssign[j];
        const dOld = DELTA * Math.abs(e.dOrig - palDE[oldPal][aj]);
        const dNew = DELTA * Math.abs(e.dOrig - palDE[newPal][aj]);
        delta += (dNew - dOld);
      }
      return delta;
    }

    const randInt = (max) => (Math.random() * max) | 0;

    for (let it = 0; it < ITER; it++) {
      const i1 = randInt(n);
      let i2 = randInt(n);
      if (i2 === i1) i2 = (i2 + 1) % n;

      const a1 = assign[i1];
      const a2 = assign[i2];
      if (a1 === a2) continue;

      // base term delta
      const dBase =
        (baseCost[i1][a2] + baseCost[i2][a1]) -
        (baseCost[i1][a1] + baseCost[i2][a2]);

      // gradient term delta (only edges incident to i1 or i2)
      const n1 = graph[i1] || [];
      const n2 = graph[i2] || [];

      let dGrad = 0;

      // i1 edges (avoid double-count with i2 handled below; still fine, but keep stable)
      dGrad += incidentDelta(i1, a1, a2, assign, n1);
      dGrad += incidentDelta(i2, a2, a1, assign, n2);

      const dTotal = dBase + dGrad;

      if (dTotal < 0) {
        assign[i1] = a2;
        assign[i2] = a1;
      }
    }

    return assign;
  }

  // High-level suggestion mapping 1:1
  function suggestOneToOneMapping(originalColorsUsed, paletteCache, params) {
    const p = params || {};
    const m = paletteCache.length;
    const items = originalColorsUsed.slice();

    // weights: if area not available, use node count as proxy (more shapes => more area)
    const originals = buildOriginalCache(
      items.map((x) => ({ tag: x.tag, oldHex: x.oldHex, weight: x.weight }))
    );

    const N = originals.length;
    if (!N) return { mapping: new Map(), meta: { mode: "empty" } };

    // If N > m: assign 1:1 only to top m by weight, rest map to closest assigned (can repeat)
    let activeIdx = originals.map((_, i) => i);
    if (N > m) {
      activeIdx = originals
        .map((o, i) => ({ i, w: o.weight }))
        .sort((a, b) => b.w - a.w || a.i - b.i)
        .slice(0, m)
        .map((x) => x.i);
    }

    const act = activeIdx.map((i) => originals[i]);
    const weights = act.map((o) => o.weight);

    // build cost matrix for active
    const C = buildCostMatrix(act, paletteCache, weights, p);

    // Hungarian (n<=m guaranteed)
    let assign = hungarianAssign(C);

    // Phase 2: swaps for gradients
    const graph = buildKNNGraph(act, p.K || 3);
    assign = refineBySwaps(assign, act, paletteCache, graph, p);

    const usedPalSet = new Set(assign);

    // For non-active (if any): map to closest among USED palette colors (not necessarily unique)
    function closestAmongUsed(origLab) {
      let bestJ = -1;
      let bestD = Infinity;
      for (const j of usedPalSet) {
        const d = deltaE00(origLab, paletteCache[j].lab);
        if (d < bestD) { bestD = d; bestJ = j; }
      }
      return bestJ;
    }

    const mapping = new Map(); // oldHex -> {hex, tag, meta}

    // Active mappings (1:1)
    for (let k = 0; k < act.length; k++) {
      const o = act[k];
      const j = assign[k];
      const pal = paletteCache[j];
      mapping.set(o.oldHex, {
        hex: pal.hex,
        tag: pal.tag,
        meta: { mode: "1to1", palIdx: j },
      });
    }

    // Inactive mappings
    if (N > m) {
      for (let i = 0; i < originals.length; i++) {
        const o = originals[i];
        if (mapping.has(o.oldHex)) continue;
        const j = closestAmongUsed(o.lab);
        const pal = j >= 0 ? paletteCache[j] : null;
        mapping.set(o.oldHex, {
          hex: pal ? pal.hex : "",
          tag: pal ? pal.tag : "",
          meta: { mode: "closestUsed", palIdx: j },
        });
      }
    }

    return { mapping, meta: { mode: N <= m ? "1to1" : "1to1_top167_plus_closest" } };
  }

  // ---------- Legacy local suggestion (kept as fallback) ----------
  const LOCAL_MATCH_CFG = { C_NEUTRAL: 6.0, W_NEUTRAL: 0.08, EPS_TIE: 0.35, EPS_L: 0.05 };
  function matchToPaletteColorLocal(targetLab, paletteCache) {
    const Ct = targetLab.C;
    const targetIsNeutral = Ct < LOCAL_MATCH_CFG.C_NEUTRAL;

    let best = null;
    let second = null;

    for (let i = 0; i < paletteCache.length; i++) {
      const p = paletteCache[i];
      const dBase = deltaE00(targetLab, p.lab);
      let dFinal = dBase;
      let neutralBiasApplied = false;

      if (targetIsNeutral) {
        const penalty = LOCAL_MATCH_CFG.W_NEUTRAL * Math.max(0, (p.C - Ct));
        if (penalty > 0) { dFinal += penalty; neutralBiasApplied = true; }
      }

      const cand = { idx: p.idx, hex: p.hex, tag: p.tag, L: p.L, dBase, dFinal, neutralBiasApplied };

      if (!best || cand.dFinal < best.dFinal || (cand.dFinal === best.dFinal && cand.idx < best.idx)) {
        second = best; best = cand;
      } else if (!second || cand.dFinal < second.dFinal || (cand.dFinal === second.dFinal && cand.idx < second.idx)) {
        second = cand;
      }
    }

    let tieBreakApplied = false;
    if (best && second && (second.dFinal - best.dFinal) < LOCAL_MATCH_CFG.EPS_TIE) {
      if (second.L > best.L + LOCAL_MATCH_CFG.EPS_L) {
        const tmp = best; best = second; second = tmp; tieBreakApplied = true;
      } else if (Math.abs(second.L - best.L) <= LOCAL_MATCH_CFG.EPS_L) {
        if (second.idx < best.idx) { const tmp = best; best = second; second = tmp; tieBreakApplied = true; }
      } else tieBreakApplied = true;
    }

    if (!best) return { hex: "", tag: "", meta: null };
    return {
      hex: best.hex,
      tag: best.tag,
      meta: { d_final: best.dFinal, d_base: best.dBase, target_neutral: targetIsNeutral, neutral_bias_applied: best.neutralBiasApplied, tie_break_applied: tieBreakApplied, idx: best.idx, L: best.L },
    };
  }

  // ---------- Build palette cache ONCE ----------
  const PALETTE_CACHE = buildPaletteCache(
    PALETTE_ITEMS.length ? PALETTE_ITEMS : PALETTE.map((hex) => ({ hex, tag: "" }))
  );

  // ---------- SVG sizing ----------
  function ensureViewBox(svg) {
    if (!svg || svg.tagName.toLowerCase() !== "svg") return;
    if (svg.getAttribute("viewBox")) return;

    const w = parseFloat(svg.getAttribute("width"));
    const h = parseFloat(svg.getAttribute("height"));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) { svg.setAttribute("viewBox", `0 0 ${w} ${h}`); return; }

    try {
      const bb = svg.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) svg.setAttribute("viewBox", `0 0 ${bb.width} ${bb.height}`);
    } catch (_) {}
  }
  function makePreview(svg) {
    ensureViewBox(svg);
    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
  function getSvgSize(svgEl) {
    ensureViewBox(svgEl);
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { w: parts[2], h: parts[3] };
    }
    const wAttr = parseFloat(svgEl.getAttribute("width") || "0");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "0");
    if (wAttr > 0 && hAttr > 0) return { w: wAttr, h: hAttr };
    try {
      const bb = svgEl.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) return { w: bb.width, h: bb.height };
    } catch (_) {}
    return { w: 1600, h: 1600 };
  }

  // ---------- Find output SVG ----------
  function findFinalOutputSvgLight() {
    const svgs = Array.from(document.querySelectorAll("svg"));
    if (!svgs.length) return null;
    let best = null, bestScore = 0;
    for (const s of svgs) {
      const score =
        s.querySelectorAll("path,polygon,rect,circle,ellipse").length * 2 +
        s.querySelectorAll("text").length * 3;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  // ---------- Detect readiness ----------
  function findDownloadButtonsRow() {
    const btns = Array.from(document.querySelectorAll("button, a"));
    const hits = btns.filter((b) => {
      const t = norm(b.textContent);
      return t.includes("download svg") || t.includes("download png") || t.includes("download palette");
    });
    if (!hits.length) return null;
    for (const b of hits) {
      const p = b.parentElement;
      if (!p) continue;
      const txt = norm(p.textContent);
      if (txt.includes("download svg") && (txt.includes("download png") || txt.includes("download palette"))) return p;
    }
    return hits[0].parentElement || null;
  }
  function isGeneratorReady() { return !!findDownloadButtonsRow() && !!findFinalOutputSvgLight(); }

  // ---------- Group fills ----------
  function collectFillGroups(svg) {
    const groups = new Map();
    const nodes = Array.from(svg.querySelectorAll("*"))
      .filter((el) => el instanceof SVGElement)
      .filter((el) => ["path", "polygon", "rect", "circle", "ellipse"].includes(el.tagName.toLowerCase()));
    for (const el of nodes) {
      const fill = getElementFill(el);
      if (!fill) continue;
      const f = norm(fill);
      if (!isHex6(f)) continue;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(el);
    }
    return groups;
  }

  // ---------- Download helpers ----------
  function forceDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    forceDownloadBlob(blob, filename);
  }

  async function downloadSvgAsPngHQ(svgEl, filename, scale = 10) {
    const MAX_SIDE = 20000;
    const MAX_PIXELS = 220e6;

    const { w: baseW, h: baseH } = getSvgSize(svgEl);

    let outW = Math.round(baseW * scale);
    let outH = Math.round(baseH * scale);

    if (outW > MAX_SIDE || outH > MAX_SIDE) {
      const s = Math.min(MAX_SIDE / outW, MAX_SIDE / outH);
      outW = Math.max(1, Math.round(outW * s));
      outH = Math.max(1, Math.round(outH * s));
    }

    const pixels = outW * outH;
    if (pixels > MAX_PIXELS) {
      const s = Math.sqrt(MAX_PIXELS / pixels);
      outW = Math.max(1, Math.round(outW * s));
      outH = Math.max(1, Math.round(outH * s));
    }

    const svgText = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });

    try {
      const bitmap = await createImageBitmap(svgBlob);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;

      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bitmap, 0, 0, outW, outH);

      const pngBlob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1.0));
      if (pngBlob) { forceDownloadBlob(pngBlob, filename); return; }

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch (_) {
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";

      await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;

      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);

      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(outW / baseW, 0, 0, outH / baseH, 0, 0);
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);

      const pngBlob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1.0));
      if (pngBlob) { forceDownloadBlob(pngBlob, filename); return; }

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ---------- SVG style injection (toggles) ----------
  function ensureSvgStyle(svg, id) {
    let style = svg.querySelector(`#${id}`);
    if (style) return style;
    style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("id", id);
    svg.insertBefore(style, svg.firstChild);
    return style;
  }
  function setBorders(svg, on) {
    const style = ensureSvgStyle(svg, "recolor-borders-style");
    style.textContent = on ? "" : `
      [fill="none"][stroke], path[stroke][fill="none"], polyline[stroke], line[stroke] { stroke-opacity: 0 !important; }
      [stroke][fill="transparent"], path[stroke][fill="transparent"] { stroke-opacity: 0 !important; }
    `;
  }
  function setColorFills(svg, on) {
    const style = ensureSvgStyle(svg, "recolor-fills-style");
    style.textContent = on ? "" : `path, polygon, rect, circle, ellipse { fill: none !important; }`;
  }

  // ---------- UI atoms ----------
  function makeBadgeCorner(text) {
    const b = document.createElement("span");
    b.textContent = text;
    b.setAttribute("style", `
      position:absolute !important; left:4px !important; top:4px !important;
      padding:2px 6px !important; border-radius:999px !important;
      font-size:11px !important; font-weight:900 !important;
      background: rgba(255,255,255,.90) !important;
      border: 1px solid rgba(0,0,0,.12) !important;
      color: rgba(0,0,0,.85) !important;
      max-width: calc(100% - 8px) !important;
      white-space: nowrap !important; overflow:hidden !important; text-overflow: ellipsis !important;
      pointer-events:none !important; line-height: 1 !important;
    `.trim());
    return b;
  }

  function makeToggleButton(label, initialOn, onChange) {
    let on = !!initialOn;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = `
      padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22);
      background:${on ? "white" : "rgba(0,0,0,.06)"}; cursor:pointer; font-weight:900;
      display:inline-flex; align-items:center;
    `;
    const paint = () => {
      btn.textContent = `${label}: ${on ? "ON" : "OFF"}`;
      btn.style.background = on ? "white" : "rgba(0,0,0,.06)";
    };
    paint();
    enhanceButton(btn);

    btn.addEventListener("click", () => { on = !on; paint(); onChange(on); });
    btn._get = () => on;
    btn._set = (v) => { on = !!v; paint(); };
    return btn;
  }

  function makePickerTileX() {
    const x = document.createElement("div");
    x.className = "tile-used-x";
    x.style.cssText = `
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-weight:1000; font-size:22px; color: rgba(0,0,0,.65);
      text-shadow: 0 1px 0 rgba(255,255,255,.55);
      pointer-events:none; opacity:0; transition: opacity 120ms ease;
    `;
    x.textContent = "✕";
    return x;
  }

  function renderGridPicker({ onPick, isUsed }) {
    const grid = document.createElement("div");
    grid.style.cssText = `
      display:grid; grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 6px; max-height: 340px; overflow:auto; padding: 6px;
      border: 1px solid rgba(0,0,0,.10); border-radius: 12px; background: rgba(0,0,0,.02);
    `;

    const items = PALETTE_ITEMS.length ? PALETTE_ITEMS : PALETTE.map((hex) => ({ tag: "", hex }));
    const tilesByHex = new Map();

    items.forEach((it) => {
      const hex = norm(it.hex);
      const tag = (it.tag || "").toString().trim();

      const tile = document.createElement("button");
      tile.type = "button";
      tile.title = tag ? `${tag} — ${hex}` : hex;
      tile.style.cssText = `
        height: 40px; border-radius: 10px; border: 1px solid rgba(0,0,0,.16);
        background: ${hex}; cursor: pointer; position: relative; overflow: hidden;
      `;

      if (tag) tile.appendChild(makeBadgeCorner(tag));
      const x = makePickerTileX();
      tile.appendChild(x);

      tile.addEventListener("click", () => onPick({ hex, tag }));
      grid.appendChild(tile);
      tilesByHex.set(hex, tile);
    });

    function refreshUsedX() {
      for (const [hex, tile] of tilesByHex.entries()) {
        const x = tile.querySelector(".tile-used-x");
        if (!x) continue;
        x.style.opacity = isUsed(hex) ? "1" : "0";
      }
    }
    refreshUsedX();
    return { grid, refreshUsedX };
  }

  // ---------- ORIGINAL TAG MAPPING ----------
  function buildOriginalTagByHexFromTopSwatches() {
    const map = {};
    const candidates = Array.from(document.querySelectorAll("button, div, span"))
      .filter((el) => el && el.textContent && !el.closest("#recolor-modal") && !el.closest("#recolor-fab"))
      .filter((el) => {
        const t = (el.textContent || "").trim();
        if (!t || !isTagLike(t)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 12 || r.width > 90 || r.height > 90) return false;
        const bg = getComputedStyle(el).backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return false;
        return true;
      });

    for (const el of candidates) {
      const tag = (el.textContent || "").trim();
      const bg = getComputedStyle(el).backgroundColor;
      const hex = rgbToHex(bg);
      if (hex && !map[hex]) map[hex] = tag;
    }
    return map;
  }

  function buildOriginalTagByHexFromSvgLegend(svg) {
    const map = {};
    if (!svg) return map;

    const rects = Array.from(svg.querySelectorAll("rect")).filter((r) => {
      const w = parseFloat(r.getAttribute("width") || "0");
      const h = parseFloat(r.getAttribute("height") || "0");
      return w > 6 && h > 6 && w <= 140 && h <= 140;
    });

    for (const rect of rects) {
      const fill = (rect.getAttribute("fill") || "").trim();
      let hex = "";
      if (fill.startsWith("#") && fill.length === 7) hex = fill.toLowerCase();
      else if (fill.startsWith("rgb")) hex = rgbToHex(fill) || "";
      if (!hex) continue;

      const parent = rect.parentElement;
      if (!parent) continue;

      const kids = Array.from(parent.children);
      const idx = kids.indexOf(rect);
      if (idx === -1) continue;

      const near = kids.slice(idx + 1, idx + 6).find(
        (n) => n.tagName && n.tagName.toLowerCase() === "text" && (n.textContent || "").trim()
      );

      if (near) {
        const tag = (near.textContent || "").trim();
        if (tag && isTagLike(tag) && !map[hex]) map[hex] = tag;
      }
    }
    return map;
  }

  function buildOriginalTagByHexFromSvgProximity(svg, fillGroups) {
    const map = {};
    if (!svg || !fillGroups || !fillGroups.size) return map;

    const texts = Array.from(svg.querySelectorAll("text"))
      .map((t) => {
        const tag = (t.textContent || "").toString().trim();
        if (!tag || !isTagLike(tag)) return null;
        let bb;
        try { bb = t.getBBox(); } catch (_) { return null; }
        if (!bb) return null;
        return { tag, cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 };
      })
      .filter(Boolean);

    if (!texts.length) return map;

    for (const [hex, nodes] of fillGroups.entries()) {
      let sumX = 0, sumY = 0, count = 0;
      const sample = nodes.slice(0, 40);
      for (const el of sample) {
        let bb;
        try { bb = el.getBBox(); } catch (_) { continue; }
        if (!bb) continue;
        sumX += bb.x + bb.width / 2;
        sumY += bb.y + bb.height / 2;
        count++;
      }
      if (!count) continue;

      const cx = sumX / count;
      const cy = sumY / count;

      let best = null, bestD = Infinity;
      for (const t of texts) {
        const dx = t.cx - cx;
        const dy = t.cy - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best && !map[hex]) map[hex] = best.tag;
    }
    return map;
  }

  function isNumericTag(t) { return /^-?\d+(\.\d+)?$/.test((t || "").toString().trim()); }
  function cmpTagAsc(a, b) {
    const ta = (a || "").toString().trim();
    const tb = (b || "").toString().trim();
    const na = isNumericTag(ta) ? Number(ta) : null;
    const nb = isNumericTag(tb) ? Number(tb) : null;
    if (na !== null && nb !== null) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return ta.localeCompare(tb, "es", { numeric: true, sensitivity: "base" });
  }

  // ---------- Modal ----------
  function openModal() {
    const existing = document.getElementById("recolor-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "recolor-modal";
    overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.28); z-index: 2147483647; overflow: auto; padding: 22px;`;

    const card = document.createElement("div");
    card.style.cssText = `
      max-width: 1200px; margin: 0 auto;
      background: rgba(255,255,255,.98);
      border: 1px solid rgba(0,0,0,.14);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,.25);
      padding: 14px;
    `;

    const topbar = document.createElement("div");
    topbar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:900;";
    title.textContent = `Recoloreo (paleta ${PALETTE.length})`;

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Cerrar";
    close.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900; display:inline-flex; align-items:center;";
    enhanceButton(close);
    close.addEventListener("click", () => overlay.remove());

    topbar.appendChild(title);
    topbar.appendChild(close);
    card.appendChild(topbar);

    const host = document.createElement("div");
    host.id = "recolor-host";
    host.style.cssText = `
      margin-top: 10px; padding: 14px; border: 1px solid rgba(0,0,0,.12);
      border-radius: 12px; background: rgba(255,255,255,.96);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;
    card.appendChild(host);

    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onEsc); }
    }, { once: true });

    document.body.appendChild(overlay);
    return host;
  }

  // ---------- Editor ----------
  function openEditor(originalSvg) {
    const host = openModal();
    host.innerHTML = "";

    const sig = svgSignature(originalSvg);
    const stored = loadStored();
    const sameDoc = stored && stored.svgSig === sig;
    if (!sameDoc) writeStored({ svgSig: sig, mappings: {}, ui: {} });

    const header = document.createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;";
    header.innerHTML = `
      <div style="font-weight:900;">Recoloreo (paleta ${PALETTE.length})</div>
      <div style="color:rgba(0,0,0,.65); font-size:13px;">
        Selecciona color original → elige reemplazo / sugerencia → (renombrar) → toggles → descarga
      </div>
    `;
    host.appendChild(header);

    const originalClone = originalSvg.cloneNode(true);
    const recolorSvg = originalSvg.cloneNode(true);
    makePreview(originalClone);
    makePreview(recolorSvg);

    const previews = document.createElement("div");
    previews.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    const panel = (title, node) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = `border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; overflow: hidden; background: white;`;
      const h = document.createElement("div");
      h.textContent = title;
      h.style.cssText = "font-weight:800; margin-bottom: 8px;";
      const viewport = document.createElement("div");
      viewport.style.cssText = `width: 100%; border-radius: 10px; border: 1px solid rgba(0,0,0,.10); background: white; overflow: hidden;`;
      viewport.appendChild(node);
      wrap.appendChild(h);
      wrap.appendChild(viewport);
      return wrap;
    };
    previews.appendChild(panel("Original", originalClone));
    previews.appendChild(panel("Recoloreada", recolorSvg));
    host.appendChild(previews);

    const fillGroups = collectFillGroups(recolorSvg);

    const topMap = buildOriginalTagByHexFromTopSwatches();
    const legendMap = buildOriginalTagByHexFromSvgLegend(originalSvg);
    const proxMap = buildOriginalTagByHexFromSvgProximity(recolorSvg, fillGroups);
    const tagByHex = { ...proxMap, ...legendMap, ...topMap };

    const rawEntries = Array.from(fillGroups.entries()).map(([oldHex, nodes]) => {
      const hex = norm(oldHex);
      const tagOriginal = tagByHex[hex] || "";
      return { oldHex: hex, nodes, tagOriginal };
    });

    rawEntries.sort((a, b) => {
      const ta = a.tagOriginal || "";
      const tb = b.tagOriginal || "";
      const hasA = !!ta;
      const hasB = !!tb;
      if (hasA && hasB) return cmpTagAsc(ta, tb);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      return a.oldHex.localeCompare(b.oldHex);
    });

    // ---- State ----
    let colorsOn = true;
    let bordersOn = true;
    let textColorModeOn = false; // OFF => black
    let textOpacity = 0.7; // ALWAYS applied
    let selectedOldHex = null;

    // 🆕 Suggestion toggle state (default ON)
    let suggestOneToOneOn = true;

    const storedNow = loadStored();
    const savedUi = storedNow && storedNow.svgSig === sig && storedNow.ui ? storedNow.ui : {};
    if (typeof savedUi.colorsOn === "boolean") colorsOn = savedUi.colorsOn;
    if (typeof savedUi.bordersOn === "boolean") bordersOn = savedUi.bordersOn;
    if (typeof savedUi.textColorModeOn === "boolean") textColorModeOn = savedUi.textColorModeOn;
    if (typeof savedUi.textOpacity === "number") textOpacity = Math.max(0, Math.min(1, savedUi.textOpacity));
    if (typeof savedUi.selectedOldHex === "string") selectedOldHex = savedUi.selectedOldHex;
    if (typeof savedUi.suggestOneToOneOn === "boolean") suggestOneToOneOn = savedUi.suggestOneToOneOn;

    setColorFills(recolorSvg, colorsOn);
    setBorders(recolorSvg, bordersOn);

    const usedReplacementHex = new Set();

    const controls = document.createElement("div");
    controls.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;";
    host.appendChild(controls);

    const left = document.createElement("div");
    left.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    left.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Colores originales (TAG + reemplazo + renombrar + sugerencia)</div>`;
    controls.appendChild(left);

    const right = document.createElement("div");
    right.style.cssText = "border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 10px; background:white;";
    right.innerHTML = `<div style="font-weight:800; margin-bottom:8px;">Picker (grilla con tags del Excel)</div>`;
    controls.appendChild(right);

    const info = document.createElement("div");
    info.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px; margin-bottom: 8px;";
    info.textContent = "Click en un color original (izquierda). Luego elige el color nuevo en la grilla (o usa la sugerencia).";
    right.appendChild(info);

    // Row state maps
    const rowByOldHex = new Map();
    const renameInputByOldHex = new Map();
    const labelNodesByOldHex = new Map();
    const suggestBtnByOldHex = new Map();

    function buildTagToReplacementHexMap() {
      const map = new Map(); // tagLower -> hex
      for (const [oldHex, row] of rowByOldHex.entries()) {
        const replHex = norm(row.getAttribute("data-replhex") || "");
        const inp = renameInputByOldHex.get(oldHex);
        const tag = inp ? (inp.value || "").toString().trim() : "";
        if (!tag || !isTagLike(tag)) continue;
        if (!replHex || !isHex6(replHex)) continue;
        map.set(norm(tag), replHex);
      }
      return map;
    }

    function stripStyleProps(styleStr, props) {
      if (!styleStr) return "";
      let s = styleStr;
      props.forEach((p) => {
        const re = new RegExp(`\\b${p}\\s*:\\s*[^;]+;?`, "gi");
        s = s.replace(re, "");
      });
      s = s.replace(/;;+/g, ";").trim();
      return s;
    }

    function applyTextColors() {
      const map = buildTagToReplacementHexMap();
      const texts = Array.from(recolorSvg.querySelectorAll("text"));
      const op = String(Math.max(0, Math.min(1, textOpacity)));

      texts.forEach((t) => {
        const raw = (t.textContent || "").toString().trim();
        if (!raw || !isTagLike(raw)) return;

        const key = norm(raw);
        const hex = textColorModeOn ? map.get(key) || "#000000" : "#000000";

        t.setAttribute("fill", hex);
        t.setAttribute("fill-opacity", op);
        t.setAttribute("opacity", op);

        const prev = t.getAttribute("style") || "";
        const cleaned = stripStyleProps(prev, ["fill", "fill-opacity", "opacity"]);
        const prefix = cleaned ? (cleaned.trim().endsWith(";") ? cleaned : cleaned + ";") : "";
        t.setAttribute("style", `${prefix}fill:${hex};fill-opacity:${op};opacity:${op};`);
      });
    }

    function queueSaveState(buildStateFn) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const current = loadStored() || { svgSig: sig, mappings: {}, ui: {} };
        if (current.svgSig !== sig) return;
        const next = buildStateFn(current);
        writeStored(next);
      }, 80);
    }

    function saveAllState() {
      queueSaveState((cur) => {
        const mappings = {};
        for (const [oldHex, row] of rowByOldHex.entries()) {
          const replHex = norm(row.getAttribute("data-replhex") || "");
          const replTag = (row.getAttribute("data-repltag") || "").toString();
          const inp = renameInputByOldHex.get(oldHex);
          const rename = inp ? (inp.value || "").toString() : "";
          if (replHex || rename || replTag) mappings[oldHex] = { replHex, replTag, rename };
        }
        cur.mappings = mappings;
        cur.ui = { colorsOn, bordersOn, textColorModeOn, textOpacity, selectedOldHex: selectedOldHex || "", suggestOneToOneOn };
        return cur;
      });
    }

    function setRenameForOldHex(oldHex, newLabel) {
      oldHex = norm(oldHex);
      const inp = renameInputByOldHex.get(oldHex);
      const nodes = labelNodesByOldHex.get(oldHex) || [];
      if (!inp) return;

      inp.value = (newLabel || "").toString();
      nodes.forEach((t) => (t.textContent = inp.value));
      applyTextColors();
      saveAllState();
    }

    function applyReplacementToOldHex(oldHex, newHex, newTag, { autoRename = true } = {}) {
      oldHex = norm(oldHex);
      newHex = norm(newHex);
      newTag = (newTag || "").toString().trim();
      if (!isHex6(newHex)) return;

      const row = rowByOldHex.get(oldHex);
      if (!row) return;

      const prev = row.getAttribute("data-replhex") || "";
      if (prev) usedReplacementHex.delete(norm(prev));
      usedReplacementHex.add(newHex);

      const nodes = fillGroups.get(oldHex) || [];
      nodes.forEach((el) => {
        el.setAttribute("fill", newHex);
        if (el.hasAttribute("style")) el.setAttribute("style", el.getAttribute("style").replace(/fill:\s*[^;]+;?/gi, ""));
      });

      row.setAttribute("data-replhex", newHex);
      row.setAttribute("data-repltag", newTag);

      const swNew = row.querySelector(".sw-new");
      const txt = row.querySelector(".row-text");
      if (swNew) { swNew.style.background = newHex; swNew.style.borderStyle = "solid"; }

      const badgeHost = row.querySelector(".new-badge-host");
      if (badgeHost) {
        badgeHost.innerHTML = "";
        if (newTag) badgeHost.appendChild(makeBadgeCorner(newTag));
      }
      if (txt) txt.textContent = newTag ? `Reemplazo: ${newTag} (${newHex})` : `Reemplazo: ${newHex}`;

      if (autoRename && newTag) setRenameForOldHex(oldHex, newTag);
      else { applyTextColors(); saveAllState(); }
    }

    const picker = renderGridPicker({
      isUsed: (hex) => usedReplacementHex.has(norm(hex)),
      onPick: ({ hex, tag }) => {
        if (!selectedOldHex) { alert("Primero selecciona un color original (panel izquierdo)."); return; }
        applyReplacementToOldHex(selectedOldHex, hex, tag, { autoRename: true });
        picker.refreshUsedX();
      },
    });
    right.appendChild(picker.grid);

    const list = document.createElement("div");
    list.style.cssText = "display:grid; gap:10px; max-height: 420px; overflow:auto; padding-right: 6px;";
    left.appendChild(list);

    function highlightRow(oldHex) {
      oldHex = norm(oldHex);
      Array.from(list.querySelectorAll("button")).forEach((b) => {
        if (b.getAttribute("data-oldhex")) { b.style.outline = "none"; b.style.boxShadow = "none"; }
      });
      const row = rowByOldHex.get(oldHex);
      if (!row) return;
      row.style.outline = "2px solid rgba(0,0,0,.28)";
      row.style.boxShadow = "0 0 0 4px rgba(0,0,0,.05)";
    }

    // ---- Global suggestion mapping (computed once per open, recomputed if toggle changes) ----
    const PARAMS_1TO1 = {
      ALPHA: 1.2,
      BETA: 0.15,
      GAMMA: 0.08,
      DELTA: 0.35,
      C_NEUTRAL: 6.0,
      K: 3,
      ITER: 800,
      EPS_TIE: 0.35,
    };

    function computeSuggestionsMapOneToOne() {
      const originalsUsed = rawEntries.map((e) => ({
        oldHex: e.oldHex,
        tag: e.tagOriginal,
        // proxy weight by node count (if you later have real area, plug it here)
        weight: (e.nodes && e.nodes.length) ? e.nodes.length : 1,
      }));
      return suggestOneToOneMapping(originalsUsed, PALETTE_CACHE, PARAMS_1TO1).mapping;
    }

    function computeSuggestionLocal(oldHex) {
      const labT = hexToLab(oldHex);
      if (!labT) return { hex: "", tag: "", meta: null };
      return matchToPaletteColorLocal(labT, PALETTE_CACHE);
    }

    let oneToOneMap = null;
    if (suggestOneToOneOn) oneToOneMap = computeSuggestionsMapOneToOne();

    function getSuggestionForOldHex(oldHex) {
      const key = norm(oldHex);
      if (suggestOneToOneOn && oneToOneMap && oneToOneMap.has(key)) {
        const v = oneToOneMap.get(key);
        return { hex: v.hex, tag: v.tag, meta: v.meta || null };
      }
      return computeSuggestionLocal(key);
    }

    function updateSuggestionTile(oldHex) {
      oldHex = norm(oldHex);
      const btn = suggestBtnByOldHex.get(oldHex);
      if (!btn) return;

      const s = getSuggestionForOldHex(oldHex);
      const sugHex = norm(s.hex || "");
      const sugTag = (s.tag || "").toString().trim();

      btn.style.background = isHex6(sugHex) ? sugHex : "rgba(0,0,0,.03)";
      btn.style.cursor = isHex6(sugHex) ? "pointer" : "not-allowed";
      btn.title = sugTag ? `Sugerido: ${sugTag} — ${sugHex}` : (sugHex ? `Sugerido: ${sugHex}` : "Sin sugerencia");

      btn.innerHTML = "";
      if (sugTag) btn.appendChild(makeBadgeCorner(sugTag));
      else if (sugHex) btn.appendChild(makeBadgeCorner("≈"));

      btn.setAttribute("data-sughex", sugHex);
      btn.setAttribute("data-sugtag", sugTag);
    }

    function updateAllSuggestionTiles() {
      if (suggestOneToOneOn) oneToOneMap = computeSuggestionsMapOneToOne();
      else oneToOneMap = null;
      for (const e of rawEntries) updateSuggestionTile(e.oldHex);
    }

    // ---- Build list rows ----
    if (!rawEntries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
      empty.textContent = "No detecté fills en el SVG.";
      list.appendChild(empty);
    } else {
      rawEntries.forEach(({ oldHex, tagOriginal }) => {
        const labelNodes =
          tagOriginal && tagOriginal.trim()
            ? Array.from(recolorSvg.querySelectorAll("text")).filter((t) => (t.textContent || "").trim() === tagOriginal)
            : [];

        const suggestion = getSuggestionForOldHex(oldHex);
        const sugHex = norm(suggestion.hex || "");
        const sugTag = (suggestion.tag || "").toString().trim();

        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("data-oldhex", oldHex);
        row.setAttribute("data-replhex", "");
        row.setAttribute("data-repltag", "");
        row.style.cssText = `
          text-align:left; display:grid; grid-template-columns: 72px 72px 72px 72px 1fr;
          gap: 10px; align-items:center; padding: 10px; border-radius: 12px;
          border: 1px solid rgba(0,0,0,.12); background: white; cursor: pointer;
        `;

        const boxTag = document.createElement("div");
        boxTag.style.cssText = `
          width:72px; height:44px; border-radius:12px; border:1px solid rgba(0,0,0,.20);
          background:${oldHex}; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;
          font-weight:900; font-size:18px; color:${textColorForBg(oldHex)};
        `;
        boxTag.textContent = tagOriginal || "";

        const boxRepl = document.createElement("div");
        boxRepl.className = "sw-new";
        boxRepl.style.cssText = `
          width:72px; height:44px; border-radius:12px; border:1px dashed rgba(0,0,0,.20);
          background:transparent; position:relative; overflow:hidden;
        `;
        const newBadgeHost = document.createElement("div");
        newBadgeHost.className = "new-badge-host";
        newBadgeHost.style.cssText = "position:absolute; inset:0;";
        boxRepl.appendChild(newBadgeHost);

        const boxRename = document.createElement("div");
        boxRename.style.cssText = `
          width:72px; height:44px; border-radius:12px; border:1px solid rgba(0,0,0,.22);
          background:white; display:flex; align-items:center; justify-content:center; padding:0 6px;
        `;
        const input = document.createElement("input");
        input.type = "text";
        input.value = tagOriginal || "";
        input.style.cssText = `width:100%; height:28px; border:0; outline:none; text-align:center; font-size:13px; background:transparent;`;
        boxRename.appendChild(input);

        const boxSug = document.createElement("button");
        boxSug.type = "button";
        boxSug.className = "recolor-suggest";
        boxSug.style.cssText = `
          width:72px; height:44px; border-radius:12px; border:1px solid rgba(0,0,0,.18);
          background:${isHex6(sugHex) ? sugHex : "rgba(0,0,0,.03)"}; position:relative; overflow:hidden;
          cursor:${isHex6(sugHex) ? "pointer" : "not-allowed"}; display:flex; align-items:center; justify-content:center; padding:0;
        `;
        if (sugTag) boxSug.appendChild(makeBadgeCorner(sugTag));
        else if (sugHex) boxSug.appendChild(makeBadgeCorner("≈"));
        boxSug.setAttribute("data-sughex", sugHex);
        boxSug.setAttribute("data-sugtag", sugTag);
        boxSug.title = sugTag ? `Sugerido: ${sugTag} — ${sugHex}` : (sugHex ? `Sugerido: ${sugHex}` : "Sin sugerencia");

        boxSug.addEventListener("click", (e) => {
          e.stopPropagation();
          const sh = norm(boxSug.getAttribute("data-sughex") || "");
          const st = (boxSug.getAttribute("data-sugtag") || "").toString().trim();
          if (!isHex6(sh)) return;
          selectedOldHex = oldHex;
          applyReplacementToOldHex(oldHex, sh, st, { autoRename: true });
          picker.refreshUsedX();
          highlightRow(oldHex);
        });

        const stack = document.createElement("div");
        stack.style.cssText = "display:grid; gap:4px;";
        const meta = document.createElement("div");
        meta.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        meta.textContent = tagOriginal ? `Tag original: ${tagOriginal} | Color: ${oldHex}` : `Color: ${oldHex}`;
        const repl = document.createElement("div");
        repl.className = "row-text";
        repl.style.cssText = "font-size:12px; color: rgba(0,0,0,.70)";
        repl.textContent = "Reemplazo: —";
        stack.appendChild(meta);
        stack.appendChild(repl);

        input.addEventListener("input", () => {
          const v = input.value;
          labelNodes.forEach((t) => (t.textContent = v));
          applyTextColors();
          saveAllState();
        });

        row.appendChild(boxTag);
        row.appendChild(boxRepl);
        row.appendChild(boxRename);
        row.appendChild(boxSug);
        row.appendChild(stack);

        row.addEventListener("click", () => {
          selectedOldHex = oldHex;
          highlightRow(oldHex);
          saveAllState();
        });

        list.appendChild(row);

        rowByOldHex.set(oldHex, row);
        renameInputByOldHex.set(oldHex, input);
        labelNodesByOldHex.set(oldHex, labelNodes);
        suggestBtnByOldHex.set(oldHex, boxSug);
      });
    }

    // Restore mappings if same SVG
    function restoreMappingsIfAny() {
      const st = loadStored();
      if (!st || st.svgSig !== sig || !st.mappings) return;

      const mappings = st.mappings || {};
      for (const oldHex of Object.keys(mappings)) {
        const m = mappings[oldHex] || {};
        const row = rowByOldHex.get(norm(oldHex));
        if (!row) continue;

        const replHex = norm(m.replHex || "");
        const replTag = (m.replTag || "").toString();
        const rename = (m.rename || "").toString();

        if (rename && renameInputByOldHex.get(norm(oldHex))) {
          const inp = renameInputByOldHex.get(norm(oldHex));
          inp.value = rename;
          const nodes = labelNodesByOldHex.get(norm(oldHex)) || [];
          nodes.forEach((t) => (t.textContent = rename));
        }

        if (isHex6(replHex)) applyReplacementToOldHex(oldHex, replHex, replTag, { autoRename: false });
      }

      const sel = st.ui && st.ui.selectedOldHex ? norm(st.ui.selectedOldHex) : "";
      if (sel && rowByOldHex.has(sel)) { selectedOldHex = sel; highlightRow(sel); }

      picker.refreshUsedX();
      applyTextColors();
    }

    // ---------- Toggles row ----------
    const togglesRow = document.createElement("div");
    togglesRow.style.cssText = `
      margin-top: 12px; display:flex; align-items:center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap; padding: 10px;
      border: 1px solid rgba(0,0,0,.10); border-radius: 12px; background: rgba(0,0,0,.02);
    `;

    const togglesLeft = document.createElement("div");
    togglesLeft.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; align-items:center;";

    const btnColors = makeToggleButton("Colores", colorsOn, (on) => { colorsOn = on; setColorFills(recolorSvg, colorsOn); saveAllState(); });
    const btnBorders = makeToggleButton("Bordes", bordersOn, (on) => { bordersOn = on; setBorders(recolorSvg, bordersOn); saveAllState(); });
    const btnTextColor = makeToggleButton("Color textos", textColorModeOn, (on) => { textColorModeOn = on; applyTextColors(); saveAllState(); });

    // 🆕 Suggestion toggle
    const btnSug = makeToggleButton("Sugerencia 1:1 (sin repetir) + Preservar escala", suggestOneToOneOn, (on) => {
      suggestOneToOneOn = on;
      updateAllSuggestionTiles();
      saveAllState();
    });

    const sliderWrap = document.createElement("div");
    sliderWrap.style.cssText = `
      display:flex; align-items:center; gap:8px; padding: 8px 10px;
      border-radius: 12px; border: 1px solid rgba(0,0,0,.12); background: rgba(255,255,255,.9);
    `;
    const sliderLabel = document.createElement("div");
    sliderLabel.style.cssText = "font-size:12px; color: rgba(0,0,0,.70); font-weight:800;";
    sliderLabel.textContent = "Opacidad texto";
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "100";
    slider.value = String(Math.round(textOpacity * 100));
    slider.style.cssText = "width: 180px; cursor: pointer;";
    const sliderVal = document.createElement("div");
    sliderVal.style.cssText = "font-size:12px; color: rgba(0,0,0,.70); font-weight:900; width:44px; text-align:right;";
    sliderVal.textContent = `${Math.round(textOpacity * 100)}%`;
    slider.addEventListener("input", () => {
      const v = Math.max(0, Math.min(100, Number(slider.value || 0)));
      sliderVal.textContent = `${v}%`;
      textOpacity = v / 100;
      applyTextColors();
      saveAllState();
    });
    sliderWrap.appendChild(sliderLabel);
    sliderWrap.appendChild(slider);
    sliderWrap.appendChild(sliderVal);

    togglesLeft.appendChild(btnColors);
    togglesLeft.appendChild(btnBorders);
    togglesLeft.appendChild(btnTextColor);
    togglesLeft.appendChild(btnSug);
    togglesLeft.appendChild(sliderWrap);

    const hint = document.createElement("div");
    hint.style.cssText = "color: rgba(0,0,0,.65); font-size: 13px;";
    hint.textContent =
      "Sugerencia 1:1 usa Hungarian + rank L* + hue + neutral + refinamiento por swaps (gradientes). OFF vuelve a sugerencia local (ΔE00). Textos: OFF=negro con opacidad; ON=hex del reemplazo. Opacidad siempre aplica (también en export).";

    togglesRow.appendChild(togglesLeft);
    togglesRow.appendChild(hint);
    host.appendChild(togglesRow);

    // Apply initial suggestion updates (in case toggle loaded from memory)
    updateAllSuggestionTiles();

    restoreMappingsIfAny();
    applyTextColors();

    // ---------- Downloads ----------
    const dl = document.createElement("div");
    dl.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; margin-top: 12px;";
    host.appendChild(dl);

    const btnSvg = document.createElement("button");
    btnSvg.type = "button";
    btnSvg.textContent = "DOWNLOAD RECOLORED SVG";
    btnSvg.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900; display:inline-flex; align-items:center;";
    enhanceButton(btnSvg);
    btnSvg.addEventListener("click", async () => {
      setButtonLoading(btnSvg, true);
      try {
        applyTextColors();
        const svgText = new XMLSerializer().serializeToString(recolorSvg);
        downloadText("paintbynumber_recolored.svg", svgText, "image/svg+xml");
      } finally {
        setTimeout(() => setButtonLoading(btnSvg, false), 220);
      }
    });

    const btnPng = document.createElement("button");
    btnPng.type = "button";
    btnPng.textContent = "DOWNLOAD RECOLORED PNG";
    btnPng.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900; display:inline-flex; align-items:center;";
    enhanceButton(btnPng);
    btnPng.addEventListener("click", async () => {
      setButtonLoading(btnPng, true);
      try {
        applyTextColors();
        const svgClone = recolorSvg.cloneNode(true);
        await downloadSvgAsPngHQ(svgClone, "paintbynumber_recolored.png", 10);
      } catch (e) {
        console.error(e);
        alert("No pude exportar PNG. Revisa si el navegador bloqueó el canvas.");
      } finally {
        setButtonLoading(btnPng, false);
      }
    });

    dl.appendChild(btnSvg);
    dl.appendChild(btnPng);
  }

  // ---------- Floating launcher ----------
  function ensureFab() {
    let fab = document.getElementById("recolor-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.id = "recolor-fab";
    fab.style.cssText = `
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
      display: none; gap: 8px; align-items: center; padding: 10px; border-radius: 14px;
      background: rgba(255,255,255,.96); border: 1px solid rgba(0,0,0,.14);
      box-shadow: 0 12px 40px rgba(0,0,0,.18);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Abrir Recolorear";
    btn.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900; display:inline-flex; align-items:center;";
    enhanceButton(btn);
    btn.addEventListener("click", () => {
      const current = findFinalOutputSvgLight();
      if (!current) return alert("Aún no detecto el SVG final. Aprieta PROCESS IMAGE y espera el output.");
      openEditor(current);
    });

    const status = document.createElement("div");
    status.id = "recolor-fab-status";
    status.style.cssText = "font-size: 12px; color: rgba(0,0,0,.65); white-space:nowrap;";
    status.textContent = "Esperando output…";

    fab.appendChild(btn);
    fab.appendChild(status);
    document.body.appendChild(fab);
    return fab;
  }

  function updateFab() {
    const fab = ensureFab();
    const status = document.getElementById("recolor-fab-status");
    const ready = isGeneratorReady();
    fab.style.display = ready ? "flex" : "none";
    if (status) status.textContent = ready ? "Output detectado" : "Esperando output…";
  }

  window.addEventListener("load", () => {
    setTimeout(updateFab, 650);
    setTimeout(updateFab, 1600);
  });

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target && e.target.closest ? e.target.closest("button, a") : null;
      if (!el) return;
      const t = norm(el.textContent);
      if (t.includes("process image") || t.includes("download svg") || t.includes("download png") || t.includes("output")) {
        setTimeout(updateFab, 120);
        setTimeout(updateFab, 600);
      }
    },
    true
  );

  try { updateFab(); } catch (_) {}
})();
