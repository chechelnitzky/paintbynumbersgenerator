(function(){
'use strict';
const C=window.PBNCloud,S=window.PBNStudioStorage,$=s=>document.querySelector(s);
if(!C||!S||!window.pdfjsLib)return;
const cache=new Map(),working=new Set();
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function activeVersion(){const p=S.get(S.getActive()),id=$('.version-row.active')?.dataset.version;return{p,v:p?.versions?.find(x=>x.id===id)}}
async function assets(versionId){const{data,error}=await C.client.from('pbn_assets').select('kind,storage_path,external_url').eq('version_id',versionId).in('kind',['legacy_preview','pdf']);if(error)throw error;return data||[]}
function cropReferenceCanvas(src){
  const maxH=800,scale=Math.min(1,maxH/src.height),w=Math.max(1,Math.round(src.width*scale)),h=Math.max(1,Math.round(src.height*scale)),mini=document.createElement('canvas');mini.width=w;mini.height=h;const m=mini.getContext('2d',{willReadFrequently:true});m.drawImage(src,0,0,w,h);const d=m.getImageData(0,0,w,h).data,n=w*h,dark=new Uint8Array(n),seen=new Uint8Array(n),stack=new Int32Array(n);
  for(let i=0,p=0;i<n;i++,p+=4){const r=d[p],g=d[p+1],b=d[p+2];dark[i]=(r<95&&g<95&&b<95)?1:0}
  let best=null;
  for(let start=0;start<n;start++){
    if(!dark[start]||seen[start])continue;let top=0;stack[top++]=start;seen[start]=1;let count=0,minx=w,miny=h,maxx=0,maxy=0;
    while(top){const idx=stack[--top],y=(idx/w)|0,x=idx-y*w;count++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;const ns=[idx-1,idx+1,idx-w,idx+w];for(const q of ns){if(q<0||q>=n||seen[q]||!dark[q])continue;const qy=(q/w)|0,qx=q-qy*w;if(Math.abs(qx-x)+Math.abs(qy-y)!==1)continue;seen[q]=1;stack[top++]=q}}
    const bw=maxx-minx+1,bh=maxy-miny+1,wr=bw/w,hr=bh/h,box=bw*bh;
    if(wr<.28||wr>.88||hr<.28||hr>.86||box<n*.08||box>n*.72||minx<w*.04||miny<h*.06)continue;const score=count+box*.02;if(!best||score>best.score)best={minx,miny,maxx,maxy,score};
  }
  if(!best)return src;
  const sx=src.width/w,sy=src.height/h,pad=Math.round(Math.min(src.width,src.height)*.006),x=Math.max(0,Math.floor(best.minx*sx)-pad),y=Math.max(0,Math.floor(best.miny*sy)-pad),x2=Math.min(src.width,Math.ceil((best.maxx+1)*sx)+pad),y2=Math.min(src.height,Math.ceil((best.maxy+1)*sy)+pad),cw=x2-x,ch=y2-y,maxSide=1600,outScale=Math.min(1,maxSide/Math.max(cw,ch)),out=document.createElement('canvas');out.width=Math.max(1,Math.round(cw*outScale));out.height=Math.max(1,Math.round(ch*outScale));out.getContext('2d').drawImage(src,x,y,cw,ch,0,0,out.width,out.height);return out;
}
async function renderPdf(path){const signed=await C.signedUrl(path,900),pdf=await pdfjsLib.getDocument(signed).promise,page=await pdf.getPage(1),vp=page.getViewport({scale:2.2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;return cropReferenceCanvas(canvas)}
async function uploadPreview(p,v,canvas){const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));if(!blob)throw new Error('No pude generar la miniatura del PDF.');const path=`designs/${p.cloudId}/versions/${v.cloudId}/legacy-preview.jpg`,{data,error}=await C.client.storage.from(C.BUCKET).upload(path,blob,{upsert:true,contentType:'image/jpeg'});if(error)throw error;const{error:ae}=await C.client.from('pbn_assets').upsert({version_id:v.cloudId,kind:'legacy_preview',storage_path:data.path,mime_type:'image/jpeg',metadata:{generated_from:'stored_pdf',generated_at:new Date().toISOString()}},{onConflict:'version_id,kind'});if(ae)throw ae;return C.signedUrl(data.path,604800)}
async function resolvePreview(p,v){if(!C.admin()||!p?.cloudId||!v?.cloudId)return'';const key=v.cloudId;if(cache.has(key))return cache.get(key);if(working.has(key))return'';working.add(key);try{const aa=await assets(v.cloudId),ready=aa.find(a=>a.kind==='legacy_preview'&&a.storage_path);if(ready){const url=await C.signedUrl(ready.storage_path,604800);cache.set(key,url);return url}const pdf=aa.find(a=>a.kind==='pdf'&&a.storage_path);if(!pdf)return'';const canvas=await renderPdf(pdf.storage_path),url=await uploadPreview(p,v,canvas);cache.set(key,url);return url}finally{working.delete(key)}}
async function repairActive(){const{p,v}=activeVersion();if(!p||!v||v.coloredSvg)return;const stage=$('#preview-stage');if(!stage)return;const img=stage.querySelector('img.preview-raster'),needs=!img||!img.complete||!img.naturalWidth||/drive\.google\.com/i.test(img.src);if(!needs)return;try{const url=await resolvePreview(p,v);if(!url)return;S.updateVersion(p.id,v.id,{sourcePreview:url,previewUrl:url});document.querySelector('.version-row.active')?.click()}catch(e){console.warn('legacy preview repair',e)}}
async function repairCard(card){if(!card||card.dataset.previewRepair==='1')return;const p=S.get(card.dataset.project);if(!p)return;const v=(p.versions||[]).slice().reverse().find(x=>!x.coloredSvg);if(!v)return;const img=card.querySelector('img.thumb-img'),broken=img&&(!img.complete||!img.naturalWidth||/drive\.google\.com/i.test(img.src)),empty=card.querySelector('.thumb.empty');if(!broken&&!empty)return;card.dataset.previewRepair='1';try{const url=await resolvePreview(p,v);if(url){const holder=img||empty;const ni=document.createElement('img');ni.className='thumb-img';ni.src=url;holder?.replaceWith(ni)}}catch(e){console.warn('card preview repair',e);card.dataset.previewRepair='0'}}
function sweep(){document.querySelectorAll('.project-card').forEach(repairCard);setTimeout(repairActive,80)}
document.addEventListener('error',e=>{if(e.target?.matches?.('img.preview-raster,img.thumb-img'))setTimeout(sweep,20)},true);
document.addEventListener('click',e=>{if(e.target.closest?.('.project-card,.version-row,.nav-btn[data-tab="preview"]'))setTimeout(sweep,120)},true);
new MutationObserver(()=>setTimeout(sweep,80)).observe(document.body,{childList:true,subtree:true});
C.onSession((s,a)=>{if(s&&a)setTimeout(sweep,500)});setTimeout(sweep,900);
})();