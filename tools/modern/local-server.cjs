// Isolated local preview. Run via start.ps1; no production files or accounts are used.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const local = path.join(__dirname, process.env.VALADARES_QA === 'premium' ? '.local-premium' : '.local');
const webPort = Number(process.env.LOCAL_WEB_PORT || 3337);
const gamePort = Number(process.env.LOCAL_GAME_PORT || 8097);
const fixtureName = 'TesteVal18';
const fixturePassword = 'Valadares18!';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ico':'image/x-icon' };

function seedFixture() {
  const file = path.join(local, 'accounts.json');
  if (fs.existsSync(file)) return;
  const clientHash = 's256:' + crypto.createHash('sha256').update(fixturePassword).digest('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const pwHash = `scrypt$${salt}$${crypto.scryptSync(clientHash, salt, 32, {N:16384,r:8,p:1}).toString('hex')}`;
  const skills = Object.fromEntries(['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'].map(key => [key,{val:18,xp:0,xpNext:2400}]));
  const save = { v:2, x:50, y:50, skills, gold:12000,
    inv:{MACHADO_MINO:1, ESPADA_ACO:1, POTION:30, POTION_MP:30, HAM:20, ESCAMA:6, CORACAO_HL:1, BESTA:1, OSSO:20, ASA_MORCEGO:20},
    equipped:{weapon:'MACHADO_MINO',offhand:null,armor:null,head:null,feet:null,neck:null},
    chests:{b1:{},b2:{},b3:{},b4:{}}, quests:{active:{},completed:[],daily:null},
    stats:{mobKills:{},pkKills:0,pkDeaths:0,mobDeaths:0,bossKills:0,startedAt:Date.now()},
    hp:250,maxHp:250,mp:200,maxMp:200,pvp:false,savedAt:Date.now() };
  const account = {name:fixtureName,pwHash,save,savedAt:Date.now(),createdAt:Date.now(),email:null,emailVerified:false,resetToken:null};
  fs.writeFileSync(file, JSON.stringify({v:1,savedAt:Date.now(),accounts:[account]}));
}

function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replaceAll('\\','/'); }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/__local_status') {
    res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({app:'ValadaresParalelo',root,pid:process.pid})); return;
  }
  if (pathname === '/' || pathname === '/jogar' || pathname === '/jogar3d') pathname = '/play.html';
  const segments = pathname.toLowerCase().split('/').filter(Boolean);
  // Serve the client assets, never local saves, source-control data or tools.
  if (segments.some(s => s.startsWith('.') || s === 'node_modules' || s === '_source') ||
      ['tools','server','docs','electron'].includes(segments[0]) ||
      !['.html','.js','.mjs','.css','.png','.jpg','.jpeg','.webp','.svg','.woff2','.ico','.glb','.mp3','.ogg','.wav','.json','.txt'].includes(path.extname(pathname).toLowerCase())) {
    res.writeHead(404); res.end(); return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream','Cache-Control':'no-store'});
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

fs.mkdirSync(local,{recursive:true});
seedFixture();
const backendLog = fs.openSync(path.join(local,'backend.log'),'a');
const deps = path.join(__dirname,'.local-deps','node_modules');
if (!fs.existsSync(path.join(deps,'ws'))) throw Error('Falta ws local. Execute tools/modern/start.ps1.');
const child = spawn(process.execPath,[path.join(__dirname,'backend-local.cjs')],{
  cwd:root, windowsHide:true, stdio:['ignore',backendLog,backendLog],
  env:{...process.env,NODE_PATH:deps,PORT:String(gamePort),STATE_FILE_PATH:path.join(local,'state.json'),
    ACCOUNTS_FILE_PATH:path.join(local,'accounts.json'),MP_CREDITED_PATH:path.join(local,'mp_credited.json'),
    ADMIN_NAME:'__local_disabled__',ADMIN_TOKEN:'',MP_ACCESS_TOKEN:'',RESEND_API_KEY:'',ALERTS_ENABLED:'0',
    SERVER_MOTD:'Novo Valadares — versão local'}
});
fs.writeFileSync(path.join(local,'pids.json'),JSON.stringify({launcher:process.pid,backend:child.pid,startedAt:new Date().toISOString()}));
child.on('exit',(code,signal)=>{ console.error(`Backend encerrou: ${code ?? signal}`); process.exitCode=1; web.close(); });
const web = http.createServer(serve).listen(webPort,'127.0.0.1',()=>console.log(`Valadares local: http://127.0.0.1:${webPort}/jogar?ws=ws://127.0.0.1:${gamePort}`));
function stop(){ web.close(); if (child.exitCode === null) child.kill(); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
