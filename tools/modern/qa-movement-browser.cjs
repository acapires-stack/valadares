// Real client/server through a loopback-only proxy that batches outbound frames.
// The account and all movement belong to the isolated preview, never production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {WebSocket,WebSocketServer}=require('./.local-deps/node_modules/ws');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const out=path.join(__dirname,'../../docs/remodelacao/evidencias-integracao');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let armed=false,queue=[],timer=null,sent=0,acks=0;const corrections=[],errors=[];
 const proxy=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>proxy.once('listening',r));
 proxy.on('connection',client=>{
  const upstream=new WebSocket('ws://127.0.0.1:8098'),early=[];
  const forward=raw=>{if(upstream.readyState===1)upstream.send(raw,{binary:false});else early.push(raw);};
  upstream.on('open',()=>early.splice(0).forEach(forward));
  client.on('message',raw=>{const message=JSON.parse(raw);if(message.t==='pos')sent++;
   if(armed){queue.push(raw);if(!timer)timer=setTimeout(()=>{const batch=queue.splice(0);timer=null;batch.forEach(forward);},900);}else forward(raw);
  });
  upstream.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='posCorrect')corrections.push(m);if(m.t==='posAck')acks++;if(client.readyState===1)client.send(raw,{binary:false});});
  client.on('close',()=>{clearTimeout(timer);timer=null;queue=[];upstream.close();});upstream.on('error',e=>errors.push(e.message));
 });
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:3338/jogar3d?ws=ws://127.0.0.1:${proxy.address().port}`);
  await page.locator('#charInput').fill('TesteVal18');await page.locator('#pwdInput').fill('Valadares18!');await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(()=>window.ValadaresModern?.state==='ready'&&window.ValadaresModernBridge?.getMovementStatus().version===1,null,{timeout:35000});
  if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
  if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();await page.keyboard.press('Escape');
  const route=await page.evaluate(()=>{
   const b=ValadaresModernBridge,p=b.getPlayer(),map=b.getMap();p.moveDelay=80;
   const blocked=new Set(b.getNpcs().map(n=>`${n.pos.x},${n.pos.y}`));
   for(const [dx,dy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
    const r=[[p.x,p.y],[p.x+dx,p.y],[p.x+dx,p.y+dy],[p.x,p.y+dy]];
    if(r.every(([x,y])=>walkable(map[y]?.[x])&&!blocked.has(`${x},${y}`)&&!monsterAt(x,y)))return r;
   }throw Error('No safe test square at spawn');
  });
  // Drive held keys using the real game loop; no coordinates or movement handlers
  // are overwritten. A four-tile route keeps the synthetic player in the plaza.
  await page.evaluate(route=>{
   window.qaWalking=setInterval(()=>{
    const p=ValadaresModernBridge.getPlayer();const idx=route.findIndex(([x,y])=>p.x===x&&p.y===y);if(idx<0)return;
    const [x,y]=route[(idx+1)%route.length];for(const k of ['w','a','s','d'])keys[k]=false;
    keys[x<p.x?'a':x>p.x?'d':y<p.y?'w':'s']=true;
   },10);
  },route);
  const start=sent;await pause(2200);const normalSteps=sent-start;assert(normalSteps>=18,`normal cadence: ${normalSteps}`);assert.equal(corrections.length,0);
  armed=true;const delayedStart=sent;await pause(4800);
  const diagnostics=await page.evaluate(()=>{clearInterval(window.qaWalking);for(const k of ['w','a','s','d'])keys[k]=false;return ValadaresModernBridge.getMovementStatus();});
  assert(diagnostics.pending<=4);await pause(1200);armed=false;
  assert.equal(corrections.length,0,JSON.stringify(corrections));assert(sent-delayedStart>=12,'movement resumes after batches');
  const final=await page.evaluate(()=>ValadaresModernBridge.getMovementStatus());assert.equal(final.pending,0);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'movimento.png')});
  const result={pass:true,normalSteps,delayedSteps:sent-delayedStart,delayMs:900,acks,corrections,final,errors,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(out,'movimento.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();clearTimeout(timer);await new Promise(r=>proxy.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
