// Disposable, loopback-only QA for the 3D promotion. Never touches production accounts.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'work', 'qa-3d-only', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.woff2':'font/woff2', '.ogg':'audio/ogg', '.mp3':'audio/mpeg' };
const name = 'Q3D' + crypto.randomBytes(3).toString('hex');
const password = 'Q3d' + crypto.randomBytes(8).toString('hex') + '!';
const results = [];
const errors = [];
let backend, web, browser, currentPage, backendLog = '', phase = 'setup';

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function seedAccount() {
  const transport = 's256:' + crypto.createHash('sha256').update(password).digest('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const pwHash = `scrypt$${salt}$${crypto.scryptSync(transport, salt, 32, {N:16384,r:8,p:1}).toString('hex')}`;
  const now = Date.now();
  const skills = Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'].map(key => [key,{val:18,xp:0,xpNext:2400}]));
  const save = {v:2,x:72,y:33,skills,gold:4321,inv:{POTION:3,ESPADA_HL:1},equipped:{weapon:'ESPADA_HL',offhand:null,armor:null,head:null,feet:null,neck:null},chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},hp:100,maxHp:100,mp:100,maxMp:100,pvp:false,savedAt:now};
  fs.writeFileSync(path.join(output,'accounts.json'), JSON.stringify({v:1,savedAt:now,accounts:[{name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null}]}));
}
async function startWeb() {
  web = http.createServer((req,res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = ['/jogar','/jogar3d','/'].includes(url.pathname) ? '/play.html' : url.pathname;
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => web.listen(0,'127.0.0.1',resolve));
  return web.address().port;
}
async function startBackend(port) {
  backend = spawn(process.execPath,[path.join(root,'tools/modern/backend-local.cjs')],{
    cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
      NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'), PORT:String(port),
      STATE_FILE_PATH:path.join(output,'state.json'),ACCOUNTS_FILE_PATH:path.join(output,'accounts.json'),
      MP_CREDITED_PATH:path.join(output,'mp_credited.json'),ADMIN_NAME:'__qa_disabled__',ADMIN_TOKEN:'',
      MP_ACCESS_TOKEN:'',RESEND_API_KEY:'',ALERTS_ENABLED:'0'}
  });
  backend.stdout.on('data', chunk => backendLog += chunk.toString());
  backend.stderr.on('data', chunk => backendLog += chunk.toString());
  const deadline = Date.now()+15000;
  while(Date.now()<deadline) {
    if (backend.exitCode !== null) throw Error('backend exited: ' + backend.exitCode + ' ' + backendLog.slice(-1000));
    try {
      await new Promise((resolve,reject) => {
        const request = http.get(`http://127.0.0.1:${port}/health`,response => {response.resume();response.statusCode===200 ? resolve() : reject(Error(String(response.statusCode)));});
        request.once('error',reject); request.setTimeout(500,()=>request.destroy());
      });
      return;
    } catch { await sleep(100); }
  }
  throw Error('backend startup timeout: ' + backendLog.slice(-1000));
}
function observe(page) { page.on('pageerror',error => errors.push({phase,message:error.message})); }
async function snapshot(page) {
  return page.evaluate(() => {
    const node = id => document.getElementById(id);
    const style = id => node(id) ? getComputedStyle(node(id)) : null;
    const box = id => node(id)?.getBoundingClientRect().toJSON() || null;
    return {path:location.pathname,search:location.search,modern:window.ValadaresModern?.state || null,
      ready:document.body.classList.contains('modern-renderer-ready'),started:typeof started==='boolean'&&started,
      authed:typeof _wsAuthed==='boolean'&&_wsAuthed,name:typeof player==='object'?player.name:null,
      gold:typeof player==='object'?player.gold:null,skill:typeof player==='object'?player.skills?.Espada?.val:null,
      position:typeof player==='object'?{x:player.x,y:player.y}:null,
      layout:document.body.classList.contains('layout-focus')?'focus':document.body.classList.contains('layout-classic')?'complete':'none',
      canvas3d:{display:style('modernCanvas')?.display,box:box('modernCanvas')},
      canvas2d:{visibility:style('canvas')?.visibility,pointerEvents:style('canvas')?.pointerEvents},
      hud:!!node('modernName'),hudName:node('modernName')?.textContent || null,
      recoveryVisible:!!node('modernRenderError')&&!node('modernRenderError').hidden,
      gameInert:!!node('gameWrapper')?.inert};
  });
}
function assert3d(state, label) {
  assert.equal(state.modern,'ready',label+' renderer');
  assert.equal(state.ready,true,label+' ready class');
  assert.equal(state.started,true,label+' started');
  assert.equal(state.authed,true,label+' authenticated');
  assert.equal(state.canvas3d.display,'block',label+' 3D visible');
  assert.ok(state.canvas3d.box?.width>300 && state.canvas3d.box?.height>200,label+' 3D bounds');
  assert.equal(state.canvas2d.visibility,'hidden',label+' 2D hidden');
  assert.equal(state.canvas2d.pointerEvents,'none',label+' 2D input disabled');
  assert.equal(state.recoveryVisible,false,label+' recovery absent');
  assert.equal(state.hud,true,label+' HUD present');
}
async function pageAt(context,webPort,backendPort,route) {
  const page = await context.newPage(); currentPage=page; observe(page);
  await page.route('**/*',request => ['127.0.0.1','localhost'].includes(new URL(request.request().url()).hostname) ? request.continue() : request.abort());
  const response = await page.goto(`http://127.0.0.1:${webPort}${route}${route.includes('?')?'&':'?'}ws=ws://127.0.0.1:${backendPort}`,{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200,route+' HTTP status');
  await page.waitForFunction(() => window.ValadaresModern?.state==='ready' || !document.getElementById('modernRenderError').hidden,null,{timeout:30000});
  return page;
}
async function login(page) {
  await page.locator('#charInput').fill(name);
  await page.locator('#pwdInput').fill(password);
  await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(() => started && _wsAuthed && myWsId && window.ValadaresModern?.state==='ready',null,{timeout:30000});
  const decline=page.getByRole('button',{name:'Recusar',exact:true}); if(await decline.isVisible())await decline.click();
  const dismiss=page.locator('#firstStepsDismiss');if(await dismiss.isVisible())await dismiss.click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('modernCanvas')).display==='block',null,{timeout:10000});
}
async function record(page,label) {
  const state=await snapshot(page); assert3d(state,label);results.push({label,...state});
  await page.screenshot({path:path.join(output,label+'.png'),animations:'disabled'});
  return state;
}
async function main() {
  fs.mkdirSync(output,{recursive:true});seedAccount();
  const backendPort=await freePort(),webPort=await startWeb();await startBackend(backendPort);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  if(process.argv.includes('--capture-full')) {
    phase='capture full HUD';
    const page=await pageAt(context,webPort,backendPort,'/jogar');await login(page);
    await page.locator('#layoutModeBtn').click();
    const state=await snapshot(page);assert3d(state,'clean full HUD');assert.equal(state.layout,'complete');
    await page.waitForTimeout(8500);
    await page.screenshot({path:path.join(output,'hud-complete-clean.png'),animations:'disabled'});
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,mode:'capture-full',state,errors},null,2));
    console.log(JSON.stringify({ok:true,output,image:path.join(output,'hud-complete-clean.png'),errors},null,2));
    return;
  }
  const routes=[['jogar','/jogar'],['play','/play.html'],['jogar3d','/jogar3d'],['classic-param','/jogar?visual=classic']];
  for(const [label,route] of routes) {
    phase=label;
    const page=await pageAt(context,webPort,backendPort,route);await login(page);
    const state=await record(page,label);assert.equal(state.gold,4321,label+' saved gold');assert.equal(state.skill,18,label+' saved skill');
    if(label==='jogar') {
      phase='HUD'; assert.equal(state.layout,'focus','default HUD focus');
      phase='movement';
      const initial=state.position;
      for(const key of ['d','s','a','w']) {
        await page.keyboard.down(key);await page.waitForTimeout(250);await page.keyboard.up(key);
        if(await page.evaluate(point => player.x!==point.x||player.y!==point.y,initial))break;
      }
      await page.waitForFunction(point => player.x!==point.x||player.y!==point.y,initial,{timeout:4000});
      results.push({label:'movement',before:initial,after:(await snapshot(page)).position});
      await page.locator('#layoutModeBtn').click();
      const complete=await record(page,'hud-complete');assert.equal(complete.layout,'complete','complete HUD');
      await page.locator('#layoutModeBtn').click();
      const focus=await record(page,'hud-focus');assert.equal(focus.layout,'focus','focus HUD restored');
      await page.evaluate(() => logout());
      await page.waitForFunction(() => !started && getComputedStyle(document.getElementById('login')).display==='flex');
      await login(page);await record(page,'same-tab-reentry');
      await page.waitForTimeout(7000);
      await page.screenshot({path:path.join(output,'village-clean.png'),animations:'disabled'});
    }
    await page.close();currentPage=null;
  }
  phase='new-tab-reentry';
  let page=await pageAt(context,webPort,backendPort,'/jogar');await login(page);await record(page,'new-tab-reentry');await page.close();currentPage=null;
  phase='WebGL failure';
  page=await pageAt(context,webPort,backendPort,'/jogar');await login(page);
  const positionBeforeFailure=(await snapshot(page)).position;
  await page.locator('#modernCanvas').dispatchEvent('webglcontextlost');
  await page.waitForFunction(() => !document.getElementById('modernRenderError').hidden);
  const failed=await snapshot(page);results.push({label:'webgl-failure',...failed});
  assert.equal(failed.recoveryVisible,true,'recovery screen visible');
  assert.equal(failed.canvas2d.visibility,'hidden','2D remains hidden after failure');
  assert.equal(failed.canvas2d.pointerEvents,'none','2D input stays disabled after failure');
  assert.equal(failed.gameInert,true,'game controls inert after failure');
  await page.keyboard.press('d');await page.waitForTimeout(350);
  assert.deepEqual((await snapshot(page)).position,positionBeforeFailure,'keyboard cannot move after WebGL failure');
  await page.screenshot({path:path.join(output,'webgl-failure.png'),animations:'disabled'});
  await page.locator('#modernRenderReload').click();
  await page.waitForFunction(() => window.ValadaresModern?.state==='ready' && document.getElementById('modernRenderError').hidden,null,{timeout:30000});
  await login(page);await record(page,'webgl-recovered');
  await page.close();currentPage=null;
  phase='module failure';
  page=await context.newPage();currentPage=page;observe(page);
  await page.route('**/modern/renderer.js*',request=>request.abort());
  await page.goto(`http://127.0.0.1:${webPort}/jogar?ws=ws://127.0.0.1:${backendPort}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !document.getElementById('modernRenderError').hidden,null,{timeout:20000});
  const blocked=await snapshot(page);results.push({label:'module-failure',...blocked});
  assert.equal(blocked.canvas2d.visibility,'hidden','2D hidden on module failure');
  assert.equal(blocked.gameInert,true,'game inert on module failure');
  await page.screenshot({path:path.join(output,'module-failure.png'),animations:'disabled'});
  await page.unroute('**/modern/renderer.js*');
  await page.locator('#modernRenderReload').click();
  await page.waitForFunction(() => window.ValadaresModern?.state==='ready' && document.getElementById('modernRenderError').hidden,null,{timeout:30000});
  await login(page);await record(page,'module-recovered');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,name,results,errors,backendLog:backendLog.slice(-3000)},null,2));
  console.log(JSON.stringify({ok:true,output,cases:results.map(x=>x.label),errors},null,2));
}
main().catch(async error=>{
  if(currentPage&&!currentPage.isClosed())try{await currentPage.screenshot({path:path.join(output,'failure.png')});}catch{}
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,phase,error:String(error.stack||error),results,errors,backendLog:backendLog.slice(-5000)},null,2));
  console.error(JSON.stringify({ok:false,phase,error:String(error.stack||error),output},null,2));
  process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close();
  if(web)await new Promise(resolve=>{web.closeAllConnections?.();web.close(resolve);});
  if(backend&&backend.exitCode===null){backend.kill();await Promise.race([new Promise(resolve=>backend.once('exit',resolve)),sleep(3000)]);}
});
