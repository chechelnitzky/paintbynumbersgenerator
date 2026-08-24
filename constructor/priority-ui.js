(function(){
'use strict';
const C=window.PBNCloud,$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
if(!C)return;
let busy=false,timer=null;
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));}
function memberDomKey(item){return String(item?.designKey||item?.designId||item?.designName||'');}
function priorityKey(item){return item?.designId?`id:${item.designId}`:`key:${item?.designKey||item?.designName||''}`;}
function allStateItems(state){
  const out=[];
  for(const c of state?.cases||[])for(const it of c.items||[])out.push(it);
  for(const v of state?.variants||[])for(const it of v.items||[])out.push(it);
  for(const it of state?.unassigned||[])out.push(it);
  return out;
}
async function context(){
  if(!C.admin())return null;
  const runId=$('#run-select')?.value;if(!runId)return null;
  const {data,error}=await C.client.from('pbn_constructor_sessions').select('*').eq('source_run_id',runId).eq('status','draft').order('updated_at',{ascending:false}).limit(1);
  if(error)throw error;const session=data?.[0];if(!session)return null;
  const caseKey=$('.case-tab.active')?.dataset.case;if(!caseKey)return null;
  const cases=[...(session.state?.cases||[]),...(session.state?.variants||[])],caseObj=cases.find(c=>c.id===caseKey);if(!caseObj)return null;
  return{runId,session,caseKey,caseObj};
}
async function healCorruptSession(ctx){
  const bad=allStateItems(ctx.session.state).filter(it=>!Array.isArray(it.baseMarkers)||it.baseMarkers.length<3);
  if(!bad.length)return false;
  const versionIds=[...new Set(bad.map(it=>it.baseVersionId).filter(Boolean))];
  const byVersion=new Map();
  if(versionIds.length){
    const {data,error}=await C.client.from('pbn_design_versions').select('id,design_id,status,project_bundle,created_at').in('id',versionIds);
    if(error)throw error;
    for(const v of data||[]){const tags=v.project_bundle?.markerTags;if(Array.isArray(tags)&&tags.length>=3)byVersion.set(String(v.id),tags.map(String));}
  }
  const unresolved=bad.filter(it=>!byVersion.has(String(it.baseVersionId||''))&&it.designId);
  if(unresolved.length){
    const designIds=[...new Set(unresolved.map(it=>it.designId))];
    const {data,error}=await C.client.from('pbn_design_versions').select('id,design_id,status,project_bundle,created_at').in('design_id',designIds).in('status',['approved','validated','applied']).order('created_at',{ascending:false});
    if(error)throw error;
    const byDesign=new Map();
    for(const v of data||[]){const tags=v.project_bundle?.markerTags;if(!byDesign.has(String(v.design_id))&&Array.isArray(tags)&&tags.length>=3)byDesign.set(String(v.design_id),{id:v.id,tags:tags.map(String)});}
    for(const it of unresolved){const hit=byDesign.get(String(it.designId));if(hit){byVersion.set(String(it.baseVersionId||hit.id),hit.tags);if(!it.baseVersionId)it.baseVersionId=hit.id;}}
  }
  let changed=false;
  for(const it of bad){const tags=byVersion.get(String(it.baseVersionId||''));if(!tags||tags.length<3)continue;it.baseMarkers=[...tags];it.proposedMarkers=[...tags];it.changes=[];it.recipeLocked=false;it.lockedMarkers=null;it.previewStatus='approved';it.recipeHealedAt=new Date().toISOString();changed=true;}
  if(!changed)return false;
  const {error}=await C.client.from('pbn_constructor_sessions').update({state:ctx.session.state,updated_at:new Date().toISOString()}).eq('id',ctx.session.id);if(error)throw error;
  return true;
}
async function ensurePriorities(ctx){
  const {data,error}=await C.client.from('pbn_constructor_priorities').select('*').eq('constructor_session_id',ctx.session.id).eq('case_key',ctx.caseKey).order('priority');if(error)throw error;
  const rows=data||[],byKey=new Map(rows.map(r=>[String(r.item_key||''),r])),missing=[];let next=rows.reduce((m,r)=>Math.max(m,Number(r.priority||0)),0);
  for(const it of ctx.caseObj.items||[]){const key=priorityKey(it);if(!key||byKey.has(key))continue;missing.push({constructor_session_id:ctx.session.id,case_key:ctx.caseKey,design_id:it.designId||null,item_key:key,priority:++next,updated_at:new Date().toISOString()});}
  if(missing.length){const {error:e}=await C.client.from('pbn_constructor_priorities').upsert(missing,{onConflict:'constructor_session_id,case_key,item_key'});if(e)throw e;return ensurePriorities(ctx);}
  return rows.filter(r=>(ctx.caseObj.items||[]).some(it=>priorityKey(it)===String(r.item_key||'')));
}
function capacity(ctx){
  const n=(ctx.caseObj.items||[]).length,free=Math.max(0,10-n);let host=$('#candidate-capacity');
  if(!host){host=document.createElement('div');host.id='candidate-capacity';const list=$('#candidate-list');list?.parentElement?.insertBefore(host,list);}
  if(!host)return;
  host.className=`capacity-banner ${free===0?'full':''}`;
  host.innerHTML=`<span class="capacity-main">${n}/10 diseños en este estuche</span><span class="capacity-free">${free===0?'Estuche completo':free===1?'Falta 1 cupo · sólo cabe 1 diseño más':`Faltan ${free} cupos · sólo caben ${free} diseños más`}</span>`;
  $$('.candidate-card').forEach(card=>card.classList.toggle('capacity-disabled',free===0));
}
function healthDecorate(ctx){
  const byKey=new Map((ctx.caseObj.items||[]).map(it=>[memberDomKey(it),it]));
  $$('#case-members .member-card').forEach(card=>{
    const it=byKey.get(String(card.dataset.member||''));if(!it)return;
    const bad=!Array.isArray(it.baseMarkers)||it.baseMarkers.length<3;
    card.classList.toggle('recipe-corrupt',bad);
    let w=card.querySelector('.recipe-corrupt-warning');
    if(bad&&!w){w=document.createElement('div');w.className='recipe-corrupt-warning';w.textContent=`⚠ Receta inválida: sólo ${it.baseMarkers?.length||0} marcador(es). El Constructor intentará recuperar automáticamente la receta aprobada vigente.`;card.querySelector('.member-markers')?.insertAdjacentElement('beforebegin',w);}else if(!bad&&w)w.remove();
  });
}
function makeIdentity(card,idx,total){
  const top=card.querySelector('.member-top'),title=card.querySelector('.member-title');if(!top||!title)return null;
  let identity=top.querySelector('.member-identity');
  if(!identity){identity=document.createElement('div');identity.className='member-identity';top.insertBefore(identity,top.firstChild);identity.appendChild(title);}
  let wrap=identity.querySelector('.member-order-wrap');
  if(!wrap){wrap=document.createElement('div');wrap.className='member-order-wrap';identity.insertBefore(wrap,identity.firstChild);}
  wrap.innerHTML=`<span class="member-order-number">${idx+1}</span><span class="member-order-buttons"><button type="button" data-priority-up title="Subir un puesto" ${idx===0?'disabled':''}>↑</button><button type="button" data-priority-down title="Bajar un puesto" ${idx===total-1?'disabled':''}>↓</button></span>`;
  return wrap;
}
function applyOrder(ctx,rows){
  const rowByKey=new Map(rows.map(r=>[String(r.item_key||''),Number(r.priority)])),itemsByDom=new Map((ctx.caseObj.items||[]).map(it=>[memberDomKey(it),it])),host=$('#case-members');if(!host)return;
  const cards=$$('#case-members .member-card').map((card,domIndex)=>{const it=itemsByDom.get(String(card.dataset.member||''));return{card,it,priority:it&&rowByKey.has(priorityKey(it))?rowByKey.get(priorityKey(it)):100000+domIndex};}).sort((a,b)=>a.priority-b.priority);
  cards.forEach(x=>host.appendChild(x.card));
  cards.forEach((x,idx)=>{if(!x.it)return;const wrap=makeIdentity(x.card,idx,cards.length);wrap?.querySelector('[data-priority-up]')?.addEventListener('click',e=>{e.stopPropagation();swap(ctx,cards,idx,idx-1).catch(console.error)});wrap?.querySelector('[data-priority-down]')?.addEventListener('click',e=>{e.stopPropagation();swap(ctx,cards,idx,idx+1).catch(console.error)});});
}
async function swap(ctx,cards,a,b){
  if(b<0||b>=cards.length)return;const A=cards[a],B=cards[b];if(!A.it||!B.it)return;
  const ka=priorityKey(A.it),kb=priorityKey(B.it);if(!ka||!kb)return;
  const {data,error}=await C.client.from('pbn_constructor_priorities').select('item_key,priority').eq('constructor_session_id',ctx.session.id).eq('case_key',ctx.caseKey).in('item_key',[ka,kb]);if(error)throw error;
  const map=new Map((data||[]).map(r=>[String(r.item_key),Number(r.priority)])),pa=map.get(ka)??a+1,pb=map.get(kb)??b+1,now=new Date().toISOString();
  const {error:e}=await C.client.from('pbn_constructor_priorities').upsert([
    {constructor_session_id:ctx.session.id,case_key:ctx.caseKey,design_id:A.it.designId||null,item_key:ka,priority:pb,updated_at:now},
    {constructor_session_id:ctx.session.id,case_key:ctx.caseKey,design_id:B.it.designId||null,item_key:kb,priority:pa,updated_at:now}
  ],{onConflict:'constructor_session_id,case_key,item_key'});if(e)throw e;
  await refresh();
}
async function syncApprovedPositions(ctx,rows){
  const name=ctx.caseObj.name;if(!name)return;
  const {data:cfgs,error}=await C.client.from('pbn_case_configurations').select('id,created_at').eq('constructor_session_id',ctx.session.id).eq('name',name).order('created_at',{ascending:false}).limit(1);if(error)throw error;const cfg=cfgs?.[0];if(!cfg)return;
  const {data:items,error:ie}=await C.client.from('pbn_case_configuration_items').select('id,design_id,position,metadata').eq('configuration_id',cfg.id);if(ie)throw ie;
  const priority=new Map(rows.map(r=>[String(r.item_key||''),Number(r.priority)]));
  const keyForApproved=it=>it.design_id?`id:${it.design_id}`:`key:${it.metadata?.designKey||it.metadata?.designName||''}`;
  const ordered=(items||[]).slice().sort((a,b)=>(priority.get(keyForApproved(a))??99999)-(priority.get(keyForApproved(b))??99999));
  await Promise.all(ordered.map((it,i)=>C.client.from('pbn_case_configuration_items').update({position:i}).eq('id',it.id)));
}
async function refresh(){
  if(busy)return;busy=true;
  try{
    const ctx=await context();if(!ctx)return;
    const healed=await healCorruptSession(ctx);
    if(healed){const u=new URL(location.href);u.searchParams.set('run',ctx.runId);const m=String(ctx.caseKey).match(/^case-(\d+)$/);if(m)u.searchParams.set('case',m[1]);history.replaceState(null,'',u);location.reload();return;}
    const rows=await ensurePriorities(ctx);capacity(ctx);healthDecorate(ctx);applyOrder(ctx,rows);
  }catch(e){console.warn('Constructor priority UI',e);}finally{busy=false;}
}
function schedule(ms=180){clearTimeout(timer);timer=setTimeout(refresh,ms);}
new MutationObserver(()=>schedule()).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{
  if(e.target.closest?.('#approve-config'))setTimeout(async()=>{try{const ctx=await context();if(!ctx)return;const rows=await ensurePriorities(ctx);await syncApprovedPositions(ctx,rows);}catch(err){console.warn(err)}},1200);
  if(e.target.closest?.('[data-case],#load-run,[data-add],[data-remove]'))schedule(350);
},true);
C.onSession((s,a)=>{if(s&&a)schedule(350)});
setTimeout(()=>schedule(0),600);
})();