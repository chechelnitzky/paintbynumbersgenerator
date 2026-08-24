(function(){
'use strict';
const C=window.PBNCloud,O=window.PBNOptimizerCore,palette=window.PALETTE_ITEMS||[];
if(!C||!O)return;
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const hexBy=Object.fromEntries(palette.map(p=>[String(p.tag),String(p.hex).toLowerCase()]));
const tagByHex=Object.fromEntries(palette.map(p=>[String(p.hex).toLowerCase(),String(p.tag)]));
const labBy={};
for(const p of palette){try{labBy[String(p.tag)]=O.rgbToLab(O.hexToRgb(String(p.hex)));}catch(_){}}
let timer=null,lastPreviewKey=null,previewCtx=null,renderToken=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
const itemKey=it=>String(it?.designKey||it?.designId||it?.designName||'');
const currentMarkers=it=>(Array.isArray(it?.proposedMarkers)&&it.proposedMarkers.length?it.proposedMarkers:it?.baseMarkers||[]).map(String);
function swatch(tag,cls=''){return`<span class="cpe-swatch ${cls}" style="background:${hexBy[String(tag)]||'#ddd'}"></span>`;}
function de(from,to){const a=labBy[String(from)],b=labBy[String(to)];return a&&b?O.deltaE00(a,b):999;}
function toast(t){const d=document.createElement('div');d.className='ce-toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),3000);}
async function context(){
  if(!C.admin())return null;
  const runId=$('#run-select')?.value;if(!runId)return null;
  const {data,error}=await C.client.from('pbn_constructor_sessions').select('*').eq('source_run_id',runId).eq('status','draft').order('updated_at',{ascending:false}).limit(1);
  if(error)throw error;const session=data?.[0];if(!session)return null;
  const caseKey=$('.case-tab.active')?.dataset.case;if(!caseKey)return null;
  const cases=[...(session.state?.cases||[]),...(session.state?.variants||[])];
  const caseObj=cases.find(c=>c.id===caseKey);if(!caseObj)return null;
  return{runId,session,caseKey,caseObj};
}
function conflictData(caseObj){
  const uses=new Map();
  (caseObj.items||[]).forEach((it,itemIndex)=>{
    currentMarkers(it).forEach((tag,markerIndex)=>{
      if(!uses.has(tag))uses.set(tag,[]);
      uses.get(tag).push({it,itemIndex,markerIndex,key:itemKey(it)});
    });
  });
  const conflicting=new Map([...uses].filter(([,arr])=>arr.length>1));
  const collisions=[...conflicting.values()].reduce((s,a)=>s+a.length-1,0);
  return{uses,conflicting,conflictColors:conflicting.size,collisions};
}
function conflictDescription(entry,all){
  const others=all.filter(x=>x!==entry);
  const names=[...new Set(others.map(x=>x.key===entry.key?'este mismo diseño':x.it.designName))];
  return names.join(', ');
}
function ensureConflictSummary(){
  let el=$('#case-conflict-summary');
  if(!el){el=document.createElement('div');el.id='case-conflict-summary';const host=$('#case-members');host?.parentElement?.insertBefore(el,host);}
  return el;
}
function decorateConflicts(ctx){
  const data=conflictData(ctx.caseObj),summary=ensureConflictSummary();
  if(summary){
    summary.className=`case-conflict-summary ${data.conflictColors?'has-conflicts':'clean'}`;
    summary.innerHTML=data.conflictColors
      ?`<div><b>⚠ ${data.conflictColors} marcador${data.conflictColors===1?'':'es'} en conflicto antes de renegociar</b><span>${data.collisions} colisión${data.collisions===1?'':'es'} total${data.collisions===1?'':'es'}. Abajo se marca exactamente dónde están.</span></div><div class="cpe-summary-tags">${[...data.conflicting.keys()].map(t=>`${swatch(t)}<b>${esc(t)}</b>`).join('')}</div>`
      :`<div><b>✓ Sin conflictos actuales</b><span>Las recetas visibles en este estuche no repiten marcadores.</span></div>`;
  }
  const byDom=new Map((ctx.caseObj.items||[]).map(it=>[itemKey(it),it]));
  $$('#case-members .member-card').forEach(card=>{
    const it=byDom.get(String(card.dataset.member||''));if(!it)return;
    const markers=currentMarkers(it),chips=Array.from(card.querySelectorAll('.member-markers .marker-chip'));
    chips.forEach((chip,i)=>{const tag=markers[i],arr=data.conflicting.get(String(tag));chip.classList.toggle('marker-conflict',!!arr);if(arr){const e=arr.find(x=>x.key===itemKey(it)&&x.markerIndex===i)||arr.find(x=>x.key===itemKey(it));chip.title=`Conflicto ${tag}: también usado por ${e?conflictDescription(e,arr):'otro diseño'}`;}else chip.removeAttribute('title');});
    let box=card.querySelector('.member-conflict-detail');
    const rows=[];
    markers.forEach((tag,i)=>{const arr=data.conflicting.get(String(tag));if(!arr)return;const e=arr.find(x=>x.key===itemKey(it)&&x.markerIndex===i)||arr.find(x=>x.key===itemKey(it));rows.push({tag,with:e?conflictDescription(e,arr):'otro diseño'});});
    if(rows.length){
      if(!box){box=document.createElement('div');box.className='member-conflict-detail';card.querySelector('.member-markers')?.insertAdjacentElement('afterend',box);}
      box.innerHTML=`<b>${rows.length} conflicto${rows.length===1?'':'s'} en este diseño:</b> ${rows.map(r=>`<span>${swatch(r.tag)}<strong>${esc(r.tag)}</strong> con ${esc(r.with)}</span>`).join('')}`;
    }else if(box)box.remove();
  });
}
async function refreshConflicts(){try{const ctx=await context();if(ctx)decorateConflicts(ctx);}catch(e){console.warn('Conflict map',e);}}
function schedule(ms=160){clearTimeout(timer);timer=setTimeout(refreshConflicts,ms);}
function rgb(h){h=String(h||'').replace('#','');return h.length===6?[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]:null;}
function sourceForPreview(){
  const pane=$('#preview-original');if(!pane)return null;
  const svg=pane.querySelector('svg');if(svg)return{type:'svg',value:new XMLSerializer().serializeToString(svg)};
  const img=pane.querySelector('img');if(img)return{type:'raster',value:img.currentSrc||img.src};
  const canvas=pane.querySelector('canvas');if(canvas)return{type:'raster',value:canvas.toDataURL('image/png')};
  return null;
}
function recolorSvgText(svgText,item,targets){
  const subs={};item.baseMarkers.forEach((t,i)=>{const to=targets[i]||t;if(String(to)!==String(t))subs[String(t)]=String(to);});
  const doc=new DOMParser().parseFromString(svgText,'image/svg+xml'),svg=doc.documentElement;
  for(const el of svg.querySelectorAll('*'))for(const a of['fill','stroke']){const raw=(el.getAttribute(a)||'').toLowerCase(),tag=tagByHex[raw];if(tag&&subs[tag])el.setAttribute(a,hexBy[subs[tag]]);}
  svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  return new XMLSerializer().serializeToString(svg);
}
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
async function recolorRaster(src,item,targets,token){
  const img=await loadImg(src);if(token!==renderToken)return null;
  const scale=Math.min(1,1700/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height),maps=[];
  item.baseMarkers.forEach((t,i)=>{const to=targets[i]||t,a=rgb(hexBy[t]),b=rgb(hexBy[to]);if(String(to)!==String(t)&&a&&b)maps.push({a,b});});
  for(let p=0;p<d.data.length;p+=4){let best=null,bd=1e9;for(const m of maps){const q=(d.data[p]-m.a[0])**2+(d.data[p+1]-m.a[1])**2+(d.data[p+2]-m.a[2])**2;if(q<bd){bd=q;best=m;}}if(best&&bd<=18*18){d.data[p]=best.b[0];d.data[p+1]=best.b[1];d.data[p+2]=best.b[2];}}
  x.putImageData(d,0,0);return c.toDataURL('image/png');
}
function conflictOwnersForTarget(ctx,item,target,index,manual){
  const ownKey=itemKey(item),names=[];
  for(const other of ctx.caseObj.items||[]){
    const ok=itemKey(other),markers=ok===ownKey?(manual||currentMarkers(other)):currentMarkers(other);
    markers.forEach((t,i)=>{if(String(t)!==String(target))return;if(ok!==ownKey||i!==index)names.push(ok===ownKey?'este mismo diseño':other.designName);});
  }
  return[...new Set(names)];
}
function optionHtml(from,current){
  const choices=palette.map(p=>({tag:String(p.tag),d:de(from,p.tag)})).sort((a,b)=>a.d-b.d||a.tag.localeCompare(b.tag,undefined,{numeric:true}));
  return choices.map(o=>`<option value="${esc(o.tag)}" ${String(o.tag)===String(current)?'selected':''}>${esc(o.tag)}${o.d<999?` · ΔE ${o.d.toFixed(2)}`:''}</option>`).join('');
}
function updateEditorRows(){
  if(!previewCtx)return;let conflicts=0,changes=0;
  $$('.cpe-marker-row').forEach((row,i)=>{
    const from=String(previewCtx.item.baseMarkers[i]),to=String(previewCtx.manual[i]||from),owners=conflictOwnersForTarget(previewCtx.ctx,previewCtx.item,to,i,previewCtx.manual);
    row.classList.toggle('changed',to!==from);row.classList.toggle('conflict',owners.length>0);
    row.querySelector('.cpe-dest-swatch').style.background=hexBy[to]||'#ddd';
    const meta=row.querySelector('.cpe-row-meta');meta.textContent=owners.length?`⚠ en conflicto con ${owners.join(', ')}`:(to!==from?`ΔE ${de(from,to).toFixed(2)}`:'mantener original');
    if(to!==from)changes++;if(owners.length)conflicts++;
  });
  const st=$('#cpe-editor-status');if(st)st.innerHTML=`<b>${changes} cambio${changes===1?'':'s'}</b> · ${conflicts?`<span class="bad">${conflicts} selección${conflicts===1?'':'es'} en conflicto</span>`:'<span class="good">sin conflictos para este diseño</span>'}`;
}
async function renderManualPreview(){
  if(!previewCtx)return;const pane=$('#preview-proposed'),source=previewCtx.source;if(!pane||!source)return;const token=++renderToken;
  pane.classList.add('cpe-rendering');
  try{
    if(source.type==='svg'){pane.innerHTML=recolorSvgText(source.value,previewCtx.item,previewCtx.manual);}
    else{const url=await recolorRaster(source.value,previewCtx.item,previewCtx.manual,token);if(url&&token===renderToken)pane.innerHTML=`<img src="${url}" alt="Propuesta editada">`;}
  }catch(e){console.warn(e);}finally{if(token===renderToken)pane.classList.remove('cpe-rendering');}
}
function buildPreviewEditor(){
  if(!previewCtx)return;let panel=$('#cpe-preview-editor');
  if(!panel){panel=document.createElement('section');panel.id='cpe-preview-editor';panel.className='cpe-preview-editor';const compare=$('.preview-card .compare');compare?.insertAdjacentElement('beforebegin',panel);}
  const item=previewCtx.item;
  panel.innerHTML=`<div class="cpe-editor-head"><div><b>Editar colores de esta propuesta</b><span>Podés reemplazar cualquier marcador antes de aprobar. Las opciones están ordenadas por cercanía ΔE al color original.</span></div><div id="cpe-editor-status"></div><button type="button" id="cpe-reset-auto" class="secondary">Restaurar propuesta</button><button type="button" id="cpe-reset-original" class="secondary">Todo original</button></div><div class="cpe-marker-grid">${item.baseMarkers.map((from,i)=>{const to=previewCtx.manual[i]||from;return`<label class="cpe-marker-row"><span class="cpe-source">${swatch(from)}<b>${esc(from)}</b></span><span class="cpe-arrow">→</span><select data-cpe-index="${i}">${optionHtml(from,to)}</select><span class="cpe-swatch cpe-dest-swatch" style="background:${hexBy[to]||'#ddd'}"></span><small class="cpe-row-meta"></small></label>`;}).join('')}</div>`;
  $$('[data-cpe-index]').forEach(sel=>sel.onchange=()=>{previewCtx.manual[+sel.dataset.cpeIndex]=sel.value;updateEditorRows();clearTimeout(previewCtx.renderTimer);previewCtx.renderTimer=setTimeout(renderManualPreview,70);});
  $('#cpe-reset-auto').onclick=()=>{previewCtx.manual=[...previewCtx.initial];buildPreviewEditor();renderManualPreview();};
  $('#cpe-reset-original').onclick=()=>{previewCtx.manual=[...item.baseMarkers];buildPreviewEditor();renderManualPreview();};
  updateEditorRows();
}
async function initPreviewEditor(){
  const modal=$('#preview-modal');if(!modal||modal.hidden)return;
  const ctx=await context();if(!ctx)return;
  let item=(ctx.caseObj.items||[]).find(it=>itemKey(it)===String(lastPreviewKey||''));
  if(!item){const title=$('#preview-title')?.textContent?.trim();item=(ctx.caseObj.items||[]).find(it=>String(it.designName).trim()===title);}
  if(!item)return;
  const source=sourceForPreview();if(!source){setTimeout(initPreviewEditor,200);return;}
  previewCtx={ctx,item,manual:[...currentMarkers(item)],initial:[...currentMarkers(item)],source,renderTimer:null};
  buildPreviewEditor();
}
async function approveManualPreview(ev){
  if(!previewCtx)return;ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
  try{
    const fresh=await context();if(!fresh)throw new Error('No se encontró el borrador activo.');
    const target=(fresh.caseObj.items||[]).find(it=>itemKey(it)===itemKey(previewCtx.item));if(!target)throw new Error('No se encontró el diseño en el estuche activo.');
    target.proposedMarkers=[...previewCtx.manual];
    target.changes=target.baseMarkers.map((from,i)=>{const to=target.proposedMarkers[i]||from;return String(from)===String(to)?null:{from:String(from),to:String(to),deltaE:de(from,to),manual:true};}).filter(Boolean);
    target.previewStatus='approved';target.manualEditedAt=new Date().toISOString();
    const {error}=await C.client.from('pbn_constructor_sessions').update({state:fresh.session.state,updated_at:new Date().toISOString()}).eq('id',fresh.session.id);if(error)throw error;
    $('#preview-modal').hidden=true;previewCtx=null;toast('✓ Propuesta manual aprobada y guardada.');
    const u=new URL(location.href);u.searchParams.set('run',fresh.runId);const m=String(fresh.caseKey).match(/^case-(\d+)$/);if(m)u.searchParams.set('case',m[1]);history.replaceState(null,'',u);
    setTimeout(()=>$('#load-run')?.click(),80);
  }catch(e){alert(e.message);}
}
document.addEventListener('click',e=>{
  const p=e.target.closest?.('[data-preview]');if(p){lastPreviewKey=p.closest('.member-card')?.dataset.member||null;setTimeout(()=>initPreviewEditor().catch(console.warn),220);}
  if(e.target.closest?.('#preview-approve')&&previewCtx)approveManualPreview(e);
  if(e.target.closest?.('#preview-close,#preview-reject')){setTimeout(()=>{previewCtx=null;$('#cpe-preview-editor')?.remove();},80);}
  if(e.target.closest?.('[data-add],[data-remove],#load-run,#renegotiate,[data-case]'))schedule(350);
},true);
const modal=$('#preview-modal');if(modal)new MutationObserver(()=>{if(!modal.hidden)setTimeout(()=>initPreviewEditor().catch(console.warn),160);else{$('#cpe-preview-editor')?.remove();previewCtx=null;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
new MutationObserver(ms=>{
  const relevant=ms.some(m=>{
    const el=m.target?.nodeType===1?m.target:m.target?.parentElement;
    if(!el)return false;
    if(el.closest?.('#case-conflict-summary,.member-conflict-detail,#cpe-preview-editor,#preview-proposed'))return false;
    return !!el.closest?.('#case-members,#constructor-workspace,.case-tabs,#candidate-list');
  });
  if(relevant)schedule();
}).observe(document.documentElement,{childList:true,subtree:true});
C.onSession((s,a)=>{if(s&&a)schedule(350);});
setTimeout(()=>schedule(0),650);
})();