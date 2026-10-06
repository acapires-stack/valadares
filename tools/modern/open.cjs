// Opens or starts this exact local copy. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),local=path.join(__dirname,'.local');
const url='http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function identity(){try{const r=await fetch('http://127.0.0.1:3337/__local_status',{signal:AbortSignal.timeout(1500)});return r.ok?await r.json():null;}catch{return null;}}
function portBusy(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(700);socket.once('connect',()=>{socket.destroy();resolve(true);});for(const event of ['error','timeout'])socket.once(event,()=>{socket.destroy();resolve(false);});});}
async function main(){
 let live=await identity();
 if(live && (live.app!=='ValadaresParalelo'||path.resolve(live.root)!==root))throw Error('Outra cópia está usando a porta 3337. Feche a versão local anterior antes de abrir esta.');
 if(!live){
  if((await Promise.all([portBusy(3337),portBusy(8097)])).some(Boolean))throw Error('As portas locais 3337 ou 8097 estão ocupadas. Nenhum processo foi substituído.');
  if(!fs.existsSync(path.join(__dirname,'.local-deps/node_modules/ws')))throw Error('Falta a dependência local ws. Execute tools/modern/start.ps1 uma vez.');
  fs.mkdirSync(local,{recursive:true});const out=fs.openSync(path.join(local,'launcher.log'),'a'),err=fs.openSync(path.join(local,'launcher-error.log'),'a');
  const child=spawn(process.execPath,[path.join(__dirname,'local-server.cjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});child.unref();fs.closeSync(out);fs.closeSync(err);
  for(let i=0;i<40&&!live;i++){await delay(250);live=await identity();}
  if(!live)throw Error('O jogo não iniciou. Consulte tools/modern/.local/launcher-error.log e backend.log.');
 }
 let healthy=false;for(let i=0;i<20&&!healthy;i++){try{const r=await fetch('http://127.0.0.1:8097/health',{signal:AbortSignal.timeout(1000)});healthy=r.ok&&(await r.json()).ok===true;}catch{}if(!healthy)await delay(250);}
 if(!healthy)throw Error('O servidor local não respondeu. O save foi preservado; consulte tools/modern/.local/backend.log.');
 console.log('Novo Valadares pronto: '+url);
 if(!process.argv.includes('--no-open')){const browser=spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'});browser.on('error',e=>console.error('Abra o endereço acima no navegador. '+e.message));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
