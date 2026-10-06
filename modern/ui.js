// The modern HUD observes the classic client. Every action still travels
// through its existing controls and keyboard handler.
document.body.classList.add('modern-ui');
const body = document.body;
const bridge = window.ValadaresModernBridge;
const byId = id => document.getElementById(id);
const controls = byId('displayControls');
if (controls) {
    controls.dataset.visual = window.ValadaresModern?.state || 'loading';
    document.addEventListener('valadares:modern-ready', () => { controls.dataset.visual = 'ready'; });
    document.addEventListener('valadares:modern-error', () => { controls.dataset.visual = 'error'; });
}

// The original tab click listener still owns chat and combat-log switching.
for (const element of document.querySelectorAll('#chatPanel .chat-tab[data-tab], #chatPanel .log-filter[data-cat]')) {
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        element.click();
    });
}

const container = byId('gameContainer');
const hud = document.createElement('section');
hud.className = 'modern-hud';
hud.setAttribute('aria-label', 'Personagem');
hud.innerHTML = `
    <div class="modern-hud__top"><span class="modern-hud__name" id="modernName">Aventureiro</span><button class="modern-hud__open" id="modernCharacter" type="button" aria-controls="leftSidebar" aria-expanded="false">Personagem</button></div>
    <div class="modern-hud__row"><span class="modern-hud__label">HP</span><span class="modern-hud__track"><span class="modern-hud__fill modern-hud__fill--hp" id="modernHpBar"></span></span><span class="modern-hud__value" id="modernHp">—</span></div>
    <div class="modern-hud__row"><span class="modern-hud__label">MP</span><span class="modern-hud__track"><span class="modern-hud__fill modern-hud__fill--mp" id="modernMpBar"></span></span><span class="modern-hud__value" id="modernMp">—</span></div>
    <div class="modern-hud__bottom"><span class="modern-hud__gold" id="modernGold">0 g</span><span class="modern-hud__target" id="modernTarget" hidden></span></div>`;
container.append(hud);

const mapCard = document.createElement('section');
mapCard.className = 'modern-map';
mapCard.setAttribute('aria-label', 'Mapa');
mapCard.innerHTML = '<span class="modern-map__label">Mapa</span><canvas id="modernMiniMap" width="140" height="140" aria-label="Mini mapa"></canvas><span class="modern-map__pos" id="modernPos">—</span>';
container.append(mapCard);
const miniMap = byId('modernMiniMap');
const miniContext = miniMap.getContext('2d');

const actions = [
    [' ', '⚔', 'Atacar', 'ESP', true],
    ['r', '✦', 'Magia', 'R', true],
    ['f', '↗', 'Lança', 'F'],
    ['e', '♧', 'Comer', 'E'],
    ['b', '▣', 'Baú', 'B'],
    ['c', '⚒', 'Criar', 'C'],
    ['q', '▤', 'Missões', 'Q'],
    ['m', '✧', 'Altar', 'M'],
    ['t', '◎', 'Treino', 'T'],
    ['i', '◫', 'Atributos', 'I'],
    ['k', '✶', 'Talentos', 'K'],
    ['j', '✧', 'Conquistas', 'J'],
    ['l', '♜', 'Ranking', 'L'],
    ['n', '♧', 'Amigos', 'N'],
    ['o', '⚙', 'Opções', 'O'],
    ['p', '⚑', 'PvP', 'P'],
    ['Enter', '◇', 'Chat', '↵']
];
const actionBar = document.createElement('nav');
actionBar.className = 'modern-actions';
actionBar.setAttribute('aria-label', 'Ações rápidas');
const movement = document.createElement('span');
movement.className = 'modern-actions__move';
movement.innerHTML = '<strong>WASD</strong><span>Mover</span>';
actionBar.append(movement);
for (const [key, icon, label, shortcut, primary] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `${label} (${shortcut})`;
    button.setAttribute('aria-label', button.title);
    if (primary) button.dataset.primary = 'true';
    const symbol = document.createElement('span');
    symbol.className = 'modern-actions__symbol';
    symbol.textContent = icon;
    const text = document.createElement('span');
    text.textContent = label;
    const hint = document.createElement('span');
    hint.className = 'modern-actions__key';
    hint.textContent = shortcut;
    button.append(symbol, text, hint);
    button.addEventListener('click', () => {
        // The original document listener handles proximity, PvP, cooldowns,
        // permissions and each modal. Release Space immediately after engage.
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    });
    actionBar.append(button);
}
container.append(actionBar);

