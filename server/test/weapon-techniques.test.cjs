'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../../weapon-techniques-rules');
const progression=require('../../progression-content');

test('only six offensive techniques survive normalization, including hostile property names',()=>{
  assert.equal(rules.TECHNIQUES.length,6);
  assert.equal(rules.BY_ID.__proto__,undefined);
  assert.deepEqual(rules.normalize({v:1,owned:['sword','sword','unarmed','constructor','axe'],disabled:['axe','staff','__proto__']}),
    {v:1,owned:['sword','axe'],disabled:['axe']});
});
test('legendary eligibility follows authored base rarity, never upgrade suffix',()=>{
  assert.equal(rules.eligible('ESPADA',{kind:'weapon',tier:0}),false);
  assert.equal(rules.eligible('ESPADA_HL',{kind:'weapon'}),true);
  assert.equal(rules.eligible('MACHADO_FORJA',progression.items.MACHADO_FORJA),false);
  for(const base of ['MACHADO_RUINAS','MARTELO_COLOSSO','BESTA_GUARDIAO','LANCA_GUARDIAO','LAMINA_ETERNA_1H'])
    assert.equal(rules.eligible(base,progression.items[base]),true,base);
  assert.equal(rules.techniqueForBase('LAMINA_ETERNA_1H'),'sword');
  assert.equal(rules.techniqueForBase(null),null);
});
test('areas are anchored correctly and piercing follows an oblique shot',()=>{
  const origin={x:10,y:10},target={x:14,y:11};
  const axe=rules.cells('axe',origin,target,1);
  assert.equal(axe.length,8);
  assert(axe.every(p=>Math.max(Math.abs(p.x-origin.x),Math.abs(p.y-origin.y))===1));
  const staff=rules.cells('staff',origin,target,6);
  assert(staff.some(p=>p.x===15&&p.y===11));
  assert.deepEqual(rules.cells('ranged',origin,target,8),[{x:15,y:11},{x:16,y:12}]);
  assert.deepEqual(rules.cells('spear',origin,{x:12,y:10},3),[{x:13,y:10}]);
  assert.deepEqual(rules.cells('sword',origin,{x:11,y:11},1),[{x:11,y:12},{x:11,y:10}]);
});
test('bonus is conservative integer damage',()=>{
  assert.equal(rules.bonus(1,20),0);
  assert.equal(rules.bonus(9,40),3);
  assert.equal(rules.bonus(100,60),60);
});
