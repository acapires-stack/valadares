'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const WebSocket=require(path.join(root,'node_modules/ws'));
const transport='s256:'+crypto.createHash('sha256').update('quest-onboarding-isolated').digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function account(name,x,y){
    const salt=crypto.randomBytes(16).toString('hex');
    return {name,pwHash:`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`,
        createdAt:Date.now(),savedAt:Date.now(),save:{v:2,x,y,gold:0,inv:{},equipped:{},
            chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
            hp:100,maxHp:100,mp:100,maxMp:100}};
}
const freePort=()=>new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',reject);
    socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
async function waitBackend(port,child){
    for(let i=0;i<80;i++){
        if(child.exitCode!==null)throw Error('Backend exited: '+child.exitCode);
        try{await new Promise((resolve,reject)=>{const req=http.get(`http://127.0.0.1:${port}/health`,res=>{
            res.resume();resolve();});req.once('error',reject);req.setTimeout(500,()=>req.destroy(Error('timeout')));});return;
        }catch{await pause(100);}
    }
    throw Error('Backend did not listen');
}
class Client{
    constructor(ws){this.ws=ws;this.messages=[];this.waiters=[];
        ws.on('message',raw=>{const message=JSON.parse(raw),index=this.waiters.findIndex(w=>w.match(message));
            if(index<0)this.messages.push(message);
            else{const [w]=this.waiters.splice(index,1);clearTimeout(w.timer);w.resolve(message);}});}
    next(match,timeout=6000){const index=this.messages.findIndex(match);
        if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
        return new Promise((resolve,reject)=>{const waiter={match,resolve,timer:setTimeout(()=>{
            this.waiters=this.waiters.filter(w=>w!==waiter);reject(Error('Timed out: '+JSON.stringify(this.messages.slice(-10).map(m=>m.t))));
        },timeout)};this.waiters.push(waiter);});}
    request(message,match){this.ws.send(JSON.stringify(message));return this.next(match);}
    async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
        await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}
async function connect(port,name){const ws=await new Promise((resolve,reject)=>{const socket=new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once('open',()=>resolve(socket));socket.once('error',reject);});const client=new Client(ws);
    const auth=await client.request({t:'auth',name,pwHash:transport,platform:'browser'},m=>m.t==='authOk'||m.t==='authFail');
    assert.equal(auth.t,'authOk',JSON.stringify(auth));
    const state=await client.request({t:'join',name,equipmentVersion:1,hp:100,maxHp:100,mp:100,maxMp:100},m=>m.t==='state');
    return {client,state};}

