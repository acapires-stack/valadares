(function () {
    'use strict';
    const host = document.getElementById('gameContainer');
    if (!host) return;

    const root = document.createElement('div');
    root.id = 'adventureGuide';
    root.innerHTML = '<button id="adventureGuideOpen" type="button" aria-label="Abrir guia"></button>' +
        '<section id="adventureGuidePanel" aria-label="Primeira aventura" hidden>' +
        '<div class="ag-head"><strong id="agTitle"></strong><button id="agClose" type="button" aria-label="Recolher guia">×</button></div>' +
        '<div id="agStep" class="ag-step"></div><p id="agText"></p><div id="agDetail" class="ag-detail"></div>' +
        '<div class="ag-actions"><button id="agAction" type="button"></button><button id="agSafety" type="button" hidden></button><button id="agMissions" type="button"></button></div></section>' +
        '<section id="agMoment" class="ag-moment" aria-live="polite" hidden>' +
        '<div class="ag-moment-head"><span id="agMomentIcon" class="ag-medallion" aria-hidden="true"></span><div><strong id="agMomentTitle"></strong><span id="agMomentEyebrow"></span></div><button id="agMomentClose" type="button">×</button></div>' +
        '<p id="agMomentText"></p><div id="agMomentDetail" class="ag-moment-detail"></div>' +
        '<div class="ag-moment-actions"><button id="agMomentAction" type="button"></button></div></section>';
    host.appendChild(root);
    const openButton = root.querySelector('#adventureGuideOpen');
    const panel = root.querySelector('#adventureGuidePanel');
    const title = root.querySelector('#agTitle');
    const step = root.querySelector('#agStep');
    const body = root.querySelector('#agText');
    const detail = root.querySelector('#agDetail');
    const action = root.querySelector('#agAction');
    const safety = root.querySelector('#agSafety');
    const missions = root.querySelector('#agMissions');
    const moment = root.querySelector('#agMoment');
    const momentIcon = root.querySelector('#agMomentIcon');
    const momentTitle = root.querySelector('#agMomentTitle');
    const momentEyebrow = root.querySelector('#agMomentEyebrow');
    const momentText = root.querySelector('#agMomentText');
    const momentDetail = root.querySelector('#agMomentDetail');
    const momentAction = root.querySelector('#agMomentAction');
    const momentClose = root.querySelector('#agMomentClose');
    let ready = false, name = '', expanded = false, syncing = false, syncTimer = 0, observedActive = false;
    let pendingTurnIn = false, turnInTimer = 0, showSafety = false;
    let momentKind = '', momentSignature = '', momentReward = null;
    const copy = {
        pt: {
            title:'Primeira aventura', reopen:'📜 Guia', close:'Recolher guia', missions:'Missões',
            introStep:'1 de 3 · O pátio precisa de ajuda', intro:'Encontre a Atendente e aceite a Caçada infestante. Ela está em (47, 53).',
            introNear:'Você está ao lado da Atendente. Aceite a missão para começar.', accept:'Aceitar Caçada',
            huntStep:'2 de 3 · Caçada infestante', hunt:'Mate 10 ratos. Saia da zona segura para lutar; use Espaço no computador ou o botão de ataque no celular. Volte à zona segura se precisar se recuperar.',
            huntEmpty:'Procure ratos nos arredores da vila; evite avançar para áreas com inimigos mais fortes.',
            spotted:'Rato avistado', progress:'Ratos derrotados', saving:'Registrando a missão no servidor… Aguarde antes de sair para a caça.',
            returnStep:'3 de 3 · Volte à Atendente', return:'A caçada terminou. Volte à Atendente em (47, 53) e entregue a missão.',
            returnNear:'Você está ao lado dela. Entregue a missão para receber a recompensa.', deliver:'Entregar missão',
            pending:'Aguardando confirmação do servidor…', doneStep:'Aventura concluída',
            done:'A entrega foi confirmada. Você recebeu 50 gold e 100 XP de Punho.',
            next:'Próximo objetivo: Defenda o pátio. Veja a missão no quadro da Atendente.',
            explore:'Abra Missões para escolher seu próximo desafio.', surface:'Volte à superfície para continuar esta aventura na vila.',
            offline:'Conecte-se ao servidor para continuar.', danger:'Vida baixa: volte à zona segura agora.',
            safeRoute:'Centro da zona segura: (50, 50)', safety:'Como recuperar',
            safetyInfo:'Na zona segura, pare de lutar e aguarde a vida se recuperar. Se tiver comida ou poção de vida no inventário, você também pode usá-la.',
            achievementTitle:'Primeira conquista', achievementEyebrow:'CAÇADA INFESTANTE · CONCLUÍDA',
            achievementText:'A vila reconhece sua primeira vitória.', achievementNext:'Próximo objetivo: Defenda o pátio. Abra Missões na Atendente.',
            resumeTitle:'Sua aventura continua', resumeEyebrow:'ONDE VOCÊ PAROU', resumeNext:'Próxima missão',
            resumeDeliver:'Próxima ação: entregue à Atendente em (47, 53)',
            resumeContinue:'Próxima ação: continue o objetivo e acompanhe Missões',
            resumeChoose:'Próxima ação: abra Missões na Atendente em (47, 53)', floor:'Andar',
            directions:{left:'oeste ←', right:'leste →', up:'norte ↑', down:'sul ↓'}
        },
        en: {
            title:'First adventure', reopen:'📜 Guide', close:'Collapse guide', missions:'Quests',
            introStep:'1 of 3 · The yard needs help', intro:'Find the Attendant and accept Infestation Hunt. She is at (47, 53).',
            introNear:'You are next to the Attendant. Accept the quest to begin.', accept:'Accept Infestation Hunt',
            huntStep:'2 of 3 · Infestation Hunt', hunt:'Kill 10 rats. Leave the safe zone to fight; use Space on desktop or the attack button on mobile. Return to safety if you need to recover.',
            huntEmpty:'Look for rats around the village; avoid going into areas with stronger enemies.',
            spotted:'Rat spotted', progress:'Rats defeated', saving:'Registering the quest with the server… Wait before heading out.',
            returnStep:'3 of 3 · Return to the Attendant', return:'The hunt is done. Return to the Attendant at (47, 53) and turn in the quest.',
            returnNear:'You are next to her. Turn in the quest to receive the reward.', deliver:'Turn in quest',
            pending:'Waiting for server confirmation…', doneStep:'Adventure complete',
            done:'The turn-in was confirmed. You received 50 gold and 100 Fist XP.',
            next:'Next objective: Defend the Yard. Find it on the Attendant’s quest board.',
            explore:'Open Quests to choose your next challenge.', surface:'Return to the surface to continue this village adventure.',
            offline:'Connect to the server to continue.', danger:'Low health: return to the safe zone now.',
            safeRoute:'Safe zone center: (50, 50)', safety:'How to recover',
            safetyInfo:'In the safe zone, stop fighting and wait for health to recover. If you have food or a health potion in your inventory, you can use it too.',
            achievementTitle:'First achievement', achievementEyebrow:'INFESTATION HUNT · COMPLETE',
            achievementText:'The village recognizes your first victory.', achievementNext:'Next objective: Defend the Yard. Open Quests at the Attendant.',
            resumeTitle:'Your adventure continues', resumeEyebrow:'WHERE YOU LEFT OFF', resumeNext:'Next quest',
            resumeDeliver:'Next step: turn in at the Attendant (47, 53)',
            resumeContinue:'Next step: continue the objective and check Quests',
            resumeChoose:'Next step: open Quests at the Attendant (47, 53)', floor:'Floor',
            directions:{left:'west ←', right:'east →', up:'north ↑', down:'south ↓'}
        }
    };
    const words = () => copy[typeof LANG !== 'undefined' && LANG === 'en' ? 'en' : 'pt'];
    const prefKey = () => 'valadares:adventureGuide:' + name;
    const pref = () => { try { return localStorage.getItem(prefKey()); } catch { return null; } };
    const setPref = v => { try { localStorage.setItem(prefKey(), v); } catch {} };
    const stateKey = suffix => 'valadares:adventureGuide:' + encodeURIComponent(name) + ':' + suffix;
    const readState = suffix => { try { return localStorage.getItem(stateKey(suffix)); } catch { return null; } };
    const writeState = (suffix, value) => { try { localStorage.setItem(stateKey(suffix), value); } catch {} };
    const online = () => typeof _wsAuthed !== 'undefined' && _wsAuthed && typeof ws !== 'undefined' && ws?.readyState === 1;
    const hasQuest = () => !!player.quests?.active?.q_ratos;
    const done = () => !!player.quests?.completed?.includes('q_ratos');
    const nearAttendant = () => (player.floor || 0) === 0 && typeof atQuestNpc === 'function' && atQuestNpc();

    function activeQuest() {
        const active = player.quests?.active || {};
        if (typeof QUESTS === 'undefined') return null;
        return QUESTS.find(q => Object.prototype.hasOwnProperty.call(active, q.id)) || null;
    }
    function resumeData() {
        const w = words();
        const q = activeQuest();
        const floor = Number.isFinite(player.floor) ? player.floor : 0;
        const location = Number.isFinite(player.x) && Number.isFinite(player.y)
            ? (floor > 0 ? `${w.floor} ${floor} · ` : '') + `(${Math.round(player.x)}, ${Math.round(player.y)})` : '';
        if (q) {
            const progress = typeof questProgress === 'function' ? questProgress(q.id) : 0;
            const count = q.goal.count;
            const complete = progress >= count;
            const questName = typeof qName === 'function' ? qName(q) : q.name;
            const objective = typeof qDesc === 'function' ? qDesc(q) : q.desc || '';
            return {
                signature: `${q.id}:${progress}/${count}:${complete ? 1 : 0}`,
                text: `${questName} · ${progress}/${count}`,
                detail: (complete ? '' : objective ? objective + ' · ' : '')
                    + (complete ? w.resumeDeliver : w.resumeContinue) + (location ? ` · ${location}` : '')
            };
        }
        if (done()) {
            const nextQuest = typeof QUESTS === 'undefined' ? null : QUESTS.find(q => !player.quests?.completed?.includes(q.id));
            if (!nextQuest) return null;
            const questName = typeof qName === 'function' ? qName(nextQuest) : nextQuest.name;
            return { signature: `next:${nextQuest.id}`, text: `${w.resumeNext}: ${questName}`,
                detail: w.resumeChoose + (location ? ` · ${location}` : '') };
        }
        return null;
    }
    function showMoment(kind, data) {
        momentKind = kind;
        momentSignature = data.signature || '';
        expanded = false;
        const w = words();
        momentIcon.textContent = kind === 'achievement' ? '❧' : '✦';
        momentTitle.textContent = kind === 'achievement' ? w.achievementTitle : w.resumeTitle;
        momentEyebrow.textContent = kind === 'achievement' ? w.achievementEyebrow : w.resumeEyebrow;
        momentText.textContent = data.text;
        momentDetail.textContent = data.detail;
        momentAction.textContent = w.missions;
        momentClose.setAttribute('aria-label', w.close);
        render();
    }
    function closeMoment() {
        if (momentKind === 'resume' && momentSignature) writeState('resumeDismissed', momentSignature);
        momentKind = '';
        render();
    }
    function refreshMoment() {
        if (!momentKind) return;
        const w = words();
        const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
        const achievement = momentKind === 'achievement';
        put(momentTitle, achievement ? w.achievementTitle : w.resumeTitle);
        put(momentEyebrow, achievement ? w.achievementEyebrow : w.resumeEyebrow);
        put(momentAction, w.missions);
        momentClose.setAttribute('aria-label', w.close);
        if (!achievement) {
            const current = resumeData();
            if (!current) { momentKind = ''; return; }
            momentSignature = current.signature;
            put(momentText, current.text);
            put(momentDetail, current.detail);
            return;
        }
        const rewards = [];
        if (momentReward?.gold > 0) rewards.push(`+${momentReward.gold}g`);
        for (const [skill, value] of Object.entries(momentReward?.xp || {})) {
            rewards.push(`+${value} XP ${skill === 'Punho' && w === copy.en ? 'Fist' : skill}`);
        }
        put(momentText, w.achievementText);
        put(momentDetail, (rewards.length ? rewards.join(' · ') + ' · ' : '')
            + (player.quests?.completed?.includes('q_cobras') ? w.explore : w.achievementNext));
    }
    function onQuestResult(result) {
        if (!ready || !name || !result?.ok || result.kind !== 'simple' || result.questId !== 'q_ratos'
            || !done() || readState('firstQuestCelebrated')) return;
        // delta é o crédito aplicado pelo servidor, nunca uma previsão da tabela local.
        const delta = result.delta || {};
        momentReward = { gold: Number.isFinite(delta.gold) && delta.gold > 0 ? delta.gold : 0, xp: {} };
        if (delta.xp && typeof delta.xp === 'object') for (const [skill, value] of Object.entries(delta.xp)) {
            if (Number.isFinite(value) && value > 0) momentReward.xp[skill] = value;
        }
        writeState('firstQuestCelebrated', '1');
        const w = words();
        showMoment('achievement', {
            text: w.achievementText,
            detail: ''
        });
    }

    function direction(x, y) {
        const d = words().directions;
        const dx = x - player.x, dy = y - player.y;
        return [Math.abs(dx) > 1 ? (dx < 0 ? d.left : d.right) : '',
                Math.abs(dy) > 1 ? (dy < 0 ? d.up : d.down) : ''].filter(Boolean).join(' · ');
    }
    function ratSighting() {
        if (typeof serverAuthMobs === 'undefined' || !serverAuthMobs || !Array.isArray(monsters) || (player.floor || 0) !== 0) return null;
        const rats = monsters.filter(m => m.type === 'RAT' && m.hp > 0 && Number.isFinite(m.x) && Number.isFinite(m.y)
            && Math.max(Math.abs(m.x - 50), Math.abs(m.y - 50)) >= 8
            && Math.max(Math.abs(m.x - 50), Math.abs(m.y - 50)) <= 16
            && !monsters.some(other => other.hp > 0 && other.type !== 'RAT' && other.type !== 'SNAKE'
                && Number.isFinite(other.x) && Number.isFinite(other.y)
                && Math.max(Math.abs(other.x - m.x), Math.abs(other.y - m.y)) <= 4));
        rats.sort((a, b) => Math.max(Math.abs(a.x - player.x), Math.abs(a.y - player.y))
            - Math.max(Math.abs(b.x - player.x), Math.abs(b.y - player.y)));
        return rats[0] || null;
    }
    function setExpanded(value) {
        expanded = value;
        setPref(value ? 'open' : 'closed');
        render();
    }
    function syncAcceptance() {
        clearTimeout(syncTimer);
        syncing = true;
        const acceptedName = name;
        // saveUpload pode ser descartado silenciosamente pelo throttle de 5 s.
        // Um segundo envio após a janela garante que o servidor registre active.
        if (online()) saveState();
        syncTimer = setTimeout(() => {
            if (ready && name === acceptedName && hasQuest() && !done() && online()) {
                saveState();
                syncing = false;
            }
            render();
        }, 5500);
        render();
    }
    function onReady() {
        if (typeof player === 'undefined' || !player.name) return;
        const changed = name !== player.name;
        if (changed) {
            momentKind = ''; momentSignature = ''; momentReward = null;
            clearTimeout(syncTimer);
            clearTimeout(turnInTimer);
            syncing = false;
            pendingTurnIn = false;
            showSafety = false;
            name = player.name;
            observedActive = hasQuest();
            const played = Object.values(player.stats?.mobKills || {}).some(n => n > 0)
                || Object.keys(player.quests?.active || {}).some(id => id !== 'q_ratos')
                || (player.quests?.completed || []).length > 0
                || Object.values(player.skills || {}).some(skill => skill.val > 10)
                || Object.keys(player.questFlags || {}).length > 0;
            expanded = pref() === 'open' || (pref() !== 'closed' && !done() && (hasQuest() || !played));
        } else if (syncing && hasQuest() && online()) {
            syncAcceptance();
        }
        ready = true;
        if (changed) {
            const data = resumeData();
            if (data && readState('resumeDismissed') !== data.signature) {
                showMoment('resume', data);
                return;
            }
        }
        render();
    }
    function onLogout() {
        clearTimeout(syncTimer);
        clearTimeout(turnInTimer);
        ready = false; name = ''; expanded = false; syncing = false; pendingTurnIn = false; showSafety = false; observedActive = false;
        momentKind = ''; momentSignature = ''; momentReward = null;
        render();
    }
    function render() {
        const w = words();
        const in3d = typeof r3dOn !== 'undefined' && r3dOn;
        root.hidden = !ready || in3d;
        if (root.hidden) return;
        if (hasQuest() && !observedActive && !done()) {
            observedActive = true;
            syncAcceptance();
            return;
        }
        const tutorialOpen = !!document.getElementById('mobileTutOverlay')?.classList.contains('active');
        refreshMoment();
        moment.hidden = !momentKind || tutorialOpen;
        openButton.hidden = expanded || tutorialOpen || !!momentKind;
        panel.hidden = !expanded || tutorialOpen || !!momentKind;
        const lowHealth = !done() && hasQuest() && (player.floor || 0) === 0
            && typeof playerInSafeZone === 'function' && !playerInSafeZone()
            && player.maxHp > 0 && player.hp / player.maxHp < 0.4;
        const compact = lowHealth ? (LANG === 'en' ? '⚠ Low health' : '⚠ Vida baixa')
            : done() ? (LANG === 'en' ? '📜 Next quest' : '📜 Próxima missão')
            : !hasQuest() ? (LANG === 'en' ? '📜 Attendant (47, 53)' : '📜 Atendente (47, 53)')
            : syncing ? (LANG === 'en' ? '📜 Saving quest…' : '📜 Registrando…')
            : questProgress('q_ratos') >= 10 ? (LANG === 'en' ? '📜 Return to Attendant' : '📜 Voltar à Atendente')
            : (LANG === 'en' ? '📜 Rats ' : '📜 Ratos ') + questProgress('q_ratos') + '/10';
        openButton.textContent = compact;
        openButton.setAttribute('aria-label', w.reopen + ' · ' + compact);
        root.querySelector('#agClose').setAttribute('aria-label', w.close);
        title.textContent = w.title;
        missions.textContent = w.missions;
        action.hidden = true;
        safety.hidden = true;
        detail.textContent = '';
        if (done()) {
            step.textContent = w.doneStep;
            body.textContent = w.done;
            detail.textContent = player.quests?.completed?.includes('q_cobras') ? w.explore : w.next;
        } else if (!hasQuest()) {
            step.textContent = w.introStep;
            body.textContent = nearAttendant() ? w.introNear : w.intro;
            if (!nearAttendant()) detail.textContent = direction(47, 53);
            if (nearAttendant()) { action.hidden = false; action.textContent = w.accept; action.dataset.mode = 'accept'; }
        } else if (syncing) {
            step.textContent = w.huntStep;
            body.textContent = w.saving;
        } else if (typeof questProgress === 'function' && questProgress('q_ratos') >= 10) {
            step.textContent = w.returnStep;
            body.textContent = nearAttendant() ? w.returnNear : w.return;
            detail.textContent = nearAttendant() ? (pendingTurnIn ? w.pending : '') : direction(47, 53);
            if (nearAttendant() && !pendingTurnIn) { action.hidden = false; action.textContent = w.deliver; action.dataset.mode = 'deliver'; }
        } else {
            step.textContent = w.huntStep;
            body.textContent = w.hunt;
            const progress = typeof questProgress === 'function' ? questProgress('q_ratos') : 0;
            const rat = ratSighting();
            detail.textContent = `${w.progress}: ${progress}/10 · ` + (rat
                ? `${w.spotted}: (${rat.x}, ${rat.y}) ${direction(rat.x, rat.y)}`
                : w.huntEmpty);
        }
        if (lowHealth && !syncing) {
            step.textContent = w.danger;
            body.textContent = w.safeRoute + ' · ' + direction(50, 50);
            detail.textContent = showSafety ? w.safetyInfo : '';
            action.hidden = true;
            safety.hidden = false;
            safety.textContent = w.safety;
        }
        if ((player.floor || 0) !== 0 && !done()) {
            body.textContent = w.surface;
            detail.textContent = '';
            action.hidden = true;
        }
        if (!online() && !done()) detail.textContent = w.offline;
        action.disabled = !online();
    }

    openButton.addEventListener('click', () => setExpanded(true));
    root.querySelector('#agClose').addEventListener('click', () => setExpanded(false));
    safety.addEventListener('click', () => { showSafety = !showSafety; render(); });
    missions.addEventListener('click', () => { if (typeof openQuests === 'function') openQuests(); });
    momentClose.addEventListener('click', closeMoment);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && momentKind && !moment.hidden) closeMoment();
    });
    momentAction.addEventListener('click', () => {
        closeMoment();
        if (typeof openQuests === 'function') openQuests();
    });
    action.addEventListener('click', () => {
        if (!online() || !nearAttendant() || done()) return;
        if (action.dataset.mode === 'accept' && !hasQuest() && typeof acceptQuest === 'function' && acceptQuest('q_ratos')) {
            observedActive = true;
            syncAcceptance();
            if (typeof renderQuests === 'function') renderQuests();
        } else if (action.dataset.mode === 'deliver' && hasQuest() && !syncing && questProgress('q_ratos') >= 10
            && typeof turnInQuest === 'function' && turnInQuest('q_ratos')) {
            pendingTurnIn = true;
            clearTimeout(turnInTimer);
            turnInTimer = setTimeout(() => { pendingTurnIn = false; render(); }, 4000);
            render();
        }
    });
    window.valadaresAdventureGuide = { onReady, onLogout, onQuestResult,
        isGuiding: () => ready && ((expanded && !done()) || !!momentKind) };
    setInterval(() => { if (ready) render(); }, 900);
    // Autenticação pode terminar antes de este recurso opcional carregar.
    if (typeof _wsAuthed !== 'undefined' && _wsAuthed && typeof started !== 'undefined' && started) onReady();
})();
