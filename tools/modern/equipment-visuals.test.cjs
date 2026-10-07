const test=require('node:test');
const assert=require('node:assert/strict');
const visuals=import('../../modern/equipment-visuals.js');

test('enchanted Infinity Sword retains its authored two-handed model and grip',async()=>{
 const {resolverEquipmentVisual:resolve}=await visuals;
 const definition={kind:'weapon',hand:'2h'};
 const base=resolve('ESPADA_INFINITA',definition,'weapon');
 const enchanted=resolve('ESPADA_INFINITA_PLUS_5~39d905cc1709~h32.s5.p5',definition,'weapon');
 assert.equal(enchanted?.name,'sword_G');
 assert.deepEqual(enchanted,base);
});

test('all equipped catalog weapons and shields retain their model after forging and enchantment',async()=>{
 const {resolverEquipmentVisual:resolve,equipmentVisualCatalog:catalog}=await visuals;
 for(const id of Object.keys(catalog)){
  const shield=id.startsWith('ESCUDO_'),slot=shield?'offhand':'weapon';
  const definition={kind:shield?'offhand':'weapon',hand:'1h'};
  const base=resolve(id,definition,slot);
  assert.ok(base,id+' has an authored visual');
  for(const key of [id+'_PLUS_3',id+'~testitem~h32',id+'_PLUS_3~testitem~h32.s5'])
   assert.deepEqual(resolve(key,definition,slot),base,key);
 }
});

test('unknown items and incompatible slots still do not resolve a weapon',async()=>{
 const {resolverEquipmentVisual:resolve}=await visuals;
 assert.equal(resolve('UNKNOWN_PLUS_5~test~s5',{kind:'weapon'},'weapon'),null);
 assert.equal(resolve('ESPADA_INFINITA_PLUS_5~test~s5',{kind:'weapon'},'offhand'),null);
 assert.equal(resolve('ESCUDO_FERRO_PLUS_5~test~s5',{kind:'offhand'},'weapon'),null);
 assert.equal(resolve(null,{kind:'weapon'},'weapon'),null);
});
