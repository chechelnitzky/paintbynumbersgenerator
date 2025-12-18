/* dayu_simple.js - v11: Persistencia + Updates en tiempo real */

(function() {
  'use strict';
  
  console.log('🎨 DAYU v11 - Persistencia mejorada');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  // Guardar mapeo en localStorage para persistencia
  function guardarMapeo() {
    if (Object.keys(window.dayuMapping || {}).length > 0) {
      localStorage.setItem('dayuMapping', JSON.stringify(window.dayuMapping));
      console.log('💾 Mapeo guardado');
    }
  }
  
  function cargarMapeo() {
    const saved = localStorage.getItem('dayuMapping');
    if (saved) {
      try {
        window.dayuMapping = JSON.parse(saved);
        console.log('📂 Mapeo cargado:', Object.keys(window.dayuMapping).length, 'colores');
        return true;
      } catch(e) {
        console.error('❌ Error cargando mapeo:', e);
      }
    }
    window.dayuMapping = {};
    return false;
  }
  
  // Inicializar
  cargarMapeo();
  
  let svgObserver = null;
  let isUpdating = false;
  
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
    
    // Botón limpiar mapeo
    if (!document.getElementById('btnLimpiar')) {
      const btn3 = document.createElement('button');
      btn3.id = 'btnLimpiar';
      btn3.textContent = '🗑️ LIMPIAR';
      btn3.className = 'waves-effect waves-light btn red';
      btn3.style.cssText = 'margin:10px 5px;font-weight:bold;display:none;';
      btn3.onclick = () => {
        if (confirm('¿Seguro que quieres limpiar el mapeo DAYU?')) {
          window.dayuMapping = {};
          localStorage.removeItem('dayuMapping');
          location.reload();
        }
      };
      p.parentNode.insertBefore(btn3, p);
    }
    
    // Indicador de estado
    if (!document.getElementById('dayuStatus')) {
      const status = document.createElement('div');
      status.id = 'dayuStatus';
      status.style.cssText = 'margin:10px 0;padding:8px 12px;background:#f5f5f5;border-radius:4px;font-size:13px;display:none;';
      p.parentNode.insertBefore(status, p);
    }
    
    return true;
  }
  
  function actualizarStatus(mensaje, color = '#4CAF50') {
    const status = document.getElementById('dayuStatus');
    if (status) {
      status.style.display = 'block';
      status.style.background = color;
      status.style.color = 'white';
      status.textContent = mensaje;
      
      setTimeout(() => {
        status.style.background = '#f5f5f5';
        status.style.color = '#333';
      }, 2000);
    }
  }
  
  function iniciarObservador() {
    const container = document.getElementById('svgContainer');
    if (!container) {
      setTimeout(iniciarObservador, 500);
      return false;
    }
    
    if (svgObserver) {
      svgObserver.disconnect();
    }
    
    svgObserver = new MutationObserver((mutations) => {
      if (isUpdating) return;
      
      const svg = container.querySelector('svg');
      if (!svg) return;
      
      // Detectar si hay elementos sin mapear (números 0-9 en vez de códigos DAYU)
      const textos = Array.from(svg.querySelectorAll('text'));
      const tieneNumeros = textos.some(t => {
        const txt = t.textContent.trim();
        return /^\d+$/.test(txt) && txt.length < 3; // Números cortos (0-99)
      });
      
      if (tieneNumeros && Object.keys(window.dayuMapping).length > 0) {
        console.log('🔄 SVG regenerado, re-aplicando DAYU...');
        
        setTimeout(() => {
          const r = actualizar();
          console.log(`✅ Auto-aplicado: ${r.textos}t, ${r.colores}c`);
          actualizarStatus(`✅ DAYU aplicado: ${r.textos} textos, ${r.colores} colores`);
        }, 200);
      }
    });
    
    svgObserver.observe(container, {
      childList: true,
      subtree: true
    });
    
    console.log('👁️ Observer activado');
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
        rgbOriginal: d.rgb,
        hexOriginal: hex(d.rgb)
      };
      
      d.caja.style.backgroundColor = dayu.hex;
      d.caja.textContent = dayu.code;
      d.caja.dataset.num = d.num;
      d.caja.dataset.hexOrig = window.dayuMapping[d.num].hexOriginal;
      
      if (Object.keys(window.dayuMapping).length === datos.length) break;
    }
    
    // Guardar mapeo
    guardarMapeo();
    
    // Hacer cajitas editables
    hacerEditables();
    
    // Aplicar al SVG actual
    const r = actualizar();
    
    // Iniciar observer
    iniciarObservador();
    
    // Mostrar botón limpiar
    const btnLimpiar = document.getElementById('btnLimpiar');
    if (btnLimpiar) btnLimpiar.style.display = 'inline-block';
    
    actualizarStatus(`✅ ${Object.keys(window.dayuMapping).length} colores mapeados | ${r.textos} textos | ${r.colores} colores`, '#4CAF50');
    
    alert(`✅ Mapeo completado!\n\n📊 ${Object.keys(window.dayuMapping).length} colores DAYU\n📝 ${r.textos} textos actualizados\n🎨 ${r.colores} colores aplicados\n\n🤖 Auto-actualización ACTIVADA\n💾 Mapeo guardado\n\n💡 Ahora puedes:\n• Cambiar SVG multiplier (se aplicará automáticamente)\n• Editar colores haciendo clic en las cajitas`);
  }
  
  function hacerEditables() {
    const cajitas = Array.from(document.getElementById('palette').children)
      .filter(c => c.dataset.num);
    
    cajitas.forEach(caja => {
      const nueva = caja.cloneNode(true);
      caja.parentNode.replaceChild(nueva, caja);
      
      nueva.style.cursor = 'pointer';
      nueva.title = 'Clic para editar (Enter para aplicar)';
      
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
      
      // Actualizar el mapeo
      window.dayuMapping[num] = {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        rgbOriginal: window.dayuMapping[num].rgbOriginal,
        hexOriginal: caja.dataset.hexOrig
      };
      
      caja.textContent = dayu.code;
      caja.style.backgroundColor = dayu.hex;
      
      // Guardar cambio
      guardarMapeo();
      
      // APLICAR INMEDIATAMENTE AL SVG
      const r = actualizar();
      console.log(`✏️ ${num} → ${dayu.code}: ${r.textos}t, ${r.colores}c`);
      actualizarStatus(`✏️ Color ${num} → ${dayu.code} (${r.textos}t, ${r.colores}c)`, '#2196F3');
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
    
    if (Object.keys(window.dayuMapping).length === 0) {
      console.log('⚠️ No hay mapeo guardado');
      return {textos:0, colores:0};
    }
    
    isUpdating = true;
    
    let textos = 0;
    let colores = 0;
    
    // Actualizar textos
    svg.querySelectorAll('text').forEach(t => {
      const txt = t.textContent.trim();
      
      if (window.dayuMapping[txt]) {
        t.textContent = window.dayuMapping[txt].code;
        t.dataset.origNum = txt;
        textos++;
      }
    });
    
    // Actualizar colores
    svg.querySelectorAll('path, polygon').forEach(s => {
      const style = s.getAttribute('style');
      if (!style) return;
      
      let rgbActual = null;
      let esHex = false;
      let matchOriginal = null;
      
      // Intentar extraer HEX
      const mHex = style.match(/fill:\s*(#[0-9a-fA-F]{3,6})/);
      if (mHex) {
        rgbActual = hexToRgb(mHex[1]);
        esHex = true;
        matchOriginal = mHex[1];
      } else {
        // Intentar extraer RGB
        const mRgb = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (mRgb) {
          rgbActual = [+mRgb[1], +mRgb[2], +mRgb[3]];
          matchOriginal = `rgb(${mRgb[1]},${mRgb[2]},${mRgb[3]})`;
        }
      }
      
      if (!rgbActual) return;
      
      // Buscar el color más cercano en el mapeo
      let mejorMatch = null;
      let menorDist = Infinity;
      
      for (const [num, data] of Object.entries(window.dayuMapping)) {
        const distancia = dist(rgbActual, data.rgbOriginal);
        
        if (distancia < menorDist) {
          menorDist = distancia;
          mejorMatch = {num, data};
        }
      }
      
      // Si la distancia es razonable, aplicar
      if (mejorMatch && menorDist < 100) {
        let nuevoStyle;
        if (esHex) {
          nuevoStyle = style.replace(/fill:\s*#[0-9a-fA-F]{3,6}/, `fill: ${mejorMatch.data.hex}`);
        } else {
          nuevoStyle = style.replace(/fill:\s*rgb\([^)]+\)/, `fill: ${mejorMatch.data.hex}`);
        }
        
        s.setAttribute('style', nuevoStyle);
        s.dataset.origNum = mejorMatch.num;
        colores++;
      }
    });
    
    isUpdating = false;
    
    console.log(`✅ Actualizado: ${textos} textos, ${colores} colores`);
    return {textos, colores};
  }
  
  function init() {
    // Agregar estilos
    const style = document.createElement('style');
    style.textContent = `
      #dayuStatus {
        transition: all 0.3s ease;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
    
    let i = 0;
    const t = setInterval(() => {
      if (crearBotones() || ++i > 20) {
        clearInterval(t);
        
        // Si hay mapeo guardado, iniciar observer y aplicar
        if (Object.keys(window.dayuMapping).length > 0) {
          console.log('📂 Mapeo detectado, activando auto-aplicación...');
          iniciarObservador();
          
          const btnLimpiar = document.getElementById('btnLimpiar');
          if (btnLimpiar) btnLimpiar.style.display = 'inline-block';
          
          // Aplicar si hay SVG
          setTimeout(() => {
            const svg = document.querySelector('#svgContainer svg');
            if (svg) {
              const r = actualizar();
              if (r.textos > 0 || r.colores > 0) {
                actualizarStatus(`📂 Mapeo restaurado: ${r.textos}t, ${r.colores}c`, '#9C27B0');
              }
            }
          }, 1000);
        }
      }
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  // API pública
  window.reaplicarDayu = () => {
    const r = actualizar();
    console.log('🔄 Re-aplicado:', r);
    return r;
  };
  
  window.dayuInfo = () => {
    console.log('🎨 DAYU Mapping:', window.dayuMapping);
    console.log('👁️ Observer activo:', !!svgObserver);
    console.log('💾 En localStorage:', !!localStorage.getItem('dayuMapping'));
  };
  
  window.limpiarDayu = () => {
    window.dayuMapping = {};
    localStorage.removeItem('dayuMapping');
    console.log('🗑️ Mapeo limpiado');
  };
  
  console.log('✅ DAYU v11 listo - Persistencia + Updates en tiempo real');
})();
