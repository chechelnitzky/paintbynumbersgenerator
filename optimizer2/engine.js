(function(root){
  'use strict';
  const C=root.PBNOptimizerCore;

  function seededRandom(seed){let s=(seed>>>0)||0x7f4a7c15;return function(){s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
  function cloneGroup(g){return {entries:g.entries.map(x=>({product:x.product,recipe:x.recipe})),markers:new Map(g.markers),slots:g.slots};}
  function addMarkers(map,markers){for(const raw of markers||[]){const t=String(raw);map.set(t,(map.get(t)||0)+1);}}
  function conflictCountMap(map){let n=0;for(const c of map.values())if(c>1)n+=c-1;return n;}
  function entryConflict(recipe,map){let n=0;for(const t of recipe.markers||[])if((map.get(String(t))||0)>0)n++;return n;}
  function capacities(n,size){const out=[];let left=n;while(left>0){const c=Math.min(size,left);out.push(c);left-=c;}return out;}
  function recipeChoice(product,group,rnd){
    let best=null;
    for(const recipe of product.recipes||[]){
      const conflicts=entryConflict(recipe,group.markers);
      const over=Math.max(0,group.slots+(recipe.markers||[]).length-167);
      const score=over*1e9+conflicts*1e5+(recipe.markers||[]).length+rnd();
      if(!best||score<best.score)best={recipe,score,conflicts};
    }
    return best;
  }
  function difficulty(product,globalUsage){
    let best=Infinity;
    for(const recipe of product.recipes||[]){let s=0;for(const t of recipe.markers||[])s+=(globalUsage.get(String(t))||[]).length;best=Math.min(best,s/Math.max(1,recipe.markers.length));}
    return Number.isFinite(best)?best:0;
  }
  function buildPartition(catalog,size,rnd,attempt){
    const caps=capacities((catalog.products||[]).length,size);
    const groups=caps.map(cap=>({cap,entries:[],markers:new Map(),slots:0}));
    const usage=C.recipeUsage(catalog);
    let products=(catalog.products||[]).slice().sort((a,b)=>difficulty(b,usage)-difficulty(a,usage));
    if(attempt>0)products=products.map((p,i)=>({p,k:i+rnd()*7})).sort((a,b)=>a.k-b.k).map(x=>x.p);
    for(const product of products){
      let best=null;
      for(let gi=0;gi<groups.length;gi++){
        const g=groups[gi];if(g.entries.length>=g.cap)continue;
        const choice=recipeChoice(product,g,rnd);if(!choice)continue;
        const fullness=g.entries.length/g.cap;
        const score=choice.score-fullness*25+rnd()*3;
        if(!best||score<best.score)best={gi,choice,score};
      }
      if(!best)return null;
      const g=groups[best.gi];g.entries.push({product,recipe:best.choice.recipe});addMarkers(g.markers,best.choice.recipe.markers);g.slots+=best.choice.recipe.markers.length;
    }
    return groups;
  }
  function partitionKey(groups){return groups.map(g=>g.entries.map(x=>x.product.id+':'+x.recipe.id).sort().join(',')).sort().join('||');}
  function rawScore(groups){
    let conflicts=0,over=0,maxConflict=0;
    for(const g of groups){const c=conflictCountMap(g.markers);conflicts+=c;maxConflict=Math.max(maxConflict,c);over+=Math.max(0,g.slots-167);}
    return over*1e12+conflicts*1e7+maxConflict*1e4;
  }
  function generateShortlist(catalog,size,attempts,seed,onProgress){
    const rnd=seededRandom(seed),keep=new Map();
    for(let i=0;i<attempts;i++){
      const p=buildPartition(catalog,size,seededRandom(Math.floor(rnd()*0xffffffff)),i);if(!p)continue;
      const key=partitionKey(p),score=rawScore(p);
      const old=keep.get(key);if(!old||score<old.score)keep.set(key,{groups:p.map(cloneGroup),score});
      if(i%10===0&&onProgress)onProgress(i/attempts*.45,`Probando agrupaciones ${i}/${attempts}…`);
    }
    return [...keep.values()].sort((a,b)=>a.score-b.score).slice(0,Math.min(14,Math.max(6,Math.ceil(attempts/20))));
  }
  function originalConflicts(entries){
    const owners=new Map();
    for(const e of entries)for(const raw of e.recipe.markers||[]){const t=String(raw);if(!owners.has(t))owners.set(t,[]);owners.get(t).push({productId:e.product.id,productName:e.product.name,recipeId:e.recipe.id});}
    return owners;
  }
  function annotateGroup(entries,res){
    const owners=originalConflicts(entries),changesByRecipe=new Map();
    for(const c of res.changes||[]){if(!changesByRecipe.has(c.recipeId))changesByRecipe.set(c.recipeId,new Map());changesByRecipe.get(c.recipeId).set(String(c.from),c);}
    const designs=entries.map(e=>{
      const cm=changesByRecipe.get(e.recipe.id)||new Map();
      const markers=(e.recipe.markers||[]).map(raw=>{
        const tag=String(raw),confOwners=(owners.get(tag)||[]),conflict=confOwners.length>1,change=cm.get(tag)||null;
        return {tag,conflict,conflictWith:confOwners.filter(o=>o.productId!==e.product.id),change};
      });
      const out=res.outputByRecipe?.[e.recipe.id]?.markers||e.recipe.markers;
      return {product:e.product,recipe:e.recipe,markers,outputMarkers:out,changes:[...cm.values()]};
    });
    return {designs,rawConflicts:[...owners.entries()].filter(([,v])=>v.length>1).reduce((s,[,v])=>s+v.length-1,0)};
  }
  async function negotiateAll(catalog,palette,options,onProgress){
    const size=Math.max(2,Math.min(10,Number(options.groupSize||10))),attempts=Math.max(20,Number(options.attempts||120));
    const maxDelta=Number(options.maxDelta||9),changePenalty=Number(options.changePenalty||4),seed=Number(options.seed||20260820);
    const shortlist=generateShortlist(catalog,size,attempts,seed,onProgress);
    let best=null;
    for(let i=0;i<shortlist.length;i++){
      const cand=shortlist[i],groups=[];let fail=false,totalChanges=0,totalDelta=0,maxUsedDelta=0,totalRaw=0;
      for(let gi=0;gi<cand.groups.length;gi++){
        const g=cand.groups[gi];
        if(g.slots>167){fail=true;break;}
        const res=C.optimizeRecipes(g.entries,palette,{maxDelta,changePenalty,maxChangesPerRecipe:999});
        if(!res.ok){fail=true;break;}
        const ann=annotateGroup(g.entries,res);
        groups.push({entries:g.entries,res,...ann});totalChanges+=res.changeCount;totalDelta+=res.totalDelta;maxUsedDelta=Math.max(maxUsedDelta,res.maxUsedDelta);totalRaw+=ann.rawConflicts;
      }
      if(!fail){
        const score=totalChanges*1e7+totalDelta*1e4+maxUsedDelta*100+totalRaw;
        const candidate={ok:true,groups,totalChanges,totalDelta,meanDelta:totalChanges?totalDelta/totalChanges:0,maxUsedDelta,totalRaw,score,groupSize:size,maxDelta,changePenalty,attempts,shortlistTested:i+1};
        if(!best||score<best.score)best=candidate;
      }
      if(onProgress)onProgress(.45+(i+1)/Math.max(1,shortlist.length)*.55,`Negociando asignaciones globales ${i+1}/${shortlist.length}…`);
      await new Promise(r=>setTimeout(r,0));
    }
    if(best)return best;
    return {ok:false,reason:`No se encontró una negociación completa con ΔE máximo ${maxDelta}. Probá subir el ΔE o aumentar los intentos.`,groupSize:size,maxDelta,attempts};
  }

  root.PBNOptimizer2Engine={negotiateAll,originalConflicts};
})(typeof window!=='undefined'?window:globalThis);