// Final integration check against the public build, using an isolated game account.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),built=path.join(root,'dist-web');
const out=process.env.QA_OUTPUT||'C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/integracao-final';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(['/','/jogar','/jogar3d'].includes(pathname))pathname='/play.html';
 const file=path.resolve(built,'.'+pathname);
 if(!file.startsWith(built+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const name of ['appearance-rules.js','appearance-ui.js','appearance-ui.css','modern/assets/animals/Wolf-game.glb','modern/assets/characters/Skeleton_Minion-game.glb'])assert(fs.existsSync(path.join(built,name)),`Missing public dependency: ${name}`);
 for(const name of ['server','tools','.git','modern/_source'])assert(!fs.existsSync(path.join(built,name)),`Private path in public build: ${name}`);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,errors=[],failures=[],models=[];
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:950}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))failures.push({url:r.url().slice(base.length),status:r.status()});});
  await page.goto(base+'/jogar3d?ws=ws://127.0.0.1:8098');
  await page.locator('#charInput').fill('RevisaoRoot');await page.locator('#pwdInput').fill('Valadares18!');
  await page.locator('button[onclick="tryLogin(true)"]').click();
  await page.waitForFunction(()=>started&&_wsAuthed&&window.ValadaresModern?.state==='ready',null,{timeout:30000});
  if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
  if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
  await page.keyboard.press('Escape');await page.keyboard.press('v');
  for(const [body,model] of [['lorekeeper','Lorekeeper'],['cleric','Cleric'],['magicalgirl','MagicalGirl']]){
   await page.locator(`[data-body="${body}"]`).click();
   await page.waitForFunction(model=>ValadaresModern.renderer.actors.entries.get('self')?.model===model,model);
   models.push(await page.evaluate(()=>({body:player._appearancePreview.body,model:ValadaresModern.renderer.actors.entries.get('self').model})));
  }
  await page.locator('[data-close]').click();
  assert.equal(await page.locator('#modernCanvas').count(),1);
  await page.screenshot({path:path.join(out,'build-foco.png')});
  await page.getByRole('button',{name:'Layout clássico',exact:true}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('layout-focus'));
  await page.screenshot({path:path.join(out,'build-classico.png')});
  await page.getByRole('button',{name:'Modo foco',exact:true}).click();
  await page.waitForFunction(()=>document.body.classList.contains('layout-focus'));
  await page.setViewportSize({width:844,height:390});await page.keyboard.press('v');
  assert.equal(await page.locator('[data-body]').count(),7);
  assert(await page.locator('[data-save]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  await page.screenshot({path:path.join(out,'build-compacto.png')});await page.keyboard.press('Escape');
  const assets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/modern/')).map(e=>new URL(e.name).pathname));
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  await page.evaluate(()=>logout());
  const report={at:new Date().toISOString(),pass:true,source:'dist-web served locally; isolated backend8098',models,modernResources:[...new Set(assets)].length,errors,failures,checks:['public dependencies','private data excluded','fresh login','three purchased character previews','focus/classic return','seven options and Save visible in compact viewport','single renderer']};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(error=>{server.close();console.error(error);process.exitCode=1;});
