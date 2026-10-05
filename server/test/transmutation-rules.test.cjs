const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const rules = require('../../transmutation-rules');
const equipmentRules = require('../../equipment-rules');

const source = fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const metaStart=source.indexOf('const ITEM_META = {'),metaEnd=source.indexOf('\n};',metaStart)+3;
const itemMeta=vm.runInNewContext(source.slice(metaStart,metaEnd)+'\nITEM_META');
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
        itemMetaForKey:key=>itemMeta[equipmentRules.parse(key).base] || null,
        getUpgradeTier:equipmentRules.parse,enchantedIdExists:()=>false,
        hasInv:(player,key,qty)=>(player.inv[key]||0)>=qty});
    vm.runInContext(serverFunctions,context);
    const invoke=vm.runInContext(`(function(msg,p){${dispatch}})`,context);
    function send(msg){invoke(msg,p); return sent.at(-1);}
    function attempt(overrides={}){return send({t:'invTransmute',version:3,opId,keys,...overrides});}
    return {p,acc,opId,sent,send,attempt,context,fsFake};
}

test('shared table, whitelist, odds, weakest tier and browser UMD',()=>{
    assert.equal(rules.VERSION,3);
    for(const [key,tier] of [['ADAGA',1],['VARINHA_APRENDIZ',1],['ESPADA_OSSO',2],
        ['ESPADA_ACO',3],['ESPADA_DRACO',4],['ESPADA_GUARDIAO',5],['ESPADA_ETERNA',6],
        ['COROA_VALADARES',6],['CAJADO_ETERNO',6]])
        assert.equal(rules.tierOf(key),tier);
    for(const key of ['ADAGA_PLUS1','ESPADA_ETERNA_PLUS_1','ESPADA_INFINITA','COROA_CELESTIAL','CAJADO_ASTRAL',
        'ADAGA~abcdef012345','ESSENCIA_ARCANA','made-up'])
        assert.equal(rules.tierOf(key),0);
    for(const [keys,tier,cost,essence,chances] of [
        [['ADAGA','PORRETE','CLAVA'],1,120,1,[60,25,5,10]],
        [['MACA','ESPADA_OSSO','SABRE'],2,450,2,[55,25,10,10]],
        [['ESPADA_ACO','BESTA','MARRETA'],3,1500,4,[50,25,15,10]],
        [['ESPADA_DRACO','ELMO_DRACO','CAJADO_FOGO'],4,4500,6,[45,25,20,10]],
        [['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL'],5,12000,10,[40,25,30,5]],
        [['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO'],6,30000,15,[35,25,38,2]],
        [['ADAGA','MACA','ESPADA_ACO'],1,120,1,[70,25,5,0]],
    ]){
        const q=rules.quote(keys);
        assert.equal(q.valid,true); assert.equal(q.tier,tier); assert.equal(q.cost,cost);
        assert.equal(q.resultTier,tier+1);
        assert.equal(q.essenceQty,essence);
        assert.deepEqual(Object.values(q.chances),chances);
        assert.equal(Object.values(q.chances).reduce((a,b)=>a+b),100);
        if(tier===6) assert.deepEqual(q.pool,keys);
        else assert.ok(keys.every(k=>!q.pool.includes(k)));
        assert.equal(q.sameTier,chances[3]>0);
        assert.equal(q.superiorPool.length>0,q.sameTier);
        if(q.sameTier && tier<6) assert.ok(q.superiorPool.every(k=>rules.tierOf(k)===tier+1));
    }
    assert.deepEqual(rules.quote(['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL']).superiorPool,
        ['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO']);
    assert.deepEqual(rules.quote(['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO']).superiorPool,
        ['ESPADA_INFINITA','COROA_CELESTIAL','CAJADO_ASTRAL']);
    assert.equal(rules.quote(['ADAGA','ADAGA','CLAVA']).error,'duplicate_keys');
    assert.equal(rules.quote(['ADAGA','PORRETE','ESPADA_INFINITA']).error,'ineligible_item');
    const browser={};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','..','transmutation-rules.js'),'utf8'),browser);
    assert.equal(browser.ValadaresTransmutation.VERSION,3);
    assert.equal(browser.ValadaresTransmutation.quote(['ADAGA','MACA','ESPADA_ACO']).cost,120);
});

