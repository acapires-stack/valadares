// ═════════════════════════════════════════════════════════════════════════════
// VALADARES - Servidor Multiplayer (autoritativo de mobs)
// ═════════════════════════════════════════════════════════════════════════════
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const wss = new WebSocketServer({ port: PORT });

// Em produção (Railway), Volume montado em /data; localmente fica ao lado do server.js
const STATE_FILE = process.env.STATE_FILE_PATH || path.join(__dirname, 'state.json');
const STATE_SAVE_INTERVAL_MS = 30 * 1000;  // 30s — menos janela de perda

// ─── Constants do mundo ─────────────────────────────────────────────────────
const M_W = 100, M_H = 100;
const SAFE_RADIUS = 3, SAFE_CX = 50, SAFE_CY = 50;
const T = { GRASS:0, DIRT:1, TREE:2, WATER:3, STONE:4, CAVE:5, CAVE_WALL:6, SNOW:7, SAND:8 };
const walkable = t => t===T.GRASS||t===T.DIRT||t===T.STONE||t===T.CAVE||t===T.SNOW||t===T.SAND;

// intel: 1=burro (vai direto, faz fila), 2=cerca (escolhe vaga adjacente livre),
// 3=flanqueia (prefere atrás do player)
const MTYPE = {
    RAT:        { hp:18,  dmg:2,  speed:440, xp:8,   aggro:4, intel:1 },
    SNAKE:      { hp:35,  dmg:4,  speed:390, xp:18,  aggro:4, intel:1 },
    SPIDER:     { hp:50,  dmg:6,  speed:370, xp:30,  aggro:5, intel:2 },
    WOLF:       { hp:80,  dmg:8,  speed:320, xp:55,  aggro:6, intel:2 },
    ORC:        { hp:140, dmg:11, speed:370, xp:120, aggro:5, intel:2 },
    ORC_LIDER:  { hp:450, dmg:19, speed:340, xp:600, aggro:6, unique:true, intel:3 },
    BAT:        { hp:25,  dmg:5,  speed:250, xp:22,  aggro:5, intel:1 },
    MINOTAUR:   { hp:220, dmg:16, speed:380, xp:240, aggro:6, intel:3 },
    SKELETON:   { hp:90,  dmg:11, speed:370, xp:80,  aggro:5, intel:2 },
    TROLL:      { hp:160, dmg:14, speed:420, xp:160, aggro:5, intel:2 },
    LIZARD:     { hp:55,  dmg:9,  speed:300, xp:45,  aggro:4, intel:1 },
    DRAKE:      { hp:130, dmg:15, speed:340, xp:150, aggro:6, intel:2 },
    DRAKE_LIDER:{ hp:700, dmg:25, speed:360, xp:800, aggro:7, unique:true, intel:3 },
    GOLEM:      { hp:200, dmg:13, speed:460, xp:180, aggro:6, intel:2 },
    GOLEM_REI:  { hp:900, dmg:20, speed:490, xp:700, aggro:7, unique:true, intel:3 },
    SCORPION:   { hp:75,  dmg:11, speed:320, xp:55,  aggro:4, intel:2 },
    CACADOR:    { hp:350, dmg:18, speed:320, xp:0,   aggro:999, intel:3 },
    // ★★ MEGA RAID BOSS — spawna quando os 3 bosses normais chegam ao Lv10
    SENHOR_VALADARES: { hp:8000, dmg:50, speed:280, xp:5000, aggro:12, unique:true, mega:true, intel:3 },
    // Boss de evento semanal (sábado 20h-22h BRT)
    ARAUTO: { hp:3000, dmg:30, speed:320, xp:1500, aggro:8, unique:true, intel:3 },
};

const SPAWN_RINGS = [
    { min:6,  max:14, target:18, types:['RAT','RAT','RAT','RAT','SNAKE'] },
    { min:14, max:24, target:20, types:['SNAKE','SNAKE','SPIDER','RAT'] },
    { min:24, max:36, target:16, types:['SPIDER','SPIDER','WOLF'] },
    { min:36, max:99, target:14, types:['WOLF','WOLF','ORC','ORC'] },
];

const CAVES = [
    { name:'Caverna dos Morcegos', x:18, y:80, r:7, types:['BAT','BAT','BAT','BAT','SKELETON'], target:14 },
    { name:'Antro do Minotauro',   x:82, y:18, r:8, types:['BAT','MINOTAUR','MINOTAUR','SKELETON'], target:12 },
    { name:'Cripta dos Mortos',    x:18, y:18, r:6, types:['SKELETON','SKELETON','BAT'], target:10 },
    { name:'Covil do Drake',       x:82, y:80, r:8, types:['DRAKE','DRAKE','DRAKE','BAT'], target:14 },
    { name:'Abismo do Golem',      x:70, y:90, r:7, types:['GOLEM','GOLEM','SKELETON'], target:10 },
];

const BIOME_SPAWNS = [
    { name:'neve',    inBounds:(x,y)=>y<32,             types:['TROLL','TROLL','TROLL'],                target:10 },
    { name:'deserto', inBounds:(x,y)=>y>68 && x>52,     types:['LIZARD','LIZARD','SCORPION','SCORPION'],target:12 },
];

const BOSS_RESPAWN_MS = 5 * 60 * 1000;
const DUNGEON_BOSS_RESPAWN_MS = 8 * 60 * 1000;
const BOSS_POS  = { type:'ORC_LIDER',   x:46, y:95, respawn: BOSS_RESPAWN_MS };
const DRAKE_POS = { type:'DRAKE_LIDER', x:82, y:80, respawn: DUNGEON_BOSS_RESPAWN_MS };
const GOLEM_POS = { type:'GOLEM_REI',   x:70, y:90, respawn: DUNGEON_BOSS_RESPAWN_MS };
const BOSSES = [BOSS_POS, DRAKE_POS, GOLEM_POS];
const bossDeath = new Map(); // type -> deathAt
const bossLevel = new Map(); // type -> 1..10 (escala stats no respawn)
const BOSS_LEVEL_CAP = 10;
const GHOST_TIMEOUT_MS = 3 * 60 * 1000;   // body stays 3 min após logout

// Posições dos NPCs (espelhadas do cliente). Mob não ataca player adjacente a NPC (mini-PZ raio 2).
// Mantém aqui no server porque cliente é dono dos NPCs (não precisa sincronizar tudo).
const NPC_POSITIONS = [
    { x:52, y:49 },  // mercador
    { x:52, y:51 },  // atendente
    { x:22, y:22 },  // eremita
    { x:78, y:22 },  // ferreiro
    { x:76, y:78 },  // caçadora
    { x:66, y:90 },  // mineiro
    { x:75, y:20 },  // vendedor (hidden, mas dá proteção mesmo assim)
];
const NPC_PROTECT_RADIUS = 1;   // 3×3 ao redor do NPC (suficiente pra ler modal)
const NPC_PROTECT_COMBAT_GRACE_MS = 2000;   // ao atacar, perde proteção por 2s
function playerNearNpc(p){
    // Mini-PZ é cancelada se o player atacou recentemente (anti-cheese)
    if (p.lastAttackAt && Date.now() - p.lastAttackAt < NPC_PROTECT_COMBAT_GRACE_MS) return false;
    for (const n of NPC_POSITIONS){
        if (Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y)) <= NPC_PROTECT_RADIUS) return true;
    }
    return false;
}

// ★★ MEGA BOSS (Senhor de Valadares)
const MEGA_BOSS_POS = { x: 50, y: 30 };
const MEGA_BOSS_TYPE = 'SENHOR_VALADARES';
const MEGA_BOSS_LIFETIME_MS = 30 * 60 * 1000;   // 30 min vivo
const MEGA_BOSS_COOLDOWN_MS = 24 * 60 * 60 * 1000;  // 24h cooldown após morte/expira
const megaBoss = {
    spawnedAt: 0,         // 0 = não está vivo
    lastResolvedAt: 0,    // última vez que morreu ou expirou
};

// Admin: travado em 'alcione' (não usa env, segurança extra)
function isAdmin(name){ return String(name || '').toLowerCase() === 'alcione'; }

// MOTD via env (mensagem do dia, aparece pra todos ao conectar)
const SERVER_MOTD = process.env.SERVER_MOTD || '';
let SERVER_MOTD_RUNTIME = SERVER_MOTD;  // pode ser editado via /motd (até reiniciar)

// ─── Estado ─────────────────────────────────────────────────────────────────
let nextId = 1;
let nextMobId = 1;
const players  = new Map(); // id -> { ws, id, name, x, y, dir, pvp, hp, maxHp }
const monsters = new Map(); // id -> { id, type, x, y, dir, hp, maxHp, dmg, speed, aggro, unique, lastMoveAt, lastAttackAt }

// ─── Helpers ────────────────────────────────────────────────────────────────
function chebyshev(ax, ay, bx, by){ return Math.max(Math.abs(ax-bx), Math.abs(ay-by)); }
function manhattan(ax, ay, bx, by){ return Math.abs(ax-bx) + Math.abs(ay-by); }
function inSafe(x, y){ return chebyshev(x, y, SAFE_CX, SAFE_CY) <= SAFE_RADIUS; }
function inCave(x, y){
    for (const c of CAVES) if (chebyshev(x, y, c.x, c.y) <= c.r) return c;
    return null;
}

