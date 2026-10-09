const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g,'\n');
function functionSource(name){
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing ${name}`);
    const end = source.indexOf('\n}', start);
    assert.ok(end >= 0, `unterminated ${name}`);
    return source.slice(start, end + 2);
}
assert.ok(source.includes('if (m.hp === 0) finalizeWeaponMobDeath(m,p,id);'), 'direct attack must use the shared death finalizer');
const directDeathSource = functionSource('finalizeWeaponMobDeath') +
    '\nfunction directDeath(m,p,id){if(m.hp===0)finalizeWeaponMobDeath(m,p,id);}';
const functions = [
    'rollLoot', 'recordMobRewardDamage', 'bossLootContributors', 'bossRewardBonus', 'distributeBossLoot',
    'grantMobLoot', 'handleMobDeath', 'tickMobDots', 'sharePartyKill',
].map(functionSource).join('\n') + '\n' + directDeathSource;

function player(id, opts = {}){
    const messages = [];
    return {
        id, name:`P${id}`, floor:opts.floor ?? 5, x:10, y:10, hp:100,
        gold:0, inv:{}, skills:{}, disconnected:!!opts.disconnected,
        permaBuffs:opts.buffs || {}, petBuffs:opts.petBuffs || {},
        ws:{ readyState:opts.offline ? 3 : 1, send:s => messages.push(JSON.parse(s)) },
        messages,
    };
}
function fixture(options = {}){
    const players = new Map();
    const monsters = new Map();
    const ground = [];
    const updates = [];
    const broadcasts = [];
    const xp = [];
    const mMath = Object.create(Math);
    mMath.random = () => options.random ?? 0.5;
    const context = {
        Math:mMath, Date, console, players, monsters,
        LOOT:{ TEST_BOSS:[['GOLD',1,100,100], ['RARE',0.05,1,1], ['GUARANTEED',1,1,1]] },
        MTYPE:{ TEST_BOSS:{unique:true} },
        isDungeonFloor:()=>false, DUNGEON_LOOT_SCALE:0, DUNGEON_ITEM_LUCK_SCALE:0,
        isAutomatonFloor:()=>false,
        progression:{ automatonDungeon:{ boss:'FORGE_WARDEN' } },
        equipmentRules:{ MATERIAL:'ESSENCE' },
        SAVE_CAPS:{ invKeys:250 }, LOOT_LOCK_MS:30000,
        BOSSES:[], MEGA_BOSS_TYPE:'OTHER_MEGA', DUNGEON_BOSS_TYPE:'OTHER_DUNGEON',
        DOT_TICK_INTERVAL_MS:3000, DOT_COLORS:{poison:'#0f0'},
        PARTY_XP_FRACTION:0.6, PARTY_SHARE_RADIUS:12,
        petBuffVal:(p,k)=>p.petBuffs[k] || 0,
        canAddKeys:()=>!options.fullInventory,
        incInv:(p,k,q)=>{ p.inv[k]=(p.inv[k] || 0)+q; },
        spawnGroundDrop:(x,y,type,qty,floor,owner,ownerName,ownerUntil)=>{
            const drop={id:ground.length+1,x,y,type,qty,floor,owner,ownerName,ownerUntil};
            ground.push(drop); return drop;
        },
        broadcast:(id,msg,floor)=>broadcasts.push({id,msg,floor}),
        sendInvUpdate:(p,msg)=>updates.push({id:p.id,msg}),
        syncGoldRank:()=>{}, sendTo:(id,msg)=>updates.push({id,msg}),
        dropMobLoot:()=>[], grantManaOnKill:()=>{},
        weaponSkillOf:()=> 'Espada', gainSkillXpServer:(p,s,n)=>xp.push({id:p.id,n}),
        gainPetXp:()=>null, hasShieldEquipped:()=>false,
        bumpMobKill:()=>{}, creditQuestKill:()=>{},
        noteEngagement:()=>{},
        findPartyOfPlayer:()=>options.party || null,
        partyMembersOnline:()=>Array.from(players.values()),
        chebyshev:(x,y,a,b)=>Math.max(Math.abs(x-a),Math.abs(y-b)),
        sendSkillsOnly:()=>{},
        sharePartyKill:()=>{},
    };
    vm.createContext(context);
    vm.runInContext(functions, context);
    return {context, players, monsters, ground, updates, broadcasts, xp};
}
function boss(damageBy = {1:90,2:10}){
    return {id:77,type:'TEST_BOSS',unique:true,floor:5,x:10,y:10,hp:0,maxHp:5000,damageBy};
}
function runDeath(f, kind, killerId=1){
    const m = boss(kind === 'dot' ? {1:90,2:9} : {1:90,2:10});
    f.monsters.set(m.id,m);
    if (kind === 'direct') f.context.directDeath(m,f.players.get(killerId),killerId);
    else {
        m.hp=1;
        m.dots=[{type:'poison',dmg:1,ticksLeft:1,nextTickAt:0,byId:2}];
        f.context.tickMobDots();
    }
    return m;
}

test('chance 100% stays guaranteed; rare chance retains its cap',()=>{
    for (const random of [0,0.5,0.96,0.999999]){
        const f=fixture({random});
        const loot=f.context.rollLoot('TEST_BOSS',20,5);
        assert.ok(loot.some(i=>i.type==='GUARANTEED'));
        assert.ok(loot.some(i=>i.type==='GOLD'));
        assert.equal(loot.some(i=>i.type==='RARE'),random<0.95);
    }
    const f=fixture({random:0.06});
    assert.equal(f.context.rollLoot('TEST_BOSS',0,5).some(i=>i.type==='RARE'),false);
});

test('depth boss gold follows HP after floor 5 and Arcana grows conservatively',()=>{
    const f=fixture({random:0});
    Object.assign(f.context,{
        DUNGEON_BOSS_TYPE:'SENHOR_PROFUNDEZAS', DUNGEON_BOSS_EVERY:5,
        DUNGEON_BOSS_SCALE:0.30,DUNGEON_LOOT_SCALE:0.15,DUNGEON_ITEM_LUCK_SCALE:0.05,
        isDungeonFloor:n=>n>=1&&n<=999,
        isBossFloor:n=>n>=5&&n<=999&&n%5===0,
    });
    f.context.LOOT.SENHOR_PROFUNDEZAS=[['GOLD',1,600,1600]];
    f.context.MTYPE.SENHOR_PROFUNDEZAS={unique:true};
    f.context.LOOT.SOMBRA=[['GOLD',1,30,30]];
    for(const [floor,gold,arcana] of [[5,960,3],[10,2400,5],[15,3840,6],[20,5280,8]]){
        const loot=f.context.rollLoot('SENHOR_PROFUNDEZAS',0,floor);
        assert.equal(loot.find(i=>i.type==='GOLD').qty,gold);
        assert.equal(loot.find(i=>i.type==='ESSENCE').qty,arcana);
    }
    f.context.Math.random=()=>0.999999;
    for(const [floor,gold] of [[5,2560],[10,6400],[15,10240],[20,14080]]){
        assert.equal(f.context.rollLoot('SENHOR_PROFUNDEZAS',0,floor).find(i=>i.type==='GOLD').qty,gold);
    }
    f.context.Math.random=()=>0;
    for(const floor of [0,9001]){
        assert.equal(f.context.rollLoot('SENHOR_PROFUNDEZAS',0,floor).find(i=>i.type==='GOLD').qty,600);
    }
    assert.equal(f.context.rollLoot('SOMBRA',0,10).find(i=>i.type==='GOLD').qty,70);
});

for (const kind of ['direct','dot']) for (const party of [false,true]){
    test(`${kind} boss rewards stay 90/10 ${party?'with':'without'} party`,()=>{
        const f=fixture({party:party?{members:['P1','P2']}:null,random:0.5});
        const a=player(1), b=player(2);
        f.players.set(1,a); f.players.set(2,b);
        runDeath(f,kind);
        assert.equal(a.gold,90); assert.equal(b.gold,10);
        assert.equal(a.gold+b.gold,100);
        assert.equal(a.inv.GUARANTEED,1);
        assert.equal(b.inv.GUARANTEED,undefined);
        const notices=f.updates.filter(u=>u.msg.bossLoot).map(u=>u.msg.bossLoot);
        assert.equal(notices.length,2);
        assert.equal(notices[0].encounterId,notices[1].encounterId);
        assert.equal(notices[0].floor,5);
        assert.equal(notices[0].durationMs,null); // fixture has historical damage with no start timestamp
        assert.deepEqual(notices.map(n=>n.damage.dealt),[90,10]);
        assert.ok(Math.abs(notices[0].damage.share-0.9)<1e-12);
        assert.equal(notices[0].damage.total,100);
        assert.equal(notices[0].reward.rolled.gold,100);
        assert.equal(notices.reduce((s,n)=>s+n.reward.awarded.gold,0),100);
        assert.equal(notices[0].reward.rolled.items.GUARANTEED,1);
        assert.equal(notices[0].reward.rolled.items.ESSENCE,3);
        assert.equal(notices[0].gold,notices[0].reward.carried.gold);
        assert.equal(notices[0].items.GUARANTEED,notices[0].reward.carried.items.GUARANTEED);
    });
}

test('killer switch does not change weighted luck or gold bonus; solo keeps own buff',()=>{
    for (const killerId of [1,2]){
        const f=fixture({random:0.08});
        const a=player(1,{buffs:{rareLuck:1,lootBonus:0.2}}), b=player(2);
        f.players.set(1,a); f.players.set(2,b);
        runDeath(f,'direct',killerId);
        assert.equal(a.gold+b.gold,118);
        assert.equal((a.inv.RARE||0)+(b.inv.RARE||0),1);
    }
    const solo=fixture({random:0.08});
    const a=player(1,{buffs:{rareLuck:1,lootBonus:0.2}});
    solo.players.set(1,a);
    const m=boss({1:100});
    solo.context.grantMobLoot(m,a);
    assert.equal(a.gold,120);
    assert.equal(a.inv.RARE,1);
});

test('DoT death uses the same weighted boss buffs as direct death',()=>{
    const f=fixture({random:0.08});
    const a=player(1,{buffs:{rareLuck:1,lootBonus:0.2}}), b=player(2);
    f.players.set(1,a); f.players.set(2,b);
    runDeath(f,'dot');
    assert.equal(a.gold+b.gold,118);
    assert.equal((a.inv.RARE||0)+(b.inv.RARE||0),1);
});

test('gold rounding conserves every rolled coin',()=>{
    const f=fixture({random:0.5});
    const a=player(1), b=player(2);
    f.players.set(1,a); f.players.set(2,b);
    f.context.distributeBossLoot(boss({1:9,2:1}),[{type:'GOLD',qty:10},{type:'GOLD',qty:11}],
        f.context.bossLootContributors(boss({1:9,2:1}),a));
    assert.equal(a.gold+b.gold,21);
    assert.ok(a.gold>=18 && a.gold<=20);
    assert.ok(b.gold>=1 && b.gold<=3);
});

test('20% minimum rewards only real contributors reaching 2% HP, with no new gold',()=>{
    const f=fixture({random:0.5});
    for(const id of [1,2,3]) f.players.set(id,player(id));
    const m=boss({1:9601,2:199,3:200});m.maxHp=10000;
    f.context.distributeBossLoot(m,[{type:'GOLD',qty:1000}],f.context.bossLootContributors(m,f.players.get(1)));
    assert.equal(Array.from(f.players.values()).reduce((s,p)=>s+p.gold,0),1000);
    const notices=f.updates.filter(u=>u.msg.bossLoot).map(u=>u.msg.bossLoot);
    assert.deepEqual(notices.map(n=>n.reward.guaranteedGold),[100,0,100]);
    assert.deepEqual(notices.map(n=>n.damage.eligibleForMinimum),[true,false,true]);
    assert.ok(notices.every(n=>n.damage.minimumRequired===200));
    assert.ok(f.players.get(2).gold>0); // abaixo de 2% ainda recebe sua parte proporcional
    assert.ok(f.players.get(1).gold>f.players.get(3).gold);
});

test('low-gold world boss still grants one coin to 50 qualified players when pool permits',()=>{
    const f=fixture({random:0.5});
    const damageBy={};
    for(let id=1;id<=50;id++){f.players.set(id,player(id));damageBy[id]=9;}
    const m=boss(damageBy);m.maxHp=450;
    f.context.distributeBossLoot(m,[{type:'GOLD',qty:60}],f.context.bossLootContributors(m,f.players.get(1)));
    const notices=f.updates.filter(u=>u.msg.bossLoot).map(u=>u.msg.bossLoot);
    assert.equal(notices.length,50);
    assert.ok(notices.every(n=>n.reward.guaranteedGold>=1));
    assert.equal(Array.from(f.players.values()).reduce((s,p)=>s+p.gold,0),60);
});

test('overkill is credited only for HP actually removed, on hit and DoT',()=>{
    const directLine=source.match(/recordMobRewardDamage\(m, id, dealtDamage\);/);
    assert.ok(directLine);
    const hit={damageBy:{1:1}};
    const f0=fixture();
    f0.context.recordMobRewardDamage(hit,2,1);
    assert.equal(hit.damageBy[2],1);

    const f=fixture({random:0.5});
    const a=player(1), b=player(2);
    f.players.set(1,a); f.players.set(2,b);
    const m=boss({1:1}); m.hp=1;
    m.dots=[{type:'poison',dmg:100,ticksLeft:1,nextTickAt:0,byId:2}];
    f.monsters.set(m.id,m);
    f.context.tickMobDots();
    assert.equal(m.damageBy[2],1);
    assert.equal(a.gold,50); assert.equal(b.gold,50);
});

test('first real hit establishes duration, but preexisting damage does not invent history',()=>{
    const f=fixture({random:0.5});
    const a=player(1); f.players.set(1,a);
    const fresh=boss({});
    f.context.recordMobRewardDamage(fresh,1,5);
    assert.ok(Number.isFinite(fresh.rewardFightStartedAt));
    f.context.grantMobLoot(fresh,a);
    const current=f.updates.find(u=>u.msg.bossLoot).msg.bossLoot;
    assert.ok(current.durationMs>=0 && current.durationMs<1000);

    const historical=boss({1:5});
    f.context.recordMobRewardDamage(historical,1,1);
    assert.equal(historical.rewardFightStartedAt,undefined);
    f.context.grantMobLoot(historical,a);
    assert.equal(f.updates.at(-1).msg.bossLoot.durationMs,null);
});

test('only online same-floor finite positive damagers qualify; fallback requires valid killer',()=>{
    const f=fixture({random:0.99});
    for (const [id,opts] of [[1,{}],[2,{floor:6}],[3,{offline:true}],[4,{disconnected:true}],[5,{}]]) f.players.set(id,player(id,opts));
    const m=boss({1:90,2:999,3:999,4:999,5:Infinity,6:NaN,7:-1});
    f.context.grantMobLoot(m,f.players.get(2));
    assert.equal(f.players.get(1).gold,100);
    for (const id of [2,3,4,5]) assert.equal(f.players.get(id).gold,0);
    const empty=boss({2:999});
    f.context.grantMobLoot(empty,f.players.get(2));
    assert.equal(f.players.get(2).gold,0);
    f.context.grantMobLoot(empty,f.players.get(1));
    assert.equal(f.players.get(1).gold,200);
});

test('eligible contributor with no award still gets one summary; fallback marks unknown real damage',()=>{
    const f=fixture({random:0.5});
    const a=player(1), b=player(2);
    f.players.set(1,a);f.players.set(2,b);
    f.context.grantMobLoot(boss({1:100000,2:0.001}),a);
    const small=f.updates.find(u=>u.id===2 && u.msg.bossLoot).msg.bossLoot;
    assert.equal(small.damage.dealt,0.001);
    assert.equal(small.damage.fallback,false);
    assert.equal(small.reward.awarded.gold,0);
    assert.equal(Object.keys(small.reward.awarded.items).length,0);

    const fallback=fixture({random:0.5});
    const only=player(1);fallback.players.set(1,only);
    fallback.context.grantMobLoot(boss({}),only);
    const notice=fallback.updates.find(u=>u.msg.bossLoot).msg.bossLoot;
    assert.equal(notice.damage.dealt,0);
    assert.equal(notice.damage.total,0);
    assert.equal(notice.damage.share,1);
    assert.equal(notice.damage.fallback,true);
});

test('full inventory drops owned item and keeps gold plus bossLoot contract',()=>{
    const f=fixture({fullInventory:true,random:0.99});
    const a=player(1); f.players.set(1,a);
    f.context.grantMobLoot(boss({1:100}),a);
    assert.equal(a.gold,100);
    assert.equal(a.inv.GUARANTEED,undefined);
    assert.equal(f.ground.length,2); // guaranteed table item + boss essence
    assert.ok(f.ground.every(d=>d.owner===1 && d.floor===5));
    const notice=f.updates.find(u=>u.msg.bossLoot);
    assert.equal(notice.msg.bossLoot.gold,100);
    assert.equal(notice.msg.bossLoot.items.GUARANTEED,undefined);
    assert.equal(notice.msg.goldDelta.amount,100);
    const reward=notice.msg.bossLoot.reward;
    assert.equal(reward.awarded.items.GUARANTEED,1);
    assert.equal(reward.carried.items.GUARANTEED,undefined);
    assert.equal(reward.ground.items.GUARANTEED,1);
    assert.equal(reward.ground.drops.length,2);
    assert.deepEqual(Array.from(reward.ground.drops,d=>d.id),f.ground.map(d=>d.id));
    for(const type of Object.keys(reward.awarded.items)){
        assert.equal((reward.carried.items[type]||0)+(reward.ground.items[type]||0),reward.awarded.items[type]);
    }
});

test('party XP requires same floor as kill in addition to radius',()=>{
    const f=fixture({party:{members:['P1','P2','P3']}});
    const killer=player(1), otherFloor=player(2,{floor:6}), sameFloor=player(3);
    f.players.set(1,killer);f.players.set(2,otherFloor);f.players.set(3,sameFloor);
    // Replace the no-op stub so this calls the literal server implementation.
    vm.runInContext(functionSource('sharePartyKill'),f.context);
    f.context.sharePartyKill(killer,{type:'TEST_BOSS',xp:100,floor:5,x:10,y:10});
    assert.deepEqual(f.xp.map(x=>x.id),[3]);
    assert.equal(otherFloor.messages.some(m=>m.t==='partyShareKill'),false);
    assert.equal(sameFloor.messages.find(m=>m.t==='partyShareKill').xp,60);
});
