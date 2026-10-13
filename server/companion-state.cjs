'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {ROSTER,xpForLevel}=require('./companions.cjs');

const validInt=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
function validate(data){
  if(!data||data.v!==1||!Array.isArray(data.actors)||data.actors.length>ROSTER.length)throw Error('invalid companion state');
  const seen=new Set();
  for(const b of data.actors){
    if(!b||!/^companion-(10|[1-9])$/.test(b.id)||seen.has(b.id)||
      !validInt(b.level,1,30)||!validInt(b.xp,0,xpForLevel(b.level)-1)||
      !validInt(b.hp,0,90+b.level*12)||!validInt(b.kills,0,1e9)||
      !validInt(b.deaths,0,1e9)||!validInt(b.tasksCompleted,0,1e8)||
      !b.task||!['RAT','SNAKE','SPIDER','WOLF','ORC'].includes(b.task.type)||
      !validInt(b.task.progress,0,5))throw Error('invalid companion actor');
    seen.add(b.id);
  }
  return data.actors;
}
function createCompanionState(stateFile,{logger=console}={}){
  const file=path.join(path.dirname(stateFile),'companion-state.json');
  const backup=file+'.bak';
  let writable=true,loadedFrom='new',lastSavedAt=null,lastSaveSucceeded=null,lastError=null;
  function parse(filePath){return validate(JSON.parse(fs.readFileSync(filePath,'utf8')));}
  function copyAtomic(source,dest){const temp=dest+'.tmp-'+process.pid;fs.copyFileSync(source,temp);fs.renameSync(temp,dest);}
  function preserveCorrupt(){
    const dest=file+'.corrupt-'+Date.now()+'-'+process.pid;
    fs.copyFileSync(file,dest,fs.constants.COPYFILE_EXCL);
    logger.error('[companions] estado principal inválido, preservado em '+dest);
  }
  function load(){
    if(!fs.existsSync(file)){
      if(fs.existsSync(backup)){try{loadedFrom='backup';return parse(backup);}catch(e){logger.error('[companions] backup inválido: '+e.message);writable=false;}}
      return [];
    }
    try{loadedFrom='primary';return parse(file);}
    catch(error){
      logger.error('[companions] estado inválido: '+error.message);
      try{preserveCorrupt();}catch(e){writable=false;logger.error('[companions] não foi possível preservar estado inválido: '+e.message);}
      if(fs.existsSync(backup)){try{loadedFrom='backup';return parse(backup);}catch(e){logger.error('[companions] backup inválido: '+e.message);}}
      loadedFrom='new';return [];
    }
  }
  function save(actors){
    // A disabled or unavailable roster must never replace the last playable state.
    if(!Array.isArray(actors)||actors.length===0)return false;
    if(!writable){lastSaveSucceeded=false;lastError='preservation_unavailable';return false;}
    const data={v:1,savedAt:new Date().toISOString(),actors};
    const temp=file+'.tmp-'+process.pid;
    try{
      validate(data);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      if(fs.existsSync(file)){
        // Only a fully validated previous primary can become the fallback.
        try{parse(file);copyAtomic(file,backup);}catch{}
      }
      fs.writeFileSync(temp,JSON.stringify(data),'utf8');
      fs.renameSync(temp,file);
      if(!fs.existsSync(backup)){
        try{copyAtomic(file,backup);}catch(e){logger.error('[companions] falha ao criar backup inicial: '+e.message);}
      }
      lastSavedAt=Date.now();lastSaveSucceeded=true;lastError=null;
      return true;
    }catch(e){lastSaveSucceeded=false;lastError=e.message;logger.error('[companions] falha ao salvar: '+e.message);return false;}
  }
  return {file,load,save,status:()=>({file,loadedFrom,writable,lastSavedAt,lastSaveSucceeded,lastError})};
}
module.exports={createCompanionState,validate};
