// QA-only process: no external backend URL and no writable production path.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),Module=require('node:module');
const dir=path.resolve(process.env.ROSTER_QA_DIR||'');
if(path.dirname(dir)!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('valadares-roster-'))throw Error('QA temporary directory required');
if(JSON.parse(fs.readFileSync(path.join(dir,'QA-ONLY.json'))).purpose!=='isolated-roster-playthrough')throw Error('Missing QA marker');
for(const [key,name]of [['STATE_FILE_PATH','state.json'],['ACCOUNTS_FILE_PATH','accounts.json'],['MP_CREDITED_PATH','mp-credited.json']])process.env[key]=path.join(dir,name);
process.env.ADMIN_TOKEN='';process.env.MP_ACCESS_TOKEN='';process.env.RESEND_API_KEY='';process.env.ALERTS_ENABLED='0';
const original=http.Server.prototype.listen;http.Server.prototype.listen=function(port,...rest){return original.call(this,port,'127.0.0.1',...rest)};
const filename=path.resolve(__dirname,'../../../server/server.js'),moduleInstance=new Module(filename,module);
moduleInstance.filename=filename;moduleInstance.paths=Module._nodeModulePaths(path.dirname(filename));
// Actual native spawn function retains HP, damage, speed, intelligence, loot and AI.
const qa=`\nmonsters.clear();nextMobId=990000;const qaQueue=[[50,50]],qaSeen=new Set(['50,50']),qaPlaces=[];for(let i=0;i<qaQueue.length&&qaPlaces.length<12;i++){const[x,y]=qaQueue[i];if(Math.max(Math.abs(x-50),Math.abs(y-50))>=8&&[[0,0],[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>isWalkable(x+dx,y+dy)&&!inSafe(x+dx,y+dy)))qaPlaces.push([x,y]);for(const[dx,dy]of [[0,-1],[0,1],[-1,0],[1,0]]){const nx=x+dx,ny=y+dy,key=nx+','+ny;if(nx<1||ny<1||nx>98||ny>98||qaSeen.has(key)||!isWalkable(nx,ny))continue;qaSeen.add(key);qaQueue.push([nx,ny]);}}if(qaPlaces.length<12)throw Error('QA spawn area unavailable');for(const[x,y]of qaPlaces)spawnMob('RAT',x,y,0);console.log('[roster QA] native mobs ready',JSON.stringify(qaPlaces));`;
moduleInstance._compile(fs.readFileSync(filename,'utf8')+qa,filename);
