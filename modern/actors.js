import '../appearance-rules.js';
const {normalizarAppearance,APPEARANCE_BODIES,APPEARANCE_PALETTES}=globalThis.AppearanceRules;
// Original real-time presentation; authoritative entities and timings stay in the game.
// Models face +Z at rest; positive yaw turns that forward vector toward +X.
const FORWARD={down:0,left:-90,up:180,right:90};
export async function createActors(pc,app,bridge){
 const materials=new Map();
 const material=(hex,metal=0)=>{const key=hex+':'+metal;if(materials.has(key))return materials.get(key);const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(hex);m.metalness=metal;m.useMetalness=true;m.gloss=metal?0.45:0.15;m.update();materials.set(key,m);return m;};
 const shape=(parent,type,scale,pos,color,rotation)=>{const e=new pc.Entity(type);e.addComponent('render',{type,material:material(color),castShadows:Math.max(...scale)>.22,receiveShadows:true});e.setLocalScale(...scale);e.setLocalPosition(...pos);if(rotation)e.setLocalEulerAngles(...rotation);parent.addChild(e);return e;};
 const legacyNames=['Knight','Mage','Rogue_Hooded','Barbarian','Skeleton_Minion'];
 const seriesNames=['Farmer_A','Farmer_B','Lorekeeper','Cleric','OrcBrute','Monstrosity','Hoarder','MagicalGirl'];
 const propForWeapon={sword:'AvianSwordsman_Sword',axe:'Orc_Axe',mace:'Cleric_Mace',spear:'PlantWarrior_Spear',staff:'Lorekeeper_Staff',bow:'PlantWarrior_Bow_withString'};
 const shieldProp='Cleric_Shield';
 const load=(name,series=false)=>new Promise((resolve,reject)=>app.assets.loadFromUrl(new URL(name==='Wolf'?'./assets/animals/Wolf-game.glb':series?`./assets/characters-series6/${name}.glb`:`./assets/characters/${name}-game.glb`,import.meta.url).href,'container',(err,a)=>{if(err){if(a){a.unload();app.assets.remove(a);}reject(err);}else resolve(a);}));
 const loaded=await Promise.all(legacyNames.map(n=>load(n)));
 const assets=Object.fromEntries(legacyNames.map((n,i)=>[n,loaded[i]]));
 const failedSeries=[],pending=new Map();let destroyed=false;
 function ensure(name){if(assets[name]||pending.has(name)||failedSeries.includes(name)||destroyed)return;const promise=load(name,true).then(a=>{if(destroyed){a.unload();app.assets.remove(a);}else{assets[name]=a;loaded.push(a);}}).catch(()=>failedSeries.push(name)).finally(()=>pending.delete(name));pending.set(name,promise);}
 const seriesRig=model=>model==='OrcBrute'||model==='Monstrosity'?'Rig_Large':seriesNames.includes(model)?'Rig_Medium':null;
 const ready=(name,fallback)=>{if(!name)return fallback;const rig=seriesRig(name);if(!rig)return fallback;ensure(name);ensure(rig+'_General');ensure(rig+'_MovementBasic');return assets[name]&&assets[rig+'_General']&&assets[rig+'_MovementBasic']?name:fallback;};
 const gearReady=name=>{if(!name)return false;ensure(name);return !!assets[name];};
 const mediumCombatTracks=[];
 function sameRigCombat(){
  if(!mediumCombatTracks.length)for(const {resource:t}of assets.Knight.resource.animations)if(/Attack|Shoot/.test(t.name)){
   // These 23 medium bones have the same rest transforms. Only the authored armature name differs.
   const curves=t.curves.map(c=>new pc.AnimCurve(c.paths.map(p=>({...p,entityPath:p.entityPath.map(n=>n==='Rig'?'Rig_Medium':n)})),c.input,c.output,c.interpolation));
   mediumCombatTracks.push(new pc.AnimTrack(t.name,t.duration,t.inputs,t.outputs,curves));
  }return mediumCombatTracks;
 }
 function animate(entity,model){
  entity.addComponent('anim',{activate:true});const prefix=seriesRig(model);
  const clips=prefix?[...assets[prefix+'_General'].resource.animations,...assets[prefix+'_MovementBasic'].resource.animations,...assets[model].resource.animations]:assets[model].resource.animations;
  const durations={};if(prefix==='Rig_Medium')for(const track of sameRigCombat())clips.push({resource:track});for(const a of clips)if(a.resource.name!=='T-Pose'){
   const name=a.resource.name;durations[name]=a.resource.duration;
   entity.anim.assignAnimation(name,a.resource,undefined,1,/^(Idle|Running|Walking)/.test(name));
  }return durations;
 }
 // Size the authored body before adding hats and held items.
 function sizeBody(entity,height){
  let low=Infinity,high=-Infinity;
  for(const r of entity.findComponents('render'))if(r.enabled&&/_(Body|Head|Arm|Leg|Jaw)/.test(r.entity.name))for(const mi of r.meshInstances){const b=mi.aabb;low=Math.min(low,b.center.y-b.halfExtents.y);high=Math.max(high,b.center.y+b.halfExtents.y);}
  const authored=high-low,scale=Number.isFinite(authored)&&authored>.1?height/authored:.6;entity.setLocalScale(scale,scale,scale);return height;
 }
 // Restore the former Knight's narrow silhouette without changing the current 1.42 height.
 // This belongs to players, remote players and NPCs only; creature proportions stay authored.
 const HUMANOID_WIDTH_PROFILE=0.42/0.6135142972230823;
 function slimHumanoid(entity){const s=entity.getLocalScale();entity.setLocalScale(s.x*HUMANOID_WIDTH_PROFILE,s.y,s.z*HUMANOID_WIDTH_PROFILE);}
 function limitVisualTop(entity,height){
  let top=0;for(const r of entity.findComponents('render'))if(r.enabled)for(const mi of r.meshInstances)top=Math.max(top,mi.aabb.center.y+mi.aabb.halfExtents.y);
  if(top>height){const s=entity.getLocalScale().clone().mulScalar(height/top);entity.setLocalScale(s);return height;}return top;
 }
 function attachAuthored(parent,boneName,child){
  const bone=parent.findByName(boneName);if(!bone)return;const position=child.getPosition().clone(),rotation=child.getRotation().clone(),scale=child.getLocalScale().clone();
  child.reparent(bone);child.setPosition(position);child.setRotation(rotation);child.setLocalScale(scale);
 }

 const root=new pc.Entity('Atores');app.root.addChild(root);const entries=new Map(),deathVisuals=new Map(),deathEvents=new Set();let now=0,gestureSerial=0;
 function weaponKind(e){const all=bridge.getItems?.()||{},keyId=e.equipped?.weapon,it=all[keyId]||all[keyId?.replace(/_PLUS_\d+$/,'')];if(!it)return 'unarmed';const s=(it.skill||'').toLowerCase(),key=(e.equipped.weapon||'').toLowerCase();if(s.includes('magia')||/staff|wand|cajad/.test(key))return 'staff';if(it.meleeRange>1||/spear|lanc/.test(key))return 'spear';if(s.includes('dist')||it.ranged)return 'bow';if(s.includes('mach')||/axe/.test(key))return 'axe';if(s.includes('clav')||/mace|club/.test(key))return 'mace';return 'sword';}
 function weapon(parent,kind,offhand,definition={}){
  const steel=definition.color||'#b7c8cf',gold='#b69555',wood='#483326';
  if(kind==='sword'){shape(parent,'box',[.035,.58,.09],[0,.3,0],steel);shape(parent,'box',[.035,.055,.27],[0,.04,0],gold);shape(parent,'cylinder',[.05,.21,.05],[0,-.07,0],wood);}
  if(kind==='axe'){shape(parent,'cylinder',[.05,.65,.05],[0,.22,0],wood);shape(parent,'box',[.055,.22,.35],[0,.46,.05],steel,[0,0,12]);shape(parent,'sphere',[.07,.24,.24],[0,.47,.22],steel);}
  if(kind==='mace'){shape(parent,'cylinder',[.06,.55,.06],[0,.17,0],wood);shape(parent,'sphere',[.24,.3,.24],[0,.48,0],'#81959b');for(let i=0;i<4;i++)shape(parent,'cone',[.09,.16,.09],[Math.cos(i*Math.PI/2)*.14,.48,Math.sin(i*Math.PI/2)*.14],steel,[0,0,90]);}
  if(kind==='spear'){shape(parent,'cylinder',[.045,1.18,.045],[0,.25,0],wood);shape(parent,'cone',[.13,.3,.06],[0,.94,0],steel);}
  if(kind==='staff'){shape(parent,'cylinder',[.06,.95,.06],[0,.31,0],wood);shape(parent,'sphere',[.18,.25,.18],[0,.88,0],definition.color||'#62cfc1');shape(parent,'cylinder',[.22,.055,.22],[0,.79,0],gold);}
  if(kind==='bow'){for(let i=0;i<7;i++){const a=(i/6-0.5)*2;shape(parent,'capsule',[.045,.16,.045],[0,Math.sin(a)*.42,.1+Math.cos(a)*.2],wood,[a*65,0,0]);}shape(parent,'cylinder',[.009,.7,.009],[0,0,.21],'#d2c6a5');}
  if(offhand){const shield=new pc.Entity('escudo');parent.addChild(shield);shape(shield,'cylinder',[.4,.065,.4],[0,0,0],definition.color||wood,[90,0,0]);shape(shield,'sphere',[.12,.12,.06],[0,0,.055],gold);return shield;}
 }
 function equipVisual(parent,kind,offhand,definition,owned){const name=offhand?shieldProp:propForWeapon[kind];if(!gearReady(name))return weapon(parent,kind,offhand,definition);const item=assets[name].resource.instantiateRenderEntity({castShadows:true});item.name=name;parent.addChild(item);if(!offhand)parent.setLocalEulerAngles(0,0,90);const scale=name==='PlantWarrior_Bow_withString'?.72:name==='Lorekeeper_Staff'?.64:name==='PlantWarrior_Spear'?.58:name==='Cleric_Shield'?.95:.72;item.setLocalScale(scale,scale,scale);if(kind==='bow'){item.setLocalRotation(new pc.Quat().setFromEulerAngles(0,90,0).mul(new pc.Quat().setFromEulerAngles(-90,0,0)));item.setLocalPosition(0,.45,.35);}else if(kind==='staff')item.setLocalPosition(0,.35,.25);else if(kind==='spear')item.setLocalPosition(0,.25,.15);if(definition?.color)for(const r of item.findComponents('render'))for(const mi of r.meshInstances){const m=mi.material.clone();m.diffuse=new pc.Color().fromString(definition.color);m.update();owned.push(m);mi.material=m;}return item;}
 function appearance(e,kind){
  const identity=normalizarAppearance(kind==='player'?(e._appearancePreview||e.appearance):e.appearance),palette=APPEARANCE_PALETTES.find(x=>x.id===identity.palette);
  const raw=e.equipped||{},cosmetic=e.cosmetic||raw.cosmetic||null;
  const eq=bridge.withCosmetics?.({...raw},cosmetic)||raw,items=bridge.getItems?.()||{};
  const base=key=>key?.replace(/_PLUS_\d+$/,'')||null;
  const item=key=>key?(items[key]||items[base(key)]||null):null;
  const dyes=e.dyes||eq.dyes||{},head=base(eq.head),cosmeticDef=item(cosmetic);
  const body=dyes.armor||palette.color||item(eq.armor)?.color||null;
  const feet=dyes.feet||item(eq.feet)?.color||null;
  const headColor=dyes.head||item(eq.head)?.color||'#939ca5';
  const cape=eq.cape?(dyes.cosmetic||eq.cape):null;
  const crown=cosmeticDef?.crown||(/^COROA_/.test(cosmetic||'')?cosmeticDef?.color:null)||(/^COROA_/.test(head||'')?headColor:null);
  return {eq,dyes,head,body,feet,headColor,cape,crown,cosmetic,identity,palette};
 }
 // Recolor only the authored cloth/metal swatches. Multiplication alone cannot turn a green hood wine-red.
 function colorOutfit(source,model,color){
  const m=source.clone(),target=new pc.Color().fromString(color).linear();
  const mask=model==='MagicalGirl'?'tex.r > tex.g * 1.8 && tex.r > tex.b * 1.25':model==='Rogue_Hooded'?'tex.g > tex.r * 1.25 && tex.g > tex.b * 1.15':model==='Knight'||model==='Cleric'?'maxc - minc < maxc * .32 && tex.b >= tex.r * .93':model==='Mage'?'tex.b > tex.r * 1.08 && tex.b > tex.g * 1.08':'tex.b > tex.r * 1.12 && tex.b > tex.g * 1.03';
  m.diffuse=new pc.Color(1,1,1);m.setParameter('appearance_color',[target.r,target.g,target.b]);
  m.getShaderChunks('glsl').set('diffusePS',`uniform vec3 material_diffuse;
   uniform vec3 appearance_color;
   void getAlbedo() {
    dAlbedo=material_diffuse.rgb;
    #ifdef STD_DIFFUSE_TEXTURE
     vec3 tex={STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME},{STD_DIFFUSE_TEXTURE_UV},{STD_TEXTURE_BIAS})).{STD_DIFFUSE_TEXTURE_CHANNEL};
     float maxc=max(tex.r,max(tex.g,tex.b));float minc=min(tex.r,min(tex.g,tex.b));
     bool garment=maxc>.003 && (${mask});
     dAlbedo*=garment ? appearance_color * (maxc/max(.001,max(appearance_color.r,max(appearance_color.g,appearance_color.b)))) : tex;
    #endif
    #ifdef STD_DIFFUSE_VERTEX
     dAlbedo*=saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
    #endif
   }`);m.update();return m;
 }
 function crown(parent,color,high=false){
  shape(parent,'cylinder',[.34,.09,.34],[0,2.18,0],color);
  for(let i=-1;i<=1;i++)shape(parent,'cone',[.075,high ? .31 : .21,.075],[i*.22,2.34-(Math.abs(i)*.06),0],color);
  shape(parent,'sphere',[.08,.08,.05],[0,2.2,.32],high?'#76e9ff':'#e54659');
 }
 const npcTools={eremita:'staff',domador:'staff',crepusculo:'staff',vohrim:'staff',vendedor:'staff',ferreiro:'mace',mineiro:'axe',cacadora:'bow',arena:'sword'};
 const npcPreferred={eremita:'Lorekeeper',crepusculo:'Cleric',vohrim:'Lorekeeper',vendedor:'Cleric',tintureira:'MagicalGirl',ferreiro:'Farmer_A',mineiro:'Farmer_B',mercador:'Hoarder',leiloeiro:'Farmer_B',banqueiro:'Lorekeeper',atendente:'Farmer_A',crupie:'Farmer_B',domador:'Farmer_A'};
 function humanoidModel(e,kind,id,w){
  if(kind!=='npc'){const selected=APPEARANCE_BODIES.find(x=>x.id===normalizarAppearance(kind==='player'?(e._appearancePreview||e.appearance):e.appearance).body).model;return seriesRig(selected)?ready(selected,'Knight'):selected;}
  const fallback=/tint|eremita|crepus|vohrim|vendedor/.test(id)?'Mage':/cacadora|leiloeiro|mercador|domador/.test(id)?'Rogue_Hooded':'Knight';return ready(npcPreferred[e.id],fallback);
 }

 function humanoid(e,kind,id){
  const look=kind==='npc'?null:appearance(e,kind);
  const w=kind==='npc'?(npcTools[e.id]||'unarmed'):weaponKind(e);
  const model=humanoidModel(e,kind,id,w);
  const entity=assets[model].resource.instantiateRenderEntity({castShadows:true});entity.name=id;root.addChild(entity);
  const rigMeshes=entity.findComponents('render');for(const r of rigMeshes){const n=r.entity.name;
   const isSeries=!!seriesRig(model),modeled=isSeries?/^(Farmer_|Lorekeeper_|Cleric_|Hoarder_|MagicalGirl_)/.test(n):/^(Knight|Mage|Rogue|Barbarian)_/.test(n);
   const hat=/Knight_Helmet|Mage_Hat|Barbarian_Hat/.test(n),cape=/Cape/.test(n),builtInTool=/HolyWater|Staff|Tome|Shield/.test(n);
   r.enabled=modeled&&!builtInTool&&(!hat||(kind==='npc'&&n==='Mage_Hat')||(kind!=='npc'&&!!look.eq.head&&!look.crown))&&(!cape||kind==='npc'||!!look.cape);
   for(const mi of r.meshInstances)mi.castShadow=r.enabled;
  }
  const visualHeight=sizeBody(entity,1.42);slimHumanoid(entity);const clips=animate(entity,model);
  const owned=[];
  const right=entity.findByName('handslot.r'),left=entity.findByName('handslot.l');
  const weaponHand=w==='bow'?left:right;
  if(weaponHand){const holder=new pc.Entity('Arma');weaponHand.addChild(holder);holder.setLocalEulerAngles(0,0,-90);equipVisual(holder,w,false,bridge.getItems?.()[e.equipped?.weapon],owned);}
  if(left&&w!=='bow'&&e.equipped?.offhand){const holder=new pc.Entity('Escudo');left.addChild(holder);holder.setLocalEulerAngles(0,90,0);equipVisual(holder,'',true,bridge.getItems?.()[e.equipped.offhand],owned);}
  if(look?.crown)crown(entity,look.crown,look.head==='COROA_CELESTIAL');


  for(const r of rigMeshes){const name=r.entity.name;let dye=null;
   if(kind==='npc')continue;
   const cloth=/Body|Arm|Leg|Cape|Hat|Helmet/.test(name)||model==='Rogue_Hooded'&&/Head_Hooded/.test(name);
   if(look.palette.color&&cloth&&!look.dyes.armor){for(const mi of r.meshInstances){const m=colorOutfit(mi.material,model,look.palette.color);owned.push(m);mi.material=m;}continue;}
   if(/Body/.test(name))dye=look.body;else if(/LegLeft|LegRight/.test(name))dye=look.feet;else if(/Helmet|Hat/.test(name))dye=look.headColor;else if(/Cape/.test(name))dye=look.cape;
   if(!dye)continue;for(const mi of r.meshInstances){const m=mi.material.clone();m.diffuse=new pc.Color().fromString(dye);m.update();owned.push(m);mi.material=m;}
  }

  const rec={entity,model,w,kind,id,owned,visualHeight,clips,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1,lastX:NaN,lastZ:NaN,state:'',targetAngle:0};
  return rec;
 }
 const RIGGED_MOBS={
  ORC:{model:'Barbarian',preferred:'OrcBrute',weapon:'axe',height:1.65},
  ORC_LIDER:{model:'Barbarian',preferred:'OrcBrute',weapon:'axe',height:1.65,armor:'#d7acac'},
  TROLL:{model:'Barbarian',preferred:'Monstrosity',weapon:'mace',height:1.75},
  MINOTAUR:{model:'Barbarian',weapon:'axe',height:1.62,visualLimit:2.05,armor:'#b79773',horns:true},
  SKELETON:{model:'Skeleton_Minion',weapon:'sword',height:1.38},
  CACADOR:{model:'Rogue_Hooded',weapon:'bow',height:1.35,armor:'#c8bb9e',cape:'#baaa80'},
  CARRASCO:{model:'Barbarian',weapon:'axe',height:1.3,skin:'#9c7464',armor:'#732838',cape:'#491c2a',mask:true},
  SENHOR_PROFUNDEZAS:{model:'Mage',weapon:'staff',height:1.4,skin:'#97719f',armor:'#592582',cape:'#331443',regalia:true},
  SENHOR_VALADARES:{model:'Knight',weapon:'sword',height:1.35,armor:'#efce8c',cape:'#d9b86f',hat:true},
  ARAUTO:{model:'Mage',preferred:'Cleric',weapon:'staff',height:1.2,armor:'#c4bce2',cape:'#e3d09d'}
 };
 function enemyHumanoid(e,kind,id){
  const type=e.type,base=RIGGED_MOBS[type],cfg={...base,model:ready(base.preferred,base.model)},def=bridge.getMonsterTypes?.()[type]||{};
  const entity=assets[cfg.model].resource.instantiateRenderEntity({castShadows:true});entity.name=id;root.addChild(entity);const owned=[];
  for(const r of entity.findComponents('render')){
   const n=r.entity.name,cape=/Cape|Cloak/.test(n),hat=/Hat|Helmet/.test(n);
   r.enabled=/^(Barbarian|Skeleton_Minion|Knight|Mage|Rogue|OrcBrute|Monstrosity|Cleric)_/.test(n)&&(!cape||!!cfg.cape)&&(!hat||!!cfg.hat)&&!/Shield|HolyWater|Staff|Tome/.test(n);
   // Keep the purchased creature's skin, eyes, teeth and armor details intact.
   const color=cape?cfg.cape:/Body|Shoulderpad|LegArmor/.test(n)?cfg.armor:(cfg.regalia||cfg.mask)&&/Head|Arm|Leg/.test(n)?cfg.skin:null;
   for(const mi of r.meshInstances){mi.castShadow=r.enabled;if(color){const m=mi.material.clone();m.diffuse=new pc.Color().fromString(color);m.update();owned.push(m);mi.material=m;}}
  }
  // Measure the complete authored body before hiding a head replaced by a creature part.
  let visualHeight=sizeBody(entity,cfg.height*Math.min(def.size||1,1.9));const clips=animate(entity,cfg.model);
  if(cfg.mask||cfg.regalia){const size=Math.min(def.size||1,1.65);entity.setLocalScale(.42*size,.6*size,.42*size);}
  // This legacy approximation remains until an authored minotaur is available.
  // Unlike the former root-space add-ons, these parts follow the head bone.
  if(cfg.horns){for(const r of entity.findComponents('render'))if(/Barbarian_Head/.test(r.entity.name))r.enabled=false;const head=new pc.Entity('Cabeca minotauro');entity.addChild(head);
   shape(head,'sphere',[.48,.43,.43],[0,1.94,.13],'#8c6349');shape(head,'sphere',[.38,.24,.36],[0,1.8,.4],'#ad805d');
   for(const side of [-1,1]){shape(head,'cone',[.15,.46,.15],[side*.32,2.19,.06],'#dfcfad',[0,0,-side*48]);shape(head,'sphere',[.055,.05,.035],[side*.17,2.01,.35],'#171914');shape(head,'sphere',[.06,.04,.035],[side*.1,1.8,.58],'#4a3429');}
   attachAuthored(entity,'head',head);
  }
  if(cfg.mask){
   for(const r of entity.findComponents('render'))if(/Barbarian_Head/.test(r.entity.name))r.enabled=false;
   const hood=new pc.Entity('Capuz e mascara do carrasco');entity.addChild(hood);
   shape(hood,'sphere',[.33,.39,.34],[0,1.57,.18],'#30252b');
   shape(hood,'box',[.47,.10,.06],[0,1.61,.36],'#79515b');
   shape(hood,'box',[.7,.11,.16],[0,1.54,.36],'#34232b');
   for(const side of [-1,1])shape(hood,'sphere',[.055,.045,.03],[side*.13,1.63,.44],'#e48472');
   attachAuthored(entity,'head',hood);
   for(const side of [-1,1]){
    const shoulder=new pc.Entity('Ombreira carrasco');entity.addChild(shoulder);shoulder.setLocalPosition(side*.55,1.4,0);
    shape(shoulder,'capsule',[.18,.28,.18],[-side*.18,-.12,0],'#3d202b',[0,0,-side*40]);
    shape(shoulder,'sphere',[.28,.18,.27],[0,0,0],'#5b2533');
    shape(shoulder,'cone',[.11,.28,.11],[side*.11,.20,0],'#842d42',[0,0,-side*31]);
    attachAuthored(entity,'chest',shoulder);
   }
  }
  if(cfg.regalia){
   const head=new pc.Entity('Coroa das profundezas');entity.addChild(head);
   crown(head,'#b47bdf');
   for(const side of [-1,1]){
    shape(head,'cone',[.19,.74,.16],[side*.45,2.2,-.08],'#422058',[0,0,-side*32]);
    shape(head,'sphere',[.055,.045,.035],[side*.16,1.85,.52],'#e8a6ff');
   }
   attachAuthored(entity,'head',head);
   for(const side of [-1,1]){
    const shoulder=new pc.Entity('Ombreira das profundezas');entity.addChild(shoulder);shoulder.setLocalPosition(side*.55,1.28,.08);
    shape(shoulder,'sphere',[.27,.24,.23],[-side*.13,-.02,-.04],'#422058');
    shape(shoulder,'sphere',[.24,.3,.15],[0,0,0],'#8d44b7');
    shape(shoulder,'sphere',[.09,.1,.08],[side*.07,.02,.18],'#e4a2ff');
    attachAuthored(entity,'chest',shoulder);
   }
   const chest=new pc.Entity('Medalhao das profundezas');entity.addChild(chest);chest.setLocalPosition(0,1.25,.42);
   shape(chest,'sphere',[.26,.29,.16],[0,0,0],'#bd78ec');
   attachAuthored(entity,'spine',chest);
  }
  if(cfg.visualLimit)visualHeight=limitVisualTop(entity,cfg.visualLimit);
  const hand=entity.findByName(cfg.weapon==='bow'?'handslot.l':'handslot.r');if(hand){const holder=new pc.Entity('Arma inimiga');hand.addChild(holder);holder.setLocalEulerAngles(0,0,cfg.mask?0:-90);if(cfg.mask)weapon(holder,'axe',false,{color:'#b9c5c8'});else equipVisual(holder,cfg.weapon,false,cfg.regalia?{color:'#b778e2'}:{},owned);}
  if(cfg.mask||cfg.regalia)visualHeight=Math.max(.1,...entity.findComponents('render').filter(r=>r.enabled).flatMap(r=>r.meshInstances.map(mi=>mi.aabb.center.y+mi.aabb.halfExtents.y)));
  return {entity,kind,id,type,model:cfg.model,w:cfg.weapon,owned,visualHeight,clips,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1,lastX:NaN,lastZ:NaN,state:''};
 }

 function animal(e,kind,id){
  const entity=assets.Wolf.resource.instantiateRenderEntity({castShadows:true});entity.name=id;root.addChild(entity);
  // Original author rig/materials/clips. Measured standing height: 1.044 at uniform scale .38.
  const visualHeight=.95*(bridge.getMonsterTypes?.()[e.type]?.size||1),scale=.38*visualHeight/1.044;entity.setLocalScale(scale,scale,scale);
  entity.addComponent('anim',{activate:true});const clips={};for(const {resource:track}of assets.Wolf.resource.animations){clips[track.name]=track.duration;entity.anim.assignAnimation(track.name,track,undefined,1,/^(Idle|Walk|Gallop)$/.test(track.name));}
  return {entity,kind,id,type:e.type,model:'Wolf',animal:true,w:'bite',owned:[],visualHeight,clips,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1,lastX:NaN,lastZ:NaN,state:''};
 }
 function creature(e,kind,id){
  if(e.type==='WOLF'){ensure('Wolf');if(assets.Wolf)return animal(e,kind,id);}
  if(kind==='mob'&&RIGGED_MOBS[e.type])return enemyHumanoid(e,kind,id);
  const group=new pc.Entity(id);root.addChild(group);
  const type=e.type||'RAT',def=bridge.getMonsterTypes?.()[type]||{},c=def.color||'#687f66';
  const rec={entity:group,kind,id,type,parts:[],owned:[],lastX:NaN,lastZ:NaN,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1};
  // Per-family mass is a visual choice, not a universal radius correction.
  const sphereFactor=type.startsWith('DRAKE')?1.4:type.startsWith('GOLEM')?1.5:2;
  const add=(form,size,at,color=c,rot)=>shape(group,form,form==='sphere'?size.map(v=>v*sphereFactor):size,at,color,rot);
  const move=(form,size,at,color=c,rot=[0,0,0],swing=12)=>{const part=add(form,size,at,color,rot);rec.parts.push({part,rot,swing});return part;};
  // Render capsules have native height 2. Place endpoints explicitly so joints meet.
  const link=(parent,from,to,radius,color)=>{const a=new pc.Vec3(...from),b=new pc.Vec3(...to),delta=b.clone().sub(a);const part=shape(parent,'capsule',[radius*2,delta.length()/2,radius*2],a.clone().add(b).mulScalar(.5).toArray(),color);part.setLocalRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,delta.normalize()));return part;};
  const leg=(from,knee,foot,radius,color,swing=10)=>{const pivot=new pc.Entity('Perna articulada');group.addChild(pivot);pivot.setLocalPosition(...from);const local=p=>p.map((v,i)=>v-from[i]);if(knee){link(pivot,[0,0,0],local(knee),radius,color);link(pivot,local(knee),local(foot),radius*.85,color);}else link(pivot,[0,0,0],local(foot),radius,color);rec.parts.push({part:pivot,rot:[0,0,0],swing});return pivot;};
  const wing=(side,anchor,width,height,angle,color,swing)=>{const pivot=new pc.Entity('Raiz da asa');group.addChild(pivot);pivot.setLocalPosition(side*anchor[0],anchor[1],anchor[2]);const rad=angle*Math.PI/180;shape(pivot,'cone',[width,height,.045],[side*Math.sin(rad)*height/2,Math.cos(rad)*height/2,0],color,[0,0,-side*angle]);rec.parts.push({part:pivot,rot:[0,0,0],swing:side*swing,axis:'z'});};
  const eyes=(y,z,span=.12,col='#e5ce92')=>{for(const side of [-1,1])add('sphere',[.035,.034,.026],[side*span,y,z],col);};
  const quadruped=(body,head,legs)=>{
   add('sphere',body,[0,.39,-.07],c);add('sphere',head,[0,.45,.43],c);
   for(const side of [-1,1])for(const z of [-.31,.31]){if(type==='PET_GATO')move('capsule',legs,[side*.23,.18,z],c,[0,0,side*8],16);else leg([side*.18,.36,z],null,[side*.26,.03,z],legs[0]/2,c,12);}
  };
  if(type==='RAT'){
   quadruped([.34,.24,.47],[.22,.19,.27],[.068,.17,.07]);
   add('sphere',[.11,.075,.16],[0,.38,.69],'#b98a79');eyes(.49,.65,.115,'#161514');
   for(const side of [-1,1])add('sphere',[.11,.13,.045],[side*.16,.58,.38],'#a37670',[0,side*20,0]);
   leg([0,.35,-.36],null,[0,.12,-1.05],.0175,'#ae8b83',9);
  }else if(type==='WOLF'||type==='LIZARD'||type==='PET_GATO'){
   const cat=type==='PET_GATO',lizard=type==='LIZARD';
   quadruped(cat?[.29,.25,.43]:lizard?[.33,.21,.55]:[.37,.3,.57],cat?[.24,.23,.24]:lizard?[.21,.15,.38]:[.28,.28,.31],[cat?.075:lizard?.09:.12,.23,.09]);
   add('sphere',lizard?[.14,.085,.29]:[.17,.13,.24],[0,lizard?.39:.38,lizard?.77:.66],lizard?c:cat?'#4a464c':'#a8a39a');
   eyes(lizard?.52:.55,lizard?.8:.76,.15,cat?'#c8a452':lizard?'#f0ba48':'#edcf9c');
   for(const side of [-1,1])add('cone',cat?[.1,.22,.08]:lizard?[.055,.1,.06]:[.11,.24,.11],[side*.17,.72,.43],cat?'#27252c':c,[0,0,-side*14]);
   if(lizard)leg([0,.34,-.5],null,[0,.13,-1.3],.045,c,8);else move('capsule',cat?[.055,.52,.055]:[.16,.47,.16],[0,.39,-.64],cat?'#29282e':c,[62,0,0],11);
   if(lizard)for(let i=0;i<4;i++)add('cone',[.075,.13,.065],[0,.57,-.29+i*.19],'#869c4b',[42,0,0]);
   if(type==='WOLF'){
    add('sphere',[.28,.24,.3],[0,.58,-.17],'#706d64');
    for(const side of [-1,1]){
     add('cone',[.08,.16,.07],[side*.11,.31,.83],'#e3d9c2',[90,0,0]);
     add('sphere',[.07,.07,.04],[side*.16,.55,.8],'#e0a25d');
    }
   }
  }else if(type==='PET_TATU'){
   add('sphere',[.42,.31,.51],[0,.38,-.06],'#8c6836');
   for(let i=0;i<4;i++)add('sphere',[.36,.07,.11],[0,.62,-.39+i*.22],i%2?'#b58b43':'#c69b4e');
   add('sphere',[.22,.2,.25],[0,.32,.48],'#bc9460');add('cone',[.12,.23,.12],[0,.28,.73],'#d5b47e',[90,0,0]);eyes(.4,.61,.15,'#201a16');
   for(const side of [-1,1])for(const z of [-.26,.3])move('capsule',[.09,.17,.09],[side*.29,.14,z],'#987443',[0,0,side*12],10);
   move('capsule',[.06,.36,.06],[0,.22,-.6],'#a47e4a',[55,0,0],8);
  }else if(type==='PET_VAGALUME'){
   add('sphere',[.19,.18,.22],[0,.69,.03],'#354a29');add('sphere',[.22,.24,.25],[0,.63,-.3],'#d0ed68');
   add('sphere',[.12,.13,.13],[0,.75,.3],'#485b30');eyes(.78,.42,.09,'#edfaac');
   for(const side of [-1,1])move('sphere',[.32,.035,.18],[side*.27,.88,-.05],'#c5e7ca',[0,0,side*16],14);
   for(const side of [-1,1])add('capsule',[.025,.17,.025],[side*.1,.91,.35],'#596733',[0,0,side*24]);
  }else if(type==='PET_ESPIRITO'){
   add('cone',[.35,.64,.35],[0,.4,0],'#58bcb4',[0,0,180]);add('sphere',[.28,.29,.27],[0,.73,.07],'#a8e9df');
   eyes(.78,.31,.11,'#287d78');add('sphere',[.13,.07,.13],[0,1.08,.02],'#d1fff2');
   for(const side of [-1,1])add('sphere',[.12,.24,.11],[side*.34,.5,-.04],'#79d3c7',[0,0,side*30]);
  }else if(type==='SNAKE'){
   for(let i=0;i<7;i++)move('sphere',[.16-i*.011,.14-i*.009,.22],[Math.sin(i*1.1)*.08,.14,-.07-i*.14],i%2?'#477938':c,[0,0,0],3);
   link(group,[0,.17,-.02],[0,.5,.43],.095,c);add('sphere',[.24,.14,.26],[0,.56,.49],c);
   add('sphere',[.28,.13,.08],[0,.58,.34],'#62943d');eyes(.63,.66,.16,'#f8c85c');add('cone',[.025,.19,.025],[0,.49,.75],'#cc6265',[90,0,0]);
  }else if(type==='SPIDER'||type==='SCORPION'){
   const scorpion=type==='SCORPION',shell=scorpion?'#80361e':'#2b172c';
   add('sphere',[.39,.22,.42],[0,.32,-.12],c);add('sphere',[.24,.18,.26],[0,.29,.35],shell);eyes(.37,.57,.11,scorpion?'#ffbc58':'#d65d69');
   for(const side of [-1,1])for(let i=0;i<4;i++){
    const z=-.32+i*.2;leg([side*.23,.31,z],[side*.56,.43,z+(i-1.5)*.025],[side*.73,.025,z+(i-1.5)*.055],.025,shell,7);
   }
   if(scorpion){for(let i=0;i<3;i++){const at=[0,.43+i*.16,-.49-i*.11];add('sphere',[.11,.12,.14],at,c);if(i)link(group,[0,.43+(i-1)*.16,-.49-(i-1)*.11],at,.06,c);}add('cone',[.1,.26,.09],[0,.87,-.81],'#d19a47',[35,0,0]);
    for(const side of [-1,1]){link(group,[side*.16,.29,.35],[side*.32,.27,.58],.035,c);add('sphere',[.14,.1,.15],[side*.32,.27,.58],c);}}
   else add('sphere',[.25,.08,.27],[0,.43,-.13],'#533354');
  }else if(type==='BAT'){
   add('sphere',[.19,.28,.18],[0,.8,0],c);add('sphere',[.17,.15,.16],[0,1.02,.08],c);
   for(const side of [-1,1]){
    move('cone',[.66,.75,.045],[side*.51,.87,-.02],'#50415b',[0,0,side*70],24);
    add('cone',[.36,.43,.035],[side*.9,.72,-.04],'#50415b',[0,0,side*42]);
    for(let i=0;i<3;i++)add('capsule',[.023,.39,.023],[side*(.35+i*.21),.83-i*.1,.02],'#92819f',[0,0,side*(48+i*13)]);
    add('cone',[.075,.16,.07],[side*.12,1.18,.05],c,[0,0,-side*10]);
   }eyes(1.04,.23,.095,'#ec888e');
  }else if(type.startsWith('DRAKE')){
   add('sphere',[.49,.39,.72],[0,.55,-.12],c);add('capsule',[.28,.5,.3],[0,.85,.45],c,[38,0,0]);
   add('sphere',[.32,.22,.38],[0,1.02,.74],c);add('sphere',[.27,.11,.31],[0,.88,.96],'#b86b4a');eyes(1.1,.9,.2,'#ffcc72');
   for(const side of [-1,1]){
    for(const z of [-.4,.22])leg([side*.2,.55,z],null,[side*.38,.04,z],.09,c,12);
    wing(side,[.27,.68,-.17],.58,.82,50,'#753a35',13);
    add('cone',[.1,.28,.1],[side*.22,1.31,.62],'#dfad80',[0,0,-side*22]);
   }
   leg([0,.5,-.4],null,[0,.25,-1.44],.08,c,8);
   for(let i=0;i<4;i++)add('cone',[.085,.16,.09],[0,.95,-.48+i*.25],'#c2865e',[42,0,0]);
   if(type==='DRAKE_LIDER'){
    for(const side of [-1,1]){
     wing(side,[.3,.75,-.27],.75,1.18,63,'#a52d20',16);
     add('cone',[.17,.47,.15],[side*.24,1.54,.55],'#edc18b',[0,0,-side*23]);
    }
    for(let i=0;i<5;i++)add('cone',[.13,.23,.12],[0,1.15,-.49+i*.25],'#efb35c',[42,0,0]);
    add('sphere',[.22,.12,.28],[0,.83,1.19],'#f2a13b');
   }
  }else if(type.startsWith('GOLEM')){
   const rock='#697883',seam='#415763';
   add('sphere',[.51,.59,.4],[0,.91,0],rock);add('sphere',[.38,.33,.32],[0,1.47,.07],rock);
   for(const side of [-1,1]){
    add('sphere',[.33,.31,.3],[side*.53,1.23,0],rock);
    move('capsule',[.23,.58,.23],[side*.62,.79,.05],rock,[0,0,side*13],12);
    leg([side*.25,.64,0],null,[side*.29,.035,0],.14,rock,9);
    add('sphere',[.09,.055,.04],[side*.13,1.52,.34],'#e9ba69');
   }
   for(let i=0;i<3;i++)add('capsule',[.045,.38,.045],[(i-1)*.18,.95,.35],seam,[0,0,33+i*12]);
   if(type==='GOLEM_REI'){
    for(const side of [-1,1]){
     add('box',[.34,.45,.3],[side*.59,1.52,-.06],'#8b8176',[0,0,side*16]);
     add('cone',[.16,.49,.15],[side*.6,1.91,-.06],'#d6be83',[0,0,side*20]);
     add('sphere',[.065,.08,.035],[side*.16,1.05,.31],'#76d8d4');
    }
    add('box',[.39,.12,.32],[0,1.79,.04],'#9c8c69');
    for(let i=-1;i<=1;i++)add('cone',[.1,.33,.1],[i*.27,2.02,.04],'#c9ad72');
   }
  }else if(type==='SOMBRA'){
   add('cone',[.53,1.16,.48],[0,.68,0],'#2c1d3d',[0,0,180]);
   add('sphere',[.36,.36,.32],[0,1.3,.08],'#241733');
   for(const side of [-1,1]){
    move('cone',[.19,.83,.15],[side*.49,.82,.04],'#462e59',[0,0,side*28],18);
    add('sphere',[.09,.06,.035],[side*.16,1.37,.37],'#ce8aff');
    move('cone',[.13,.55,.11],[side*.23,.4,-.24],'#674284',[0,0,side*16],10);
   }
   add('sphere',[.16,.18,.1],[0,.77,.42],'#8d5bb3');
  }else{
   const skeleton=type==='SKELETON',shadow=type==='SOMBRA',boss=/SENHOR|ARAUTO/.test(type),minotaur=type==='MINOTAUR';
   const body=skeleton?'#d1cbb6':c;
   if(shadow)add('cone',[.43,1.15,.4],[0,.58,0],c,[0,0,180]);
   else add('sphere',[minotaur?.53:.39,.52,.3],[0,.95,0],body);
   add('sphere',[.3,.29,.28],[0,1.47,.06],body);
   for(const side of [-1,1]){
    move('capsule',[skeleton?.09:.18,.56,.16],[side*.23,.36,0],body,[0,0,side*7],11);
    move('capsule',[skeleton?.08:.17,.5,.15],[side*.46,.94,0],body,[0,0,side*17],12);
   }
   if(skeleton){for(let i=0;i<3;i++)add('capsule',[.31,.04,.06],[0,1.06-i*.15,.24],body,[0,0,0]);eyes(1.51,.32,.13,'#302a26');}
   else eyes(1.53,.31,.13,boss?'#e8b5fb':shadow?'#b778dc':'#e6c885');
   if(minotaur){add('sphere',[.3,.17,.3],[0,1.38,.37],'#ac7d60');for(const side of [-1,1])add('cone',[.13,.42,.13],[side*.37,1.72,0],'#d9c5a2',[0,0,-side*48]);}
   if(type==='ORC_LIDER'||type==='CARRASCO'||boss){add('sphere',[.5,.12,.35],[0,1.18,-.12],'#755b54');for(const side of [-1,1])add('cone',[.13,.33,.13],[side*.28,1.8,0],boss?'#c8a867':'#b9a484',[0,0,-side*22]);}
   if(type==='CACADOR')add('sphere',[.38,.1,.37],[0,1.73,0],'#613d29');
   if(type==='TROLL')add('sphere',[.47,.25,.31],[0,.99,.28],'#617d5a');
   if(!shadow){const hand=new pc.Entity('arma inimiga');group.addChild(hand);hand.setLocalPosition(-.5,.87,.24);weapon(hand,skeleton||type==='CACADOR'?'sword':boss?'staff':'axe',false);}
  }
  const visualSize=['RAT','SNAKE','SPIDER','SCORPION','LIZARD'].includes(type)?.5:type==='DRAKE_LIDER'||type==='GOLEM_REI'?.8:1;
  const s=(kind==='pet' ? .48 : (def.size||1))*visualSize;group.setLocalScale(s,s,s);rec.visualHeight=Math.max(.1,...group.findComponents('render').flatMap(r=>r.meshInstances.map(mi=>mi.aabb.center.y+mi.aabb.halfExtents.y)));return rec;
 }
 // Confirmed death presentation is separate from authoritative monsters and selectable entries.
 function retainConfirmedDeath(detail){
  if(destroyed||!detail||detail.targetId==null)return false;
  const floor=bridge.getFloor?.()??bridge.getPlayer()?.floor??0;if((detail.floor??0)!==floor)return false;
  const id='mob:'+detail.targetId,time=performance.now(),prior=deathVisuals.get(id);
  if(prior){if(prior.eventId!==detail.eventId)return false;if(!prior.started)prior.contactAt=Math.max(time,Math.min(prior.receivedAt+500,Number.isFinite(detail.contactAt)?detail.contactAt:time));return true;}
  if(detail.eventId&&deathEvents.has(detail.eventId))return false;
  let rec=entries.get(id);const snapshot=detail.mob||rec?.data;if(!snapshot?.type)return false;
  if(!rec){rec=creature({...snapshot,hp:1},'mob',id);rec.data={...snapshot};rec.entity.setPosition((snapshot.renderX??snapshot.x)+.5,0,(snapshot.renderY??snapshot.y)+.5);rec.entity.setEulerAngles(0,(FORWARD[snapshot.dir]??0)+(rec.angleOffset||0),0);}
  else entries.delete(id);
  if(rec.entity.anim)rec.entity.anim.speed=0;
  if(detail.eventId){deathEvents.add(detail.eventId);if(deathEvents.size>128)deathEvents.delete(deathEvents.values().next().value);}
  deathVisuals.set(id,{rec,eventId:detail.eventId,floor,receivedAt:time,contactAt:Math.max(time,Math.min(time+500,Number.isFinite(detail.contactAt)?detail.contactAt:time)),started:false,scale:rec.entity.getLocalScale().clone()});return true;
 }
 function cancelConfirmedDeath(eventId){for(const [id,death]of deathVisuals)if(death.eventId===eventId){dispose(death.rec);deathVisuals.delete(id);}}
 function clearCombatPresentation(){for(const death of deathVisuals.values())dispose(death.rec);deathVisuals.clear();}
 function updateDeathVisuals(floor){const time=performance.now();for(const [id,death]of deathVisuals){
  if(death.floor!==floor||entries.has(id)){dispose(death.rec);deathVisuals.delete(id);continue;}
  if(time<death.contactAt)continue;
  const rec=death.rec,elapsed=(time-death.contactAt)/1000;
  if(elapsed>=.65){dispose(rec);deathVisuals.delete(id);continue;}
  if(!death.started){death.started=true;rec.state=rec.animal?'Death':'Death_A';if(rec.entity.anim){rec.entity.anim.baseLayer.transition(rec.state,.035,0);rec.entity.anim.speed=(rec.clips?.[rec.state]||.8)/.55;}}
  if(!rec.entity.anim){const angle=Math.min(1,elapsed/.4)*75;rec.entity.setEulerAngles(angle,rec.angle||0,0);}
  const shrink=elapsed<.5?1:Math.max(0,1-(elapsed-.5)/.15);rec.entity.setLocalScale(death.scale.x*shrink,death.scale.y*shrink,death.scale.z*shrink);
 }}
 function signature(e,kind){
  if(kind==='pet')return e.type||kind;
  const w=kind==='mob'?RIGGED_MOBS[e.type]?.weapon:kind==='npc'?(npcTools[e.id]||'unarmed'):weaponKind(e);
  const prop=propForWeapon[w],visual=prop?(gearReady(prop)?'asset':'shape'):'none';
  const shield=e.equipped?.offhand?(gearReady(shieldProp)?'asset':'shape'):'none';
  if(kind==='mob'){if(e.type==='WOLF'){ensure('Wolf');return 'WOLF|'+(assets.Wolf?'authored':'pending');}return (e.type||kind)+'|'+visual;}
  if(kind==='npc')return e.id+'|'+e.body+'|'+e.hat+'|'+visual;
  const q=e.equipped||{},d=e.dyes||q.dyes||{};
  const identity=normalizarAppearance(kind==='player'?(e._appearancePreview||e.appearance):e.appearance);
  return [identity.body,identity.palette,weaponKind(e),q.weapon,q.offhand,q.armor,q.head,q.feet,q.cape,e.cosmetic||q.cosmetic,
   e.color,e.bodyColor,d.armor,d.head,d.feet,d.cosmetic,visual,shield].join('|');
 }
 function update(dt){
  now+=dt;const seen=new Set(),p=bridge.getPlayer(),cam=bridge.getCamera();
  const bounds=bridge.getViewBounds?.()||{minX:cam.x-.5,maxX:cam.x+bridge.VP_W+.5,minY:cam.y-.5,maxY:cam.y+bridge.VP_H+.5};
  const visible=e=>{const x=e.renderX??e.x??e.pos?.x,z=e.renderY??e.y??e.pos?.y;return Number.isFinite(x)&&x>=bounds.minX&&x<bounds.maxX&&z>=bounds.minY&&z<bounds.maxY;};
  const sync=(id,e,kind)=>{if(!visible(e))return;seen.add(id);const sig=signature(e,kind);let rec=entries.get(id);const expected=kind==='mob'&&RIGGED_MOBS[e.type]?ready(RIGGED_MOBS[e.type].preferred,RIGGED_MOBS[e.type].model):kind==='npc'?humanoidModel(e,kind,id,npcTools[e.id]||'unarmed'):kind==='player'||kind==='remote'?humanoidModel(e,kind,id,weaponKind(e)):null;if(rec&&(rec.sig!==sig||expected&&rec.model!==expected)){dispose(rec);entries.delete(id);rec=null;}if(!rec){rec=kind==='mob'||kind==='pet'?creature(e,kind,id):humanoid(e,kind,id);// First sight and visual rebuilds consume the current cooldown snapshot; they are not new attacks.
   rec.previousTimer=e.attackTimer||0;rec.previousAtkAnim=e.atkAnim||0;rec.previousArtAttackAt=e.artAttackAt||0;rec.sig=sig;entries.set(id,rec);}rec.data=e;
   const x=(e.renderX??e.x??e.pos?.x)+.5,z=(e.renderY??e.y??e.pos?.y)+.5;const distance=Number.isFinite(rec.lastX)?Math.hypot(x-rec.lastX,z-rec.lastZ):0;const moving=distance>.0008;rec.entity.setPosition(x,0,z);
   let angle=FORWARD[e.dir]??(moving?Math.atan2(x-rec.lastX,z-rec.lastZ)*180/Math.PI:rec.angle||0);rec.angle=angle;rec.entity.setEulerAngles(0,angle+(rec.angleOffset||0),0);
   const timer=e.attackTimer||0,atk=e.atkAnim||0,hit=e.artAttackAt||0;
   const newStrike=timer>rec.previousTimer+60||(atk>0&&rec.previousAtkAnim<=0)||(hit>0&&hit!==rec.previousArtAttackAt);
   rec.previousTimer=timer;rec.previousAtkAnim=atk;rec.previousArtAttackAt=hit;
   const strikeStarted=newStrike&&now-rec.lastStrikeAt>.14;
   if(strikeStarted){
    const preferred=rec.animal?'Attack':rec.w==='staff'?'Spellcast_Shoot':rec.w==='bow'?'2H_Ranged_Shoot':rec.w==='unarmed'?'Unarmed_Melee_Attack_Punch_A':'1H_Melee_Attack_Chop';rec.attackState=rec.clips?.[preferred]?preferred:seriesRig(rec.model)==='Rig_Large'?'1H_Melee_Attack_Chop':'Use_Item';
    const duration=rec.clips?.[rec.attackState]||.6;
    // Finish windup, contact and recovery inside the existing attack interval.
    const cadence=(timer||e.attackDelay||800)/1000;rec.attackSeconds=Math.max(.3,Math.min(duration,cadence*.9));rec.attackSpeed=duration/rec.attackSeconds;
    rec.strikeUntil=now+rec.attackSeconds;rec.lastStrikeAt=now;
    const phase=rec.animal?.525:rec.w==='staff'?.3214:rec.w==='bow'?.4219:rec.w==='unarmed'?.3409:.5625;
    rec.attackStartedAt=performance.now();rec.attackContactTime=now+rec.attackSeconds*phase;rec.attackContactAt=rec.attackStartedAt+rec.attackSeconds*phase*1000;rec.attackSequence=++gestureSerial;rec.contactSent=false;
    document.dispatchEvent(new CustomEvent('valadares:actor-gesture',{detail:{actorId:id,kind,weaponKind:rec.w,phase:'prepare',sequence:rec.attackSequence,contactAt:rec.attackContactAt,durationMs:rec.attackSeconds*1000}}));
   }
   if(!rec.contactSent&&Number.isFinite(rec.attackContactTime)&&now>=rec.attackContactTime){
    rec.contactSent=true;document.dispatchEvent(new CustomEvent('valadares:actor-gesture',{detail:{actorId:id,kind,weaponKind:rec.w,phase:'contact',sequence:rec.attackSequence,contactAt:rec.attackContactAt}}));
   }
   if(rec.model){const attacking=now<rec.strikeUntil,series=!!seriesRig(rec.model),speed=distance/Math.max(dt,.001);let state=e.hp<=0?(rec.animal?'Death':'Death_A'):attacking?rec.attackState:moving?(rec.animal?(speed>2.5?'Gallop':'Walk'):'Running_A'):series?'Idle_A':'Idle';
    if(state!==rec.state||strikeStarted&&attacking){rec.entity.anim.baseLayer.transition(state,strikeStarted?.035:.1,0);rec.state=state;}
    rec.entity.anim.speed=attacking?rec.attackSpeed:moving?Math.max(.75,Math.min(2,distance/Math.max(dt,.001)/3)):1;
   }else {const bob=rec.type==='BAT'?Math.sin(now*5)*.08:rec.type==='SOMBRA'?Math.sin(now*3)*.075:rec.type.startsWith('PET_')?Math.sin(now*4)*.025:0;
    rec.entity.setLocalPosition(x,bob+(now<rec.strikeUntil?Math.max(0,Math.sin((rec.strikeUntil-now)*20))*.035:0),z);
    for(let i=0;i<rec.parts.length;i++){const {part,rot,swing,axis}=rec.parts[i];const a=moving||rec.type==='BAT'||now<rec.strikeUntil?Math.sin(now*(rec.type==='BAT'?12:10)+i*Math.PI*.7)*swing:0,zAxis=rec.type==='BAT'||axis==='z';part.setLocalEulerAngles(rot[0]+(zAxis?0:a),rot[1],rot[2]+(zAxis?a:0));}
   }
   rec.lastX=x;rec.lastZ=z;rec.entity.enabled=true;
  };
  sync('self',p,'player');for(const [id,e]of Object.entries(bridge.getRemotePlayers?.()||{}))sync('remote:'+id,e,'remote');for(const e of bridge.getMonsters?.()||[])if(e.hp>0)sync('mob:'+e.id,e,'mob');
  if((p.floor||0)===0)for(const e of bridge.getNpcs?.()||[])sync('npc:'+e.id,{...e,x:e.pos?.x??e.x,y:e.pos?.y??e.y},'npc');
  const pet=bridge.getPet?.();if(pet&&pet.x!==undefined&&pet.pet)sync('pet',{...pet,type:pet.pet},'pet');
  updateDeathVisuals(bridge.getFloor?.()??p.floor??0);
  for(const [id,rec]of entries)if(!seen.has(id)){dispose(rec);entries.delete(id);}
 }
 function dispose(rec){rec.entity.destroy();for(const m of rec.owned)m.destroy();}
 return {update,entries,retainConfirmedDeath,cancelConfirmedDeath,clearCombatPresentation,diagnostics:()=>({visible:entries.size,deathVisuals:deathVisuals.size,models:Object.keys(assets),pending:[...pending.keys()],failedSeries}),destroy(){destroyed=true;clearCombatPresentation();for(const rec of entries.values())dispose(rec);entries.clear();root.destroy();for(const m of materials.values())m.destroy();for(const a of loaded){a.unload();app.assets.remove(a);}}};
}