// ─── Gerador de mapa (mesma seed do cliente: 42) ────────────────────────────
let mapSeed = 42;
function srand(){ mapSeed = (mapSeed*9301+49297)%233280; return mapSeed/233280; }
function genMap(){
    const m = Array.from({length:M_H}, () => new Uint8Array(M_W));
    for (let x=0;x<M_W;x++){ m[0][x]=T.TREE; m[M_H-1][x]=T.TREE; }
    for (let y=0;y<M_H;y++){ m[y][0]=T.TREE; m[y][M_W-1]=T.TREE; }
    for (let i=0;i<320;i++){
        const x=2+Math.floor(srand()*(M_W-4));
        const y=2+Math.floor(srand()*(M_H-4));
        m[y][x]=T.TREE;
        if (y+1<M_H-1 && srand()<0.45) m[y+1][x]=T.TREE;
        if (x+1<M_W-1 && srand()<0.45) m[y][x+1]=T.TREE;
    }
    for (let i=0;i<6;i++){
        const cx=10+Math.floor(srand()*(M_W-20));
        const cy=10+Math.floor(srand()*(M_H-20));
        const r=2+Math.floor(srand()*5);
        for (let dy=-r;dy<=r;dy++)
            for (let dx=-r;dx<=r;dx++)
                if (dx*dx+dy*dy<=r*r){
                    const nx=cx+dx,ny=cy+dy;
                    if (nx>0&&ny>0&&nx<M_W-1&&ny<M_H-1) m[ny][nx]=T.WATER;
                }
    }
    const py=Math.floor(M_H/2), px=Math.floor(M_W/2);
    for (let x=1;x<M_W-1;x++){ if (m[py][x]!==T.WATER) m[py][x]=T.DIRT; if (m[py-1][x]!==T.WATER) m[py-1][x]=T.DIRT; }
    for (let y=1;y<M_H-1;y++){ if (m[y][px]!==T.WATER) m[y][px]=T.DIRT; if (m[y][px+1]!==T.WATER) m[y][px+1]=T.DIRT; }
    for (let i=0;i<10;i++){
        const sx=5+Math.floor(srand()*(M_W-12)), sy=5+Math.floor(srand()*(M_H-12));
        for (let dy=0;dy<3;dy++) for (let dx=0;dx<5;dx++)
            if (m[sy+dy][sx+dx]===T.GRASS) m[sy+dy][sx+dx]=T.STONE;
    }
    for (let y=1;y<32;y++) for (let x=1;x<M_W-1;x++){
        if (m[y][x]===T.GRASS && srand()<0.62) m[y][x]=T.SNOW;
    }
    for (let y=68;y<M_H-1;y++) for (let x=52;x<M_W-1;x++){
        if (m[y][x]===T.GRASS && srand()<0.58) m[y][x]=T.SAND;
    }
    for (let dy=-4;dy<=4;dy++) for (let dx=-4;dx<=4;dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 3) m[py+dy][px+dx]=T.STONE;
        else m[py+dy][px+dx]=T.DIRT;
    }
    for (const c of CAVES){
        for (let dy = -c.r-1; dy <= c.r+1; dy++){
            for (let dx = -c.r-1; dx <= c.r+1; dx++){
                const nx = c.x+dx, ny = c.y+dy;
                if (nx<=0 || ny<=0 || nx>=M_W-1 || ny>=M_H-1) continue;
                const cheby = Math.max(Math.abs(dx), Math.abs(dy));
                if (cheby <= c.r) m[ny][nx] = T.CAVE;
                else if (cheby === c.r+1 && m[ny][nx] !== T.WATER) m[ny][nx] = T.CAVE_WALL;
            }
        }
        m[c.y][c.x+c.r+1] = T.CAVE; m[c.y][c.x-c.r-1] = T.CAVE;
        m[c.y+c.r+1][c.x] = T.CAVE; m[c.y-c.r-1][c.x] = T.CAVE;
    }
    return m;
}
const map = genMap();
function tileAt(x, y){
    if (x<0 || y<0 || x>=M_W || y>=M_H) return T.TREE;
    return map[y][x];
}
function isWalkable(x, y){ return walkable(tileAt(x, y)); }
const blocksLineOfSight = t => t===T.TREE || t===T.CAVE_WALL;
// Bresenham — true se caminho (x1,y1) → (x2,y2) está livre de obstáculos.
// Endpoints ignorados. Limite duro de iterações pra evitar loop em coords inválidas.
function hasLineOfSight(x1, y1, x2, y2){
    if (x1 === x2 && y1 === y2) return true;
    let dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1, y = y1;
    const maxSteps = Math.max(M_W, M_H) + 4;   // cobre diagonal completa do mapa
    for (let i = 0; i < maxSteps; i++){
        const e2 = 2*err;
        if (e2 > -dy){ err -= dy; x += sx; }
        if (e2 <  dx){ err += dx; y += sy; }
        if (x === x2 && y === y2) return true;
        if (blocksLineOfSight(tileAt(x, y))) return false;
    }
    return false;  // não conseguiu chegar — coord fora do mapa, etc
}
function broadcast(except, msg){
    const data = JSON.stringify(msg);
    for (const p of players.values()){
        if (p.id === except) continue;
        if (p.ws.readyState === 1) p.ws.send(data);
    }
}

// Mensagens do servidor pra todos — levels: 'info' | 'warn' | 'event' | 'admin'
function broadcastMsg(level, text, fromName){
    const out = { t:'serverMsg', level, text: String(text).substring(0, 280) };
    if (fromName) out.from = fromName;
    broadcast(null, out);
    console.log(`[msg ${level}]${fromName?' '+fromName+':':''} ${text}`);
}
function sendTo(id, msg){
    const p = players.get(id);
    if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}
function snapshotPlayers(){
    return Array.from(players.values()).map(p => ({
        id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:!!p.pvp,
        hp:p.hp ?? 100, maxHp:p.maxHp ?? 100,
        mp:p.mp ?? 0, maxMp:p.maxMp ?? 0,
        cosmetic: p.cosmetic || null,
        ghost: !!p.disconnected,
    }));
}
function mobAt(x, y){
    for (const m of monsters.values()) if (m.x === x && m.y === y && m.hp > 0) return m;
    return null;
}
function playerAt(x, y){
    for (const p of players.values()){
        if (p.disconnected) continue;
        if (p.x === x && p.y === y) return p;
    }
    return null;
}
// Empurra mob 1 tile pro lado se ele acabou ficando em cima de player (race condition
// entre tickAI do server e movimento client-authoritative).
function bumpMobAwayFrom(x, y){
    const m = mobAt(x, y);
    if (!m) return;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const [dx, dy] of dirs){
        const nx = m.x + dx, ny = m.y + dy;
        if (nx < 1 || ny < 1 || nx >= M_W-1 || ny >= M_H-1) continue;
        if (!isWalkable(nx, ny)) continue;
        if (inSafe(nx, ny)) continue;
        if (mobAt(nx, ny)) continue;
        if (playerAt(nx, ny)) continue;
        m.x = nx; m.y = ny;
        return;
    }
}
function spawnMob(type, x, y){
    const def = MTYPE[type];
    if (!def) return null;
    // Bosses escalam por nível (cap 10): hp x(1+0.15k), dmg x(1+0.10k), xp x(1+0.20k) com k = lvl-1
    const level = def.unique ? Math.max(1, Math.min(BOSS_LEVEL_CAP, bossLevel.get(type) || 1)) : 1;
    const k = level - 1;
    const hp  = def.unique ? Math.round(def.hp  * (1 + k * 0.15)) : def.hp;
    const dmg = def.unique ? Math.round(def.dmg * (1 + k * 0.10)) : def.dmg;
    const xp  = def.unique ? Math.round(def.xp  * (1 + k * 0.20)) : def.xp;
    const m = {
        id: nextMobId++, type, x, y, dir:'down',
        hp, maxHp: hp, dmg, speed: def.speed, xp,
        aggro: def.aggro, unique: !!def.unique,
        level,
        intel: def.intel || 1,
        lastMoveAt: 0, lastAttackAt: 0,
    };
    monsters.set(m.id, m);
    return m;
}

// ─── Spawn inicial ──────────────────────────────────────────────────────────
function spawnInitial(){
    monsters.clear();
    nextMobId = 1;
    // Rings
    for (const ring of SPAWN_RINGS){
        let placed = 0;
        for (let tries = 0; placed < ring.target && tries < 500; tries++){
            const x = 5 + Math.floor(Math.random() * (M_W - 10));
            const y = 5 + Math.floor(Math.random() * (M_H - 10));
            if (!isWalkable(x, y)) continue;
            if (inSafe(x, y) || inCave(x, y) || mobAt(x, y)) continue;
            const d = manhattan(x, y, M_W/2, M_H/2);
            if (d < ring.min || d >= ring.max) continue;
            spawnMob(ring.types[Math.floor(Math.random() * ring.types.length)], x, y);
            placed++;
        }
    }
    // Caves
    for (const cave of CAVES){
        let placed = 0;
        for (let tries = 0; placed < cave.target && tries < 300; tries++){
            const dx = Math.floor(Math.random() * (cave.r*2+1)) - cave.r;
            const dy = Math.floor(Math.random() * (cave.r*2+1)) - cave.r;
            const x = cave.x + dx, y = cave.y + dy;
            if (x<2||y<2||x>=M_W-2||y>=M_H-2) continue;
            if (tileAt(x, y) !== T.CAVE) continue;  // só piso de caverna
            if (mobAt(x, y)) continue;
            spawnMob(cave.types[Math.floor(Math.random() * cave.types.length)], x, y);
            placed++;
        }
    }
    // Biomas
    for (const b of BIOME_SPAWNS){
        let placed = 0;
        for (let tries = 0; placed < b.target && tries < 500; tries++){
            const x = 5 + Math.floor(Math.random() * (M_W - 10));
            const y = 5 + Math.floor(Math.random() * (M_H - 10));
            if (!b.inBounds(x, y)) continue;
            if (!isWalkable(x, y)) continue;
            if (inSafe(x, y) || inCave(x, y) || mobAt(x, y)) continue;
            spawnMob(b.types[Math.floor(Math.random() * b.types.length)], x, y);
            placed++;
        }
    }
    // Bosses
    for (const b of BOSSES) if (!monsters.has(b.type)) spawnMob(b.type, b.x, b.y);
    console.log(`[world] ${monsters.size} mobs spawnados`);
}

