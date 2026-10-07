// One-time appearance purchases against the real local WebSocket handler and isolated accounts.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const rules=require('../../appearance-rules');
const service=require('../appearance-service');
const root=path.resolve(__dirname,'../..');
const WebSocket=require(path.join(root,'tools/modern/.local-deps/node_modules/ws'));
const look=(body,palette='original')=>({v:1,body,palette});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('purchase service charges once and rolls back ownership with a failed flush',()=>{
    const account={save:{appearance:look('knight'),gold:12000,appearanceOps:[]},appearanceOwned:[]};
    const player={appearance:look('knight'),gold:12000,appearanceOps:[],appearanceOwned:[]};
    let saveOk=true,flushes=0;
    const change=(appearance,requestId,now)=>service.applyAppearanceChange({
        player,account,appearance,requestId,rules,now,
        flush:()=>{flushes++;return saveOk;},
    }).result;
    const first=change(look('engineer'),'paid-first-001',1000);
    assert.equal(first.ok,true);assert.equal(first.costGold,5000);assert.equal(first.gold,7000);
    assert.deepEqual(first.appearanceOwned,['engineer']);
    assert.deepEqual(account.appearanceOwned,['engineer']);
    assert.deepEqual(account.save.appearanceOwned,['engineer']);
    const savedAt=flushes;
    const replay=change(look('engineer'),'paid-first-001',1001);
    assert.equal(replay.replayed,true);assert.equal(replay.costGold,0);assert.equal(replay.gold,7000);
    assert.equal(flushes,savedAt);
    assert.equal(change(look('druid'),'paid-first-001',2000).error,'op_conflict');
    assert.equal(change(look('knight'),'basic-return-001',2000).costGold,0);
    assert.equal(change(look('engineer'),'owned-return-001',3000).costGold,0);
    assert.equal(change(look('engineer','forest'),'owned-palette-001',4000).costGold,0);
    assert.equal(player.gold,7000);
    saveOk=false;
    const previous={appearance:player.appearance,gold:player.gold,owned:player.appearanceOwned,
        accountOwned:account.appearanceOwned,save:account.save,ops:player.appearanceOps};
    const failed=change(look('druid'),'failed-purchase-001',5000);
    assert.equal(failed.error,'save_failed');
    assert.strictEqual(player.appearance,previous.appearance);
    assert.equal(player.gold,previous.gold);
    assert.strictEqual(player.appearanceOwned,previous.owned);
    assert.strictEqual(account.appearanceOwned,previous.accountOwned);
    assert.strictEqual(account.save,previous.save);
    assert.strictEqual(player.appearanceOps,previous.ops);
    saveOk=true;
    player.gold=4000;account.save.gold=4000;
    assert.equal(change(look('druid'),'no-gold-001',6000).error,'no_gold');
    assert.deepEqual(player.appearanceOwned,['engineer']);
});

test('legacy paid appearance and paid receipts migrate; an old save field alone does not grant ownership',()=>{
    const receipt={requestId:'old-paid-001',appearance:look('druid'),costGold:5000,goldAfter:7000};
    assert.deepEqual(service.ownedForAccount({save:{appearance:look('engineer'),appearanceOps:[]}},rules),['engineer']);
    assert.deepEqual(service.ownedForAccount({save:{appearance:look('knight'),appearanceOps:[receipt]}},rules),['druid']);
    assert.deepEqual(service.ownedForAccount({save:{appearance:look('knight'),appearanceOwned:['engineer']}},rules),[]);
    assert.deepEqual(rules.normalizarAppearanceOwned(['engineer','bogus','engineer','druid','knight']),['engineer','druid']);
});

class Client{
    constructor(ws){
        this.ws=ws;this.messages=[];this.waiters=[];
        ws.on('message',raw=>{
            const message=JSON.parse(raw);
            const index=this.waiters.findIndex(waiter=>waiter.match(message));
            if(index<0){this.messages.push(message);return;}
            const [waiter]=this.waiters.splice(index,1);
            clearTimeout(waiter.timer);waiter.resolve(message);
        });
    }
    send(message){this.ws.send(JSON.stringify(message));}
    next(match,timeout=5000){
        const index=this.messages.findIndex(match);
        if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
        return new Promise((resolve,reject)=>{
            const waiter={match,resolve,timer:null};
            waiter.timer=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==waiter);reject(Error('Timed out: '+JSON.stringify(this.messages.slice(-8))));},timeout);
            this.waiters.push(waiter);
        });
    }
    request(message,match){this.send(message);return this.next(match);}
    async flush(){this.send({t:'ping'});await this.next(message=>message.t==='pong');}
    async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
        await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}

