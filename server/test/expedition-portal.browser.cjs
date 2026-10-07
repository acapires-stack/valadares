// Real browser route through the Forgotten Forge portal, using an isolated account/server.
// QA_CLIENT_ROOT=dist-web can verify a built client; default is the source root.
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
const outRoot=path.resolve(root,process.env.QA_OUTPUT_ROOT||'work/forja-entrada-2026-10-07/browser');
const runDir=path.join(outRoot,`run-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream',
  '.ogg':'audio/ogg','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let backend,staticServer,browser,page,phase='setup',backendLog='';
const frames=[],pageErrors=[];
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
async function waitForFrame(start,match,label,timeout=10000){
  const until=Date.now()+timeout;
  while(Date.now()<until){const found=frames.slice(start).find(match);if(found)return found;await pause(40);}
  throw Error(`Timed out waiting for ${label}; frames=${JSON.stringify(frames.slice(-8))}`);
}
function seed(name,password){
  const transport='s256:'+crypto.createHash('sha256').update(password).digest('hex');
  const salt=crypto.randomBytes(16).toString('hex');
  const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
  const now=Date.now();
  const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia']
    .map(key=>[key,{val:18,xp:0,xpNext:2400}]));
  const save={v:2,x:72,y:33,skills,gold:12000,appearance:{v:1,body:'knight',palette:'original'},
    inv:{ESPADA:1,POTION:5},equipped:{weapon:null,offhand:null,armor:null,head:null,feet:null,neck:null},
    chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
    hp:250,maxHp:250,mp:200,maxMp:200,pvp:true,savedAt:now};
  fs.writeFileSync(path.join(runDir,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts:[
    {name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null}]}));
  fs.writeFileSync(path.join(runDir,'state.json'),JSON.stringify({v:1,savedAt:now,nextMobId:910001,monsters:[]}));
}
async function startStatic(){
  assert(fs.existsSync(path.join(clientRoot,'play.html')),`CLIENT_ROOT lacks play.html: ${clientRoot}`);
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
  // Advance only this disposable server's clock past its post-restart return-to-town window.
  // The account retains the seeded 72,33 location; no test teleport or direct position write occurs.
  const entry="const http=require('node:http');const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return listen.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');const realNow=Date.now;Date.now=()=>realNow()+181000;";
  backend=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
    PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
    STATE_FILE_PATH:path.join(runDir,'state.json'),ACCOUNTS_FILE_PATH:path.join(runDir,'accounts.json'),
    MP_CREDITED_PATH:path.join(runDir,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
    ADMIN_NAME:'__forge_portal_qa__',ALERTS_ENABLED:'0',PROGRESSION_ENABLED:'1'}});
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
function attachFrames(tab){
  tab.on('websocket',socket=>{
    for(const [event,direction] of [['framesent','sent'],['framereceived','received']])socket.on(event,raw=>{
      try{const message=JSON.parse(raw.payload);if(['expeditionEnter','expeditionExit','expeditionResult','dungeonEnter','dungeonExit','posCorrect'].includes(message.t))
        frames.push({direction,message});}catch{}
    });
  });
  tab.on('pageerror',error=>pageErrors.push(error.message));
}
async function login(staticPort,backendPort,name,password){
  page=await browser.newPage({viewport:{width:1440,height:900}});attachFrames(page);
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    return u.hostname==='127.0.0.1'||u.hostname==='localhost'?route.continue():route.abort();
  });
  await page.goto(`http://127.0.0.1:${staticPort}/jogar3d?ws=ws://127.0.0.1:${backendPort}`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#charInput').fill(name);await page.locator('#pwdInput').fill(password);
  await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(()=>started&&_wsAuthed&&myWsId&&window.ValadaresModern?.state==='ready',null,{timeout:30000});
  const refuse=page.getByRole('button',{name:'Recusar',exact:true});if(await refuse.isVisible())await refuse.click();
  const dismiss=page.locator('#firstStepsDismiss');if(await dismiss.isVisible())await dismiss.click();
  await page.keyboard.press('Escape');
}
async function state(){return page.evaluate(()=>({x:player.x,y:player.y,floor:player.floor||0,
  expedition:player._expedition||null,door:document.getElementById('worldDoor')?.textContent||'',
  doorVisible:!!document.getElementById('worldDoor')&&!document.getElementById('worldDoor').hidden,
  mapLegend:document.getElementById('modernMapLegend')?.textContent||'',
  sideLegend:document.getElementById('modernSidebarMapLegend')?.textContent||'',
  entrance:window.ValadaresProgression?.robotExpedition?.npc||null,
  depths:DUNGEON_STAIR_IN,exit:player._expeditionExit||null}));}
