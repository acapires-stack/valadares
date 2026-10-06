// Isolated visual fixture for the market training room; no live game connection.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs','remodelacao','evidencias-treino');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#182722}canvas{width:100%;height:100%}</style></head><body><canvas></canvas><script type="module">
import * as pc from '/modern/vendor/playcanvas.mjs';
import {createWorld} from '/modern/world.js';
const app=new pc.Application(document.querySelector('canvas'),{graphicsDeviceOptions:{antialias:true}});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.43,.48,.47);app.scene.toneMapping=pc.TONEMAP_ACES;app.scene.exposure=1.1;
const camera=new pc.Entity('QA camera');camera.addComponent('camera',{projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:5.2,clearColor:new pc.Color(.1,.16,.14)});camera.setPosition(50.5,13.2,58.3);camera.lookAt(50.5,.45,49.4);app.root.addChild(camera);
const sun=new pc.Entity('QA sun');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.91,.74),intensity:1.4,castShadows:true,shadowResolution:2048,shadowDistance:45,shadowBias:.15,normalOffsetBias:.04,shadowType:pc.SHADOW_PCF3_32F});sun.setEulerAngles(52,-35,0);app.root.addChild(sun);
const fill=new pc.Entity('QA sky');fill.addComponent('light',{type:'directional',color:new pc.Color(.5,.7,.88),intensity:.45,castShadows:false});fill.setEulerAngles(55,145,0);app.root.addChild(fill);
const lamp=new pc.Entity('QA adventurer light');lamp.addComponent('light',{type:'omni',color:new pc.Color(1,.67,.32),intensity:.9,range:5,castShadows:false});lamp.setPosition(50.5,2.7,50.5);app.root.addChild(lamp);
const map=Array.from({length:100},()=>Array(100).fill(4)),service={kind:'dummy',x:50,y:46},room={floor:1003,services:[service]};
const bridge={M_W:100,M_H:100,getMap:()=>map,getPlayer:()=>({x:50,y:50,floor:1003}),getFloor:()=>1003,getCamera:()=>({x:43,y:44}),getViewBounds:()=>({minX:45,maxX:55,minY:45,maxY:53}),getInterior:()=>room,getBuildings:()=>[]};
const world=createWorld(pc,app,bridge);app.start();world.update(.016);setInterval(()=>world.update(.1),100);
window.qa={app,camera,world,room,service,focus(){camera.camera.orthoHeight=2.9;camera.setPosition(50.5,6.2,52.8);camera.lookAt(50.5,.78,46.6);}};
</script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(root,'.'+url.pathname);if(!url.pathname.startsWith('/modern/')||!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.png')?'image/png':'text/javascript');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.qa?.world?.diagnostics().chunks>0);
 await page.waitForFunction(()=>qa.world.diagnostics().scenery.loaded===qa.world.diagnostics().scenery.requested&&qa.app.root.findByName('KayKit trainingDummy'));
 await page.waitForTimeout(150);const state=await page.evaluate(()=>({world:qa.world.diagnostics(),service:qa.service,renderParts:qa.app.root.findComponents('render').length,assetVisible:!!qa.app.root.findByName('KayKit trainingDummy')}));
 assert.equal(state.world.floor,1003);assert.deepEqual(state.service,{kind:'dummy',x:50,y:46});assert.ok(state.renderParts>0);assert.ok(state.assetVisible);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'sala-treino.png')});await page.evaluate(()=>qa.focus());await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'boneco-detalhe.png')});
 console.log(JSON.stringify({result:'PASS',captures:out,state,errors},null,2));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
