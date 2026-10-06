// Captures the actual browser audio graph. This controlled fixture is not a game playtest.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.AUDIO_QA_OUTPUT || 'C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/audio-evidence';
const label = process.argv[2] || 'candidate';
fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--autoplay-policy=no-user-gesture-required'] });
 try {
  const page = await browser.newPage();
  await page.route('**/*', route => {
   const pathname = new URL(route.request().url()).pathname;
   if (pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><button>Audio fixture</button>'});
   const file = path.join(root, pathname);
   return fs.existsSync(file) ? route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(file)}) : route.fulfill({status:404});
  });
  await page.goto('http://audio-fixture.test/');
  await page.addScriptTag({path:path.join(root,'game-audio.js')});
  const result = await page.evaluate(async () => {
   const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
   const ctx = new AudioContext();
   await ctx.resume();
   const trace = [], buffers = new WeakMap(), bodies = new WeakMap();
   const fetch0=window.fetch;
   window.fetch=async (...args) => {const response=await fetch0(...args); const read=response.arrayBuffer.bind(response); response.arrayBuffer=async()=>{const b=await read(); bodies.set(b,String(args[0])); return b;}; return response;};
   const decode=ctx.decodeAudioData.bind(ctx);
   ctx.decodeAudioData=async b=>{const audio=await decode(b); buffers.set(audio,bodies.get(b)); return audio;};
   const create=ctx.createBufferSource.bind(ctx);
   ctx.createBufferSource=()=>{const source=create();const start=source.start.bind(source);source.start=(...args)=>{trace.push({t:ctx.currentTime,type:'source',asset:buffers.get(source.buffer)||'synthesis',duration:source.buffer?.duration,loop:source.loop,rate:source.playbackRate.value});return start(...args);};return source;};
   const Audio0=window.Audio;
   window.Audio=function(){const media=new Audio0();media.addEventListener('playing',()=>trace.push({t:ctx.currentTime,type:'music',asset:media.src}));return media;};
   const engine=ValadaresAudio.create(ctx);
   const capture=ctx.createMediaStreamDestination(); engine.masterGain.connect(capture);
   const chunks=[];const recorder=new MediaRecorder(capture.stream,{mimeType:'audio/webm;codecs=opus'});
   recorder.ondataavailable=e=>chunks.push(e.data);
   const finished=new Promise(resolve=>recorder.onstop=resolve);
   recorder.start();
   const mark=(scene)=>trace.push({t:ctx.currentTime,type:'scene',scene});
   const play=(kind,details={})=>trace.push({t:ctx.currentTime,type:'event',kind,details,accepted:engine.play(kind,details)});
   engine.setVolumes({master:70,effects:80,ambient:40,music:25}); engine.setScene({active:true,biome:'pz'}); mark('plaza');
   await wait(5000);
   mark('walk-stone'); for(let i=0;i<8;i++){play('footstep',{material:'stone'}); await wait(380);}
   engine.setVolumes({music:0,ambient:0});engine.setScene({combat:true}); mark('melee-isolated');
   for(let i=0;i<5;i++){play('melee'); await wait(180);play('impact',{weaponType:'melee',eventId:'m'+i});await wait(620);}
   mark('ranged-isolated'); for(let i=0;i<5;i++){play('ranged');await wait(250);play('impact',{weaponType:'ranged',eventId:'r'+i});await wait(550);}
   mark('magic-isolated');for(let i=0;i<4;i++){play('wand');await wait(250);play('impact',{weaponType:'wand',eventId:'w'+i});await wait(750);}
   play('spell',{spell:'fireball'});await wait(1500);
   mark('master-mute');engine.setVolumes({master:0});play('melee');await wait(1000);
   mark('reentry');engine.setScene({active:false});engine.setVolumes({master:70,music:25,ambient:40});engine.setScene({active:true,biome:'pz'});await wait(2000);
   recorder.stop();await finished;
   const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
   const state=engine.inspect?.();engine.dispose();await ctx.close();
   return {webm:btoa(binary),trace,state};
  });
  fs.writeFileSync(path.join(output,label+'.webm'),Buffer.from(result.webm,'base64'));
  delete result.webm;
  fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify({fixture:true,label,...result},null,2));
  console.log(JSON.stringify({label,events:result.trace.length,output}));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