// ─── Respawn dinâmico ───────────────────────────────────────────────────────
function tickRespawns(){
    // Bosses por timer
    const now = Date.now();
    for (const b of BOSSES){
        const has = Array.from(monsters.values()).some(m => m.type === b.type);
        if (!has){
            const deathAt = bossDeath.get(b.type) || 0;
            if (now - deathAt >= b.respawn){
                const mob = spawnMob(b.type, b.x, b.y);
                bossDeath.delete(b.type);
                const baseName = b.type === 'ORC_LIDER' ? 'O Orc Líder' : b.type === 'DRAKE_LIDER' ? 'O Drake Ancião' : 'O Golem Rei';
                const lvlTag = mob && mob.level > 1 ? ` ★ Lv${mob.level}` : '';
                broadcastMsg('event', `⚔ ${baseName}${lvlTag} reapareceu!`);
            }
        }
    }
    // Reposição: rings/caves/biomas — até 3 mobs por região por tick quando déficit alto
    function tooClose(x, y, dist){
        for (const p of players.values()){
            if (p.disconnected) continue;
            if (chebyshev(p.x, p.y, x, y) < dist) return true;
        }
        return false;
    }
    // Rings
    for (const ring of SPAWN_RINGS){
        const count = Array.from(monsters.values()).filter(m => {
            const d = manhattan(m.x, m.y, M_W/2, M_H/2);
            return d >= ring.min && d < ring.max && ring.types.includes(m.type);
        }).length;
        const deficit = ring.target - count;
        if (deficit <= 0) continue;
        const burst = Math.min(deficit, 3);  // até 3 spawns por tick por ring
        for (let placed = 0; placed < burst; placed++){
            for (let tries = 0; tries < 80; tries++){
                const x = 5 + Math.floor(Math.random() * (M_W - 10));
                const y = 5 + Math.floor(Math.random() * (M_H - 10));
                if (!isWalkable(x, y)) continue;
                if (inSafe(x, y) || inCave(x, y) || mobAt(x, y)) continue;
                const d = manhattan(x, y, M_W/2, M_H/2);
                if (d < ring.min || d >= ring.max) continue;
                if (tooClose(x, y, 8)) continue;
                spawnMob(ring.types[Math.floor(Math.random() * ring.types.length)], x, y);
                break;
            }
        }
    }
    // Caves
    for (const cave of CAVES){
        const count = Array.from(monsters.values()).filter(m =>
            chebyshev(m.x, m.y, cave.x, cave.y) <= cave.r && cave.types.includes(m.type)
        ).length;
        const deficit = cave.target - count;
        if (deficit <= 0) continue;
        const burst = Math.min(deficit, 2);
        for (let placed = 0; placed < burst; placed++){
            for (let tries = 0; tries < 100; tries++){
                const dx = Math.floor(Math.random() * (cave.r*2+1)) - cave.r;
                const dy = Math.floor(Math.random() * (cave.r*2+1)) - cave.r;
                const x = cave.x + dx, y = cave.y + dy;
                if (x<2||y<2||x>=M_W-2||y>=M_H-2) continue;
                if (tileAt(x, y) !== T.CAVE) continue;
                if (mobAt(x, y)) continue;
                if (tooClose(x, y, 5)) continue;
                spawnMob(cave.types[Math.floor(Math.random() * cave.types.length)], x, y);
                break;
            }
        }
    }
    // Biomas
    for (const b of BIOME_SPAWNS){
        const count = Array.from(monsters.values()).filter(m =>
            b.inBounds(m.x, m.y) && b.types.includes(m.type)
        ).length;
        const deficit = b.target - count;
        if (deficit <= 0) continue;
        const burst = Math.min(deficit, 2);
        for (let placed = 0; placed < burst; placed++){
            for (let tries = 0; tries < 100; tries++){
                const x = 5 + Math.floor(Math.random() * (M_W - 10));
                const y = 5 + Math.floor(Math.random() * (M_H - 10));
                if (!b.inBounds(x, y)) continue;
                if (!isWalkable(x, y)) continue;
                if (inSafe(x, y) || inCave(x, y) || mobAt(x, y)) continue;
                if (tooClose(x, y, 8)) continue;
                spawnMob(b.types[Math.floor(Math.random() * b.types.length)], x, y);
                break;
            }
        }
    }
}

// ─── Tick AI ────────────────────────────────────────────────────────────────
const TICK_AI_MS = 300;
const ATTACK_CD_MS = 1100;
// Pega vaga adjacente ao player que melhor espalhe os mobs (intel >=2 cerca,
// intel 3 prefere flanco atrás do player). Retorna {x,y} ou null se nada livre.
function pickSurroundSlot(m, target){
    const intel = m.intel || 1;
    const slots = [];
    for (let dy = -1; dy <= 1; dy++){
        for (let dx = -1; dx <= 1; dx++){
            if (!dx && !dy) continue;
            const x = target.x + dx, y = target.y + dy;
            if (x < 1 || y < 1 || x >= M_W-1 || y >= M_H-1) continue;
            if (!isWalkable(x, y)) continue;
            if (inSafe(x, y)) continue;
            const occ = mobAt(x, y);
            if (occ && occ !== m) continue;
            if (playerAt(x, y)) continue;
            const d = Math.max(Math.abs(m.x - x), Math.abs(m.y - y));
            let score = d;
            // intel >=2: penaliza vagas perto de outros mobs (espalha)
            if (intel >= 2){
                let cluster = 0;
                for (const om of monsters.values()){
                    if (om === m || om.hp <= 0) continue;
                    const od = Math.max(Math.abs(om.x - x), Math.abs(om.y - y));
                    if (od <= 1) cluster++;
                }
                score += cluster * 0.8;
            }
            // intel 3: flanco — atrás do player (oposto à direção)
            if (intel >= 3){
                const back = {'up':[0,1],'down':[0,-1],'left':[1,0],'right':[-1,0]}[target.dir] || [0,0];
                if (Math.sign(dx) === back[0] && Math.sign(dy) === back[1]) score -= 2.0;
                else if (Math.sign(dx) === back[0] || Math.sign(dy) === back[1]) score -= 0.8;
            }
            // tiebreak determinístico por id (mob não fica oscilando)
            const tiebreak = ((m.id * 31 + dx * 7 + dy * 11) % 100) / 1000;
            slots.push({ x, y, score: score + tiebreak });
        }
    }
    if (!slots.length) return null;
    slots.sort((a,b) => a.score - b.score);
    return slots[0];
}
function tickAI(){
    const now = Date.now();
    for (const m of monsters.values()){
        if (m.hp <= 0) continue;
        // procura player mais próximo em aggro range (ignora PZ e mini-PZ de NPC)
        let target = null, td = Infinity;
        for (const p of players.values()){
            if ((p.hp ?? 100) <= 0) continue;
            if (inSafe(p.x, p.y)) continue;
            if (playerNearNpc(p)) continue;   // mini-PZ ao redor de NPCs
            const d = chebyshev(m.x, m.y, p.x, p.y);
            if (d <= m.aggro && d < td){ target = p; td = d; }
        }
        if (!target) continue;
        // adjacente → atacar
        if (td <= 1){
            if (now - m.lastAttackAt >= ATTACK_CD_MS){
                m.lastAttackAt = now;
                if (target.ws.readyState === 1){
                    target.ws.send(JSON.stringify({ t:'mobHit', mobId:m.id, mobType:m.type, dmg:m.dmg }));
                }
            }
            continue;
        }
        // mover 1 tile em direção (respeita speed)
        // Anti-kite: sprint quando perseguindo a >1 tile (counter pra spear/arco)
        const effectiveSpeed = (td > 1) ? Math.floor(m.speed * 0.6) : m.speed;
        if (now - m.lastMoveAt < effectiveSpeed) continue;
        m.lastMoveAt = now;
        // Intel >=2 escolhe vaga adjacente ao player (cerca + flanco); intel 1 vai direto
        let tx, ty;
        if ((m.intel || 1) >= 2){
            const slot = pickSurroundSlot(m, target);
            tx = slot ? slot.x : target.x;
            ty = slot ? slot.y : target.y;
        } else {
            tx = target.x; ty = target.y;
        }
        const dx = Math.sign(tx - m.x);
        const dy = Math.sign(ty - m.y);
        const candidates = [
            [m.x+dx, m.y+dy],
            [m.x+dx, m.y],
            [m.x,    m.y+dy],
        ];
        for (const [nx, ny] of candidates){
            if (nx < 1 || ny < 1 || nx >= M_W-1 || ny >= M_H-1) continue;
            if (!isWalkable(nx, ny)) continue;
            if (inSafe(nx, ny)) continue;
            if (mobAt(nx, ny)) continue;
            if (playerAt(nx, ny)) continue;   // não entra no tile de player
            m.x = nx; m.y = ny;
            m.dir = dy > 0 ? 'down' : dy < 0 ? 'up' : dx > 0 ? 'right' : 'left';
            break;
        }
    }
}

// ─── Snapshots ──────────────────────────────────────────────────────────────
const SNAPSHOT_MS = 250;
function snapshotMobs(){
    return Array.from(monsters.values()).map(m => ({
        id:m.id, type:m.type, x:m.x, y:m.y, dir:m.dir, hp:m.hp, maxHp:m.maxHp, unique:!!m.unique,
        level: m.level || 1,
        dots: (m.dots && m.dots.length) ? m.dots.map(d => ({ type:d.type })) : undefined,
    }));
}
function broadcastMobs(){
    const data = JSON.stringify({ t:'mobs', list: snapshotMobs() });
    for (const p of players.values()){
        if (p.ws.readyState === 1) p.ws.send(data);
    }
}

