// Reuse the existing discovery/marker scenarios with this review's own account.
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'qa-minimap.cjs'),'utf8')
 .replaceAll('3337/jogar?ws=ws://127.0.0.1:8097','3338/jogar3d?ws=ws://127.0.0.1:8098')
 .replaceAll('TesteMiniMapa26','AmbienteMapa26').replaceAll('MiniMapa26!','Valadares18!')
 .replace('const page = await browser.newPage','var page = await browser.newPage')
 .replace('} finally { await browser.close(); }', `} catch(error) { console.log(await page.evaluate(()=>({render:window.ValadaresModern?.state,started:window.ValadaresModernBridge?.getStarted(),login:document.querySelector('#loginError')?.textContent,status:document.querySelector('#connStatus')?.textContent}))); console.log(errors); throw error; } finally { await browser.close(); }`);
new Function('require',source)(require);