const transport='s256:'+crypto.createHash('sha256').update('isolated-appearance-purchase').digest('hex');
function account(name,save){
    const salt=crypto.randomBytes(16).toString('hex');
    const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
    return {name,pwHash,save,savedAt:Date.now(),createdAt:Date.now(),email:null,emailVerified:false,resetToken:null};
}
function save(appearance=look('knight'),extras={}){
    const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'].map(key=>[key,{val:18,xp:0,xpNext:2400}]));
    return {v:2,x:50,y:50,skills,gold:12000,appearance,appearanceOps:[],
        enchantToken:crypto.randomUUID(),transmutationToken:crypto.randomUUID(),
        progressionToken:crypto.randomUUID(),transmutationPity:0,
        inv:{ESPADA:1,POTION:5},equipped:{weapon:null,offhand:null,armor:null,head:null,feet:null,neck:null},
        chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
        hp:250,maxHp:250,mp:200,maxMp:200,pvp:true,savedAt:Date.now(),...extras};
}
const freePort=()=>new Promise((resolve,reject)=>{
    const socket=net.createServer();socket.once('error',reject);
    socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});
});
async function waitBackend(port,child){
    for(let attempt=0;attempt<60;attempt++){
        if(child.exitCode!==null)throw Error('Backend exited: '+child.exitCode);
        try{await new Promise((resolve,reject)=>{
            const req=http.get(`http://127.0.0.1:${port}/health`,response=>{response.resume();resolve();});
            req.once('error',reject);req.setTimeout(500,()=>req.destroy(Error('health timeout')));
        });return;}catch{await delay(100);}
    }
    throw Error('Backend did not listen');
}
async function connect(port,name){
    const ws=await new Promise((resolve,reject)=>{
        const socket=new WebSocket(`ws://127.0.0.1:${port}`);
        socket.once('open',()=>resolve(socket));socket.once('error',reject);
    });
    const client=new Client(ws);
    const auth=await client.request({t:'auth',name,pwHash:transport,platform:'browser'},message=>message.t==='authOk'||message.t==='authFail');
    assert.equal(auth.t,'authOk',JSON.stringify(auth));
    const state=await client.request({t:'join',name,equipmentVersion:1,pvp:true,lang:'pt'},message=>message.t==='state');
    return {client,auth,state};
}

