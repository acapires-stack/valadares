// render3d.js — PORT DO 3D PRO MMO · ETAPA 1 ("a espinha")
// ═══════════════════════════════════════════════════════════════════════════
// Espelha o render 2D do play.html em Three.js. Carregado SOB DEMANDA via
// import() de CDN — zero build step, zero npm, zero peso pra quem não liga o 3D.
// Se o CDN cair ou não houver WebGL, ensure3d() devolve false e o jogo segue 2D.
//
// ETAPA 1 = chão do viewport + câmera seguindo o player. SEM personagens.
// O objetivo desta etapa é MEDIR: o chão com scroll aguenta? (ver r3dInfo/r3dPerf)
// Etapa 2 = personagens voxel · Etapa 3 = atmosfera (dia/noite) · Etapa 4 = juice.
//
// Contrato com o play.html (o monolito NÃO é ES module — nada de import lá;
// toda ligação passa por este `bridge` explícito, montado no toggle3d()):
//   ensure3d(hostCanvas, bridge) → Promise<bool>  monta a cena sobre o canvas 2D
//   drawScene3d(now)                              1 frame (chamar no fim do loop())
//   set3dVisible(on)                              mostra/esconde o canvas 3D
//   is3dReady()                                   Three carregado e cena montada
//   r3dInfo()                                     diagnóstico (draw calls, tris, ...)
//
// PORQUÊ DO DESENHO (o risco #2 do plano — "mundo com scroll"): o viewport é
// pequeno e fixo, então o chão 3D é uma JANELA ROLANTE de tiles ao redor da
// câmera, preenchida por InstancedMesh (1 draw call por tipo de peça). Os tiles
// vivem em coordenada ABSOLUTA do mapa (mx, my) e a câmera olha uma posição
// FRACIONÁRIA → o scroll suave sai de graça, sem reciclar mesh nenhum. A janela
// só é refeita quando o tile inteiro do centro muda (~1× a cada passo do player),
// não a cada frame.
//
// Convenção de eixos (mesma do tactics): mundo X = tile x · mundo Z = tile y.
// Logo -Z é o norte (topo da tela no 2D) e +Z o sul — a câmera padrão olha do sul.

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ─── knobs (mexer aqui, não espalhado) ─────────────────────────────────────
const CAM_FOV = 46;
// Câmera orbital LIMITADA — clamps garantem que nunca se perde o player de vista.
// Defaults enquadram ~15 tiles de largura = o mesmo que o viewport 2D mostra.
const ORBIT = {
    yaw: 0, pitch: 0.93, dist: 13.5,
    minYaw: -1.15, maxYaw: 1.15,       // ±66° em volta do sul
    minPitch: 0.55, maxPitch: 1.30,    // 31°..74° de inclinação
    minDist: 8, maxDist: 24,
};
const RAD = 14;                 // raio da janela de tiles (29×29 = 841 no pior caso)
const MAX_TILES = (RAD * 2 + 1) * (RAD * 2 + 1);
const TREE_H = 0.95;            // altura do tronco+copa da árvore
const WALL_H_CAVE = 1.05;       // altura da parede de caverna
const CAM_LERP = 0.16;          // suavização do deslize da câmera
let SHADOWS = true;             // knob de perf: sombra é o maior custo (r3dShadows)

let THREE = null;
let renderer = null, scene = null, camera = null, camBase = null, camTarget = null;
let canvas3d = null, hostCanvas = null, bridge = null;
let ready = false, _loading = null;
let sun = null, hemi = null, skyDome = null, skyMat = null;
const GEO = {};                 // geometrias compartilhadas (nunca por instância)

// malhas instanciadas da janela de chão (1 draw call cada)
let mFloor = null, mWater = null, mTrunk = null, mCanopy = null, mWall = null;
let world = null;               // grupo que segura tudo do chão

// controle da janela: só refaz quando o tile inteiro do centro (ou o mapa) muda
let _winX = null, _winY = null, _mapRef = null, _floorRef = null;
let _waterT = 0;

// ─── util ──────────────────────────────────────────────────────────────────
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// mistura duas cores hex (t = 0..1 rumo a `to`) — porta os tints do 2D
// (rgba(80,150,220,0.10) da PZ, rgba(120,210,130,0.13) do santuário)
function mix(from, to, t) {
    const r1 = (from >> 16) & 255, g1 = (from >> 8) & 255, b1 = from & 255;
    const r2 = (to >> 16) & 255, g2 = (to >> 8) & 255, b2 = to & 255;
    return (((r1 + (r2 - r1) * t) | 0) << 16) | (((g1 + (g2 - g1) * t) | 0) << 8) | ((b1 + (b2 - b1) * t) | 0);
}

// paleta por tile — MESMOS tons do render 2D (drawGrass/drawDirt/... no play.html).
// `v` é o vr(tx,ty) do 2D: a variação determinística por tile, portada de graça.
function tileColor(t, v) {
    const T = bridge.T;
    if (t === T.GRASS) return v < 0.35 ? 0x2d5a1b : v < 0.65 ? 0x357022 : 0x3d7d2a;
    if (t === T.DIRT) return v < 0.4 ? 0x8b6520 : v < 0.7 ? 0x9a7230 : 0x7a5510;
    if (t === T.TREE) return 0x111e0c;                       // chão sob a árvore
    if (t === T.WATER) return 0x164888;
    if (t === T.STONE) return v < 0.5 ? 0x585858 : 0x646464;
    // CAVE/CAVE_WALL: os 2 tons do 2D diferem só ~3% (42,37,48 vs 50,42,56). No 2D o
    // tile ainda lê porque o drawCaveFloor põe cascalho por cima; aqui, sem essa
    // textura, o chão vira um borrão liso. Abro o leque de tom pra a GRADE aparecer —
    // é o único ponto onde a paleta 3D se afasta de propósito do 2D.
    if (t === T.CAVE) return v < 0.5 ? 0x221d28 : 0x3a3142;
    if (t === T.CAVE_WALL) return v < 0.5 ? 0x141020 : 0x241c30;
    if (t === T.SNOW) return v < 0.4 ? 0xccd8e8 : v < 0.7 ? 0xdde8f4 : 0xeef4fc;
    if (t === T.SAND) return v < 0.4 ? 0xc8a840 : v < 0.7 ? 0xd4b858 : 0xbfa040;
    return 0x3d7d2a;
}

