'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createCompanions}=require('../companions.cjs');
const {createCompanionState}=require('../companion-state.cjs');
const player=(id=1,x=50,y=50)=>({id,name:'Humano',x,y,hp:100,floor:0,authed:true,ws:{readyState:1},inv:{},gold:0});
const mob=(id,x,y,attrs={})=>({id,type:'RAT',x,y,hp:18,maxHp:18,dmg:2,speed:440,xp:8,level:1,floor:0,damageBy:{},...attrs});

test('dez atores caçam, sofrem dano, matam e avançam sem contas humanas',()=>{
  let time=1000,hits=0,kills=0;
  const c=createCompanions({walkable:()=>true,now:()=>time,onHit:()=>hits++,onKill:()=>kills++});
  const before=c.adminSnapshot().actors;
  const m=mob(1,65,50);
  const unusedHuman=player();const original=JSON.stringify(unusedHuman);
  for(let i=0;i<80&&m.hp>0;i++){time+=700;c.tick([],[m]);}
  const after=c.adminSnapshot();
  assert.equal(c.count,10);assert.ok(hits>=3);assert.equal(m.hp,0);assert.equal(kills,1);
  assert.equal(after.totalKills,1);assert.equal(after.actors.find(b=>b.kills).xp,8);
  assert.ok(after.actors.find(b=>b.kills).hp<after.actors.find(b=>b.kills).maxHp);
  assert.equal(JSON.stringify(unusedHuman),original);
});

test('alvo humano tem prioridade e o dano existente não é revertido',()=>{
  let time=1000,hits=0;const c=createCompanions({walkable:()=>true,now:()=>time,onHit:()=>hits++});
  const m=mob(1,65,50);
  for(let i=0;i<18;i++){time+=700;c.tick([],[m]);}
  const hp=m.hp;
  m.damageBy[1]=3;const p=player(1,m.x,m.y+1);
  for(let i=0;i<20;i++){time+=700;c.tick([p],[m]);}
  assert.equal(m.hp,hp);assert.ok(hits>=0);assert.equal(c.adminSnapshot().totalKills,0);
});

test('caçada própria dirige a escolha de alvo e só progride com abate',()=>{
  let time=1000;
  const initial=[{id:'companion-1',level:1,xp:0,hp:102,kills:0,deaths:0,tasksCompleted:0,task:{type:'SNAKE',progress:0}}];
  const c=createCompanions({walkable:()=>true,now:()=>time,count:1,initialState:initial});
  const rat=mob(1,60,50),snake=mob(2,65,50,{type:'SNAKE',hp:35,maxHp:35,dmg:4,xp:18});
  for(let i=0;i<90&&snake.hp>0;i++){time+=700;c.tick([],[rat,snake]);}
  assert.equal(snake.hp,0);assert.equal(rat.hp,18);
  assert.equal(c.adminSnapshot().actors[0].task.progress,1);
});

test('boss, mob de outro andar e mob com DoT humano não viram caçada',()=>{
  let time=1000;const c=createCompanions({walkable:()=>true,now:()=>time});
  const mobs=[mob(1,65,50,{unique:true}),mob(2,66,50,{floor:2}),mob(3,67,50,{dots:[{type:'poison'}]})];
  for(let i=0;i<80;i++){time+=700;c.tick([],mobs);}
  assert.ok(mobs.every(m=>m.hp===18));assert.equal(c.adminSnapshot().totalKills,0);
});

