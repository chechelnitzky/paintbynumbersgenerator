/* dayu_system_final.js
 * Sistema DAYU completo y funcional
 * - Botón "APLICAR DAYU" conectado
 * - Cajitas editables (clic → escribe código → Enter)
 * - Actualización automática del SVG
 * - Botón RESET para volver a colores originales
 * 
 * Requiere: dayu_palette.js cargado primero
 */

(function() {
  'use strict';
  
  console.log('🎨 Cargando DAYU System Final...');
  
  // ============================================
  // ESTADO GLOBAL
  // ============================================
  
  let currentMapping = null;
  let originalPalette = null;
  
  // ============================================
  // UTILIDADES
  // ============================================
  
  function colorDistance(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return dr * dr + dg * dg + db * db;
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
  // EXTRACCIÓN DE PALETA
  // ============================================
  
  function extractPalette() {
    const boxes = document.querySelectorAll('div[style*="background"]');
    const palette = new Map();
    
    boxes.forEach(box => {
      const text = box.textContent.trim();
      if (/^\d+$/.test(text)) {
        const idx = parseInt(text);
        const rgb = parseColorFromBox(box);
        if (rgb) {
          palette.set(idx, {
            rgb: rgb,
            hex: rgbToHex(rgb),
            box: box
          });
        }
      }
    });
    
    return palette;
  }
  
  // ============================================
  // MAPEO A DAYU (1:1 sin repetir)
  // ============================================
  
  function mapToDayu(palette) {
    if (!window.DAYU_PALETTE) {
      console.error('❌ DAYU_PALETTE no cargada');
      return null;
    }
    
    const dayuColors = window.DAYU_PALETTE;
    const indices = Array.from(palette.keys()).sort((a, b) => a - b);
    
    console.log(`📊 Mapeando ${indices.length} colores a DAYU...`);
    
    // Calcular distancias
    const distances = [];
    indices.forEach(idx => {
      const currentColor = palette.get(idx);
      dayuColors.forEach((dayuColor, dayuIdx) => {
        distances.push({
          clusterIdx: idx,
          dayuIdx: dayuIdx,
          distance: colorDistance(currentColor.rgb, dayuColor.rgb)
        });
      });
    });
    
    // Ordenar por distancia
    distances.sort((a, b) => a.distance - b.distance);
    
    // Asignación greedy 1:1
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
      mapping.set(item.clusterIdx, {
        code: dayuColor.code,
        hex: dayuColor.hex,
        rgb: dayuColor.rgb,
        original: palette.get(item.clusterIdx)
      });
      
      if (mapping.size === indices.length) break;
    }
    
    console.log(`✅ Mapeo completado: ${mapping.size} colores`);
    return mapping;
  }
  
  // ============================================
  // ACTUALIZACIÓN DE CAJITAS
  // ============================================
  
  function updateBoxes(mapping, palette) {
    mapping.forEach((dayuColor, idx) => {
      const data = palette.get(idx);
      if (data && data.box) {
        // Guardar color original
        if (!data.box.dataset.originalColor) {
          data.box.dataset.originalColor = data.hex;
          data.box.dataset.originalText = idx;
        }
        
        // Actualizar a DAYU
        data.box.style.backgroundColor = dayuColor.hex;
        data.box.textContent = dayuColor.code;
        data.box.dataset.originalIdx = idx;
        data.box.dataset.dayuCode = dayuColor.code;
        data.box.dataset.dayuColor = dayuColor.hex;
        
        console.log(`📦 Cluster ${idx} → DAYU ${dayuColor.code}`);
      }
    });
  }
  
  // ============================================
  // ACTUALIZACIÓN DEL SVG
  // ============================================
  
  function updateSVG(mapping) {
    const svg = document.querySelector('svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return false;
    }
    
    let updated = 0;
    const texts = svg.querySelectorAll('text');
    
    texts.forEach(textEl => {
      const currentText = textEl.textContent.trim();
      
      // Si es un número (índice original)
      if (/^\d+$/.test(currentText)) {
        const idx = parseInt(currentText);
        const dayuColor = mapping.get(idx);
        
        if (dayuColor) {
          // Guardar original
          if (!textEl.dataset.originalText) {
            textEl.dataset.originalText = currentText;
          }
          
          textEl.textContent = dayuColor.code;
          textEl.dataset.originalIdx = idx;
          
          // Actualizar faceta
          const parent = textEl.parentElement;
          if (parent) {
            const shapes = parent.querySelectorAll('path, polygon, rect');
            shapes.forEach(shape => {
              const fill = shape.getAttribute('fill');
              if (fill && fill !== 'none') {
                // Guardar original
                if (!shape.dataset.originalFill) {
                  shape.dataset.originalFill = fill;
                }
                shape.setAttribute('fill', dayuColor.hex);
                shape.style.fill = dayuColor.hex;
              }
            });
          }
          
          updated++;
        }
      }
    });
    
    console.log(`✅ SVG actualizado: ${updated} etiquetas`);
    return updated > 0;
  }
  
  // ============================================
  // HACER CAJITAS EDITABLES
  // ============================================
  
  function makeBoxesEditable() {
    const boxes = document.querySelectorAll('div[data-dayu-code]');
    
    boxes.forEach(box => {
      // Remover listeners anteriores
      const newBox = box.cloneNode(true);
      box.parentNode.replaceChild(newBox, box);
      
      // Estilo visual
      newBox.style.cursor = 'pointer';
      newBox.style.transition = 'transform 0.2s, box-shadow 0.2s';
      newBox.title = 'Clic para editar código DAYU (ej: 64, 67, WG3)';
      
      // Hover effect
      newBox.addEventListener('mouseenter', () => {
        newBox.style.transform = 'scale(1.1)';
        newBox.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
      });
      
      newBox.addEventListener('mouseleave', () => {
        newBox.style.transform = 'scale(1)';
        newBox.style.boxShadow = '';
      });
      
      // Click para editar
      newBox.addEventListener('click', function(e) {
        e.stopPropagation();
        
        const currentCode = this.textContent.trim();
        const originalIdx = parseInt(this.dataset.originalIdx);
        
        // Crear input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentCode;
        input.style.cssText = `
          width: 100%;
          height: 100%;
          border: 3px solid #2196F3;
          text-align: center;
          font-size: inherit;
          font-weight: bold;
          box-sizing: border-box;
          background: white;
          color: black;
        `;
        
        this.textContent = '';
        this.appendChild(input);
        input.focus();
        input.select();
        
        const applyChange = () => {
          const newCodeInput = input.value.trim().toUpperCase();
          
          // Buscar en DAYU_PALETTE
          const newDayuColor = window.DAYU_PALETTE.find(c => 
            c.code.toUpperCase() === newCodeInput
          );
          
          if (newDayuColor) {
            // Actualizar mapping global
            if (currentMapping) {
              currentMapping.set(originalIdx, {
                code: newDayuColor.code,
                hex: newDayuColor.hex,
                rgb: newDayuColor.rgb,
                original: currentMapping.get(originalIdx).original
              });
            }
            
            // Actualizar cajita
            this.textContent = newDayuColor.code;
            this.style.backgroundColor = newDayuColor.hex;
            this.dataset.dayuCode = newDayuColor.code;
            this.dataset.dayuColor = newDayuColor.hex;
            
            // Actualizar SVG
            updateSVGForIndex(originalIdx, newDayuColor);
            
            console.log(`✏️ Editado: Cluster ${originalIdx} → ${newDayuColor.code}`);
            
            // Mostrar confirmación visual
            this.style.animation = 'none';
            setTimeout(() => {
              this.style.animation = 'pulse 0.5s';
            }, 10);
            
          } else {
            alert(`❌ Código "${newCodeInput}" no encontrado en paleta DAYU\n\nEjemplos válidos:\n- Números: 64, 67, 121\n- Códigos: WG3, BG5, CG7`);
            this.textContent = currentCode;
          }
        };
        
        input.addEventListener('blur', applyChange);
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            applyChange();
          } else if (e.key === 'Escape') {
            this.textContent = currentCode;
          }
        });
      });
    });
    
    console.log(`✏️ ${boxes.length} cajitas ahora son editables`);
  }
  
  function updateSVGForIndex(idx, newDayuColor) {
    const svg = document.querySelector('svg');
    if (!svg) return;
    
    const texts = svg.querySelectorAll('text[data-original-idx="' + idx + '"]');
    texts.forEach(textEl => {
      textEl.textContent = newDayuColor.code;
      
      // Actualizar faceta
      const parent = textEl.parentElement;
      if (parent) {
        const shapes = parent.querySelectorAll('path, polygon, rect');
        shapes.forEach(shape => {
          shape.setAttribute('fill', newDayuColor.hex);
          shape.style.fill = newDayuColor.hex;
        });
      }
    });
  }
  
  // ============================================
  // RESET A COLORES ORIGINALES
  // ============================================
  
  function resetToOriginal() {
    console.log('🔄 Reseteando a colores originales...');
    
    // Reset cajitas
    const boxes = document.querySelectorAll('div[data-original-color]');
    boxes.forEach(box => {
      const originalColor = box.dataset.originalColor;
      const originalText = box.dataset.originalText;
      
      if (originalColor && originalText) {
        box.style.backgroundColor = originalColor;
        box.textContent = originalText;
        box.style.cursor = 'default';
        box.style.transform = '';
        box.style.boxShadow = '';
        box.title = '';
      }
    });
    
    // Reset SVG
    const svg = document.querySelector('svg');
    if (svg) {
      const texts = svg.querySelectorAll('text[data-original-text]');
      texts.forEach(textEl => {
        textEl.textContent = textEl.dataset.originalText;
      });
      
      const shapes = svg.querySelectorAll('[data-original-fill]');
      shapes.forEach(shape => {
        shape.setAttribute('fill', shape.dataset.originalFill);
        shape.style.fill = shape.dataset.originalFill;
      });
    }
    
    currentMapping = null;
    console.log('✅ Reset completado');
  }
  
  // ============================================
  // PROCESO PRINCIPAL
  // ============================================
  
  function aplicarDayu() {
    console.log('🎨 === APLICAR DAYU ===');
    
    // 1. Extraer paleta
    const palette = extractPalette();
    if (!palette || palette.size === 0) {
      alert('❌ No se pudo extraer la paleta.\n\nAsegúrate de haber generado la imagen primero.');
      return;
    }
    
    originalPalette = palette;
    console.log(`📊 Paleta extraída: ${palette.size} colores`);
    
    // 2. Mapear a DAYU
    const mapping = mapToDayu(palette);
    if (!mapping) {
      alert('❌ Error al mapear a paleta DAYU');
      return;
    }
    
    currentMapping = mapping;
    
    // 3. Actualizar cajitas
    updateBoxes(mapping, palette);
    
    // 4. Actualizar SVG
    updateSVG(mapping);
    
    // 5. Hacer cajitas editables
    makeBoxesEditable();
    
    // Agregar animación CSS si no existe
    if (!document.getElementById('dayu-styles')) {
      const style = document.createElement('style');
      style.id = 'dayu-styles';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `;
      document.head.appendChild(style);
    }
    
    console.log('🎉 === DAYU APLICADO ===');
    alert(`✅ ¡DAYU aplicado correctamente!\n\n${mapping.size} colores mapeados\n\n💡 Tip: Haz clic en cualquier cajita de color para cambiar el código DAYU manualmente.\n\nEjemplos: 64, 67, WG3, BG5, CG7`);
  }
  
  // ============================================
  // CONECTAR BOTONES
  // ============================================
  
  function conectarBotones() {
    // Buscar botones existentes
    const buttons = Array.from(document.querySelectorAll('button'));
    
    const aplicarBtn = buttons.find(b => 
      b.textContent.includes('APLICAR DAYU') || 
      b.textContent.includes('APLICAR')
    );
    
    const resetBtn = buttons.find(b => 
      b.textContent.includes('RESET') || 
      b.textContent.includes('VOLVER')
    );
    
    if (aplicarBtn) {
      // Clonar para remover listeners anteriores
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
      
      newBtn.addEventListener('click', resetToOriginal);
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
      console.error('Asegúrate de cargar dayu_palette.js antes de dayu_system_final.js');
      return;
    }
    
    console.log(`✅ DAYU_PALETTE cargada: ${window.DAYU_PALETTE.length} colores`);
    
    // Intentar conectar botones cuando estén disponibles
    const tryConnect = () => {
      const aplicarBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('APLICAR'));
      
      if (aplicarBtn) {
        conectarBotones();
      } else {
        // Intentar de nuevo en 500ms
        setTimeout(tryConnect, 500);
      }
    };
    
    tryConnect();
    
    // Observer para detectar cuando se agregan botones nuevos
    const observer = new MutationObserver(() => {
      const aplicarBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('APLICAR') && !b.onclick);
      
      if (aplicarBtn) {
        conectarBotones();
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    console.log('✅ DAYU System Final inicializado');
    console.log('📝 Usa el checkbox "Usar paleta Dayu" y el botón "APLICAR DAYU"');
  }
  
  // Esperar DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // API pública
  window.DAYU_SYSTEM = {
    aplicar: aplicarDayu,
    reset: resetToOriginal,
    getMapping: () => currentMapping,
    getPalette: () => originalPalette
  };
  
  console.log('✅ window.DAYU_SYSTEM disponible');
  
})();
