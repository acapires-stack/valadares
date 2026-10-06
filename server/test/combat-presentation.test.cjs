// Exercise the real client presentation queue with a controlled frame/audio clock.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../play.html'),'utf8');
const start=html.indexOf('const confirmedCombatSounds = new Map();');
const end=html.indexOf("document.addEventListener('visibilitychange',()=>{if(document.hidden)clearConfirmedCombatSounds();});",start);
assert(start>=0&&end>start);
let now=0,nextId=0;const timers=new Map(),frames=new Map(),sounds=[];
const actor={attackContactAt:405,attackStartedAt:0,attackSequence:1},deathVisuals=new Map();
const context={Map,String,Math,Number,started:true,player:{floor:0,target:9,equipped:{weapon:'ESPADA'}},document:{hidden:false},performance:{now:()=>now},
    monsters:[{id:9,type:'RAT',x:10,y:10,hp:18}],
    window:{ValadaresModern:{state:'ready',renderer:{actors:{entries:new Map([['self',actor]]),
        retainConfirmedDeath:d=>{deathVisuals.set(d.eventId,{...d});return true;},
        cancelConfirmedDeath:id=>deathVisuals.delete(id),clearCombatPresentation:()=>deathVisuals.clear()}}}},
    playGameSound:(kind,details)=>sounds.push({kind,...details,time:now}),
    sndKill:()=>sounds.push({kind:'kill',time:now}),
    setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++nextId;frames.set(id,fn);return id;},
    cancelAnimationFrame:id=>frames.delete(id)};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
const hit=id=>({amount:10,floor:0,eventId:id,targetId:9,weaponType:'melee'});
function frame(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());}
function advance(to){while(true){const next=[...timers].filter(([,v])=>v.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=to;}
function reset(){context.clearConfirmedCombatSounds();sounds.length=0;now=0;actor.attackContactAt=405;actor.attackStartedAt=0;actor.attackSequence=1;context.player.floor=0;context.player.target=9;context.player.equipped.weapon='ESPADA';context.document.hidden=false;context.started=true;context.monsters=[{id:9,type:'RAT',x:10,y:10,hp:18}];}
context.queueConfirmedCombatSound(hit('one'));context.queueConfirmedCombatSound(hit('one'));frame();
advance(404);assert.equal(sounds.length,0,'confirmed damage waits for contact');
advance(405);assert.equal(sounds.length,1);assert.equal(sounds[0].eventId,'one');
now=680;actor.attackContactAt=1085;context.queueConfirmedCombatSound(hit('two'));frame();advance(1085);
assert.deepEqual(sounds.map(s=>s.time),[405,1085],'two real-cadence swings each emit once');
reset();actor.attackContactAt=1500;context.queueConfirmedCombatSound(hit('cap'));frame();advance(500);assert.equal(sounds.length,1,'presentation delay caps at 500ms');
reset();context.queueConfirmedCombatSound(hit('stalled'));now=600;frame();advance(700);assert.equal(sounds.length,0,'a stalled frame never replays an expired sound');
reset();context.queueConfirmedCombatSound(hit('lethal'));frame();advance(40);context.clearConfirmedCombatSounds(9);advance(500);assert.equal(sounds.length,0,'death before contact cancels late impact');
reset();context.queueConfirmedCombatSound(hit('target'));frame();context.player.target=10;advance(500);assert.equal(sounds.length,0,'new target never receives old sound');
reset();context.queueConfirmedCombatSound(hit('weapon'));frame();context.player.equipped.weapon='ARCO';advance(500);assert.equal(sounds.length,0,'new weapon never receives old sound');
reset();context.queueConfirmedCombatSound(hit('sequence'));frame();actor.attackSequence=2;advance(500);assert.equal(sounds.length,0,'new gesture never receives previous impact');
reset();context.player.target=null;context.queueConfirmedCombatSound(hit('cleared'));frame();advance(500);assert.equal(sounds.length,0,'ack after target cleared stays silent');
reset();context.queueConfirmedCombatSound(hit('floor'));frame();context.player.floor=1000;advance(500);assert.equal(sounds.length,0,'new floor never receives old sound');
reset();context.queueConfirmedCombatSound(hit('pause'));frame();context.document.hidden=true;advance(500);assert.equal(sounds.length,0,'hidden page does not sound pending hit');
reset();context.queueConfirmedCombatSound(hit('disconnect'));context.clearConfirmedCombatSounds();frame();advance(500);assert.equal(sounds.length,0,'disconnect cancels frame and timer');
reset();context.queueConfirmedCombatSound({...hit('zero'),amount:0});frame();advance(500);assert.equal(sounds.length,0,'unconfirmed zero damage stays silent');
reset();context.queueConfirmedCombatSound({...hit('lethal-contact'),attackPresentationAt:0});
assert.equal(context.presentConfirmedMobDeath(9,true),true,'confirmed lethal sound deferred');
context.monsters.length=0;context.player.target=10; // authority removed dead target; auto selection advanced
frame();assert.equal(context.monsters.length,0,'retention never restores gameplay monsters');
advance(404);assert.equal(sounds.length,0);advance(405);
assert.deepEqual(sounds.map(s=>s.kind),['impact','kill'],'one impact then death at original contact');
assert.equal(deathVisuals.get('lethal-contact').targetId,9,'visual remains bound to original victim');
assert.equal(deathVisuals.get('lethal-contact').contactAt,405,'visual and sound share deadline');
reset();context.queueConfirmedCombatSound({...hit('slow-ack'),attackPresentationAt:0});
// The server's acknowledgement for attack #1 arrives while attack #2 is preparing.
context.clearConfirmedCombatSounds();now=900;actor.attackStartedAt=680;actor.attackSequence=2;actor.attackContactAt=1085;
context.queueConfirmedCombatSound({...hit('slow-ack'),attackPresentationAt:0});context.presentConfirmedMobDeath(9,true);frame();
assert.deepEqual(sounds.map(s=>s.time),[900,900],'900ms acknowledgement presents immediately, never borrows next gesture');
assert.equal(deathVisuals.get('slow-ack').contactAt,900);
reset();context.queueConfirmedCombatSound(hit('lethal-cancel'));context.presentConfirmedMobDeath(9,true);context.clearConfirmedCombatSounds();frame();advance(500);
assert.equal(sounds.length,0);assert.equal(deathVisuals.size,0,'manual cancellation/disconnect clears retained visuals and audio');
console.log(JSON.stringify({pass:true,checks:['contact deadline','one sound per pending event','two swings at 680ms cadence','500ms upper bound','expired stalled frame discarded','target switch','weapon switch','gesture superseded','ack after target cleared','floor switch','hidden page','disconnect','zero damage silent','lethal impact before kill at contact','original victim survives only as visual','900ms ack never borrows next animation','lethal cancellation clears visual and sound']}));
