// Offline protocol regression: evaluates the real server position handler with
// an isolated player and simulated ordered WebSocket delivery. No live server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MovementSync } = require('../../movement-sync');

const source = fs.readFileSync(path.join(__dirname, '../../server/server.js'), 'utf8');
const helpers = source.slice(source.indexOf('function movementSnapshot('), source.indexOf('function snapshotPlayers('));
const handler = source.slice(source.indexOf("if (msg.t === 'pos') {"), source.indexOf("if (msg.t === 'pvp') {", source.indexOf("if (msg.t === 'pos') {")));
assert(helpers.includes('function correctMovement(') && handler.includes("t:'posAck'"));

function scenario(version, uplink, downlink, duration = 5000) {
    let now = 0, lastUp = 0, lastDown = 0, sent = 0, accepted = 0;
    const queue = [], replies = [], p = {id:'test', x:10, y:10, dir:'right', floor:0, movementVersion:version};
    const client = new MovementSync();
    const sandbox = {
        Date: {now: () => now}, M_W:100, M_H:100, SAFE_CX:50, SAFE_CY:50,
        chebyshev: (ax,ay,bx,by) => Math.max(Math.abs(ax-bx),Math.abs(ay-by)),
        playerTileWalkable: () => true, creditQuestVisit: () => {}, bumpMobAwayFrom: () => {},
        broadcast: () => {}, sendTo: (_id,msg) => {
            replies.push(msg);
            const due = lastDown = Math.max(lastDown, now + downlink(replies.length));
            queue.push({due, order:queue.length, kind:'down', msg});
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${helpers}\nthis.onPos=function(msg,p,id){ ${handler} }`, sandbox);
    sandbox.p = p;
    if (version === 1) client.reset(vm.runInContext('movementSnapshot(p,true)', sandbox));
    else client.reset(undefined);
    let localX = 10;
    for (now = 0; now <= duration; now += 10) {
        if (now % 80 === 0 && client.canMove()) {
            const msg = client.step(localX + 1, 10, 'right', 0);
            if (msg) {
                localX++;
                sent++;
                const due = lastUp = Math.max(lastUp, now + uplink(sent));
                queue.push({due, order:queue.length, kind:'up', msg});
            }
        }
        while (true) {
            const idx = queue.findIndex(e => e.due <= now);
            if (idx < 0) break;
            const item = queue.splice(idx,1)[0];
            if (item.kind === 'up') {
                const before = p.x;
                sandbox.onPos(item.msg,p,p.id);
                if (p.x !== before) accepted++;
            } else if (item.msg.t === 'posAck') client.ack(item.msg);
            else if (item.msg.t === 'posCorrect' && client.correct(item.msg)) localX = item.msg.x;
        }
    }
    return {sent, accepted, serverX:p.x, clientX:localX, corrections:client.corrections,
        reasons:replies.filter(x => x.t === 'posCorrect').map(x => x.reason)};
}

for (const delay of [30,120,400,1200]) {
    const result = scenario(1, () => delay, () => delay, 7000);
    assert.equal(result.corrections, 0, `constant ${delay}ms: ${JSON.stringify(result)}`);
    assert(result.sent - result.accepted <= 4, `window ${delay}ms: ${JSON.stringify(result)}`);
    console.log(`v1 ${delay}ms each way`, result);
}
const jitter = scenario(1, n => [30,120,400,1200][n%4], n => [1200,30,400,120][n%4], 9000);
assert.equal(jitter.corrections, 0, `ordered jitter: ${JSON.stringify(jitter)}`);
console.log('v1 ordered jitter', jitter);

const burst = n => Math.max(0, 1200 - (n-1)*80);
const legacyBurst = scenario(0, burst, () => 30, 2200);
const boundedBurst = scenario(1, burst, () => 30, 2200);
assert(legacyBurst.corrections > 0, `legacy burst must reproduce correction: ${JSON.stringify(legacyBurst)}`);
assert.equal(boundedBurst.corrections, 0, `bounded burst: ${JSON.stringify(boundedBurst)}`);
console.log('legacy burst', legacyBurst, 'v1 bounded burst', boundedBurst);

// A late packet from a previous movement generation cannot spend a token or move.
const client = new MovementSync();
client.reset({v:1,epoch:2,window:4});
const stale = client.step(11,10,'right',0);
assert.equal(client.correct({reason:'rate',movement:{v:1,epoch:3,window:4}}), true);
assert.equal(client.pending.size,0);
client.ack({epoch:2,seq:stale.seq});
assert.equal(client.epoch,3);
assert.equal(client.correct({reason:'stale',movement:{v:1,epoch:2,window:4}}), false);
assert.equal(client.step(11,10,'right',0).seq,1);
console.log('epoch/ack isolation passed');

function directHarness() {
    let now = 100;
    const replies = [], p = {id:'test',x:10,y:10,dir:'right',floor:0,movementVersion:1};
    const sandbox = {
        Date:{now:()=>now},M_W:100,M_H:100,SAFE_CX:50,SAFE_CY:50,
        chebyshev:(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by)),
        playerTileWalkable:(_p,x,y)=>x!==12 && y!==12,
        creditQuestVisit:()=>{},bumpMobAwayFrom:()=>{},broadcast:()=>{},
        sendTo:(_id,msg)=>replies.push(msg),
    };
    sandbox.p = p;
    vm.createContext(sandbox);
    vm.runInContext(`${helpers}\nthis.onPos=function(msg,p,id){ ${handler} }`, sandbox);
    vm.runInContext('movementSnapshot(p,true)',sandbox);
    return {p,replies,at:t=>{now=t;},send:msg=>sandbox.onPos({t:'pos',floor:0,epoch:p._movementEpoch,...msg},p,p.id)};
}

{
    const h = directHarness(), epoch=h.p._movementEpoch;
    h.send({seq:2,x:11,y:10});
    assert.equal(h.p.x,10); assert.equal(h.replies.at(-1).reason,'sequence');
    assert.equal(h.p._movementEpoch,epoch+1);
    const count=h.replies.length, tokens=h.p._posTokens;
    h.send({seq:1,epoch,y:10,x:11});
    assert.equal(h.replies.length,count); assert.equal(h.p._posTokens,tokens);
    h.send({seq:1,x:11.9,y:10}); // Existing server coercion floors to 11.
    assert.equal(h.p.x,11); assert.equal(h.replies.at(-1).t,'posAck');
    h.send({seq:2,x:12,y:10});
    assert.equal(h.replies.at(-1).reason,'terrain'); assert.equal(h.p.x,11);
    h.send({seq:1,x:15,y:10});
    assert.equal(h.replies.at(-1).reason,'distance'); assert.equal(h.p.x,11);
    console.log('sequence, stale, float, terrain, distance checks passed');
}

{
    // Pending ordinary steps remain valid and cannot spend the one-shot grace.
    const h=directHarness();h.p._posGraceUntil=60000;
    h.send({seq:1,x:11,y:10});
    assert.equal(h.p.x,11);assert.equal(h.p._posGraceUntil,60000);
    h.send({seq:2,x:50,y:50,respawn:true});
    assert.equal(h.p.x,50);assert.equal(h.p._posGraceUntil,0);
    assert.equal(h.replies.at(-1).t,'posAck');
    console.log('surface respawn after pending step passed');
}
{
    const h=directHarness();
    h.send({seq:1,x:50,y:50,respawn:true});
    assert.equal(h.p.x,10);assert.equal(h.replies.at(-1).reason,'distance');
    console.log('respawn without grace rejected');
}
{
    const h=directHarness();h.p._posGraceUntil=60000;
    h.send({seq:1,x:49,y:49,respawn:true});
    assert.equal(h.p.x,10);assert.equal(h.replies.at(-1).reason,'distance');
    assert.equal(h.p._posGraceUntil,60000);
    console.log('arbitrary respawn destination rejected');
}
{
    const h=directHarness();h.p.x=11;h.p._posGraceUntil=60000;
    h.send({seq:1,x:12,y:10}); // synthetic wall at x=12
    assert.equal(h.p.x,11);assert.equal(h.replies.at(-1).reason,'terrain');
    assert.equal(h.p._posGraceUntil,60000);
    console.log('wall with grace rejected');
}
