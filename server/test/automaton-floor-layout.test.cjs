'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');

function capture(startText,endText,context){
    const start=source.indexOf(startText),end=source.indexOf(endText,start);
    assert.ok(start>=0&&end>start,`trecho ${startText}`);
    return vm.runInNewContext(source.slice(start,end)+'\n'+startText.match(/function (\w+)/)[1],context);
}

const DUNGEON_SPAWN={x:50,y:52};
const layoutContext={Uint8Array,Int16Array,Set,Math,
    DUNGEON_REGION:{x0:40,y0:40,x1:60,y1:60},DUNGEON_SPAWN,
    DUNGEON_FLOOR_HARD_CAP:999,DUNGEON_TOWN_STAIR_FIRST:25,
    isBossFloor:f=>f>=1&&f<=999&&f%5===0};
const genDungeonGrid=capture('function dungeonRng(', 'function getDungeonFloor(',layoutContext);
// O trecho capturado retorna dungeonRng; genDungeonGrid fica no mesmo contexto.
const generate=layoutContext.genDungeonGrid || vm.runInNewContext('genDungeonGrid',layoutContext);

function key(p){return p&&`${p.x},${p.y}`;}
function reachable(g){
    const q=[g.stairs.spawn],seen=new Set([key(g.stairs.spawn)]);
    for(let i=0;i<q.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=q[i].x+dx,y=q[i].y+dy,k=`${x},${y}`;
        if(g.walkable.has(k)&&!seen.has(k)){seen.add(k);q.push({x,y});}
    }
    return seen;
}

test('chefes 5..995 nas seeds 0/1000 nunca coincidem com transições e são alcançáveis',()=>{
    for(const seed of [0,1000])for(let depth=5;depth<=995;depth+=5){
        const g=generate(depth,seed),s=g.stairs,reach=reachable(g);
        assert.ok(s.boss,`boss ausente ${depth}/${seed}`);
        assert.ok(s.up&&s.down,`escada ausente ${depth}/${seed}`);
        assert.equal(new Set([key(s.spawn),key(s.up),key(s.down),key(s.boss),
            ...(s.town?[key(s.town)]:[])]).size,s.town?5:4,`colisão ${depth}/${seed}`);
        for(const point of [s.spawn,s.up,s.down,s.boss,s.town].filter(Boolean))
            assert.ok(reach.has(key(point)),`inacessível ${depth}/${seed}: ${key(point)}`);
        assert.equal(!!s.town,depth>=25,`town ${depth}/${seed}`);
    }
    const twentyFive=generate(25,1000),thirty=generate(30,1000);
    assert.notDeepEqual(twentyFive.rows,thirty.rows,'andar 30 mantém layout próprio');
    assert.notEqual(key(twentyFive.stairs.boss),key(twentyFive.stairs.up));
});

test('spawnMob central recusa jogador, ghost vivo e outro mob na casa',()=>{
    const players=new Map(),monsters=new Map();
    const context={MTYPE:{RAT:{hp:18,dmg:2,speed:440,xp:8,aggro:4,intel:1}},
        players,monsters,bossLevel:new Map(),BOSS_LEVEL_CAP:10,
        DUNGEON_FLOOR_SCALE:0.6,DUNGEON_BOSS_SCALE:0.3,DUNGEON_BOSS_EVERY:5,
        DUNGEON_BOSS_TYPE:'SENHOR_PROFUNDEZAS',progression:{automatonDungeon:{boss:'FORGE_WARDEN'}},
        isTransitionTile:()=>false,inSafe:()=>false,inSanctuary:()=>false,
        isDungeonFloor:()=>false,isAutomatonFloor:()=>false,
        mobAt:(x,y,f)=>[...monsters.values()].find(m=>m.hp>0&&m.x===x&&m.y===y&&(m.floor||0)===f)||null,
        mobTileOk:()=>true,M_W:30,M_H:30,
        nextMobId:1,Math,Map};
    capture('function playerAt(', 'function spawnMob(',context);
    const spawn=capture('function spawnMob(', '// ───',context);
    players.set(1,{id:1,x:5,y:5,floor:0,hp:100});
    players.set(2,{id:2,x:6,y:5,floor:0,hp:100,disconnected:true});
    assert.equal(spawn('RAT',5,5,0),null);
    assert.equal(spawn('RAT',6,5,0),null);
    const first=spawn('RAT',7,5,0);
    assert.ok(first);
    assert.equal(spawn('RAT',7,5,0),null);
    assert.equal(spawn('RAT',7,5,1).floor,1,'mesma coordenada em outro andar é válida');
    players.get(2).hp=0;
    assert.ok(spawn('RAT',6,5,0),'ghost morto libera casa');
});

test('empurrão nunca move mob para ghost e informa quando não há vaga',()=>{
    const players=new Map([[1,{id:1,x:4,y:5,floor:0,hp:100}],
        [2,{id:2,x:6,y:5,floor:0,hp:100,disconnected:true}]]);
    const m={id:3,x:5,y:5,floor:0,hp:100};
    const monsters=new Map([[m.id,m]]);
    const open=new Set();
    const context={players,monsters,M_W:30,M_H:30,
        mobAt:(x,y,f)=>[...monsters.values()].find(a=>a.hp>0&&a.x===x&&a.y===y&&(a.floor||0)===f)||null,
        mobTileOk:(_mob,x,y)=>open.has(`${x},${y}`)};
    capture('function playerAt(', 'function spawnMob(',context);
    assert.equal(context.bumpMobAwayFrom(5,5,0),false);
    assert.deepEqual([m.x,m.y],[5,5]);
    open.add('6,5');
    assert.equal(context.bumpMobAwayFrom(5,5,0),false,'ghost bloqueia casa livre no terreno');
    open.add('4,4');
    assert.equal(context.bumpMobAwayFrom(5,5,0),true);
    assert.deepEqual([m.x,m.y],[4,4]);
});
