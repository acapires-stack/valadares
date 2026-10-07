// Browser smoke against the public build and an isolated WebSocket account.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {chromium}=require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');

const root=path.resolve(__dirname,'../..'),built=path.join(root,'dist-web');
const out=process.env.QA_OUTPUT||path.join(root,'work/harmonizacao-2026-10-07/build-final');
const wsUrl=process.env.QA_WS_URL,account=process.env.QA_ACCOUNT,password=process.env.QA_PASSWORD;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(['/','/jogar','/jogar3d'].includes(pathname))pathname='/play.html';
    const file=path.resolve(built,'.'+pathname);
    if(!file.startsWith(built+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
});

function publicFiles(dir,relative=''){
    return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
        const name=path.join(relative,entry.name);
        return entry.isDirectory()?publicFiles(path.join(dir,entry.name),name):[name.replaceAll('\\','/')];
    });
}
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function waitModel(page,model){
    await page.waitForFunction(name=>ValadaresModern.renderer.actors.entries.get('self')?.model===name,model,{timeout:30000});
}
async function viewState(page){
    return page.evaluate(()=>({x:player.x,y:player.y,floor:player.floor||0,gold:player.gold,
        appearance:{...player.appearance},preview:player._appearancePreview||null,
        model:ValadaresModern.renderer.actors.entries.get('self')?.model||null,
        canvasCount:document.querySelectorAll('#modernCanvas').length,
        door:document.getElementById('worldDoor')?.textContent?.trim()||'',
        visibility:ValadaresModern.renderer.visibility?.diagnostics()||null}));
}
async function step(page,key){
    const before=await viewState(page);
    await page.keyboard.down(key);
    try{
        await page.waitForFunction(({x,y})=>player.x!==x||player.y!==y,{x:before.x,y:before.y},{timeout:5000});
    }finally{await page.keyboard.up(key);}
    const after=await viewState(page);
    assert.equal(after.floor,before.floor,'movement stays on current floor');
    assert(Math.max(Math.abs(after.x-before.x),Math.abs(after.y-before.y))<=1,'one control step moves at most one tile');
    return after;
}

