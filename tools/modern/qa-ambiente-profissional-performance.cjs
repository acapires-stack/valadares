// Same isolated scenery fixture, browser, camera and assets for base/candidate.
// This measures scenery rendering, not multiplayer or GPU performance on phones.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const out='C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/ambiente-evidence';
const baseline=cp.execFileSync('git',['show','3712a5f:modern/world.js'],{cwd:root,encoding:'utf8'});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.png')?'image/png':'text/javascript');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const result=[];try{
 for(const phase of ['base','candidate'])for(const [name,floor,scene]of [['vila',0,'village'],['bosque',0,'forest'],['ruinas',0,'ruins'],['caverna',1,'dungeon'],['pousada',1000,'interior'],['oficina',1001,'interior'],['templo',1002,'interior'],['treino',1003,'interior']].filter(s=>!process.env.QA_ONLY||s[0]===process.env.QA_ONLY)){
  const page=await browser.newPage({viewport:{width:1280,height:800}});if(phase==='base')await page.route('**/modern/world.js',route=>route.fulfill({contentType:'text/javascript',body:baseline}));
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/modern/prepare-scenery-preview.html?floor=${floor}&scene=${scene}`);
  await page.waitForFunction(()=>window.preview?.diagnostics().frames>15&&preview.diagnostics().scenery.pending===0);
  const sample=await page.evaluate(async()=>{const before=preview.diagnostics(),start=performance.now();await new Promise(r=>setTimeout(r,1200));const after=preview.diagnostics();return {fps:Math.round((after.frames-before.frames)*1000/(performance.now()-start)),drawCalls:after.drawCalls,scenery:after.scenery};});
  if(phase==='candidate')await page.screenshot({path:path.join(out,'catalogo-'+name+'.png')});result.push({phase,name,...sample});await page.close();
 }
 fs.writeFileSync(path.join(out,process.env.QA_ONLY?`scenery-performance-${process.env.QA_ONLY}.json`:'scenery-performance.json'),JSON.stringify({at:new Date().toISOString(),base:'3712a5f',context:'Isolated world fixture; no actors/network. FPS affected by concurrent workstation use.',result},null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