test('each approved input belongs to one progressing tier and every superior pool is valid',()=>{
    const expected=[
        ['ADAGA','PORRETE','CLAVA','ESPADA','LANCA','ARCO','ESCUDO_MAD','BOTAS','ELMO','COURO','VARINHA_APRENDIZ'],
        ['MACA','ESPADA_OSSO','SABRE','ADAGA_DUPLA','BORDAO','LANCA_LONGA','ARCO_CACA','ESCUDO_OSSO','ESCUDO_FERRO','ARMADURA','BOTAS_COURO','ELMO_CHIFRES','MACHADO','ESPADA_LONGA','MARTELO'],
        ['ESPADA_ACO','BESTA','MARRETA','MACA_GIGANTE','MACHADO_MINO','ARMADURA_OSSO','ESCUDO_PEDRA','BOTAS_RAPIDA'],
        ['LAMINA_DRACO_1H','ESPADA_DRACO','MARTELO_GOLEM','ARMADURA_ESCAMA','ELMO_DRACO','BOTAS_VENTO','CAJADO_FOGO','CAJADO_GELO','CAJADO_RAIO'],
        ['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL','ARMADURA_TRONO','COROA_VENDEDOR','CAJADO_RUNICO'],
        ['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO'],
    ];
    assert.equal(new Set(expected.flat()).size,expected.flat().length);
    for(let tier=1;tier<=6;tier++){
        const keys=expected[tier-1];
        for(const key of keys){assert.equal(rules.tierOf(key),tier);assert.ok(itemMeta[key]);}
        const q=rules.quote(keys.slice(0,3));
        if(tier===6) assert.deepEqual(q.pool,keys);
        else assert.deepEqual([...q.pool,...keys.slice(0,3)].sort(),keys.slice().sort());
        const next=tier<6 ? expected[tier] : ['ESPADA_INFINITA','COROA_CELESTIAL','CAJADO_ASTRAL'];
        assert.deepEqual(q.superiorPool,next);
        assert.ok(next.every(key=>itemMeta[key]));
    }
});

test('real dispatch grants all four categories at exact boundaries and persists before ACK',()=>{
    for(const [roll,category,qty] of [[0,'material',1],[0.60,'plain',1],[0.85,'enchanted',1],[0.90,'superior',1]]){
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
        else if(category==='enchanted') {
            const parsed=equipmentRules.parse(msg.transmutation.newKey);
            assert.equal(parsed.enchanted,true); assert.equal(parsed.affixes.length,1);
        } else {
            assert.equal(msg.transmutation.resultTier,2);
            assert.equal(msg.transmutation.newKey,rules.quote(['ADAGA','PORRETE','CLAVA']).superiorPool[0]);
            assert.equal(equipmentRules.parse(msg.transmutation.newKey).enchanted,false);
        }
    }
});

test('all six tiers honor four category thresholds in the server handler',()=>{
    const inputSets=[['ADAGA','PORRETE','CLAVA'],['MACA','ESPADA_OSSO','SABRE'],
        ['ESPADA_ACO','BESTA','MARRETA'],['ESPADA_DRACO','ELMO_DRACO','CAJADO_FOGO'],
        ['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL'],
        ['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO']];
    for(const keys of inputSets){
        const q=rules.quote(keys);
        const {material,plain,enchanted}=q.chances;
        for(const [percent,expected] of [[0,'material'],[material,'plain'],
            [material+plain,'enchanted'],[material+plain+enchanted,'superior']]){
            const f=fixture({keys,gold:40000,rolls:[percent/100,0]});
            const receipt=f.attempt().transmutation;
            assert.equal(receipt.ok,true,`${q.tier} ${expected}`);
            assert.equal(receipt.category,expected,`${q.tier} ${percent}`);
            if(expected==='superior') assert.equal(receipt.resultTier,q.resultTier);
        }
    }
});

