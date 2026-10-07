// Real browser + isolated backend: paid outfits are one-time purchases.
// Run with node server/test/appearance-purchases.browser.cjs. Optional QA_CLIENT_ROOT=dist-web.
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
const clientRoot=path.resolve(root,process.env.QA_CLIENT_ROOT||process.env.CLIENT_ROOT||'.');
const outRoot=path.resolve(root,process.env.QA_OUTPUT_ROOT||'work/skin-unlock-2026-10-07');
const runDir=path.join(outRoot,`browser-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.svg':'image/svg+xml','.wasm':'application/wasm','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.bin':'application/octet-stream','.ogg':'audio/ogg','.mp3':'audio/mpeg','.woff2':'font/woff2'};
let phase='setup',browser=null,backend=null,staticServer=null,backendLog='',page=null;
const frames=[];
const browserEvents=[];

async function freePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});
  });
}
async function waitFor(fn,description,timeout=10000){
  const until=Date.now()+timeout;
  while(Date.now()<until){const value=fn();if(value)return value;await delay(40);}
  throw Error(`Timed out: ${description}; recent frames=${JSON.stringify(frames.slice(-8))}`);
}
function seedAccount(name,password){
  const transport='s256:'+crypto.createHash('sha256').update(password).digest('hex');
  const salt=crypto.randomBytes(16).toString('hex');
  const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
  const now=Date.now();
  const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia']
    .map(key=>[key,{val:18,xp:0,xpNext:2400}]));
  const save={v:2,x:50,y:50,skills,gold:12000,appearance:{v:1,body:'knight',palette:'original'},appearanceOwned:[],
    inv:{ESPADA:1,ARCO:1,FLECHA:50,POTION:5},equipped:{weapon:null,offhand:null,armor:null,head:null,feet:null,neck:null},
    chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
    hp:250,maxHp:250,mp:200,maxMp:200,pvp:true,savedAt:now};
  fs.writeFileSync(path.join(runDir,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts:[
    {name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null}]}));
  fs.writeFileSync(path.join(runDir,'state.json'),JSON.stringify({v:1,savedAt:now,nextMobId:910001,monsters:[]}));
}
function diskSave(name){
  const account=JSON.parse(fs.readFileSync(path.join(runDir,'accounts.json'),'utf8')).accounts.find(a=>a.name===name);
  assert(account,`temporary account ${name} exists`);
  return account.save;
}
async function startStatic(){
  assert(fs.existsSync(path.join(clientRoot,'play.html')),`CLIENT_ROOT must contain play.html: ${clientRoot}`);
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
  const entry="const http=require('node:http');const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return listen.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');";
  backend=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
    PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
    STATE_FILE_PATH:path.join(runDir,'state.json'),ACCOUNTS_FILE_PATH:path.join(runDir,'accounts.json'),
    MP_CREDITED_PATH:path.join(runDir,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
    ADMIN_NAME:'__appearance_purchase_qa__',ALERTS_ENABLED:'0'}});
  backend.stdout.on('data',chunk=>backendLog+=chunk.toString());
  backend.stderr.on('data',chunk=>backendLog+=chunk.toString());
  const until=Date.now()+15000;
  while(Date.now()<until){
    if(backend.exitCode!==null)throw Error(`Temporary backend exited: ${backend.exitCode}\n${backendLog.slice(-2000)}`);
    try{await new Promise((resolve,reject)=>{
      const req=http.get(`http://127.0.0.1:${port}/health`,res=>{res.resume();res.statusCode===200?resolve():reject(Error(`health ${res.statusCode}`));});
      req.once('error',reject);req.setTimeout(400,()=>req.destroy(Error('health timeout')));
    });return;}catch{await delay(100);}
  }
  throw Error(`Temporary backend did not listen\n${backendLog.slice(-2000)}`);
}
function attachFrames(tab){
  tab.on('websocket',socket=>{
    for(const [event,direction] of [['framesent','sent'],['framereceived','received']])socket.on(event,raw=>{
      try{const message=JSON.parse(raw.payload);if(['appearanceSet','appearanceResult','authOk','authFail'].includes(message.t))frames.push({direction,message});}catch{}
    });
  });
}
async function login(context,staticPort,backendPort,name,password,viewport){
  const tab=await context.newPage();await tab.setViewportSize(viewport);attachFrames(tab);
  await tab.goto(`http://127.0.0.1:${staticPort}/jogar3d?ws=ws://127.0.0.1:${backendPort}`,{waitUntil:'domcontentloaded',timeout:30000});
  await tab.locator('#charInput').fill(name);await tab.locator('#pwdInput').fill(password);
  await tab.locator('button[onclick="tryLogin(true)"]').click();
  try{await tab.waitForFunction(()=>started&&_wsAuthed&&myWsId&&window.ValadaresModern?.state==='ready',null,{timeout:15000});}
  catch(error){
    const diagnostic=await tab.evaluate(()=>({started:typeof started==='undefined'?'undefined':started,
      authed:typeof _wsAuthed==='undefined'?'undefined':_wsAuthed,
      id:typeof myWsId==='undefined'?'undefined':myWsId,
      modernEnabled:window.VALADARES_MODERN,modern:window.ValadaresModern?.state||null,
      loginVisible:getComputedStyle(document.getElementById('login')).display,
      bodyText:document.body.innerText.slice(0,500)})).catch(e=>({evaluateError:e.message}));
    throw Error(`${error.message}; login diagnostic=${JSON.stringify(diagnostic)}`);
  }
  const refuse=tab.getByRole('button',{name:'Recusar',exact:true});if(await refuse.isVisible())await refuse.click();
  const dismiss=tab.locator('#firstStepsDismiss');if(await dismiss.isVisible())await dismiss.click();
  await tab.keyboard.press('Escape');
  return tab;
}
const appearance=(body,palette='original')=>({v:1,body,palette});
async function state(tab){return tab.evaluate(()=>({gold:player.gold,x:player.x,y:player.y,
  appearance:{...player.appearance},appearanceOwned:[...(player.appearanceOwned||[])],
  preview:player._appearancePreview?{...player._appearancePreview}:null,
  model:window.ValadaresModern?.renderer?.actors?.entries?.get('self')?.model||null}));}
