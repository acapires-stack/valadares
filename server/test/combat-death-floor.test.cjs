// Real DoT death and client handlers, with only surrounding game services isolated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const server=fs.readFileSync(path.join(root,'server/server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'play.html'),'utf8');
const sent=[],broadcasts=[],credits=[];
const killer={id:7,name:'synthetic',floor:1000,skills:{},ws:{readyState:1,send:raw=>sent.push(JSON.parse(raw))}};
const mob={id:99,type:'RAT',floor:0,x:44,y:45,hp:0,xp:5,level:1};
const backend={players:new Map([[7,killer]]),monsters:new Map([[99,mob]]),
  grantMobLoot:()=>({loot:[{type:'OSSO',qty:1}],drops:[{id:44,type:'OSSO',qty:1,x:44,y:45}],isBoss:false}),
  grantManaOnKill:()=>credits.push('mana'),weaponSkillOf:()=> 'Magia',
  gainSkillXpServer:()=>credits.push('xp'),gainPetXp:()=>null,creditQuestKill:()=>credits.push('quest'),
  sendInvUpdate:()=>credits.push('inventory'),broadcast:(except,msg,floor)=>broadcasts.push({msg,floor}),
  bumpMobKill:()=>credits.push('rank'),sharePartyKill:()=>credits.push('party')};
vm.createContext(backend);
vm.runInContext(server.slice(server.indexOf('function handleMobDeath('),server.indexOf('// Ticka DoTs em mobs')),backend);
backend.handleMobDeath(mob,7);
assert.equal(backend.monsters.size,0,'authoritative death is immediate despite killer changing floor');
assert.deepEqual(credits,['mana','xp','quest','inventory','rank','party'],'remote killer retains all immediate rewards');
const message=sent.find(m=>m.t==='mobKill');assert.equal(message.floor,0);
assert(broadcasts.every(b=>b.floor===0),'death and ground updates stay on originating floor');

const sounds=[],floats=[],groundItems=[],visuals=[];let pickups=0,stats=0,quests=0,logs=0;
const frontend={Map,String,Math,Number,document:{hidden:false},performance:{now:()=>20},
  player:{floor:1000,equipped:{weapon:'CAJADO_FOGO'},target:null},monsters:[],groundItems,
  MTYPE:{RAT:{}},ITEMS:{OSSO:{},CAJADO_FOGO:{skill:'Magia'}},nextItemId:100,
  window:{ValadaresModern:{state:'ready',renderer:{actors:{retainConfirmedDeath:p=>{visuals.push(p);return true;}}}}},
  sndKill:()=>sounds.push('kill'),statsRecordMobKill:()=>stats++,notifyMobKilledForQuests:()=>quests++,
  mobName:t=>t,skillDisp:t=>t,tr:t=>t,log:()=>logs++,addFloat:(...args)=>floats.push(args),pickupAt:()=>pickups++,console};
vm.createContext(frontend);
const queueStart=html.indexOf('const confirmedCombatSounds = new Map();');
const queueEnd=html.indexOf("document.addEventListener('visibilitychange',()=>{if(document.hidden)clearConfirmedCombatSounds();});",queueStart);
vm.runInContext(html.slice(queueStart,queueEnd),frontend);
const killFnStart=html.indexOf('function mobKilledByServer(');
const killFnEnd=html.indexOf('// ─── Multiplayer authoritative state',killFnStart);
vm.runInContext(html.slice(killFnStart,killFnEnd),frontend);
const handlerStart=html.indexOf("} else if (msg.t === 'mobKill'){")+"} else if (msg.t === 'mobKill'){".length;
const handlerEnd=html.indexOf("} else if (msg.t === 'mobMissing'){",handlerStart);
vm.runInContext('function receiveDeath(msg){'+html.slice(handlerStart,handlerEnd)+'}',frontend);
frontend.receiveDeath(message);
assert.equal(stats,1);assert.equal(quests,1);assert.equal(logs,1,'client reports reward immediately');
assert.equal(visuals.length,0);assert.equal(sounds.length,0);assert.equal(floats.length,0);
assert.equal(groundItems.length,0);assert.equal(pickups,0,'remote DoT death never changes presentation or pickup in new floor');
frontend.player.floor=0;frontend.receiveDeath(message);
assert.equal(visuals.length,1,'known same-floor death can reconstruct a visual snapshot');
assert.equal(visuals[0].floor,0);assert.equal(sounds.length,1);assert.equal(groundItems.length,1);assert.equal(pickups,1);
assert.equal(frontend.monsters.length,0,'visual snapshot never resurrects a gameplay target');
frontend.player.floor=1000;const unknown={...message};delete unknown.floor;
frontend.receiveDeath(unknown);assert.equal(visuals.length,1,'unproven legacy origin cannot synthesize a victim in new area');
assert.equal(sounds.length,1);
console.log(JSON.stringify({pass:true,checks:['real DoT death after killer floor transition','server XP quest inventory rank rewards immediate','death carries original floor','death and drops broadcast on original floor','remote death no corpse sound drops float or pickup in new room','same-floor snapshot remains visual only','legacy unknown origin cannot create corpse']}));
