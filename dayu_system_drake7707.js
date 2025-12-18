/* dayu_system_final.js
 * Sistema DAYU - VERSIÓN CORREGIDA
 * - Solo usa las cajitas de arriba (con códigos DAYU)
 * - Elimina duplicados
 * - Cajitas editables con clic
 * - Actualización automática del SVG
 */

(function() {
  'use strict';
  
  console.log('🎨 Cargando DAYU System Final v2...');
  
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
  // IDENTIFICAR CAJITAS CORRECTAS
  // ============================================
  
  function getColorBoxes() {
    // Buscar todas las cajitas con background
    const allBoxes = Array.from(document.querySelectorAll('div[style*="background"]'));
    
    // Las cajitas correctas son las que:
    // 1. Tienen color de fondo
    // 2. Tienen tamaño visual (no están ocultas)
    // 3. Están en la parte superior (antes de otras cajitas grandes)
    
    const validBoxes = allBoxes.filter(box => {
      const text = box.textContent.trim();
      const rect = box.getBoundingClientRect();
      
      // Debe tener tamaño visible
      if (rect.width < 10 || rect.height < 10) return false;
      
      // Debe tener contenido de texto corto (código DAYU o número)
      if (text.length === 0 || text.length > 5) return false;
      
      // Debe tener color de fondo visible
      const bgColor = window.getComputedStyle(box).backgroundColor;
      if (!bgColor || bgColor === 'transparent') return false;
      
      return true;
    });
    
    // Ordenar por posición Y (las de arriba primero)
    validBoxes.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    // Tomar solo las primeras (las de la fila de arriba)
    // Generalmente son las primeras 16-20 cajitas
    const topY = validBoxes[0]?.getBoundingClientRect().top || 0;
    const topBoxes = validBoxes.filter(box => {
      const rect = box.getBoundingClientRect();
      return Math.abs(rect.top - topY) < 50; // Misma fila (tolerancia 50px)
    });
    
    console.log(`📦 Cajitas encontradas: ${topBoxes.length}`);
    return topBoxes;
  }
  
  // ============================================
  // OCULTAR CAJITAS DUPLICADAS (las de abajo)
  // ============================================
  
  function hideExtraBoxes() {
    const allBoxes = Array.from(document.querySelectorAll('div[style*="background"]'));
    const topBoxes = getColorBoxes();
    
    // Ocultar las que NO son las cajitas de arriba
    allBoxes.forEach(box => {
      if (!topBoxes.includes(box)) {
        const text = box.textContent.trim();
        // Solo ocultar si parece ser una cajita de número (0-200)
        if (/^\d+$/.test(text) && parseInt(text) < 200) {
          box.style.display = 'none';
          console.log(`🚫 Ocultando cajita duplicada: ${text}`);
        }
      }
    });
  }
  
  // ============================================
  // EXTRACCIÓN DE PALETA
  // ============================================
  
  function extractPalette() {
    const boxes = getColorBoxes();
    const palette = new Map();
    
    boxes.forEach((box, index) => {
      const rgb = parseColorFromBox(box);
      if (rgb) {
        palette.set(index, {
          rgb: rgb,
          hex: rgbToHex(rgb),
          box: box,
          originalText: box.textContent.trim()
        });
      }
    });
    
    console.log(`📊 Paleta extraída: ${palette.size} colores`);
    return palette;
  }
  
  // ============================================
  // MAPEO A DAYU
  // ============================================
  
  function mapToDayu(palette) {
    if (!window.DAYU_PALETTE) {
      console.error('❌ DAYU_PALETTE no cargada');
      return null;
    }
    
    const dayuColors = window.DAYU_PALETTE;
    const indices = Array.from(palette.keys());
    
    console.log(`🔄 Mapeando ${indices.length} colores...`);
    
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
    
    distances.sort((a, b) => a.distance - b.distance);
    
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
    
    console.log(`✅ Mapeo: ${mapping.size} colores`);
    return mapping;
  }
  
  // ============================================
  // ACTUALIZACIÓN DE CAJITAS
  // ============================================
  
  function updateBoxes(mapping, palette) {
    mapping.forEach((dayuColor, idx) => {
      const data = palette.get(idx);
      if (data && data.box) {
        // Guardar estado original
        if (!data.box.dataset.originalColor) {
          data.box.dataset.originalColor = data.hex;
          data.box.dataset.originalText = data.originalText;
        }
        
        // Actualizar a DAYU
        data.box.style.backgroundColor = dayuColor.hex;
        data.box.textContent = dayuColor.code;
        data.box.dataset.clusterIdx = idx;
        data.box.dataset.dayuCode = dayuColor.code;
        data.box.dataset.dayuColor = dayuColor.hex;
        
        console.log(`📦 ${idx} → ${dayuColor.code} (${dayuColor.hex})`);
      }
    });
  }
  
  // ============================================
  // ACTUALIZACIÓN DEL SVG
  // ============================================
  
  function updateSVG(mapping, palette) {
    const svg = document.querySelector('svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return false;
    }
    
    // Crear un mapa de código DAYU a índice de cluster
    const dayuToCluster = new Map();
    mapping.forEach((dayuColor, idx) => {
      dayuToCluster.set(dayuColor.code, idx);
    });
    
    // También mapear por color original
    const colorToCluster = new Map();
    palette.forEach((data, idx) => {
      colorToCluster.set(data.hex.toLowerCase(), idx);
    });
    
    let updated = 0;
    const texts = svg.querySelectorAll('text');
    
    texts.forEach(textEl => {
      const currentText = textEl.textContent.trim();
      
      // Buscar el cluster correspondiente
      let clusterIdx = null;
      
      // Opción 1: Por número directo (si es 0, 1, 2...)
      if (/^\d+$/.test(currentText)) {
        const num = parseInt(currentText);
        if (mapping.has(num)) {
          clusterIdx = num;
        }
      }
      
      // Opción 2: Por color de la faceta
      if (clusterIdx === null) {
        const parent = textEl.parentElement;
        if (parent) {
          const shape = parent.querySelector('path, polygon, rect');
          if (shape) {
            const fill = shape.getAttribute('fill');
            if (fill) {
              const fillHex = fill.toLowerCase().replace('#', '');
              const fullHex = fillHex.length === 6 ? fillHex : null;
              if (fullHex && colorToCluster.has('#' + fullHex)) {
                clusterIdx = colorToCluster.get('#' + fullHex);
              }
            }
          }
        }
      }
      
      // Aplicar cambio
      if (clusterIdx !== null && mapping.has(clusterIdx)) {
        const dayuColor = mapping.get(clusterIdx);
        
        // Guardar original
        if (!textEl.dataset.originalText) {
          textEl.dataset.originalText = currentText;
        }
        
        textEl.textContent = dayuColor.code;
        textEl.dataset.clusterIdx = clusterIdx;
        
        // Actualizar faceta
        const parent = textEl.parentElement;
        if (parent) {
          const shapes = parent.querySelectorAll('path, polygon, rect');
          shapes.forEach(shape => {
            const fill = shape.getAttribute('fill');
            if (fill && fill !== 'none') {
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
    });
    
    console.log(`✅ SVG: ${updated} etiquetas actualizadas`);
    return updated > 0;
  }
  
  // ============================================
  // HACER CAJITAS EDITABLES
  // ============================================
  
  function makeBoxesEditable() {
    const boxes = Array.from(document.querySelectorAll('div[data-dayu-code]'));
    
    console.log(`✏️ Haciendo ${boxes.length} cajitas editables...`);
    
    boxes.forEach(box => {
      // Clonar para remover listeners
      const newBox = box.cloneNode(true);
      box.parentNode.replaceChild(newBox, box);
      
      // Estilo
      newBox.style.cursor = 'pointer';
      newBox.style.transition = 'all 0.2s';
      newBox.title = '🖱️ Clic para editar\nEjemplos: 64, WG3, BG5';
      
      // Hover
      newBox.addEventListener('mouseenter', () => {
        newBox.style.transform = 'scale(1.15)';
        newBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        newBox.style.zIndex = '1000';
      });
      
      newBox.addEventListener('mouseleave', () => {
        newBox.style.transform = 'scale(1)';
        newBox.style.boxShadow = '';
        newBox.style.zIndex = '';
      });
      
      // Click para editar
      newBox.addEventListener('click', function(e) {
        e.stopPropagation();
        
        const currentCode = this.textContent.trim();
        const clusterIdx = parseInt(this.dataset.clusterIdx);
        
        // Input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentCode;
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
          padding: 0;
        `;
        
        this.textContent = '';
        this.appendChild(input);
        input.focus();
        input.select();
        
        const applyChange = () => {
          const newCode = input.value.trim().toUpperCase();
          
          // Buscar en DAYU
          const newDayuColor = window.DAYU_PALETTE.find(c => 
            c.code.toUpperCase() === newCode
          );
          
          if (newDayuColor) {
            // Actualizar mapping
            if (currentMapping) {
              currentMapping.set(clusterIdx, {
                code: newDayuColor.code,
                hex: newDayuColor.hex,
                rgb: newDayuColor.rgb,
                original: currentMapping.get(clusterIdx).original
              });
            }
            
            // Actualizar cajita
            this.textContent = newDayuColor.code;
            this.style.backgroundColor = newDayuColor.hex;
            this.dataset.dayuCode = newDayuColor.code;
            this.dataset.dayuColor = newDayuColor.hex;
            
            // Actualizar SVG
            updateSVGForCluster(clusterIdx, newDayuColor);
            
            // Animación
            this.style.animation = 'none';
            setTimeout(() => {
              this.style.animation = 'dayu-pulse 0.5s';
            }, 10);
            
            console.log(`✏️ Editado: Cluster ${clusterIdx} → ${newDayuColor.code}`);
            
          } else {
            alert(`❌ Código "${newCode}" no encontrado\n\n✅ Ejemplos válidos:\n• 64, 67, 121, 167\n• WG3, BG5, CG7\n• GG1, GG3, GG5`);
            this.textContent = currentCode;
          }
        };
        
        input.addEventListener('blur', applyChange);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            applyChange();
          } else if (e.key === 'Escape') {
            this.textContent = currentCode;
          }
        });
      });
    });
  }
  
  function updateSVGForCluster(clusterIdx, newDayuColor) {
    const svg = document.querySelector('svg');
    if (!svg) return;
    
    const texts = svg.querySelectorAll(`text[data-cluster-idx="${clusterIdx}"]`);
    texts.forEach(textEl => {
      textEl.textContent = newDayuColor.code;
      
      const parent = textEl.parentElement;
      if (parent) {
        const shapes = parent.querySelectorAll('path, polygon, rect');
        shapes.forEach(shape => {
          shape.setAttribute('fill', newDayuColor.hex);
          shape.style.fill = newDayuColor.hex;
        });
      }
    });
    
    console.log(`🔄 SVG actualizado para cluster ${clusterIdx}`);
  }
  
  // ============================================
  // RESET
  // ============================================
  
  function resetToOriginal() {
    console.log('🔄 Reseteando...');
    
    // Reset cajitas
    const boxes = document.querySelectorAll('div[data-original-color]');
    boxes.forEach(box => {
      box.style.backgroundColor = box.dataset.originalColor;
      box.textContent = box.dataset.originalText;
      box.style.cursor = 'default';
      box.style.transform = '';
      box.title = '';
      delete box.dataset.clusterIdx;
      delete box.dataset.dayuCode;
    });
    
    // Reset SVG
    const svg = document.querySelector('svg');
    if (svg) {
      const texts = svg.querySelectorAll('text[data-original-text]');
      texts.forEach(t => {
        t.textContent = t.dataset.originalText;
      });
      
      const shapes = svg.querySelectorAll('[data-original-fill]');
      shapes.forEach(s => {
        s.setAttribute('fill', s.dataset.originalFill);
      });
    }
    
    // Mostrar cajitas ocultas
    const hidden = document.querySelectorAll('div[style*="display: none"]');
    hidden.forEach(box => {
      if (/^\d+$/.test(box.textContent.trim())) {
        box.style.display = '';
      }
    });
    
    currentMapping = null;
    console.log('✅ Reset completo');
  }
  
  // ============================================
  // APLICAR DAYU
  // ============================================
  
  function aplicarDayu() {
    console.log('🎨 === APLICAR DAYU ===');
    
    // 1. Ocultar duplicados
    hideExtraBoxes();
    
    // 2. Extraer paleta
    const palette = extractPalette();
    if (!palette || palette.size === 0) {
      alert('❌ No se encontraron cajitas de color.\n\nGenera la imagen primero.');
      return;
    }
    
    originalPalette = palette;
    
    // 3. Mapear
    const mapping = mapToDayu(palette);
    if (!mapping) {
      alert('❌ Error al mapear');
      return;
    }
    
    currentMapping = mapping;
    
    // 4. Actualizar
    updateBoxes(mapping, palette);
    updateSVG(mapping, palette);
    makeBoxesEditable();
    
    // 5. Agregar CSS
    if (!document.getElementById('dayu-styles')) {
      const style = document.createElement('style');
      style.id = 'dayu-styles';
      style.textContent = `
        @keyframes dayu-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
      `;
      document.head.appendChild(style);
    }
    
    console.log('🎉 ¡COMPLETADO!');
    alert(`✅ DAYU aplicado: ${mapping.size} colores\n\n💡 Haz clic en cualquier cajita de arriba para editarla\n\nEjemplos: 64, WG3, BG5, CG7`);
  }
  
  // ============================================
  // CONECTAR BOTONES
  // ============================================
  
  function conectarBotones() {
    const buttons = Array.from(document.querySelectorAll('button'));
    
    const aplicarBtn = buttons.find(b => b.textContent.includes('APLICAR'));
    const resetBtn = buttons.find(b => b.textContent.includes('RESET'));
    
    if (aplicarBtn) {
      const newBtn = aplicarBtn.cloneNode(true);
      aplicarBtn.parentNode.replaceChild(newBtn, aplicarBtn);
      newBtn.addEventListener('click', aplicarDayu);
      console.log('✅ Botón APLICAR conectado');
    }
    
    if (resetBtn) {
      const newBtn = resetBtn.cloneNode(true);
      resetBtn.parentNode.replaceChild(newBtn, resetBtn);
      newBtn.addEventListener('click', resetToOriginal);
      console.log('✅ Botón RESET conectado');
    }
  }
  
  // ============================================
  // INIT
  // ============================================
  
  function init() {
    if (!window.DAYU_PALETTE) {
      console.error('❌ DAYU_PALETTE no cargada');
      return;
    }
    
    console.log(`✅ DAYU: ${window.DAYU_PALETTE.length} colores`);
    
    setTimeout(conectarBotones, 1000);
    
    const observer = new MutationObserver(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('APLICAR') && !b.onclick);
      if (btn) conectarBotones();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    console.log('✅ DAYU System v2 listo');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  window.DAYU_SYSTEM = {
    aplicar: aplicarDayu,
    reset: resetToOriginal
  };
  
})();
