/* dayu_simple.js - VERSIÓN FINAL - FIX STYLE */

(function() {
  'use strict';
  
  console.log('🎨 DAYU Simple v5 - Fix style colors');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  console.log('✅ DAYU_PALETTE:', window.DAYU_PALETTE.length, 'colores');
  
  let numeroToDayu = new Map();
  let rgbToNumero = new Map(); // "155,202,98" → "0"
  
  function colorDist(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return dr*dr + dg*dg + db*db;
  }
  
  function rgbToHex(rgb) {
    return '#' + rgb.map(v => {
      const h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }
  
  function parseRgb(el) {
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  
  function rgbKey(rgb) {
    return `${rgb[0]},${rgb[1]},${rgb[2]}`;
  }
  
  function parseRgbFromStyle(style) {
    if (!style) return null;
    const m = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  
  function getDayu(code) {
    return window.DAYU_PALETTE.find(c => 
      c.code.toUpperCase() === code.toUpperCase()
    );
  }
  
  function crearBoton() {
    const palette = document.getElementById('palette');
    if (!palette || document.getElementById('btnDayuSimple')) return !!palette;
    
    const btn = document.createElement('button');
    btn.id = 'btnDayuSimple';
    btn.textContent = '🎨 MAPEAR A DAYU';
    btn.className = 'waves-effect waves-light btn';
    btn.style.cssText = 'margin: 10px 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-weight: bold;';
    btn.onclick = aplicarDayu;
    palette.parentNode.insertBefore(btn, palette);
    console.log('✅ Botón creado');
    return true;
  }
  
  function aplicarDayu() {
    console.log('🎨 === APLICAR DAYU ===');
    
    const palette = document.getElementById('palette');
    if (!palette) {
      alert('❌ Genera la imagen primero');
      return;
    }
    
    const cajitas = Array.from(palette.children).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
    
    if (cajitas.length === 0) {
      alert('❌ No se encontraron cajitas');
      return;
    }
    
    const datos = [];
    cajitas.forEach((caja, idx) => {
      const rgb = parseRgb(caja);
      const numero = caja.textContent.trim();
      if (rgb && numero) {
        datos.push({ idx, numero, rgb, caja });
        console.log(`📦 ${numero}: rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
      }
    });
    
    if (datos.length === 0) {
      alert('❌ No se pudieron extraer colores');
      return;
    }
    
    const distancias = [];
    datos.forEach(d => {
      window.DAYU_PALETTE.forEach((dayu, di) => {
        distancias.push({ 
          idx: d.idx, 
          numero: d.numero, 
          rgb: d.rgb,
          dayuIdx: di, 
          dist: colorDist(d.rgb, dayu.rgb) 
        });
      });
    });
    
    distancias.sort((a, b) => a.dist - b.dist);
    
    const usadosIdx = new Set();
    const usadosDayu = new Set();
    numeroToDayu.clear();
    rgbToNumero.clear();
    
    for (const d of distancias) {
      if (usadosIdx.has(d.idx) || usadosDayu.has(d.dayuIdx)) continue;
      
      usadosIdx.add(d.idx);
      usadosDayu.add(d.dayuIdx);
      
      const dayu = window.DAYU_PALETTE[d.dayuIdx];
      const item = datos[d.idx];
      
      numeroToDayu.set(item.numero, { 
        code: dayu.code, 
        hex: dayu.hex, 
        rgb: dayu.rgb 
      });
      
      rgbToNumero.set(rgbKey(item.rgb), item.numero);
      
      item.caja.style.backgroundColor = dayu.hex;
      item.caja.textContent = dayu.code;
      item.caja.dataset.numeroOriginal = item.numero;
      item.caja.dataset.rgbOriginal = rgbKey(item.rgb);
      
      console.log(`✅ ${item.numero} → ${dayu.code}`);
      
      if (numeroToDayu.size === datos.length) break;
    }
    
    cajitas.forEach(caja => {
      if (!caja.dataset.numeroOriginal) return;
      
      caja.style.cursor = 'pointer';
      caja.style.transition = 'all 0.2s';
      caja.title = '🖱️ Clic para editar';
      
      const nueva = caja.cloneNode(true);
      caja.parentNode.replaceChild(nueva, caja);
      
      nueva.onclick = function() { editarCajita(this); };
      nueva.onmouseenter = function() {
        this.style.transform = 'scale(1.15)';
        this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
      };
      nueva.onmouseleave = function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '';
      };
    });
    
    const resultado = actualizarSVG();
    alert(`✅ DAYU aplicado!\n\n${numeroToDayu.size} colores mapeados\n${resultado.actualizados} textos\n${resultado.coloresActualizados} colores\n\n💡 Clic en cajita para editar`);
  }
  
  function editarCajita(caja) {
    const numeroOriginal = caja.dataset.numeroOriginal;
    const codigoActual = caja.textContent.trim();
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = codigoActual;
    input.style.cssText = 'width:100%;height:100%;border:3px solid #FF5722;text-align:center;font-size:inherit;font-weight:bold;box-sizing:border-box;background:white;color:black;';
    
    caja.textContent = '';
    caja.appendChild(input);
    input.focus();
    input.select();
    
    const aplicar = () => {
      const nuevo = input.value.trim();
      if (!nuevo) {
        caja.textContent = codigoActual;
        return;
      }
      
      const dayu = getDayu(nuevo);
      if (dayu) {
        numeroToDayu.set(numeroOriginal, { 
          code: dayu.code, 
          hex: dayu.hex, 
          rgb: dayu.rgb 
        });
        caja.textContent = dayu.code;
        caja.style.backgroundColor = dayu.hex;
        actualizarSVG();
        console.log(`✏️ ${numeroOriginal} → ${dayu.code}`);
      } else {
        alert(`❌ "${nuevo}" no encontrado`);
        caja.textContent = codigoActual;
      }
    };
    
    input.onblur = aplicar;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') aplicar();
      if (e.key === 'Escape') caja.textContent = codigoActual;
    };
  }
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) return { total: 0, actualizados: 0, coloresActualizados: 0 };
    
    console.log('🔄 Actualizando SVG...');
    
    let actualizados = 0;
    let coloresActualizados = 0;
    
    const textos = svg.querySelectorAll('text');
    const shapes = svg.querySelectorAll('path, polygon');
    
    console.log(`📊 ${textos.length} textos, ${shapes.length} shapes`);
    
    // Actualizar textos
    textos.forEach(texto => {
      const contenido = texto.textContent.trim();
      
      if (numeroToDayu.has(contenido)) {
        const dayu = numeroToDayu.get(contenido);
        
        if (!texto.dataset.original) {
          texto.dataset.original = contenido;
        }
        
        texto.textContent = dayu.code;
        actualizados++;
      }
    });
    
    // Actualizar colores en style
    shapes.forEach(shape => {
      const style = shape.getAttribute('style');
      if (!style) return;
      
      const rgb = parseRgbFromStyle(style);
      if (!rgb) return;
      
      const key = rgbKey(rgb);
      const numero = rgbToNumero.get(key);
      
      if (numero && numeroToDayu.has(numero)) {
        const dayu = numeroToDayu.get(numero);
        
        // Guardar style original
        if (!shape.dataset.originalStyle) {
          shape.dataset.originalStyle = style;
          shape.dataset.numeroOriginal = numero;
        }
        
        // Reemplazar el color en el style
        const newStyle = style.replace(
          /fill:\s*rgb\(\d+,\s*\d+,\s*\d+\)/,
          `fill: ${dayu.hex}`
        );
        
        shape.setAttribute('style', newStyle);
        coloresActualizados++;
      }
    });
    
    console.log(`✅ ${actualizados} textos, ${coloresActualizados} colores actualizados`);
    
    return { total: textos.length, actualizados, coloresActualizados };
  }
  
  function init() {
    let intentos = 0;
    const interval = setInterval(() => {
      if (crearBoton() || ++intentos > 20) clearInterval(interval);
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  console.log('✅ DAYU Simple v5 listo');
})();
