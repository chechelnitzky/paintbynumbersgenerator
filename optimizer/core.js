(function (root) {
  'use strict';

  const BIG = 1e9;

  function normTag(v) { return String(v == null ? '' : v).trim(); }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function srgbToLinear(u) { return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function rgbToLab(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return null;
    const r = srgbToLinear(rgb.r/255), g = srgbToLinear(rgb.g/255), b = srgbToLinear(rgb.b/255);
    const x = r*0.4124564 + g*0.3575761 + b*0.1804375;
    const y = r*0.2126729 + g*0.7151522 + b*0.0721750;
    const z = r*0.0193339 + g*0.1191920 + b*0.9503041;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);
    const fx=f(x/0.95047), fy=f(y), fz=f(z/1.08883);
    return {L:116*fy-16, a:500*(fx-fy), b:200*(fy-fz)};
  }
  function deltaE00(lab1, lab2) {
    const L1=lab1.L,a1=lab1.a,b1=lab1.b,L2=lab2.L,a2=lab2.a,b2=lab2.b;
    const C1=Math.hypot(a1,b1), C2=Math.hypot(a2,b2), Cbar=(C1+C2)/2;
    const Cbar7=Math.pow(Cbar,7), G=.5*(1-Math.sqrt(Cbar7/(Cbar7+Math.pow(25,7))));
    const a1p=(1+G)*a1, a2p=(1+G)*a2, C1p=Math.hypot(a1p,b1), C2p=Math.hypot(a2p,b2);
    const hp=(b,a)=>{ let h=Math.atan2(b,a)*180/Math.PI; return h<0?h+360:h; };
    const h1p=hp(b1,a1p), h2p=hp(b2,a2p), dLp=L2-L1, dCp=C2p-C1p;
    let dhp=0;
    if (C1p*C2p!==0) { const d=h2p-h1p; dhp=Math.abs(d)<=180?d:(d>180?d-360:d+360); }
    const dHp=2*Math.sqrt(C1p*C2p)*Math.sin((dhp*Math.PI/180)/2);
    const Lbarp=(L1+L2)/2, Cbarp=(C1p+C2p)/2;
    let hbarp=0;
    if (C1p*C2p===0) hbarp=h1p+h2p;
    else { const d=Math.abs(h1p-h2p); hbarp=d<=180?(h1p+h2p)/2:(h1p+h2p+(h1p+h2p<360?360:-360))/2; }
    const T=1-.17*Math.cos((hbarp-30)*Math.PI/180)+.24*Math.cos(2*hbarp*Math.PI/180)+.32*Math.cos((3*hbarp+6)*Math.PI/180)-.20*Math.cos((4*hbarp-63)*Math.PI/180);
    const dTheta=30*Math.exp(-Math.pow((hbarp-275)/25,2));
    const RC=2*Math.sqrt(Math.pow(Cbarp,7)/(Math.pow(Cbarp,7)+Math.pow(25,7)));
    const SL=1+(.015*Math.pow(Lbarp-50,2))/Math.sqrt(20+Math.pow(Lbarp-50,2));
    const SC=1+.045*Cbarp, SH=1+.015*Cbarp*T, RT=-Math.sin(2*dTheta*Math.PI/180)*RC;
    return Math.sqrt(Math.pow(dLp/SL,2)+Math.pow(dCp/SC,2)+Math.pow(dHp/SH,2)+RT*(dCp/SC)*(dHp/SH));
  }

  function buildPalette(items) {
    return (items || []).map((x,i)=>({ index:i, tag:normTag(x.tag), hex:String(x.hex).toLowerCase(), lab:rgbToLab(x.hex) })).filter(x=>x.tag&&x.lab);
  }

  function paletteMaps(palette) {
    return {
      byTag:new Map(palette.map(p=>[p.tag,p])),
      byIndex:new Map(palette.map(p=>[p.index,p]))
    };
  }

  function hungarian(cost) {
    const n=cost.length; if (!n) return [];
    const m=cost[0].length; if (n>m) throw new Error('Hungarian requires rows <= columns');
    const u=new Float64Array(n+1), v=new Float64Array(m+1), p=new Int32Array(m+1), way=new Int32Array(m+1);
    for (let i=1;i<=n;i++) {
      p[0]=i; let j0=0; const minv=new Float64Array(m+1); const used=new Uint8Array(m+1);
      for (let j=1;j<=m;j++) minv[j]=Infinity;
      do {
        used[j0]=1; const i0=p[j0]; let delta=Infinity,j1=0;
        for (let j=1;j<=m;j++) if(!used[j]) {
          const cur=cost[i0-1][j-1]-u[i0]-v[j];
          if(cur<minv[j]) { minv[j]=cur; way[j]=j0; }
          if(minv[j]<delta) { delta=minv[j]; j1=j; }
        }
        if (!Number.isFinite(delta)) return null;
        for(let j=0;j<=m;j++) { if(used[j]) { u[p[j]]+=delta; v[j]-=delta; } else minv[j]-=delta; }
        j0=j1;
      } while(p[j0]!==0);
      do { const j1=way[j0]; p[j0]=p[j1]; j0=j1; } while(j0);
    }
    const assign=new Array(n).fill(-1);
    for(let j=1;j<=m;j++) if(p[j]>0) assign[p[j]-1]=j-1;
    return assign;
  }

  function recipeUsage(catalog) {
    const usage=new Map();
    for(const product of catalog.products||[]) for(const recipe of product.recipes||[]) {
      for(const tag of recipe.markers||[]) {
        const t=normTag(tag); if(!usage.has(t)) usage.set(t,[]);
        usage.get(t).push({productId:product.id,productName:product.name,recipeId:recipe.id,recipeName:recipe.name});
      }
    }
    return usage;
  }

  function recipeConflictCount(recipes) {
    const seen=new Map(); let duplicates=0;
    for(const r of recipes) for(const raw of r.markers||[]) {
      const tag=normTag(raw), n=(seen.get(tag)||0)+1; seen.set(tag,n); if(n>1) duplicates++;
    }
    return {duplicates, unique:seen.size, total:[...seen.values()].reduce((a,b)=>a+b,0), counts:seen};
  }

  function exactCompatible(recipes) { return recipeConflictCount(recipes).duplicates===0; }

  function findExactGroup(catalog, target) {
    const products=(catalog.products||[]).slice().sort((a,b)=>Math.min(...a.recipes.map(r=>r.markers.length))-Math.min(...b.recipes.map(r=>r.markers.length)));
    let best=[]; const used=new Set();
    function dfs(i, chosen) {
      if(chosen.length>=target) { best=chosen.slice(); return true; }
      if(chosen.length+(products.length-i)<target) return false;
      if(i>=products.length) return false;
      const product=products[i];
      for(const recipe of product.recipes) {
        let ok=true; for(const t of recipe.markers) if(used.has(t)){ok=false;break;}
        if(!ok) continue;
        for(const t of recipe.markers) used.add(t); chosen.push({product,recipe});
        if(dfs(i+1,chosen)) return true;
        chosen.pop(); for(const t of recipe.markers) used.delete(t);
      }
      if(dfs(i+1,chosen)) return true;
      return false;
    }
    return dfs(0,[]) ? best : null;
  }

  function maximumExactGroup(catalog, maxTarget=10) {
    for(let n=maxTarget;n>=1;n--) { const g=findExactGroup(catalog,n); if(g) return g; }
    return [];
  }

  function optimizeRecipes(selected, paletteItems, options={}) {
    const palette=buildPalette(paletteItems), maps=paletteMaps(palette);
    const maxDelta=Number(options.maxDelta ?? 5);
    const changePenalty=Number(options.changePenalty ?? 8);
    const lockedByRecipe=options.lockedByRecipe||{};
    const weightByRecipeTag=options.weightByRecipeTag||{};
    const slots=[];
    for(const entry of selected) {
      const recipe=entry.recipe||entry;
      const product=entry.product||{id:recipe.productId||'',name:recipe.productName||''};
      for(const rawTag of recipe.markers||[]) {
        const tag=normTag(rawTag), src=maps.byTag.get(tag);
        if(!src) return {ok:false,reason:`Marcador desconocido: ${tag}`};
        const w=Number((weightByRecipeTag[recipe.id]||{})[tag] ?? 1);
        slots.push({product,recipe,tag,src,weight:Number.isFinite(w)&&w>0?w:1});
      }
    }
    if(slots.length>palette.length) return {ok:false,reason:`Se necesitan ${slots.length} colores únicos y la paleta tiene ${palette.length}.`};
    const cost=slots.map(slot=>{
      const locked=new Set((lockedByRecipe[slot.recipe.id]||[]).map(normTag));
      return palette.map(p=>{
        if(locked.has(slot.tag) && p.tag!==slot.tag) return BIG;
        const d=deltaE00(slot.src.lab,p.lab);
        if(p.tag!==slot.tag && d>maxDelta) return BIG;
        return p.tag===slot.tag ? 0 : changePenalty + d*slot.weight;
      });
    });
    const assignment=hungarian(cost); if(!assignment) return {ok:false,reason:'No se encontró una asignación completa.'};
    const changes=[], outputByRecipe={}; let totalCost=0,totalDelta=0,maxUsedDelta=0;
    for(let i=0;i<slots.length;i++) {
      const j=assignment[i]; if(j<0 || cost[i][j]>=BIG/2) return {ok:false,reason:'No existe solución dentro del ΔE máximo elegido.'};
      const slot=slots[i], dest=palette[j], d=deltaE00(slot.src.lab,dest.lab); totalCost+=cost[i][j];
      if(!outputByRecipe[slot.recipe.id]) outputByRecipe[slot.recipe.id]={productId:slot.product.id,productName:slot.product.name,recipeId:slot.recipe.id,recipeName:slot.recipe.name,markers:[]};
      outputByRecipe[slot.recipe.id].markers.push(dest.tag);
      if(dest.tag!==slot.tag) { changes.push({productId:slot.product.id,productName:slot.product.name,recipeId:slot.recipe.id,recipeName:slot.recipe.name,from:slot.tag,to:dest.tag,fromHex:slot.src.hex,toHex:dest.hex,deltaE:d,weight:slot.weight}); totalDelta+=d*slot.weight; maxUsedDelta=Math.max(maxUsedDelta,d); }
    }
    const perRecipeChanges={}; for(const c of changes) perRecipeChanges[c.recipeId]=(perRecipeChanges[c.recipeId]||0)+1;
    if(Number.isFinite(options.maxChangesPerRecipe)) {
      for(const [rid,n] of Object.entries(perRecipeChanges)) if(n>options.maxChangesPerRecipe) return {ok:false,reason:`La solución requiere ${n} cambios en ${rid}, sobre el máximo permitido.`};
    }
    return {ok:true, selected, slots:slots.length, utilization:slots.length/palette.length, changes, changeCount:changes.length, totalDelta, meanChangedDelta:changes.length?totalDelta/changes.length:0,maxUsedDelta,totalCost,outputByRecipe};
  }

  function chooseRecipeForUsed(product, used) {
    let best=null;
    for(const recipe of product.recipes) {
      let conflicts=0; for(const t of recipe.markers) if(used.has(t)) conflicts++;
      const score=conflicts*1000+recipe.markers.length;
      if(!best||score<best.score) best={recipe,score,conflicts};
    }
    return best;
  }

  function seededRandom(seed) {
    let s=(seed>>>0)||0x12345678;
    return function(){ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)/4294967296); };
  }

  function generateCandidateGroups(catalog,target,tries=80,seed=20260820) {
    const products=catalog.products||[], rnd=seededRandom(seed), map=new Map();
    for(let attempt=0;attempt<tries;attempt++) {
      const remaining=products.slice().sort(()=>rnd()-.5), selected=[], used=new Set();
      while(selected.length<target && remaining.length) {
        let bestIndex=-1,bestChoice=null,bestScore=Infinity;
        const sampleCount=Math.min(remaining.length, 10);
        for(let s=0;s<sampleCount;s++) {
          const idx=Math.floor(rnd()*remaining.length), product=remaining[idx], choice=chooseRecipeForUsed(product,used);
          const jitter=rnd()*2, score=choice.conflicts*10 + choice.recipe.markers.length/20 + jitter;
          if(score<bestScore){bestScore=score;bestIndex=idx;bestChoice=choice;}
        }
        const product=remaining.splice(bestIndex,1)[0]; selected.push({product,recipe:bestChoice.recipe});
        for(const t of bestChoice.recipe.markers) used.add(t);
      }
      if(selected.length!==target) continue;
      const key=selected.map(x=>x.product.id+':'+x.recipe.id).sort().join('|');
      const conflicts=recipeConflictCount(selected.map(x=>x.recipe)).duplicates;
      if(!map.has(key)||conflicts<map.get(key).conflicts) map.set(key,{selected,conflicts});
    }
    return [...map.values()].sort((a,b)=>a.conflicts-b.conflicts).slice(0,30);
  }

  function searchOptimizedGroup(catalog,paletteItems,target,options={}) {
    const candidates=generateCandidateGroups(catalog,target,Number(options.tries??120),Number(options.seed??20260820));
    let best=null, tested=0;
    for(const c of candidates) {
      const res=optimizeRecipes(c.selected,paletteItems,options); tested++;
      if(!res.ok) continue;
      res.currentConflicts=c.conflicts;
      const score=res.changeCount*10000+res.totalDelta*100+res.maxUsedDelta;
      res.searchScore=score;
      if(!best||score<best.searchScore) best=res;
    }
    return best ? {...best,testedCandidates:tested} : {ok:false,reason:`No se encontró solución para ${target} productos con estos límites.`,testedCandidates:tested};
  }

  function catalogStats(catalog,paletteItems) {
    const usage=recipeUsage(catalog), palette=buildPalette(paletteItems);
    const recipes=(catalog.products||[]).flatMap(p=>p.recipes||[]);
    const unused=palette.filter(p=>!usage.has(p.tag));
    const ranked=palette.map(p=>({tag:p.tag,hex:p.hex,count:(usage.get(p.tag)||[]).length,uses:usage.get(p.tag)||[]})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag,undefined,{numeric:true}));
    return {products:(catalog.products||[]).length,recipes:recipes.length,paletteCount:palette.length,unused,ranked,usage};
  }

  root.PBNOptimizerCore={hexToRgb,rgbToLab,deltaE00,buildPalette,recipeUsage,recipeConflictCount,exactCompatible,findExactGroup,maximumExactGroup,optimizeRecipes,searchOptimizedGroup,catalogStats};
  if(typeof module!=='undefined'&&module.exports) module.exports=root.PBNOptimizerCore;
})(typeof window!=='undefined'?window:globalThis);
