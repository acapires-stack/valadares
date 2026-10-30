'use strict';
// Sobe um server.js real numa pasta temporária, com contas descartáveis e um hook
// opcional compilado no fim do módulo (acesso às funções internas para preparar cenários).
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const WebSocket=require(path.join(root,'node_modules/ws'));
const transport='s256:'+crypto.createHash('sha256').update('isolated-server-helper').digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function account(name,{x=48,y=53,gold=0,save={}}={}){
    const salt=crypto.randomBytes(16).toString('hex');
    return {name,pwHash:`scrypt$${salt}$${crypto.scryptSync(transport,salt,32,{N:16384,r:8,p:1}).toString('hex')}`,
        createdAt:Date.now(),savedAt:Date.now(),email:null,emailVerified:false,resetToken:null,
        save:save===null?null:{v:2,x,y,gold,inv:{},equipped:{},chests:{b1:{},b2:{},b3:{},b4:{}},
            quests:{active:{},completed:[],daily:null},hp:100,maxHp:100,mp:100,maxMp:100,...save}};
}
class Client{
    constructor(ws){this.ws=ws;this.messages=[];this.waiters=[];
        ws.on('message',raw=>{const message=JSON.parse(raw),index=this.waiters.findIndex(w=>w.match(message));
            if(index<0)this.messages.push(message);
            else{const [w]=this.waiters.splice(index,1);clearTimeout(w.timer);w.resolve(message);}});}
    next(match,timeout=6000){const index=this.messages.findIndex(match);
        if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
        return new Promise((resolve,reject)=>{const waiter={match,resolve,timer:setTimeout(()=>{
            this.waiters=this.waiters.filter(w=>w!==waiter);
            reject(Error('Timed out: '+JSON.stringify(this.messages.slice(-10).map(m=>m.t))));},timeout)};
            this.waiters.push(waiter);});}
    send(message){this.ws.send(JSON.stringify(message));}
    request(message,match){this.send(message);return this.next(match);}
    async close(){if(this.ws.readyState===WebSocket.CLOSED)return;
        await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close();setTimeout(resolve,1000);});}
}
const freePort=()=>new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',reject);
    socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});

// hook: código anexado ao server.js. Mensagens IPC {t:'eval',id,...} são respondidas por
// handlers registrados no hook via `qaHandlers[nome]=(msg)=>valor`.
async function startServer({accounts=[],hook='',env={}}={}){
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valadares-isolated-'));
    const accountsFile=path.join(tmp,'accounts.json');
    fs.writeFileSync(accountsFile,JSON.stringify({v:1,savedAt:Date.now(),accounts}));
    const port=await freePort();
    const fullHook=`\nconst qaHandlers={};\n${hook}\nprocess.on('message',async m=>{
        if(m==='stop')return process.emit('SIGTERM');
        if(m?.t!=='qa')return;
        try{process.send({t:'qaResult',seq:m.seq,value:await qaHandlers[m.name](m.args||{})});}
        catch(e){process.send({t:'qaResult',seq:m.seq,error:String(e&&e.stack||e)});}
    });`;
    const entry=`const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
      const http=require('node:http');const listen=http.Server.prototype.listen;
      http.Server.prototype.listen=function(port,...rest){return listen.call(this,port,'127.0.0.1',...rest)};
      const file=path.resolve('./server/server.js'),mod=new Module(file,module);
      mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
      mod._compile(fs.readFileSync(file,'utf8')+${JSON.stringify(fullHook)},file);
      const realNow=Date.now;Date.now=()=>realNow()+181000;`;
    const child=spawn(process.execPath,['-e',entry],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
        env:{...process.env,PORT:String(port),STATE_FILE_PATH:path.join(tmp,'state.json'),ACCOUNTS_FILE_PATH:accountsFile,
            MP_CREDITED_PATH:path.join(tmp,'mp_credited.json'),MP_ACCESS_TOKEN:'',ADMIN_TOKEN:'isolated-qa',
            ADMIN_NAME:'__isolated_qa__',ALERTS_ENABLED:'0',COMPANIONS_ENABLED:'0',...env}});
    let stderr='';child.stderr.on('data',x=>stderr+=x);child.stdout.on('data',()=>{});
    let seq=0;const clients=[];
    for(let i=0;;i++){
        if(child.exitCode!==null)throw Error('Backend exited: '+child.exitCode+'\n'+stderr);
        try{await new Promise((resolve,reject)=>{const req=http.get(`http://127.0.0.1:${port}/health`,res=>{
            res.resume();resolve();});req.once('error',reject);req.setTimeout(500,()=>req.destroy(Error('timeout')));});break;
        }catch{if(i>80)throw Error('Backend did not listen\n'+stderr);await pause(100);}
    }
    const server={port,tmp,accountsFile,clients,
        get stderr(){return stderr;},
        saved:name=>JSON.parse(fs.readFileSync(accountsFile)).accounts.find(a=>a.name===name),
        qa(name,args){const id=++seq;return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{child.off('message',receive);reject(Error('qa timeout: '+name));},5000);
            const receive=m=>{if(m?.t!=='qaResult'||m.seq!==id)return;clearTimeout(timer);child.off('message',receive);
                m.error?reject(Error(m.error)):resolve(m.value);};
            child.on('message',receive);child.send({t:'qa',seq:id,name,args});});},
        http(method,urlPath,body){return new Promise((resolve,reject)=>{
            const data=body===undefined?null:JSON.stringify(body);
            const req=http.request({hostname:'127.0.0.1',port,path:urlPath,method,
                headers:data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}},res=>{
                let raw='';res.on('data',x=>raw+=x);res.on('end',()=>{let json=null;try{json=JSON.parse(raw);}catch{}
                    resolve({status:res.statusCode,body:json});});});
            req.once('error',reject);if(data)req.write(data);req.end();});},
        async connect(name,join={}){
            const ws=await new Promise((resolve,reject)=>{const socket=new WebSocket(`ws://127.0.0.1:${port}`);
                socket.once('open',()=>resolve(socket));socket.once('error',reject);});
            const client=new Client(ws);clients.push(client);
            const auth=await client.request({t:'auth',name,pwHash:transport,platform:'browser'},m=>m.t==='authOk'||m.t==='authFail');
            assert.equal(auth.t,'authOk',JSON.stringify(auth));
            const state=await client.request({t:'join',name,equipmentVersion:1,...join},m=>m.t==='state');
            return {client,state};},
        async stop(){
            await Promise.all(clients.map(c=>c.close()));
            if(child.exitCode===null)await new Promise(resolve=>{
                const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},4000);
                child.once('exit',()=>{clearTimeout(timer);resolve();});child.send('stop');});
            fs.rmSync(tmp,{recursive:true,force:true});
        }};
    return server;
}
module.exports={account,startServer,pause,transport};
