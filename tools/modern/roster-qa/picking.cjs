// Complementary input mapping only. Runs after the authoritative playthrough;
// replaces presentation getters, and intercepts input before gameplay handlers.
module.exports=async function pickingChecks(page,out){
 const path=require('node:path'),assert=require('node:assert/strict'),rows=[];
 await page.waitForTimeout(600); // onAuth reveals the ordinary tutorial after 450 ms.
 if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
 for(const selector of ['#firstStepsDismiss','#agClose'])if(await page.locator(selector).isVisible())await page.locator(selector).click();
 await page.waitForFunction(()=>!document.querySelector('#toastContainer .toast-visible'),null,{timeout:10000});
 await page.evaluate(()=>{
  const r=ValadaresModern.renderer,b=r.bridge;
  const qa=window.qaRosterInput={mobs:[],remotes:{},forwarded:null};
  b.getMonsters=()=>qa.mobs;b.getRemotePlayers=()=>qa.remotes;b.getNpcs=()=>[];
  for(const type of ['click','contextmenu'])b.getCanvas().addEventListener(type,event=>{
   event.stopImmediatePropagation();event.preventDefault();const rect=event.currentTarget.getBoundingClientRect(),cam=b.getCamera();
   qa.forwarded={x:Math.floor(cam.x+(event.clientX-rect.left)/rect.width*b.VP_W),y:Math.floor(cam.y+(event.clientY-rect.top)/rect.height*b.VP_H)};
  },true);
  qa.mob=(id,type,x,y)=>({id,type,name:MTYPE[type].name,x,y,renderX:x,renderY:y,hp:MTYPE[type].hp,maxHp:MTYPE[type].hp,dir:'down',floor:player.floor});
  qa.project=(e,height=.7)=>r.project(e.x+.5,height,e.y+.5);
  qa.ground=point=>{const near=r.camera.camera.screenToWorld(point.x,point.y,.1),far=r.camera.camera.screenToWorld(point.x,point.y,80),t=-near.y/(far.y-near.y);return{x:Math.floor(near.x+(far.x-near.x)*t),y:Math.floor(near.z+(far.z-near.z)*t)};};
  qa.click=(point,type='click')=>{qa.forwarded=null;const rect=r.canvas.getBoundingClientRect();r.canvas.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:type==='contextmenu'?2:0,clientX:rect.left+point.x,clientY:rect.top+point.y}));return qa.forwarded;};
 });
 for(const [view,width,height]of [['desktop',1440,900],['compact',844,390]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{const q=qaRosterInput;q.mobs=[q.mob(99810,'DRAKE',player.x+1,player.y+1),q.mob(99811,'DRAKE_LIDER',player.x+3,player.y+1)];q.remotes={99812:{id:99812,name:'QA remoto',x:player.x-2,y:player.y+1,renderX:player.x-2,renderY:player.y+1,floor:player.floor,hp:100,maxHp:100,dir:'down',equipped:{weapon:'ESPADA_ACO'},appearance:{v:1,body:'knight',palette:'original'}}};});
  await page.waitForFunction(()=>ValadaresModern.renderer.actors.entries.has('remote:99812')&&ValadaresModern.renderer.actors.entries.has('mob:99811')&&ValadaresModern.renderer.actors.diagnostics().pending.length===0);
  await page.waitForTimeout(150);
  const grouped=await page.evaluate(()=>{
   const q=qaRosterInput,checks=[];
   for(const mob of q.mobs){const point=q.project(mob,.7);checks.push({kind:'neighbor-'+mob.type,expected:{x:mob.x,y:mob.y},got:q.click(point)});}
   const remote=q.remotes[99812];checks.push({kind:'remote-context-menu',expected:{x:remote.x,y:remote.y},got:q.click(q.project(remote,1),'contextmenu')});
   const point=ValadaresModern.renderer.project(player.x-3+.5,.001,player.y+3+.5);checks.push({kind:'empty-ground',expected:{x:player.x-3,y:player.y+3},got:q.click(point)});
   return checks;
  });
  rows.push(...grouped.map(r=>({view,...r,pass:r.expected.x===r.got?.x&&r.expected.y===r.got?.y})));
  await page.screenshot({path:path.join(out,`input-neighbors-${view}.png`)});
  await page.evaluate(()=>{const q=qaRosterInput;q.remotes={};q.mobs=[q.mob(99810,'DRAKE',player.x+1,player.y),q.mob(99811,'DRAKE',player.x,player.y+1),q.mob(99813,'DRAKE_LIDER',player.x+1,player.y+1)];});
  await page.waitForFunction(()=>ValadaresModern.renderer.actors.entries.has('mob:99813')&&ValadaresModern.renderer.actors.diagnostics().pending.length===0);
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(out,`input-tight-drakes-${view}.png`)});
  // A retained corpse is visible yet excluded from actor entries and input.
  const death=await page.evaluate(()=>{
   const q=qaRosterInput,r=ValadaresModern.renderer,mob=q.mobs[0],point=q.project(mob,.9),expected=q.ground(point);
   q.mobs=[];q.remotes={};const retained=r.actors.retainConfirmedDeath({eventId:'qa-input-'+innerWidth,targetId:mob.id,mob,floor:player.floor,contactAt:performance.now()+450});r.actors.update(.001);
   return{kind:'retained-death-not-selectable',expected,got:q.click(point),retained,inEntries:r.actors.entries.has('mob:'+mob.id),visuals:r.actors.diagnostics().deathVisuals};
  });
  rows.push({view,...death,pass:death.retained&&!death.inEntries&&death.visuals===1&&death.expected.x===death.got?.x&&death.expected.y===death.got?.y});
  await page.evaluate(()=>ValadaresModern.renderer.actors.clearCombatPresentation());
 }
 const result={kind:'Synthetic presentation only; actual renderer mapping, gameplay input intercepted',rows,pass:rows.every(r=>r.pass)};
 require('node:fs').writeFileSync(path.join(out,'input-review.json'),JSON.stringify(result,null,2));
 assert(result.pass,'focal renderer input review');return result;
};
