const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../../training-rules');

test('old price through level 50 and approved progression above it', () => {
    assert.equal(rules.cost(1),5);
    assert.equal(rules.cost(10),20);
    assert.equal(rules.cost(50),100);
    assert.equal(rules.cost(51),107);
    assert.equal(rules.cost(100),800);
});

test('browser UMD and Node expose the same API', () => {
    const source=fs.readFileSync(path.join(__dirname,'..','..','training-rules.js'),'utf8');
    const browser={};
    vm.runInNewContext(source,browser);
    assert.equal(browser.ValadaresTrainingRules.cost(100),rules.cost(100));
    assert.equal(typeof browser.ValadaresTrainingRules.sessionXp,'function');
    assert.equal(typeof browser.ValadaresTrainingRules.quote,'function');
});

test('session XP mirrors base floor, integer cast and sequential round buffs', () => {
    const skill={val:50,xp:0,xpNext:180};
    assert.equal(rules.sessionXp(skill),3);
    assert.equal(rules.sessionXp(skill,{xpBonus:0.2}),4);
    assert.equal(rules.sessionXp(skill,{xpBonus:0.2,wisdom:true}),6);
    assert.equal(rules.sessionXp({xpNext:50}),1);
});

test('quote pays changing level prices, respects gold and does not mutate skill', () => {
    const skill={val:50,xp:59,xpNext:60};
    const copy={...skill};
    assert.deepEqual(rules.quote(skill,2,{gold:207}),{
        sessions:2,cost:207,skill:{val:51,xp:1,xpNext:69},
    });
    assert.deepEqual(rules.quote(skill,2,{gold:206}),{
        sessions:1,cost:100,skill:{val:51,xp:0,xpNext:69},
    });
    assert.deepEqual(rules.quote(skill,Infinity,{gold:206}),{
        sessions:1,cost:100,skill:{val:51,xp:0,xpNext:69},
    });
    assert.deepEqual(skill,copy);
});

test('level 100 to 110 keeps XP speed and costs 550100 gold without buffs', () => {
    let xpNext=50;
    for(let level=10;level<100;level++) xpNext=Math.floor(xpNext*1.15);
    const start={val:100,xp:0,xpNext};
    const result=rules.quote(start,601);
    assert.equal(result.sessions,601);
    assert.equal(result.skill.val,110);
    assert.equal(result.cost,550100);
    assert.equal(rules.quote(start,Infinity,{gold:result.cost-1}).sessions,600);
});

test('invalid and unbounded simulations fail without a loop', () => {
    const skill={val:10,xp:0,xpNext:50};
    for(const value of [NaN,Infinity,-1,1.5]) assert.throws(()=>rules.cost(value),RangeError);
    assert.throws(()=>rules.sessionXp(skill,{xpBonus:Infinity}),RangeError);
    assert.throws(()=>rules.quote(skill,Infinity),RangeError);
    assert.throws(()=>rules.quote(skill,Infinity,{gold:NaN}),RangeError);
    assert.throws(()=>rules.quote(skill,1.5),RangeError);
    assert.throws(()=>rules.quote({val:10,xp:50,xpNext:50},1),RangeError);
});

test('server training accepts fists with a wand, charges once and rejects incompatible equipment', () => {
    const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
    const start=source.indexOf("        if (msg.t === 'trainAttempt') {");
    const end=source.indexOf('        // ─── T3: Cast de magia',start);
    assert.ok(start>0 && end>start);
    const handler=source.slice(start,end);
    const helperStart=source.indexOf('function chebyshev(');
    const helperEnd=source.indexOf('}',helperStart);
    assert.ok(helperStart>0 && helperEnd>helperStart);
    const chebyshev=source.slice(helperStart,helperEnd+1);
    function attempt(weaponSkill,skill,gold=1000){
        const p={x:49,y:52,name:'fixture',gold,skills:{Punho:{val:100,xp:0,xpNext:600},Espada:{val:100,xp:0,xpNext:600}}};
        const messages=[];
        const requestId='9b235fa2-2660-4b64-9b0d-b2aec2c03718';
        const context={p,id:'fixture',msg:{t:'trainAttempt',skill,requestId},trainingRules:rules,
            weaponSkillOf:()=>weaponSkill,hasShieldEquipped:()=>false,
            I18N_SRV:{pt:{}},trp:()=> 'rejected',sendTo:(_id,m)=>messages.push(m),
            syncGoldRank:()=>{},gainSkillXpServer:(player,name,xp)=>{player.skills[name].xp+=xp;},
            sendInvUpdate:(_p,m)=>messages.push(m)};
        vm.runInNewContext(chebyshev+'\n(function(){'+handler+'})()',context);
        return {p,messages,requestId};
    }
    const wand=attempt('Magia','Punho');
    assert.equal(wand.p.gold,200);
    assert.equal(wand.p.skills.Punho.xp,10);
    assert.equal(wand.messages.at(-1).trainResult.ok,true);
    assert.equal(wand.messages.at(-1).trainResult.requestId,wand.requestId);
    const mismatch=attempt('Espada','Punho');
    assert.equal(mismatch.p.gold,1000);
    assert.equal(mismatch.p.skills.Punho.xp,0);
    assert.equal(mismatch.messages.at(-1).trainResult.ok,false);
    assert.equal(mismatch.messages.at(-1).trainResult.requestId,mismatch.requestId);
    const poor=attempt('Magia','Punho',799);
    assert.equal(poor.p.gold,799);
    assert.equal(poor.p.skills.Punho.xp,0);
    assert.equal(poor.messages.at(-1).trainResult.ok,false);
});
