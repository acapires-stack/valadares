'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../play.html'),'utf8');
function excerpt(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
function client(){
 const actors=[{id:'companion-1',name:'Lia',x:55,y:50,renderX:55,renderY:50,hp:100,maxHp:100,canAttack:true}],sent=[];
 const context={window:{ValadaresCompanions:{getAll:()=>actors}},started:true,_wsAuthed:true,WebSocket:{OPEN:1},
  ws:{readyState:1,send:m=>sent.push(JSON.parse(m))},player:{x:54,y:50,renderX:54,renderY:50,hp:100,pvp:false,equipped:{weapon:null},attackTimer:0},
  enablePvpWhiteSkull:()=>{context.player.pvp=true;return true;},faceAttackTarget:()=>{},effectiveAttackDelay:()=>650,
  ITEMS:{},ELEMENT_COL:{},projectiles:[],LANG:'pt',addFloat:()=>{},log:()=>{},monsters:[],remotePlayers:{},
  VP_W:22,VP_H:16,getCamera:()=>({x:45,y:45}),targetScore:()=>0};
 vm.createContext(context);
 vm.runInContext(excerpt('function attackCompanion(id){','function stopTraining(reason){'),context);
 vm.runInContext(excerpt('function getBattleList(){','function mobWeaknessIcons('),context);
 vm.runInContext(excerpt('function targetNearest(cycle, silent){','function clearTarget(){'),context);
 return {context,actors,sent};
}
test('explicit companion selection survives sidebar refresh and repeats only authoritative attack intents',()=>{
 const {context:c,sent}=client();assert.equal(c.attackCompanion('companion-1'),true);
 vm.runInContext(excerpt('    // Limpa alvo se o monstro alvo morreu/sumiu','    renderTargetWidget();'),c);
 assert.equal(c.player.target,'companion-1');assert.equal(c.player.targetType,'companion');
 c.tickCompanionAttack();c.tickCompanionAttack();assert.equal(sent.length,1);
 c.player.attackTimer=0;c.tickCompanionAttack();
 assert.deepEqual(sent,[{t:'companionAttack',id:'companion-1'},{t:'companionAttack',id:'companion-1'}]);
 c.onCompanionAttackResult({id:'companion-1',ok:false,reason:'cooldown'});assert.equal(c.player.autoAttack,true);
 c.onCompanionAttackResult({id:'companion-1',ok:false,reason:'safe_zone'});assert.equal(c.player.autoAttack,false);
});
test('peaceful actors never enter passive selection; explicit or hostile actors appear in battle list',()=>{
 const {context:c,actors}=client();c.player.pvp=true;c.targetNearest(false,true);
 assert.equal(c.player.target,undefined);assert.equal(c.getBattleList().length,0);
 actors[0].hostileToYou=true;assert.equal(c.getBattleList()[0].type,'companion');
 c.targetNearest(false,true);assert.equal(c.player.target,undefined);
 actors[0].hostileToYou=false;c.attackCompanion('companion-1');assert.equal(c.getBattleList().length,1);
});
test('invalid target or PvP requirement stops attack without sending a combat message',()=>{
 const {context:c,actors,sent}=client();c.enablePvpWhiteSkull=()=>false;
 assert.equal(c.attackCompanion('companion-1'),false);assert.equal(sent.length,0);
 c.enablePvpWhiteSkull=()=>{c.player.pvp=true;return true;};c.attackCompanion('companion-1');
 actors[0].canAttack=false;c.tickCompanionAttack();assert.equal(c.player.target,null);assert.equal(sent.length,0);
 actors.length=0;assert.equal(c.attackCompanion('companion-1'),false);
});