test('WS quest acceptance, three real rat kills, immediate persistence, reconnect and one reward',
    {timeout:45000},async()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-quest-onboarding-'));
    const name='Quest'+crypto.randomBytes(3).toString('hex');
    const accountsFile=path.join(tmp,'accounts.json');
    fs.writeFileSync(accountsFile,JSON.stringify({v:1,savedAt:Date.now(),accounts:[account(name,48,53)]}));
    const port=await freePort();
    const hook=`\nconst qaName=${JSON.stringify(name)};
      let qaDeathArmed=false;
      const originalFlushAccounts=flushAccounts;
      flushAccounts=()=>{
        const ok=originalFlushAccounts();
        if(ok&&qaDeathArmed&&getAccount(qaName)?.engagement?.firstDeathAt){
          qaDeathArmed=false;process.send({t:'deathPersisted'});
        }
        return ok;
      };
      process.on('message',m=>{if(m==='stop')return process.emit('SIGTERM');
      if(m?.t==='rat'||m?.t==='death'||m?.t==='home'||m?.t==='resetSaveRate'){
        const p=[...players.values()].find(x=>x.authedName===m.name);
        if(!p)return process.send({t:'ratResult',error:'no_player'});
        if(m.t==='resetSaveRate'){p.lastSaveAt=0;return process.send({t:'ratResult',id:0});}
        if(m.t==='home'){p.x=48;p.y=53;return process.send({t:'ratResult',id:0});}
        monsters.clear();
        for(let y=55;y<70;y++)for(let x=55;x<75;x++){
          if(!isWalkable(x,y)||!isWalkable(x+1,y)||inSafe(x,y)||inSafe(x+1,y)||
             inSanctuary(x,y)||inSanctuary(x+1,y))continue;
          p.x=x;p.y=y;const rat=spawnMob('RAT',x+1,y,0);
          if(rat){
            if(m.t==='death'){
              if(getAccount(qaName)?.engagement?.firstDeathAt)
                return process.send({t:'ratResult',error:'unexpected earlier PvE death'});
              qaDeathArmed=true;
              p.connectedAt=Date.now()-11000;p.hp=1;
              rat.hp=1000;rat.maxHp=1000;rat.dmg=100;rat.aggro=10;
              rat._retaliateId=p.id;rat._retaliateAt=Date.now();
            }else{rat.hp=1;rat.maxHp=1;rat.dmg=0;}
            return process.send({t:'ratResult',id:rat.id});
          }
        }
        process.send({t:'ratResult',error:'no_tile'});
      }
    });`;
    const entry=`const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
      const file=path.resolve('./server/server.js'),mod=new Module(file,module);
      mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
      mod._compile(fs.readFileSync(file,'utf8')+${JSON.stringify(hook)},file);
      const realNow=Date.now;Date.now=()=>realNow()+181000;`;
    const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
        env:{...process.env,PORT:String(port),STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:accountsFile,
            MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'quest-qa',
            ADMIN_NAME:'__quest_qa__',ALERTS_ENABLED:'0',COMPANIONS_ENABLED:'0'}});
    let stderr='';child.stderr.on('data',x=>stderr+=x);child.stdout.on('data',()=>{});
    const clients=[];
    const saved=()=>JSON.parse(fs.readFileSync(accountsFile)).accounts.find(a=>a.name===name);
    const position=t=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('position hook timeout')),3000);
        const receive=m=>{if(m?.t!=='ratResult')return;clearTimeout(timer);child.off('message',receive);
            m.error?reject(Error(m.error)):resolve(m.id);};child.on('message',receive);child.send({t,name});});
    const deathPersisted=()=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{child.off('message',receive);reject(Error('PvE death was not flushed'))},8000);
        const receive=m=>{if(m?.t!=='deathPersisted')return;clearTimeout(timer);child.off('message',receive);resolve();};
        child.on('message',receive);
    });
    try{
        await waitBackend(port,child);
        let joined=await connect(port,name),client=joined.client;clients.push(client);
        const unknown=await client.request({t:'questAccept',questId:'made_up'},m=>m.t==='questAcceptResult');
        assert.equal(unknown.reason,'unknown_quest');
        client.ws.send(JSON.stringify({t:'saveUpload',data:{...saved().save,
            quests:{active:{q_ratos:{progress:999},q_cobras:{progress:999}},completed:['q_ratos'],daily:null}}}));
        await pause(100);
        const accepted=await client.request({t:'questAccept',questId:'q_ratos'},m=>m.t==='questAcceptResult');
        assert.equal(accepted.ok,true,JSON.stringify(accepted));
        assert.equal(accepted.reason,'accepted','forged save must not activate a simple quest');
        assert.deepEqual(Object.keys(accepted.quests.active),['q_ratos']);
        assert.deepEqual(accepted.quests.completed,[],'forged completed list ignored');
        assert.equal(accepted.quests.active.q_ratos.progress,0);
        assert.equal(saved().save.quests.active.q_ratos.progress,0,'ack follows disk flush');
        assert.ok(saved().engagement.firstQuestAcceptedAt);
        await position('resetSaveRate');
        client.ws.send(JSON.stringify({t:'saveUpload',data:{...saved().save,
            quests:{active:{},completed:[],daily:null}}}));
        await pause(100);
        const duplicate=await client.request({t:'questAccept',questId:'q_ratos'},m=>m.t==='questAcceptResult');
        assert.equal(duplicate.ok,true);assert.equal(duplicate.reason,'already_active');
        const firstRat=await position('rat');
        const remote=await client.request({t:'questAccept',questId:'q_cobras'},m=>m.t==='questAcceptResult');
        assert.equal(remote.reason,'not_at_npc');
        for(let i=0;i<3;i++){
            const ratId=i===0?firstRat:await position('rat');
            client.ws.send(JSON.stringify({t:'attackMob',monsterId:ratId,amount:999,range:1}));
            const kill=await client.next(m=>m.t==='mobKill'&&m.mobId===ratId);
            assert.equal(kill.mobId,ratId);
            const progress=await client.next(m=>m.t==='questProgress'&&m.questId==='q_ratos');
            assert.equal(progress.progress,i+1);
            assert.equal(saved().save.quests.active.q_ratos.progress,i+1,'each kill persisted before progress event');
            if(i<2)await pause(700);
        }
        assert.ok(saved().engagement.firstQuestGoalAt);
        await position('home');
        await client.close();
        joined=await connect(port,name);client=joined.client;clients.push(client);
        assert.equal(saved().save.quests.active.q_ratos.progress,3);
        const completed=await client.request({t:'questTurnIn',kind:'simple',questId:'q_ratos'},
            m=>m.t==='invUpdate'&&m.questResult);
        assert.equal(completed.questResult.ok,true,JSON.stringify(completed));
        assert.equal(saved().save.gold,50);
        assert.equal(saved().save.inv.PORRETE,1);
        assert.deepEqual(saved().save.quests.completed,['q_ratos']);
        const again=await client.request({t:'questTurnIn',kind:'simple',questId:'q_ratos'},m=>m.t==='questResult');
        assert.equal(again.reason,'rate_limit');
        await pause(450);
        const noReplay=await client.request({t:'questTurnIn',kind:'simple',questId:'q_ratos'},m=>m.t==='questResult');
        assert.equal(noReplay.reason,'not_active');
        assert.equal(saved().save.gold,50);
        await position('resetSaveRate');
        client.ws.send(JSON.stringify({t:'saveUpload',data:{...saved().save,
            quests:{active:{q_ratos:{progress:999}},completed:[],daily:null}}}));
        await pause(100);
        const completedReject=await client.request({t:'questAccept',questId:'q_ratos'},m=>m.t==='questAcceptResult');
        assert.equal(completedReject.reason,'already_done');
        assert.deepEqual(completedReject.quests.completed,['q_ratos']);
        const persisted=deathPersisted();
        const deathRatId=await position('death');
        const zeroHp=client.next(m=>m.t==='pstats'&&m.id===joined.state.you&&m.hp===0,15000);
        const lethalHit=client.next(m=>m.t==='mobHit'&&m.mobId===deathRatId&&m.actual>0,15000);
        await Promise.all([zeroHp,lethalHit,persisted]);
        assert.ok(saved().engagement.firstDeathAt,'PvE death milestone persisted');
    }catch(error){error.message+='\nserver stderr='+stderr.slice(-1600);throw error;}
    finally{
        await Promise.all(clients.map(c=>c.close()));
        if(child.exitCode===null)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('isolated backend did not stop')),5000);
            child.once('exit',()=>{clearTimeout(timer);resolve();});child.send('stop');});
        fs.rmSync(tmp,{recursive:true,force:true});
    }
});
