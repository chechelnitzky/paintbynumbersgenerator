/* dayu_simple.js
 * Sistema DAYU - VERSIÓN 3 - FIX DEFINITIVO
 * Problema identificado: El SVG NO se está actualizando
 * Solución: Buscar TODOS los textos con números y reemplazarlos
 */

(function() {
  'use strict';
  
  console.log('🎨 DAYU Simple v3 cargando...');
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  console.log('✅ DAYU_PALETTE:', window.DAYU_PALETTE.length, 'colores');
  
  // ============================================
  // ESTADO GLOBAL
  // ============================================
  
  let numeroToDayu = new Map(); // "0" → {code:"167", hex:"#..."}
  let colorOriginalToDayu = new Map(); // "#abc123" → {code:"167", hex:"#..."}
  
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
  
  function normalizeHex(color) {
    if (!color) return null;
    let hex = color.toLowerCase().replace('#', '').trim();
    // Si es formato corto (abc), expandir a aabbcc
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    return hex.length === 6 ? '#' + hex : null;
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
    
    // 1. Obtener cajitas
    const cajitas = Array.from(palette.children).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
    
    if (cajitas.length === 0) {
      alert('❌ No se encontraron cajitas. Genera la imagen primero.');
      return;
    }
    
    console.log(`📦 Cajitas: ${cajitas.length}`);
    
    // 2. Extraer colores Y números
    const datos = [];
    cajitas.forEach((caja, idx) => {
      const rgb = parseRgb(caja);
      const numero = caja.textContent.trim();
      
      if (rgb && numero) {
        const hex = rgbToHex(rgb);
        datos.push({ idx, numero, rgb, hex, caja });
        console.log(`📦 Cajita ${idx}: número="${numero}" color=${hex}`);
      }
    });
    
    if (datos.length === 0) {
      alert('❌ No se pudieron extraer colores');
      return;
    }
    
    // 3. Mapear a DAYU
    const distancias = [];
    datos.forEach(d => {
      window.DAYU_PALETTE.forEach((dayu, di) => {
        distancias.push({
          idx: d.idx,
          numero: d.numero,
          hex: d.hex,
          dayuIdx: di,
          dist: colorDist(d.rgb, dayu.rgb)
        });
      });
    });
    
    distancias.sort((a, b) => a.dist - b.dist);
    
    const usadosIdx = new Set();
    const usadosDayu = new Set();
    numeroToDayu.clear();
    colorOriginalToDayu.clear();
    
    for (const d of distancias) {
      if (usadosIdx.has(d.idx) || usadosDayu.has(d.dayuIdx)) continue;
      
      usadosIdx.add(d.idx);
      usadosDayu.add(d.dayuIdx);
      
      const dayu = window.DAYU_PALETTE[d.dayuIdx];
      const item = datos[d.idx];
      
      // Mapeos
      numeroToDayu.set(item.numero, {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb
      });
      
      colorOriginalToDayu.set(normalizeHex(item.hex), {
        numero: item.numero,
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb
      });
      
      // Actualizar cajita
      item.caja.style.backgroundColor = dayu.hex;
      item.caja.textContent = dayu.code;
      item.caja.dataset.numeroOriginal = item.numero;
      item.caja.dataset.colorOriginal = item.hex;
      
      console.log(`✅ ${item.numero} (${item.hex}) → ${dayu.code} (${dayu.hex})`);
      
      if (numeroToDayu.size === datos.length) break;
    }
    
    console.log('📊 Mapping completo:');
    numeroToDayu.forEach((dayu, num) => {
      console.log(`  ${num} → ${dayu.code}`);
    });
    
    // 4. Hacer cajitas editables
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
    
    // 5. ACTUALIZAR SVG - LA PARTE CRÍTICA
    const resultado = actualizarSVG();
    
    if (resultado.total === 0) {
      alert('⚠️ ADVERTENCIA\n\nLas cajitas se mapearon correctamente, pero no se pudo actualizar el SVG.\n\nPosible causa: El SVG aún no está generado o tiene un formato diferente.');
    } else {
      alert(`✅ ¡DAYU APLICADO!\n\n• ${numeroToDayu.size} colores mapeados\n• ${resultado.actualizados} etiquetas en SVG actualizadas\n• ${resultado.coloresActualizados} colores cambiados\n\n💡 Haz clic en cualquier cajita para editarla`);
    }
  }
  
  // ============================================
  // EDITAR CAJITA
  // ============================================
  
  function editarCajita(caja) {
    const numeroOriginal = caja.dataset.numeroOriginal;
    const codigoActual = caja.textContent.trim();
    
    console.log(`✏️ Editando cajita: número original="${numeroOriginal}", código actual="${codigoActual}"`);
    
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
      const nuevo = input.value.trim();
      
      if (!nuevo) {
        caja.textContent = codigoActual;
        return;
      }
      
      const dayu = getDayu(nuevo);
      
      if (dayu) {
        console.log(`🔄 Cambiando ${numeroOriginal}: "${codigoActual}" → "${dayu.code}"`);
        
        // Actualizar el mapping global
        numeroToDayu.set(numeroOriginal, {
          code: dayu.code,
          hex: dayu.hex,
          rgb: dayu.rgb
        });
        
        // Actualizar cajita
        caja.textContent = dayu.code;
        caja.style.backgroundColor = dayu.hex;
        
        // Actualizar SOLO los textos con ese número original en el SVG
        actualizarTextosSVG(numeroOriginal, dayu);
        
        console.log(`✅ Actualizado correctamente`);
      } else {
        alert(`❌ "${nuevo}" no encontrado\n\nEjemplos: 42, 64, WG3, BG5`);
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
  // ACTUALIZAR SOLO UN NÚMERO EN EL SVG
  // ============================================
  
  function actualizarTextosSVG(numeroOriginal, nuevoDayu) {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return;
    }
    
    console.log(`🔍 Buscando textos con número original "${numeroOriginal}" en SVG...`);
    
    let encontrados = 0;
    const textos = svg.querySelectorAll('text');
    
    textos.forEach(texto => {
      // Verificar si este texto tiene guardado el número original
      if (texto.dataset.original === numeroOriginal) {
        console.log(`  ✅ Encontrado texto con original="${numeroOriginal}", cambiando a "${nuevoDayu.code}"`);
        
        // Cambiar texto
        texto.textContent = nuevoDayu.code;
        encontrados++;
        
        // Cambiar color de faceta
        const parent = texto.parentElement;
        if (parent) {
          // Buscar shapes en múltiples niveles
          let shapes = parent.querySelectorAll('path, polygon, rect, circle, ellipse');
          
          // Si no encuentra shapes en el parent directo, buscar en nivel superior
          if (shapes.length === 0) {
            const grandParent = parent.parentElement;
            if (grandParent) {
              shapes = grandParent.querySelectorAll('path, polygon, rect, circle, ellipse');
            }
          }
          
          shapes.forEach(shape => {
            const fill = shape.getAttribute('fill');
            if (fill && fill !== 'none') {
              shape.setAttribute('fill', nuevoDayu.hex);
              if (shape.style) {
                shape.style.fill = nuevoDayu.hex;
              }
              console.log(`    🎨 Color cambiado a ${nuevoDayu.hex}`);
            }
          });
        }
      }
    });
    
    console.log(`📊 Total actualizado: ${encontrados} textos`);
    
    if (encontrados === 0) {
      console.warn(`⚠️ No se encontraron textos con original="${numeroOriginal}"`);
      console.warn('Ejecutando actualización completa del SVG...');
      actualizarSVG();
    }
  }
  
  // ============================================
  // ACTUALIZAR SVG - VERSIÓN MEJORADA
  // ============================================
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return { total: 0, actualizados: 0, coloresActualizados: 0 };
    }
    
    console.log('🔄 === ACTUALIZANDO SVG ===');
    
    let textosActualizados = 0;
    let coloresActualizados = 0;
    const textos = svg.querySelectorAll('text');
    
    console.log(`📝 Total de textos en SVG: ${textos.length}`);
    
    textos.forEach((texto, idx) => {
      const contenido = texto.textContent.trim();
      
      // Debug: ver qué hay en el SVG
      if (idx < 5) {
        console.log(`  Texto ${idx}: "${contenido}"`);
      }
      
      // ¿Es un número que tenemos mapeado?
      if (numeroToDayu.has(contenido)) {
        const dayu = numeroToDayu.get(contenido);
        
        // Guardar original
        if (!texto.dataset.original) {
          texto.dataset.original = contenido;
        }
        
        // CAMBIAR TEXTO
        texto.textContent = dayu.code;
        textosActualizados++;
        
        console.log(`  ✅ Cambiado "${contenido}" → "${dayu.code}"`);
        
        // CAMBIAR COLOR de la faceta asociada
        const parent = texto.parentElement;
        if (parent) {
          // Buscar shapes en el mismo grupo
          const shapes = parent.querySelectorAll('path, polygon, rect, circle, ellipse');
          
          if (shapes.length === 0) {
            // Si no hay shapes en el parent directo, buscar en hermanos
            const grandParent = parent.parentElement;
            if (grandParent) {
              const allShapes = grandParent.querySelectorAll('path, polygon, rect, circle, ellipse');
              allShapes.forEach(shape => {
                const fill = shape.getAttribute('fill');
                if (fill && fill !== 'none') {
                  if (!shape.dataset.originalFill) {
                    shape.dataset.originalFill = fill;
                  }
                  shape.setAttribute('fill', dayu.hex);
                  shape.style.fill = dayu.hex;
                  coloresActualizados++;
                  console.log(`    🎨 Color cambiado (hermano): ${fill} → ${dayu.hex}`);
                }
              });
            }
          } else {
            shapes.forEach(shape => {
              const fill = shape.getAttribute('fill');
              if (fill && fill !== 'none') {
                if (!shape.dataset.originalFill) {
                  shape.dataset.originalFill = fill;
                }
                shape.setAttribute('fill', dayu.hex);
                shape.style.fill = dayu.hex;
                coloresActualizados++;
                console.log(`    🎨 Color cambiado: ${fill} → ${dayu.hex}`);
              }
            });
          }
        }
      }
    });
    
    console.log(`✅ Resultado: ${textosActualizados} textos, ${coloresActualizados} colores`);
    
    return {
      total: textos.length,
      actualizados: textosActualizados,
      coloresActualizados: coloresActualizados
    };
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
      }
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  console.log('✅ DAYU Simple v3 listo');
  
})();
