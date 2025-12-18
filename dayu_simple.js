/* dayu_simple.js - v20: Sin observers, solo manual */

(function() {
  'use strict';
  
  const VERSION = 'v20';
  console.log(`🎨 DAYU ${VERSION} - Versión simplificada sin loops`);
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  window.dayuMapping = window.dayuMapping || {};
  let isRegenerating = false;
  
  // ======================
  // UTILIDADES
  // ======================
  
  function dist(rgb1, rgb2) {
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
  // REGENERAR SVG
  // ======================
  
  function regenerarSVGConToggle() {
    if (isRegenerating) {
      console.log('⚠️ Ya regenerando, ignorando');
      return false;
    }
    
    isRegenerating = true;
    console.log('🔄 Regenerando SVG...');
    
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    let borderCheckbox = checkboxes.find(cb => {
      const label = cb.parentElement?.textContent || '';
      return label.toLowerCase().includes('border');
    });
    
    if (!borderCheckbox && checkboxes.length > 0) {
      borderCheckbox = checkboxes[checkboxes.length - 1];
    }
    
    if (borderCheckbox) {
      const estadoOriginal = borderCheckbox.checked;
      console.log(`Estado original: ${estadoOriginal ? 'ON' : 'OFF'}`);
      
      // Toggle
      borderCheckbox.checked = !estadoOriginal;
      borderCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      
      setTimeout(() => {
        borderCheckbox.checked = estadoOriginal;
        borderCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`Estado final: ${estadoOriginal ? 'ON' : 'OFF'}`);
        
        setTimeout(() => {
          actualizarTodo();
          isRegenerating = false;
        }, 400);
      }, 150);
      
      return true;
    }
    
    isRegenerating = false;
    return false;
  }
  
  // ======================
  // ACTUALIZAR TODO
  // ======================
  
  function actualizarTodo() {
    console.log('🎨 Actualizando cajitas y SVG...');
    
    actualizarCajitas();
    const resultado = actualizarSVG();
    
    mostrarStatus(`✅ ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
    console.log('✅ Actualización completada');
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
      warning: {bg: '#fff3e0', border: '#FF9800'}
    };
    
    const c = colores[tipo];
    status.style.display = 'block';
    status.style.background = c.bg;
    status.style.borderColor = c.border;
    status.textContent = mensaje;
  }
  
  // ======================
  // MAPEO
  // ======================
  
  function iniciarMapeo() {
    console.log('🎨 Iniciando mapeo...');
    
    const cajitas = obtenerCajitas();
    if (!cajitas.length) {
      alert('❌ No se encontraron colores');
      return;
    }
    
    const coloresOriginales = cajitas.map(caja => ({
      numero: caja.textContent.trim(),
      rgb: parseRgb(caja),
      caja: caja
    })).filter(c => c.rgb);
    
    if (!coloresOriginales.length) {
      alert('❌ No se pudieron extraer colores');
      return;
    }
    
    const distancias = [];
    coloresOriginales.forEach(orig => {
      window.DAYU_PALETTE.forEach((dayu, dayuIdx) => {
        distancias.push({
          numOriginal: orig.numero,
          rgbOriginal: orig.rgb,
          caja: orig.caja,
          dayuIdx: dayuIdx,
          dayuCode: dayu.code,
          dayuHex: dayu.hex,
          dayuRgb: dayu.rgb,
          distancia: dist(orig.rgb, dayu.rgb)
        });
      });
    });
    
    distancias.sort((a, b) => a.distancia - b.distancia);
    
    const numerosUsados = new Set();
    const dayuUsados = new Set();
    window.dayuMapping = {};
    
    for (const d of distancias) {
      if (numerosUsados.has(d.numOriginal) || dayuUsados.has(d.dayuIdx)) continue;
      
      numerosUsados.add(d.numOriginal);
      dayuUsados.add(d.dayuIdx);
      
      window.dayuMapping[d.numOriginal] = {
        code: d.dayuCode,
        hex: d.dayuHex,
        rgb: d.dayuRgb,
        rgbOriginal: d.rgbOriginal,
        hexOriginal: hex(d.rgbOriginal)
      };
      
      if (Object.keys(window.dayuMapping).length === coloresOriginales.length) break;
    }
    
    console.log('✅ Mapeo creado');
    actualizarTodo();
  }
  
  // ======================
  // CAJITAS
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
    const cajitas = obtenerCajitas();
    
    cajitas.forEach(caja => {
      const numActual = caja.textContent.trim();
      
      if (window.dayuMapping[numActual]) {
        const dayu = window.dayuMapping[numActual];
        
        caja.style.backgroundColor = dayu.hex;
        caja.textContent = dayu.code;
        caja.dataset.numOriginal = numActual;
        
        hacerEditable(caja);
      }
    });
  }
  
  function hacerEditable(caja) {
    const nueva = caja.cloneNode(true);
    caja.parentNode.replaceChild(nueva, caja);
    
    nueva.style.cursor = 'pointer';
    nueva.title = 'Clic → Enter para aplicar';
    
    nueva.addEventListener('click', function(e) {
      e.stopPropagation();
      editarCajita(this);
    });
  }
  
  function editarCajita(caja) {
    const numOriginal = caja.dataset.numOriginal;
    const codigoActual = caja.textContent.trim();
    
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
        alert(`❌ "${nuevoCodigo}" no existe`);
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
      
      console.log(`✅ ${numOriginal} → ${dayu.code}`);
      mostrarStatus(`⏳ Aplicando ${dayu.code}...`, 'info');
      
      setTimeout(() => regenerarSVGConToggle(), 100);
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
  // SVG
  // ======================
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg || Object.keys(window.dayuMapping).length === 0) {
      return {textos: 0, colores: 0};
    }
    
    let textos = 0;
    let colores = 0;
    
    // Textos
    svg.querySelectorAll('text').forEach(texto => {
      const contenido = texto.textContent.trim();
      if (window.dayuMapping[contenido]) {
        texto.textContent = window.dayuMapping[contenido].code;
        textos++;
      }
    });
    
    // Colores
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
        const distancia = dist(rgbActual, dayu.rgbOriginal);
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          mejorMatch = {numOriginal, dayu};
        }
      }
      
      if (mejorMatch && menorDistancia < 100) {
        let nuevoStyle = esHex 
          ? style.replace(/fill:\s*#[0-9a-fA-F]{3,6}/, `fill: ${mejorMatch.dayu.hex}`)
          : style.replace(/fill:\s*rgb\([^)]+\)/, `fill: ${mejorMatch.dayu.hex}`);
        
        area.setAttribute('style', nuevoStyle);
        colores++;
      }
    });
    
    console.log(`✅ SVG: ${textos}t, ${colores}c`);
    return {textos, colores};
  }
  
  // ======================
  // INIT
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
  
  // API
  window.dayuVersion = () => VERSION;
  window.dayuInfo = () => console.log('Mapeo:', window.dayuMapping);
  window.regenerarSVG = regenerarSVGConToggle;
  
  console.log(`✅ DAYU ${VERSION} cargado`);
})();
