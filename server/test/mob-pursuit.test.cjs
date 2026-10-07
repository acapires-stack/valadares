'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pursuit = require('../mob-pursuit');

function grid({width=20,height=20,walls=[],mobs=[]}={}){
    const blocked = new Set(walls.map(([x,y])=>pursuit.key(x,y)));
    return {
        isWalkable:(x,y)=>x>=1&&y>=1&&x<width-1&&y<height-1&&!blocked.has(pursuit.key(x,y)),
        isOccupied:(x,y)=>mobs.some(m=>m.hp>0&&m.x===x&&m.y===y),
    };
}

test('amplia percepção normal, conserva chefe/caçador e retém alvo por 8 segundos',()=>{
    const mob={id:1,x:2,y:2,floor:0,aggro:4};
    const player={id:9,x:8,y:2,floor:0,hp:100};
    const args={mob,players:[player],isSafe:()=>false};
    assert.equal(pursuit.perceptionRadius(mob),6);
    assert.equal(pursuit.perceptionRadius({...mob,unique:true}),4);
    assert.equal(pursuit.perceptionRadius({...mob,hunter:true,aggro:999}),999);
    let got=pursuit.selectTarget({...args,now:10000});
    assert.equal(got.target,player);
    mob._pursuitTargetId=9;mob._pursuitSeenAt=10000;
    player.x=12;
    got=pursuit.selectTarget({...args,now:17999});
    assert.equal(got.target,player);
    assert.equal(pursuit.selectTarget({...args,now:18001}).target,null);
    player.x=13;
    assert.equal(pursuit.selectTarget({...args,now:11000}).target,null);
});

test('ghost de logout segue atacável no mesmo andar e fora da PZ',()=>{
    const mob={id:1,x:2,y:2,floor:1,aggro:4};
    const ghost={id:9,x:5,y:2,floor:1,hp:100,disconnected:true};
    const args={mob,players:[ghost],now:10000,isSafe:()=>false};
    assert.equal(pursuit.selectTarget(args).target,ghost);
    ghost.floor=2;
    assert.equal(pursuit.selectTarget(args).target,null);
    ghost.floor=1;
    assert.equal(pursuit.selectTarget({...args,isSafe:()=>true}).target,null);
    ghost.hp=0;
    assert.equal(pursuit.selectTarget(args).target,null);
});

test('revida golpe validado até oito casas, sem perseguir PZ, outro andar ou morte',()=>{
    const mob={id:1,x:2,y:2,floor:2,aggro:4,_retaliateId:9,_retaliateAt:10000};
    const player={id:9,x:10,y:2,floor:2,hp:100};
    const args={mob,players:[player],now:11000,isSafe:()=>false};
    assert.equal(pursuit.selectTarget(args).target,player);
    assert.equal(pursuit.selectTarget({...args,isSafe:()=>true}).target,null);
    player.floor=3;
    assert.equal(pursuit.selectTarget(args).target,null);
    player.floor=2;player.hp=0;
    assert.equal(pursuit.selectTarget(args).target,null);
    player.hp=100;player.x=11;
    assert.equal(pursuit.selectTarget(args).target,null);
    player.x=10;
    assert.equal(pursuit.selectTarget({...args,now:18001}).target,null);
});

test('diagonal não corta canto de parede ou de área proibida',()=>{
    const {isWalkable,isOccupied}=grid({walls:[[3,2]]});
    assert.equal(pursuit.canStep({x:2,y:2},{x:3,y:3},isWalkable,isOccupied),false);
    assert.equal(pursuit.canStep({x:2,y:2},{x:2,y:3},isWalkable,isOccupied),true);
});

test('desvia de parede em U e mantém rota até sair do beco',()=>{
    const walls=[];
    for(let y=3;y<=8;y++){walls.push([5,y],[9,y]);}
    for(let x=5;x<=9;x++)walls.push([x,8]);
    const world=grid({walls,width:18,height:18});
    const mob={id:1,x:7,y:7,hp:100};
    const target={x:7,y:10};
    let route=[],routeTarget='';
    let usedBfs=false;
    for(let tick=0;tick<30;tick++){
        const next=pursuit.nextPursuitStep({mob,target,...world,route,routeTarget});
        usedBfs ||= next.visited>0;
        if(!next.step)break;
        mob.x=next.step.x;mob.y=next.step.y;
        route=next.route;routeTarget=pursuit.key(target.x,target.y);
        if(pursuit.distance?.(mob,target)<=1)break;
    }
    assert.equal(usedBfs,true);
    assert.ok(Math.max(Math.abs(mob.x-target.x),Math.abs(mob.y-target.y))<=1,
        `mob parou em ${mob.x},${mob.y}`);
});

