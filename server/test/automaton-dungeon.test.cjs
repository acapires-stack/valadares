'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const progression=require('../../progression-content');
const WebSocket=require(path.join(root,'tools/modern/.local-deps/node_modules/ws'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transport='s256:'+crypto.createHash('sha256').update('automaton-isolated-fixture').digest('hex');

function account(name){
    const salt=crypto.randomBytes(16).toString('hex');
    return {name,pwHash:`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`,
        save:{v:2,x:23,y:60,gold:1000,inv:{POTION:5},skills:{},equipped:{weapon:null},
            chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
            hp:500,maxHp:500,mp:200,maxMp:200},savedAt:Date.now(),createdAt:Date.now()};
}
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
    const port=s.address().port;await new Promise(r=>s.close(r));return port;}
class Client{
    constructor(ws){this.ws=ws;this.messages=[];this.waiters=[];ws.on('message',raw=>{
        const m=JSON.parse(raw),i=this.waiters.findIndex(w=>w.match(m));
        if(i<0)this.messages.push(m);else{const [w]=this.waiters.splice(i,1);clearTimeout(w.timer);w.resolve(m);}
    });}
    next(match,timeout=5000){const i=this.messages.findIndex(match);
        if(i>=0)return Promise.resolve(this.messages.splice(i,1)[0]);
        return new Promise((resolve,reject)=>{const w={match,resolve,timer:setTimeout(()=>{
            this.waiters=this.waiters.filter(x=>x!==w);reject(Error('WS timeout '+JSON.stringify(this.messages.slice(-5))));
        },timeout)};this.waiters.push(w);});}
    request(msg,match){const out=this.next(match);this.ws.send(JSON.stringify(msg));return out;}
    async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
        await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}
async function connect(port,name){
    const ws=await new Promise((resolve,reject)=>{const s=new WebSocket(`ws://127.0.0.1:${port}`);
        s.once('open',()=>resolve(s));s.once('error',reject);});
    const c=new Client(ws);
    const auth=await c.request({t:'auth',name,pwHash:transport,platform:'browser'},m=>m.t==='authOk'||m.t==='authFail');
    assert.equal(auth.t,'authOk',JSON.stringify(auth));
    const state=await c.request({t:'join',name,equipmentVersion:1,pvp:true,lang:'pt'},m=>m.t==='state');
    return {c,state,self:state.players.find(p=>p.id===state.you)};
}
const testHook=`
process.on('message',msg=>{
  if(!msg||msg.kind!=='automatonQa')return;
  try{
    const floor=Number(msg.floor)||0;
    const p=[...players.values()].find(row=>row.name===msg.name);
    let data;
    if(msg.action==='inspect'){
      const mobs=[...monsters.values()].filter(m=>m.floor===floor&&m.hp>0);
      data={mobs:mobs.map(m=>({id:m.id,type:m.type,hp:m.maxHp,dmg:m.dmg,xp:m.xp,
        depth:m.automatonDepth,unique:m.unique})),grid:dungeonFloors.has(floor),
        bossDeath:automatonBossDeath.get(floor)||0,
        isAutomaton:isAutomatonFloor(floor),isDepth:isDungeonFloor(floor),gold:p?.gold,
        inv:p?.inv,bossLevel:bossLevel.get('FORGE_WARDEN')||0,
        dungeonUnlock:p?.dungeonUnlock||0,expeditionClears:p?.expeditionClears||0,
        expeditionPending:p?.expeditionPending||null,
        position:p?{x:p.x,y:p.y,floor:p.floor}:null,
        movement:p?{version:p.movementVersion,epoch:p._movementEpoch,seq:p._movementSeq}:null};
    }else if(msg.action==='stair'){
      if(!p||!dungeonFloors.has(p.floor))throw Error('player/grid missing: '+msg.name+' floor='+p?.floor);
      const s=dungeonFloors.get(p.floor).stairs[msg.stair];if(!s)throw Error('stair missing');
      p.hp=100000;p.maxHp=100000;p.x=s.x;p.y=s.y;data={x:p.x,y:p.y,floor:p.floor};
    }else if(msg.action==='enterDepth'){
      if(!p||!Number.isInteger(msg.depth)||msg.depth<1||msg.depth>999)throw Error('invalid depth');
      enterAutomatonFloor(p,p.id,msg.depth,'down');
      data={floor:p.floor,x:p.x,y:p.y};
    }else if(msg.action==='collisionRing'){
      if(!p||p.floor!==2001)throw Error('requires first floor');
      for(const m of [...monsters.values()])if(m.floor===p.floor)monsters.delete(m.id);
      p.x=50;p.y=52;p.hp=p.maxHp=100000;
      const cells=[[51,52],[50,51],[51,51],[52,51],[52,52],[50,53],[51,53],[52,53]];
      for(const [x,y] of cells)if(!spawnMob('FORGE_SENTRY',x,y,p.floor,1))throw Error('ring spawn blocked '+x+','+y);
      data={position:{x:p.x,y:p.y,floor:p.floor},count:cells.length,
        movement:{version:p.movementVersion,epoch:p._movementEpoch,seq:p._movementSeq}};
    }else if(msg.action==='openRing'){
      const m=mobAt(52,52,2001);if(!m)throw Error('ring vacancy missing');
      monsters.delete(m.id);data={removed:m.id};
    }else if(msg.action==='removeCommon'){
      const m=[...monsters.values()].find(m=>m.floor===floor&&m.automaton&&!m.unique);
      if(!m)throw Error('common mob missing');monsters.delete(m.id);data={removed:m.id};
    }else if(msg.action==='killBoss'){
      const m=[...monsters.values()].find(m=>m.floor===floor&&m.type===progression.automatonDungeon.boss);
      if(!m||!p)throw Error('boss/player missing');
      const before=p.gold;m.hp=0;handleMobDeath(m,p.id);
      data={before,after:p.gold,deadAt:automatonBossDeath.get(floor)||0,inv:p.inv};
    }else if(msg.action==='tick'){spawnAutomatonMobs();data={ok:true};}
    else if(msg.action==='saveState'){saveStateToDisk();data={ok:true};}
    else if(msg.action==='loot'){
      const random=Math.random;Math.random=()=>0;
      try{data={loot:rollLoot(msg.type,0,floor,automatonDepth(floor))};}
      finally{Math.random=random;}
    }else throw Error('unknown action');
    process.send({seq:msg.seq,data});
  }catch(e){process.send({seq:msg.seq,error:e.message});}
});`;
async function startServer(port,temp){
    const boot="const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');"+
        "const filename=path.resolve('server/server.js');const m=new Module(filename,module);"+
        "m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));"+
        `m._compile(fs.readFileSync(filename,'utf8')+${JSON.stringify(testHook)},filename);`+
        "const clock=Date.now;Date.now=()=>clock()+181000;";
    const entry="const http=require('node:http');const listen=http.Server.prototype.listen;"+
        "http.Server.prototype.listen=function(port,...rest){return listen.call(this,port,'127.0.0.1',...rest)};"+boot;
    const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
        env:{...process.env,PORT:String(port),NODE_PATH:path.join(root,'tools/modern/.local-deps/node_modules'),
            STATE_FILE_PATH:path.join(temp,'state.json'),ACCOUNTS_FILE_PATH:path.join(temp,'accounts.json'),
            MP_CREDITED_PATH:path.join(temp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
            ADMIN_NAME:'__automaton_qa__',ALERTS_ENABLED:'0',PROGRESSION_ENABLED:'1'}});
    let stderr='';child.stderr.on('data',d=>stderr+=d);child.stdout.on('data',()=>{});
    for(let i=0;i<60;i++){
        if(child.exitCode!==null)throw Error('backend exited: '+stderr.slice(-2000));
        try{await new Promise((resolve,reject)=>{const req=http.get(`http://127.0.0.1:${port}/health`,r=>{r.resume();resolve();});
            req.once('error',reject);req.setTimeout(500,()=>req.destroy(Error('timeout')));});
            return {child,stderr:()=>stderr};}catch{await delay(100);}
    }
    child.kill();throw Error('backend not ready: '+stderr.slice(-2000));
}
let qaSeq=0;
function qa(child,action,extra={}){const seq=++qaSeq;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.off('message',listener);reject(Error('QA IPC timeout'))},5000);
    const listener=msg=>{if(msg.seq!==seq)return;clearTimeout(timer);child.off('message',listener);
        if(msg.error)reject(Error(msg.error));else resolve(msg.data);};
    child.on('message',listener);child.send({kind:'automatonQa',seq,action,...extra});
});}

