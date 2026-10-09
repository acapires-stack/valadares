'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createCompanions}=require('../companions.cjs');
const p=(id=1,x=50,y=50)=>({id,x,y,hp:100,floor:0,authed:true,ws:{readyState:1},inv:{},gold:0});
test('ten distinct automatic actors never mutate player accounts or inventories',()=>{
 let now=100;const c=createCompanions({walkable:()=>true,now:()=>now});const player=p();const before=JSON.stringify(player), first=c.snapshot(player);
 assert.equal(first.length,10);assert.equal(new Set(first.map(b=>b.id)).size,10);assert.ok(first.every(b=>b.automatic));
 for(let i=0;i<50;i++){now+=700;c.tick([player],[]);}assert.notDeepEqual(c.snapshot(player).map(b=>[b.x,b.y]),first.map(b=>[b.x,b.y]));assert.equal(JSON.stringify(player),before);
});
test('invalid locations and dungeons never spawn/reveal actors',()=>{
 const empty=createCompanions({walkable:()=>false});assert.equal(empty.count,0);
 const c=createCompanions({walkable:(x,y)=>x%2===0});assert.ok(c.snapshot(p()).every(b=>b.x%2===0));assert.deepEqual(c.snapshot({...p(),floor:1}),[]);assert.deepEqual(c.snapshot({...p(),disconnected:true}),[]);
});
test('follow requires proximity, one companion each, busy actors protected, logout releases',()=>{
 let now=0;const c=createCompanions({walkable:()=>true,now:()=>now});const player=p();const b=c.snapshot(player)[0], second=p(2,b.x,b.y);player.x=b.x;player.y=b.y;
 assert.equal(c.command(p(3,90,90),{action:'follow',id:b.id}).ok,false);
 assert.equal(c.command(player,{action:'follow',id:b.id}).ok,true);assert.equal(c.command(second,{action:'follow',id:b.id}).reason,'busy');
 assert.equal(c.snapshot(player).filter(b=>b.followingYou).length,1);assert.equal(c.command(player,{action:'dismiss'}).ok,true);assert.equal(c.snapshot(player).filter(b=>b.followingYou).length,0);
 c.command(player,{action:'follow',id:b.id});now+=1000;c.tick([],[]);assert.equal(c.snapshot(second).find(x=>x.id===b.id).busy,false);
});
test('assistance requires a live human contributor; cap is shared and cannot kill or generate loot',()=>{
 let now=0, hits=0;const c=createCompanions({walkable:()=>true,now:()=>now,onAssist:()=>hits++});const b=c.snapshot(p())[0],player=p(1,b.x,b.y+1);
 const m={x:b.x,y:b.y,hp:100,maxHp:100,floor:0,damageBy:{}};
 for(let i=0;i<10;i++){now+=1500;c.tick([player],[m]);}assert.equal(m.hp,100);assert.equal(hits,0);
 m.damageBy[1]=10;m.hp=90;for(let i=0;i<100;i++){now+=1500;c.tick([player],[m]);}
 assert.ok(hits>0);assert.ok(m.hp>=75);assert.equal(player.gold,0);assert.deepEqual(player.inv,{});assert.deepEqual(m.damageBy,{1:10});
 m.hp=1;for(let i=0;i<5;i++){now+=1500;c.tick([player],[m]);}assert.equal(m.hp,1);
});
test('bosses, absent contributors and floors remain untouched',()=>{
 let now=0;const c=createCompanions({walkable:()=>true,now:()=>now});const b=c.snapshot(p())[0],player=p(1,b.x,b.y+1);
 for(const attrs of [{unique:true},{floor:2},{damageBy:{99:4}}]){const m={x:b.x,y:b.y,hp:70,maxHp:100,damageBy:{1:4},...attrs};for(let i=0;i<20;i++){now+=1500;c.tick([player],[m]);}assert.equal(m.hp,70);}
});
