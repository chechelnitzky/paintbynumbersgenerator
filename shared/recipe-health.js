(function(root){
'use strict';
const C=root.PBNCloud;
if(!C||C.__recipeHealthInstalled)return;
C.__recipeHealthInstalled=true;
const MIN_MARKERS=3,MAX_MARKERS=30;
function validMarkers(tags){
  if(!Array.isArray(tags))return false;
  const clean=tags.map(String).filter(Boolean);
  return clean.length>=MIN_MARKERS&&clean.length<=MAX_MARKERS&&new Set(clean).size===clean.length;
}
C.isValidRecipe=function(recipe){return validMarkers(recipe?.markerTags||recipe?.markers||[])};
const originalProjects=C.loadProjects.bind(C);
C.loadProjects=async function(){
  const projects=await originalProjects();
  for(const p of projects||[])for(const v of p.versions||[]){
    v.recipeValid=validMarkers(v.markerTags||[]);
    if(!v.recipeValid){
      v.recipeOriginalStatus=v.status;
      if(['approved','validated','applied'].includes(v.status))v.status='corrupt';
      v.recipeHealth='corrupt';
    }else v.recipeHealth='ok';
  }
  return projects;
};
const originalCatalog=C.loadCatalog.bind(C);
C.loadCatalog=async function(){
  const cat=await originalCatalog();
  const excluded=[];
  cat.products=(cat.products||[]).map(p=>{
    const good=[],bad=[];
    for(const r of p.recipes||[]){(validMarkers(r.markers)?good:bad).push(r)}
    if(bad.length)excluded.push(...bad.map(r=>({product:p.name,recipe:r.name,markers:[...(r.markers||[])]})));
    return {...p,recipes:good};
  }).filter(p=>p.recipes.length);
  cat.invalidRecipes=excluded;
  cat.recipeHealth={excluded:excluded.length,minMarkers:MIN_MARKERS,maxMarkers:MAX_MARKERS};
  return cat;
};
})(window);