/* dayu_system_drake7707.js
 * Sistema DAYU adaptado para paintbynumbersgenerator de drake7707
 * 
 * FUNCIONALIDADES:
 * 1. Detecta cuando se genera el SVG final
 * 2. Botón "Mapear a DAYU" para convertir colores
 * 3. Extrae paleta del output tab
 * 4. Actualiza SVG con códigos DAYU
 * 5. Paleta editable con dropdowns
 * 
 * REQUISITOS: dayu_palette.js debe estar cargado primero
 */

(function() {
  "use strict";

  // ============================================
  // CONFIGURACIÓN
  // ============================================
  
  const CONFIG = {
    selectors: {
      // Output tab donde está el SVG final
      outputPane: '#output-pane',
      svgRenderDiv: 'div[style*="border"]', // El div que contiene el SVG
      // Tabs
      tabs: '.nav-tabs a',
      // Palette data (descargable)
      downloadPalette: 'a[download*="palette"]'
    },
    buttonId: 'btnMapToDayu',
    buttonText: '🎨 Mapear a DAYU',
    editorId: 'dayuPaletteEditor'
  };

  // ============================================
  // UTILIDADES
  // ============================================
  
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function colorDistance(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return dr * dr + dg * dg + db * db;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '').trim();
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

  // ============================================
  // EXTRACCIÓN DE PALETA
  // ============================================
  
  function extractPaletteFromSVG() {
    const svg = getSVGElement();
    if (!svg) return null;

    const palette = new Map(); // idx -> {rgb, hex, count}
    const textElements = svg.querySelectorAll('text');
    
    textElements.forEach(textEl => {
      const labelText = textEl.textContent.trim();
      
      // Si es un número (índice del cluster)
      if (/^\d+$/.test(labelText)) {
        const idx = parseInt(labelText);
        
        // Buscar el color de la faceta asociada
        const facet = findFacetForText(textEl);
        if (facet) {
          const fillColor = facet.getAttribute('fill') || facet.style.fill;
          if (fillColor && fillColor !== 'none') {
            const rgb = parseColor(fillColor);
            if (rgb) {
              if (!palette.has(idx)) {
                palette.set(idx, {
                  rgb: rgb,
                  hex: rgbToHex(rgb),
                  count: 0
                });
              }
              palette.get(idx).count++;
            }
          }
        }
      }
    });

    return palette;
  }

  function parseColor(colorStr) {
    // Soporta rgb(r,g,b) y #hex
    if (colorStr.startsWith('rgb')) {
      const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }
    } else if (colorStr.startsWith('#')) {
      return hexToRgb(colorStr);
    }
    return null;
  }

  function getSVGElement() {
    // Buscar en el output pane
    const outputPane = $(CONFIG.selectors.outputPane);
    if (!outputPane) return null;

    return outputPane.querySelector('svg');
  }

  function findFacetForText(textEl) {
    // El SVG de drake7707 agrupa text + path en <g>
    const parent = textEl.parentElement;
    if (!parent) return null;

    // Buscar path en el mismo grupo
    const path = parent.querySelector('path, polygon');
    if (path) return path;

    // Buscar hermanos
    const siblings = Array.from(parent.parentElement?.children || []);
    for (const sibling of siblings) {
      if (sibling === parent) continue;
      const shape = sibling.querySelector('path, polygon');
      if (shape) {
        // Verificar si están cerca (mismo grupo lógico)
        const textBox = textEl.getBBox ? textEl.getBBox() : textEl.getBoundingClientRect();
        const shapeBox = shape.getBBox ? shape.getBBox() : shape.getBoundingClientRect();
        
        // Si el texto está dentro o cerca del shape
        if (textBox && shapeBox &&
            textBox.x >= shapeBox.x - 50 &&
            textBox.x <= shapeBox.x + shapeBox.width + 50 &&
            textBox.y >= shapeBox.y - 50 &&
            textBox.y <= shapeBox.y + shapeBox.height + 50) {
          return shape;
        }
      }
    }

    return null;
  }

  // ============================================
  // MAPEO A DAYU (1:1 sin repetir)
  // ============================================
  
  function mapToDayuPalette(currentPalette) {
    if (!window.DAYU_PALETTE || !Array.isArray(window.DAYU_PALETTE)) {
      console.error('DAYU_PALETTE no está cargada');
      return null;
    }

    const dayuColors = window.DAYU_PALETTE;
    const indices = Array.from(currentPalette.keys()).sort((a, b) => a - b);
    
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
        originalRgb: currentPalette.get(item.clusterIdx).rgb
      });

      if (mapping.size === indices.length) break;
    }

    return mapping;
  }

  // ============================================
  // ACTUALIZACIÓN DEL SVG
  // ============================================
  
  function updateSVG(mapping) {
    const svg = getSVGElement();
    if (!svg) return false;

    let updated = false;
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
          
          updated = true;
        }
      }
    });

    return updated;
  }

  // ============================================
  // PALETA EDITABLE
  // ============================================
  
  function createEditablePalette(mapping, currentPalette) {
    const outputPane = $(CONFIG.selectors.outputPane);
    if (!outputPane) return;

    // Remover editor anterior si existe
    let editor = document.getElementById(CONFIG.editorId);
    if (editor) {
      editor.remove();
    }

    // Crear nuevo editor
    editor = document.createElement('div');
    editor.id = CONFIG.editorId;
    editor.style.cssText = `
      margin: 20px 0;
      padding: 20px;
      background: #f5f5f5;
      border: 2px solid #333;
      border-radius: 8px;
    `;

    const title = document.createElement('h3');
    title.textContent = '🎨 Paleta DAYU (Editable)';
    title.style.cssText = 'margin: 0 0 15px 0; color: #333;';
    editor.appendChild(title);

    const info = document.createElement('p');
    info.textContent = 'Cambia cualquier color usando los dropdowns. El SVG se actualizará automáticamente.';
    info.style.cssText = 'margin: 0 0 15px 0; color: #666; font-size: 14px;';
    editor.appendChild(info);

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 12px;
    `;

    const sortedIndices = Array.from(mapping.keys()).sort((a, b) => a - b);

    sortedIndices.forEach(idx => {
      const dayuColor = mapping.get(idx);
      const originalData = currentPalette.get(idx);
      const item = createPaletteItem(idx, dayuColor, originalData, mapping);
      grid.appendChild(item);
    });

    editor.appendChild(grid);
    
    // Insertar antes del SVG
    const svgContainer = outputPane.querySelector('div[style*="border"]');
    if (svgContainer) {
      outputPane.insertBefore(editor, svgContainer);
    } else {
      outputPane.insertBefore(editor, outputPane.firstChild);
    }
  }

  function createPaletteItem(idx, dayuColor, originalData, mapping) {
    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: center;
      padding: 10px;
      background: white;
      border-radius: 6px;
      border: 1px solid #ddd;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    // Swatches (original + DAYU)
    const swatchContainer = document.createElement('div');
    swatchContainer.style.cssText = 'display: flex; flex-direction: column; margin-right: 12px;';

    const originalSwatch = document.createElement('div');
    originalSwatch.style.cssText = `
      width: 40px;
      height: 20px;
      border: 1px solid #333;
      background: ${rgbToHex(originalData.rgb)};
      margin-bottom: 2px;
      border-radius: 3px 3px 0 0;
    `;
    originalSwatch.title = 'Color original';

    const dayuSwatch = document.createElement('div');
    dayuSwatch.style.cssText = `
      width: 40px;
      height: 20px;
      border: 1px solid #333;
      background: ${dayuColor.hex};
      border-radius: 0 0 3px 3px;
    `;
    dayuSwatch.title = 'Color DAYU';

    swatchContainer.appendChild(originalSwatch);
    swatchContainer.appendChild(dayuSwatch);

    // Info y dropdown
    const infoContainer = document.createElement('div');
    infoContainer.style.cssText = 'flex: 1;';

    const label = document.createElement('div');
    label.textContent = `Cluster ${idx}`;
    label.style.cssText = 'font-weight: bold; margin-bottom: 5px; font-size: 13px;';

    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 6px;
      font-size: 13px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: white;
    `;

    // Agregar opciones DAYU
    window.DAYU_PALETTE.forEach(color => {
      const option = document.createElement('option');
      option.value = color.code;
      option.textContent = `${color.code} - ${color.hex}`;
      if (color.code === dayuColor.code) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // Event listener
    select.addEventListener('change', (e) => {
      const newCode = e.target.value;
      const newDayuColor = window.DAYU_PALETTE.find(c => c.code === newCode);
      
      if (newDayuColor) {
        // Actualizar mapping
        mapping.set(idx, {
          code: newDayuColor.code,
          hex: newDayuColor.hex,
          rgb: newDayuColor.rgb,
          originalRgb: dayuColor.originalRgb
        });

        // Actualizar swatch visual
        dayuSwatch.style.background = newDayuColor.hex;

        // Actualizar SVG
        updateSVGForIndex(idx, newDayuColor);
      }
    });

    infoContainer.appendChild(label);
    infoContainer.appendChild(select);

    item.appendChild(swatchContainer);
    item.appendChild(infoContainer);

    return item;
  }

  function updateSVGForIndex(idx, newDayuColor) {
    const svg = getSVGElement();
    if (!svg) return;

    const textElements = svg.querySelectorAll('text');
    textElements.forEach(textEl => {
      // Buscar por dataset o por contenido actual
      if (textEl.dataset.originalIdx === String(idx)) {
        // Actualizar texto
        textEl.textContent = newDayuColor.code;
        
        // Actualizar faceta
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
  // BOTÓN DE MAPEO
  // ============================================
  
  function createMapButton() {
    // Buscar la barra de "SVG Render options"
    const outputPane = $(CONFIG.selectors.outputPane);
    if (!outputPane) return;

    const renderOptionsDiv = outputPane.querySelector('div');
    if (!renderOptionsDiv) return;

    // Verificar si ya existe
    if (document.getElementById(CONFIG.buttonId)) return;

    const mapBtn = document.createElement('button');
    mapBtn.id = CONFIG.buttonId;
    mapBtn.textContent = CONFIG.buttonText;
    mapBtn.style.cssText = `
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      margin: 10px 0;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    mapBtn.addEventListener('mouseover', () => {
      mapBtn.style.transform = 'translateY(-2px)';
      mapBtn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
    });

    mapBtn.addEventListener('mouseout', () => {
      mapBtn.style.transform = 'translateY(0)';
      mapBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    });

    mapBtn.addEventListener('click', performMapping);

    // Insertar al inicio del output pane
    outputPane.insertBefore(mapBtn, renderOptionsDiv);
  }

  // ============================================
  // PROCESO PRINCIPAL
  // ============================================
  
  let currentMapping = null;
  let currentPalette = null;

  function performMapping() {
    console.log('🎨 Iniciando mapeo a DAYU...');

    // 1. Extraer paleta del SVG
    const palette = extractPaletteFromSVG();
    if (!palette || palette.size === 0) {
      alert('❌ No se pudo extraer la paleta. Asegúrate de que el SVG esté generado en la pestaña "Output".');
      return;
    }

    console.log(`✅ Paleta extraída: ${palette.size} colores`);
    currentPalette = palette;

    // 2. Mapear a DAYU
    const mapping = mapToDayuPalette(palette);
    if (!mapping || mapping.size === 0) {
      alert('❌ Error al mapear a paleta DAYU');
      return;
    }

    console.log(`✅ Mapeo completado: ${mapping.size} colores mapeados`);
    currentMapping = mapping;

    // 3. Actualizar SVG
    const updated = updateSVG(mapping);
    if (updated) {
      console.log('✅ SVG actualizado con códigos DAYU');
    }

    // 4. Crear paleta editable
    createEditablePalette(mapping, palette);

    alert(`✅ ¡Mapeo completado!\n${mapping.size} colores mapeados a DAYU\n\nAhora puedes editar los colores manualmente usando los dropdowns.`);
  }

  // ============================================
  // INICIALIZACIÓN
  // ============================================
  
  function waitForSVG(callback, maxAttempts = 50) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const svg = getSVGElement();
      
      if (svg && svg.querySelectorAll('text').length > 0) {
        clearInterval(interval);
        callback();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log('⏰ Timeout esperando SVG. Botón creado de todas formas.');
        callback();
      }
    }, 500);
  }

  function init() {
    console.log('🎨 Inicializando sistema DAYU para drake7707 paintbynumbersgenerator...');

    if (!window.DAYU_PALETTE) {
      console.error('❌ DAYU_PALETTE no está cargada. Asegúrate de cargar dayu_palette.js primero.');
      return;
    }

    console.log(`✅ DAYU_PALETTE cargada: ${window.DAYU_PALETTE.length} colores`);

    // Esperar a que el DOM esté listo y crear el botón
    waitForSVG(() => {
      createMapButton();
      console.log('✅ Sistema DAYU inicializado. Botón disponible en la pestaña "Output"');
    });

    // Observer para recrear el botón si cambia el output
    const outputPane = $(CONFIG.selectors.outputPane);
    if (outputPane) {
      const observer = new MutationObserver(() => {
        if (!document.getElementById(CONFIG.buttonId)) {
          setTimeout(createMapButton, 100);
        }
      });
      observer.observe(outputPane, { childList: true, subtree: true });
    }
  }

  // Esperar DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API pública
  window.DAYU_SYSTEM = {
    performMapping,
    getCurrentMapping: () => currentMapping,
    getCurrentPalette: () => currentPalette,
    updateColor: (idx, newCode) => {
      if (!currentMapping) return false;
      const newDayuColor = window.DAYU_PALETTE.find(c => c.code === newCode);
      if (!newDayuColor) return false;
      
      currentMapping.set(idx, {
        code: newDayuColor.code,
        hex: newDayuColor.hex,
        rgb: newDayuColor.rgb,
        originalRgb: currentMapping.get(idx).originalRgb
      });
      
      updateSVGForIndex(idx, newDayuColor);
      return true;
    }
  };

})();
