'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {account,startServer,pause}=require('./helpers/isolated-server.cjs');

// MercadoPago simulado: a preference é aceita e cada pagamento consultado vem aprovado
// com a referência registrada pelo teste. Só a assinatura HMAC é dispensada.
const hook=`const qaPayments=new Map();
mpPreference={create:async({body})=>({id:'pref-'+body.external_reference,init_point:'https://mp.invalid/checkout'})};
mpPayment={get:async({id})=>qaPayments.get(String(id))};
validateMpSignature=()=>({ok:true});
qaHandlers.pay=({id,ref})=>{qaPayments.set(String(id),{status:'approved',external_reference:ref});return true;};
qaHandlers.credited=({id})=>creditedPayments.has(String(id));
qaHandlers.gold=({name})=>[...players.values()].find(x=>x.authedName===name&&!x.disconnected).gold;`;

test('PIX: nome inexistente é recusado na criação e o ouro nunca some depois de aprovado',{timeout:45000},async()=>{
    const fresh='Novo'+crypto.randomBytes(3).toString('hex');
    const server=await startServer({hook,accounts:[account(fresh,{save:null})]});
    try{
        const email='comprador@example.com';
        const unknown=await server.http('POST','/api/pix/create',{playerName:'NinguemAqui',packageId:'p10',email});
        assert.equal(unknown.status,404,JSON.stringify(unknown));
        assert.equal(unknown.body.error,'unknown_player');
        await pause(3100);   // /api/pix/create aceita 1 criação a cada 3 s por IP
        const created=await server.http('POST','/api/pix/create',{playerName:fresh.toUpperCase(),packageId:'p10',email});
        assert.equal(created.status,200,JSON.stringify(created));
        assert.equal(created.body.preferenceId,`pref-${fresh}|p10`,'referência usa o nome canônico da conta');

        // Conta que ainda não tem save: o crédito fica pendente e entra no próximo login.
        await server.qa('pay',{id:'pay-fresh',ref:`${fresh}|p10`});
        assert.equal((await server.http('POST','/webhook/mp',{type:'payment',data:{id:'pay-fresh'}})).status,200);
        await pause(200);
        assert.equal(await server.qa('credited',{id:'pay-fresh'}),true);
        assert.equal(server.saved(fresh).pendingPixGold,10000,'crédito durável antes do login');
        await server.connect(fresh);
        assert.equal(await server.qa('gold',{name:fresh}),10000);
        assert.equal(server.saved(fresh).pendingPixGold,undefined);
        assert.equal(server.saved(fresh).save.gold,10000);

        // Sem conta para receber: não pode ficar marcado como creditado.
        await server.qa('pay',{id:'pay-ghost',ref:'NinguemAqui|p10'});
        await server.http('POST','/webhook/mp',{type:'payment',data:{id:'pay-ghost'}});
        await pause(200);
        assert.equal(await server.qa('credited',{id:'pay-ghost'}),false);
    }catch(error){error.message+='\nserver stderr='+server.stderr.slice(-1200);throw error;}
    finally{await server.stop();}
});

// Primeiro login com a gravação em disco falhando: o ouro pendente entra uma vez só,
// inclusive depois que a fila regrava e o jogador volta.
const failingFlush=`qaHandlers.failFlushOnce=()=>{const real=flushAccounts;let fail=1;
flushAccounts=()=>fail-->0?false:real();return true;};
qaHandlers.flush=()=>flushAccounts();
qaHandlers.gold=({name})=>[...players.values()].find(x=>x.authedName===name&&!x.disconnected).gold;`;

test('PIX: falha de gravação no 1º login não aplica o ouro pendente duas vezes',{timeout:45000},async()=>{
    const fresh='Novo'+crypto.randomBytes(3).toString('hex');
    const acc=account(fresh,{save:null});acc.pendingPixGold=10000;
    const server=await startServer({hook:failingFlush,accounts:[acc]});
    try{
        assert.equal(await server.qa('failFlushOnce'),true);
        const first=await server.connect(fresh);
        assert.equal(await server.qa('gold',{name:fresh}),10000,'aplicado no login');
        assert.equal(server.saved(fresh).pendingPixGold,10000,'disco ainda sem a gravação que falhou');
        await pause(2600);   // queueSaveAccounts regrava em 2 s
        assert.equal(await server.qa('flush'),true);
        assert.equal(server.saved(fresh).pendingPixGold,undefined,'pendência some junto com o ouro gravado');
        assert.equal(server.saved(fresh).save.gold,10000);
        await first.client.close();
        await pause(300);
        await server.connect(fresh);
        assert.equal(await server.qa('gold',{name:fresh}),10000,'relogar não credita de novo');
        assert.equal(server.saved(fresh).save.gold,10000);
    }catch(error){error.message+='\nserver stderr='+server.stderr.slice(-1200);throw error;}
    finally{await server.stop();}
});
