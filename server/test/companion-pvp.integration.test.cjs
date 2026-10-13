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
const transport='s256:'+crypto.createHash('sha256').update('isolated-companion-pvp').digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Client{
  constructor(ws){
    this.ws=ws;this.messages=[];this.waiters=[];
    ws.on('message',raw=>{
      const message=JSON.parse(raw),index=this.waiters.findIndex(w=>w.match(message));
      if(index<0)this.messages.push(message);
      else{const [w]=this.waiters.splice(index,1);clearTimeout(w.timer);w.resolve(message);}
    });
  }
  next(match,timeout=6000){
    const index=this.messages.findIndex(match);
    if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
    return new Promise((resolve,reject)=>{
      const waiter={match,resolve,timer:setTimeout(()=>{
        this.waiters=this.waiters.filter(w=>w!==waiter);
        reject(Error('Timed out waiting for message; recent='+JSON.stringify(this.messages.slice(-12).map(m=>m.t))));
      },timeout)};
      this.waiters.push(waiter);
    });
  }
  request(message,match){this.ws.send(JSON.stringify(message));return this.next(match);}
  async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
    await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}
function account(name,x,y,gold){
  const salt=crypto.randomBytes(16).toString('hex');
  const pwHash=`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
  const skills=Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia']
    .map(key=>[key,{val:18,xp:0,xpNext:2400}]));
  return {name,pwHash,savedAt:Date.now(),createdAt:Date.now(),email:null,emailVerified:false,resetToken:null,
    save:{v:2,x,y,gold,skills,pvp:true,inv:{BESTA:1},equipped:{weapon:'BESTA',offhand:null,armor:null,
      head:null,feet:null,neck:null},chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
      enchantToken:crypto.randomUUID(),transmutationToken:crypto.randomUUID(),progressionToken:crypto.randomUUID(),
      transmutationPity:0,hp:100,maxHp:100,mp:100,maxMp:100,savedAt:Date.now()}};
}
const freePort=()=>new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
async function waitBackend(port,child){
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Backend exited: '+child.exitCode);
    try{await new Promise((resolve,reject)=>{const req=http.get(`http://127.0.0.1:${port}/health`,response=>{
      response.resume();resolve();});req.once('error',reject);req.setTimeout(500,()=>req.destroy(Error('timeout')));});return;
    }catch{await pause(100);}
  }
  throw Error('Backend did not listen');
}
async function connect(port,name,hp=100){
  const ws=await new Promise((resolve,reject)=>{const socket=new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once('open',()=>resolve(socket));socket.once('error',reject);});
  const client=new Client(ws);
  const auth=await client.request({t:'auth',name,pwHash:transport,platform:'browser'},m=>m.t==='authOk'||m.t==='authFail');
  assert.equal(auth.t,'authOk',JSON.stringify(auth));
  const state=await client.request({t:'join',name,equipmentVersion:1,pvp:true,hp,maxHp:100,mp:100,maxMp:100},m=>m.t==='state');
  return {client,state};
}
function admin(port,token){return new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,
  path:'/api/admin/companions',headers:{'x-admin-token':token}},res=>{let raw='';res.on('data',x=>raw+=x);
    res.on('end',()=>res.statusCode===200?resolve(JSON.parse(raw)):reject(Error('admin '+res.statusCode+': '+raw)));});
  req.once('error',reject);});}

test('real WebSocket: human hits an adventurer; only attacker is hit back, dies and respawns without PK reward',
  {timeout:45000},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-companion-pvp-'));
  const names={attacker:'Pvpa'+crypto.randomBytes(3).toString('hex'),
    innocent:'Pvpi'+crypto.randomBytes(3).toString('hex'),safe:'Pvps'+crypto.randomBytes(3).toString('hex')};
  const accountsFile=path.join(tmp,'accounts.json');
  fs.writeFileSync(accountsFile,JSON.stringify({v:1,savedAt:Date.now(),accounts:[
    account(names.attacker,56,50,12000),account(names.innocent,56,51,0),account(names.safe,50,50,12000)]}));
  const port=await freePort(),token='local-companion-pvp-'+crypto.randomBytes(8).toString('hex');
  const entry="const http=require('node:http');const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return listen.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');const realNow=Date.now;Date.now=()=>realNow()+181000;process.on('message',m=>{if(m==='stop')process.emit('SIGTERM')});";
  const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
    env:{...process.env,PORT:String(port),STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:accountsFile,
      MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:token,
      ADMIN_NAME:'__companion_pvp_qa__',ALERTS_ENABLED:'0'}});
  let stderr='';child.stderr.on('data',x=>stderr+=x);child.stdout.on('data',()=>{});
  const clients=[];
  try{
    await waitBackend(port,child);
    const attacker=await connect(port,names.attacker,1);clients.push(attacker.client);
    const innocent=await connect(port,names.innocent);clients.push(innocent.client);
    const safe=await connect(port,names.safe);clients.push(safe.client);
    assert.equal(attacker.state.players.find(p=>p.id===attacker.state.you).x,56);
    let bot;
    for(let i=0;i<15;i++){
      const frame=await attacker.client.next(m=>m.t==='companions');
      bot=frame.list.find(b=>b.canAttack&&b.hp>30);
      if(bot)break;
    }
    assert.ok(bot,'an adventurer must be available near the human outside the protected area');
    const blocked=await innocent.client.request({t:'companionAttack',id:bot.id},m=>m.t==='companionAttackResult');
    assert.equal(blocked.reason,'no_gold');
    const inPlaza=await safe.client.request({t:'companionAttack',id:bot.id},m=>m.t==='companionAttackResult');
    assert.equal(inPlaza.reason,'safe_zone');
    const hit=await attacker.client.request({t:'companionAttack',id:bot.id,amount:99999,range:99999},
      m=>m.t==='companionAttackResult');
    assert.equal(hit.ok,true,JSON.stringify(hit));assert.ok(hit.actual>0&&hit.actual<=120);
    const cooldown=await attacker.client.request({t:'companionAttack',id:bot.id},
      m=>m.t==='companionAttackResult');
    assert.equal(cooldown.reason,'cooldown');
    const response=await attacker.client.next(m=>m.t==='pvpHit'&&m.from===bot.id,6000);
    assert.ok(response.actual>0,'server applies actual retaliation');
    const death=await attacker.client.next(m=>m.t==='pstats'&&m.id===attacker.state.you&&m.hp===0,25000);
    const respawn=await attacker.client.next(m=>m.t==='pstats'&&m.id===attacker.state.you&&m.hp>0);
    assert.ok(respawn.hp>0&&death.maxHp>0);
    await pause(700);
    assert.equal(innocent.client.messages.some(m=>m.t==='pvpHit'&&m.from===bot.id),false);
    const after=await admin(port,token),actor=after.actors.find(b=>b.id===bot.id);
    assert.equal(actor.kills,0);assert.equal(actor.xp,0);
    assert.equal(attacker.client.messages.some(m=>m.t==='pkKill'),false);
    assert.equal(JSON.parse(fs.readFileSync(accountsFile)).accounts.find(a=>a.name===names.attacker).save.gold,12000);
  }catch(error){error.message+='\nserver stderr='+stderr.slice(-1200);throw error;}
  finally{
    await Promise.all(clients.map(c=>c.close()));
    if(child.exitCode===null)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Isolated backend did not flush and stop')),4000);
      child.once('exit',()=>{clearTimeout(timer);resolve();});child.send('stop');
    });
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
