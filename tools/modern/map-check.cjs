const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),world=require('../../modern-world');
function extract(source,name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);let end=source.indexOf('{',start),depth=0;for(;end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}'&&!--depth)return source.slice(start,end+1);}throw Error(name);}
function constants(source,name){const start=source.search(new RegExp('const '+name+'\\s*='));assert.ok(start>=0,name);return source.slice(start,source.indexOf(';',start)+1);}
function build(file){const s=fs.readFileSync(path.join(root,file),'utf8');const context=vm.createContext({ValadaresWorld:world});vm.runInContext([constants(s,'T'),constants(s,'CAVES'),'const M_W=100,M_H=100; let mapSeed=42;',extract(s,'srand'),extract(s,'genMap'),'globalThis.result=ValadaresWorld.apply(genMap(),T);'].join('\n'),context);return Array.from(context.result,row=>Array.from(row));}
const client=build('play.html'),server=build('server/server.js');assert.deepEqual(client,server,'client/server tile grids must agree');
const walkable=t=>[0,1,4,5,7,8].includes(t),visited=new Set(['50:50']),q=[[50,50]];
for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy]of [[0,1],[0,-1],[1,0],[-1,0]]){const a=x+dx,b=y+dy,key=a+':'+b;if(server[b]&&walkable(server[b][a])&&!visited.has(key)){visited.add(key);q.push([a,b]);}}}
const places=[[47,47],[53,47],[53,50],[47,53],[53,53],[50,47],[50,54],[22,22],[78,22],[76,78],[66,90],[28,75],[15,50],[75,20],[83,17]];
for(const [x,y]of places){assert.ok([-1,0,1].some(dx=>[-1,0,1].some(dy=>visited.has((x+dx)+':'+(y+dy)))),`landmark ${x},${y} remains reachable`);}
for(const b of world.buildings)for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)assert.equal(server[y][x],2,'building footprint');
for(let y=46;y<=54;y++)for(let x=46;x<=54;x++)assert.ok(walkable(server[y][x]),'central safe area remains open');
console.log(JSON.stringify({result:'PASS',identicalTiles:10000,reachableTiles:visited.size,landmarks:places.length,buildings:world.buildings.length}));
