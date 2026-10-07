// Isolated, real-browser acceptance for the shared Automaton dungeon.
// Run only after the client build is frozen: QA_CLIENT_ROOT=dist-web node server/test/automaton-dungeon.browser.cjs
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const clientRoot=path.resolve(root,process.env.QA_CLIENT_ROOT||'.');
const outRoot=path.resolve(root,process.env.QA_OUTPUT_ROOT||'work/automaton-dungeon-2026-10-07/browser');
const runDir=path.join(outRoot,`run-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
const tempDir=path.join(os.tmpdir(),`valadares-automaton-qa-${path.basename(runDir)}`);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream',
  '.ogg':'audio/ogg','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const frames=[],pageErrors=[],httpErrors=[];
let backend,staticServer,browser,page,peer,backendLog='',phase='setup';
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
async function waitForFrame(start,predicate,label,timeout=15000){
  const until=Date.now()+timeout;
  while(Date.now()<until){const result=frames.slice(start).find(predicate);if(result)return result;await pause(50);}
  throw Error(`Timed out waiting for ${label}: ${JSON.stringify(frames.slice(-10))}`);
}
function seedAccount(name,password){
  const transport='s256:'+crypto.createHash('sha256').update(password).digest('hex');
  const salt=crypto.randomBytes(16).toString('hex');
  const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
  const now=Date.now();
  const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia']
    .map(key=>[key,{val:99,xp:0,xpNext:24000}]));
  return {name,pwHash,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null,
    save:{v:2,x:23,y:60,skills,gold:0,appearance:{v:1,body:'knight',palette:'original'},
      inv:{ESPADA_INFINITA:1,ARMADURA_TRONO:1,COROA_CELESTIAL:1,POTION:99},
      equipped:{weapon:'ESPADA_INFINITA',offhand:null,armor:'ARMADURA_TRONO',head:'COROA_CELESTIAL',feet:null,neck:null},
      chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
      permaBuffs:{hpBonus:5000}, // disposable survivability fixture; combat/damage/loot stay server-authoritative
      hp:6000,maxHp:6000,mp:500,maxMp:500,pvp:true,savedAt:now}};
}
function seed(accounts){
  const now=Date.now();
  fs.writeFileSync(path.join(tempDir,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts}));
  fs.writeFileSync(path.join(tempDir,'state.json'),JSON.stringify({v:1,savedAt:now,nextMobId:910001,monsters:[]}));
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
  // Only this disposable server's clock advances beyond the post-restart town-return window.
  const entry="const http=require('node:http');const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return listen.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');const realNow=Date.now;Date.now=()=>realNow()+181000;";
  backend=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
    PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
    STATE_FILE_PATH:path.join(tempDir,'state.json'),ACCOUNTS_FILE_PATH:path.join(tempDir,'accounts.json'),
    MP_CREDITED_PATH:path.join(tempDir,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
    ADMIN_NAME:'__automaton_browser_qa__',ALERTS_ENABLED:'0',PROGRESSION_ENABLED:'1'}});
  backend.stdout.on('data',c=>backendLog+=c.toString());backend.stderr.on('data',c=>backendLog+=c.toString());
  const until=Date.now()+15000;
  while(Date.now()<until){
    if(backend.exitCode!==null)throw Error(`Temporary backend exited: ${backend.exitCode}\n${backendLog.slice(-2000)}`);
    try{await new Promise((resolve,reject)=>{const req=http.get(`http://127.0.0.1:${port}/health`,res=>{
      res.resume();res.statusCode===200?resolve():reject(Error(`health ${res.statusCode}`));});
      req.once('error',reject);req.setTimeout(400,()=>req.destroy(Error('health timeout')));});return;}
    catch{await pause(100);}
  }
  throw Error(`Temporary backend did not listen\n${backendLog.slice(-2000)}`);
}
function attach(tab,who){
  tab.on('websocket',socket=>{
    for(const [event,direction] of [['framesent','sent'],['framereceived','received']])socket.on(event,raw=>{
      try{const message=JSON.parse(raw.payload);if(['automatonEnter','automatonDescend','automatonAscend','automatonExit',
        'automatonResult','dungeonEnter','dungeonExit','attackMob','combatImpact','mobUpdate','mobKill','mobDead'].includes(message.t))
        frames.push({who,direction,message});}catch{}
    });
  });
  tab.on('pageerror',error=>pageErrors.push({who,error:error.message}));
  tab.on('response',response=>{if(response.url().startsWith('http://127.0.0.1:')&&response.status()>=400&&!response.url().endsWith('/favicon.ico'))
    httpErrors.push({who,status:response.status(),url:response.url()});});
  tab.on('requestfailed',request=>{if(request.url().startsWith('http://127.0.0.1:')&&!request.url().endsWith('/favicon.ico')&&
    !String(request.failure()).includes('ERR_ABORTED'))
    httpErrors.push({who,failure:request.failure(),url:request.url()});});
}
async function login(staticPort,backendPort,account,who){
  const tab=await browser.newPage({viewport:{width:1440,height:900}});attach(tab,who);
  await tab.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'||u.hostname==='localhost'?route.continue():route.abort();});
  await tab.goto(`http://127.0.0.1:${staticPort}/jogar3d?ws=ws://127.0.0.1:${backendPort}`,{waitUntil:'domcontentloaded',timeout:30000});
  await tab.locator('#charInput').fill(account.name);await tab.locator('#pwdInput').fill(account.password);
  await tab.locator('button[onclick="tryLogin(true)"]').click();
  await tab.waitForFunction(()=>started&&_wsAuthed&&myWsId&&window.ValadaresModern?.state==='ready',null,{timeout:30000});
  const refuse=tab.getByRole('button',{name:'Recusar',exact:true});if(await refuse.isVisible())await refuse.click();
  const dismiss=tab.locator('#firstStepsDismiss');if(await dismiss.isVisible())await dismiss.click();
  await tab.keyboard.press('Escape');return tab;
}
async function state(tab=page){return tab.evaluate(()=>({x:player.x,y:player.y,floor:player.floor||0,depth:player._dungeonDepth||0,
  automaton:player._automaton||null,expedition:player._expedition||null,hp:player.hp,autoAttack:!!player.autoAttack,target:player.target,
  entrance:window.ValadaresProgression?.automatonDungeon?.npc||null,
  forge:window.ValadaresProgression?.robotExpedition?.npc||null,
  door:document.getElementById('worldDoor')?.textContent||'',doorVisible:!!document.getElementById('worldDoor')&&!document.getElementById('worldDoor').hidden,
  badge:document.getElementById('floorBadgeText')?.textContent||'',
  mapLegend:document.getElementById('modernMapLegend')?.textContent||'',
  sideLegend:document.getElementById('modernSidebarMapLegend')?.textContent||'',
  mapAria:document.getElementById('modernMiniMap')?.getAttribute('aria-label')||'',
  theme:window.ValadaresModern?.renderer?.world?.theme||null,
  stairs:dungeonStairs,mobs:monsters.filter(m=>m.hp>0).map(m=>({id:m.id,type:m.type,x:m.x,y:m.y,hp:m.hp,unique:!!m.unique}))}));}
