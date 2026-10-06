// Dedicated synthetic account, isolated Chrome. Movement/combat run through the actual client/server.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const out='C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/audio-evidence';
const lethalOnly=process.env.QA_AUDIO_LETHAL==='1';
const recordingName=lethalOnly?'lethal-final':'game-live';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__audioTrace=[];window.__audioOrigin=0;
   const buffers=new WeakMap(),bodies=new WeakMap(),fetch0=window.fetch;
   window.fetch=async(...args)=>{const r=await fetch0(...args),read=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await read();bodies.set(b,String(args[0]));return b;};return r;};
   const Ctx=window.AudioContext;
   window.AudioContext=class extends Ctx{
    constructor(...args){super(...args);const decode=this.decodeAudioData.bind(this),create=this.createBufferSource.bind(this);
     this.decodeAudioData=async b=>{const audio=await decode(b);buffers.set(audio,bodies.get(b));return audio;};
     this.createBufferSource=()=>{const s=create(),start=s.start.bind(s);s.start=(...params)=>{__audioTrace.push({t:this.currentTime-__audioOrigin,type:'source',asset:buffers.get(s.buffer)||'synthesis',duration:s.buffer?.duration,loop:s.loop});return start(...params);};return s;};
    }
   };
  });
  await page.goto('http://127.0.0.1:3338/jogar3d?ws=ws://127.0.0.1:8098');await page.fill('#charInput','RevisaoAudio');await page.fill('#pwdInput','Valadares18!');await page.click('button[onclick="tryLogin(true)"]');
  await page.waitForFunction(()=>window.ValadaresModern?.state==='ready'&&started&&audioEngine?.inspect?.().loadedSamples.length>=43);
  if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
  if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();await page.keyboard.press('Escape');
  await page.evaluate(()=>{clearTarget();eatBestFood();});
  for(let count=0;count<80;count++){
   const s=await page.evaluate(()=>{if(player.x===50&&player.y===50)return{done:true};const blocked=new Set([...monsters.filter(m=>m.hp>0).map(m=>`${m.x},${m.y}`),...NPCS.map(n=>`${n.pos.x},${n.pos.y}`)]),q=[[player.x,player.y,null]],seen=new Set([`${player.x},${player.y}`]);for(let i=0;i<q.length;i++){const[x,y,first]=q[i];for(const[dx,dy,key]of[[0,-1,'w'],[0,1,'s'],[-1,0,'a'],[1,0,'d']]){const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;if(seen.has(k)||!map[ny]||!walkable(map[ny][nx])||blocked.has(k))continue;const next=first||key;if(nx===50&&ny===50)return{key:next,x:player.x,y:player.y};seen.add(k);q.push([nx,ny,next]);}}return{blocked:true};});
   if(s.done)break;if(s.blocked)throw Error('No ordinary route back to plaza');await page.keyboard.down(s.key);try{await page.waitForFunction(s=>player.x!==s.x||player.y!==s.y,s,{timeout:2200,polling:15});}finally{await page.keyboard.up(s.key);}await page.waitForTimeout(65);
  }
  await page.waitForTimeout(2300);
  await page.evaluate(lethalOnly=>{
   __audioOrigin=audioCtx.currentTime;__audioTrace=[];
   const capture=audioCtx.createMediaStreamDestination();masterGain.connect(capture);window.__capture=capture;window.__chunks=[];
   window.__captureVideo=lethalOnly?window.ValadaresModern.renderer.captureStream(30):null;
   const tracks=[...capture.stream.getAudioTracks(),...(__captureVideo?.getVideoTracks()||[])];
   window.__recorder=new MediaRecorder(new MediaStream(tracks),{mimeType:lethalOnly?'video/webm;codecs=vp8,opus':'audio/webm;codecs=opus'});__recorder.ondataavailable=e=>__chunks.push(e.data);__recorder.start();
   const play=audioEngine.play;audioEngine.play=(kind,details)=>{const accepted=play(kind,details);__audioTrace.push({t:audioCtx.currentTime-__audioOrigin,type:'event',kind,details,accepted,x:player.x,y:player.y,floor:player.floor});return accepted;};
   ws.addEventListener('message',event=>{try{
    const m=JSON.parse(event.data);if(['combatImpact','mobKill','playerDamage'].includes(m.t))__audioTrace.push({t:audioCtx.currentTime-__audioOrigin,type:'server',message:m});
    if(lethalOnly&&m.t==='mobKill')for(const afterMs of [0,100,350,700,1100])setTimeout(()=>__audioTrace.push({t:audioCtx.currentTime-__audioOrigin,type:'deathVisual',afterMs,targetId:m.mobId,gameplayPresent:monsters.some(x=>x.id===m.mobId),deathVisuals:window.ValadaresModern.renderer.actors.diagnostics().deathVisuals}),afterMs);
   }catch{}});
   document.addEventListener('valadares:actor-gesture',event=>__audioTrace.push({t:audioCtx.currentTime-__audioOrigin,type:'gesture',performanceAt:performance.now(),...event.detail}));
  },lethalOnly);
  const mark=scene=>page.evaluate(scene=>__audioTrace.push({t:audioCtx.currentTime-__audioOrigin,type:'scene',scene,state:audioEngine.inspect(),position:{x:player.x,y:player.y,floor:player.floor}}),scene);
  await mark('plaza-live');await page.waitForTimeout(lethalOnly?500:4500);
  async function stepToward(target,range){
   for(let n=0;n<65;n++){
    const s=await page.evaluate(({id,range})=>{
     const m=monsters.find(m=>m.id===id);if(!m||m.hp<=0)return {gone:true};if(Math.max(Math.abs(player.x-m.x),Math.abs(player.y-m.y))<=range&&!playerInSafeZone()&&hasLineOfSight(player.x,player.y,m.x,m.y))return {done:true};
     const blocked=new Set([...monsters.filter(m=>m.hp>0).map(m=>`${m.x},${m.y}`),...NPCS.map(n=>`${n.pos.x},${n.pos.y}`)]),q=[[player.x,player.y,null]],seen=new Set([`${player.x},${player.y}`]);
     for(let i=0;i<q.length;i++){const [x,y,first]=q[i];for(const[dx,dy,key]of[[0,-1,'w'],[0,1,'s'],[-1,0,'a'],[1,0,'d']]){const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;if(seen.has(k)||!map[ny]||!walkable(map[ny][nx])||blocked.has(k))continue;const next=first||key;if(Math.max(Math.abs(nx-m.x),Math.abs(ny-m.y))<=range&&!inSafeZone(nx,ny)&&hasLineOfSight(nx,ny,m.x,m.y))return {key:next,x:player.x,y:player.y};seen.add(k);q.push([nx,ny,next]);}}return {blocked:true};
    },{id:target,range});
    if(s.done)return true;if(s.gone||s.blocked)return false;
    await page.keyboard.down(s.key);try{await page.waitForFunction(s=>player.x!==s.x||player.y!==s.y,s,{timeout:2200,polling:15});}finally{await page.keyboard.up(s.key);}await page.waitForTimeout(65);
   }return false;
  }
  const stages=lethalOnly?[['CAJADO_FOGO',4,'lethal-live']]:[['ESPADA_ACO',1,'melee-live'],['ARCO',4,'ranged-live'],['CAJADO_FOGO',4,'magic-live']];
  for(const [weapon,range,scene]of stages){
   await page.evaluate(key=>{clearTarget();if(player.equipped.weapon!==key)equip(key);},weapon);await page.waitForTimeout(400);
   if(weapon==='ARCO' && !await page.evaluate(()=>!!findArrow())){
    await mark('switch-bow-without-ammo');await page.waitForTimeout(900);continue;
   }
   const target=await page.evaluate(()=>[...monsters].filter(m=>m.hp>0).sort((a,b)=>Math.max(Math.abs(a.x-player.x),Math.abs(a.y-player.y))-Math.max(Math.abs(b.x-player.x),Math.abs(b.y-player.y)))[0]?.id);
   await mark('walk-to-'+scene);const reached=target!=null&&await stepToward(target,range);await mark(scene);
   if(reached){
    await page.evaluate(id=>{player.target=id;player.targetType='monster';player.autoAttack=true;},target);
    if(lethalOnly){await page.waitForFunction(id=>__audioTrace.some(e=>e.type==='server'&&e.message.t==='mobKill'&&e.message.mobId===id),target,{timeout:15000});await page.waitForTimeout(1800);}
    else await page.waitForTimeout(4000);
    await page.evaluate(()=>clearTarget());
   }
   await page.screenshot({path:path.join(out,scene+'.png')});
  }
  if(!lethalOnly){
   await mark('mute-live');await page.evaluate(()=>{settings.volMaster=0;refreshAudioVolume();});await page.waitForTimeout(1000);
   await mark('resume-live');await page.evaluate(()=>{settings.volMaster=70;refreshAudioVolume();});await page.waitForTimeout(1000);
  }
  const result=await page.evaluate(async()=>{
   const done=new Promise(resolve=>__recorder.onstop=resolve);__recorder.stop();await done;masterGain.disconnect(__capture);__capture.stream.getTracks().forEach(t=>t.stop());__captureVideo?.getTracks().forEach(t=>t.stop());
   const bytes=new Uint8Array(await new Blob(__chunks).arrayBuffer());let s='';for(const b of bytes)s+=String.fromCharCode(b);
   return {webm:btoa(s),trace:__audioTrace,state:audioEngine.inspect()};
  });
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,recordingName+'.webm'),Buffer.from(result.webm,'base64'));delete result.webm;
  fs.writeFileSync(path.join(out,recordingName+'.json'),JSON.stringify({fixture:false,at:new Date().toISOString(),url:page.url(),errors,...result},null,2));
  console.log(JSON.stringify({events:result.trace.filter(e=>e.type==='event'),state:result.state,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