const character = byId('modernCharacter');
const left = byId('leftSidebar');
function setCharacter(open) {
    body.classList.toggle('modern-character-open', open);
    character.setAttribute('aria-expanded', String(open));
}
character.addEventListener('click', () => {
    const open = !body.classList.contains('modern-character-open');
    if (open) {
        body.classList.remove('panel-equipment', 'panel-inventory');
        window.valadaresUi?.updateLabels?.();
    }
    setCharacter(open);
});
for (const id of ['equipmentPanelBtn', 'inventoryPanelBtn', 'layoutModeBtn']) {
    byId(id)?.addEventListener('click', () => setCharacter(false));
}
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !body.classList.contains('modern-character-open')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setCharacter(false);
}, true);
document.addEventListener('pointerdown', event => {
    if (body.classList.contains('modern-character-open') && !left.contains(event.target) && !character.contains(event.target)) setCharacter(false);
});

const active = () => body.classList.contains('modern-renderer-ready') &&
    body.classList.contains('layout-focus') && !body.classList.contains('touch') &&
    innerWidth > 900 && bridge?.getStarted?.() && !document.hidden;
const set = (id, text) => { const node = byId(id); if (node.textContent !== text) node.textContent = text; };
const fraction = (value, max) => Math.max(0, Math.min(100, 100 * (Number(value) || 0) / (Number(max) || 1)));
function refresh() {
    if (!active()) return;
    const player = bridge.getPlayer();
    set('modernName', player.name || 'Aventureiro');
    set('modernHp', `${Math.ceil(player.hp || 0)}/${Math.ceil(player.maxHp || 0)}`);
    set('modernMp', `${Math.ceil(player.mp || 0)}/${Math.ceil(player.maxMp || 0)}`);
    set('modernGold', `${Math.floor(player.gold || 0).toLocaleString('pt-BR')} g`);
    byId('modernHpBar').style.width = `${fraction(player.hp, player.maxHp)}%`;
    byId('modernMpBar').style.width = `${fraction(player.mp, player.maxMp)}%`;
    const room=bridge.getInterior?.();
    set('modernPos', room ? (bridge.getLanguage?.()==='en' ? ({pousada:'Village tavern',oficina:'Village forge',biblioteca:'Temple',mercado:'Training hall'})[room.id] || room.label : room.label) : `${Math.floor(player.x)}, ${Math.floor(player.y)}${bridge.getFloor?.() ? ` · ${bridge.getFloor()}` : ''}`);
    const target = bridge.getTarget?.();
    const targetNode = byId('modernTarget');
    if (target?.id != null) {
        const entity = target.type === 'player'
            ? Object.entries(bridge.getRemotePlayers?.() || {}).find(([id]) => String(id) === String(target.id))?.[1]
            : (bridge.getMonsters?.() || []).find(mob => String(mob.id) === String(target.id));
        targetNode.hidden = false;
        set('modernTarget', entity?.name || bridge.getMonsterTypes?.()[entity?.type]?.name || 'Alvo');
    } else targetNode.hidden = true;
    const source = byId('minimap');
    if (source?.width && source.height) {
        miniContext.clearRect(0, 0, 140, 140);
        miniContext.drawImage(source, 0, 0, 140, 140);
    }
}
setInterval(refresh, 100);
