// A compact, north-up view of the same terrain and discovery state used by the game.
// The bridge remains the authority for positions, floors, services and visibility.
export function createMinimap(canvas, legend, bridge) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const colors = {
        [bridge.T.GRASS]: '#548852', [bridge.T.DIRT]: '#b28a52',
        [bridge.T.TREE]: '#275441', [bridge.T.WATER]: '#3d82a4',
        [bridge.T.STONE]: '#8b9790', [bridge.T.CAVE]: '#6b6474',
        [bridge.T.CAVE_WALL]: '#302e3d', [bridge.T.SNOW]: '#b9d2d9',
        [bridge.T.SAND]: '#c8ae72'
    };
    const labels = {
        pt: { door: 'Porta', exit: 'Saída', down: 'Descer', up: 'Subir', town: 'Vila', craft: 'Bancada', altar: 'Altar', dummy: 'Treino', npc: 'Pessoa' },
        en: { door: 'Door', exit: 'Exit', down: 'Down', up: 'Up', town: 'Village', craft: 'Workbench', altar: 'Altar', dummy: 'Training', npc: 'Person' }
    };
    const roomNames = {
        pt: { pousada: 'Pousada', oficina: 'Oficina', biblioteca: 'Biblioteca', mercado: 'Mercado' },
        en: { pousada: 'Tavern', oficina: 'Forge', biblioteca: 'Temple', mercado: 'Training hall' }
    };
    const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

    function draw() {
        const player = bridge.getPlayer?.();
        const map = bridge.getMap?.();
        if (!player || !map) return;
        const floor = bridge.getFloor?.() ?? player.floor ?? 0;
        const interior = bridge.getInterior?.();
        const language = bridge.getLanguage?.() === 'en' ? 'en' : 'pt';
        const words = labels[language];
        const width = map[0]?.length || bridge.M_W;
        const height = map.length || bridge.M_H;
        const span = interior ? 13 : 25;
        const tile = size / span;
        const left = Math.min(Math.max(Math.floor(player.x) - Math.floor(span / 2), 0), Math.max(0, width - span));
        const top = Math.min(Math.max(Math.floor(player.y) - Math.floor(span / 2), 0), Math.max(0, height - span));
        const visited = player.visited;
        const known = (x, y) => !!visited?.[y * bridge.M_W + x];
        const inside = (x, y) => x >= left && x < left + span && y >= top && y < top + span;
        const point = (x, y) => ({ x: (x - left + .5) * tile, y: (y - top + .5) * tile });

        ctx.fillStyle = '#101b1c';
        ctx.fillRect(0, 0, size, size);
        for (let y = top; y < Math.min(top + span, height); y++) {
            for (let x = left; x < Math.min(left + span, width); x++) {
                if (!known(x, y)) continue;
                const terrain = map[y]?.[x];
                ctx.fillStyle = colors[terrain] || '#514e55';
                ctx.fillRect((x - left) * tile, (y - top) * tile, Math.ceil(tile), Math.ceil(tile));
                if (floor === 0 && bridge.inSafeZone?.(x, y)) {
                    ctx.fillStyle = 'rgba(140, 211, 194, .18)';
                    ctx.fillRect((x - left) * tile, (y - top) * tile, Math.ceil(tile), Math.ceil(tile));
                }
            }
        }

        const marks = [];
        const mark = (x, y, name, color, shape = 'circle') => {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !inside(x, y) || !known(x, y)) return;
            const p = point(x, y);
            const radius = interior ? 4 : 3.5;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#162222';
            ctx.fillStyle = color;
            ctx.beginPath();
            if (shape === 'diamond') {
                ctx.moveTo(p.x, p.y - radius - 1); ctx.lineTo(p.x + radius + 1, p.y);
                ctx.lineTo(p.x, p.y + radius + 1); ctx.lineTo(p.x - radius - 1, p.y);
            } else ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            marks.push({ name, distance: Math.hypot(x - player.x, y - player.y) });
        };

        if (interior) {
            mark(interior.exit?.x, interior.exit?.y, words.exit, '#efce8f', 'diamond');
            for (const service of interior.services || []) {
                mark(service.x, service.y, words[service.kind] || service.kind, '#80d7c9', 'diamond');
            }
        } else if (floor === 0) {
            for (const room of bridge.getInteriors?.() || []) {
                mark(room.door?.x, room.door?.y,
                    roomNames[language]?.[room.id] || room.label || words.door, '#efce8f', 'diamond');
            }
            for (const npc of bridge.getNpcs?.() || []) {
                if (!npc.sanctuary) continue;
                mark(npc.pos?.x, npc.pos?.y, bridge.npcName?.(npc) || npc.name || words.npc, '#91d8d1');
            }
        }
        if (!interior) for (const [kind, stair] of Object.entries(bridge.getStairs?.() || {})) {
            mark(stair?.x, stair?.y, words[kind] || words.door, '#e9ad79', 'diamond');
        }

        const entity = (x, y, color, radius = 2.7) => {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !inside(x, y)) return;
            const p = point(x, y);
            ctx.fillStyle = color; ctx.strokeStyle = '#1b2222'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        };
        const camera = bridge.getCamera?.();
        if (camera) for (const monster of bridge.getMonsters?.() || []) {
            if (monster.x < camera.x || monster.x >= camera.x + bridge.VP_W ||
                monster.y < camera.y || monster.y >= camera.y + bridge.VP_H) continue;
            entity(monster.x, monster.y, monster.unique ? '#ffcc40' : monster.hunter ? '#ff6010' : '#d64a46');
        }
        for (const remote of Object.values(bridge.getRemotePlayers?.() || {})) {
            if (!remote) continue;
            const mate = !!bridge.isPartyMate?.(remote.name);
            if (!mate && !known(remote.x, remote.y)) continue;
            entity(remote.x, remote.y, mate ? '#74e08c' : remote.pvp ? '#ff4545' : '#71aaff', mate ? 3.2 : 2.7);
        }

        const p = point(player.x, player.y);
        const facing = dir[player.dir] || dir.down;
        const right = [-facing[1], facing[0]];
        ctx.fillStyle = '#fff0aa'; ctx.strokeStyle = '#1c2624'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + facing[0] * 7, p.y + facing[1] * 7);
        ctx.lineTo(p.x - facing[0] * 4 + right[0] * 4, p.y - facing[1] * 4 + right[1] * 4);
        ctx.lineTo(p.x - facing[0] * 4 - right[0] * 4, p.y - facing[1] * 4 - right[1] * 4);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // The compass sits in its own dark plate so snow and sand remain readable.
        ctx.fillStyle = 'rgba(9, 22, 24, .86)'; ctx.fillRect(size - 24, 4, 20, 20);
        ctx.fillStyle = '#f2e1ae'; ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', size - 14, 14);

        const near = marks.sort((a, b) => a.distance - b.distance).slice(0, 2).map(m => m.name);
        const description = interior
            ? (roomNames[language]?.[interior.id] || interior.label || (language === 'en' ? 'Interior' : 'Interior'))
            : floor ? (language === 'en' ? `Floor ${floor}` : `Andar ${floor}`)
                : (language === 'en' ? 'Explored terrain' : 'Terreno descoberto');
        const legendText = near.length ? near.join(' · ') : description;
        if (legend.textContent !== legendText) legend.textContent = legendText;
        const aria = `${description}. ${language === 'en' ? 'Position' : 'Posição'} ${Math.floor(player.x)}, ${Math.floor(player.y)}. ${near.join(', ')}`;
        if (canvas.getAttribute('aria-label') !== aria) canvas.setAttribute('aria-label', aria);
    }

    return { draw };
}
