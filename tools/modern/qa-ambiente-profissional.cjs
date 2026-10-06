// Isolated Chrome and synthetic account; only UI/keyboard drive the live game.
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out='C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/ambiente-evidence';
fs.mkdirSync(out,{recursive:true});
const phase=process.env.QA_PHASE||'antes';
const result={phase,at:new Date().toISOString(),states:[],errors:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:950},hasTouch:process.env.QA_TOUCH==='1'});
 page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto('http://127.0.0.1:3338/jogar3d?ws=ws://127.0.0.1:8098');
 await page.locator('#charInput').fill('AmbienteUX');await page.locator('#pwdInput').fill('Valadares18!');await page.locator('button[onclick="tryLogin(true)"]').click();
 await page.waitForFunction(()=>window.ValadaresModern?.state==='ready'&&ValadaresModernBridge.getStarted(),null,{timeout:45000});
 if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
 if(process.env.QA_GUIDE!=='1'&&await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();await page.keyboard.press('Escape');
 await page.waitForFunction(()=>ValadaresModern.diagnostics().world.scenery.pending===0);await delay(400);
 if(process.env.QA_GUIDE!=='1'&&await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
 async function snap(label){
  const state=await page.evaluate(()=>{const p=ValadaresModernBridge.getPlayer();const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,w:r.width,h:r.height,visible:!!r.width&&!!r.height&&c.visibility!=='hidden'&&c.display!=='none',text:e.textContent?.slice(0,150),aria:e.getAttribute('aria-label')};};return {size:[innerWidth,innerHeight],classes:document.body.className,player:{x:p.x,y:p.y,floor:p.floor,hp:p.hp,weapon:p.equipped?.weapon},render:ValadaresModern.diagnostics(),canvases:document.querySelectorAll('#modernCanvas').length,rects:Object.fromEntries(['.modern-hud','.modern-map','#modernMiniMap','#modernSidebarMiniMap','#minimap','#invSidebar','#leftSidebar','.adventure-feedback','#mobileTopBar','#worldDoor','#displayControls','.modern-actions'].map(s=>[s,rect(s)]))};});
  result.states.push({label,...state});fs.writeFileSync(path.join(out,phase+'-result.json'),JSON.stringify(result,null,2));await page.screenshot({path:path.join(out,phase+'-'+label+'.png')});return state;
 }
 const loot=()=>page.evaluate(()=>{const drops=[{id:908001,type:'POTION',qty:2},{id:908002,type:'OSSO',qty:3}];ValadaresAdventureFeedback.captureRemoved(drops.map(d=>d.id),drops);ValadaresAdventureFeedback.loot({ids:drops.map(d=>d.id),gold:42});});
 async function walk(x,y){const origin=await page.evaluate(()=>ValadaresModernBridge.getFloor());for(let i=0;i<160;i++){
  const step=await page.evaluate(({x,y,origin})=>{const b=ValadaresModernBridge,p=b.getPlayer(),grid=b.getMap();if(b.getFloor()!==origin||p.x===x&&p.y===y)return {done:true};const blocked=new Set([...b.getNpcs().map(n=>`${n.pos.x},${n.pos.y}`),...b.getMonsters().filter(m=>m.hp>0).map(m=>`${m.x},${m.y}`)]),q=[[p.x,p.y,null]],seen=new Set([`${p.x},${p.y}`]);if(b.getInterior()&&!(x===50&&y===51))blocked.add('50,51');for(let i=0;i<q.length;i++){const [xx,yy,first]=q[i];for(const [dx,dy,k]of[[0,-1,'w'],[0,1,'s'],[-1,0,'a'],[1,0,'d']]){const nx=xx+dx,ny=yy+dy,id=`${nx},${ny}`;if(seen.has(id)||!grid[ny]||!walkable(grid[ny][nx])||blocked.has(id))continue;const next=first||k;if(nx===x&&ny===y)return {key:next,x:p.x,y:p.y};seen.add(id);q.push([nx,ny,next]);}}return {blocked:true,x:p.x,y:p.y};},{x,y,origin});
  if(step.done)return;if(step.blocked)throw Error('No path '+JSON.stringify(step));await page.keyboard.down(step.key);try{await page.waitForFunction(s=>{const p=ValadaresModernBridge.getPlayer();return p.x!==s.x||p.y!==s.y;},step,{timeout:2400,polling:15});}finally{await page.keyboard.up(step.key);}await delay(65);
 }throw Error('Path limit');}
 if(process.env.QA_GUIDE==='1'){
  await snap('guia');await page.setViewportSize({width:844,height:390});await delay(300);await snap('guia-compacto');await page.locator('#firstStepsDismiss').click();await delay(150);await snap('guia-fechado');
 }else if(process.env.QA_PANELS==='1'){
  result.panels=[];
  for(const [label,id]of [['Missões','questsModal'],['Atributos','statsModal'],['Talentos','talentsModal'],['Conquistas','achievementsModal'],['Ranking','rankingModal'],['Amigos','friendsModal'],['Opções','settingsModal']]){
   for(let repeat=0;repeat<2;repeat++){await page.locator('.modern-actions').getByRole('button',{name:new RegExp('^'+label+' \\(')}).click();await page.locator('#'+id).waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.locator('#'+id).isVisible(),false);}
   result.panels.push(label);
  }
  await page.locator('#modernCharacter').click();assert(await page.locator('#leftSidebar').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#leftSidebar').isVisible(),false);
  await page.locator('#inventoryPanelBtn').click();await page.locator('#equipmentPanelBtn').click();assert(await page.locator('#rightSidebar').isVisible());assert.equal(await page.locator('#invSidebar').isVisible(),false);await page.keyboard.press('Escape');
  await page.locator('.modern-actions').getByRole('button',{name:'Chat (↵)',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'chatInput');await page.keyboard.press('Escape');
  await walk(46,53);await page.locator('#modernCanvas').focus();await page.keyboard.press('Space');await page.locator('#questsModal').waitFor({state:'visible'});await snap('dialogo-atendente');await page.keyboard.press('Escape');
  await walk(43,54);await delay(850);await page.locator('#worldDoor').click();await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===1003);await delay(600);await snap('treino-piso-final');await walk(50,50);await delay(850);await page.keyboard.press('g');await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===0);
 }else if(process.env.QA_ROOMS==='1'){
  for(const [id,floor,x,y]of[['pousada',1000,44,47],['oficina',1001,52,46],['biblioteca',1002,57,50],['mercado',1003,43,54]]){
   await walk(x,y);await delay(850);await page.locator('#worldDoor').click();await page.waitForFunction(f=>ValadaresModernBridge.getFloor()===f,floor);await delay(900);await snap(id);
   if(id==='pousada'){
    if(phase.startsWith('antes')){await walk(48,48);await delay(200);await snap('pousada-mesa');}
    else{await walk(48,49);await page.keyboard.down('w');await delay(500);await page.keyboard.up('w');const pos=await page.evaluate(()=>({x:player.x,y:player.y}));assert.deepEqual(pos,{x:48,y:49});await snap('pousada-colisao');}
   }
   if(!phase.startsWith('antes')){
    const tiles=await page.evaluate(()=>{const b=ValadaresModernBridge,g=b.getMap(),cells=[];for(let y=47;y<=51;y++){const xs=y%2?[47,48,49,50,51,52,53]:[53,52,51,50,49,48,47];for(const x of xs)if(!(x===50&&y===51)&&walkable(g[y][x]))cells.push([x,y]);}return cells;});
    for(const [x,y]of tiles)await walk(x,y);result.states[result.states.length-1].visitedFloorTiles=tiles.length;
   }
   if(id!=='pousada'){await walk(50,47);await delay(300);await page.locator('#worldDoor').click();const modal=id==='oficina'?'#craftModal':id==='biblioteca'?'#altarModal':'#trainingModal';await page.locator(modal).waitFor({state:'visible'});await snap(id+'-servico');await page.keyboard.press('Escape');}
   const bounds=await page.evaluate(()=>{const app=ValadaresModern.renderer.app;return app.root.find(e=>e.name?.startsWith('KayKit')).map(e=>{const meshes=e.findComponents('render').flatMap(r=>r.meshInstances);if(!meshes.length)return null;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const m of meshes){const a=m.aabb.getMin(),b=m.aabb.getMax();[a.x,a.y,a.z].forEach((v,i)=>min[i]=Math.min(min[i],v));[b.x,b.y,b.z].forEach((v,i)=>max[i]=Math.max(max[i],v));}return {name:e.name,min,max};}).filter(Boolean);});result.states[result.states.length-1].bounds=bounds;
   await walk(50,50);await delay(850);await page.keyboard.press('g');await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===0);await delay(300);console.log('room checked '+id);
  }
 }else if(process.env.QA_TOUCH==='1'){
  await page.setViewportSize({width:844,height:390});await delay(400);await snap('touch');await page.locator('#mobileMenu').click();await delay(250);const menu=await snap('touch-menu');
  assert(menu.rects['#modernSidebarMiniMap'].visible);assert(menu.rects['#invSidebar'].visible);assert(menu.rects['#leftSidebar'].visible);assert(menu.rects['#mobileTopBar'].visible);
  await page.locator('#gameWrapper').hover();await page.mouse.wheel(0,1000);await delay(250);await snap('touch-menu-rolagem');
  await page.locator('#mobileMenu').click();await delay(150);await snap('touch-retorno');await page.locator('#mobileMenu').click();await delay(150);await snap('touch-menu-reaberto');
  const appearance=await page.evaluate(()=>JSON.stringify(player.appearance));
  await page.locator('#appearanceOpen').click();await page.locator('#appearanceModal').waitFor({state:'visible'});assert(await page.locator('#modernCanvas').isVisible());
  await page.locator('#appearanceModal [data-body="mage"]').click();await delay(350);await snap('touch-aparencia');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#appearanceModal').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.stringify(player.appearance)),appearance);assert.equal(await page.evaluate(()=>player._appearancePreview),undefined);
 }else{
 await snap('foco');
 await page.locator('#inventoryPanelBtn').click();
 // Presentation-only sample through the public feedback API, no inventory mutation.
 await loot();await delay(350);await snap('foco-inventario-loot');
 await page.locator('#inventoryPanelBtn').click();
 await page.locator('#layoutModeBtn').click();await delay(400);const classic=await snap('classico');if(!phase.startsWith('antes')){assert(classic.rects['#modernSidebarMiniMap'].visible);assert(!classic.rects['#minimap'].visible);assert(classic.rects['#modernSidebarMiniMap'].aria.includes(`${classic.player.x}, ${classic.player.y}`));}
 await page.locator('#layoutModeBtn').click();await delay(300);await snap('foco-retorno');
 await page.setViewportSize({width:920,height:720});await delay(450);await page.locator('#inventoryPanelBtn').click();await loot();await delay(350);await snap('920-inventario-loot');await page.locator('#inventoryPanelBtn').click();
 await page.setViewportSize({width:844,height:390});await delay(450);const compact=await snap('compacto');if(!phase.startsWith('antes')){assert.equal(compact.render.width,844);assert.equal(compact.render.height,390);assert(compact.rects['#modernMiniMap'].w<=140);assert(compact.rects['#modernMiniMap'].x+compact.rects['#modernMiniMap'].w<=844);}
 if(await page.locator('#mobileMenu').isVisible()){await page.locator('#mobileMenu').click();await delay(200);await snap('compacto-menu');await page.locator('#mobileMenu').click();}
 await page.setViewportSize({width:1600,height:950});await delay(300);await snap('desktop-retorno');
 }
 result.pass=result.errors.length===0;
 assert(result.states.every(s=>s.canvases===1));assert.deepEqual(result.errors,[]);
 }finally{fs.writeFileSync(path.join(out,phase+'-result.json'),JSON.stringify(result,null,2));await browser.close();}
 console.log(JSON.stringify({pass:result.pass,states:result.states.map(s=>({label:s.label,classes:s.classes,position:s.player,canvases:s.canvases})),errors:result.errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