// ─── ciclo de vida ─────────────────────────────────────────────────────────
export function is3dReady() { return ready; }

export function set3dVisible(on) {
    if (!canvas3d) return;
    canvas3d.style.display = on ? 'block' : 'none';
}

// knob de perf exposto pro console: r3dShadows(false) se a sombra pesar
export function r3dShadows(on) {
    SHADOWS = !!on;
    if (renderer) renderer.shadowMap.enabled = SHADOWS;
    if (sun) sun.castShadow = SHADOWS;
    for (const m of [mTrunk, mCanopy, mWall]) if (m) m.castShadow = SHADOWS;
    if (mFloor) mFloor.receiveShadow = SHADOWS;
    // materiais precisam recompilar quando o shadowMap liga/desliga
    for (const m of [mFloor, mWater, mTrunk, mCanopy, mWall]) if (m) m.material.needsUpdate = true;
    for (const g of entGroups.values()) {
        const ud = g.userData;
        if (ud.vox) { ud.vox.castShadow = SHADOWS; ud.mat.needsUpdate = true; }
    }
    return SHADOWS;
}

// Carrega Three do CDN e monta a cena. Idempotente; concorrência segura (_loading).
export function ensure3d(canvas2d, api) {
    if (ready) return Promise.resolve(true);
    if (_loading) return _loading;
    _loading = (async () => {
        try {
            THREE = await import(THREE_CDN);
            bridge = api;
            build(canvas2d);
            ready = true;
            return true;
        } catch (e) {
            console.warn('[render3d] não deu pra ligar o 3D (CDN/WebGL):', e);
            _loading = null;          // permite tentar de novo depois
            return false;
        }
    })();
    return _loading;
}

function build(canvas2d) {
    hostCanvas = canvas2d;
    canvas3d = document.createElement('canvas');
    // Cobre EXATAMENTE o canvas 2D (não o #gameContainer inteiro — o container
    // também segura o #chatPanel logo abaixo, cobri-lo esconderia o chat).
    // pointer-events:none → clique/alvo seguem caindo no canvas 2D, os listeners
    // do monolito não mudam de lugar. syncOverlay() mantém o casamento no resize.
    canvas3d.style.cssText = 'position:absolute;display:none;pointer-events:none;z-index:5;';
    canvas2d.parentElement.appendChild(canvas3d);

    renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    // dpr 2 num canvas de 960×704 = 1920×1408 de fill — caro à toa num jogo de
    // pixel art. 1.5 é o teto (mede-se o efeito no r3dInfo).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = SHADOWS;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x28405c, 16, 32);   // esconde o corte da janela rolante
    renderer.setClearColor(0x28405c);

    camera = new THREE.PerspectiveCamera(CAM_FOV, 720 / 528, 0.1, 200);
    camTarget = new THREE.Vector3(50, 0, 50);
    camBase = new THREE.Vector3();
    updateCamera();
    scene.add(camera);
    wireOrbit();

    // Luzes: hemisphere de preenchimento (céu frio / solo quente) + sol com sombra.
    // O ciclo dia/noite do 2D (drawLighting/drawDayNightTint) é a Etapa 3 — aqui
    // a paleta é de dia, fixa.
    // ⚠️ As intensidades NÃO são chute. Com as luzes "físicas" (default do Three
    // desde a r155) um chão virado pra cima sai `albedo × irradiância ÷ π`, então
    // irradiância ≈ π = 3.14 é o ponto onde o tom LIT casa com o tom CHAPADO do 2D
    // — o mundo lê igual ao 2D e o volume vem da sombra, não de escurecer tudo.
    // Medido: com 0.75/1.15 a pedra da PZ (89,88,85) saía (52,51,48) = 58% do tom.
    hemi = new THREE.HemisphereLight(0x8fa8cf, 0x35301f, 2.2);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2d0, 3.4);
    sun.castShadow = SHADOWS;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera;
    sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 0.5; sc.far = 60;
    scene.add(sun, sun.target);

    // céu: domo com gradiente. fog:false senão a névoa pintaria o domo de cinza.
    {
        const c = document.createElement('canvas');
        c.width = 2; c.height = 256;
        const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#0d1c33');
        gr.addColorStop(0.36, '#25436e');
        gr.addColorStop(0.5, '#6d86a6');
        gr.addColorStop(0.62, '#1a2230');
        gr.addColorStop(1, '#10151c');
        g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
        // MeshBasic + map: `color` MULTIPLICA a textura → dá pra escurecer o céu pro
        // ciclo dia/noite sem regerar o gradiente (Etapa 3).
        skyMat = new THREE.MeshBasicMaterial({
            side: THREE.BackSide, fog: false, depthWrite: false, map: new THREE.CanvasTexture(c),
        });
        skyDome = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), skyMat);
        skyDome.renderOrder = -1;
        scene.add(skyDome);
    }

    // geometrias compartilhadas dos personagens (Etapa 2) — escaladas por instância
    GEO.voxel = new THREE.BoxGeometry(1, 1, 1);
    GEO.bar = new THREE.BoxGeometry(1, 1, 1);
    GEO.ring = new THREE.RingGeometry(0.42, 0.55, 24);

    // marcador de alvo (Etapa 4): o 2D usa um retângulo vermelho no tile; em 3D um
    // anel pulsando no chão lê melhor de qualquer ângulo da órbita.
    targetRing = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
        color: 0xff4040, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.visible = false;
    scene.add(targetRing);

    // ─── as 5 malhas da janela rolante (1 draw call cada) ───
    world = new THREE.Group();
    const lam = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    mFloor = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), lam(), MAX_TILES);
    mFloor.receiveShadow = SHADOWS;
    // água: cor global animada (sem cor por instância — o 2D também só ondula)
    mWater = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 0.1, 1),
        new THREE.MeshLambertMaterial({ color: 0x164888 }), MAX_TILES);
    mWater.receiveShadow = SHADOWS;
    mTrunk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, TREE_H * 0.55, 0.22), lam(), MAX_TILES);
    // copa low-poly (20 tris) em vez de esfera (96) — estilizado e barato
    mCanopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), lam(), MAX_TILES);
    mWall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H_CAVE, 1), lam(), MAX_TILES);
    for (const m of [mTrunk, mCanopy, mWall]) { m.castShadow = SHADOWS; m.receiveShadow = SHADOWS; }
    for (const m of [mFloor, mWater, mTrunk, mCanopy, mWall]) {
        m.count = 0;
        m.frustumCulled = false;   // a janela JÁ é o culling; o bounding sphere default mente
        world.add(m);
    }
    scene.add(world);

    buildAtmosphere();
}

