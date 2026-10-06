// Original real-time presentation; authoritative entities and timings stay in the game.
// Models face +Z at rest; positive yaw turns that forward vector toward +X.
const FORWARD={down:0,left:-90,up:180,right:90};
export async function createActors(pc,app,bridge){
 const materials=new Map();
 const material=(hex,metal=0)=>{const key=hex+':'+metal;if(materials.has(key))return materials.get(key);const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(hex);m.metalness=metal;m.useMetalness=true;m.gloss=metal?0.45:0.15;m.update();materials.set(key,m);return m;};
 const shape=(parent,type,scale,pos,color,rotation)=>{const e=new pc.Entity(type);e.addComponent('render',{type,material:material(color),castShadows:Math.max(...scale)>.22,receiveShadows:true});e.setLocalScale(...scale);e.setLocalPosition(...pos);if(rotation)e.setLocalEulerAngles(...rotation);parent.addChild(e);return e;};
 const load=name=>new Promise((resolve,reject)=>app.assets.loadFromUrl(new URL(`./assets/characters/${name}-game.glb`,import.meta.url).href,'container',(err,a)=>err?reject(err):resolve(a)));
 const names=['Knight','Mage','Rogue_Hooded','Barbarian','Skeleton_Warrior'];const loaded=await Promise.all(names.map(load));const assets=Object.fromEntries(names.map((n,i)=>[n,loaded[i]]));
 const root=new pc.Entity('Atores');app.root.addChild(root);const entries=new Map();let now=0;
 function weaponKind(e){const it=bridge.getItems?.()[e.equipped?.weapon];if(!it)return 'unarmed';const s=(it.skill||'').toLowerCase(),key=(e.equipped.weapon||'').toLowerCase();if(s.includes('magia')||/staff|wand|cajad/.test(key))return 'staff';if(s.includes('dist')||it.ranged)return 'bow';if(s.includes('mach')||/axe/.test(key))return 'axe';if(s.includes('clav')||/mace|club/.test(key))return 'mace';if(it.meleeRange>1||/spear|lanc/.test(key))return 'spear';return 'sword';}
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
 function appearance(e){
  const raw=e.equipped||{},cosmetic=e.cosmetic||raw.cosmetic||null;
  const eq=bridge.withCosmetics?.({...raw},cosmetic)||raw,items=bridge.getItems?.()||{};
  const base=key=>key?.replace(/_PLUS_\d+$/,'')||null;
  const item=key=>key?(items[key]||items[base(key)]||null):null;
  const dyes=e.dyes||eq.dyes||{},head=base(eq.head),cosmeticDef=item(cosmetic);
  const body=dyes.armor||item(eq.armor)?.color||e.color||e.bodyColor||'#5b6170';
  const feet=dyes.feet||item(eq.feet)?.color||null;
  const headColor=dyes.head||item(eq.head)?.color||'#939ca5';
  const cape=eq.cape?(dyes.cosmetic||eq.cape):null;
  const crown=cosmeticDef?.crown||(/^COROA_/.test(cosmetic||'')?cosmeticDef?.color:null)||(/^COROA_/.test(head||'')?headColor:null);
  return {eq,dyes,head,body,feet,headColor,cape,crown,cosmetic};
 }
 function crown(parent,color,high=false){
  shape(parent,'cylinder',[.34,.09,.34],[0,2.18,0],color);
  for(let i=-1;i<=1;i++)shape(parent,'cone',[.075,high ? .31 : .21,.075],[i*.22,2.34-(Math.abs(i)*.06),0],color);
  shape(parent,'sphere',[.08,.08,.05],[0,2.2,.32],high?'#76e9ff':'#e54659');
 }
 function humanoid(e,kind,id){
  const look=kind==='npc'?null:appearance(e);
  const npcTools={eremita:'staff',domador:'staff',crepusculo:'staff',vohrim:'staff',vendedor:'staff',ferreiro:'mace',mineiro:'axe',cacadora:'bow',arena:'sword'};
  const w=kind==='npc'?(npcTools[e.id]||'unarmed'):weaponKind(e);
  const model=kind==='npc'?(/tint|eremita|crepus|vohrim|vendedor/.test(id)?'Mage':/cacadora|leiloeiro|mercador|domador/.test(id)?'Rogue_Hooded':'Knight'):(w==='staff'?'Mage':w==='bow'?'Rogue_Hooded':'Knight');
  const entity=assets[model].resource.instantiateRenderEntity({castShadows:true});entity.name=id;root.addChild(entity);entity.setLocalScale(.42,.60,.42);
  const rigMeshes=entity.findComponents('render');for(const r of rigMeshes){const n=r.entity.name;
   const modeled=/^(Knight|Mage|Rogue)_/.test(n),hat=/Knight_Helmet|Mage_Hat/.test(n),cape=/Cape/.test(n);
   r.enabled=modeled&&(!hat||(kind==='npc'&&n==='Mage_Hat')||(kind!=='npc'&&!!look.eq.head&&!look.crown))&&(!cape||kind==='npc'||!!look.cape);
   for(const mi of r.meshInstances)mi.castShadow=r.enabled;
  }
  entity.addComponent('anim',{activate:true});for(const a of assets[model].resource.animations)entity.anim.assignAnimation(a.resource.name,a.resource,undefined,1,true);
  const right=entity.findByName('handslot.r'),left=entity.findByName('handslot.l');
  if(right){const holder=new pc.Entity('Arma');right.addChild(holder);holder.setLocalEulerAngles(0,0,-90);weapon(holder,w,false,bridge.getItems?.()[e.equipped?.weapon]);}
  if(left&&e.equipped?.offhand){const holder=new pc.Entity('Escudo');left.addChild(holder);holder.setLocalEulerAngles(0,90,0);weapon(holder,'',true,bridge.getItems?.()[e.equipped.offhand]);}
  if(look?.crown)crown(entity,look.crown,look.head==='COROA_CELESTIAL');
  else if(look?.eq.head&&model==='Rogue_Hooded'){
   shape(entity,'cylinder',[.37,.11,.37],[0,2.12,0],look.headColor);
  }
  if(look?.eq.head&&!look.crown&&/ELMO_CHIFRES|ELMO_DRACO/.test(look.head))for(const side of [-1,1])shape(entity,'cone',[.1,.27,.1],[side*.27,2.32,0],'#d8c6a3',[0,0,side*25]);
  const owned=[];
  for(const r of rigMeshes){const name=r.entity.name;let dye=null;
   if(kind==='npc')dye=/Cape|Hat/.test(name)?e.hat:/Body/.test(name)?e.body:null;
   else if(/Body/.test(name))dye=look.body;
   else if(/LegLeft|LegRight/.test(name))dye=look.feet;
   else if(/Helmet|Hat/.test(name))dye=look.headColor;
   else if(/Cape/.test(name))dye=look.cape;
   if(!dye)continue;for(const mi of r.meshInstances){const m=mi.material.clone();m.diffuse=new pc.Color().fromString(dye);m.update();owned.push(m);mi.material=m;}
  }
  const rec={entity,model,w,kind,id,owned,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1,lastX:NaN,lastZ:NaN,state:'',targetAngle:0};
  return rec;
 }
 const RIGGED_MOBS={
  ORC:{model:'Barbarian',weapon:'axe',skin:'#728a4f',armor:'#615342'},
  ORC_LIDER:{model:'Barbarian',weapon:'axe',skin:'#78914e',armor:'#8a3659',cape:'#702b46',hat:true},
  TROLL:{model:'Barbarian',weapon:'mace',skin:'#637f5b',armor:'#52634e'},
  MINOTAUR:{model:'Barbarian',weapon:'axe',skin:'#936347',armor:'#644534',horns:true},
  SKELETON:{model:'Skeleton_Warrior',weapon:'sword',cape:'#4b4248'},
  CACADOR:{model:'Rogue_Hooded',weapon:'bow',skin:'#b1845a',armor:'#a25c29',cape:'#634329'},
  CARRASCO:{model:'Barbarian',weapon:'axe',skin:'#9c7464',armor:'#732838',cape:'#491c2a',mask:true},
  SENHOR_PROFUNDEZAS:{model:'Mage',weapon:'staff',skin:'#97719f',armor:'#592582',cape:'#331443',crown:'#b47bdf',eyes:'#e8a6ff'},
  SENHOR_VALADARES:{model:'Knight',weapon:'sword',armor:'#bf9839',cape:'#e9be55',crown:'#f4d26d'},
  ARAUTO:{model:'Mage',weapon:'staff',skin:'#c5afcf',armor:'#8462b3',cape:'#d3b96d',crown:'#b9a0e1'}
 };
 function enemyHumanoid(e,kind,id){
  const type=e.type,cfg=RIGGED_MOBS[type],def=bridge.getMonsterTypes?.()[type]||{};
  const entity=assets[cfg.model].resource.instantiateRenderEntity({castShadows:true});entity.name=id;root.addChild(entity);
  const size=Math.min(def.size||1,1.65),wide=type==='TROLL'||type==='MINOTAUR'?1.16:1;
  entity.setLocalScale(.42*size*wide,.6*size,.42*size*wide);
  const owned=[];
  for(const r of entity.findComponents('render')){
   const n=r.entity.name,body=/Body/.test(n),head=/Head|Jaw|Eyes/.test(n),limb=/Arm|Leg/.test(n),cape=/Cape|Cloak/.test(n),hat=/Hat|Helmet/.test(n);
   r.enabled=/^(Barbarian|Skeleton_Warrior|Knight|Mage|Rogue)_/.test(n)&&(body||head||limb||cape||hat)
    &&(!cape||!!cfg.cape)&&(!hat||!!cfg.hat)&&(!/Barbarian_Head/.test(n)||type!=='MINOTAUR'&&type!=='CARRASCO');
   for(const mi of r.meshInstances){mi.castShadow=r.enabled;
    let color=cape?cfg.cape:body?cfg.armor:head||limb?cfg.skin:null;
    if(type==='SKELETON'&&(head||limb))color=null;
    if(!color)continue;const m=mi.material.clone();m.diffuse=new pc.Color().fromString(color);m.update();owned.push(m);mi.material=m;
   }
  }
  entity.addComponent('anim',{activate:true});for(const a of assets[cfg.model].resource.animations)entity.anim.assignAnimation(a.resource.name,a.resource,undefined,1,true);
  const hand=entity.findByName('handslot.r');if(hand){const holder=new pc.Entity('Arma inimiga');hand.addChild(holder);holder.setLocalEulerAngles(0,0,-90);weapon(holder,cfg.weapon,false,{color:type==='SENHOR_VALADARES'?'#f8d46f':type==='SENHOR_PROFUNDEZAS'?'#b778e2':undefined});}
  if(cfg.crown)crown(entity,cfg.crown,type==='SENHOR_VALADARES');
  if(cfg.horns){
   shape(entity,'sphere',[.43,.4,.46],[0,1.59,.24],'#85543e');
   shape(entity,'sphere',[.35,.23,.32],[0,1.44,.59],'#ae8060');
   shape(entity,'sphere',[.2,.11,.13],[0,1.42,.83],'#493a33');
   for(const side of [-1,1]){
    shape(entity,'cone',[.18,.49,.17],[side*.47,1.92,.08],'#e5d0a8',[0,0,-side*48]);
    shape(entity,'sphere',[.055,.05,.03],[side*.22,1.66,.66],'#e3bb78');
   }
  }
  if(cfg.mask){
   shape(entity,'sphere',[.33,.39,.34],[0,1.57,.18],'#30252b');
   shape(entity,'box',[.47,.1,.06],[0,1.61,.5],'#79515b');
   for(const side of [-1,1])shape(entity,'sphere',[.055,.045,.03],[side*.13,1.63,.55],'#e48472');
  }
  if(cfg.eyes)for(const side of [-1,1])shape(entity,'sphere',[.055,.045,.035],[side*.16,1.85,.52],cfg.eyes);
  if(type==='ORC_LIDER'||type==='CARRASCO'||type==='TROLL')for(const side of [-1,1])shape(entity,'sphere',[.28,.19,.29],[side*.55,1.4,0],cfg.armor);
  if(type==='ORC'||type==='ORC_LIDER'){
   for(const side of [-1,1]){
    shape(entity,'cone',[.065,.18,.07],[side*.19,1.57,.52],'#e8d6ad',[25,0,-side*12]);
    shape(entity,'cone',[.12,.22,.1],[side*.38,1.81,.04],'#5c523c',[0,0,-side*34]);
   }
   if(type==='ORC_LIDER'){
    shape(entity,'cylinder',[.045,1.7,.045],[.49,1.67,-.24],'#48362b');
    shape(entity,'box',[.47,.7,.045],[.49,2.24,-.22],'#a93652');
    shape(entity,'sphere',[.12,.12,.07],[.49,2.32,-.17],'#e7b867');
   }
  }
  if(type==='TROLL'){
   shape(entity,'sphere',[.51,.42,.38],[0,1.16,.22],'#4e6550');
   for(const side of [-1,1]){
    shape(entity,'sphere',[.31,.33,.29],[side*.64,.93,.23],'#647d60');
    shape(entity,'cone',[.09,.22,.09],[side*.18,1.51,.55],'#d0bf9e',[25,0,0]);
   }
  }
  if(type==='SKELETON'){
   for(let i=0;i<3;i++)shape(entity,'capsule',[.33,.045,.06],[0,1.12-i*.13,.28],'#e0dccb');
   shape(entity,'sphere',[.04,.04,.025],[-.14,1.82,.35],'#dd5954');shape(entity,'sphere',[.04,.04,.025],[.14,1.82,.35],'#dd5954');
  }
  if(type==='CACADOR'){
   shape(entity,'cylinder',[.32,.1,.35],[0,2.06,0],'#583b27');
   shape(entity,'box',[.09,.62,.1],[.37,.95,-.27],'#6a4324');
   for(const side of [-1,1])shape(entity,'box',[.07,.23,.12],[side*.25,.76,.34],'#b07c3d');
  }
  if(type==='CARRASCO'){
   shape(entity,'box',[.7,.11,.16],[0,1.54,.5],'#34232b');
   for(const side of [-1,1])shape(entity,'cone',[.11,.3,.11],[side*.6,1.57,0],'#722832',[0,0,-side*35]);
  }
  if(type==='SENHOR_PROFUNDEZAS'){
   for(const side of [-1,1]){
    shape(entity,'cone',[.19,.74,.16],[side*.45,2.2,-.08],'#422058',[0,0,-side*32]);
    shape(entity,'sphere',[.24,.3,.15],[side*.55,1.28,.08],'#8d44b7');
    shape(entity,'sphere',[.09,.1,.08],[side*.62,1.3,.26],'#e4a2ff');
   }
   shape(entity,'sphere',[.26,.29,.16],[0,1.25,.42],'#bd78ec');
  }
  if(type==='SENHOR_VALADARES'){
   for(const side of [-1,1]){
    shape(entity,'box',[.3,.43,.2],[side*.55,1.38,-.05],'#d8ae45',[0,0,side*18]);
    shape(entity,'cone',[.13,.47,.13],[side*.58,1.83,-.06],'#f4ce60',[0,0,-side*27]);
   }
   shape(entity,'sphere',[.23,.25,.13],[0,1.27,.39],'#f6df8b');
   shape(entity,'cylinder',[.46,.08,.46],[0,2.44,0],'#f5d976');
  }
  if(type==='ARAUTO'){
   for(const side of [-1,1]){
    shape(entity,'cone',[.43,.86,.07],[side*.64,1.58,-.21],'#baa0dd',[0,0,-side*42]);
    shape(entity,'sphere',[.14,.14,.09],[side*.68,1.53,-.12],'#eee0a7');
   }
   shape(entity,'sphere',[.23,.26,.13],[0,1.28,.41],'#d8c7ef');
  }
  return {entity,kind,id,type,model:cfg.model,w:cfg.weapon,owned,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1,lastX:NaN,lastZ:NaN,state:''};
 }
 function creature(e,kind,id){
  if(kind==='mob'&&RIGGED_MOBS[e.type])return enemyHumanoid(e,kind,id);
  const group=new pc.Entity(id);root.addChild(group);
  const type=e.type||'RAT',def=bridge.getMonsterTypes?.()[type]||{},c=def.color||'#687f66';
  const rec={entity:group,kind,id,type,parts:[],owned:[],lastX:NaN,lastZ:NaN,previousTimer:0,previousAtkAnim:0,previousArtAttackAt:0,strikeUntil:0,lastStrikeAt:-1};
  const add=(form,size,at,color=c,rot)=>shape(group,form,size,at,color,rot);
  const move=(form,size,at,color=c,rot=[0,0,0],swing=12)=>{const part=add(form,size,at,color,rot);rec.parts.push({part,rot,swing});return part;};
  const eyes=(y,z,span=.12,col='#e5ce92')=>{for(const side of [-1,1])add('sphere',[.035,.034,.026],[side*span,y,z],col);};
  const quadruped=(body,head,legs)=>{
   add('sphere',body,[0,.39,-.07],c);add('sphere',head,[0,.45,.43],c);
   for(const side of [-1,1])for(const z of [-.31,.31])move('capsule',legs,[side*.23,.18,z],c,[0,0,side*8],16);
  };
  if(type==='RAT'){
   quadruped([.34,.24,.47],[.22,.19,.27],[.068,.17,.07]);
   add('sphere',[.11,.075,.16],[0,.38,.69],'#b98a79');eyes(.49,.65,.115,'#161514');
   for(const side of [-1,1])add('sphere',[.11,.13,.045],[side*.16,.58,.38],'#a37670',[0,side*20,0]);
   move('capsule',[.035,.51,.035],[0,.27,-.62],'#ae8b83',[65,0,0],9);
  }else if(type==='WOLF'||type==='LIZARD'||type==='PET_GATO'){
   const cat=type==='PET_GATO',lizard=type==='LIZARD';
   quadruped(cat?[.29,.25,.43]:lizard?[.33,.21,.55]:[.37,.3,.57],cat?[.24,.23,.24]:lizard?[.21,.15,.38]:[.28,.28,.31],[cat?.075:lizard?.09:.12,.23,.09]);
   add('sphere',lizard?[.14,.085,.29]:[.17,.13,.24],[0,lizard?.39:.38,lizard?.77:.66],lizard?c:cat?'#4a464c':'#a8a39a');
   eyes(lizard?.52:.55,lizard?.8:.76,.15,cat?'#c8a452':lizard?'#f0ba48':'#edcf9c');
   for(const side of [-1,1])add('cone',cat?[.1,.22,.08]:lizard?[.055,.1,.06]:[.11,.24,.11],[side*.17,.72,.43],cat?'#27252c':c,[0,0,-side*14]);
   move('capsule',lizard?[.09,.62,.09]:cat?[.055,.52,.055]:[.16,.47,.16],[0,lizard?.32:.39,-.64],cat?'#29282e':c,[62,0,0],11);
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
   for(let i=0;i<7;i++)move('sphere',[.16-i*.011,.14-i*.009,.22],[Math.sin(i*1.1)*.19,.12,-.07-i*.14],i%2?'#477938':c,[0,0,0],3);
   add('capsule',[.16,.42,.16],[0,.37,.29],c,[18,0,0]);add('sphere',[.24,.14,.26],[0,.56,.49],c);
   add('sphere',[.28,.13,.08],[0,.58,.34],'#62943d');eyes(.63,.66,.16,'#f8c85c');add('cone',[.025,.19,.025],[0,.49,.75],'#cc6265',[90,0,0]);
  }else if(type==='SPIDER'||type==='SCORPION'){
   const scorpion=type==='SCORPION',shell=scorpion?'#80361e':'#2b172c';
   add('sphere',[.39,.22,.42],[0,.32,-.12],c);add('sphere',[.24,.18,.26],[0,.29,.35],shell);eyes(.37,.57,.11,scorpion?'#ffbc58':'#d65d69');
   for(const side of [-1,1])for(let i=0;i<4;i++){
    const z=-.32+i*.2;move('capsule',[.055,.42,.055],[side*.37,.36,z],shell,[15,0,side*54],10);
    add('capsule',[.045,.31,.045],[side*.64,.17,z+(i-1.5)*.055],shell,[0,0,-side*32]);
   }
   if(scorpion){for(let i=0;i<3;i++)add('sphere',[.11,.12,.14],[0,.43+i*.16,-.49-i*.11],c);add('cone',[.1,.26,.09],[0,.87,-.81],'#d19a47',[35,0,0]);
    for(const side of [-1,1])add('sphere',[.14,.1,.15],[side*.32,.27,.58],c);}
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
    for(const z of [-.47,.35])move('capsule',[.18,.43,.19],[side*.35,.23,z],c,[0,0,side*18],12);
    move('cone',[.58,.82,.045],[side*.65,.86,-.17],'#753a35',[0,0,-side*50],13);
    add('cone',[.1,.28,.1],[side*.22,1.31,.62],'#dfad80',[0,0,-side*22]);
   }
   move('capsule',[.16,.7,.16],[0,.39,-.85],c,[59,0,0],8);
   for(let i=0;i<4;i++)add('cone',[.085,.16,.09],[0,.95,-.48+i*.25],'#c2865e',[42,0,0]);
   if(type==='DRAKE_LIDER'){
    for(const side of [-1,1]){
     move('cone',[.75,1.18,.06],[side*.95,1.13,-.27],'#a52d20',[0,0,-side*63],20);
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
    move('capsule',[.28,.65,.28],[side*.26,.32,0],rock,[0,0,side*7],9);
    add('sphere',[.09,.055,.04],[side*.13,1.52,.34],'#e9ba69');
   }
   for(let i=0;i<3;i++)add('capsule',[.045,.38,.045],[(i-1)*.18,.95,.35],seam,[0,0,33+i*12]);
   if(type==='GOLEM_REI'){
    for(const side of [-1,1]){
     add('box',[.34,.45,.3],[side*.59,1.52,-.06],'#8b8176',[0,0,side*16]);
     add('cone',[.16,.49,.15],[side*.6,1.91,-.06],'#d6be83',[0,0,side*20]);
     add('sphere',[.15,.17,.08],[side*.16,1.05,.4],'#76d8d4');
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
    move('cone',[.13,.55,.11],[side*.23,.18,-.24],'#674284',[0,0,side*16],10);
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
  const s=kind==='pet' ? .48 : (def.size||1);group.setLocalScale(s,s,s);return rec;
 }
 function signature(e,kind){
  if(kind==='mob'||kind==='pet')return e.type||kind;
  if(kind==='npc')return e.id+'|'+e.body+'|'+e.hat;
  const q=e.equipped||{},d=e.dyes||q.dyes||{};
  return [weaponKind(e),q.weapon,q.offhand,q.armor,q.head,q.feet,q.cape,e.cosmetic||q.cosmetic,
   e.color,e.bodyColor,d.armor,d.head,d.feet,d.cosmetic].join('|');
 }
 function update(dt){
  now+=dt;const seen=new Set(),p=bridge.getPlayer(),cam=bridge.getCamera();
  const bounds=bridge.getViewBounds?.()||{minX:cam.x-.5,maxX:cam.x+bridge.VP_W+.5,minY:cam.y-.5,maxY:cam.y+bridge.VP_H+.5};
  const visible=e=>{const x=e.renderX??e.x??e.pos?.x,z=e.renderY??e.y??e.pos?.y;return Number.isFinite(x)&&x>=bounds.minX&&x<bounds.maxX&&z>=bounds.minY&&z<bounds.maxY;};
  const sync=(id,e,kind)=>{if(!visible(e))return;seen.add(id);const sig=signature(e,kind);let rec=entries.get(id);if(rec&&rec.sig!==sig){dispose(rec);entries.delete(id);rec=null;}if(!rec){rec=kind==='mob'||kind==='pet'?creature(e,kind,id):humanoid(e,kind,id);rec.sig=sig;entries.set(id,rec);}rec.data=e;
   const x=(e.renderX??e.x??e.pos?.x)+.5,z=(e.renderY??e.y??e.pos?.y)+.5;const distance=Number.isFinite(rec.lastX)?Math.hypot(x-rec.lastX,z-rec.lastZ):0;const moving=distance>.0008;rec.entity.setPosition(x,0,z);
   let angle=FORWARD[e.dir]??(moving?Math.atan2(x-rec.lastX,z-rec.lastZ)*180/Math.PI:rec.angle||0);rec.angle=angle;rec.entity.setEulerAngles(0,angle,0);
   const timer=e.attackTimer||0,atk=e.atkAnim||0,hit=e.artAttackAt||0;
   const newStrike=timer>rec.previousTimer+60||(atk>0&&rec.previousAtkAnim<=0)||(hit>0&&hit!==rec.previousArtAttackAt);
   rec.previousTimer=timer;rec.previousAtkAnim=atk;rec.previousArtAttackAt=hit;
   if(newStrike&&now-rec.lastStrikeAt>.14){rec.strikeUntil=now+.34;rec.lastStrikeAt=now;}
   if(rec.model){const attacking=now<rec.strikeUntil;let state=e.hp<=0?'Death_A':attacking?(rec.w==='staff'?'Spellcast_Shoot':rec.w==='bow'?'2H_Ranged_Shoot':rec.w==='unarmed'?'Unarmed_Melee_Attack_Punch_A':'1H_Melee_Attack_Chop'):moving?'Running_A':'Idle';
    if(state!==rec.state){rec.entity.anim.baseLayer.transition(state,.1);rec.state=state;}
    else if(newStrike&&attacking){rec.entity.anim.baseLayer.transition('Idle',0);rec.entity.anim.baseLayer.transition(state,.06);}
    rec.entity.anim.speed=attacking?1:moving?Math.max(.75,Math.min(2,distance/Math.max(dt,.001)/3)):1;
   }else {const bob=rec.type==='BAT'?Math.sin(now*5)*.08:rec.type==='SOMBRA'?Math.sin(now*3)*.075:rec.type.startsWith('PET_')?Math.sin(now*4)*.025:0;
    rec.entity.setLocalPosition(x,bob+(now<rec.strikeUntil?Math.sin((rec.strikeUntil-now)*20)*.035:0),z);
    for(let i=0;i<rec.parts.length;i++){const {part,rot,swing}=rec.parts[i];const a=moving||rec.type==='BAT'||now<rec.strikeUntil?Math.sin(now*(rec.type==='BAT'?12:10)+i*Math.PI*.7)*swing:0;part.setLocalEulerAngles(rot[0]+(rec.type==='BAT'?0:a),rot[1],rot[2]+(rec.type==='BAT'?a:0));}
   }
   rec.lastX=x;rec.lastZ=z;rec.entity.enabled=true;
  };
  sync('self',p,'player');for(const [id,e]of Object.entries(bridge.getRemotePlayers?.()||{}))sync('remote:'+id,e,'remote');for(const e of bridge.getMonsters?.()||[])if(e.hp>0)sync('mob:'+e.id,e,'mob');
  if((p.floor||0)===0)for(const e of bridge.getNpcs?.()||[])sync('npc:'+e.id,{...e,x:e.pos?.x??e.x,y:e.pos?.y??e.y},'npc');
  const pet=bridge.getPet?.();if(pet&&pet.x!==undefined&&pet.pet)sync('pet',{...pet,type:pet.pet},'pet');
  for(const [id,rec]of entries)if(!seen.has(id)){dispose(rec);entries.delete(id);}
 }
 function dispose(rec){rec.entity.destroy();for(const m of rec.owned)m.destroy();}
 return {update,entries,diagnostics:()=>({visible:entries.size,models:names}),destroy(){for(const rec of entries.values())dispose(rec);entries.clear();root.destroy();for(const m of materials.values())m.destroy();for(const a of loaded){a.unload();app.assets.remove(a);}}};
}
