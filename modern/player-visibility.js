// Reveal only the local body's occluded pixels. Helpers never enter actor
// components/entries, so they cannot become input targets or gameplay entities.
export function createPlayerVisibility(pc, app, cameraEntity) {
 const state={available:false,active:false,destroyed:false,reason:null,sourceMeshes:0,copies:0,sharedSkins:0,skippedMorphs:0,rebuilds:0,clears:0};
 let camera,maskLayer,bodyLayer,maskMaterial,bodyMaterial;
 let sources=[],maskCopies=[],bodyCopies=[];
 const diagnostics=()=>({...state});

 function releaseCopies(){
  if(maskLayer)maskLayer.removeMeshInstances(maskCopies);
  if(bodyLayer)bodyLayer.removeMeshInstances(bodyCopies);
  for(const copy of [...maskCopies,...bodyCopies]){
   // MeshInstance.destroy owns its skin. These copies borrow the original skin;
   // detach it first. Morphs are deliberately never borrowed (their setter also
   // destroys the prior morph instance in PlayCanvas 2.23).
   copy.skinInstance=null;
   copy.destroy();
  }
  sources=[];maskCopies=[];bodyCopies=[];
  state.sourceMeshes=state.copies=state.sharedSkins=0;
 }
 function clear(){
  if(maskLayer)maskLayer.enabled=false;
  if(bodyLayer)bodyLayer.enabled=false;
  if(state.active||sources.length)state.clears++;
  state.active=false;state.skippedMorphs=0;
  releaseCopies();
 }
 function disposeLayers(){
  if(camera){const own=new Set([maskLayer?.id,bodyLayer?.id]);camera.layers=camera.layers.filter(id=>!own.has(id));}
  if(maskLayer)app.scene.layers.remove(maskLayer);
  if(bodyLayer)app.scene.layers.remove(bodyLayer);
  maskMaterial?.destroy();bodyMaterial?.destroy();
  maskLayer=bodyLayer=maskMaterial=bodyMaterial=null;
 }
 function fail(error){
  state.available=false;state.reason=String(error?.message||error);
  try{clear();}catch{/* The optional indication must not stop the game. */}
  try{disposeLayers();}catch{/* The renderer owns any remaining app teardown. */}
 }
 function destroy(){
  if(state.destroyed)return;
  try{clear();disposeLayers();}catch(error){fail(error);}
  state.destroyed=true;state.available=false;
 }

 try{
  camera=cameraEntity?.camera||cameraEntity;
  if(!pc?.Layer||!pc?.MeshInstance||!pc?.StandardMaterial||!pc?.StencilParameters||!app?.scene?.layers||!camera?.layers)throw Error('visibility-api-unavailable');
  if(!app.graphicsDevice?.gl?.getContextAttributes?.()?.stencil)throw Error('visibility-stencil-unavailable');
  maskLayer=new pc.Layer({name:'Local player visible mask',enabled:false,clearStencilBuffer:true,clearDepthBuffer:false,clearColorBuffer:false});
  bodyLayer=new pc.Layer({name:'Local player occluded body',enabled:false,clearDepthBuffer:false,clearColorBuffer:false});
  app.scene.layers.pushOpaque(maskLayer);app.scene.layers.pushTransparent(bodyLayer);
  camera.layers=[...camera.layers,maskLayer.id,bodyLayer.id];

  maskMaterial=new pc.StandardMaterial();maskMaterial.name='Local player visible mask';maskMaterial.useLighting=false;
  maskMaterial.depthTest=true;maskMaterial.depthWrite=false;maskMaterial.depthFunc=pc.FUNC_EQUAL;
  maskMaterial.redWrite=maskMaterial.greenWrite=maskMaterial.blueWrite=maskMaterial.alphaWrite=false;
  // Bit 1 belongs to this final indication pass; the current scene has no other
  // stencil consumer. Keep scene color/depth intact when clearing its mask.
  maskMaterial.stencilFront=maskMaterial.stencilBack=new pc.StencilParameters({func:pc.FUNC_ALWAYS,ref:1,readMask:1,writeMask:1,zpass:pc.STENCILOP_REPLACE});
  maskMaterial.update();
  bodyMaterial=new pc.StandardMaterial();bodyMaterial.name='Local player occluded body';bodyMaterial.useLighting=false;
  bodyMaterial.diffuse=new pc.Color(0,0,0);bodyMaterial.emissive=new pc.Color(.15,.95,1);bodyMaterial.opacity=.48;bodyMaterial.blendType=pc.BLEND_NORMAL;
  bodyMaterial.depthTest=true;bodyMaterial.depthWrite=false;bodyMaterial.depthFunc=pc.FUNC_GREATER;
  bodyMaterial.stencilFront=bodyMaterial.stencilBack=new pc.StencilParameters({func:pc.FUNC_NOTEQUAL,ref:1,readMask:1,writeMask:1,zpass:pc.STENCILOP_REPLACE});
  bodyMaterial.update();state.available=true;
 }catch(error){fail(error);}

 function update(self){
  if(!state.available||state.destroyed)return;
  try{
   if(self?.kind!=='player'||!self.entity?.enabled){clear();return;}
   const visible=self.entity.findComponents('render').filter(r=>r.enabled&&r.entity.enabled).flatMap(r=>r.meshInstances.filter(mi=>mi.visible));
   const next=visible.filter(mi=>mi.mesh&&mi.node&&!mi.morphInstance);
   state.skippedMorphs=visible.filter(mi=>mi.morphInstance).length;
   const same=next.length===sources.length&&next.every((mi,i)=>sources[i].instance===mi&&sources[i].mesh===mi.mesh&&sources[i].node===mi.node&&sources[i].skin===mi.skinInstance&&sources[i].cull===mi.cull);
   if(!same){
    releaseCopies();
    for(const instance of next){
     sources.push({instance,mesh:instance.mesh,node:instance.node,skin:instance.skinInstance,cull:instance.cull});
     for(const [material,copies]of [[maskMaterial,maskCopies],[bodyMaterial,bodyCopies]]){
      const copy=new pc.MeshInstance(instance.mesh,material,instance.node);
      copy.skinInstance=instance.skinInstance;copy.castShadow=false;copy.receiveShadow=false;copy.cull=instance.cull;copies.push(copy);
     }
    }
    maskLayer.addMeshInstances(maskCopies,true);bodyLayer.addMeshInstances(bodyCopies,true);
    state.rebuilds++;state.sourceMeshes=sources.length;state.copies=maskCopies.length+bodyCopies.length;state.sharedSkins=sources.filter(s=>s.skin).length;
   }
   state.active=sources.length>0;maskLayer.enabled=bodyLayer.enabled=state.active;
  }catch(error){fail(error);}
 }
 return {update,clear,destroy,diagnostics};
}