// ─── câmera ────────────────────────────────────────────────────────────────
function updateCamera() {
    const ch = Math.cos(ORBIT.pitch) * ORBIT.dist, sv = Math.sin(ORBIT.pitch) * ORBIT.dist;
    camBase.set(
        camTarget.x + Math.sin(ORBIT.yaw) * ch,
        camTarget.y + sv,
        camTarget.z + Math.cos(ORBIT.yaw) * ch,
    );
    camera.position.copy(camBase);
    camera.lookAt(camTarget);
}

// Arrastar gira, roda aproxima — só enquanto o 3D está visível. Os listeners moram
// no canvas 2D (o 3D é pointer-events:none pra não roubar o clique de mirar).
// Threshold de 6px separa clique de arrasto; se houve arrasto, o click sintetizado
// logo depois é ENGOLIDO na fase de captura → orbitar não vira "mirei sem querer".
// Isso mora aqui de propósito: o handler de clique do monolito fica intocado.
let _drag = null, _dragged = false;
function shown() { return ready && canvas3d.style.display !== 'none'; }
function wireOrbit() {
    hostCanvas.addEventListener('pointerdown', e => {
        if (!shown()) return;
        _drag = { x: e.clientX, y: e.clientY };
        _dragged = false;
    });
    window.addEventListener('pointermove', e => {
        if (!_drag || !shown()) return;
        const dx = e.clientX - _drag.x, dy = e.clientY - _drag.y;
        if (!_dragged && Math.hypot(dx, dy) < 6) return;
        _dragged = true;
        ORBIT.yaw = clamp(ORBIT.yaw - dx * 0.005, ORBIT.minYaw, ORBIT.maxYaw);
        ORBIT.pitch = clamp(ORBIT.pitch + dy * 0.004, ORBIT.minPitch, ORBIT.maxPitch);
        _drag = { x: e.clientX, y: e.clientY };
        updateCamera();
    });
    window.addEventListener('pointerup', () => {
        _drag = null;
        if (!_dragged) return;
        const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        // se nenhum click vier atrás, o listener não pode ficar de tocaia
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
        _dragged = false;
    });
    hostCanvas.addEventListener('wheel', e => {
        if (!shown()) return;
        e.preventDefault();
        ORBIT.dist = clamp(ORBIT.dist * (e.deltaY > 0 ? 1.08 : 0.93), ORBIT.minDist, ORBIT.maxDist);
        updateCamera();
    }, { passive: false });
}

