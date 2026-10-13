'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../play.html'),'utf8');
function setup(){
 const sent=[],timers=new Map();let timerId=0;
 const c={player:{quests:{active:{},completed:[]}},_wsAuthed:true,ws:{readyState:1,send:m=>sent.push(JSON.parse(m))},
  window:{valadaresAdventureGuide:{onAcceptPending:()=>{},onAcceptResult:()=>{}},ValadaresJourneyUI:{refresh:()=>{}}},
  questById:id=>id==='q_ratos'?{id}:null,questIsActive:id=>!!c.player.quests.active[id],questIsDone:id=>c.player.quests.completed.includes(id),
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),showServerToast:()=>{},
  LANG:'pt',qName:q=>q.id,tr:k=>k,log:()=>{},renderQuests:()=>{}};
 vm.createContext(c);const a=html.indexOf('const questAcceptRequests='),b=html.indexOf('function turnInQuest(',a);
 vm.runInContext(html.slice(a,b),c);return {c,sent,timers};
}
test('mission remains unaccepted until server confirms; duplicate click cannot race the save timer',()=>{
 const {c,sent}=setup();assert.equal(c.acceptQuest('q_ratos'),true);assert.equal(c.acceptQuest('q_ratos'),false);
 assert.deepEqual(c.player.quests.active,{});assert.deepEqual(sent,[{t:'questAccept',questId:'q_ratos'}]);
 c.receiveQuestAccept({ok:true,questId:'q_ratos',quests:{active:{q_ratos:{progress:1}},completed:[]}});
 assert.equal(c.player.quests.active.q_ratos.progress,1);assert.equal(c.acceptQuest('q_ratos'),false);
});
test('rejection, timeout and disconnect permit a new request without inventing progress',()=>{
 const {c,sent,timers}=setup();c.acceptQuest('q_ratos');c.receiveQuestAccept({ok:false,questId:'q_ratos'});
 assert.equal(c.player.quests.active.q_ratos,undefined);assert.equal(c.acceptQuest('q_ratos'),true);
 [...timers.values()][0]();assert.equal(c.acceptQuest('q_ratos'),true);
 c.clearQuestAcceptRequests();c._wsAuthed=false;assert.equal(c.acceptQuest('q_ratos'),false);
 c._wsAuthed=true;assert.equal(c.acceptQuest('q_ratos'),true);assert.equal(sent.length,4);
});
