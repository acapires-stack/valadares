const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../../equipment-rules');
test('legacy items preserve base and upgrade without creating enchantments',()=>{
    for(const key of ['ESPADA','CAJADO_ETERNO','CORACAO_HL'])for(let n=0;n<=5;n++){
        const encoded=R.make(key,n),t=R.parse(encoded);
        assert.equal(t.base,key);assert.equal(t.plus,n);assert.equal(t.enchanted,false);
    }
});
test('one piece preserves identity and rolls through upgrade and serialization',()=>{
    const key=R.make('ESPADA_ETERNA',2,'012345abcdef',[{code:'c',value:7},{code:'h',value:35}]);
    const serialized=JSON.parse(JSON.stringify({inv:{[key]:1}}));
    const upgraded=R.upgrade(Object.keys(serialized.inv)[0],5);
    assert.equal(R.parse(upgraded).id,R.parse(key).id);
    assert.deepEqual(R.parse(upgraded).affixes,R.parse(key).affixes);
    assert.equal(R.parse(upgraded).plus,5);
    assert.notEqual(key,R.make('ESPADA_ETERNA',2,'fedcba543210',R.parse(key).affixes));
});
test('malformed, overpowered and wrong-kind rolls are rejected',()=>{
    for(const key of ['ESPADA_PLUS_6','ESPADA_PLUS_05','ESPADA~012345abcdef~h999','ESPADA~012345abcdef~h25.c5.b3.p2','ESPADA~nope~h25','ESPADA~012345abcdef~x2','X'.repeat(129)])
        assert.equal(R.parse(key).valid,false,key);
    assert.equal(R.validFor(R.make('ARMADURA',0,'012345abcdef',[{code:'b',value:5}]),'armor'),false);
});
test('adding and rerolling a slot never changes the other slots',()=>{
    for(const kind of R.KINDS)for(let j=0;j<100;j++){
        let aff=[];
        for(let i=0;i<3;i++){const before=JSON.stringify(aff);aff=R.roll(kind,aff,i);assert.equal(JSON.stringify(aff.slice(0,i)),before);}
        for(let i=0;i<3;i++){
            const before=aff;aff=R.roll(kind,aff,i);
            before.forEach((a,n)=>{if(n!==i)assert.deepEqual(aff[n],a)});
            assert(R.validFor(R.make('ITEM',5,'012345abcdef',aff),kind));
        }
    }
});
test('chosen attributes keep the same price, roll values, and may repeat in all three slots',()=>{
    const expectedAdd=[{essence:6,gold:500},{essence:12,gold:1500},{essence:24,gold:4000}];
    const expectedReroll=[{essence:3,gold:250},{essence:6,gold:750},{essence:12,gold:2000}];
    for(let i=0;i<3;i++){
        assert.deepEqual(R.cost(i,false),expectedAdd[i]);
        assert.deepEqual(R.cost(i,true),expectedReroll[i]);
    }
    let aff=[];
    for(let i=0;i<3;i++)aff=R.roll('weapon',aff,i,()=>i/3,'b');
    assert.deepEqual(aff.map(a=>a.code),['b','b','b']);
    assert.deepEqual(aff.map(a=>a.value),[3,4,6]);
    const key=R.make('ESPADA',0,'012345abcdef',aff);
    assert.deepEqual(R.parse(key).affixes,aff);
    assert.equal(R.bonuses({weapon:key},()=> 'weapon').bossDamage,13);
    assert.equal(R.bonuses({weapon:R.make('ESPADA',0,'fedcba543210',Array(3).fill({code:'b',value:7}))},()=> 'weapon').bossDamage,21);
    assert.deepEqual(R.roll('weapon',aff,1,()=>1,'b').map(a=>a.value),[3,7,6]);
});
test('new weapon affixes respect kind restrictions and effective caps',()=>{
    assert.equal(R.VERSION,2);
    for(const code of ['d','v','g']){
        const key=R.make('CAJADO',0,'012345abcdef',[{code,value:3}]);
        assert.equal(R.validFor(key,'wand'),true);
    }
    const triple=(code)=>R.make('ESPADA',0,'012345abcdef',Array(3).fill({code,value:3}));
    assert.equal(R.bonuses({weapon:triple('v')},()=> 'weapon').vampirism,9);
    assert.equal(R.bonuses({weapon:triple('g')},()=> 'weapon').manaOnHit,9);
    assert.equal(R.bonuses({weapon:triple('d')},()=> 'weapon').def,9);
    assert.equal(R.validFor(triple('v'),'armor'),false);
    for(const choice of ['__proto__','constructor','x',''])
        assert.throws(()=>R.roll('weapon',[],0,()=>0,choice));
    assert.throws(()=>R.roll('armor',[],0,()=>0,'v'));
});
test('equipped bonuses are bounded and cosmetics never contribute',()=>{
    const key=R.make('ITEM',5,'012345abcdef',[{code:'c',value:10},{code:'h',value:45},{code:'m',value:30}]);
    const eq=Object.fromEntries(['weapon','head','neck','offhand','armor','feet','cosmetic'].map(k=>[k,key]));
    const b=R.bonuses(eq);
    assert.equal(b.critDamage,40);assert.equal(b.hp,270);assert.equal(b.mp,180);
    assert.equal(R.bonuses({cosmetic:key}).hp,0);
});
