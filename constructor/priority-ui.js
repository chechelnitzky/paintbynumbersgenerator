(function(){
'use strict';
const C=window.PBNCloud,$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
if(!C)return;
let busy=false,timer=null;
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));}
async function context(){
  if(!C.admin())return null;
  const runId=$('#run-select')?.value;if(!runId)return null;
  const {data,error}=await C.client.from('pbn_constructor_sessions').select('*').eq('source_run_id',runId).eq('status','draft').order('updated_at',{ascending:false}).limit(1);
  if(error)throw error;const session=data?.[0];if(!session)return null;
  const caseKey=$('.case-tab.active')?.dataset.case;if(!caseKey)return null;
  const cases=[...(session.state?.cases||[]),...(session.state?.variants||[])],caseObj=cases.find(c=>c.id===caseKey);if(!caseObj)return null;
  return{runId,session,caseKey,caseObj};
}
function memberDomKey(item){return String(item.designKey||item.designId||'');}
async function ensurePriorities(ctx){
  const {data,error}=await C.client.from('pbn_constructor_priorities').select('*').eq('constructor_session_id',ctx.session.id).eq('case_key',ctx.caseKey).order('priority');if(error)throw error;
  const rows=data||[],byId=new Map(rows.map(r=>[String(r.design_id),r])),max=rows.reduce((m,r)=>Math.max(m,Number(r.priority||0)),0),missing=[];let next=max;
  for(let i=0;i<(ctx.caseObj.items||[]).length;i++){
    const it=ctx.caseObj.items[i];if(!it.designId||byId.has(String(it.designId)))continue;
    missing.push({constructor_session_id:ctx.session.id,case_key:ctx.caseKey,design_id:it.designId,priority:++next,updated_at:new Date().toISOString()});
  }
  if(missing.length){const {error:e}=await C.client.from('pbn_constructor_priorities').upsert(missing,{onConflict:'constructor_session_id,case_key,design_id'});if(e)throw e;return ensurePriorities(ctx);}
  return rows;
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
    if(bad&&!w){w=document.createElement('div');w.className='recipe-corrupt-warning';w.textContent=`⚠ Receta posiblemente corrupta: sólo ${it.baseMarkers?.length||0} marcador(es). Exclúyela de optimización hasta repararla.`;card.querySelector('.member-markers')?.insertAdjacentElement('beforebegin',w);}else if(!bad&&w)w.remove();
  });
}
function applyOrder(ctx,rows){
  const rowByDesign=new Map(rows.map(r=>[String(r.design_id),Number(r.priority)])),itemsByKey=new Map((ctx.caseObj.items||[]).map(it=>[memberDomKey(it),it])),host=$('#case-members');if(!host)return;
  const cards=$$('#case-members .member-card').map((card,domIndex)=>{const it=itemsByKey.get(String(card.dataset.member||''));return{card,it,priority:it?.designId&&rowByDesign.has(String(it.designId))?rowByDesign.get(String(it.designId)):100000+domIndex};}).sort((a,b)=>a.priority-b.priority);
  cards.forEach(x=>host.appendChild(x.card));
  cards.forEach((x,idx)=>{
    const card=x.card,it=x.it;if(!it)return;
    let wrap=card.querySelector('.member-order-wrap');
    if(!wrap){wrap=document.createElement('div');wrap.className='member-order-wrap';const top=card.querySelector('.member-top');top?.insertBefore(wrap,top.firstChild);}
    wrap.innerHTML=`<span class="member-order-number">${idx+1}</span><span class="member-order-buttons"><button type="button" data-priority-up title="Subir prioridad" ${idx===0?'disabled':''}>↑</button><button type="button" data-priority-down title="Bajar prioridad" ${idx===cards.length-1?'disabled':''}>↓</button></span>`;
    wrap.querySelector('[data-priority-up]')?.addEventListener('click',e=>{e.stopPropagation();swap(ctx,cards,idx,idx-1).catch(console.error)});
    wrap.querySelector('[data-priority-down]')?.addEventListener('click',e=>{e.stopPropagation();swap(ctx,cards,idx,idx+1).catch(console.error)});
  });
}
async function swap(ctx,cards,a,b){
  if(b<0||b>=cards.length)return;const A=cards[a],B=cards[b];if(!A.it?.designId||!B.it?.designId)return;
  const {data,error}=await C.client.from('pbn_constructor_priorities').select('design_id,priority').eq('constructor_session_id',ctx.session.id).eq('case_key',ctx.caseKey).in('design_id',[A.it.designId,B.it.designId]);if(error)throw error;
  const map=new Map((data||[]).map(r=>[String(r.design_id),Number(r.priority)])),pa=map.get(String(A.it.designId))??a+1,pb=map.get(String(B.it.designId))??b+1,now=new Date().toISOString();
  const {error:e}=await C.client.from('pbn_constructor_priorities').upsert([
    {constructor_session_id:ctx.session.id,case_key:ctx.caseKey,design_id:A.it.designId,priority:pb,updated_at:now},
    {constructor_session_id:ctx.session.id,case_key:ctx.caseKey,design_id:B.it.designId,priority:pa,updated_at:now}
  ],{onConflict:'constructor_session_id,case_key,design_id'});if(e)throw e;
  await refresh();
}
async function syncApprovedPositions(ctx,rows){
  const name=ctx.caseObj.name;if(!name)return;
  const {data:cfgs,error}=await C.client.from('pbn_case_configurations').select('id,created_at').eq('constructor_session_id',ctx.session.id).eq('name',name).order('created_at',{ascending:false}).limit(1);if(error)throw error;const cfg=cfgs?.[0];if(!cfg)return;
  const {data:items,error:ie}=await C.client.from('pbn_case_configuration_items').select('id,design_id,position').eq('configuration_id',cfg.id);if(ie)throw ie;
  const priority=new Map(rows.map(r=>[String(r.design_id),Number(r.priority)])),ordered=(items||[]).slice().sort((a,b)=>(priority.get(String(a.design_id))??99999)-(priority.get(String(b.design_id))??99999));
  await Promise.all(ordered.map((it,i)=>C.client.from('pbn_case_configuration_items').update({position:i}).eq('id',it.id)));
}
async function refresh(){
  if(busy)return;busy=true;try{const ctx=await context();if(!ctx)return;const rows=await ensurePriorities(ctx);capacity(ctx);healthDecorate(ctx);applyOrder(ctx,rows);}catch(e){console.warn('Constructor priority UI',e);}finally{busy=false;}
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