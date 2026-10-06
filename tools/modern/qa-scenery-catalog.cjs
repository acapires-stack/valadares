// Isolated browser check of the actual world renderer and selected GLBs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, 'docs/remodelacao/evidencias-catalogo');
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.txt':'text/plain'};
fs.mkdirSync(out, {recursive:true});
const server = http.createServer((req,res)=>{
 const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
 res.writeHead(200, {'Content-Type':types[path.extname(file)]||'application/octet-stream'});
 fs.createReadStream(file).pipe(res);
});
const scenes = [['vila',0,'village'],['bosque',0,'forest'],['ruinas',0,'ruins'],['caverna',1,'dungeon'],['pousada',1000,'interior'],['oficina',1001,'interior'],['biblioteca',1002,'interior'],['treino',1003,'interior']];
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const result={scenes:[],errors:[]};
 try {
  for(const [name,floor,scene] of scenes.filter(s=>!process.env.QA_ONLY||s[0]===process.env.QA_ONLY)){
   const page=await browser.newPage({viewport:{width:1600,height:950}});
   page.on('pageerror',e=>result.errors.push(name+': '+e.message));
   page.on('response',r=>{if(r.status()>=400)result.errors.push(name+': HTTP '+r.status()+' '+r.url());});
   await page.goto(`http://127.0.0.1:${server.address().port}/tools/modern/prepare-scenery-preview.html?floor=${floor}&scene=${scene}`);
   await page.waitForFunction(()=>window.preview?.diagnostics().frames>15,null,{timeout:30000});
   await page.waitForFunction(()=>{const s=window.preview?.diagnostics().scenery;return s&&s.requested>0&&s.pending===0&&s.loaded+s.failed===s.requested;},null,{timeout:30000});
   await page.waitForTimeout(650);
   const d=await page.evaluate(()=>window.preview.diagnostics());
   assert.equal(d.scenery.failed,0,name+' models');
   assert(d.drawCalls<750,name+' excessive draw calls '+d.drawCalls);
   const png=path.join(out,'catalogo-'+name+'.png');
   await page.screenshot({path:png});
   result.scenes.push({name,floor,drawCalls:d.drawCalls,chunks:d.chunks,scenery:d.scenery,png:path.basename(png)});
   await page.close();
  }
  assert.deepEqual(result.errors,[]);
  result.pass=true;
 } finally {
  result.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,process.env.QA_ONLY?`catalogo-${process.env.QA_ONLY}-result.json`:'catalogo-result.json'),JSON.stringify(result,null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
 }
 console.log(JSON.stringify({pass:result.pass,scenes:result.scenes.map(s=>({name:s.name,drawCalls:s.drawCalls,models:s.scenery.loaded})),errors:result.errors}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
