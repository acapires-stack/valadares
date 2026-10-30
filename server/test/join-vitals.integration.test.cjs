'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {account,startServer,pause}=require('./helpers/isolated-server.cjs');

// HP/MP são do server: o join não pode aceitar valores da mensagem do cliente.
const hook=`qaHandlers.vitals=({name})=>{const p=[...players.values()].find(x=>x.authedName===name&&!x.disconnected);
  return {hp:Number.isNaN(p.hp)?'NaN':p.hp,mp:Number.isNaN(p.mp)?'NaN':p.mp,maxHp:p.maxHp,maxMp:p.maxMp};};
qaHandlers.hit=({name})=>{const p=[...players.values()].find(x=>x.authedName===name&&!x.disconnected);
  monsters.clear();
  for(let y=55;y<70;y++)for(let x=55;x<75;x++){
    if(!isWalkable(x,y)||!isWalkable(x+1,y)||inSafe(x,y)||inSafe(x+1,y)||inSanctuary(x,y)||inSanctuary(x+1,y))continue;
    p.x=x;p.y=y;p.connectedAt=Date.now()-20000;p._posGraceUntil=0;
    const rat=spawnMob('RAT',x+1,y,0);if(!rat)continue;
    rat.hp=1000;rat.maxHp=1000;rat.dmg=60;rat.aggro=10;rat._retaliateId=p.id;rat._retaliateAt=Date.now();
    return rat.id;
  }
  throw Error('no tile');};`;

test('join ignora hp/mp forjados: NaN não vira imortalidade e relogar não cura',{timeout:45000},async()=>{
    const hurt='Hurt'+crypto.randomBytes(3).toString('hex'),nan='Nan'+crypto.randomBytes(3).toString('hex');
    const server=await startServer({hook,accounts:[
        account(hurt,{save:{hp:7,mp:3,maxHp:110,maxMp:105}}),account(nan,{save:{hp:100,mp:100}})]});
    try{
        await server.connect(hurt,{hp:99999,maxHp:1,mp:99999,maxMp:1});
        const healed=await server.qa('vitals',{name:hurt});
        assert.equal(healed.hp,7,'hp vem do save, não da mensagem: '+JSON.stringify(healed));
        assert.equal(healed.mp,3,'mp vem do save, não da mensagem: '+JSON.stringify(healed));

        const {client}=await server.connect(nan,{hp:'x',mp:'x',maxHp:100,maxMp:100});
        const before=await server.qa('vitals',{name:nan});
        assert.equal(typeof before.hp,'number',JSON.stringify(before));
        await server.qa('hit',{name:nan});
        await client.next(m=>m.t==='pstats'&&m.hp===0,15000);
        await pause(200);
    }catch(error){error.message+='\nserver stderr='+server.stderr.slice(-1200);throw error;}
    finally{await server.stop();}
});
