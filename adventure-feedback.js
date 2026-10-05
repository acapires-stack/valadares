/* Feedback leve para eventos confirmados pelo servidor. Sem estado de inventário próprio. */
(() => {
    'use strict';
    const MAX_HITS = 12;
    const MAX_REMOVED = 80;
    const REMOVED_TTL = 8000;
    const GROUP_MS = 280;
    const CARD_MS = 3400;
    const MAX_BOSSES = 10;
    let deps = {};
    let root = null;
    let flushTimer = 0;
    let lastHitAt = 0;
    let lastSoundAt = 0;
    let pending = null;
    const removed = new Map();
    const hits = [];
    const cards = [];
    const bosses = [];
    const seenEncounters = new Set();
    let bossButton = null;
    let bossDialog = null;
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
    function playPickupSound(rare, boss){
        // O boss já toca na confirmação do servidor; o cartão não repete o som.
        if (boss || typeof deps.playEvent !== 'function' || Date.now() - lastSoundAt < 260) return;
        lastSoundAt = Date.now();
        deps.playEvent(rare ? 'rareLoot' : 'pickup');
    }
    function getMeta(type){
        try {
            const meta = typeof deps.getItem === 'function' && deps.getItem(type);
            if (!meta || typeof meta.name !== 'string') return null;
            return { name: meta.name.slice(0, 80), kind: meta.kind,
                rarity: meta.rarity === 'ascendant' ? 'ascendant' : meta.rarity === 'myth' ? 'myth' : meta.rarity === 'legendary' ? 'legendary' : 'common' };
        } catch { return null; }
    }
    function english(){ return typeof deps.getLanguage === 'function' && deps.getLanguage() === 'en'; }
    function say(pt, en){ return english() ? en : pt; }
    function positiveItems(items){
        if (!items || typeof items !== 'object' || Array.isArray(items)) return [];
        return Object.entries(items).slice(0, 80).filter(([type, qty]) =>
            typeof type === 'string' && type.length <= 80 && Number.isFinite(qty) && qty > 0
        ).map(([type, qty]) => ({ type, qty: Math.floor(qty) }));
    }
    function amount(value){ return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null; }
    function bossSnapshot(raw){
        const reward = raw.reward && typeof raw.reward === 'object' ? raw.reward : null;
        const carried = reward?.carried && typeof reward.carried === 'object' ? reward.carried : null;
        const ground = reward?.ground && typeof reward.ground === 'object' ? reward.ground : null;
        const damage = raw.damage && typeof raw.damage === 'object' ? raw.damage : null;
        const drops = Array.isArray(ground?.drops) ? ground.drops.slice(0, 80).filter(d =>
            d && typeof d.type === 'string' && Number.isFinite(d.qty) && d.qty > 0
        ).map(d => ({ type:d.type.slice(0, 80), qty:Math.floor(d.qty),
            x:Number.isFinite(d.x) ? d.x : null, y:Number.isFinite(d.y) ? d.y : null,
            ownerUntil:Number.isFinite(d.ownerUntil) ? d.ownerUntil : null })) : [];
        return {
            boss: typeof raw.boss === 'string' ? raw.boss.slice(0, 80) : '',
            at: Date.now(), floor: amount(raw.floor), durationMs: amount(raw.durationMs),
            gold: amount(carried?.gold) ?? amount(raw.gold) ?? amount(reward?.awarded?.gold),
            items: positiveItems(carried?.items || raw.items),
            itemsKnown: !!(carried?.items || raw.items),
            damage: damage ? { dealt:amount(damage.dealt), total:amount(damage.total),
                share:Number.isFinite(damage.share) && damage.share >= 0 && damage.share <= 1 ? damage.share : null,
                fallback:damage.fallback === true } : null,
            guaranteedGold: amount(reward?.guaranteedGold),
            groundItems: positiveItems(ground?.items), drops
        };
    }
    function itemName(type){ return getMeta(type)?.name || type; }
    function bossName(type){
        try {
            const name = typeof deps.bossName === 'function' && deps.bossName(type);
            if (typeof name === 'string' && name.trim()) return name.slice(0, 80);
        } catch {}
        return type.replace(/_/g, ' ');
    }
    function itemText(item){ return itemName(item.type) + (item.qty > 1 ? ' ×' + item.qty : ''); }
    function addText(parent, className, text, tag = 'div'){
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = text;
        parent.appendChild(node);
        return node;
    }
    function updateBossButton(){
        if (!bossButton) return;
        bossButton.textContent = say('Chefes', 'Bosses') + ' · ' + bosses.length;
        bossButton.setAttribute('aria-label', say('Abrir resumos dos chefes desta sessão', 'Open boss summaries from this session'));
    }
    function ensureBossUi(){
        const host = container();
        if (!host) return false;
        if (!bossButton){
            bossButton = document.createElement('button');
            bossButton.type = 'button';
            bossButton.className = 'adventure-boss-trigger';
            bossButton.setAttribute('aria-haspopup', 'dialog');
            bossButton.addEventListener('click', openSummary);
            host.prepend(bossButton);
        }
        if (!bossDialog){
            bossDialog = document.createElement('dialog');
            bossDialog.className = 'adventure-boss-dialog';
            bossDialog.id = 'adventureBossDialog';
            bossDialog.setAttribute('aria-labelledby', 'adventureBossTitle');
            // The game listens for keys on document. Keep gameplay shortcuts behind the modal.
            bossDialog.addEventListener('keydown', event => event.stopPropagation());
            bossDialog.addEventListener('close', () => { if (bossButton?.isConnected) bossButton.focus(); });
            document.body.appendChild(bossDialog);
            bossButton.setAttribute('aria-controls', bossDialog.id);
        }
        updateBossButton();
        return true;
    }
    function renderSummary(){
        if (!bossDialog) return;
        bossDialog.replaceChildren();
        const header = document.createElement('header');
        header.className = 'adventure-boss-header';
        const title = addText(header, 'adventure-boss-title', say('Últimos chefes da sessão', 'Recent bosses this session'), 'h2');
        title.id = 'adventureBossTitle';
        const close = addText(header, 'adventure-boss-close', '×', 'button');
        close.type = 'button';
        close.setAttribute('aria-label', say('Fechar resumo', 'Close summary'));
        close.addEventListener('click', closeSummary);
        bossDialog.appendChild(header);
        const list = document.createElement('div');
        list.className = 'adventure-boss-list';
        for (const boss of bosses){
            const article = document.createElement('article');
            article.className = 'adventure-boss-entry';
            const time = new Date(boss.at).toLocaleTimeString(english() ? 'en-US' : 'pt-BR', { hour:'2-digit', minute:'2-digit' });
            addText(article, 'adventure-boss-name', (boss.boss ? bossName(boss.boss) : say('Chefe', 'Boss')) + ' · ' + time, 'h3');
            const context = [];
            if (boss.floor !== null) context.push(boss.floor ? say('Andar ', 'Floor ') + boss.floor : say('Superfície', 'Surface'));
            if (boss.durationMs !== null){
                const seconds = Math.floor(boss.durationMs / 1000);
                context.push(say('Duração ', 'Duration ') + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'));
            }
            if (context.length) addText(article, 'adventure-boss-context', context.join(' · '));
            if (!boss.damage || boss.damage.fallback){
                addText(article, 'adventure-boss-muted', boss.damage?.fallback
                    ? say('Dano não rastreado nesta luta.', 'Damage was not tracked in this fight.')
                    : say('Dano individual indisponível neste resumo.', 'Individual damage unavailable in this summary.'));
            } else {
                const d = boss.damage;
                const parts = [];
                if (d.dealt !== null) parts.push(say('Seu dano: ', 'Your damage: ') + d.dealt.toLocaleString(english() ? 'en-US' : 'pt-BR'));
                if (d.total !== null) parts.push(say('total dos elegíveis: ', 'eligible total: ') + d.total.toLocaleString(english() ? 'en-US' : 'pt-BR'));
                if (d.share !== null) parts.push(say('participação: ', 'share: ') + (d.share * 100).toLocaleString(english() ? 'en-US' : 'pt-BR', { maximumFractionDigits:1 }) + '%');
                addText(article, 'adventure-boss-damage', parts.length ? parts.join(' · ') :
                    say('Dano individual indisponível neste resumo.', 'Individual damage unavailable in this summary.'));
            }
            if (boss.gold !== null) addText(article, 'adventure-boss-gold', say('Ouro recebido: ', 'Gold received: ') + boss.gold.toLocaleString(english() ? 'en-US' : 'pt-BR') + 'g');
            if (boss.guaranteedGold !== null) addText(article, 'adventure-boss-muted', say('Mínimo pessoal: ', 'Personal minimum: ') + boss.guaranteedGold.toLocaleString(english() ? 'en-US' : 'pt-BR') + 'g');
            if (boss.itemsKnown) addText(article, 'adventure-boss-items', say('Itens recebidos: ', 'Items received: ') +
                (boss.items.length ? boss.items.map(itemText).join(', ') : say('nenhum', 'none')));
            if (boss.drops.length){
                addText(article, 'adventure-boss-ground-title', say('Mochila cheia — itens deixados no chão:', 'Backpack full — items dropped on the ground:'));
                for (const drop of boss.drops){
                    const location = drop.x !== null && drop.y !== null ? ' (' + drop.x + ', ' + drop.y + ')' :
                        say(' (local indisponível)', ' (location unavailable)');
                    const remaining = drop.ownerUntil === null ? null : Math.ceil((drop.ownerUntil - Date.now()) / 1000);
                    const reservation = remaining === null ? '' : remaining > 0
                        ? say(' · reserva inicial: restam ', ' · initial reservation: ') + remaining + 's'
                        : say(' · reserva inicial vencida', ' · initial reservation expired');
                    addText(article, 'adventure-boss-ground', itemText(drop) + location + reservation);
                }
            } else if (boss.groundItems.length){
                addText(article, 'adventure-boss-ground', say('Mochila cheia — deixados no chão (local indisponível): ', 'Backpack full — dropped on the ground (location unavailable): ') + boss.groundItems.map(itemText).join(', '));
            }
            if (boss.drops.length || boss.groundItems.length)
                addText(article, 'adventure-boss-muted', say('Registro da derrota; disponibilidade atual não verificada.', 'Record from the defeat; current availability not checked.'));
            if (boss.gold === null && !boss.itemsKnown && !boss.groundItems.length && !boss.drops.length)
                addText(article, 'adventure-boss-muted', say('Detalhes da recompensa indisponíveis.', 'Reward details unavailable.'));
            list.appendChild(article);
        }
        bossDialog.appendChild(list);
    }
    function openSummary(){
        if (!bosses.length || !ensureBossUi() || bossDialog.open) return;
        if (typeof deps.beforeSummary === 'function'){
            try { deps.beforeSummary(); } catch {}
        }
        renderSummary();
        if (typeof bossDialog.showModal === 'function') bossDialog.showModal();
        else bossDialog.setAttribute('open', '');
        bossDialog.querySelector('.adventure-boss-close')?.focus();
    }
    function closeSummary(){
        if (!bossDialog?.open) return;
        if (typeof bossDialog.close === 'function') bossDialog.close();
        else { bossDialog.removeAttribute('open'); if (bossButton?.isConnected) bossButton.focus(); }
    }
    function rememberBoss(raw){
        const id = typeof raw.encounterId === 'string' || Number.isFinite(raw.encounterId)
            ? String(raw.encounterId).slice(0, 120) : '';
        if (id && seenEncounters.has(id)) return false;
        if (id) seenEncounters.add(id);
        bosses.unshift(bossSnapshot(raw));
        if (bosses.length > MAX_BOSSES) bosses.length = MAX_BOSSES;
        ensureBossUi();
        if (bossDialog?.open) renderSummary();
        return true;
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
        queueLoot(merged, gold, false);
        return [...merged.values()];
    }
    // O boss credita direto no inventário. Este payload já foi confirmado pelo servidor;
    // não passa por groundRemove/pickup e não altera o inventário local.
    function bossLoot(reward){
        if (!reward || typeof reward !== 'object') return;
        if (!rememberBoss(reward)) return false;
        const merged = new Map();
        for (const [type, rawQty] of Object.entries(reward.items || {}).slice(0, 80)){
            if (typeof type !== 'string' || !Number.isFinite(rawQty) || rawQty <= 0) continue;
            const meta = getMeta(type);
            if (!meta || ['food', 'potion', 'ammo'].includes(meta.kind)) continue;
            merged.set(type, { type, qty: Math.floor(rawQty), ...meta });
        }
        const gold = Number.isFinite(reward.gold) ? Math.max(0, Math.floor(reward.gold)) : 0;
        if (!gold && !merged.size && !Object.keys(reward.items || {}).length) return;
        queueLoot(merged, gold, !merged.size, true);
    }
    function queueLoot(merged, gold, noSpecial, boss = false){
        if (!gold && !merged.size && !noSpecial) return;
        if (!pending) pending = { items: new Map(), gold: 0, noSpecial: false, boss: false };
        pending.gold += gold;
        pending.noSpecial ||= noSpecial;
        pending.boss ||= boss;
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
        const ranked = [...batch.items.values()].sort((a,b) => rank(b) - rank(a));
        const rare = ranked.some(row => row.rarity !== 'common');
        const card = document.createElement('div');
        card.className = 'adventure-loot-card' + (rare ? ' adventure-loot-card-rare' : '');
        if (!ranked.length && batch.noSpecial){
            const line = document.createElement('div');
            line.className = 'adventure-loot-more';
            line.textContent = deps.getLanguage && deps.getLanguage() === 'en' ? 'No special item' : 'Sem item especial';
            card.appendChild(line);
        }
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
                rarity.textContent = row.rarity === 'ascendant' ? (english ? 'ASCENDANT' : 'ASCENDENTE') : row.rarity === 'myth' ? (english ? 'MYTHIC' : 'MÍTICO') : (english ? 'LEGENDARY' : 'LENDÁRIO');
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
        playPickupSound(rare, batch.boss);
    }
    function rank(row){
        const rarity = row.rarity === 'ascendant' ? 300 : row.rarity === 'myth' ? 200 : row.rarity === 'legendary' ? 100 : 0;
        const kind = ['weapon', 'wand', 'offhand', 'armor', 'head', 'feet', 'neck', 'cosmetic'].includes(row.kind) ? 20 : 0;
        return rarity + kind;
    }
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
        closeSummary();
        bossDialog?.remove(); bossDialog = null;
        bossButton?.remove(); bossButton = null;
        bosses.length = 0; seenEncounters.clear();
    }
    window.ValadaresAdventureFeedback = { configure, captureRemoved: rememberRemoved, loot, bossLoot, hit, draw, closeSummary, reset };
})();
