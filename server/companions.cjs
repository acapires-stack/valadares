'use strict';

// These are world actors, never entries in players, accounts, ranking or loot tables.
const ROSTER = Object.freeze([
  ['Lia','knight','forest','ESPADA_ACO',48,49],
  ['Cael','barbarian','sand','MACHADO',52,51],
  ['Nara','mage','ocean','CAJADO_FOGO',51,48],
  ['Bento','knight','wine','PORRETE',48,52],
  ['Iara','rogue','forest','ARCO',45,50],
  ['Ravi','barbarian','ocean','MACHADO',55,50],
  ['Mira','mage','wine','CAJADO_GELO',44,46],
  ['Theo','knight','sand','ESPADA_ACO',56,54],
  ['Ayla','rogue','ocean','ARCO',51,57],
  ['Davi','knight','forest','PORRETE',44,56]
]);
const distance = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const human = p => p && p.authed && !p._isBot && !p.disconnected && p.ws?.readyState === 1 && (p.hp ?? 0)>0 && (p.floor||0)===0;
const directions = [[0,1,'down'],[1,0,'right'],[0,-1,'up'],[-1,0,'left']];
const TASK_TYPES = ['RAT','SNAKE','SPIDER','WOLF','ORC'];
const TASK_LABELS = {RAT:'Caçar ratos',SNAKE:'Caçar serpentes',SPIDER:'Caçar aranhas',WOLF:'Caçar lobos',ORC:'Caçar orcs'};
const GEAR = {
  ESPADA_ACO:['ESPADA_ACO','LAMINA_DRACO_1H','ESPADA_GUARDIAO','ESPADA_GUARDIAO'],
  PORRETE:['PORRETE','MACA','ESPADA_ACO','LAMINA_DRACO_1H'],
  MACHADO:['MACHADO','MACHADO_MINO','ESPADA_DRACO','ESPADA_HL'],
  CAJADO_FOGO:['CAJADO_FOGO','CAJADO_RUNICO','CAJADO_ETERNO','CAJADO_ASTRAL'],
  CAJADO_GELO:['CAJADO_GELO','CAJADO_RUNICO','CAJADO_ETERNO','CAJADO_ASTRAL'],
  ARCO:['ARCO','ARCO_CACA','BESTA','BESTA']
};
const tierFor=(kills,level)=>Math.min(3,Math.floor(kills/8),Math.floor((level-1)/2));
const MAX_LEVEL=30;
const xpForLevel=level=>Math.round(45+level*25+level*level*8);
const taskFor=(completed,level)=>{
  const type=TASK_TYPES[(completed+Math.floor((level-1)/4))%TASK_TYPES.length];
  return {type,label:TASK_LABELS[type],progress:0,goal:3+Math.min(3,Math.floor(completed/3))};
};
const positiveInt=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;

