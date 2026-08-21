(function(){
  'use strict';
  const catalog=window.PBN_CATALOG,palette=window.PALETTE_ITEMS||[],E=window.PBNOptimizer2Engine;
  let last=null;
  const $=s=>document.querySelector(s);
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function fmt(n,d=2){return Number(n||0).toFixed(d).replace('.',',');}
  function pinfo(tag){return palette.find(p=>String(p.tag)===String(tag))||{tag,hex:'#ddd'};}
  function sw(tag){const p=pinfo(tag);return `<span class="sw" style="background:${p.hex}"></span>`;}
  function recipeCount(){return catalog.products.reduce((s,p)=>s+(p.recipes||[]).length,0);}

  function renderBaseSummary(){
    const size=Number($('#group-size').value),groups=Math.ceil(catalog.products.length/size),remainder=catalog.products.length%size;
    $('#summary').innerHTML=`<div class="metric"><b>${catalog.products.length}</b><span>productos reales</span></div><div class="metric"><b>${recipeCount()}</b><span>recetas disponibles</span></div><div class="metric"><b>${palette.length}</b><span>marcadores físicos</span></div><div class="metric"><b>${groups}</b><span>grupos objetivo</span></div><div class="metric"><b>${remainder||size}</b><span>diseños en el último grupo</span></div>`;
  }

  function renderCatalog(){
    $('#catalog-count').textContent=`${catalog.products.length} productos · ${recipeCount()} recetas`;
    $('#catalog').innerHTML=catalog.products.map(p=>`<article class="catalog-product"><h3>${esc(p.name)}</h3>${p.recipes.map(r=>`<div class="catalog-recipe"><b>Receta ${esc(r.name)}</b> <small>· ${r.markers.length} marcadores</small><div class="raw-markers">${r.markers.map(t=>`<span class="raw-marker">${esc(t)}</span>`).join('')}</div></div>`).join('')}</article>`).join('');
  }

  function markerToken(m){
    const conflicts=(m.conflictWith||[]).map(x=>x.productName).join(', ');
    if(m.change && m.conflict){
      return `<span class="marker-token changed-conflict" title="Conflicto original con: ${esc(conflicts)}. Este diseño cedió el marcador y fue reasignado.">${sw(m.tag)}<b>${esc(m.tag)}</b><span class="arrow">→</span>${sw(m.change.to)}<span class="new">${esc(m.change.to)}</span></span>`;
    }
    if(m.change && !m.conflict){
      return `<span class="marker-token strategic" title="No estaba en conflicto. El algoritmo lo movió estratégicamente para mejorar la solución global.">${sw(m.tag)}<b>${esc(m.tag)}</b><span class="arrow">→</span>${sw(m.change.to)}<span class="new">${esc(m.change.to)}</span></span>`;
    }
    if(m.conflict){
      return `<span class="marker-token conflict-kept" title="Conflicto original con: ${esc(conflicts)}. Este diseño conservó el marcador; otro diseño cedió.">${sw(m.tag)}<b>${esc(m.tag)}</b></span>`;
    }
    return `<span class="marker-token unchanged" title="Sin conflicto original y sin cambio.">${sw(m.tag)}<b>${esc(m.tag)}</b></span>`;
  }

  function designCard(d){
    const conflictMarkers=d.markers.filter(m=>m.conflict),changes=d.changes||[];
    const conflictChanged=d.markers.filter(m=>m.conflict&&m.change).length;
    const conflictKept=d.markers.filter(m=>m.conflict&&!m.change).length;
    const strategic=d.markers.filter(m=>!m.conflict&&m.change).length;
    const changeRows=changes.slice().sort((a,b)=>a.deltaE-b.deltaE).map(c=>{
      const original=d.markers.find(m=>String(m.tag)===String(c.from));
      const strategicMove=original&&!original.conflict;
      return `<div class="change-row ${strategicMove?'strategic-row':'conflict-change-row'}"><span class="from">${sw(c.from)}${esc(c.from)}</span><span>→</span><span class="to">${sw(c.to)}${esc(c.to)}</span><span class="delta">ΔE ${fmt(c.deltaE)}</span></div>`;
    }).join('');
    return `<article class="design"><div class="design-head"><h3>${esc(d.product.name)}</h3><span class="recipe-label">Receta ${esc(d.recipe.name)}</span></div><div class="design-meta">${d.recipe.markers.length} colores · ${conflictMarkers.length} conflictos originales · <span class="meta-kept">${conflictKept} se quedan</span> · <span class="meta-yielded">${conflictChanged} ceden</span>${strategic?` · <span class="meta-strategic">${strategic} movimiento${strategic===1?'':'s'} estratégico${strategic===1?'':'s'}</span>`:''}</div><div class="marker-list">${d.markers.map(markerToken).join('')}</div>${conflictMarkers.length?`<div class="conflict-note">Conflictos originales: ${conflictMarkers.map(m=>`${esc(m.tag)} con ${m.conflictWith.map(x=>esc(x.productName)).join('/')}`).join(' · ')}</div>`:''}${changes.length?`<div class="change-list">${changeRows}</div>`:''}</article>`;
  }

  function renderResult(res){
    const box=$('#result');last=res;
    if(!res.ok){box.innerHTML=`<div class="error"><b>No se encontró solución completa.</b><br>${esc(res.reason)}</div>`;return;}
    const totalSlots=res.groups.reduce((s,g)=>s+g.res.slots,0);
    box.innerHTML=`<section class="panel"><div class="run-head"><div><span class="eyebrow">Mejor negociación encontrada</span><h2>${res.groups.length} grupos · ${catalog.products.length} diseños</h2><p>Dentro de cada grupo todos los marcadores finales son únicos. <b>Rojo</b> = conflicto que conserva el marcador; <b>naranja</b> = conflicto que cede; <b>morado</b> = movimiento estratégico sin conflicto original; <b>gris</b> = intacto.</p></div><div class="run-score"><b>${res.totalChanges}</b><small>cambios totales</small></div></div><div class="summary"><div class="metric"><b>${fmt(res.meanDelta)}</b><span>ΔE medio de cambios</span></div><div class="metric"><b>${fmt(res.maxUsedDelta)}</b><span>ΔE máximo utilizado</span></div><div class="metric"><b>${res.totalRaw}</b><span>colisiones antes</span></div><div class="metric"><b>${totalSlots}</b><span>asignaciones de color</span></div><div class="metric"><b>${res.shortlistTested}</b><span>agrupaciones finales evaluadas</span></div></div><button id="export" class="export">Exportar propuesta JSON</button></section><div class="groups">${res.groups.map((g,i)=>`<section class="group"><header class="group-head"><div><span class="eyebrow">Grupo ${i+1}</span><h2>${g.designs.length} diseños</h2></div><div class="group-stats"><span class="stat"><b>${g.res.slots}/167</b> marcadores</span><span class="stat"><b>${g.rawConflicts}</b> conflictos antes</span><span class="stat"><b>${g.res.changeCount}</b> cambios</span><span class="stat">ΔE medio <b>${fmt(g.res.meanChangedDelta)}</b></span><span class="stat">ΔE máx <b>${fmt(g.res.maxUsedDelta)}</b></span></div></header><div class="designs">${g.designs.map(designCard).join('')}</div></section>`).join('')}</div>`;
    $('#export').addEventListener('click',exportResult);
  }

  function exportResult(){
    if(!last?.ok)return;
    const payload={generatedAt:new Date().toISOString(),catalogVersion:catalog.version,settings:{groupSize:last.groupSize,maxDelta:last.maxDelta,changePenalty:last.changePenalty,attempts:last.attempts},summary:{groups:last.groups.length,totalChanges:last.totalChanges,meanDelta:last.meanDelta,maxUsedDelta:last.maxUsedDelta},groups:last.groups.map((g,i)=>({group:i+1,products:g.designs.map(d=>({productId:d.product.id,productName:d.product.name,recipeId:d.recipe.id,recipeName:d.recipe.name,originalMarkers:d.recipe.markers,optimizedMarkers:d.outputMarkers,changes:d.changes.map(c=>({from:c.from,to:c.to,deltaE:c.deltaE}))}))}))};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pbn-optimizer2-global.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  }

  function progress(frac,text){$('#progress').hidden=false;$('#bar-fill').style.width=`${Math.max(0,Math.min(100,frac*100))}%`;$('#progress-text').textContent=text;}
  async function run(){
    const btn=$('#run');btn.disabled=true;$('#result').innerHTML='';progress(0,'Preparando negociación global…');
    try{
      const res=await E.negotiateAll(catalog,palette,{groupSize:Number($('#group-size').value),maxDelta:Number($('#max-delta').value),changePenalty:Number($('#change-penalty').value),attempts:Number($('#attempts').value)},progress);
      progress(1,res.ok?'Negociación terminada.':'Búsqueda terminada sin solución.');renderResult(res);
    }catch(e){renderResult({ok:false,reason:e.message||String(e)});}
    finally{btn.disabled=false;setTimeout(()=>{$('#progress').hidden=true;},900);}
  }

  $('#run').addEventListener('click',run);$('#group-size').addEventListener('change',renderBaseSummary);
  renderBaseSummary();renderCatalog();
})();