// ─── janela rolante de chão ────────────────────────────────────────────────
// Refeita só quando o tile inteiro do centro muda (ou troca de mapa/andar):
// ~1× por passo do player, não 1× por frame. É o que segura o custo do scroll.
const _m4 = { }; // preenchido no 1º uso (precisa do THREE carregado)
function rebuildWindow(cx, cy, map) {
    if (!_m4.m) { _m4.m = new THREE.Matrix4(); _m4.c = new THREE.Color(); _m4.q = new THREE.Quaternion(); _m4.s = new THREE.Vector3(1, 1, 1); _m4.p = new THREE.Vector3(); }
    const m4 = _m4.m, col = _m4.c;
    const { M_W, M_H, T, vr } = bridge;
    const floor = bridge.getPlayer().floor || 0;
    let fi = 0, wi = 0, ti = 0, ci = 0, ai = 0;

    const put = (mesh, idx, x, y, z, color) => {
        m4.makeTranslation(x, y, z);
        mesh.setMatrixAt(idx, m4);
        if (color != null) mesh.setColorAt(idx, col.setHex(color));
    };

    for (let dy = -RAD; dy <= RAD; dy++) {
        const my = cy + dy;
        if (my < 0 || my >= M_H) continue;
        for (let dx = -RAD; dx <= RAD; dx++) {
            const mx = cx + dx;
            if (mx < 0 || mx >= M_W) continue;
            const t = map[my][mx];
            const v = vr(mx, my);
            const wx = mx + 0.5, wz = my + 0.5;

            if (t === T.WATER) {
                put(mWater, wi++, wx, -0.08, wz, null);   // água afundada, cor global
                continue;
            }

            // cor do chão + os mesmos tints do laço 2D do viewport
            let c = tileColor(t, v);
            if (floor === 0 && bridge.inSafeZone(mx, my)) {
                c = mix(0x5a5246, 0x5096dc, 0.10);        // piso da praça + tint azul da PZ
            } else if (bridge.inSanctuary && bridge.inSanctuary(mx, my)) {
                c = mix(c, 0x78d282, 0.13);               // tint verde do santuário
            }

            if (t === T.CAVE_WALL) {
                put(mWall, ai++, wx, WALL_H_CAVE / 2, wz, c);
                continue;
            }

            put(mFloor, fi++, wx, -0.05, wz, c);

            if (t === T.TREE) {
                put(mTrunk, ti++, wx, TREE_H * 0.275, wz, 0x4a2d0c);
                put(mCanopy, ci++, wx, TREE_H, wz, v < 0.5 ? 0x174d10 : 0x1d5a13);
            }
        }
    }

    mFloor.count = fi; mWater.count = wi; mTrunk.count = ti; mCanopy.count = ci; mWall.count = ai;
    for (const m of [mFloor, mWater, mTrunk, mCanopy, mWall]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    _winX = cx; _winY = cy; _mapRef = map; _floorRef = floor;
}

// ═══════════════════════════════════════════════════════════════════════════
// ETAPA 2 — PERSONAGENS VOXEL
// O MMO não tem tabela de sprite: o boneco é DESENHADO por código. Então o
// play.html rasteriza o próprio drawCharacter/drawMonster num canvas transparente
// (ctx-gravador) e manda os pixels pra cá; aqui viram cubinhos. Fonte única da
// verdade — mexeu na arte 2D, o 3D acompanha sozinho.
//
// Duas decisões que seguram o custo:
//  1. STEP de 2px — a arte é feita de fillRect de 4px+, então amostrar 1 a cada 2
//     não perde nada e corta 4× os cubinhos.
//  2. MERGE DE CORRIDAS em X — uma fileira de 26px do mesmo tom vira 1 caixa
//     esticada, não 13 cubinhos. Arte chapada (que é o caso) cai de ~1000 pra ~100
//     instâncias por boneco. Sem isso, 30 mobs = 30k instâncias.
// Resultado: 1 draw call por personagem, como no tactics.
// ═══════════════════════════════════════════════════════════════════════════
const VOX_STEP = 2;        // px de amostragem
const VOX_ALPHA = 128;     // abaixo disso é sombra/anti-alias (a sombra do 2D é alpha .32 = 82)
const VOX_DEPTH = 2;       // profundidade em passos (dá volume sem virar bloco)
const NAME_Y = 1.45;       // altura do nome/barra acima dos pés (acima do boneco já escalado)
// Boneco +35%. NÃO é enfeite e NÃO é correção de bug: o sprite sai na escala EXATA do
// 2D (medido: 0.63×0.88 tile), mas em pé, visto com a câmera a 53°, a altura é
// encurtada por cos(53°)≈0.6 → ele LÊ como pequeno. O piloto do tactics bateu nisto e
// o dono pediu "+30%" no feedback F1 (UNIT_SCALE 1.3 lá). Escala a partir dos PÉS
// (mesh montada com y=0 no chão), então o boneco cresce pra cima sem flutuar.
const CHAR_SCALE = 1.35;

const _spriteCache = new Map();   // sig → {cells, maxGy} (a rasterização é o caro; isto é o cache)
const entGroups = new Map();      // chave da entidade → THREE.Group
const _texCache = new Map();
const _seen = new Set();          // reusado por frame (zero alocação no laço)

// pixels → corridas horizontais de mesma cor
function spriteCells(img, side) {
    const N = Math.floor(side / VOX_STEP);
    const cells = [];
    let maxGy = 0;
    for (let gy = 0; gy < N; gy++) {
        let runStart = 0, runCol = -1;
        for (let gx = 0; gx <= N; gx++) {
            let col = -1;
            if (gx < N) {
                const px = gx * VOX_STEP + (VOX_STEP >> 1), py = gy * VOX_STEP + (VOX_STEP >> 1);
                const i = (py * side + px) * 4;
                if (img.data[i + 3] >= VOX_ALPHA) col = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
            }
            if (col !== runCol) {
                if (runCol >= 0) { cells.push({ gx: runStart, gy, run: gx - runStart, color: runCol }); if (gy > maxGy) maxGy = gy; }
                runStart = gx; runCol = col;
            }
        }
    }
    return { cells, maxGy };
}

function spriteFor(sig, make) {
    let s = _spriteCache.get(sig);
    if (!s) {
        if (_spriteCache.size > 200) _spriteCache.clear();   // teto: equip é combinatório
        s = spriteCells(make(), bridge.SIDE);
        _spriteCache.set(sig, s);
    }
    return s;
}

// cells → InstancedMesh (1 draw call). Pés no chão (maxGy = fileira mais baixa),
// centrado no tile e virado pra +Z (a câmera padrão olha do sul, como o 2D).
function makeVoxelMesh(s) {
    const { cells, maxGy } = s;
    if (!cells.length) return null;
    const TS = bridge.TS, PAD = bridge.PAD;
    const v = VOX_STEP / TS;
    const cx = PAD + TS / 2;                 // centro do tile em px do canvas
    const bottom = (maxGy + 1) * VOX_STEP;   // linha do chão em px do canvas
    const mat = new THREE.MeshLambertMaterial({ transparent: true });
    const inst = new THREE.InstancedMesh(GEO.voxel, mat, cells.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach((c, i) => {
        m4.makeScale(c.run * v, v, v * VOX_DEPTH);
        m4.setPosition(
            ((c.gx + c.run / 2) * VOX_STEP - cx) / TS,
            (bottom - (c.gy + 0.5) * VOX_STEP) / TS,
            0,
        );
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, col.setHex(c.color));
    });
    inst.scale.setScalar(CHAR_SCALE);   // cresce a partir dos pés (y=0), não flutua
    inst.castShadow = SHADOWS;
    return { inst, mat };
}

function textTexture(text, color) {
    const key = text + '|' + color;
    let tex = _texCache.get(key);
    if (!tex) {
        if (_texCache.size > 120) { for (const t of _texCache.values()) t.dispose(); _texCache.clear(); }
        const c = document.createElement('canvas');
        c.width = 256; c.height = 64;
        const g = c.getContext('2d');
        g.font = 'bold 34px monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.9)';
        g.strokeText(text, 128, 34);
        g.fillStyle = color; g.fillText(text, 128, 34);
        tex = new THREE.CanvasTexture(c);
        _texCache.set(key, tex);
    }
    return tex;
}

// grupo por entidade: voxels + barra de HP emoldurada + nome (billboards)
function makeEntGroup() {
    const g = new THREE.Group();
    const hp = new THREE.Group();
    const border = new THREE.Mesh(GEO.bar, new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.85, depthWrite: false }));
    border.scale.set(0.58, 0.1, 0.01); border.position.z = -0.006;
    const fg = new THREE.Mesh(GEO.bar, new THREE.MeshBasicMaterial({ color: 0x4caf50, depthWrite: false }));
    fg.scale.set(0.54, 0.06, 0.02);
    hp.add(border, fg);
    hp.position.y = NAME_Y;
    hp.visible = false;
    const nm = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    nm.scale.set(1.15, 0.29, 1);
    nm.position.y = NAME_Y + 0.16;
    nm.visible = false;
    g.add(hp, nm);
    g.userData = { hp, hpFg: fg, nm, sig: null, vox: null, mat: null };
    return g;
}