test('morte, recuperação e persistência validada com cópia do estado corrompido',()=>{
  let time=1000;
  const lowHealth=[{id:'companion-1',level:4,xp:0,hp:78,kills:0,deaths:0,tasksCompleted:0,task:{type:'RAT',progress:0}}];
  const c=createCompanions({walkable:()=>true,now:()=>time,initialState:lowHealth});
  const killer=mob(1,65,50,{type:'ORC',hp:140,maxHp:140,dmg:11,xp:120});
  for(let i=0;i<60&&c.adminSnapshot().totalDeaths===0;i++){time+=700;c.tick([],[killer]);}
  assert.equal(c.adminSnapshot().totalDeaths,1);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-companion-'));
  try{
    const store=createCompanionState(path.join(dir,'state.json'),{logger:{error:()=>{}}});
    assert.equal(store.save(c.exportState()),true);
    // Second save creates a validated fallback.
    assert.equal(store.save(c.exportState()),true);
    fs.writeFileSync(store.file,'{broken');
    const recovered=createCompanionState(path.join(dir,'state.json'),{logger:{error:()=>{}}});
    const prior=recovered.load();assert.equal(prior[0].deaths,1);
    assert.ok(fs.readdirSync(dir).some(f=>f.startsWith('companion-state.json.corrupt-')));
    const resumed=createCompanions({walkable:()=>true,now:()=>time,initialState:prior});
    assert.equal(resumed.adminSnapshot().actors[0].deaths,1);
    time+=9000;resumed.tick([],[]);assert.ok(resumed.adminSnapshot().actors[0].hp>0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('seguir e dispensar mantém comando opcional e devolve autonomia',()=>{
  let time=1000;const c=createCompanions({walkable:()=>true,now:()=>time});
  const b=c.adminSnapshot().actors[0],p=player(1,b.x,b.y);
  assert.equal(c.command(p,{action:'follow',id:b.id}).ok,true);
  assert.equal(c.snapshot(p).filter(x=>x.followingYou).length,1);
  assert.equal(c.command(p,{action:'dismiss'}).ok,true);
  time+=700;c.tick([],[]);assert.equal(c.adminSnapshot().actors[0].busy,false);
});

test('ajuda ao dono já combatendo tem limite conjunto, sem último golpe ou XP próprio',()=>{
  let time=1000,assists=0;
  const c=createCompanions({walkable:()=>true,now:()=>time,onAssist:()=>assists++});
  const b=c.adminSnapshot().actors[0],owner=player(7,b.x,b.y);
  const target=mob(1,b.x+1,b.y,{hp:100,maxHp:100,damageBy:{7:10}});
  assert.equal(c.command(owner,{action:'follow',id:b.id}).ok,true);
  for(let i=0;i<50;i++){time+=1300;c.tick([owner],[target]);}
  assert.ok(assists>0);assert.equal(target.hp,85);
  assert.equal(c.adminSnapshot().totalKills,0);assert.equal(c.adminSnapshot().actors[0].xp,0);
  target.hp=1;for(let i=0;i<5;i++){time+=1300;c.tick([owner],[target]);}assert.equal(target.hp,1);
  assert.equal(owner.gold,0);assert.deepEqual(owner.inv,{});
});

test('desligar a função não grava roster vazio sobre progresso nem backup',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-companion-disable-'));
  try{
    const store=createCompanionState(path.join(dir,'state.json'),{logger:{error:()=>{}}});
    const c=createCompanions({walkable:()=>true});
    const saved=c.exportState();saved[0].kills=12;
    assert.equal(store.save(saved),true);
    const original=fs.readFileSync(store.file,'utf8');
    const backup=fs.readFileSync(store.file+'.bak','utf8');
    const disabled=createCompanions({walkable:()=>true,count:0,initialState:store.load()});
    assert.equal(disabled.count,0);assert.equal(store.save(disabled.exportState()),false);
    assert.equal(store.save(disabled.exportState()),false); // periodic + shutdown
    assert.equal(fs.readFileSync(store.file,'utf8'),original);
    assert.equal(fs.readFileSync(store.file+'.bak','utf8'),backup);
    const enabled=createCompanions({walkable:()=>true,initialState:store.load()});
    assert.equal(enabled.adminSnapshot().actors[0].kills,12);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('status de persistência reporta falha e limpa após sucesso; tarefa orc sobrevive',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-companion-status-'));
  try{
    const store=createCompanionState(path.join(dir,'state.json'),{logger:{error:()=>{}}});
    const c=createCompanions({walkable:()=>true,initialState:[
      {id:'companion-1',level:4,xp:12,hp:100,kills:21,deaths:1,tasksCompleted:4,task:{type:'ORC',progress:2}}
    ]});
    assert.equal(store.save(c.exportState()),true);
    assert.equal(store.status().lastSaveSucceeded,true);assert.ok(store.status().lastSavedAt>0);
    assert.equal(store.save([{id:'bad'}]),false);
    assert.equal(store.status().lastSaveSucceeded,false);assert.ok(store.status().lastError);
    assert.equal(store.save(c.exportState()),true);
    assert.equal(store.status().lastSaveSucceeded,true);assert.equal(store.status().lastError,null);
    const resumed=createCompanions({walkable:()=>true,initialState:store.load()});
    assert.deepEqual(resumed.adminSnapshot().actors[0].task,{label:'Caçar orcs',progress:2,goal:4});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('ataque PvP real aciona revide somente ao agressor, sem progresso farmável',()=>{
  let time=1000;const retaliation=[];
  const c=createCompanions({walkable:()=>true,now:()=>time,count:1,safe:()=>false,attackRange:()=>3,
    onRetaliate:(p,b,dmg)=>{retaliation.push({id:p.id,dmg});p.hp-=dmg;return dmg;}});
  const b=c.adminSnapshot().actors[0],attacker={...player(1,b.x+1,b.y),joined:true,pvp:true},
    innocent={...player(2,b.x+2,b.y+1),joined:true,pvp:true};
  assert.equal(c.snapshot(attacker)[0].canAttack,true);
  assert.equal(c.attack(attacker,b.id,{damage:9,delay:650}).actual,9);
  assert.equal(c.snapshot(attacker)[0].hostileToYou,true);
  assert.equal(c.snapshot(innocent)[0].hostileToYou,false);
  time+=700;c.tick([attacker,innocent],[]);
  assert.deepEqual(retaliation.map(x=>x.id),[1]);
  assert.equal(c.adminSnapshot().actors[0].state,'defend');
  assert.equal(c.adminSnapshot().actors[0].xp,0);
  assert.equal(c.adminSnapshot().actors[0].kills,0);
  assert.equal(c.attack(attacker,b.id,{damage:9,delay:650}).ok,true);
  assert.equal(c.attack(attacker,b.id,{damage:9,delay:650}).reason,'cooldown');
  attacker.pvp=false;time+=1200;c.tick([attacker,innocent],[]);
  assert.equal(retaliation.at(-1).id,1); // toggle off cannot erase a confirmed hit
  attacker.disconnected=true;time+=1200;c.tick([attacker,innocent],[]);
  assert.equal(c.snapshot(innocent)[0].state!=='defend',true);
  attacker.disconnected=false;attacker.floor=1;
  assert.equal(c.attack(attacker,b.id,{damage:3}).reason,'unavailable');
  assert.equal(c.snapshot(attacker).length,0);
});

test('revide troca só entre agressores confirmados e cessa na PZ ou morte humana',()=>{
  let time=1000;const struck=[];
  const c=createCompanions({walkable:()=>true,now:()=>time,count:1,safe:(x)=>x<=46,
    onRetaliate:p=>{struck.push(p.id);return {actual:6,dead:p.id===2};}});
  const b=c.adminSnapshot().actors[0],a={...player(1,b.x+1,b.y),joined:true,pvp:true},
    second={...player(2,b.x,b.y+1),joined:true,pvp:true},
    innocent={...player(3,b.x+1,b.y+1),joined:true,pvp:true};
  assert.equal(c.attack(a,b.id,{damage:2}).ok,true);
  assert.equal(c.attack(second,b.id,{damage:2}).ok,true);
  a.x=46;time+=1200;c.tick([a,second,innocent],[]);
  assert.deepEqual(struck,[2]);
  assert.equal(c.snapshot(second)[0].hostileToYou,false);
  time+=1200;c.tick([a,second,innocent],[]);
  assert.deepEqual(struck,[2]);
  assert.equal(c.adminSnapshot().actors[0].state!=='defend',true);
});

test('PvP respeita PvP ligado, PZ, alcance, arena e recuperação após morte',()=>{
  let time=1000;const safe=(x,y)=>x<50;
  const c=createCompanions({walkable:()=>true,now:()=>time,count:1,safe,attackRange:()=>1});
  const b=c.adminSnapshot().actors[0],p={...player(1,b.x+1,b.y),joined:true,pvp:false};
  assert.equal(c.attack(p,b.id,{damage:5}).reason,'pvp_off');
  p.pvp=true;assert.equal(c.attack(p,b.id,{damage:5}).reason,'safe_zone');
  // Move the actor outside the configured protected tiles through normal hunting.
  const m=mob(4,63,50);
  for(let i=0;i<40&&c.adminSnapshot().actors[0].x<50;i++){time+=700;c.tick([],[m]);}
  const active=c.adminSnapshot().actors[0];
  assert.ok(active.x>=50);p.x=active.x+3;p.y=active.y;
  assert.equal(c.attack(p,b.id,{damage:5}).reason,'out_of_range');
  p.x=active.x+1;p.arena={};assert.equal(c.attack(p,b.id,{damage:5}).reason,'unavailable');
  p.arena=null;assert.equal(c.attack(p,b.id,{damage:9999}).ok,true);
  assert.equal(c.adminSnapshot().actors[0].deaths,1);
  assert.equal(c.adminSnapshot().actors[0].hp,0);
  assert.equal(c.snapshot(p)[0].canAttack,false);
  time+=9000;c.tick([],[m]);assert.ok(c.adminSnapshot().actors[0].hp>0);
  time+=18000;c.tick([],[m]);assert.notEqual(c.adminSnapshot().actors[0].state,'recover');
  assert.equal(c.adminSnapshot().actors[0].kills,0);
});