test('shared Automaton dungeon has separate floors, 8s replenishment, logical scaling and boss loot',
    {timeout:60000},async()=>{
    assert.deepEqual(progression.automatonDungeon.npc,{x:23,y:60});
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-automaton-'));
    const names=['AutoA'+crypto.randomBytes(2).toString('hex'),'AutoB'+crypto.randomBytes(2).toString('hex')];
    fs.writeFileSync(path.join(temp,'accounts.json'),JSON.stringify({v:1,savedAt:Date.now(),accounts:names.map(account)}));
    fs.writeFileSync(path.join(temp,'state.json'),JSON.stringify({v:1,savedAt:Date.now(),nextMobId:910001,monsters:[]}));
    const port=await freePort(),running=await startServer(port,temp),clients=[];
    try{
        const a=await connect(port,names[0]);clients.push(a.c);
        assert.deepEqual([a.self.x,a.self.y,a.self.floor||0],[23,60,0]);
        assert.equal((await a.c.request({t:'automatonDescend'},m=>m.t==='automatonResult')).error,'not_in_automaton');
        const one=await a.c.request({t:'automatonEnter'},m=>m.t==='dungeonEnter');
        assert.equal(one.automaton,'complexo_automatos');assert.equal(one.depth,1);assert.equal(one.floor,2001);
        assert.equal(one.mobs.filter(m=>!m.unique).length,9);
        assert.equal((await qa(running.child,'inspect',{floor:8000})).isAutomaton,false);
        assert.equal((await qa(running.child,'inspect',{floor:9000})).isAutomaton,false);
        assert.equal((await qa(running.child,'inspect',{floor:1})).isDepth,true);
        const b=await connect(port,names[1]);clients.push(b.c);
        const shared=await b.c.request({t:'automatonEnter'},m=>m.t==='dungeonEnter');
        assert.equal(shared.floor,one.floor);assert(shared.players.some(p=>p.name===names[0]));
        await qa(running.child,'stair',{name:names[1],stair:'up'});
        assert.equal((await qa(running.child,'inspect',{floor:2001})).mobs.filter(m=>!m.unique).length,9);
        assert.equal((await a.c.request({t:'automatonDescend'},m=>m.t==='automatonResult')).error,'not_at_stair');
        for(let depth=2;depth<=10;depth++){
            await qa(running.child,'stair',{name:names[0],stair:'down'});
            const entered=await a.c.request({t:'automatonDescend'},m=>m.t==='dungeonEnter');
            assert.equal(entered.depth,depth);assert.equal(entered.floor,2000+depth);
            assert.equal(entered.mobs.filter(m=>!m.unique).length,9);
            if(depth===2){
                assert.notDeepEqual(entered.grid.rows,one.grid.rows,'depths have distinct procedural layouts');
                const common=(await qa(running.child,'inspect',{floor:2002})).mobs.find(m=>!m.unique);
                assert(common);
                assert.equal(common.hp,common.type==='FORGE_SENTRY'?224:320);
                assert.equal(common.dmg,common.type==='FORGE_SENTRY'?18:21);
            }
            if(depth===5){
                const boss=(await qa(running.child,'inspect',{floor:2005})).mobs.find(m=>m.type==='FORGE_WARDEN');
                assert(boss);assert.equal(boss.hp,900);assert.equal(boss.dmg,20);
                const before=await qa(running.child,'inspect',{floor:2005,name:names[0]});
                const loot=await qa(running.child,'loot',{floor:2005,type:'FORGE_WARDEN'});
                assert(loot.loot.some(item=>item.type==='GOLD'&&item.qty>=192));
                assert(!loot.loot.some(item=>item.type==='FRAGMENTO_FORJA'||item.type==='MACHADO_FORJA'));
                const killed=await qa(running.child,'killBoss',{floor:2005,name:names[0]});
                assert(killed.deadAt>0);assert(killed.after>killed.before);
                const after=await qa(running.child,'inspect',{floor:2005,name:names[0]});
                assert.equal(after.bossLevel,before.bossLevel);
                assert.equal(after.dungeonUnlock,before.dungeonUnlock);
                assert.equal(after.expeditionClears,before.expeditionClears);
                assert.equal(after.expeditionPending,null);
                await qa(running.child,'tick');
                assert.equal((await qa(running.child,'inspect',{floor:2005})).mobs.filter(m=>m.type==='FORGE_WARDEN').length,0);
                await qa(running.child,'removeCommon',{floor:2005});
                assert.equal((await qa(running.child,'inspect',{floor:2005})).mobs.filter(m=>!m.unique).length,8);
                await delay(8200);
                assert.equal((await qa(running.child,'inspect',{floor:2005})).mobs.filter(m=>!m.unique).length,9);
            }
            await delay(650);
        }
        const ten=await qa(running.child,'inspect',{floor:2010});
        const boss10=ten.mobs.find(m=>m.type==='FORGE_WARDEN');
        assert(boss10);assert.equal(boss10.hp,2250);assert.equal(boss10.dmg,50);assert.equal(boss10.xp,1750);
        const common10=ten.mobs.find(m=>!m.unique);
        assert(common10);
        assert.equal(common10.hp,common10.type==='FORGE_SENTRY'?896:1280);
        await qa(running.child,'stair',{name:names[0],stair:'up'});
        const rose=await a.c.request({t:'automatonAscend'},m=>m.t==='dungeonEnter');
        assert.equal(rose.depth,9);
        assert.deepEqual([rose.x,rose.y],[rose.stairs.down.x,rose.stairs.down.y],
            'ascending arrives by the previous floor down stair');
        await delay(650);
        await qa(running.child,'stair',{name:names[0],stair:'down'});
        assert.equal((await a.c.request({t:'automatonDescend'},m=>m.t==='dungeonEnter')).depth,10);
        await qa(running.child,'saveState');
        const persisted=JSON.parse(fs.readFileSync(path.join(temp,'state.json'),'utf8'));
        assert(!persisted.monsters.some(m=>m.floor>=2001&&m.floor<=2999),
            'automaton mobs remain ephemeral for compatibility with older server rollback');
        await qa(running.child,'enterDepth',{name:names[0],depth:25});
        const twentyFive=await a.c.next(m=>m.t==='dungeonEnter'&&m.depth===25);
        assert(twentyFive.stairs.town,'andar 25 tem retorno à cidade');
        assert.notDeepEqual(twentyFive.stairs.boss,twentyFive.stairs.up);
        assert.equal((await qa(running.child,'inspect',{floor:2025})).mobs.filter(m=>m.type==='FORGE_WARDEN').length,1,
            'chefe do andar 25 nasce na entrada');
        await delay(650);
        await qa(running.child,'stair',{name:names[0],stair:'up'});
        assert.equal((await a.c.request({t:'automatonExit'},m=>m.t==='automatonResult')).error,'not_at_stair',
            'saída direta exige escada town');
        await qa(running.child,'stair',{name:names[0],stair:'town'});
        const exit=await a.c.request({t:'automatonExit'},m=>m.t==='dungeonExit');
        assert.deepEqual([exit.x,exit.y],[50,50]);
        assert.equal((await qa(running.child,'inspect',{floor:2001})).mobs.filter(m=>!m.unique).length,9,
            'other player keeps the shared first floor populated');
        const ring=await qa(running.child,'collisionRing',{name:names[1]});
        assert.equal(ring.count,8);
        function posMessage(move){
            const frame={t:'pos',x:51,y:52};
            if(move.version===1)Object.assign(frame,{floor:2001,epoch:move.epoch,seq:move.seq+1});
            return frame;
        }
        const correction=b.c.next(m=>m.t==='posCorrect');
        b.c.ws.send(JSON.stringify(posMessage(ring.movement)));
        assert.equal((await correction).reason,'occupied');
        assert.deepEqual((await qa(running.child,'inspect',{name:names[1],floor:2001})).position,
            {x:50,y:52,floor:2001},'sem vaga mantém player fora da casa do mob');
        await qa(running.child,'openRing');
        const beforeMove=await qa(running.child,'inspect',{name:names[1],floor:2001});
        b.c.ws.send(JSON.stringify(posMessage(beforeMove.movement)));
        await delay(100);
        assert.deepEqual((await qa(running.child,'inspect',{name:names[1],floor:2001})).position,
            {x:51,y:52,floor:2001},'com vaga desloca mob e aceita passo');
        await qa(running.child,'stair',{name:names[1],stair:'up'});
        await b.c.request({t:'automatonAscend'},m=>m.t==='dungeonExit');
        await qa(running.child,'tick');
        assert.equal((await qa(running.child,'inspect',{floor:2001})).grid,false);
        assert.equal((await qa(running.child,'inspect',{floor:2001})).mobs.length,0);
        console.log(JSON.stringify({status:'PASS',entrance:[23,60],town:[50,50],shared:2001,
            depth10BossHp:boss10.hp,depth25Boss:true,replenished:true,bossCooldown:true,isolatedFiles:temp}));
    }catch(error){error.message+='\nbackend stderr: '+running.stderr().slice(-1800)+'\nfixture: '+temp;throw error;}
    finally{for(const c of clients)await c.close().catch(()=>{});
        running.child.kill();await Promise.race([new Promise(resolve=>running.child.once('exit',resolve)),delay(2000)]);}
});