// desenha/atualiza UMA entidade. `sig` troca (equip/dir/cor) → remonta os voxels.
function syncEnt(key, sig, make, wx, wz, hpPct, name, nameColor, now) {
    let g = entGroups.get(key);
    if (!g) { g = makeEntGroup(); entGroups.set(key, g); scene.add(g); }
    const ud = g.userData;
    if (ud.sig !== sig) {
        if (ud.vox) { g.remove(ud.vox); ud.vox.dispose(); ud.mat.dispose(); ud.vox = null; }
        const r = makeVoxelMesh(spriteFor(sig, make));
        if (r) { ud.vox = r.inst; ud.mat = r.mat; g.add(r.inst); }
        ud.sig = sig;
    }
    g.position.set(wx, 0, wz);
    // billboards encaram a câmera
    if (hpPct != null) {
        ud.hp.visible = true;
        ud.hp.quaternion.copy(camera.quaternion);
        const p = Math.max(0, Math.min(1, hpPct));
        ud.hpFg.scale.x = Math.max(0.001, 0.54 * p);
        ud.hpFg.position.x = -(0.54 * (1 - p)) / 2;
        ud.hpFg.material.color.setHex(p > 0.5 ? 0x4caf50 : p > 0.25 ? 0xffaa00 : 0xcc3030);
    } else ud.hp.visible = false;
    if (name) {
        const tex = textTexture(name, nameColor || '#e0c060');
        if (ud.nm.material.map !== tex) { ud.nm.material.map = tex; ud.nm.material.needsUpdate = true; }
        ud.nm.visible = true;
    } else ud.nm.visible = false;
    return g;
}

function disposeEntGroup(g) {
    const ud = g.userData;
    if (ud.vox) { ud.vox.dispose(); ud.mat.dispose(); }
    ud.hp.children.forEach(c => c.material.dispose());
    ud.nm.material.dispose();
    scene.remove(g);
}

// ═══════════════════════════════════════════════════════════════════════════
// ETAPA 4 — JUICE (dano flutuante · partículas · morte · alvo)
// Os arrays (floatTexts/particles) continuam sendo criados e expirados pelo 2D —
// o 3D só LÊ. Assim nada duplica nem diverge, e o juice acompanha qualquer mudança
// de combate sem tocar aqui.
// Pools: depois de aquecidos, zero alocação por frame.
// ═══════════════════════════════════════════════════════════════════════════
const DEATH_BIT_MS = 620;
let floatPool = [], partPool = [], bitPool = [], targetRing = null;

function poolGet(pool, make) {
    for (const o of pool) if (!o.visible) { o.visible = true; return o; }
    const o = make();
    pool.push(o); scene.add(o);
    return o;
}
function poolReset(pool) { for (const o of pool) o.visible = false; }

// morte: o boneco "desmonta" numa rajada de cubinhos que voam, caem e somem.
// Cosmético → Math.random é ok (o 2D faz igual nas partículas).
function spawnDeathBits(wx, wz, color, now) {
    for (let i = 0; i < 10; i++) {
        const m = poolGet(bitPool, () => new THREE.Mesh(GEO.voxel, new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false })));
        m.material.color.setHex(color);
        m.material.opacity = 1;
        m.scale.setScalar(0.05 + Math.random() * 0.07);
        const ang = Math.random() * 6.283, sp = 0.015 + Math.random() * 0.05;
        m.position.set(wx + (Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.5, wz + (Math.random() - 0.5) * 0.3);
        m.userData = { vx: Math.cos(ang) * sp, vy: 0.05 + Math.random() * 0.06, vz: Math.sin(ang) * sp,
                       rvx: (Math.random() - 0.5) * 0.4, rvy: (Math.random() - 0.5) * 0.4, t0: now };
    }
}
function updateDeathBits(now) {
    for (const m of bitPool) {
        if (!m.visible) continue;
        const d = m.userData, t = (now - d.t0) / DEATH_BIT_MS;
        if (t >= 1) { m.visible = false; continue; }
        d.vy -= 0.006;
        m.position.x += d.vx; m.position.y += d.vy; m.position.z += d.vz;
        if (m.position.y < 0.03) { m.position.y = 0.03; d.vy = 0; d.vx *= 0.6; d.vz *= 0.6; }
        m.rotation.x += d.rvx; m.rotation.y += d.rvy;
        m.material.opacity = 1 - t * t;
    }
}

