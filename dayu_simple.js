/* dayu_simple.js - VERSIÓN SIMPLE QUE FUNCIONA */

(function() {
  'use strict';
  
  console.log('🎨 DAYU v6 - Versión simple');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  let mapping = {}; // {0: {code:"167", hex:"#...", rgbOriginal:"155,202,98"}}
  
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
  
  function crearBoton() {
    const p = document.getElementById('palette');
    if (!p || document.getElementById('btnDayu')) return !!p;
    const btn = document.createElement('button');
    btn.id = 'btnDayu';
    btn.textContent = '🎨 MAPEAR A DAYU';
    btn.className = 'waves-effect waves-light btn';
    btn.style.cssText = 'margin:10px 0;background:linear-gradient(135deg,#667eea,#764ba2);font-weight:bold;';
    btn.onclick = mapear;
    p.parentNode.insertBefore(btn, p);
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
    
    // Extraer datos
    const datos = cajitas.map((c,i) => ({
      num: c.textContent.trim(),
      rgb: parseRgb(c),
      caja: c
    })).filter(d => d.rgb);
    
    if (!datos.length) {
      alert('❌ No se extrajeron colores');
      return;
    }
    
    console.log('📦 Cajitas:', datos.map(d => `${d.num}:${hex(d.rgb)}`).join(', '));
    
    // Calcular distancias
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
    
    // Asignar 1:1
    const usado = new Set();
    const usadoDayu = new Set();
    mapping = {};
    
    for (const d of dists) {
      if (usado.has(d.num) || usadoDayu.has(d.dayuIdx)) continue;
      
      usado.add(d.num);
      usadoDayu.add(d.dayuIdx);
      
      const dayu = window.DAYU_PALETTE[d.dayuIdx];
      
      mapping[d.num] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: `${d.rgb[0]},${d.rgb[1]},${d.rgb[2]}`
      };
      
      // Actualizar cajita
      d.caja.style.backgroundColor = dayu.hex;
      d.caja.textContent = dayu.code;
      d.caja.dataset.num = d.num;
      d.caja.dataset.rgbOrig = mapping[d.num].rgbOriginal;
      
      console.log(`✅ ${d.num} → ${dayu.code} (${dayu.hex})`);
      
      if (Object.keys(mapping).length === datos.length) break;
    }
    
    // Hacer editables
    cajitas.forEach(c => {
      if (!c.dataset.num) return;
      c.style.cursor = 'pointer';
      c.title = 'Clic para editar';
      const nuevo = c.cloneNode(true);
      c.parentNode.replaceChild(nuevo, c);
      nuevo.onclick = () => editar(nuevo);
    });
    
    // Actualizar SVG
    const r = actualizar();
    
    alert(`✅ Listo!\n${Object.keys(mapping).length} colores\n${r.textos} textos\n${r.colores} colores en SVG`);
  }
  
  function editar(caja) {
    const num = caja.dataset.num;
    const actual = caja.textContent.trim();
    
    const inp = document.createElement('input');
    inp.value = actual;
    inp.style.cssText = 'width:100%;height:100%;border:3px solid #f00;text-align:center;font:inherit;box-sizing:border-box;';
    caja.textContent = '';
    caja.appendChild(inp);
    inp.focus();
    inp.select();
    
    const ok = () => {
      const nuevo = inp.value.trim().toUpperCase();
      if (!nuevo) return caja.textContent = actual;
      
      const dayu = window.DAYU_PALETTE.find(d => d.code.toUpperCase() === nuevo);
      if (!dayu) {
        alert(`❌ "${nuevo}" no existe`);
        return caja.textContent = actual;
      }
      
      mapping[num] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: caja.dataset.rgbOrig
      };
      
      caja.textContent = dayu.code;
      caja.style.backgroundColor = dayu.hex;
      actualizar();
    };
    
    inp.onblur = ok;
    inp.onkeydown = e => {
      if (e.key === 'Enter') ok();
      if (e.key === 'Escape') caja.textContent = actual;
    };
  }
  
  function actualizar() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) return {textos:0, colores:0};
    
    console.log('🔄 Actualizando SVG...');
    
    let textos = 0;
    let colores = 0;
    
    // Actualizar textos
    svg.querySelectorAll('text').forEach(t => {
      const txt = t.textContent.trim();
      if (mapping[txt]) {
        if (!t.dataset.orig) t.dataset.orig = txt;
        t.textContent = mapping[txt].code;
        textos++;
      }
    });
    
    // Actualizar colores
    svg.querySelectorAll('path, polygon').forEach(s => {
      const style = s.getAttribute('style');
      if (!style) return;
      
      const m = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return;
      
      const key = `${m[1]},${m[2]},${m[3]}`;
      
      // Buscar qué número tiene ese color
      for (const [num, data] of Object.entries(mapping)) {
        if (data.rgbOriginal === key) {
          if (!s.dataset.origStyle) {
            s.dataset.origStyle = style;
            s.dataset.num = num;
          }
          
          const newStyle = style.replace(/fill:\s*rgb\([^)]+\)/, `fill: ${data.hex}`);
          s.setAttribute('style', newStyle);
          colores++;
          break;
        }
      }
    });
    
    console.log(`✅ ${textos} textos, ${colores} colores`);
    return {textos, colores};
  }
  
  function init() {
    let i = 0;
    const t = setInterval(() => {
      if (crearBoton() || ++i > 20) clearInterval(t);
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  console.log('✅ DAYU v6 listo');
})();
