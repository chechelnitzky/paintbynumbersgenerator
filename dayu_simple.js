/* dayu_simple.js
 * Sistema DAYU - VERSIÓN CORREGIDA
 * - Mapea correctamente 0→CG5, 1→64, etc.
 * - Actualiza números Y colores en el SVG
 */

(function() {
  'use strict';
  
  console.log('🎨 DAYU Simple v2 cargando...');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  console.log('✅ DAYU_PALETTE:', window.DAYU_PALETTE.length, 'colores');
  
  // ============================================
  // ESTADO
  // ============================================
  
  let numeroOriginalToDayu = new Map(); // 0→{code:"CG5", hex:"..."}, 1→{code:"64", hex:"..."}
  let cajitaToDayu = new Map(); // elemento cajita → datos DAYU
  
  // ============================================
  // UTILIDADES
  // ============================================
  
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
  
  function getDayu(code) {
    return window.DAYU_PALETTE.find(c => 
      c.code.toUpperCase() === code.toUpperCase()
    );
  }
  
  // ============================================
  // CREAR BOTÓN
  // ============================================
  
  function crearBoton() {
    const palette = document.getElementById('palette');
    if (!palette) return false;
    
    if (document.getElementById('btnDayuSimple')) return true;
    
    const btn = document.createElement('button');
    btn.id = 'btnDayuSimple';
    btn.textContent = '🎨 MAPEAR A DAYU';
    btn.className = 'waves-effect waves-light btn';
    btn.style.cssText = `
      margin: 10px 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-weight: bold;
    `;
    
    btn.onclick = aplicarDayu;
    
    palette.parentNode.insertBefore(btn, palette);
    
    console.log('✅ Botón creado');
    return true;
  }
  
  // ============================================
  // APLICAR DAYU
  // ============================================
  
  function aplicarDayu() {
    console.log('🎨 === APLICAR DAYU ===');
    
    const palette = document.getElementById('palette');
    if (!palette) {
      alert('❌ Palette no encontrado. Genera la imagen primero.');
      return;
    }
    
    // 1. Obtener todas las cajitas
    const cajitas = Array.from(palette.children).filter(el => {
      const rect = el.getBoundingClientRect();
      const text = el.textContent.trim();
      return rect.width > 20 && rect.height > 20 && text.length > 0;
    });
    
    if (cajitas.length === 0) {
      alert('❌ No se encontraron cajitas. Genera la imagen primero.');
      return;
    }
    
    console.log(`📦 Cajitas encontradas: ${cajitas.length}`);
    
    // 2. Extraer colores Y números originales
    const colores = [];
    cajitas.forEach((caja, idx) => {
      const rgb = parseRgb(caja);
      const textoOriginal = caja.textContent.trim();
      
      if (rgb) {
        colores.push({ 
          idx: idx,
          numeroOriginal: textoOriginal, // "0", "1", "2"...
          rgb: rgb, 
          hex: rgbToHex(rgb), 
          caja: caja 
        });
      }
    });
    
    console.log('📊 Colores extraídos:', colores.map(c => `${c.numeroOriginal}:${c.hex}`).join(', '));
    
    if (colores.length === 0) {
      alert('❌ No se pudieron extraer colores');
      return;
    }
    
    // 3. Mapear a DAYU (1:1 sin repetir)
    const distancias = [];
    colores.forEach(c => {
      window.DAYU_PALETTE.forEach((d, di) => {
        distancias.push({
          colorIdx: c.idx,
          numeroOriginal: c.numeroOriginal,
          dayuIdx: di,
          dist: colorDist(c.rgb, d.rgb)
        });
      });
    });
    
    distancias.sort((a, b) => a.dist - b.dist);
    
    const usados = new Set();
    const usadosDayu = new Set();
    numeroOriginalToDayu.clear();
    cajitaToDayu.clear();
    
    for (const d of distancias) {
      if (usados.has(d.colorIdx) || usadosDayu.has(d.dayuIdx)) continue;
      
      usados.add(d.colorIdx);
      usadosDayu.add(d.dayuIdx);
      
      const dayu = window.DAYU_PALETTE[d.dayuIdx];
      const color = colores[d.colorIdx];
      
      // IMPORTANTE: Mapear número original → DAYU
      numeroOriginalToDayu.set(color.numeroOriginal, {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb
      });
      
      cajitaToDayu.set(color.caja, {
        numeroOriginal: color.numeroOriginal,
        dayu: dayu
      });
      
      // Actualizar cajita
      color.caja.style.backgroundColor = dayu.hex;
      color.caja.textContent = dayu.code;
      color.caja.dataset.numeroOriginal = color.numeroOriginal;
      color.caja.dataset.originalColor = color.hex;
      
      console.log(`📦 ${color.numeroOriginal} → ${dayu.code} (${dayu.hex})`);
      
      if (numeroOriginalToDayu.size === colores.length) break;
    }
    
    console.log('✅ Mapping completo:', Array.from(numeroOriginalToDayu.entries()));
    
    // 4. Hacer cajitas editables
    cajitas.forEach(caja => {
      if (!caja.dataset.numeroOriginal) return;
      
      caja.style.cursor = 'pointer';
      caja.style.transition = 'all 0.2s';
      caja.title = '🖱️ Clic para editar código DAYU';
      
      // Remover listeners anteriores
      const nuevaCaja = caja.cloneNode(true);
      caja.parentNode.replaceChild(nuevaCaja, caja);
      
      nuevaCaja.onclick = function() {
        editarCajita(this);
      };
      
      nuevaCaja.onmouseenter = function() {
        this.style.transform = 'scale(1.15)';
        this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
      };
      
      nuevaCaja.onmouseleave = function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '';
      };
    });
    
    // 5. Actualizar SVG (CLAVE)
    actualizarSVG();
    
    alert(`✅ ¡DAYU aplicado!\n\n${numeroOriginalToDayu.size} colores mapeados\n\nEjemplos:\n${Array.from(numeroOriginalToDayu.entries()).slice(0, 3).map(([num, dayu]) => `  ${num} → ${dayu.code}`).join('\n')}\n\n💡 Haz clic en cualquier cajita para cambiar el código`);
  }
  
  // ============================================
  // EDITAR CAJITA
  // ============================================
  
  function editarCajita(caja) {
    const numeroOriginal = caja.dataset.numeroOriginal;
    const codigoActual = caja.textContent.trim();
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = codigoActual;
    input.style.cssText = `
      width: 100%;
      height: 100%;
      border: 3px solid #FF5722;
      text-align: center;
      font-size: inherit;
      font-weight: bold;
      box-sizing: border-box;
      background: white;
      color: black;
    `;
    
    caja.textContent = '';
    caja.appendChild(input);
    input.focus();
    input.select();
    
    const aplicar = () => {
      const nuevoCodigo = input.value.trim();
      
      if (!nuevoCodigo) {
        caja.textContent = codigoActual;
        return;
      }
      
      const nuevoDayu = getDayu(nuevoCodigo);
      
      if (nuevoDayu) {
        // Actualizar mapping
        numeroOriginalToDayu.set(numeroOriginal, {
          code: nuevoDayu.code,
          hex: nuevoDayu.hex,
          rgb: nuevoDayu.rgb
        });
        
        // Actualizar cajita
        caja.textContent = nuevoDayu.code;
        caja.style.backgroundColor = nuevoDayu.hex;
        
        // Actualizar SVG
        actualizarSVG();
        
        console.log(`✏️ ${numeroOriginal} → ${nuevoDayu.code}`);
      } else {
        alert(`❌ Código "${nuevoCodigo}" no encontrado\n\nEjemplos válidos:\n• Números: 42, 64, 121, 167\n• Grises: WG3, BG5, CG7, GG5`);
        caja.textContent = codigoActual;
      }
    };
    
    input.onblur = aplicar;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') aplicar();
      if (e.key === 'Escape') caja.textContent = codigoActual;
    };
  }
  
  // ============================================
  // ACTUALIZAR SVG (LA PARTE CLAVE)
  // ============================================
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return;
    }
    
    console.log('🔄 Actualizando SVG...');
    
    let actualizados = 0;
    const textos = svg.querySelectorAll('text');
    
    textos.forEach(texto => {
      const numeroEnSVG = texto.textContent.trim();
      
      // ¿Este número está en nuestro mapping?
      if (numeroOriginalToDayu.has(numeroEnSVG)) {
        const dayu = numeroOriginalToDayu.get(numeroEnSVG);
        
        // Guardar original (solo la primera vez)
        if (!texto.dataset.originalNumero) {
          texto.dataset.originalNumero = numeroEnSVG;
        }
        
        // CAMBIAR EL NÚMERO en el SVG
        texto.textContent = dayu.code;
        
        // Buscar y CAMBIAR EL COLOR de la faceta
        const parent = texto.parentElement;
        if (parent) {
          const shapes = parent.querySelectorAll('path, polygon, rect, circle');
          shapes.forEach(shape => {
            const fill = shape.getAttribute('fill');
            if (fill && fill !== 'none') {
              // Guardar color original
              if (!shape.dataset.originalFill) {
                shape.dataset.originalFill = fill;
              }
              
              // CAMBIAR COLOR
              shape.setAttribute('fill', dayu.hex);
              shape.style.fill = dayu.hex;
            }
          });
        }
        
        actualizados++;
      }
    });
    
    console.log(`✅ SVG actualizado: ${actualizados} etiquetas cambiadas`);
    
    if (actualizados === 0) {
      console.warn('⚠️ No se actualizó ninguna etiqueta. Verifica que el SVG tenga los números originales.');
    }
  }
  
  // ============================================
  // INIT
  // ============================================
  
  function init() {
    let intentos = 0;
    const interval = setInterval(() => {
      intentos++;
      
      if (crearBoton() || intentos > 20) {
        clearInterval(interval);
        if (intentos > 20) {
          console.warn('⚠️ No se pudo crear botón');
        }
      }
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  console.log('✅ DAYU Simple v2 cargado');
  
})();