function drawJuice(now) {
    const TS = bridge.TS;

    // dano flutuante — sprites de texto subindo e sumindo (o 2D usa life 900→0)
    poolReset(floatPool);
    for (const f of bridge.getFloats()) {
        const fx = f.entity ? f.entity.renderX : f.x;
        const fy = f.entity ? f.entity.renderY : f.y;
        if (fx == null || Math.abs(fx - camTarget.x) > RAD || Math.abs(fy - camTarget.z) > RAD) continue;
        const age = 1 - Math.max(0, Math.min(1, f.life / 900));
        const sp = poolGet(floatPool, () => new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })));
        const tex = textTexture(f.text, f.color);
        if (sp.material.map !== tex) { sp.material.map = tex; sp.material.needsUpdate = true; }
        const big = (f.size || 14) >= 20;
        const pop = 1 + Math.max(0, 0.4 - age * 3);        // nasce maior e assenta
        sp.scale.set((big ? 1.5 : 1.05) * pop, (big ? 0.38 : 0.26) * pop, 1);
        sp.material.opacity = 1 - age * age;
        sp.position.set(fx + 0.5, 1.5 + age * 0.9 - (f.offsetY || 0) / TS, fy + 0.5);
        sp.renderOrder = 900;
    }

    // partículas — o 2D desenha 3×3px; aqui viram cubinhos girando
    poolReset(partPool);
    let pi = 0;
    for (const p of bridge.getParticles()) {
        if (Math.abs(p.x - camTarget.x) > RAD || Math.abs(p.y - camTarget.z) > RAD) continue;
        const a = Math.max(0, p.life / p.maxLife);
        const m = poolGet(partPool, () => new THREE.Mesh(GEO.voxel, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
        m.material.color.set(p.color);
        m.material.opacity = a;
        m.scale.setScalar(0.06 * (0.45 + 0.55 * a));
        m.rotation.set((1 - a) * 5 + pi * 1.7, (1 - a) * 7 + pi, 0);
        m.position.set(p.x + 0.5, 0.55 + (1 - a) * 0.4, p.y + 0.5);
        pi++;
    }

    updateDeathBits(now);
}

// ═══════════════════════════════════════════════════════════════════════════
// ETAPA 3 — ATMOSFERA (dia/noite · tochas · masmorra)
// Porta drawLighting/drawDayNightTint do 2D. A diferença é que o 2D pinta um
// canvas de escuridão e RECORTA círculos de luz (_carve); aqui a luz é DE VERDADE
// — sol direcional que percorre o céu + PointLight nas tochas e no player. As
// FÓRMULAS (rampas t/t2 da masmorra, darkness, tint) são as mesmas do 2D, lidas
// pela ponte, então o 3D acompanha qualquer ajuste que o dono peça no 2D.
// ═══════════════════════════════════════════════════════════════════════════
const SUN_I = 3.4, HEMI_I = 2.2;      // calibrados na Etapa 1 (irradiância ≈ π = tom do 2D)
const TORCH_MAX = 10;                 // teto de PointLight (cada uma custa no shader de cada fragmento)
let torchPool = [], playerLight = null, tintQuad = null;
const DAY_SKY = 0x8fa8cf, NIGHT_SKY = 0x2c3a5e;
const DAY_GND = 0x35301f, NIGHT_GND = 0x14161f;
const DAY_FOG = 0x28405c;

function buildAtmosphere() {
    // luz do player: no 2D é o _carve(ppx,ppy,6*TS). Aqui é uma PointLight morna.
    playerLight = new THREE.PointLight(0xffd9a0, 0, 9, 1.6);
    scene.add(playerLight);
    for (let i = 0; i < TORCH_MAX; i++) {
        const l = new THREE.PointLight(0xffa447, 0, 7, 1.7);
        l.visible = false;
        torchPool.push(l);
        scene.add(l);
    }
    // tint de cor (dia/noite e banho da masmorra) — quad colado na câmera, como o
    // fillRect de tela cheia do drawDayNightTint. É GRADAÇÃO, não escuridão: quem
    // escurece são as luzes.
    tintQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }),
    );
    tintQuad.position.z = -0.62;
    tintQuad.renderOrder = 999;
    camera.add(tintQuad);
}

