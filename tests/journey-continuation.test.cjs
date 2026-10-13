'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'journey-ui.js'),'utf8'),html=fs.readFileSync(path.join(root,'play.html'),'utf8');
function setup(){
 const player={name:'JourneyQA',x:50,y:50,floor:0,hp:100,maxHp:100,gold:130,inv:{},equipped:{weapon:'PORRETE'},skills:{Clava:{val:11,xp:20,xpNext:75}},quests:{active:{},completed:['q_ratos']}};
 const c={player,ITEMS:{PORRETE:{skill:'Clava',hand:'1h'},MARTELO:{skill:'Clava',hand:'2h'},ESCUDO_MAD:{kind:'offhand'},COURO:{kind:'armor'}},SHOP_BUY:[{item:'COURO',price:180}],
  progression:require(path.join(root,'progression-content.js')),lastExp:null,pendingOpId:'',pendingCraftKey:'',monsters:[],
  say:pt=>pt,near:(x,y)=>Math.max(Math.abs(player.x-x),Math.abs(player.y-y))<=1,loc:(x,y)=>`(${x}, ${y})`,direction:()=>'',itemName:k=>k,qName:q=>q.name,mobName:k=>k,
  weaponInBag:()=>null,rewardText:()=>'',gameReady:()=>true,online:()=>true,playerInSafeZone:()=>true};
 vm.createContext(c);const a=html.indexOf('const QUESTS = ['),b=html.indexOf('\n];',a)+3;
 vm.runInContext(html.slice(a,b)+'\nglobalThis.questById=id=>QUESTS.find(q=>q.id===id);globalThis.questProgress=id=>{const q=questById(id);return q.goal.kind===\'item\'?Math.min(player.inv[q.goal.type]||0,q.goal.count):Math.min(player.quests.active[id]?.progress||0,q.goal.count);};',c);
 vm.runInContext(source.slice(source.indexOf('    function nextQuest()'),source.indexOf('    function routeData()')),c);
 return c;
}
test('next hunt is explicit and persisted progress directs turn-in after reconnect',()=>{
 const c=setup();assert.match(c.objective().text,/5× SNAKE/);assert.equal(c.getObjective().kind,'npc');
 c.player.quests.active.q_cobras={progress:2};c.monsters=[{id:1,type:'SNAKE',hp:35,x:59,y:50}];
 assert.equal(c.objective().progress,'2/5');assert.equal(c.getObjective().id,1);
 c.player.quests.active.q_cobras.progress=5;assert.equal(c.getObjective().x,47);assert.match(c.objective().text,/Objetivo cumprido/);
});
test('shield reward leads to armor equipment, never displaces a two-handed weapon',()=>{
 const c=setup();c.player.quests.completed.push('q_cobras');c.player.inv.ESCUDO_MAD=1;
 assert.equal(c.objective().item,'ESCUDO_MAD');assert.equal(c.objective().action,'equip');
 c.player.equipped.weapon='MARTELO';assert.equal(c.objective().quest.id,'q_seda');
 c.player.equipped.weapon='PORRETE';c.player.equipped.offhand='ESCUDO_MAD';c.player.gold=180;
 assert.equal(c.objective().action,'shop');assert.equal(c.getObjective().y,47);
 c.player.inv.COURO=1;assert.equal(c.objective().action,'equip');assert.equal(c.objective().item,'COURO');
 c.player.equipped.armor='COURO';assert.equal(c.objective().quest.id,'q_seda');
});
test('ready silk turn-in beats shopping and later quests lead to an explicit expedition goal',()=>{
 const c=setup();c.player.quests.completed.push('q_cobras');c.player.quests.active.q_seda={progress:0};c.player.inv.SILK=3;c.player.gold=200;
 assert.equal(c.objective().quest.id,'q_seda');assert.match(c.objective().text,/Objetivo cumprido/);
 c.player.quests.completed.push('q_seda','q_orcs','q_lider');c.player.quests.active={};c.player.equipped.armor='COURO';
 assert.equal(c.objective().action,'dungeons');assert.match(c.objective().text,/18/);assert.match(c.objective().reward,/MACHADO_FORJA/);
 c.player.floor=1;assert.equal(c.getObjective(),null);
});
test('hunt trail respects terrain and avoids stronger enemies along the route',()=>{
 const c=setup();c.map=Array.from({length:100},()=>Array(100).fill(1));c.walkable=t=>t===1;c.npcOnTile=(x,y)=>x===51&&y===50;
 c.player.quests.active.q_cobras={progress:1};
 c.monsters=[{id:1,type:'SNAKE',hp:35,x:60,y:50},{id:2,type:'SPIDER',hp:50,x:54,y:57}];
 const objective=c.getObjective();assert.equal(objective.id,1);assert.ok(objective.trail.length>0);
 for(const p of objective.trail){assert.ok(Math.max(Math.abs(p.x-54),Math.abs(p.y-57))>6);assert.ok(p.x!==51||p.y!==50);}
 c.monsters.push({id:3,type:'SPIDER',hp:50,x:60,y:51},{id:4,type:'SNAKE',hp:35,x:49,y:40});c.player.x=49;
 const cautioned=c.getObjective();assert.equal(cautioned.id,1,'A moving patrol must not bounce the player to another target');assert.equal(cautioned.caution,true);
 c.player.x=0;c.player.y=0;assert.equal(c.getObjective(),null);
});
