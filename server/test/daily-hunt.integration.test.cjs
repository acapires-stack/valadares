'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {account,startServer,pause}=require('./helpers/isolated-server.cjs');

const hook=`const qaPlayer=name=>[...players.values()].find(x=>x.authedName===name&&!x.disconnected);
qaHandlers.today=()=>dailyRules.todayKey();
qaHandlers.gold=({name})=>qaPlayer(name).gold;
qaHandlers.home=({name})=>{const p=qaPlayer(name);p.x=48;p.y=53;p.lastSaveAt=0;return true;};
qaHandlers.boss=({name,type})=>{const p=qaPlayer(name);monsters.clear();
  for(let y=55;y<70;y++)for(let x=55;x<75;x++){
    if(!isWalkable(x,y)||!isWalkable(x+1,y)||inSafe(x,y)||inSafe(x+1,y)||inSanctuary(x,y)||inSanctuary(x+1,y))continue;
    p.x=x;p.y=y;const m=spawnMob(type,x+1,y,0);if(!m)continue;m.hp=1;m.dmg=0;return m.id;}
  throw Error('no tile');};`;

test('diária de caça só paga com mortes contadas pelo server; lista e contagem forjadas não bastam',{timeout:45000},async()=>{
    const name='Daily'+crypto.randomBytes(3).toString('hex');
    const server=await startServer({hook,accounts:[account(name)]});
    try{
        const {client}=await server.connect(name);
        const today=await server.qa('today');
        const list=[['GOLEM_REI',0],['ORC_LIDER',1]].map(([type,i])=>
            ({id:`d_${today}_${i}`,goal:{kind:'mob',type,count:1}}));
        await server.qa('home',{name});
        client.send({t:'saveUpload',data:{...server.saved(name).save,
            dailyKills:{day:today,counts:{GOLEM_REI:99,ORC_LIDER:99}},
            quests:{active:{},completed:[],daily:{list,claimed:[]}}}});
        await pause(300);
        for(const q of list){
            const forged=await client.request({t:'questTurnIn',kind:'daily',dailyId:q.id},m=>m.t==='questResult');
            assert.equal(forged.reason,'not_done',JSON.stringify(forged));
            await pause(450);   // questTurnIn aceita 1 operação a cada 400 ms
        }
        assert.equal(await server.qa('gold',{name}),0,'nenhum ouro sem caçar');

        const boss=await server.qa('boss',{name,type:'ORC_LIDER'});
        client.send({t:'attackMob',monsterId:boss,amount:999,range:1});
        await client.next(m=>m.t==='mobKill'&&m.mobId===boss);
        await server.qa('home',{name});
        const paid=await client.request({t:'questTurnIn',kind:'daily',dailyId:list[1].id},m=>m.t==='invUpdate'&&m.questResult);
        assert.equal(paid.questResult.ok,true,JSON.stringify(paid));
        assert.equal(paid.questResult.delta.gold,1200);
        await pause(500);
        const still=await client.request({t:'questTurnIn',kind:'daily',dailyId:list[0].id},m=>m.t==='questResult');
        assert.equal(still.reason,'not_done','GOLEM_REI continua sem morte');

        // a contagem real sobrevive a reconexão (persistida pelo server, não pelo cliente)
        await server.qa('home',{name});
        client.send({t:'saveUpload',data:{...server.saved(name).save,dailyKills:null}});
        await pause(300);
        assert.equal(server.saved(name).save.dailyKills.counts.ORC_LIDER,1);
        assert.equal(server.saved(name).save.dailyKills.counts.GOLEM_REI,undefined);
    }catch(error){error.message+='\nserver stderr='+server.stderr.slice(-1200);throw error;}
    finally{await server.stop();}
});
