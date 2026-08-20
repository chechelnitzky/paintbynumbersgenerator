(function(){
  'use strict';

  const C = window.PBNOptimizerCore;
  const P = window.PBNOptimizerPlanner;
  const baseCatalog = window.PBN_CATALOG;
  const palette = window.PALETTE_ITEMS || [];
  if(!C || !P || !baseCatalog || !palette.length) return;

  const SAVED_KEY = 'pbn_optimizer_saved_recipes_v1';
  const PLAN_KEY = 'pbn_optimizer_manual_plan_v1';
  const SELECTED_CASE_KEY = 'pbn_optimizer_selected_case_v1';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const fmt = (n,d=2) => Number(n||0).toFixed(d).replace('.',',');
  const norm = v => String(v ?? '').trim();
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  let manualPlan = [];
  let selectedCaseKey = null;
  let selectedCandidate = null;
  let autoPreview = null;

  function loadSaved(){
    try{ const x=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]'); return Array.isArray(x)?x:[]; }
    catch{return [];}
  }
  function writeSaved(items){ localStorage.setItem(SAVED_KEY,JSON.stringify(items)); }
  function workingCatalog(){ return P.catalogWithSavedRecipes(baseCatalog,loadSaved()); }
  function paletteByTag(tag){ return palette.find(x=>norm(x.tag)===norm(tag)); }
  function swatch(tag){ const p=paletteByTag(tag); return `<span class="ce-swatch" style="background:${p?.hex||'#ddd'}"></span>`; }
  function markerChip(tag,cls='',title=''){
    return `<span class="ce-marker ${cls}" title="${esc(title)}">${swatch(tag)}<b>${esc(tag)}</b></span>`;
  }
  function productById(id){ return workingCatalog().products.find(p=>p.id===id); }

  function toast(text){
    const old=$('.ce-toast'); if(old) old.remove();
    const d=document.createElement('div'); d.className='ce-toast'; d.textContent=text; document.body.appendChild(d);
    setTimeout(()=>d.remove(),3200);
  }

  function catalogSignature(){
    const cat=workingCatalog();
    return cat.products.map(p=>`${p.id}:${p.recipes.map(r=>`${r.id}[${r.markers.join(',')}]`).join(';')}`).join('|');
  }

  function autoPlanToStored(plan){
    return plan.map((c,i)=>({
      key:`case-${i+1}-${Math.random().toString(36).slice(2,6)}`,
      entries:c.entries.map(x=>({
        productId:x.product.id,
        productName:x.product.name,
        recipeId:x.recipe.id,
        recipeName:x.recipe.name,
        markers:[...(x.recipe.markers||[])],
        source:'auto'
      }))
    }));
  }

  function makeAutoPlan(){
    return autoPlanToStored(P.planCases(workingCatalog(),{tries:320,maxProducts:10}));
  }

  function loadPlan(){
    try{
      const raw=JSON.parse(localStorage.getItem(PLAN_KEY)||'null');
      if(raw && Array.isArray(raw.cases) && raw.cases.length){
        manualPlan=raw.cases;
      } else {
        manualPlan=makeAutoPlan(); savePlan();
      }
    }catch{
      manualPlan=makeAutoPlan(); savePlan();
    }
    selectedCaseKey=localStorage.getItem(SELECTED_CASE_KEY);
    if(!manualPlan.some(c=>c.key===selectedCaseKey)) selectedCaseKey=manualPlan[0]?.key||null;
    if(selectedCaseKey) localStorage.setItem(SELECTED_CASE_KEY,selectedCaseKey);
  }

  function savePlan(){
    localStorage.setItem(PLAN_KEY,JSON.stringify({version:2,catalogSignature:catalogSignature(),updatedAt:new Date().toISOString(),cases:manualPlan}));
  }

  function caseMarkers(caseObj){ return new Set((caseObj?.entries||[]).flatMap(e=>(e.markers||[]).map(norm))); }
  function caseOwners(caseObj){
    const m=new Map();
    for(const e of caseObj?.entries||[]) for(const t of e.markers||[]){
      const k=norm(t); if(!m.has(k))m.set(k,[]); m.get(k).push(e.productName);
    }
    return m;
  }
  function currentCase(){ return manualPlan.find(c=>c.key===selectedCaseKey)||null; }
  function locateProduct(productId){
    for(let ci=0;ci<manualPlan.length;ci++){
      const ei=manualPlan[ci].entries.findIndex(e=>e.productId===productId);
      if(ei>=0) return {ci,ei,caseObj:manualPlan[ci],entry:manualPlan[ci].entries[ei]};
    }
    return null;
  }

  function recipeOptionsForProduct(productId){
    const p=productById(productId); if(!p) return [];
    const out=(p.recipes||[]).map(r=>({id:r.id,name:r.name,markers:[...(r.markers||[])],saved:!!r.saved}));
    const loc=locateProduct(productId);
    if(loc){
      const sig=(loc.entry.markers||[]).join('|');
      if(!out.some(r=>(r.markers||[]).join('|')===sig)) out.unshift({id:loc.entry.recipeId,name:loc.entry.recipeName,markers:[...loc.entry.markers],manual:true});
    }
    return out;
  }

  function conflictInfo(caseObj,markers){
    const used=caseMarkers(caseObj), owners=caseOwners(caseObj), conflicts=[];
    for(const t of markers||[]){
      const k=norm(t); if(used.has(k)) conflicts.push({tag:k,owners:owners.get(k)||[]});
    }
    return conflicts;
  }

  function bestRecipeAgainstCase(productId,caseObj){
    let best=null;
    for(const r of recipeOptionsForProduct(productId)){
      const conflicts=conflictInfo(caseObj,r.markers);
      const item={recipe:r,conflicts,conflictCount:conflicts.length};
      if(!best || item.conflictCount<best.conflictCount || (item.conflictCount===best.conflictCount && r.markers.length<best.recipe.markers.length)) best=item;
    }
    return best;
  }

  function rankedCandidates(caseObj){
    const inCase=new Set((caseObj?.entries||[]).map(e=>e.productId));
    const cat=workingCatalog();
    const arr=[];
    for(const p of cat.products){
      if(inCase.has(p.id)) continue;
      const best=bestRecipeAgainstCase(p.id,caseObj);
      if(!best)continue;
      arr.push({product:p,...best});
    }
    arr.sort((a,b)=>a.conflictCount-b.conflictCount || a.recipe.markers.length-b.recipe.markers.length || a.product.name.localeCompare(b.product.name,'es'));
    return arr;
  }

  function renderMainPlan(){
    const holder=$('#case-plan'); if(!holder)return;
    manualPlan=manualPlan.filter(c=>c.entries.length);
    if(!manualPlan.length){ manualPlan=makeAutoPlan(); savePlan(); }
    if(!manualPlan.some(c=>c.key===selectedCaseKey)) selectedCaseKey=manualPlan[0]?.key||null;

    holder.innerHTML=manualPlan.map((c,i)=>{
      const markers=caseMarkers(c); const active=c.key===selectedCaseKey;
      return `<button type="button" class="case-card ce-case-select ${active?'selected-case':''}" data-case-key="${esc(c.key)}">
        <div class="case-card-head"><div><span class="eyebrow">Estuche ${i+1}</span><h3>${c.entries.length} diseño${c.entries.length===1?'':'s'}</h3></div><div class="case-meta"><b>${markers.size}/167</b> marcadores<br>${fmt(markers.size/167*100,1)}% utilización</div></div>
        <div class="case-products">${c.entries.map(e=>`<span class="case-product">${esc(e.productName)} · ${esc(e.recipeName)}</span>`).join('')}</div>
        <span class="ce-open-hint">Abrir editor →</span>
      </button>`;
    }).join('');

    const total=manualPlan.reduce((s,c)=>s+c.entries.length,0),avg=manualPlan.length?total/manualPlan.length:0;
    const sum=$('#case-plan-summary');
    if(sum)sum.innerHTML=`<div class="bigstat"><b>${manualPlan.length}</b>estuches necesarios</div><div class="bigstat"><b>${total}</b>productos cubiertos</div><div class="bigstat"><b>${fmt(avg,1)}</b>diseños promedio/estuche</div>`;

    const metrics=$$('#summary .metric');
    if(metrics.length){ const last=metrics[metrics.length-1]; const b=last.querySelector('b'); if(b)b.textContent=manualPlan.length; }
    renderCaseEditor();
  }

  function renderCaseEditor(){
    const c=currentCase(),select=$('#case-editor-select');
    if(!c||!select)return;
    select.innerHTML=manualPlan.map((x,i)=>`<option value="${esc(x.key)}" ${x.key===selectedCaseKey?'selected':''}>Estuche ${i+1} · ${x.entries.length} diseños</option>`).join('');

    const markers=caseMarkers(c);
    $('#case-editor-current').innerHTML=`
      <div class="ce-case-summary"><div><span class="eyebrow">Estuche activo</span><h2>${c.entries.length} diseños · ${markers.size}/167 marcadores</h2></div><div class="ce-util">${fmt(markers.size/167*100,1)}%</div></div>
      <div class="ce-members">${c.entries.map(e=>`<div class="ce-member"><div><b>${esc(e.productName)}</b><small>${esc(e.recipeName)} · ${e.markers.length} marcadores</small></div><div class="ce-member-markers">${e.markers.map(t=>markerChip(t)).join('')}</div><button class="ce-remove" data-remove-product="${esc(e.productId)}">Sacar</button></div>`).join('')}</div>`;

    renderCandidateList();
    if(selectedCandidate) {
      const fresh=rankedCandidates(c).find(x=>x.product.id===selectedCandidate.product.id);
      selectedCandidate=fresh||null;
    }
    renderCandidateEditor();
  }

  function conflictClass(n){ return n===0?'zero':n===1?'one':n<=3?'few':n<=6?'many':'heavy'; }

  function renderCandidateList(){
    const c=currentCase(); if(!c)return;
    const arr=rankedCandidates(c),holder=$('#case-candidates');
    $('#candidate-count').textContent=`${arr.length} diseños restantes · ordenados de menor a mayor conflicto`;
    holder.innerHTML=arr.map(x=>{
      const conflictSet=new Set(x.conflicts.map(c=>c.tag));
      return `<button type="button" class="ce-candidate ${selectedCandidate?.product.id===x.product.id?'active':''}" data-candidate="${esc(x.product.id)}">
        <div class="ce-candidate-head"><div><b>${esc(x.product.name)}</b><small>${esc(x.recipe.name)} · ${x.recipe.markers.length} marcadores</small></div><span class="ce-conflict-badge ${conflictClass(x.conflictCount)}">${x.conflictCount} conflicto${x.conflictCount===1?'':'s'}</span></div>
        <div class="ce-mini-markers">${x.recipe.markers.map(t=>markerChip(t,conflictSet.has(norm(t))?'conflict':'',conflictSet.has(norm(t))?'Este marcador ya está usado en el estuche':'' )).join('')}</div>
      </button>`;
    }).join('') || '<p class="note">Todos los diseños ya están dentro de este estuche.</p>';
  }

  function freePaletteForReplacement(caseObj,recipe,conflictTag,alreadyChosen){
    const used=caseMarkers(caseObj);
    const conflictSet=new Set(conflictInfo(caseObj,recipe.markers).map(x=>x.tag));
    const fixed=new Set((recipe.markers||[]).map(norm).filter(t=>!conflictSet.has(t)));
    const src=paletteByTag(conflictTag); const srcLab=src?C.rgbToLab(src.hex):null;
    return palette
      .filter(p=>!used.has(norm(p.tag)) && !fixed.has(norm(p.tag)) && !alreadyChosen.has(norm(p.tag)))
      .map(p=>({tag:norm(p.tag),hex:p.hex,delta:srcLab?C.deltaE00(srcLab,C.rgbToLab(p.hex)):999}))
      .sort((a,b)=>a.delta-b.delta || a.tag.localeCompare(b.tag,undefined,{numeric:true}));
  }

  function buildReplacementState(candidate){
    const c=currentCase(); const state={}; const chosen=new Set();
    for(const conflict of candidate.conflicts){
      const opts=freePaletteForReplacement(c,candidate.recipe,conflict.tag,chosen);
      const best=opts[0]||null;
      state[conflict.tag]=best?.tag||'';
      if(best)chosen.add(best.tag);
    }
    return state;
  }

  function recipeWithReplacements(recipe,replacements){
    return (recipe.markers||[]).map(t=>replacements[norm(t)]||norm(t));
  }

  function replacementRows(candidate,replacements){
    const c=currentCase(); const maxDelta=Number($('#max-delta')?.value||5);
    const already=new Set(Object.values(replacements).filter(Boolean));
    return candidate.conflicts.map(conf=>{
      const current=replacements[conf.tag]||'';
      const otherChosen=new Set(already); otherChosen.delete(current);
      const options=freePaletteForReplacement(c,candidate.recipe,conf.tag,otherChosen);
      if(current && !options.some(o=>o.tag===current)){
        const p=paletteByTag(current),src=paletteByTag(conf.tag);
        if(p&&src)options.unshift({tag:current,hex:p.hex,delta:C.deltaE00(C.rgbToLab(src.hex),C.rgbToLab(p.hex))});
      }
      const cur=options.find(o=>o.tag===current); const over=cur&&cur.delta>maxDelta;
      return `<div class="ce-replace-row">
        <div class="ce-conflict-source">${markerChip(conf.tag,'conflict')}<span>ocupado por <b>${esc(conf.owners.join(', '))}</b></span></div>
        <span class="ce-arrow">→</span>
        <label><select class="ce-replacement" data-from="${esc(conf.tag)}">
          <option value="">Elegir reemplazo…</option>
          ${options.map((o,i)=>`<option value="${esc(o.tag)}" ${o.tag===current?'selected':''}>${esc(o.tag)} · ΔE ${fmt(o.delta,2)}${i===0?' · más cercano':''}</option>`).join('')}
        </select><small class="${over?'ce-over-delta':''}">${cur?`ΔE ${fmt(cur.delta,2)}${over?' · supera el máximo actual':''}`:'Sin reemplazo'}</small></label>
      </div>`;
    }).join('');
  }

  function renderCandidateEditor(){
    const holder=$('#candidate-editor'); if(!holder)return;
    if(autoPreview){ renderAutoPreview(); return; }
    if(!selectedCandidate){ holder.innerHTML='<div class="ce-empty">Seleccioná un diseño de la lista para revisar sus conflictos y reemplazos.</div>'; return; }

    const p=selectedCandidate.product;
    const recipes=recipeOptionsForProduct(p.id);
    const conflictSet=new Set(selectedCandidate.conflicts.map(x=>x.tag));
    if(!selectedCandidate.replacements) selectedCandidate.replacements=buildReplacementState(selectedCandidate);

    holder.innerHTML=`<div class="ce-editor-head"><div><span class="eyebrow">Candidato</span><h2>${esc(p.name)}</h2></div><span class="ce-conflict-badge ${conflictClass(selectedCandidate.conflictCount)}">${selectedCandidate.conflictCount} conflicto${selectedCandidate.conflictCount===1?'':'s'}</span></div>
      ${recipes.length>1?`<label class="ce-field">Receta a usar<select id="candidate-recipe">${recipes.map(r=>`<option value="${esc(r.id)}" ${r.id===selectedCandidate.recipe.id?'selected':''}>${esc(r.name)} · ${r.markers.length} colores</option>`).join('')}</select></label>`:`<p class="note">Receta: <b>${esc(selectedCandidate.recipe.name)}</b></p>`}
      <div class="ce-full-markers">${selectedCandidate.recipe.markers.map(t=>markerChip(t,conflictSet.has(norm(t))?'conflict':'',conflictSet.has(norm(t))?'Repetido dentro del estuche':'' )).join('')}</div>
      ${selectedCandidate.conflictCount===0?`<div class="ce-ok-box"><b>Entra directo.</b> No repite ningún marcador del estuche actual.</div>`:`<h3>Resolver colores repetidos</h3><p class="note">El primer valor de cada lista es el reemplazo libre más cercano por ΔE00. Podés elegir cualquier otro marcador libre.</p><div id="replacement-rows">${replacementRows(selectedCandidate,selectedCandidate.replacements)}</div>`}
      <div id="candidate-validation"></div>
      <div class="ce-editor-actions"><button id="add-candidate-draft" class="secondary">${selectedCandidate.conflictCount?'Agregar al estuche · guardar borrador':'Agregar al estuche'}</button>${selectedCandidate.conflictCount?'<button id="add-candidate-valid" class="action compact">Agregar y validar receta</button>':''}</div>`;
    updateCandidateValidation();
  }

  function updateCandidateValidation(){
    if(!selectedCandidate)return;
    const holder=$('#candidate-validation'); if(!holder)return;
    const replacements=selectedCandidate.replacements||{};
    const finalMarkers=recipeWithReplacements(selectedCandidate.recipe,replacements);
    const c=currentCase(),used=caseMarkers(c),seen=new Set(); let unresolved=0,duplicates=0;
    for(const conf of selectedCandidate.conflicts) if(!replacements[conf.tag])unresolved++;
    for(const t of finalMarkers){ if(used.has(t))duplicates++; if(seen.has(t))duplicates++; seen.add(t); }
    const freeSlots=167-caseMarkers(c).size;
    const slotsOk=finalMarkers.length<=freeSlots;
    const ok=unresolved===0&&duplicates===0&&slotsOk;
    holder.innerHTML=`<div class="ce-validation ${ok?'ok':'bad'}">${ok?`✓ Listo para agregar · ocupará ${finalMarkers.length} marcadores libres`:`${unresolved?`${unresolved} reemplazo(s) sin elegir. `:''}${duplicates?`${duplicates} colisión(es) todavía. `:''}${!slotsOk?'No quedan suficientes marcadores libres.':''}`}</div>`;
    const b1=$('#add-candidate-draft'),b2=$('#add-candidate-valid'); if(b1)b1.disabled=!ok; if(b2)b2.disabled=!ok;
  }

  function saveRecipeProposal(product,baseRecipe,markers,replacements,status){
    const changes=[];
    for(const [from,to] of Object.entries(replacements||{})){
      if(!to||from===to)continue;
      const a=paletteByTag(from),b=paletteByTag(to);
      changes.push({productId:product.id,productName:product.name,recipeId:baseRecipe.id,recipeName:baseRecipe.name,from,to,fromHex:a?.hex||'',toHex:b?.hex||'',deltaE:(a&&b)?C.deltaE00(C.rgbToLab(a.hex),C.rgbToLab(b.hex)):0});
    }
    if(!changes.length)return null;
    const items=loadSaved(),signature=markers.join('|');
    let existing=items.find(x=>x.productId===product.id&&x.signature===signature);
    if(existing){
      if(status==='validated')existing.status='validated';
      existing.updatedAt=new Date().toISOString(); writeSaved(items); return existing;
    }
    const n=items.filter(x=>x.productId===product.id).length+1;
    const rec={id:uid(),productId:product.id,productName:product.name,baseRecipeId:baseRecipe.id,baseRecipeName:baseRecipe.name,name:`Optimizada ${n}`,markers:[...markers],signature,changes,status,createdAt:new Date().toISOString(),settings:{maxDelta:Number($('#max-delta')?.value||5),source:'manual-case-editor'}};
    items.push(rec); writeSaved(items); return rec;
  }

  function moveProductIntoSelected(product,recipe,markers,source,status,replacements){
    const target=currentCase(); if(!target)return;
    const loc=locateProduct(product.id);
    if(loc){
      loc.caseObj.entries.splice(loc.ei,1);
      if(loc.caseObj.entries.length===0 && loc.caseObj.key!==target.key) manualPlan.splice(loc.ci,1);
    }
    let recipeName=recipe.name,recipeId=recipe.id;
    if(replacements && Object.keys(replacements).length){
      const saved=saveRecipeProposal(product,recipe,markers,replacements,status);
      if(saved){recipeName=saved.name;recipeId=`saved:${saved.id}`;}
    }
    target.entries.push({productId:product.id,productName:product.name,recipeId,recipeName,markers:[...markers],source});
    savePlan(); selectedCandidate=null; autoPreview=null; renderMainPlan();
    toast(`${product.name} agregado al estuche${replacements&&Object.keys(replacements).length?` · receta ${status==='validated'?'validada':'guardada como borrador'}`:''}.`);
  }

  function removeProductFromSelected(productId){
    const c=currentCase(); if(!c||c.entries.length<=1){toast('No puedo dejar un estuche vacío. Mové el diseño a otro estuche primero.');return;}
    const idx=c.entries.findIndex(e=>e.productId===productId); if(idx<0)return;
    const [entry]=c.entries.splice(idx,1);
    manualPlan.push({key:`case-manual-${uid()}`,entries:[entry]});
    savePlan(); renderMainPlan(); toast(`${entry.productName} quedó en un estuche propio.`);
  }

  function applySelectedCandidate(status){
    if(!selectedCandidate)return;
    const reps=selectedCandidate.replacements||{};
    const markers=recipeWithReplacements(selectedCandidate.recipe,reps);
    moveProductIntoSelected(selectedCandidate.product,selectedCandidate.recipe,markers,'manual',status,selectedCandidate.conflictCount?reps:null);
  }

  function nearestReplacement(fromTag,used,fixed,chosen,maxDelta){
    const src=paletteByTag(fromTag); if(!src)return null; const lab=C.rgbToLab(src.hex);
    const opts=palette.filter(p=>!used.has(norm(p.tag))&&!fixed.has(norm(p.tag))&&!chosen.has(norm(p.tag)))
      .map(p=>({tag:norm(p.tag),delta:C.deltaE00(lab,C.rgbToLab(p.hex))}))
      .sort((a,b)=>a.delta-b.delta);
    const best=opts[0]||null; if(!best||best.delta>maxDelta)return null; return best;
  }

  function previewFillToTarget(target){
    const base=currentCase(); if(!base)return;
    const maxDelta=Number($('#max-delta')?.value||5);
    const temp={entries:base.entries.map(e=>({...e,markers:[...e.markers]}))};
    const additions=[];
    while(temp.entries.length<target){
      const ranks=rankCandidates(temp); let picked=null;
      for(const cand of ranks){
        const used=caseMarkers(temp),conflicts=conflictInfo(temp,cand.recipe.markers),conflictSet=new Set(conflicts.map(x=>x.tag));
        const fixed=new Set(cand.recipe.markers.map(norm).filter(t=>!conflictSet.has(t))),chosen=new Set(),reps={}; let feasible=true;
        for(const conf of conflicts){
          const best=nearestReplacement(conf.tag,used,fixed,chosen,maxDelta);
          if(!best){feasible=false;break;} reps[conf.tag]=best.tag;chosen.add(best.tag);
        }
        if(!feasible)continue;
        const markers=recipeWithReplacements(cand.recipe,reps);
        if(used.size+markers.length>167)continue;
        picked={cand,reps,markers};break;
      }
      if(!picked)break;
      additions.push(picked);
      temp.entries.push({productId:picked.cand.product.id,productName:picked.cand.product.name,recipeId:picked.cand.recipe.id,recipeName:picked.cand.recipe.name,markers:picked.markers});
    }
    autoPreview={target,baseKey:base.key,additions,finalCount:temp.entries.length}; selectedCandidate=null; renderCandidateEditor();
  }

  function renderAutoPreview(){
    const holder=$('#candidate-editor'); if(!holder||!autoPreview)return;
    const changes=autoPreview.additions.reduce((s,a)=>s+Object.keys(a.reps).length,0);
    holder.innerHTML=`<div class="ce-editor-head"><div><span class="eyebrow">Propuesta automática</span><h2>Completar Estuche hasta ${autoPreview.target}</h2></div><span class="ce-conflict-badge ${autoPreview.finalCount>=autoPreview.target?'zero':'few'}">${autoPreview.finalCount} diseños alcanzados</span></div>
      <p class="note">El algoritmo mantiene intactos los diseños que ya están en el estuche y recolorea solamente los candidatos nuevos cuando hace falta.</p>
      ${autoPreview.additions.length?autoPreview.additions.map((a,i)=>`<div class="ce-auto-add"><div><b>+ ${esc(a.cand.product.name)}</b><small>${esc(a.cand.recipe.name)} · ${Object.keys(a.reps).length} cambio(s)</small></div><div>${Object.entries(a.reps).map(([f,t])=>`${markerChip(f,'conflict')} → ${markerChip(t)}`).join(' ')||'<span class="ce-zero-text">0 conflictos · entra directo</span>'}</div></div>`).join(''):'<div class="ce-empty">No encontré ningún diseño adicional que pueda entrar con el ΔE máximo actual.</div>'}
      <div class="ce-validation ${autoPreview.finalCount>=autoPreview.target?'ok':'bad'}">${autoPreview.finalCount>=autoPreview.target?`✓ Se puede llegar a ${autoPreview.target} diseños con ${changes} cambio(s).`:`Sólo pude llegar a ${autoPreview.finalCount}. Probá aumentar ΔE o agregá candidatos manualmente.`}</div>
      ${autoPreview.additions.length?'<div class="ce-editor-actions"><button id="apply-auto-preview" class="action compact">Aplicar propuesta al estuche</button><button id="cancel-auto-preview" class="secondary">Cancelar</button></div>':''}`;
  }

  function applyAutoPreview(){
    if(!autoPreview)return;
    const targetCase=manualPlan.find(c=>c.key===autoPreview.baseKey); if(!targetCase)return;
    selectedCaseKey=targetCase.key;
    for(const a of autoPreview.additions){
      const loc=locateProduct(a.cand.product.id);
      if(loc){loc.caseObj.entries.splice(loc.ei,1);}
      const saved=Object.keys(a.reps).length?saveRecipeProposal(a.cand.product,a.cand.recipe,a.markers,a.reps,'draft'):null;
      targetCase.entries.push({productId:a.cand.product.id,productName:a.cand.product.name,recipeId:saved?`saved:${saved.id}`:a.cand.recipe.id,recipeName:saved?saved.name:a.cand.recipe.name,markers:[...a.markers],source:'auto-fill'});
    }
    manualPlan=manualPlan.filter(c=>c.entries.length);
    autoPreview=null; savePlan(); renderMainPlan(); toast('Propuesta automática aplicada. Los recoloreos quedaron guardados como borrador.');
  }

  function addAllZeroConflict(){
    const c=currentCase(); if(!c)return; let added=0;
    while(c.entries.length<10){
      const cand=rankedCandidates(c).find(x=>x.conflictCount===0); if(!cand)break;
      const loc=locateProduct(cand.product.id); if(loc)loc.caseObj.entries.splice(loc.ei,1);
      c.entries.push({productId:cand.product.id,productName:cand.product.name,recipeId:cand.recipe.id,recipeName:cand.recipe.name,markers:[...cand.recipe.markers],source:'manual-zero'}); added++;
      manualPlan=manualPlan.filter(x=>x.entries.length);
    }
    savePlan(); renderMainPlan(); toast(added?`${added} diseño(s) compatibles agregados sin recolorear.`:'No quedan diseños con 0 conflictos para este estuche.');
  }

  function resetPlan(){
    manualPlan=makeAutoPlan(); selectedCaseKey=manualPlan[0]?.key||null; selectedCandidate=null;autoPreview=null;savePlan();renderMainPlan();toast('Estuches rearmados desde el plan automático actual.');
  }

  function bindEvents(){
    $('#case-plan')?.addEventListener('click',e=>{
      const card=e.target.closest('.ce-case-select'); if(!card)return;
      selectedCaseKey=card.dataset.caseKey; localStorage.setItem(SELECTED_CASE_KEY,selectedCaseKey); selectedCandidate=null;autoPreview=null; renderMainPlan();
      $('#case-editor-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('#case-editor-select')?.addEventListener('change',e=>{selectedCaseKey=e.target.value;localStorage.setItem(SELECTED_CASE_KEY,selectedCaseKey);selectedCandidate=null;autoPreview=null;renderMainPlan();});
    $('#case-candidates')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-candidate]');if(!b)return; const c=currentCase();
      selectedCandidate=rankedCandidates(c).find(x=>x.product.id===b.dataset.candidate)||null; if(selectedCandidate)selectedCandidate.replacements=buildReplacementState(selectedCandidate);autoPreview=null;renderCaseEditor();
    });
    $('#case-editor-current')?.addEventListener('click',e=>{const b=e.target.closest('[data-remove-product]');if(b)removeProductFromSelected(b.dataset.removeProduct);});
    $('#candidate-editor')?.addEventListener('change',e=>{
      if(e.target.id==='candidate-recipe'&&selectedCandidate){
        const r=recipeOptionsForProduct(selectedCandidate.product.id).find(x=>x.id===e.target.value);if(r){selectedCandidate.recipe=r;selectedCandidate.conflicts=conflictInfo(currentCase(),r.markers);selectedCandidate.conflictCount=selectedCandidate.conflicts.length;selectedCandidate.replacements=buildReplacementState(selectedCandidate);renderCandidateEditor();}
      }
      if(e.target.classList.contains('ce-replacement')&&selectedCandidate){selectedCandidate.replacements[e.target.dataset.from]=e.target.value;renderCandidateEditor();}
    });
    $('#candidate-editor')?.addEventListener('click',e=>{
      if(e.target.id==='add-candidate-draft')applySelectedCandidate('draft');
      if(e.target.id==='add-candidate-valid')applySelectedCandidate('validated');
      if(e.target.id==='apply-auto-preview')applyAutoPreview();
      if(e.target.id==='cancel-auto-preview'){autoPreview=null;renderCandidateEditor();}
    });
    $('#case-add-zero')?.addEventListener('click',addAllZeroConflict);
    $('#case-reset-plan')?.addEventListener('click',resetPlan);
    $('#case-try-max')?.addEventListener('click',()=>previewFillToTarget(10));

    const auto=$('#btn-auto');
    if(auto){
      auto.textContent='Completar estuche seleccionado';
      auto.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();previewFillToTarget(Number($('#target')?.value||10));$('#case-editor-panel')?.scrollIntoView({behavior:'smooth',block:'start'});},true);
    }
    const targetLabel=$('#target')?.closest('.inline')?.querySelector('label'); if(targetLabel)targetLabel.textContent='Tamaño objetivo del estuche';
    const planBtn=$('#btn-plan'); if(planBtn){planBtn.textContent='Rearmar automático';planBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();resetPlan();},true);}
  }

  function init(){
    loadPlan(); bindEvents();
    setTimeout(()=>{renderMainPlan();},40);
  }

  init();
})();
