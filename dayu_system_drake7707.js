/* dayu_fix_cajitas.js
 * Fix para el sistema DAYU existente
 * - No duplica las cajitas de colores
 * - Hace que las cajitas sean editables (input con Enter)
 * - Mapea correctamente a paleta DAYU
 * 
 * INSTRUCCIONES:
 * 1. Reemplaza tu código DAYU actual con este
 * 2. Mantén el checkbox "Usar paleta Dayu"
 * 3. Los botones APLICAR DAYU y RESET funcionarán correctamente
 */

(function() {
  "use strict";

  console.log('🎨 Cargando DAYU Fix - Sin Duplicar Cajitas...');

  // ============================================
  // UTILIDADES
  // ============================================
  
  function colorDistance(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return dr * dr + dg * dg + db * db;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '').trim();
    if (h.length !== 6) return null;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(v => {
      const hex = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function parseColorFromBox(boxElement) {
    const bgColor = window.getComputedStyle(boxElement).backgroundColor;
    const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }
    return null;
  }

  // ============================================
  // EXTRACCIÓN DE PALETA DESDE LAS CAJITAS
  // ============================================
  
  function extractPaletteFromColorBoxes() {
    // Las cajitas de colores con números (0, 1, 2, 3...)
    const colorBoxes = document.querySelectorAll('div[style*="background"]');
    const palette = new Map();

    colorBoxes.forEach(box => {
      const text = box.textContent.trim();
      
      // Si es un número (índice del cluster)
      if (/^\d+$/.test(text)) {
        const idx = parseInt(text);
        const rgb = parseColorFromBox(box);
        
        if (rgb && !palette.has(idx)) {
          palette.set(idx, {
            rgb: rgb,
            hex: rgbToHex(rgb),
            element: box
          });
        }
      }
    });

    return palette;
  }

  // ============================================
  // MAPEO A DAYU (1:1 sin repetir)
  // ============================================
  
  function mapToDayuPalette(currentPalette) {
    if (!window.DAYU_PALETTE || !Array.isArray(window.DAYU_PALETTE)) {
      console.error('❌ DAYU_PALETTE no está cargada');
      return null;
    }

    const dayuColors = window.DAYU_PALETTE;
    const indices = Array.from(currentPalette.keys()).sort((a, b) => a - b);
    
    console.log(`📊 Mapeando ${indices.length} clusters a ${dayuColors.length} colores DAYU`);
    
    // Crear matriz de distancias
    const distances = [];
    indices.forEach(idx => {
      const currentColor = currentPalette.get(idx);
      dayuColors.forEach((dayuColor, dayuIdx) => {
        distances.push({
          clusterIdx: idx,
          dayuIdx: dayuIdx,
          distance: colorDistance(currentColor.rgb, dayuColor.rgb)
        });
      });
    });

    // Ordenar por distancia (menor primero)
    distances.sort((a, b) => a.distance - b.distance);

    // Asignación greedy 1:1 sin repetir
    const usedClusters = new Set();
    const usedDayu = new Set();
    const mapping = new Map();

    for (const item of distances) {
      if (usedClusters.has(item.clusterIdx) || usedDayu.has(item.dayuIdx)) {
        continue;
      }

      usedClusters.add(item.clusterIdx);
      usedDayu.add(item.dayuIdx);
      
      const dayuColor = dayuColors[item.dayuIdx];
      const originalColor = currentPalette.get(item.clusterIdx);
      
      mapping.set(item.clusterIdx, {
        code: dayuColor.code,
        hex: dayuColor.hex,
        rgb: dayuColor.rgb,
        originalRgb: originalColor.rgb,
        originalHex: originalColor.hex
      });

      if (mapping.size === indices.length) break;
    }

    console.log(`✅ Mapeo completado: ${mapping.size} colores`);
    return mapping;
  }

  // ============================================
  // ACTUALIZACIÓN DE CAJITAS (NO DUPLICAR)
  // ============================================
  
  function updateColorBoxes(mapping, originalPalette) {
    // Encontrar las cajitas de colores
    const colorBoxes = document.querySelectorAll('div[style*="background"]');
    
    colorBoxes.forEach(box => {
      const text = box.textContent.trim();
      
      if (/^\d+$/.test(text)) {
        const idx = parseInt(text);
        const dayuColor = mapping.get(idx);
        
        if (dayuColor) {
          // Actualizar el color de fondo
          box.style.backgroundColor = dayuColor.hex;
          
          // Cambiar el texto al código DAYU
          box.textContent = dayuColor.code;
          
          // Guardar datos en el elemento
          box.dataset.originalIdx = idx;
          box.dataset.dayuCode = dayuColor.code;
          box.dataset.originalColor = originalPalette.get(idx).hex;
          box.dataset.dayuColor = dayuColor.hex;
          
          console.log(`📦 Box ${idx} → DAYU ${dayuColor.code} (${dayuColor.hex})`);
        }
      }
    });
  }

  // ============================================
  // ACTUALIZACIÓN DEL SVG
  // ============================================
  
  function updateSVG(mapping) {
    const svg = document.querySelector('svg');
    if (!svg) {
      console.warn('⚠️ No se encontró SVG');
      return false;
    }

    let updated = 0;
    const textElements = svg.querySelectorAll('text');

    textElements.forEach(textEl => {
      const currentText = textEl.textContent.trim();
      
      // Si es un número (índice original)
      if (/^\d+$/.test(currentText)) {
        const idx = parseInt(currentText);
        const dayuColor = mapping.get(idx);
        
        if (dayuColor) {
          // Guardar índice original
          textEl.dataset.originalIdx = String(idx);
          
          // Cambiar texto al código DAYU
          textEl.textContent = dayuColor.code;
          
          // Actualizar color de la faceta
          const facet = findFacetForText(textEl);
          if (facet) {
            facet.setAttribute('fill', dayuColor.hex);
            if (facet.style.fill) {
              facet.style.fill = dayuColor.hex;
            }
          }
          
          updated++;
        }
      }
    });

    console.log(`✅ SVG actualizado: ${updated} etiquetas cambiadas`);
    return updated > 0;
  }

  function findFacetForText(textEl) {
    const parent = textEl.parentElement;
    if (!parent) return null;

    // Buscar path/polygon en el mismo grupo
    const shapes = parent.querySelectorAll('path, polygon, rect');
    for (const shape of shapes) {
      const fill = shape.getAttribute('fill');
      if (fill && fill !== 'none') {
        return shape;
      }
    }

    return null;
  }

  // ============================================
  // HACER CAJITAS EDITABLES
  // ============================================
  
  function makeBoxesEditable(mapping) {
    const colorBoxes = document.querySelectorAll('div[dataset-dayu-code]');
    
    colorBoxes.forEach(box => {
      // Remover listeners anteriores
      const newBox = box.cloneNode(true);
      box.parentNode.replaceChild(newBox, box);
      
      newBox.style.cursor = 'pointer';
      newBox.title = 'Clic para editar código DAYU';
      
      newBox.addEventListener('click', function() {
        const currentCode = this.textContent.trim();
        const originalIdx = parseInt(this.dataset.originalIdx);
        
        // Crear input temporal
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentCode;
        input.style.cssText = `
          width: 100%;
          height: 100%;
          border: 2px solid #2196F3;
          text-align: center;
          font-size: inherit;
          font-weight: inherit;
        `;
        
        this.textContent = '';
        this.appendChild(input);
        input.focus();
        input.select();
        
        const applyChange = () => {
          const newCode = input.value.trim().toUpperCase();
          
          // Buscar el color DAYU
          const newDayuColor = window.DAYU_PALETTE.find(c => 
            c.code.toUpperCase() === newCode
          );
          
          if (newDayuColor) {
            // Actualizar mapping
            mapping.set(originalIdx, {
              code: newDayuColor.code,
              hex: newDayuColor.hex,
              rgb: newDayuColor.rgb,
              originalRgb: mapping.get(originalIdx).originalRgb,
              originalHex: mapping.get(originalIdx).originalHex
            });
            
            // Actualizar cajita
            this.textContent = newDayuColor.code;
            this.style.backgroundColor = newDayuColor.hex;
            this.dataset.dayuCode = newDayuColor.code;
            this.dataset.dayuColor = newDayuColor.hex;
            
            // Actualizar SVG
            updateSVGForIndex(originalIdx, newDayuColor);
            
            console.log(`✏️ Cambiado cluster ${originalIdx} a DAYU ${newDayuColor.code}`);
          } else {
            alert(`❌ Código DAYU "${newCode}" no encontrado.\nEjemplos válidos: 64, 67, WG3, BG5`);
            this.textContent = currentCode;
          }
        };
        
        input.addEventListener('blur', applyChange);
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            applyChange();
          }
        });
      });
    });
  }

  function updateSVGForIndex(idx, newDayuColor) {
    const svg = document.querySelector('svg');
    if (!svg) return;

    const textElements = svg.querySelectorAll('text');
    textElements.forEach(textEl => {
      if (textEl.dataset.originalIdx === String(idx)) {
        textEl.textContent = newDayuColor.code;
        
        const facet = findFacetForText(textEl);
        if (facet) {
          facet.setAttribute('fill', newDayuColor.hex);
          if (facet.style.fill) {
            facet.style.fill = newDayuColor.hex;
          }
        }
      }
    });
  }

  // ============================================
  // RESET
  // ============================================
  
  function resetToOriginal(originalPalette) {
    console.log('🔄 Reseteando a colores originales...');
    
    // Resetear cajitas
    const colorBoxes = document.querySelectorAll('div[data-original-idx]');
    colorBoxes.forEach(box => {
      const idx = parseInt(box.dataset.originalIdx);
      const originalColor = box.dataset.originalColor;
      
      if (originalColor) {
        box.style.backgroundColor = originalColor;
        box.textContent = idx;
      }
    });
    
    // Resetear SVG
    const svg = document.querySelector('svg');
    if (svg) {
      const textElements = svg.querySelectorAll('text[data-original-idx]');
      textElements.forEach(textEl => {
        const idx = textEl.dataset.originalIdx;
        const originalData = originalPalette.get(parseInt(idx));
        
        if (originalData) {
          textEl.textContent = idx;
          
          const facet = findFacetForText(textEl);
          if (facet) {
            facet.setAttribute('fill', originalData.hex);
            if (facet.style.fill) {
              facet.style.fill = originalData.hex;
            }
          }
        }
      });
    }
    
    console.log('✅ Reset completado');
  }

  // ============================================
  // PROCESO PRINCIPAL
  // ============================================
  
  let currentMapping = null;
  let originalPalette = null;

  function aplicarDayu() {
    console.log('🎨 Aplicando DAYU...');
    
    // 1. Extraer paleta desde cajitas
    const palette = extractPaletteFromColorBoxes();
    if (!palette || palette.size === 0) {
      alert('❌ No se pudo extraer la paleta. Genera primero la imagen.');
      return;
    }
    
    originalPalette = palette;
    console.log(`📊 Paleta extraída: ${palette.size} colores`);
    
    // 2. Mapear a DAYU
    const mapping = mapToDayuPalette(palette);
    if (!mapping) {
      alert('❌ Error al mapear a DAYU');
      return;
    }
    
    currentMapping = mapping;
    
    // 3. Actualizar cajitas (NO duplicar)
    updateColorBoxes(mapping, palette);
    
    // 4. Actualizar SVG
    updateSVG(mapping);
    
    // 5. Hacer cajitas editables
    makeBoxesEditable(mapping);
    
    alert(`✅ DAYU aplicado!\n${mapping.size} colores mapeados\n\nTip: Haz clic en cualquier cajita para editar el código (ej: 64, 67, WG3)`);
  }

  function resetear() {
    if (!originalPalette) {
      alert('⚠️ No hay nada que resetear');
      return;
    }
    
    resetToOriginal(originalPalette);
    currentMapping = null;
  }

  // ============================================
  // CONECTAR CON BOTONES EXISTENTES
  // ============================================
  
  function conectarBotones() {
    // Buscar el botón "APLICAR DAYU"
    const buttons = Array.from(document.querySelectorAll('button'));
    const aplicarBtn = buttons.find(b => b.textContent.includes('APLICAR DAYU'));
    const resetBtn = buttons.find(b => b.textContent.includes('RESET'));
    
    if (aplicarBtn) {
      // Remover listeners anteriores
      const newBtn = aplicarBtn.cloneNode(true);
      aplicarBtn.parentNode.replaceChild(newBtn, aplicarBtn);
      
      newBtn.addEventListener('click', aplicarDayu);
      console.log('✅ Botón APLICAR DAYU conectado');
    } else {
      console.warn('⚠️ No se encontró botón APLICAR DAYU');
    }
    
    if (resetBtn) {
      const newBtn = resetBtn.cloneNode(true);
      resetBtn.parentNode.replaceChild(newBtn, resetBtn);
      
      newBtn.addEventListener('click', resetear);
      console.log('✅ Botón RESET conectado');
    } else {
      console.warn('⚠️ No se encontró botón RESET');
    }
  }

  // ============================================
  // INICIALIZACIÓN
  // ============================================
  
  function init() {
    if (!window.DAYU_PALETTE) {
      console.error('❌ DAYU_PALETTE no está cargada');
      return;
    }
    
    console.log(`✅ DAYU_PALETTE: ${window.DAYU_PALETTE.length} colores`);
    
    // Esperar a que los botones estén en el DOM
    const observer = new MutationObserver(() => {
      const aplicarBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('APLICAR DAYU'));
      
      if (aplicarBtn) {
        observer.disconnect();
        conectarBotones();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Intentar conectar inmediatamente también
    setTimeout(conectarBotones, 1000);
    
    console.log('✅ Sistema DAYU Fix inicializado');
  }

  // Esperar DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API pública
  window.DAYU_SYSTEM = {
    aplicarDayu,
    resetear,
    getCurrentMapping: () => currentMapping,
    getOriginalPalette: () => originalPalette
  };

})();
