// Actual actor rigs and visibility module; no backend or gameplay claims.
module.exports=async function visibilityLifecycle(page,out){
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 await page.evaluate(async()=>{
  const {createPlayerVisibility}=await import('/modern/player-visibility.js');
  if(!window.qa){const r=ValadaresModern.renderer;window.qa={pc:await import('/modern/vendor/playcanvas.mjs'),actors:r.actors,app:r.app,camera:r.camera,player:{...r.bridge.getPlayer()},integrated:true,identity(body){this.player.appearance={v:1,body,palette:'original'};},visibility:r.visibility};r.bridge.getPlayer=()=>qa.player;r.bridge.getMonsters=()=>[];r.bridge.getRemotePlayers=()=>({});r.bridge.getNpcs=()=>[];}
  qa.makeVisibility=()=>createPlayerVisibility(qa.pc,qa.app,qa.camera);qa.visibility=qa.visibility||qa.makeVisibility();
  qa.visibilityTick=()=>qa.visibility.update(qa.actors.entries.get('self'));if(!qa.integrated)qa.app.on('update',qa.visibilityTick);
  qa.materialSnapshot=(includeDisabled=false)=>qa.actors.entries.get('self').entity.findComponents('render').filter(r=>includeDisabled||r.enabled&&r.entity.enabled).flatMap(r=>r.meshInstances.filter(mi=>mi.visible));
  qa.guardOriginals=(operation,includeDisabled=false)=>{
   const source=qa.materialSnapshot(includeDisabled),resources=[...new Set(source.flatMap(mi=>[mi.mesh,mi.material,mi.skinInstance]).filter(Boolean))],restore=[],destroyed=[];
   for(const resource of resources){const original=resource.destroy;resource.destroy=function(){destroyed.push(resource.constructor.name);return original.apply(this,arguments);};restore.push(()=>resource.destroy=original);}
   const references=source.map(mi=>({mi,mesh:mi.mesh,material:mi.material,skin:mi.skinInstance}));
   try{operation();return{destroyed,identitiesPreserved:references.every(s=>s.mi.mesh===s.mesh&&s.mi.material===s.material&&s.mi.skinInstance===s.skin),skinTexturesIntact:references.every(s=>!s.skin||!!s.skin.boneTexture)};}finally{for(const undo of restore)undo();}
  };
 });
 const swaps=[];
 for(const body of await page.evaluate(()=>AppearanceRules.APPEARANCE_BODIES.map(b=>b.id)))for(const weapon of ['ESPADA_ACO','CAJADO_FOGO','ARCO']){
  await page.evaluate(({body,weapon})=>{qa.identity(body);qa.player.equipped={weapon};}, {body,weapon});
  await page.waitForFunction(({body,weapon})=>{const r=qa.actors.entries.get('self');return qa.actors.diagnostics().pending.length===0&&qa.visibility.diagnostics().active&&r?.model===AppearanceRules.APPEARANCE_BODIES.find(b=>b.id===body).model&&r.sig.split('|')[3]===weapon;},{body,weapon});await page.waitForTimeout(70);
  swaps.push(await page.evaluate(({body,weapon})=>{
   const active=qa.visibility.diagnostics(),ids=[...qa.actors.entries.keys()],clear=qa.guardOriginals(()=>qa.visibility.clear());qa.visibilityTick();const rebuilt=qa.visibility.diagnostics();
   return{body,weapon,model:qa.actors.entries.get('self').model,active,clear,rebuilt,entries:ids,pass:active.active&&active.copies===active.sourceMeshes*2&&!clear.destroyed.length&&clear.identitiesPreserved&&clear.skinTexturesIntact&&rebuilt.active&&ids.length===1&&ids[0]==='self'};
  },{body,weapon}));
 }
 await page.evaluate(()=>{qa.identity('knight');qa.player.equipped={weapon:'ESPADA_ACO'};});await page.waitForTimeout(200);
 const initial=await page.evaluate(()=>Array.from(qa.materialSnapshot().find(mi=>mi.skinInstance).skinInstance.matrixPalette));
 await page.evaluate(()=>{qa.walk=()=>{qa.player.x+=.025;if(Number.isFinite(qa.player.renderX))qa.player.renderX+=.025;qa.player.dir='right';};qa.app.on('update',qa.walk);});await page.waitForTimeout(250);
 const movement=await page.evaluate(initial=>{qa.app.off('update',qa.walk);const rec=qa.actors.entries.get('self'),palette=qa.materialSnapshot().find(mi=>mi.skinInstance).skinInstance.matrixPalette;return{animation:rec.state,matrixChanged:initial.some((x,i)=>Math.abs(x-palette[i])>1e-5),visibility:qa.visibility.diagnostics()};},initial);
 await page.evaluate(()=>{qa.player.attackTimer=800;qa.player.artAttackAt=performance.now();});await page.waitForTimeout(150);
 const attack=await page.evaluate(()=>({animation:qa.actors.entries.get('self').state,visibility:qa.visibility.diagnostics()}));
 await page.screenshot({path:path.join(out,'visibility-lifecycle-attack.png')});
 const guards=await page.evaluate(async()=>{
  const rec=qa.actors.entries.get('self');rec.entity.enabled=false; // Native RenderComponent may release its skin here; audit only our subsequent clear.
  const hidden=qa.guardOriginals(()=>qa.visibility.update(rec),true);const hiddenState=qa.visibility.diagnostics();rec.entity.enabled=true;qa.visibility.update(rec);
  const logout=qa.guardOriginals(()=>qa.visibility.update(null)),logoutState=qa.visibility.diagnostics();qa.visibility.update(rec);
  const source=qa.materialSnapshot()[0],morphSelf={kind:'player',entity:{enabled:true,findComponents:()=>[{enabled:true,entity:{enabled:true},meshInstances:[{visible:true,mesh:source.mesh,node:source.node,morphInstance:{qaUnsupported:true}}]}]}};
  const morph=qa.guardOriginals(()=>qa.visibility.update(morphSelf)),morphState=qa.visibility.diagnostics();qa.visibility.update(rec);
  qa.app.off('update',qa.visibilityTick);const destroyed=qa.guardOriginals(()=>{qa.visibility.destroy();qa.visibility.destroy();}),destroyedState=qa.visibility.diagnostics();
  const {createPlayerVisibility}=await import('/modern/player-visibility.js'),layersBefore=qa.camera.camera.layers.slice();
  const absent=createPlayerVisibility(qa.pc,{scene:qa.app.scene,graphicsDevice:{gl:{getContextAttributes:()=>({stencil:false})}}},qa.camera);absent.update(rec);absent.clear();absent.destroy();
  const missingStencil={state:absent.diagnostics(),cameraUnchanged:JSON.stringify(layersBefore)===JSON.stringify(qa.camera.camera.layers)};
  qa.visibility=qa.makeVisibility();qa.visibilityTick();qa.app.on('update',qa.visibilityTick);
  return{hidden,hiddenState,logout,logoutState,morph,morphState,destroyed,destroyedState,missingStencil,recreated:qa.visibility.diagnostics()};
 });
 await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'visibility-lifecycle-after-destroy.png')});
 const safe=g=>!g.destroyed.length&&g.identitiesPreserved&&g.skinTexturesIntact;
 const pass=swaps.every(s=>s.pass)&&movement.matrixChanged&&movement.animation==='Running_A'&&/Melee|Chop|Attack/.test(attack.animation)&&[guards.hidden,guards.logout,guards.morph,guards.destroyed].every(safe)&&!guards.hiddenState.active&&!guards.logoutState.active&&guards.morphState.skippedMorphs===1&&!guards.morphState.active&&guards.destroyedState.destroyed&&guards.missingStencil.cameraUnchanged&&guards.missingStencil.state.reason==='visibility-stencil-unavailable'&&guards.recreated.active;
 const report={pass,integratedRenderer:await page.evaluate(()=>!!qa.integrated),kind:'Presentation lifecycle only; real seven rigs, no combat',swaps,movement,attack,guards};fs.writeFileSync(path.join(out,'visibility-lifecycle.json'),JSON.stringify(report,null,2));assert(pass,'visibility lifecycle');return report;
};
