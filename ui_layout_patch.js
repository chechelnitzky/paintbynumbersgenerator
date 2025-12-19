/* ui_layout_patch.js
   Sidebar tabs + evita reflow raro.
*/
(function () {
  function qs(s){ return document.querySelector(s); }
  function qsa(s){ return Array.from(document.querySelectorAll(s)); }

  function setActive(targetSel){
    qsa('.side-tab').forEach(b => b.classList.remove('active'));
    qsa('.side-panel').forEach(p => p.classList.remove('active'));

    const btn = qsa('.side-tab').find(b => b.getAttribute('data-target') === targetSel);
    const panel = qs(targetSel);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');
  }

  function bind(){
    qsa('.side-tab').forEach(btn => {
      btn.addEventListener('click', () => setActive(btn.getAttribute('data-target')));
    });

    // Por si Materialize intenta scrollear el body
    document.body.addEventListener('wheel', (e) => {
      // No bloqueamos el scroll interno; solo evitamos scroll del body (ya está hidden)
    }, { passive:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
