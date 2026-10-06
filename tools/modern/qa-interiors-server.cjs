// Isolated WebSocket integration check for the two shared village interiors.
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
const WebSocket=require(path.join(__dirname,'.local-deps/node_modules/ws'));
const world=require('../../modern-world');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-interiors-'));
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
            inv:{SILK:20,ASA_MORCEGO:20,OSSO:20,ESPADA:5,POTION:5},
            equipped:{weapon:null,offhand:null,armor:null,head:null,feet:null,neck:null},
            chests:{b1:{},b2:{},b3:{},b4:{}},quests:{active:{},completed:[],daily:null},
            hp:250,maxHp:250,mp:200,maxMp:200,pvp:true,savedAt:now};
        return {name,pwHash,save,savedAt:now,createdAt:now,email:null,emailVerified:false,resetToken:null};
    });
    fs.writeFileSync(path.join(tmp,'accounts.json'),JSON.stringify({v:1,savedAt:now,accounts}));
}
async function connect(port,name){
    const ws=await new Promise((resolve,reject)=>{
        const socket=new WebSocket(`ws://127.0.0.1:${port}`);
        socket.once('open',()=>resolve(socket));socket.once('error',reject);
    });
    const c=new Client(ws);
    const auth=await c.request({t:'auth',name,pwHash:hash,platform:'browser'},m=>m.t==='authOk'||m.t==='authFail');
    assert.equal(auth.t,'authOk',JSON.stringify(auth));
    const state=await c.request({t:'join',name,equipmentVersion:1,pvp:true,lang:'pt'},m=>m.t==='state');
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
    const rooms=Object.fromEntries(world.interiors.map(r=>[r.id,r]));
    assert.deepEqual(world.interiors.map(r=>r.floor),[1000,1001,1002,1003]);
    assert.deepEqual(rooms.pousada.door,{x:44,y:46});
    assert.deepEqual(rooms.oficina.door,{x:52,y:45});
    assert.deepEqual(rooms.biblioteca.door,{x:57,y:49});
    assert.deepEqual(rooms.mercado.door,{x:43,y:53});
    assert.deepEqual(rooms.oficina.services,[{kind:'craft',x:50,y:46}]);
    assert.deepEqual(rooms.biblioteca.services,[{kind:'altar',x:50,y:46}]);
    assert.deepEqual(rooms.mercado.services,[{kind:'dummy',x:50,y:46}]);
    const suffix=crypto.randomBytes(2).toString('hex');
    seedAccounts(['RoomA'+suffix,'RoomB'+suffix]);
    const port=await getPort();
    const entry="const http=require('node:http');const original=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return original.call(this,port,'127.0.0.1',...rest)};require('./server/server.js');";
    const child=spawn(process.execPath,['-e',entry],{
        cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
        env:{...process.env,PORT:String(port),NODE_PATH:path.join(__dirname,'.local-deps/node_modules'),
            STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:path.join(tmp,'accounts.json'),
            MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'',
            ADMIN_NAME:'__interiors_qa__',ALERTS_ENABLED:'0'}
    });
    let backendError='';child.stderr.on('data',b=>backendError+=b.toString());
    child.stdout.on('data',()=>{});
    const clients=[];
    try{
        await waitBackend(port,child);
        const a=await connect(port,'RoomA'+suffix);clients.push(a.c);
        assert.deepEqual({x:a.self.x,y:a.self.y},{x:50,y:50});
        const b=await connect(port,'RoomB'+suffix);clients.push(b.c);
        a.c.send({t:'tradeRequest',toName:'RoomB'+suffix});
        const offer=await b.c.next(m=>m.t==='tradeOffer');
        assert.equal(offer.fromId,a.state.you);
        await walk(a.c,{x:50,y:50},[[49,49],[48,48]]);
        const outdoorBuy=await a.c.request({t:'invShop',op:'buy',idx:0},m=>m.t==='invUpdate'&&m.shop?.op==='buy');
        assert.equal(outdoorBuy.shop.item,'POTION');
        await walk(a.c,{x:48,y:48},[[49,49],[50,50],[50,51]]);
        const outdoorCraft=await a.c.request({t:'invCraft',idx:0},m=>m.t==='invUpdate'&&m.craft);
        assert.equal(outdoorCraft.craft.ok,true);
        await walk(a.c,{x:50,y:51},[[50,50]]);
        const far=await a.c.request({t:'enterInterior',id:'pousada'},m=>m.t==='interiorResult');
        assert.equal(far.error,'not_at_door');
        await walk(a.c,{x:50,y:50},[[49,49],[48,48],[47,47],[46,46],[45,46],[44,46]]);
        let entered=await a.c.request({t:'enterInterior',id:'pousada'},m=>m.t==='dungeonEnter');
        assert.equal(entered.floor,1000);assert.equal(entered.interior,'pousada');
        assert.equal(entered.pvp,false);assert.deepEqual(entered.stairs.up,rooms.pousada.exit);
        assert.equal(entered.grid.rows.length,7);
        // City NPC coordinates overlap this grid, but their services stay outdoors.
        await walk(a.c,{x:50,y:50},[[49,49],[48,48]]);
        const beforeServices=a.c.messages.length;
        a.c.send({t:'auctionBrowse'});
        a.c.send({t:'invShop',op:'buy',idx:0});
        a.c.send({t:'questTurnIn',kind:'simple',questId:'fixture'});
        await a.c.flush();
        assert(!a.c.messages.slice(beforeServices).some(m=>
            m.t==='auctions'||m.t==='questResult'||m.t==='serverMsg'||m.shop));
        await walk(a.c,{x:48,y:48},[[49,49],[50,50]]);
        // A trade offer made in town cannot be accepted after its sender enters a room.
        b.c.send({t:'tradeAccept',fromId:a.state.you});
        await b.c.flush();await a.c.flush();
        assert(!a.c.messages.some(m=>m.t==='tradeStart'));
        assert(!b.c.messages.some(m=>m.t==='tradeStart'));
        await walk(a.c,{x:50,y:50},[[50,49]]);
        const farExit=await a.c.request({t:'exitInterior'},m=>m.t==='interiorResult');
        assert.equal(farExit.error,'not_at_exit');
        await walk(a.c,{x:50,y:49},[[50,50]]);
        // Existing dungeon commands cannot climb or descend from an interior.
        a.c.send({t:'exitDungeon'});a.c.send({t:'descendDungeon'});await a.c.flush();
        assert(!a.c.messages.some(m=>m.t==='dungeonExit'||m.t==='dungeonEnter'));
        await walk(b.c,{x:50,y:50},[[49,49],[48,48],[47,47],[46,46],[45,46],[44,46]]);
        const enteredB=await b.c.request({t:'enterInterior',id:'pousada'},m=>m.t==='dungeonEnter');
        assert.equal(enteredB.floor,1000);
        assert(enteredB.players.some(p=>p.id===a.state.you),'second account sees first in shared room');
        await a.c.next(m=>m.t==='join'&&m.player?.id===b.state.you);
        a.c.send({t:'pvpAttack',targetId:b.state.you,amount:1000,range:99});
        b.c.send({t:'pvpAttack',targetId:a.state.you,amount:1000,range:99});
        await a.c.flush();await b.c.flush();
        assert(!a.c.messages.some(m=>m.t==='pvpHit'));
        assert(!b.c.messages.some(m=>m.t==='pvpHit'));
        assert(!a.c.messages.some(m=>m.t==='playerStun'));
        await walk(b.c,{x:50,y:50},[[50,51]]);
        const leftB=await b.c.request({t:'exitInterior'},m=>m.t==='dungeonExit');
        assert.deepEqual({x:leftB.x,y:leftB.y,pvp:leftB.pvp},{x:44,y:46,pvp:true});
        const repeat=await b.c.request({t:'enterInterior',id:'pousada'},m=>m.t==='dungeonEnter');
        assert.equal(repeat.floor,1000);
        // Save in room must record the safe town position and reconnect on floor 0.
        a.c.send({t:'saveUpload',data:{v:2,x:50,y:50,quests:{active:{},completed:[]}}});
        await a.c.flush();await a.c.close();
        const a2=await connect(port,'RoomA'+suffix);clients.push(a2.c);
        assert.deepEqual({x:a2.auth.save.x,y:a2.auth.save.y},{x:50,y:50});
        assert.deepEqual({x:a2.self.x,y:a2.self.y},{x:50,y:50});
        await walk(b.c,{x:50,y:50},[[50,51]]);
        await b.c.request({t:'exitInterior'},m=>m.t==='dungeonExit');
        // The second building uses its own floor and door.
        await walk(a2.c,{x:50,y:50},[[51,49],[52,48],[52,47],[52,46],[52,45]]);
        const office=await a2.c.request({t:'enterInterior',id:'oficina'},m=>m.t==='dungeonEnter');
        assert.equal(office.floor,1001);assert.equal(office.interior,'oficina');
        const farCraft=await a2.c.request({t:'invCraft',idx:0},m=>m.t==='serverMsg'&&/bancada/i.test(m.text));
        assert(farCraft);
        await walk(a2.c,{x:50,y:50},[[50,49],[50,48],[50,47]]);
        const wrongAltar=await a2.c.request({t:'trainAttempt',skill:'Magia'},m=>m.t==='invUpdate'&&m.trainResult);
        assert.equal(wrongAltar.trainResult.reason,'not_at_altar');
        const made=await a2.c.request({t:'invCraft',idx:0},m=>m.t==='invUpdate'&&m.craft);
        assert.equal(made.craft.ok,true,'real crafting in workshop');
        const forged=await a2.c.request({t:'invForge',itemKey:'ESPADA'},m=>m.t==='invUpdate'&&m.forge);
        assert.notEqual(forged.forge.error,'not_at_bench','forge allowed at workshop service');
        assert.equal(typeof forged.forge.cost,'number');
        await walk(a2.c,{x:50,y:47},[[50,48],[50,49],[50,50]]);
        const exitOffice=await a2.c.request({t:'exitInterior'},m=>m.t==='dungeonExit');
        assert.deepEqual({x:exitOffice.x,y:exitOffice.y},{x:52,y:45});
        await walk(a2.c,{x:52,y:45},[[52,46],[52,47],[52,48],[51,49],[50,50],
            [51,50],[52,50],[53,50],[54,50],[55,50],[56,49],[57,49]]);
        const temple=await a2.c.request({t:'enterInterior',id:'biblioteca'},m=>m.t==='dungeonEnter');
        assert.equal(temple.floor,1002);
        await walk(a2.c,{x:50,y:50},[[50,49],[50,48],[50,47]]);
        const wrongCraft=await a2.c.request({t:'invCraft',idx:0},m=>m.t==='serverMsg'&&/bancada/i.test(m.text));
        assert(wrongCraft,'craft rejected beside temple altar');
        await delay(1600); // the existing training cooldown also applies across rooms
        const magic=await a2.c.request({t:'trainAttempt',skill:'Magia'},m=>m.t==='invUpdate'&&m.trainResult);
        assert.equal(magic.trainResult.ok,true,'real magic training at temple altar');
        await walk(a2.c,{x:50,y:47},[[50,48],[50,49],[50,50]]);
        const exitTemple=await a2.c.request({t:'exitInterior'},m=>m.t==='dungeonExit');
        assert.deepEqual({x:exitTemple.x,y:exitTemple.y},{x:57,y:49});
        await walk(a2.c,{x:57,y:49},[[56,49],[55,50],[54,50],[53,50],[52,50],[51,50],[50,50],
            [49,51],[48,52],[47,53],[46,53],[45,53],[44,53],[43,53]]);
        const training=await a2.c.request({t:'enterInterior',id:'mercado'},m=>m.t==='dungeonEnter');
        assert.equal(training.floor,1003);
        await walk(a2.c,{x:50,y:50},[[50,49],[50,48],[50,47]]);
        const dummy=await a2.c.request({t:'trainAttempt',skill:'Punho'},m=>m.t==='invUpdate'&&m.trainResult);
        assert.equal(dummy.trainResult.ok,true,'real weapon training at dummy');
        await walk(a2.c,{x:50,y:47},[[50,48],[50,49],[50,50]]);
        const exitTraining=await a2.c.request({t:'exitInterior'},m=>m.t==='dungeonExit');
        assert.deepEqual({x:exitTraining.x,y:exitTraining.y},{x:43,y:53});
        console.log(JSON.stringify({status:'PASS',checks:['invalid distance','repeated entry/exit','shared room two accounts','PvP blocked','city services blocked','stale trade offer blocked','dungeon jumps blocked','save/relogin to town','four rooms','outdoor buy/craft','real workshop craft/forge','real temple/dummy training','wrong room and far service denied'],fixtures:tmp},null,2));
    }finally{
        await Promise.all(clients.map(c=>c.close().catch(()=>{})));
        child.kill();
        await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);
        if(child.exitCode===null && child.signalCode===null)throw Error('Backend did not stop. '+backendError.slice(-1000));
    }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
