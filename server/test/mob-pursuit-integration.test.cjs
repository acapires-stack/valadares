'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const pursuit=require('../mob-pursuit');

// Executa a função tickAI do arquivo real em um mundo descartável, sem abrir servidor
// ou tocar contas. Os callbacks de terreno/PZ substituem só o mundo externo.
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const start=source.indexOf('function tickAI(){');
const end=source.indexOf('// ─── Snapshots',start);
assert.ok(start>=0&&end>start,'tickAI encontrado em server.js');
const tickSource=source.slice(start,end)+'\n tickAI';

function world({mobs=[],players=[],walls=[]}={}){
    const monsters=new Map(mobs.map(m=>[m.id,m]));
    const people=new Map(players.map(p=>[p.id,p]));
    const blocked=new Set(walls.map(([x,y])=>pursuit.key(x,y)));
    let now=10000;
    const context={
        monsters,players:people,mobPursuit:pursuit,
        Date:{now:()=>now},Math,Map,Set,
        M_W:30,M_H:30,ATTACK_CD_MS:1100,FREEZE_SLOW_MULT:1.8,
        chebyshev:(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by)),
        mobTileOk:(_m,x,y)=>x>=1&&y>=1&&x<29&&y<29&&!blocked.has(pursuit.key(x,y)),
        playerInSafe:p=>!!p.safe,playerNearNpc:p=>!!p.nearNpc,
        inPzBuffer:()=>false,inCave:()=>false,inSanctuary:()=>false,
        SAFE_CX:15,SAFE_CY:15,
    };
    const tick=vm.runInNewContext(tickSource,context);
    return {monsters,players:people,
        tick(delta=1000){now+=delta;for(const m of monsters.values())m.lastAttackAt=now;tick();},
        setNow(value){now=value;},
    };
}

function mob(id,x,y,overrides={}){
    return {id,type:'WOLF',x,y,floor:0,hp:100,maxHp:100,aggro:7,
        speed:100,lastMoveAt:0,lastAttackAt:0,intel:2,...overrides};
}
function distance(a,b){return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));}

test('tickAI real fecha oito casas com quinze mobs, espera fora e repõe vaga',()=>{
    const player={id:90,x:12,y:12,floor:0,hp:100};
    const mobs=[];let id=1;
    for(let x=4;x<=8;x++)for(let y=10;y<=12;y++)mobs.push(mob(id++,x,y));
    const sim=world({mobs,players:[player]});
    for(let i=0;i<80;i++)sim.tick();
    const adjacent=()=>mobs.filter(m=>m.hp>0&&distance(m,player)===1);
    assert.equal(adjacent().length,8,JSON.stringify(mobs));
    assert.equal(new Set(mobs.map(m=>pursuit.key(m.x,m.y))).size,mobs.length);
    assert.ok(mobs.filter(m=>m.hp>0&&distance(m,player)>1).length>=7);
    adjacent()[0].hp=0;
    for(let i=0;i<30;i++)sim.tick();
    assert.equal(adjacent().length,8,'vaga liberada foi ocupada');
});

test('tickAI real contorna parede em U e não corta canto',()=>{
    const walls=[];
    for(let y=3;y<=8;y++)walls.push([5,y],[9,y]);
    for(let x=5;x<=9;x++)walls.push([x,8]);
    const m=mob(1,7,7),player={id:90,x:7,y:11,floor:0,hp:100};
    const sim=world({mobs:[m],players:[player],walls});
    for(let i=0;i<35&&distance(m,player)>1;i++)sim.tick();
    assert.ok(distance(m,player)<=1,`mob ficou em ${m.x},${m.y}`);
    assert.ok(!walls.some(([x,y])=>m.x===x&&m.y===y));
});

test('tickAI real revida em oito casas e respeita PZ, andar, ghost e choque',()=>{
    const attacker={id:90,x:10,y:2,floor:0,hp:100};
    const m=mob(1,2,2,{aggro:4,unique:true,_retaliateId:90,_retaliateAt:10000});
    const sim=world({mobs:[m],players:[attacker]});
    sim.tick();
    assert.equal(m.x,3,'retaliação entrou na perseguição');
    m.x=2;m.y=2;attacker.safe=true;
    sim.tick();assert.deepEqual([m.x,m.y],[2,2],'PZ cancela alvo');
    attacker.safe=false;attacker.floor=1;
    sim.tick();assert.deepEqual([m.x,m.y],[2,2],'outro andar cancela alvo');
    attacker.floor=0;attacker.disconnected=true;
    sim.tick();assert.equal(m.x,3,'ghost ainda pode ser perseguido');
    m.shockedUntil=20000;
    const before=[m.x,m.y];sim.tick();
    assert.deepEqual([m.x,m.y],before,'choque preservado');
});

test('ghost vivo ocupa tile mesmo quando outro player é alvo',()=>{
    const m=mob(1,4,5),ghost={id:91,x:5,y:5,floor:0,hp:100,disconnected:true,safe:true};
    const target={id:90,x:8,y:5,floor:0,hp:100};
    const sim=world({mobs:[m],players:[ghost,target]});
    sim.tick();
    assert.notDeepEqual([m.x,m.y],[5,5]);
    for(let i=0;i<12;i++){sim.tick();assert.notDeepEqual([m.x,m.y],[5,5]);}
});

test('congelamento mantém a cadência mais lenta do movimento',()=>{
    const m=mob(1,2,2,{lastMoveAt:10000,frozenUntil:20000});
    const player={id:90,x:8,y:2,floor:0,hp:100};
    const sim=world({mobs:[m],players:[player]});
    sim.tick(100);
    assert.deepEqual([m.x,m.y],[2,2]);
    sim.tick(100);
    assert.ok(m.x>2);
});
