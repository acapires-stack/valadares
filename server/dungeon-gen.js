'use strict';
// ─── M4 3b — gerador procedural de caverna por andar (cellular automata) ─────
// Puro e determinístico: mesma (floor, seed) → mesmo layout. Roda standalone
// (sem deps) pra dar pra testar com node ANTES de subir (o caminho WS não é
// testável local). O server gera aqui e MANDA o grid pro cliente no dungeonEnter
// (fonte da verdade única — nada de replicar o gerador nos dois lados).
//
// Saída: { area:{x0,y0,x1,y1}, rows:[ "#.#.." , ... ], meta:{spawn,up,down,boss},
//          floorTiles:[{x,y}...] } — coords em mundo (0..99). rows cobrem só a
// AREA (resto do mundo 100×100 = parede). down=null no último andar; boss só
// quando withBoss (andar do chefe).

// Área de trabalho da caverna no grid 100×100 (centrada em ~50,50). 29×29.
const AREA = { x0: 36, y0: 36, x1: 64, y1: 64 };

const FILL_PROB   = 0.45;  // densidade inicial de parede
const ITERATIONS  = 4;     // passos do cellular automata
const MIN_FLOOR   = 150;   // piso mínimo do maior componente conectado (senão regenera)
const MIN_STAIRS  = 14;    // distância mínima (manhattan) entre subida e descida
const MAX_TRIES   = 24;    // tentativas de geração antes do fallback

// PRNG determinístico (mulberry32) — inteiro 32-bit → [0,1).
function mulberry32(a){
    return function(){
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const manh = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

// Gera 1 candidato. Retorna null se a caverna saiu ruim (pra regenerar).
function buildOne(rng, withBoss){
    const W = AREA.x1 - AREA.x0 + 1;
    const H = AREA.y1 - AREA.y0 + 1;
    // wall[y][x] em coords locais (0..W-1). Borda sempre parede.
    let wall = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => {
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return true;
            return rng() < FILL_PROB;
        }));

    const countWalls = (g, x, y) => {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++){
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) { n++; continue; } // fora = parede
                if (g[ny][nx]) n++;
            }
        return n;
    };
    for (let it = 0; it < ITERATIONS; it++){
        const ng = wall.map(r => r.slice());
        for (let y = 1; y < H - 1; y++)
            for (let x = 1; x < W - 1; x++){
                const c = countWalls(wall, x, y);
                ng[y][x] = c >= 5;        // regra clássica de suavização
            }
        wall = ng;
    }

    // Maior componente conectado (4-dir) de piso → mantém; resto vira parede.
    const comp = Array.from({ length: H }, () => new Int32Array(W).fill(-1));
    let best = -1, bestSize = 0;
    let cid = 0;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++){
            if (wall[y][x] || comp[y][x] !== -1) continue;
            // BFS
            const q = [[x, y]]; comp[y][x] = cid; let size = 0;
            while (q.length){
                const [cx, cy] = q.pop(); size++;
                const nb = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
                for (const [nx, ny] of nb){
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    if (wall[ny][nx] || comp[ny][nx] !== -1) continue;
                    comp[ny][nx] = cid; q.push([nx, ny]);
                }
            }
            if (size > bestSize){ bestSize = size; best = cid; }
            cid++;
        }
    if (best === -1 || bestSize < MIN_FLOOR) return null;

    // Tiles de piso do maior componente (coords locais).
    const floors = [];
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (comp[y][x] === best) floors.push([x, y]);

    // Escolhe a subida num tile de piso; descida = mais longe possível dela.
    const up = floors[Math.floor(rng() * floors.length)];
    let down = null, dBest = -1;
    if (!withBoss){
        for (const [fx, fy] of floors){
            const d = manh(fx, fy, up[0], up[1]);
            if (d > dBest){ dBest = d; down = [fx, fy]; }
        }
        if (dBest < MIN_STAIRS) return null;   // andar pequeno/dobrado → regenera
    }
    // Chegada: vizinho de piso (4-dir) da subida (player nasce ao lado da escada).
    let spawn = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx = up[0] + dx, ny = up[1] + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && comp[ny][nx] === best){ spawn = [nx, ny]; break; }
    }
    if (!spawn) spawn = up;
    // Boss: tile mais longe da chegada (no andar do chefe).
    let boss = null;
    if (withBoss){
        let bBest = -1;
        for (const [fx, fy] of floors){
            const d = manh(fx, fy, spawn[0], spawn[1]);
            if (d > bBest){ bBest = d; boss = [fx, fy]; }
        }
        if (bBest < MIN_STAIRS) return null;
    }

    // Coords locais → mundo.
    const toWorld = ([x, y]) => ({ x: x + AREA.x0, y: y + AREA.y0 });
    const rows = [];
    for (let y = 0; y < H; y++){
        let s = '';
        for (let x = 0; x < W; x++) s += (comp[y][x] === best) ? '.' : '#';
        rows.push(s);
    }
    return {
        area: { ...AREA },
        rows,
        meta: {
            spawn: toWorld(spawn),
            up:    toWorld(up),
            down:  down ? toWorld(down) : null,
            boss:  boss ? toWorld(boss) : null,
        },
        floorTiles: floors.map(toWorld),
    };
}

// Fallback determinístico (sala retangular cheia) — só se 24 tentativas falharem.
function buildFallback(withBoss){
    const W = AREA.x1 - AREA.x0 + 1, H = AREA.y1 - AREA.y0 + 1;
    const rows = [];
    const floorTiles = [];
    for (let y = 0; y < H; y++){
        let s = '';
        for (let x = 0; x < W; x++){
            const isWall = (x === 0 || y === 0 || x === W - 1 || y === H - 1);
            s += isWall ? '#' : '.';
            if (!isWall) floorTiles.push({ x: x + AREA.x0, y: y + AREA.y0 });
        }
        rows.push(s);
    }
    const up    = { x: AREA.x0 + 3, y: AREA.y0 + 3 };
    const spawn = { x: AREA.x0 + 4, y: AREA.y0 + 3 };
    const far   = { x: AREA.x1 - 3, y: AREA.y1 - 3 };
    return {
        area: { ...AREA }, rows,
        meta: { spawn, up, down: withBoss ? null : far, boss: withBoss ? far : null },
        floorTiles,
    };
}

// API pública. seed = inteiro da run; floor = 1..N; withBoss = andar do chefe.
function genCaveFloor(floor, seed, withBoss){
    for (let attempt = 0; attempt < MAX_TRIES; attempt++){
        const rng = mulberry32(((seed >>> 0) ^ Math.imul(floor, 0x9E3779B1) ^ Math.imul(attempt + 1, 0x85EBCA77)) >>> 0);
        const res = buildOne(rng, !!withBoss);
        if (res) return res;
    }
    return buildFallback(!!withBoss);
}

module.exports = { genCaveFloor, AREA };
