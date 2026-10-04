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
test('malformed, duplicate, overpowered and wrong-kind rolls are rejected',()=>{
    for(const key of ['ESPADA_PLUS_6','ESPADA_PLUS_05','ESPADA~012345abcdef~h999','ESPADA~012345abcdef~h25.h30','ESPADA~012345abcdef~h25.c5.b3.p2','ESPADA~nope~h25','ESPADA~012345abcdef~x2','X'.repeat(129)])
        assert.equal(R.parse(key).valid,false,key);
    assert.equal(R.validFor(R.make('ARMADURA',0,'012345abcdef',[{code:'b',value:5}]),'armor'),false);
});
test('adding and rerolling a slot never changes the others or duplicates an affix',()=>{
    for(const kind of R.KINDS)for(let j=0;j<100;j++){
        let aff=[];
        for(let i=0;i<3;i++){const before=JSON.stringify(aff);aff=R.roll(kind,aff,i);assert.equal(JSON.stringify(aff.slice(0,i)),before);}
        for(let i=0;i<3;i++){
            const before=aff;aff=R.roll(kind,aff,i);
            assert.equal(new Set(aff.map(a=>a.code)).size,3);
            before.forEach((a,n)=>{if(n!==i)assert.deepEqual(aff[n],a)});
            assert(R.validFor(R.make('ITEM',5,'012345abcdef',aff),kind));
        }
    }
});
test('equipped bonuses are bounded and cosmetics never contribute',()=>{
    const key=R.make('ITEM',5,'012345abcdef',[{code:'c',value:10},{code:'h',value:45},{code:'m',value:30}]);
    const eq=Object.fromEntries(['weapon','head','neck','offhand','armor','feet','cosmetic'].map(k=>[k,key]));
    const b=R.bonuses(eq);
    assert.equal(b.critDamage,40);assert.equal(b.hp,270);assert.equal(b.mp,180);
    assert.equal(R.bonuses({cosmetic:key}).hp,0);
});
