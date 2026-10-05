const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function functionSource(name){
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing ${name}`);
    const end = source.indexOf('\n}', start);
    assert.ok(end >= 0, `unterminated ${name}`);
    return source.slice(start, end + 2);
}
const directStart = source.indexOf('            if (m.hp === 0){\n                grantManaOnKill(p);');
const directEndMarker = '\n            }\n            return;\n        }\n\n        if (msg.t === \'pkDeath\')';
const directEnd = source.indexOf(directEndMarker, directStart);
assert.ok(directStart >= 0 && directEnd > directStart, 'direct attack death block changed');
const directDeathSource = `function directDeath(m, p, id){\n${source.slice(directStart, directEnd + '\n            }'.length)}\n}`;
const functions = [
    'rollLoot', 'bossLootContributors', 'bossRewardBonus', 'distributeBossLoot',
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
    return {id:77,type:'TEST_BOSS',unique:true,floor:5,x:10,y:10,hp:0,maxHp:100,damageBy};
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
        assert.ok(f.updates.some(u=>u.msg.bossLoot?.gold===90));
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

test('overkill is credited only for HP actually removed, on hit and DoT',()=>{
    const directLine=source.match(/m\.damageBy = m\.damageBy \|\| \{\}; m\.damageBy\[id\] = \(m\.damageBy\[id\] \|\| 0\) \+ [^;]+;/);
    assert.ok(directLine);
    const hit={damageBy:{1:1}};
    vm.runInNewContext(directLine[0],{m:hit,id:2,dealtDamage:1,dmg:100});
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
