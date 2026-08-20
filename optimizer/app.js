(function(){
  'use strict';
  const C=window.PBNOptimizerCore, P=window.PBNOptimizerPlanner, baseCatalog=window.PBN_CATALOG, palette=window.PALETTE_ITEMS||[];
  const STORAGE_KEY='pbn_optimizer_saved_recipes_v1';
  let lastSolution=null, currentPlan=[];
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function fmt(n,d=1){return Number(n||0).toFixed(d).replace('.',',');}
  function swatch(hex){return `<span class="swatch" style="background:${hex}"></span>`;}
  function tagInfo(tag){return palette.find(x=>String(x.tag)===String(tag))||{tag,hex:'#ddd'};}
  function markerChip(tag){const p=tagInfo(tag);return `<span class="marker-chip">${swatch(p.hex)}<b>${esc(tag)}</b></span>`;}
  function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}

  function loadSaved(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
  function writeSaved(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}
  function workingCatalog(){return P.catalogWithSavedRecipes(baseCatalog,loadSaved());}
  function statusRank(s){return ({draft:1,validated:2,applied:3})[s]||0;}
  function toast(text){const old=$('.toast');if(old)old.remove();const d=document.createElement('div');d.className='toast';d.textContent=text;document.body.appendChild(d);setTimeout(()=>d.remove(),3500);}

  async function copyText(text,msg='Copiado'){
    try{await navigator.clipboard.writeText(text);toast(msg);}catch{
      const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast(msg);
    }
  }
  function restrictionText(markers){
    return (markers||[]).map(tag=>{const p=tagInfo(tag),rgb=C.hexToRgb(p.hex);return rgb?`${rgb.r},${rgb.g},${rgb.b} // ${tag}`:'';}).filter(Boolean).join('\n');
  }
  function openGenerator(markers,label){
    const win=window.open('../','_blank');
    copyText(restrictionText(markers),`Restricciones de ${label} copiadas. Pegalas en Options → Restrict clustering colors.`);
    if(!win) toast('El navegador bloqueó la nueva pestaña. Las restricciones quedaron copiadas.');
  }

  function uniqueProductUses(uses){
    const m=new Map();for(const u of uses||[])if(!m.has(u.productId))m.set(u.productId,u);return [...m.values()];
  }

  function currentStats(){return C.catalogStats(workingCatalog(),palette);}
  function currentExact(){return C.maximumExactGroup(workingCatalog(),10);}

  function renderSummary(){
    const cat=workingCatalog(), stats=currentStats(), exact=currentExact();
    const validated=loadSaved().filter(x=>['validated','applied'].includes(x.status)).length;
    $('#summary').innerHTML=`
      <div class="metric"><b>${baseCatalog.products.length}</b><span>productos</span></div>
      <div class="metric"><b>${baseCatalog.products.reduce((s,p)=>s+p.recipes.length,0)}</b><span>recetas originales</span></div>
      <div class="metric"><b>${validated}</b><span>recetas optimizadas validadas</span></div>
      <div class="metric"><b>${stats.unused.length}</b><span>marcadores sin uso</span></div>
      <div class="metric accent"><b>${exact.length}</b><span>máximo actual por estuche</span></div>
      <div class="metric accent"><b>${currentPlan.length||'—'}</b><span>estuches para cubrir todo</span></div>`;
    $('#exact-current').innerHTML=exact.length?exact.map(x=>`<button class="case-product product-open" data-product="${esc(x.product.id)}">${esc(x.product.name)} · ${esc(x.recipe.name)}</button>`).join(''):'—';
    bindProductOpeners();
  }

  function renderMarkerGrid(){
    const stats=currentStats(),usageMap=stats.usage;
    $('#marker-grid').innerHTML=palette.map(p=>{
      const uses=uniqueProductUses(usageMap.get(String(p.tag))||[]),n=uses.length;
      const cls=n===0?'unused':n<=2?'low':n<=4?'medium':n<=7?'warm':'hot';
      const title=n?uses.map(u=>`${u.productName} (${u.recipeName})`).join('\n'):'Sin uso';
      return `<button class="marker ${cls}" title="${esc(title)}" data-tag="${esc(p.tag)}"><span class="marker-color" style="background:${p.hex}"></span><b>${esc(p.tag)}</b><small>${n} producto${n===1?'':'s'}</small></button>`;
    }).join('');
    $$('.marker').forEach(el=>el.addEventListener('click',()=>showMarker(el.dataset.tag)));
  }

  function showMarker(tag){
    const stats=currentStats(),p=tagInfo(tag),uses=uniqueProductUses(stats.usage.get(String(tag))||[]);
    $('#marker-detail').innerHTML=`<div class="detail-head">${swatch(p.hex)}<div><h3>Marcador ${esc(tag)}</h3><code>${esc(p.hex)}</code></div></div><p>${uses.length?`Lo utiliza <b>${uses.length}</b> producto(s):`:'No aparece en ninguna receta disponible.'}</p>${uses.length?`<ul>${uses.map(u=>`<li><button class="case-product product-open" data-product="${esc(u.productId)}">${esc(u.productName)}</button> · ${esc(u.recipeName)}</li>`).join('')}</ul>`:''}`;
    bindProductOpeners();
  }

  function renderCatalog(){
    const cat=workingCatalog(),saved=loadSaved();
    $('#catalog-list').innerHTML=baseCatalog.products.map(base=>{
      const p=cat.products.find(x=>x.id===base.id)||base, extra=saved.filter(x=>x.productId===p.id&&['validated','applied'].includes(x.status)).length;
      return `<div class="product-card"><input class="product-check" type="checkbox" value="${esc(p.id)}"><span class="product-main product-open" data-product="${esc(p.id)}"><b>${esc(p.name)}</b><small>${base.recipes.length} original${base.recipes.length===1?'':'es'}${extra?` + ${extra} validada${extra===1?'':'s'}`:''}</small></span><span class="recipe-mini">${p.recipes.slice(0,3).map(r=>`<span>${esc(r.name)}</span>`).join('')}</span></div>`;
    }).join('');
    bindProductOpeners();
  }

  function bindProductOpeners(){
    $$('.product-open').forEach(el=>{if(el.dataset.bound)return;el.dataset.bound='1';el.addEventListener('click',e=>{e.preventDefault();openProduct(el.dataset.product);});});
  }

  function recipeHtml(product,recipe,isSaved,record){
    const changes=record?.changes||[];
    return `<div class="recipe-block"><div class="saved-head"><div><h4>${esc(recipe.name)}</h4><small>${recipe.markers.length} marcadores${isSaved?` · basada en ${esc(record?.baseRecipeName||record?.baseRecipeId||'receta original')}`:''}</small></div>${isSaved?`<span class="status ${esc(record.status)}">${record.status==='draft'?'borrador':record.status==='validated'?'validada':'aplicada'}</span>`:'<span class="status">original</span>'}</div><div class="marker-chips">${recipe.markers.map(markerChip).join('')}</div>${changes.length?`<p class="note"><b>Cambios:</b> ${changes.map(c=>`${esc(c.from)}→${esc(c.to)} (ΔE ${fmt(c.deltaE,2)})`).join(' · ')}</p>`:''}<div class="recipe-actions"><button data-copy-tags="${esc(recipe.markers.join(','))}">Copiar marcadores</button><button data-copy-rgb="${esc(recipe.markers.join(','))}">Copiar restricciones RGB</button><button data-open-generator="${esc(recipe.markers.join(','))}" data-label="${esc(product.name+' · '+recipe.name)}">Abrir generador</button></div></div>`;
  }

  function openProduct(productId){
    const cat=workingCatalog(),p=cat.products.find(x=>x.id===productId);if(!p)return;
    const base=baseCatalog.products.find(x=>x.id===productId),saved=loadSaved().filter(x=>x.productId===productId);
    const originals=(base?.recipes||[]).map(r=>recipeHtml(p,r,false,null)).join('');
    const savedHtml=saved.length?saved.map(s=>recipeHtml(p,{id:'saved:'+s.id,name:s.name,markers:s.markers},true,s)).join(''):'<p class="note">Todavía no hay propuestas guardadas para este diseño.</p>';
    $('#product-modal-body').innerHTML=`<span class="eyebrow">Diseño</span><h2>${esc(p.name)}</h2><p>Acá viven las recetas de este producto. Una receta validada se vuelve una alternativa que el planificador puede elegir al armar los estuches.</p><h3>Recetas originales</h3>${originals}<h3>Propuestas / recetas optimizadas</h3>${savedHtml}`;
    $('#product-modal').hidden=false;bindRecipeActions();
  }

  function bindRecipeActions(){
    $$('[data-copy-tags]').forEach(b=>b.addEventListener('click',()=>copyText(b.dataset.copyTags.split(',').join(', '),'Lista de marcadores copiada.')));
    $$('[data-copy-rgb]').forEach(b=>b.addEventListener('click',()=>copyText(restrictionText(b.dataset.copyRgb.split(',')),'Restricciones RGB copiadas.')));
    $$('[data-open-generator]').forEach(b=>b.addEventListener('click',()=>openGenerator(b.dataset.openGenerator.split(','),b.dataset.label)));
  }

  function renderPlan(){
    const cat=workingCatalog();
    currentPlan=P.planCases(cat,{tries:320,maxProducts:10});
    const total=currentPlan.reduce((s,c)=>s+c.entries.length,0),avg=currentPlan.length?total/currentPlan.length:0;
    $('#case-plan-summary').innerHTML=`<div class="bigstat"><b>${currentPlan.length}</b>estuches necesarios</div><div class="bigstat"><b>${total}</b>productos cubiertos</div><div class="bigstat"><b>${fmt(avg,1)}</b>diseños promedio/estuche</div>`;
    $('#case-plan').innerHTML=currentPlan.map(c=>`<div class="case-card"><div class="case-card-head"><div><span class="eyebrow">Estuche ${c.id}</span><h3>${c.entries.length} diseños</h3></div><div class="case-meta"><b>${c.markerCount}/167</b> marcadores<br>${fmt(c.utilization*100,1)}% utilización</div></div><div class="case-products">${c.entries.map(x=>`<button class="case-product product-open" data-product="${esc(x.product.id)}" title="Receta: ${esc(x.recipe.name)}">${esc(x.product.name)} · ${esc(x.recipe.name)}</button>`).join('')}</div></div>`).join('');
    bindProductOpeners();renderSummary();
  }

  function renderSaved(){
    const saved=loadSaved();
    if(!saved.length){$('#saved-list').innerHTML='<div class="empty-result"><b>No hay propuestas guardadas.</b><p>Cuando una optimización te guste, guardala como borrador o validala.</p></div>';return;}
    $('#saved-list').innerHTML=saved.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(s=>`<div class="saved-card"><div class="saved-head"><div><h4>${esc(s.productName)} · ${esc(s.name)}</h4><small>${s.markers.length} marcadores · ${new Date(s.createdAt).toLocaleString('es-CL')}</small></div><span class="status ${esc(s.status)}">${s.status==='draft'?'borrador':s.status==='validated'?'validada':'aplicada'}</span></div><div class="marker-chips">${s.markers.map(markerChip).join('')}</div>${s.changes?.length?`<p class="note">${s.changes.map(c=>`${esc(c.from)}→${esc(c.to)} · ΔE ${fmt(c.deltaE,2)}`).join(' | ')}</p>`:''}<div class="saved-actions"><button data-saved-view="${esc(s.id)}">Ver diseño</button>${s.status==='draft'?`<button data-saved-status="${esc(s.id)}" data-status="validated">Validar receta</button>`:''}${s.status==='validated'?`<button data-saved-status="${esc(s.id)}" data-status="applied">Marcar aplicada</button>`:''}<button data-saved-copy="${esc(s.id)}">Copiar RGB</button><button data-saved-open="${esc(s.id)}">Abrir generador</button><button class="danger" data-saved-delete="${esc(s.id)}">Eliminar</button></div></div>`).join('');
    $$('[data-saved-view]').forEach(b=>b.addEventListener('click',()=>{const s=loadSaved().find(x=>x.id===b.dataset.savedView);if(s)openProduct(s.productId);}));
    $$('[data-saved-status]').forEach(b=>b.addEventListener('click',()=>changeSavedStatus(b.dataset.savedStatus,b.dataset.status)));
    $$('[data-saved-copy]').forEach(b=>b.addEventListener('click',()=>{const s=loadSaved().find(x=>x.id===b.dataset.savedCopy);if(s)copyText(restrictionText(s.markers),'Restricciones RGB copiadas.');}));
    $$('[data-saved-open]').forEach(b=>b.addEventListener('click',()=>{const s=loadSaved().find(x=>x.id===b.dataset.savedOpen);if(s)openGenerator(s.markers,`${s.productName} · ${s.name}`);}));
    $$('[data-saved-delete]').forEach(b=>b.addEventListener('click',()=>deleteSaved(b.dataset.savedDelete)));
  }

  function refreshAll(replan=true){renderSaved();renderCatalog();renderMarkerGrid();if(replan)renderPlan();else renderSummary();}

  function changeSavedStatus(id,status){
    const items=loadSaved(),s=items.find(x=>x.id===id);if(!s)return;s.status=status;s.updatedAt=new Date().toISOString();writeSaved(items);toast(status==='validated'?'Receta validada: ya participa en el cálculo de estuches.':'Receta marcada como aplicada.');refreshAll(true);openProduct(s.productId);
  }
  function deleteSaved(id){const items=loadSaved().filter(x=>x.id!==id);writeSaved(items);toast('Propuesta eliminada.');refreshAll(true);$('#product-modal').hidden=true;}

  function nextOptimizedName(productId){const n=loadSaved().filter(x=>x.productId===productId).length+1;return `Optimizada ${n}`;}
  function saveSolution(status){
    if(!lastSolution?.ok)return;
    const items=loadSaved();let added=0,upgraded=0;
    for(const entry of lastSolution.selected||[]){
      const rid=entry.recipe.id,out=lastSolution.outputByRecipe?.[rid];if(!out)continue;
      const changes=(lastSolution.changes||[]).filter(c=>c.recipeId===rid);if(!changes.length)continue;
      const markers=[...(out.markers||[])],signature=markers.join('|');
      let existing=items.find(x=>x.productId===entry.product.id&&x.signature===signature);
      if(existing){if(statusRank(status)>statusRank(existing.status)){existing.status=status;existing.updatedAt=new Date().toISOString();upgraded++;}continue;}
      const baseName=entry.recipe.name;
      items.push({id:uid(),productId:entry.product.id,productName:entry.product.name,baseRecipeId:rid,baseRecipeName:baseName,name:nextOptimizedName(entry.product.id),markers,signature,changes,status,createdAt:new Date().toISOString(),settings:options()});added++;
    }
    writeSaved(items);toast(`${added} propuesta(s) guardada(s)${upgraded?`, ${upgraded} actualizada(s)`:''}${status==='validated'?' y validadas':''}.`);refreshAll(true);
  }

  function selectedEntriesSmart(){
    const ids=new Set($$('.product-check:checked').map(x=>x.value)),cat=workingCatalog(),selected=[],used=new Set();
    for(const p of cat.products.filter(p=>ids.has(p.id))){let best=null;for(const r of p.recipes){let conflicts=0;for(const t of r.markers)if(used.has(t))conflicts++;if(!best||conflicts<best.conflicts)best={r,conflicts};}selected.push({product:p,recipe:best.r});for(const t of best.r.markers)used.add(t);}return selected;
  }
  function options(){return {maxDelta:Number($('#max-delta').value),changePenalty:Number($('#change-penalty').value),tries:Number($('#tries').value),maxChangesPerRecipe:Number($('#max-changes').value)};}
  function setBusy(on,msg='Calculando…'){$('#busy').hidden=!on;$('#busy-text').textContent=msg;$$('button.action').forEach(b=>b.disabled=on);}

  function renderSolution(res,title){
    lastSolution=res&&res.ok?res:null;const box=$('#solution');
    if(!res||!res.ok){box.innerHTML=`<div class="empty-result"><h3>${esc(title||'Sin solución')}</h3><p>${esc(res?.reason||'No se encontró una solución con esos límites.')}</p>${res?.testedCandidates!=null?`<small>${res.testedCandidates} candidatos evaluados.</small>`:''}</div>`;return;}
    const selected=res.selected||[],grouped=new Map();for(const c of res.changes||[]){if(!grouped.has(c.recipeId))grouped.set(c.recipeId,[]);grouped.get(c.recipeId).push(c);}
    box.innerHTML=`<div class="solution-head"><div><span class="eyebrow">${esc(title)}</span><h2>Estuche propuesto · ${selected.length} diseños · ${res.slots} marcadores únicos</h2></div><div class="score">${fmt(res.utilization*100,1)}%<small>del estuche</small></div></div><div class="solution-stats"><span><b>${res.changeCount}</b> cambios</span><span>ΔE medio <b>${fmt(res.meanChangedDelta,2)}</b></span><span>ΔE máx <b>${fmt(res.maxUsedDelta,2)}</b></span>${res.currentConflicts!=null?`<span><b>${res.currentConflicts}</b> conflictos antes</span>`:''}</div><h3>Diseños / recetas elegidas</h3><div class="chosen">${selected.map(x=>`<button class="case-product product-open" data-product="${esc(x.product.id)}">${esc(x.product.name)} · ${esc(x.recipe.name)}</button>`).join('')}</div><h3>Cambios propuestos</h3>${(res.changes||[]).length?Array.from(grouped.entries()).map(([rid,changes])=>{const first=changes[0];return `<div class="change-group"><div class="change-title"><b>${esc(first.productName)}</b><span>receta ${esc(first.recipeName)} · ${changes.length} cambio${changes.length===1?'':'s'}</span></div>${changes.sort((a,b)=>a.deltaE-b.deltaE).map(c=>`<div class="change-row"><span>${swatch(c.fromHex)}<b>${esc(c.from)}</b></span><span class="arrow">→</span><span>${swatch(c.toHex)}<b>${esc(c.to)}</b></span><span class="delta">ΔE ${fmt(c.deltaE,2)}</span></div>`).join('')}</div>`;}).join(''):'<p class="ok">No necesita cambiar ningún marcador.</p>'}<div class="solution-actions"><button id="export-json" class="secondary">Exportar solución JSON</button>${(res.changes||[]).length?'<button id="save-draft" class="secondary">Guardar como borrador</button><button id="save-validated" class="action compact">Guardar y validar recetas</button>':''}</div>`;
    $('#export-json')?.addEventListener('click',exportSolution);$('#save-draft')?.addEventListener('click',()=>saveSolution('draft'));$('#save-validated')?.addEventListener('click',()=>saveSolution('validated'));bindProductOpeners();
  }

  function exportSolution(){if(!lastSolution)return;const payload={generatedAt:new Date().toISOString(),catalogVersion:baseCatalog.version,settings:options(),solution:{products:lastSolution.selected.map(x=>({productId:x.product.id,productName:x.product.name,recipeId:x.recipe.id,recipeName:x.recipe.name})),changes:lastSolution.changes,outputByRecipe:lastSolution.outputByRecipe}};downloadJson(payload,'pbn-estuche-solucion.json');}
  function downloadJson(payload,name){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}

  $('#btn-current').addEventListener('click',()=>{const exact=currentExact(),slots=exact.reduce((s,x)=>s+x.recipe.markers.length,0);renderSolution({ok:true,selected:exact,slots,utilization:slots/palette.length,changes:[],changeCount:0,totalDelta:0,meanChangedDelta:0,maxUsedDelta:0,outputByRecipe:{}},'Máximo actual sin recolorear');});
  $('#btn-auto').addEventListener('click',()=>{const target=Number($('#target').value),opt=options();setBusy(true,`Buscando estuche de ${target} diseños…`);setTimeout(()=>{try{renderSolution(C.searchOptimizedGroup(workingCatalog(),palette,target,opt),`Búsqueda automática · objetivo ${target}`);}catch(e){renderSolution({ok:false,reason:e.message},'Error');}finally{setBusy(false);}},30);});
  $('#btn-selected').addEventListener('click',()=>{const sel=selectedEntriesSmart();if(sel.length<2){renderSolution({ok:false,reason:'Seleccioná al menos 2 productos.'},'Optimizar selección');return;}setBusy(true,`Recalculando ${sel.length} diseños…`);setTimeout(()=>{try{renderSolution(C.optimizeRecipes(sel,palette,options()),'Selección manual optimizada');}catch(e){renderSolution({ok:false,reason:e.message},'Error');}finally{setBusy(false);}},30);});
  $('#btn-plan').addEventListener('click',()=>{toast('Recalculando la mejor agrupación encontrada…');renderPlan();});
  $('#select-all').addEventListener('click',()=>$$('.product-check').forEach(x=>x.checked=true));$('#select-none').addEventListener('click',()=>$$('.product-check').forEach(x=>x.checked=false));
  $('#mode').addEventListener('change',e=>{const v=e.target.value;if(v==='conservative'){$('#max-delta').value=3;$('#change-penalty').value=15;$('#max-changes').value=4;}if(v==='balanced'){$('#max-delta').value=5;$('#change-penalty').value=8;$('#max-changes').value=8;}if(v==='aggressive'){$('#max-delta').value=9;$('#change-penalty').value=3;$('#max-changes').value=16;}});
  $('#modal-close').addEventListener('click',()=>$('#product-modal').hidden=true);$('#product-modal').addEventListener('click',e=>{if(e.target.id==='product-modal')$('#product-modal').hidden=true;});
  $('#export-saved').addEventListener('click',()=>downloadJson({version:1,exportedAt:new Date().toISOString(),saved:loadSaved()},'pbn-recetas-optimizadas-respaldo.json'));
  $('#import-saved').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result),incoming=Array.isArray(data)?data:data.saved;if(!Array.isArray(incoming))throw new Error('Formato inválido');const map=new Map(loadSaved().map(x=>[x.id,x]));for(const x of incoming)map.set(x.id||uid(),x);writeSaved([...map.values()]);toast('Respaldo importado.');refreshAll(true);}catch(err){toast('No se pudo importar el respaldo.');}};r.readAsText(f);e.target.value='';});

  renderSaved();renderCatalog();renderMarkerGrid();renderPlan();const stats=currentStats();showMarker(stats.ranked[0]?.tag||palette[0]?.tag);renderSolution({ok:false,reason:'Elegí una búsqueda automática, un estuche actual o seleccioná productos para comenzar.'},'Optimizador listo');
})();