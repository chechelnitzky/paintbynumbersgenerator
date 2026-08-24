(function(){
'use strict';
const palette=window.PALETTE_ITEMS||[],$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const hexBy=Object.fromEntries(palette.map(p=>[String(p.tag),String(p.hex)]));
let menu=null,active=null,observerTimer=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
function close(){if(menu){menu.remove();menu=null;}if(active){active.classList.remove('open');active=null;}}
function chipTag(chip){const bs=chip.querySelectorAll('b');return bs.length?String(bs[bs.length-1].textContent).trim():'';}
function currentPreviewName(){return String($('#preview-title')?.textContent||'').trim();}
function usageMap(){
  const uses=new Map(),previewName=currentPreviewName();
  const add=(tag,name,row)=>{tag=String(tag||'').trim();if(!tag)return;if(!uses.has(tag))uses.set(tag,[]);uses.get(tag).push({name,row});};
  $$('#case-members .member-card').forEach(card=>{
    const name=String(card.querySelector('.member-title h3')?.textContent||'').trim();
    if(name&&name===previewName)return;
    card.querySelectorAll('.member-markers .marker-chip').forEach(ch=>add(chipTag(ch),name||'otro diseño',null));
  });
  $$('#cpe-preview-editor select[data-cpe-index]').forEach(sel=>add(sel.value,previewName||'este mismo diseño',Number(sel.dataset.cpeIndex)));
  return uses;
}
function ownersFor(tag,rowIndex){
  const previewName=currentPreviewName(),arr=usageMap().get(String(tag))||[],names=[];
  for(const u of arr){
    if(u.row===rowIndex&&u.name===previewName)continue;
    names.push(u.name===previewName?'este mismo diseño':u.name);
  }
  return [...new Set(names)];
}
function updateTrigger(wrap){
  const sel=wrap.querySelector('select'),btn=wrap.querySelector('.cdd-trigger');if(!sel||!btn)return;
  const tag=String(sel.value),owners=ownersFor(tag,Number(sel.dataset.cpeIndex));
  btn.classList.toggle('conflict',owners.length>0);
  btn.innerHTML=`<span class="cdd-swatch" style="background:${hexBy[tag]||'#ddd'}"></span><b>${esc(tag)}</b><span class="cdd-chevron">▾</span>`;
  btn.title=owners.length?`Conflicto con ${owners.join(', ')}.`:'Sin conflicto';
}
function refreshAll(){ $$('.cdd-wrap').forEach(updateTrigger); if(menu&&active)renderOptions(active,''); }
function renderOptions(wrap,filter){
  if(!menu)return;const sel=wrap.querySelector('select'),rowIndex=Number(sel.dataset.cpeIndex),q=String(filter||'').trim().toLowerCase();
  const opts=Array.from(sel.options).filter(o=>!q||String(o.value).toLowerCase().includes(q)||String(o.textContent).toLowerCase().includes(q));
  const list=menu.querySelector('.cdd-list');
  list.innerHTML=opts.map(o=>{
    const tag=String(o.value),owners=ownersFor(tag,rowIndex),conf=owners.length>0,selected=tag===String(sel.value);
    return `<button type="button" class="cdd-option ${conf?'conflict':''} ${selected?'selected':''}" data-cdd-value="${esc(tag)}"><span class="cdd-swatch" style="background:${hexBy[tag]||'#ddd'}"></span><span class="cdd-option-main"><b>${esc(tag)}</b><small>${esc(String(o.textContent).replace(/^\s*[^·]+\s*·?\s*/,''))}</small></span>${conf?`<span class="cdd-conflict">⚠ conflicto con ${esc(owners.join(', '))}</span>`:'<span class="cdd-free">disponible</span>'}</button>`;
  }).join('')||'<div class="cdd-empty">No hay coincidencias.</div>';
  list.querySelectorAll('[data-cdd-value]').forEach(b=>b.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    sel.value=b.dataset.cddValue;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    updateTrigger(wrap);
    close();
    setTimeout(refreshAll,100);
  });
}
function positionMenu(wrap){
  if(!menu)return;const r=wrap.getBoundingClientRect(),w=Math.max(330,r.width);let top=r.bottom+5,left=r.left;
  if(left+w>window.innerWidth-10)left=Math.max(10,window.innerWidth-w-10);
  menu.style.width=`${Math.min(w,window.innerWidth-20)}px`;
  menu.style.left=`${left}px`;
  menu.style.top=`${top}px`;
  const maxBelow=window.innerHeight-top-10;
  if(maxBelow<260&&r.top>300){menu.classList.add('above');menu.style.top='auto';menu.style.bottom=`${window.innerHeight-r.top+5}px`;menu.style.maxHeight=`${Math.min(430,r.top-15)}px`;}else{menu.classList.remove('above');menu.style.bottom='auto';menu.style.maxHeight=`${Math.min(430,Math.max(220,maxBelow))}px`;}
}
function open(wrap){
  if(active===wrap){close();return;}close();active=wrap;wrap.classList.add('open');
  menu=document.createElement('div');menu.className='cdd-menu';
  menu.innerHTML='<div class="cdd-search-wrap"><span>⌕</span><input class="cdd-search" placeholder="Buscar marcador…" autocomplete="off"></div><div class="cdd-hint">Los rojos están ocupados, pero igual podés seleccionarlos.</div><div class="cdd-list"></div>';
  document.body.appendChild(menu);positionMenu(wrap);renderOptions(wrap,'');
  const input=menu.querySelector('.cdd-search');input.oninput=()=>renderOptions(wrap,input.value);setTimeout(()=>input.focus(),0);
}
function enhance(sel){
  if(sel.dataset.cddEnhanced==='1')return;sel.dataset.cddEnhanced='1';sel.classList.add('cdd-native');
  const wrap=document.createElement('div');wrap.className='cdd-wrap';sel.parentNode.insertBefore(wrap,sel);wrap.appendChild(sel);
  const btn=document.createElement('button');btn.type='button';btn.className='cdd-trigger';wrap.appendChild(btn);btn.onclick=e=>{e.preventDefault();e.stopPropagation();open(wrap);};
  sel.addEventListener('change',()=>{updateTrigger(wrap);setTimeout(refreshAll,80);});updateTrigger(wrap);
}
function scan(){ $$('#cpe-preview-editor select[data-cpe-index]').forEach(enhance); refreshAll(); }
new MutationObserver(ms=>{
  if(ms.some(m=>m.addedNodes.length||m.removedNodes.length)){clearTimeout(observerTimer);observerTimer=setTimeout(scan,60);}
}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(menu&&!e.target.closest('.cdd-menu')&&!e.target.closest('.cdd-wrap'))close();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu){e.preventDefault();close();}});
window.addEventListener('resize',close);window.addEventListener('scroll',e=>{if(menu&&!e.target.closest?.('.cdd-menu'))close();},true);
setTimeout(scan,700);
})();