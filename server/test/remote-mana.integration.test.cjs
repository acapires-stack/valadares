'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {account,startServer,pause}=require('./helpers/isolated-server.cjs');

test('join entrega mana atual e magias transmitem o débito ao observador',{timeout:30000},async()=>{
    const suffix=crypto.randomBytes(3).toString('hex');
    const observer='ManaObs'+suffix, caster='ManaCast'+suffix;
    const server=await startServer({accounts:[account(observer),account(caster,{save:{hp:100,maxHp:100,mp:100,maxMp:100}})]});
    try{
        const {client:watcher}=await server.connect(observer);
        const {client:mage,state}=await server.connect(caster);
        const joined=await watcher.next(m=>m.t==='join'&&m.player?.name===caster);
        const self=state.players.find(p=>p.name===caster);
        for(const player of [joined.player,self]){
            assert.equal(player.hp,player.maxHp);
            assert.equal(player.mp,player.maxMp);
        }
        assert.equal(joined.player.hp,self.hp);
        assert.equal(joined.player.maxHp,self.maxHp);
        assert.equal(joined.player.mp,self.mp);
        assert.equal(joined.player.maxMp,self.maxMp);

        // Vida cheia: a cura em grupo não cura o lançador, mas deve publicar seu débito.
        mage.send({t:'spellCast',spellKey:'HEAL_GRUPO',hits:1});
        const group=await watcher.next(m=>m.t==='pstats'&&m.id===joined.player.id&&m.mp===self.mp-60);
        assert.equal(group.hp,self.hp);
        assert.equal(group.maxMp,self.maxMp);

        await pause(650); // cooldown mínimo do handler de spellCast
        mage.send({t:'spellCast',spellKey:'HEAL',hits:1});
        const normal=await watcher.next(m=>m.t==='pstats'&&m.id===joined.player.id&&m.mp===self.mp-85);
        assert.equal(normal.hp,self.hp);
        assert.equal(normal.maxMp,self.maxMp);
    }catch(error){error.message+='\nserver stderr='+server.stderr.slice(-1200);throw error;}
    finally{await server.stop();}
});