test('WebSocket purchase at plaza, saveUpload protection, relogin and legacy migration',async()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-appearance-purchases-'));
    const suffix=crypto.randomBytes(2).toString('hex');
    const names={fresh:'Buy'+suffix,current:'Cur'+suffix,receipt:'Rec'+suffix};
    const oldReceipt={requestId:'historical-paid-001',appearance:look('druid'),costGold:5000,goldAfter:7000};
    const accounts=[
        account(names.fresh,save(look('knight'),{appearanceOwned:['engineer']})),
        account(names.current,save(look('engineer'),{gold:7000})),
        account(names.receipt,save(look('knight'),{gold:7000,appearanceOps:[oldReceipt]})),
    ];
    const accountsFile=path.join(tmp,'accounts.json');
    fs.writeFileSync(accountsFile,JSON.stringify({v:1,savedAt:Date.now(),accounts}));
    fs.writeFileSync(path.join(tmp,'state.json'),JSON.stringify({v:1,savedAt:Date.now(),nextMobId:910001,monsters:[]}));
    const port=await freePort();
    const entry="const http=require('node:http');const original=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return original.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');";
    const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
        env:{...process.env,PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
            STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:accountsFile,
            MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
            ADMIN_NAME:'__appearance_purchase_qa__',ALERTS_ENABLED:'0'}});
    let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.stdout.on('data',()=>{});
    const clients=[];
    const disk=name=>JSON.parse(fs.readFileSync(accountsFile)).accounts.find(row=>row.name===name);
    const request=(client,id,appearance)=>client.request({t:'appearanceSet',requestId:id,appearance},
        message=>message.t==='appearanceResult'&&message.requestId===id);
    try{
        await waitBackend(port,child);
        const blockedTmp=accountsFile+'.tmp';
        fs.mkdirSync(blockedTmp);
        const fresh=await connect(port,names.fresh);clients.push(fresh.client);
        assert.deepEqual(fresh.auth.save.appearanceOwned,[],'forged legacy save field is removed at auth');
        assert.deepEqual(fresh.state.appearanceOwned,[]);
        assert.equal(disk(names.fresh).appearanceOwned,undefined,'failed optional migration does not block login or pretend to persist');
        try{
            const failed=await request(fresh.client,'first-purchase-001',look('engineer'));
            assert.equal(failed.error,'save_failed');
            assert.equal(failed.gold,12000);
            assert.deepEqual(failed.appearanceOwned,[]);
            assert.equal(disk(names.fresh).appearanceOwned,undefined);
            assert.equal(disk(names.fresh).save.gold,12000);
        }finally{fs.rmdirSync(blockedTmp);}
        const first=await request(fresh.client,'first-purchase-001',look('engineer'));
        assert.equal(first.ok,true);assert.equal(first.costGold,5000);assert.equal(first.gold,7000);
        assert.deepEqual(first.appearanceOwned,['engineer']);
        assert.deepEqual(disk(names.fresh).save.appearanceOwned,['engineer']);
        assert.deepEqual(disk(names.fresh).appearanceOwned,['engineer']);
        assert.equal(disk(names.fresh).save.gold,7000);
        const inv=await fresh.client.next(message=>message.t==='invUpdate'&&message.gold===7000);
        assert.deepEqual(inv.appearanceOwned,['engineer']);
        const stats=await fresh.client.next(message=>message.t==='pstats'&&message.id===fresh.state.you&&message.appearance?.body==='engineer');
        assert.deepEqual(stats.appearanceOwned,['engineer']);
        const replay=await request(fresh.client,'first-purchase-001',look('engineer'));
        assert.equal(replay.replayed,true);assert.equal(replay.costGold,0);assert.equal(replay.gold,7000);
        assert.equal((await request(fresh.client,'first-purchase-001',look('druid'))).error,'op_conflict');
        await delay(550);
        assert.equal((await request(fresh.client,'return-basic-001',look('knight'))).costGold,0);
        await delay(550);
        const ownedReturn=await request(fresh.client,'return-owned-001',look('engineer','ocean'));
        assert.equal(ownedReturn.costGold,0);assert.equal(ownedReturn.gold,7000);
        fresh.client.send({t:'saveUpload',data:{v:2,appearance:look('druid'),appearanceOwned:['druid','barbarian_large'],appearanceOps:[],gold:999999}});
        await fresh.client.flush();
        assert.deepEqual(disk(names.fresh).save.appearanceOwned,['engineer']);
        assert.deepEqual(disk(names.fresh).appearanceOwned,['engineer']);
        assert.deepEqual(disk(names.fresh).save.appearance,look('engineer','ocean'));
        await fresh.client.close();
        const relog=await connect(port,names.fresh);clients.push(relog.client);
        assert.deepEqual(relog.auth.save.appearanceOwned,['engineer']);
        assert.deepEqual(relog.state.appearanceOwned,['engineer']);
        assert.equal(relog.auth.save.gold,7000);
        assert.equal((await request(relog.client,'relog-owned-001',look('engineer','forest'))).costGold,0);
        fs.mkdirSync(blockedTmp);
        let current;
        try{
            current=await connect(port,names.current);clients.push(current.client);
            assert.deepEqual(current.auth.save.appearanceOwned,['engineer'],'trusted current paid body is usable even when migration flush fails');
            assert.deepEqual(current.state.appearanceOwned,['engineer']);
            assert.equal(disk(names.current).appearanceOwned,undefined,'migration is still pending on disk');
        }finally{fs.rmdirSync(blockedTmp);}
        assert.deepEqual(current.auth.save.appearanceOwned,['engineer']);
        assert.equal((await request(current.client,'current-owned-001',look('engineer','wine'))).costGold,0);
        assert.deepEqual(disk(names.current).appearanceOwned,['engineer'],'next successful operation persists migrated ownership');
        const receipt=await connect(port,names.receipt);clients.push(receipt.client);
        assert.deepEqual(receipt.auth.save.appearanceOwned,['druid']);
        assert.deepEqual(disk(names.receipt).appearanceOwned,['druid']);
        assert.equal((await request(receipt.client,'receipt-owned-001',look('druid'))).costGold,0);
        assert.equal(disk(names.receipt).save.gold,7000);
    }catch(error){error.message+='\nBackend stderr: '+stderr.slice(-1200)+'\nIsolated files: '+tmp;throw error;}
    finally{
        for(const client of clients)await client.close().catch(()=>{});
        child.kill();
        await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);
    }
});
