(function(){
'use strict';
const KEY='pbn_master_active_run_v2',JUST='pbn_master_just_calculated_v1';
const $=s=>document.querySelector(s);
let restoring=false,lastRestored='';
function activeId(){const q=new URLSearchParams(location.search).get('run');return q||localStorage.getItem(KEY)||'';}
function remember(id,{url=true}={}){
  if(!id)return;
  localStorage.setItem(KEY,id);
  if(url){const u=new URL(location.href);u.searchParams.set('run',id);history.replaceState({...(history.state||{}),pbnMasterRun:id},'',u.pathname+u.search+u.hash);}
}
function restore(force=false){
  if(restoring)return;
  const sel=$('#master-run-select'),btn=$('#master-load');if(!sel||!btn||!sel.options.length)return;
  let id=activeId();
  if(sessionStorage.getItem(JUST)==='1'){
    id=sel.options[0]?.value||id;
    sessionStorage.removeItem(JUST);
  }
  if(!id||![...sel.options].some(o=>o.value===id))return;
  sel.value=id;remember(id);
  if(force||lastRestored!==id||!$('#result')?.children.length){restoring=true;lastRestored=id;setTimeout(()=>{btn.click();restoring=false;},30);}
}
document.addEventListener('click',e=>{
  if(e.target.closest?.('#run'))sessionStorage.setItem(JUST,'1');
  if(e.target.closest?.('#master-load')){const id=$('#master-run-select')?.value;if(id)remember(id);}
  const a=e.target.closest?.('a[href*="generator2"],a[href*="constructor"]');if(a){const id=$('#master-run-select')?.value||$('#result')?.dataset.savedRun||activeId();if(id)remember(id);}
},true);
document.addEventListener('change',e=>{if(e.target?.id==='master-run-select')remember(e.target.value);},true);
new MutationObserver(()=>restore(false)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('pageshow',()=>setTimeout(()=>restore(true),120));
window.addEventListener('popstate',()=>setTimeout(()=>restore(true),80));
setTimeout(()=>restore(true),500);
})();