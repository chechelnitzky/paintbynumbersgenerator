(function(){
'use strict';
const S=window.PBNStudioStorage,$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
if(!S)return;
function badVersions(p){return (p?.versions||[]).filter(v=>{const n=(v.markerTags||[]).length;return n>0&&n<3;});}
function paint(){
  $$('.project-card').forEach(card=>{
    const p=S.get(card.dataset.project);if(!p)return;const bad=badVersions(p),info=card.querySelector('.project-info');let w=card.querySelector('.recipe-health-warning');
    if(bad.length){
      card.style.borderColor='#fb7185';
      if(!w&&info){w=document.createElement('div');w.className='recipe-health-warning';w.style.cssText='margin:0 10px 10px;padding:7px 9px;border-radius:8px;background:#ffe4e6;color:#9f1239;font-size:11px;font-weight:800';w.textContent=`⚠ ${bad.length} receta(s) inválida(s) · excluida(s) de Plan Maestro`;info.insertAdjacentElement('afterend',w);}
    }else{card.style.borderColor='';w?.remove();}
  });
  const active=S.get(S.getActive()),bad=badVersions(active),activeRow=$('.version-row.active');
  if(activeRow&&bad.some(v=>v.id===activeRow.dataset.version)){let b=$('#active-recipe-health');if(!b){b=document.createElement('div');b.id='active-recipe-health';b.style.cssText='margin:8px 0;padding:9px;border-radius:8px;background:#ffe4e6;color:#9f1239;font-weight:800';$('.editor-panel')?.insertBefore(b,$('#marker-editor'));}b.textContent='⚠ Receta inválida/truncada. No entra al Plan Maestro ni al Constructor hasta repararla o generar una versión correcta.';}else $('#active-recipe-health')?.remove();
}
new MutationObserver(()=>setTimeout(paint,40)).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(e.target.closest?.('.project-card,.version-row'))setTimeout(paint,80)},true);
setTimeout(paint,600);
})();