async function pathTo(x,y){
  return page.evaluate(({x,y})=>{
    const start={x:player.x,y:player.y},queue=[start],seen=new Set([`${start.x},${start.y}`]),parent=new Map();
    for(let i=0;i<queue.length;i++){
      const at=queue[i];if(at.x===x&&at.y===y){
        const route=[];let key=`${x},${y}`;
        while(parent.has(key)){const prev=parent.get(key);route.push({x:Number(key.split(',')[0]),y:Number(key.split(',')[1]),key:prev.key});key=prev.from;}
        return route.reverse();
      }
      for(const [dx,dy,key] of [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']]){
        const nx=at.x+dx,ny=at.y+dy,id=`${nx},${ny}`;
        if(seen.has(id)||!map[ny]||!walkable(map[ny][nx])||npcOnTile(nx,ny)||monsterAt(nx,ny))continue;
        seen.add(id);parent.set(id,{from:`${at.x},${at.y}`,key});queue.push({x:nx,y:ny});
      }
    }
    return null;
  },{x,y});
}
async function walkTo(x,y,{allowExit=false}={}){
  const route=await pathTo(x,y);assert(route,`walkable route to ${x},${y}`);assert(route.length<=12,`short local route to ${x},${y}`);
  for(const [index,step] of route.entries()){
    const finalExit=allowExit&&index===route.length-1;
    await page.keyboard.down(step.key);
    try{await page.waitForFunction(({x,y,finalExit})=>(player.x===x&&player.y===y)||
      (finalExit&&player.floor===0&&player.x===75&&player.y===33),
      {x:step.x,y:step.y,finalExit},{timeout:5000});}
    finally{await page.keyboard.up(step.key);}
    await pause(80);
    const current=await state();
    if(finalExit&&current.floor===0&&current.x===75&&current.y===33)continue;
    assert.deepEqual([current.x,current.y],[step.x,step.y],`normal key moved to ${step.x},${step.y}`);
  }
  return route;
}
async function layout(label){
  const bounds=await page.locator('#worldDoor').evaluate(button=>{
    const r=button.getBoundingClientRect();return {text:button.textContent,inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
  });
  assert(bounds.inside,`${label}: entrance button inside viewport`);
  await page.screenshot({path:path.join(runDir,`${label}.png`)});
  return bounds;
}
async function main(){
  fs.mkdirSync(runDir,{recursive:true});
  const name='FQa'+crypto.randomBytes(4).toString('hex'); // login input caps names at 14 chars
  const password='Forge'+crypto.randomBytes(10).toString('hex')+'!';
  seed(name,password);const backendPort=await freePort(),staticPort=await startStatic();
  phase='backend';await startBackend(backendPort);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  phase='login';await login(staticPort,backendPort,name,password);
  const initial=await state();assert.deepEqual([initial.x,initial.y],[72,33]);
  assert.deepEqual(initial.entrance,{x:75,y:33});assert.deepEqual(initial.depths,{x:83,y:17});
  assert.equal(initial.expedition,null);
  phase='journey';
  if(!(await page.locator('#journeyExpedition').isVisible())){
    if(await page.locator('#journeyMobile').isVisible())await page.locator('#journeyMobile').click();
    if(!(await page.locator('#journeyExpedition').isVisible())&&await page.locator('#journeyToggle').isVisible())await page.locator('#journeyToggle').click();
  }
  await page.locator('#journeyExpedition').click();
  await page.waitForFunction(()=>document.getElementById('journeyMore')?.textContent.includes('Portal da Forja'));
  const journey=await page.locator('#journeyMore').textContent();
  assert.match(journey,/Portal da Forja.*75\s*,\s*33/i);
  assert.match(journey,/Velho Ferreiro.*78\s*,\s*22/i);
  await page.screenshot({path:path.join(runDir,'01-journey-two-entrances.png')});

  phase='walk to portal';const route=await walkTo(75,33);
  await page.waitForFunction(()=>!document.getElementById('worldDoor')?.hidden);
  const atPortal=await state();assert.deepEqual([atPortal.x,atPortal.y],[75,33]);
  assert.match(atPortal.door,/Entrar\s*·\s*Forja Esquecida\s*\[G\]/);
  assert.match(atPortal.mapLegend+' '+atPortal.sideLegend,/Forja Esquecida/i,'minimap legend marks forge entrance');
  const desktop=await layout('02-portal-desktop');
  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(250);const compact=await layout('03-portal-844x390');
  assert.match((await state()).mapLegend+' '+(await state()).sideLegend,/Forja Esquecida/i);

  phase='click entrance';const firstStart=frames.length;
  await page.locator('#worldDoor').click();
  const sent=await waitForFrame(firstStart,f=>f.direction==='sent'&&f.message.t==='expeditionEnter','real button expeditionEnter');
  assert.equal(sent.message.expedition,'forja_esquecida');
  const entered=await waitForFrame(firstStart,f=>f.direction==='received'&&f.message.t==='dungeonEnter','new dungeon entry');
  assert.equal(entered.message.expedition,'forja_esquecida');assert.equal(entered.message.expeditionLayout,'forge_forgotten_v2');
  await page.waitForFunction(()=>player._expedition==='forja_esquecida'&&player.floor>=8000);
  const inside=await state();assert.deepEqual([inside.x,inside.y],[43,50]);assert.deepEqual(inside.exit,{x:43,y:50});
  await page.screenshot({path:path.join(runDir,'04-inside-forge-844x390.png')});

  phase='walk out via staircase';
  await walkTo(44,50);
  const exitStart=frames.length;
  await walkTo(43,50,{allowExit:true});
  await waitForFrame(exitStart,f=>f.direction==='sent'&&f.message.t==='expeditionExit','normal movement exit');
  await waitForFrame(exitStart,f=>f.direction==='received'&&f.message.t==='dungeonExit','return at portal');
  await page.waitForFunction(()=>player.floor===0&&player._expedition===null&&player.x===75&&player.y===33);
  const returned=await state();assert.deepEqual([returned.x,returned.y],[75,33]);
  const enteredCount=frames.filter(f=>f.direction==='sent'&&f.message.t==='expeditionEnter').length;
  await pause(1500);
  assert.equal((await state()).floor,0,'standing on portal does not automatically reenter');
  assert.equal(frames.filter(f=>f.direction==='sent'&&f.message.t==='expeditionEnter').length,enteredCount,'no automatic reentry request');
  await page.screenshot({path:path.join(runDir,'05-returned-no-loop.png')});

  phase='reenter using G';
  const secondStart=frames.length;
  await page.keyboard.press('g');
  const second=await waitForFrame(secondStart,f=>f.direction==='received'&&f.message.t==='dungeonEnter','second entry using real G');
  assert.equal(second.message.expedition,'forja_esquecida');assert.notEqual(second.message.floor,entered.message.floor);
  await page.waitForFunction(()=>player._expedition==='forja_esquecida'&&player.floor>=8000);
  assert.deepEqual(pageErrors,[],'no uncaught browser errors');
  const report={pass:true,clientRoot,account:name,initial,journey,route,atPortal,desktop,compact,
    first:{floor:entered.message.floor,layout:entered.message.expeditionLayout},inside,returned,
    second:{floor:second.message.floor,layout:second.message.expeditionLayout},pageErrors,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:true,evidence:runDir,portal:[75,33],firstFloor:report.first.floor,secondFloor:report.second.floor}));
}
main().catch(async error=>{
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
