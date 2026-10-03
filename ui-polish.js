(function () {
    'use strict';
    const body = document.body;
    const modeButton = document.getElementById('layoutModeBtn');
    const equipmentButton = document.getElementById('equipmentPanelBtn');
    const inventoryButton = document.getElementById('inventoryPanelBtn');
    const chatButton = document.getElementById('chatSizeBtn');
    const firstSteps = document.getElementById('firstSteps');
    const firstStepsDismiss = document.getElementById('firstStepsDismiss');
    const pref = key => {
        try { return localStorage.getItem(key); } catch { return null; }
    };
    const savePref = (key, value) => {
        try { localStorage.setItem(key, value); } catch {}
    };
    const label = key => typeof tr === 'function' ? tr(key) : key;

    function updateLabels() {
        const classic = body.classList.contains('layout-classic');
        modeButton.textContent = label(classic ? 'ui.layout_focus' : 'ui.layout_classic');
        modeButton.setAttribute('aria-pressed', String(!classic));
        chatButton.textContent = label(body.classList.contains('chat-expanded') ? 'ui.chat_reduce' : 'ui.chat_expand');
        chatButton.setAttribute('aria-expanded', String(body.classList.contains('chat-expanded')));
        equipmentButton.setAttribute('aria-expanded', String(body.classList.contains('panel-equipment')));
        inventoryButton.setAttribute('aria-expanded', String(body.classList.contains('panel-inventory')));
    }
    function relayout() {
        if (typeof syncInvHeight === 'function') requestAnimationFrame(syncInvHeight);
    }
    function setMode(mode) {
        body.classList.toggle('layout-classic', mode === 'classic');
        body.classList.toggle('layout-focus', mode !== 'classic');
        body.classList.remove('panel-equipment', 'panel-inventory');
        savePref('valadares:layout', mode);
        updateLabels();
        relayout();
    }
    function togglePanel(name) {
        if (body.classList.contains('layout-classic') && window.innerWidth > 900) return;
        const cls = 'panel-' + name;
        const opening = !body.classList.contains(cls);
        body.classList.remove('panel-equipment', 'panel-inventory');
        if (opening) body.classList.add(cls);
        updateLabels();
    }
    modeButton.addEventListener('click', () => setMode(body.classList.contains('layout-classic') ? 'focus' : 'classic'));
    equipmentButton.addEventListener('click', () => togglePanel('equipment'));
    inventoryButton.addEventListener('click', () => togglePanel('inventory'));
    chatButton.addEventListener('click', () => {
        body.classList.toggle('chat-expanded');
        savePref('valadares:chatExpanded', body.classList.contains('chat-expanded') ? '1' : '0');
        updateLabels();
        relayout();
    });
    firstStepsDismiss.addEventListener('click', () => {
        firstSteps.hidden = true;
        if (typeof player !== 'undefined' && player.name) savePref('valadares:firstSteps:' + player.name, '1');
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && (body.classList.contains('panel-equipment') || body.classList.contains('panel-inventory'))) {
            body.classList.remove('panel-equipment', 'panel-inventory');
            updateLabels();
        }
    });
    const savedMode = pref('valadares:layout') === 'classic' ? 'classic' : 'focus';
    body.classList.add(savedMode === 'classic' ? 'layout-classic' : 'layout-focus');
    if (pref('valadares:chatExpanded') === '1') body.classList.add('chat-expanded');
    updateLabels();
    relayout();

    window.valadaresUi = {
        updateLabels,
        onAuth() {
            body.classList.add('game-active');
            if (body.classList.contains('touch')) {
                setTimeout(() => { if (body.classList.contains('game-active')) openMobileTut(false); }, 400);
                return;
            }
            const name = typeof player !== 'undefined' ? player.name : '';
            if (!name || pref('valadares:firstSteps:' + name) === '1' || pref('valadares:tutSeen:' + name) === '1') return;
            setTimeout(() => {
                if (body.classList.contains('game-active') && !window.valadaresAdventureGuide?.isGuiding()) firstSteps.hidden = false;
            }, 450);
        },
        onLogout() {
            body.classList.remove('game-active', 'panel-equipment', 'panel-inventory', 'menu-open');
            firstSteps.hidden = true;
            updateLabels();
        }
    };
    // A restored session can authenticate before this external script finishes loading.
    if (typeof _wsAuthed !== 'undefined' && _wsAuthed && typeof started !== 'undefined' && started) {
        window.valadaresUi.onAuth();
    }
})();
