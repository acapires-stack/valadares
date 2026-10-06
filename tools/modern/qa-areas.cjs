// Walk through real UI transitions. This script only reads game state; movement/actions use keyboard and buttons.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const out='C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work';
const dungeonOnly=process.env.DUNGEON_ONLY==='1';
const result={startedAt:new Date().toISOString(),mode:dungeonOnly?'dungeon':'both',checks:[],positions:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(out,dungeonOnly?'modern-dungeon-result.json':'modern-areas-result.json'),JSON.stringify(result,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let page;
 try{
  page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto('http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097');
  await page.locator('#charInput').fill('TesteVal18');
  await page.locator('#pwdInput').fill('Valadares18!');
  await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(()=>window.ValadaresModern?.state==='ready'&&ValadaresModernBridge.getStarted(),null,{timeout:30000});
  if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
  if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
  await page.keyboard.press('Escape');
  const snap=()=>page.evaluate(()=>{const b=ValadaresModernBridge,p=b.getPlayer(),d=ValadaresModern.diagnostics();return{
    x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,potions:p.inv?.POTION||0,floor:p.floor||0,expedition:p._expedition||null,stair:b.getStairs(),
    mapIsOverworld:b.getMap()===overworldMap,mapRef:b.getMap()===map,npcs:b.getNpcs().length,
    mobs:b.getMonsters().filter(m=>m.hp>0).length,rendererFloor:d.world.floor,chunks:d.world.chunks,
    rendererError:d.error,rendererReady:d.ready,actors:d.actors};});
  const checkpoint=async label=>{const s=await snap();result.positions.push({label,...s});save();return s;};

  async function nextStep(target,adjacent){
   return page.evaluate(({target,adjacent})=>{
    const b=ValadaresModernBridge,p=b.getPlayer(),grid=b.getMap(),blocked=new Set();
    for(const m of b.getMonsters())if(m.hp>0)blocked.add(m.x+','+m.y);
    for(const n of b.getNpcs())blocked.add(n.pos.x+','+n.pos.y);
    for(const r of Object.values(b.getRemotePlayers()))if(r&&r.x!=null&&r.y!=null)blocked.add(r.x+','+r.y);
    const goal=(x,y)=>adjacent?Math.max(Math.abs(x-target.x),Math.abs(y-target.y))<=1:x===target.x&&y===target.y;
    if(goal(p.x,p.y))return {done:true,from:{x:p.x,y:p.y},blocked:blocked.size};
    const dirs=[[0,-1,'w'],[0,1,'s'],[-1,0,'a'],[1,0,'d']];
    const key=(x,y)=>x+','+y,queue=[[p.x,p.y]],seen=new Set([key(p.x,p.y)]),first=new Map();
    for(let i=0;i<queue.length;i++){
      const [x,y]=queue[i];
      for(const [dx,dy,k]of dirs){const nx=x+dx,ny=y+dy,id=key(nx,ny);
       if(seen.has(id)||!grid[ny]||!walkable(grid[ny][nx])||blocked.has(id))continue;
       seen.add(id);first.set(id,x===p.x&&y===p.y?k:first.get(key(x,y)));
       if(goal(nx,ny))return {key:first.get(id),from:{x:p.x,y:p.y},next:{x:nx,y:ny},seen:seen.size,blocked:blocked.size};
       queue.push([nx,ny]);
      }
    }
    return {noPath:true,from:{x:p.x,y:p.y},target,seen:seen.size,blocked:blocked.size,
      nearest:[...blocked].filter(id=>{const [x,y]=id.split(',').map(Number);return Math.abs(x-p.x)<5&&Math.abs(y-p.y)<5}).slice(0,25)};
   },{target,adjacent});
  }
  async function walk(target,{adjacent=false,limit=210,floorTransition=null}={}){
   let retries=0,moves=0;
   while(moves<limit){
    const life=await snap();
    if(floorTransition!==null&&life.floor===floorTransition)return await checkpoint(`transição ao caminhar ${target.x},${target.y}`);
    if(life.hp<life.maxHp*.72&&life.potions>0){await page.keyboard.press('e');await delay(160);}
    const route=await nextStep(target,adjacent);
    if(route.done)return await checkpoint(`walk ${target.x},${target.y}${adjacent?' nearby':''}`);
    if(route.noPath){if(retries++<2){await delay(600);continue;}throw Error('Sem caminho: '+JSON.stringify(route));}
    await page.keyboard.down(route.key);
    let changed=true;
    try{await page.waitForFunction(from=>{const p=ValadaresModernBridge.getPlayer();return p.x!==from.x||p.y!==from.y;},route.from,{timeout:1600,polling:20});}
    catch{changed=false;}
    finally{await page.keyboard.up(route.key);}
    await delay(100);
    if(!changed){if(retries++<2){await delay(350);continue;}throw Error('Movimento travado: '+JSON.stringify({route,position:await snap()}));}
    retries=0;moves++;
    if(moves%20===0){console.log('walk '+moves+' '+JSON.stringify(await snap()));save();}
   }
   throw Error('Limite de passos: '+JSON.stringify({target,position:await snap()}));
  }
  async function ensureJourney(){
   if(!(await page.locator('#journeySidebar').isVisible())){
    const mobile=page.locator('#journeyMobile');
    await mobile.waitFor({state:'visible',timeout:4000});
    if(!(await page.locator('#journeyCard').isVisible()))await mobile.click();
   }
   if(!(await page.locator('#journeyContent').isVisible()))await page.locator('#journeyToggle').click();
  }

  const initial=await checkpoint('cidade inicial');assert.equal(initial.floor,0);assert.equal(initial.rendererFloor,0);assert(initial.mapIsOverworld);
  if(!dungeonOnly){
  await walk({x:78,y:22},{adjacent:true});
  await ensureJourney();
  await page.locator('#journeyExpedition').click();
  const enter=page.locator('#journeyMore button');await enter.waitFor({state:'visible'});
  assert.equal(await enter.isEnabled(),true,'entrada da expedição habilitada perto do Ferreiro');
  await enter.click();
  await page.waitForFunction(()=>ValadaresModernBridge.getFloor()>=8000,null,{timeout:8000});
  await delay(500);
  const expedition=await checkpoint('expedição');
  assert(expedition.floor>=8000&&expedition.floor<9000);assert.equal(expedition.rendererFloor,expedition.floor);
  assert.equal(expedition.mapIsOverworld,false);assert(expedition.chunks>0);assert.equal(expedition.rendererError,null);
  await page.screenshot({path:path.join(out,'modern-expedition.png')});result.checks.push('expedição real: floor, mapa, renderer e captura');save();
  // The server permits the exit action when within one tile of the entry stairs.
  await walk(expedition.stair.spawn,{adjacent:true,limit:140});
  await ensureJourney();
  const leave=page.locator('#journeyAction');
  await page.waitForFunction(()=>document.getElementById('journeyAction')?.dataset.mode==='expeditionExit',null,{timeout:4000});
  assert.equal(await leave.isEnabled(),true,'saída da expedição habilitada na escada');
  await leave.click();
  await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===0,null,{timeout:8000});
  await delay(400);
  const afterExp=await checkpoint('retorno da expedição');assert.equal(afterExp.rendererFloor,0);assert(afterExp.mapIsOverworld);
  result.checks.push('saída de expedição pela interface e retorno ao mapa da cidade');save();
  }

  await page.keyboard.press('Escape');
  await walk({x:83,y:17},{adjacent:false,limit:260,floorTransition:1});
  await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===1,null,{timeout:8000});
  await delay(500);
  const dungeon=await checkpoint('masmorra andar 1');
  assert.equal(dungeon.floor,1);assert.equal(dungeon.rendererFloor,1);assert.equal(dungeon.mapIsOverworld,false);
  assert(dungeon.chunks>0);assert.equal(dungeon.rendererError,null);
  await page.screenshot({path:path.join(out,'modern-dungeon.png')});result.checks.push('masmorra real: andar 1, mapa, renderer e captura');save();
  const up=dungeon.stair.up;assert(up,'escada de subida enviada pelo servidor');
  // Step away if arrival spawned exactly on the stair, then walk back onto it.
  const pos=await snap();if(pos.x===up.x&&pos.y===up.y){
    const away=await nextStep({x:up.x+2,y:up.y},false);
    if(away.key){await page.keyboard.down(away.key);await page.waitForFunction(from=>{const p=ValadaresModernBridge.getPlayer();return p.x!==from.x||p.y!==from.y;},away.from,{timeout:1600});await page.keyboard.up(away.key);await delay(150);}
  }
  await walk(up,{adjacent:false,limit:100,floorTransition:0});
  await page.waitForFunction(()=>ValadaresModernBridge.getFloor()===0,null,{timeout:8000});
  await delay(350);
  const afterDungeon=await checkpoint('retorno da masmorra');assert.equal(afterDungeon.rendererFloor,0);assert(afterDungeon.mapIsOverworld);
  result.checks.push('subida real da masmorra e retorno à cidade');
  assert.deepEqual(result.errors,[]);
  result.status='PASS';result.finishedAt=new Date().toISOString();save();
  console.log(JSON.stringify({status:result.status,checks:result.checks,positions:result.positions.map(({label,x,y,floor,rendererFloor,chunks})=>({label,x,y,floor,rendererFloor,chunks})),errors:result.errors},null,2));
 }catch(e){result.status='INCOMPLETE';result.failure=e.stack||String(e);result.finishedAt=new Date().toISOString();
  try{if(page)result.atFailure=await page.evaluate(()=>({x:ValadaresModernBridge?.getPlayer()?.x,y:ValadaresModernBridge?.getPlayer()?.y,floor:ValadaresModernBridge?.getFloor(),diag:ValadaresModern?.diagnostics?.(),log:document.getElementById('log')?.textContent?.slice(-900)}));}catch{}
  save();console.error(JSON.stringify({status:result.status,failure:result.failure,atFailure:result.atFailure,checks:result.checks},null,2));process.exitCode=1;
 }finally{await browser.close();}
})();