(async()=>{
    assert(wsUrl&&account&&password,'Set QA_WS_URL, QA_ACCOUNT and QA_PASSWORD for an isolated backend');
    fs.mkdirSync(out,{recursive:true});
    const required=['appearance-rules.js','appearance-ui.js','appearance-ui.css','modern/player-visibility.js',
        'modern/equipment-grips.js','modern/adventurers-catalog.js',
        'modern/assets/adventurers2/characters/Ranger.glb',
        'modern/assets/adventurers2/characters/Barbarian_Large.glb',
        'modern/assets/adventurers2/characters/Engineer.glb',
        'modern/assets/adventurers2/animations/Rig_Large_CombatExpanded.glb',
        'modern/assets/adventurers2/textures/ranger_texture_alt_A.png',
        'modern/assets/weapons-bits/icons/bow_A.png'];
    for(const name of required)assert(fs.existsSync(path.join(built,name)),`Missing public dependency: ${name}`);
    const files=publicFiles(built);
    const adventurers=publicFiles(path.join(root,'modern/assets/adventurers2')).filter(name=>name!=='preview.html');
    for(const name of adventurers){
        const relative='modern/assets/adventurers2/'+name;
        assert(files.includes(relative),`Missing authored asset: ${relative}`);
        assert.equal(sha256(path.join(root,relative)),sha256(path.join(built,relative)),`Changed authored asset: ${relative}`);
    }
    assert(!files.includes('modern/assets/adventurers2/preview.html'),'Development preview in public build');
    const gripsHash=sha256(path.join(root,'modern/equipment-grips.js'));
    assert.equal(sha256(path.join(built,'modern/equipment-grips.js')),gripsHash,'Equipment grips source/build mismatch');
    assert(!files.some(name=>/(^|\/)(server|tools|_source|\.git)(\/|$)|\.zip$|(^|\/)(accounts|state|errors)\.json$|\.env$/i.test(name)),'Private file in public build');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port,errors=[],failures=[],frames=[];
    const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1600,height:950}});
        page.on('pageerror',error=>errors.push(error.message));
        page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400&&!response.url().endsWith('/favicon.ico'))failures.push({url:response.url().slice(base.length),status:response.status()});});
        page.on('websocket',socket=>socket.on('framereceived',raw=>{try{const message=JSON.parse(raw.payload);if(['posCorrect','dungeonEnter','dungeonExit','interiorResult'].includes(message.t))frames.push(message);}catch{}}));
        async function login(){
            await page.goto(base+'/jogar3d?ws='+encodeURIComponent(wsUrl),{waitUntil:'domcontentloaded',timeout:30000});
            await page.locator('#charInput').fill(account);await page.locator('#pwdInput').fill(password);
            await page.locator('button[onclick="tryLogin(true)"]').click();
            await page.waitForFunction(()=>started&&_wsAuthed&&window.ValadaresModern?.state==='ready',null,{timeout:30000});
            if(await page.getByRole('button',{name:'Recusar',exact:true}).isVisible())await page.getByRole('button',{name:'Recusar',exact:true}).click();
            if(await page.locator('#firstStepsDismiss').isVisible())await page.locator('#firstStepsDismiss').click();
            await page.keyboard.press('Escape');
        }
        await login();
        const baseline=await viewState(page);
        assert.deepEqual(baseline.appearance,{v:1,body:'barbarian_large',palette:'original'});
        assert.equal(baseline.canvasCount,1);
        await waitModel(page,'V2_Barbarian_Large');

        const iconCatalog=await page.evaluate(()=>Object.values(ValadaresKayKitItemArt.itemArtCatalog));
        const icons=[...new Set(iconCatalog)];assert(icons.length>0);
        for(const model of icons)assert(fs.existsSync(path.join(built,'modern/assets/weapons-bits/icons',model+'.png')),`Missing icon ${model}`);
        await page.waitForFunction(()=>Object.keys(ValadaresKayKitItemArt.itemArtCatalog).every(key=>!!ValadaresKayKitItemArt.getIconURL(key)),null,{timeout:30000});

        await page.keyboard.press('v');
        const bodies=await page.evaluate(()=>AppearanceRules.APPEARANCE_BODIES.map(({id,model})=>({id,model})));
        assert.equal(bodies.length,15);
        const previews=[];
        for(const {id,model} of bodies){
            await page.locator(`[data-body="${id}"]`).click();
            await waitModel(page,model);
            const state=await viewState(page);
            assert.equal(state.preview?.body,id);
            assert.equal(state.appearance.body,'barbarian_large','preview never saves identity');
            assert.equal(state.gold,baseline.gold,'preview never charges');
            previews.push({id,model:state.model});
            if(id==='ranger')await page.screenshot({path:path.join(out,'dist-ranger-preview-desktop.png')});
        }
        const v2Palettes=await page.evaluate(()=>[...document.querySelectorAll('[data-palette]')].filter(el=>getComputedStyle(el).display!=='none').map(el=>el.dataset.palette));
        assert.equal(v2Palettes.length,8);
        await page.locator('[data-body="knight"]').click();
        const legacyPalettes=await page.evaluate(()=>[...document.querySelectorAll('[data-palette]')].filter(el=>getComputedStyle(el).display!=='none').map(el=>el.dataset.palette));
        assert.equal(legacyPalettes.length,5);
        await page.locator('[data-close]').click();
        assert.equal((await viewState(page)).preview,null);
        await waitModel(page,'V2_Barbarian_Large');

        await page.screenshot({path:path.join(out,'dist-foco.png')});
        await page.getByRole('button',{name:'Layout clássico',exact:true}).click();
        await page.waitForFunction(()=>!document.body.classList.contains('layout-focus'));
        await page.screenshot({path:path.join(out,'dist-classico.png')});
        await page.getByRole('button',{name:'Modo foco',exact:true}).click();
        await page.waitForFunction(()=>document.body.classList.contains('layout-focus'));
        assert.equal((await viewState(page)).canvasCount,1);

        await page.setViewportSize({width:844,height:390});await page.keyboard.press('v');
        const compact=await page.locator('#appearanceModal').evaluate(el=>{
            const r=el.getBoundingClientRect(),save=el.querySelector('[data-save]').getBoundingClientRect();
            return{bodyCount:el.querySelectorAll('[data-body]').length,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,saveVisible:save.top>=0&&save.bottom<=innerHeight};
        });
        assert(compact.inside&&compact.saveVisible&&compact.bodyCount===15);
        await page.screenshot({path:path.join(out,'dist-15-corpos-844x390.png')});await page.keyboard.press('Escape');
        assert.equal((await viewState(page)).preview,null);

        // Move through the game controls to the Oficina door, then enter and leave as the Large body.
        await page.setViewportSize({width:1440,height:900});
        await page.evaluate(()=>document.activeElement?.blur());
        const route=[];
        for(const key of ['ArrowRight','ArrowRight','ArrowUp','ArrowUp','ArrowUp','ArrowUp'])route.push(await step(page,key));
        const nearDoor=await page.evaluate(()=>nearbyWorldDoor()?.room?.id||null);
        assert.equal(nearDoor,'oficina');
        const portalStart=frames.length;
        await page.keyboard.press('g');
        await page.waitForFunction(()=>player.floor===1001,null,{timeout:10000});
        await waitModel(page,'V2_Barbarian_Large');
        await page.waitForFunction(()=>/Sair|Exit/.test(document.getElementById('worldDoor')?.textContent||''),null,{timeout:5000});
        const inside=await viewState(page);
        await page.screenshot({path:path.join(out,'dist-large-dentro-casa-desktop.png')});
        const exitControl=await page.evaluate(()=>({nearby:!!nearbyWorldDoor()?.exit,text:document.getElementById('worldDoor')?.textContent||'',visible:!!document.getElementById('worldDoor')?.getClientRects().length}));
        assert(exitControl.nearby&&exitControl.visible&&/Sair|Exit/.test(exitControl.text),'exit control visible inside house');
        const movedInside=await step(page,'ArrowUp');
        assert.equal(movedInside.floor,1001);
        await step(page,'ArrowDown');
        await page.waitForTimeout(850); // The real door control has an 800 ms interaction cooldown.
        await page.keyboard.press('g');
        await page.waitForFunction(()=>player.floor===0,null,{timeout:10000});
        await waitModel(page,'V2_Barbarian_Large');
        await page.waitForFunction(()=>document.getElementById('worldDoor')?.textContent?.includes('Entrar'),null,{timeout:5000});
        const outside=await viewState(page);
        await page.screenshot({path:path.join(out,'dist-large-fora-casa-desktop.png')});
        const portalFrames=frames.slice(portalStart).filter(message=>['dungeonEnter','dungeonExit','posCorrect'].includes(message.t));
        assert(portalFrames.some(message=>message.t==='dungeonEnter'&&message.interior==='oficina'));
        assert(portalFrames.some(message=>message.t==='dungeonExit'&&message.interior==='oficina'));
        assert(!portalFrames.some(message=>message.t==='posCorrect'),'movement and portal without correction');

        const visibilityBefore=await page.evaluate(()=>ValadaresModern.renderer.visibility.diagnostics());
        assert(visibilityBefore.active&&visibilityBefore.available&&visibilityBefore.copies>0);
        await page.evaluate(()=>logout());
        await page.waitForFunction(()=>!ValadaresModern.renderer.visibility.diagnostics().active&&ValadaresModern.renderer.visibility.diagnostics().copies===0);
        const visibilityAfter=await page.evaluate(()=>ValadaresModern.renderer.visibility.diagnostics());
        await login();await waitModel(page,'V2_Barbarian_Large');
        const relog=await viewState(page);
        assert.equal(relog.canvasCount,1);assert.equal(relog.appearance.body,'barbarian_large');
        assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
        const result={at:new Date().toISOString(),pass:true,source:'dist-web with isolated local backend',publicFileCount:files.length,
            authoredAssetCount:adventurers.length,equipmentGripsSha256:gripsHash,
            required,iconCount:icons.length,bodies:previews,v2Palettes,legacyPalettes,compact,
            focusClassicFocus:true,portal:{nearDoor,route:route.map(({x,y,floor})=>({x,y,floor})),inside,outside,frames:portalFrames.map(({t,interior,reason})=>({t,interior,reason}))},
            visibilityBefore,visibilityAfter,relog,errors,failures};
        fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    }finally{await browser.close();server.close();}
})().catch(error=>{server.close();console.error(error.stack||error);process.exitCode=1;});
