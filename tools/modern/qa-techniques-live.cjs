// Connected, disposable browser/backend QA for weapon techniques. No production accounts.
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'work/weapon-techniques-20261007/qa');
const run=path.join(out,`${process.argv.includes('--enchant-random')?'enchant-random-':process.argv.includes('--enchant')?'enchant-':''}live-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const frames=[],pageErrors=[];
let phase='setup',backend=null,web=null,browser=null,page=null,backendLog='';
const password='TechQa'+crypto.randomBytes(8).toString('hex')+'!';
const rich='TQR'+crypto.randomBytes(3).toString('hex');
const poor='TQP'+crypto.randomBytes(3).toString('hex');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary',
  '.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff2':'font/woff2'};

async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function account(name,gold){
  const transport='s256:'+crypto.createHash('sha256').update(password).digest('hex');
  const salt=crypto.randomBytes(16).toString('hex');
  const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
  const now=Date.now();
  const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'].map(k=>[k,{val:18,xp:0,xpNext:2400}]));
  const save={v:2,x:72,y:33,skills,gold,inv:{ESPADA_HL:1,ESPADA_HL_PLUS_5:1,ARCO:1,FLECHA:100,POTION:30},
    equipped:{weapon:'ESPADA_PLUS_5',offhand:null,armor:null,head:null,feet:null,neck:null},
    chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
    hp:1000,maxHp:1000,mp:500,maxMp:500,pvp:false,savedAt:now};
  return {name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null};
}
function disk(name){
  const db=JSON.parse(fs.readFileSync(path.join(run,'accounts.json'),'utf8'));
  return db.accounts.find(a=>a.name===name);
}
async function startWeb(){
  web=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    const url=['/jogar','/jogar3d','/'].includes(u.pathname)?'/play.html':u.pathname;
    const file=path.resolve(root,'.'+url);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>web.listen(0,'127.0.0.1',r));return web.address().port;
}
async function startBackend(port,enabled,fixture=false){
  const injection=`process.on('message',msg=>{
    if(msg?.t!=='qaSpawnTechMob')return;
    const p=[...players.values()].find(x=>x.name===msg.name);
    if(!p){process.send({t:'qaSpawnTechError',error:'player_missing'});return;}
    // The real server's post-restart safety window returns players to town.
    // Move this disposable fixture to an ordinary walkable combat tile.
    if(!isWalkable(72,33)){process.send({t:'qaSpawnTechError',error:'fixture_tile_blocked'});return;}
    p.x=72;p.y=33;correctMovement(p,'qa_fixture');
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
      const x=p.x+dx,y=p.y+dy;
      if(!isWalkable(x,y)||mobAt(x,y,p.floor||0))continue;
      const m=spawnMob('SOMBRA',x,y,p.floor||0);
      if(!m)continue;
      m.unique=true;m.hp=800;m.maxHp=800;m.dmg=0;m.frozenUntil=Date.now()+120000;
      sendTo(p.id,{t:'mobs',list:snapshotMobs(p.floor||0)});
      process.send({t:'qaSpawnTechMob',mob:{id:m.id,x:m.x,y:m.y,hp:m.hp,floor:m.floor||0}});
      return;
    }
    process.send({t:'qaSpawnTechError',error:'no_adjacent_tile',player:{x:p.x,y:p.y,floor:p.floor}});
  });`;
  const areaInjection=`function qaAreaPlayer(name){return [...players.values()].find(p=>p.name===name);}
