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
function fixture({itemKey='ESPADA',gold=10000,essence=100,version=R.VERSION,saveFails=false,rolls=[]}={}){
    const sent=[],opId=crypto.randomUUID();
    const p={authedName:'tester',inv:{[itemKey]:1,[R.MATERIAL]:essence},equipped:{},gold,
        enchantOps:[],enchantToken:opId,equipmentVersion:version,hp:100,maxHp:100,mp:10,maxMp:10};
    const acc={save:{inv:p.inv,equipped:p.equipped,gold:p.gold,enchantOps:[],enchantToken:opId}};
    let saveFailed=saveFails;
    const equipmentRules={...R,roll:(kind,existing,slot)=>R.roll(kind,existing,slot,()=>rolls.length?rolls.shift():0.5)};
    const context=vm.createContext({crypto,equipmentRules,ENCHANTING_ENABLED:true,SAVE_CAPS:{invKeys:250},
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

test('random type and value repeat across three slots at existing costs; receipt survives restart',()=>{
    const f=fixture(),costs=[500,1500,4000];
    let key='ESPADA',last;
    for(let slot=0;slot<3;slot++){
        const opId=f.p.enchantToken;
        const response=f.send({itemKey:key,slot,opId});
        assert.equal(response.ok,true);
        assert.equal(response.cost.gold,costs[slot]);
        assert.equal(R.parse(response.newKey).affixes.length,slot+1);
        assert(R.parse(response.newKey).affixes.every(a=>a.code==='b'&&a.value===5));
        key=response.newKey;last={response,itemKey:response.itemKey,slot,opId};
    }
    assert.equal(f.p.gold,4000);
    assert.equal(f.p.inv[R.MATERIAL],58);
    assert.equal(f.acc.save.gold,4000);
    assert.equal(f.acc.save.enchantOps.length,3);
    const replay=f.send({itemKey:last.itemKey,slot:last.slot,opId:last.opId});
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
    assert.equal(reconnected.send({itemKey:last.itemKey,slot:last.slot,opId:last.opId}).newKey,key);
    assert.equal(reconnected.p.gold,4000);
});

test('old choice receipts remain idempotent; unexecuted choice is refused without cost',()=>{
    const f=fixture();
    const opId=f.p.enchantToken,priorKey=R.make('ESPADA',0,'abcdef123456',[{code:'v',value:3}]);
    const prior={ok:true,opId,itemKey:'ESPADA',slot:0,newKey:priorKey,cost:R.cost(0,false)};
    f.p.enchantOps=[{opId,request:JSON.stringify(['ESPADA',0,'v']),result:prior}];
    assert.equal(f.send({affixCode:'v'}).newKey,priorKey);
    assert.equal(f.send({}).error,'op_conflict');
    assert.equal(f.p.gold,10000);
    const reconnected=fixture();
    reconnected.p.enchantOps=structuredClone(f.p.enchantOps);
    reconnected.p.enchantToken=crypto.randomUUID();
    assert.equal(reconnected.send({opId,affixCode:'v'}).newKey,priorKey);
    assert.equal(reconnected.p.gold,10000);
    assert.deepEqual(R.parse(priorKey).affixes,[{code:'v',value:3}]);
    const pending=fixture({gold:0});
    const pendingToken=pending.p.enchantToken;
    for(const affixCode of ['v','__proto__','constructor',null]){
        assert.equal(pending.send({affixCode}).error,'choice_removed');
        assert.equal(pending.p.gold,0);
        assert.equal(pending.p.inv[R.MATERIAL],100);
        assert.equal(pending.p.enchantToken,pendingToken);
        assert.equal(pending.p.enchantOps.length,0);
    }
    const broke=fixture({gold:0});
    assert.equal(broke.send({}).error,'no_resources');
    assert.equal(broke.p.enchantOps.length,0);
    const stale=fixture({version:1});
    assert.equal(stale.send({}).error,'update_required');
    assert.equal(stale.p.gold,10000);
});

test('failed save rolls inventory, gold, token and receipt back; same operation may retry',()=>{
    const f=fixture({saveFails:true}),opId=f.p.enchantToken;
    assert.equal(f.send({}).error,'save_failed');
    assert.equal(f.p.gold,10000);
    assert.equal(f.p.inv.ESPADA,1);
    assert.equal(f.p.inv[R.MATERIAL],100);
    assert.equal(f.p.enchantToken,opId);
    assert.equal(f.p.enchantOps.length,0);
    assert.equal(f.acc.save.gold,10000);
    f.setSaveFails(false);
    assert.equal(f.send({}).ok,true);
    assert.equal(f.p.gold,9500);
    assert.equal(f.p.enchantOps.length,1);
});

test('old client pending choice checks exact receipt, clears rejection, then sends random retry',()=>{
    const opId=crypto.randomUUID(),storageKey='valadares:enchantPending:tester';
    const storage=new Map([[storageKey,JSON.stringify({itemKey:'ESPADA',slot:0,opId,affixCode:'v'})]]);
    const messages=[],handlers={};
    const itemSelect={addEventListener(){},focus(){}};
    const panel={scrollTop:0,style:{display:'block'},addEventListener:(event,fn)=>{handlers[event]=fn},
        querySelector:selector=>selector==='#enchantItem'?itemSelect:null,innerHTML:''};
    const context={ValadaresEquipment:R,I18N:{pt:{},en:{}},LANG:'pt',
        player:{name:'tester',inv:{ESPADA:1,[R.MATERIAL]:100},equipped:{weapon:null},gold:10000},
        ITEMS:{ESPADA:{kind:'weapon'}},itmName:key=>key,getItemIconURL:()=>'',escapeHtml:value=>String(value),
        localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
        document:{activeElement:null,getElementById:id=>id==='enchantPanel'?panel:id==='craftGoldLabel'?{}:{style:{display:'none'}}},
        window:{equipmentServerVersion:R.VERSION,enchantingEnabled:true,enchantToken:opId},
        ws:{readyState:1,send:value=>messages.push(JSON.parse(value))},_wsAuthed:true,atCraft:()=>true,
        setTimeout:()=>1,clearTimeout:()=>{},requestAnimationFrame:()=>{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','..','enchanting-ui.js'),'utf8'),context);
    const ui=context.window.ValadaresEnchantUI;
    ui.render();
    handlers.click({target:{closest:selector=>selector==='[data-enchant-retry]'?{}:null}});
    assert.equal(messages.length,1);
    assert.equal(messages[0].affixCode,'v');
    ui.handleResult({ok:false,error:'choice_removed',opId});
    assert.equal(storage.has(storageKey),false);
    ui.attempt(0);
    assert.equal(messages.length,2);
    assert.equal(Object.hasOwn(messages[1],'affixCode'),false);
    assert.equal(JSON.parse(storage.get(storageKey)).affixCode,undefined);
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
