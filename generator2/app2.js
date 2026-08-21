(function(){
  'use strict';
  const S=window.PBNStudioStorage, palette=window.PALETTE_ITEMS||[];
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  let activeProjectId=S.getActive(), activeVersionId='';
  let currentPreviewSvg='', currentPreviewRaster='', currentPreviewSubs={};

  const hexByTag=Object.fromEntries(palette.map(p=>[String(p.tag),String(p.hex).toLowerCase()]));
  const tagByHex=Object.fromEntries(palette.map(p=>[String(p.hex).toLowerCase(),String(p.tag)]));

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function toast(msg){const n=document.createElement('div');n.className='toast';n.textContent=msg;document.body.appendChild(n);setTimeout(()=>n.remove(),3600);}
  function dl(name,text,type='text/plain'){const a=document.createElement('a'),blob=new Blob([text],{type});a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2500);}
  function slug(s){return String(s||'design').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'design';}
  function cssHex(v){v=String(v||'').trim().toLowerCase();if(/^#[0-9a-f]{6}$/.test(v))return v;if(/^#[0-9a-f]{3}$/.test(v))return '#'+v.slice(1).split('').map(x=>x+x).join('');const m=v.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);if(m)return '#'+[m[1],m[2],m[3]].map(x=>Math.max(0,Math.min(255,+x)).toString(16).padStart(2,'0')).join('');return '';}
  function hexRgb(h){h=cssHex(h);return h?[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]:null;}
  function sw(tag){return `<span class="sw" style="background:${hexByTag[tag]||'#ddd'}"></span>`;}
  function iframe(){return $('#legacy-frame');}
  function frameDoc(){try{return iframe().contentDocument||iframe().contentWindow.document;}catch{return null;}}

  function injectEngineSkin(){const d=frameDoc();if(!d||d.getElementById('pbn-studio-engine-skin'))return;const st=d.createElement('style');st.id='pbn-studio-engine-skin';st.textContent=`body{background:#fff!important}.container{width:96%!important;max-width:none!important}h2{display:none!important}#recolor-version-label{display:none!important}.row:first-child>span{font-size:12px;color:#687386}.tabs{box-shadow:none!important}.btn{border-radius:8px!important}.collection{border-radius:12px;overflow:hidden}.collection-item{border-color:#edf0f4!important}`;d.head.appendChild(st);}
  iframe()?.addEventListener('load',()=>{setTimeout(injectEngineSkin,700);if($('#engine-status'))$('#engine-status').textContent='Motor listo';});

  function collectSettings(d){const ids=['txtResizeWidth','txtResizeHeight','txtNrOfClusters','txtClusterPrecision','txtRandomSeed','txtNarrowPixelStripCleanupRuns','txtRemoveFacetsSmallerThan','txtMaximumNumberOfFacets','txtNrOfTimesToHalveBorderSegments','txtSizeMultiplier','txtLabelFontSize','txtLabelFontColor','txtKMeansColorRestrictions'];const o={};for(const id of ids){const el=d.getElementById(id);if(el)o[id]=el.value;}o.chkResizeImage=!!d.getElementById('chkResizeImage')?.checked;o.chkShowLabels=!!d.getElementById('chkShowLabels')?.checked;o.chkFillFacets=!!d.getElementById('chkFillFacets')?.checked;o.chkShowBorders=!!d.getElementById('chkShowBorders')?.checked;return o;}
  function analyzeSvg(svg){const counts=new Map();for(const el of svg.querySelectorAll('path,rect,circle,polygon,ellipse')){const vals=[el.getAttribute('fill'),el.style.fill,el.getAttribute('stroke'),el.style.stroke];for(const raw of vals){const h=cssHex(raw);if(!h||!tagByHex[h])continue;const tag=tagByHex[h];counts.set(tag,(counts.get(tag)||0)+1);break;}}return [...counts.entries()].map(([tag,weight])=>({tag,hex:hexByTag[tag],weight})).sort((a,b)=>b.weight-a.weight);}
  function deriveLineSvg(svgText){if(!svgText)return'';const doc=new DOMParser().parseFromString(svgText,'image/svg+xml'),svg=doc.documentElement;for(const el of svg.querySelectorAll('path,rect,circle,polygon,ellipse')){el.style.fill='white';el.setAttribute('fill','white');el.style.stroke='#b8bcc5';el.setAttribute('stroke','#b8bcc5');}return new XMLSerializer().serializeToString(svg);}
  function sourcePreview(d){try{const c=d.querySelector('#canvas');return c&&c.width&&c.height?c.toDataURL('image/png'):'';}catch{return '';}}

  function fittedSvg(svgText){
    if(!svgText)return'';
    try{
      const doc=new DOMParser().parseFromString(svgText,'image/svg+xml'),svg=doc.documentElement;
      if(!svg.getAttribute('viewBox')){
        const w=parseFloat(svg.getAttribute('width')||'0'),h=parseFloat(svg.getAttribute('height')||'0');
        if(w>0&&h>0)svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
      }
      svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('preserveAspectRatio','xMidYMid meet');
      svg.style.width='100%';svg.style.height='100%';svg.style.maxWidth='100%';svg.style.maxHeight='100%';
      return new XMLSerializer().serializeToString(svg);
    }catch{return svgText;}
  }
  function paintSvg(svgText){const st=$('#preview-stage');if(st)st.innerHTML=svgText?fittedSvg(svgText):'<div class="empty-state">Sin SVG</div>';}
  function paintRaster(src){const st=$('#preview-stage');if(st)st.innerHTML=src?`<img class="preview-raster" src="${esc(src)}" alt="Preview del diseño">`:'<div class="empty-state">Sin preview</div>';}

  function createFreshProject(name){
    const p=S.upsert({id:S.uid('design'),name:name||'Nuevo diseño',status:'draft',sourceType:'generator2',versions:[]});
    activeProjectId=p.id;activeVersionId='';S.setActive(p.id);return p;
  }
  function ensureProject(name){
    const typed=(name||'Nuevo diseño').trim()||'Nuevo diseño';
    const current=activeProjectId&&S.get(activeProjectId);
    if(!current)return createFreshProject(typed);
    if(slug(current.name)!==slug(typed)){
      const old=current.name;
      const p=createFreshProject(typed);
      toast(`Nuevo diseño creado: ${typed}. ${old} quedó intacto.`);
      return p;
    }
    return current;
  }

  function captureCurrent(){
    const d=frameDoc();if(!d)return toast('El motor todavía no está listo.');
    const svg=d.querySelector('#svgContainer svg');if(!svg)return toast('Primero procesa la imagen y genera el Output/SVG en el motor.');
    const name=$('#design-name').value.trim()||'Nuevo diseño',p=ensureProject(name);
    const svgText=new XMLSerializer().serializeToString(svg),markers=analyzeSvg(svg);
    if(markers.length<3){
      const ok=confirm(`Sólo detecté ${markers.length} marcador${markers.length===1?'':'es'} de la paleta física en este SVG.\n\nEso suele ocurrir si guardaste antes de aplicar Recolor / la paleta de marcadores. Puedes cancelar, volver al motor, aplicar la receta y guardar de nuevo.\n\n¿Guardar de todas formas?`);
      if(!ok)return;
    }
    const captureNo=(p.versions||[]).filter(v=>String(v.source||'').includes('generator2')).length+1;
    const version=S.addVersion(p.id,{name:`Generada ${captureNo}`,status:'draft',source:'generator2-engine',sourcePreview:sourcePreview(d),coloredSvg:svgText,lineSvg:deriveLineSvg(svgText),markers,markerTags:markers.map(x=>x.tag),settings:collectSettings(d),notes:'Capturada desde Generator 2'});
    activeVersionId=version.id;renderAll();openVersion(p.id,version.id);switchTab('preview');toast(`Guardado: ${p.name} · ${version.name}`);
  }

  function projectPreview(p){
    const versions=p.versions||[],v=versions[versions.length-1];
    if(v?.coloredSvg)return `<div class="thumb">${fittedSvg(v.coloredSvg)}</div>`;
    const src=v?.sourcePreview||v?.previewUrl||p.legacyCloudinaryUrl||'';
    return src?`<img class="thumb-img" src="${esc(src)}">`:'<div class="thumb empty">Sin preview</div>';
  }
  function renderProjects(){
    const projects=S.list();$('#library-count').textContent=`${projects.length} diseño${projects.length===1?'':'s'}`;
    $('#project-grid').innerHTML=projects.length?projects.map(p=>`<article class="project-card ${p.id===activeProjectId?'active':''}" data-project="${esc(p.id)}">${projectPreview(p)}<div class="project-info"><div><h3>${esc(p.name)}</h3><small>${(p.versions||[]).length} versión${(p.versions||[]).length===1?'':'es'} · ${p.sourceType==='legacy'?'importado':'generator2'}</small></div><button class="icon danger" data-delete="${esc(p.id)}" title="Eliminar">×</button></div></article>`).join(''):'<div class="empty-state">Todavía no guardaste diseños desde Generator 2.</div>';
    $$('.project-card').forEach(c=>c.addEventListener('click',e=>{if(e.target.closest('[data-delete]'))return;activeProjectId=c.dataset.project;S.setActive(activeProjectId);renderAll();const p=S.get(activeProjectId);if(p?.versions.length)openVersion(p.id,p.versions[p.versions.length-1].id);switchTab('preview');}));
    $$('[data-delete]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(confirm('¿Eliminar este diseño y todas sus versiones locales?')){S.removeProject(b.dataset.delete);if(activeProjectId===b.dataset.delete){activeProjectId='';activeVersionId='';}renderAll();}}));
  }

  function renderActive(){
    const p=activeProjectId&&S.get(activeProjectId);$('#active-project-label').textContent=p?`${p.name} · ${(p.versions||[]).length} versiones`:'Sin proyecto activo';
    if(p&&!$('#design-name').matches(':focus'))$('#design-name').value=p.name;
    $('#version-list').innerHTML=p?.versions?.length?p.versions.slice().reverse().map(v=>`<button class="version-row ${v.id===activeVersionId?'active':''}" data-version="${esc(v.id)}"><span>${esc(v.name)}</span><small>${esc(v.status)} · ${v.markerTags?.length||0} marcadores${v.coloredSvg?' · editable':' · importado'}</small></button>`).join(''):'<div class="empty-state compact">Capturá una salida del motor para crear la primera versión.</div>';
    $$('.version-row').forEach(b=>b.addEventListener('click',()=>openVersion(p.id,b.dataset.version)));
  }

  function versionRasterSource(p,v){return v?.sourcePreview||v?.previewUrl||p?.legacyCloudinaryUrl||'';}
  function openVersion(projectId,versionId){
    const p=S.get(projectId),v=p?.versions.find(x=>x.id===versionId);if(!v)return;
    activeProjectId=projectId;activeVersionId=versionId;S.setActive(projectId);currentPreviewSubs={};
    currentPreviewSvg=v.coloredSvg||'';currentPreviewRaster='';
    $('#preview-title').textContent=`${p.name} · ${v.name}`;
    $('#preview-meta').innerHTML=`<span>${v.markerTags?.length||0} marcadores</span><span>${esc(v.status)}</span><span>${new Date(v.createdAt||Date.now()).toLocaleString('es-CL')}</span>${v.coloredSvg?'<span>SVG editable</span>':'<span>PDF/PNG importado</span>'}`;
    if(currentPreviewSvg)paintSvg(currentPreviewSvg);else{currentPreviewRaster=versionRasterSource(p,v);paintRaster(currentPreviewRaster);}
    renderMarkerEditor(v);renderActive();
    const note=$('#preview-change-note');if(note)note.textContent=v.coloredSvg?'Sin cambios':'Diseño importado: podés previsualizar cambios de color sobre el PNG. La numeración definitiva requiere regenerar/vincular el SVG.';
  }

  function renderMarkerEditor(v){
    const tags=v.markerTags||[];$('#marker-editor').innerHTML=tags.length?tags.map(tag=>`<div class="map-row"><span class="from-tag">${sw(tag)}<b>${esc(tag)}</b></span><span>→</span><select data-from="${esc(tag)}"><option value="${esc(tag)}">${esc(tag)} · mantener</option>${palette.filter(p=>String(p.tag)!==String(tag)).map(p=>`<option value="${esc(p.tag)}">${esc(p.tag)}</option>`).join('')}</select></div>`).join(''):'<div class="empty-state compact">No detecté marcadores exactos.</div>';
  }
  function selectedSubs(){const out={};for(const s of $$('#marker-editor select'))if(s.value!==s.dataset.from)out[s.dataset.from]=s.value;return out;}

  function recolorSvg(svgText,subs){
    const doc=new DOMParser().parseFromString(svgText,'image/svg+xml'),svg=doc.documentElement;
    for(const el of svg.querySelectorAll('*')){
      for(const attr of ['fill','stroke']){const raw=el.getAttribute(attr)||el.style?.[attr],h=cssHex(raw),tag=tagByHex[h];if(tag&&subs[tag]){const nh=hexByTag[subs[tag]];el.setAttribute(attr,nh);if(el.style)el.style[attr]=nh;}}
      if(el.children.length===0){const t=(el.textContent||'').trim();if(subs[t])el.textContent=subs[t];}
    }
    return new XMLSerializer().serializeToString(svg);
  }
  function loadImage(src){return new Promise((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>res(img);img.onerror=()=>rej(new Error('No pude cargar la imagen importada para recolorearla.'));img.src=src;});}
  async function recolorRaster(src,subs){
    const img=await loadImage(src),maxSide=2200,scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
    let data;try{data=ctx.getImageData(0,0,w,h);}catch{throw new Error('El servidor de la imagen no permite preview raster. Hay que vincular/regenerar su SVG.');}
    const maps=Object.entries(subs).map(([from,to])=>({from:hexRgb(hexByTag[from]),to:hexRgb(hexByTag[to])})).filter(x=>x.from&&x.to),px=data.data,threshold2=18*18;
    for(let i=0;i<px.length;i+=4){if(px[i+3]<20)continue;let best=null,bestD=Infinity;for(const m of maps){const dr=px[i]-m.from[0],dg=px[i+1]-m.from[1],db=px[i+2]-m.from[2],d=dr*dr+dg*dg+db*db;if(d<bestD){bestD=d;best=m;}}if(best&&bestD<=threshold2){px[i]=best.to[0];px[i+1]=best.to[1];px[i+2]=best.to[2];}}
    ctx.putImageData(data,0,0);return c.toDataURL('image/png');
  }

  async function applySubstitutions(){
    const p=S.get(activeProjectId),v=p?.versions.find(x=>x.id===activeVersionId);if(!p||!v)return;
    const subs=selectedSubs();currentPreviewSubs=subs;const n=Object.keys(subs).length;
    if(!n){currentPreviewSvg=v.coloredSvg||'';currentPreviewRaster=versionRasterSource(p,v);currentPreviewSvg?paintSvg(currentPreviewSvg):paintRaster(currentPreviewRaster);$('#preview-change-note').textContent='Sin cambios';return;}
    const btn=$('#apply-preview');btn.disabled=true;const old=btn.textContent;btn.textContent='Calculando preview…';
    try{
      if(v.coloredSvg){currentPreviewSvg=recolorSvg(v.coloredSvg,subs);currentPreviewRaster='';paintSvg(currentPreviewSvg);$('#preview-change-note').textContent=`${n} cambio${n===1?'':'s'}: ${Object.entries(subs).map(([a,b])=>a+'→'+b).join(', ')}`;}
      else{const src=versionRasterSource(p,v);if(!src)throw new Error('Este diseño importado no tiene imagen vinculada.');currentPreviewSvg='';currentPreviewRaster=await recolorRaster(src,subs);paintRaster(currentPreviewRaster);$('#preview-change-note').textContent=`Preview raster aproximada · ${n} cambio${n===1?'':'s'}: ${Object.entries(subs).map(([a,b])=>a+'→'+b).join(', ')}. Los números impresos aún muestran la receta antigua hasta regenerar el SVG.`;}
    }catch(e){console.error(e);toast(e.message||String(e));}
    finally{btn.disabled=false;btn.textContent=old;}
  }

  function markersAfterSubs(base,subs){
    const src=(base.markers||[]).length?base.markers:(base.markerTags||[]).map(tag=>({tag,hex:hexByTag[tag]||'#000000',weight:1}));
    return src.map(m=>{const nt=subs[String(m.tag)]||String(m.tag);return {...m,tag:nt,hex:hexByTag[nt]||m.hex};});
  }
  function saveAsVersion(status='draft'){
    const p=S.get(activeProjectId),base=p?.versions.find(x=>x.id===activeVersionId);if(!p||!base)return toast('No hay versión activa.');
    if(!currentPreviewSvg&&!currentPreviewRaster)return toast('Primero generá una preview.');
    const subs=currentPreviewSubs||{},markers=currentPreviewSvg?analyzeSvg(new DOMParser().parseFromString(currentPreviewSvg,'image/svg+xml').documentElement):markersAfterSubs(base,subs);
    const v=S.addVersion(p.id,{name:`${status==='approved'?'Aprobada':'Optimizada'} ${p.versions.length+1}`,status,source:currentPreviewSvg?'generator2-svg-preview':'generator2-raster-preview',sourceVersionId:base.id,sourcePreview:currentPreviewRaster||base.sourcePreview||base.previewUrl||'',coloredSvg:currentPreviewSvg||'',lineSvg:currentPreviewSvg?deriveLineSvg(currentPreviewSvg):'',markers,markerTags:markers.map(x=>String(x.tag)),settings:base.settings||{},notes:currentPreviewSvg?'Versión derivada desde editor estructurado':'Versión derivada desde preview raster de diseño importado',substitutions:subs});
    activeVersionId=v.id;renderAll();openVersion(p.id,v.id);toast(status==='approved'?'Versión aprobada y guardada.':'Nueva versión guardada.');
  }

  function selected(){const p=S.get(activeProjectId);return {p,v:p?.versions.find(x=>x.id===activeVersionId)};}
  function exportSvg(kind){const {p,v}=selected();if(!p||!v)return;const text=kind==='line'?(v.lineSvg||deriveLineSvg(v.coloredSvg)):v.coloredSvg;if(!text)return toast('Esta versión importada todavía no tiene SVG estructurado.');dl(`${slug(p.name)}-${slug(v.name)}-${kind}.svg`,text,'image/svg+xml');}
  function svgToPng(svgText,name){if(!svgText)return toast('Esta versión no tiene SVG.');const svgBlob=new Blob([svgText],{type:'image/svg+xml'}),url=URL.createObjectURL(svgBlob),img=new Image();img.onload=()=>{const vb=(svgText.match(/viewBox=["']([^"']+)/i)?.[1]||'').split(/\s+/).map(Number),c=document.createElement('canvas');c.width=(vb.length===4&&vb[2])||img.naturalWidth||1600;c.height=(vb.length===4&&vb[3])||img.naturalHeight||1600;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2500);},'image/png');};img.src=url;}
  function downloadRaster(src,name){if(!src)return toast('No hay PNG disponible.');const a=document.createElement('a');a.href=src;a.download=name;a.target='_blank';a.click();}
  function exportBundle(){const {p,v}=selected();if(!p||!v)return;dl(`${slug(p.name)}-${slug(v.name)}-project.json`,JSON.stringify({schema:2,project:{id:p.id,name:p.name},version:v},null,2),'application/json');}

  function renderProduction(){const approved=S.list().flatMap(p=>(p.versions||[]).filter(v=>v.status==='approved'||v.status==='applied').map(v=>({p,v})));$('#production-list').innerHTML=approved.length?approved.map(({p,v})=>`<article class="production-row"><div><b>${esc(p.name)}</b><small>${esc(v.name)} · ${v.markerTags?.length||0} marcadores · ${v.coloredSvg?'editable':'preview raster'}</small></div><button data-open-prod="${p.id}|${v.id}">Abrir</button></article>`).join(''):'<div class="empty-state">No hay versiones aprobadas todavía.</div>';$$('[data-open-prod]').forEach(b=>b.addEventListener('click',()=>{const [p,v]=b.dataset.openProd.split('|');openVersion(p,v);switchTab('preview');}));}

  function renderAll(){renderProjects();renderActive();renderProduction();}
  function switchTab(name){$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.view').forEach(v=>v.hidden=v.id!==`view-${name}`);}

  $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('#capture')?.addEventListener('click',captureCurrent);
  $('#apply-preview')?.addEventListener('click',applySubstitutions);
  $('#save-version')?.addEventListener('click',()=>saveAsVersion('draft'));
  $('#approve-version')?.addEventListener('click',()=>saveAsVersion('approved'));
  $('#download-color-svg')?.addEventListener('click',()=>exportSvg('color'));
  $('#download-line-svg')?.addEventListener('click',()=>exportSvg('line'));
  $('#download-color-png')?.addEventListener('click',()=>{const {p,v}=selected();if(!p||!v)return;if(v.coloredSvg)svgToPng(v.coloredSvg,`${slug(p.name)}-${slug(v.name)}-color.png`);else downloadRaster(currentPreviewRaster||versionRasterSource(p,v),`${slug(p.name)}-${slug(v.name)}-preview.png`);});
  $('#download-line-png')?.addEventListener('click',()=>{const {p,v}=selected();if(p&&v&&v.coloredSvg)svgToPng(v.lineSvg||deriveLineSvg(v.coloredSvg),`${slug(p.name)}-${slug(v.name)}-line.png`);else toast('El PNG de líneas requiere una versión SVG estructurada.');});
  $('#download-bundle')?.addEventListener('click',exportBundle);
  $('#export-library')?.addEventListener('click',()=>dl('pbn-studio-library.json',JSON.stringify(S.exportAll(),null,2),'application/json'));
  $('#import-library')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{S.importAll(JSON.parse(await f.text()),true);renderAll();toast('Biblioteca importada.');}catch(err){alert(err.message);}e.target.value='';});
  $('#new-project')?.addEventListener('click',()=>{activeProjectId='';activeVersionId='';currentPreviewSvg='';currentPreviewRaster='';currentPreviewSubs={};S.setActive('');$('#design-name').value='';renderAll();switchTab('create');toast('Nuevo diseño: el próximo guardado creará un proyecto separado.');});

  renderAll();switchTab('create');
})();
