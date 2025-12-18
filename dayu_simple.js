/* dayu_simple.js - v8 FINAL: Sin observer, re-aplicar manual */

(function() {
  'use strict';
  
  console.log('🎨 DAYU v8 - Re-aplicar manual');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  if (!window.dayuMapping) {
    window.dayuMapping = {};
  }
  
  function dist(rgb1, rgb2) {
    return Math.pow(rgb1[0]-rgb2[0],2) + Math.pow(rgb1[1]-rgb2[1],2) + Math.pow(rgb1[2]-rgb2[2],2);
  }
  
  function hex(rgb) {
    return '#' + rgb.map(v => ('0'+Math.round(v).toString(16)).slice(-2)).join('');
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
    
    // Botón re-aplicar
    if (!document.getElementById('btnReaplicar')) {
      const btn2 = document.createElement('button');
      btn2.id = 'btnReaplicar';
      btn2.textContent = '🔄 RE-APLICAR';
      btn2.className = 'waves-effect waves-light btn';
      btn2.style.cssText = 'margin:10px 0;background:#26a69a;font-weight:bold;display:none;';
      btn2.onclick = () => {
        const r = actualizar();
        alert(`✅ Re-aplicado!\n${r.textos} textos\n${r.colores} colores`);
      };
      p.parentNode.insertBefore(btn2, p);
    }
    
    return true;
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
        rgbOriginal: `${d.rgb[0]},${d.rgb[1]},${d.rgb[2]}`
      };
      
      d.caja.style.backgroundColor = dayu.hex;
      d.caja.textContent = dayu.code;
      d.caja.dataset.num = d.num;
      d.caja.dataset.rgbOrig = window.dayuMapping[d.num].rgbOriginal;
      
      if (Object.keys(window.dayuMapping).length === datos.length) break;
    }
    
    hacerEditables();
    const r = actualizar();
    
    // Mostrar botón re-aplicar
    const btnReaplicar = document.getElementById('btnReaplicar');
    if (btnReaplicar) btnReaplicar.style.display = 'inline-block';
    
    alert(`✅ Listo!\n${Object.keys(window.dayuMapping).length} colores\n${r.textos} textos\n${r.colores} colores\n\n💡 Si cambias el SVG multiplier, usa el botón "RE-APLICAR"`);
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
        alert(`❌ "${nuevo}" no existe`);
        caja.textContent = actual;
        return;
      }
      
      window.dayuMapping[num] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: caja.dataset.rgbOrig
      };
      
      caja.textContent = dayu.code;
      caja.style.backgroundColor = dayu.hex;
      
      const r = actualizar();
      console.log(`✏️ ${num} → ${dayu.code}: ${r.textos}t, ${r.colores}c`);
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
      
      // Buscar en mapping (por número original)
      if (window.dayuMapping[txt]) {
        t.dataset.orig = txt;
        t.textContent = window.dayuMapping[txt].code;
        textos++;
      }
    });
    
    // Actualizar colores - MEJORADO
    svg.querySelectorAll('path, polygon').forEach(s => {
      const style = s.getAttribute('style');
      if (!style) return;
      
      // Extraer RGB del style
      const m = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return;
      
      const rgbActual = `${m[1]},${m[2]},${m[3]}`;
      
      // Buscar qué número corresponde a este RGB
      for (const [num, data] of Object.entries(window.dayuMapping)) {
        if (data.rgbOriginal === rgbActual) {
          // Reemplazar el fill en el style
          const nuevoStyle = style.replace(
            /fill:\s*rgb\([^)]+\)/,
            `fill: ${data.hex}`
          );
          
          s.setAttribute('style', nuevoStyle);
          s.dataset.num = num;
          colores++;
          break;
        }
      }
    });
    
    console.log(`✅ ${textos}t, ${colores}c`);
    return {textos, colores};
  }
  
  function init() {
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
  
  console.log('✅ DAYU v8 listo');
})();
