// Focused delta: expanded authored outfits, compact UI and one durable relogin.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const out='C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/evidencias-runtime';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:844,height:390}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  async function login(){
   await page.goto('http://127.0.0.1:3338/jogar3d?ws=ws://127.0.0.1:8098');
   if(await page.locator('#login').isVisible()){
    await page.locator('#charInput').fill('RevisaoRuntime');await page.locator('#pwdInput').fill('Valadares18!');
    await page.locator('button[onclick="tryLogin(true)"]').click();
   }
   await page.waitForFunction(()=>started&&_wsAuthed&&myWsId&&ValadaresModern?.state==='ready',null,{timeout:30000});
   if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
   if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
   await page.keyboard.press('Escape');
  }
  await login();const before=await page.evaluate(()=>({...player.appearance}));
  await page.keyboard.press('v');
  const labels=await page.locator('[data-body]').allTextContents();assert.equal(labels.length,7);assert(labels.every(Boolean));
  const compact=await page.locator('#appearanceModal').evaluate(el=>{const r=el.getBoundingClientRect(),s=el.querySelector('[data-save]').getBoundingClientRect();return {width:r.width,height:r.height,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,saveVisible:s.top>=0&&s.bottom<=innerHeight};});
  assert(compact.inside&&compact.saveVisible,'seven choices preserve visible Save in compact viewport');
  for(const [body,model]of [['lorekeeper','Lorekeeper'],['cleric','Cleric'],['magicalgirl','MagicalGirl']]){
   const confirmed=await page.evaluate(()=>({...player.appearance}));
   await page.locator(`[data-body="${body}"]`).click();await page.locator('[data-palette="ocean"]').click();
   await page.waitForFunction(model=>ValadaresModern.renderer.actors.entries.get('self')?.model===model,model,{timeout:30000});
   assert.deepEqual(await page.evaluate(()=>player.appearance),confirmed,'expanded preview stays local');
   await page.screenshot({path:path.join(out,`aparencia-${body}-compacta.png`)});
   await page.waitForTimeout(550);await page.locator('[data-save]').click();
   await page.waitForFunction(body=>player.appearance?.body===body&&document.querySelector('[data-status]').textContent==='Aparência salva na sua conta.',body);
  }
  const chosen={v:1,body:'magicalgirl',palette:'ocean'};assert.deepEqual(await page.evaluate(()=>player.appearance),chosen);
  await page.locator('[data-close]').click();await page.evaluate(()=>logout());await login();
  assert.deepEqual(await page.evaluate(()=>player.appearance),chosen);
  await page.waitForFunction(()=>ValadaresModern.renderer.actors.entries.get('self')?.model==='MagicalGirl');
  await page.screenshot({path:path.join(out,'aparencia-maga-arcana-relogin.png')});
  assert.deepEqual(errors,[]);
  const result={pass:true,checks:['seven authored outfits labelled','compact Save visible','three new outfit previews stay local','three new outfits server confirmed','new outfit survives relogin'],before,chosen,compact,labels,errors};
  fs.writeFileSync(path.join(out,'expanded-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
