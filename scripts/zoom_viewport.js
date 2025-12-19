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

  function hasSVG() {
    return !!(container && container.querySelector && container.querySelector('svg'));
  }

  function fitToViewport() {
    if (!hasSVG()) return;
    // Medimos el SVG real
    const svg = container.querySelector('svg');
    const bbox = svg.getBBox ? svg.getBBox() : null;

    // Fallback: usa width/height del SVG si bbox no existe
    const svgW = bbox ? bbox.width : (svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : svg.clientWidth);
    const svgH = bbox ? bbox.height : (svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.height : svg.clientHeight);

    const vpW = viewport.clientWidth - 20; // padding
    const vpH = viewport.clientHeight - 20;

    if (!svgW || !svgH || !vpW || !vpH) return;

    const scale = Math.min(vpW / svgW, vpH / svgH);
    setZoom(clamp(scale, 0.2, 6));

    // Volvemos al origen para ver completo
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

  // Eventos
  if (btnIn) btnIn.addEventListener('click', () => setZoom(zoom * 1.15));
  if (btnOut) btnOut.addEventListener('click', () => setZoom(zoom / 1.15));
  if (btnReset) btnReset.addEventListener('click', () => setZoom(1));
  if (btnFit) btnFit.addEventListener('click', () => fitToViewport());

  // Cuando el SVG se regenera, a veces se reemplaza innerHTML.
  // Observamos cambios y hacemos "fit" suave si estabas en 100%.
  const obs = new MutationObserver(() => {
    if (zoom === 1) {
      // Da un tick para que el SVG “asiente”
      setTimeout(() => {
        if (hasSVG()) {
          // no forzamos fit automático, solo refrescamos lectura
          if (read) read.textContent = `${Math.round(zoom * 100)}%`;
        }
      }, 30);
    }
  });

  if (container) obs.observe(container, { childList: true, subtree: true });

  // Inicial
  setZoom(1);
})();