// ─── Guilds ────────────────────────────────────────────────────────────────
// Persiste em state.json. Estrutura: { name, leader, members:[names], createdAt }
const guilds = new Map();   // name → guild
const guildInvites = new Map();  // toName → { guildName, fromName, expiresAt }
function findGuildOfPlayer(name){
    for (const g of guilds.values()) if (g.members.includes(name)) return g;
    return null;
}
function handleGuildCommand(p, text, sendToFn, broadcastFn){
    const parts = text.split(/\s+/);
    const sub = (parts[1] || '').toLowerCase();
    const arg = parts.slice(2).join(' ').trim();
    const myGuild = findGuildOfPlayer(p.name);
    if (sub === 'create'){
        if (myGuild){ sendToFn({ t:'serverMsg', level:'warn', text:'Você já está numa guild.' }); return; }
        const name = arg.substring(0, 16);
        if (!/^[A-Za-z0-9_-]{3,16}$/.test(name)){
            sendToFn({ t:'serverMsg', level:'warn', text:'Nome inválido. 3-16 chars, letras/números/_/-.' });
            return;
        }
        if (guilds.has(name)){ sendToFn({ t:'serverMsg', level:'warn', text:'Já existe guild com esse nome.' }); return; }
        guilds.set(name, { name, leader: p.name, members: [p.name], createdAt: Date.now() });
        sendToFn({ t:'serverMsg', level:'event', text:`✦ Guild "${name}" criada! Você é o líder.` });
        broadcastFn(null, { t:'guildUpdate', name, members:[p.name], leader: p.name });
        return;
    }
    if (sub === 'invite'){
        if (!myGuild){ sendToFn({ t:'serverMsg', level:'warn', text:'Você não tem guild.' }); return; }
        if (myGuild.leader !== p.name){ sendToFn({ t:'serverMsg', level:'warn', text:'Só o líder convida.' }); return; }
        if (!arg){ sendToFn({ t:'serverMsg', level:'warn', text:'Uso: /guild invite NOME' }); return; }
        guildInvites.set(arg, { guildName: myGuild.name, fromName: p.name, expiresAt: Date.now() + 60_000 });
        // Avisa o alvo se online
        for (const pp of players.values()){
            if (!pp.disconnected && pp.name.toLowerCase() === arg.toLowerCase() && pp.ws.readyState === 1){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'event', text:`👥 ${p.name} convidou você pra guild "${myGuild.name}". Use /guild join` }));
                break;
            }
        }
        sendToFn({ t:'serverMsg', level:'info', text:`Convite enviado pra ${arg} (60s).` });
        return;
    }
    if (sub === 'join'){
        if (myGuild){ sendToFn({ t:'serverMsg', level:'warn', text:'Você já está numa guild.' }); return; }
        const inv = guildInvites.get(p.name);
        if (!inv || inv.expiresAt < Date.now()){
            sendToFn({ t:'serverMsg', level:'warn', text:'Sem convites pendentes.' });
            return;
        }
        const g = guilds.get(inv.guildName);
        if (!g){ sendToFn({ t:'serverMsg', level:'warn', text:'Guild não existe mais.' }); guildInvites.delete(p.name); return; }
        g.members.push(p.name);
        guildInvites.delete(p.name);
        sendToFn({ t:'serverMsg', level:'event', text:`✦ Você entrou na guild "${g.name}"!` });
        // Notifica membros online
        for (const pp of players.values()){
            if (pp.ws.readyState === 1 && g.members.includes(pp.name) && pp.name !== p.name){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text:`👥 ${p.name} entrou na guild.` }));
            }
        }
        broadcastFn(null, { t:'guildUpdate', name: g.name, members: g.members, leader: g.leader });
        return;
    }
    if (sub === 'leave'){
        if (!myGuild){ sendToFn({ t:'serverMsg', level:'warn', text:'Você não tem guild.' }); return; }
        myGuild.members = myGuild.members.filter(n => n !== p.name);
        // Se era líder e ainda tem membros: passa pra próximo
        if (myGuild.leader === p.name){
            if (myGuild.members.length === 0){
                guilds.delete(myGuild.name);
                broadcastFn(null, { t:'guildUpdate', name: myGuild.name, deleted: true });
            } else {
                myGuild.leader = myGuild.members[0];
            }
        }
        sendToFn({ t:'serverMsg', level:'info', text:`Você saiu da guild "${myGuild.name}".` });
        // Avisa restantes online
        for (const pp of players.values()){
            if (pp.ws.readyState === 1 && myGuild.members.includes(pp.name)){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text:`👥 ${p.name} saiu da guild.` }));
            }
        }
        if (guilds.has(myGuild.name)){
            broadcastFn(null, { t:'guildUpdate', name: myGuild.name, members: myGuild.members, leader: myGuild.leader });
        }
        return;
    }
    if (sub === 'info' || sub === ''){
        if (!myGuild){ sendToFn({ t:'serverMsg', level:'info', text:'Sem guild. Use /guild create NOME ou /guild join (após convite).' }); return; }
        sendToFn({ t:'serverMsg', level:'info', text:`📜 ${myGuild.name} — líder: ${myGuild.leader} — membros (${myGuild.members.length}): ${myGuild.members.join(', ')}` });
        return;
    }
    if (sub === 'list'){
        if (!guilds.size){ sendToFn({ t:'serverMsg', level:'info', text:'Nenhuma guild ainda.' }); return; }
        const lines = Array.from(guilds.values()).map(g => `${g.name} (${g.members.length})`);
        sendToFn({ t:'serverMsg', level:'info', text:'Guilds: ' + lines.join(', ') });
        return;
    }
    sendToFn({ t:'serverMsg', level:'warn', text:'Subcomandos: create NOME, invite NOME, join, leave, info, list' });
}

// ─── Trade ativo entre 2 players ───────────────────────────────────────────
const trades = new Map();   // tradeId → { aId, bId, aOffer, bOffer, aConfirm, bConfirm, createdAt }
function cancelTrade(trade, reason){
    if (!trade) return;
    const a = players.get(trade.aId);
    const b = players.get(trade.bId);
    if (a && a.ws.readyState === 1) a.ws.send(JSON.stringify({ t:'tradeCancelled', reason }));
    if (b && b.ws.readyState === 1) b.ws.send(JSON.stringify({ t:'tradeCancelled', reason }));
    trades.delete(trade.id);
    if (a) a.tradeId = null;
    if (b) b.tradeId = null;
}
// Limpa trades parados ou desconectados a cada 30s
setInterval(() => {
    const now = Date.now();
    for (const trade of Array.from(trades.values())){
        if (now - trade.createdAt > 5*60*1000){ cancelTrade(trade, 'timeout 5min'); continue; }
        const a = players.get(trade.aId);
        const b = players.get(trade.bId);
        if (!a || !b || a.disconnected || b.disconnected){ cancelTrade(trade, 'desconexão'); continue; }
        if (chebyshev(a.x, a.y, b.x, b.y) > 5){ cancelTrade(trade, 'longe demais'); continue; }
    }
}, 30000);

// ─── Ranking público (acumula por nome do player) ──────────────────────────
const rankings = new Map();   // name → { mobKills, pkKills, bossKills, gold }
function ensureRanking(name){
    if (!name) return null;
    let r = rankings.get(name);
    if (!r){ r = { mobKills:0, pkKills:0, bossKills:0, gold:0 }; rankings.set(name, r); }
    return r;
}
function topRanking(field, limit){
    return Array.from(rankings.entries())
        .map(([name, r]) => ({ name, value: r[field] || 0 }))
        .filter(e => e.value > 0)
        .sort((a,b) => b.value - a.value)
        .slice(0, limit);
}

// ─── Persistência (state.json) ─────────────────────────────────────────────
function saveStateToDisk(){
    const snap = {
        v: 1,
        savedAt: Date.now(),
        lastResetDay,
        nextMobId,
        bossLevel: Array.from(bossLevel.entries()),
        bossDeath: Array.from(bossDeath.entries()),
        megaBoss: { spawnedAt: megaBoss.spawnedAt, lastResolvedAt: megaBoss.lastResolvedAt },
        rankings: Array.from(rankings.entries()),
        guilds: Array.from(guilds.values()),
        monsters: Array.from(monsters.values()).map(m => ({
            id:m.id, type:m.type, x:m.x, y:m.y, dir:m.dir,
            hp:m.hp, maxHp:m.maxHp, dmg:m.dmg, speed:m.speed, xp:m.xp,
            aggro:m.aggro, unique:m.unique, level:m.level,
        })),
    };
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(snap), 'utf8');
    } catch(e){
        console.error('[state] erro ao salvar:', e.message);
    }
}
function loadStateFromDisk(){
    if (!fs.existsSync(STATE_FILE)) return false;
    try {
        const d = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (!d || d.v !== 1) return false;
        if (d.lastResetDay) lastResetDay = d.lastResetDay;
        if (typeof d.nextMobId === 'number') nextMobId = d.nextMobId;
        if (Array.isArray(d.bossLevel)) for (const [k,v] of d.bossLevel) bossLevel.set(k, v);
        if (Array.isArray(d.bossDeath)) for (const [k,v] of d.bossDeath) bossDeath.set(k, v);
        if (d.megaBoss){
            megaBoss.spawnedAt = d.megaBoss.spawnedAt || 0;
            megaBoss.lastResolvedAt = d.megaBoss.lastResolvedAt || 0;
        }
        if (Array.isArray(d.rankings)){
            for (const [name, r] of d.rankings) rankings.set(name, r);
        }
        if (Array.isArray(d.guilds)){
            for (const g of d.guilds) if (g && g.name) guilds.set(g.name, g);
        }
        monsters.clear();
        if (Array.isArray(d.monsters)){
            for (const m of d.monsters){
                monsters.set(m.id, {
                    id:m.id, type:m.type, x:m.x, y:m.y, dir:m.dir||'down',
                    hp:m.hp, maxHp:m.maxHp, dmg:m.dmg, speed:m.speed, xp:m.xp,
                    aggro:m.aggro, unique:!!m.unique, level:m.level||1,
                    intel: m.intel || (MTYPE[m.type]?.intel || 1),  // backfill saves antigos
                    lastMoveAt: 0, lastAttackAt: 0,
                });
            }
        }
        const ageMs = Date.now() - (d.savedAt || 0);
        console.log(`[state] carregado de disco — ${monsters.size} mobs, salvo há ${(ageMs/60000).toFixed(1)}min`);
        return true;
    } catch(e){
        console.error('[state] erro ao carregar:', e.message);
        return false;
    }
}

// ─── Contas + save server-side (accounts.json no Volume) ──────────────────
// Auth: cliente manda `pwHash` (hash leve da senha). Server aplica sha256(salt+hash)
// e armazena. Save do player vive aqui, sobrevive a troca de PC / limpeza de
// browser. localStorage do cliente fica como cache/offline-fallback.
const crypto = require('crypto');
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE_PATH
    || (process.env.STATE_FILE_PATH
        ? path.join(path.dirname(process.env.STATE_FILE_PATH), 'accounts.json')
        : path.join(__dirname, 'accounts.json'));
const ACCOUNTS_SALT = process.env.ACCOUNTS_SALT || 'valadares-v1-salt';
const SAVE_THROTTLE_MS = 5 * 1000;
const SAVE_MAX_BYTES = 200 * 1024;   // 200KB por save é folgado pro JSON atual

