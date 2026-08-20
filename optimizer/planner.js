(function(root){
  'use strict';
  const C=root.PBNOptimizerCore;

  function cloneCatalog(catalog){
    return {version:catalog.version,products:(catalog.products||[]).map(p=>({...p,recipes:(p.recipes||[]).map(r=>({...r,markers:[...(r.markers||[])]}))}))};
  }

  function catalogWithSavedRecipes(catalog,saved){
    const out=cloneCatalog(catalog), byId=new Map(out.products.map(p=>[p.id,p]));
    for(const s of (saved||[])){
      if(!['validated','applied'].includes(s.status)) continue;
      const p=byId.get(s.productId); if(!p) continue;
      const rid='saved:'+s.id;
      if(p.recipes.some(r=>r.id===rid)) continue;
      p.recipes.push({id:rid,name:s.name||'Optimizada',markers:[...(s.markers||[])],saved:true,savedId:s.id,baseRecipeId:s.baseRecipeId,status:s.status});
    }
    return out;
  }

  function setForEntry(entry){ return new Set(entry.recipe.markers||[]); }
  function canFit(caseObj,recipe,maxProducts){
    if(caseObj.entries.length>=maxProducts) return false;
    for(const t of recipe.markers||[]) if(caseObj.markers.has(String(t))) return false;
    return true;
  }
  function addToCase(caseObj,product,recipe){
    caseObj.entries.push({product,recipe});
    for(const t of recipe.markers||[]) caseObj.markers.add(String(t));
  }
  function seededRandom(seed){
    let s=(seed>>>0)||0x91e10da5;
    return function(){s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
  }
  function shuffle(a,rnd){
    a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
  }

  function productDifficulty(product,usage){
    let best=Infinity;
    for(const r of product.recipes||[]){
      let s=0; for(const t of r.markers||[]) s+=(usage.get(String(t))||[]).length;
      best=Math.min(best,s/Math.max(1,r.markers.length));
    }
    return Number.isFinite(best)?best:0;
  }

  function buildGreedyPlan(catalog,maxProducts,rnd,randomness){
    const usage=C.recipeUsage(catalog);
    let products=(catalog.products||[]).slice();
    products.sort((a,b)=>productDifficulty(b,usage)-productDifficulty(a,usage));
    if(randomness) products=products.map((p,i)=>({p,k:i+rnd()*randomness})).sort((a,b)=>a.k-b.k).map(x=>x.p);
    const cases=[];
    for(const product of products){
      const choices=[];
      for(let ci=0;ci<cases.length;ci++) for(const recipe of product.recipes||[]){
        const c=cases[ci]; if(!canFit(c,recipe,maxProducts)) continue;
        const fillAfter=c.entries.length+1;
        const markerAfter=c.markers.size+(recipe.markers||[]).length;
        choices.push({ci,recipe,score:fillAfter*10000+markerAfter+rnd()*.01});
      }
      choices.sort((a,b)=>b.score-a.score);
      if(choices.length){const x=choices[0];addToCase(cases[x.ci],product,x.recipe);}
      else{
        const recipe=(product.recipes||[]).slice().sort((a,b)=>(a.markers||[]).length-(b.markers||[]).length)[0];
        const c={entries:[],markers:new Set()}; addToCase(c,product,recipe); cases.push(c);
      }
    }
    return cases;
  }

  function planScore(cases){
    const sizes=cases.map(c=>c.entries.length).sort((a,b)=>a-b);
    const emptiness=sizes.reduce((s,n)=>s+(10-n)*(10-n),0);
    return cases.length*1e9+emptiness*1e4-cases.reduce((s,c)=>s+c.markers.size,0);
  }

  function compactPlan(cases,maxProducts){
    let changed=true;
    while(changed){
      changed=false;
      cases.sort((a,b)=>b.entries.length-a.entries.length);
      for(let from=cases.length-1;from>=0;from--){
        const source=cases[from];
        for(let ei=source.entries.length-1;ei>=0;ei--){
          const entry=source.entries[ei]; let moved=false;
          for(let to=0;to<cases.length;to++){
            if(to===from) continue;
            const dest=cases[to];
            for(const recipe of entry.product.recipes||[]){
              if(canFit(dest,recipe,maxProducts)){
                source.entries.splice(ei,1);
                source.markers=new Set(source.entries.flatMap(x=>x.recipe.markers.map(String)));
                addToCase(dest,entry.product,recipe); moved=true;changed=true;break;
              }
            }
            if(moved) break;
          }
        }
        if(source.entries.length===0){cases.splice(from,1);changed=true;}
      }
    }
    return cases;
  }

  function planCases(catalog,options={}){
    const tries=Math.max(20,Number(options.tries||240)), maxProducts=Math.max(1,Number(options.maxProducts||10));
    const rnd=seededRandom(Number(options.seed||20260820)); let best=null,bestScore=Infinity;
    for(let i=0;i<tries;i++){
      const localRnd=seededRandom(Math.floor(rnd()*0xffffffff));
      const cases=compactPlan(buildGreedyPlan(catalog,maxProducts,localRnd,i===0?0:8),maxProducts);
      const score=planScore(cases);
      if(score<bestScore){bestScore=score;best=cases.map(c=>({entries:c.entries.slice(),markers:new Set(c.markers)}));}
    }
    (best||[]).sort((a,b)=>b.entries.length-a.entries.length||b.markers.size-a.markers.size);
    return (best||[]).map((c,i)=>({id:i+1,entries:c.entries,markerCount:c.markers.size,utilization:c.markers.size/167}));
  }

  root.PBNOptimizerPlanner={catalogWithSavedRecipes,planCases};
})(typeof window!=='undefined'?window:globalThis);