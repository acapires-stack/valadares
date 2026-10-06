// Real isolated preview: UI draft/cancel/save/relogin/classic, no production account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');
const out=process.env.QA_OUTPUT||'C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/evidencias-runtime';
fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const errors=[],traffic=[];
    try{
        const page=await browser.newPage({viewport:{width:1440,height:900}});
        page.on('pageerror',e=>errors.push(e.message));
        page.on('websocket',socket=>{socket.on('framereceived',raw=>{try{const m=JSON.parse(raw.payload);if(['appearanceResult','posCorrect'].includes(m.t))traffic.push(m);}catch{}});});
        async function login(classic=false){
            await page.goto(`http://127.0.0.1:3338/jogar3d?ws=ws://127.0.0.1:8098${classic?'&visual=classic':''}`);
            if(await page.locator('#login').isVisible()){
                await page.locator('#charInput').fill('RevisaoRuntime');await page.locator('#pwdInput').fill('Valadares18!');
                await page.locator('button[onclick="tryLogin(true)"]').click();
            }
            await page.waitForFunction(()=>started&&_wsAuthed&&myWsId,null,{timeout:30000});
            if(!classic)await page.waitForFunction(()=>window.ValadaresModern?.state==='ready',null,{timeout:30000});
            if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
            if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
            await page.keyboard.press('Escape');
        }
        await login();
        const before=await page.evaluate(()=>({...player.appearance}));
        const previewBody=before.body==='rogue'?'mage':'rogue';
        const previewModel=previewBody==='mage'?'Mage':'Rogue_Hooded';
        await page.locator('#modernCharacter').click();await page.locator('#appearanceOpen').click();
        await page.locator(`[data-body="${previewBody}"]`).click();await page.locator('[data-palette="wine"]').click();
        assert.deepEqual(await page.evaluate(()=>player.appearance),before,'draft never mutates confirmed identity');
        await page.waitForFunction(model=>ValadaresModern.renderer.actors.entries.get('self')?.model===model,previewModel);
        await page.screenshot({path:path.join(out,'aparencia-previa-desktop.png')});
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>ValadaresAppearanceUI.isOpen()),false,'Escape closes appearance ahead of character drawer');
        assert.equal(await page.evaluate(()=>player._appearancePreview),undefined,'cancel removes preview');
        await page.keyboard.press('v');
        await page.locator('[data-body="rogue"]').click();await page.locator('[data-palette="wine"]').click();
        await page.locator('[data-save]').click();
        await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent==='Aparência salva na sua conta.');
        const chosen={v:1,body:'rogue',palette:'wine'};
        assert.deepEqual(await page.evaluate(()=>player.appearance),chosen);
        await page.locator('[data-close]').click();
        const equipped=[];
        const available=await page.evaluate(()=>Object.keys(player.inv).filter(k=>['ESPADA','ESPADA_ACO','MACHADO','MACHADO_MINO','CLAVA','ARCO','CAJADO_FOGO','BESTA'].includes(k)));
        for(const key of available){
            await page.evaluate(k=>equip(k),key);
            await page.waitForFunction(k=>player.equipped.weapon===k,key);
            await delay(150);
            const state=await page.evaluate(()=>({appearance:player.appearance,model:ValadaresModern.renderer.actors.entries.get('self')?.model,weapon:player.equipped.weapon}));
            assert.deepEqual(state.appearance,chosen);assert.equal(state.model,'Rogue_Hooded');equipped.push(state.weapon);
        }
        assert(equipped.length>=4,'fixture covers at least four weapon families');
        await page.setViewportSize({width:844,height:390});await page.keyboard.press('v');
        assert(await page.locator('[data-save]').evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight;}),'compact save action visible without scrolling');
        await page.screenshot({path:path.join(out,'aparencia-paisagem-compacta.png')});
        const compact=await page.locator('#appearanceModal').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};});
        assert(compact.inside,'compact dialog remains inside viewport');
        await page.locator('[data-close]').click();
        await page.evaluate(()=>saveState());await delay(250);
        await page.evaluate(()=>logout());
        await login(true);
        assert.deepEqual(await page.evaluate(()=>player.appearance),chosen,'classic login reads account identity');
        await page.evaluate(()=>saveState());await delay(250);await page.evaluate(()=>logout());
        await page.setViewportSize({width:1440,height:900});await login();
        assert.deepEqual(await page.evaluate(()=>player.appearance),chosen,'modern after classic preserves account identity');
        await page.waitForFunction(()=>ValadaresModern.renderer.actors.entries.get('self')?.model==='Rogue_Hooded');
        await page.screenshot({path:path.join(out,'aparencia-relogin-depois-classico.png')});
        assert.equal(traffic.filter(m=>m.t==='appearanceResult'&&m.ok).length,1,'one confirmation for one apply');
        assert.deepEqual(errors,[]);
        const result={pass:true,before,chosen,equipped,compact,traffic,errors,checkedAt:new Date().toISOString()};
        fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
