// Checks the real local WebSocket auth, join, save and re-entry path.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require(path.join(__dirname,'.local-deps','node_modules','ws'));
const dataPath = path.join(__dirname,'.local','accounts.json');
const name = 'TesteVal18';
const pwHash = 's256:' + crypto.createHash('sha256').update('Valadares18!').digest('hex');

function session() {
  const ws = new WebSocket('ws://127.0.0.1:8097');
  const messages = [];
  ws.on('message',raw=>{ try { messages.push(JSON.parse(raw)); } catch {} });
  const wait = async pred => {
    for (let i=0;i<100;i++) { const found=messages.find(pred); if(found)return found; await new Promise(r=>setTimeout(r,50)); }
    throw Error('WS timeout: '+JSON.stringify(messages.slice(-5)));
  };
  return {ws,wait};
}
async function open(s) { await new Promise((resolve,reject)=>{s.ws.once('open',resolve);s.ws.once('error',reject);}); }
async function login(s) {
  await open(s);
  s.ws.send(JSON.stringify({t:'auth',name,pwHash,platform:'browser',clientVersion:'1.0.9'}));
  const auth=await s.wait(m=>m.t==='authOk'||m.t==='authFail');
  assert.equal(auth.t,'authOk',JSON.stringify(auth));
  s.ws.send(JSON.stringify({t:'join',name,equipmentVersion:1,lang:'pt',x:50,y:50,pvp:false}));
  const state=await s.wait(m=>m.t==='state');
  const inv=await s.wait(m=>m.t==='invUpdate'&&m.reason==='join');
  return {auth,state,inv};
}
async function main(){
  for(const route of ['/jogar','/modern/entry.js','/modern/vendor/playcanvas.mjs']){
    const res=await fetch('http://127.0.0.1:3337'+route);assert.equal(res.status,200,route);
  }
  const health=await fetch('http://127.0.0.1:8097/health');assert.equal(health.status,200);
  const first=session();const a=await login(first);
  assert.equal(a.auth.save.skills.Machado.val,18);
  assert.equal(a.auth.save.inv.POTION,30);
  assert.equal(a.auth.save.equipped.weapon,'MACHADO_MINO');
  assert.ok(a.state.players.some(p=>p.name===name));
  const marker='local-smoke-'+Date.now();
  first.ws.send(JSON.stringify({t:'saveUpload',data:{...a.auth.save,flags:{},achievements:[marker]}}));
  for(let i=0;i<100;i++){
    const disk=JSON.parse(fs.readFileSync(dataPath,'utf8'));
    if(disk.accounts[0]?.save?.achievements?.includes(marker))break;
    if(i===99)throw Error('Save não persistiu');
    await new Promise(r=>setTimeout(r,100));
  }
  first.ws.close();
  const second=session();const b=await login(second);
  assert.ok(b.auth.save.achievements.includes(marker));
  assert.equal(b.auth.save.skills.Machado.val,18);
  assert.ok(b.inv.inv?.POTION>=30);
  second.ws.close();
  console.log('PASS HTTP assets + WS auth/join + fixture skill 18/arma/poções + save/reentrada');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
