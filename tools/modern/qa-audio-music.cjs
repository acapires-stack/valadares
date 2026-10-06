// Real Chrome playback through HTMLMediaElement -> Web Audio, with local asset responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH ||
    'C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const audioDir = path.join(root, 'modern/assets/audio');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'));
const sizes = new Map(manifest.files.map(file => [file.name, file.bytes]));

async function makePage(browser, failTrack = '') {
    const page = await browser.newPage();
    const requested = [];
    await page.route('**/*', route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html',
            body: '<!doctype html><button id="start">Start</button>' });
        const match = /^\/modern\/assets\/audio\/([a-z0-9-]+)\.mp3$/.exec(pathname);
        if (!match) return route.fulfill({ status: 404 });
        const name = match[1] + '.mp3';
        requested.push(name);
        if (match[1] === failTrack) return route.fulfill({ status: 404 });
        return route.fulfill({ status: 200, contentType: 'audio/mpeg',
            body: fs.readFileSync(path.join(audioDir, name)) });
    });
    await page.goto('http://valadares.test/');
    await page.evaluate(() => {
        const NativeAudio = window.Audio;
        window.qaMedia = [];
        window.Audio = function(){
            const media = new NativeAudio();
            qaMedia.push(media);
            return media;
        };
        window.qaHidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => qaHidden });
    });
    await page.addScriptTag({ path: path.join(root, 'game-audio.js') });
    await page.evaluate(() => {
        document.querySelector('#start').onclick = () => {
            window.qaContext = new AudioContext();
            window.qaEngine = ValadaresAudio.create(qaContext);
            qaEngine.setVolumes({ master: 100, effects: 0, ambient: 0, music: 100 });
            qaEngine.setScene({ active: true, biome: 'pz' });
        };
    });
    await page.click('#start');
    return { page, requested };
}

async function switchZone(page, biome, expectedTrack) {
    await page.evaluate(b => qaEngine.setScene({ biome: b }), biome);
    await page.waitForTimeout(2150);
    await page.evaluate(b => qaEngine.setScene({ biome: b }), biome);
    await page.waitForFunction(key => qaMedia.some(m => m.src.endsWith(key) && m.currentTime > 0.15), expectedTrack);
}

(async () => {
    const browser = await chromium.launch({ executablePath: chrome, headless: true });
    try {
        const { page, requested } = await makePage(browser);
        await page.waitForFunction(() => qaMedia.some(m => m.currentTime > 0.2));
        assert.deepEqual(requested.filter(name => name.startsWith('music-')), ['music-pz-tree.mp3']);
        const started = await page.evaluate(() => qaMedia[0].currentTime);
        assert(started > 0.2, 'music must actually advance in Chrome');

        await page.evaluate(() => qaEngine.setVolumes({ music: 0 }));
        const mutedAt = await page.evaluate(() => qaMedia[0].currentTime);
        await page.waitForTimeout(350);
        const mutedAfter = await page.evaluate(() => qaMedia[0].currentTime);
        assert(Math.abs(mutedAfter - mutedAt) < 0.12, 'music mute must pause the stream');
        await page.evaluate(() => qaEngine.setVolumes({ effects: 100 }));
        assert.equal(await page.evaluate(() => qaEngine.play('melee')), true,
            'effects must still work with music muted');
        await page.evaluate(() => qaEngine.setVolumes({ effects: 0, music: 100 }));
        await page.waitForFunction(t => qaMedia[0].currentTime > t + 0.15, mutedAt);

        await page.evaluate(() => { qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
        const hiddenAt = await page.evaluate(() => qaMedia[0].currentTime);
        await page.waitForTimeout(350);
        assert(Math.abs((await page.evaluate(() => qaMedia[0].currentTime)) - hiddenAt) < 0.12,
            'hidden tab must pause music');
        await page.evaluate(() => { qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForFunction(t => qaMedia[0].currentTime > t + 0.15, hiddenAt);

        await page.evaluate(() => qaEngine.setScene({ biome: 'grass' }));
        await page.waitForTimeout(450);
        assert(!requested.includes('music-field.mp3'), 'zone needs stable dwell before music switch');
        await page.waitForTimeout(1750);
        await page.evaluate(() => qaEngine.setScene({ biome: 'grass' }));
        await page.waitForFunction(() => qaMedia.some(m => m.src.endsWith('music-field.mp3') && m.currentTime > 0.15));
        await page.waitForTimeout(2700);
        assert(await page.evaluate(() => qaMedia[0].paused), 'old zone media must stop after crossfade');
        await switchZone(page, 'cave', 'music-cave.mp3');
        await switchZone(page, 'pz', 'music-pz-lake.mp3');

        // Trigger the same end event Chrome raises at the end of a full track.
        await page.evaluate(() => qaMedia.at(-1).dispatchEvent(new Event('ended')));
        const countAfterEnd = requested.filter(name => name.startsWith('music-')).length;
        await page.waitForTimeout(600);
        assert.equal(requested.filter(name => name.startsWith('music-')).length, countAfterEnd,
            'completed track must leave an interval before another starts');
        assert.deepEqual([...new Set(requested.filter(name => name.startsWith('music-')))],
            ['music-pz-tree.mp3', 'music-field.mp3', 'music-cave.mp3', 'music-pz-lake.mp3'],
            'only scene music should be fetched');
        const musicBytes = [...new Set(requested.filter(name => name.startsWith('music-')))]
            .reduce((sum, name) => sum + sizes.get(name), 0);
        await page.evaluate(async () => { qaEngine.dispose(); await qaContext.close(); });

        const failed = await makePage(browser, 'music-pz-tree');
        await failed.page.waitForFunction(() => qaMedia.length > 0);
        await failed.page.waitForTimeout(500);
        assert.deepEqual(failed.requested.filter(name => name.startsWith('music-')),
            ['music-pz-tree.mp3'], 'missing track must not trigger broad preload or a retry burst');
        assert.equal(await failed.page.evaluate(() => qaMedia[0].paused), true,
            'missing track must remain silent');
        await failed.page.evaluate(async () => { qaEngine.dispose(); await qaContext.close(); });
        console.log(JSON.stringify({ result: 'PASS', selectedMusicBytes: musicBytes,
            tracks: [...new Set(requested.filter(name => name.startsWith('music-')))],
            checks: ['playback', 'mute', 'effects-isolation', 'visibility', 'stable-zone',
                'crossfade-stop', 'reentry', 'pause-after-track', 'selective-network', 'missing-track'] }));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
