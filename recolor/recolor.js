/* Recolor add-on (v11.2.0)
   ✅ Versioned addon (ADDON_VERSION always present)
   ✅ Page small version title injected above "Paint by number generator"
   ✅ Text color fix: OFF uses ORIGINAL SVG text fill (not forced black). Slider always applies.
   ✅ Suggestion modes selector:
        1) OFF (Closest) [DEFAULT]
        2) SOFT (recommended)
        3) HARD (experimental)
   ✅ SOFT optimization: context + reuse penalty + dark/neutral penalties + highlight/shadow filtering
   ✅ HARD: Hungarian 1:1 over scoreBase (no repeats) + N>167 handling
   ✅ UI preserved (picker, renombrar, toggles, downloads)
*/

(function () {
  // =====================================================================
  // VERSION (FIX #2: always have a version number)
  // =====================================================================
  const ADDON_VERSION = "11.2.0";
  const ADDON_NAME = `Recolor ${ADDON_VERSION}`;

  // ---------- Config ----------
  const PALETTE_ITEMS = window.PALETTE_ITEMS || [];
  const PALETTE = window.PALETTE_168 || PALETTE_ITEMS.map((x) => x.hex);

  const norm = (v) => (v || "").toString().trim().toLowerCase();
  const isHex6 = (s) => /^#[0-9a-f]{6}$/i.test(s);
  const isTagLike = (t) => /^[a-z0-9]{1,6}$/i.test((t || "").toString().trim());

  // =====================================================================
  // FIX #1: inject small version title above the page title
  // =====================================================================
  function injectVersionTitleAboveH1() {
    // Find the main H1 that says "Paint by number generator"
    const h1 = Array.from(document.querySelectorAll("h1, h2, .title, header h1"))
      .find((el) => /paint by number generator/i.test((el.textContent || "").trim()));
    if (!h1) return;

    // Avoid duplicates
    if (document.getElementById("pbn-addon-version-title")) return;

    const small = document.createElement("div");
    small.id = "pbn-addon-version-title";
    small.textContent = ADDON_NAME;
    small.style.cssText = `
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .02em;
      color: rgba(220, 38, 38, .95); /* red-ish, subtle */
      margin: 2px 0 6px 0;
      line-height: 1.1;
    `;

    // Insert above the title
    h1.parentNode.insertBefore(small, h1);
  }

  // ---------- Memory ----------
  const STORAGE_KEY = "recolor_state_v1120";
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
      .recolor-seg { display:inline-flex; border:1px solid rgba(0,0,0,.18); border-radius:12px; overflow:hidden; background:rgba(255,255,255,.88); }
      .recolor-seg button { border:0; background:transparent; padding:10px 12px; font-weight:900; cursor:pointer; font-size:12px; }
      .recolor-seg button.active { background:white; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
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

  // =====================================================================
  //  COLOR SCIENCE ENGINE (ΔE00 + SOFT/HARD suggestion modes)
  // =====================================================================

  function srgbToLinear(u) { return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function rgb01ToXyzD65(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    return {
      x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
      y: R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
      z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
    };
  }
  function fLab(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); }
  function xyzToLabD65(x, y, z) {
    const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
    const fx = fLab(x / Xn), fy = fLab(y / Yn), fz = fLab(z / Zn);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }
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

  // ================================================================
  // REQUIRED DELIVERY FUNCTIONS (as requested)
  // ================================================================

  // 0) Precompute palette cache (once)
  function computePaletteCache(paletteItemsOrHexes) {
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
        L: lab.L, a: lab.a, b: lab.b, C: lab.C, h: lab.h,
        lab,
      });
    }
    return cache;
  }

  // 2) Top-K candidates per tag with scoreBase and highlight/shadow filtering
  // scoreBase = ΔE00 + darkPenalty + neutralPenalty
  // darkPenalty = wDark * max(0, (Lo - Lp) - 4)^2
  // neutralPenalty = (C_orig < 6) ? wNeu * max(0, C_pal - C_orig) : 0
  function computeTopKCandidates(tags, paletteCache, params) {
    const K = params.K ?? 10;
    const wDark = params.wDark ?? 0.04;
    const wNeu = params.wNeu ?? 0.08;

    const topK = new Array(tags.length);
    const allScores = new Array(tags.length);

    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      const Lo = t.L;
      const Co = t.C;
      const labO = t.lab;

      const scores = new Float64Array(paletteCache.length);

      const raw = [];
      for (let p = 0; p < paletteCache.length; p++) {
        const pal = paletteCache[p];
        const dE = deltaE00(labO, pal.lab);

        const darkOver = Math.max(0, (Lo - pal.L) - 4);
        const darkPenalty = wDark * (darkOver * darkOver);

        const neutralPenalty = (Co < 6) ? (wNeu * Math.max(0, pal.C - Co)) : 0;

        const scoreBase = dE + darkPenalty + neutralPenalty;

        scores[p] = scoreBase;

        raw.push({
          palIdx: p,
          hex: pal.hex,
          tag: pal.tag,
          L: pal.L, C: pal.C, h: pal.h,
          dE,
          darkPenalty,
          neutralPenalty,
          scoreBase,
        });
      }

      // Highlight/shadow filters
      let filtered = raw;
      if (Lo > 75) {
        const f = raw.filter((c) => c.L >= 65);
        if (f.length >= Math.min(K, 5)) filtered = f; // only apply if enough candidates survive
      } else if (Lo < 25) {
        const f = raw.filter((c) => c.L <= 40);
        if (f.length >= Math.min(K, 5)) filtered = f;
      }

      filtered.sort((a, b) => a.scoreBase - b.scoreBase || a.palIdx - b.palIdx);
      topK[i] = filtered.slice(0, K);

      allScores[i] = scores;
    }

    return { topK, allScores };
  }

  // 3) Neighbor	bt/context:
  // Preferred: proximity graph from SVG geometry (bbox distances between color groups)
  // Fallback: KNN in Lab (K=3)
  function buildNeighborGraphFromSVG(svgEl, rawEntries, tags, params) {
    const K = params.ctxK ?? 3;
    const n = tags.length;
    const graph = Array.from({ length: n }, () => []);

    // Helper: bbox union for a color group
    function groupBBox(nodes) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let ok = false;
      const sample = nodes.slice(0, 60);
      for (const el of sample) {
        try {
          const bb = el.getBBox();
          if (!bb || !Number.isFinite(bb.x)) continue;
          ok = true;
          minX = Math.min(minX, bb.x);
          minY = Math.min(minY, bb.y);
          maxX = Math.max(maxX, bb.x + bb.width);
          maxY = Math.max(maxY, bb.y + bb.height);
        } catch (_) {}
      }
      if (!ok) return null;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return { minX, minY, maxX, maxY, cx, cy };
    }

    // bbox distance (0 if overlapping)
    function bboxDist(a, b) {
      const dx = (a.maxX < b.minX) ? (b.minX - a.maxX) : (b.maxX < a.minX) ? (a.minX - b.maxX) : 0;
      const dy = (a.maxY < b.minY) ? (b.minY - a.maxY) : (b.maxY < a.minY) ? (a.minY - b.maxY) : 0;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Precompute bboxes
    const bboxes = new Array(n);
    let anyBBox = false;
    for (let i = 0; i < n; i++) {
      const nodes = rawEntries[i]?.nodes || [];
      const bb = groupBBox(nodes);
      bboxes[i] = bb;
      if (bb) anyBBox = true;
    }

    // If bbox is available: build proximity KNN by bbox distance
    if (anyBBox) {
      for (let i = 0; i < n; i++) {
        if (!bboxes[i]) continue;
        const arr = [];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          if (!bboxes[j]) continue;
          const dGeom = bboxDist(bboxes[i], bboxes[j]);
          arr.push({ j, dGeom });
        }
        arr.sort((a, b) => a.dGeom - b.dGeom);
        const knn = arr.slice(0, Math.max(0, K));
        for (const e of knn) {
          const dOrig = deltaE00(tags[i].lab, tags[e.j].lab);
          graph[i].push({ j: e.j, dOrig });
        }
      }

      // If too sparse (some nodes have no neighbors), fill with Lab KNN fallback for those nodes
      for (let i = 0; i < n; i++) {
        if (graph[i].length) continue;
        const arr = [];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const d = deltaE00(tags[i].lab, tags[j].lab);
          arr.push({ j, d });
        }
        arr.sort((a, b) => a.d - b.d);
        const knn = arr.slice(0, Math.max(0, K));
        for (const e of knn) graph[i].push({ j: e.j, dOrig: e.d });
      }

      return graph;
    }

    // Fallback: Lab KNN (K=3)
    for (let i = 0; i < n; i++) {
      const arr = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = deltaE00(tags[i].lab, tags[j].lab);
        arr.push({ j, d });
      }
      arr.sort((a, b) => a.d - b.d);
      const knn = arr.slice(0, Math.max(0, K));
      for (const e of knn) graph[i].push({ j: e.j, dOrig: e.d });
    }
    return graph;
  }

  // 4) Mode OFF (Closest): choose candidate #1 per tag by scoreBase (repeats allowed)
  function suggestClosest(tags, paletteCache, allScores) {
    const mapping = new Map();
    for (let i = 0; i < tags.length; i++) {
      const scores = allScores[i];
      let best = 0;
      let bestV = scores[0];
      for (let p = 1; p < scores.length; p++) {
        const v = scores[p];
        if (v < bestV) { bestV = v; best = p; }
      }
      const pal = paletteCache[best];
      mapping.set(tags[i].hex, { hex: pal.hex, tag: pal.tag, palIdx: best, mode: "OFF" });
    }
    return mapping;
  }

  // Hungarian for rectangular n<=m (min cost). Returns array assign[i]=j
  function hungarianAssign(costMatrix) {
    const n = costMatrix.length;
    const m = costMatrix[0].length;
    if (n === 0) return [];
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

      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0);
    }

    const assign = new Int32Array(n);
    for (let j = 1; j <= m; j++) if (p[j] > 0) assign[p[j] - 1] = j - 1;
    return Array.from(assign);
  }

  // 5) Mode HARD (experimental): Hungarian 1:1 over scoreBase, no repeats.
  // If N > 167: assign 1:1 to top 167 by weight, rest closest.
  function suggestHardHungarian(tags, paletteCache, allScores, params) {
    const m = paletteCache.length;
    const N = tags.length;

    // Select active set
    let activeIdx = tags.map((_, i) => i);
    if (N > m) {
      activeIdx = tags
        .map((t, i) => ({ i, w: t.weight || 1 }))
        .sort((a, b) => b.w - a.w || a.i - b.i)
        .slice(0, m)
        .map((x) => x.i);
    }

    const active = activeIdx.map((i) => tags[i]);

    // Build cost matrix for active: n<=m, each row is scoreBase across all palette
    const cost = active.map((t, k) => {
      const scores = allScores[activeIdx[k]];
      // Copy into a Float64Array for speed
      const row = new Float64Array(m);
      for (let j = 0; j < m; j++) row[j] = scores[j];
      return row;
    });

    const assign = hungarianAssign(cost);

    const used = new Set(assign);

    const mapping = new Map();

    // active unique assignments
    for (let k = 0; k < active.length; k++) {
      const i = activeIdx[k];
      const j = assign[k];
      const pal = paletteCache[j];
      mapping.set(tags[i].hex, { hex: pal.hex, tag: pal.tag, palIdx: j, mode: "HARD" });
    }

    // remaining tags: closest among USED palette colors
    function closestAmongUsed(lab) {
      let bestJ = -1, bestD = Infinity;
      for (const j of used) {
        const d = deltaE00(lab, paletteCache[j].lab);
        if (d < bestD) { bestD = d; bestJ = j; }
      }
      return bestJ;
    }

    if (N > m) {
      for (let i = 0; i < N; i++) {
        if (mapping.has(tags[i].hex)) continue;
        const j = closestAmongUsed(tags[i].lab);
        const pal = j >= 0 ? paletteCache[j] : null;
        mapping.set(tags[i].hex, { hex: pal ? pal.hex : "", tag: pal ? pal.tag : "", palIdx: j, mode: "HARD_closestUsed" });
      }
    }

    return mapping;
  }

  // 6) Mode SOFT (RECOMMENDED): iterative optimization with reuse+context penalties.
  // E = Σ scoreBase(i, ai) + wCtx Σ_edges |dOrig - dPal(ai,aj)| + wReuse Σ_c count[c]^2
  function suggestSoftOptimize(tags, paletteCache, topK, neighborGraph, params) {
    const wCtx = params.wCtx ?? 0.25;
    const wReuse = params.wReuse ?? 0.8;
    const ITER = params.ITER ?? 800;

    const n = tags.length;
    const m = paletteCache.length;

    // Precompute palette-palette ΔE00 matrix once (167x167)
    const palDE = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) {
      palDE[i][i] = 0;
      for (let j = i + 1; j < m; j++) {
        const d = deltaE00(paletteCache[i].lab, paletteCache[j].lab);
        palDE[i][j] = d;
        palDE[j][i] = d;
      }
    }

    // init assign to candidate #1
    const assign = new Int32Array(n);
    const baseScore = new Float64Array(n);
    const counts = new Int32Array(m);

    for (let i = 0; i < n; i++) {
      const c0 = topK[i][0];
      assign[i] = c0.palIdx;
      baseScore[i] = c0.scoreBase;
      counts[c0.palIdx] += 1;
    }

    // Helper: reuse delta when moving i from old->new
    function deltaReuse(oldIdx, newIdx) {
      if (oldIdx === newIdx) return 0;
      const cOld = counts[oldIdx];
      const cNew = counts[newIdx];
      // before: cOld^2 + cNew^2
      // after:  (cOld-1)^2 + (cNew+1)^2
      return wReuse * (((cOld - 1) * (cOld - 1) + (cNew + 1) * (cNew + 1)) - (cOld * cOld + cNew * cNew));
    }

    // Context delta: only incident edges to i
    function deltaCtx(i, oldPal, newPal) {
      if (oldPal === newPal) return 0;
      const edges = neighborGraph[i] || [];
      let d = 0;
      for (const e of edges) {
        const j = e.j;
        const aj = assign[j];
        const dOrig = e.dOrig;
        const oldTerm = Math.abs(dOrig - palDE[oldPal][aj]);
        const newTerm = Math.abs(dOrig - palDE[newPal][aj]);
        d += (newTerm - oldTerm);
      }
      return wCtx * d;
    }

    // "Problematic" selection: bias to high base score and high reuse
    function pickProblematic() {
      // sample a few random indices and pick worst
      let bestI = 0;
      let bestVal = -Infinity;
      const S = Math.min(18, n);
      for (let s = 0; s < S; s++) {
        const i = (Math.random() * n) | 0;
        const ai = assign[i];
        const reusePressure = counts[ai]; // higher => more repeated
        const val = baseScore[i] + 0.35 * reusePressure;
        if (val > bestVal) { bestVal = val; bestI = i; }
      }
      return bestI;
    }

    for (let it = 0; it < ITER; it++) {
      const i = pickProblematic();
      const oldPal = assign[i];
      const oldBase = baseScore[i];

      let bestDelta = 0;
      let bestNew = oldPal;
      let bestNewBase = oldBase;

      const cands = topK[i];
      for (let k = 0; k < cands.length; k++) {
        const cand = cands[k];
        const newPal = cand.palIdx;
        if (newPal === oldPal) continue;

        const dBase = cand.scoreBase - oldBase;
        const dC = deltaCtx(i, oldPal, newPal);
        const dR = deltaReuse(oldPal, newPal);

        const dTotal = dBase + dC + dR;

        if (dTotal < bestDelta) {
          bestDelta = dTotal;
          bestNew = newPal;
          bestNewBase = cand.scoreBase;
        }
      }

      if (bestNew !== oldPal) {
        // apply
        counts[oldPal] -= 1;
        counts[bestNew] += 1;
        assign[i] = bestNew;
        baseScore[i] = bestNewBase;
      }
    }

    // Build mapping
    const mapping = new Map();
    for (let i = 0; i < n; i++) {
      const j = assign[i];
      const pal = paletteCache[j];
      mapping.set(tags[i].hex, { hex: pal.hex, tag: pal.tag, palIdx: j, mode: "SOFT" });
    }
    return mapping;
  }

  // Unified entry: suggestMapping(mode)
  function suggestMapping(mode, ctx) {
    if (mode === "OFF") return suggestClosest(ctx.tags, ctx.paletteCache, ctx.allScores);
    if (mode === "HARD") return suggestHardHungarian(ctx.tags, ctx.paletteCache, ctx.allScores, ctx.params);
    if (mode === "SOFT") return suggestSoftOptimize(ctx.tags, ctx.paletteCache, ctx.topK, ctx.neighborGraph, ctx.params);
    return suggestClosest(ctx.tags, ctx.paletteCache, ctx.allScores);
  }

  // =====================================================================
  // SVG sizing / selection
  // =====================================================================

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
      if (pngBlob) { forceDownloadBlob(pngBlob, filename); return;_toggle }
    } catch (_) {}

    // fallback via <img>
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

    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = "display:flex; flex-direction:column; gap:2px;";
    const vBadge = document.createElement("div");
    vBadge.textContent = ADDON_NAME;
    vBadge.style.cssText = "font-weight:900; font-size:12px; color: rgba(220,38,38,.95);";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:900;";
    title.textContent = `Recoloreo (paleta ${PALETTE.length})`;
    titleWrap.appendChild(vBadge);
    titleWrap.appendChild(title);

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Cerrar";
    close.style.cssText = "padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.22); background:white; cursor:pointer; font-weight:900; display:inline-flex; align-items:center;";
    enhanceButton(close);
    close.addEventListener("click", () => overlay.remove());

    topbar.appendChild(titleWrap);
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
    let textColorModeOn = false; // OFF => original svg text fill
    let textOpacity = 0.7; // ALWAYS applied
    let selectedOldHex = null;

    // FIX #3 UX: default suggestion mode OFF
    let suggestMode = "OFF"; // "OFF" | "SOFT" | "HARD"

    const storedNow = loadStored();
    const savedUi = storedNow && storedNow.svgSig === sig && storedNow.ui ? storedNow.ui : {};
    if (typeof savedUi.colorsOn === "boolean") colorsOn = savedUi.colorsOn;
    if (typeof savedUi.bordersOn === "boolean") bordersOn = savedUi.bordersOn;
    if (typeof savedUi.textColorModeOn === "boolean") textColorModeOn = savedUi.textColorModeOn;
    if (typeof savedUi.textOpacity === "number") textOpacity = Math.max(0, Math.min(1, savedUi.textOpacity));
    if (typeof savedUi.selectedOldHex === "string") selectedOldHex = savedUi.selectedOldHex;
    if (typeof savedUi.suggestMode === "string" && ["OFF", "SOFT", "HARD"].includes(savedUi.suggestMode)) {
      suggestMode = savedUi.suggestMode;
    } else {
      suggestMode = "OFF"; // enforce default OFF if not present
    }

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
      const map = new Map(); // tagLower ->uterto1
::contentReference[oaicite:0]{index=0}