function qaAreaFreeze(m,hp,unique=true){
  m.unique=unique;m.hp=hp;m.maxHp=hp;m.dmg=0;m.aggro=0;m.speed=999999999;
  m.frozenUntil=Date.now()+3600000;m.lastMoveAt=Date.now()+3600000;
  m.lastAttackAt=Date.now()+3600000;return m;
}
function qaAreaMob(type,x,y,floor,hp,unique=true){
  const m=spawnMob(type,x,y,floor);
  if(!m)throw Error('spawn failed '+type+' '+x+','+y+' floor '+floor);
  return qaAreaFreeze(m,hp,unique);
}
function qaAreaClear(x,y,floor){
  for(const m of [...monsters.values()])if((m.floor||0)===floor && chebyshev(m.x,m.y,x,y)<=9)monsters.delete(m.id);
}
function qaAreaFind(id,p){
  const d=(id==='ranged'||id==='staff')?3:id==='spear'?2:1;
  const range=id==='ranged'?8:id==='staff'?6:id==='spear'?3:1;
  for(let y=20;y<81;y++)for(let x=60;x<90;x++){
    const origin={x,y},main={x:x+d,y};
    const cells=weaponTechniques.cells(id,origin,main,range)
      .filter(c=>c.x!==main.x||c.y!==main.y);
    const limit=weaponTechniques.BY_ID[id].secondary.length;
    const secondary=cells.slice(0,limit),extra=cells.slice(limit,limit+1);
    if(secondary.length!==limit)continue;
    const all=[origin,main,...secondary,...extra];
    if(all.some(c=>!isWalkable(c.x,c.y)||inPzBuffer(c.x,c.y)||inSanctuary(c.x,c.y)))continue;
    const dummy={...p,floor:0};
    if(all.slice(1).some(c=>!techniqueLineClear(dummy,x,y,c.x,c.y)))continue;
    return {origin,main,secondary,extra,range};
  }
  return null;
}
function qaAreaPz(p){
  for(let y=46;y<=54;y++){
    const origin={x:60,y},main={x:59,y},secondary=[{x:58,y},{x:57,y}];
    const all=[origin,main,...secondary];
    if(all.some(c=>!isWalkable(c.x,c.y)))continue;
    if(inPzBuffer(origin.x,origin.y)||inPzBuffer(main.x,main.y))continue;
    if(secondary.some(c=>!inPzBuffer(c.x,c.y)||inSafe(c.x,c.y)))continue;
    return {origin,main,secondary,extra:[],range:8};
  }
  return null;
}
function qaAreaDiagonal(p){
  for(let y=20;y<81;y++)for(let x=60;x<90;x++){
    const origin={x,y},main={x:x+4,y:y+1};
    const secondary=weaponTechniques.cells('ranged',origin,main,8);
    const all=[origin,main,...secondary];
    if(secondary.length!==2||all.some(c=>!isWalkable(c.x,c.y)||inPzBuffer(c.x,c.y)||inSanctuary(c.x,c.y)))continue;
    const dummy={...p,floor:0};
    if(all.slice(1).some(c=>!techniqueLineClear(dummy,x,y,c.x,c.y)))continue;
    return {origin,main,secondary,extra:[],range:8};
  }
  return null;
}
function qaAreaDungeonWall(p){
  const floor=1,g=getDungeonFloor(floor),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const o of g.floorTiles)for(const [dx,dy] of dirs){
    const origin={x:o.x,y:o.y},mid={x:o.x+dx,y:o.y+dy},main={x:o.x+2*dx,y:o.y+2*dy};
    const wall={x:o.x+3*dx,y:o.y+3*dy},far={x:o.x+4*dx,y:o.y+4*dy};
    if(!dungeonTileWalkable(floor,mid.x,mid.y)||!dungeonTileWalkable(floor,main.x,main.y)||
       dungeonTileWalkable(floor,wall.x,wall.y)||!dungeonTileWalkable(floor,far.x,far.y))continue;
    if(!isWalkable(wall.x,wall.y)||!isWalkable(far.x,far.y)||!hasLineOfSight(origin.x,origin.y,main.x,main.y))continue;
    if(isTransitionTile(floor,main.x,main.y)||isTransitionTile(floor,far.x,far.y))continue;
    return {origin,main,secondary:[wall,far],wall,far,range:8,floor};
  }
  return null;
}
function qaAreaOtherFloor(p){
  const g=getDungeonFloor(1),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const c of g.floorTiles)for(const [dx,dy] of dirs){
    const secondary={x:c.x,y:c.y},main={x:c.x-dx,y:c.y-dy},origin={x:c.x-3*dx,y:c.y-3*dy};
    if([origin,main,secondary].some(q=>!isWalkable(q.x,q.y)||inPzBuffer(q.x,q.y)||inSanctuary(q.x,q.y)))continue;
    if(!hasLineOfSight(origin.x,origin.y,main.x,main.y))continue;
    return {origin,main,secondary:[secondary],extra:[],range:8};
  }
  return null;
}
process.on('message',msg=>{
  if(msg?.t==='qaAreaInspect'){
    const p=qaAreaPlayer(msg.name),r=p&&rankings.get(p.name);
    process.send({t:'qaAreaInspect',requestId:msg.requestId,player:p?{floor:p.floor,x:p.x,y:p.y,
      skills:JSON.parse(JSON.stringify(p.skills)),quests:JSON.parse(JSON.stringify(p.quests)),gold:p.gold}:null,
      ranking:r?JSON.parse(JSON.stringify(r)):null,
      mobs:(msg.ids||[]).map(id=>{const m=monsters.get(id);return {id,alive:!!m,hp:m?.hp??null,x:m?.x,y:m?.y,floor:m?.floor??null};})});
    return;
  }
  if(msg?.t!=='qaAreaSetup')return;
  const p=qaAreaPlayer(msg.name);
  if(!p){process.send({t:'qaAreaError',requestId:msg.requestId,error:'player_missing'});return;}
  try{
    const kind=msg.kind||'family',id=msg.id;
    let spec=kind==='pz'?qaAreaPz(p):kind==='diagonal'?qaAreaDiagonal(p):kind==='dungeonWall'?qaAreaDungeonWall(p):
      kind==='otherFloor'?qaAreaOtherFloor(p):qaAreaFind(id,p);
    if(!spec)throw Error('no_fixture_site '+kind+' '+id);
    const floor=kind==='dungeonWall'?1:0;
    if(floor===1 && (p.floor||0)!==1)enterDungeonFloor(p,p.id,1,'down');
    if(floor===0 && (p.floor||0)!==0)returnPlayerToTown(p,p.id);
    qaAreaClear(spec.origin.x,spec.origin.y,floor);
    p.x=spec.origin.x;p.y=spec.origin.y;p.floor=floor;
    correctMovement(p,'qa_area');resetTechniqueCharge(p);sendTechniqueState(p);
    const main=qaAreaMob('SOMBRA',spec.main.x,spec.main.y,floor,800);
    const secondary=spec.secondary.map((c,i)=>{
      const otherFloor=kind==='otherFloor';
      const type=msg.killSecondary&&i===0?'ORC':'SOMBRA';
      const hp=msg.killSecondary&&i===0?(msg.killHp||10):400;
      return qaAreaMob(type,c.x,c.y,otherFloor?1:floor,hp,!msg.killSecondary||i!==0);
    });
    const extra=(spec.extra||[]).map(c=>qaAreaMob('SOMBRA',c.x,c.y,floor,400));
    sendTo(p.id,{t:'mobs',list:snapshotMobs(floor)});
    process.send({t:'qaAreaReady',requestId:msg.requestId,kind,id,floor,
      origin:spec.origin,main:{id:main.id,...spec.main,hp:main.hp},
      secondary:secondary.map((m,i)=>({id:m.id,...spec.secondary[i],hp:m.hp,floor:m.floor||0})),
      extra:extra.map((m,i)=>({id:m.id,...spec.extra[i],hp:m.hp})),
      wall:spec.wall,far:spec.far,range:spec.range});
  }catch(e){process.send({t:'qaAreaError',requestId:msg.requestId,error:e.stack||String(e)});}
});`;
  const enchantInjection=`process.on('message',msg=>{
  if(!msg?.t?.startsWith('qaEnchant'))return;
  const p=qaAreaPlayer(msg.name);
  if(!p){process.send({t:'qaEnchantError',requestId:msg.requestId,error:'player_missing'});return;}
  try{
    if(msg.t==='qaEnchantInspect'){
      process.send({t:'qaEnchantInspect',requestId:msg.requestId,player:{x:p.x,y:p.y,floor:p.floor||0,
        hp:p.hp,maxHp:p.maxHp,mp:p.mp,maxMp:p.maxMp,gold:p.gold,inv:{...p.inv},equipped:{...p.equipped},
        enchantToken:p.enchantToken,enchantOps:JSON.parse(JSON.stringify(p.enchantOps||[])),equipmentVersion:p.equipmentVersion},
        mobs:(msg.ids||[]).map(id=>{const m=monsters.get(id);return {id,alive:!!m,hp:m?.hp??null};})});
      return;
    }
    if(msg.t==='qaEnchantVersion'){
      p.equipmentVersion=msg.version;
      process.send({t:'qaEnchantVersion',requestId:msg.requestId,version:p.equipmentVersion});return;
    }
    if(msg.t==='qaEnchantBench'){
      p.floor=0;p.x=51;p.y=52;p._tabActive=false;correctMovement(p,'qa_enchant_bench');
      process.send({t:'qaEnchantBench',requestId:msg.requestId,x:p.x,y:p.y});return;
    }
    if(msg.t==='qaEnchantCombat'){
      const x=72,y=33;
      qaAreaClear(x,y,0);p.floor=0;p.x=x;p.y=y;
      if(msg.neck)p.equipped.neck=msg.neck;
      p.hp=msg.hp??100;p.mp=msg.mp??100;p._tabActive=false;
      p._regenHpAt=Date.now()+3600000;p._regenMpAt=Date.now()+3600000;
      p._spellWindow=null;resetTechniqueCharge(p);
      if(Number.isInteger(msg.charge)&&p._weaponTechniqueCharge)p._weaponTechniqueCharge.count=msg.charge;
      correctMovement(p,'qa_enchant_combat');broadcastPstatsAll(p);
      const main=qaAreaMob('SOMBRA',x+1,y,0,msg.mainHp??800);
      const secondary=msg.secondaryHp==null?null:qaAreaMob('ORC',x+1,y-1,0,msg.secondaryHp);
      sendTo(p.id,{t:'mobs',list:snapshotMobs(0)});
      process.send({t:'qaEnchantCombat',requestId:msg.requestId,main:{id:main.id,hp:main.hp},
        secondary:secondary?{id:secondary.id,hp:secondary.hp}:null,hp:p.hp,mp:p.mp});return;
    }
    process.send({t:'qaEnchantError',requestId:msg.requestId,error:'unknown'});
  }catch(e){process.send({t:'qaEnchantError',requestId:msg.requestId,error:e.stack||String(e)});}
});`;
  const entry=`const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){
  if(Number(port)===Number(process.env.PORT||8097)&&(rest.length===0||typeof rest[0]==='function'))
    return listen.call(this,port,'127.0.0.1',...rest);
  return listen.call(this,port,...rest);
};const file=path.resolve('server/server.js'),m=new Module(file,module);m.filename=file;
m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8')+${JSON.stringify(injection+areaInjection+enchantInjection)},file);
const realNow=Date.now;Date.now=()=>realNow()+181000;`;
  backend=spawn(process.execPath,fixture?['-e',entry]:[path.join(root,'tools/modern/backend-local.cjs')],{
    cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,
      NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),PORT:String(port),
      STATE_FILE_PATH:path.join(run,'state.json'),ACCOUNTS_FILE_PATH:path.join(run,'accounts.json'),
      MP_CREDITED_PATH:path.join(run,'mp_credited.json'),ADMIN_NAME:'__qa_disabled__',ADMIN_TOKEN:'',
      MP_ACCESS_TOKEN:'',RESEND_API_KEY:'',ALERTS_ENABLED:'0',WEAPON_TECHNIQUES_ENABLED:enabled?'1':'0'}});
  backend.stdout.on('data',c=>backendLog+=c.toString());backend.stderr.on('data',c=>backendLog+=c.toString());
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    if(backend.exitCode!==null)throw Error('backend exited: '+backend.exitCode+' '+backendLog.slice(-1200));
    try{await new Promise((resolve,reject)=>{
      const req=http.get(`http://127.0.0.1:${port}/health`,res=>{res.resume();res.statusCode===200?resolve():reject(Error(String(res.statusCode)));});
      req.once('error',reject);req.setTimeout(500,()=>req.destroy());
    });return;}catch{await sleep(100);}
  }
  throw Error('backend startup timeout: '+backendLog.slice(-1200));
}
async function stopBackend(){if(!backend)return;const child=backend;backend=null;child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);}
function attach(tab){
  tab.on('websocket',socket=>{for(const [kind,direction] of [['framesent','sent'],['framereceived','received']])socket.on(kind,raw=>{
    try{const m=JSON.parse(raw.payload);if(['authOk','authFail','techniqueBuy','techniqueToggle','techniqueState','techniqueProc','attackMob','combatImpact','mobUpdate','mobKill','mobDead','mobFloat','invUpdate','questProgress','groundSpawn','dungeonEnter','dungeonExit','invEnchant','spellCast','pstats'].includes(m.t))frames.push({direction,m,at:Date.now()});}catch{}
  });});
  tab.on('pageerror',e=>pageErrors.push(e.message));
}
async function waitFrame(start,predicate,label,ms=12000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){const value=frames.slice(start).find(f=>predicate(f));if(value)return value;await sleep(40);}
  throw Error(`timeout ${label}; last=${JSON.stringify(frames.slice(-8))}`);
}
async function login(browser,webPort,port,name){
  const tab=await browser.newPage({viewport:{width:1440,height:900}});attach(tab);
  await tab.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
  await tab.goto(`http://127.0.0.1:${webPort}/jogar3d?ws=ws://127.0.0.1:${port}`,{waitUntil:'domcontentloaded'});
  await tab.locator('#charInput').fill(name);await tab.locator('#pwdInput').fill(password);
  await tab.locator('button[onclick="tryLogin(true)"]').click();
  await tab.waitForFunction(()=>started&&_wsAuthed&&myWsId&&window.ValadaresModern?.state==='ready',null,{timeout:30000});
  const refuse=tab.getByRole('button',{name:'Recusar',exact:true});if(await refuse.isVisible())await refuse.click();
  const dismiss=tab.locator('#firstStepsDismiss');if(await dismiss.isVisible())await dismiss.click();
  await tab.keyboard.press('Escape');return tab;
}
async function send(tab,m,label){
  const start=frames.length;await tab.evaluate(x=>ws.send(JSON.stringify(x)),m);
  const f=await waitFrame(start,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.result?.action===m.t,label);
  return f.m;
}
function state(tab){return tab.evaluate(()=>({gold:player.gold,weapon:player.equipped?.weapon,techniques:player.weaponTechniques,
  visible:document.getElementById('talentsModal')?.style.display,techniqueText:document.getElementById('talentsModal')?.innerText.slice(-1600)}));}
