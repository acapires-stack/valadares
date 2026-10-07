const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const R=require('../../equipment-rules');

const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const start=source.indexOf("if (msg.t === 'invEnchant') {");
const end=source.indexOf('// ─── N3 fase 2: Equip / Unequip',start);
assert.ok(start>0&&end>start,'real enchant dispatch exists');
const dispatch=source.slice(start,end);
function literalFunction(name){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,`${name} exists`);
    let depth=0;
    for(let i=source.indexOf('{',start);i<source.length;i++){
        if(source[i]==='{')depth++;
        if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
    }
    throw Error(`incomplete ${name}`);
}
function fixture({itemKey='ESPADA',gold=10000,essence=100,version=R.VERSION,saveFails=false}={}){
    const sent=[],opId=crypto.randomUUID();
    const p={authedName:'tester',inv:{[itemKey]:1,[R.MATERIAL]:essence},equipped:{},gold,
        enchantOps:[],enchantToken:opId,equipmentVersion:version,hp:100,maxHp:100,mp:10,maxMp:10};
    const acc={save:{inv:p.inv,equipped:p.equipped,gold:p.gold,enchantOps:[],enchantToken:opId}};
    let saveFailed=saveFails;
    const context=vm.createContext({crypto,equipmentRules:R,ENCHANTING_ENABLED:true,SAVE_CAPS:{invKeys:250},
        itemKeyFromMessage:value=>typeof value==='string'?value:null,
        itemMetaForKey:value=>({kind:R.parse(value).base==='ARMADURA'?'armor':'weapon'}),
        getUpgradeTier:R.parse,nearCraftService:()=>true,hasInv:(who,key,n)=>(who.inv[key]||0)>=n,
        enchantedIdExists:()=>false,getAccount:()=>acc,
        updateEnchantSave:who=>{Object.assign(acc.save,{inv:who.inv,equipped:who.equipped,gold:who.gold,
            enchantOps:who.enchantOps,enchantToken:who.enchantToken});return !saveFailed;},
        recomputeMaxStatsServer:()=>{},broadcastPstatsAll:()=>{},
        sendInvUpdate:(_p,data)=>{sent.push(data.enchant);return data;}});
    const invoke=vm.runInContext(`(function(msg,p){${dispatch}})`,context);
    const send=payload=>{invoke({t:'invEnchant',itemKey,slot:0,opId:p.enchantToken,...payload},p);return sent.at(-1);};
    return {p,acc,sent,send,setSaveFails:value=>{saveFailed=value}};
}

test('chosen attribute repeats across three slots at existing costs and receipt survives replay',()=>{
    const f=fixture(),costs=[500,1500,4000];
    let key='ESPADA',last;
    for(let slot=0;slot<3;slot++){
        const opId=f.p.enchantToken;
        const response=f.send({itemKey:key,slot,opId,affixCode:'b'});
        assert.equal(response.ok,true);
        assert.equal(response.cost.gold,costs[slot]);
        assert.equal(R.parse(response.newKey).affixes.length,slot+1);
        assert(R.parse(response.newKey).affixes.every(a=>a.code==='b'&&a.value>=3&&a.value<=7));
        key=response.newKey;last={response,itemKey:response.itemKey,slot,opId};
    }
    assert.equal(f.p.gold,4000);
    assert.equal(f.p.inv[R.MATERIAL],58);
    assert.equal(f.acc.save.gold,4000);
    assert.equal(f.acc.save.enchantOps.length,3);
    const replay=f.send({itemKey:last.itemKey,slot:last.slot,opId:last.opId,affixCode:'b'});
    assert.equal(replay.newKey,last.response.newKey);
    assert.equal(f.p.gold,4000);
    assert.equal(f.p.inv[R.MATERIAL],58);
    assert.equal(f.send({itemKey:last.itemKey,slot:last.slot,opId:last.opId,affixCode:'c'}).error,'op_conflict');
    assert.equal(f.p.gold,4000);
    const reconnected=fixture();
    reconnected.p.inv=f.acc.save.inv;
    reconnected.p.gold=f.acc.save.gold;
    reconnected.p.enchantOps=f.acc.save.enchantOps;
    reconnected.p.enchantToken=f.acc.save.enchantToken;
    assert.equal(reconnected.send({itemKey:last.itemKey,slot:last.slot,opId:last.opId,affixCode:'b'}).newKey,key);
    assert.equal(reconnected.p.gold,4000);
});