function createCompanions({walkable,now=Date.now,count=10,onHit=()=>{},onKill=()=>{},onAssist=()=>{},
  onRetaliate=()=>0,safe=(x,y)=>distance({x,y},{x:50,y:50})<=4,attackRange=()=>1,initialState=[]}) {
  const bots=[],assistBudget=new WeakMap(),lastHumanAttack=new WeakMap();
  const good=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=2&&y>=2&&x<98&&y<98&&walkable(x,y);
  const occupied=(x,y,self,people)=>people.some(p=>p.x===x&&p.y===y)||bots.some(b=>b!==self&&b.x===x&&b.y===y);
  function nearest(x,y){
    for(let r=0;r<=12;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)
      if(Math.max(Math.abs(dx),Math.abs(dy))===r&&good(x+dx,y+dy)&&!bots.some(b=>b.x===x+dx&&b.y===y+dy))return {x:x+dx,y:y+dy};
    return null;
  }
  const savedById=new Map(Array.isArray(initialState)?initialState.map(b=>[b.id,b]):[]);
  for(const [i,row] of ROSTER.slice(0,Math.max(0,Math.min(10,Number.isFinite(count)?count:10))).entries()){
    const [name,body,palette,weapon,x,y]=row,start=nearest(x,y);if(!start)continue;
    const saved=savedById.get('companion-'+(i+1));
    const level=positiveInt(saved?.level,1,MAX_LEVEL)?saved.level:1;
    const kills=positiveInt(saved?.kills,0,1e9)?saved.kills:0;
    const deaths=positiveInt(saved?.deaths,0,1e9)?saved.deaths:0;
    const tasksCompleted=positiveInt(saved?.tasksCompleted,0,1e8)?saved.tasksCompleted:0;
    const gearTier=tierFor(kills,level);
    const maxHp=90+level*12;
    const task=taskFor(tasksCompleted,level);
    if(TASK_LABELS[saved?.task?.type]&&positiveInt(saved.task.progress,0,task.goal-1)){
      task.type=saved.task.type;task.label=TASK_LABELS[task.type];task.progress=saved.task.progress;
    }
    const bot={id:'companion-'+(i+1),name,...start,dir:'down',floor:0,automatic:true,
      equipped:{weapon:GEAR[weapon]?.[gearTier]||weapon},appearance:{v:1,body,palette},baseWeapon:weapon,
      state:'travel',activity:'Buscando caçada',lastActivityAt:now(),level,
      xp:positiveInt(saved?.xp,0,xpForLevel(level)-1)?saved.xp:0,xpToNext:xpForLevel(level),
      hp:positiveInt(saved?.hp,0,maxHp)?saved.hp:maxHp,maxHp,kills,deaths,tasksCompleted,task,gearTier,
      attackSeq:0,following:null,targetId:null,nextMove:now()+i*110,nextAttack:0,
      nextRetaliation:0,nextHeal:now()+3000,restUntil:0,recoverUntil:0,path:[],pathTarget:null,
      retryAt:0,aggressors:new Map(),defendOrigin:null};
    bots.push(bot);
  }
  const setActivity=(b,state,activity,time)=>{if(b.state!==state||b.activity!==activity){b.state=state;b.activity=activity;b.lastActivityAt=time;}};
  const touchedByHuman=m=>Object.values(m.damageBy||{}).some(v=>Number(v)>0);
  function availableMob(m,people,b){
    if(!m||!positiveInt(m.id,1,Number.MAX_SAFE_INTEGER)||m.hp<=0||!Number.isFinite(m.maxHp)||m.maxHp<=0||
      (m.floor||0)!==0||m.unique||m.hunter||m.expedition||m.automaton||m.dots?.length||touchedByHuman(m))return false;
    if(!good(m.x,m.y)||distance(m,{x:50,y:50})<=4)return false;
    if(people.some(p=>distance(p,m)<=8))return false;
    if(bots.some(other=>other!==b&&other.targetId===m.id))return false;
    if(m.level>Math.max(1,b.level+2)||m.dmg>Math.max(5,3+b.level*2))return false;
    if(m.maxHp>Math.max(65,45+b.level*40))return false;
    return true;
  }
  function route(b,goal,people,mobs,avoidSafe=false){
    // Four-neighbour BFS on the authoritative map. No diagonal cuts through walls.
    const start=b.x+','+b.y,queue=[{x:b.x,y:b.y}],seen=new Set([start]),prev=new Map();
    const blockedMob=new Set(mobs.filter(m=>m.hp>0&&m.id!==b.targetId).map(m=>m.x+','+m.y));
    let end=null;
    for(let q=0;q<queue.length&&q<10000;q++){
      const p=queue[q];
      if(distance(p,goal)<=1){end=p.x+','+p.y;break;}
      const ordered=directions.slice().sort((a,c)=>distance({x:p.x+a[0],y:p.y+a[1]},goal)-distance({x:p.x+c[0],y:p.y+c[1]},goal));
      for(const [dx,dy] of ordered){const x=p.x+dx,y=p.y+dy,key=x+','+y;
        if(seen.has(key)||!good(x,y)||(avoidSafe&&safe(x,y))||blockedMob.has(key)||occupied(x,y,b,people))continue;
        seen.add(key);prev.set(key,p.x+','+p.y);queue.push({x,y});
      }
    }
    if(!end)return [];
    const result=[];while(end!==start){const [x,y]=end.split(',').map(Number);result.push({x,y});end=prev.get(end);}
    return result.reverse();
  }
  function retreat(b,time){
    b.targetId=null;b.path=[];b.pathTarget=null;b.restUntil=time+5500;
    setActivity(b,'rest','Descansando',time);
  }
  function die(b,time){
    b.hp=0;b.deaths++;b.targetId=null;b.path=[];b.pathTarget=null;b.following=null;
    b.aggressors.clear();b.defendOrigin=null;
    b.recoverUntil=time+8000;b.restUntil=time+18000;
    const home=nearest(50,50);if(home){b.x=home.x;b.y=home.y;}
    setActivity(b,'recover','Recuperando-se na praça',time);
  }
  function progress(b,m,time){
    b.kills++;b.xp+=Math.max(1,Math.floor(m.xp||1));
    while(b.level<MAX_LEVEL&&b.xp>=xpForLevel(b.level)){
      b.xp-=xpForLevel(b.level);b.level++;b.maxHp=90+b.level*12;
      b.hp=Math.min(b.maxHp,b.hp+20);
    }
    if(b.level===MAX_LEVEL)b.xp=Math.min(b.xp,xpForLevel(MAX_LEVEL)-1);
    b.xpToNext=xpForLevel(b.level);
    if(m.type===b.task.type){b.task.progress++;if(b.task.progress>=b.task.goal){b.tasksCompleted++;b.task=taskFor(b.tasksCompleted,b.level);}}
    b.gearTier=tierFor(b.kills,b.level);
    b.equipped.weapon=GEAR[b.baseWeapon]?.[b.gearTier]||b.equipped.weapon;
    b.lastActivityAt=time;
  }
  function tick(players,monsters){
    const time=now(),people=Array.from(players).filter(human),mobs=Array.from(monsters).filter(m=>m.hp>0&&(m.floor||0)===0);
    for(const b of bots){
      let owner=people.find(p=>p.id===b.following);
      if(b.following!=null&&!owner){b.following=null;b.targetId=null;b.path=[];}
      if(b.hp<=0){
        if(time<b.recoverUntil){setActivity(b,'recover','Recuperando-se na praça',time);continue;}
        b.hp=Math.max(1,Math.floor(b.maxHp*.35));b.nextHeal=time+2000;
      }
      if(time>=b.nextHeal){
        if(b.state==='rest'||b.state==='recover')b.hp=Math.min(b.maxHp,b.hp+Math.max(2,Math.round(b.maxHp*.09)));
        b.nextHeal=time+2000;
      }
      for(const [id,until] of b.aggressors){
        const attacker=people.find(p=>p.id===id);
        if(until<=time||!attacker||safe(attacker.x,attacker.y)||safe(b.x,b.y)||
          distance(attacker,b)>8||(b.defendOrigin&&distance(attacker,b.defendOrigin)>8)||
          attacker.duel||attacker.arena)b.aggressors.delete(id);
      }
      if(b.aggressors.size){
        const attacker=people.filter(p=>b.aggressors.has(p.id))
          .sort((a,c)=>distance(b,a)-distance(b,c))[0];
        if(attacker){
          b.targetId=null;b.path=[];
          setActivity(b,'defend','Revidando '+attacker.name,time);
          const range=b.equipped.weapon.startsWith('ARCO')||b.equipped.weapon==='BESTA'||
            b.equipped.weapon.startsWith('CAJADO')?4:1;
          if(distance(b,attacker)<=range&&time>=b.nextAttack){
            b.attackSeq++;b.nextAttack=time+1100;
            const result=onRetaliate(attacker,b,Math.max(2,4+b.level*2+b.gearTier*2));
            if(result?.dead)b.aggressors.delete(attacker.id);
          }else if(time>=b.nextMove&&distance(b,attacker)>range){
            const steps=route(b,attacker,people.filter(p=>p.id!==attacker.id),mobs,true);
            const step=steps[0];
            if(step&&distance(step,b)<=1&&!occupied(step.x,step.y,b,people)&&!safe(step.x,step.y)){
              move(b,step);b.nextMove=time+650;
            }
          }
          continue;
        }
      }
      b.defendOrigin=null;
      if(owner){
        b.targetId=null;b.path=[];
        const assist=mobs.find(m=>(m.floor||0)===0&&!m.unique&&!m.hunter&&!m.expedition&&
          m.hp>1&&distance(owner,m)<=4&&distance(b,m)<=5&&Number(m.damageBy?.[owner.id])>0&&
          (assistBudget.get(m)||0)<Math.floor(m.maxHp*.15));
        if(assist){
          setActivity(b,'assist','Ajudando '+owner.name,time);
          if(distance(b,assist)<=1&&time>=b.nextAttack){
            const cap=Math.floor(assist.maxHp*.15),used=assistBudget.get(assist)||0;
            const amount=Math.max(0,Math.min(2,cap-used,assist.hp-1));
            if(amount>0){assist.hp-=amount;assistBudget.set(assist,used+amount);
              b.attackSeq++;b.nextAttack=time+1200;onAssist(assist,amount,b,owner);}
          }
        }else setActivity(b,'following','Acompanhando '+owner.name,time);
        const goal=assist||owner;
        if(time>=b.nextMove&&distance(b,goal)>(assist?1:2)){
          const steps=route(b,goal,people,mobs);if(steps.length){move(b,steps[0]);b.nextMove=time+650;}
        }
        continue;
      }
      if(time<b.restUntil||(!b.targetId&&b.hp<b.maxHp*.55)){
        if(b.hp<b.maxHp*.55)b.restUntil=Math.max(b.restUntil,time+2000);
        setActivity(b,'rest','Descansando',time);b.targetId=null;b.path=[];continue;
      }
      let m=mobs.find(x=>x.id===b.targetId);
      if(m&&!availableMob(m,people,b)){b.targetId=null;b.path=[];m=null;}
      if(!m&&time>=b.retryAt){
        const candidates=mobs.filter(x=>availableMob(x,people,b)&&distance(b,x)<=42)
          .sort((a,c)=>(distance(b,a)-(a.type===b.task.type?30:0))-
                        (distance(b,c)-(c.type===b.task.type?30:0))||a.maxHp-c.maxHp);
        for(const candidate of candidates.slice(0,12)){
          const steps=route(b,candidate,people,mobs);
          if(steps.length||distance(b,candidate)<=1){m=candidate;b.targetId=m.id;b.path=steps;b.pathTarget=m.id;break;}
        }
        if(!m)b.retryAt=time+2500;
      }
      if(!m){setActivity(b,'rest','Procurando monstros',time);continue;}
      if(distance(b,m)<=1){
        setActivity(b,'combat','Combatendo '+m.type,time);
        if(time>=b.nextAttack){
          // An autonomous hit and the monster's counter-hit both change real HP.
          // Human engagement is checked again immediately before any damage.
          if(!availableMob(m,people,b)){b.targetId=null;continue;}
          const damage=Math.min(m.hp,Math.max(3,5+b.level*2+b.gearTier*2));
          m.hp-=damage;b.attackSeq++;b.nextAttack=time+1100;
          onHit(m,damage,b);
          if(m.hp<=0){
            onKill(m,b);progress(b,m,time);retreat(b,time);continue;
          }
          if(time>=b.nextRetaliation){
            b.hp=Math.max(0,b.hp-Math.max(1,Math.floor(m.dmg||1)));
            b.nextRetaliation=time+Math.max(700,m.speed||1100);
            if(b.hp===0){die(b,time);continue;}
          }
        }
        continue;
      }
      setActivity(b,'travel','Indo caçar '+m.type,time);
      if(time<b.nextMove)continue;
      if(!b.path.length||b.pathTarget!==m.id||distance(b.path[b.path.length-1],m)>1)
        {b.path=route(b,m,people,mobs);b.pathTarget=m.id;}
      const step=b.path.shift();
      if(step&&good(step.x,step.y)&&!occupied(step.x,step.y,b,people)&&!mobs.some(x=>x.hp>0&&x.x===step.x&&x.y===step.y)){
        move(b,step);b.nextMove=time+650;
      }else{b.path=[];b.retryAt=time+1000;}
    }
  }
  function move(b,step){const dx=step.x-b.x,dy=step.y-b.y;b.dir=dx>0?'right':dx<0?'left':dy>0?'down':'up';b.x=step.x;b.y=step.y;}
  function command(player,message){
    if(!human(player))return {ok:false,reason:'unavailable'};
    if(message.action==='dismiss'){for(const b of bots)if(b.following===player.id){b.following=null;b.targetId=null;b.path=[];b.state='travel';}return {ok:true};}
    const b=bots.find(x=>x.id===message.id);
    if(!b||message.action!=='follow'||distance(player,b)>5)return {ok:false,reason:'too_far'};
    if([...b.aggressors.values()].some(until=>until>now()))return {ok:false,reason:'busy'};
    if(b.following!=null&&b.following!==player.id)return {ok:false,reason:'busy'};
    for(const other of bots)if(other.following===player.id){other.following=null;other.targetId=null;other.path=[];}
    b.following=player.id;b.targetId=null;b.path=[];b.state='following';return {ok:true};
  }
  function attack(player,id,{damage,delay=650}={}){
    const time=now(),b=bots.find(x=>x.id===id);
    if(!b)return {ok:false,id,reason:'not_found'};
    if(!human(player)||!player.joined||player.duel||player.arena)return {ok:false,id,reason:'unavailable'};
    if(!player.pvp)return {ok:false,id,reason:'pvp_off'};
    if(b.hp<=0||time<b.recoverUntil)return {ok:false,id,reason:'recovering'};
    if(safe(player.x,player.y)||safe(b.x,b.y))return {ok:false,id,reason:'safe_zone'};
    if(distance(player,b)>Math.max(1,Math.min(8,attackRange(player))))return {ok:false,id,reason:'out_of_range'};
    if(time-(lastHumanAttack.get(player)||0)<Math.max(400,delay))return {ok:false,id,reason:'cooldown'};
    const actual=Math.min(b.hp,Math.max(1,Math.floor(Number(damage)||1)));
    lastHumanAttack.set(player,time);
    b.hp-=actual;
    if(b.hp===0){die(b,time);return {ok:true,id,actual};}
    if(!b.aggressors.size)b.defendOrigin={x:b.x,y:b.y};
    b.aggressors.set(player.id,time+20000);
    b.following=null;b.targetId=null;b.path=[];
    setActivity(b,'defend','Revidando '+player.name,time);
    return {ok:true,id,actual};
  }
  function canAttack(player,b){
    return !!(human(player)&&player.joined&&!player.duel&&!player.arena&&b.hp>0&&
      now()>=b.recoverUntil&&!safe(player.x,player.y)&&!safe(b.x,b.y)&&
      distance(player,b)<=Math.max(1,Math.min(8,attackRange(player))));
  }
  const publicBot=(b,player)=>({id:b.id,name:b.name,x:b.x,y:b.y,dir:b.dir,floor:0,automatic:true,
    equipped:b.equipped,appearance:b.appearance,state:b.state,attackSeq:b.attackSeq,
    followingYou:!!player&&b.following===player.id,busy:b.following!=null&&(!player||b.following!==player.id),
    level:b.level,xp:b.xp,xpToNext:b.xpToNext,hp:b.hp,maxHp:b.maxHp,kills:b.kills,deaths:b.deaths,
    tasksCompleted:b.tasksCompleted,task:{label:b.task.label,progress:b.task.progress,goal:b.task.goal},
    activity:b.activity,lastActivityAt:b.lastActivityAt,
    hostileToYou:!!player&&b.aggressors.has(player.id)&&b.aggressors.get(player.id)>now(),
    canAttack:!!player&&canAttack(player,b)});
  function snapshot(player){if(!human(player))return [];return bots.map(b=>publicBot(b,player));}
  function adminSnapshot(){return {count:bots.length,totalKills:bots.reduce((n,b)=>n+b.kills,0),totalDeaths:bots.reduce((n,b)=>n+b.deaths,0),
    totalTasksCompleted:bots.reduce((n,b)=>n+b.tasksCompleted,0),actors:bots.map(b=>publicBot(b,null))};}
  function exportState(){return bots.map(b=>({id:b.id,level:b.level,xp:b.xp,hp:b.hp,kills:b.kills,deaths:b.deaths,
    tasksCompleted:b.tasksCompleted,task:{type:b.task.type,progress:b.task.progress}}));}
  return {tick,command,attack,snapshot,adminSnapshot,exportState,count:bots.length};
}
module.exports={createCompanions,ROSTER,xpForLevel};
