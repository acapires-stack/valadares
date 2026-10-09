const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(repo,'server/server.js'),'utf8');
const progression=require(path.join(repo,'progression-content'));
const rules=require(path.join(repo,'transmutation-rules'));
function fn(name){
    const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);
    let i=source.indexOf('{',start),depth=0;
    for(;i<source.length;i++){
        if(source[i]==='{')depth++;
        else if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
    }
    throw Error(name);
}
function fixture({full=false,fail=false}={}){
    const sent=[],monsters=new Map(),dungeonFloors=new Map(),interiorsByFloor=new Map();let mobId=1;
    const acc={save:{},savedAt:1};
    const p={id:1,name:'Tester',authedName:'Tester',floor:0,x:78,y:22,hp:500,pvp:true,
        ws:{readyState:1,send:s=>sent.push(JSON.parse(s))},inv:{},gold:50000,
        progressionToken:crypto.randomUUID(),progressionOps:[],expeditionClears:0,equipmentVersion:1,
        skills:{Machado:{val:20,xp:0,xpNext:1000}},equipped:{weapon:'MACHADO_MINO'}};
    if(full)for(let i=0;i<250;i++)p.inv['OTHER_'+i]=1;
    const players=new Map([[1,p]]);
    const context=vm.createContext({crypto,progression,equipmentRules:{VERSION:1},PROGRESSION_ENABLED:true,Date,
        SAVE_CAPS:{invKeys:250,itemQty:9999},players,monsters,dungeonFloors,interiorsByFloor,
        getAccount:()=>acc,chebyshev:(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by)),
        isAdjacentTo:(p,npc)=>Math.max(Math.abs(p.x-npc.x),Math.abs(p.y-npc.y))<=1,
        QUEST_NPCS:{atendente:{x:50,y:50}},
        QUESTS_BY_ID:{q_ratos:{id:'q_ratos',goal:{kind:'mob',type:'RAT',count:10},
            reward:{gold:50,xp:{Clava:100},item:{PORRETE:1}}},
            q_cobras:{id:'q_cobras',goal:{kind:'mob',type:'SNAKE',count:5},reward:{gold:80}}},
        incInv:(p,k,q)=>{p.inv[k]=(p.inv[k]||0)+q;if(p.inv[k]<=0)delete p.inv[k];},
        applyQuestReward:(p,reward)=>{
            p.gold+=reward.gold;
            for(const [k,q] of Object.entries(reward.item||{}))p.inv[k]=(p.inv[k]||0)+q;
            return {gold:reward.gold,items:reward.item,xp:reward.xp};
        },
        transmutationOpId:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v)?v:null,
        hasInv:(p,k,q)=>(p.inv[k]||0)>=q,
        updateEnchantSave:p=>{
            if(fail)return false;
            acc.save={...acc.save,inv:{...p.inv},gold:p.gold,
                quests:structuredClone(p.quests||{}),skills:structuredClone(p.skills||{}),
                progressionToken:p.progressionToken,
                progressionOps:structuredClone(p.progressionOps),expeditionClears:p.expeditionClears,
                expeditionPending:p.expeditionPending};
            acc.savedAt=Date.now();return true;
        },
        sendTo:(id,msg)=>sent.push(msg),sendInvUpdate:(p,msg)=>sent.push({t:'invUpdate',...msg}),
        noteEngagement:()=>{},
        broadcast:()=>{},snapshotMobs:f=>[...monsters.values()].filter(m=>m.floor===f),
        genArenaGrid:f=>({floor:f,region:{x0:44,y0:46,x1:56,y1:54},rows:[],
            walkable:new Set(),floorTiles:[],stairs:{}}),
        spawnMob:(type,x,y,floor)=>{const m={id:mobId++,type,x,y,floor,hp:200,maxHp:200,dmg:15,xp:100,level:1};monsters.set(m.id,m);return m;},
        weaponSkillOf:()=> 'Machado',hasShieldEquipped:()=>false,
        gainSkillXpServer:()=>{},gainPetXp:()=>{},grantManaOnKill:()=>{},
        console,Math,expeditionFloorSeq:8000});
    vm.runInContext(['nearInteriorService','nearCraftService','movementSnapshot',
        'genForgeGrid','expeditionStatus','sendExpeditionStatus','enterExpedition',
        'handleExpeditionMobDeath','claimExpeditionReward','executeProgressionCraft']
        .map(fn).join('\n'),context);
    return {p,acc,sent,monsters,dungeonFloors,context,
        setFail:v=>{fail=v;},setEnabled:v=>{context.PROGRESSION_ENABLED=v;}};
}
test('family quote retains V4 pity and legacy fallback',()=>{
    const keys=['ESPADA_ETERNA','MACHADO_CATACLISMO','ARCO_ECLIPSE'];
    assert.equal(rules.VERSION,5);
    assert.deepEqual(rules.quote(keys,19).superiorPool,['ESPADA_INFINITA','COROA_CELESTIAL','CAJADO_ASTRAL']);
    assert.deepEqual(rules.quote(keys,19,'machado').superiorPool,['MACHADO_ABISMO']);
    assert.equal(rules.quote(keys,19,'machado').chances.superior,100);
    assert.equal(rules.quote(keys,0,'bogus').error,'invalid_family');
    assert.equal(rules.quote(['MACHADO_RUINAS','ESPADA_HL','CAJADO_RUNICO'],0,'machado').error,'family_unavailable');
});
test('craft consumes once, persists receipt, handles full inventory and rollback',()=>{
    const f=fixture();const {p,context}=f;
    p.x=51;p.y=52;p.inv={BESTA:1,ESCAMA:6,CORACAO_HL:1};
    const opId=p.progressionToken;
    const request={key:'ARCO_DRACO',opId};
    const result=context.executeProgressionCraft(p,request);
    assert.equal(result.ok,true);assert.equal(p.inv.ARCO_DRACO,1);
    assert.equal(p.inv.BESTA,undefined);assert.equal(p.gold,45500);
    assert.deepEqual(context.executeProgressionCraft(p,request),result);
    assert.equal(context.executeProgressionCraft(p,{...request,key:'LANCA_DRACO'}).error,'op_conflict');
    assert.equal(f.acc.save.progressionOps.length,1);
    const full=fixture({full:true});full.p.x=51;full.p.y=52;
    Object.assign(full.p.inv,{BESTA:1,ESCAMA:6,CORACAO_HL:1});
    assert.equal(full.context.executeProgressionCraft(full.p,{key:'ARCO_DRACO',opId:full.p.progressionToken}).error,'inventory_full');
    const failed=fixture({fail:true});failed.p.x=51;failed.p.y=52;
    failed.p.inv={BESTA:1,ESCAMA:6,CORACAO_HL:1};const token=failed.p.progressionToken;
    assert.equal(failed.context.executeProgressionCraft(failed.p,{key:'ARCO_DRACO',opId:token}).error,'save_failed');
    assert.equal(failed.p.progressionToken,token);assert.equal(failed.p.inv.BESTA,1);
    failed.setFail(false);
    assert.equal(failed.context.executeProgressionCraft(failed.p,{key:'ARCO_DRACO',opId:token}).ok,true);
    failed.setEnabled(false);
    assert.equal(failed.context.executeProgressionCraft(failed.p,{key:'ARCO_DRACO',opId:token}).ok,true);
});
test('solo expedition gates boss, stores one pending reward, survives claim retry',()=>{
    const f=fixture();const {p,context,monsters}=f;
    const grid=context.genForgeGrid(8000);
    const visited=new Set([grid.stairs.spawn.x+','+grid.stairs.spawn.y]);
    const queue=[grid.stairs.spawn];
    for(const tile of queue)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const key=(tile.x+dx)+','+(tile.y+dy);
        if(grid.walkable.has(key)&&!visited.has(key)){visited.add(key);queue.push({x:tile.x+dx,y:tile.y+dy});}
    }
    assert.equal(visited.size,grid.walkable.size);
    assert.ok(visited.has('70,50'));
    assert.equal(context.enterExpedition(p).ok,true);
    assert.ok(p.floor>=8000&&p.floor<9000);assert.equal(p.pvp,false);
    assert.equal(monsters.size,7);assert.equal(context.enterExpedition(p).error,'unavailable');
    for(const mob of monsters.values())assert.equal(mob.dmg,mob.type==='ORC'?7:8);
    for(const mob of monsters.values())assert.ok(grid.walkable.has(mob.x+','+mob.y));
    for(const m of [...monsters.values()])context.handleExpeditionMobDeath(m,p);
    assert.equal(p.expedition.guards,4);assert.equal(p.expedition.golems,3);
    const boss=[...monsters.values()].find(m=>m.expeditionBoss);
    assert.ok(boss);assert.equal(boss.hp,450);assert.equal(boss.dmg,12);
    context.handleExpeditionMobDeath(boss,p);
    assert.equal(p.expeditionClears,1);assert.equal(p.expeditionPending.reward.MACHADO_FORJA,1);
    assert.equal(f.acc.save.expeditionClears,1);
    assert.equal(context.claimExpeditionReward(p).ok,true);
    assert.equal(p.inv.FRAGMENTO_FORJA,3);assert.equal(p.inv.MACHADO_FORJA,1);
    assert.equal(context.claimExpeditionReward(p).error,'no_pending');
});
test('full bag keeps pending reward and save failure does not consume boss',()=>{
    const f=fixture({full:true});const {p,context,monsters}=f;
    context.enterExpedition(p);
    for(const m of [...monsters.values()])context.handleExpeditionMobDeath(m,p);
    const boss=[...monsters.values()].find(m=>m.expeditionBoss);
    f.setFail(true);context.handleExpeditionMobDeath(boss,p);
    assert.equal(p.expeditionClears,0);assert.equal(p.expeditionPending,undefined);
    assert.equal(monsters.has(boss.id),true);
    f.setFail(false);context.handleExpeditionMobDeath(boss,p);
    assert.equal(context.claimExpeditionReward(p).error,'inventory_full');
    assert.equal(p.expeditionPending.reward.MACHADO_FORJA,1);
    delete p.inv.OTHER_0;delete p.inv.OTHER_1;
    assert.equal(context.claimExpeditionReward(p).ok,true);
    assert.equal(p.inv.MACHADO_FORJA,1);
});
test('first quest preflights capacity and rolls back a failed save',()=>{
    const f=fixture({full:true});const {p,context}=f;p.x=50;p.y=50;
    p.quests={active:{q_ratos:{progress:10}},completed:[]};
    const begin=source.indexOf("if (kind === 'simple'){");
    const end=source.indexOf("if (kind === 'chain'){",begin);
    assert.ok(begin>=0&&end>begin);
    const turnIn=vm.runInContext(`(function(p,msg,reject){const kind='simple';${source.slice(begin,end)}})`,context);
    const errors=[];const send=()=>turnIn(p,{questId:'q_ratos'},reason=>errors.push(reason));
    send();assert.equal(errors.at(-1),'inventory_full');
    assert.equal(p.quests.completed.length,0);assert.equal(p.inv.PORRETE,undefined);
    delete p.inv.OTHER_0;
    f.setFail(true);send();assert.equal(errors.at(-1),'save_failed');
    assert.equal(p.quests.completed.length,0);assert.equal(p.inv.PORRETE,undefined);
    assert.equal(p.gold,50000);
    f.setFail(false);send();assert.equal(p.quests.completed.join(','),'q_ratos');
    assert.equal(p.inv.PORRETE,1);assert.equal(f.acc.save.quests.completed[0],'q_ratos');
    assert.equal(f.sent.at(-1).questResult.delta.xp.Clava,100);
    send();assert.equal(errors.at(-1),'not_active');assert.equal(p.inv.PORRETE,1);
});
test('second quest credits the equipped weapon skill instead of forcing Sword',()=>{
    const f=fixture();const {p,context}=f;p.x=50;p.y=50;
    p.equipped={weapon:'MACHADO_MINO'};
    p.quests={active:{q_cobras:{progress:5}},completed:[]};
    const begin=source.indexOf("if (kind === 'simple'){");
    const end=source.indexOf("if (kind === 'chain'){",begin);
    const turnIn=vm.runInContext(`(function(p,msg,reject){const kind='simple';${source.slice(begin,end)}})`,context);
    turnIn(p,{questId:'q_cobras'},reason=>assert.fail(reason));
    assert.equal(f.sent.at(-1).questResult.delta.xp.Machado,100);
    assert.equal(f.sent.at(-1).questResult.delta.xp.Espada,undefined);
    assert.deepEqual(p.quests.completed,['q_cobras']);
});
test('feature switch blocks new runs and crafts while preserving pending claims and receipts',()=>{
    const f=fixture();const {p,context}=f;
    p.x=51;p.y=52;p.inv={BESTA:1,ESCAMA:6,CORACAO_HL:1};
    const opId=p.progressionToken;
    const crafted=context.executeProgressionCraft(p,{key:'ARCO_DRACO',opId});
    assert.equal(crafted.ok,true);
    p.expeditionPending={id:crypto.randomUUID(),reward:{FRAGMENTO_FORJA:3}};
    f.setEnabled(false);
    assert.deepEqual(context.executeProgressionCraft(p,{key:'ARCO_DRACO',opId}),crafted);
    assert.equal(context.executeProgressionCraft(p,{key:'ARCO_DRACO',opId:p.progressionToken}).error,'disabled');
    p.x=78;p.y=22;
    assert.equal(context.enterExpedition(p).error,'disabled');
    assert.equal(context.expeditionStatus(p).pending.reward.FRAGMENTO_FORJA,3);
    assert.equal(context.claimExpeditionReward(p).ok,true);
    assert.equal(p.inv.FRAGMENTO_FORJA,3);
});
test('new spears are reusable reach-three weapons while legacy spears remain throwable',()=>{
    for(const key of ['LANCA_DRACO','LANCA_GUARDIAO','LANCA_ETERNA','LANCA_CELESTIAL']){
        assert.equal(progression.items[key].meleeRange,3);
        assert.equal(progression.items[key].throwable,undefined);
        assert.equal(progression.items[key].throwDmg,undefined);
    }
    const ctx=vm.createContext({ITEM_META:{...progression.items,LANCA_LONGA:{throwable:6}},getUpgradeTier:k=>({base:k})});
    vm.runInContext([fn('pvpRangeCapServer'),fn('weaponRangeServer')].join('\n'),ctx);
    const p={equipped:{weapon:'LANCA_ETERNA'}};
    assert.equal(ctx.weaponRangeServer(p),3);
    assert.equal(ctx.pvpRangeCapServer(p),3);
    p.equipped.weapon='LANCA_LONGA';
    assert.equal(ctx.weaponRangeServer(p),6);
    assert.equal(ctx.pvpRangeCapServer(p),6);
});