const accounts = new Map();   // nameLower -> { name, pwHash, save, savedAt, createdAt }

function hashPwServer(clientHash){
    return crypto.createHash('sha256').update(ACCOUNTS_SALT + ':' + String(clientHash || '')).digest('hex');
}
function validAccountName(n){
    return typeof n === 'string' && n.length >= 1 && n.length <= 14 && /^[A-Za-z0-9_\- ]+$/.test(n);
}
function getAccount(name){ return accounts.get(String(name || '').toLowerCase()); }
function createAccount(name, clientHash){
    const a = { name, pwHash: hashPwServer(clientHash), save: null, savedAt: 0, createdAt: Date.now() };
    accounts.set(name.toLowerCase(), a);
    queueSaveAccounts();
    return a;
}
function verifyAccount(name, clientHash){
    const a = getAccount(name);
    if (!a) return false;
    return a.pwHash === hashPwServer(clientHash);
}
function setPlayerSave(name, data){
    const a = getAccount(name);
    if (!a) return false;
    a.save = data;
    a.savedAt = Date.now();
    queueSaveAccounts();
    return true;
}
let _accountsSaveTimer = null;
function flushAccounts(){
    try {
        const out = { v:1, savedAt: Date.now(), accounts: Array.from(accounts.values()) };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(out), 'utf8');
    } catch(e){ console.error('[accounts] erro ao salvar:', e.message); }
}
function queueSaveAccounts(){
    if (_accountsSaveTimer) return;
    _accountsSaveTimer = setTimeout(() => { _accountsSaveTimer = null; flushAccounts(); }, 2000);
}
function loadAccountsFromDisk(){
    if (!fs.existsSync(ACCOUNTS_FILE)) return;
    try {
        const d = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
        if (!d || d.v !== 1) return;
        if (Array.isArray(d.accounts)){
            for (const a of d.accounts){
                if (a && a.name && a.pwHash) accounts.set(a.name.toLowerCase(), a);
            }
        }
        console.log(`[accounts] ${accounts.size} contas carregadas de disco`);
    } catch(e){ console.error('[accounts] erro ao carregar:', e.message); }
}
loadAccountsFromDisk();

// Inicia mundo
let lastResetDay = new Date().toDateString();
if (!loadStateFromDisk()) spawnInitial();
setInterval(saveStateToDisk, STATE_SAVE_INTERVAL_MS);
process.on('SIGINT',  () => { saveStateToDisk(); flushAccounts(); console.log('[state] salvo ao sair (SIGINT)'); process.exit(0); });
process.on('SIGTERM', () => { saveStateToDisk(); flushAccounts(); console.log('[state] salvo ao sair (SIGTERM)'); process.exit(0); });
setInterval(tickAI, TICK_AI_MS);
setInterval(broadcastMobs, SNAPSHOT_MS);
setInterval(tickRespawns, 1000);

// Resolve a morte de um mob (extração da lógica do attackMob handler) —
// reutilizado pra mortes por DoT (veneno/sangra/fogo).
function handleMobDeath(m, killerId){
    if (m.unique){
        if (m.type === MEGA_BOSS_TYPE){
            const killer = players.get(killerId);
            if (killer) handleMegaBossDeath(killer, m);
        } else {
            bossDeath.set(m.type, Date.now());
            const cur = bossLevel.get(m.type) || 1;
            const next = Math.min(BOSS_LEVEL_CAP, cur + 1);
            bossLevel.set(m.type, next);
            console.log(`[boss] ${m.type} morto (Lv${cur}) por DoT/killer=${killerId} → próximo Lv${next}`);
            saveStateToDisk();
            checkMegaBossSpawn();
        }
    }
    monsters.delete(m.id);
    const killer = players.get(killerId);
    if (killer && killer.ws.readyState === 1){
        killer.ws.send(JSON.stringify({ t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level }));
    }
    broadcast(killerId, { t:'mobDead', mobId:m.id, byName: killer?.name || '?', level: m.level });
    if (killer){
        const r = ensureRanking(killer.name);
        if (r){
            r.mobKills = (r.mobKills || 0) + 1;
            if (m.unique) r.bossKills = (r.bossKills || 0) + 1;
        }
    }
}

// Ticka DoTs em mobs (veneno/sangra/fogo). Roda a cada 1s, processa dots
// expirados, aplica dano, broadcasta updates+floats.
const DOT_TICK_INTERVAL_MS = 3000;
function tickMobDots(){
    const now = Date.now();
    const updates = [];
    const floats  = [];
    const dotColor = { poison:'#74d176', bleed:'#cc3030', burn:'#ff8030' };
    for (const m of monsters.values()){
        if (!m.dots || !m.dots.length || m.hp <= 0) continue;
        let touched = false;
        for (let i = m.dots.length - 1; i >= 0; i--){
            const d = m.dots[i];
            if (now < d.nextTickAt) continue;
            const dmg = d.dmg;
            m.hp = Math.max(0, m.hp - dmg);
            floats.push({ mobId: m.id, text: `-${dmg}`, color: dotColor[d.type] || '#aaa' });
            d.ticksLeft--;
            if (d.ticksLeft <= 0) m.dots.splice(i, 1);
            else d.nextTickAt = now + DOT_TICK_INTERVAL_MS;
            touched = true;
            if (m.hp === 0){
                // Morte por DoT — quem aplicou o último dot ganha kill
                const killerId = d.byId;
                updates.push({ id: m.id, hp: 0, maxHp: m.maxHp });
                if (floats.length){
                    const payload = JSON.stringify({ t:'mobBatch', updates, floats });
                    for (const p of players.values()){
                        if (p.ws.readyState === 1) p.ws.send(payload);
                    }
                }
                handleMobDeath(m, killerId);
                break;
            }
        }
        if (touched && m.hp > 0) updates.push({ id: m.id, hp: m.hp, maxHp: m.maxHp });
    }
    if (!updates.length && !floats.length) return;
    const payload = JSON.stringify({ t:'mobBatch', updates, floats });
    for (const p of players.values()){
        if (p.ws.readyState === 1) p.ws.send(payload);
    }
}
setInterval(tickMobDots, 1000);

// ─── Evento semanal: O Arauto (sábado 20h-22h BRT) ─────────────────────────
const EVENT_BOSS_TYPE = 'ARAUTO';
const EVENT_BOSS_POS = { x: 50, y: 65 };
let eventBossId = null;
function isEventWindow(){
    // BRT = UTC-3. Server roda UTC.
    const brt = new Date(Date.now() - 3*60*60*1000);
    const day = brt.getUTCDay();    // 0=dom 6=sáb
    const hour = brt.getUTCHours();
    return day === 6 && hour >= 20 && hour < 22;
}
function tickEvent(){
    if (isEventWindow()){
        const stillAlive = eventBossId && monsters.has(eventBossId) && monsters.get(eventBossId).hp > 0;
        if (!stillAlive){
            const m = spawnMob(EVENT_BOSS_TYPE, EVENT_BOSS_POS.x, EVENT_BOSS_POS.y);
            if (m){
                eventBossId = m.id;
                broadcastMsg('event', `⚔ O Arauto apareceu! (${EVENT_BOSS_POS.x},${EVENT_BOSS_POS.y}) — Mata em 2h ou ele some.`);
                console.log('[event] Arauto spawnado');
            }
        }
    } else {
        if (eventBossId && monsters.has(eventBossId)){
            const m = monsters.get(eventBossId);
            if (m && m.hp > 0){
                monsters.delete(eventBossId);
                broadcast(null, { t:'mobDead', mobId: eventBossId, byName:'evento encerrou', level: 1 });
                broadcastMsg('warn', '⏳ O Arauto desapareceu (evento encerrou).');
                console.log('[event] Arauto despawnado');
            }
            eventBossId = null;
        }
    }
}
setInterval(tickEvent, 60_000);
setTimeout(tickEvent, 5_000);   // primeiro check 5s após boot

// Boss heal Lv3+ — regen lento pra bosses upados (2% maxHp + 0.5% por lvl, cap 5%)
// Bundle: 1 broadcast por player com lista de updates+floats em vez de 2N msgs
function tickBossHeal(){
    const updates = [];
    const floats  = [];
    for (const m of monsters.values()){
        if (!m.unique || m.hp <= 0) continue;
        const lvl = m.level || 1;
        if (lvl < 3) continue;
        if (m.hp >= m.maxHp) continue;
        const pct = Math.min(0.05, 0.02 + (lvl - 3) * 0.005);
        const heal = Math.max(1, Math.round(m.maxHp * pct));
        m.hp = Math.min(m.maxHp, m.hp + heal);
        updates.push({ id:m.id, hp:m.hp, maxHp:m.maxHp });
        floats.push({ mobId:m.id, text:`+${heal}`, color:'#74d176' });
    }
    if (!updates.length) return;
    const payload = JSON.stringify({ t:'mobBatch', updates, floats });
    for (const p of players.values()){
        if (p.ws.readyState === 1) p.ws.send(payload);
    }
}
setInterval(tickBossHeal, 5000);

// ─── Reset diário (00:00) ──────────────────────────────────────────────────
function tickDailyReset(){
    const today = new Date().toDateString();
    if (today === lastResetDay) return;
    lastResetDay = today;
    // zera nível dos bosses e remove os atuais pra respawnar Lv1
    bossLevel.clear();
    bossDeath.clear();
    for (const m of Array.from(monsters.values())){
        if (m.unique) monsters.delete(m.id);
    }
    for (const b of BOSSES) spawnMob(b.type, b.x, b.y);
    broadcastMsg('event', '🌅 Novo dia em Valadares! Bosses voltaram ao Lv1.');
    console.log('[reset] daily reset — bosses Lv1');
}
setInterval(tickDailyReset, 60 * 1000);  // checa a cada minuto

