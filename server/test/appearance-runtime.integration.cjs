// Isolated WebSocket integration check for appearance persistence and combat feedback.
// Uses synthetic accounts and a loopback backend with temporary state files.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const WebSocket=require(path.join(root,'tools/modern/.local-deps/node_modules/ws'));
const world=require('../../modern-world');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-appearance-'));
const getPort=()=>new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});
});

class Client {
    constructor(ws){this.ws=ws;this.messages=[];this.waiters=[];
        ws.on('message',raw=>{
            const msg=JSON.parse(raw);
            const i=this.waiters.findIndex(w=>w.match(msg));
            if(i>=0){const [w]=this.waiters.splice(i,1);clearTimeout(w.timer);w.resolve(msg);}
            else this.messages.push(msg);
        });
    }
    send(msg){this.ws.send(JSON.stringify(msg));}
    next(match,ms=3000){
        const i=this.messages.findIndex(match);
        if(i>=0)return Promise.resolve(this.messages.splice(i,1)[0]);
        return new Promise((resolve,reject)=>{
            const w={match,resolve,timer:null};
            w.timer=setTimeout(()=>{this.waiters=this.waiters.filter(v=>v!==w);reject(Error('Timeout '+match.toString()+': '+JSON.stringify(this.messages.slice(-5))));},ms);
            this.waiters.push(w);
        });
    }
    async request(msg,match,ms){this.send(msg);return this.next(match,ms);}
    async flush(){this.send({t:'ping'});await this.next(m=>m.t==='pong');}
    async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
        await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}
const hash='s256:'+crypto.createHash('sha256').update('interior-fixture-only').digest('hex');
function seedAccounts(names){
    const now=Date.now();
    const accounts=names.map(name=>{
        const salt=crypto.randomBytes(16).toString('hex');
        const pwHash=`scrypt$${salt}$${crypto.scryptSync(hash,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
        const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia']
            .map(key=>[key,{val:18,xp:0,xpNext:2400}]));
        const save={v:2,x:50,y:50,skills,gold:12000,
            inv:{SILK:20,ASA_MORCEGO:20,OSSO:20,ESPADA:5,MACHADO:1,CLAVA:1,ARCO:1,CAJADO_FOGO:1,FLECHA:50,POTION:5},
            equipped:{weapon:null,offhand:null,armor:null,head:null,feet:null,neck:null},
            chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
            hp:250,maxHp:250,mp:200,maxMp:200,pvp:true,savedAt:now};
        return {name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null};
    });
    fs.writeFileSync(path.join(tmp,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts}));
}
async function connect(port,name,legacy=false){
    const ws=await new Promise((resolve,reject)=>{
        const socket=new WebSocket(`ws://127.0.0.1:${port}`);
        socket.once('open',()=>resolve(socket));socket.once('error',reject);
    });
    const c=new Client(ws);
    const auth=await c.request({t:'auth',name,pwHash:hash,platform:'browser'},m=>m.t==='authOk'||m.t==='authFail');
    assert.equal(auth.t,'authOk',JSON.stringify(auth));
    const state=await c.request({t:'join',name,equipmentVersion:legacy?undefined:1,pvp:true,lang:'pt'},m=>m.t==='state');
    const self=state.players.find(p=>p.id===state.you);
    assert(self,'player appears in authoritative snapshot');
    return {c,auth,state,self};
}
async function walk(c,from,coords){
    for(const [x,y] of coords){
        assert(Math.max(Math.abs(x-from.x),Math.abs(y-from.y))<=1,'adjacent movement');
        c.send({t:'pos',x,y,dir:'down'});
        await c.flush();
        assert(!c.messages.some(m=>m.t==='posCorrect'),'movement accepted at '+x+','+y);
        from={x,y};
        await delay(75);
    }
    return from;
}
async function waitBackend(port,child){
    for(let i=0;i<50;i++){
        if(child.exitCode!==null)throw Error('Backend exited before listening');
        try {await new Promise((resolve,reject)=>{
            const req=http.get(`http://127.0.0.1:${port}/health`,res=>{res.resume();resolve();});
            req.once('error',reject);req.setTimeout(500,()=>req.destroy(Error('timeout')));
        });return;}catch{await delay(100);}
    }
    throw Error('Backend did not listen on loopback');
}