test('companheiro bloqueando passo direto faz mob contornar',()=>{
    const mob={id:1,x:3,y:5,hp:100};
    const blocker={id:2,x:4,y:5,hp:100};
    const world=grid({mobs:[mob,blocker]});
    const target={x:7,y:5};
    const result=pursuit.nextPursuitStep({mob,target,...world});
    assert.ok(result.step);
    assert.notDeepEqual(result.step,{x:4,y:5});
});

test('mob de inteligência 3 conserva preferência pelo flanco do jogador',()=>{
    const mob={id:1,x:9,y:12,intel:3};
    const target={x:12,y:12,dir:'up'};
    const world=grid({width:26,height:26});
    const goals=pursuit.goalsAround({mob,target,...world,reserved:new Set()});
    assert.equal(goals[0].y,13);
});

test('desvio não alterna passos laterais diante do canto de U',()=>{
    const target={x:7,y:7};
    const world=grid({walls:[[5,5],[5,6],[5,7],[5,8],[6,8],[7,8],[8,8],[9,8],[9,7],[9,6],[9,5]],
        width:18,height:18});
    const mob={id:1,x:4,y:5,hp:100};
    let route=[],routeTarget='';
    const seen=new Set();
    let usedBfs=false, reached=false;
    for(let tick=0;tick<40;tick++){
        const here=pursuit.key(mob.x,mob.y);
        // Depois que existe rota, repetir tile antigo indica alternância regressiva.
        if(seen.has(here) && !route.length) assert.fail(`ciclo em ${here}`);
        seen.add(here);
        const result=pursuit.nextPursuitStep({mob,target,...world,route,routeTarget});
        usedBfs ||= result.visited>0;
        if(!result.step)break;
        mob.x=result.step.x;mob.y=result.step.y;
        route=result.route;routeTarget=pursuit.key(target.x,target.y);
        if(Math.max(Math.abs(mob.x-target.x),Math.abs(mob.y-target.y))<=1){reached=true;break;}
    }
    assert.equal(usedBfs,true);
    assert.equal(reached,true,`mob parou em ${mob.x},${mob.y}`);
});

test('oito casas são preenchíveis; excedente espera na segunda linha e ocupa vaga liberada',()=>{
    const target={x:12,y:12};
    const mobs=[];
    let id=1;
    for(let x=2;x<=6;x++)for(let y=9;y<=11;y++)mobs.push({id:id++,x,y,hp:100});
    const world=grid({width:26,height:26,mobs});
    const paths=new Map();
    function tick(){
        const reserved=new Set();
        for(const mob of mobs){
            if(mob.hp<=0)continue;
            if(Math.max(Math.abs(mob.x-target.x),Math.abs(mob.y-target.y))<=1)continue;
            const old=paths.get(mob.id)||{route:[],routeTarget:''};
            const result=pursuit.nextPursuitStep({mob,target,...world,reserved,...old});
            if(result.goal)reserved.add(pursuit.key(result.goal.x,result.goal.y));
            if(result.step){mob.x=result.step.x;mob.y=result.step.y;}
            paths.set(mob.id,{route:result.route,routeTarget:pursuit.key(target.x,target.y)});
        }
    }
    for(let t=0;t<80;t++)tick();
    const adjacent=()=>mobs.filter(m=>m.hp>0&&Math.max(Math.abs(m.x-target.x),Math.abs(m.y-target.y))===1);
    assert.equal(adjacent().length,8,JSON.stringify(mobs));
    assert.equal(new Set(mobs.map(m=>pursuit.key(m.x,m.y))).size,mobs.length);
    const vacated=adjacent()[0];vacated.hp=0;
    for(let t=0;t<20;t++)tick();
    assert.equal(adjacent().length,8);
});

test('busca de rota tem limite rígido de nós',()=>{
    const world=grid({width:100,height:100});
    const mob={id:1,x:2,y:2};
    const result=pursuit.findRoute({mob,goals:[{x:90,y:90}],...world,maxNodes:17});
    assert.equal(result.visited,17);
    assert.deepEqual(result.route,[]);
});
