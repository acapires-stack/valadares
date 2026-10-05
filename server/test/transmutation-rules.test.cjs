const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const rules = require('../../transmutation-rules');
const equipmentRules = require('../../equipment-rules');

const source = fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
function literalFunction(name){
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} present`);
    let i = source.indexOf('{',start), depth = 0;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start,i+1);
    }
    throw Error(`incomplete ${name}`);
}
const serverFunctions = ['flushAccounts','updateEnchantSave','transmutationOpId',
    'transmutationStatusResult','executeTransmutation','sendInvUpdate'].map(literalFunction).join('\n');
const dispatchStart = source.indexOf("if (msg.t === 'transmuteStatus')");
const dispatchEnd = source.indexOf("if (msg.t === 'invEnchant')",dispatchStart);
assert.ok(dispatchStart > 0 && dispatchEnd > dispatchStart);
const dispatch = source.slice(dispatchStart,dispatchEnd);

function fixture({keys=['ADAGA','PORRETE','CLAVA'],gold=2000,rolls=[0],cap=250,saveFails=false,
    equipmentVersion=equipmentRules.VERSION,extraInv={}}={}){
    const opId=crypto.randomUUID();
    const sent=[];
    const p={authedName:'tester',inv:{...Object.fromEntries(keys.map(k=>[k,1])),...extraInv},
        gold,equipped:{},transmutationOps:[],transmutationToken:opId,
        enchantOps:[],enchantToken:crypto.randomUUID(),x:51,y:52,floor:0,hp:10,
        equipmentVersion,ws:{readyState:1,send:s=>sent.push(JSON.parse(s))}};
    const acc={save:{inv:p.inv,gold:p.gold,transmutationOps:[],transmutationToken:opId},savedAt:1};
    const accounts=new Map([['tester',acc]]);
    const fsFake={writeFileSync(){if(saveFails) throw Error('disk full');},renameSync(){}};
    const random=Math; const math=Object.create(random);
    math.random=()=>rolls.length ? rolls.shift() : 0;
    const context=vm.createContext({Math:math,crypto,console:{warn(){},error(){}},
        fs:fsFake,accounts,ACCOUNTS_FILE:'isolated-accounts.json',
        ACCOUNTS_BACKUP_INTERVAL_MS:Infinity,_lastAccountsBackupAt:0,
        _diskAccountsCount:()=>0,backupAccountsFile(){},getAccount:n=>accounts.get(n),
        transmutationRules:rules,equipmentRules,SAVE_CAPS:{invKeys:cap},
        chebyshev:(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by)),
        itemMetaForKey:key=>rules.tierOf(key) ? {kind:'weapon'} : null,
        getUpgradeTier:equipmentRules.parse,enchantedIdExists:()=>false,
        hasInv:(player,key,qty)=>(player.inv[key]||0)>=qty});
    vm.runInContext(serverFunctions,context);
    const invoke=vm.runInContext(`(function(msg,p){${dispatch}})`,context);
    function send(msg){invoke(msg,p); return sent.at(-1);}
    function attempt(overrides={}){return send({t:'invTransmute',version:1,opId,keys,...overrides});}
    return {p,acc,opId,sent,send,attempt,context,fsFake};
}

test('shared table, whitelist, odds, weakest tier and browser UMD',()=>{
    assert.equal(rules.VERSION,1);
    assert.equal(rules.tierOf('ADAGA'),1);
    assert.equal(rules.tierOf('ESPADA_LONGA'),2);
    assert.equal(rules.tierOf('ESPADA_OSSO'),3);
    for(const key of ['ADAGA_PLUS1','ESPADA_DRACO','ADAGA~abcdef012345','ESSENCIA_ARCANA','made-up'])
        assert.equal(rules.tierOf(key),0);
    for(const [keys,tier,cost,essence,chances] of [
        [['ADAGA','PORRETE','CLAVA'],1,120,1,[70,25,5]],
        [['MACA','ESPADA_LONGA','MACHADO'],2,450,2,[65,28,7]],
        [['ESPADA_OSSO','ESCUDO_OSSO','ARMADURA_OSSO'],3,1000,3,[60,30,10]],
        [['ADAGA','MACA','ESPADA_OSSO'],1,120,1,[70,25,5]],
    ]){
        const q=rules.quote(keys);
        assert.equal(q.valid,true); assert.equal(q.tier,tier); assert.equal(q.cost,cost);
        assert.equal(q.essenceQty,essence);
        assert.deepEqual(Object.values(q.chances),chances);
        assert.equal(Object.values(q.chances).reduce((a,b)=>a+b),100);
        assert.ok(keys.every(k=>!q.pool.includes(k)));
    }
    assert.equal(rules.quote(['ADAGA','ADAGA','CLAVA']).error,'duplicate_keys');
    assert.equal(rules.quote(['ADAGA','PORRETE','ESPADA_DRACO']).error,'ineligible_item');
    const browser={};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','..','transmutation-rules.js'),'utf8'),browser);
    assert.equal(browser.ValadaresTransmutation.VERSION,1);
    assert.equal(browser.ValadaresTransmutation.quote(['ADAGA','MACA','ESPADA_OSSO']).cost,120);
});

test('real dispatch grants material, plain, enchanted at category boundaries and persists before ACK',()=>{
    for(const [roll,category,qty] of [[0,'material',1],[0.70,'plain',1],[0.95,'enchanted',1]]){
        const f=fixture({rolls:[roll,0]});
        const msg=f.attempt();
        assert.equal(msg.t,'invUpdate');
        assert.equal(msg.transmutation.ok,true);
        assert.equal(msg.transmutation.category,category);
        assert.equal(msg.transmutation.qty,qty);
        assert.equal(f.acc.save.gold,1880);
        assert.equal(f.acc.save.transmutationToken,msg.transmutationToken);
        assert.equal(f.acc.save.transmutationOps[0].result.newKey,msg.transmutation.newKey);
        assert.equal(f.p.inv.ADAGA,undefined);
        if(category==='material') assert.equal(f.p.inv.ESSENCIA_ARCANA,1);
        else if(category==='plain') assert.equal(msg.transmutation.newKey,rules.quote(['ADAGA','PORRETE','CLAVA']).pool[0]);
        else {
            const parsed=equipmentRules.parse(msg.transmutation.newKey);
            assert.equal(parsed.enchanted,true); assert.equal(parsed.affixes.length,1);
        }
    }
});

test('server applies weakest-input tier cost and material yield; consumed slots free capacity',()=>{
    for(const [keys,cost,qty] of [
        [['ADAGA','MACA','ESPADA_OSSO'],120,1],
        [['MACA','ESPADA_LONGA','MACHADO'],450,2],
        [['ESPADA_OSSO','ESCUDO_OSSO','ARMADURA_OSSO'],1000,3],
    ]){
        const f=fixture({keys,rolls:[0],cap:1});
        const result=f.attempt().transmutation;
        assert.equal(result.ok,true);
        assert.equal(result.cost,cost);
        assert.equal(result.qty,qty);
        assert.equal(f.p.gold,2000-cost);
        assert.equal(Object.keys(f.p.inv).length,1);
    }
});

test('duplicates, conflicting payload, stale token and read-only status never charge twice',()=>{
    const f=fixture();
    const first=f.attempt().transmutation;
    const gold=f.p.gold, token=f.p.transmutationToken;
    assert.deepEqual(f.attempt().transmutation,first);
    assert.equal(f.p.gold,gold); assert.equal(f.p.transmutationToken,token);
    assert.equal(f.attempt({keys:['CLAVA','PORRETE','ADAGA']}).transmutation.error,'op_conflict');
    assert.equal(f.attempt({opId:crypto.randomUUID()}).transmutation.error,'stale_op');
    assert.deepEqual(f.send({t:'transmuteStatus',opId:f.opId}).transmutation,first);
    assert.equal(f.send({t:'transmuteStatus',opId:crypto.randomUUID()}).transmutation.error,'not_found');
    assert.equal(f.p.gold,gold); assert.equal(f.p.transmutationToken,token);
    // Reconnect: the cached receipt and next token are reconstructed from persisted save.
    const next=fixture();
    next.p.inv=f.acc.save.inv; next.p.gold=f.acc.save.gold;
    next.p.transmutationOps=f.acc.save.transmutationOps;
    next.p.transmutationToken=f.acc.save.transmutationToken;
    assert.deepEqual(next.send({t:'invTransmute',version:1,opId:f.opId,keys:['ADAGA','PORRETE','CLAVA']}).transmutation,first);
    assert.equal(next.p.gold,gold);
});

test('invalid inputs, location, funds, equipped base, capacity and equipment version reject without mutation',()=>{
    for(const [opts,change,error] of [
        [{},f=>{},null],
        [{gold:119},f=>{},'no_gold'],
        [{},f=>{f.p.floor=1;},'not_at_bench'],
        [{},f=>{f.p.equipped.weapon='ADAGA';},'equipped_input'],
        [{},f=>{delete f.p.inv.ADAGA;},'no_items'],
        [{cap:0},f=>{},'inventory_full'],
        [{rolls:[0.99],equipmentVersion:0},f=>{},'update_required'],
    ]){
        const f=fixture(opts); change(f);
        const before=f.p.gold;
        const result=f.attempt().transmutation;
        if(error===null) assert.equal(result.ok,true);
        else {assert.equal(result.error,error); assert.equal(f.p.gold,before); assert.equal(f.p.transmutationToken,f.opId);}
    }
    const f=fixture();
    assert.equal(f.attempt({version:2}).transmutation.error,'update_required');
    assert.equal(f.attempt({keys:['ADAGA','ADAGA','CLAVA']}).transmutation.error,'duplicate_keys');
    assert.equal(f.attempt({keys:['ADAGA','PORRETE','ESPADA_DRACO']}).transmutation.error,'ineligible_item');
});

test('real save mutation is rolled back after a failed atomic write',()=>{
    const f=fixture({saveFails:true});
    const before=JSON.parse(JSON.stringify(f.acc.save));
    const savedAt=f.acc.savedAt;
    const result=f.attempt().transmutation;
    assert.equal(result.error,'save_failed');
    assert.deepEqual(JSON.parse(JSON.stringify(f.acc.save)),before);
    assert.equal(f.acc.savedAt,savedAt);
    assert.equal(f.p.gold,2000);
    assert.equal(f.p.transmutationToken,f.opId);
    assert.equal(f.p.transmutationOps.length,0);
    f.context.fs.writeFileSync=()=>{};
    assert.equal(f.attempt().transmutation.ok,true);
});

test('capacity and client compatibility are checked before rolling, without conditional free rerolls',()=>{
    for(const rolls of [[0],[0.70],[0.99]]){
        const f=fixture({rolls,cap:4,extraInv:{ADAGA:2,PORRETE:2,CLAVA:2,ESSENCIA_ARCANA:1}});
        let rolled=false;f.context.Math.random=()=>{rolled=true;return 0;};
        assert.equal(f.attempt().transmutation.error,'inventory_full');
        assert.equal(rolled,false);assert.equal(f.p.gold,2000);
    }
    const old=fixture({equipmentVersion:0});
    old.context.Math.random=()=>{throw Error('must reject before rolling');};
    assert.equal(old.attempt().transmutation.error,'update_required');
});

test('atomic file persists receipt and consumed inventory for a fresh process state',()=>{
    const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'valadares-transmutation-'));
    const file=path.join(dir,'accounts.json');
    const f=fixture();f.context.fs=fs;f.context.ACCOUNTS_FILE=file;
    const receipt=f.attempt().transmutation;
    const saved=JSON.parse(fs.readFileSync(file,'utf8')).accounts[0].save;
    assert.equal(saved.gold,1880);assert.equal(saved.inv.ADAGA,undefined);
    assert.equal(saved.inv.ESSENCIA_ARCANA,1);
    const restarted=fixture();
    Object.assign(restarted.p,saved);
    assert.deepEqual(restarted.send({t:'transmuteStatus',opId:f.opId}).transmutation,receipt);
    assert.deepEqual(restarted.send({t:'invTransmute',opId:f.opId,version:1,keys:['ADAGA','PORRETE','CLAVA']}).transmutation,receipt);
    assert.equal(restarted.p.gold,1880);
});

test('enchanted results are compatible with every real output equipment kind',()=>{
    const begin=source.indexOf('const ITEM_META = {'),end=source.indexOf('\n};',begin)+3;
    const meta=vm.runInNewContext(source.slice(begin,end)+'\nITEM_META');
    for(const keys of [['ADAGA','PORRETE','CLAVA'],['MACA','ESPADA_LONGA','MACHADO'],['ESPADA_OSSO','ESCUDO_OSSO','ARMADURA_OSSO']]){
        const pool=rules.quote(keys).pool;
        for(let i=0;i<pool.length;i++){
            const f=fixture({keys,rolls:[0.999,(i+0.5)/pool.length]});
            f.context.itemMetaForKey=key=>meta[equipmentRules.parse(key).base];
            const receipt=f.attempt().transmutation;
            assert.equal(receipt.ok,true);assert.equal(equipmentRules.parse(receipt.newKey).base,pool[i]);
            assert.ok(equipmentRules.validFor(receipt.newKey,meta[pool[i]].kind));
        }
    }
});
