// Disposable local account and backend. Runs the real browser client; never uses production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const net=require('node:net');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'work/weapon-combat-review-20261007');
fs.mkdirSync(out,{recursive:true});
const run=path.join(out,'live-'+Date.now());fs.mkdirSync(run);
const password='ReviewBow2026!';
const name='ReviewBow'+String(Math.floor(Math.random()*1e5)).padStart(5,'0');
const clientHash='s256:'+crypto.createHash('sha256').update(password).digest('hex');
const salt=crypto.randomBytes(16).toString('hex');
const pwHash=`scrypt$${salt}$${crypto.scryptSync(clientHash,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'].map(k=>[k,{val:18,xp:0,xpNext:2400}]));
const save={v:2,x:50,y:50,skills,gold:1000,inv:{ARCO:1,BESTA:1,FLECHA:100,FLECHA_PERF:50,POTION:20},
 equipped:{weapon:'ARCO',offhand:null,armor:null,head:null,feet:null,neck:null},
 chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
 stats:{mobKills:{},pkKills:0,pkDeaths:0,mobDeaths:0,bossKills:0,startedAt:Date.now()},
 hp:250,maxHp:250,mp:200,maxMp:200,pvp:false,savedAt:Date.now()};
fs.writeFileSync(path.join(run,'accounts.json'),JSON.stringify({v:1,savedAt:Date.now(),accounts:[{name,pwHash,save,savedAt:Date.now(),createdAt:Date.now(),email:null,emailVerified:false,resetToken:null}]}));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.mp3':'audio/mpeg'};
const web=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const pathname=['/','/jogar','/jogar3d'].includes(url.pathname)?'/play.html':url.pathname;
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function waitBackend(port){for(let i=0;i<80;i++){try{await new Promise((resolve,reject)=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve();});s.once('error',reject);});return;}catch{await new Promise(r=>setTimeout(r,100));}}throw Error('backend local unavailable');}
async function stepToward(page,targetId,range){
 await page.evaluate(id=>{player.target=id;player.targetType='monster';player.autoAttack=false;},targetId);
 for(let n=0;n<90;n++){
  const s=await page.evaluate(({id,range})=>{
   const m=monsters.find(m=>m.id===id);if(!m||m.hp<=0)return{gone:true};
   if(Math.max(Math.abs(player.x-m.x),Math.abs(player.y-m.y))<=range&&!playerInSafeZone()&&hasLineOfSight(player.x,player.y,m.x,m.y))return{done:true};
   const blocked=new Set([...monsters.filter(m=>m.hp>0).map(m=>`${m.x},${m.y}`),...NPCS.map(n=>`${n.pos.x},${n.pos.y}`)]);
   const q=[[player.x,player.y,null]],seen=new Set([`${player.x},${player.y}`]);
   for(let i=0;i<q.length;i++){const[x,y,first]=q[i];for(const[dx,dy,key]of[[0,-1,'w'],[0,1,'s'],[-1,0,'a'],[1,0,'d']]){
    const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;if(seen.has(k)||!map[ny]||!walkable(map[ny][nx])||blocked.has(k))continue;
    const next=first||key;if(Math.max(Math.abs(nx-m.x),Math.abs(ny-m.y))<=range&&!inSafeZone(nx,ny)&&hasLineOfSight(nx,ny,m.x,m.y))return{key:next,x:player.x,y:player.y};
    seen.add(k);q.push([nx,ny,next]);}}
   return{blocked:true};
  },{id:targetId,range});
  if(s.done)return true;if(s.gone||s.blocked)return false;
  await page.keyboard.down(s.key);try{await page.waitForFunction(v=>player.x!==v.x||player.y!==v.y,s,{timeout:2000,polling:20});}
  catch{return false;}finally{await page.keyboard.up(s.key);}
  await page.waitForTimeout(45);
 }return false;
}
(async()=>{
 let backend,browser;
 try{
  const gamePort=await freePort();await new Promise(r=>web.listen(0,'127.0.0.1',r));
  const log=fs.openSync(path.join(run,'backend.log'),'w');
  backend=spawn(process.execPath,[path.join(root,'tools/modern/backend-local.cjs')],{cwd:root,windowsHide:true,stdio:['ignore',log,log],
   env:{...process.env,NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),PORT:String(gamePort),
    STATE_FILE_PATH:path.join(run,'state.json'),ACCOUNTS_FILE_PATH:path.join(run,'accounts.json'),
    MP_CREDITED_PATH:path.join(run,'mp_credited.json'),ADMIN_NAME:'__local_disabled__',ADMIN_TOKEN:'',MP_ACCESS_TOKEN:'',RESEND_API_KEY:'',ALERTS_ENABLED:'0'}});
  await waitBackend(gamePort);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${web.address().port}/jogar3d?ws=ws://127.0.0.1:${gamePort}`);
  await page.locator('#charInput').fill(name);await page.locator('#pwdInput').fill(password);
  await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(()=>window.ValadaresModern?.state==='ready'&&started&&ws?.readyState===1,null,{timeout:45000});
  if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
  if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
  await page.keyboard.press('Escape');
  const initial=await page.evaluate(()=>({name:player.name,equipped:player.equipped,inv:player.inv,auth:typeof _wsAuthed!=='undefined'?_wsAuthed:null}));
  fs.writeFileSync(path.join(run,'initial.json'),JSON.stringify(initial,null,2));
  await page.evaluate(()=>{clearTarget();if(player.equipped.weapon!=='ARCO')equip('ARCO');
   window.__bowTrace=[];const emit=(type,payload)=>__bowTrace.push({type,t:performance.now(),...payload});
   document.addEventListener('valadares:actor-gesture',e=>{if(e.detail.actorId!=='self')return;
    emit('gesture',{detail:e.detail,x:player.renderX,y:player.renderY,dir:player.dir});
    if(e.detail.phase==='contact'&&window.__pendingSwitchAttackAt!=null&&!window.__switchedBowTarget){window.__switchedBowTarget=true;
     const other=monsters.find(m=>m.hp>0&&m.id!==player.target);if(other){player.target=other.id;emit('targetSwitch',{targetId:other.id,attackPresentationAt:window.__pendingSwitchAttackAt});}}
   });
   const send=ws.send.bind(ws);ws.send=data=>{try{const msg=JSON.parse(data);if(msg.t==='attackMob'){
    emit('attackSent',{attackPresentationAt:msg.attackPresentationAt,targetId:msg.monsterId});
    if(!window.__switchedBowTarget)window.__pendingSwitchAttackAt=msg.attackPresentationAt;
   }}catch{}return send(data);};
   ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(['combatImpact','mobKill','mobFloat'].includes(m.t))emit('server',{
    message:m,gameplayPresent:m.mobId!=null?monsters.some(x=>x.id===m.mobId):undefined,
    deathVisuals:ValadaresModern.renderer.actors.diagnostics().deathVisuals});}catch{}});
   const sound=audioEngine?.play?.bind(audioEngine);if(sound)audioEngine.play=(kind,details)=>{emit('sound',{kind,eventId:details?.eventId});return sound(kind,details);};
   const actors=ValadaresModern.renderer.actors,retain=actors.retainConfirmedDeath.bind(actors);
   actors.retainConfirmedDeath=detail=>{emit('retainDeath',{eventId:detail.eventId,targetId:detail.targetId,contactAt:detail.contactAt});return retain(detail);};
   const push=projectiles.push.bind(projectiles);projectiles.push=(...items)=>{for(const p of items)if(p.arrow)emit('arrow',{
    attackPresentationAt:p.attackPresentationAt,startX:p.startX,startY:p.startY,startHeight:p.startHeight,
    endX:p.endX,endY:p.endY,duration:p.duration});return push(...items);};
  });
  await page.waitForTimeout(300);
  const postEquip=await page.evaluate(()=>({name:player.name,equipped:player.equipped,arrows:player.inv.FLECHA,inventory:player.inv}));
  fs.writeFileSync(path.join(run,'post-equip.json'),JSON.stringify(postEquip,null,2));
  assert.equal(postEquip.equipped.weapon,'ARCO','disposable account must have bow equipped');
  const candidates=await page.evaluate(()=>monsters.filter(m=>m.hp>=75).map(m=>({id:m.id,type:m.type,hp:m.hp,x:m.x,y:m.y,d:Math.max(Math.abs(m.x-player.x),Math.abs(m.y-player.y))})).sort((a,b)=>a.d-b.d).slice(0,20));
  fs.writeFileSync(path.join(run,'candidates.json'),JSON.stringify(candidates,null,2));
  let target=null;for(const m of candidates){if(await stepToward(page,m.id,4)){target=m;break;}}
  assert(target,'no reachable durable monster for local ranged test');
  await page.waitForTimeout(400);
  await page.evaluate(id=>{__bowTrace=[];player.target=id;player.targetType='monster';player.autoAttack=false;
   const m=monsters.find(x=>x.id===id);if(m)doAttack(m);},target.id);
  await page.waitForFunction(()=>__bowTrace.some(e=>e.type==='gesture'&&e.detail.phase==='prepare'),null,{timeout:5000,polling:10});
  const move=await page.evaluate(id=>{const m=monsters.find(x=>x.id===id);
   for(const[dx,dy,key]of[[1,0,'d'],[-1,0,'a'],[0,1,'s'],[0,-1,'w']]){
    const nx=player.x+dx,ny=player.y+dy;
    if(map[ny]&&walkable(map[ny][nx])&&!inSafeZone(nx,ny)&&
       Math.max(Math.abs(nx-m.x),Math.abs(ny-m.y))<=6&&
       !monsters.some(o=>o.hp>0&&o.x===nx&&o.y===ny))return{key,startX:player.renderX,startY:player.renderY};
   }return null;},target.id);
  if(move){
   await page.keyboard.down(move.key);
   try{await page.waitForFunction(()=>__bowTrace.some(e=>e.type==='gesture'&&e.detail.phase==='contact'),null,{timeout:2000,polling:10});
    await page.screenshot({path:path.join(run,'release-while-moving.png')});
   }finally{await page.keyboard.up(move.key);}
  }
  for(let i=0;i<2;i++){
   await page.waitForTimeout(850);
   await page.evaluate(id=>{let m=monsters.find(x=>x.id===id&&x.hp>0&&
    Math.max(Math.abs(x.x-player.x),Math.abs(x.y-player.y))<=6&&hasLineOfSight(player.x,player.y,x.x,x.y));
    if(!m)m=monsters.find(x=>x.hp>0&&Math.max(Math.abs(x.x-player.x),Math.abs(x.y-player.y))<=6&&hasLineOfSight(player.x,player.y,x.x,x.y));
    if(m){player.target=m.id;player.targetType='monster';player.autoAttack=false;doAttack(m);}},target.id);
  }
  try{await page.waitForFunction(()=>__bowTrace.filter(e=>e.type==='gesture'&&e.detail.phase==='prepare').length>=3,null,{timeout:16000});}
  catch(error){const state=await page.evaluate(()=>({player:{x:player.x,y:player.y,weapon:player.equipped.weapon,arrows:player.inv.FLECHA,target:player.target,autoAttack:player.autoAttack},target:monsters.find(m=>m.id===player.target),trace:__bowTrace}));
   fs.writeFileSync(path.join(run,'timeout.json'),JSON.stringify(state,null,2));throw error;}
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(run,'three-shots.png')});
  for(let i=0;i<12;i++){
   if(await page.evaluate(id=>__bowTrace.some(e=>e.type==='server'&&e.message.t==='mobKill'&&e.message.mobId===id),target.id))break;
   await page.waitForTimeout(850);
   const state=await page.evaluate(id=>{const m=monsters.find(x=>x.id===id&&x.hp>0);
    return m?{alive:true,inRange:Math.max(Math.abs(m.x-player.x),Math.abs(m.y-player.y))<=6&&hasLineOfSight(player.x,player.y,m.x,m.y)}:{alive:false};},target.id);
   if(!state.alive)break;
   if(!state.inRange && !await stepToward(page,target.id,4))break;
   await page.evaluate(id=>{const m=monsters.find(x=>x.id===id);if(m){player.target=id;player.targetType='monster';player.autoAttack=false;doAttack(m);}},target.id);
  }
  await page.waitForTimeout(500);
  const trace=await page.evaluate(()=>__bowTrace);
  const prepares=trace.filter(e=>e.type==='gesture'&&e.detail.phase==='prepare');
  const contacts=trace.filter(e=>e.type==='gesture'&&e.detail.phase==='contact');
  const arrows=trace.filter(e=>e.type==='arrow');
  const impacts=trace.filter(e=>e.type==='sound'&&e.kind==='impact');
  const accepts=trace.filter(e=>e.type==='server'&&e.message.t==='combatImpact');
  const kills=trace.filter(e=>e.type==='server'&&e.message.t==='mobKill'&&e.message.mobId===target.id);
  const switched=trace.find(e=>e.type==='targetSwitch');
  fs.writeFileSync(path.join(run,'trace-before-assert.json'),JSON.stringify({target,trace,errors},null,2));
  console.log(JSON.stringify({counts:{prepares:prepares.length,contacts:contacts.length,arrows:arrows.length,accepted:accepts.length,impacts:impacts.length,kills:kills.length},run}));
  assert(prepares.length>=3&&contacts.length>=3&&arrows.length>=3&&accepts.length>=3,'three accepted real attacks, gestures and arrows');
  assert(arrows.slice(0,3).every((a,i)=>a.t>=contacts[i].t-25),'arrow begins at release');
  for(const ack of accepts.slice(0,3)){
   const arrow=arrows.find(a=>a.attackPresentationAt===ack.message.attackPresentationAt);
   const impact=impacts.find(s=>s.eventId===ack.message.eventId);
   assert(arrow&&impact,'each accepted hit retains its shot and event identity');
   assert(impact.t>=arrow.t+arrow.duration-20,'confirmed impact follows arrow landing');
  }
  assert(kills.length>=1,'real server confirmed lethal bow shot');
  assert(switched&&accepts.some(e=>e.message.attackPresentationAt===switched.attackPresentationAt),
   'server accepted a bow shot after target switched before landing');
  const killSound=trace.find(e=>e.type==='sound'&&e.kind==='kill'&&e.t>=kills[0].t);
  const retained=trace.find(e=>e.type==='retainDeath'&&e.targetId===target.id);
  assert(retained&&killSound,'lethal target retained visually and sounded');
  assert.equal(kills[0].gameplayPresent,false,'authoritative mob removed at kill event');
  if(move){
   const walked=Math.hypot(contacts[0].x-move.startX,contacts[0].y-move.startY);
   assert(walked>.15&&walked<2,'player moved locally during bow draw');
   assert(Math.hypot(arrows[0].startX-contacts[0].x,arrows[0].startY-contacts[0].y)<1,
    'arrow begins at current bow hand after movement');
  }
  assert.deepEqual(errors,[],'browser runtime errors');
  const result={pass:true,target,counts:{prepares:prepares.length,contacts:contacts.length,arrows:arrows.length,accepted:accepts.length,impacts:impacts.length,kills:kills.length},
   acceptedTimings:accepts.slice(0,3).map(a=>{const arrow=arrows.find(x=>x.attackPresentationAt===a.message.attackPresentationAt);
    const impact=impacts.find(x=>x.eventId===a.message.eventId);return{eventId:a.message.eventId,arrow:arrow?.t,landing:arrow?.t+arrow?.duration,impact:impact?.t};}),
   targetSwitch:{attackPresentationAt:switched.attackPresentationAt,targetId:switched.targetId},
   lethal:{mobId:target.id,gameplayPresentAtKill:kills[0].gameplayPresent,visualRetainedAt:retained.t,killSoundAt:killSound.t},
   movement:move?{key:move.key,startX:move.startX,startY:move.startY,contactX:contacts[0]?.x,contactY:contacts[0]?.y,arrowX:arrows[0]?.startX,arrowY:arrows[0]?.startY}:null,
   errors,run};
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify({...result,trace},null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();backend?.kill();await new Promise(r=>web.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