async function routeTo(tab,targets){return tab.evaluate(targets=>{
  const start={x:player.x,y:player.y},queue=[start],seen=new Set([`${start.x},${start.y}`]),parent=new Map();
  const goals=new Set(targets.map(t=>`${t.x},${t.y}`));
  for(let i=0;i<queue.length;i++){
    const at=queue[i],atKey=`${at.x},${at.y}`;
    if(goals.has(atKey)){
      const route=[];let key=atKey;
      while(parent.has(key)){const prev=parent.get(key);route.push({x:Number(key.split(',')[0]),y:Number(key.split(',')[1]),key:prev.key});key=prev.from;}
      return route.reverse();
    }
    for(const [dx,dy,key] of [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']]){
      const nx=at.x+dx,ny=at.y+dy,id=`${nx},${ny}`;
      if(seen.has(id)||!map[ny]||!walkable(map[ny][nx])||npcOnTile(nx,ny)||monsterAt(nx,ny))continue;
      seen.add(id);parent.set(id,{from:atKey,key});queue.push({x:nx,y:ny});
    }
  }
  return null;
},targets);}
async function pressStep(tab,step,transition){
  await tab.keyboard.down(step.key);
  try{await tab.waitForFunction(({x,y,transition})=>player.x===x&&player.y===y||
    (transition==='down'&&player._automaton&&player._dungeonDepth===2)||
    (transition==='up'&&player._automaton&&player._dungeonDepth===1)||
    (transition==='exit'&&player.floor===0&&player.x===23&&player.y===60),
    {x:step.x,y:step.y,transition},{timeout:5500});}
  finally{await tab.keyboard.up(step.key);}
  await pause(85);
}
async function walkTo(tab,target,{transition=null,maxSteps=110}={}){
  const start=await state(tab),steps=[];let blockedSince=0;
  for(let count=0;count<maxSteps;count++){
    const current=await state(tab);
    if(transition==='down'&&current.depth===2)return steps;
    if(transition==='up'&&start.depth===2&&current.depth===1)return steps;
    if(transition==='exit'&&current.floor===0)return steps;
    if(current.x===target.x&&current.y===target.y&&!transition)return steps;
    const route=await routeTo(tab,[target]);
    if(!route?.length){
      if(!blockedSince)blockedSince=Date.now();
      assert(Date.now()-blockedSince<20000,`no walkable route to ${target.x},${target.y} for 20s; at ${current.x},${current.y}`);
      await pause(250);count--;continue; // allow a patrol to vacate a one-tile passage
    }
    blockedSince=0;
    const step=route[0];await pressStep(tab,step,transition);steps.push(step);
  }
  throw Error(`Exceeded ${maxSteps} normal keyboard steps toward ${JSON.stringify(target)}`);
}
async function approachCommonMob(){
  const walked=[];
  for(let count=0;count<90;count++){
    const current=await state(),commons=current.mobs.filter(m=>!m.unique);
    for(const mob of commons)if(Math.max(Math.abs(mob.x-current.x),Math.abs(mob.y-current.y))<=1)return {mob,walked};
    const options=[];
    for(const mob of commons){
      const targets=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])targets.push({x:mob.x+dx,y:mob.y+dy});
      const route=await routeTo(page,targets);if(route?.length)options.push({mob,route});
    }
    options.sort((a,b)=>a.route.length-b.route.length);
    assert(options.length,`no route to one of ${commons.length} common mobs`);
    const step=options[0].route[0];await pressStep(page,step,null);walked.push(step);
  }
  throw Error('Could not approach a common mob through ordinary movement');
}
async function clickMob(id){
  for(const height of [.9,1.3,.6,1.8]){
    const spot=await page.evaluate(({id,height})=>{
      const mob=monsters.find(m=>m.id===id),renderer=ValadaresModern.renderer;if(!mob)return null;
      const p=renderer.project((mob.renderX??mob.x)+.5,height,(mob.renderY??mob.y)+.5),box=renderer.canvas.getBoundingClientRect();
      return {x:box.left+p.x,y:box.top+p.y};
    },{id,height});
    if(!spot)break;await page.mouse.click(spot.x,spot.y);
    if(await page.evaluate(id=>player.target===id&&player.targetType==='monster'&&player.autoAttack,id))return {height,spot};
  }
  throw Error(`Could not select common mob ${id} with a real pointer click`);
}
async function layout(label){
  const bounds=await page.locator('#worldDoor').evaluate(button=>{const r=button.getBoundingClientRect();return {text:button.textContent,
    visible:!button.hidden&&getComputedStyle(button).visibility!=='hidden'&&r.width>0&&r.height>0,
    inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};});
  assert(bounds.visible&&bounds.inside,`${label}: visible entry button inside viewport`);
  await page.screenshot({path:path.join(runDir,`${label}.png`)});return bounds;
}
async function main(){
  fs.mkdirSync(runDir,{recursive:true});
  fs.mkdirSync(tempDir,{recursive:true});
  const accounts=Array.from({length:2},(_,index)=>({name:`AQ${index}${crypto.randomBytes(3).toString('hex')}`,password:`AQ${crypto.randomBytes(9).toString('hex')}!`}));
  seed(accounts.map(a=>seedAccount(a.name,a.password)));
  const backendPort=await freePort(),staticPort=await startStatic();
  phase='backend';await startBackend(backendPort);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  phase='login';page=await login(staticPort,backendPort,accounts[0],'main');
  const initial=await state();assert.deepEqual([initial.x,initial.y],[23,60]);
  assert.deepEqual(initial.entrance,{x:23,y:60});assert.deepEqual(initial.forge,{x:75,y:33});
  phase='journey';
  if(!(await page.locator('#journeyExpedition').isVisible())){
    if(await page.locator('#journeyMobile').isVisible())await page.locator('#journeyMobile').click();
    if(!(await page.locator('#journeyExpedition').isVisible())&&await page.locator('#journeyToggle').isVisible())await page.locator('#journeyToggle').click();
  }
  await page.locator('#journeyExpedition').click();
  await page.waitForFunction(()=>document.getElementById('journeyMore')?.textContent.includes('Complexo dos Autômatos'));
  const journey=await page.locator('#journeyMore').textContent();
  assert.match(journey,/Complexo dos Autômatos[\s\S]*23\s*,\s*60/i);
  assert.match(journey,/Portal da Forja[\s\S]*?75\s*,\s*33/i,'Forgotten Forge route remains visible');
  await page.screenshot({path:path.join(runDir,'01-journey-both-routes.png')});
  await page.keyboard.press('Escape');

  phase='ordinary approach to portal';
  const neighborRoutes=await Promise.all([[24,60],[22,60],[23,61],[23,59]].map(async ([x,y])=>({target:{x,y},route:await routeTo(page,[{x,y}])})));
  const neighbor=neighborRoutes.find(v=>v.route?.length===1);assert(neighbor,'portal has an adjacent walkable tile');
  await walkTo(page,neighbor.target);await walkTo(page,{x:23,y:60});
  await page.waitForFunction(()=>!document.getElementById('worldDoor')?.hidden);
  const atPortal=await state();assert.match(atPortal.door,/Entrar\s*·\s*Complexo dos Autômatos\s*\[G\]/);
  assert.match(atPortal.mapLegend+' '+atPortal.sideLegend,/Complexo dos Autômatos/);
  const desktop=await layout('02-entrance-1440x900');
  await page.setViewportSize({width:844,height:390});await pause(250);
  const compact=await layout('03-entrance-844x390');

  phase='normal button entry';const enterStart=frames.length;
  await page.locator('#worldDoor').click();
  await waitForFrame(enterStart,f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='automatonEnter','button sends automatonEnter');
  const first=(await waitForFrame(enterStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='dungeonEnter','automaton floor 1')).message;
  assert.equal(first.automaton,'complexo_automatos');assert.equal(first.floor,2001);assert.equal(first.depth,1);
  assert.equal(first.mobs.filter(m=>!m.unique).length,9,'nine initial common mobs');
  await page.waitForFunction(()=>player._automaton==='complexo_automatos'&&player._dungeonDepth===1);
  await page.keyboard.press('Escape'); // clear any target picked under the portal button
  await page.waitForFunction(()=>document.getElementById('floorBadgeText')?.textContent.includes('Andar 1'));
  const floor1=await state();assert.match(floor1.badge,/Andar 1/);assert.doesNotMatch(floor1.badge+' '+floor1.mapLegend+' '+floor1.mapAria,/Andar 2001/);
  assert.match(floor1.mapAria,/Complexo dos Autômatos · Andar 1/,'minimap accessible description uses logical floor');
  assert.equal(floor1.mobs.filter(m=>!m.unique).length,9);
  await page.screenshot({path:path.join(runDir,'04-floor1-844x390.png')});

  phase='shared floor';peer=await login(staticPort,backendPort,accounts[1],'peer');
  await peer.waitForFunction(()=>!document.getElementById('worldDoor')?.hidden);
  const peerStart=frames.length;await peer.locator('#worldDoor').click();
  const peerEntered=(await waitForFrame(peerStart,f=>f.who==='peer'&&f.direction==='received'&&f.message.t==='dungeonEnter','peer entry')).message;
  assert.equal(peerEntered.floor,2001);assert.equal(peerEntered.automaton,'complexo_automatos');
  await peer.keyboard.press('Escape');
  let sharedMain=[],sharedPeer=[];
  const sharedUntil=Date.now()+22000;
  while(Date.now()<sharedUntil){
    sharedMain=(await state()).mobs.filter(m=>!m.unique).map(m=>m.id).sort((a,b)=>a-b);
    sharedPeer=(await state(peer)).mobs.filter(m=>!m.unique).map(m=>m.id).sort((a,b)=>a-b);
    if(sharedMain.length===9&&sharedPeer.length===9&&JSON.stringify(sharedMain)===JSON.stringify(sharedPeer))break;
    await pause(250);
  }
  assert.equal(sharedMain.length,9);assert.equal(sharedPeer.length,9);
  assert.deepEqual(sharedPeer,sharedMain,'two concurrent clients see the same nine current mob IDs');
  await peer.screenshot({path:path.join(runDir,'05-shared-floor-peer.png')});
  await peer.close();peer=null;

  phase='natural common combat';
  const approached=await approachCommonMob();const target=approached.mob;
  await page.screenshot({path:path.join(runDir,'06-approached-common-mob.png')});
  const combatStart=frames.length;const pointer=await clickMob(target.id);
  await waitForFrame(combatStart,f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='attackMob'&&f.message.monsterId===target.id,'native attackMob',20000);
  const impact=(await waitForFrame(combatStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='combatImpact'&&f.message.targetId===target.id&&f.message.amount>0,'authoritative impact',20000)).message;
  const kill=(await waitForFrame(combatStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='mobKill'&&f.message.mobId===target.id,'native mob kill',90000)).message;
  assert(['FORGE_SENTRY','FORGE_CONSTRUCT'].includes(kill.mobType));assert(Array.isArray(kill.loot));
  await page.waitForFunction(id=>!monsters.some(m=>m.id===id),target.id);
  const afterKill=(await state()).mobs.filter(m=>!m.unique);
  assert(!afterKill.some(m=>m.id===target.id),'native kill removes the original mob');
  const respawnStart=Date.now();
  await page.waitForFunction(()=>monsters.filter(m=>m.hp>0&&!m.unique).length===9,null,{timeout:22000});
  const respawnWaitMs=Date.now()-respawnStart;
  const replenished=(await state()).mobs.filter(m=>!m.unique);
  assert(!replenished.some(m=>m.id===target.id),'replacement has a new mob ID');
  assert(replenished.some(m=>!first.mobs.some(initial=>initial.id===m.id)),'periodic respawn created a new common mob');
  await page.screenshot({path:path.join(runDir,'07-replenished-after-native-kill.png')});

  phase='walk to descend staircase';
  assert(floor1.stairs?.down,'floor 1 has a server-authoritative descent stair');
  const descentStart=frames.length;const descentWalk=await walkTo(page,floor1.stairs.down,{transition:'down'});
  await waitForFrame(descentStart,f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='automatonDescend','ordinary stair descent');
  const descended=(await waitForFrame(descentStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='dungeonEnter'&&f.message.depth===2,'floor 2')).message;
  assert.equal(descended.floor,2002);assert.equal(descended.mobs.filter(m=>!m.unique).length,9);
  await page.waitForFunction(()=>document.getElementById('floorBadgeText')?.textContent.includes('Andar 2'));
  const floor2=await state();assert.match(floor2.badge,/Andar 2/);assert.doesNotMatch(floor2.badge+' '+floor2.mapLegend,/Andar 2002/);
  await page.screenshot({path:path.join(runDir,'08-floor2-844x390.png')});

  phase='ordinary ascent';
  assert(floor2.stairs?.up,'floor 2 has a server-authoritative ascent stair');
  await pause(1250);
  const ascentStart=frames.length;await walkTo(page,floor2.stairs.up,{transition:'up'});
  await waitForFrame(ascentStart,f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='automatonAscend','ordinary stair ascent');
  const ascended=(await waitForFrame(ascentStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='dungeonEnter'&&f.message.depth===1,'return to floor 1')).message;
  assert.equal(ascended.floor,2001);await page.waitForFunction(()=>player._dungeonDepth===1);

  phase='ordinary exit and repeat entry';
  const returnFloor1=await state();assert(returnFloor1.stairs?.up,'floor 1 retains its exit stair');
  await pause(1250);
  const exitStart=frames.length;await walkTo(page,returnFloor1.stairs.up,{transition:'exit'});
  await waitForFrame(exitStart,f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='automatonAscend','floor-1 stair exit');
  await waitForFrame(exitStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='dungeonExit','return to portal');
  const returned=await state();assert.deepEqual([returned.x,returned.y,returned.floor],[23,60,0]);assert.equal(returned.automaton,null);
  const enterCount=frames.filter(f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='automatonEnter').length;
  await pause(1450);assert.equal((await state()).floor,0,'standing on portal does not loop into dungeon');
  assert.equal(frames.filter(f=>f.who==='main'&&f.direction==='sent'&&f.message.t==='automatonEnter').length,enterCount);
  await page.screenshot({path:path.join(runDir,'09-returned-to-portal.png')});
  const repeatStart=frames.length;await page.keyboard.press('g');
  const repeat=(await waitForFrame(repeatStart,f=>f.who==='main'&&f.direction==='received'&&f.message.t==='dungeonEnter'&&f.message.automaton==='complexo_automatos','G reentry')).message;
  assert.equal(repeat.floor,2001);assert.equal(repeat.depth,1);
  assert.deepEqual(pageErrors,[],'no uncaught browser errors');assert.deepEqual(httpErrors,[],'no local HTTP failures');
  assert(!/\[uncaughtException\]|\[unhandledRejection\]|\[tick:spawnAutomatonMobs\]/.test(backendLog),'no backend exception');
  const report={pass:true,clientRoot,accounts:accounts.map(a=>a.name),initial,journey,approach:neighbor.target,atPortal,desktop,compact,
    floor1:{floor:first.floor,depth:first.depth,mobIds:first.mobs.filter(m=>!m.unique).map(m=>m.id),badge:floor1.badge,mapLegend:floor1.mapLegend},
    shared:{floor:peerEntered.floor,mainMobIds:sharedMain,peerMobIds:sharedPeer},combat:{mobId:target.id,mobType:kill.mobType,walked:approached.walked.length,pointer,impact:impact.amount,loot:kill.loot,
      afterKill:afterKill.length,replenished:replenished.length,respawnWaitMs},
    descent:{steps:descentWalk.length,floor:descended.floor,depth:descended.depth},floor2:{badge:floor2.badge,mapLegend:floor2.mapLegend},
    ascent:{floor:ascended.floor,depth:ascended.depth},returned,repeat:{floor:repeat.floor,depth:repeat.depth},pageErrors,httpErrors,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:true,evidence:runDir,sharedFloor:true,nativeKill:target.id,replenished:replenished.length,stairs:'down-up-exit',reentry:true}));
}
main().catch(async error=>{
  let clientState=null;try{if(page&&!page.isClosed())clientState=await state();}catch{}
  const failure={pass:false,phase,error:error.stack||String(error),clientRoot,evidence:runDir,clientState,
    recentFrames:frames.slice(-14),pageErrors,httpErrors,backendLog:backendLog.slice(-3500)};
  try{if(page&&!page.isClosed())await page.screenshot({path:path.join(runDir,'failure.png')});}catch{}
  try{fs.mkdirSync(runDir,{recursive:true});fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(failure,null,2));}catch{}
  console.error(error.stack||error);process.exitCode=1;
}).finally(async()=>{
  if(peer&&!peer.isClosed())await peer.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(staticServer)await new Promise(resolve=>staticServer.close(resolve));
  if(backend){backend.kill();await Promise.race([new Promise(resolve=>backend.once('exit',resolve)),pause(2000)]);}
  if(tempDir.startsWith(os.tmpdir()+path.sep))fs.rmSync(tempDir,{recursive:true,force:true});
});
