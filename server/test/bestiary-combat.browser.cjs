// Final built-client QA: five real 3D mob bodies, normal pointer selection and server combat.
// Run only against a frozen build: QA_CLIENT_ROOT=dist-web node server/test/bestiary-combat.browser.cjs
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const clientRoot=path.resolve(root,process.env.QA_CLIENT_ROOT||process.env.CLIENT_ROOT||'.');
const outRoot=path.resolve(root,process.env.QA_OUTPUT_ROOT||'work/revisao-integrada-final-2026-10-07');
const runDir=path.join(outRoot,`bestiary-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
const expected={SOMBRA:'Skeleton_Rogue',GOLEM:'Big_Demon',GOLEM_REI:'Big_BlueDemon',DRAKE:'Dragon',DRAKE_LIDER:'Dragon_Evolved'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream',
  '.ogg':'audio/ogg','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let backend,staticServer,browser,page,phase='setup',backendLog='';
const frames=[],pageErrors=[];
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
function seed(name,password){
  const transport='s256:'+crypto.createHash('sha256').update(password).digest('hex');
  const salt=crypto.randomBytes(16).toString('hex');
  const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
  const now=Date.now();
  const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia']
    .map(key=>[key,{val:99,xp:0,xpNext:24000}]));
  const save={v:2,x:72,y:33,skills,gold:0,appearance:{v:1,body:'knight',palette:'original'},
    inv:{ESPADA_INFINITA:1,ARMADURA_TRONO:1,COROA_CELESTIAL:1,POTION:99},
    equipped:{weapon:'ESPADA_INFINITA',offhand:null,armor:'ARMADURA_TRONO',head:'COROA_CELESTIAL',feet:null,neck:null},
    chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
    hp:1000,maxHp:1000,mp:500,maxMp:500,pvp:true,savedAt:now};
  fs.writeFileSync(path.join(runDir,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts:[
    {name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null}]}));
  fs.writeFileSync(path.join(runDir,'state.json'),JSON.stringify({v:1,savedAt:now,nextMobId:910001,monsters:[]}));
}
async function startStatic(){
  assert(fs.existsSync(path.join(clientRoot,'play.html')),`QA_CLIENT_ROOT lacks play.html: ${clientRoot}`);
  staticServer=http.createServer((req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    let urlPath;
    try{urlPath=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end();return;}
    if(urlPath==='/jogar3d'||urlPath==='/jogar')urlPath='/play.html';
    if(urlPath==='/')urlPath='/index.html';
    const target=path.resolve(clientRoot,'.'+urlPath);
    if(target!==clientRoot&&!target.startsWith(clientRoot+path.sep)){res.writeHead(403);res.end();return;}
    fs.stat(target,(error,stat)=>{
      if(error||!stat.isFile()){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',mime[path.extname(target).toLowerCase()]||'application/octet-stream');
      res.setHeader('Cache-Control','no-store');
      if(req.method==='HEAD'){res.writeHead(200);res.end();return;}
      fs.createReadStream(target).pipe(res);
    });
  });
  await new Promise((resolve,reject)=>{staticServer.once('error',reject);staticServer.listen(0,'127.0.0.1',resolve);});
  return staticServer.address().port;
}
async function startBackend(port){
  const injected=`
process.on('message',msg=>{
  if(msg?.t!=='qaSpawn')return;
  const p=[...players.values()].find(value=>value.name===msg.name);
  if(!p||p.floor!==0){process.send({t:'qaError',error:'player not on surface'});return;}
  if(!['SOMBRA','GOLEM','GOLEM_REI','DRAKE','DRAKE_LIDER'].includes(msg.mobType)){
    process.send({t:'qaError',error:'unknown fixture type'});return;
  }
  for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
    const x=p.x+dx,y=p.y+dy;
    if(!isWalkable(x,y)||mobAt(x,y,0))continue;
    const mob=spawnMob(msg.mobType,x,y,0);
    if(!mob)continue;
    sendTo(p.id,{t:'mobs',list:snapshotMobs(0)});
    process.send({t:'qaSpawned',mob:{id:mob.id,type:mob.type,x:mob.x,y:mob.y,hp:mob.hp,maxHp:mob.maxHp}});
    return;
  }
  process.send({t:'qaError',error:'no adjacent fixture tile'});
});`;
  const entry=`const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.resolve('server/server.js'),m=new Module(file,module);m.filename=file;
