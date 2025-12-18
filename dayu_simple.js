/* dayu_simple.js - v21: Matching por familias HSL */

(function() {
  'use strict';
  
  const VERSION = 'v21';
  console.log(`🎨 DAYU ${VERSION} - Matching inteligente por familias HSL`);
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  window.dayuMapping = window.dayuMapping || {};
  
  let svgObserver = null;
  let paletaObserver = null;
  let isUpdating = false;
  
  // ======================
  // UTILIDADES RGB/HSL
  // ======================
  
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    return {
      h: h * 360,
      s: s * 100,
      l: l * 100
    };
  }
  
  function clasificarFamilia(hsl) {
    const {h, s, l} = hsl;
    
    // Blancos
    if (l > 85 && s < 20) return 'BLANCO';
    
    // Negros
    if (l < 15) return 'NEGRO';
    
    // Grises (baja saturación)
    if (s < 15) return 'GRIS';
    
    // Familias de color por tono (H)
    if (h >= 345 || h < 15) return 'ROJO';
    if (h >= 15 && h < 45) return 'NARANJA';
    if (h >= 45 && h < 75) return 'AMARILLO';
    if (h >= 75 && h < 165) return 'VERDE';
    if (h >= 165 && h < 255) return 'AZUL';
    if (h >= 255 && h < 345) return 'MORADO';
    
    return 'GRIS';
  }
  
  function distanciaHSL(hsl1, hsl2) {
    // Distancia ponderada: L > S > H
    const dL = Math.abs(hsl1.l - hsl2.l);
    const dS = Math.abs(hsl1.s - hsl2.s);
    const dH = Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h));
    
    return dL * 2 + dS * 1.5 + dH * 0.5;
  }
  
  function distanciaRGB(rgb1, rgb2) {
    return Math.pow(rgb1[0]-rgb2[0],2) + Math.pow(rgb1[1]-rgb2[1],2) + Math.pow(rgb1[2]-rgb2[2],2);
  }
  
  function hex(rgb) {
    return '#' + rgb.map(v => ('0'+Math.round(v).toString(16)).slice(-2)).join('');
  }
  
  function hexToRgb(hexColor) {
    const h = hexColor.replace('#','');
    if (h.length === 3) {
      return [
        parseInt(h[0]+h[0], 16),
        parseInt(h[1]+h[1], 16),
        parseInt(h[2]+h[2], 16)
      ];
    }
    return [
      parseInt(h.substr(0,2), 16),
      parseInt(h.substr(2,2), 16),
      parseInt(h.substr(4,2), 16)
    ];
  }
  
  function parseRgb(el) {
    const m = window.getComputedStyle(el).backgroundColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1],+m[2],+m[3]] : null;
  }
  
  function encontrarDayuPorCodigo(codigo) {
    return window.DAYU_PALETTE.find(d => d.code.toUpperCase() === codigo.toUpperCase());
  }
  
  // ======================
  // MATCHING INTELIGENTE
  // ======================
  
  function encontrarMejorMatch(rgbOriginal, dayuDisponibles) {
    const hslOriginal = rgbToHsl(...rgbOriginal);
    const familiaOriginal = clasificarFamilia(hslOriginal);
    
    console.log(`Color original: RGB(${rgbOriginal}) → HSL(${Math.round(hslOriginal.h)},${Math.round(hslOriginal.s)}%,${Math.round(hslOriginal.l)}%) → Familia: ${familiaOriginal}`);
    
    // Clasificar colores DAYU por familia
    const dayuPorFamilia = {};
    dayuDisponibles.forEach(dayu => {
      const hslDayu = rgbToHsl(...dayu.rgb);
      const familia = clasificarFamilia(hslDayu);
      
      if (!dayuPorFamilia[familia]) {
        dayuPorFamilia[familia] = [];
      }
      
      dayuPorFamilia[familia].push({
        ...dayu,
        hsl: hslDayu,
        familia: familia,
        distHSL: distanciaHSL(hslOriginal, hslDayu),
        distRGB: distanciaRGB(rgbOriginal, dayu.rgb)
      });
    });
    
    // 1. Buscar en la misma familia
    if (dayuPorFamilia[familiaOriginal] && dayuPorFamilia[familiaOriginal].length > 0) {
      const matches = dayuPorFamilia[familiaOriginal];
      matches.sort((a, b) => a.distHSL - b.distHSL);
      console.log(`✅ Match en familia ${familiaOriginal}: ${matches[0].code}`);
      return matches[0];
    }
    
    // 2. Si no hay en la familia, buscar GRISES muy cercanos (distancia RGB < 900)
    if (dayuPorFamilia['GRIS']) {
      const grisesCercanos = dayuPorFamilia['GRIS']
        .filter(g => g.distRGB < 900)
        .sort((a, b) => a.distRGB - b.distRGB);
      
      if (grisesCercanos.length > 0) {
        console.log(`⚪ Match con gris cercano: ${grisesCercanos[0].code}`);
        return grisesCercanos[0];
      }
    }
    
    // 3. Buscar en familias adyacentes
    const familiasAdyacentes = {
      'ROJO': ['NARANJA', 'MORADO'],
      'NARANJA': ['ROJO', 'AMARILLO'],
      'AMARILLO': ['NARANJA', 'VERDE'],
      'VERDE': ['AMARILLO', 'AZUL'],
      'AZUL': ['VERDE', 'MORADO'],
      'MORADO': ['AZUL', 'ROJO']
    };
    
    if (familiasAdyacentes[familiaOriginal]) {
      for (const familiaAdyacente of familiasAdyacentes[familiaOriginal]) {
        if (dayuPorFamilia[familiaAdyacente] && dayuPorFamilia[familiaAdyacente].length > 0) {
          const matches = dayuPorFamilia[familiaAdyacente];
          matches.sort((a, b) => a.distHSL - b.distHSL);
          console.log(`🔄 Match en familia adyacente ${familiaAdyacente}: ${matches[0].code}`);
          return matches[0];
        }
      }
    }
    
    // 4. Último recurso: el más cercano por distancia HSL global
    const todosLosColores = dayuDisponibles.map(dayu => ({
      ...dayu,
      hsl: rgbToHsl(...dayu.rgb),
      distHSL: distanciaHSL(hslOriginal, rgbToHsl(...dayu.rgb))
    }));
    
    todosLosColores.sort((a, b) => a.distHSL - b.distHSL);
    console.log(`⚠️ Match por distancia HSL global: ${todosLosColores[0].code}`);
    return todosLosColores[0];
  }
  
  // ======================
  // REGENERAR SVG CON TOGGLE
  // ======================
  
  function regenerarSVGConToggle() {
    console.log('🔄 Regenerando SVG con toggle borders...');
    
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    
    let borderCheckbox = checkboxes.find(cb => {
      const label = cb.parentElement?.textContent || '';
      return label.toLowerCase().includes('border');
    });
    
    if (!borderCheckbox) {
      const container = document.querySelector('.row') || document.body;
      const allCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      borderCheckbox = allCheckboxes[allCheckboxes.length - 1];
    }
    
    if (!borderCheckbox) {
      borderCheckbox = checkboxes.find(cb => {
        const rect = cb.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    }
    
    if (borderCheckbox) {
      const estadoOriginal = borderCheckbox.checked;
      
      console.log(`✅ Checkbox encontrado, estado original: ${estadoOriginal}`);
      
      borderCheckbox.checked = !estadoOriginal;
      borderCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      borderCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
      
      setTimeout(() => {
        borderCheckbox.checked = estadoOriginal;
        borderCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        borderCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log('✅ Toggle completado, SVG regenerándose...');
        
        setTimeout(() => {
          const resultado = actualizarSVG();
          mostrarStatus(`✅ SVG regenerado: ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
        }, 300);
      }, 100);
      
      return true;
    } else {
      console.log('❌ No se encontró ningún checkbox');
      alert('No se pudo encontrar el control de borders. Intenta cambiar manualmente el tamaño del SVG.');
      return false;
    }
  }
  
  // ======================
  // UI - BOTONES
  // ======================
  
  function crearBotones() {
    const p = document.getElementById('palette');
    if (!p) return false;
    
    if (!document.getElementById('dayuVersion')) {
      const versionDiv = document.createElement('div');
      versionDiv.id = 'dayuVersion';
      versionDiv.textContent = `DAYU ${VERSION}`;
      versionDiv.style.cssText = 'display:inline-block;margin:0 10px 5px 0;padding:4px 10px;background:#9C27B0;color:white;border-radius:3px;font-size:11px;font-weight:bold;letter-spacing:0.5px;';
      p.parentNode.insertBefore(versionDiv, p);
    }
    
    if (!document.getElementById('btnDayu')) {
      const btn = document.createElement('button');
      btn.id = 'btnDayu';
      btn.textContent = '🎨 MAPEAR A DAYU';
      btn.className = 'waves-effect waves-light btn';
      btn.style.cssText = 'margin:10px 5px 10px 0;background:linear-gradient(135deg,#667eea,#764ba2);font-weight:bold;';
      btn.onclick = iniciarMapeo;
      p.parentNode.insertBefore(btn, p);
    }
    
    if (!document.getElementById('btnRegenerar')) {
      const btnRegen = document.createElement('button');
      btnRegen.id = 'btnRegenerar';
      btnRegen.textContent = '🔄 REGENERAR SVG';
      btnRegen.className = 'waves-effect waves-light btn';
      btnRegen.style.cssText = 'margin:10px 5px;background:#00BCD4;font-weight:bold;display:none;';
      btnRegen.onclick = () => {
        console.log('🔄 Usuario presionó REGENERAR SVG');
        mostrarStatus('🔄 Regenerando SVG...', 'info');
        regenerarSVGConToggle();
      };
      p.parentNode.insertBefore(btnRegen, p);
    }
    
    if (!document.getElementById('btnLimpiar')) {
      const btn2 = document.createElement('button');
      btn2.id = 'btnLimpiar';
      btn2.textContent = '🗑️ LIMPIAR';
      btn2.className = 'waves-effect waves-light btn red';
      btn2.style.cssText = 'margin:10px 5px;font-weight:bold;display:none;';
      btn2.onclick = () => {
        if (confirm('¿Limpiar el mapeo DAYU?')) {
          window.dayuMapping = {};
          detenerObservers();
          location.reload();
        }
      };
      p.parentNode.insertBefore(btn2, p);
    }
    
    if (!document.getElementById('dayuStatus')) {
      const status = document.createElement('div');
      status.id = 'dayuStatus';
      status.style.cssText = 'margin:10px 0;padding:10px;background:#e3f2fd;border-left:4px solid #2196F3;border-radius:4px;font-size:13px;display:none;font-weight:600;';
      p.parentNode.insertBefore(status, p);
    }
    
    return true;
  }
  
  function mostrarStatus(mensaje, tipo = 'info') {
    const status = document.getElementById('dayuStatus');
    if (!status) return;
    
    const colores = {
      info: {bg: '#e3f2fd', border: '#2196F3'},
      success: {bg: '#e8f5e9', border: '#4CAF50'},
      warning: {bg: '#fff3e0', border: '#FF9800'},
      error: {bg: '#ffebee', border: '#f44336'}
    };
    
    const c = colores[tipo];
    status.style.display = 'block';
    status.style.background = c.bg;
    status.style.borderColor = c.border;
    status.textContent = mensaje;
  }
  
  function mostrarBotonesActivos() {
    const btnRegenerar = document.getElementById('btnRegenerar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    
    if (btnRegenerar) btnRegenerar.style.display = 'inline-block';
    if (btnLimpiar) btnLimpiar.style.display = 'inline-block';
  }
  
  // ======================
  // MAPEO INICIAL CON HSL
  // ======================
  
  function iniciarMapeo() {
    console.log('🎨 Iniciando mapeo inteligente por HSL...');
    
    const cajitas = obtenerCajitas();
    if (!cajitas.length) {
      alert('❌ No se encontraron colores en la paleta');
      return;
    }
    
    const coloresOriginales = cajitas.map((caja, idx) => {
      const rgb = parseRgb(caja);
      const num = caja.textContent.trim();
      
      return {
        numero: num,
        rgb: rgb,
        caja: caja,
        indice: idx
      };
    }).filter(c => c.rgb);
    
    if (!coloresOriginales.length) {
      alert('❌ No se pudieron extraer los colores');
      return;
    }
    
    console.log(`📊 ${coloresOriginales.length} colores originales detectados`);
    
    // Preparar paleta DAYU con índices
    const dayuConIndices = window.DAYU_PALETTE.map((dayu, idx) => ({
      ...dayu,
      dayuIdx: idx
    }));
    
    const dayuUsados = new Set();
    window.dayuMapping = {};
    
    // Mapear cada color original
    coloresOriginales.forEach(orig => {
      console.log(`\n🎨 Mapeando color ${orig.numero}...`);
      
      // Filtrar DAYU disponibles
      const dayuDisponibles = dayuConIndices.filter(d => !dayuUsados.has(d.dayuIdx));
      
      if (dayuDisponibles.length === 0) {
        console.log(`⚠️ No hay más colores DAYU disponibles`);
        return;
      }
      
      // Encontrar mejor match
      const mejorMatch = encontrarMejorMatch(orig.rgb, dayuDisponibles);
      
      // Marcar como usado
      dayuUsados.add(mejorMatch.dayuIdx);
      
      // Guardar mapeo
      window.dayuMapping[orig.numero] = {
        code: mejorMatch.code,
        hex: mejorMatch.hex,
        rgb: mejorMatch.rgb,
        rgbOriginal: orig.rgb,
        hexOriginal: hex(orig.rgb)
      };
      
      console.log(`✅ ${orig.numero} → ${mejorMatch.code}`);
    });
    
    console.log('\n✅ Mapeo HSL completado:', window.dayuMapping);
    
    actualizarCajitas();
    const resultado = actualizarSVG();
    iniciarObservers();
    mostrarBotonesActivos();
    
    mostrarStatus(`✅ Mapeo HSL completado: ${Object.keys(window.dayuMapping).length} colores | ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
    
    console.log('🎉 Mapeo HSL completado');
  }
  
  // ======================
  // ACTUALIZAR CAJITAS
  // ======================
  
  function obtenerCajitas() {
    const palette = document.getElementById('palette');
    if (!palette) return [];
    
    return Array.from(palette.children).filter(c => {
      const rect = c.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
  }
  
  function actualizarCajitas() {
    if (isUpdating) return;
    isUpdating = true;
    
    const cajitas = obtenerCajitas();
    
    cajitas.forEach(caja => {
      const numActual = caja.textContent.trim();
      
      if (window.dayuMapping[numActual]) {
        const dayu = window.dayuMapping[numActual];
        
        caja.style.backgroundColor = dayu.hex;
        caja.textContent = dayu.code;
        caja.dataset.numOriginal = numActual;
        caja.dataset.dayuCode = dayu.code;
        caja.dataset.editable = 'true';
        
        hacerEditable(caja);
      }
    });
    
    isUpdating = false;
    console.log('🎨 Cajitas actualizadas');
  }
  
  function hacerEditable(caja) {
    const nueva = caja.cloneNode(true);
    caja.parentNode.replaceChild(nueva, caja);
    
    nueva.style.cursor = 'pointer';
    nueva.title = 'Clic para editar → Usa REGENERAR SVG después';
    
    nueva.addEventListener('click', function(e) {
      e.stopPropagation();
      editarCajita(this);
    });
  }
  
  function editarCajita(caja) {
    const numOriginal = caja.dataset.numOriginal;
    const codigoActual = caja.textContent.trim();
    
    console.log(`✏️ Editando color ${numOriginal} (actual: ${codigoActual})`);
    
    const inp = document.createElement('input');
    inp.value = codigoActual;
    inp.style.cssText = 'width:100%;height:100%;border:3px solid #FF5722;text-align:center;font:inherit;box-sizing:border-box;background:white;color:black;font-weight:bold;';
    
    caja.textContent = '';
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
      
      window.dayuMapping[numOriginal] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: window.dayuMapping[numOriginal].rgbOriginal,
        hexOriginal: window.dayuMapping[numOriginal].hexOriginal
      };
      
      caja.textContent = dayu.code;
      caja.style.backgroundColor = dayu.hex;
      caja.dataset.dayuCode = dayu.code;
      
      console.log(`✅ Color ${numOriginal} cambiado a ${dayu.code}`);
      
      mostrarStatus(`✏️ Color ${numOriginal} → ${dayu.code} | Presiona REGENERAR SVG para aplicar`, 'warning');
    };
    
    inp.addEventListener('blur', aplicarCambio);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        aplicarCambio();
      }
      if (e.key === 'Escape') {
        caja.textContent = codigoActual;
      }
    });
  }
  
  // ======================
  // ACTUALIZAR SVG
  // ======================
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) {
      console.log('⚠️ SVG no encontrado');
      return {textos: 0, colores: 0};
    }
    
    if (Object.keys(window.dayuMapping).length === 0) {
      console.log('⚠️ No hay mapeo activo');
      return {textos: 0, colores: 0};
    }
    
    let textos = 0;
    let colores = 0;
    
    svg.querySelectorAll('text').forEach(texto => {
      const contenido = texto.textContent.trim();
      
      if (window.dayuMapping[contenido]) {
        texto.textContent = window.dayuMapping[contenido].code;
        texto.dataset.numOriginal = contenido;
        textos++;
      }
    });
    
    svg.querySelectorAll('path, polygon').forEach(area => {
      const style = area.getAttribute('style');
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
        const distancia = distanciaRGB(rgbActual, dayu.rgbOriginal);
        
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          mejorMatch = {numOriginal, dayu};
        }
      }
      
      if (mejorMatch && menorDistancia < 200) {
        let nuevoStyle;
        
        if (esHex) {
          nuevoStyle = style.replace(/fill:\s*#[0-9a-fA-F]{3,6}/, `fill: ${mejorMatch.dayu.hex}`);
        } else {
          nuevoStyle = style.replace(/fill:\s*rgb\([^)]+\)/, `fill: ${mejorMatch.dayu.hex}`);
        }
        
        area.setAttribute('style', nuevoStyle);
        area.dataset.numOriginal = mejorMatch.numOriginal;
        colores++;
      }
    });
    
    console.log(`✅ SVG actualizado: ${textos} textos, ${colores} colores`);
    return {textos, colores};
  }
  
  // ======================
  // OBSERVERS
  // ======================
  
  function iniciarObservers() {
    iniciarObserverSVG();
    iniciarObserverPaleta();
  }
  
  function iniciarObserverSVG() {
    const container = document.getElementById('svgContainer');
    if (!container) {
      setTimeout(iniciarObserverSVG, 500);
      return;
    }
    
    if (svgObserver) {
      svgObserver.disconnect();
    }
    
    svgObserver = new MutationObserver(() => {
      if (isUpdating) return;
      
      const svg = container.querySelector('svg');
      if (!svg) return;
      
      const textos = Array.from(svg.querySelectorAll('text'));
      const tieneNumerosOriginales = textos.some(t => {
        const txt = t.textContent.trim();
        return /^\d+$/.test(txt) && parseInt(txt) < 50 && !t.dataset.numOriginal;
      });
      
      if (tieneNumerosOriginales && Object.keys(window.dayuMapping).length > 0) {
        console.log('🔄 SVG regenerado por sistema, re-aplicando...');
        
        setTimeout(() => {
          const resultado = actualizarSVG();
          mostrarStatus(`🔄 Auto-aplicado: ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
        }, 150);
      }
    });
    
    svgObserver.observe(container, {
      childList: true,
      subtree: true
    });
    
    console.log('👁️ Observer SVG activo');
  }
  
  function iniciarObserverPaleta() {
    const palette = document.getElementById('palette');
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
      const tieneNumerosOriginales = cajitas.some(c => {
        const txt = c.textContent.trim();
        return /^\d+$/.test(txt) && parseInt(txt) < 50 && !c.dataset.editable;
      });
      
      if (tieneNumerosOriginales && Object.keys(window.dayuMapping).length > 0) {
        console.log('🔄 Paleta regenerada, re-aplicando...');
        
        setTimeout(() => {
          actualizarCajitas();
        }, 100);
      }
    });
    
    paletaObserver.observe(palette, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
    
    console.log('👁️ Observer Paleta activo');
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
      }
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  // ======================
  // API PÚBLICA
  // ======================
  
  window.dayuInfo = () => {
    console.log(`📊 DAYU ${VERSION} Estado:`);
    console.log('Mapeo:', window.dayuMapping);
    console.log('Total colores:', Object.keys(window.dayuMapping).length);
    console.log('Observer SVG:', !!svgObserver);
    console.log('Observer Paleta:', !!paletaObserver);
  };
  
  window.reaplicarDayu = () => {
    actualizarCajitas();
    return actualizarSVG();
  };
  
  window.dayuVersion = () => {
    console.log(`🎨 DAYU ${VERSION}`);
    return VERSION;
  };
  
  window.regenerarSVG = regenerarSVGConToggle;
  
  console.log(`✅ DAYU ${VERSION} cargado`);
})();
