// Browser-only design probe. No product source, authoritative entity or rule edits.
module.exports=async function occlusionProbe(page,out){
 const path=require('node:path'),fs=require('node:fs');
 const setup=await page.evaluate(async()=>{
  const pc=await import('/modern/vendor/playcanvas.mjs'),r=ValadaresModern.renderer,app=r.app;
  if(!app)throw Error('Renderer application unavailable');
  const device=app.graphicsDevice,stencil=device.gl.getContextAttributes().stencil;
  if(!stencil)throw Error('No stencil buffer in the current context');
  const maskLayer=new pc.Layer({name:'QA own body mask',clearStencilBuffer:true,clearDepthBuffer:false,clearColorBuffer:false});
  const ghostLayer=new pc.Layer({name:'QA occluded own body',clearDepthBuffer:false,clearColorBuffer:false});
  app.scene.layers.pushOpaque(maskLayer);app.scene.layers.pushTransparent(ghostLayer);r.camera.camera.layers=[...r.camera.camera.layers,maskLayer.id,ghostLayer.id];
  const mask=new pc.StandardMaterial();mask.useLighting=false;mask.depthTest=true;mask.depthWrite=false;mask.depthFunc=pc.FUNC_EQUAL;
  mask.redWrite=mask.greenWrite=mask.blueWrite=mask.alphaWrite=false;
  mask.stencilFront=mask.stencilBack=new pc.StencilParameters({func:pc.FUNC_ALWAYS,ref:1,readMask:1,writeMask:1,zpass:pc.STENCILOP_REPLACE});mask.update();
  const ghost=new pc.StandardMaterial();ghost.useLighting=false;ghost.diffuse=new pc.Color(0,0,0);ghost.emissive=new pc.Color(.15,.95,1);ghost.opacity=.48;ghost.blendType=pc.BLEND_NORMAL;ghost.depthTest=true;ghost.depthWrite=false;ghost.depthFunc=pc.FUNC_GREATER;
  ghost.stencilFront=ghost.stencilBack=new pc.StencilParameters({func:pc.FUNC_NOTEQUAL,ref:1,readMask:1,writeMask:1,zpass:pc.STENCILOP_REPLACE});ghost.update();
  let sources=[],maskCopies=[],ghostCopies=[],rebuilds=0;
  const dispose=()=>{maskLayer.removeMeshInstances(maskCopies);ghostLayer.removeMeshInstances(ghostCopies);for(const mi of [...maskCopies,...ghostCopies]){mi.skinInstance=null;mi.destroy();}maskCopies=[];ghostCopies=[];};
  const sync=()=>{
   const rec=r.actors.entries.get('self');const next=rec?.entity.enabled?rec.entity.findComponents('render').filter(c=>c.enabled&&c.entity.enabled).flatMap(c=>c.meshInstances.filter(mi=>mi.visible)):[];
   if(next.length===sources.length&&next.every((mi,i)=>mi===sources[i]))return;
   dispose();sources=next;rebuilds++;
   for(const mi of sources){if(mi.morphInstance)throw Error('Probe refuses shared morph ownership');for(const [mat,list]of [[mask,maskCopies],[ghost,ghostCopies]]){const copy=new pc.MeshInstance(mi.mesh,mat,mi.node);copy.skinInstance=mi.skinInstance;copy.castShadow=false;copy.receiveShadow=false;copy.cull=mi.cull;list.push(copy);}}
   maskLayer.addMeshInstances(maskCopies,true);ghostLayer.addMeshInstances(ghostCopies,true);
  };
  app.on('prerender',sync);sync();
  const base={...player},cam={...r.bridge.getCamera()};let position={x:base.x,y:base.y};r.bridge.getPlayer=()=>({...base,...position,renderX:position.x,renderY:position.y,dir:'down'});r.bridge.getCamera=()=>({...cam,x:cam.x+position.x-base.x,y:cam.y+position.y-base.y});
  window.qaOcclusion={toggle(enabled){maskLayer.enabled=ghostLayer.enabled=enabled;},freeze(frozen){app.timeScale=frozen?0:1;},scene(kind){position=kind==='roof'?{x:44,y:42}:kind==='clear'?{x:52,y:49}:{x:50,y:50};const q=qaRosterInput;q.remotes={};q.mobs=kind==='group'?[q.mob(99810,'DRAKE',51,50),q.mob(99811,'DRAKE',50,51),q.mob(99813,'DRAKE_LIDER',51,51)]:[];},stats(){return{stencil,sourceMeshes:sources.length,additionalDraws:maskCopies.length+ghostCopies.length,sharedSkins:sources.filter(mi=>mi.skinInstance).length,morphs:sources.filter(mi=>mi.morphInstance).length,rebuilds,entries:[...r.actors.entries.keys()]};},dispose(){app.timeScale=1;app.off('prerender',sync);dispose();app.scene.layers.remove(maskLayer);app.scene.layers.remove(ghostLayer);mask.destroy();ghost.destroy();}};
  return qaOcclusion.stats();
 });
 const captures=[];
 for(const [view,width,height]of [['desktop',1440,900],['compact',844,390]]){
  await page.setViewportSize({width,height});
  for(const scene of ['clear','group','roof']){
   await page.evaluate(scene=>{qaOcclusion.freeze(false);qaOcclusion.scene(scene);},scene);await page.waitForTimeout(350);await page.evaluate(()=>qaOcclusion.freeze(true));
   for(const enabled of [false,true]){await page.evaluate(enabled=>qaOcclusion.toggle(enabled),enabled);await page.waitForTimeout(100);const file=`occlusion-${scene}-${view}-${enabled?'on':'off'}.png`;await page.screenshot({path:path.join(out,file)});captures.push({view,scene,enabled,file,stats:await page.evaluate(()=>qaOcclusion.stats())});}
  }
 }
 await page.evaluate(()=>qaOcclusion.dispose());
 const result={kind:'Browser-only stencil design probe, no gameplay mutation',setup,captures};fs.writeFileSync(path.join(out,'occlusion-probe.json'),JSON.stringify(result,null,2));return result;
};
