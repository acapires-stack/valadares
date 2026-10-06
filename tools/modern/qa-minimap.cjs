// Village state comes from the running preview. The interior uses the same room
// definition and grid conversion as a server transition, in an isolated canvas.
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Alcione/Documents/Codex/2026-10-03/da-u/work/node_modules/playwright');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097');
        await page.locator('#charInput').fill('TesteMiniMapa26');
        await page.locator('#pwdInput').fill('MiniMapa26!');
        await page.locator('button[onclick="tryLogin(true)"]').click();
        await page.waitForFunction(() => window.ValadaresModern?.state === 'ready' && ValadaresModernBridge.getStarted(), null, { timeout: 35000 });
        await page.locator('#modernMiniMap').waitFor({ state: 'attached', timeout: 10000 });
        const state = () => page.evaluate(() => {
            const bridge = ValadaresModernBridge, player = bridge.getPlayer();
            const canvas = document.getElementById('modernMiniMap');
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            const colors = new Set();
            for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
            const span = 25, tile = canvas.width / span;
            const left = Math.min(Math.max(Math.floor(player.x) - 12, 0), bridge.M_W - span);
            const top = Math.min(Math.max(Math.floor(player.y) - 12, 0), bridge.M_H - span);
            let fog = null;
            for (let dy = 4; dy < span - 3 && fog === null; dy++) for (let dx = 2; dx < span - 4; dx++) {
                if (player.visited[(top + dy) * bridge.M_W + left + dx]) continue;
                const px = Math.floor((dx + .5) * tile), py = Math.floor((dy + .5) * tile), i = (py * canvas.width + px) * 4;
                fog = pixels[i] === 16 && pixels[i + 1] === 27 && pixels[i + 2] === 28;
                break;
            }
            return { x: player.x, y: player.y, floor: bridge.getFloor(),
                visited: !!player.visited?.[player.y * bridge.M_W + player.x],
                aria: canvas.getAttribute('aria-label'), legend: document.getElementById('modernMapLegend').textContent,
                colors: colors.size, fog, mapDisplay: getComputedStyle(document.querySelector('.modern-map')).display,
                mapWidth: canvas.getBoundingClientRect().width, status: ValadaresModern.state };
        });
        await page.waitForTimeout(300);
        const start = await state();
        assert.equal(start.floor, 0);
        assert(start.visited && start.aria.includes(`${start.x}, ${start.y}`), 'position and discovery state');
        assert.equal(start.fog, true, 'undiscovered terrain stays concealed');
        assert(start.colors > 4, 'terrain, fog and markers are distinguishable');
        assert.equal(start.mapWidth, 140);

        await page.setViewportSize({ width: 920, height: 720 });
        await page.waitForTimeout(250);
        const compact = await state();
        assert.equal(compact.floor, 0);
        assert.equal(compact.mapWidth, 140);
        assert.equal(compact.mapDisplay, 'flex');

        const interior = await page.evaluate(async () => {
            const bridge = ValadaresModernBridge;
            const room = bridge.getInteriors().find(r => r.id === 'pousada');
            const grid = applyDungeonGrid(room.grid);
            const mock = Object.create(bridge);
            mock.getMap = () => grid;
            mock.getFloor = () => room.floor;
            mock.getInterior = () => room;
            mock.getStairs = () => ({ up: room.exit });
            mock.getPlayer = () => ({ x: room.spawn.x, y: room.spawn.y, floor: room.floor, dir: 'up', visited: new Uint8Array(bridge.M_W * bridge.M_H).fill(1) });
            const canvas = document.createElement('canvas'); canvas.width = 140; canvas.height = 140;
            const legend = document.createElement('span');
            const { createMinimap } = await import('/modern/minimap.js');
            createMinimap(canvas, legend, mock).draw();
            const pixels = canvas.getContext('2d').getImageData(0, 0, 140, 140).data;
            const colors = new Set();
            for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
            return { room: room.id, floor: room.floor, grid: grid[room.spawn.y][room.spawn.x],
                aria: canvas.getAttribute('aria-label'), legend: legend.textContent, colors: colors.size };
        });
        assert.equal(interior.room, 'pousada');
        assert.equal(interior.floor, 1000);
        assert(interior.legend.includes('Saída'), 'interior exit shown');
        assert(interior.colors > 4, 'interior terrain and markers are distinguishable');
        assert(interior.aria.includes('50, 50'));

        const dungeon = await page.evaluate(async () => {
            const bridge = ValadaresModernBridge;
            const room = bridge.getInteriors().find(r => r.id === 'pousada');
            const mock = Object.create(bridge), visited = new Uint8Array(bridge.M_W * bridge.M_H);
            visited[50 * bridge.M_W + 50] = 1;
            mock.getMap = () => applyDungeonGrid(room.grid);
            mock.getFloor = () => 1;
            mock.getInterior = () => null;
            mock.getStairs = () => ({ up: { x: 48, y: 50 } });
            mock.getPlayer = () => ({ x: 50, y: 50, floor: 1, dir: 'up', visited });
            mock.getCamera = () => ({ x: 50, y: 47 });
            mock.getMonsters = () => [{ x: 52, y: 50 }, { x: 47, y: 50 }];
            mock.getRemotePlayers = () => ({ stranger: { x: 54, y: 50, name: 'Stranger' }, mate: { x: 55, y: 50, name: 'Mate' } });
            mock.isPartyMate = name => name === 'Mate';
            const canvas = document.createElement('canvas'); canvas.width = 140; canvas.height = 140;
            const legend = document.createElement('span');
            const { createMinimap } = await import('/modern/minimap.js');
            createMinimap(canvas, legend, mock).draw();
            const ctx = canvas.getContext('2d');
            const pixel = x => {
                const px = Math.floor((x - 38 + .5) * 140 / 25), py = Math.floor((50 - 38 + .5) * 140 / 25);
                return Array.from(ctx.getImageData(px, py, 1, 1).data).slice(0, 3);
            };
            return { hiddenTerrain: pixel(49), hiddenStair: pixel(48), visibleMonster: pixel(52),
                offscreenMonster: pixel(47), unknownStranger: pixel(54), partyMate: pixel(55), legend: legend.textContent };
        });
        const dark = [16, 27, 28];
        assert.deepEqual(dungeon.hiddenTerrain, dark, 'dungeon fog covers unknown terrain');
        assert.deepEqual(dungeon.hiddenStair, dark, 'unknown stairs are concealed');
        assert.deepEqual(dungeon.offscreenMonster, dark, 'offscreen monster is concealed');
        assert.deepEqual(dungeon.unknownStranger, dark, 'unknown remote player is concealed');
        assert.deepEqual(dungeon.visibleMonster, [214, 74, 70], 'monster in classic camera is shown');
        assert.deepEqual(dungeon.partyMate, [116, 224, 140], 'party mate keeps classic visibility exception');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ status: 'PASS', start, compact, interior, dungeon, errors }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
