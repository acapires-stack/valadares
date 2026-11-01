'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const test=require('node:test');
const WebSocket=require('../../node_modules/ws');
const {account,startServer,transport}=require('./helpers/isolated-server.cjs');

const newTransport='s256:'+crypto.createHash('sha256').update('fixture-new-password').digest('hex');
function post(port,token,body){
    const payload=JSON.stringify(body);
    return new Promise((resolve,reject)=>{
        const req=http.request({hostname:'127.0.0.1',port,path:'/api/admin/action',method:'POST',
            headers:{'x-admin-token':token,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},res=>{
            let raw='';res.on('data',part=>raw+=part);
            res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));
        });
        req.on('error',reject);req.end(payload);
    });
}
async function auth(port,name,pwHash){
    const ws=new WebSocket(`ws://127.0.0.1:${port}`);
    try{
        await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
        return await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('auth timeout')),5000);
            ws.on('message',raw=>{const message=JSON.parse(raw);if(message.t!=='authOk'&&message.t!=='authFail')return;
                clearTimeout(timer);resolve(message.t);});
            ws.send(JSON.stringify({t:'auth',name,pwHash,platform:'browser'}));
        });
    }finally{ws.close();}
}

test('admin troca somente senha de conta existente e persiste para novo login',async()=>{
    const target=account('Aliciaa',{save:{gold:345,hp:56,inv:{POCAO_HP:3}}});
    target.email='fixture@example.test';
    target.resetToken={token:'fixture-token',expiresAt:Date.now()+60000};
    const other=account('Alicia',{save:{gold:789}});
    const originalSave=structuredClone(target.save),originalHash=target.pwHash;
    let server=await startServer({accounts:[target,other]});
    try{
        const payload={kind:'setPassword',target:'Aliciaa',pwHash:newTransport};
        assert.equal((await post(server.port,'wrong-token',payload)).status,401);
        assert.equal((await post(server.port,'isolated-qa',{...payload,pwHash:'invalid'})).body.reason,'invalid_hash');
        assert.equal((await post(server.port,'isolated-qa',{...payload,target:'unknown'})).status,404);
        assert.equal(server.saved('Aliciaa').pwHash,originalHash);

        const changed=await post(server.port,'isolated-qa',payload);
        assert.deepEqual(changed,{status:200,body:{ok:true,name:'Aliciaa',alreadySet:false}});
        const persisted=JSON.parse(fs.readFileSync(server.accountsFile,'utf8'));
        const aliciaa=persisted.accounts.find(a=>a.name==='Aliciaa');
        assert.match(aliciaa.pwHash,/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
        assert.notEqual(aliciaa.pwHash,originalHash);
        assert.deepEqual(aliciaa.save,originalSave);
        assert.equal(aliciaa.email,target.email);
        assert.equal(aliciaa.resetToken,null);
        assert.equal(persisted.accounts.find(a=>a.name==='Alicia').pwHash,other.pwHash);
        const backups=fs.readdirSync(path.join(server.tmp,'accounts_backups'));
        assert.equal(backups.length>0,true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(server.tmp,'accounts_backups',backups.at(-1)),'utf8'))
            .accounts.find(a=>a.name==='Aliciaa').pwHash,originalHash);
        assert.deepEqual(await post(server.port,'isolated-qa',payload),
            {status:200,body:{ok:true,name:'Aliciaa',alreadySet:true}});
        assert.equal(server.saved('Aliciaa').pwHash,aliciaa.pwHash);
        assert.equal(fs.readdirSync(path.join(server.tmp,'accounts_backups')).length,backups.length);
        assert.equal(await auth(server.port,'Aliciaa',transport),'authFail');
        assert.equal(await auth(server.port,'Aliciaa',newTransport),'authOk');

        await server.stop();server=null;
        server=await startServer({accounts:persisted.accounts});
        assert.equal(await auth(server.port,'Aliciaa',newTransport),'authOk');
    }finally{if(server)await server.stop();}
});

test('falha ao persistir devolve erro e mantém a senha anterior',async()=>{
    const target=account('Aliciaa');
    const server=await startServer({accounts:[target],hook:'flushAccounts=()=>false;'});
    try{
        const result=await post(server.port,'isolated-qa',{kind:'setPassword',target:'Aliciaa',pwHash:newTransport});
        assert.deepEqual(result,{status:500,body:{ok:false,reason:'persist_failed'}});
        assert.equal(server.saved('Aliciaa').pwHash,target.pwHash);
        assert.equal(await auth(server.port,'Aliciaa',transport),'authOk');
        assert.equal(await auth(server.port,'Aliciaa',newTransport),'authFail');
    }finally{await server.stop();}
});

test('falha no backup impede a troca',async()=>{
    const target=account('Aliciaa');
    const server=await startServer({accounts:[target],hook:'backupAccountsFile=()=>false;'});
    try{
        const result=await post(server.port,'isolated-qa',{kind:'setPassword',target:'Aliciaa',pwHash:newTransport});
        assert.deepEqual(result,{status:500,body:{ok:false,reason:'backup_failed'}});
        assert.equal(server.saved('Aliciaa').pwHash,target.pwHash);
        assert.equal(await auth(server.port,'Aliciaa',transport),'authOk');
    }finally{await server.stop();}
});
