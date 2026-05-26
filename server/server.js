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
const STATE_SAVE_INTERVAL_MS = 60 * 1000;

// ─── Constants do mundo ─────────────────────────────────────────────────────
const M_W = 100, M_H = 100;
const SAFE_RADIUS = 3, SAFE_CX = 50, SAFE_CY = 50;
const T = { GRASS:0, DIRT:1, TREE:2, WATER:3, STONE:4, CAVE:5, CAVE_WALL:6, SNOW:7, SAND:8 };
const walkable = t => t===T.GRASS||t===T.DIRT||t===T.STONE||t===T.CAVE||t===T.SNOW||t===T.SAND;

const MTYPE = {
    RAT:        { hp:18,  dmg:2,  speed:440, xp:8,   aggro:4 },
    SNAKE:      { hp:35,  dmg:4,  speed:390, xp:18,  aggro:4 },
    SPIDER:     { hp:50,  dmg:6,  speed:370, xp:30,  aggro:5 },
    WOLF:       { hp:80,  dmg:8,  speed:320, xp:55,  aggro:6 },
    ORC:        { hp:140, dmg:11, speed:370, xp:120, aggro:5 },
    ORC_LIDER:  { hp:450, dmg:19, speed:340, xp:600, aggro:6, unique:true },
    BAT:        { hp:25,  dmg:5,  speed:250, xp:22,  aggro:5 },
    MINOTAUR:   { hp:220, dmg:16, speed:380, xp:240, aggro:6 },
    SKELETON:   { hp:90,  dmg:11, speed:370, xp:80,  aggro:5 },
    TROLL:      { hp:160, dmg:14, speed:420, xp:160, aggro:5 },
    LIZARD:     { hp:55,  dmg:9,  speed:300, xp:45,  aggro:4 },
    DRAKE:      { hp:130, dmg:15, speed:340, xp:150, aggro:6 },
    DRAKE_LIDER:{ hp:700, dmg:25, speed:360, xp:800, aggro:7, unique:true },
    GOLEM:      { hp:200, dmg:13, speed:460, xp:180, aggro:6 },
    GOLEM_REI:  { hp:900, dmg:20, speed:490, xp:700, aggro:7, unique:true },
    SCORPION:   { hp:75,  dmg:11, speed:320, xp:55,  aggro:4 },
    CACADOR:    { hp:350, dmg:18, speed:320, xp:0,   aggro:999 },
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
function broadcast(except, msg){
    const data = JSON.stringify(msg);
    for (const p of players.values()){
        if (p.id === except) continue;
        if (p.ws.readyState === 1) p.ws.send(data);
    }
}
function sendTo(id, msg){
    const p = players.get(id);
    if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}
function snapshotPlayers(){
    return Array.from(players.values()).map(p => ({
        id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:!!p.pvp,
        hp:p.hp ?? 100, maxHp:p.maxHp ?? 100,
        ghost: !!p.disconnected,
    }));
}
function mobAt(x, y){
    for (const m of monsters.values()) if (m.x === x && m.y === y && m.hp > 0) return m;
    return null;
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
                broadcast(null, { t:'announce', text:`⚔ ${baseName}${lvlTag} reapareceu!` });
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
function tickAI(){
    const now = Date.now();
    for (const m of monsters.values()){
        if (m.hp <= 0) continue;
        // procura player mais próximo em aggro range
        let target = null, td = Infinity;
        for (const p of players.values()){
            if ((p.hp ?? 100) <= 0) continue;
            if (inSafe(p.x, p.y)) continue;
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
        if (now - m.lastMoveAt < m.speed) continue;
        m.lastMoveAt = now;
        const dx = Math.sign(target.x - m.x);
        const dy = Math.sign(target.y - m.y);
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
    }));
}
function broadcastMobs(){
    const data = JSON.stringify({ t:'mobs', list: snapshotMobs() });
    for (const p of players.values()){
        if (p.ws.readyState === 1) p.ws.send(data);
    }
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
        monsters.clear();
        if (Array.isArray(d.monsters)){
            for (const m of d.monsters){
                monsters.set(m.id, {
                    id:m.id, type:m.type, x:m.x, y:m.y, dir:m.dir||'down',
                    hp:m.hp, maxHp:m.maxHp, dmg:m.dmg, speed:m.speed, xp:m.xp,
                    aggro:m.aggro, unique:!!m.unique, level:m.level||1,
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

// Inicia mundo
let lastResetDay = new Date().toDateString();
if (!loadStateFromDisk()) spawnInitial();
setInterval(saveStateToDisk, STATE_SAVE_INTERVAL_MS);
process.on('SIGINT',  () => { saveStateToDisk(); console.log('[state] salvo ao sair (SIGINT)'); process.exit(0); });
process.on('SIGTERM', () => { saveStateToDisk(); console.log('[state] salvo ao sair (SIGTERM)'); process.exit(0); });
setInterval(tickAI, TICK_AI_MS);
setInterval(broadcastMobs, SNAPSHOT_MS);
setInterval(tickRespawns, 1000);

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
    broadcast(null, { t:'announce', text:'🌅 Novo dia em Valadares! Bosses voltaram ao Lv1.' });
    console.log('[reset] daily reset — bosses Lv1');
}
setInterval(tickDailyReset, 60 * 1000);  // checa a cada minuto

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

        if (msg.t === 'join') {
            p.name  = String(msg.name || 'Anônimo').substring(0, 14);
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
            console.log(`    ${id} = ${p.name}`);
            ws.send(JSON.stringify({ t:'state', you: id, players: snapshotPlayers(), mobs: snapshotMobs() }));
            broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp } });
            return;
        }

        if (msg.t === 'pos') {
            p.x = msg.x; p.y = msg.y; p.dir = msg.dir;
            if (typeof msg.hp === 'number') p.hp = msg.hp;
            if (typeof msg.maxHp === 'number') p.maxHp = msg.maxHp;
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
                    broadcast(null, { t:'announce', text:`💀 ${p.name} acabou com o corpo de ${tgt.name}!` });
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

        // Cliente envia snapshot de gold/inv pra body stays funcionar
        if (msg.t === 'playerSync') {
            if (typeof msg.gold === 'number') p.gold = msg.gold;
            if (msg.inv && typeof msg.inv === 'object') p.inv = msg.inv;
            return;
        }

        // ATAQUE A MOB (#10 validado)
        if (msg.t === 'attackMob') {
            const m = monsters.get(msg.monsterId);
            if (!m || m.hp <= 0) { sendTo(id, { t:'mobMissing', mobId: msg.monsterId }); return; }
            const range = msg.range || 1;
            if (chebyshev(p.x, p.y, m.x, m.y) > range) return;
            // teto de dano: 3x o dmg base do mob (margem confortável pros crits)
            const cap = (MTYPE[m.type]?.hp || 50) + 50;  // teto generoso
            const dmg = Math.max(1, Math.min(msg.amount | 0, cap));
            m.hp = Math.max(0, m.hp - dmg);
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
                    bossDeath.set(m.type, Date.now());
                    // próxima encarnação fica +1 nível (cap)
                    const next = Math.min(BOSS_LEVEL_CAP, (bossLevel.get(m.type) || 1) + 1);
                    bossLevel.set(m.type, next);
                }
                monsters.delete(m.id);
                // notifica killer com xp + spawn de loot fica com o killer (cliente)
                sendTo(id, { t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level });
                broadcast(id, { t:'mobDead', mobId:m.id, byName:p.name, level:m.level });
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
            broadcast(null, { t:'announce', text:`⚔ ${killer?killer.name:'?'} matou ${p.name}` + (msg.dropHighlander?' (Highlander caiu!)':'') });
            return;
        }

        if (msg.t === 'announce') {
            broadcast(null, { t:'announce', text: String(msg.text).substring(0, 200) });
            return;
        }

        if (msg.t === 'kill') {
            // legado (mob local). Ignora.
            return;
        }

        if (msg.t === 'chat') {
            const text = String(msg.text || '').trim().substring(0, 240);
            if (!text) return;
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