test('server applies weakest-input tier cost and material yield; consumed slots free capacity',()=>{
    for(const [keys,cost,qty] of [
        [['ADAGA','MACA','ESPADA_ACO'],120,1],
        [['MACA','ESPADA_OSSO','SABRE'],450,2],
        [['ESPADA_ACO','BESTA','MARRETA'],1500,4],
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

test('mixed tiers transfer superior probability to material, while tier five promotes to base mythic',()=>{
    const mixedKeys=['ADAGA','MACA','ESPADA_ACO'];
    const mixed=fixture({keys:mixedKeys,rolls:[0.99,0]});
    const mixedResult=mixed.attempt().transmutation;
    assert.equal(rules.quote(mixedKeys).chances.superior,0);
    assert.equal(mixedResult.category,'enchanted');
    assert.equal(rules.tierOf(equipmentRules.parse(mixedResult.newKey).base),1);

    const keys=['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL'];
    const q=rules.quote(keys);
    for(let i=0;i<q.superiorPool.length;i++){
        const f=fixture({keys,gold:20000,rolls:[0.999,(i+0.5)/q.superiorPool.length]});
        const result=f.attempt().transmutation;
        assert.equal(result.ok,true);
        assert.equal(result.category,'superior');
        assert.equal(result.resultTier,6);
        assert.equal(result.newKey,q.superiorPool[i]);
        assert.equal(equipmentRules.parse(result.newKey).enchanted,false);
        assert.equal(rules.tierOf(result.newKey),6);
        assert.equal(f.p.gold,8000);
    }
});

test('tier six consumes three distinct mythics and returns only one normal prize',()=>{
    const keys=['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO'];
    const q=rules.quote(keys);
    assert.deepEqual(q.pool,keys);
    const equipped=fixture({keys,gold:40000});
    equipped.p.equipped.weapon='ESPADA_ETERNA_PLUS_1';
    assert.equal(equipped.attempt().transmutation.error,'equipped_input');
    assert.equal(equipped.p.gold,40000);
    assert.equal(rules.quote(['ESPADA_ETERNA_PLUS_1','COROA_VALADARES','CAJADO_ETERNO']).error,'ineligible_item');
    const enchanted=equipmentRules.make('ESPADA_ETERNA',0,'abcdef012345',equipmentRules.roll('weapon',[],0));
    assert.equal(rules.quote([enchanted,'COROA_VALADARES','CAJADO_ETERNO']).error,'ineligible_item');
    for(let i=0;i<3;i++){
        const f=fixture({keys,gold:40000,rolls:[0.35,(i+0.5)/3],cap:1});
        const receipt=f.attempt().transmutation;
        assert.equal(receipt.ok,true);
        assert.equal(receipt.category,'plain');
        assert.equal(receipt.newKey,keys[i]);
        assert.equal(receipt.cost,30000);
        assert.equal(f.p.gold,10000);
        assert.equal(Object.values(f.p.inv).reduce((a,b)=>a+b),1);
        assert.deepEqual(Object.keys(f.p.inv),[keys[i]]);
        assert.equal(f.acc.save.inv[keys[i]],1);
        const duplicate=f.attempt().transmutation;
        assert.deepEqual(duplicate,receipt);
        assert.equal(f.p.gold,10000);
    }
    for(let i=0;i<3;i++){
        const f=fixture({keys,gold:40000,rolls:[0.999,(i+0.5)/3]});
        const receipt=f.attempt().transmutation;
        assert.equal(receipt.category,'superior');
        assert.equal(receipt.resultTier,7);
        assert.equal(receipt.newKey,q.superiorPool[i]);
        assert.equal(rules.tierOf(receipt.newKey),0);
    }
});

test('new transcendent equipment is recognized by real server stats, skills, forging and combat',()=>{
    const skillStart=source.indexOf('const WEAPON_SKILL = {');
    const skillEnd=source.indexOf('\n};',skillStart)+3;
    const context=vm.createContext({equipmentRules,console,itemMeta,Math,
        getUpgradeTier:equipmentRules.parse,
        equippedAffixes:()=>({def:0,critDamage:0}),
        srvUpgradeBonusArmor:()=>null});
    vm.runInContext(`const ITEM_META = itemMeta;\n${source.slice(skillStart,skillEnd)}\n`+
        ['itemMetaForKey','itemGoldCost','sellPriceFor','weaponSkillOf','weaponRangeServer',
            'wandBaseServer','totalDefenseServer','pvpDamageCapServer','attackDamageCapServer']
            .map(literalFunction).join('\n')+
        '\nconst FORGE_ATTACK_BONUS_SERVER=[0,1,2,3,5,7];',context);
    for(const [key,kind,base,def,skill] of [
        ['ESPADA_INFINITA','weapon',36,14,'Espada'],
        ['COROA_CELESTIAL','head',undefined,24,null],
        ['CAJADO_ASTRAL','wand',36,7,'Magia'],
    ]){
        const meta=context.itemMetaForKey(key);
        assert.equal(meta.kind,kind);assert.equal(meta.base,base);assert.equal(meta.def,def);
        assert.ok(context.itemGoldCost(key)>0);assert.ok(context.sellPriceFor(key)>0);
        const upgraded=equipmentRules.upgrade(key,1);
        assert.equal(context.itemMetaForKey(upgraded).kind,kind);
        if(skill){
            const p={equipped:{weapon:key},skills:{[skill]:{val:100},'Distância':{val:100}}};
            assert.equal(context.weaponSkillOf(p),skill);
            assert.ok(context.attackDamageCapServer(p,null)>100);
            assert.ok(context.pvpDamageCapServer(p)>100);
            if(kind==='wand'){assert.equal(context.weaponRangeServer(p),6);assert.equal(context.wandBaseServer(p),36);}
            else assert.equal(context.weaponRangeServer(p),1);
        } else assert.equal(context.totalDefenseServer({equipped:{head:key}}),24);
    }
});

test('version-one and version-two receipts remain queryable; unexecuted old versions cannot roll',()=>{
    const f=fixture();
    const historical={ok:true,opId:f.opId,keys:['ADAGA','PORRETE','CLAVA'],cost:120,
        tier:1,category:'material',newKey:'ESSENCIA_ARCANA',qty:1};
    const secondId=crypto.randomUUID(), historicalV2={...historical,opId:secondId};
    f.p.transmutationOps=[
        {opId:f.opId,request:{version:1,keys:historical.keys},result:historical},
        {opId:secondId,request:{version:2,keys:historical.keys},result:historicalV2},
    ];
    f.p.transmutationToken=crypto.randomUUID();
    assert.deepEqual(f.send({t:'transmuteStatus',opId:f.opId}).transmutation,historical);
    assert.deepEqual(f.send({t:'transmuteStatus',opId:secondId}).transmutation,historicalV2);
    assert.deepEqual(f.attempt({version:1}).transmutation,historical);
    assert.deepEqual(f.attempt({version:2,opId:secondId}).transmutation,historicalV2);
    assert.equal(f.p.gold,2000);
    for(const version of [1,2]){
        const fresh=fixture();
        fresh.context.Math.random=()=>{throw Error('legacy request must not roll');};
        assert.equal(fresh.attempt({version}).transmutation.error,'update_required');
        assert.equal(fresh.p.gold,2000);
        assert.equal(fresh.p.transmutationToken,fresh.opId);
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
    assert.deepEqual(next.send({t:'invTransmute',version:3,opId:f.opId,keys:['ADAGA','PORRETE','CLAVA']}).transmutation,first);
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
    assert.equal(f.attempt({keys:['ADAGA','PORRETE','ESPADA_INFINITA']}).transmutation.error,'ineligible_item');
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
    for(const rolls of [[0],[0.60],[0.85],[0.90]]){
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
    assert.deepEqual(restarted.send({t:'invTransmute',opId:f.opId,version:3,keys:['ADAGA','PORRETE','CLAVA']}).transmutation,receipt);
    assert.equal(restarted.p.gold,1880);
    const mythics=['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO'];
    const sixth=fixture({keys:mythics,gold:40000,rolls:[0.35,0]});
    sixth.context.fs=fs;sixth.context.ACCOUNTS_FILE=file;
    const sixthReceipt=sixth.attempt().transmutation;
    const savedSixth=JSON.parse(fs.readFileSync(file,'utf8')).accounts[0].save;
    assert.equal(savedSixth.gold,10000);
    assert.deepEqual(Object.keys(savedSixth.inv),['ESPADA_ETERNA']);
    const resumed=fixture({keys:mythics,gold:40000});
    Object.assign(resumed.p,savedSixth);
    assert.deepEqual(resumed.send({t:'transmuteStatus',opId:sixth.opId}).transmutation,sixthReceipt);
    assert.deepEqual(resumed.send({t:'invTransmute',opId:sixth.opId,version:3,keys:mythics}).transmutation,sixthReceipt);
    assert.equal(resumed.p.gold,10000);
});

test('enchanted results are compatible with every real output equipment kind',()=>{
    const begin=source.indexOf('const ITEM_META = {'),end=source.indexOf('\n};',begin)+3;
    const meta=vm.runInNewContext(source.slice(begin,end)+'\nITEM_META');
    for(const keys of [['ADAGA','PORRETE','CLAVA'],['MACA','ESPADA_OSSO','SABRE'],
        ['ESPADA_ACO','BESTA','MARRETA'],['ESPADA_DRACO','ELMO_DRACO','CAJADO_FOGO'],
        ['ESPADA_GUARDIAO','ESCUDO_GUARDIAO','ESPADA_HL'],
        ['ESPADA_ETERNA','COROA_VALADARES','CAJADO_ETERNO']]){
        const pool=rules.quote(keys).pool;
        for(let i=0;i<pool.length;i++){
            const q=rules.quote(keys);
            const f=fixture({keys,gold:40000,rolls:[(q.chances.material+q.chances.plain+0.5*q.chances.enchanted)/100,(i+0.5)/pool.length]});
            f.context.itemMetaForKey=key=>meta[equipmentRules.parse(key).base];
            const receipt=f.attempt().transmutation;
            assert.equal(receipt.ok,true);assert.equal(equipmentRules.parse(receipt.newKey).base,pool[i]);
            assert.ok(equipmentRules.validFor(receipt.newKey,meta[pool[i]].kind));
        }
    }
});
