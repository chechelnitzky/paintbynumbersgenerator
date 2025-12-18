/* ayu_system_drake7707.js
 * VERSIÓN DEFINITIVA - Solo editar cajitas superiores
 * Características:
 * - Mapea colores a DAYU automáticamente
 * - Las cajitas de ARRIBA (167, 124, 42, etc.) son EDITABLES
 * - Clic en cajita → escribir código → Enter → cambia color y actualiza SVG
 * - Ignora completamente las cajitas de abajo
 */

(function() {
  'use strict';
  
  console.log('🎨 DAYU System v3 - Cajitas superiores editables');
  
  // ============================================
  // ESTADO GLOBAL
  // ============================================
  
  let clusterMapping = new Map(); // cluster original → código DAYU actual
  let boxToCluster = new Map();   // elemento cajita → índice cluster
  
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
    const h = hex.replace('#', '');
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
  
  function parseColorFromElement(el) {
    const bg = window.getComputedStyle(el).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
  }
  
  function getDayuColor(code) {
    if (!window.DAYU_PALETTE) return null;
    return window.DAYU_PALETTE.find(c => 
      c.code.toUpperCase() === code.toUpperCase()
    );
  }
  
  // ============================================
  // IDENTIFICAR CAJITAS SUPERIORES
  // ============================================
  
  function getTopColorBoxes() {
    // Buscar todas las cajitas con color
    const allBoxes = Array.from(document.querySelectorAll('div')).filter(div => {
      const bg = window.getComputedStyle(div).backgroundColor;
      const rect = div.getBoundingClientRect();
      const text = div.textContent.trim();
      
      // Filtros:
      // 1. Tiene background color visible
      // 2. Tiene tamaño razonable (30-100px)
      // 3. Texto corto (< 6 caracteres)
      // 4. Está visible
      
      return bg && bg !== 'transparent' && 
             rect.width > 20 && rect.width < 150 &&
             rect.height > 20 && rect.height < 150 &&
             text.length > 0 && text.length < 6 &&
             rect.top > 0;
    });
    
    if (allBoxes.length === 0) return [];
    
    // Ordenar por posición vertical (top)
    allBoxes.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    // Las cajitas de arriba están en las primeras posiciones
    // Tomar solo las que están en la misma fila (mismo Y aproximado)
    const firstTop = allBoxes[0].getBoundingClientRect().top;
    const topBoxes = allBoxes.filter(box => {
      const top = box.getBoundingClientRect().top;
      return Math.abs(top - firstTop) < 60; // Tolerancia 60px
    });
    
    console.log(`📦 Encontradas ${topBoxes.length} cajitas superiores`);
    return topBoxes;
  }
  
  // ============================================
  // MAPEO INICIAL A DAYU
  // ============================================
  
  function aplicarDayu() {
    console.log('🎨 === APLICAR DAYU ===');
    
    const topBoxes = getTopColorBoxes();
    if (topBoxes.length === 0) {
      alert('❌ No se encontraron cajitas de color.\n\nGenera la imagen primero con el botón "Process image"');
      return;
    }
    
    // Extraer colores originales
    const palette = [];
    topBoxes.forEach((box, idx) => {
      const rgb = parseColorFromElement(box);
      if (rgb) {
        palette.push({
          idx: idx,
          rgb: rgb,
          hex: rgbToHex(rgb),
          box: box,
          originalText: box.textContent.trim()
        });
      }
    });
    
    console.log(`📊 Paleta: ${palette.length} colores`);
    
    if (!window.DAYU_PALETTE) {
      alert('❌ DAYU_PALETTE no cargada');
      return;
    }
    
    // Mapear cada color al DAYU más cercano
    const dayuColors = window.DAYU_PALETTE;
    const distances = [];
    
    palette.forEach(item => {
      dayuColors.forEach((dayu, dayuIdx) => {
        distances.push({
          clusterIdx: item.idx,
          dayuIdx: dayuIdx,
          distance: colorDistance(item.rgb, dayu.rgb)
        });
      });
    });
    
    distances.sort((a, b) => a.distance - b.distance);
    
    // Asignación 1:1 sin repetir
    const usedClusters = new Set();
    const usedDayu = new Set();
    clusterMapping.clear();
    boxToCluster.clear();
    
    for (const d of distances) {
      if (usedClusters.has(d.clusterIdx) || usedDayu.has(d.dayuIdx)) continue;
      
      usedClusters.add(d.clusterIdx);
      usedDayu.add(d.dayuIdx);
      
      const dayu = dayuColors[d.dayuIdx];
      const item = palette[d.clusterIdx];
      
      clusterMapping.set(d.clusterIdx, {
        code: dayu.code,
        hex: dayu.hex,
        rgb: dayu.rgb,
        originalRgb: item.rgb,
        originalHex: item.hex
      });
      
      boxToCluster.set(item.box, d.clusterIdx);
      
      // Actualizar cajita
      item.box.dataset.clusterIdx = d.clusterIdx;
      item.box.dataset.originalColor = item.hex;
      item.box.dataset.originalText = item.originalText;
      item.box.style.backgroundColor = dayu.hex;
      item.box.textContent = dayu.code;
      
      console.log(`📦 ${d.clusterIdx}: ${item.originalText} → ${dayu.code}`);
      
      if (clusterMapping.size === palette.length) break;
    }
    
    // Actualizar SVG
    actualizarSVGCompleto();
    
    // Hacer cajitas editables
    hacerCajitasEditables(topBoxes);
    
    console.log('✅ DAYU aplicado');
    alert(`✅ ¡Listo!\n\n${clusterMapping.size} colores mapeados a DAYU\n\n💡 Ahora puedes:\n• Hacer clic en cualquier cajita de arriba\n• Escribir un código DAYU (ej: 43, WG3, BG5)\n• Presionar Enter\n• El color y el SVG se actualizarán automáticamente`);
  }
  
  // ============================================
  // ACTUALIZAR SVG COMPLETO
  // ============================================
  
  function actualizarSVGCompleto() {
    const svg = document.querySelector('svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return;
    }
    
    // Crear mapa de color original → cluster
    const colorMap = new Map();
    clusterMapping.forEach((dayuData, clusterIdx) => {
      colorMap.set(dayuData.originalHex.toLowerCase(), clusterIdx);
    });
    
    let updated = 0;
    const texts = svg.querySelectorAll('text');
    
    texts.forEach(textEl => {
      // Buscar la faceta (shape) asociada
      const parent = textEl.parentElement;
      if (!parent) return;
      
      const shape = parent.querySelector('path, polygon, rect, circle');
      if (!shape) return;
      
      const fill = shape.getAttribute('fill') || shape.style.fill;
      if (!fill) return;
      
      // Normalizar color
      let fillHex = fill.toLowerCase().replace('#', '');
      if (fillHex.length === 3) {
        fillHex = fillHex.split('').map(c => c + c).join('');
      }
      
      const fullFillHex = '#' + fillHex;
      const clusterIdx = colorMap.get(fullFillHex);
      
      if (clusterIdx !== undefined && clusterMapping.has(clusterIdx)) {
        const dayuData = clusterMapping.get(clusterIdx);
        
        // Guardar datos originales
        if (!textEl.dataset.originalText) {
          textEl.dataset.originalText = textEl.textContent;
        }
        if (!shape.dataset.originalFill) {
          shape.dataset.originalFill = fill;
        }
        
        // Actualizar
        textEl.textContent = dayuData.code;
        textEl.dataset.clusterIdx = clusterIdx;
        shape.setAttribute('fill', dayuData.hex);
        shape.style.fill = dayuData.hex;
        
        updated++;
      }
    });
    
    console.log(`✅ SVG: ${updated} facetas actualizadas`);
  }
  
  // ============================================
  // HACER CAJITAS EDITABLES
  // ============================================
  
  function hacerCajitasEditables(boxes) {
    boxes.forEach(box => {
      // Remover listeners anteriores clonando
      const newBox = box.cloneNode(true);
      box.parentNode.replaceChild(newBox, box);
      
      // Solo si tiene cluster asignado
      if (!newBox.dataset.clusterIdx) return;
      
      // Estilo
      newBox.style.cursor = 'pointer';
      newBox.style.transition = 'all 0.2s ease';
      newBox.title = '🖱️ Clic para cambiar código DAYU\n\nEjemplos: 43, 64, WG3, BG5';
      
      // Hover
      newBox.addEventListener('mouseenter', () => {
        newBox.style.transform = 'scale(1.2)';
        newBox.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
        newBox.style.zIndex = '9999';
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
        
        // Crear input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentCode;
        input.placeholder = 'ej: 43';
        input.style.cssText = `
          width: 100%;
          height: 100%;
          border: 4px solid #FF5722;
          text-align: center;
          font-size: ${window.getComputedStyle(this).fontSize};
          font-weight: bold;
          box-sizing: border-box;
          background: white;
          color: black;
          outline: none;
        `;
        
        this.textContent = '';
        this.appendChild(input);
        input.focus();
        input.select();
        
        const aplicarCambio = () => {
          const nuevoCodigoInput = input.value.trim();
          
          if (!nuevoCodigoInput) {
            this.textContent = currentCode;
            return;
          }
          
          // Buscar en DAYU_PALETTE
          const nuevoDayu = getDayuColor(nuevoCodigoInput);
          
          if (nuevoDayu) {
            // Actualizar mapping
            const oldData = clusterMapping.get(clusterIdx);
            clusterMapping.set(clusterIdx, {
              code: nuevoDayu.code,
              hex: nuevoDayu.hex,
              rgb: nuevoDayu.rgb,
              originalRgb: oldData.originalRgb,
              originalHex: oldData.originalHex
            });
            
            // Actualizar cajita
            this.textContent = nuevoDayu.code;
            this.style.backgroundColor = nuevoDayu.hex;
            
            // Actualizar SVG
            actualizarSVGPorCluster(clusterIdx, nuevoDayu);
            
            // Animación de confirmación
            this.style.animation = 'none';
            setTimeout(() => {
              this.style.animation = 'dayu-bounce 0.5s';
            }, 10);
            
            console.log(`✏️ Editado: Cluster ${clusterIdx} → ${nuevoDayu.code} (${nuevoDayu.hex})`);
            
          } else {
            // Código no encontrado
            alert(`❌ Código "${nuevoCodigoInput}" no encontrado en paleta DAYU\n\n✅ Códigos válidos:\n\nNúmeros: 1-167 (ej: 42, 43, 64, 67)\nCódigos grises: WG1-WG9, BG1-BG9, CG1-CG9, GG1-GG9\n\nIntenta de nuevo`);
            this.textContent = currentCode;
          }
        };
        
        input.addEventListener('blur', aplicarCambio);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            aplicarCambio();
          } else if (e.key === 'Escape') {
            this.textContent = currentCode;
          }
        });
      });
    });
    
    console.log(`✏️ ${boxes.length} cajitas editables`);
  }
  
  // ============================================
  // ACTUALIZAR SVG PARA UN CLUSTER ESPECÍFICO
  // ============================================
  
  function actualizarSVGPorCluster(clusterIdx, nuevoDayu) {
    const svg = document.querySelector('svg');
    if (!svg) return;
    
    const texts = svg.querySelectorAll(`text[data-cluster-idx="${clusterIdx}"]`);
    
    texts.forEach(textEl => {
      textEl.textContent = nuevoDayu.code;
      
      const parent = textEl.parentElement;
      if (parent) {
        const shape = parent.querySelector('path, polygon, rect, circle');
        if (shape) {
          shape.setAttribute('fill', nuevoDayu.hex);
          shape.style.fill = nuevoDayu.hex;
        }
      }
    });
    
    console.log(`🔄 SVG actualizado: cluster ${clusterIdx} → ${nuevoDayu.code}`);
  }
  
  // ============================================
  // RESET
  // ============================================
  
  function resetear() {
    console.log('🔄 Reset...');
    
    const boxes = document.querySelectorAll('div[data-original-color]');
    boxes.forEach(box => {
      box.style.backgroundColor = box.dataset.originalColor;
      box.textContent = box.dataset.originalText;
      box.style.cursor = 'default';
      box.style.transform = '';
      box.style.boxShadow = '';
      box.title = '';
    });
    
    const svg = document.querySelector('svg');
    if (svg) {
      svg.querySelectorAll('text[data-original-text]').forEach(t => {
        t.textContent = t.dataset.originalText;
      });
      svg.querySelectorAll('[data-original-fill]').forEach(s => {
        s.setAttribute('fill', s.dataset.originalFill);
      });
    }
    
    clusterMapping.clear();
    boxToCluster.clear();
    console.log('✅ Reset');
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
      console.log('✅ APLICAR conectado');
    }
    
    if (resetBtn) {
      const newBtn = resetBtn.cloneNode(true);
      resetBtn.parentNode.replaceChild(newBtn, resetBtn);
      newBtn.addEventListener('click', resetear);
      console.log('✅ RESET conectado');
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
    
    console.log(`✅ DAYU: ${window.DAYU_PALETTE.length} colores disponibles`);
    
    // Conectar botones
    setTimeout(conectarBotones, 1000);
    
    const observer = new MutationObserver(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('APLICAR') && !b.onclick);
      if (btn) conectarBotones();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // CSS animations
    if (!document.getElementById('dayu-anim')) {
      const style = document.createElement('style');
      style.id = 'dayu-anim';
      style.textContent = `
        @keyframes dayu-bounce {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(1.1); }
          75% { transform: scale(1.25); }
        }
      `;
      document.head.appendChild(style);
    }
    
    console.log('✅ DAYU System v3 listo');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  window.DAYU_SYSTEM = { aplicar: aplicarDayu, reset: resetear };
  
})();