test('legacy random request and receipt remain valid, while invalid choice or old client cannot spend',()=>{
    const f=fixture();
    const old=f.send({});
    assert.equal(old.ok,true);
    assert.equal(R.parse(old.newKey).affixes.length,1);
    assert.equal(f.send({opId:old.opId}).newKey,old.newKey);
    assert.equal(f.send({opId:old.opId,affixCode:'b'}).error,'op_conflict');
    const oldReceipt=fixture();
    oldReceipt.p.enchantOps=[{opId:oldReceipt.p.enchantToken,result:{ok:true,opId:oldReceipt.p.enchantToken,itemKey:'ESPADA',slot:0,newKey:'legacy'}}];
    assert.equal(oldReceipt.send({}).newKey,'legacy');
    const invalid=fixture({itemKey:'ARMADURA'});
    const invalidToken=invalid.p.enchantToken;
    for(const affixCode of ['v','__proto__','constructor',null]){
        assert.equal(invalid.send({affixCode}).error,'invalid_choice');
        assert.equal(invalid.p.gold,10000);
        assert.equal(invalid.p.enchantToken,invalidToken);
    }
    const broke=fixture({gold:0});
    assert.equal(broke.send({affixCode:'b'}).error,'no_resources');
    assert.equal(broke.p.enchantOps.length,0);
    const stale=fixture({version:1});
    assert.equal(stale.send({affixCode:'b'}).error,'update_required');
    assert.equal(stale.p.gold,10000);
});

test('failed save rolls inventory, gold, token and receipt back; same operation may retry',()=>{
    const f=fixture({saveFails:true}),opId=f.p.enchantToken;
    assert.equal(f.send({affixCode:'v'}).error,'save_failed');
    assert.equal(f.p.gold,10000);
    assert.equal(f.p.inv.ESPADA,1);
    assert.equal(f.p.inv[R.MATERIAL],100);
    assert.equal(f.p.enchantToken,opId);
    assert.equal(f.p.enchantOps.length,0);
    assert.equal(f.acc.save.gold,10000);
    f.setSaveFails(false);
    assert.equal(f.send({affixCode:'v'}).ok,true);
    assert.equal(f.p.gold,9500);
    assert.equal(f.p.enchantOps.length,1);
});

test('server recovery uses real primary damage, equipment caps and one stats update',()=>{
    let broadcasts=0;
    const context=vm.createContext({equippedAffixes:p=>R.bonuses(p.equipped,()=> 'weapon'),
        broadcastPstatsAll:()=>broadcasts++});
    vm.runInContext(literalFunction('applyMobHitRecovery'),context);
    const recover=vm.runInContext('applyMobHitRecovery',context);
    const vKey=R.make('ESPADA',0,'012345abcdef',Array(3).fill({code:'v',value:3}));
    const gKey=R.make('ESPADA',0,'fedcba543210',Array(3).fill({code:'g',value:3}));
    const p={hp:50,maxHp:100,mp:1,maxMp:10,equipped:{weapon:vKey},permaBuffs:{lifesteal:0.15}};
    assert.deepEqual({...recover(p,5,true)},{hp:1,mp:0}); // 24% of 5 actual HP, not overkill
    assert.equal(p.hp,51);
    assert.equal(broadcasts,1);
    p.equipped.weapon=gKey;
    assert.deepEqual({...recover(p,2,true)},{hp:1,mp:9});
    assert.equal(p.mp,10);
    assert.equal(broadcasts,2);
    p.hp=50;p.mp=1;
    assert.deepEqual({...recover(p,100,false)},{hp:15,mp:0}); // spell/throw keeps talent only
    assert.equal(p.mp,1);
    assert.deepEqual({...recover(p,0,true)},{hp:0,mp:0});
    assert.equal(broadcasts,3);
    assert.equal((source.match(/applyMobHitRecovery\(p,/g)||[]).length,2); // definition + main hit
    assert.match(literalFunction('finalizeWeaponMobDeath'),/grantManaOnKill\(p\)/);
    assert.match(literalFunction('applyWeaponTechniqueSecondary'),/finalizeWeaponMobDeath\(m,p,p\.id\)/);
    vm.runInContext(literalFunction('grantManaOnKill'),context);
    const grantKill=vm.runInContext('grantManaOnKill',context);
    const kKey=R.make('ESPADA',0,'aabbccddeeff',[{code:'k',value:3}]);
    p.equipped={weapon:kKey,neck:kKey};p.mp=0;p.maxMp=20;
    grantKill(p);grantKill(p);
    assert.equal(p.mp,12); // existing mana-per-kill remains one grant per valid kill
});
