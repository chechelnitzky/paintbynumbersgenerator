(function(root){
  'use strict';
  const KEY='pbn_studio_library_v1';
  const ACTIVE='pbn_studio_active_project_v1';
  function uid(prefix='id'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
  function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'{"projects":[]}');return x&&Array.isArray(x.projects)?x:{projects:[]};}catch{return {projects:[]};}}
  function write(db){localStorage.setItem(KEY,JSON.stringify(db));return db;}
  function list(){return read().projects.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
  function get(id){return read().projects.find(p=>p.id===id)||null;}
  function upsert(project){const db=read();const now=new Date().toISOString();let p=db.projects.find(x=>x.id===project.id);if(p){Object.assign(p,project,{updatedAt:now});}else{p={id:project.id||uid('design'),createdAt:now,updatedAt:now,name:project.name||'Sin nombre',status:'draft',versions:[],...project};db.projects.push(p);}write(db);return p;}
  function addVersion(projectId,version){const db=read();const p=db.projects.find(x=>x.id===projectId);if(!p)throw new Error('Proyecto no encontrado');const now=new Date().toISOString();const v={id:version.id||uid('ver'),name:version.name||`Versión ${p.versions.length+1}`,status:version.status||'draft',createdAt:now,updatedAt:now,...version};p.versions.push(v);p.updatedAt=now;write(db);return v;}
  function updateVersion(projectId,versionId,patch){const db=read();const p=db.projects.find(x=>x.id===projectId);if(!p)throw new Error('Proyecto no encontrado');const v=p.versions.find(x=>x.id===versionId);if(!v)throw new Error('Versión no encontrada');Object.assign(v,patch,{updatedAt:new Date().toISOString()});p.updatedAt=v.updatedAt;write(db);return v;}
  function removeProject(id){const db=read();db.projects=db.projects.filter(p=>p.id!==id);write(db);if(localStorage.getItem(ACTIVE)===id)localStorage.removeItem(ACTIVE);}
  function setActive(id){if(id)localStorage.setItem(ACTIVE,id);else localStorage.removeItem(ACTIVE);}
  function getActive(){return localStorage.getItem(ACTIVE)||'';}
  function exportAll(){return {schema:1,exportedAt:new Date().toISOString(),...read()};}
  function importAll(payload,merge=true){if(!payload||!Array.isArray(payload.projects))throw new Error('Respaldo inválido');if(!merge){write({projects:payload.projects});return;}const db=read(),map=new Map(db.projects.map(p=>[p.id,p]));for(const p of payload.projects){if(!p||!p.id)continue;map.set(p.id,p);}write({projects:[...map.values()]});}
  root.PBNStudioStorage={uid,list,get,upsert,addVersion,updateVersion,removeProject,setActive,getActive,exportAll,importAll};
})(typeof window!=='undefined'?window:globalThis);