// ─── ★★ MEGA BOSS — Senhor de Valadares ──────────────────────────────────
function allBossesAtMaxLevel(){
    for (const b of BOSSES){
        if ((bossLevel.get(b.type) || 1) < BOSS_LEVEL_CAP) return false;
    }
    return true;
}
function megaBossIsAlive(){
    if (!megaBoss.spawnedAt) return false;
    for (const m of monsters.values()) if (m.type === MEGA_BOSS_TYPE) return true;
    return false;
}
function checkMegaBossSpawn(){
    if (megaBoss.spawnedAt) return;  // já tá vivo
    if (!allBossesAtMaxLevel()) return;
    if (Date.now() - megaBoss.lastResolvedAt < MEGA_BOSS_COOLDOWN_MS) return;
    // Spawn!
    const m = spawnMob(MEGA_BOSS_TYPE, MEGA_BOSS_POS.x, MEGA_BOSS_POS.y);
    if (!m) return;
    megaBoss.spawnedAt = Date.now();
    saveStateToDisk();
    broadcastMsg('event', `⚡ O Senhor de Valadares despertou em (${MEGA_BOSS_POS.x}, ${MEGA_BOSS_POS.y})! Você tem 30 minutos.`);
    console.log(`[mega] Senhor de Valadares spawnado @ ${MEGA_BOSS_POS.x},${MEGA_BOSS_POS.y}`);
}
function handleMegaBossDeath(killer, mob){
    const survivedMs = Date.now() - megaBoss.spawnedAt;
    megaBoss.spawnedAt = 0;
    megaBoss.lastResolvedAt = Date.now();
    // Reset bossLevel de todos pra Lv1
    bossLevel.clear();
    bossDeath.clear();
    for (const b of BOSSES){
        // Remove versões antigas e spawna Lv1
        for (const x of Array.from(monsters.values())) if (x.type === b.type) monsters.delete(x.id);
        spawnMob(b.type, b.x, b.y);
    }
    saveStateToDisk();
    broadcastMsg('event', `🏆 ${killer.name} derrotou O Senhor de Valadares em ${Math.floor(survivedMs/60000)}min! Bosses recomeçam no Lv1. Cooldown 24h.`);
    console.log(`[mega] Senhor morto por ${killer.name} (sobreviveu ${(survivedMs/1000).toFixed(0)}s) → bossLevel resetado`);
}
function tickMegaBoss(){
    if (!megaBoss.spawnedAt) return;
    const alive = megaBossIsAlive();
    const elapsed = Date.now() - megaBoss.spawnedAt;
    if (!alive){
        // morreu (já tratado por handleMegaBossDeath) — só limpa flag se ainda não foi
        if (megaBoss.spawnedAt){
            megaBoss.spawnedAt = 0;
            megaBoss.lastResolvedAt = Date.now();
        }
        return;
    }
    if (elapsed >= MEGA_BOSS_LIFETIME_MS){
        // Expirou — Senhor escapou
        for (const m of Array.from(monsters.values())) if (m.type === MEGA_BOSS_TYPE) monsters.delete(m.id);
        megaBoss.spawnedAt = 0;
        megaBoss.lastResolvedAt = Date.now();
        saveStateToDisk();
        broadcastMsg('warn', `💨 O Senhor de Valadares escapou de volta ao Vazio. Cooldown 24h.`);
        console.log('[mega] Senhor expirou (30min sem morrer)');
    }
}
setInterval(tickMegaBoss, 5000);

// ─── Ghosts (body stays) ───────────────────────────────────────────────────
function tickGhosts(){
    const now = Date.now();
    for (const [id, p] of players){
        if (!p.disconnected) continue;
        if (now - p.disconnectedAt < GHOST_TIMEOUT_MS) continue;
        players.delete(id);
        broadcast(null, { t:'leave', id });
        console.log(`[x] ghost ${id} (${p.name}) expirou`);
    }
}
setInterval(tickGhosts, 15 * 1000);

