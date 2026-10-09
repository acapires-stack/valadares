'use strict';

// Shared, explicitly automatic adventurers. They never enter the player/account maps.
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

function createCompanions({walkable, now=Date.now, count=10, onAssist=()=>{}}) {
  const bots=[], assistBudget=new WeakMap();
  const good=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=2&&y>=2&&x<98&&y<98&&walkable(x,y);
  function nearest(x,y) {
    for(let r=0;r<=8;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)
      if(Math.max(Math.abs(dx),Math.abs(dy))===r&&good(x+dx,y+dy)&&!bots.some(b=>b.x===x+dx&&b.y===y+dy))return {x:x+dx,y:y+dy};
    return null;
  }
  for(const [i,row] of ROSTER.slice(0,Math.max(0,Math.min(10,Number.isFinite(count)?count:10))).entries()) {
    const [name,body,palette,weapon,x,y]=row, start=nearest(x,y); if(!start)continue;
    const points=[[x,y],[x-4,y+2],[x+3,y+4],[x+4,y-3]].map(([a,b])=>nearest(a,b)).filter(Boolean);
    bots.push({id:'companion-'+(i+1),name,...start,dir:'down',floor:0,automatic:true,
      equipped:{weapon},appearance:{v:1,body,palette},state:'patrol',route:points,waypoint:i%points.length,
      nextMove:now()+i*110,nextAttack:0,attackSeq:0,following:null,pauseUntil:0});
  }
  function nextStep(bot,goal,people) {
    const blocked=(x,y)=>!good(x,y)||people.some(p=>p.x===x&&p.y===y)||bots.some(b=>b!==bot&&b.x===x&&b.y===y);
    const queue=[{x:bot.x,y:bot.y,first:null}], seen=new Set([bot.x+','+bot.y]);
    for(let j=0;j<queue.length&&j<700;j++) {
      const p=queue[j];
      if(p.first&&distance(p,goal)<=1)return p.first;
      const ordered=directions.slice().sort((a,b)=>distance({x:p.x+a[0],y:p.y+a[1]},goal)-distance({x:p.x+b[0],y:p.y+b[1]},goal));
      for(const [dx,dy,dir] of ordered){const x=p.x+dx,y=p.y+dy,key=x+','+y;if(seen.has(key)||blocked(x,y))continue;seen.add(key);queue.push({x,y,first:p.first||{x,y,dir}});}
    }
    return null;
  }
  function tick(players,monsters) {
    const time=now(), people=Array.from(players).filter(human), mobs=Array.from(monsters);
    for(const b of bots) {
      let owner=people.find(p=>p.id===b.following);
      if(b.following!=null&&!owner){b.following=null;b.state='patrol';}
      // A live human must already have damaged a normal monster. Total assistance
      // from the entire roster is capped at 15% of its HP; a human lands the last hit.
      let target=null, helper=null;
      for(const m of mobs) {
        if((m.floor||0)!==0||m.unique||m.hp<=1||distance(b,m)>5)continue;
        const p=people.find(p=>(owner?p.id===owner.id:true)&&distance(p,m)<=4&&(m.damageBy?.[p.id]||0)>0);
        if(!p)continue;
        const maxHp=Math.max(1,m.maxHp||m.hp), budget=assistBudget.get(m);
        if((budget?.damage||0)>=Math.floor(maxHp*.15))continue;
        if(!target||distance(b,m)<distance(b,target)){target=m;helper=p;}
      }
      if(target&&distance(b,target)<=1&&time>=b.nextAttack) {
        const cap=Math.floor((target.maxHp||target.hp)*.15), used=assistBudget.get(target)?.damage||0;
        const amount=Math.max(0,Math.min(2,cap-used,target.hp-1));
        if(amount>0) {
          target.hp-=amount;assistBudget.set(target,{damage:used+amount});
          b.attackSeq++;b.nextAttack=time+1200;b.state='assist';
          b.dir=Math.abs(target.x-b.x)>Math.abs(target.y-b.y)?target.x>b.x?'right':'left':target.y>b.y?'down':'up';
          onAssist(target,amount,b,helper);
        }
      }
      if(time<b.nextMove)continue;
      b.nextMove=time+650;
      let goal=target||owner||b.route[b.waypoint];
      if(target){b.state='assist';}
      else if(owner){b.state='following';if(distance(b,owner)<=2)continue;}
      else {
        if(time<b.pauseUntil){b.state='rest';continue;}
        b.state='patrol';
        if(distance(b,goal)<=1){b.waypoint=(b.waypoint+1)%b.route.length;b.pauseUntil=time+2500+(Number(b.id.split('-')[1])%4)*800;b.state='rest';continue;}
      }
      // Do not teleport to the human or follow into dungeons/interiors.
      if(target&&distance(b,target)<=1)continue;
      const step=nextStep(b,goal,people);if(step)Object.assign(b,step);else if(!owner&&!target)b.waypoint=(b.waypoint+1)%b.route.length;
    }
  }
  function command(player,message) {
    if(!human(player))return {ok:false,reason:'unavailable'};
    if(message.action==='dismiss'){for(const b of bots)if(b.following===player.id){b.following=null;b.state='patrol';}return {ok:true};}
    const b=bots.find(b=>b.id===message.id);
    if(!b||message.action!=='follow'||distance(player,b)>5)return {ok:false,reason:'too_far'};
    if(b.following!=null&&b.following!==player.id)return {ok:false,reason:'busy'};
    for(const other of bots)if(other.following===player.id)other.following=null;
    b.following=player.id;b.state='following';return {ok:true};
  }
  function snapshot(player) {
    if(!human(player))return [];
    return bots.map(({id,name,x,y,dir,equipped,appearance,state,attackSeq,following})=>({id,name,x,y,dir,equipped,appearance,state,attackSeq,automatic:true,floor:0,followingYou:following===player.id,busy:following!=null&&following!==player.id}));
  }
  return {tick,command,snapshot,count:bots.length};
}
module.exports={createCompanions,ROSTER};
