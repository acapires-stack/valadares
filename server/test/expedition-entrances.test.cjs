// Three distinct overworld entrances against an isolated local WebSocket backend.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const progression=require('../../progression-content');
const root=path.resolve(__dirname,'../..');
const WebSocket=require(path.join(root,'tools/modern/.local-deps/node_modules/ws'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Client{
    constructor(ws){
        this.ws=ws;this.messages=[];this.waiters=[];
        ws.on('message',raw=>{
            const message=JSON.parse(raw);
            const i=this.waiters.findIndex(waiter=>waiter.match(message));
            if(i<0){this.messages.push(message);return;}
            const [waiter]=this.waiters.splice(i,1);
            clearTimeout(waiter.timer);waiter.resolve(message);
        });
    }
    request(message,match,timeout=5000){
        const result=this.next(match,timeout);
        this.ws.send(JSON.stringify(message));
        return result;
    }
    next(match,timeout=5000){
        const i=this.messages.findIndex(match);
        if(i>=0)return Promise.resolve(this.messages.splice(i,1)[0]);
        return new Promise((resolve,reject)=>{
            const waiter={match,resolve,timer:null};
            waiter.timer=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==waiter);reject(Error('Timed out: '+JSON.stringify(this.messages.slice(-8))));},timeout);
            this.waiters.push(waiter);
        });
    }
    async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
        await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}
const transport='s256:'+crypto.createHash('sha256').update('isolated-expedition-entrances').digest('hex');
function account(name,x,y){
    const salt=crypto.randomBytes(16).toString('hex');
    const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
    const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'].map(key=>[key,{val:18,xp:0,xpNext:2400}]));
    const save={v:2,x,y,skills,gold:12000,inv:{ESPADA:1,POTION:5},
        equipped:{weapon:null,offhand:null,armor:null,head:null,feet:null,neck:null},
        chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
        hp:5000,maxHp:5000,mp:200,maxMp:200,pvp:true,savedAt:Date.now()};
    return {name,pwHash,save,savedAt:Date.now(),createdAt:Date.now(),email:null,emailVerified:false,resetToken:null};
}
const freePort=()=>new Promise((resolve,reject)=>{
    const socket=net.createServer();socket.once('error',reject);
    socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});
});
async function waitBackend(port,child){
    for(let i=0;i<60;i++){
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
    const self=state.players.find(row=>row.id===state.you);
    assert(self,'self in initial authoritative snapshot');
    return {client,state,self};
}

test('Forgotten Forge, Forge Ruins and Depths retain independent entrances and exits',async()=>{
    assert.deepEqual(progression.robotExpedition.npc,{x:75,y:33});
    assert.deepEqual(progression.expedition.npc,{x:78,y:22});
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-expedition-entrances-'));
    const suffix=crypto.randomBytes(2).toString('hex');
    const names={robot:'Rob'+suffix,ruins:'Rui'+suffix,depths:'Dep'+suffix};
    fs.writeFileSync(path.join(tmp,'accounts.json'),JSON.stringify({v:1,savedAt:Date.now(),accounts:[
        account(names.robot,75,33),account(names.ruins,78,22),account(names.depths,83,17),
    ]}));
    fs.writeFileSync(path.join(tmp,'state.json'),JSON.stringify({v:1,savedAt:Date.now(),nextMobId:910001,monsters:[]}));
    const port=await freePort();
    // Advance this isolated server beyond its post-restart safety window, which
    // intentionally teleports every login to the town square for three minutes.
    const entry="const http=require('node:http');const original=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return original.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');const clock=Date.now;Date.now=()=>clock()+181000;";
    const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
        env:{...process.env,PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
            STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:path.join(tmp,'accounts.json'),
            MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
            ADMIN_NAME:'__expedition_entrance_qa__',ALERTS_ENABLED:'0',PROGRESSION_ENABLED:'1'}});
    let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.stdout.on('data',()=>{});
    const clients=[];
    try{
        await waitBackend(port,child);
        const robot=await connect(port,names.robot);clients.push(robot.client);
        assert.deepEqual([robot.self.x,robot.self.y,robot.self.floor||0],[75,33,0]);
        const wrongOld=await robot.client.request({t:'expeditionEnter',expedition:'ruinas_forja'},
            message=>message.t==='expeditionResult'&&message.ok===false);
        assert.equal(wrongOld.error,'not_at_blacksmith');
        const robotEnter=await robot.client.request({t:'expeditionEnter',expedition:'forja_esquecida'},
            message=>message.t==='dungeonEnter');
        assert.equal(robotEnter.expedition,'forja_esquecida');
        assert.equal(robotEnter.expeditionLayout,'forge_forgotten_v2');
        assert(robotEnter.floor>=8000&&robotEnter.floor<9000);
        const robotExit=await robot.client.request({t:'expeditionExit'},message=>message.t==='dungeonExit');
        assert.deepEqual([robotExit.x,robotExit.y],[75,33]);
        assert.equal((await robot.client.request({t:'expeditionEnter',expedition:'ruinas_forja'},
            message=>message.t==='expeditionResult'&&message.ok===false)).error,'not_at_blacksmith');

        const ruins=await connect(port,names.ruins);clients.push(ruins.client);
        assert.deepEqual([ruins.self.x,ruins.self.y,ruins.self.floor||0],[78,22,0]);
        assert.equal((await ruins.client.request({t:'expeditionEnter',expedition:'forja_esquecida'},
            message=>message.t==='expeditionResult'&&message.ok===false)).error,'not_at_blacksmith');
        const ruinsEnter=await ruins.client.request({t:'expeditionEnter',expedition:'ruinas_forja'},
            message=>message.t==='dungeonEnter');
        assert.equal(ruinsEnter.expedition,'ruinas_forja');
        assert.equal(ruinsEnter.expeditionLayout,'forge_ruins_v1');
        const ruinsExit=await ruins.client.request({t:'expeditionExit'},message=>message.t==='dungeonExit');
        assert.deepEqual([ruinsExit.x,ruinsExit.y],[50,50]);

        const depths=await connect(port,names.depths);clients.push(depths.client);
        assert.deepEqual([depths.self.x,depths.self.y,depths.self.floor||0],[83,17,0]);
        const depthsEnter=await depths.client.request({t:'enterDungeon'},message=>message.t==='dungeonEnter');
        assert.equal(depthsEnter.floor,1);
        assert.equal(depthsEnter.expedition,undefined);
        assert.deepEqual([depthsEnter.x,depthsEnter.y],[50,52]);
    }catch(error){error.message+='\nBackend stderr: '+stderr.slice(-1200)+'\nIsolated files: '+tmp;throw error;}
    finally{
        for(const client of clients)await client.close().catch(()=>{});
        child.kill();
        await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);
    }
});