// ─── Conexões ───────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
    const id = nextId++;
    const p  = { ws, id, name:'Anônimo', x:50, y:50, dir:'down', hp:100, maxHp:100 };
    players.set(id, p);
    console.log(`[+] ${id} conectou (${players.size} online)`);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // ─── AUTH (precede join) ──────────────────────────────────────────
        // Cliente manda hash leve da senha; server aplica sha256(salt+hash).
        // Cria conta se não existir, devolve save server-side se houver.
        if (msg.t === 'auth') {
            const name = String(msg.name || '').trim().substring(0, 14);
            const pwHash = String(msg.pwHash || '');
            if (!validAccountName(name)){
                ws.send(JSON.stringify({ t:'authFail', reason:'bad_name' }));
                return;
            }
            if (!pwHash){
                ws.send(JSON.stringify({ t:'authFail', reason:'no_password' }));
                return;
            }
            let acc = getAccount(name);
            let isNew = false;
            if (!acc){
                acc = createAccount(name, pwHash);
                isNew = true;
                console.log(`[auth] nova conta: ${name}`);
            } else if (!verifyAccount(name, pwHash)){
                ws.send(JSON.stringify({ t:'authFail', reason:'bad_password' }));
                return;
            }
            p.authed = true;
            p.authedName = acc.name;
            ws.send(JSON.stringify({ t:'authOk', isNew, save: acc.save || null, savedAt: acc.savedAt || 0 }));
            return;
        }

        // ─── SAVE upload (snapshot do save do player) ─────────────────────
        if (msg.t === 'saveUpload') {
            if (!p.authed || !p.authedName) return;
            const now = Date.now();
            if (p.lastSaveAt && now - p.lastSaveAt < SAVE_THROTTLE_MS) return;
            const data = msg.data;
            if (!data || typeof data !== 'object') return;
            try {
                const sz = JSON.stringify(data).length;
                if (sz > SAVE_MAX_BYTES){
                    sendTo(id, { t:'serverMsg', level:'warn', text:`Save muito grande (${(sz/1024).toFixed(1)}KB) — não foi gravado.` });
                    return;
                }
            } catch { return; }
            p.lastSaveAt = now;
            setPlayerSave(p.authedName, data);
            return;
        }

        if (msg.t === 'join') {
            // Se o cliente passou pelo auth, força o nome da conta (impede impersonate)
            if (p.authed && p.authedName){
                p.name = p.authedName;
            } else {
                // Cliente legado (sem auth) — aceita pelo nome cru por compat, mas não persiste save
                p.name = String(msg.name || 'Anônimo').substring(0, 14);
                p.legacy = true;
            }
            p.x     = msg.x ?? 50;
            p.y     = msg.y ?? 50;
            p.pvp   = !!msg.pvp;
            p.hp    = msg.hp ?? 100;
            p.maxHp = msg.maxHp ?? 100;
            // Se já existe um ghost com mesmo nome → o player tá voltando, remove o corpo antigo
            for (const [oid, op] of players){
                if (oid === id) continue;
                if (op.disconnected && op.name === p.name){
                    players.delete(oid);
                    broadcast(null, { t:'leave', id: oid });
                    console.log(`    [merge] ghost antigo de ${p.name} (id ${oid}) removido — player voltou como id ${id}`);
                    break;
                }
            }
            console.log(`    ${id} = ${p.name}${isAdmin(p.name) ? ' [admin]' : ''}`);
            ws.send(JSON.stringify({
                t:'state', you: id,
                players: snapshotPlayers(),
                mobs: snapshotMobs(),
                motd: SERVER_MOTD_RUNTIME,
                isAdmin: isAdmin(p.name),
            }));
            broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp } });
            // Anuncia entrada (só pros outros)
            broadcast(id, { t:'serverMsg', level:'info', text:`✦ ${p.name} entrou em Valadares` });
            return;
        }

        if (msg.t === 'pos') {
            // Sanitiza/clampa coords antes de aceitar (cliente malicioso poderia
            // enviar {x:99999, y:99999} e quebrar tickAI/inCave/tileAt)
            const nx = Math.max(0, Math.min(M_W - 1, Math.floor(Number(msg.x)) || 0));
            const ny = Math.max(0, Math.min(M_H - 1, Math.floor(Number(msg.y)) || 0));
            p.x = nx; p.y = ny;
            p.dir = (typeof msg.dir === 'string' && msg.dir.length < 8) ? msg.dir : p.dir;
            if (typeof msg.hp === 'number' && isFinite(msg.hp)) p.hp = msg.hp;
            if (typeof msg.maxHp === 'number' && isFinite(msg.maxHp)) p.maxHp = msg.maxHp;
            // Se um mob acabou no mesmo tile (race com tickAI), empurra
            bumpMobAwayFrom(p.x, p.y);
            broadcast(id, { t:'pos', id, x:p.x, y:p.y, dir:p.dir, hp:p.hp, maxHp:p.maxHp });
            return;
        }

        if (msg.t === 'pvp') {
            p.pvp = !!msg.pvp;
            broadcast(null, { t:'pvp', id, pvp:p.pvp });
            return;
        }

        if (msg.t === 'float') {
            broadcast(id, { t:'float', id, text:msg.text, color:msg.color, big:!!msg.big });
            return;
        }

        // PvP entre players (vivo ou ghost)
        if (msg.t === 'pvpAttack') {
            const tgt = players.get(msg.targetId);
            if (!tgt || !p.pvp) return;
            if (!tgt.pvp && !tgt.disconnected) return;   // se vivo, precisa estar com PvP
            if (chebyshev(p.x, p.y, tgt.x, tgt.y) > (msg.range || 1)) return;
            const amount = Math.max(1, msg.amount | 0);
            // Se ghost: server processa o dano local (cliente não está)
            if (tgt.disconnected){
                tgt.hp = Math.max(0, (tgt.hp ?? 100) - amount);
                broadcast(null, { t:'float', id: msg.targetId, text:`-${amount}`, color:'#ff3030', big:true });
                if (tgt.hp === 0){
                    // ghost killed: dropa 10% gold + 1 item random do inv
                    const goldDrop = Math.floor((tgt.gold || 0) * 0.10);
                    tgt.gold = Math.max(0, (tgt.gold || 0) - goldDrop);
                    let droppedItem = null;
                    if (tgt.inv){
                        const keys = Object.keys(tgt.inv).filter(k => tgt.inv[k] > 0);
                        if (keys.length){
                            droppedItem = keys[Math.floor(Math.random() * keys.length)];
                            tgt.inv[droppedItem]--;
                            if (tgt.inv[droppedItem] <= 0) delete tgt.inv[droppedItem];
                        }
                    }
                    sendTo(id, { t:'pkKill', victimId: msg.targetId, victimName: tgt.name,
                                 victimHadSelos:false, goldGain: goldDrop, dropHighlander:false,
                                 droppedItem, ghost:true, dropX: tgt.x, dropY: tgt.y });
                    broadcastMsg('warn', `💀 ${p.name} acabou com o corpo de ${tgt.name}!`);
                    players.delete(msg.targetId);
                    broadcast(null, { t:'leave', id: msg.targetId });
                }
                return;
            }
            // Vivo: encaminha pro cliente alvo aplicar dano local
            if (tgt.ws.readyState === 1){
                tgt.ws.send(JSON.stringify({ t:'pvpHit', from:id, fromName:p.name, amount }));
            }
            broadcast(id, { t:'float', id:msg.targetId, text:`-${amount}`, color:'#ff3030', big:true });
            return;
        }

        // Cliente envia snapshot de gold/inv/stats pra body stays + visibility
        if (msg.t === 'playerSync') {
            if (typeof msg.gold === 'number'){
                p.gold = msg.gold;
                const r = ensureRanking(p.name);
                if (r) r.gold = msg.gold;
            }
            if (msg.inv && typeof msg.inv === 'object') p.inv = msg.inv;
            let statsChanged = false;
            if (typeof msg.hp === 'number' && isFinite(msg.hp)) { p.hp = msg.hp; statsChanged = true; }
            if (typeof msg.maxHp === 'number' && isFinite(msg.maxHp)) { p.maxHp = msg.maxHp; statsChanged = true; }
            if (typeof msg.mp === 'number' && isFinite(msg.mp)) { p.mp = msg.mp; statsChanged = true; }
            if (typeof msg.maxMp === 'number' && isFinite(msg.maxMp)) { p.maxMp = msg.maxMp; statsChanged = true; }
            // Cosmético: propaga pros outros (string ou null, máx 32 chars)
            if ('cosmetic' in msg){
                const cos = (typeof msg.cosmetic === 'string' && msg.cosmetic.length < 32) ? msg.cosmetic : null;
                if (cos !== p.cosmetic){ p.cosmetic = cos; statsChanged = true; }
            }
            if (statsChanged){
                broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic });
            }
            return;
        }

        // ATAQUE A MOB (#10 validado)
        if (msg.t === 'attackMob') {
            const m = monsters.get(msg.monsterId);
            if (!m || m.hp <= 0) { sendTo(id, { t:'mobMissing', mobId: msg.monsterId }); return; }
            const range = msg.range || 1;
            if (chebyshev(p.x, p.y, m.x, m.y) > range) return;
            p.lastAttackAt = Date.now();   // quebra mini-PZ do NPC por 2s
            // LOS — só valida pra ranged (range > 1); melee adjacente passa sem check
            if (range > 1 && !hasLineOfSight(p.x, p.y, m.x, m.y)) return;
            // teto de dano: 3x o dmg base do mob (margem confortável pros crits)
            const cap = (MTYPE[m.type]?.hp || 50) + 50;  // teto generoso
            const dmg = Math.max(1, Math.min(msg.amount | 0, cap));
            m.hp = Math.max(0, m.hp - dmg);
            // DoT procs (veneno/sangra/fogo de armas +N) — cliente enviou no msg.dots
            if (Array.isArray(msg.dots) && msg.dots.length){
                m.dots = m.dots || [];
                for (const d of msg.dots){
                    if (!d || !d.type || !['poison','bleed','burn'].includes(d.type)) continue;
                    const safeDmg = Math.max(1, Math.min(20, d.dmg | 0));
                    const safeTicks = Math.max(1, Math.min(8, d.ticks | 0));
                    const existing = m.dots.find(x => x.type === d.type);
                    if (existing){
                        const oldTotal = existing.dmg * existing.ticksLeft;
                        const newTotal = safeDmg * safeTicks;
                        if (newTotal > oldTotal){
                            existing.dmg = safeDmg;
                            existing.ticksLeft = safeTicks;
                            existing.nextTickAt = Date.now() + 3000;
                            existing.byId = id;
                        }
                    } else {
                        m.dots.push({ type: d.type, dmg: safeDmg, ticksLeft: safeTicks, nextTickAt: Date.now() + 3000, byId: id });
                    }
                }
            }
            // broadcast update do mob
            const update = { t:'mobUpdate', id:m.id, hp:m.hp, maxHp:m.maxHp };
            for (const pp of players.values()){
                if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify(update));
            }
            // float visual em todos
            broadcast(null, { t:'mobFloat', mobId:m.id, text:`-${dmg}`, color:'#ff8060', crit:!!msg.crit });
            if (m.hp === 0){
                // morte
                if (m.unique){
                    if (m.type === MEGA_BOSS_TYPE){
                        // ★★ Mega boss morreu — recompensa épica + reset bossLevel
                        handleMegaBossDeath(p, m);
                    } else {
                        bossDeath.set(m.type, Date.now());
                        // próxima encarnação fica +1 nível (cap)
                        const cur = bossLevel.get(m.type) || 1;
                        const next = Math.min(BOSS_LEVEL_CAP, cur + 1);
                        bossLevel.set(m.type, next);
                        console.log(`[boss] ${m.type} morto (Lv${cur}) por ${p.name} → próximo Lv${next}`);
                        // Salva imediatamente
                        saveStateToDisk();
                        // Verifica se desbloqueou o mega boss
                        checkMegaBossSpawn();
                    }
                }
                monsters.delete(m.id);
                // notifica killer com xp + spawn de loot fica com o killer (cliente)
                sendTo(id, { t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level });
                broadcast(id, { t:'mobDead', mobId:m.id, byName:p.name, level:m.level });
                // Ranking: incrementa mobKills (e bossKills se for unique)
                const r = ensureRanking(p.name);
                if (r){
                    r.mobKills = (r.mobKills || 0) + 1;
                    if (m.unique) r.bossKills = (r.bossKills || 0) + 1;
                }
            }
            return;
        }

        if (msg.t === 'pkDeath') {
            const killer = players.get(msg.killerId);
            if (killer && killer.ws.readyState === 1){
                killer.ws.send(JSON.stringify({
                    t:'pkKill',
                    victimId: id, victimName: p.name,
                    victimHadSelos: !!msg.hadSelos,
                    goldGain: msg.goldGain || 0,
                    dropHighlander: !!msg.dropHighlander,
                }));
            }
            broadcastMsg('warn', `⚔ ${killer?killer.name:'?'} matou ${p.name}` + (msg.dropHighlander?' (Highlander caiu!)':''));
            // Ranking: incrementa pkKills do killer
            if (killer){
                const r = ensureRanking(killer.name);
                if (r) r.pkKills = (r.pkKills || 0) + 1;
            }
            return;
        }

        if (msg.t === 'getRanking') {
            const limit = Math.min(20, Math.max(1, msg.limit | 0 || 10));
            sendTo(id, {
                t: 'ranking',
                mobs:   topRanking('mobKills',  limit),
                pvp:    topRanking('pkKills',   limit),
                bosses: topRanking('bossKills', limit),
                gold:   topRanking('gold',      limit),
            });
            return;
        }

        if (msg.t === 'announce') {
            broadcastMsg('info', String(msg.text).substring(0, 200));
            return;
        }

        if (msg.t === 'kill') {
            // legado (mob local). Ignora.
            return;
        }

        // ─── TRADE ─────────────────────────────────────────────────────
        if (msg.t === 'tradeRequest') {
            const toName = String(msg.toName || '').trim().substring(0, 14);
            if (!toName || toName.toLowerCase() === p.name.toLowerCase()){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Trade inválido.' });
                return;
            }
            let target = null;
            for (const pp of players.values()){
                if (!pp.disconnected && pp.name.toLowerCase() === toName.toLowerCase()){ target = pp; break; }
            }
            if (!target){ sendTo(id, { t:'serverMsg', level:'warn', text:`${toName} não está online.` }); return; }
            if (chebyshev(p.x, p.y, target.x, target.y) > 3){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Aproxime-se mais (max 3 tiles).' });
                return;
            }
            if (p.tradeId || target.tradeId){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Um dos dois já está em trade.' });
                return;
            }
            // Manda oferta pro target. Responde com tradeAccept/tradeReject.
            if (target.ws.readyState === 1){
                target.ws.send(JSON.stringify({ t:'tradeOffer', fromId: id, fromName: p.name }));
            }
            return;
        }
        if (msg.t === 'tradeAccept') {
            const initiator = players.get(msg.fromId);
            if (!initiator || initiator.disconnected) return;
            if (initiator.tradeId || p.tradeId) return;
            if (chebyshev(p.x, p.y, initiator.x, initiator.y) > 3) return;
            const tradeId = 'tr_' + Date.now() + '_' + Math.floor(Math.random()*10000);
            const trade = {
                id: tradeId,
                aId: initiator.id, bId: id,
                aOffer: { items:{}, gold:0 }, bOffer: { items:{}, gold:0 },
                aConfirm: false, bConfirm: false,
                createdAt: Date.now(),
            };
            trades.set(tradeId, trade);
            initiator.tradeId = tradeId;
            p.tradeId = tradeId;
            initiator.ws.send(JSON.stringify({ t:'tradeStart', tradeId, otherName: p.name }));
            sendTo(id, { t:'tradeStart', tradeId, otherName: initiator.name });
            return;
        }
        if (msg.t === 'tradeReject') {
            const initiator = players.get(msg.fromId);
            if (initiator && initiator.ws.readyState === 1){
                initiator.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text:`${p.name} recusou o trade.` }));
            }
            return;
        }
        if (msg.t === 'tradeUpdate') {
            const trade = trades.get(msg.tradeId);
            if (!trade) return;
            const isA = trade.aId === id;
            const isB = trade.bId === id;
            if (!isA && !isB) return;
            // Valida que o player TEM os items que está ofertando
            const offer = msg.offer || { items:{}, gold:0 };
            const cleanItems = {};
            for (const [k, q] of Object.entries(offer.items || {})){
                const qty = Math.max(0, Math.min(q | 0, p.inv[k] || 0));
                if (qty > 0) cleanItems[k] = qty;
            }
            const goldClean = Math.max(0, Math.min(offer.gold | 0, p.gold || 0));
            const cleanOffer = { items: cleanItems, gold: goldClean };
            if (isA){ trade.aOffer = cleanOffer; trade.aConfirm = false; trade.bConfirm = false; }
            else    { trade.bOffer = cleanOffer; trade.aConfirm = false; trade.bConfirm = false; }
            // Broadcast pro outro lado
            const other = players.get(isA ? trade.bId : trade.aId);
            if (other && other.ws.readyState === 1){
                other.ws.send(JSON.stringify({ t:'tradeUpdate', tradeId: trade.id, side:'other', offer: cleanOffer }));
            }
            return;
        }
        if (msg.t === 'tradeConfirm') {
            const trade = trades.get(msg.tradeId);
            if (!trade) return;
            const isA = trade.aId === id;
            if (isA) trade.aConfirm = true; else if (trade.bId === id) trade.bConfirm = true; else return;
            const other = players.get(isA ? trade.bId : trade.aId);
            if (other && other.ws.readyState === 1){
                other.ws.send(JSON.stringify({ t:'tradeConfirm', tradeId: trade.id, side:'other' }));
            }
            if (trade.aConfirm && trade.bConfirm){
                // Executa o trade atomicamente
                const a = players.get(trade.aId);
                const b = players.get(trade.bId);
                if (!a || !b){
                    cancelTrade(trade, 'desconexão');
                    return;
                }
                // Re-valida posses
                for (const [k, q] of Object.entries(trade.aOffer.items)) if ((a.inv[k]||0) < q){ cancelTrade(trade, 'oferta inválida'); return; }
                for (const [k, q] of Object.entries(trade.bOffer.items)) if ((b.inv[k]||0) < q){ cancelTrade(trade, 'oferta inválida'); return; }
                if ((a.gold||0) < trade.aOffer.gold || (b.gold||0) < trade.bOffer.gold){
                    cancelTrade(trade, 'oferta inválida'); return;
                }
                // Transfere A→B
                for (const [k, q] of Object.entries(trade.aOffer.items)){
                    a.inv[k] = (a.inv[k] || 0) - q; if (a.inv[k] <= 0) delete a.inv[k];
                    b.inv[k] = (b.inv[k] || 0) + q;
                }
                a.gold = (a.gold||0) - trade.aOffer.gold;
                b.gold = (b.gold||0) + trade.aOffer.gold;
                // Transfere B→A
                for (const [k, q] of Object.entries(trade.bOffer.items)){
                    b.inv[k] = (b.inv[k] || 0) - q; if (b.inv[k] <= 0) delete b.inv[k];
                    a.inv[k] = (a.inv[k] || 0) + q;
                }
                b.gold = (b.gold||0) - trade.bOffer.gold;
                a.gold = (a.gold||0) + trade.bOffer.gold;
                // Notifica cada lado
                sendTo(trade.aId, { t:'tradeDone', given: trade.aOffer, received: trade.bOffer });
                sendTo(trade.bId, { t:'tradeDone', given: trade.bOffer, received: trade.aOffer });
                // Limpa
                trades.delete(trade.id);
                if (a) a.tradeId = null;
                if (b) b.tradeId = null;
            }
            return;
        }
        if (msg.t === 'tradeCancel') {
            const trade = trades.get(msg.tradeId);
            if (!trade) return;
            cancelTrade(trade, 'cancelado');
            return;
        }

        // Whisper privado: /msg nome texto
        if (msg.t === 'whisper') {
            const toName = String(msg.toName || '').trim().substring(0, 14);
            const text = String(msg.text || '').trim().substring(0, 240);
            if (!toName || !text) return;
            // Rate-limit (mesmo balde do chat normal)
            const now = Date.now();
            if (!isAdmin(p.name)){
                p.lastChatAt = p.lastChatAt || 0;
                if (now - p.lastChatAt < 500){
                    if (now - (p.lastChatRateWarn || 0) > 2000){
                        sendTo(id, { t:'serverMsg', level:'warn', text:'Devagar com o chat.' });
                        p.lastChatRateWarn = now;
                    }
                    return;
                }
                p.lastChatAt = now;
            }
            // Procura player pelo nome (case-insensitive)
            let target = null;
            for (const pp of players.values()){
                if (!pp.disconnected && pp.name.toLowerCase() === toName.toLowerCase()){ target = pp; break; }
            }
            if (!target){
                sendTo(id, { t:'serverMsg', level:'warn', text:`"${toName}" não está online.` });
                return;
            }
            if (target.ws.readyState === 1){
                target.ws.send(JSON.stringify({ t:'whisper', fromName: p.name, text }));
            }
            return;
        }

        if (msg.t === 'chat') {
            const text = String(msg.text || '').trim().substring(0, 240);
            if (!text) return;
            // Rate-limit: 1 msg / 500ms por player (admin não conta — comandos)
            const now = Date.now();
            if (!isAdmin(p.name)){
                p.lastChatAt = p.lastChatAt || 0;
                if (now - p.lastChatAt < 500){
                    // Avisa só na primeira recusa dentro de uma janela de 2s pra não floodar de volta
                    if (now - (p.lastChatRateWarn || 0) > 2000){
                        sendTo(id, { t:'serverMsg', level:'warn', text:'Devagar com o chat.' });
                        p.lastChatRateWarn = now;
                    }
                    return;
                }
                p.lastChatAt = now;
            }
            // /guild ... — sistema de guild
            if (text.startsWith('/guild')){
                handleGuildCommand(p, text, (m) => sendTo(id, m), broadcast);
                return;
            }
            // /g msg — chat exclusivo da guild
            if (text.startsWith('/g ')){
                const body = text.substring(3).trim();
                if (!body) return;
                const myGuild = findGuildOfPlayer(p.name);
                if (!myGuild){ sendTo(id, { t:'serverMsg', level:'warn', text:'Você não tem guild.' }); return; }
                for (const pp of players.values()){
                    if (pp.ws.readyState !== 1) continue;
                    if (!myGuild.members.includes(pp.name)) continue;
                    pp.ws.send(JSON.stringify({ t:'guildChat', fromName: p.name, guild: myGuild.name, text: body }));
                }
                return;
            }
            // Comandos admin (só se nome do player tá em ADMIN_NAMES)
            if (text.startsWith('/') && isAdmin(p.name)){
                const [cmd, ...rest] = text.split(' ');
                const arg = rest.join(' ').trim();
                if (cmd === '/say' && arg){
                    broadcastMsg('admin', arg, p.name);
                    return;
                }
                if (cmd === '/event' && arg){
                    broadcastMsg('event', arg);
                    return;
                }
                if (cmd === '/warn' && arg){
                    broadcastMsg('warn', arg);
                    return;
                }
                if (cmd === '/info' && arg){
                    broadcastMsg('info', arg);
                    return;
                }
                if (cmd === '/help'){
                    sendTo(id, { t:'serverMsg', level:'info', text:'Admin: /say · /event · /warn · /info · /motd · /setboss TYPE LV · /respawnboss TYPE' });
                    return;
                }
                if (cmd === '/setboss'){
                    const parts = arg.split(/\s+/);
                    const bossType = parts[0]?.toUpperCase();
                    const newLv = Math.max(1, Math.min(BOSS_LEVEL_CAP, parseInt(parts[1], 10) || 1));
                    const validBoss = BOSSES.find(b => b.type === bossType);
                    if (!validBoss){
                        sendTo(id, { t:'serverMsg', level:'warn', text:'Boss inválido. Use: ORC_LIDER | DRAKE_LIDER | GOLEM_REI' });
                        return;
                    }
                    bossLevel.set(bossType, newLv);
                    // Se boss tá vivo, mata pra ressuscitar no novo nível
                    for (const m of Array.from(monsters.values())) if (m.type === bossType) monsters.delete(m.id);
                    bossDeath.delete(bossType);
                    spawnMob(bossType, validBoss.x, validBoss.y);
                    saveStateToDisk();
                    broadcastMsg('event', `⚔ ${bossType} ressuscitado em Lv${newLv} (admin)`);
                    return;
                }
                if (cmd === '/respawnboss'){
                    const bossType = arg.toUpperCase();
                    const validBoss = BOSSES.find(b => b.type === bossType);
                    if (!validBoss){
                        sendTo(id, { t:'serverMsg', level:'warn', text:'Use: /respawnboss ORC_LIDER | DRAKE_LIDER | GOLEM_REI' });
                        return;
                    }
                    for (const m of Array.from(monsters.values())) if (m.type === bossType) monsters.delete(m.id);
                    bossDeath.delete(bossType);
                    spawnMob(bossType, validBoss.x, validBoss.y);
                    saveStateToDisk();
                    sendTo(id, { t:'serverMsg', level:'info', text:`${bossType} respawnado no Lv${bossLevel.get(bossType) || 1}` });
                    return;
                }
                if (cmd === '/motd'){
                    // não persiste em env, mas atualiza pra sessão atual
                    SERVER_MOTD_RUNTIME = arg;
                    sendTo(id, { t:'serverMsg', level:'info', text:`MOTD atualizado (até reiniciar): "${arg}"` });
                    return;
                }
                sendTo(id, { t:'serverMsg', level:'warn', text:`Comando desconhecido: ${cmd}. /help pra ver lista` });
                return;
            }
            broadcast(null, { t:'chat', id, name:p.name, text });
            return;
        }
    });

    ws.on('close', () => {
        // Body stays: mantém ghost por GHOST_TIMEOUT_MS, atacável e droppable
        if (p.disconnected){ players.delete(id); return; }
        p.disconnected = true;
        p.disconnectedAt = Date.now();
        console.log(`[~] ${id} (${p.name}) virou ghost — ${(GHOST_TIMEOUT_MS/60000).toFixed(0)}min até sumir`);
        broadcast(id, { t:'ghost', id, name:p.name });
    });

    ws.on('error', (e) => console.error(`[!] ${id}:`, e.message));
});

console.log(`╔══════════════════════════════════════╗`);
console.log(`║   VALADARES SERVER em ws://:${PORT}    ║`);
console.log(`║   ${monsters.size} mobs · autoritativo (mobs+combate)   ║`);
console.log(`╚══════════════════════════════════════╝`);
