// Real local client/server flows. Synthetic fixture only; no production account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const out=path.resolve(__dirname,process.env.QA_OUTPUT||'../../docs/remodelacao/evidencias-pacotes');fs.mkdirSync(out,{recursive:true});
const webPort=Number(process.env.QA_WEB_PORT||3338),wsPort=Number(process.env.QA_WS_PORT||8098),gamePath=process.env.QA_GAME_PATH||(webPort===3337?'jogar':'jogar3d');
const result={checks:[],snapshots:[],errors:[],assets:[],startedAt:new Date().toISOString()};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});let page;
try{
 page=await browser.newPage({viewport:{width:1600,height:950}});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/modern/assets/'))result.assets.push({path:new URL(r.url()).pathname,status:r.status()});});
 const login=async()=>{await page.locator('#charInput').fill('TesteVal18');await page.locator('#pwdInput').fill('Valadares18!');await page.locator('button[onclick="tryLogin(true)"]').click();await page.waitForFunction(()=>window.ValadaresModern?.state==='ready'&&ValadaresModernBridge.getStarted(),null,{timeout:35000});
 if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
 if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();await page.keyboard.press('Escape');};
 await page.goto(`http://127.0.0.1:${webPort}/${gamePath}?ws=ws://127.0.0.1:${wsPort}`);await login();
 const snap=()=>page.evaluate(()=>{const b=ValadaresModernBridge,p=b.getPlayer();return {x:p.x,y:p.y,hp:p.hp,mp:p.mp,gold:p.gold,weapon:p.equipped.weapon,floor:p.floor||0,interior:p._interior||null,pvp:p.pvp,safe:playerInSafeZone(),mobs:b.getMonsters().length,door:document.querySelector('#worldDoor').textContent,render:ValadaresModern.diagnostics(),audioContext:audioCtx?.state};});
 const record=async label=>{const state=await snap();result.snapshots.push({label,...state});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));return state;};
 async function walk(x,y){const startFloor=(await snap()).floor;for(let i=0;i<160;i++){
  if((await snap()).floor!==startFloor)return;
  const step=await page.evaluate(({x,y})=>{const b=ValadaresModernBridge,p=b.getPlayer(),grid=b.getMap();if(p.x===x&&p.y===y)return{done:true};const blocked=new Set([...b.getNpcs().map(n=>`${n.pos.x},${n.pos.y}`),...b.getMonsters().filter(m=>m.hp>0).map(m=>`${m.x},${m.y}`)]),q=[[p.x,p.y,null]],seen=new Set([`${p.x},${p.y}`]);for(let i=0;i<q.length;i++){const [xx,yy,first]=q[i];for(const [dx,dy,k]of[[0,-1,'w'],[0,1,'s'],[-1,0,'a'],[1,0,'d']]){const nx=xx+dx,ny=yy+dy,key=`${nx},${ny}`;if(seen.has(key)||!grid[ny]||!walkable(grid[ny][nx])||blocked.has(key))continue;const next=first||k;if(nx===x&&ny===y)return{key:next,px:p.x,py:p.y};seen.add(key);q.push([nx,ny,next]);}}return{blocked:true,x:p.x,y:p.y};},{x,y});
  if(step.done)return;assert(!step.blocked,JSON.stringify(step));await page.keyboard.down(step.key);try{await page.waitForFunction(s=>{const p=ValadaresModernBridge.getPlayer();return p.x!==s.px||p.y!==s.py;},step,{timeout:2400,polling:15});}finally{await page.keyboard.up(step.key);}await delay(65);
 }throw Error('Path exceeded');}
 await page.waitForFunction(()=>ValadaresModern.diagnostics().world.scenery.loaded===ValadaresModern.diagnostics().world.scenery.requested);await delay(700);
 const initial=await record('vila');assert.equal(initial.render.world.scenery.failed,0);await page.screenshot({path:path.join(out,'vila.png')});
 for(const [id,floor,x,y]of[['pousada',1000,44,47],['oficina',1001,52,46],['biblioteca',1002,57,50],['mercado',1003,43,54]]){
  await walk(x,y);await page.locator('#worldDoor').waitFor({state:'visible'});await delay(850);await page.locator('#worldDoor').click();
  await page.waitForFunction(f=>ValadaresModernBridge.getFloor()===f,floor,{timeout:6500});await delay(1000);
  let inside=await record(id);assert.equal(inside.interior,id);assert.equal(inside.pvp,false);assert(inside.safe);assert.equal(inside.render.world.floor,floor);assert.equal(inside.mobs,0);await page.screenshot({path:path.join(out,id+'.png')});
  await walk(51,49);await page.keyboard.press('p');assert.equal((await snap()).pvp,false);
  if(id!=='pousada'){
   await walk(50,47);await delay(200);await page.locator('#worldDoor').click();
   const modal=id==='oficina'?'#craftModal':id==='biblioteca'?'#altarModal':'#trainingModal';
   await page.locator(modal).waitFor({state:'visible'});
   await page.screenshot({path:path.join(out,id+'-servico.png')});
   if(id==='oficina'){
    const before=await page.evaluate(()=>({inv:{...player.inv},gold:player.gold}));
    const recipe=await page.evaluate(()=>RECIPES.findIndex(r=>canCraft(r)&&recipeGold(r)>0));
    assert(recipe>=0,'receita com materiais e custo em ouro na fixture');await page.locator(`#craftList button[onclick="doCraft(${recipe})"]`).click();
    await page.waitForFunction(g=>player.gold<g,before.gold);result.checks.push('bancada interna: criação real com recibo de ouro/inventário');await page.keyboard.press('Escape');
   }else{
    const state=await page.evaluate(()=>({gold:player.gold,skills:JSON.parse(JSON.stringify(player.skills))}));
    await page.locator(id==='biblioteca'?'#altarList button[onclick="startMagicTraining(10)"]':'#trainBtns button[onclick="startTraining(10)"]').click();
    await page.waitForFunction(s=>Object.keys(s.skills).some(k=>player.skills[k].val>s.skills[k].val||player.skills[k].xp>s.skills[k].xp),state,{timeout:6000});
    assert((await snap()).gold<state.gold);await walk(50,49);await delay(200);assert(await page.evaluate(()=>training===null));result.checks.push(id+': treino real com XP/custo e parada ao sair do ponto');
   }
  }
  await walk(50,50);await delay(850);await page.keyboard.press('g');await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===0);const exited=await record(id+' saida');assert.equal(exited.x,x);assert.equal(exited.y,y-1);result.checks.push(id+': entrar, caminhar, PvP protegido, sair na porta');
 }
 await walk(44,47);await delay(850);await page.keyboard.press('g');await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===1000);await delay(1000);
 await walk(50,51);await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===0);result.checks.push('pousada: segunda entrada e saída andando pela porta');
 await delay(900);await page.keyboard.press('g');await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===1000);await page.reload();await login();const rejoin=await record('reload dentro');assert.equal(rejoin.floor,0);assert.equal(rejoin.interior,null);assert.equal(rejoin.weapon,initial.weapon);assert(rejoin.hp>0);result.checks.push('reload dentro: reconexão na vila com equipamento preservado');
 await walk(40,46);await delay(900);await page.screenshot({path:path.join(out,'bosque.png')});await record('bosque');
 assert(result.assets.some(a=>a.path.endsWith('.mp3')),'áudio comprado solicitado');assert(result.assets.filter(a=>a.path.endsWith('.glb')).length>20,'cenários comprados carregados');
 assert(result.assets.every(a=>a.status===200),'nenhum asset ausente');assert.deepEqual(result.errors,[]);
 result.checks.push('recursos de cenário e áudio carregados sem erro');
 // Touch layout in the same isolated account, a fresh page load exercises input recovery.
 await page.setViewportSize({width:844,height:390});await page.reload();await login();await walk(52,46);await page.locator('#worldDoor').waitFor({state:'visible'});await delay(900);await page.locator('#worldDoor').click();await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===1001);await delay(600);await page.screenshot({path:path.join(out,'interior-compacto.png')});await record('viewport compacto');
 result.checks.push('viewport 844x390: botão de porta acessível e interior aberto');result.pass=true;
}finally{result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser.close();}
console.log(JSON.stringify({pass:result.pass,checks:result.checks,errors:result.errors,assets:result.assets.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