m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8')+${JSON.stringify(injected)},file);
const realNow=Date.now;Date.now=()=>realNow()+181000;`;
  backend=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,
    PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
    STATE_FILE_PATH:path.join(runDir,'state.json'),ACCOUNTS_FILE_PATH:path.join(runDir,'accounts.json'),
    MP_CREDITED_PATH:path.join(runDir,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
    ADMIN_NAME:'__bestiary_combat_qa__',ALERTS_ENABLED:'0'}});
  backend.stdout.on('data',c=>backendLog+=c.toString());backend.stderr.on('data',c=>backendLog+=c.toString());
  const until=Date.now()+15000;
  while(Date.now()<until){
    if(backend.exitCode!==null)throw Error(`Temporary backend exited: ${backend.exitCode}\n${backendLog.slice(-2000)}`);
    try{await new Promise((resolve,reject)=>{
      const req=http.get(`http://127.0.0.1:${port}/health`,res=>{res.resume();res.statusCode===200?resolve():reject(Error(`health ${res.statusCode}`));});
      req.once('error',reject);req.setTimeout(400,()=>req.destroy(Error('health timeout')));
    });return;}catch{await pause(100);}
  }
  throw Error(`Temporary backend did not listen\n${backendLog.slice(-2000)}`);
}
async function ipc(message){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{backend.off('message',onMessage);reject(Error(`IPC timeout: ${message.t}`));},5000);
    const onMessage=value=>{clearTimeout(timer);resolve(value);};
    backend.once('message',onMessage);backend.send(message);
  });
}
function attachFrames(tab){
  tab.on('websocket',socket=>{
    for(const [event,direction] of [['framesent','sent'],['framereceived','received']])socket.on(event,raw=>{
      try{const message=JSON.parse(raw.payload);if(['attackMob','combatImpact','mobUpdate','mobKill','mobDead','mobs','mobHit','invUpdate'].includes(message.t))
        frames.push({direction,message});}catch{}
    });
  });
  tab.on('pageerror',error=>pageErrors.push(error.message));
}
async function waitForFrame(start,match,label,timeout=30000){
  const until=Date.now()+timeout;
  while(Date.now()<until){const found=frames.slice(start).find(match);if(found)return found;await pause(50);}
  throw Error(`Timed out waiting for ${label}; recent=${JSON.stringify(frames.slice(-8))}`);
}
async function login(staticPort,backendPort,name,password){
  page=await browser.newPage({viewport:{width:1440,height:900}});attachFrames(page);
  await page.route('**/*',route=>{const u=new URL(route.request().url());
    return u.hostname==='127.0.0.1'||u.hostname==='localhost'?route.continue():route.abort();});
  await page.goto(`http://127.0.0.1:${staticPort}/jogar3d?ws=ws://127.0.0.1:${backendPort}`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#charInput').fill(name);await page.locator('#pwdInput').fill(password);
  await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(()=>started&&_wsAuthed&&myWsId&&window.ValadaresModern?.state==='ready',null,{timeout:30000});
  const refuse=page.getByRole('button',{name:'Recusar',exact:true});if(await refuse.isVisible())await refuse.click();
  const dismiss=page.locator('#firstStepsDismiss');if(await dismiss.isVisible())await dismiss.click();
  await page.keyboard.press('Escape');
}
async function actor(id,model){
  await page.waitForFunction(({id,model})=>{
    const rec=window.ValadaresModern?.renderer?.actors?.entries?.get('mob:'+id);
    return rec?.model===model&&rec.entity.enabled&&rec.entity.findComponents('render').some(r=>r.enabled&&r.meshInstances.some(m=>m.visible));
  },{id,model},{timeout:30000});
  return page.evaluate(id=>{
    const rec=ValadaresModern.renderer.actors.entries.get('mob:'+id);
    return {model:rec.model,type:rec.type,meshCount:rec.entity.findComponents('render').flatMap(r=>r.meshInstances).length};
  },id);
}
async function pointerSpot(id,height,offsetX=0){
  return page.evaluate(({id,height,offsetX})=>{
    const mob=monsters.find(item=>item.id===id),renderer=ValadaresModern.renderer;
    if(!mob)return null;
    const pos=renderer.project((mob.renderX??mob.x)+.5+offsetX,height,(mob.renderY??mob.y)+.5);
    const box=renderer.canvas.getBoundingClientRect();return{x:box.left+pos.x,y:box.top+pos.y};
  },{id,height,offsetX});
}
async function selectByPointer(id,type){
  const attempts=[];
  for(const [height,offsetX] of [[.9,0],[1.3,0],[.6,0],[1.8,0],[1.1,.35]]){
    const spot=await pointerSpot(id,height,offsetX);if(!spot)break;
    attempts.push({height,offsetX,...spot});await page.mouse.click(spot.x,spot.y);
    const selected=await page.evaluate(id=>player.target===id&&player.targetType==='monster'&&player.autoAttack,id);
    if(selected)return {selected:true,attempts};
    await pause(150);
  }
  throw Error(`Pointer did not select ${type} ${id}: ${JSON.stringify(attempts)}`);
}
async function clickWingEdge(id){
  await page.keyboard.press('Escape');
  const spots=await page.evaluate(id=>{
    const renderer=ValadaresModern.renderer,rec=renderer.actors.entries.get('mob:'+id);
    const center=rec.entity.getPosition(),box=renderer.canvas.getBoundingClientRect();
    const meshes=rec.entity.findComponents('render').flatMap(r=>r.meshInstances).filter(m=>m.visible);
    return meshes.map(mesh=>{
      const a=mesh.aabb,span=Math.abs(a.center.x-center.x)+a.halfExtents.x;
      const p=renderer.project(a.center.x,a.center.y,a.center.z);
      return {span,x:box.left+p.x,y:box.top+p.y};
    }).sort((a,b)=>b.span-a.span).slice(0,6);
  },id);
  for(const spot of spots){
    await page.mouse.click(spot.x,spot.y);
    if(await page.evaluate(id=>player.target===id&&player.targetType==='monster',id))return {selected:true,span:spot.span,spot};
  }
  throw Error(`Dragon wing-edge click did not select mob ${id}: ${JSON.stringify(spots)}`);
}
async function run(){
  fs.mkdirSync(runDir,{recursive:true});
  const name='BQa'+crypto.randomBytes(4).toString('hex');
  const password='BQa'+crypto.randomBytes(10).toString('hex')+'!';
  seed(name,password);const backendPort=await freePort(),staticPort=await startStatic();
  phase='backend';await startBackend(backendPort);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  phase='login';await login(staticPort,backendPort,name,password);
  const initial=await page.evaluate(()=>({x:player.x,y:player.y,floor:player.floor,weapon:player.equipped.weapon,hp:player.hp,maxHp:player.maxHp}));
  assert.deepEqual([initial.x,initial.y],[72,33]);assert.equal(initial.weapon,'ESPADA_INFINITA');
  const outcomes=[];
  for(const [type,model] of Object.entries(expected)){
    phase=`${type} spawn`;
    await page.keyboard.press('Escape');
    const spawned=await ipc({t:'qaSpawn',name,mobType:type});
    assert.equal(spawned.t,'qaSpawned',JSON.stringify(spawned));
    const mob=spawned.mob;assert.equal(mob.type,type);
    const loaded=await actor(mob.id,model);
    assert.equal(loaded.model,model);
    await page.screenshot({path:path.join(runDir,`01-${type}-before-click.png`)});
    phase=`${type} pointer and combat`;
    const start=frames.length;
    const pointer=await selectByPointer(mob.id,type);
    let wing=null;
    if(type==='DRAKE_LIDER')wing=await clickWingEdge(mob.id);
    const outgoing=await waitForFrame(start,f=>f.direction==='sent'&&f.message.t==='attackMob'&&f.message.monsterId===mob.id,`${type} attackMob`,20000);
    const impact=await waitForFrame(start,f=>f.direction==='received'&&f.message.t==='combatImpact'&&f.message.targetId===mob.id&&f.message.amount>0,`${type} combatImpact`,20000);
    const damaged=await waitForFrame(start,f=>f.direction==='received'&&f.message.t==='mobUpdate'&&f.message.id===mob.id&&f.message.hp<mob.hp,`${type} authoritative damage`,20000);
    const killed=await waitForFrame(start,f=>f.direction==='received'&&f.message.t==='mobKill'&&f.message.mobId===mob.id,`${type} native kill`,90000);
    assert.equal(killed.message.mobType,type);assert(Array.isArray(killed.message.loot));assert(Array.isArray(killed.message.drops));
    const bossReward=['GOLEM_REI','DRAKE_LIDER'].includes(type)
      ? (await waitForFrame(start,f=>f.direction==='received'&&f.message.t==='invUpdate'&&f.message.bossLoot?.boss===type,`${type} server boss reward`,10000)).message.bossLoot
      : null;
    if(bossReward){assert(bossReward.reward?.awarded);assert(bossReward.gold>0);}
    await page.waitForFunction(id=>!monsters.some(m=>m.id===id),mob.id,{timeout:10000});
    const final=await page.evaluate(()=>({hp:player.hp,maxHp:player.maxHp,weapon:player.equipped.weapon}));
    assert.equal(final.weapon,'ESPADA_INFINITA');assert(final.hp>0,`${type}: character survived`);
    outcomes.push({type,model,id:mob.id,spawnHp:mob.hp,pointer,wing,
      attack:{amount:outgoing.message.amount,range:outgoing.message.range},
      impact:{amount:impact.message.amount},damagedHp:damaged.message.hp,
      kill:{loot:killed.message.loot,drops:killed.message.drops,xp:killed.message.xp,bossReward},final});
    await page.screenshot({path:path.join(runDir,`02-${type}-after-kill.png`)});
  }
  assert.deepEqual(pageErrors,[]);
  const report={pass:true,clientRoot,account:name,initial,outcomes,pageErrors,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:true,evidence:runDir,types:outcomes.map(item=>item.type)}));
}
run().catch(async error=>{
  const failure={pass:false,phase,error:error.stack||String(error),clientRoot,evidence:runDir,
    recentFrames:frames.slice(-12),pageErrors,backendLog:backendLog.slice(-2000)};
  try{if(page&&!page.isClosed())await page.screenshot({path:path.join(runDir,'failure.png')});}catch{}
  try{fs.mkdirSync(runDir,{recursive:true});fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(failure,null,2));}catch{}
  console.error(error.stack||error);process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close().catch(()=>{});
  if(staticServer)await new Promise(resolve=>staticServer.close(resolve));
  if(backend){backend.kill();await Promise.race([new Promise(resolve=>backend.once('exit',resolve)),pause(2000)]);}
});
