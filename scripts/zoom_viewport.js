(function () {
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  const viewport = document.getElementById('svgViewport');
  const stage = document.getElementById('svgStage');
  const container = document.getElementById('svgContainer');

  const btnIn = document.getElementById('zoomIn');
  const btnOut = document.getElementById('zoomOut');
  const btnReset = document.getElementById('zoomReset');
  const btnFit = document.getElementById('zoomFit');
  const read = document.getElementById('zoomRead');

  let zoom = 1;

  function setZoom(nextZoom) {
    zoom = clamp(nextZoom, 0.2, 6);
    stage.style.transform = `scale(${zoom})`;
    if (read) read.textContent = `${Math.round(zoom * 100)}%`;
  }

  function svgEl() {
    return container ? container.querySelector('svg') : null;
  }

  function fitToViewport() {
    const svg = svgEl();
    if (!svg || !viewport) return;

    // Medir tamaño real del SVG (prioridad: viewBox)
    let svgW = 0, svgH = 0;

    if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
      svgW = svg.viewBox.baseVal.width;
      svgH = svg.viewBox.baseVal.height;
    } else {
      // fallback a getBBox (a veces 0 si está hidden)
      try {
        const bb = svg.getBBox();
        svgW = bb.width;
        svgH = bb.height;
      } catch (e) {}
    }

    // Si aún 0, fallback a client rect
    if (!svgW || !svgH) {
      const r = svg.getBoundingClientRect();
      svgW = r.width;
      svgH = r.height;
    }

    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (!svgW || !svgH || !vpW || !vpH) return;

    // Margen para que no toque bordes
    const margin = 22;
    const scale = Math.min((vpW - margin) / svgW, (vpH - margin) / svgH);

    setZoom(clamp(scale, 0.2, 6));

    // Volver al origen para ver completo
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

  if (btnIn) btnIn.addEventListener('click', () => setZoom(zoom * 1.15));
  if (btnOut) btnOut.addEventListener('click', () => setZoom(zoom / 1.15));
  if (btnReset) btnReset.addEventListener('click', () => setZoom(1));
  if (btnFit) btnFit.addEventListener('click', () => fitToViewport());

  // Observa regeneración del SVG (cuando main.js reemplaza innerHTML)
  const obs = new MutationObserver(() => {
    // refresca lectura
    if (read) read.textContent = `${Math.round(zoom * 100)}%`;

    // Si recién apareció el SVG, aplica Fit una vez (solo si estás en 100%)
    const svg = svgEl();
    if (svg && zoom === 1) {
      setTimeout(() => fitToViewport(), 40);
    }
  });

  if (container) obs.observe(container, { childList: true, subtree: true });

  setZoom(1);
})();
