/* dayu_ui_patch.js
   FIX: output viewport fijo + zoom real (escala SOLO el SVG)
*/

(function () {
  const state = {
    zoom: 1,
    minZoom: 0.1,
    maxZoom: 6,
    step: 0.15,
  };

  function qs(sel) { return document.querySelector(sel); }

  function getSvgEl() {
    const container = qs('#svgContainer');
    if (!container) return null;
    return container.querySelector('svg');
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function setZoom(z) {
    state.zoom = clamp(z, state.minZoom, state.maxZoom);
    const svg = getSvgEl();
    if (svg) {
      svg.style.transformOrigin = '0 0';
      svg.style.transform = `scale(${state.zoom})`;
    }
    const pill = qs('#zoomPct');
    if (pill) pill.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function zoomIn() { setZoom(state.zoom + state.step); }
  function zoomOut() { setZoom(state.zoom - state.step); }
  function zoomReset() { setZoom(1); }

  function zoomFit() {
    const viewport = qs('#outputViewport');
    const svg = getSvgEl();
    if (!viewport || !svg) return;

    // Tomamos tamaño real del SVG (sin transform)
    const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;

    // fallback: width/height del SVG
    const svgW = vb ? vb.width : (parseFloat(svg.getAttribute('width')) || svg.getBBox().width || 1000);
    const svgH = vb ? vb.height : (parseFloat(svg.getAttribute('height')) || svg.getBBox().height || 1000);

    // Medidas internas del viewport (restando padding)
    const cs = window.getComputedStyle(viewport);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

    const vw = Math.max(10, viewport.clientWidth - padX);
    const vh = Math.max(10, viewport.clientHeight - padY);

    const scale = Math.min(vw / svgW, vh / svgH);
    // un pelín de margen visual
    setZoom(scale * 0.98);

    // scroll arriba-izquierda para “ver completo”
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  }

  function ensureToolbarBindings() {
    const btnIn = qs('#btnZoomIn');
    const btnOut = qs('#btnZoomOut');
    const btnReset = qs('#btnZoomReset');
    const btnFit = qs('#btnZoomFit');

    if (btnIn && !btnIn.__zoomBound) {
      btnIn.__zoomBound = true;
      btnIn.addEventListener('click', (e) => { e.preventDefault(); zoomIn(); });
    }
    if (btnOut && !btnOut.__zoomBound) {
      btnOut.__zoomBound = true;
      btnOut.addEventListener('click', (e) => { e.preventDefault(); zoomOut(); });
    }
    if (btnReset && !btnReset.__zoomBound) {
      btnReset.__zoomBound = true;
      btnReset.addEventListener('click', (e) => { e.preventDefault(); zoomReset(); });
    }
    if (btnFit && !btnFit.__zoomBound) {
      btnFit.__zoomBound = true;
      btnFit.addEventListener('click', (e) => { e.preventDefault(); zoomFit(); });
    }
  }

  function reapplyZoomAfterSvgChanges() {
    const container = qs('#svgContainer');
    if (!container) return;

    const mo = new MutationObserver(() => {
      // Cuando cambie el SVG, re-aplicamos el zoom actual
      const svg = getSvgEl();
      if (svg) {
        svg.style.transformOrigin = '0 0';
        svg.style.transform = `scale(${state.zoom})`;
      }
    });

    mo.observe(container, { childList: true, subtree: true });
  }

  function init() {
    ensureToolbarBindings();
    reapplyZoomAfterSvgChanges();

    // set default zoom pill
    setZoom(1);

    // Si ya hay SVG cargado, aplica
    const svg = getSvgEl();
    if (svg) setZoom(state.zoom);
  }

  // Espera DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
