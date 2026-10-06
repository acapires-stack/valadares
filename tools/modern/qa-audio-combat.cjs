// Focused browser check for combat effects and the essential common samples.
// Additional authored variants are covered by qa-audio-profissional-regression.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH ||
    'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const audioDir = path.join(root, 'modern/assets/audio');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const common = new Set(['melee-1', 'melee-2', 'ranged-1', 'ranged-2',
    'wand', 'damage', 'kill', 'critical', 'pickup']);

(async () => {
    const browser = await chromium.launch({ executablePath: chrome, headless: true });
    try {
        const page = await browser.newPage();
        const requested = new Set();
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>audio QA</title>' });
            const match = /^\/modern\/assets\/audio\/([a-z0-9-]+)\.mp3$/.exec(url.pathname);
            if (!match) return route.fulfill({ status: 404, body: '' });
            const file = path.join(audioDir, match[1] + '.mp3');
            requested.add(match[1]);
            return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: fs.readFileSync(file) });
        });
        await page.goto('http://valadares.test/');
        await page.addScriptTag({ path: path.join(root, 'game-audio.js') });
        await page.evaluate(() => {
            window.qaContext = new AudioContext();
            window.qaEngine = ValadaresAudio.create(window.qaContext);
            qaEngine.setVolumes({ master: 100, effects: 0, ambient: 0, music: 0 });
            qaEngine.setScene({ active: true, biome: 'grass' });
        });
        await page.waitForTimeout(100);
        assert.equal(requested.size, 0, 'muted effects must not preload');
        await page.evaluate(() => qaEngine.setVolumes({ effects: 100 }));
        await page.waitForFunction(names => names.every(name => performance.getEntriesByType('resource')
            .some(entry => new URL(entry.name).pathname === '/modern/assets/audio/' + name + '.mp3')), [...common]);
        assert([...common].every(name => requested.has(name)), 'active scene must preload every essential sample');
        const decoded = await page.evaluate(async () => {
            const names = ['critical', 'wand'];
            return Promise.all(names.map(async name => {
                const response = await fetch('/modern/assets/audio/' + name + '.mp3');
                const buffer = await qaContext.decodeAudioData(await response.arrayBuffer());
                return [name, buffer.duration];
            }));
        });
        assert(decoded.every(([, seconds]) => seconds > 0 && seconds < 1.1), 'impact and wand MP3 must decode');

        const levels = await page.evaluate(async () => {
            async function fallback(kind){
                const ctx = new OfflineAudioContext(1, 22050, 44100);
                const engine = ValadaresAudio.create(ctx);
                engine.setVolumes({ master: 100, effects: 100, ambient: 0, music: 0 });
                engine.setScene({ active: true, combat: true });
                engine.play(kind); // buffers cannot decode before this immediate first call
                const buffer = await ctx.startRendering();
                engine.dispose();
                const pcm = buffer.getChannelData(0);
                let low = 0, high = 0;
                for (let hz = 80; hz <= 1300; hz += 20){
                    let real = 0, imag = 0;
                    for (let i = 110; i < 4000; i++){
                        const angle = 2 * Math.PI * hz * i / 44100;
                        real += pcm[i] * Math.cos(angle);
                        imag += pcm[i] * Math.sin(angle);
                    }
                    if (hz <= 400) low += Math.hypot(real, imag);
                    if (hz >= 700) high += Math.hypot(real, imag);
                }
                return { low, high };
            }
            return { criticalFallback: await fallback('critical'), wandFallback: await fallback('wand') };
        });
        assert(levels.criticalFallback.low > levels.criticalFallback.high,
            `critical fallback should favor low frequencies: ${JSON.stringify(levels)}`);
        await page.evaluate(async () => { qaEngine.dispose(); await qaContext.close(); });
        console.log(JSON.stringify({ result: 'PASS', preloaded: [...requested].filter(x => common.has(x)).length,
            decoded, music: levels }));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
