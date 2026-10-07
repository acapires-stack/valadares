// Executes the client presentation block with a controlled clock and no account.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../play.html'),'utf8');
const start=html.indexOf('const confirmedCombatSounds = new Map();');
const end=html.indexOf("document.addEventListener('visibilitychange',()=>{if(document.hidden)clearConfirmedCombatSounds();});",start);
assert(start>=0&&end>start);
let now=0,serial=0;
const timers=new Map(),frames=new Map(),listeners=new Map(),sounds=[],projectiles=[],floats=[];
const deaths=new Map();
const actor={attackContactAt:0,attackStartedAt:0,attackSequence:0};
const context={Map,String,Math,Number,started:true,projectiles,
 player:{floor:0,target:9,targetType:'monster',equipped:{weapon:'ARCO'}},
 document:{hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn)},
 performance:{now:()=>now},monsters:[{id:9,type:'RAT',x:10,y:10,renderX:10,renderY:10}],
 window:{ValadaresModern:{state:'ready',renderer:{actors:{entries:new Map([['self',actor]]),
  retainConfirmedDeath:d=>{deaths.set(d.eventId,{...d});return true;},
  cancelConfirmedDeath:id=>deaths.delete(id),clearCombatPresentation:()=>deaths.clear()}}}},
 playGameSound:(kind,details)=>sounds.push({kind,time:now,...details}),
 sndKill:()=>sounds.push({kind:'kill',time:now}),
 addFloat:(x,y,text)=>floats.push({x,y,text,time:now}),
 setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;},
 clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},
 cancelAnimationFrame:id=>frames.delete(id)};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
const facingStart=html.indexOf('function faceAttackTarget(target){');
const facingEnd=html.indexOf('// Arremesso de lança',facingStart);
assert(facingStart>=0&&facingEnd>facingStart);
vm.runInContext(html.slice(facingStart,facingEnd),context);
context.player.x=0;context.player.y=0;
for(const [x,y,expected]of [[-2,0,'left'],[2,0,'right'],[0,-2,'up'],[0,2,'down']]){
 context.faceAttackTarget({x,y});assert.equal(context.player.dir,expected);
}
function advance(to){
 while(true){const next=[...timers].filter(([,v])=>v.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];
  if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}
 now=to;
}
function gesture(phase,sequence,contactAt){listeners.get('valadares:actor-gesture')({detail:{actorId:'self',phase,sequence,contactAt,weaponKind:'bow'}});}
function shot(at,targetId=9){
 now=at;
 context.queuePresentedRangedShot({attackPresentationAt:at,targetId,targetType:'monster',weapon:'ARCO',floor:0,sound:'ranged',
  projectile:{x:0,y:0,startX:0,startY:0,endX:10,endY:10,color:'#a06030',arrow:true,life:0,duration:100}});
}
function ack(id,at,targetId=9){now=at;context.queueConfirmedCombatSound({amount:7,floor:0,eventId:id,targetId,weaponType:'ranged',attackPresentationAt:at===0?0:undefined});}
shot(0);now=5;gesture('prepare',1,100);context.queueConfirmedCombatSound({amount:7,floor:0,eventId:'first',targetId:9,weaponType:'ranged',attackPresentationAt:0});
context.presentConfirmedMobDeath(9,true);
assert.equal(deaths.get('first').contactAt,200,'victim remains drawn from confirmation through landing');
assert.equal(context.queueConfirmedMobFloat({mobId:9,text:'-7',crit:false}),true,'own server float is held');
advance(99);assert.equal(projectiles.length,0);assert.equal(sounds.length,0);assert.equal(floats.length,0);
advance(100);gesture('contact',1,100);assert.equal(projectiles.length,1);assert.deepEqual(sounds.map(s=>s.kind),['ranged']);
assert.equal(deaths.get('first').contactAt,200,'death visual is scheduled for landing');
advance(199);assert.equal(floats.length,0);
advance(200);assert.deepEqual(sounds.map(s=>s.kind),['ranged','impact','kill']);assert.equal(floats.length,1);
assert.equal(floats[0].time,200);
context.queueConfirmedCombatSound({amount:7,floor:0,eventId:'first',targetId:9,weaponType:'ranged',attackPresentationAt:0});
advance(201);assert.deepEqual(sounds.map(s=>s.kind),['ranged','impact','kill'],'duplicate acknowledgement after landing is silent');
// Three overlapping flights keep their own confirmation even after target changes.
shot(300);now=305;gesture('prepare',2,350);
context.queueConfirmedCombatSound({amount:7,floor:0,eventId:'second',targetId:9,weaponType:'ranged',attackPresentationAt:300});
shot(450);now=455;gesture('prepare',3,500);
context.queueConfirmedCombatSound({amount:7,floor:0,eventId:'third',targetId:9,weaponType:'ranged',attackPresentationAt:450});
context.player.target=10;context.player.equipped.weapon='BESTA';
advance(600);assert.deepEqual(sounds.filter(s=>s.kind==='impact').map(s=>s.time),[200,450,600]);
assert.equal(projectiles.length,3);
// A late acknowledgement stays with its original shot, never borrows the next gesture.
context.player.equipped.weapon='ARCO';shot(700);now=705;gesture('prepare',4,750);advance(850);
context.player.target=10;now=900;
context.queueConfirmedCombatSound({amount:7,floor:0,eventId:'late',targetId:9,weaponType:'ranged',attackPresentationAt:700});
advance(900);assert.equal(sounds.filter(s=>s.kind==='impact').at(-1).eventId,'late');
// Missing acknowledgement and a missing gesture cannot invent an impact.
context.player.target=9;shot(1000);advance(1700);
assert.equal(projectiles.length,5,'missing gesture has bounded release fallback');
assert.equal(sounds.filter(s=>s.kind==='impact').length,4);
context.clearConfirmedCombatSounds();shot(1800);now=1805;gesture('prepare',5,1900);context.clearConfirmedCombatSounds();advance(2000);
assert.equal(projectiles.length,5,'cancellation clears pending launch');
context.player.equipped.weapon='BESTA';now=2100;
context.queuePresentedRangedShot({attackPresentationAt:2100,targetId:'p2',targetType:'player',weapon:'BESTA',floor:0,sound:'ranged',kind:'crossbow',
 projectile:{x:0,y:0,startX:0,startY:0,endX:3,endY:0,arrow:true,life:0,duration:120}});
now=2105;gesture('prepare',6,2150);
context.queueConfirmedCombatSound({amount:4,floor:0,eventId:'pvp',targetId:'p2',targetType:'player',weaponType:'ranged',attackPresentationAt:2100});
advance(2270);assert.equal(sounds.filter(s=>s.eventId==='pvp').length,1,'PvP crossbow confirmation lands once');
console.log(JSON.stringify({pass:true,checks:['four target directions','release','victim retained continuously until landing','landing death impact and one confirmed float','duplicate ack exactly once','three independent shots','late ack','missing ack and gesture fallback','cancel','PvP crossbow']}));
