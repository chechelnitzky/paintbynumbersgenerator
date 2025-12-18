// ===============================
// UNIFORM LABEL SIZE (integrado)
// ===============================
(function () {
  const KEY = "uniformLabelSizeEnabled";

  function getLabelSizeInput() {
    // Ajusta este selector si tu input tiene id. Ideal: #labelFontSize
    return document.querySelector('#labelFontSize') ||
           document.querySelector('input[name="labelFontSize"]') ||
           Array.from(document.querySelectorAll('input')).find(i =>
             (i.closest('.input-field')?.querySelector('label')?.textContent || '')
               .toLowerCase()
               .includes('label font size')
           );
  }

  function isUniformEnabled() {
    const el = document.getElementById("uniformLabelSizeToggle");
    if (el) return !!el.checked;
    return localStorage.getItem(KEY) === "1";
  }

  function setUniformEnabled(v) {
    localStorage.setItem(KEY, v ? "1" : "0");
  }

  // Esta es la función importante: pisa TODOS los <text>
  function applyUniformLabelSize(svgEl) {
    if (!svgEl) return { ok: false, reason: "no svg" };
    if (!isUniformEnabled()) return { ok: false, reason: "disabled" };

    const input = getLabelSizeInput();
    const size = input ? (parseFloat(input.value) || 0) : 0;
    if (!size) return { ok: false, reason: "no size" };

    const texts = svgEl.querySelectorAll("text");
    texts.forEach(t => {
      // atributo
      t.setAttribute("font-size", String(size));
      // style inline por si el generador lo usa
      const s = t.getAttribute("style") || "";
      if (/font-size\s*:/i.test(s)) {
        t.setAttribute("style", s.replace(/font-size\s*:\s*[^;]+/i, `font-size:${size}px`));
      } else {
        t.setAttribute("style", (s ? s.replace(/\s*;?\s*$/, "; ") : "") + `font-size:${size}px;`);
      }
    });

    return { ok: true, size, count: texts.length };
  }

  // UI: insertar toggle al lado del input "Label font size"
  function mountUniformToggle() {
    const input = getLabelSizeInput();
    if (!input) return false;

    if (document.getElementById("uniformLabelSizeWrap")) return true;

    const wrap = document.createElement("div");
    wrap.id = "uniformLabelSizeWrap";
    wrap.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap;";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.id = "uniformLabelSizeToggle";
    chk.style.cssText = "transform:scale(1.1);";

    chk.checked = localStorage.getItem(KEY) === "1";

    chk.addEventListener("change", () => {
      setUniformEnabled(chk.checked);

      // Al activar/desactivar, aplica inmediatamente sobre el SVG actual
      const svg = document.querySelector("#svgContainer svg");
      const r = applyUniformLabelSize(svg);
      console.log("🔠 Uniform label size:", r);
    });

    const lbl = document.createElement("label");
    lbl.htmlFor = chk.id;
    lbl.textContent = "Forzar tamaño uniforme";
    lbl.style.cssText = "font-weight:600;cursor:pointer;user-select:none;";

    wrap.appendChild(chk);
    wrap.appendChild(lbl);

    // Insertar justo bajo el input (o al lado según estructura)
    // Si tu input está dentro de .input-field, lo ponemos ahí.
    const host = input.closest(".input-field") || input.parentElement;
    host.appendChild(wrap);

    // Si cambia el valor del input font size y el toggle está ON, re-aplica
    input.addEventListener("input", () => {
      if (!isUniformEnabled()) return;
      const svg = document.querySelector("#svgContainer svg");
      applyUniformLabelSize(svg);
    });

    return true;
  }

  // Hook de render: llama applyUniformLabelSize DESPUÉS de generar SVG
  // OPCIÓN A (recomendada): envolver generateSVG si existe global
  function hookGenerateSVG() {
    if (typeof window.generateSVG !== "function") return false;
    if (window.__uniformHookInstalled) return true;

    window.__uniformHookInstalled = true;
    const original = window.generateSVG;

    window.generateSVG = function (...args) {
      const res = original.apply(this, args);

      // Espera al DOM (por si el SVG se inserta async)
      setTimeout(() => {
        const svg = document.querySelector("#svgContainer svg");
        const r = applyUniformLabelSize(svg);
        if (r.ok) console.log("🔠 Uniform aplicado post-generate:", r);
      }, 0);

      return res;
    };

    return true;
  }

  // Init (reintenta hasta que exista el input y/o generateSVG)
  function initUniformLabelSize() {
    let tries = 0;
    const t = setInterval(() => {
      const okUI = mountUniformToggle();
      const okHook = hookGenerateSVG();

      if ((okUI || tries > 40) && (okHook || tries > 40)) {
        clearInterval(t);
        console.log("✅ Uniform label size integrado");
      }
      tries++;
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUniformLabelSize);
  } else {
    initUniformLabelSize();
  }

  // Exponer por si quieres llamarlo desde otros lados
  window.applyUniformLabelSize = () => {
    const svg = document.querySelector("#svgContainer svg");
    return applyUniformLabelSize(svg);
  };
})();