async function main(){
    const A={v:1,body:'rogue',palette:'wine'},B={v:1,body:'barbarian',palette:'forest'};
    const suffix=crypto.randomBytes(2).toString('hex'),names=['LookA'+suffix,'LookB'+suffix];
    seedAccounts(names);
    fs.writeFileSync(path.join(tmp,'state.json'),JSON.stringify({v:1,savedAt:Date.now(),nextMobId:910001,
        monsters:[{id:910000,type:'RAT',x:44,y:45,hp:5000,maxHp:5000,dmg:0,speed:1e15,xp:0,aggro:0,unique:true,level:1,floor:0}]}));
    const port=await getPort();
    const entry="const http=require('node:http');const original=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return original.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');";
    const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
        env:{...process.env,PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
        STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:path.join(tmp,'accounts.json'),
        MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',ADMIN_NAME:'__appearance_qa__',ALERTS_ENABLED:'0'}});
    let errors='';child.stderr.on('data',b=>errors+=b);child.stdout.on('data',()=>{});
    const clients=[];
    const disk=()=>JSON.parse(fs.readFileSync(path.join(tmp,'accounts.json'))).accounts;
    try{
        await waitBackend(port,child);
        const a=await connect(port,names[0]),b=await connect(port,names[1]);clients.push(a.c,b.c);
        assert.deepEqual(a.self.appearance,{v:1,body:'knight',palette:'original'});
        assert.deepEqual(b.self.appearance,a.self.appearance,'legacy defaults independent from inventory');
        const changed=await a.c.request({t:'appearanceSet',requestId:'choose-a',appearance:A},m=>m.t==='appearanceResult');
        assert.equal(changed.ok,true);assert.deepEqual(changed.appearance,A);
        assert.deepEqual((await b.c.next(m=>m.t==='pstats'&&m.id===a.state.you&&m.appearance?.body==='rogue')).appearance,A);
        assert.equal((await b.c.request({t:'appearanceSet',requestId:'choose-b',appearance:B},m=>m.t==='appearanceResult')).ok,true);
        assert.deepEqual(disk().find(x=>x.name===names[0]).save.appearance,A,'success follows durable write');
        assert.deepEqual(disk().find(x=>x.name===names[1]).save.appearance,B);
        const savedAt=disk().find(x=>x.name===names[0]).savedAt;
        const replay=await a.c.request({t:'appearanceSet',requestId:'choose-a',appearance:A},m=>m.t==='appearanceResult');
        assert.equal(replay.ok,true);assert.equal(disk().find(x=>x.name===names[0]).savedAt,savedAt,'repeat same identity has no new effect');
        for(const appearance of [null,[],{v:2,body:'rogue',palette:'wine'},{v:1,body:'dragon',palette:'wine'},{v:1,body:'rogue',palette:'url(javascript:1)'}]){
            const invalid=await a.c.request({t:'appearanceSet',requestId:'invalid',appearance},m=>m.t==='appearanceResult');
            assert.equal(invalid.error,'invalid_appearance');assert.deepEqual(invalid.appearance,A);
        }
        await delay(550);
        const blockedTmp=path.join(tmp,'accounts.json.tmp');
        fs.mkdirSync(blockedTmp); // isolated fixture: cause a real atomic-write failure
        try{
            const failed=await a.c.request({t:'appearanceSet',requestId:'disk-failure',appearance:B},m=>m.t==='appearanceResult');
            assert.equal(failed.error,'save_failed');assert.deepEqual(failed.appearance,A);
            assert.deepEqual(disk().find(x=>x.name===names[0]).save.appearance,A,'failed write preserves previous disk identity');
        }finally{fs.rmdirSync(blockedTmp);}
        const recovered=await a.c.request({t:'appearanceSet',requestId:'after-failure',appearance:{...A,palette:'ocean'}},m=>m.t==='appearanceResult');
        assert.equal(recovered.ok,true,'save recovers after filesystem issue clears');
        await delay(550);
        assert.equal((await a.c.request({t:'appearanceSet',requestId:'restore-a',appearance:A},m=>m.t==='appearanceResult')).ok,true);
        for(const itemKey of ['ESPADA','MACHADO','CLAVA','ARCO','CAJADO_FOGO']){
            const equipped=await a.c.request({t:'invEquip',itemKey},m=>m.t==='invUpdate'&&m.equipped?.weapon===itemKey);
            assert.equal(equipped.equipped.weapon,itemKey);
            const stats=await b.c.next(m=>m.t==='pstats'&&m.id===a.state.you&&m.equipped?.weapon===itemKey);
            assert.deepEqual(stats.appearance,A,'equipment never chooses identity');
        }
        await b.c.request({t:'invEquip',itemKey:'CAJADO_FOGO'},m=>m.t==='invUpdate'&&m.equipped?.weapon==='CAJADO_FOGO');
        a.c.send({t:'saveUpload',data:{v:2,appearance:B,inv:{},gold:0}});await a.c.flush();
        await a.c.close();
        const legacy=await connect(port,names[0],true);clients.push(legacy.c);
        assert.deepEqual(legacy.auth.save.appearance,A,'forged upload cannot overwrite dedicated identity');
        assert.deepEqual(legacy.self.appearance,A);assert.equal(legacy.auth.save.equipped.weapon,'CAJADO_FOGO');
        assert.equal(legacy.auth.save.gold,12000,'cosmetic choices never charge gold');
        assert.equal(legacy.auth.save.inv.ESPADA,5,'legacy inventory remains intact');
        assert.deepEqual(legacy.state.players.find(x=>x.id===b.state.you).appearance,B);
        legacy.c.send({t:'saveUpload',data:{v:2,skills:{},inv:{},gold:0}});await legacy.c.flush();await legacy.c.close();
        const relog=await connect(port,names[0]);clients.push(relog.c);
        assert.deepEqual(relog.auth.save.appearance,A,'classic save without field preserves identity');
        assert.equal(relog.auth.save.equipped.weapon,'CAJADO_FOGO');
        await walk(relog.c,{x:50,y:50},[[49,49],[48,48],[47,47],[46,46],[45,46],[44,46]]);
        const room=await relog.c.request({t:'enterInterior',id:'pousada'},m=>m.t==='dungeonEnter');
        assert.equal(room.floor,1000,'first account entered shared room');
        await walk(b.c,{x:50,y:50},[[49,49],[48,48],[47,47],[46,46],[45,46],[44,46]]);
        const roomB=await b.c.request({t:'enterInterior',id:'pousada'},m=>m.t==='dungeonEnter');
        assert.deepEqual(roomB.players.find(x=>x.id===relog.state.you).appearance,A);
        assert.deepEqual((await relog.c.next(m=>m.t==='join'&&m.player.id===b.state.you)).player.appearance,B,'room join carries second identity');
        await walk(relog.c,{x:50,y:50},[[50,51]]);
        await relog.c.request({t:'exitInterior'},m=>m.t==='dungeonExit');
        b.c.messages=[];
        const impacts=[];
        for(const [itemKey,weaponType] of [['CAJADO_FOGO','wand'],['ESPADA','melee'],['ARCO','ranged']]){
            if(itemKey!=='CAJADO_FOGO')await relog.c.request({t:'invEquip',itemKey},m=>m.t==='invUpdate'&&m.equipped?.weapon===itemKey);
            const hit={t:'attackMob',monsterId:910000,amount:10,range:1,crit:false,attackPresentationAt:12345,...(weaponType==='ranged'?{ammoKey:'FLECHA'}:{})};
            const impact=await relog.c.request(hit,m=>m.t==='combatImpact');
            assert.equal(impact.weaponType,weaponType);assert.equal(impact.floor,0);assert.equal(impact.amount,10);assert(impact.eventId);
            assert.equal(impact.attackPresentationAt,12345,'finite presentation timestamp echoed only to attacker');
            assert.equal(impact.targetType,'monster');
            impacts.push(impact);
            relog.c.send(hit);await relog.c.flush();
            assert(!relog.c.messages.some(m=>m.t==='combatImpact'),'rejected repeated attack has no impact');
            assert(!b.c.messages.some(m=>['combatImpact','mobUpdate','mobFloat'].includes(m.t)),'no combat effect crosses floor');
            await delay(850);
        }
        relog.c.send({t:'spellCast',spellKey:'FIREBALL',hits:1});
        const spell=await relog.c.request({t:'attackMob',monsterId:910000,amount:10,range:1,attackPresentationAt:'invalid'},m=>m.t==='combatImpact');
        assert.equal(spell.spell,'FIREBALL');assert.equal(spell.weaponType,'wand');impacts.push(spell);
        assert(!Object.hasOwn(spell,'attackPresentationAt'),'malformed presentation metadata is omitted');
        assert.equal(new Set(impacts.map(m=>m.eventId)).size,4,'authoritative hits carry unique identity');
        assert(!b.c.messages.some(m=>['combatImpact','mobUpdate','mobFloat'].includes(m.t)),'spell effects stay on originating floor');
        const result={status:'PASS',checks:['two identities same equipment','free choice','five equipped weapon families','invalid catalog rejected','idempotent assignment','immediate durable write','relogin','classic save preserves identity','forged save cannot change identity','legacy inventory gold preserved','room snapshot and join preserve identity'],fixtures:tmp,port};
        result.checks.push('authoritative melee ranged wand spell impact','rejected attack silent','unique impact IDs','no combat presentation crosses floor');
        result.checks.push('atomic write failure rolls back identity','save recovers after storage becomes available');
        result.checks.push('finite optional attack timestamp echoed only to attacker','invalid presentation timestamp omitted');
        result.impacts=impacts;
        fs.writeFileSync(path.join(tmp,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
    }finally{
        await Promise.all(clients.map(c=>c.close().catch(()=>{})));child.kill();
        await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);
        if(child.exitCode===null&&child.signalCode===null)throw Error('Fixture did not stop: '+errors.slice(-1000));
    }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
