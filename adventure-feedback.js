/* Feedback leve para eventos confirmados pelo servidor. Sem estado de inventário próprio. */
(() => {
    'use strict';
    const MAX_HITS = 12;
    const MAX_REMOVED = 80;
    const REMOVED_TTL = 8000;
    const GROUP_MS = 280;
    const CARD_MS = 3400;
    let deps = {};
    let root = null;
    let flushTimer = 0;
    let lastHitAt = 0;
    let lastSoundAt = 0;
    let pending = null;
    const removed = new Map();
    const hits = [];
    const cards = [];
    const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    function configure(options){ deps = options || {}; }
    function container(){
        if (root && root.isConnected) return root;
        const host = document.getElementById('gameContainer');
        if (!host) return null;
        root = document.createElement('div');
        root.className = 'adventure-feedback';
        root.setAttribute('aria-live', 'polite');
        root.setAttribute('aria-atomic', 'false');
        host.appendChild(root);
        return root;
    }
    function hiddenByGuide(){
        return !!(document.querySelector('#mobileTutOverlay.active') ||
            [...document.querySelectorAll('#tutorialModal, #settingsModal')].some(el => el.style.display && el.style.display !== 'none'));
    }
    function rememberRemoved(ids, groundItems){
        if (!Array.isArray(ids) || !Array.isArray(groundItems)) return;
        const now = Date.now();
        const wanted = new Set(ids.slice(0, 30));
        for (const drop of groundItems){
            if (!drop || !wanted.has(drop.id)) continue;
            if (typeof drop.type !== 'string' || !Number.isFinite(drop.qty)) continue;
            removed.set(drop.id, { type: drop.type, qty: Math.max(1, Math.floor(drop.qty)), until: now + REMOVED_TTL });
        }
        for (const [id, value] of removed){
            if (value.until < now || removed.size > MAX_REMOVED) removed.delete(id);
        }
    }
    function playPickupSound(rare){
        if (typeof deps.playSfx !== 'function' || Date.now() - lastSoundAt < 260) return;
        lastSoundAt = Date.now();
        // playSfx já respeita o volume efetivo, mute e o AudioContext do jogo.
        deps.playSfx((c, mg, _rg, t) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(rare ? 880 : 720, t);
            osc.frequency.exponentialRampToValueAtTime(rare ? 1175 : 960, t + 0.09);
            gain.gain.setValueAtTime(rare ? 0.12 : 0.075, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            osc.connect(gain).connect(mg);
            osc.start(t); osc.stop(t + 0.17);
        });
    }
    function getMeta(type){
        try {
            const meta = typeof deps.getItem === 'function' && deps.getItem(type);
            if (!meta || typeof meta.name !== 'string') return null;
            return { name: meta.name.slice(0, 80), rarity: meta.rarity === 'myth' ? 'myth' : meta.rarity === 'legendary' ? 'legendary' : 'common' };
        } catch { return null; }
    }
    function loot(pickup){
        if (!pickup || !Array.isArray(pickup.ids) || !pickup.ids.length) return;
        const now = Date.now();
        const merged = new Map();
        for (const id of new Set(pickup.ids.slice(0, 30))){
            const drop = removed.get(id);
            removed.delete(id);
            if (!drop || drop.until < now || drop.type === 'GOLD') continue;
            const meta = getMeta(drop.type);
            if (!meta) continue;
            const row = merged.get(drop.type) || { type: drop.type, qty: 0, ...meta };
            row.qty += drop.qty;
            merged.set(drop.type, row);
        }
        const gold = Number.isFinite(pickup.gold) ? Math.max(0, Math.floor(pickup.gold)) : 0;
        if (!gold && !merged.size) return;
        if (!pending) pending = { items: new Map(), gold: 0 };
        pending.gold += gold;
        for (const row of merged.values()){
            const old = pending.items.get(row.type);
            if (old) old.qty += row.qty;
            else pending.items.set(row.type, row);
        }
        if (!flushTimer) flushTimer = setTimeout(flush, GROUP_MS);
    }
    function flush(){
        flushTimer = 0;
        const batch = pending;
        pending = null;
        if (!batch || hiddenByGuide()) return;
        const host = container();
        if (!host) return;
        const ranked = [...batch.items.values()].sort((a,b) => rank(b.rarity) - rank(a.rarity));
        const rare = ranked.some(row => row.rarity !== 'common');
        const card = document.createElement('div');
        card.className = 'adventure-loot-card' + (rare ? ' adventure-loot-card-rare' : '');
        for (const row of ranked.slice(0, 2)){
            const line = document.createElement('div');
            line.className = 'adventure-loot-line adventure-rarity-' + row.rarity;
            let iconUrl = '';
            try { iconUrl = typeof deps.icon === 'function' ? deps.icon(row.type, 24) : ''; } catch {}
            if (typeof iconUrl === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(iconUrl)){
                const img = document.createElement('img');
                img.src = iconUrl;
                img.alt = '';
                img.width = 24; img.height = 24;
                line.appendChild(img);
            }
            const label = document.createElement('span');
            label.textContent = row.name + (row.qty > 1 ? ' ×' + row.qty : '');
            line.appendChild(label);
            if (row.rarity !== 'common'){
                const rarity = document.createElement('small');
                rarity.className = 'adventure-loot-rarity';
                const english = deps.getLanguage && deps.getLanguage() === 'en';
                rarity.textContent = row.rarity === 'myth' ? (english ? 'MYTHIC' : 'MÍTICO') : (english ? 'LEGENDARY' : 'LENDÁRIO');
                line.appendChild(rarity);
            }
            card.appendChild(line);
        }
        if (ranked.length > 2){
            const more = document.createElement('div');
            more.className = 'adventure-loot-more';
            more.textContent = '+' + (ranked.length - 2) + (deps.getLanguage && deps.getLanguage() === 'en' ? ' more items' : ' outros itens');
            card.appendChild(more);
        }
        if (batch.gold){
            const gold = document.createElement('div');
            gold.className = 'adventure-loot-gold';
            gold.textContent = '+' + batch.gold.toLocaleString(deps.getLanguage && deps.getLanguage() === 'en' ? 'en-US' : 'pt-BR') + 'g';
            card.appendChild(gold);
        }
        host.appendChild(card);
        cards.push(card);
        while (cards.length > 2) cards.shift().remove();
        setTimeout(() => { const i = cards.indexOf(card); if (i >= 0) cards.splice(i, 1); card.remove(); }, CARD_MS);
        playPickupSound(rare);
    }
    function rank(rarity){ return rarity === 'myth' ? 2 : rarity === 'legendary' ? 1 : 0; }
    function hit(event){
        if (!event || event.confirmed !== true || motion.matches || hiddenByGuide()) return;
        if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
        if (event.kind !== 'dealt' && event.kind !== 'taken') return;
        if (event.kind === 'taken' && !(Number(event.actual) > 0)) return;
        const now = performance.now();
        if (now - lastHitAt < 45) return;
        lastHitAt = now;
        hits.push({ x: event.x, y: event.y, at: now, kind: event.kind, crit: !!event.crit,
            floor: typeof deps.getFloor === 'function' ? deps.getFloor() : 0 });
        if (hits.length > MAX_HITS) hits.shift();
    }
    function draw(ctx, camera){
        if (!ctx || !camera || motion.matches || !hits.length) return;
        const now = performance.now();
        const tile = Number.isFinite(camera.tileSize) ? camera.tileSize : 48;
        if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y)) return;
        const floor = typeof deps.getFloor === 'function' ? deps.getFloor() : 0;
        ctx.save();
        for (let i = hits.length - 1; i >= 0; i--){
            const h = hits[i];
            const life = (now - h.at) / (h.crit ? 260 : 190);
            if (life >= 1 || h.floor !== floor){ hits.splice(i, 1); continue; }
            const sx = (h.x - camera.x + 0.5) * tile;
            const sy = (h.y - camera.y + 0.5) * tile;
            if (sx < -tile || sy < -tile || sx > ctx.canvas.width + tile || sy > ctx.canvas.height + tile) continue;
            ctx.globalAlpha = (1 - life) * (h.crit ? 0.75 : 0.48);
            ctx.strokeStyle = h.kind === 'taken' ? '#ff7258' : h.crit ? '#ffe18a' : '#fff2c4';
            ctx.lineWidth = h.crit ? 3 : 2;
            ctx.beginPath();
            ctx.arc(sx, sy, (h.crit ? 8 : 5) + life * (h.crit ? 19 : 12), -0.7, 2.3);
            ctx.stroke();
        }
        ctx.restore();
    }
    function reset(){
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = 0; pending = null; lastHitAt = 0; lastSoundAt = 0;
        removed.clear(); hits.length = 0;
        for (const card of cards) card.remove();
        cards.length = 0;
    }
    window.ValadaresAdventureFeedback = { configure, captureRemoved: rememberRemoved, loot, hit, draw, reset };
})();
