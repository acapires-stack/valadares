'use strict';

const DIRECTIONS = [[-1,0],[0,-1],[1,0],[0,1],[-1,-1],[1,-1],[1,1],[-1,1]];
const TARGET_MEMORY_MS = 8000;
const RETALIATION_MS = 8000;

function distance(a, b){
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function perceptionRadius(mob){
    const base = Number.isFinite(mob.aggro) ? mob.aggro : 0;
    // Caçadores e chefes conservam as regras de aquisição existentes.
    return mob.hunter || mob.unique || base >= 12 ? base : Math.min(12, base + 2);
}

function selectTarget({mob, players, now, isSafe}){
    const floor = mob.floor || 0;
    const radius = perceptionRadius(mob);
    const available = [];
    for (const player of players){
        // Logout mantém o corpo (ghost) vulnerável no mundo.
        if (!player || (player.hp ?? 100) <= 0) continue;
        if ((player.floor || 0) !== floor || isSafe(player)) continue;
        available.push(player);
    }
    const find = id => available.find(player => player.id === id);
    const revenge = find(mob._retaliateId);
    if (revenge && now - (mob._retaliateAt || 0) <= RETALIATION_MS &&
        distance(mob, revenge) <= Math.max(8, radius)){
        return {target:revenge, distance:distance(mob, revenge), seenAt:now};
    }
    const retained = find(mob._pursuitTargetId);
    if (retained){
        const d = distance(mob, retained);
        if (d <= radius) return {target:retained, distance:d, seenAt:now};
        if (d <= radius + 4 && now - (mob._pursuitSeenAt || 0) <= TARGET_MEMORY_MS){
            return {target:retained, distance:d, seenAt:mob._pursuitSeenAt};
        }
    }
    let best = null, bestDistance = Infinity;
    for (const player of available){
        const d = distance(mob, player);
        if (d <= radius && d < bestDistance){ best = player; bestDistance = d; }
    }
    return {target:best, distance:bestDistance, seenAt:best ? now : 0};
}

function canStep(from, to, isWalkable, isOccupied){
    if (!isWalkable(to.x, to.y) || isOccupied(to.x, to.y)) return false;
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return false;
    // Impede atravessar diagonalmente o canto de paredes, PZ ou escadas.
    if (dx && dy && (!isWalkable(from.x + dx, from.y) ||
                     !isWalkable(from.x, from.y + dy))) return false;
    return true;
}

function key(x, y){ return x + ',' + y; }

function goalsAround({mob, target, isWalkable, isOccupied, reserved}){
    for (const radius of [1, 2]){
        const goals = [];
        for (let dy = -radius; dy <= radius; dy++){
            for (let dx = -radius; dx <= radius; dx++){
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const x = target.x + dx, y = target.y + dy;
                if (!isWalkable(x, y) || isOccupied(x, y) || reserved.has(key(x, y))) continue;
                const d = distance(mob, {x, y});
                // Distribui vagas de mesma distância sem depender da ordem dos mobs.
                const tie = ((Number(mob.id) || 0) * 31 + dx * 7 + dy * 11 + 10000) % 97;
                let score = d * 100 + tie;
                // Inteligência 3 conserva a preferência de flanco do tick antigo.
                if ((mob.intel || 1) >= 3){
                    const back = {up:[0,1],down:[0,-1],left:[1,0],right:[-1,0]}[target.dir];
                    if (back){
                        if (Math.sign(dx) === back[0] && Math.sign(dy) === back[1]) score -= 200;
                        else if (Math.sign(dx) === back[0] || Math.sign(dy) === back[1]) score -= 80;
                    }
                }
                goals.push({x, y, score});
            }
        }
        if (goals.length) return goals.sort((a,b) => a.score - b.score);
    }
    return [];
}

function greedyStep(mob, target, goal, isWalkable, isOccupied){
    const dx = Math.sign(goal.x - mob.x), dy = Math.sign(goal.y - mob.y);
    for (const [sx, sy] of [[dx,dy],[dx,0],[0,dy]]){
        const step = {x:mob.x + sx, y:mob.y + sy};
        // Se a distância ao player não cair, o desvio precisa de rota completa.
        // Passo lateral ganancioso pode alternar entre os lados de uma parede em U.
        if (distance(step, target) < distance(mob, target) &&
            canStep(mob, step, isWalkable, isOccupied)) return step;
    }
    return null;
}

function findRoute({mob, goals, isWalkable, isOccupied, maxNodes = 256}){
    if (!goals.length || maxNodes < 1) return {route:[], visited:0};
    const byKey = new Map(goals.map(goal => [key(goal.x, goal.y), goal]));
    const queue = [{x:mob.x, y:mob.y, parent:-1}];
    const seen = new Set([key(mob.x, mob.y)]);
    let head = 0, found = -1;
    const bound = Math.max(1, Math.min(256, Math.floor(maxNodes)));
    while (head < queue.length && head < bound){
        const index = head++, current = queue[index];
        if (byKey.has(key(current.x, current.y))){ found = index; break; }
        for (const [dx, dy] of DIRECTIONS){
            const next = {x:current.x + dx, y:current.y + dy, parent:index};
            const nextKey = key(next.x, next.y);
            if (seen.has(nextKey) || !canStep(current, next, isWalkable, isOccupied)) continue;
            seen.add(nextKey);
            queue.push(next);
        }
    }
    if (found < 0) return {route:[], visited:head};
    const route = [];
    for (let at = found; queue[at].parent !== -1; at = queue[at].parent){
        route.push({x:queue[at].x, y:queue[at].y});
    }
    route.reverse();
    return {route, visited:head};
}

function nextPursuitStep({mob, target, isWalkable, isOccupied, reserved = new Set(),
                          route = [], routeTarget, maxNodes = 256}){
    const goals = goalsAround({mob, target, isWalkable, isOccupied, reserved});
    if (!goals.length) return {step:null, route:[], goal:null, visited:0};
    const targetKey = key(target.x, target.y);
    if (route.length && routeTarget === targetKey &&
        canStep(mob, route[0], isWalkable, isOccupied) &&
        goals.some(goal => key(goal.x, goal.y) === key(route.at(-1).x, route.at(-1).y))){
        return {step:route[0], route:route.slice(1), goal:route.at(-1), visited:0};
    }
    const direct = greedyStep(mob, target, goals[0], isWalkable, isOccupied);
    if (direct) return {step:direct, route:[], goal:goals[0], visited:0};
    const path = findRoute({mob, goals, isWalkable, isOccupied, maxNodes});
    return {step:path.route[0] || null, route:path.route.slice(1),
        goal:path.route.length ? path.route.at(-1) : null, visited:path.visited};
}

module.exports = {perceptionRadius, selectTarget, canStep, goalsAround,
    findRoute, nextPursuitStep, key, TARGET_MEMORY_MS, RETALIATION_MS};
