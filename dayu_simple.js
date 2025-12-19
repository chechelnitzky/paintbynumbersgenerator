/* dayu_enhanced.js - v22: UX/UI Mejorado + Color Picker Visual */

(function() {
  'use strict';
  
  const VERSION = 'v22';
  console.log(`🎨 DAYU ${VERSION} - Enhanced UX/UI con Color Picker Visual`);
  
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  window.dayuMapping = window.dayuMapping || {};
  
  let svgObserver = null;
  let paletaObserver = null;
  let isUpdating = false;
  let colorPickerInstance = null;
  
  // ======================
  // ESTILOS CSS INYECTADOS
  // ======================
  
  function inyectarEstilos() {
    if (document.getElementById('dayuStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'dayuStyles';
    style.textContent = `
      /* Layout principal responsive */
      .dayu-main-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        padding: 20px;
        max-width: 100vw;
        box-sizing: border-box;
      }
      
      @media (max-width: 1200px) {
        .dayu-main-container {
          grid-template-columns: 1fr;
        }
      }
      
      /* Contenedor de imágenes */
      .dayu-image-container {
        background: #f8f9fa;
        border-radius: 12px;
        padding: 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .dayu-image-container h3 {
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .dayu-image-wrapper {
        position: relative;
        width: 100%;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        max-height: 70vh;
      }
      
      .dayu-image-wrapper img,
      .dayu-image-wrapper svg {
        max-width: 100%;
        max-height: 70vh;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
      }
      
      /* Controles superiores */
      .dayu-controls {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        margin-bottom: 20px;
      }
      
      .dayu-controls-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      
      .dayu-version-badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 14px;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.5px;
        backdrop-filter: blur(10px);
      }
      
      /* Botones mejorados */
      .dayu-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.3s ease;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      
      .dayu-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      }
      
      .dayu-btn:active {
        transform: translateY(0);
      }
      
      .dayu-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .dayu-btn-secondary {
        background: linear-gradient(135deg, #00BCD4 0%, #0097A7 100%);
        color: white;
      }
      
      .dayu-btn-danger {
        background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
        color: white;
      }
      
      /* Status mejorado */
      .dayu-status {
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        margin-top: 15px;
        display: none;
        animation: slideDown 0.3s ease;
      }
      
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .dayu-status.info {
        background: #e3f2fd;
        border-left: 4px solid #2196F3;
        color: #1565C0;
      }
      
      .dayu-status.success {
        background: #e8f5e9;
        border-left: 4px solid #4CAF50;
        color: #2E7D32;
      }
      
      .dayu-status.warning {
        background: #fff3e0;
        border-left: 4px solid #FF9800;
        color: #E65100;
      }
      
      .dayu-status.error {
        background: #ffebee;
        border-left: 4px solid #f44336;
        color: #C62828;
      }
      
      /* Paleta de colores mejorada */
      #palette {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 10px;
        padding: 15px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        margin-top: 20px;
      }
      
      #palette > div {
        aspect-ratio: 1;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        position: relative;
      }
      
      #palette > div:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10;
      }
      
      #palette > div[data-editable="true"]::after {
        content: "✏️";
        position: absolute;
        top: 2px;
        right: 2px;
        font-size: 10px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      #palette > div[data-editable="true"]:hover::after {
        opacity: 1;
      }
      
      /* Color Picker Drawer */
      .dayu-color-picker {
        position: fixed;
        top: 0;
        right: -420px;
        width: 400px;
        height: 100vh;
        background: white;
        box-shadow: -4px 0 20px rgba(0,0,0,0.3);
        transition: right 0.3s ease;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .dayu-color-picker.open {
        right: 0;
      }
      
      .dayu-picker-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .dayu-picker-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .dayu-picker-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .dayu-picker-close:hover {
        background: rgba(255,255,255,0.3);
      }
      
      .dayu-picker-search {
        padding: 15px;
        border-bottom: 1px solid #eee;
      }
      
      .dayu-picker-search input {
        width: 100%;
        padding: 10px 15px;
        border: 2px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        transition: border-color 0.2s;
      }
      
      .dayu-picker-search input:focus {
        outline: none;
        border-color: #667eea;
      }
      
      .dayu-picker-info {
        padding: 15px;
        background: #f8f9fa;
        border-bottom: 1px solid #eee;
        font-size: 13px;
        color: #666;
      }
      
      .dayu-picker-grid {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        align-content: start;
      }
      
      .dayu-picker-color {
        aspect-ratio: 1;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        position: relative;
      }
      
      .dayu-picker-color:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10;
      }
      
      .dayu-picker-color.used {
        opacity: 0.4;
        cursor: not-allowed;
      }
      
      .dayu-picker-color.used::after {
        content: "✓";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 24px;
        color: rgba(0,0,0,0.5);
      }
      
      /* Overlay para cerrar el drawer */
      .dayu-picker-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
        display: none;
        animation: fadeIn 0.3s ease;
      }
      
      .dayu-picker-overlay.active {
        display: block;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      /* Scroll personalizado */
      .dayu-picker-grid::-webkit-scrollbar {
        width: 8px;
      }
      
      .dayu-picker-grid::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 4px;
      }
      
      .dayu-picker-grid::-webkit-scrollbar-thumb {
        background: #667eea;
        border-radius: 4px;
      }
      
      .dayu-picker-grid::-webkit-scrollbar-thumb:hover {
        background: #764ba2;
      }
      
      /* Responsivo */
      @media (max-width: 768px) {
        .dayu-color-picker {
          width: 100vw;
          right: -100vw;
        }
        
        .dayu-picker-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    `;
    
    document.head.appendChild(style);
    console.log('✅ Estilos CSS inyectados');
  }
  
  // ======================
  // UTILIDADES RGB/HSL
  // ======================
  
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    return {
      h: h * 360,
      s: s * 100,
      l: l * 100
    };
  }
  
  function clasificarFamilia(hsl) {
    const {h, s, l} = hsl;
    
    if (l > 85 && s < 20) return 'BLANCO';
    if (l < 15) return 'NEGRO';
    if (s < 15) return 'GRIS';
    
    if (h >= 345 || h < 15) return 'ROJO';
    if (h >= 15 && h < 45) return 'NARANJA';
    if (h >= 45 && h < 75) return 'AMARILLO';
    if (h >= 75 && h < 165) return 'VERDE';
    if (h >= 165 && h < 255) return 'AZUL';
    if (h >= 255 && h < 345) return 'MORADO';
    
    return 'GRIS';
  }
  
  function distanciaHSL(hsl1, hsl2) {
    const dL = Math.abs(hsl1.l - hsl2.l);
    const dS = Math.abs(hsl1.s - hsl2.s);
    const dH = Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h));
    
    return dL * 2 + dS * 1.5 + dH * 0.5;
  }
  
  function distanciaRGB(rgb1, rgb2) {
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
  
  function encontrarDayuPorCodigo(codigo) {
    return window.DAYU_PALETTE.find(d => d.code.toUpperCase() === codigo.toUpperCase());
  }
  
  function getContrastColor(rgb) {
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128 ? '#000000' : '#FFFFFF';
  }
  
  // ======================
  // MATCHING INTELIGENTE
  // ======================
  
  function encontrarMejorMatch(rgbOriginal, dayuDisponibles) {
    const hslOriginal = rgbToHsl(...rgbOriginal);
    const familiaOriginal = clasificarFamilia(hslOriginal);
    
    console.log(`Color original: RGB(${rgbOriginal}) → HSL(${Math.round(hslOriginal.h)},${Math.round(hslOriginal.s)}%,${Math.round(hslOriginal.l)}%) → Familia: ${familiaOriginal}`);
    
    const dayuPorFamilia = {};
    dayuDisponibles.forEach(dayu => {
      const hslDayu = rgbToHsl(...dayu.rgb);
      const familia = clasificarFamilia(hslDayu);
      
      if (!dayuPorFamilia[familia]) {
        dayuPorFamilia[familia] = [];
      }
      
      dayuPorFamilia[familia].push({
        ...dayu,
        hsl: hslDayu,
        familia: familia,
        distHSL: distanciaHSL(hslOriginal, hslDayu),
        distRGB: distanciaRGB(rgbOriginal, dayu.rgb)
      });
    });
    
    if (dayuPorFamilia[familiaOriginal] && dayuPorFamilia[familiaOriginal].length > 0) {
      const matches = dayuPorFamilia[familiaOriginal];
      matches.sort((a, b) => a.distHSL - b.distHSL);
      console.log(`✅ Match en familia ${familiaOriginal}: ${matches[0].code}`);
      return matches[0];
    }
    
    if (dayuPorFamilia['GRIS']) {
      const grisesCercanos = dayuPorFamilia['GRIS']
        .filter(g => g.distRGB < 900)
        .sort((a, b) => a.distRGB - b.distRGB);
      
      if (grisesCercanos.length > 0) {
        console.log(`⚪ Match con gris cercano: ${grisesCercanos[0].code}`);
        return grisesCercanos[0];
      }
    }
    
    const familiasAdyacentes = {
      'ROJO': ['NARANJA', 'MORADO'],
      'NARANJA': ['ROJO', 'AMARILLO'],
      'AMARILLO': ['NARANJA', 'VERDE'],
      'VERDE': ['AMARILLO', 'AZUL'],
      'AZUL': ['VERDE', 'MORADO'],
      'MORADO': ['AZUL', 'ROJO']
    };
    
    if (familiasAdyacentes[familiaOriginal]) {
      for (const familiaAdyacente of familiasAdyacentes[familiaOriginal]) {
        if (dayuPorFamilia[familiaAdyacente] && dayuPorFamilia[familiaAdyacente].length > 0) {
          const matches = dayuPorFamilia[familiaAdyacente];
          matches.sort((a, b) => a.distHSL - b.distHSL);
          console.log(`🔄 Match en familia adyacente ${familiaAdyacente}: ${matches[0].code}`);
          return matches[0];
        }
      }
    }
    
    const todosLosColores = dayuDisponibles.map(dayu => ({
      ...dayu,
      hsl: rgbToHsl(...dayu.rgb),
      distHSL: distanciaHSL(hslOriginal, rgbToHsl(...dayu.rgb))
    }));
    
    todosLosColores.sort((a, b) => a.distHSL - b.distHSL);
    console.log(`⚠️ Match por distancia HSL global: ${todosLosColores[0].code}`);
    return todosLosColores[0];
  }
  
  // ======================
  // REGENERACIÓN SVG DIRECTA
  // ======================
  
  function regenerarSVGDirecto() {
    console.log('🔄 Regenerando SVG directamente...');
    
    // Estrategia 1: Buscar función global de render
    if (window.generateSVG) {
      console.log('✅ Encontrada función generateSVG()');
      window.generateSVG();
      setTimeout(() => actualizarSVG(), 300);
      return true;
    }
    
    if (window.updateSVG) {
      console.log('✅ Encontrada función updateSVG()');
      window.updateSVG();
      setTimeout(() => actualizarSVG(), 300);
      return true;
    }
    
    if (window.renderSVG) {
      console.log('✅ Encontrada función renderSVG()');
      window.renderSVG();
      setTimeout(() => actualizarSVG(), 300);
      return true;
    }
    
    // Estrategia 2: Disparar evento de cambio en elementos de control
    const sliders = document.querySelectorAll('input[type="range"]');
    if (sliders.length > 0) {
      console.log('✅ Disparando evento en slider para forzar re-render');
      const slider = sliders[0];
      const valorOriginal = slider.value;
      slider.value = parseFloat(valorOriginal) + 0.01;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      
      setTimeout(() => {
        slider.value = valorOriginal;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        
        setTimeout(() => {
          const resultado = actualizarSVG();
          mostrarStatus(`✅ SVG regenerado: ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
        }, 300);
      }, 100);
      
      return true;
    }
    
    // Estrategia 3: Fallback al método del checkbox
    console.log('⚠️ No se encontró método directo, usando fallback de checkbox');
    return regenerarSVGConToggle();
  }
  
  function regenerarSVGConToggle() {
    console.log('🔄 Usando método de toggle checkbox...');
    
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    
    let borderCheckbox = checkboxes.find(cb => {
      const label = cb.parentElement?.textContent || '';
      return label.toLowerCase().includes('border');
    });
    
    if (!borderCheckbox) {
      const container = document.querySelector('.row') || document.body;
      const allCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      borderCheckbox = allCheckboxes[allCheckboxes.length - 1];
    }
    
    if (!borderCheckbox) {
      borderCheckbox = checkboxes.find(cb => {
        const rect = cb.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    }
    
    if (borderCheckbox) {
      const estadoOriginal = borderCheckbox.checked;
      
      console.log(`✅ Checkbox encontrado, estado original: ${estadoOriginal}`);
      
      borderCheckbox.checked = !estadoOriginal;
      borderCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      borderCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
      
      setTimeout(() => {
        borderCheckbox.checked = estadoOriginal;
        borderCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        borderCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log('✅ Toggle completado, SVG regenerándose...');
        
        setTimeout(() => {
          const resultado = actualizarSVG();
          mostrarStatus(`✅ SVG regenerado: ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
        }, 300);
      }, 100);
      
      return true;
    } else {
      console.log('❌ No se encontró ningún checkbox');
      mostrarStatus('❌ No se pudo regenerar el SVG automáticamente', 'error');
      return false;
    }
  }
  
  // ======================
  // COLOR PICKER VISUAL
  // ======================
  
  function crearColorPicker() {
    if (document.getElementById('dayuColorPicker')) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'dayu-picker-overlay';
    overlay.id = 'dayuPickerOverlay';
    
    const picker = document.createElement('div');
    picker.className = 'dayu-color-picker';
    picker.id = 'dayuColorPicker';
    
    picker.innerHTML = `
      <div class="dayu-picker-header">
        <h3>🎨 Seleccionar Color DAYU</h3>
        <button class="dayu-picker-close">×</button>
      </div>
      
      <div class="dayu-picker-search">
        <input type="text" placeholder="🔍 Buscar código DAYU..." id="dayuPickerSearch">
      </div>
      
      <div class="dayu-picker-info" id="dayuPickerInfo">
        Selecciona un color para reemplazar
      </div>
      
      <div class="dayu-picker-grid" id="dayuPickerGrid">
        <!-- Se llenará dinámicamente -->
      </div>
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(picker);
    
    // Event listeners
    overlay.addEventListener('click', cerrarColorPicker);
    picker.querySelector('.dayu-picker-close').addEventListener('click', cerrarColorPicker);
    
    const searchInput = document.getElementById('dayuPickerSearch');
    searchInput.addEventListener('input', (e) => filtrarColores(e.target.value));
    
    console.log('✅ Color Picker creado');
  }
  
  function abrirColorPicker(cajaElement, numeroOriginal) {
    crearColorPicker();
    
    const picker = document.getElementById('dayuColorPicker');
    const overlay = document.getElementById('dayuPickerOverlay');
    const info = document.getElementById('dayuPickerInfo');
    const grid = document.getElementById('dayuPickerGrid');
    const search = document.getElementById('dayuPickerSearch');
    
    // Guardar referencia
    colorPickerInstance = {
      cajaElement: cajaElement,
      numeroOriginal: numeroOriginal
    };
    
    // Actualizar info
    info.textContent = `Selecciona un color para reemplazar el número ${numeroOriginal}`;
    
    // Limpiar búsqueda
    search.value = '';
    
    // Obtener colores ya usados
    const coloresUsados = new Set(
      Object.values(window.dayuMapping).map(m => m.code.toUpperCase())
    );
    
    // Renderizar grid
    grid.innerHTML = '';
    window.DAYU_PALETTE.forEach(dayu => {
      const usado = coloresUsados.has(dayu.code.toUpperCase());
      
      const colorDiv = document.createElement('div');
      colorDiv.className = `dayu-picker-color ${usado ? 'used' : ''}`;
      colorDiv.style.backgroundColor = dayu.hex;
      colorDiv.style.color = getContrastColor(dayu.rgb);
      colorDiv.textContent = dayu.code;
      colorDiv.dataset.code = dayu.code;
      colorDiv.dataset.hex = dayu.hex;
      colorDiv.title = usado ? `${dayu.code} (Ya usado)` : dayu.code;
      
      if (!usado) {
        colorDiv.addEventListener('click', () => seleccionarColor(dayu));
      }
      
      grid.appendChild(colorDiv);
    });
    
    // Abrir drawer
    overlay.classList.add('active');
    setTimeout(() => picker.classList.add('open'), 10);
    
    console.log(`🎨 Color Picker abierto para número ${numeroOriginal}`);
  }
  
  function cerrarColorPicker() {
    const picker = document.getElementById('dayuColorPicker');
    const overlay = document.getElementById('dayuPickerOverlay');
    
    if (picker && overlay) {
      picker.classList.remove('open');
      overlay.classList.remove('active');
      colorPickerInstance = null;
      console.log('✅ Color Picker cerrado');
    }
  }
  
  function filtrarColores(busqueda) {
    const grid = document.getElementById('dayuPickerGrid');
    const colores = grid.querySelectorAll('.dayu-picker-color');
    
    const termino = busqueda.toLowerCase().trim();
    
    colores.forEach(color => {
      const codigo = color.dataset.code.toLowerCase();
      if (codigo.includes(termino) || termino === '') {
        color.style.display = 'flex';
      } else {
        color.style.display = 'none';
      }
    });
  }
  
  function seleccionarColor(dayu) {
    if (!colorPickerInstance) return;
    
    const { cajaElement, numeroOriginal } = colorPickerInstance;
    
    console.log(`✅ Color seleccionado: ${dayu.code} para número ${numeroOriginal}`);
    
    // Actualizar mapeo
    window.dayuMapping[numeroOriginal] = {
      code: dayu.code,
      hex: dayu.hex,
      rgb: dayu.rgb,
      rgbOriginal: window.dayuMapping[numeroOriginal].rgbOriginal,
      hexOriginal: window.dayuMapping[numeroOriginal].hexOriginal
    };
    
    // Actualizar cajita
    cajaElement.textContent = dayu.code;
    cajaElement.style.backgroundColor = dayu.hex;
    cajaElement.style.color = getContrastColor(dayu.rgb);
    cajaElement.dataset.dayuCode = dayu.code;
    
    // Cerrar picker
    cerrarColorPicker();
    
    // Mostrar mensaje
    mostrarStatus(`✏️ Color ${numeroOriginal} → ${dayu.code} | Presiona REGENERAR SVG para aplicar`, 'warning');
  }
  
  // ======================
  // UI - BOTONES Y LAYOUT
  // ======================
  
  function crearInterfaz() {
    const p = document.getElementById('palette');
    if (!p) return false;
    
    // Crear contenedor de controles
    if (!document.getElementById('dayuControls')) {
      const controls = document.createElement('div');
      controls.id = 'dayuControls';
      controls.className = 'dayu-controls';
      
      controls.innerHTML = `
        <div class="dayu-controls-row">
          <span class="dayu-version-badge">✨ DAYU ${VERSION}</span>
          
          <button id="btnDayu" class="dayu-btn dayu-btn-primary">
            🎨 MAPEAR A DAYU
          </button>
          
          <button id="btnRegenerar" class="dayu-btn dayu-btn-secondary" style="display:none;">
            🔄 REGENERAR SVG
          </button>
          
          <button id="btnLimpiar" class="dayu-btn dayu-btn-danger" style="display:none;">
            🗑️ LIMPIAR
          </button>
        </div>
      `;
      
      p.parentNode.insertBefore(controls, p);
      
      // Event listeners
      document.getElementById('btnDayu').onclick = iniciarMapeo;
      document.getElementById('btnRegenerar').onclick = () => {
        console.log('🔄 Usuario presionó REGENERAR SVG');
        mostrarStatus('🔄 Regenerando SVG...', 'info');
        regenerarSVGDirecto();
      };
      document.getElementById('btnLimpiar').onclick = () => {
        if (confirm('¿Limpiar el mapeo DAYU?')) {
          window.dayuMapping = {};
          detenerObservers();
          location.reload();
        }
      };
    }
    
    // Crear status
    if (!document.getElementById('dayuStatus')) {
      const status = document.createElement('div');
      status.id = 'dayuStatus';
      status.className = 'dayu-status';
      const controls = document.getElementById('dayuControls');
      controls.parentNode.insertBefore(status, controls.nextSibling);
    }
    
    return true;
  }
  
  function mostrarStatus(mensaje, tipo = 'info') {
    const status = document.getElementById('dayuStatus');
    if (!status) return;
    
    status.className = `dayu-status ${tipo}`;
    status.style.display = 'block';
    status.textContent = mensaje;
    
    // Auto-ocultar después de 5 segundos para mensajes de éxito
    if (tipo === 'success') {
      setTimeout(() => {
        status.style.display = 'none';
      }, 5000);
    }
  }
  
  function mostrarBotonesActivos() {
    const btnRegenerar = document.getElementById('btnRegenerar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    
    if (btnRegenerar) btnRegenerar.style.display = 'inline-flex';
    if (btnLimpiar) btnLimpiar.style.display = 'inline-flex';
  }
  
  function mejorarLayoutResponsive() {
    // Mejorar contenedor de imágenes
    const imgContainer = document.querySelector('img')?.parentElement;
    if (imgContainer && !imgContainer.classList.contains('dayu-image-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'dayu-image-container';
      
      const title = document.createElement('h3');
      title.textContent = '🖼️ Imagen Original';
      
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'dayu-image-wrapper';
      
      imgContainer.parentNode.insertBefore(wrapper, imgContainer);
      wrapper.appendChild(title);
      wrapper.appendChild(imageWrapper);
      imageWrapper.appendChild(imgContainer);
    }
    
    // Mejorar contenedor SVG
    const svgContainer = document.getElementById('svgContainer');
    if (svgContainer && !svgContainer.parentElement.classList.contains('dayu-image-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'dayu-image-container';
      
      const title = document.createElement('h3');
      title.textContent = '🎨 Paint by Numbers';
      
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'dayu-image-wrapper';
      
      svgContainer.parentNode.insertBefore(wrapper, svgContainer);
      wrapper.appendChild(title);
      wrapper.appendChild(imageWrapper);
      imageWrapper.appendChild(svgContainer);
      
      // Eliminar scrollbars
      svgContainer.style.overflow = 'visible';
      svgContainer.style.width = 'auto';
      svgContainer.style.height = 'auto';
    }
    
    console.log('✅ Layout responsive mejorado');
  }
  
  // ======================
  // MAPEO INICIAL CON HSL
  // ======================
  
  function iniciarMapeo() {
    console.log('🎨 Iniciando mapeo inteligente por HSL...');
    mostrarStatus('🎨 Analizando colores y mapeando a DAYU...', 'info');
    
    const cajitas = obtenerCajitas();
    if (!cajitas.length) {
      mostrarStatus('❌ No se encontraron colores en la paleta', 'error');
      return;
    }
    
    const coloresOriginales = cajitas.map((caja, idx) => {
      const rgb = parseRgb(caja);
      const num = caja.textContent.trim();
      
      return {
        numero: num,
        rgb: rgb,
        caja: caja,
        indice: idx
      };
    }).filter(c => c.rgb);
    
    if (!coloresOriginales.length) {
      mostrarStatus('❌ No se pudieron extraer los colores', 'error');
      return;
    }
    
    console.log(`📊 ${coloresOriginales.length} colores originales detectados`);
    
    const dayuConIndices = window.DAYU_PALETTE.map((dayu, idx) => ({
      ...dayu,
      dayuIdx: idx
    }));
    
    const dayuUsados = new Set();
    window.dayuMapping = {};
    
    coloresOriginales.forEach(orig => {
      console.log(`\n🎨 Mapeando color ${orig.numero}...`);
      
      const dayuDisponibles = dayuConIndices.filter(d => !dayuUsados.has(d.dayuIdx));
      
      if (dayuDisponibles.length === 0) {
        console.log(`⚠️ No hay más colores DAYU disponibles`);
        return;
      }
      
      const mejorMatch = encontrarMejorMatch(orig.rgb, dayuDisponibles);
      
      dayuUsados.add(mejorMatch.dayuIdx);
      
      window.dayuMapping[orig.numero] = {
        code: mejorMatch.code,
        hex: mejorMatch.hex,
        rgb: mejorMatch.rgb,
        rgbOriginal: orig.rgb,
        hexOriginal: hex(orig.rgb)
      };
      
      console.log(`✅ ${orig.numero} → ${mejorMatch.code}`);
    });
    
    console.log('\n✅ Mapeo HSL completado:', window.dayuMapping);
    
    actualizarCajitas();
    const resultado = actualizarSVG();
    iniciarObservers();
    mostrarBotonesActivos();
    
    mostrarStatus(`✅ Mapeo completado: ${Object.keys(window.dayuMapping).length} colores | ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
    
    console.log('🎉 Mapeo HSL completado');
  }
  
  // ======================
  // ACTUALIZAR CAJITAS
  // ======================
  
  function obtenerCajitas() {
    const palette = document.getElementById('palette');
    if (!palette) return [];
    
    return Array.from(palette.children).filter(c => {
      const rect = c.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
  }
  
  function actualizarCajitas() {
    if (isUpdating) return;
    isUpdating = true;
    
    const cajitas = obtenerCajitas();
    
    cajitas.forEach(caja => {
      const numActual = caja.textContent.trim();
      
      if (window.dayuMapping[numActual]) {
        const dayu = window.dayuMapping[numActual];
        
        caja.style.backgroundColor = dayu.hex;
        caja.style.color = getContrastColor(dayu.rgb);
        caja.textContent = dayu.code;
        caja.dataset.numOriginal = numActual;
        caja.dataset.dayuCode = dayu.code;
        caja.dataset.editable = 'true';
        
        hacerEditable(caja);
      }
    });
    
    isUpdating = false;
    console.log('🎨 Cajitas actualizadas');
  }
  
  function hacerEditable(caja) {
    const nueva = caja.cloneNode(true);
    caja.parentNode.replaceChild(nueva, caja);
    
    nueva.style.cursor = 'pointer';
    nueva.title = 'Clic para seleccionar otro color';
    
    nueva.addEventListener('click', function(e) {
      e.stopPropagation();
      const numeroOriginal = this.dataset.numOriginal;
      abrirColorPicker(this, numeroOriginal);
    });
  }
  
  // ======================
  // ACTUALIZAR SVG
  // ======================
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) {
      console.log('⚠️ SVG no encontrado');
      return {textos: 0, colores: 0};
    }
    
    if (Object.keys(window.dayuMapping).length === 0) {
      console.log('⚠️ No hay mapeo activo');
      return {textos: 0, colores: 0};
    }
    
    let textos = 0;
    let colores = 0;
    
    svg.querySelectorAll('text').forEach(texto => {
      const contenido = texto.textContent.trim();
      
      if (window.dayuMapping[contenido]) {
        texto.textContent = window.dayuMapping[contenido].code;
        texto.dataset.numOriginal = contenido;
        textos++;
      }
    });
    
    svg.querySelectorAll('path, polygon').forEach(area => {
      const style = area.getAttribute('style');
      if (!style) return;
      
      let rgbActual = null;
      let esHex = false;
      
      const mHex = style.match(/fill:\s*(#[0-9a-fA-F]{3,6})/);
      if (mHex) {
        rgbActual = hexToRgb(mHex[1]);
        esHex = true;
      } else {
        const mRgb = style.match(/fill:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (mRgb) {
          rgbActual = [+mRgb[1], +mRgb[2], +mRgb[3]];
        }
      }
      
      if (!rgbActual) return;
      
      let mejorMatch = null;
      let menorDistancia = Infinity;
      
      for (const [numOriginal, dayu] of Object.entries(window.dayuMapping)) {
        const distancia = distanciaRGB(rgbActual, dayu.rgbOriginal);
        
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          mejorMatch = {numOriginal, dayu};
        }
      }
      
      if (mejorMatch && menorDistancia < 200) {
        let nuevoStyle;
        
        if (esHex) {
          nuevoStyle = style.replace(/fill:\s*#[0-9a-fA-F]{3,6}/, `fill: ${mejorMatch.dayu.hex}`);
        } else {
          nuevoStyle = style.replace(/fill:\s*rgb\([^)]+\)/, `fill: ${mejorMatch.dayu.hex}`);
        }
        
        area.setAttribute('style', nuevoStyle);
        area.dataset.numOriginal = mejorMatch.numOriginal;
        colores++;
      }
    });
    
    console.log(`✅ SVG actualizado: ${textos} textos, ${colores} colores`);
    return {textos, colores};
  }
  
  // ======================
  // OBSERVERS
  // ======================
  
  function iniciarObservers() {
    iniciarObserverSVG();
    iniciarObserverPaleta();
  }
  
  function iniciarObserverSVG() {
    const container = document.getElementById('svgContainer');
    if (!container) {
      setTimeout(iniciarObserverSVG, 500);
      return;
    }
    
    if (svgObserver) {
      svgObserver.disconnect();
    }
    
    svgObserver = new MutationObserver(() => {
      if (isUpdating) return;
      
      const svg = container.querySelector('svg');
      if (!svg) return;
      
      const textos = Array.from(svg.querySelectorAll('text'));
      const tieneNumerosOriginales = textos.some(t => {
        const txt = t.textContent.trim();
        return /^\d+$/.test(txt) && parseInt(txt) < 50 && !t.dataset.numOriginal;
      });
      
      if (tieneNumerosOriginales && Object.keys(window.dayuMapping).length > 0) {
        console.log('🔄 SVG regenerado por sistema, re-aplicando...');
        
        setTimeout(() => {
          const resultado = actualizarSVG();
          mostrarStatus(`🔄 Auto-aplicado: ${resultado.textos} textos | ${resultado.colores} áreas`, 'success');
        }, 150);
      }
    });
    
    svgObserver.observe(container, {
      childList: true,
      subtree: true
    });
    
    console.log('👁️ Observer SVG activo');
  }
  
  function iniciarObserverPaleta() {
    const palette = document.getElementById('palette');
    if (!palette) {
      setTimeout(iniciarObserverPaleta, 500);
      return;
    }
    
    if (paletaObserver) {
      paletaObserver.disconnect();
    }
    
    paletaObserver = new MutationObserver(() => {
      if (isUpdating) return;
      
      const cajitas = obtenerCajitas();
      const tieneNumerosOriginales = cajitas.some(c => {
        const txt = c.textContent.trim();
        return /^\d+$/.test(txt) && parseInt(txt) < 50 && !c.dataset.editable;
      });
      
      if (tieneNumerosOriginales && Object.keys(window.dayuMapping).length > 0) {
        console.log('🔄 Paleta regenerada, re-aplicando...');
        
        setTimeout(() => {
          actualizarCajitas();
        }, 100);
      }
    });
    
    paletaObserver.observe(palette, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
    
    console.log('👁️ Observer Paleta activo');
  }
  
  function detenerObservers() {
    if (svgObserver) svgObserver.disconnect();
    if (paletaObserver) paletaObserver.disconnect();
  }
  
  // ======================
  // INICIALIZACIÓN
  // ======================
  
  function init() {
    inyectarEstilos();
    
    let intentos = 0;
    const intervalo = setInterval(() => {
      if (crearInterfaz() || ++intentos > 30) {
        clearInterval(intervalo);
        mejorarLayoutResponsive();
        console.log(`✅ DAYU ${VERSION} inicializado`);
      }
    }, 500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  // ======================
  // API PÚBLICA
  // ======================
  
  window.dayuInfo = () => {
    console.log(`📊 DAYU ${VERSION} Estado:`);
    console.log('Mapeo:', window.dayuMapping);
    console.log('Total colores:', Object.keys(window.dayuMapping).length);
    console.log('Observer SVG:', !!svgObserver);
    console.log('Observer Paleta:', !!paletaObserver);
  };
  
  window.reaplicarDayu = () => {
    actualizarCajitas();
    return actualizarSVG();
  };
  
  window.dayuVersion = () => {
    console.log(`🎨 DAYU ${VERSION}`);
    return VERSION;
  };
  
  window.regenerarSVG = regenerarSVGDirecto;
  
  console.log(`✅ DAYU ${VERSION} cargado`);
})();
