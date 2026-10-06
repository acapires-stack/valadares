const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const out='C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/audio-evidence';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>{const p=new URL(route.request().url()).pathname;if(p==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Audio QA</title>'});const f=path.join(root,p);return fs.existsSync(f)?route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(f)}):route.fulfill({status:404});});
  await page.goto('http://audio-fixture.test/');await page.addScriptTag({path:path.join(root,'game-audio.js')});
  const result=await page.evaluate(async()=>{
   const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const ctx=new AudioContext();await ctx.resume();
   const engine=ValadaresAudio.create(ctx);engine.setVolumes({master:100,effects:100,music:0,ambient:0});engine.setScene({active:true});
   for(let i=0;i<200 && engine.inspect().loadedSamples.length<43;i++)await wait(25);
   const buffers=new Map();const groups=[];const create=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const s=create(),start=s.start.bind(s);s.start=(...args)=>{if(!buffers.has(s.buffer))buffers.set(s.buffer,buffers.size);groups.push(buffers.get(s.buffer));return start(...args);};return s;};
   const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
   const variants=[];for(let i=0;i<12;i++){clock+=776;engine.play('melee');variants.push(groups.at(-1));}
   clock+=1000;const first=engine.play('impact',{eventId:'confirmed-one',weaponType:'ranged'});clock+=1000;const duplicate=engine.play('impact',{eventId:'confirmed-one',weaponType:'ranged'});
   engine.setVolumes({master:0});const muted=engine.play('melee');engine.setScene({active:false});engine.setVolumes({master:100});const inactive=engine.play('melee');engine.setScene({active:true});clock+=1000;const reentry=engine.play('melee');
   const state=engine.inspect();Date.now=realNow;engine.dispose();await ctx.close();
   async function mixAt(volume){
    const context=new OfflineAudioContext(2,44100*2,44100);const e=ValadaresAudio.create(context);e.setVolumes({master:volume,effects:volume,music:0,ambient:0});e.setScene({active:true});
    for(let i=0;i<200&&e.inspect().loadedSamples.length<43;i++)await wait(25);
    const oldNow=Date.now;let time=oldNow();Date.now=()=>time;
    for(const kind of ['melee','ranged','wand','damage','kill','critical','impact','spell','pickup']){time+=150;e.play(kind,{spell:'fire',weaponType:'melee'});}
    Date.now=oldNow;const b=await context.startRendering();let peak=0,energy=0,clipped=0;const pcm=b.getChannelData(0);for(const s of pcm){peak=Math.max(peak,Math.abs(s));energy+=s*s;if(Math.abs(s)>=1)clipped++;}e.dispose();return{peak,rms:Math.sqrt(energy/pcm.length),clipped};
   }
   return{variants,first,duplicate,muted,inactive,reentry,state,mixDefault:await mixAt(70),mixMax:await mixAt(100)};
  });
  assert.equal(result.state.loadedSamples.length,43,'every common variant and spell must be decoded');
  for(let i=0;i<12;i+=4)assert.equal(new Set(result.variants.slice(i,i+4)).size,4,'each bag contains every recording once at regular 776ms cadence');
  for(let i=1;i<12;i++)assert.notEqual(result.variants[i],result.variants[i-1],'no immediate repetition across bags');
  assert.equal(result.first,true);assert.equal(result.duplicate,false);assert.equal(result.muted,false);assert.equal(result.inactive,false);assert.equal(result.reentry,true);
  assert.equal(result.mixMax.clipped,0,'maximum controls and simultaneous mixed events retain headroom');
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