async function openAppearance(tab){
  await tab.keyboard.press('v');
  await tab.waitForFunction(()=>window.ValadaresAppearanceUI?.isOpen(),null,{timeout:5000});
}
async function select(tab,body,palette='original'){
  await tab.locator(`[data-body="${body}"]`).click();
  await tab.locator(`[data-palette="${palette}"]`).click();
}
async function apply(tab,body,palette,expectedGold){
  const start=frames.length;
  await select(tab,body,palette);
  await tab.locator('[data-save]').click();
  const sent=await waitFor(()=>frames.slice(start).find(f=>f.direction==='sent'&&f.message.t==='appearanceSet'),`${body} UI request`);
  const received=await waitFor(()=>frames.slice(start).find(f=>f.direction==='received'&&f.message.t==='appearanceResult'&&f.message.requestId===sent.message.requestId),`${body} server result`);
  assert.equal(received.message.ok,true,JSON.stringify(received.message));
  await tab.waitForFunction(({body,palette,expectedGold})=>player.appearance?.body===body&&player.appearance?.palette===palette&&player.gold===expectedGold,
    {body,palette,expectedGold},{timeout:10000});
  return {request:sent.message,result:received.message};
}
async function layout(tab,label){
  const box=await tab.locator('#appearanceModal').evaluate(el=>{
    const r=el.getBoundingClientRect(),s=el.querySelector('[data-save]').getBoundingClientRect();
    return {dialogInside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      saveVisible:s.top>=0&&s.bottom<=innerHeight&&s.left>=0&&s.right<=innerWidth,
      dialog:{x:r.x,y:r.y,width:r.width,height:r.height}};
  });
  assert(box.dialogInside&&box.saveVisible,`${label}: dialog and Save visible within viewport`);
  await tab.screenshot({path:path.join(runDir,`${label}.png`)});
  return box;
}
async function main(){
  fs.mkdirSync(runDir,{recursive:true});
  const name='SkinQa'+crypto.randomBytes(4).toString('hex');
  const password='Skin'+crypto.randomBytes(10).toString('hex')+'!';
  seedAccount(name,password);
  const backendPort=await freePort(),staticPort=await startStatic();
  phase='backend';await startBackend(backendPort);
  phase='browser';browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext();
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    return u.hostname==='127.0.0.1'||u.hostname==='localhost'?route.continue():route.abort();
  });
  const pageErrors=[];context.on('page',tab=>{
    tab.on('pageerror',error=>{pageErrors.push(error.message);browserEvents.push('pageerror '+error.message);});
    tab.on('console',message=>{if(message.type()==='error')browserEvents.push('console '+message.text());});
    tab.on('requestfailed',request=>browserEvents.push(`failed ${request.url()} ${request.failure()?.errorText}`));
    tab.on('response',response=>{if(response.status()>=400)browserEvents.push(`${response.status()} ${response.url()}`);});
  });

  phase='login desktop';page=await login(context,staticPort,backendPort,name,password,{width:1440,height:900});
  const initial=await state(page);assert.equal(initial.gold,12000);assert.deepEqual(initial.appearance,appearance('knight'));
  assert.deepEqual(initial.appearanceOwned,[]);assert.deepEqual([initial.x,initial.y],[50,50],'square start outside Dyer range');
  await openAppearance(page);const desktop=await layout(page,'01-desktop-before-purchase');
  await select(page,'engineer');
  const firstPrice=await page.locator('[data-cost]').textContent();
  assert.match(firstPrice,/5[.,]000\s*gold/i,'first Engineer purchase price is visible');
  assert.match(await page.locator('[data-body="engineer"] small').textContent(),/5[.,]000\s*gold.*compra [uú]nica/i);
  assert.match(await page.locator('[data-save]').textContent(),/comprar.*5[.,]000\s*gold/i);
  const preview=await state(page);assert.deepEqual(preview.appearance,initial.appearance);assert.equal(preview.gold,12000);
  assert.equal(preview.preview?.body,'engineer');
  phase='first Engineer purchase';
  const first=await apply(page,'engineer','original',7000);
  assert.equal(first.result.costGold,5000);assert.equal(first.result.replayed,false);
  assert.deepEqual((await state(page)).appearanceOwned,['engineer']);
  assert.deepEqual(diskSave(name).appearanceOwned,['engineer']);
  await page.screenshot({path:path.join(runDir,'02-engineer-bought.png')});

  phase='replay';
  const replayFrom=frames.length;
  await page.evaluate(request=>ws.send(JSON.stringify(request)),first.request);
  const replay=await waitFor(()=>frames.slice(replayFrom).find(f=>f.direction==='received'&&f.message.t==='appearanceResult'&&f.message.requestId===first.request.requestId),'same operation replay');
  assert.equal(replay.message.ok,true);assert.equal(replay.message.replayed,true);assert.equal(replay.message.costGold,0);
  assert.equal(replay.message.gold,7000);assert.equal(diskSave(name).gold,7000);
  assert.deepEqual(diskSave(name).appearanceOwned,['engineer']);

  phase='free basic and owned Engineer';await delay(600);
  const basic=await apply(page,'ranger','original',7000);assert.equal(basic.result.costGold,0);
  await delay(600);await select(page,'engineer');
  const ownedLabel=await page.locator('[data-body="engineer"] small').textContent();
  assert.match(ownedLabel,/comprad|desbloquead|adquirid/i,'owned outfit marked as purchased/unlocked');
  assert.match(await page.locator('[data-cost]').textContent(),/gr[aá]tis/i,'owned outfit can be re-equipped free');
  const engineerAgain=await apply(page,'engineer','original',7000);assert.equal(engineerAgain.result.costGold,0);
  assert.deepEqual((await state(page)).appearanceOwned,['engineer']);

  phase='Druid first purchase';await delay(600);
  await select(page,'druid');assert.match(await page.locator('[data-cost]').textContent(),/5[.,]000\s*gold/i);
  const druid=await apply(page,'druid','original',2000);assert.equal(druid.result.costGold,5000);
  assert.deepEqual((await state(page)).appearanceOwned,['engineer','druid']);
  assert.deepEqual(diskSave(name).appearanceOwned,['engineer','druid']);

  phase='insufficient gold';await delay(600);
  const beforeBlocked=await state(page),outgoingBefore=frames.filter(f=>f.direction==='sent'&&f.message.t==='appearanceSet').length;
  await select(page,'barbarian_large');
  assert.match(await page.locator('[data-cost]').textContent(),/5[.,]000\s*gold/i);
  await page.locator('[data-save]').click();
  await page.waitForFunction(()=>/gold (?:in)?suficiente/i.test(document.querySelector('[data-status]')?.textContent||''));
  assert.equal(frames.filter(f=>f.direction==='sent'&&f.message.t==='appearanceSet').length,outgoingBefore,'client does not submit unaffordable purchase');
  const blocked=await state(page);assert.deepEqual(blocked.appearance,beforeBlocked.appearance);assert.equal(blocked.gold,2000);
  assert.equal(blocked.preview?.body,'barbarian_large','unaffordable draft remains visible for later purchase');
  assert.deepEqual(blocked.appearanceOwned,['engineer','druid']);
  assert.deepEqual(diskSave(name).appearanceOwned,blocked.appearanceOwned);
  await page.screenshot({path:path.join(runDir,'03-third-purchase-blocked.png')});

  phase='close reopen and compact layout';
  await page.locator('[data-close]').click();assert.equal((await state(page)).preview,null);
  await page.setViewportSize({width:844,height:390});await openAppearance(page);
  const compact=await layout(page,'04-owned-844x390');
  assert.match(await page.locator('[data-body="engineer"] small').textContent(),/comprad|desbloquead|adquirid/i);
  assert.match(await page.locator('[data-body="druid"] small').textContent(),/em uso|comprad|desbloquead|adquirid/i);
  await page.locator('[data-close]').click();
  await page.evaluate(()=>logout());
  await page.close();page=null;

  phase='relogin durable';
  page=await login(context,staticPort,backendPort,name,password,{width:844,height:390});
  const relog=await state(page);
  assert.equal(relog.gold,2000);assert.deepEqual(relog.appearance,appearance('druid'));
  assert.deepEqual(relog.appearanceOwned,['engineer','druid']);
  assert.deepEqual(diskSave(name).appearanceOwned,relog.appearanceOwned);
  await openAppearance(page);
  assert.match(await page.locator('[data-body="engineer"] small').textContent(),/comprad|desbloquead|adquirid/i);
  await select(page,'engineer');assert.match(await page.locator('[data-cost]').textContent(),/gr[aá]tis/i);
  const ownedAfterRelog=await apply(page,'engineer','original',2000);assert.equal(ownedAfterRelog.result.costGold,0);
  assert.deepEqual(diskSave(name).appearanceOwned,['engineer','druid']);
  await layout(page,'05-relogin-owned-844x390');
  assert.deepEqual(pageErrors,[],'no uncaught client errors');
  const report={pass:true,clientRoot,account:name,initial,desktop,firstPrice,first:first.result,
    replay:replay.message,basic:basic.result,ownedLabel,engineerAgain:engineerAgain.result,
    druid:druid.result,blocked:{appearance:blocked.appearance,gold:blocked.gold,owned:blocked.appearanceOwned},
    compact,relog,ownedAfterRelog:ownedAfterRelog.result,finalDisk:{gold:diskSave(name).gold,
      appearance:diskSave(name).appearance,appearanceOwned:diskSave(name).appearanceOwned},pageErrors,
    checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:true,evidence:runDir,firstGold:7000,druidGold:2000,owned:report.finalDisk.appearanceOwned}));
}
main().catch(async error=>{
  const failure={pass:false,phase,error:error.stack||String(error),clientRoot,evidence:runDir,
    recentFrames:frames.slice(-12),browserEvents:browserEvents.slice(-30),backendLog:backendLog.slice(-2000)};
  try{if(page&&!page.isClosed())await page.screenshot({path:path.join(runDir,'failure.png')});}catch{}
  try{fs.mkdirSync(runDir,{recursive:true});fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(failure,null,2));}catch{}
  console.error(error.stack||error);process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close().catch(()=>{});
  if(staticServer)await new Promise(resolve=>staticServer.close(resolve));
  if(backend){backend.kill();await Promise.race([new Promise(resolve=>backend.once('exit',resolve)),delay(2000)]);}
});
