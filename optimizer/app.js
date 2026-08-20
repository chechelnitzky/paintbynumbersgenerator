(function(){
  'use strict';
  const C=window.PBNOptimizerCore, catalog=window.PBN_CATALOG, palette=window.PALETTE_ITEMS||[];
  let lastSolution=null;
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function fmt(n,d=1){return Number(n).toFixed(d).replace('.',',');}
  function swatch(hex){return `<span class="swatch" style="background:${hex}"></span>`;}
  function tagInfo(tag){const p=palette.find(x=>String(x.tag)===String(tag));return p||{tag,hex:'#ddd'};}

  const stats=C.catalogStats(catalog,palette);
  const exact=C.maximumExactGroup(catalog,10);

  function renderSummary(){
    $('#summary').innerHTML=`
      <div class="metric"><b>${stats.products}</b><span>productos</span></div>
      <div class="metric"><b>${stats.recipes}</b><span>recetas actuales</span></div>
      <div class="metric"><b>${stats.paletteCount}</b><span>marcadores útiles</span></div>
      <div class="metric"><b>${stats.unused.length}</b><span>sin uso actual</span></div>
      <div class="metric accent"><b>${exact.length}</b><span>máximo actual sin cambios</span></div>`;
    $('#exact-current').innerHTML = exact.length ? exact.map(x=>`<span class="pill">${esc(x.product.name)} · ${esc(x.recipe.name)}</span>`).join('') : '—';
  }

  function renderMarkerGrid(){
    const usageMap=stats.usage;
    $('#marker-grid').innerHTML=palette.map(p=>{
      const uses=usageMap.get(String(p.tag))||[]; const n=uses.length;
      const cls=n===0?'unused':n>=8?'hot':n>=5?'warm':'normal';
      const title=n?uses.map(u=>`${u.productName} (${u.recipeName})`).join('\n'):'Sin uso';
      return `<button class="marker ${cls}" title="${esc(title)}" data-tag="${esc(p.tag)}">
        <span class="marker-color" style="background:${p.hex}"></span><b>${esc(p.tag)}</b><small>${n} uso${n===1?'':'s'}</small></button>`;
    }).join('');
    $$('.marker').forEach(el=>el.addEventListener('click',()=>showMarker(el.dataset.tag)));
  }

  function showMarker(tag){
    const p=tagInfo(tag), uses=stats.usage.get(String(tag))||[];
    $('#marker-detail').innerHTML=`<div class="detail-head">${swatch(p.hex)}<div><h3>Marcador ${esc(tag)}</h3><code>${esc(p.hex)}</code></div></div>
      <p>${uses.length?`Aparece en <b>${uses.length}</b> receta(s):`:'No aparece en ninguna receta actual.'}</p>
      ${uses.length?`<ul>${uses.map(u=>`<li>${esc(u.productName)} — receta ${esc(u.recipeName)}</li>`).join('')}</ul>`:''}`;
  }

  function renderCatalog(){
    $('#catalog-list').innerHTML=catalog.products.map(p=>`<label class="product-card">
      <input class="product-check" type="checkbox" value="${esc(p.id)}">
      <span class="product-main"><b>${esc(p.name)}</b><small>${p.recipes.length} receta${p.recipes.length===1?'':'s'} · ${p.recipes.map(r=>r.markers.length).join('/')} colores</small></span>
      <span class="recipe-mini">${p.recipes.map(r=>`<span>${esc(r.name)}</span>`).join('')}</span>
    </label>`).join('');
  }

  function selectedEntriesSmart(){
    const ids=new Set($$('.product-check:checked').map(x=>x.value));
    const selected=[]; const used=new Set();
    for(const p of catalog.products.filter(p=>ids.has(p.id))){
      let best=null;
      for(const r of p.recipes){let conflicts=0; for(const t of r.markers) if(used.has(t)) conflicts++; if(!best||conflicts<best.conflicts)best={r,conflicts};}
      selected.push({product:p,recipe:best.r}); for(const t of best.r.markers)used.add(t);
    }
    return selected;
  }

  function options(){
    return {maxDelta:Number($('#max-delta').value),changePenalty:Number($('#change-penalty').value),tries:Number($('#tries').value),maxChangesPerRecipe:Number($('#max-changes').value)};
  }

  function setBusy(on,msg='Calculando…'){$('#busy').hidden=!on;$('#busy-text').textContent=msg; $$('button.action').forEach(b=>b.disabled=on);}

  function renderSolution(res,title){
    lastSolution=res&&res.ok?res:null;
    const box=$('#solution');
    if(!res||!res.ok){box.innerHTML=`<div class="empty-result"><h3>${esc(title||'Sin solución')}</h3><p>${esc(res?.reason||'No se encontró una solución con esos límites.')}</p>${res?.testedCandidates!=null?`<small>${res.testedCandidates} candidatos evaluados.</small>`:''}</div>`;return;}
    const selected=res.selected||[];
    const grouped=new Map();
    for(const c of res.changes){if(!grouped.has(c.recipeId))grouped.set(c.recipeId,[]);grouped.get(c.recipeId).push(c);}
    box.innerHTML=`<div class="solution-head"><div><span class="eyebrow">${esc(title)}</span><h2>${selected.length} productos · ${res.slots} marcadores únicos</h2></div><div class="score">${fmt(res.utilization*100,1)}%<small>del estuche</small></div></div>
      <div class="solution-stats"><span><b>${res.changeCount}</b> cambios</span><span>ΔE medio <b>${fmt(res.meanChangedDelta,2)}</b></span><span>ΔE máx <b>${fmt(res.maxUsedDelta,2)}</b></span>${res.currentConflicts!=null?`<span><b>${res.currentConflicts}</b> conflictos antes</span>`:''}</div>
      <h3>Productos / recetas elegidas</h3><div class="chosen">${selected.map(x=>`<span class="pill">${esc(x.product.name)} · ${esc(x.recipe.name)}</span>`).join('')}</div>
      <h3>Cambios propuestos</h3>
      ${res.changes.length?Array.from(grouped.entries()).map(([rid,changes])=>{
        const first=changes[0]; return `<div class="change-group"><div class="change-title"><b>${esc(first.productName)}</b><span>receta ${esc(first.recipeName)} · ${changes.length} cambio${changes.length===1?'':'s'}</span></div>${changes.sort((a,b)=>a.deltaE-b.deltaE).map(c=>`<div class="change-row"><span>${swatch(c.fromHex)}<b>${esc(c.from)}</b></span><span class="arrow">→</span><span>${swatch(c.toHex)}<b>${esc(c.to)}</b></span><span class="delta">ΔE ${fmt(c.deltaE,2)}</span></div>`).join('')}</div>`;
      }).join(''):'<p class="ok">No necesita cambiar ningún marcador.</p>'}
      <button id="export-json" class="secondary">Exportar solución JSON</button>`;
    $('#export-json')?.addEventListener('click',exportSolution);
  }

  function exportSolution(){
    if(!lastSolution)return;
    const payload={generatedAt:new Date().toISOString(),catalogVersion:catalog.version,settings:options(),solution:{products:lastSolution.selected.map(x=>({productId:x.product.id,productName:x.product.name,recipeId:x.recipe.id,recipeName:x.recipe.name})),changes:lastSolution.changes,outputByRecipe:lastSolution.outputByRecipe}};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pbn-palette-optimizer-solution.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  }

  $('#btn-current').addEventListener('click',()=>renderSolution({ok:true,selected:exact,slots:exact.reduce((s,x)=>s+x.recipe.markers.length,0),utilization:exact.reduce((s,x)=>s+x.recipe.markers.length,0)/palette.length,changes:[],changeCount:0,totalDelta:0,meanChangedDelta:0,maxUsedDelta:0,outputByRecipe:{}},'Máximo actual sin recolorear'));

  $('#btn-auto').addEventListener('click',()=>{
    const target=Number($('#target').value), opt=options(); setBusy(true,`Buscando grupo de ${target}…`);
    setTimeout(()=>{try{const res=C.searchOptimizedGroup(catalog,palette,target,opt);renderSolution(res,`Búsqueda automática · objetivo ${target}`);}catch(e){renderSolution({ok:false,reason:e.message},'Error');}finally{setBusy(false);}},30);
  });

  $('#btn-selected').addEventListener('click',()=>{
    const sel=selectedEntriesSmart(); if(sel.length<2){renderSolution({ok:false,reason:'Seleccioná al menos 2 productos en el catálogo.'},'Optimizar selección');return;}
    setBusy(true,`Recalculando ${sel.length} productos…`);
    setTimeout(()=>{try{renderSolution(C.optimizeRecipes(sel,palette,options()),'Selección manual optimizada');}catch(e){renderSolution({ok:false,reason:e.message},'Error');}finally{setBusy(false);}},30);
  });

  $('#select-all').addEventListener('click',()=>$$('.product-check').forEach(x=>x.checked=true));
  $('#select-none').addEventListener('click',()=>$$('.product-check').forEach(x=>x.checked=false));
  $('#mode').addEventListener('change',e=>{
    const v=e.target.value;
    if(v==='conservative'){ $('#max-delta').value=3; $('#change-penalty').value=15; $('#max-changes').value=4; }
    if(v==='balanced'){ $('#max-delta').value=5; $('#change-penalty').value=8; $('#max-changes').value=8; }
    if(v==='aggressive'){ $('#max-delta').value=9; $('#change-penalty').value=3; $('#max-changes').value=16; }
  });

  renderSummary(); renderMarkerGrid(); renderCatalog(); showMarker(stats.ranked[0]?.tag||palette[0]?.tag);
  renderSolution({ok:false,reason:'Elegí una búsqueda automática o seleccioná productos para comenzar.'},'Optimizador listo');
})();
