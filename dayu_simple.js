/* dayu_simple.js
 * Sistema DAYU minimalista y seguro
 * - Solo agrega botón "Mapear a DAYU"
 * - Hace cajitas superiores editables
 * - Sin observers complejos que puedan romper la página
 */

(function() {
  'use strict';
  
  console.log('🎨 DAYU Simple cargando...');
  
  // Verificar que DAYU_PALETTE esté cargada
  if (!window.DAYU_PALETTE) {
    console.error('❌ DAYU_PALETTE no encontrada');
    return;
  }
  
  console.log('✅ DAYU_PALETTE:', window.DAYU_PALETTE.length, 'colores');
  
  // ============================================
  // ESTADO
  // ============================================
  
  let clusterToCode = new Map(); // cluster index → código DAYU actual
  
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
    // Buscar dónde poner el botón
    const palette = document.getElementById('palette');
    if (!palette) {
      console.warn('⚠️ #palette no encontrado, reintentando...');
      return false;
    }
    
    // Verificar si ya existe
    if (document.getElementById('btnDayuSimple')) {
      return true;
    }
    
    // Crear botón
    const btn = document.createElement('button');
    btn.id = 'btnDayuSimple';
    btn.textContent = '🎨 Mapear a DAYU';
    btn.className = 'waves-effect waves-light btn';
    btn.style.cssText = `
      margin: 10px 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    `;
    
    btn.onclick = aplicarDayu;
    
    // Insertar antes del palette
    palette.parentNode.insertBefore(btn, palette);
    
    console.log('✅ Botón creado');
    return true;
  }
  
  // ============================================
  // APLICAR DAYU
  // ============================================
  
  function aplicarDayu() {
    console.log('🎨 Aplicando DAYU...');
    
    // 1. Buscar cajitas de arriba
    const palette = document.getElementById('palette');
    if (!palette) {
      alert('❌ Palette no encontrado. Genera la imagen primero.');
      return;
    }
    
    const cajitas = Array.from(palette.children).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
    
    if (cajitas.length === 0) {
      alert('❌ No se encontraron cajitas. Genera la imagen primero.');
      return;
    }
    
    console.log('📦 Cajitas encontradas:', cajitas.length);
    
    // 2. Extraer colores
    const colores = [];
    cajitas.forEach((caja, idx) => {
      const rgb = parseRgb(caja);
      if (rgb) {
        colores.push({ idx, rgb, hex: rgbToHex(rgb), caja });
      }
    });
    
    if (colores.length === 0) {
      alert('❌ No se pudieron extraer colores');
      return;
    }
    
    // 3. Mapear a DAYU (1:1 sin repetir)
    const distancias = [];
    colores.forEach(c => {
      window.DAYU_PALETTE.forEach((d, di) => {
        distancias.push({
          idx: c.idx,
          dayuIdx: di,
          dist: colorDist(c.rgb, d.rgb)
        });
      });
    });
    
    distancias.sort((a, b) => a.dist - b.dist);
    
    const usados = new Set();
    const usadosDayu = new Set();
    clusterToCode.clear();
    
    for (const d of distancias) {
      if (usados.has(d.idx) || usadosDayu.has(d.dayuIdx)) continue;
      
      usados.add(d.idx);
      usadosDayu.add(d.dayuIdx);
      
      const dayu = window.DAYU_PALETTE[d.dayuIdx];
      const color = colores[d.idx];
      
      clusterToCode.set(d.idx, dayu);
      
      // Actualizar cajita
      color.caja.style.backgroundColor = dayu.hex;
      color.caja.textContent = dayu.code;
      color.caja.dataset.cluster = d.idx;
      color.caja.dataset.originalColor = color.hex;
      
      console.log(`📦 ${d.idx} → ${dayu.code}`);
      
      if (clusterToCode.size === colores.length) break;
    }
    
    // 4. Hacer cajitas editables
    cajitas.forEach(caja => {
      if (!caja.dataset.cluster) return;
      
      caja.style.cursor = 'pointer';
      caja.title = '🖱️ Clic para editar código DAYU';
      
      // Remover listeners anteriores
      const nuevaCaja = caja.cloneNode(true);
      caja.parentNode.replaceChild(nuevaCaja, caja);
      
      nuevaCaja.onclick = function() {
        editarCajita(this);
      };
      
      // Hover
      nuevaCaja.onmouseenter = function() {
        this.style.transform = 'scale(1.15)';
        this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
      };
      
      nuevaCaja.onmouseleave = function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '';
      };
    });
    
    // 5. Actualizar SVG
    actualizarSVG();
    
    alert(`✅ ¡DAYU aplicado!\n\n${clusterToCode.size} colores mapeados\n\n💡 Haz clic en cualquier cajita para cambiar el código`);
  }
  
  // ============================================
  // EDITAR CAJITA
  // ============================================
  
  function editarCajita(caja) {
    const cluster = parseInt(caja.dataset.cluster);
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
        clusterToCode.set(cluster, nuevoDayu);
        
        // Actualizar cajita
        caja.textContent = nuevoDayu.code;
        caja.style.backgroundColor = nuevoDayu.hex;
        
        // Actualizar SVG
        actualizarSVG();
        
        console.log(`✏️ Cluster ${cluster} → ${nuevoDayu.code}`);
      } else {
        alert(`❌ Código "${nuevoCodigo}" no encontrado\n\nEjemplos: 42, 64, WG3, BG5`);
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
  // ACTUALIZAR SVG
  // ============================================
  
  function actualizarSVG() {
    const svg = document.querySelector('#svgContainer svg');
    if (!svg) {
      console.warn('⚠️ SVG no encontrado');
      return;
    }
    
    // Crear mapa color → cluster
    const colorMap = new Map();
    clusterToCode.forEach((dayu, cluster) => {
      // Obtener color original de la cajita
      const palette = document.getElementById('palette');
      const cajitas = Array.from(palette.children);
      const caja = cajitas.find(c => c.dataset.cluster == cluster);
      
      if (caja && caja.dataset.originalColor) {
        colorMap.set(caja.dataset.originalColor.toLowerCase(), cluster);
      }
    });
    
    let actualizados = 0;
    const textos = svg.querySelectorAll('text');
    
    textos.forEach(texto => {
      const parent = texto.parentElement;
      if (!parent) return;
      
      const shape = parent.querySelector('path, polygon, rect');
      if (!shape) return;
      
      const fill = (shape.getAttribute('fill') || '').toLowerCase();
      const cluster = colorMap.get(fill);
      
      if (cluster !== undefined && clusterToCode.has(cluster)) {
        const dayu = clusterToCode.get(cluster);
        
        // Guardar original
        if (!texto.dataset.original) {
          texto.dataset.original = texto.textContent;
        }
        if (!shape.dataset.original) {
          shape.dataset.original = fill;
        }
        
        // Actualizar
        texto.textContent = dayu.code;
        texto.dataset.cluster = cluster;
        shape.setAttribute('fill', dayu.hex);
        shape.style.fill = dayu.hex;
        
        actualizados++;
      }
    });
    
    console.log(`✅ SVG: ${actualizados} actualizados`);
  }
  
  // ============================================
  // INIT
  // ============================================
  
  function init() {
    // Intentar crear botón varias veces
    let intentos = 0;
    const interval = setInterval(() => {
      intentos++;
      
      if (crearBoton() || intentos > 20) {
        clearInterval(interval);
        if (intentos > 20) {
          console.warn('⚠️ No se pudo crear botón después de 20 intentos');
        }
      }
    }, 500);
  }
  
  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Si ya está cargado, esperar un poco y ejecutar
    setTimeout(init, 500);
  }
  
  console.log('✅ DAYU Simple cargado');
  
})();
