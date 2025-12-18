/* dayu_complete_system.js
 * Sistema completo para mapear paint-by-number a paleta DAYU
 * 
 * FUNCIONALIDADES:
 * 1. Genera imagen normal con k-means
 * 2. Botón "Mapear a DAYU" → busca colores más cercanos
 * 3. Muestra códigos DAYU en SVG (en lugar de 0,1,2...)
 * 4. Paleta editable con dropdowns
 * 5. Actualización automática del SVG al cambiar colores
 * 
 * REQUISITOS: dayu_palette.js debe estar cargado primero
 */

(function() {
  "use strict";

  // ============================================
  // CONFIGURACIÓN Y UTILIDADES
  // ============================================
  
  const CONFIG = {
    buttonId: 'btnMapToDayu',
    buttonText: 'Mapear a DAYU',
    paletteId: 'palette',
    svgContainerId: 'svgContainer'
  };

  const $ = (id) => document.getElementById(id);

  // Distancia euclidiana al cuadrado entre dos colores RGB
  function colorDistance(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return dr * dr + dg * dg + db * db;
  }

  // Convierte hex a RGB
  function hexToRgb(hex) {
    const h = hex.replace('#', '').trim();
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  // Convierte RGB a hex
  function rgbToHex(rgb) {
    return '#' + rgb.map(v => {
      const hex = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  // ============================================
  // EXTRACCIÓN DE PALETA ACTUAL
  // ============================================
  
  function extractCurrentPalette() {
    const paletteEl = $(CONFIG.paletteId);
    if (!paletteEl) return null;

    const palette = new Map(); // idx -> {rgb, hex}
    
    // Buscar todos los elementos que contienen "RGB: r,g,b"
    const rgbTexts = Array.from(paletteEl.querySelectorAll('*'))
      .map(el => el.textContent)
      .filter(text => /RGB:\s*\d+\s*,\s*\d+\s*,\s*\d+/i.test(text));

    rgbTexts.forEach((text, idx) => {
      const match = text.match(/RGB:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) {
        const rgb = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        palette.set(idx, {
          rgb: rgb,
          hex: rgbToHex(rgb)
        });
      }
    });

    return palette;
  }

  // ============================================
  // MAPEO A PALETA DAYU (1:1 sin repetir)
  // ============================================
  
  function mapToDayuPalette(currentPalette) {
    if (!window.DAYU_PALETTE || !Array.isArray(window.DAYU_PALETTE)) {
      console.error('DAYU_PALETTE no está cargada');
      return null;
    }

    const dayuColors = window.DAYU_PALETTE;
    const indices = Array.from(currentPalette.keys());
    
    // Crear matriz de distancias (idx, dayuIdx, distance)
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
    const mapping = new Map(); // idx -> dayuColor

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
        rgb: dayuColor.rgb
      });

      if (mapping.size === indices.length) break;
    }

    return mapping;
  }

  // ============================================
  // ACTUALIZACIÓN DEL SVG
  // ============================================
  
  function updateSVG(mapping) {
    const svgContainer = $(CONFIG.svgContainerId);
    if (!svgContainer) return false;

    const svg = svgContainer.querySelector('svg');
    if (!svg) return false;

    let updated = false;

    // Actualizar todos los <text> elements
    const textElements = svg.querySelectorAll('text');
    textElements.forEach(textEl => {
      const currentText = textEl.textContent.trim();
      
      // Si es un número (índice de cluster original)
      if (/^\d+$/.test(currentText)) {
        const idx = parseInt(currentText);
        const dayuColor = mapping.get(idx);
        
        if (dayuColor) {
          // Cambiar el texto al código DAYU
          textEl.textContent = dayuColor.code;
          
          // Buscar y actualizar el color de la faceta
          const facet = findFacetForText(textEl);
          if (facet) {
            setFacetColor(facet, dayuColor.hex);
          }
          
          updated = true;
        }
      }
    });

    return updated;
  }

  // Encuentra la forma (path, polygon, rect) asociada a un texto
  function findFacetForText(textEl) {
    const parent = textEl.parentElement;
    if (!parent) return null;

    // Buscar hermanos con fill
    const siblings = Array.from(parent.children);
    for (const el of siblings) {
      if (el === textEl) continue;
      if (['path', 'polygon', 'rect', 'circle', 'ellipse'].includes(el.tagName.toLowerCase())) {
        const fill = el.getAttribute('fill');
        if (fill && fill !== 'none') {
          return el;
        }
      }
    }

    return null;
  }

  // Establece el color de una faceta
  function setFacetColor(facetEl, hexColor) {
    facetEl.setAttribute('fill', hexColor);
    
    // También actualizar el style si existe
    const style = facetEl.getAttribute('style') || '';
    if (/fill\s*:/i.test(style)) {
      facetEl.setAttribute('style', style.replace(/fill\s*:\s*[^;]+/i, `fill:${hexColor}`));
    }
  }

  // ============================================
  // PALETA EDITABLE
  // ============================================
  
  function createEditablePalette(mapping) {
    const paletteEl = $(CONFIG.paletteId);
    if (!paletteEl) return;

    // Crear contenedor para la paleta editable
    let editableContainer = document.getElementById('dayuEditablePalette');
    if (!editableContainer) {
      editableContainer = document.createElement('div');
      editableContainer.id = 'dayuEditablePalette';
      editableContainer.style.cssText = `
        margin-top: 20px;
        padding: 15px;
        border: 2px solid #333;
        border-radius: 8px;
        background: #f9f9f9;
      `;
      paletteEl.appendChild(editableContainer);
    }

    editableContainer.innerHTML = '<h3 style="margin-top:0;">Paleta DAYU (Editable)</h3>';

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    `;

    const sortedIndices = Array.from(mapping.keys()).sort((a, b) => a - b);

    sortedIndices.forEach(idx => {
      const dayuColor = mapping.get(idx);
      const item = createPaletteItem(idx, dayuColor, mapping);
      grid.appendChild(item);
    });

    editableContainer.appendChild(grid);
  }

  function createPaletteItem(idx, dayuColor, mapping) {
    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px;
      background: white;
      border-radius: 4px;
      border: 1px solid #ddd;
    `;

    // Swatch de color
    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 4px;
      border: 1px solid #333;
      background: ${dayuColor.hex};
      margin-right: 10px;
      flex-shrink: 0;
    `;

    // Dropdown para seleccionar código DAYU
    const select = document.createElement('select');
    select.style.cssText = `
      flex: 1;
      padding: 5px;
      font-size: 14px;
      border: 1px solid #ccc;
      border-radius: 4px;
    `;

    // Agregar todas las opciones DAYU
    window.DAYU_PALETTE.forEach(color => {
      const option = document.createElement('option');
      option.value = color.code;
      option.textContent = `${color.code} - ${color.hex}`;
      if (color.code === dayuColor.code) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // Event listener para cambio de color
    select.addEventListener('change', (e) => {
      const newCode = e.target.value;
      const newDayuColor = window.DAYU_PALETTE.find(c => c.code === newCode);
      
      if (newDayuColor) {
        // Actualizar el mapping
        mapping.set(idx, {
          code: newDayuColor.code,
          hex: newDayuColor.hex,
          rgb: newDayuColor.rgb
        });

        // Actualizar swatch
        swatch.style.background = newDayuColor.hex;

        // Actualizar SVG
        updateSVGWithNewMapping(idx, newDayuColor);
      }
    });

    item.appendChild(swatch);
    item.appendChild(select);

    return item;
  }

  // Actualiza solo las facetas de un índice específico
  function updateSVGWithNewMapping(idx, newDayuColor) {
    const svgContainer = $(CONFIG.svgContainerId);
    if (!svgContainer) return;

    const svg = svgContainer.querySelector('svg');
    if (!svg) return;

    const textElements = svg.querySelectorAll('text');
    textElements.forEach(textEl => {
      const currentText = textEl.textContent.trim();
      
      // Si el texto es el código DAYU que estamos buscando (o el índice original)
      if (currentText === String(idx) || 
          window.DAYU_PALETTE.some(c => c.code === currentText && 
            textEl.dataset.originalIdx === String(idx))) {
        
        // Actualizar texto
        textEl.textContent = newDayuColor.code;
        textEl.dataset.originalIdx = String(idx);
        
        // Actualizar color de faceta
        const facet = findFacetForText(textEl);
        if (facet) {
          setFacetColor(facet, newDayuColor.hex);
        }
      }
    });
  }

  // ============================================
  // BOTÓN DE MAPEO
  // ============================================
  
  function createMapButton() {
    // Buscar un lugar apropiado para el botón
    const processBtn = $('btnProcess');
    if (!processBtn) return;

    let mapBtn = $(CONFIG.buttonId);
    if (mapBtn) return; // Ya existe

    mapBtn = document.createElement('button');
    mapBtn.id = CONFIG.buttonId;
    mapBtn.textContent = CONFIG.buttonText;
    mapBtn.style.cssText = `
      margin-left: 10px;
      padding: 10px 20px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      font-weight: bold;
    `;

    mapBtn.addEventListener('mouseover', () => {
      mapBtn.style.background = '#45a049';
    });

    mapBtn.addEventListener('mouseout', () => {
      mapBtn.style.background = '#4CAF50';
    });

    mapBtn.addEventListener('click', performMapping);

    processBtn.parentNode.insertBefore(mapBtn, processBtn.nextSibling);
  }

  // ============================================
  // PROCESO DE MAPEO PRINCIPAL
  // ============================================
  
  let currentMapping = null;

  function performMapping() {
    console.log('Iniciando mapeo a DAYU...');

    // 1. Extraer paleta actual
    const currentPalette = extractCurrentPalette();
    if (!currentPalette || currentPalette.size === 0) {
      alert('No se pudo extraer la paleta actual. Asegúrate de haber generado primero la imagen.');
      return;
    }

    console.log(`Paleta extraída: ${currentPalette.size} colores`);

    // 2. Mapear a DAYU
    const mapping = mapToDayuPalette(currentPalette);
    if (!mapping || mapping.size === 0) {
      alert('Error al mapear a paleta DAYU');
      return;
    }

    console.log(`Mapeo completado: ${mapping.size} colores mapeados`);
    currentMapping = mapping;

    // 3. Actualizar SVG
    const updated = updateSVG(mapping);
    if (updated) {
      console.log('SVG actualizado con códigos DAYU');
    }

    // 4. Crear paleta editable
    createEditablePalette(mapping);

    alert(`¡Mapeo completado! ${mapping.size} colores mapeados a DAYU`);
  }

  // ============================================
  // INICIALIZACIÓN
  // ============================================
  
  function init() {
    console.log('Inicializando sistema DAYU...');

    if (!window.DAYU_PALETTE) {
      console.error('DAYU_PALETTE no está cargada. Asegúrate de cargar dayu_palette.js primero.');
      return;
    }

    console.log(`DAYU_PALETTE cargada: ${window.DAYU_PALETTE.length} colores`);

    // Crear botón de mapeo
    createMapButton();

    console.log('Sistema DAYU inicializado correctamente');
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exportar funciones públicas
  window.DAYU_SYSTEM = {
    performMapping,
    getCurrentMapping: () => currentMapping,
    updateColor: (idx, newCode) => {
      if (!currentMapping) return false;
      const newDayuColor = window.DAYU_PALETTE.find(c => c.code === newCode);
      if (!newDayuColor) return false;
      
      currentMapping.set(idx, {
        code: newDayuColor.code,
        hex: newDayuColor.hex,
        rgb: newDayuColor.rgb
      });
      
      updateSVGWithNewMapping(idx, newDayuColor);
      return true;
    }
  };

})();