async function closeTab(){if(page&&!page.isClosed())await page.close();page=null;}
async function spawnMobFixture(name){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{backend.off('message',onMessage);reject(Error('fixture IPC timeout'));},5000);
    function onMessage(value){if(value?.t!=='qaSpawnTechMob'&&value?.t!=='qaSpawnTechError')return;
      clearTimeout(timer);backend.off('message',onMessage);
      value.t==='qaSpawnTechMob'?resolve(value.mob):reject(Error(JSON.stringify(value)));
    }
    backend.on('message',onMessage);backend.send({t:'qaSpawnTechMob',name});
  });
}
async function areaIpc(message){
  const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{backend.off('message',onMessage);reject(Error('area IPC timeout '+message.t));},8000);
    function onMessage(value){if(value?.requestId!==requestId)return;
      clearTimeout(timer);backend.off('message',onMessage);
      (value.t==='qaAreaError'||value.t==='qaEnchantError')?reject(Error(value.error)):resolve(value);
    }
    backend.on('message',onMessage);backend.send({...message,requestId});
  });
}

async function main(){
  fs.mkdirSync(run,{recursive:true});
  const now=Date.now();fs.writeFileSync(path.join(run,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts:[account(rich,45000),account(poor,19000)]}));
  const port=await freePort(),webPort=await startWeb();await startBackend(port,true);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  phase='purchase';page=await login(browser,webPort,port,rich);
  const initial=await waitFrame(0,f=>f.direction==='received'&&f.m.t==='techniqueState','initial technique state');
  assert.equal(initial.m.gold,45000);assert.deepEqual(initial.m.state,{v:1,owned:[],disabled:[]});
  for(const badId of ['__proto__','constructor','toString','unarmed']){
    const forged=await send(page,{t:'techniqueBuy',id:badId},`reject inherited id ${badId}`);
    assert.equal(forged.result.ok,false,`inherited ID ${badId} rejected`);
    assert.equal(forged.gold,45000);assert.deepEqual(forged.state.owned,[]);
  }
  phase='UI purchase';await page.keyboard.press('k');
  const buy=page.locator('#weaponTechniquesPanel [data-technique-buy="sword"]');
  await buy.waitFor({state:'visible'});assert.equal(await buy.isEnabled(),true);
  const buyStart=frames.length;page.once('dialog',dialog=>dialog.accept());await buy.click();
  const first=(await waitFrame(buyStart,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.result?.action==='techniqueBuy'&&f.m.result?.id==='sword','UI buy sword')).m;
  assert(frames.slice(buyStart).some(f=>f.direction==='sent'&&f.m.t==='techniqueBuy'&&f.m.id==='sword'));
  assert.equal(first.result.ok,true);assert.equal(first.result.costGold,20000);
  assert.equal(first.gold,25000);assert.deepEqual(first.state.owned,['sword']);
  assert.equal(first.activeId,null,'common +5 cannot activate a bought technique');
  assert.equal(disk(rich).save.gold,25000);assert.deepEqual(disk(rich).weaponTechniques?.owned,['sword']);
  const replay=await send(page,{t:'techniqueBuy',id:'sword'},'repeat sword');
  assert.equal(replay.result.ok,true);assert.equal(replay.result.costGold,0);assert.equal(replay.gold,25000);
  phase='UI toggle';const toggleStart=frames.length;
  await page.locator('#weaponTechniquesPanel [data-technique-toggle="sword"]').click();
  const disabled=(await waitFrame(toggleStart,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.result?.action==='techniqueToggle'&&f.m.result?.id==='sword','UI disable sword')).m;
  assert(frames.slice(toggleStart).some(f=>f.direction==='sent'&&f.m.t==='techniqueToggle'&&f.m.id==='sword'&&f.m.enabled===false));
  assert.equal(disabled.result.ok,true);assert.deepEqual(disabled.state.disabled,['sword']);assert.equal(disabled.activeId,null);
  const enabled=await send(page,{t:'techniqueToggle',id:'sword',enabled:true},'enable sword');
  assert.equal(enabled.result.ok,true);assert.deepEqual(enabled.state.disabled,[]);
  await page.keyboard.press('k');
  phase='malicious saveUpload';await sleep(5200);
  const malicious=frames.length,forgedSave={...disk(rich).save,gold:99999999,
    weaponTechniques:{v:1,owned:['sword','axe','club','ranged','spear','staff','unarmed'],disabled:[]},
    qaTechniqueMarker:crypto.randomUUID()};
  await page.evaluate(data=>ws.send(JSON.stringify({t:'saveUpload',data})),forgedSave);
  await sleep(2300);
  assert.equal(disk(rich).save.qaTechniqueMarker,forgedSave.qaTechniqueMarker,'forged save reached persistence path');
  assert.deepEqual(disk(rich).weaponTechniques?.owned,['sword']);assert.deepEqual(disk(rich).save.weaponTechniques?.owned,['sword']);
  const persistedGold=disk(rich).save.gold;
  assert(persistedGold>=25000 && persistedGold<26000,'gold changed only by a small in-game reward');
  phase='poor account';await closeTab();const poorFrame=frames.length;page=await login(browser,webPort,port,poor);
  const poorInitial=(await waitFrame(poorFrame,f=>f.direction==='received'&&f.m.t==='techniqueState','poor initial state')).m;
  const insufficient=await send(page,{t:'techniqueBuy',id:'sword'},'insufficient gold');
  assert.equal(insufficient.result.ok,false);assert.equal(insufficient.result.error,'no_gold');
  assert.equal(insufficient.gold,poorInitial.gold);assert.equal(disk(poor).save.gold,19000);
  assert.deepEqual(disk(poor).weaponTechniques?.owned||[],[]);
  phase='restart';await closeTab();await stopBackend();await startBackend(port,true);
  const restartFrame=frames.length;page=await login(browser,webPort,port,rich);
  const afterRestart=await waitFrame(restartFrame,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.gold===persistedGold,'state after restart');
  assert.deepEqual(afterRestart.m.state.owned,['sword']);assert.equal(afterRestart.m.activeId,null);
  const equipStart=frames.length;
  await page.evaluate(()=>ws.send(JSON.stringify({t:'invEquip',itemKey:'ESPADA_HL'})));
  const legendary=await waitFrame(equipStart,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.activeId==='sword','legendary sword activation');
  assert.equal(legendary.m.weaponKey,'ESPADA_HL');
  const plusStart=frames.length;
  await page.evaluate(()=>ws.send(JSON.stringify({t:'invEquip',itemKey:'ESPADA_HL_PLUS_5'})));
  const legendaryPlus=await waitFrame(plusStart,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.weaponKey==='ESPADA_HL_PLUS_5','legendary +5');
  assert.equal(legendaryPlus.m.activeId,'sword');
  await sleep(2300);
  await page.keyboard.press('k');await page.waitForTimeout(250);
  const ui=await state(page);await page.screenshot({path:path.join(run,'talents-technique.png')});
  assert.match(ui.techniqueText,/Corte transversal|Cross cut/i);
  assert.equal(ui.visible,'flex');
  await page.keyboard.press('k');
  const layoutBefore=await page.evaluate(()=>document.body.classList.contains('layout-classic'));
  await page.evaluate(()=>document.getElementById('layoutModeBtn').click());
  const layoutAfter=await page.evaluate(()=>document.body.classList.contains('layout-classic'));
  assert.notEqual(layoutAfter,layoutBefore,'layout mode switched');
  await page.keyboard.press('k');await page.waitForTimeout(150);
  const alternateUi=await state(page);assert.equal(alternateUi.visible,'flex');
  assert.match(alternateUi.techniqueText,/Corte transversal|Cross cut/i);
  await page.screenshot({path:path.join(run,'talents-technique-alternate-layout.png')});
  await closeTab();
  phase='recovery disabled';await stopBackend();await startBackend(port,false);
  const disabledFrame=frames.length;page=await login(browser,webPort,port,rich);
  const disabledServer=await waitFrame(disabledFrame,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.enabled===false,'disabled server state');
  assert.deepEqual(disabledServer.m.state.owned,['sword']);assert.equal(disabledServer.m.activeId,null);assert.equal(disabledServer.m.gold,persistedGold);
  const refused=await send(page,{t:'techniqueBuy',id:'axe'},'buy blocked while disabled');
  assert.equal(refused.result.ok,false);assert.equal(refused.result.error,'unavailable');
  await closeTab();await stopBackend();await startBackend(port,true);
  const recoveredFrame=frames.length;page=await login(browser,webPort,port,rich);
  const recovered=await waitFrame(recoveredFrame,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.enabled===true&&f.m.gold===persistedGold,'recovered state');
  assert.deepEqual(recovered.m.state.owned,['sword']);assert.equal(recovered.m.activeId,'sword');
  assert.equal(disk(rich).save.gold,persistedGold);
  phase='connected third hit';await closeTab();await stopBackend();await startBackend(port,true,true);
  const combatFrame=frames.length;page=await login(browser,webPort,port,rich);
  const combatInitial=await waitFrame(combatFrame,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.activeId==='sword','combat initial state');
  assert.equal(combatInitial.m.charge,0);
  const mob=await spawnMobFixture(rich);
  await page.waitForFunction(()=>player.x===72&&player.y===33,null,{timeout:5000});
  await page.waitForFunction(id=>monsters.some(m=>m.id===id),mob.id,{timeout:5000});
  const hits=[];
  await page.evaluate(()=>{clearTarget();player.autoAttack=false;window.doAttack=()=>{};});
  await send(page,{t:'techniqueToggle',id:'sword',enabled:false},'reset charge before controlled combat');
  const ready=await send(page,{t:'techniqueToggle',id:'sword',enabled:true},'reenable controlled combat');
  assert.equal(ready.charge,0);
  const combatStart=frames.length;
  for(let i=1;i<=3;i++){
    const start=frames.length;
    await page.evaluate(id=>ws.send(JSON.stringify({t:'attackMob',monsterId:id,amount:30,range:1,
      attackPresentationAt:performance.now()})),mob.id);
    const impact=await waitFrame(start,f=>f.direction==='received'&&f.m.t==='combatImpact'&&f.m.targetId===mob.id,`basic impact ${i}`);
    const charge=await waitFrame(start,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.charge===(i%3),`charge after hit ${i}`);
    const received=frames.slice(start);
    const sent=received.find(f=>f.direction==='sent'&&f.m.t==='attackMob'&&f.m.monsterId===mob.id);
    const proc=received.find(f=>f.direction==='received'&&f.m.t==='techniqueProc')?.m||null;
    assert(sent,`browser sent basic hit ${i}`);
    hits.push({sent:sent.m,impact:impact.m,charge:charge.m.charge,proc});await sleep(850);
  }
  assert.deepEqual(hits.map(h=>h.charge),[1,2,0]);
  assert.equal(hits[0].proc,null);assert.equal(hits[1].proc,null);
  assert.equal(hits[2].proc?.techniqueId,'sword');
  assert(hits[2].impact.amount>hits[2].sent.amount,'third hit includes the primary technique bonus');
  assert.equal(frames.slice(combatStart).filter(f=>f.direction==='received'&&f.m.t==='techniqueProc'&&f.m.techniqueId==='sword').length,1);
  await page.screenshot({path:path.join(run,'third-hit.png')});
  assert.deepEqual(pageErrors,[]);
  const result={pass:true,rich,poor,first,replay,disabled,enabled,insufficient:insufficient.result,afterRestart:afterRestart.m,
    legendary:legendary.m,legendaryPlus:legendaryPlus.m,
    disabledServer:disabledServer.m,recovered:recovered.m,ui,mob,hits,maliciousUploadFrameCount:frames.length-malicious,
    pageErrors,phases:['purchase','replay','toggle','malicious saveUpload','insufficient','restart','UI','flag false/true','three basic hits'],
    limits:'This connected run does not assert secondary geometries for all six weapon families.',checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:true,evidence:run,owned:recovered.m.state.owned,gold:recovered.m.gold}));
}
async function areaMain(){
  fs.mkdirSync(run,{recursive:true});
  const a=account(rich,50000);
  const owned=['sword','axe','club','ranged','spear','staff'];
  a.weaponTechniques={v:1,owned,disabled:[]};
  a.save.weaponTechniques=a.weaponTechniques;
  a.save.equipped.weapon='ESPADA_HL';
  Object.assign(a.save.inv,{MACHADO_RUINAS:1,MARTELO_COLOSSO:1,BESTA_GUARDIAO:1,LANCA_GUARDIAO:1,CAJADO_RUNICO:1,FLECHA:100});
  a.save.quests.active.q_orcs={progress:0};
  fs.writeFileSync(path.join(run,'accounts.json'),JSON.stringify({v:1,savedAt:Date.now(),accounts:[a]}));
  const port=await freePort(),webPort=await startWeb();await startBackend(port,true,true);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  phase='area login';page=await login(browser,webPort,port,rich);
  await page.evaluate(()=>{clearTarget();player.autoAttack=false;window.__qaRealDoAttack=doAttack;window.doAttack=()=>{};});
  await page.keyboard.press('k');
  await page.locator('#weaponTechniquesPanel').waitFor({state:'visible'});
  const panel=await page.evaluate(()=>({technique:document.getElementById('weaponTechniquesPanel').getBoundingClientRect().top,
    talents:document.getElementById('talentsList').getBoundingClientRect().top}));
  assert(panel.technique<panel.talents,'techniques appear above talents in K');
  await page.screenshot({path:path.join(run,'k-techniques-above-talents.png')});await page.keyboard.press('k');
  const families=[
    {id:'sword',weapon:'ESPADA_HL',primary:20,secondary:[40,40]},
    {id:'axe',weapon:'MACHADO_RUINAS',primary:20,secondary:[30,30,30]},
    {id:'club',weapon:'MARTELO_COLOSSO',primary:60,secondary:[]},
    {id:'ranged',weapon:'BESTA_GUARDIAO',primary:20,secondary:[40,20]},
    {id:'spear',weapon:'LANCA_GUARDIAO',primary:30,secondary:[40]},
    {id:'staff',weapon:'CAJADO_RUNICO',primary:20,secondary:[35,35]}
  ];
  const results=[];
  async function equip(id,weapon){
    const start=frames.length;
    await page.evaluate(key=>ws.send(JSON.stringify({t:'invEquip',itemKey:key})),weapon);
    return (await waitFrame(start,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.weaponKey===weapon&&f.m.activeId===id,'equip '+id)).m;
  }
  async function setup(id,kind,killSecondary=false,killHp=10){
    const spec=await areaIpc({t:'qaAreaSetup',name:rich,id,kind,killSecondary,killHp});
    await page.waitForFunction(({x,y,floor})=>player.x===x&&player.y===y&&(player.floor||0)===floor,
      {...spec.origin,floor:spec.floor},{timeout:6000});
    await page.waitForFunction(id=>monsters.some(m=>m.id===id),spec.main.id,{timeout:6000});
    return spec;
  }
  async function hits(spec,id,weapon){
    const logs=[];
    for(let i=1;i<=3;i++){
      const start=frames.length;
      await page.evaluate(({id,range,ammo})=>ws.send(JSON.stringify({t:'attackMob',monsterId:id,amount:30,range,
        ...(ammo?{ammoKey:'FLECHA'}:{}),attackPresentationAt:performance.now()})),
        {id:spec.main.id,range:spec.range,ammo:id==='ranged'});
      const impact=(await waitFrame(start,f=>f.direction==='received'&&f.m.t==='combatImpact'&&f.m.targetId===spec.main.id,'impact '+id+' '+i)).m;
      const state=(await waitFrame(start,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.charge===i%3,'charge '+id+' '+i)).m;
      const proc=frames.slice(start).find(f=>f.direction==='received'&&f.m.t==='techniqueProc')?.m||null;
      logs.push({impact,state,proc,frames:frames.slice(start).filter(f=>f.direction==='received'&&['mobKill','questProgress','groundSpawn'].includes(f.m.t)).map(f=>f.m)});
      if(i<3)await sleep(850);
    }
    assert.equal(logs[0].proc,null);assert.equal(logs[1].proc,null);
    assert.equal(logs[2].proc?.techniqueId,id);
    assert.equal(logs[2].impact.amount,30+Math.floor(30*weapon.primary/100),'primary '+id);
    return logs;
  }
  for(const f of families){
    phase='area '+f.id;
    if(f.id!=='sword')await equip(f.id,f.weapon);
    const spec=await setup(f.id,'family',f.id==='sword');
    const before=await areaIpc({t:'qaAreaInspect',name:rich,ids:[spec.main.id,...spec.secondary.map(x=>x.id),...spec.extra.map(x=>x.id)]});
    const start=frames.length,logs=await hits(spec,f.id,f);
    const after=await areaIpc({t:'qaAreaInspect',name:rich,ids:[spec.main.id,...spec.secondary.map(x=>x.id),...spec.extra.map(x=>x.id)]});
    const proc=logs[2].proc;
    assert.deepEqual(proc.targets.map(x=>x.id),[spec.main.id,...spec.secondary.map(x=>x.id)],'targets '+f.id);
    assert.equal(before.mobs[0].hp-after.mobs[0].hp,30*2+logs[2].impact.amount,'main damage '+f.id);
    for(let i=0;i<spec.secondary.length;i++){
      const expected=Math.floor(30*f.secondary[i]/100);
      if(f.id==='sword'&&i===0){assert.equal(after.mobs[i+1].alive,false,'secondary ORC died');}
      else assert.equal(before.mobs[i+1].hp-after.mobs[i+1].hp,expected,'secondary damage '+f.id+' '+i);
    }
    for(let i=0;i<spec.extra.length;i++)assert.equal(before.mobs[1+spec.secondary.length+i].hp,after.mobs[1+spec.secondary.length+i].hp,'extra unchanged '+f.id);
    if(f.id==='sword'){
      const kills=frames.slice(start).filter(x=>x.direction==='received'&&x.m.t==='mobKill'&&x.m.mobId===spec.secondary[0].id);
      const quests=frames.slice(start).filter(x=>x.direction==='received'&&x.m.t==='questProgress'&&x.m.questId==='q_orcs');
      assert.equal(kills.length,1,'one secondary kill');assert.equal(quests.length,1,'one quest credit');
      assert.equal(quests[0].m.progress,1);assert.equal(after.player.quests.active.q_orcs.progress,1);
      assert.equal((after.ranking?.mobKills||0)-(before.ranking?.mobKills||0),1,'one ranking kill');
    }
    results.push({id:f.id,spec,before,after,logs:logs.map(x=>({impact:x.impact,state:{activeId:x.state.activeId,charge:x.state.charge},proc:x.proc,frames:x.frames}))});
    await sleep(1000);
  }
  phase='area barriers';
  await equip('ranged','BESTA_GUARDIAO');
  const diagonalSpec=await setup('ranged','diagonal');
  const diagonalBefore=await areaIpc({t:'qaAreaInspect',name:rich,ids:[diagonalSpec.main.id,...diagonalSpec.secondary.map(x=>x.id)]});
  const diagonalLogs=await hits(diagonalSpec,'ranged',families[3]);
  const diagonalAfter=await areaIpc({t:'qaAreaInspect',name:rich,ids:[diagonalSpec.main.id,...diagonalSpec.secondary.map(x=>x.id)]});
  assert.deepEqual(diagonalLogs[2].proc.targets.map(x=>x.id),[diagonalSpec.main.id,...diagonalSpec.secondary.map(x=>x.id)]);
  assert.deepEqual(diagonalSpec.secondary.map(x=>({x:x.x,y:x.y})),
    [{x:diagonalSpec.origin.x+5,y:diagonalSpec.origin.y+1},{x:diagonalSpec.origin.x+6,y:diagonalSpec.origin.y+2}]);
  assert.deepEqual(diagonalBefore.mobs.slice(1).map((m,i)=>m.hp-diagonalAfter.mobs[i+1].hp),[12,6]);
  const diagonal={spec:diagonalSpec,before:diagonalBefore,after:diagonalAfter,proc:diagonalLogs[2].proc};
  await sleep(1000);
  const barriers=[];
  for(const kind of ['pz','otherFloor','dungeonWall']){
    const spec=await setup('ranged',kind);
    const ids=[spec.main.id,...spec.secondary.map(x=>x.id)];
    const before=await areaIpc({t:'qaAreaInspect',name:rich,ids});
    const logs=await hits(spec,'ranged',families[3]);
    const after=await areaIpc({t:'qaAreaInspect',name:rich,ids});
    assert.deepEqual(logs[2].proc.targets.map(x=>x.id),[spec.main.id],'blocked secondary target '+kind);
    for(let i=1;i<ids.length;i++)assert.equal(after.mobs[i].hp,before.mobs[i].hp,'barrier protected mob '+kind+' '+i);
    barriers.push({kind,spec,before,after,logs:logs.map(x=>({impact:x.impact,proc:x.proc}))});
    await sleep(1000);
  }
  phase='visual ranged secondary';
  const visualSpec=await setup('ranged','family',true,1);
  await page.evaluate(({main,secondary})=>{
    window.__qaVisual=[];
    const mark=(kind,data={})=>window.__qaVisual.push({kind,at:performance.now(),...data});
    const float=addFloat;
    addFloat=function(x,y,value,...rest){mark('float',{x,y,value:String(value)});return float.call(this,x,y,value,...rest);};
    const actors=window.ValadaresModern.renderer.actors;
    const retain=actors.retainConfirmedDeath;
    actors.retainConfirmedDeath=function(presentation){mark('retainDeath',{targetId:presentation.targetId,contactAt:presentation.contactAt,eventId:presentation.eventId});
      return retain.call(this,presentation);};
    const impact=window.ValadaresWeaponTechniquesUI.onConfirmedImpact;
    window.ValadaresWeaponTechniquesUI.onConfirmedImpact=function(eventId){mark('confirmedImpact',{eventId});return impact.call(this,eventId);};
    ws.addEventListener('message',event=>{let m;try{m=JSON.parse(event.data);}catch{return;}
      if(['techniqueProc','mobFloat','mobKill','combatImpact'].includes(m.t))mark('recv',{type:m.t,mobId:m.mobId,targetId:m.targetId,eventId:m.eventId});});
    player.target=main.id;player.targetType='monster';player.autoAttack=false;
    const mob=monsters.find(m=>m.id===main.id);if(mob)mob.dodge=0;
    window.__qaVisualIds={main:main.id,secondary:secondary[0].id};
  },visualSpec);
  for(let i=1;i<=2;i++){
    const start=frames.length;
    await page.evaluate(({id,range})=>ws.send(JSON.stringify({t:'attackMob',monsterId:id,amount:30,range,
      ammoKey:'FLECHA',attackPresentationAt:performance.now()})),{id:visualSpec.main.id,range:visualSpec.range});
    await waitFrame(start,f=>f.direction==='received'&&f.m.t==='techniqueState'&&f.m.charge===i,'visual charge '+i);
    await sleep(850);
  }
  await page.evaluate(id=>{
    player.target=id;player.targetType='monster';player.attackTimer=0;
    const m=monsters.find(m=>m.id===id);m.dodge=0;
    window.doAttack=window.__qaRealDoAttack;doAttack(m);window.doAttack=()=>{};
  },visualSpec.main.id);
  const vStart=frames.length-2;
  const visualProc=(await waitFrame(vStart,f=>f.direction==='received'&&f.m.t==='techniqueProc'&&f.m.techniqueId==='ranged',
    'visual third hit proc')).m;
  await waitFrame(vStart,f=>f.direction==='received'&&f.m.t==='mobKill'&&f.m.mobId===visualSpec.secondary[0].id,'visual secondary kill');
  await page.waitForFunction(id=>window.__qaVisual.some(x=>x.kind==='float'&&x.x===id.x&&x.y===id.y&&x.value.startsWith('-')),
    visualSpec.secondary[0],{timeout:6000});
  const visualEvents=await page.evaluate(()=>window.__qaVisual);
  const secondaryFloat=visualEvents.find(x=>x.kind==='float'&&x.x===visualSpec.secondary[0].x&&x.y===visualSpec.secondary[0].y&&x.value.startsWith('-'));
  const confirmedImpact=visualEvents.find(x=>x.kind==='confirmedImpact'&&x.eventId===visualProc.eventId);
  const secondaryDeath=visualEvents.find(x=>x.kind==='retainDeath'&&x.targetId===visualSpec.secondary[0].id);
  const receiveKill=visualEvents.find(x=>x.kind==='recv'&&x.type==='mobKill'&&x.mobId===visualSpec.secondary[0].id);
  assert(confirmedImpact&&secondaryDeath&&secondaryFloat&&receiveKill,'visual presentation markers observed');
  assert(secondaryFloat.at>=confirmedImpact.at,'secondary float waits for confirmed impact');
  assert(secondaryFloat.at>=receiveKill.at,'secondary float waits after server kill');
  assert(secondaryDeath.contactAt>=receiveKill.at,'secondary death scheduled at/after server kill');
  const finalDeath=[...visualEvents].reverse().find(x=>x.kind==='retainDeath'&&x.targetId===visualSpec.secondary[0].id);
  assert(Math.abs(finalDeath.contactAt-confirmedImpact.at)<80,'secondary death contact tracks arrow landing');
  const visual={spec:visualSpec,eventId:visualProc.eventId,events:visualEvents,
    secondaryFloatAt:secondaryFloat.at,confirmedImpactAt:confirmedImpact.at,
    initialSecondaryDeathContactAt:secondaryDeath.contactAt,secondaryDeathContactAt:finalDeath.contactAt};
  const result={pass:true,panel,families:results,diagonal,barriers,visual,pageErrors,checkedAt:new Date().toISOString()};
  assert.deepEqual(pageErrors,[]);
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:true,evidence:run,families:results.map(x=>x.id)}));
}
async function enchantMain(){
  fs.mkdirSync(run,{recursive:true});
  const a=account(rich,50000),legacy='ESPADA_GUARDIAO~abcdef123456~h15';
  a.save.x=51;a.save.y=52;
  a.save.equipped.weapon='ESPADA_HL_PLUS_5';
  delete a.save.inv.ESPADA_HL_PLUS_5;
  a.save.inv.ESSENCIA_ARCANA=100;
  a.save.inv[legacy]=1;
  a.weaponTechniques={v:1,owned:['sword'],disabled:[]};a.save.weaponTechniques=a.weaponTechniques;
  fs.writeFileSync(path.join(run,'accounts.json'),JSON.stringify({v:1,savedAt:Date.now(),accounts:[a]}));
  const port=await freePort(),webPort=await startWeb();await startBackend(port,true,true);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  phase='enchant login';page=await login(context,webPort,port,rich);
  await areaIpc({t:'qaEnchantBench',name:rich});
  await page.waitForFunction(()=>player.x===51&&player.y===52&&atCraft(),null,{timeout:6000});
  await page.evaluate(()=>{clearTarget();player.autoAttack=false;window.doAttack=()=>{};openCraft();switchCraftTab('enchant');});
  await page.locator('#enchantPanel #enchantItem').waitFor({state:'visible'});
  const R=require(path.join(root,'equipment-rules.js'));
  assert.equal(R.VERSION,2);
  const firstKey='ESPADA_HL_PLUS_5';
  let current=firstKey,firstId=null,lastOp=null,lastPayload=null;
  const operations=[];
  async function enchantClick(slot,code){
    const before=await areaIpc({t:'qaEnchantInspect',name:rich});
    const start=frames.length;
    await page.locator('#enchantChoice'+slot).selectOption(code);
    await page.locator('[data-enchant-slot="'+slot+'"]').click();
    const sent=(await waitFrame(start,f=>f.direction==='sent'&&f.m.t==='invEnchant'&&f.m.slot===slot,'UI enchant request '+slot)).m;
    const reply=(await waitFrame(start,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===sent.opId,'UI enchant reply '+slot)).m;
    assert.equal(sent.affixCode,code);assert.equal(reply.enchant.ok,true);
    assert.equal(reply.enchant.itemKey,current);
    const parsed=R.parse(reply.enchant.newKey);
    assert(parsed.valid&&parsed.enchanted&&parsed.plus===5&&parsed.base==='ESPADA_HL');
    if(firstId)assert.equal(parsed.id,firstId);else firstId=parsed.id;
    assert.equal(parsed.affixes[slot].code,code);
    const after=await areaIpc({t:'qaEnchantInspect',name:rich});
    assert.equal(after.player.equipped.weapon,reply.enchant.newKey);
    assert.equal(after.player.inv.ESSENCIA_ARCANA,before.player.inv.ESSENCIA_ARCANA-reply.enchant.cost.essence);
    assert.equal(after.player.gold,before.player.gold-reply.enchant.cost.gold);
    assert.equal(after.player.enchantOps.length,before.player.enchantOps.length+1);
    assert.equal(disk(rich).save.inv[legacy],1,'legacy enchanted item preserved');
    operations.push({sent,reply:reply.enchant,before:before.player,after:after.player});
    current=reply.enchant.newKey;lastOp=sent.opId;lastPayload=sent;
    return parsed;
  }
  phase='three chosen repeats';
  for(let slot=0;slot<3;slot++){
    const parsed=await enchantClick(slot,'v');
    assert.deepEqual(parsed.affixes.map(x=>x.code),Array(slot+1).fill('v'));
  }
  await page.screenshot({path:path.join(run,'enchant-desktop.png')});
  await page.setViewportSize({width:430,height:900});await page.waitForTimeout(180);
  await page.screenshot({path:path.join(run,'enchant-narrow.png')});
  const narrow=await page.evaluate(()=>({viewport:innerWidth,modal:document.getElementById('craftModal').getBoundingClientRect().width,
    panel:document.getElementById('enchantPanel').getBoundingClientRect().width,bodyOverflow:document.body.scrollWidth-innerWidth}));
  assert(narrow.panel<=narrow.viewport+2,'enchant panel fits narrow viewport');
  await page.setViewportSize({width:1440,height:900});
  phase='replay same operation';
  const beforeReplay=await areaIpc({t:'qaEnchantInspect',name:rich});
  const replayStart=frames.length;await page.evaluate(m=>ws.send(JSON.stringify(m)),lastPayload);
  const replay=(await waitFrame(replayStart,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===lastOp,'same op replay')).m.enchant;
  assert.equal(replay.ok,true);assert.equal(replay.newKey,current);
  const afterReplay=await areaIpc({t:'qaEnchantInspect',name:rich});
  assert.equal(afterReplay.player.gold,beforeReplay.player.gold);
  assert.equal(afterReplay.player.inv.ESSENCIA_ARCANA,beforeReplay.player.inv.ESSENCIA_ARCANA);
  assert.equal(afterReplay.player.enchantOps.length,beforeReplay.player.enchantOps.length);
  const conflictStart=frames.length;await page.evaluate(m=>ws.send(JSON.stringify({...m,affixCode:'g'})),lastPayload);
  const conflict=(await waitFrame(conflictStart,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===lastOp,'conflicting replay')).m.enchant;
  assert.equal(conflict.ok,false);assert.equal(conflict.error,'op_conflict');
  phase='restart/replay';await closeTab();await stopBackend();await startBackend(port,true,true);
  page=await login(context,webPort,port,rich);
  const afterRestart=await areaIpc({t:'qaEnchantInspect',name:rich});
  assert.equal(afterRestart.player.equipped.weapon,current);
  assert.equal(afterRestart.player.inv[legacy],1);
  const restartReplayStart=frames.length;await page.evaluate(m=>ws.send(JSON.stringify(m)),lastPayload);
  const restartReplay=(await waitFrame(restartReplayStart,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===lastOp,'replay after restart')).m.enchant;
  assert.equal(restartReplay.ok,true);assert.equal(restartReplay.newKey,current);
  const restartReplayAfter=await areaIpc({t:'qaEnchantInspect',name:rich});
  assert.equal(restartReplayAfter.player.gold,afterRestart.player.gold);
  assert.equal(restartReplayAfter.player.inv.ESSENCIA_ARCANA,afterRestart.player.inv.ESSENCIA_ARCANA);
  phase='pending reload';
  await areaIpc({t:'qaEnchantBench',name:rich});
  const pending={itemKey:current,slot:0,opId:restartReplayAfter.player.enchantToken,affixCode:'g',waiting:false};
  await page.evaluate(({name,pending})=>localStorage.setItem('valadares:enchantPending:'+name.toLowerCase(),JSON.stringify(pending)),{name:rich,pending});
  await closeTab();page=await login(context,webPort,port,rich);
  await page.evaluate(()=>{openCraft();switchCraftTab('enchant');});
  const retry=page.locator('[data-enchant-retry]');await retry.waitFor({state:'visible'});
  const pendingStart=frames.length;await retry.click();
  const pendingSent=(await waitFrame(pendingStart,f=>f.direction==='sent'&&f.m.t==='invEnchant'&&f.m.opId===pending.opId,'pending replay request')).m;
  const pendingReply=(await waitFrame(pendingStart,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===pending.opId,'pending replay receipt')).m.enchant;
  assert.equal(pendingSent.affixCode,'g');assert.equal(pendingReply.ok,true);
  current=pendingReply.newKey;
  const parsedFinal=R.parse(current);
  assert.equal(parsedFinal.id,firstId);assert.equal(parsedFinal.plus,5);
  assert.deepEqual(parsedFinal.affixes.map(x=>x.code),['g','v','v']);
  await page.waitForFunction(name=>localStorage.getItem('valadares:enchantPending:'+name.toLowerCase())===null,rich,{timeout:5000});
  const postPending=await areaIpc({t:'qaEnchantInspect',name:rich});
  assert.equal(postPending.player.equipped.weapon,current);
  assert.equal(postPending.player.inv[legacy],1);
  phase='v1 rejection';
  const beforeV1=await areaIpc({t:'qaEnchantInspect',name:rich});
  await areaIpc({t:'qaEnchantVersion',name:rich,version:1});
  const stalePayload={t:'invEnchant',itemKey:current,slot:0,opId:beforeV1.player.enchantToken,affixCode:'v'};
  const v1Start=frames.length;await page.evaluate(m=>ws.send(JSON.stringify(m)),stalePayload);
  const v1=(await waitFrame(v1Start,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===stalePayload.opId,'v1 rejected')).m.enchant;
  assert.equal(v1.ok,false);assert.equal(v1.error,'update_required');
  const afterV1=await areaIpc({t:'qaEnchantInspect',name:rich});
  assert.equal(afterV1.player.gold,beforeV1.player.gold);
  assert.equal(afterV1.player.inv.ESSENCIA_ARCANA,beforeV1.player.inv.ESSENCIA_ARCANA);
  assert.equal(afterV1.player.equipped.weapon,current);
  assert.equal(afterV1.player.enchantOps.length,beforeV1.player.enchantOps.length);
  await areaIpc({t:'qaEnchantVersion',name:rich,version:2});
  phase='recovery combat';
  await page.evaluate(()=>{closeCraft();clearTarget();player.autoAttack=false;window.doAttack=()=>{};});
  const vRate=parsedFinal.affixes.filter(x=>x.code==='v').reduce((n,x)=>n+x.value,0)/100;
  const gValue=parsedFinal.affixes.find(x=>x.code==='g').value;
  async function combatSetup(mainHp,secondaryHp=null,charge=0,mp=100,neck=null){
    const spec=await areaIpc({t:'qaEnchantCombat',name:rich,hp:100,mp,mainHp,secondaryHp,charge,neck});
    await page.waitForFunction(id=>monsters.some(m=>m.id===id),spec.main.id,{timeout:5000});
    return spec;
  }
  async function attack(id,label){
    const start=frames.length;
    await page.evaluate(id=>ws.send(JSON.stringify({t:'attackMob',monsterId:id,amount:30,range:1,
      attackPresentationAt:performance.now()})),id);
    return (await waitFrame(start,f=>f.direction==='received'&&f.m.t==='combatImpact'&&f.m.targetId===id,label)).m;
  }
  const normal=await combatSetup(800);
  const normalImpact=await attack(normal.main.id,'normal recovery hit');
  const normalAfter=await areaIpc({t:'qaEnchantInspect',name:rich,ids:[normal.main.id]});
  assert.equal(normalImpact.amount,30);
  assert.equal(normalAfter.player.hp,100+Math.round(30*vRate));
  assert.equal(normalAfter.player.mp,100+gValue);
  await sleep(900);
  const overkill=await combatSetup(1,1,2);
  const overkillStart=frames.length,overkillImpact=await attack(overkill.main.id,'overkill primary');
  await waitFrame(overkillStart,f=>f.direction==='received'&&f.m.t==='mobKill'&&f.m.mobId===overkill.secondary.id,'secondary kill after overkill');
  const overkillAfter=await areaIpc({t:'qaEnchantInspect',name:rich,ids:[overkill.main.id,overkill.secondary.id]});
  assert.equal(overkillImpact.amount,1,'overkill reports actual HP damage');
  assert.equal(overkillAfter.player.hp,100,'vampirism uses one actual HP damage');
  assert.equal(overkillAfter.player.mp,100+gValue,'mana per hit only once; no secondary bonus');
  await sleep(900);
  const spell=await combatSetup(800,null,0,100);
  const castStart=frames.length;await page.evaluate(()=>ws.send(JSON.stringify({t:'spellCast',spellKey:'FIREBALL',hits:1})));
  await waitFrame(castStart,f=>f.direction==='received'&&f.m.t==='pstats'&&f.m.mp===80,'spell mana cost');
  const spellImpact=await attack(spell.main.id,'spell hit');
  const spellAfter=await areaIpc({t:'qaEnchantInspect',name:rich,ids:[spell.main.id]});
  assert(spellImpact.amount>0);assert.equal(spellAfter.player.hp,100,'gear vampirism excludes spells');
  assert.equal(spellAfter.player.mp,80,'gear mana on hit excludes spells');
  await sleep(900);
  phase='legacy mana on secondary kill';
  const legacyNeck='CORACAO_HL~001122334455~k3';
  const legacyKill=await combatSetup(800,1,2,100,legacyNeck);
  const legacyStart=frames.length;
  const legacyImpact=await attack(legacyKill.main.id,'legacy mana on secondary kill');
  await waitFrame(legacyStart,f=>f.direction==='received'&&f.m.t==='mobKill'&&f.m.mobId===legacyKill.secondary.id,'legacy secondary kill');
  const legacyAfter=await areaIpc({t:'qaEnchantInspect',name:rich,ids:[legacyKill.main.id,legacyKill.secondary.id]});
  assert.equal(legacyImpact.amount,36);
  assert.equal(legacyAfter.player.mp,100+gValue+3,'legacy manaOnKill still rewards secondary kill');
  assert.equal(legacyAfter.player.hp,100+Math.round(30*vRate),'new vampirism applies only to primary real damage');
  assert.deepEqual(pageErrors,[]);
  const result={pass:true,version:R.VERSION,firstKey,legacy,current,firstId,operations,replay,conflict,
    afterRestart:afterRestart.player,restartReplay,pending,pendingReply,parsedFinal,v1,normal:{spec:normal,impact:normalImpact,after:normalAfter.player},
    overkill:{spec:overkill,impact:overkillImpact,after:overkillAfter.player},spell:{spec:spell,impact:spellImpact,after:spellAfter.player},
    legacyKill:{spec:legacyKill,impact:legacyImpact,after:legacyAfter.player,neck:legacyNeck},
    narrow,pageErrors,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:true,evidence:run,key:current,vRate,gValue}));
}
async function enchantRandomMain(){
  fs.mkdirSync(run,{recursive:true});
  const a=account(rich,50000),firstKey='ESPADA_HL_PLUS_5';
  const oldItem='ESPADA_GUARDIAO',oldKey='ESPADA_GUARDIAO~abcdef123456~v2',oldOp=crypto.randomUUID();
  const oldReceipt={ok:true,opId:oldOp,itemKey:oldItem,newKey:oldKey,slot:0,cost:{essence:6,gold:500}};
  a.save.x=51;a.save.y=52;a.save.equipped.weapon=firstKey;
  delete a.save.inv[firstKey];a.save.inv.ESSENCIA_ARCANA=100;a.save.inv[oldKey]=1;
  a.save.enchantOps=[{opId:oldOp,request:JSON.stringify([oldItem,0,'v']),result:oldReceipt}];
  a.save.enchantToken=crypto.randomUUID();
  fs.writeFileSync(path.join(run,'accounts.json'),JSON.stringify({v:1,savedAt:Date.now(),accounts:[a]}));
  const port=await freePort(),webPort=await startWeb();await startBackend(port,true,true);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  phase='random enchant login';page=await login(context,webPort,port,rich);
  await areaIpc({t:'qaEnchantBench',name:rich});
  const R=require(path.join(root,'equipment-rules.js'));
  function rain(start){return frames.slice(start).filter(f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.goldDelta?.reason==='gold_rain')
    .reduce((n,f)=>n+f.m.goldDelta.amount,0);}
  function assertNoSpend(before,after,start){
    assert.equal(after.player.gold,before.player.gold+rain(start));
    assert.equal(after.player.inv.ESSENCIA_ARCANA,before.player.inv.ESSENCIA_ARCANA);
    assert.equal(after.player.equipped.weapon,before.player.equipped.weapon);
    assert.equal(after.player.enchantOps.length,before.player.enchantOps.length);
  }
  phase='historical choice receipt';
  const historicalBefore=await areaIpc({t:'qaEnchantInspect',name:rich});
  const historicalStart=frames.length;
  await page.evaluate(m=>ws.send(JSON.stringify(m)),{t:'invEnchant',itemKey:oldItem,slot:0,opId:oldOp,affixCode:'v'});
  const historical=(await waitFrame(historicalStart,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===oldOp,
    'historical consumed receipt')).m.enchant;
  assert.deepEqual(historical,oldReceipt);
  const historicalAfter=await areaIpc({t:'qaEnchantInspect',name:rich});
  assertNoSpend(historicalBefore,historicalAfter,historicalStart);
  phase='unconsumed old choice pending';
  const pending={itemKey:firstKey,slot:0,opId:historicalAfter.player.enchantToken,affixCode:'v',waiting:false};
  await page.evaluate(({name,pending})=>localStorage.setItem('valadares:enchantPending:'+name.toLowerCase(),JSON.stringify(pending)),{name:rich,pending});
  await closeTab();page=await login(context,webPort,port,rich);
  await page.evaluate(()=>{openCraft();switchCraftTab('enchant');});
  const retry=page.locator('[data-enchant-retry]');await retry.waitFor({state:'visible'});
  const rejectedBefore=await areaIpc({t:'qaEnchantInspect',name:rich}),rejectedStart=frames.length;
  await retry.click();
  const rejectedSent=(await waitFrame(rejectedStart,f=>f.direction==='sent'&&f.m.t==='invEnchant'&&f.m.opId===pending.opId,'old pending sent')).m;
  const rejected=(await waitFrame(rejectedStart,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===pending.opId,
    'old choice rejected')).m.enchant;
  assert.equal(rejectedSent.affixCode,'v');assert.equal(rejected.ok,false);
  const rejectedAfter=await areaIpc({t:'qaEnchantInspect',name:rich});
  assertNoSpend(rejectedBefore,rejectedAfter,rejectedStart);
  await page.waitForFunction(name=>localStorage.getItem('valadares:enchantPending:'+name.toLowerCase())===null,rich,{timeout:5000});
  await page.locator('[data-enchant-slot="0"]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-enchant-slot="0"]').isEnabled(),true,'pending unlocks after error');
  assert.equal(await page.locator('#enchantPanel [data-enchant-choice]').count(),0,'no attribute selectors');
  const errorText=await page.locator('#enchantPanel [role="status"]').innerText();
  assert(errorText.length>10,'visible error message');
  await page.screenshot({path:path.join(run,'old-pending-error.png')});
  phase='random UI add and reroll';
  let current=firstKey,identity=null;
  const operations=[];
  async function action(slot,reroll){
    const before=await areaIpc({t:'qaEnchantInspect',name:rich}),start=frames.length;
    await page.locator('#enchantItem').selectOption(current);
    await page.locator('[data-enchant-slot="'+slot+'"]').click();
    const sent=(await waitFrame(start,f=>f.direction==='sent'&&f.m.t==='invEnchant'&&f.m.slot===slot,'random enchant sent')).m;
    assert(!Object.hasOwn(sent,'affixCode'),'client omitted old choice');
    const response=(await waitFrame(start,f=>f.direction==='received'&&f.m.t==='invUpdate'&&f.m.enchant?.opId===sent.opId,
      'random enchant receipt')).m.enchant;
    assert.equal(response.ok,true);
    const parsed=R.parse(response.newKey);
    assert(parsed.valid&&parsed.enchanted&&parsed.base==='ESPADA_HL'&&parsed.plus===5);
    if(identity)assert.equal(parsed.id,identity);else identity=parsed.id;
    assert.equal(response.cost.gold,R.cost(slot,reroll).gold);
    assert.equal(response.cost.essence,R.cost(slot,reroll).essence);
    const after=await areaIpc({t:'qaEnchantInspect',name:rich});
    assert.equal(after.player.equipped.weapon,response.newKey);
    assert.equal(after.player.inv.ESSENCIA_ARCANA,before.player.inv.ESSENCIA_ARCANA-response.cost.essence);
    assert.equal(after.player.gold,before.player.gold-response.cost.gold+rain(start));
    assert.equal(after.player.inv[oldKey],1,'other enchanted item preserved');
    operations.push({sent,response,before:before.player,after:after.player});current=response.newKey;
    return parsed;
  }
  const one=await action(0,false);
  const two=await action(1,false);
  assert.deepEqual(two.affixes[0],one.affixes[0]);
  const three=await action(0,true);
  assert.deepEqual(three.affixes[1],two.affixes[1],'other slot unchanged during reroll');
  assert.equal(three.id,one.id);assert.equal(three.plus,5);
  await page.screenshot({path:path.join(run,'random-enchant-desktop.png')});
  await page.setViewportSize({width:430,height:900});await page.waitForTimeout(150);
  await page.screenshot({path:path.join(run,'random-enchant-narrow.png')});
  const narrow=await page.evaluate(()=>({width:innerWidth,panel:document.getElementById('enchantPanel').getBoundingClientRect().width,
    overflow:document.body.scrollWidth-innerWidth}));
  assert(narrow.panel<=narrow.width+2);assert(narrow.overflow<=1);
  assert.deepEqual(pageErrors,[]);
  const result={pass:true,version:R.VERSION,firstKey,oldKey,historical,pending,rejected,rejectedSent,errorText,
    identity,finalKey:current,operations,affixes:{one:one.affixes,two:two.affixes,three:three.affixes},narrow,pageErrors,
    checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:true,evidence:run,version:R.VERSION,key:current,rejection:rejected.error}));
}
(process.argv.includes('--enchant-random')?enchantRandomMain():process.argv.includes('--enchant')?enchantMain():process.argv.includes('--area')?areaMain():main()).catch(async e=>{
  const failure={pass:false,phase,error:e.stack||String(e),recentFrames:frames.slice(-60),backendLog:backendLog.slice(-2000)};
  try{if(page&&!page.isClosed())await page.screenshot({path:path.join(run,'failure.png')});}catch{}
  try{fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(failure,null,2));}catch{}
  console.error(e.stack||e);process.exitCode=1;
}).finally(async()=>{await closeTab().catch(()=>{});if(browser)await browser.close().catch(()=>{});
  if(web)await new Promise(r=>web.close(r));await stopBackend();});
