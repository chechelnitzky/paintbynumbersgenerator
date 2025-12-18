/* dayu_simple.js - v15: Re-render tipo "Show Borders" + Tiempo real */

(function () {
  "use strict";

  const VERSION = "v15";
  console.log(`🎨 DAYU ${VERSION} - Re-render tipo "Show Borders" + Tiempo real`);

  if (!window.DAYU_PALETTE) {
    console.error("❌ DAYU_PALETTE no encontrada");
    return;
  }

  window.dayuMapping = window.dayuMapping || {};

  let svgObserver = null;
  let paletaObserver = null;
  let isUpdating = false;
  let generarSVGOriginal = null; // Guardar la función original

  // ======================
  // UTILIDADES
  // ======================

  function dist(rgb1, rgb2) {
    return (
      Math.pow(rgb1[0] - rgb2[0], 2) +
      Math.pow(rgb1[1] - rgb2[1], 2) +
      Math.pow(rgb1[2] - rgb2[2], 2)
    );
  }

  function hex(rgb) {
    return (
      "#" +
      rgb
        .map((v) => ("0" + Math.round(v).toString(16)).slice(-2))
        .join("")
    );
  }

  function hexToRgb(hexColor) {
    const h = hexColor.replace("#", "");
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16),
    ];
  }

  function parseRgb(el) {
    const m = window
      .getComputedStyle(el)
      .backgroundColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  function encontrarDayuPorCodigo(codigo) {
    return window.DAYU_PALETTE.find(
      (d) => d.code.toUpperCase() === codigo.toUpperCase()
    );
  }

  // ======================
  // FORZAR REGENERACIÓN SVG (LEGACY)
  // ======================

  function forzarRegeneracionSVG() {
    console.log("🔄 Forzando regeneración del SVG (legacy)...");

    // Método 1: Buscar el botón de generar SVG
    const btnGenerar =
      document.querySelector('button[onclick*="generate"]') ||
      // Nota: ":contains" NO existe en querySelector nativo, se deja como fallback nulo
      document.querySelector('button:contains("Generate")') ||
      Array.from(document.querySelectorAll("button")).find((b) => {
        const t = (b.textContent || "").toLowerCase();
        return t.includes("generate") || t.includes("generar");
      });

    if (btnGenerar) {
      console.log("✅ Encontrado botón generar, ejecutando...");
      btnGenerar.click();
      return true;
    }

    // Método 2: Buscar función generateSVG en window
    if (typeof window.generateSVG === "function") {
      console.log("✅ Encontrada función generateSVG(), ejecutando...");
      window.generateSVG();
      return true;
    }

    // Método 3: Simular cambio en el slider
    const slider = document.querySelector('input[type="range"]');
    if (slider) {
      console.log("✅ Simulando cambio en slider...");
      const valorActual = parseFloat(slider.value);

      // Cambiar temporalmente
      slider.value = valorActual + 0.01;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));

      // Volver al valor original
      setTimeout(() => {
        slider.value = valorActual;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      }, 100);

      return true;
    }

    console.log("⚠️ No se encontró método de regeneración");
    return false;
  }

  // ======================
  // FORZAR RE-RENDER (UI NUDGE tipo Show Borders)
  // ======================

  function forzarRerenderComoBorders() {
    console.log('⚡ Forzando re-render estilo "Show borders"...');

    // A) Intentar encontrar el toggle/checkbox de "borders"
    const candidates = Array.from(
      document.querySelectorAll('input[type="checkbox"], button, a, label')
    );

    const borderEl = candidates.find((el) => {
      const t = (el.textContent || "").toLowerCase();
      const aria =
        (el.getAttribute &&
          (el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            "")) ||
        "";
      const a = aria.toLowerCase();

      return (
        t.includes("border") ||
        t.includes("borde") ||
        a.includes("border") ||
        a.includes("borde")
      );
    });

    // Si encontramos un checkbox real asociado a borders, hacemos toggle doble (y volvemos al estado original)
    const checkbox =
      borderEl && borderEl.tagName === "INPUT" && borderEl.type === "checkbox"
        ? borderEl
        : borderEl
        ? borderEl.querySelector?.('input[type="checkbox"]')
        : null;

    if (checkbox) {
      const original = checkbox.checked;

      checkbox.checked = !original;
      checkbox.dispatchEvent(new Event("input", { bubbles: true }));
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      setTimeout(() => {
        checkbox.checked = original;
        checkbox.dispatchEvent(new Event("input", { bubbles: true }));
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("✅ Re-render disparado via checkbox borders");
      }, 40);

      return true;
    }

    // B) Si no hay checkbox, intentar click doble sobre un botón/label relacionado
    if (
      borderEl &&
      (borderEl.tagName === "BUTTON" ||
        borderEl.tagName === "A" ||
        borderEl.tagName === "LABEL")
    ) {
      borderEl.click();
      setTimeout(() => borderEl.click(), 40);
      console.log("✅ Re-render disparado via click doble borders");
      return true;
    }

    // C) Fallback genérico: "nudge" en controles típicos (select / range / checkbox)
    // Sin alterar el estado final: tocamos y devolvemos.
    const range = document.querySelector('input[type="range"]');
    if (range) {
      const v = range.value;
      range.value = String(parseFloat(v) + 0.01);
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));

      setTimeout(() => {
        range.value = v;
        range.dispatchEvent(new Event("input", { bubbles: true }));
        range.dispatchEvent(new Event("change", { bubbles: true }));
      }, 40);

      console.log("✅ Re-render disparado via range nudge");
      return true;
    }

    const anyCheckbox = document.querySelector('input[type="checkbox"]');
    if (anyCheckbox) {
      const original = anyCheckbox.checked;

      anyCheckbox.checked = !original;
      anyCheckbox.dispatchEvent(new Event("input", { bubbles: true }));
      anyCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

      setTimeout(() => {
        anyCheckbox.checked = original;
        anyCheckbox.dispatchEvent(new Event("input", { bubbles: true }));
        anyCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      }, 40);

      console.log("✅ Re-render disparado via checkbox genérico");
      return true;
    }

    const anySelect = document.querySelector("select");
    if (anySelect && anySelect.options && anySelect.options.length > 1) {
      const original = anySelect.selectedIndex;

      anySelect.selectedIndex = (original + 1) % anySelect.options.length;
      anySelect.dispatchEvent(new Event("input", { bubbles: true }));
      anySelect.dispatchEvent(new Event("change", { bubbles: true }));

      setTimeout(() => {
        anySelect.selectedIndex = original;
        anySelect.dispatchEvent(new Event("input", { bubbles: true }));
        anySelect.dispatchEvent(new Event("change", { bubbles: true }));
      }, 40);

      console.log("✅ Re-render disparado via select nudge");
      return true;
    }

    console.log("⚠️ No se pudo forzar re-render por UI nudge");
    return false;
  }

  // ======================
  // HOOK EN LA GENERACIÓN
  // ======================

  function instalarHookGeneracion() {
    // Buscar generateSVG en el scope global
    if (typeof window.generateSVG === "function" && !generarSVGOriginal) {
      generarSVGOriginal = window.generateSVG;

      window.generateSVG = function (...args) {
        console.log("🎯 Interceptado generateSVG()");

        // Llamar función original
        const resultado = generarSVGOriginal.apply(this, args);

        // Esperar a que el SVG se renderice y aplicar DAYU
        setTimeout(() => {
          if (Object.keys(window.dayuMapping).length > 0) {
            console.log("🎨 Aplicando DAYU después de generación...");
            const r = actualizarSVG();
            mostrarStatus(
              `🎨 DAYU aplicado: ${r.textos} textos | ${r.colores} áreas`,
              "success"
            );
          }
        }, 200);

        return resultado;
      };

      console.log("✅ Hook instalado en generateSVG()");
    }
  }

  // ======================
  // UI - BOTONES
  // ======================

  function crearBotones() {
    const p = document.getElementById("palette");
    if (!p) return false;

    // Indicador de versión
    if (!document.getElementById("dayuVersion")) {
      const versionDiv = document.createElement("div");
      versionDiv.id = "dayuVersion";
      versionDiv.textContent = `DAYU ${VERSION}`;
      versionDiv.style.cssText =
        "display:inline-block;margin:0 10px 5px 0;padding:4px 10px;background:#9C27B0;color:white;border-radius:3px;font-size:11px;font-weight:bold;letter-spacing:0.5px;";
      p.parentNode.insertBefore(versionDiv, p);
    }

    // Botón mapear
    if (!document.getElementById("btnDayu")) {
      const btn = document.createElement("button");
      btn.id = "btnDayu";
      btn.textContent = "🎨 MAPEAR A DAYU";
      btn.className = "waves-effect waves-light btn";
      btn.style.cssText =
        "margin:10px 5px 10px 0;background:linear-gradient(135deg,#667eea,#764ba2);font-weight:bold;";
      btn.onclick = iniciarMapeo;
      p.parentNode.insertBefore(btn, p);
    }

    // Botón regenerar SVG
    if (!document.getElementById("btnRegenerar")) {
      const btnRegen = document.createElement("button");
      btnRegen.id = "btnRegenerar";
      btnRegen.textContent = "🔄 REGENERAR SVG";
      btnRegen.className = "waves-effect waves-light btn";
      btnRegen.style.cssText =
        "margin:10px 5px;background:#00BCD4;font-weight:bold;display:none;";
      btnRegen.onclick = () => {
        console.log("🔄 Regenerando/Re-renderizando...");

        // NUEVO: primero disparar el camino tipo "borders"
        const exito = forzarRerenderComoBorders() || forzarRegeneracionSVG();

        if (exito) {
          mostrarStatus("🔄 Re-render/regeneración disparada...", "info");
        } else {
          // Si no funciona, al menos actualizar manualmente
          actualizarCajitas();
          const resultado = actualizarSVG();
          mostrarStatus(
            `🔄 Actualizado: ${resultado.textos} textos | ${resultado.colores} áreas`,
            "info"
          );
        }
      };
      p.parentNode.insertBefore(btnRegen, p);
    }

    // Botón limpiar
    if (!document.getElementById("btnLimpiar")) {
      const btn2 = document.createElement("button");
      btn2.id = "btnLimpiar";
      btn2.textContent = "🗑️ LIMPIAR";
      btn2.className = "waves-effect waves-light btn red";
      btn2.style.cssText = "margin:10px 5px;font-weight:bold;display:none;";
      btn2.onclick = () => {
        if (confirm("¿Limpiar el mapeo DAYU?")) {
          window.dayuMapping = {};
          detenerObservers();
          location.reload();
        }
      };
      p.parentNode.insertBefore(btn2, p);
    }

    // Status
    if (!document.getElementById("dayuStatus")) {
      const status = document.createElement("div");
      status.id = "dayuStatus";
      status.style.cssText =
        "margin:10px 0;padding:10px;background:#e3f2fd;border-left:4px solid #2196F3;border-radius:4px;font-size:13px;display:none;font-weight:600;";
      p.parentNode.insertBefore(status, p);
    }

    return true;
  }

  function mostrarStatus(mensaje, tipo = "info") {
    const status = document.getElementById("dayuStatus");
    if (!status) return;

    const colores = {
      info: { bg: "#e3f2fd", border: "#2196F3" },
      success: { bg: "#e8f5e9", border: "#4CAF50" },
      warning: { bg: "#fff3e0", border: "#FF9800" },
      error: { bg: "#ffebee", border: "#f44336" },
    };

    const c = colores[tipo] || colores.info;
    status.style.display = "block";
    status.style.background = c.bg;
    status.style.borderColor = c.border;
    status.textContent = mensaje;
  }

  function mostrarBotonesActivos() {
    const btnRegenerar = document.getElementById("btnRegenerar");
    const btnLimpiar = document.getElementById("btnLimpiar");

    if (btnRegenerar) btnRegenerar.style.display = "inline-block";
    if (btnLimpiar) btnLimpiar.style.display = "inline-block";
  }

  // ======================
  // MAPEO INICIAL
  // ======================

  function iniciarMapeo() {
    console.log("🎨 Iniciando mapeo...");

    const cajitas = obtenerCajitas();
    if (!cajitas.length) {
      alert("❌ No se encontraron colores en la paleta");
      return;
    }

    const coloresOriginales = cajitas
      .map((caja, idx) => {
        const rgb = parseRgb(caja);
        const num = caja.textContent.trim();

        return {
          numero: num,
          rgb: rgb,
          caja: caja,
          indice: idx,
        };
      })
      .filter((c) => c.rgb);

    if (!coloresOriginales.length) {
      alert("❌ No se pudieron extraer los colores");
      return;
    }

    console.log(`📊 ${coloresOriginales.length} colores originales detectados`);

    const distancias = [];
    coloresOriginales.forEach((orig) => {
      window.DAYU_PALETTE.forEach((dayu, dayuIdx) => {
        distancias.push({
          numOriginal: orig.numero,
          rgbOriginal: orig.rgb,
          caja: orig.caja,
          dayuIdx: dayuIdx,
          dayuCode: dayu.code,
          dayuHex: dayu.hex,
          dayuRgb: dayu.rgb,
          distancia: dist(orig.rgb, dayu.rgb),
        });
      });
    });

    distancias.sort((a, b) => a.distancia - b.distancia);

    const numerosUsados = new Set();
    const dayuUsados = new Set();
    window.dayuMapping = {};

    for (const d of distancias) {
      if (numerosUsados.has(d.numOriginal) || dayuUsados.has(d.dayuIdx)) {
        continue;
      }

      numerosUsados.add(d.numOriginal);
      dayuUsados.add(d.dayuIdx);

      window.dayuMapping[d.numOriginal] = {
        code: d.dayuCode,
        hex: d.dayuHex,
        rgb: d.dayuRgb,
        rgbOriginal: d.rgbOriginal,
        hexOriginal: hex(d.rgbOriginal),
      };

      if (Object.keys(window.dayuMapping).length === coloresOriginales.length) {
        break;
      }
    }

    console.log("✅ Mapeo creado:", window.dayuMapping);

    // Actualizar cajitas
    actualizarCajitas();

    // Aplicar al SVG
    const resultado = actualizarSVG();

    // Iniciar observers y hooks
    iniciarObservers();
    instalarHookGeneracion();

    // Mostrar botones
    mostrarBotonesActivos();

    // Status
    mostrarStatus(
      `✅ Mapeo completado: ${Object.keys(window.dayuMapping).length} colores | ${resultado.textos} textos | ${resultado.colores} áreas`,
      "success"
    );

    console.log("🎉 Mapeo completado");
  }

  // ======================
  // ACTUALIZAR CAJITAS
  // ======================

  function obtenerCajitas() {
    const palette = document.getElementById("palette");
    if (!palette) return [];

    return Array.from(palette.children).filter((c) => {
      const rect = c.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
  }

  function actualizarCajitas() {
    if (isUpdating) return;
    isUpdating = true;

    const cajitas = obtenerCajitas();

    cajitas.forEach((caja) => {
      const numActual = caja.textContent.trim();

      if (window.dayuMapping[numActual]) {
        const dayu = window.dayuMapping[numActual];

        caja.style.backgroundColor = dayu.hex;
        caja.textContent = dayu.code;
        caja.dataset.numOriginal = numActual;
        caja.dataset.dayuCode = dayu.code;
        caja.dataset.editable = "true";

        hacerEditable(caja);
      }
    });

    isUpdating = false;
    console.log("🎨 Cajitas actualizadas");
  }

  function hacerEditable(caja) {
    const nueva = caja.cloneNode(true);
    caja.parentNode.replaceChild(nueva, caja);

    nueva.style.cursor = "pointer";
    nueva.title = "Clic para editar → Re-render automático";

    nueva.addEventListener("click", function (e) {
      e.stopPropagation();
      editarCajita(this);
    });
  }

  function editarCajita(caja) {
    const numOriginal = caja.dataset.numOriginal;
    const codigoActual = caja.textContent.trim();

    console.log(`✏️ Editando color ${numOriginal} (actual: ${codigoActual})`);

    const inp = document.createElement("input");
    inp.value = codigoActual;
    inp.style.cssText =
      "width:100%;height:100%;border:3px solid #FF5722;text-align:center;font:inherit;box-sizing:border-box;background:white;color:black;font-weight:bold;";

    caja.textContent = "";
    caja.appendChild(inp);
    inp.focus();
    inp.select();

    const aplicarCambio = () => {
      const nuevoCodigo = inp.value.trim().toUpperCase();

      if (!nuevoCodigo) {
        caja.textContent = codigoActual;
        return;
      }

      const dayu = encontrarDayuPorCodigo(nuevoCodigo);

      if (!dayu) {
        alert(`❌ "${nuevoCodigo}" no existe en la paleta DAYU`);
        caja.textContent = codigoActual;
        return;
      }

      // Actualizar el mapeo
      window.dayuMapping[numOriginal] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: window.dayuMapping[numOriginal].rgbOriginal,
        hexOriginal: window.dayuMapping[numOriginal].hexOriginal,
      };

      // Actualizar cajita
      caja.textContent = dayu.code;
      caja.style.backgroundColor = dayu.hex;
      caja.dataset.dayuCode = dayu.code;

      console.log(`✅ Color ${numOriginal} cambiado a ${dayu.code}`);

      // RE-RENDER AUTOMÁTICO (tipo show borders)
      mostrarStatus(`⏳ Re-render con ${dayu.code}...`, "info");

      setTimeout(() => {
        // 1) Primero intentar disparar el mismo "camino" que Show Borders
        const exitoRerender = forzarRerenderComoBorders();

        // 2) Si no se pudo, intenta regeneración vieja
        const exitoRegen = exitoRerender ? true : forzarRegeneracionSVG();

        // 3) Fallback final: aplicar manualmente (por si el sistema no re-renderiza)
        if (!exitoRegen) {
          const resultado = actualizarSVG();
          mostrarStatus(
            `✏️ ${numOriginal} → ${dayu.code} | ${resultado.textos}t | ${resultado.colores}c`,
            "info"
          );
        }
      }, 50);
    };

    inp.addEventListener("blur", aplicarCambio);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        aplicarCambio();
      }
      if (e.key === "Escape") {
        caja.textContent = codigoActual;
      }
    });
  }

  // ======================
  // ACTUALIZAR SVG
  // ======================

  function actualizarSVG() {
    const svg = document.querySelector("#svgContainer svg");
    if (!svg) {
      console.log("⚠️ SVG no encontrado");
      return { textos: 0, colores: 0 };
    }

    if (Object.keys(window.dayuMapping).length === 0) {
      console.log("⚠️ No hay mapeo activo");
      return { textos: 0, colores: 0 };
    }

    let textos = 0;
    let colores = 0;

    // ACTUALIZAR TEXTOS
    svg.querySelectorAll("text").forEach((texto) => {
      const contenido = texto.textContent.trim();

      if (window.dayuMapping[contenido]) {
        texto.textContent = window.dayuMapping[contenido].code;
        texto.dataset.numOriginal = contenido;
        textos++;
      }
    });

    // ACTUALIZAR COLORES
    svg.querySelectorAll("path, polygon").forEach((area) => {
      const style = area.getAttribute("style");
      if (!style) return;

      let rgbActual = null;
      let esHex = false;

      const mHex = style.match(/fill:\s*(#[0-9a-fA-F]{3,6})/);
      if (mHex) {
        rgbActual = hexToRgb(mHex[1]);
        esHex = true;
      } else {
        const mRgb = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (mRgb) {
          rgbActual = [+mRgb[1], +mRgb[2], +mRgb[3]];
        }
      }

      if (!rgbActual) return;

      let mejorMatch = null;
      let menorDistancia = Infinity;

      for (const [numOriginal, dayu] of Object.entries(window.dayuMapping)) {
        const distancia = dist(rgbActual, dayu.rgbOriginal);

        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          mejorMatch = { numOriginal, dayu };
        }
      }

      if (mejorMatch && menorDistancia < 200) {
        let nuevoStyle;

        if (esHex) {
          nuevoStyle = style.replace(
            /fill:\s*#[0-9a-fA-F]{3,6}/,
            `fill: ${mejorMatch.dayu.hex}`
          );
        } else {
          nuevoStyle = style.replace(
            /fill:\s*rgb\([^)]+\)/,
            `fill: ${mejorMatch.dayu.hex}`
          );
        }

        area.setAttribute("style", nuevoStyle);
        area.dataset.numOriginal = mejorMatch.numOriginal;
        colores++;
      }
    });

    console.log(`✅ SVG actualizado: ${textos} textos, ${colores} colores`);
    return { textos, colores };
  }

  // ======================
  // OBSERVERS
  // ======================

  function iniciarObservers() {
    iniciarObserverSVG();
    iniciarObserverPaleta();
  }

  function iniciarObserverSVG() {
    const container = document.getElementById("svgContainer");
    if (!container) {
      setTimeout(iniciarObserverSVG, 500);
      return;
    }

    if (svgObserver) {
      svgObserver.disconnect();
    }

    svgObserver = new MutationObserver(() => {
      if (isUpdating) return;

      const svg = container.querySelector("svg");
      if (!svg) return;

      const textos = Array.from(svg.querySelectorAll("text"));
      const tieneNumerosOriginales = textos.some((t) => {
        const txt = t.textContent.trim();
        return /^\d+$/.test(txt) && parseInt(txt) < 50 && !t.dataset.numOriginal;
      });

      if (tieneNumerosOriginales && Object.keys(window.dayuMapping).length > 0) {
        console.log("🔄 SVG regenerado por sistema, re-aplicando...");

        setTimeout(() => {
          const resultado = actualizarSVG();
          mostrarStatus(
            `🔄 Auto-aplicado: ${resultado.textos} textos | ${resultado.colores} áreas`,
            "success"
          );
        }, 150);
      }
    });

    svgObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    console.log("👁️ Observer SVG activo");
  }

  function iniciarObserverPaleta() {
    const palette = document.getElementById("palette");
    if (!palette) {
      setTimeout(iniciarObserverPaleta, 500);
      return;
    }

    if (paletaObserver) {
      paletaObserver.disconnect();
    }

    paletaObserver = new MutationObserver(() => {
      if (isUpdating) return;

      const cajitas = obtenerCajitas();
      const tieneNumerosOriginales = cajitas.some((c) => {
        const txt = c.textContent.trim();
        return /^\d+$/.test(txt) && parseInt(txt) < 50 && !c.dataset.editable;
      });

      if (tieneNumerosOriginales && Object.keys(window.dayuMapping).length > 0) {
        console.log("🔄 Paleta regenerada, re-aplicando...");

        setTimeout(() => {
          actualizarCajitas();
        }, 100);
      }
    });

    paletaObserver.observe(palette, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });

    console.log("👁️ Observer Paleta activo");
  }

  function detenerObservers() {
    if (svgObserver) svgObserver.disconnect();
    if (paletaObserver) paletaObserver.disconnect();
  }

  // ======================
  // INICIALIZACIÓN
  // ======================

  function init() {
    let intentos = 0;
    const intervalo = setInterval(() => {
      if (crearBotones() || ++intentos > 30) {
        clearInterval(intervalo);
        console.log(`✅ DAYU ${VERSION} inicializado`);

        // Intentar instalar hook desde el inicio
        setTimeout(instalarHookGeneracion, 1000);
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 500);
  }

  // ======================
  // API PÚBLICA
  // ======================

  window.dayuInfo = () => {
    console.log(`📊 DAYU ${VERSION} Estado:`);
    console.log("Mapeo:", window.dayuMapping);
    console.log("Total colores:", Object.keys(window.dayuMapping).length);
    console.log("Observer SVG:", !!svgObserver);
    console.log("Observer Paleta:", !!paletaObserver);
    console.log("Hook instalado:", !!generarSVGOriginal);
  };

  window.reaplicarDayu = () => {
    actualizarCajitas();
    return actualizarSVG();
  };

  window.dayuVersion = () => {
    console.log(`🎨 DAYU ${VERSION}`);
    return VERSION;
  };

  window.regenerarSVG = forzarRegeneracionSVG;
  window.rerenderUI = forzarRerenderComoBorders;

  console.log(`✅ DAYU ${VERSION} cargado`);
})();
