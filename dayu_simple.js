/* dayu_simple.js - v10: Auto-detección de cambios en SVG */

(function() {
  'use strict';
  
  console.log('🎨 DAYU v10 - Auto-actualización');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  if (!window.dayuMapping) {
    window.dayuMapping = {};
  }
  
  let svgObserver = null;
  let lastSvgContent = '';
  
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
  
  function crearBotones() {
    const p = document.getElementById('palette');
    if (!p) return false;
    
    // Botón mapear
    if (!document.getElementById('btnDayu')) {
      const btn = document.createElement('button');
      btn.id = 'btnDayu';
      btn.textContent = '🎨 MAPEAR A DAYU';
      btn.className = 'waves-effect waves-light btn';
      btn.style.cssText = 'margin:10px 5px 10px 0;background:linear-gradient(135deg,#667eea,#764ba2);font-weight:bold;';
      btn.onclick = mapear;
      p.parentNode.insertBefore(btn, p);
    }
    
    // Botón re-aplicar (mantener por si acaso)
    if (!document.getElementById('btnReaplicar')) {
      const btn2 = document.createElement('button');
      btn2.id = 'btnReaplicar';
      btn2.textContent = '🔄 RE-APLICAR MANUAL';
      btn2.className = 'waves-effect waves-light btn';
      btn2.style.cssText = 'margin:10px 0;background:#26a69a;font-weight:bold;display:none;';
      btn2.onclick = () => {
        const r = actualizar();
        alert(`✅ Re-aplicado!\n${r.textos} textos\n${r.colores} colores`);
      };
      p.parentNode.insertBefore(btn2, p);
    }
    
    // Indicador de auto-actualización
    if (!document.getElementById('dayuAutoIndicator')) {
      const indicator = document.createElement('span');
      indicator.id = 'dayuAutoIndicator';
      indicator.textContent = '🔄 Auto-actualización: OFF';
      indicator.style.cssText = 'margin-left:10px;padding:5px 10px;background:#ff9800;color:white;border-radius:4px;font-size:12px;font-weight:bold;display:none;';
      p.parentNode.insertBefore(indicator, p);
    }
    
    return true;
  }
  
  function iniciarObservador() {
    const container = document.getElementById('svgContainer');
    if (!container) {
      console.log('⏳ Esperando svgContainer...');
      return false;
    }
    
    if (svgObserver) {
      svgObserver.disconnect();
    }
    
    svgObserver = new MutationObserver((mutations) => {
      // Detectar si el SVG cambió
      const svg = container.querySelector('svg');
      if (!svg) return;
      
      const currentContent = svg.innerHTML.substring(0, 1000); // Solo comparar inicio
      
      if (currentContent !== lastSvgContent && lastSvgContent !== '') {
        console.log('🔄 SVG cambió, re-aplicando DAYU...');
        
        // Esperar un poco para que el SVG termine de renderizar
        setTimeout(() => {
          const r = actualizar();
          console.log(`✅ Auto-aplicado: ${r.textos}t, ${r.colores}c`);
          
          // Mostrar notificación visual
          mostrarNotificacion(`✅ DAYU aplicado: ${r.textos} textos, ${r.colores} colores`);
        }, 100);
      }
      
      lastSvgContent = currentContent;
    });
    
    svgObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: false
    });
    
    console.log('👁️ Observer activado en svgContainer');
    
    // Actualizar indicador
    const indicator = document.getElementById('dayuAutoIndicator');
    if (indicator) {
      indicator.textContent = '🔄 Auto-actualización: ON';
      indicator.style.background = '#4CAF50';
    }
    
    return true;
  }
  
  function mostrarNotificacion(mensaje) {
    const notif = document.createElement('div');
    notif.textContent = mensaje;
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      z-index: 10000;
      font-weight: bold;
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
      notif.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }
  
  function mapear() {
    console.log('🎨 Mapeando...');
    
    const cajitas = Array.from(document.getElementById('palette').children)
      .filter(c => c.getBoundingClientRect().width > 20);
    
    if (!cajitas.length) {
      alert('❌ No hay cajitas');
      return;
    }
    
    const datos = cajitas.map((c,i) => ({
      num: c.textContent.trim(),
      rgb: parseRgb(c),
      caja: c
    })).filter(d => d.rgb);
    
    if (!datos.length) {
      alert('❌ No se extrajeron colores');
      return;
    }
    
    const dists = [];
    datos.forEach(d => {
      window.DAYU_PALETTE.forEach((dayu,i) => {
        dists.push({
          num: d.num,
          rgb: d.rgb,
          caja: d.caja,
          dayuIdx: i,
          dist: dist(d.rgb, dayu.rgb)
        });
      });
    });
    
    dists.sort((a,b) => a.dist - b.dist);
    
    const usado = new Set();
    const usadoDayu = new Set();
    window.dayuMapping = {};
    
    for (const d of dists) {
      if (usado.has(d.num) || usadoDayu.has(d.dayuIdx)) continue;
      
      usado.add(d.num);
      usadoDayu.add(d.dayuIdx);
      
      const dayu = window.DAYU_PALETTE[d.dayuIdx];
      
      window.dayuMapping[d.num] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: d.rgb,
        hexOriginal: hex(d.rgb)
      };
      
      d.caja.style.backgroundColor = dayu.hex;
      d.caja.textContent = dayu.code;
      d.caja.dataset.num = d.num;
      d.caja.dataset.hexOrig = window.dayuMapping[d.num].hexOriginal;
      
      if (Object.keys(window.dayuMapping).length === datos.length) break;
    }
    
    hacerEditables();
    const r = actualizar();
    
    // Iniciar el observer después del primer mapeo
    const observerIniciado = iniciarObservador();
    
    // Mostrar botón re-aplicar e indicador
    const btnReaplicar = document.getElementById('btnReaplicar');
    if (btnReaplicar) btnReaplicar.style.display = 'inline-block';
    
    const indicator = document.getElementById('dayuAutoIndicator');
    if (indicator) indicator.style.display = 'inline-block';
    
    alert(`✅ Listo!\n${Object.keys(window.dayuMapping).length} colores mapeados\n${r.textos} textos actualizados\n${r.colores} colores aplicados\n\n🤖 Auto-actualización ${observerIniciado ? 'ACTIVADA' : 'pendiente'}\n💡 Los cambios se aplicarán automáticamente al cambiar SVG multiplier`);
  }
  
  function hacerEditables() {
    const cajitas = Array.from(document.getElementById('palette').children)
      .filter(c => c.dataset.num);
    
    cajitas.forEach(caja => {
      const nueva = caja.cloneNode(true);
      caja.parentNode.replaceChild(nueva, caja);
      
      nueva.style.cursor = 'pointer';
      nueva.title = 'Clic para editar';
      
      nueva.addEventListener('click', function(e) {
        e.stopPropagation();
        editarCajita(this);
      });
    });
  }
  
  function editarCajita(caja) {
    const num = caja.dataset.num;
    const actual = caja.textContent.trim();
    
    const inp = document.createElement('input');
    inp.value = actual;
    inp.style.cssText = 'width:100%;height:100%;border:3px solid #FF5722;text-align:center;font:inherit;box-sizing:border-box;background:white;color:black;';
    
    caja.textContent = '';
    caja.appendChild(inp);
    inp.focus();
    inp.select();
    
    const aplicarCambio = () => {
      const nuevo = inp.value.trim().toUpperCase();
      
      if (!nuevo) {
        caja.textContent = actual;
        return;
      }
      
      const dayu = window.DAYU_PALETTE.find(d => d.code.toUpperCase() === nuevo);
      
      if (!dayu) {
        alert(`❌ "${nuevo}" no existe en la paleta DAYU`);
        caja.textContent = actual;
        return;
      }
      
      window.dayuMapping[num] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: window.dayuMapping[num].rgbOriginal,
        hexOriginal: caja.dataset.hexOrig
      };
      
      caja.textContent = dayu.code;
      caja.style.backgroundColor = dayu.hex;
      
      const r = actualizar();
      console.log(`✏️ ${num} → ${dayu.code}: ${r.textos}t, ${r.colores}c`);
      mostrarNotificacion(`✏️ Color ${num} cambiado a ${dayu.code}`);
    };
    
    inp.addEventListener('blur', aplicarCambio);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        aplicarCambio();
      }
      if (e.key === 'Escape') {
        caja.textContent = actual;
      }
    });
  }
  
  function actualizar() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) return {textos:0, colores:0};
    
    let textos = 0;
    let colores = 0;
    
    // Actualizar textos
    svg.querySelectorAll('text').forEach(t => {
      const txt = t.textContent.trim();
      
      if (window.dayuMapping[txt]) {
        t.dataset.orig = txt;
        t.textContent = window.dayuMapping[txt].code;
        textos++;
      }
    });
    
    // Actualizar colores - SOPORTA HEX Y RGB
    svg.querySelectorAll('path, polygon').forEach(s => {
      const style = s.getAttribute('style');
      if (!style) return;
      
      let rgbActual = null;
      let esHex = false;
      
      // Intentar extraer HEX
      const mHex = style.match(/fill:\s*(#[0-9a-fA-F]{3,6})/);
      if (mHex) {
        rgbActual = hexToRgb(mHex[1]);
        esHex = true;
      } else {
        // Intentar extraer RGB
        const mRgb = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (mRgb) {
          rgbActual = [+mRgb[1], +mRgb[2], +mRgb[3]];
        }
      }
      
      if (!rgbActual) return;
      
      // Buscar qué número corresponde a este color
      for (const [num, data] of Object.entries(window.dayuMapping)) {
        const distancia = dist(rgbActual, data.rgbOriginal);
        
        // Tolerancia de 5 para variaciones de redondeo
        if (distancia < 5) {
          // Reemplazar el fill en el style
          let nuevoStyle;
          if (esHex) {
            nuevoStyle = style.replace(/fill:\s*#[0-9a-fA-F]{3,6}/, `fill: ${data.hex}`);
          } else {
            nuevoStyle = style.replace(/fill:\s*rgb\([^)]+\)/, `fill: ${data.hex}`);
          }
          
          s.setAttribute('style', nuevoStyle);
          s.dataset.num = num;
          colores++;
          break;
        }
      }
    });
    
    console.log(`✅ Actualizado: ${textos} textos, ${colores} colores`);
    return {textos, colores};
  }
  
  function init() {
    // Agregar estilos para animaciones
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
    let i = 0;
    const t = setInterval(() => {
      if (crearBotones() || ++i > 20) clearInterval(t);
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  // API pública
  window.reaplicarDayu = actualizar;
  window.dayuInfo = () => {
    console.log('🎨 DAYU Mapping:', window.dayuMapping);
    console.log('👁️ Observer activo:', !!svgObserver);
  };
  
  console.log('✅ DAYU v10 listo - Auto-actualización inteligente');
})();