function applyAtmosphere(now) {
    const player = bridge.getPlayer();
    const floor = player.floor || 0;
    const day = bridge.getDayPhase();
    const inCaveNow = bridge.inCave(Math.floor(player.x), Math.floor(player.y));
    const FULL = bridge.DUNGEON_TINT_FULL || 5;

    let darkness, lightScale = 1, tintR, tintG, tintB, tintA, fogCol, skyDark;

    if (floor >= 1) {
        // rampas idênticas às do 2D (play.html drawLighting/drawDayNightTint)
        const t = Math.min(1, (floor - 1) / Math.max(1, FULL - 1));
        const t2 = Math.min(1, Math.max(0, floor - FULL) / 15);
        darkness = 0.66 + 0.20 * t + 0.06 * t2;
        lightScale = 1 - 0.14 * t - 0.08 * t2;
        tintR = Math.round(70 + 70 * t + 20 * t2); tintG = 14; tintB = Math.round(54 + 8 * t);
        tintA = 0.05 + 0.09 * t + 0.04 * t2;
        fogCol = (Math.round(14 + 28 * t + 18 * t2) << 16) | (8 << 8) | Math.round(22 + 10 * t);
        skyDark = 1;
    } else if (inCaveNow) {
        darkness = Math.max(0.78, day.darkness);
        tintR = day.tintR; tintG = day.tintG; tintB = day.tintB; tintA = day.tintA;
        fogCol = 0x0a0812;
        skyDark = 1;
    } else {
        darkness = day.darkness;
        tintR = day.tintR; tintG = day.tintG; tintB = day.tintB; tintA = day.tintA;
        fogCol = mix(DAY_FOG, 0x0b1020, darkness);
        skyDark = darkness;
    }

    const lit = clamp(1 - darkness, 0, 1);

    // ── sol: percorre o céu pela HORA do jogo (6h nasce a leste, 12h a pino, 18h põe)
    const a = ((day.hour - 6) / 12) * Math.PI;
    const h = Math.sin(a);
    sun.position.set(camTarget.x + Math.cos(a) * 15, camTarget.y + Math.max(1.5, h * 17), camTarget.z - 9);
    sun.target.position.set(camTarget.x, 0, camTarget.z);
    sun.target.updateMatrixWorld();
    // laranja rasante no nascer/pôr, branco-quente a pino
    const horizon = 1 - Math.min(1, Math.abs(h) * 2.2);
    sun.color.setHex(mix(0xfff2d0, 0xff8a3c, horizon));
    sun.intensity = (floor >= 1 || inCaveNow) ? 0 : SUN_I * lit;
    sun.castShadow = SHADOWS && sun.intensity > 0.2;

    // ── preenchimento: some de noite/na masmorra, mas nunca zera (senão fica cego)
    hemi.intensity = HEMI_I * (0.14 + 0.86 * lit);
    hemi.color.setHex(mix(DAY_SKY, NIGHT_SKY, darkness));
    hemi.groundColor.setHex(mix(DAY_GND, NIGHT_GND, darkness));

    // ── céu/névoa: o domo é MeshBasic com map → a cor MULTIPLICA a textura.
    // Escurecer assim é de graça (nada de regerar o gradiente por frame).
    const sd = 1 - skyDark * 0.92;
    skyMat.color.setRGB(sd, sd, sd * (1 - skyDark * 0.55));
    scene.fog.color.setHex(fogCol);
    renderer.setClearColor(fogCol);
    // ⚠️ A névoa TEM que ser medida a partir da DISTÂNCIA DA CÂMERA, não em números
    // fixos: o chão sob o player já está a ~ORBIT.dist de profundidade. Com `far`
    // fixo em 12.6 (< dist 13.5) o mundo inteiro caía atrás do fim da névoa e a tela
    // virava uma parede de cor chapada. Assim também acompanha o zoom da roda.
    const D = ORBIT.dist;
    if (floor >= 1 || inCaveNow) { scene.fog.near = D * 0.80; scene.fog.far = D + 9 * lightScale; }
    else { scene.fog.near = D + 2; scene.fog.far = D + 19; }

    // ── luz do player (o _carve do 2D): raio espelha o 5.2/4.5/6 tiles do 2D
    const pr = floor >= 1 ? 5.2 * lightScale : (inCaveNow ? 4.5 : 6);
    playerLight.position.set(player.renderX + 0.5, 1.1, player.renderY + 0.5);
    playerLight.distance = pr * 1.5;
    // de dia a céu aberto ela é desnecessária — só acende conforme escurece
    playerLight.intensity = 3.2 * Math.min(1, darkness * 1.25);

    // ── tochas → PointLight com flicker (o 2D usa sin(waterT*3 + x + y))
    let ti = 0;
    for (const t of bridge.activeTorches()) {
        if (ti >= TORCH_MAX) break;
        if (Math.abs(t.x - camTarget.x) > RAD || Math.abs(t.y - camTarget.z) > RAD) continue;
        const l = torchPool[ti++];
        l.visible = true;
        l.position.set(t.x + 0.5, 1.3, t.y + 0.5);
        const flick = Math.sin(_waterT * 3 + t.x + t.y) * 0.12;
        l.intensity = (2.6 + flick) * Math.min(1, darkness * 1.4);
        l.distance = 7.5 + flick * 4;
    }
    for (let i = ti; i < TORCH_MAX; i++) torchPool[i].visible = false;

    // ── tint (gradação de cor) — mesmos números do drawDayNightTint.
    // Na masmorra entra pela METADE: no 2D esse tint cai sobre uma imagem já
    // texturizada e escurecida por overlay; aqui quem escurece são as LUZES, e o
    // quad em cima de uma cena quase preta vira uma parede de roxo chapado. A
    // metade preserva a leitura de profundidade sem achatar a cena.
    const ta = floor >= 1 ? tintA * 0.5 : tintA;
    tintQuad.material.opacity = ta < 0.02 ? 0 : ta;
    if (ta >= 0.02) tintQuad.material.color.setRGB(tintR / 255, tintG / 255, tintB / 255);
}

// ─── overlay + resize ──────────────────────────────────────────────────────
// Mantém o canvas 3D casado com o RETÂNGULO do canvas 2D (que é 720×528 interno
// mas exibido em 960×704 via CSS — e 100vw no mobile). O offsetParent é o
// #gameContainer (position:relative), então offsetLeft/Top já são as coords certas.
let _lw = 0, _lh = 0, _lx = -1, _ly = -1;
function syncOverlay() {
    const w = hostCanvas.clientWidth, h = hostCanvas.clientHeight;
    const x = hostCanvas.offsetLeft, y = hostCanvas.offsetTop;
    if (!w || !h) return;
    if (x !== _lx || y !== _ly) {
        // `important` porque o CSS de mobile do play.html tem
        //   #gameContainer canvas { width:100vw !important; height:auto !important }
        // e esse seletor pega o canvas 3D também (ele é um <canvas> no mesmo pai).
        // Inline+important é a única declaração que vence !important de folha.
        canvas3d.style.setProperty('left', x + 'px', 'important');
        canvas3d.style.setProperty('top', y + 'px', 'important');
        _lx = x; _ly = y;
    }
    if (w === _lw && h === _lh) return;
    _lw = w; _lh = h;
    canvas3d.style.setProperty('width', w + 'px', 'important');
    canvas3d.style.setProperty('height', h + 'px', 'important');
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

// ─── o frame ───────────────────────────────────────────────────────────────
export function drawScene3d(now, dt) {
    if (!ready || !bridge) return;
    syncOverlay();

    const map = bridge.getMap();
    const player = bridge.getPlayer();
    const floor = player.floor || 0;

    // Alvo da câmera = CENTRO do viewport 2D. Reusar getCamera() de graça herda o
    // clamp nas bordas do mapa E o modo spectator (câmera segue o killer ao morrer).
    const cam = bridge.getCamera();
    const tx = cam.x + bridge.VP_W / 2, tz = cam.y + bridge.VP_H / 2;
    camTarget.x += (tx - camTarget.x) * CAM_LERP;
    camTarget.z += (tz - camTarget.z) * CAM_LERP;
    updateCamera();

    // janela de tiles: só refaz quando o centro inteiro muda / trocou mapa ou andar
    const cx = Math.round(camTarget.x), cy = Math.round(camTarget.z);
    if (cx !== _winX || cy !== _winY || map !== _mapRef || floor !== _floorRef) {
        rebuildWindow(cx, cy, map);
    }

    // o céu acompanha a câmera (o shadow map de ±15 tiles cobre só a janela)
    skyDome.position.set(camTarget.x, 0, camTarget.z);

    // água ondulando — o 2D usa waterT; aqui a cor global pulsa (sem custo por tile)
    _waterT += (dt || 16) * 0.002;
    const wv = (Math.sin(_waterT) + 1) / 2;
    mWater.material.color.setHex(mix(0x123f7a, 0x1d5399, wv));

    // Etapa 3: dia/noite, tochas, masmorra (depende do _waterT pro flicker)
    applyAtmosphere(now);

    // ─── ETAPA 2: personagens ───
    // Filtra pela JANELA (não pelo viewport 2D): a câmera 3D orbita e afasta, então
    // enxerga mais que os 15×11 tiles do 2D.
    const seen = _seen; seen.clear();
    const near = (ex, ey) => Math.abs(ex - cx) <= RAD && Math.abs(ey - cy) <= RAD;

    for (const m of bridge.getMonsters()) {
        if (m.hp <= 0) continue;
        const ex = m.renderX ?? m.x, ey = m.renderY ?? m.y;
        if (!near(ex, ey)) continue;
        const key = 'm' + m.id;
        seen.add(key);
        const g = syncEnt(key, 'mob|' + m.color + '|' + m.size, () => bridge.mobSprite(m.color, m.size),
            ex + 0.5, ey + 0.5, m.maxHp > 0 ? m.hp / m.maxHp : null,
            m.name, m.unique ? '#ffcc40' : (m.aggro ? '#ff8060' : '#aaaaaa'), now);
        g.userData.bitColor = m.color;
    }

    const remotes = bridge.getRemotePlayers();
    for (const id in remotes) {
        const p = remotes[id];
        const ex = p.renderX ?? p.x, ey = p.renderY ?? p.y;
        if (!near(ex, ey)) continue;
        if ((p.floor || 0) !== floor) continue;
        const key = 'p' + id;
        seen.add(key);
        // mesmíssima composição de equip do 2D (play.html ~16809) — inclusive a cor
        // de corpo por estado (fantasma / PvP ligado)
        const bodyCol = p.ghost ? '#3a3a3a' : (p.pvp ? '#5a1a1a' : '#1a3a5a');
        const eq = bridge.withCosmetics(
            { ...(p.equipped || { weapon: 'ESPADA' }), bodyColor: bodyCol, dyes: p.dyes || null }, p.cosmetic);
        const dir = p.dir || 'down';
        const hpPct = (p.maxHp > 0) ? (p.hp ?? p.maxHp) / p.maxHp : 1;
        syncEnt(key, bridge.equipSig(eq, dir), () => bridge.playerSprite(eq, dir),
            ex + 0.5, ey + 0.5, hpPct < 1 ? hpPct : null,
            p.name, (p.equipped && p.equipped.nameColor) || '#e0c060', now);
    }

    // o player local: sem nome nem barra (a sidebar/HUD 2D já mostram)
    {
        const eq = bridge.withCosmetics({ ...player.equipped, bodyColor: player.color, dyes: player.dyes || null });
        seen.add('self');
        const g = syncEnt('self', bridge.equipSig(eq, player.dir), () => bridge.playerSprite(eq, player.dir),
            player.renderX + 0.5, player.renderY + 0.5, null, null, null, now);
        g.userData.bitColor = 0xbfc7cf;
    }

    // Quem sumiu solta os recursos de GPU. E se sumiu BEM DENTRO da janela, morreu
    // (mob não teleporta) → desmonta em cubinhos. Perto da borda é só quem andou pra
    // fora do alcance — esse sai sem explodir.
    for (const [k, g] of entGroups) if (!seen.has(k)) {
        const ud = g.userData;
        if (Math.abs(g.position.x - cx) < RAD - 3 && Math.abs(g.position.z - cy) < RAD - 3 && k !== 'self') {
            spawnDeathBits(g.position.x, g.position.z, ud.bitColor || 0xbfc7cf, now);
        }
        disposeEntGroup(g); entGroups.delete(k);
    }

    // marcador de alvo (anel pulsando no chão)
    {
        const t = player.target;
        let te = null;
        if (t != null && player.targetType === 'player') te = remotes[t];
        else if (t != null) te = bridge.getMonsters().find(m => m.id === t && m.hp > 0);
        if (te) {
            targetRing.visible = true;
            targetRing.position.set((te.renderX ?? te.x) + 0.5, 0.05, (te.renderY ?? te.y) + 0.5);
            targetRing.material.opacity = 0.55 + 0.35 * Math.sin(now / 190);
        } else targetRing.visible = false;
    }

    drawJuice(now);
    renderer.render(scene, camera);
}

// ─── diagnóstico — é PRA ISSO que a Etapa 1 existe ─────────────────────────
// No console do jogo: __r3d.r3dInfo()
export function r3dInfo() {
    if (!ready) return null;
    return {
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles,
        instances: { floor: mFloor.count, water: mWater.count, trunk: mTrunk.count, canopy: mCanopy.count, wall: mWall.count },
        chars: entGroups.size,
        charKeys: [...entGroups.keys()],
        voxPorChar: [...entGroups.values()].map(g => g.userData.vox ? g.userData.vox.count : 0),
        spriteCache: _spriteCache.size,
        drawSize: { w: _lw, h: _lh, dpr: renderer.getPixelRatio() },
        shadows: SHADOWS,
        window: { x: _winX, y: _winY, rad: RAD },
        camTarget: { x: +camTarget.x.toFixed(2), z: +camTarget.z.toFixed(2) },
        orbit: { yaw: +ORBIT.yaw.toFixed(3), pitch: +ORBIT.pitch.toFixed(3), dist: +ORBIT.dist.toFixed(2) },
    };
}
