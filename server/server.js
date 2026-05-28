// ═════════════════════════════════════════════════════════════════════════════
// VALADARES - Servidor Multiplayer (autoritativo de mobs)
// ═════════════════════════════════════════════════════════════════════════════
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 8080;

// HTTP server compartilhado com WS upgrade + endpoints REST (webhook MP, criar PIX, health)
const httpServer = http.createServer((req, res) => handleHttpRequest(req, res));
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT);

// MercadoPago SDK (carregamento lazy — só se token configurado)
let mpClient = null;
let mpPreference = null;
let mpPayment = null;
const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_BASE_URL = process.env.MP_BASE_URL || `https://ws.valadares.app.br`;
// Secret do webhook MP — configurado no painel MP em "Webhooks → Configurar notificações → Segredo".
// Quando setado, valida x-signature de toda chamada em /webhook/mp (HMAC-SHA256). Sem secret = sem validação (modo dev/compat).
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';
let _mpSecretWarned = false;
if (MP_TOKEN){
    try {
        const mercadopago = require('mercadopago');
        mpClient = new mercadopago.MercadoPagoConfig({ accessToken: MP_TOKEN });
        mpPreference = new mercadopago.Preference(mpClient);
        mpPayment = new mercadopago.Payment(mpClient);
        console.log('[mp] SDK carregado (sandbox=' + MP_TOKEN.startsWith('TEST-') + ' ou TEST-prefixed app_usr)');
    } catch (e) {
        console.warn('[mp] erro ao carregar SDK:', e.message);
    }
} else {
    console.log('[mp] MP_ACCESS_TOKEN não setado — integração desabilitada');
}

// Pacotes de gold (preço em centavos R$, qty de gold in-game)
const GOLD_PACKAGES = {
    'p10':  { gold:  10_000, priceCents:  1000, title: '10.000 Gold' },
    'p30':  { gold:  30_000, priceCents:  2500, title: '30.000 Gold' },
    'p100': { gold: 100_000, priceCents:  7000, title: '100.000 Gold' },
    'p300': { gold: 300_000, priceCents: 18000, title: '300.000 Gold' },
};

// Mapa de pendências: paymentId -> { playerName, packageId, gold, status }
const mpPayments = new Map();

// ─── HTTP handlers ──────────────────────────────────────────────────────
function httpJson(res, status, body){
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req){
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => { raw += c; if (raw.length > 200_000) req.destroy(); });
        req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch(e){ reject(e); } });
        req.on('error', reject);
    });
}
async function handleHttpRequest(req, res){
    if (req.method === 'OPTIONS'){ return httpJson(res, 204, ''); }
    if (req.method === 'GET' && req.url === '/health'){ return httpJson(res, 200, { ok:true }); }
    if (req.method === 'GET' && req.url === '/api/packages'){
        return httpJson(res, 200, { packages: GOLD_PACKAGES });
    }
    if (req.method === 'POST' && req.url === '/api/password-reset/request'){
        try {
            const body = await readBody(req);
            const email = String(body.email || '').trim().toLowerCase();
            // Resposta opaca: sempre 200 com ok:true (não revela se email existe)
            if (!isValidEmail(email)) return httpJson(res, 200, { ok: true });
            const acc = findAccountByEmail(email);
            if (acc){
                const now = Date.now();
                if (!acc.resetToken || !acc.resetToken.requestedAt || now - acc.resetToken.requestedAt >= RESET_REQUEST_COOLDOWN_MS){
                    const token = generateResetToken();
                    acc.resetToken = { token, expiresAt: now + RESET_TOKEN_TTL_MS, requestedAt: now };
                    queueSaveAccounts();
                    // Usa ?t= (não ?token=) pra evitar corrupção do `=` em transit
                    // de email (quoted-printable encoders trocam por replacement char).
                    const resetUrl = `${SITE_BASE_URL}/reset?t=${token}`;
                    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222"><h2 style="color:#8b2020">Valadares — Recuperação de senha</h2><p>Olá <b>${acc.name}</b>,</p><p>Recebemos uma solicitação pra redefinir a senha da sua conta. Clica no link abaixo nos próximos 60 minutos:</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#d4a847;color:#0a0805;text-decoration:none;border-radius:4px;font-weight:600">Redefinir senha</a></p><p style="color:#666;font-size:13px">Se não funcionar, copie: <br><code>${resetUrl}</code></p><p style="color:#666;font-size:13px">Se você não pediu, ignore — sua senha continua a mesma.</p></div>`;
                    sendEmail(acc.email, 'Valadares — Redefinir sua senha', html).then(r => {
                        if (!r.ok) console.error(`[reset http] email pra ${acc.email} falhou:`, r.error);
                    });
                }
            }
            return httpJson(res, 200, { ok: true });
        } catch (e){ return httpJson(res, 400, { error:'invalid_body' }); }
    }
    if (req.method === 'POST' && req.url === '/api/password-reset/confirm'){
        try {
            const body = await readBody(req);
            const token = String(body.token || '');
            const pwHash = String(body.pwHash || '');
            if (!token || !pwHash) return httpJson(res, 400, { ok:false, error:'missing_fields' });
            let acc = null;
            for (const a of accounts.values()){
                if (a.resetToken && a.resetToken.token === token){ acc = a; break; }
            }
            if (!acc || !acc.resetToken || acc.resetToken.expiresAt < Date.now()){
                return httpJson(res, 400, { ok:false, error:'invalid_or_expired' });
            }
            acc.pwHash = hashPwServer(pwHash);
            acc.resetToken = null;
            queueSaveAccounts();
            console.log(`[reset http] senha trocada pra conta ${acc.name}`);
            return httpJson(res, 200, { ok:true, name: acc.name });
        } catch (e){ return httpJson(res, 400, { error:'invalid_body' }); }
    }
    if (req.method === 'GET' && req.url.startsWith('/api/ranking')){
        // Ranking público — espelha o flow WS getRanking. Usado por /ranking.html
        // (página pública pra SEO + retenção).
        const url = new URL(req.url, 'http://localhost');
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 20));
        return httpJson(res, 200, {
            mobs:   topRanking('mobKills',  limit),
            pvp:    topRanking('pkKills',   limit),
            bosses: topRanking('bossKills', limit),
            gold:   topRanking('gold',      limit),
            guilds: topGuildRanking(limit),
            season: {
                id: seasonState.id,
                top: topSeason(limit),
                archive: seasonState.archive.slice(0, 12),
            },
            updatedAt: Date.now(),
        });
    }
    if (req.method === 'POST' && req.url === '/api/pix/create'){
        try {
            const body = await readBody(req);
            return handleCreatePix(body, res);
        } catch (e){ return httpJson(res, 400, { error:'invalid_body' }); }
    }
    if (req.method === 'POST' && req.url.startsWith('/webhook/mp')){
        try {
            const body = await readBody(req);
            return handleMpWebhook(body, req, res);
        } catch (e){ return httpJson(res, 200, { received:true }); }   // sempre 200 pro MP não re-tentar infinito
    }
    return httpJson(res, 404, { error:'not_found' });
}

// Valida email — regex bem permissiva, alinhada com a do cliente.
function _isValidEmail(s){
    s = String(s || '').trim();
    if (s.length < 5 || s.length > 120) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function handleCreatePix(body, res){
    if (!mpPreference){
        return httpJson(res, 503, { error:'mp_not_configured' });
    }
    const playerName = String(body.playerName || '').trim().substring(0, 14);
    const packageId  = String(body.packageId || '');
    const email      = String(body.email || '').trim().substring(0, 120);
    if (!playerName){ return httpJson(res, 400, { error:'missing_player' }); }
    if (!GOLD_PACKAGES[packageId]){ return httpJson(res, 400, { error:'invalid_package' }); }
    if (!_isValidEmail(email)){ return httpJson(res, 400, { error:'invalid_email' }); }
    const pkg = GOLD_PACKAGES[packageId];
    // Persiste email no save da conta — próxima compra desse player vem pré-preenchida
    try {
        const acc = typeof getAccount === 'function' ? getAccount(playerName) : null;
        if (acc && acc.save && acc.save.email !== email){
            acc.save.email = email;
            if (typeof flushAccounts === 'function') flushAccounts();
        }
    } catch (e){ /* não bloqueia compra se o save falhar */ }
    // Checkout Pro (Preference API) — abre página do MP onde o player paga via PIX.
    // Mais robusto que Payment API: não exige homologação da conta.
    try {
        const preference = await mpPreference.create({
            body: {
                items: [{
                    id: packageId,
                    title: pkg.title,
                    description: `Valadares — ${pkg.title} para ${playerName}`,
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: pkg.priceCents / 100,
                }],
                payer: { email },
                payment_methods: {
                    // PIX + cartão de crédito + cartão de débito habilitados.
                    // Exclui só boleto (ticket) — demora 1-3 dias úteis e atrasa o crédito de gold.
                    excluded_payment_types: [
                        { id: 'ticket' },
                    ],
                    installments: 1,   // 1× sem juros (simplifica preço)
                },
                notification_url: `${MP_BASE_URL}/webhook/mp`,
                external_reference: `${playerName}|${packageId}`,
                metadata: { playerName, packageId, gold: pkg.gold, email },
                back_urls: {
                    success: `https://valadares-xi.vercel.app/?pix=success`,
                    failure: `https://valadares-xi.vercel.app/?pix=failure`,
                    pending: `https://valadares-xi.vercel.app/?pix=pending`,
                },
            },
        });
        mpPayments.set(String(preference.id), { playerName, packageId, gold: pkg.gold, status: 'pending', kind: 'preference' });
        return httpJson(res, 200, {
            preferenceId: preference.id,
            initPoint: preference.init_point,
            sandboxInitPoint: preference.sandbox_init_point,
        });
    } catch (e){
        console.warn('[mp] erro ao criar preference:', e.message);
        console.warn('[mp] erro completo:', JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 2000));
        const detail = e.cause?.[0]?.description || e.cause?.[0]?.message || e.message;
        return httpJson(res, 500, { error:'create_failed', detail, message: e.message, cause: e.cause || null });
    }
}

// Valida assinatura HMAC do webhook MP.
// Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (data.id vem da query string da URL, lowercase).
// Header x-signature formato: `ts=TIMESTAMP,v1=HEX_HASH`. Retorna { ok, reason }.
function validateMpSignature(req){
    if (!MP_WEBHOOK_SECRET){
        if (!_mpSecretWarned){
            console.warn('[mp] MP_WEBHOOK_SECRET não configurado — webhook aceita qualquer POST (modo compat).');
            _mpSecretWarned = true;
        }
        return { ok:true, reason:'no_secret' };
    }
    const sig = req.headers['x-signature'];
    const reqId = req.headers['x-request-id'];
    if (!sig || !reqId){ return { ok:false, reason:'missing_headers' }; }
    // Parse "ts=...,v1=..."
    let ts = '', v1 = '';
    for (const part of String(sig).split(',')){
        const [k, ...rest] = part.trim().split('=');
        const v = rest.join('=');
        if (k === 'ts') ts = v;
        else if (k === 'v1') v1 = v;
    }
    if (!ts || !v1){ return { ok:false, reason:'bad_signature_format' }; }
    // data.id vem na query string. URL já é relativa (`/webhook/mp?data.id=123&type=payment`).
    let dataId = '';
    try {
        const u = new URL(req.url, 'http://x');
        dataId = u.searchParams.get('data.id') || '';
    } catch(_){}
    if (!dataId){ return { ok:false, reason:'missing_data_id' }; }
    const manifest = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
    // timingSafeEqual exige Buffers do mesmo tamanho
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    if (a.length !== b.length){ return { ok:false, reason:'hash_mismatch' }; }
    if (!crypto.timingSafeEqual(a, b)){ return { ok:false, reason:'hash_mismatch' }; }
    return { ok:true };
}

async function handleMpWebhook(body, req, res){
    // Validação HMAC antes de qualquer coisa. Se falhar, responde 200 (não vaza info) mas pula processamento.
    const v = validateMpSignature(req);
    if (!v.ok){
        console.warn(`[mp] webhook REJEITADO (${v.reason}) — url=${req.url} from=${req.socket.remoteAddress}`);
        return httpJson(res, 200, { received:true });
    }
    // MP manda 2 formatos: { topic, id, resource } (IPN antigo) ou { type:'payment', data:{id} } (Webhooks v2)
    const paymentId = String(body?.data?.id || body?.id || '');
    if (!paymentId || !mpPayment){ return httpJson(res, 200, { received:true }); }
    try {
        const payment = await mpPayment.get({ id: paymentId });
        const status = payment.status;
        // external_reference é mais confiável que metadata em Preference→Payment
        const ref = payment.external_reference || '';
        const [refName, refPkg] = ref.split('|');
        let playerName = refName || payment.metadata?.player_name || payment.metadata?.playerName;
        let gold = 0;
        if (refPkg && GOLD_PACKAGES[refPkg]){ gold = GOLD_PACKAGES[refPkg].gold; }
        else if (payment.metadata?.gold){ gold = payment.metadata.gold | 0; }
        const pending = mpPayments.get(paymentId) || { playerName, gold };
        pending.status = status;
        pending.playerName = pending.playerName || playerName;
        pending.gold = pending.gold || gold;
        mpPayments.set(paymentId, pending);
        console.log(`[mp] webhook payment=${paymentId} status=${status} ref=${ref} player=${pending.playerName} gold=${pending.gold}`);
        if (status === 'approved' && pending.playerName && pending.gold > 0 && !pending.credited){
            pending.credited = true;
            creditGoldToPlayer(pending.playerName, pending.gold, paymentId);
        }
    } catch (e){
        console.warn('[mp] erro no webhook:', e.message);
    }
    return httpJson(res, 200, { received:true });
}

function creditGoldToPlayer(playerName, gold, paymentId){
    // Procura player online primeiro; se offline, persiste no accounts.json
    let credited = false;
    for (const p of players.values()){
        if (p.disconnected) continue;
        if (p.name.toLowerCase() === playerName.toLowerCase()){
            p.gold = (p.gold || 0) + gold;
            syncGoldRank(p.name, p.gold);
            // goldDelta no invUpdate já dispara toast + log + float + som no cliente.
            // Não duplicar com serverMsg aqui.
            sendInvUpdate(p, { goldDelta:{ amount: gold, reason:'pix', paymentId } });
            credited = true;
            console.log(`[mp] gold creditado online: ${playerName} +${gold} (payment ${paymentId})`);
            break;
        }
    }
    if (!credited){
        // Player offline — persiste no accounts.json (próximo login carrega)
        try {
            const acc = getAccount(playerName);
            if (acc && acc.save){
                acc.save.gold = (acc.save.gold || 0) + gold;
                acc.save._pendingPixCredit = (acc.save._pendingPixCredit || 0) + gold;
                if (typeof flushAccounts === 'function') flushAccounts();
                console.log(`[mp] gold creditado offline (save): ${playerName} +${gold} (payment ${paymentId})`);
            } else {
                console.warn(`[mp] player não encontrado pra creditar: ${playerName} +${gold}`);
            }
        } catch (e){
            console.warn('[mp] erro ao persistir credit offline:', e.message);
        }
    }
}

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
    SENHOR_VALADARES: { hp:18000, dmg:75, speed:240, xp:10000, aggro:12, unique:true, mega:true, intel:3 },
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

// ─── ITEM META (espelho mínimo do ITEMS do cliente) ─────────────────────
// Só os campos que server precisa pra validar mutações: kind + valores.
// Mantém em paridade com index.html — mudou lá, atualiza aqui.
const ITEM_META = {
    // consumíveis
    CHEESE:   { kind:'food', heal:15 },
    EGG:      { kind:'food', heal:25 },
    MEAT:     { kind:'food', heal:45 },
    HAM:      { kind:'food', heal:75 },
    POTION:   { kind:'potion', heal:60 },
    POTION_MP:{ kind:'potion', manaheal:50 },
    CARNE_LAGARTO: { kind:'food', heal:35 },
    BENCAO_FENIX:  { kind:'blessing' },
    // mats
    SILK:{kind:'mat'}, ASA_MORCEGO:{kind:'mat'}, OSSO:{kind:'mat'}, CHIFRE:{kind:'mat'},
    ESCAMA:{kind:'mat'}, GARRA:{kind:'mat'}, PEDRA_GOLEM:{kind:'mat'}, ESSENCIA:{kind:'mat'},
    // armas 1H
    ADAGA:        { kind:'weapon', hand:'1h', base:3, def:1 },
    ESPADA:       { kind:'weapon', hand:'1h', base:4, def:2 },
    PORRETE:      { kind:'weapon', hand:'1h', base:3, def:1 },
    CLAVA:        { kind:'weapon', hand:'1h', base:4, def:1 },
    MACA:         { kind:'weapon', hand:'1h', base:5, def:2 },
    SABRE:        { kind:'weapon', hand:'1h', base:6, def:2 },
    ADAGA_DUPLA:  { kind:'weapon', hand:'1h', base:5, def:1 },
    BORDAO:       { kind:'weapon', hand:'1h', base:6, def:2 },
    ESPADA_OSSO:  { kind:'weapon', hand:'1h', base:5, def:2 },
    LANCA:        { kind:'weapon', hand:'1h', base:4, def:1, throwable:5 },
    LANCA_LONGA:  { kind:'weapon', hand:'1h', base:5, def:2, throwable:6 },
    // armas 2H
    MACHADO:      { kind:'weapon', hand:'2h', base:8, def:3 },
    ESPADA_LONGA: { kind:'weapon', hand:'2h', base:7, def:4 },
    MARTELO:      { kind:'weapon', hand:'2h', base:7, def:2 },
    MARRETA:      { kind:'weapon', hand:'2h', base:10, def:1 },
    MACA_GIGANTE: { kind:'weapon', hand:'2h', base:8, def:4 },
    MACHADO_MINO: { kind:'weapon', hand:'2h', base:11, def:4 },
    ESPADA_DRACO: { kind:'weapon', hand:'2h', base:14, def:5 },
    MARTELO_GOLEM:{ kind:'weapon', hand:'2h', base:13, def:6 },
    ESPADA_HL:    { kind:'weapon', hand:'2h', base:20, def:8 },
    ESPADA_ETERNA:{ kind:'weapon', hand:'2h', base:30, def:12 },
    // ranged
    ARCO:      { kind:'weapon', hand:'2h', base:4, def:1, ranged:6 },
    ARCO_CACA: { kind:'weapon', hand:'2h', base:6, def:1, ranged:7 },
    BESTA:     { kind:'weapon', hand:'2h', base:9, def:2, ranged:8 },
    // offhand/armaduras
    ESCUDO_MAD:   { kind:'offhand', def:3 },
    ESCUDO_FERRO: { kind:'offhand', def:6 },
    ESCUDO_OSSO:  { kind:'offhand', def:5 },
    ESCUDO_PEDRA: { kind:'offhand', def:8 },
    COURO:           { kind:'armor', def:2 },
    ARMADURA:        { kind:'armor', def:5 },
    ARMADURA_OSSO:   { kind:'armor', def:7 },
    ARMADURA_ESCAMA: { kind:'armor', def:9 },
    ARMADURA_TRONO:  { kind:'armor', def:14 },
    ELMO:            { kind:'head', def:1 },
    ELMO_CHIFRES:    { kind:'head', def:3 },
    ELMO_DRACO:      { kind:'head', def:4 },
    COROA_VENDEDOR:  { kind:'head', def:7 },
    COROA_VALADARES: { kind:'head', def:20 },
    BOTAS:        { kind:'feet', def:1 },
    BOTAS_RAPIDA: { kind:'feet', def:0, speed:30 },
    BOTAS_VENTO:  { kind:'feet', def:1, speed:50 },
    BOTAS_COURO:  { kind:'feet', def:2 },
    CORACAO_HL:   { kind:'neck' },
    // ammo
    FLECHA:      { kind:'ammo' },
    FLECHA_PERF: { kind:'ammo' },
    // cosméticos (só visuais — server só valida posse)
    CAPA_REAL:{kind:'cosmetic'}, CAPA_SOMBRA:{kind:'cosmetic'},
    AURA_FOGO:{kind:'cosmetic'}, AURA_GELO:{kind:'cosmetic'},
    NOME_DOURADO:{kind:'cosmetic'},
    TRAIL_OURO:{kind:'cosmetic'}, TRAIL_GELO:{kind:'cosmetic'},
    PART_FOGO:{kind:'cosmetic'}, PART_TROVAO:{kind:'cosmetic'},
    AURA_VIDENTE:{kind:'cosmetic'}, CAPA_CETICO:{kind:'cosmetic'},
    COROA_SOMBRIA:{kind:'cosmetic'}, MANTO_JUSTO:{kind:'cosmetic'},
};

// Custo derivado de cada item (igual itemGoldCost do cliente)
const FIXED_COSTS = {};
function itemGoldCost(key){
    if (FIXED_COSTS[key] != null) return FIXED_COSTS[key];
    const d = ITEM_META[key]; if (!d) return 0;
    let g = 0;
    if (d.heal)     g += d.heal * 1.5;
    if (d.manaheal) g += d.manaheal * 2;
    if (d.base)     g += d.base * 8;
    if (d.def)      g += d.def  * 12;
    if (d.speed)    g += d.speed * 3;
    return Math.round(g);
}
function sellPriceFor(key){
    const def = ITEM_META[key]; if (!def) return 1;
    if (def.base) return 3 + Math.floor(def.base * 1.5);
    if (def.def)  return 3 + Math.floor(def.def  * 1.5);
    if (def.heal) return Math.max(1, Math.floor(def.heal * 0.5));
    if (def.kind === 'mat') return 4;
    return 1;
}

// Receitas (espelho de RECIPES do cliente, exceto display name)
const RECIPES = [
    { out:'POTION',         in:{ SILK:2, ASA_MORCEGO:1 } },
    { out:'POTION_MP',      in:{ SILK:3, ASA_MORCEGO:2 } },
    { out:'BOTAS_RAPIDA',   in:{ BOTAS:1, ASA_MORCEGO:4, SILK:3 } },
    { out:'ESPADA_OSSO',    in:{ ESPADA:1, OSSO:4 } },
    { out:'ESCUDO_OSSO',    in:{ ESCUDO_MAD:1, OSSO:5 } },
    { out:'ELMO_CHIFRES',   in:{ ELMO:1, CHIFRE:2 } },
    { out:'BOTAS_COURO',    in:{ BOTAS:1, OSSO:2, SILK:2 } },
    { out:'ARMADURA_OSSO',  in:{ ARMADURA:1, OSSO:8, CHIFRE:1 } },
    { out:'MACHADO_MINO',   in:{ MACHADO:1, CHIFRE:3, OSSO:4 } },
    { out:'BOTAS_VENTO',    in:{ BOTAS_RAPIDA:1, ASA_MORCEGO:10, CHIFRE:5 } },
    { out:'FLECHA',         in:{ OSSO:1, ASA_MORCEGO:1 }, qtyOut:5 },
    { out:'FLECHA_PERF',    in:{ OSSO:2, CHIFRE:1 },      qtyOut:3 },
    { out:'LANCA',          in:{ OSSO:3, SILK:1 } },
    { out:'LANCA_LONGA',    in:{ OSSO:4, CHIFRE:1, SILK:2 } },
    { out:'PORRETE',        in:{ OSSO:2 } },
    { out:'MACA',           in:{ CLAVA:1, OSSO:3, CHIFRE:1 } },
    { out:'MARRETA',        in:{ MARTELO:1, OSSO:6, CHIFRE:2 } },
    { out:'MACA_GIGANTE',   in:{ MACA:1, OSSO:8, CHIFRE:3 } },
    { out:'SABRE',          in:{ ESPADA:1, GARRA:3, SILK:2 } },
    { out:'ESPADA_DRACO',   in:{ ESPADA_LONGA:1, ESCAMA:6 } },
    { out:'ELMO_DRACO',     in:{ ELMO_CHIFRES:1, ESCAMA:3 } },
    { out:'ARMADURA_ESCAMA',in:{ ARMADURA_OSSO:1, ESCAMA:5 } },
    { out:'BORDAO',         in:{ CLAVA:1, PEDRA_GOLEM:2, OSSO:2 } },
    { out:'MARTELO_GOLEM',  in:{ MARTELO:1, PEDRA_GOLEM:6 } },
    { out:'ESCUDO_PEDRA',   in:{ ESCUDO_FERRO:1, PEDRA_GOLEM:5 } },
    { out:'ESPADA_HL',      in:{ ESPADA_DRACO:1, CORACAO_HL:3, ESCAMA:5, PEDRA_GOLEM:5 } },
    { out:'ARMADURA_TRONO', in:{ ARMADURA_ESCAMA:1, CORACAO_HL:2, PEDRA_GOLEM:4, OSSO:8 } },
    { out:'COROA_VENDEDOR', in:{ ELMO_DRACO:1, CORACAO_HL:1, ESCAMA:3, CHIFRE:2 } },
];

// ─── QUESTS (N3 fase 3) ──────────────────────────────────────────────────
// Espelhadas do cliente (play.html). Só os campos que o server precisa pra validar
// turn-in e calcular reward: kind, type/items/count, reward, choices.
const QUESTS = [
    { id:'q_ratos',  goal:{ kind:'mob',  type:'RAT',       count:10 }, reward:{ gold:50,  xp:{Punho:100} } },
    { id:'q_cobras', goal:{ kind:'mob',  type:'SNAKE',     count:5  }, reward:{ gold:80,  xp:{Espada:100} } },
    { id:'q_seda',   goal:{ kind:'item', type:'SILK',      count:5  }, reward:{ gold:200 } },
    { id:'q_orcs',   goal:{ kind:'mob',  type:'ORC',       count:3  }, reward:{ gold:300, xp:{Espada:50,Machado:50,Clava:50} } },
    { id:'q_lider',  goal:{ kind:'mob',  type:'ORC_LIDER', count:1  }, reward:{ gold:500 } },
];
const QUESTS_BY_ID = Object.fromEntries(QUESTS.map(q => [q.id, q]));

const QUEST_CHAINS = {
    cripta: {
        npc:'eremita',
        stages: [
            { id:'cr1', kind:'visit',     reward:{ gold:80,  xp:{Magia:50} } },
            { id:'cr2', kind:'item',      type:'OSSO',     count:8,  reward:{ gold:200, xp:{Magia:80} } },
            { id:'cr3', kind:'mob',       type:'SKELETON', count:10, reward:{ gold:400, xp:{Magia:150}, item:{OSSO:5} } },
            { id:'cr4', kind:'mob',       type:'MINOTAUR', count:1,  reward:{ gold:800, xp:{Magia:200}, item:{POTION_MP:5}, flag:'flag_vendedor_revealed' } },
        ],
    },
    forja: {
        npc:'ferreiro',
        stages: [
            { id:'fj1', kind:'multiItem', items:{ PEDRA_GOLEM:5, CHIFRE:5 }, reward:{ gold:300 } },
            { id:'fj2', kind:'item',      type:'SILK',  count:10, reward:{ gold:250 } },
            { id:'fj3', kind:'mob',       type:'GOLEM', count:5,  reward:{ gold:600, item:{MACHADO_MINO:1}, xp:{Machado:200} } },
        ],
    },
    drake: {
        npc:'cacadora',
        stages: [
            { id:'dr1', kind:'mob',  type:'DRAKE',       count:5, reward:{ gold:400,  xp:{'Distância':150} } },
            { id:'dr2', kind:'item', type:'ESCAMA',      count:8, reward:{ gold:600,  xp:{'Distância':120} } },
            { id:'dr3', kind:'mob',  type:'DRAKE_LIDER', count:1, reward:{ gold:1500, item:{ELMO_DRACO:1, CORACAO_HL:1}, xp:{'Distância':300} } },
        ],
    },
    mina: {
        npc:'mineiro',
        stages: [
            { id:'mn1', kind:'multiItem', items:{ HAM:3, POTION:3 }, reward:{ gold:200, xp:{Punho:50} } },
            { id:'mn2', kind:'mob',  type:'BAT',       count:10, reward:{ gold:300,  xp:{'Distância':100} } },
            { id:'mn3', kind:'mob',  type:'GOLEM_REI', count:1,  reward:{ gold:1500, item:{PEDRA_GOLEM:10}, xp:{Clava:250} } },
        ],
    },
    vohrim: {
        npc:'vohrim',
        stages: [
            { id:'vh1', kind:'multiItem', items:{ SILK:5, OSSO:3 }, reward:{ gold:500, xp:{Magia:50} } },
            { id:'vh2', kind:'mob',   type:'SPIDER',     count:5, reward:{ gold:600, xp:{Espada:80} } },
            { id:'vh3', kind:'visit', reward:{ gold:800, xp:{'Distância':80} } },
            { id:'vh4', kind:'item',  type:'CORACAO_HL', count:1, reward:{ gold:200 } },
            { id:'vh5', kind:'choice', choices: [
                { reward:{ item:{COROA_SOMBRIA:1}, gold:5000, flag:'flag_vohrim_traitor' } },
                { reward:{ item:{MANTO_JUSTO:1},  gold:8000, xp:{Espada:100,Magia:100,Escudo:100}, flag:'flag_vohrim_exposed' } },
            ]},
        ],
    },
    crepusculo: {
        npc:'crepusculo',
        stages: [
            { id:'cp1', kind:'mob',       type:'SNAKE', count:25, reward:{ gold:150, xp:{Espada:80} } },
            { id:'cp2', kind:'multiItem', items:{ ESCAMA:5, PEDRA_GOLEM:3 }, reward:{ gold:400, xp:{Magia:120} } },
            { id:'cp3', kind:'mob',       type:'DRAKE', count:3, reward:{ gold:600, xp:{'Distância':200}, item:{POTION_MP:5} } },
            { id:'cp4', kind:'choice', choices: [
                { reward:{ item:{AURA_VIDENTE:1}, permaBuff:{dodgeBonus:0.05}, gold:500 } },
                { reward:{ item:{CAPA_CETICO:1}, gold:3000 } },
            ]},
        ],
    },
    vendedor: {
        npc:'vendedor',
        stages: [
            { id:'vd1', kind:'item', type:'CORACAO_HL', count:2, reward:{ gold:0 } },
            { id:'vd2', kind:'choice', choices: [
                { reward:{ item:{COROA_VENDEDOR:1}, gold:500 } },
                { reward:{ permaBuff:{xpBonus:0.05}, gold:2000, flag:'flag_vendedor_killed' } },
            ]},
        ],
    },
};

// Daily quests — pool espelhado do cliente. Server valida (kind, type, count) bate
// com alguma entry do pool e usa a reward DA TABELA (não do save) pra impedir
// adulteração via F12 (player.quests.daily.list[N].reward.gold = 99999).
const DAILY_POOL = [
    { kind:'mob',  type:'RAT',        count:25, gold:200,  xp:{Punho:80} },
    { kind:'mob',  type:'SNAKE',      count:15, gold:250,  xp:{Espada:80} },
    { kind:'mob',  type:'SPIDER',     count:12, gold:300,  xp:{'Distância':60} },
    { kind:'mob',  type:'WOLF',       count:10, gold:450,  xp:{Machado:100} },
    { kind:'mob',  type:'ORC',        count:8,  gold:600,  xp:{Espada:80, Machado:80} },
    { kind:'mob',  type:'SKELETON',   count:10, gold:500,  xp:{Clava:100} },
    { kind:'mob',  type:'BAT',        count:15, gold:400,  xp:{'Distância':80} },
    { kind:'mob',  type:'TROLL',      count:6,  gold:700,  xp:{Machado:120} },
    { kind:'mob',  type:'LIZARD',     count:8,  gold:500,  xp:{'Distância':90} },
    { kind:'mob',  type:'SCORPION',   count:6,  gold:600,  xp:{'Distância':100} },
    { kind:'mob',  type:'DRAKE',      count:4,  gold:900,  xp:{Espada:120, Magia:60} },
    { kind:'mob',  type:'GOLEM',      count:4,  gold:900,  xp:{Clava:120} },
    { kind:'mob',  type:'MINOTAUR',   count:3,  gold:1000, xp:{Machado:150} },
    { kind:'mob',  type:'ORC_LIDER',  count:1,  gold:1200, xp:{Espada:150, Machado:150} },
    { kind:'mob',  type:'DRAKE_LIDER',count:1,  gold:1800, xp:{Espada:200, Magia:200} },
    { kind:'mob',  type:'GOLEM_REI',  count:1,  gold:1800, xp:{Clava:200} },
    { kind:'item', type:'SILK',         count:10, gold:300 },
    { kind:'item', type:'OSSO',         count:15, gold:400 },
    { kind:'item', type:'CHIFRE',       count:6,  gold:600 },
    { kind:'item', type:'GARRA',        count:8,  gold:500 },
    { kind:'item', type:'ESCAMA',       count:5,  gold:800 },
    { kind:'item', type:'PEDRA_GOLEM',  count:5,  gold:800 },
    { kind:'item', type:'ASA_MORCEGO',  count:10, gold:400 },
];
function findDailyPoolEntry(kind, type, count){
    return DAILY_POOL.find(d => d.kind === kind && d.type === type && d.count === count) || null;
}

// Shop (Mercador em 52,49) — espelho de SHOP_BUY do cliente
const SHOP_BUY = [
    { item:'POTION',    price:50 },
    { item:'POTION',    price:450,  qty:10 },
    { item:'POTION',    price:1000, qty:25 },
    { item:'POTION_MP', price:60 },
    { item:'POTION_MP', price:540,  qty:10 },
    { item:'POTION_MP', price:1200, qty:25 },
    { item:'FLECHA',    price:5  },
    { item:'FLECHA_PERF', price:18 },
    { item:'CHEESE',    price:8  },
    { item:'HAM',       price:30 },
    { item:'BOTAS',     price:120 },
    { item:'COURO',     price:180 },
    { item:'BENCAO_FENIX', price:15000 },
    { item:'BENCAO_FENIX', price:65000,  qty:5 },
    { item:'BENCAO_FENIX', price:120000, qty:10 },
];

// Forja
const UPGRADE_MAX       = 5;
const UPGRADE_FAIL      = [0, 0.20, 0.35, 0.50, 0.65, 0.80];
const UPGRADE_COST_MULT = [0, 3, 8, 20, 50, 120];
function getUpgradeTier(key){
    const m = key && key.match(/^(.+)_PLUS_(\d+)$/);
    if (m) return { base: m[1], plus: parseInt(m[2], 10) };
    return { base: key, plus: 0 };
}
function makeUpgradeKey(baseKey, plus){
    return plus > 0 ? baseKey + '_PLUS_' + plus : baseKey;
}
function forgeCostFor(baseKey, targetPlus){
    const sell = sellPriceFor(baseKey);
    const base = Math.max(20, sell * 2);
    const mult = UPGRADE_COST_MULT[targetPlus] || 0;
    return base * mult;
}

// Helpers genéricos de mutação inv (servidor é dono)
function incInv(p, key, qty){
    if (!p.inv) p.inv = {};
    p.inv[key] = Math.max(0, (p.inv[key] || 0) + qty);
    if (p.inv[key] <= 0) delete p.inv[key];
}
function hasInv(p, key, qty){
    return (p.inv && p.inv[key] || 0) >= qty;
}
function sendInvUpdate(p, extra){
    if (!p || p.ws.readyState !== 1) return;
    const msg = { t:'invUpdate', inv: p.inv || {}, gold: p.gold || 0, equipped: p.equipped || null };
    if (extra) Object.assign(msg, extra);
    p.ws.send(JSON.stringify(msg));
}
// Versão leve pra atualizações frequentes (ex: XP por hit, +1 toda vez que ataca/apanha)
function sendSkillsOnly(p, reason){
    if (!p || p.ws.readyState !== 1) return;
    p.ws.send(JSON.stringify({ t:'invUpdate', skills: p.skills || {}, reason: reason || 'skillsTick' }));
}

// XP de skill server-side (espelha gainSkillXp do cliente).
// Aplica permaBuff.xpBonus, evento Bênção da Sabedoria (+50%) e nivela.
function gainSkillXpServer(p, name, amount){
    if (!p.skills) p.skills = {};
    const sk = p.skills[name]; if (!sk) return;
    let amt = amount | 0;
    const bonus = p.permaBuffs?.xpBonus || 0;
    if (bonus > 0) amt = Math.round(amt * (1 + bonus));
    // Evento diário Sabedoria — +50% xp durante a janela ativa.
    if (typeof dailyEventState !== 'undefined' && dailyEventState.isActive && dailyEventState.type?.id === 'wisdom'){
        amt = Math.round(amt * 1.5);
    }
    sk.xp = (sk.xp || 0) + amt;
    let leveled = false;
    while (sk.xp >= (sk.xpNext || 50)){
        sk.xp -= sk.xpNext;
        sk.val = (sk.val || 10) + 1;
        sk.xpNext = Math.floor((sk.xpNext || 50) * 1.15);
        leveled = true;
    }
    if (leveled) recomputeMaxStatsServer(p);
}

// Fase 5: recalcula maxHp/maxMp baseado em soma de skills + talent hpBonus.
// Espelha recomputeStats do cliente (linha 4196+). Ajusta p.hp/p.mp pra
// receber o boost quando maxHp/maxMp aumentar; clampa quando diminuir.
function recomputeMaxStatsServer(p){
    if (!p.skills) return;
    let sumSkills = 0;
    for (const k of Object.keys(p.skills)){
        sumSkills += (p.skills[k]?.val || 0);
    }
    const above = Math.max(0, sumSkills - 60);
    const hpExtra = (p.permaBuffs?.hpBonus) || 0;
    const newMaxHp = 100 + above + hpExtra;
    const newMaxMp = 100 + Math.floor(above / 2);
    const oldMaxHp = p.maxHp || 100;
    const oldMaxMp = p.maxMp || 100;
    const dHp = newMaxHp - oldMaxHp;
    const dMp = newMaxMp - oldMaxMp;
    if (dHp > 0) p.hp = (p.hp ?? oldMaxHp) + dHp;
    if (dMp > 0) p.mp = (p.mp ?? oldMaxMp) + dMp;
    if (dHp < 0) p.hp = Math.min(p.hp ?? newMaxHp, newMaxHp);
    if (dMp < 0) p.mp = Math.min(p.mp ?? newMaxMp, newMaxMp);
    p.maxHp = newMaxHp;
    p.maxMp = newMaxMp;
}

// Aplica uma reward de quest (espelha applyReward do cliente).
// Retorna delta {gold, items{}, xp{}, flag, permaBuffs{}} pro cliente exibir floats.
function applyQuestReward(p, reward){
    const delta = { gold:0, items:{}, xp:{}, flag:null, permaBuffs:{} };
    if (!reward) return delta;
    if (reward.gold){ p.gold = (p.gold || 0) + reward.gold; delta.gold = reward.gold; }
    if (reward.xp){
        for (const [s, v] of Object.entries(reward.xp)){
            gainSkillXpServer(p, s, v);
            delta.xp[s] = v;
        }
    }
    if (reward.item){
        for (const [k, n] of Object.entries(reward.item)){
            incInv(p, k, n);
            delta.items[k] = n;
        }
    }
    if (reward.flag){
        p.flags = p.flags || {};
        p.flags[reward.flag] = true;
        delta.flag = reward.flag;
    }
    if (reward.permaBuff){
        p.permaBuffs = p.permaBuffs || {};
        for (const [k, v] of Object.entries(reward.permaBuff)){
            p.permaBuffs[k] = (p.permaBuffs[k] || 0) + v;
            delta.permaBuffs[k] = v;
        }
    }
    return delta;
}

function isAdjacentTo(p, npc){
    return npc && Math.max(Math.abs(p.x - npc.x), Math.abs(p.y - npc.y)) <= 1;
}

// Slot derivado do tipo de item (espelha SLOT_OF_KIND do cliente)
const SLOT_OF_KIND = {
    weapon:'weapon', offhand:'offhand', armor:'armor',
    head:'head', feet:'feet', neck:'neck', cosmetic:'cosmetic',
};
// Posição dos 4 baús (espelha CHESTS do cliente)
const CHEST_POS = {
    b1: { x:47, y:48 }, b2: { x:53, y:48 },
    b3: { x:47, y:52 }, b4: { x:53, y:52 },
};
// N3 fase 2: groundItems autoritativos
const groundDrops = new Map();   // id -> { id, x, y, type, qty, spawnedAt }
let _nextGroundId = 1;
const GROUND_TTL_MS = 5 * 60 * 1000;  // 5min — após isso, despawna
function spawnGroundDrop(x, y, type, qty){
    const id = 'g' + (_nextGroundId++);
    const drop = { id, x, y, type, qty, spawnedAt: Date.now() };
    groundDrops.set(id, drop);
    return drop;
}
function snapshotGroundDrops(){
    return Array.from(groundDrops.values()).map(d => ({ id:d.id, x:d.x, y:d.y, type:d.type, qty:d.qty }));
}
function tickGroundDespawn(){
    const now = Date.now();
    const expired = [];
    for (const d of groundDrops.values()){
        if (now - d.spawnedAt > GROUND_TTL_MS) expired.push(d.id);
    }
    if (!expired.length) return;
    for (const id of expired) groundDrops.delete(id);
    broadcast(null, { t:'groundRemove', ids: expired });
}
setInterval(tickGroundDespawn, 30 * 1000);
// Defaults pra player novo
function ensurePlayerInvSlots(p){
    if (!p.inv) p.inv = {};
    if (!p.equipped) p.equipped = { weapon:null, offhand:null, armor:null, head:null, feet:null, neck:null, cosmetic:null };
    if (!p.chests)  p.chests  = { b1:{}, b2:{}, b3:{}, b4:{} };
    if (typeof p.gold !== 'number') p.gold = 0;
    // T3: skills agora são server-fonte. Inicializa defaults (val 10) se save não trouxe.
    if (!p.skills){
        p.skills = {
            'Punho':     { val:10, xp:0, xpNext:50 },
            'Espada':    { val:10, xp:0, xpNext:50 },
            'Machado':   { val:10, xp:0, xpNext:50 },
            'Clava':     { val:10, xp:0, xpNext:50 },
            'Distância': { val:10, xp:0, xpNext:50 },
            'Escudo':    { val:10, xp:0, xpNext:50 },
            'Magia':     { val:10, xp:0, xpNext:50 },
        };
    }
}

// ─── LOOT tables (espelho do cliente) ─────────────────────────────────────
// Drops gerados server-side ao morte do mob, mandados no payload do mobKill.
// Mantém em paridade com a DROPS no index.html.
const LOOT = {
    RAT:    [ ['CHEESE', 0.7, 1, 1], ['PORRETE', 0.04, 1, 1] ],
    SNAKE:  [ ['EGG', 0.5, 1, 1], ['GOLD', 0.6, 1, 4], ['ADAGA', 0.05, 1, 1], ['LANCA', 0.06, 1, 1], ['PORRETE', 0.05, 1, 1] ],
    SPIDER: [ ['SILK', 0.4, 1, 2], ['GOLD', 0.5, 2, 6], ['POTION', 0.08, 1, 1], ['POTION_MP', 0.12, 1, 1],
              ['BOTAS', 0.05, 1, 1], ['ESCUDO_MAD', 0.06, 1, 1], ['BOTAS_RAPIDA', 0.04, 1, 1], ['FLECHA', 0.30, 2, 6] ],
    WOLF:   [ ['MEAT', 0.7, 1, 1], ['GOLD', 0.7, 3, 10], ['POTION', 0.12, 1, 1],
              ['CLAVA', 0.08, 1, 1], ['MACA', 0.05, 1, 1], ['COURO', 0.06, 1, 1], ['ESCUDO_MAD', 0.08, 1, 1],
              ['BOTAS_RAPIDA', 0.05, 1, 1], ['ARCO', 0.04, 1, 1], ['FLECHA', 0.25, 2, 5] ],
    ORC:    [ ['HAM', 0.5, 1, 1], ['GOLD', 1.0, 10, 28], ['POTION', 0.25, 1, 2],
              ['ESPADA', 0.10, 1, 1], ['MACHADO', 0.06, 1, 1], ['ESPADA_LONGA', 0.04, 1, 1],
              ['MARTELO', 0.04, 1, 1], ['MACA', 0.06, 1, 1], ['MARRETA', 0.03, 1, 1], ['MACA_GIGANTE', 0.03, 1, 1],
              ['ARMADURA', 0.08, 1, 1], ['ELMO', 0.10, 1, 1], ['ESCUDO_FERRO', 0.05, 1, 1],
              ['ARCO_CACA', 0.05, 1, 1], ['BESTA', 0.03, 1, 1], ['FLECHA_PERF', 0.15, 1, 3], ['LANCA_LONGA', 0.05, 1, 1] ],
    ORC_LIDER: [
        ['HAM', 1.00, 3, 5], ['GOLD', 1.00, 60, 150], ['POTION', 1.00, 3, 6],
        ['ESPADA_LONGA', 0.40, 1, 1], ['MACHADO', 0.40, 1, 1], ['MARTELO', 0.30, 1, 1],
        ['MARRETA', 0.20, 1, 1], ['MACA_GIGANTE', 0.20, 1, 1],
        ['ARMADURA', 0.55, 1, 1], ['ELMO', 0.50, 1, 1], ['BOTAS', 0.40, 1, 1], ['ESCUDO_FERRO', 0.45, 1, 1],
        ['BOTAS_VENTO', 0.02, 1, 1],
    ],
    BAT:      [ ['GOLD', 0.50, 1, 4], ['ASA_MORCEGO', 0.45, 1, 1], ['POTION_MP', 0.10, 1, 1] ],
    SKELETON: [ ['GOLD', 0.80, 3, 12], ['OSSO', 0.65, 1, 2], ['POTION', 0.15, 1, 1], ['POTION_MP', 0.15, 1, 1],
                ['ESPADA', 0.08, 1, 1], ['ELMO', 0.08, 1, 1], ['ESCUDO_MAD', 0.10, 1, 1],
                ['ESPADA_OSSO', 0.06, 1, 1], ['ESCUDO_OSSO', 0.05, 1, 1], ['ARMADURA_OSSO', 0.04, 1, 1] ],
    MINOTAUR: [ ['HAM', 0.40, 1, 2], ['GOLD', 1.00, 25, 60], ['POTION', 0.40, 1, 2], ['POTION_MP', 0.30, 1, 2],
                ['CHIFRE', 0.55, 1, 1], ['OSSO', 0.30, 1, 1],
                ['MACHADO', 0.14, 1, 1], ['ESPADA_LONGA', 0.10, 1, 1], ['MARTELO', 0.10, 1, 1],
                ['ARMADURA', 0.15, 1, 1], ['ELMO', 0.18, 1, 1], ['BOTAS', 0.15, 1, 1], ['ESCUDO_FERRO', 0.12, 1, 1],
                ['MACHADO_MINO', 0.06, 1, 1], ['ELMO_CHIFRES', 0.10, 1, 1], ['ARMADURA_OSSO', 0.08, 1, 1], ['BOTAS_COURO', 0.12, 1, 1] ],
    TROLL:  [ ['MEAT', 0.65, 1, 2], ['GOLD', 0.85, 8, 22], ['POTION', 0.20, 1, 1],
              ['CLAVA', 0.10, 1, 1], ['MACA', 0.07, 1, 1], ['MARTELO', 0.06, 1, 1],
              ['COURO', 0.10, 1, 1], ['ARMADURA', 0.06, 1, 1], ['ELMO', 0.08, 1, 1],
              ['BOTAS', 0.10, 1, 1], ['ESCUDO_MAD', 0.08, 1, 1] ],
    LIZARD: [ ['GARRA', 0.60, 1, 1], ['CARNE_LAGARTO', 0.65, 1, 1], ['GOLD', 0.70, 2, 8],
              ['POTION', 0.08, 1, 1], ['ADAGA', 0.08, 1, 1], ['LANCA', 0.07, 1, 1], ['ADAGA_DUPLA', 0.05, 1, 1] ],
    SCORPION: [ ['GOLD', 0.85, 4, 14], ['GARRA', 0.35, 1, 1], ['POTION', 0.15, 1, 1],
                ['ADAGA', 0.07, 1, 1], ['LANCA', 0.10, 1, 1], ['LANCA_LONGA', 0.04, 1, 1], ['FLECHA', 0.20, 1, 4] ],
    DRAKE:  [ ['ESCAMA', 0.60, 1, 1], ['GOLD', 0.90, 12, 30], ['POTION', 0.22, 1, 1], ['POTION_MP', 0.15, 1, 1],
              ['ESPADA', 0.09, 1, 1], ['MACHADO', 0.08, 1, 1], ['ESPADA_LONGA', 0.06, 1, 1],
              ['ARMADURA', 0.10, 1, 1], ['ELMO', 0.08, 1, 1] ],
    DRAKE_LIDER: [
        ['ESCAMA', 1.00, 5, 10], ['GOLD', 1.00, 120, 250], ['POTION', 1.00, 5, 8], ['POTION_MP', 1.00, 3, 5],
        ['ESPADA_DRACO', 0.30, 1, 1], ['ARMADURA_ESCAMA', 0.45, 1, 1], ['ELMO_DRACO', 0.40, 1, 1],
        ['BOTAS_VENTO', 0.06, 1, 1], ['MACHADO_MINO', 0.15, 1, 1], ['CORACAO_HL', 0.05, 1, 1],
    ],
    GOLEM:  [ ['PEDRA_GOLEM', 0.65, 1, 1], ['GOLD', 0.90, 15, 40], ['POTION', 0.20, 1, 1], ['OSSO', 0.40, 1, 2],
              ['MARTELO', 0.12, 1, 1], ['MARRETA', 0.08, 1, 1], ['MACA_GIGANTE', 0.06, 1, 1],
              ['ARMADURA', 0.10, 1, 1], ['ELMO', 0.08, 1, 1], ['ESCUDO_FERRO', 0.07, 1, 1] ],
    GOLEM_REI: [
        ['PEDRA_GOLEM', 1.00, 5, 10], ['GOLD', 1.00, 120, 250], ['POTION', 1.00, 5, 8],
        ['MARTELO_GOLEM', 0.30, 1, 1], ['ESCUDO_PEDRA', 0.40, 1, 1], ['ARMADURA_ESCAMA', 0.40, 1, 1],
        ['ELMO_DRACO', 0.32, 1, 1], ['BORDAO', 0.22, 1, 1], ['BOTAS_VENTO', 0.05, 1, 1],
    ],
    CACADOR: [
        ['GOLD', 1.00, 40, 100], ['POTION', 1.00, 2, 4],
        ['SABRE', 0.30, 1, 1], ['BESTA', 0.25, 1, 1], ['ARMADURA', 0.40, 1, 1],
    ],
    SENHOR_VALADARES: [
        ['GOLD', 1.00, 5000, 10000], ['ESSENCIA', 1.00, 5, 10], ['CORACAO_HL', 1.00, 3, 5],
        ['POTION', 1.00, 10, 20], ['POTION_MP', 1.00, 10, 20],
        ['COROA_VALADARES', 0.30, 1, 1], ['ESPADA_ETERNA', 0.20, 1, 1],
        ['ARMADURA_TRONO', 0.50, 1, 1], ['ESPADA_HL', 0.40, 1, 1],
        ['TRAIL_OURO', 0.25, 1, 1], ['PART_FOGO', 0.20, 1, 1], ['PART_TROVAO', 0.15, 1, 1],
    ],
    ARAUTO: [
        ['GOLD', 1.00, 500, 1500], ['BENCAO_FENIX', 1.00, 1, 2],
        ['POTION', 1.00, 5, 10], ['POTION_MP', 1.00, 5, 10],
        ['CORACAO_HL', 0.25, 1, 1],
        ['CAPA_REAL', 0.20, 1, 1], ['CAPA_SOMBRA', 0.20, 1, 1],
        ['AURA_FOGO', 0.15, 1, 1], ['AURA_GELO', 0.15, 1, 1], ['NOME_DOURADO', 0.10, 1, 1],
        ['TRAIL_OURO', 0.15, 1, 1], ['TRAIL_GELO', 0.15, 1, 1],
        ['PART_FOGO', 0.10, 1, 1], ['PART_TROVAO', 0.10, 1, 1],
    ],
};
function rollLoot(mobType){
    const table = LOOT[mobType];
    if (!table) return [];
    const out = [];
    for (const [type, chance, qMin, qMax] of table){
        if (Math.random() < chance){
            const qty = qMin + Math.floor(Math.random() * (qMax - qMin + 1));
            out.push({ type, qty });
        }
    }
    return out;
}

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
// Também usado pelo questTurnIn pra validar adjacência no momento da entrega.
const QUEST_NPCS = {
    atendente:  { x:52, y:52 },   // espaçada da Mercador/Banqueiro (1 tile entre cada)
    eremita:    { x:22, y:22 },
    ferreiro:   { x:78, y:22 },
    cacadora:   { x:76, y:78 },
    mineiro:    { x:66, y:90 },
    crepusculo: { x:28, y:75 },
    vohrim:     { x:15, y:50 },
    vendedor:   { x:75, y:20 },
};
const NPC_POSITIONS = [
    { x:52, y:48 },  // mercador
    { x:52, y:50 },  // banqueiro
    QUEST_NPCS.atendente,
    QUEST_NPCS.eremita,
    QUEST_NPCS.ferreiro,
    QUEST_NPCS.cacadora,
    QUEST_NPCS.mineiro,
    QUEST_NPCS.crepusculo,
    QUEST_NPCS.vohrim,
    QUEST_NPCS.vendedor,
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
        equipped: p.equipped || null,
        badges: p.badges || [],
        guild: findGuildOfPlayer(p.name)?.name || null,
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
        spawnX: x, spawnY: y,    // âncora pra wandering (volta pra perto)
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
        // Hunter (caçador HL): target hardcoded no player que triggou. Ignora aggro range,
        // PZ e mini-PZ — persegue pelo mapa inteiro até o target sair do jogo ou morrer.
        let target = null, td = Infinity;
        if (m.hunter && m.huntTargetId != null){
            const tp = players.get(m.huntTargetId);
            if (tp && (tp.hp ?? 100) > 0){
                target = tp;
                td = chebyshev(m.x, m.y, tp.x, tp.y);
            }
            // se target inválido (logoff/morte), fallback pro aggro normal abaixo
        }
        if (!target){
            // procura player mais próximo em aggro range (ignora PZ e mini-PZ de NPC)
            for (const p of players.values()){
                if ((p.hp ?? 100) <= 0) continue;
                if (inSafe(p.x, p.y)) continue;
                if (playerNearNpc(p)) continue;   // mini-PZ ao redor de NPCs
                const d = chebyshev(m.x, m.y, p.x, p.y);
                if (d <= m.aggro && d < td){ target = p; td = d; }
            }
        }
        // Sem target: wandering leve (não vale pra bosses/unique — eles ficam no spot)
        if (!target){
            if (m.unique) continue;
            const wanderCd = Math.floor(m.speed * 1.8);
            if (now - m.lastMoveAt < wanderCd) continue;
            if (Math.random() > 0.25) continue;   // 25% chance por tentativa
            const sx = m.spawnX ?? m.x, sy = m.spawnY ?? m.y;
            if (m.spawnX == null){ m.spawnX = sx; m.spawnY = sy; }   // hidrata legados
            const dxh = m.x - sx, dyh = m.y - sy;
            const distHome = Math.max(Math.abs(dxh), Math.abs(dyh));
            let dx = 0, dy = 0;
            if (distHome > 6 && Math.random() < 0.65){
                // longe de casa: volta
                dx = -Math.sign(dxh); dy = -Math.sign(dyh);
                // escolhe um eixo (não diagonal)
                if (Math.random() < 0.5){ if (dx) dy = 0; else if (dy) dx = 0; }
                else { if (dy) dx = 0; else if (dx) dy = 0; }
            } else {
                const d = Math.floor(Math.random() * 4);
                dx = d === 0 ? -1 : d === 1 ? 1 : 0;
                dy = d === 2 ? -1 : d === 3 ? 1 : 0;
            }
            const nx = m.x + dx, ny = m.y + dy;
            if (nx < 1 || ny < 1 || nx >= M_W-1 || ny >= M_H-1) continue;
            if (!isWalkable(nx, ny)) continue;
            if (inSafe(nx, ny)) continue;
            if (mobAt(nx, ny)) continue;
            if (playerAt(nx, ny)) continue;
            m.x = nx; m.y = ny;
            m.dir = dy > 0 ? 'down' : dy < 0 ? 'up' : dx > 0 ? 'right' : 'left';
            m.lastMoveAt = now;
            continue;
        }
        // adjacente → atacar
        if (td <= 1){
            if (now - m.lastAttackAt >= ATTACK_CD_MS){
                m.lastAttackAt = now;
                // T2: dano aplicado server-side com defesa percentual (espelha cliente).
                // Cliente recebe mobHit pra FX + recebe pstats com hp novo.
                const def = totalDefenseServer(target);
                const reduction = def > 0 ? def / (def + 30) : 0;
                const actual = Math.max(1, Math.round(m.dmg * (1 - reduction)));
                if ((target.hp ?? 100) > 0){
                    target.hp = Math.max(0, (target.hp ?? 100) - actual);
                    broadcastPstatsAll(target);
                    // Fase 5: DoT/stun authoritative no server (rollAttackerStatus
                    // do cliente fica como no-op quando online).
                    applyAttackerStatus(target, m.type);
                }
                if (target.ws.readyState === 1){
                    target.ws.send(JSON.stringify({ t:'mobHit', mobId:m.id, mobType:m.type, dmg:m.dmg, actual }));
                }
                // T3: XP de Escudo se player tem escudo equipado (ganha XP apanhando)
                if (hasShieldEquipped(target)){
                    gainSkillXpServer(target, 'Escudo', 1);
                    sendSkillsOnly(target, 'shieldHit');
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
        hunter: m.hunter ? 1 : undefined,
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
        // Calcula online status por membro
        const onlineNames = new Set();
        for (const pp of players.values()){
            if (!pp.disconnected) onlineNames.add(pp.name.toLowerCase());
        }
        const memberList = myGuild.members.map(name => ({
            name,
            online: onlineNames.has(name.toLowerCase()),
            isLeader: name === myGuild.leader,
        }));
        sendToFn({ t:'guildInfo', name: myGuild.name, leader: myGuild.leader, members: memberList, createdAt: myGuild.createdAt || 0 });
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
const rankings = new Map();   // name → { mobKills, pkKills, bossKills, gold } — all-time
function ensureRanking(name){
    if (!name) return null;
    let r = rankings.get(name);
    if (!r){ r = { mobKills:0, pkKills:0, bossKills:0, gold:0 }; rankings.set(name, r); }
    // Garantir entry paralelo na season ranking (criada lazy junto)
    ensureSeasonRanking(name);
    return r;
}

// ─── Season ranking (mensal, reset dia 1 às 00:00 BRT) ─────────────────────
// id formato: 'YYYY-MM'. Em BRT (Paranaguá/PR = UTC-3, sem DST atual).
function currentSeasonId(){
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);   // shift pra BRT
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
const seasonState = {
    id: currentSeasonId(),
    ranking: new Map(),     // name → mesmo shape de rankings (zera no rollover)
    archive: [],            // [{ id, top: [{name, mobs, pvp, bosses, total}], champion, closedAt }]
};
function ensureSeasonRanking(name){
    if (!name) return null;
    let r = seasonState.ranking.get(name);
    if (!r){ r = { mobKills:0, pkKills:0, bossKills:0, gold:0 }; seasonState.ranking.set(name, r); }
    return r;
}
function seasonCombinedScore(r){
    if (!r) return 0;
    return (r.mobKills || 0) + (r.pkKills || 0) * 5 + (r.bossKills || 0) * 20;
}
// ─── Weapon → Skill map (T1) ───────────────────────────────────────────────
// Espelha o campo `skill` do ITEMS do cliente. Server usa pra creditar XP
// authoritative ao matar mob (sem confiar no que o cliente passa).
const WEAPON_SKILL = {
    // Espada
    ADAGA:'Espada', ADAGA_DUPLA:'Espada', ESPADA:'Espada', ESPADA_DRACO:'Espada',
    ESPADA_ETERNA:'Espada', ESPADA_HL:'Espada', ESPADA_LONGA:'Espada', ESPADA_OSSO:'Espada', SABRE:'Espada',
    // Distância (arcos + lanças arremessáveis)
    ARCO:'Distância', ARCO_CACA:'Distância', BESTA:'Distância',
    LANCA:'Distância', LANCA_LONGA:'Distância',
    // Clava
    BORDAO:'Clava', CLAVA:'Clava', MACA:'Clava', MACA_GIGANTE:'Clava',
    MARRETA:'Clava', MARTELO:'Clava', MARTELO_GOLEM:'Clava', PORRETE:'Clava',
    // Machado
    MACHADO:'Machado', MACHADO_MINO:'Machado',
};
function weaponSkillOf(p){
    // Strip sufixo _PLUS_N (forja) — ESPADA_HL_PLUS_2 → ESPADA_HL
    const w = p.equipped?.weapon;
    if (!w) return 'Punho';
    const base = String(w).replace(/_PLUS_\d+$/, '');
    return WEAPON_SKILL[base] || 'Punho';
}
function hasShieldEquipped(p){
    const o = p.equipped?.offhand;
    if (!o) return false;
    const base = String(o).replace(/_PLUS_\d+$/, '');
    return ITEM_META[base]?.kind === 'offhand';
}

// ─── Talents (M5) ──────────────────────────────────────────────────────────
// Talents são single-rank passivos que aplicam permaBuffs ao serem comprados.
// 1 ponto a cada 10 levels totais (sum of skill.val - 10 across all skills).
// Server é autoritativo: handler talentAlloc valida pontos + aplica permaBuff.
const TALENT_DEFS = {
    t_crit:  { name:'Olho de Águia',         desc:'+5% chance crítica',         buff:{ critBonus:  0.05 } },
    t_dodge: { name:'Reflexos Felinos',      desc:'+5% chance de esquiva',      buff:{ dodgeBonus: 0.05 } },
    t_hp:    { name:'Constituição',          desc:'+30 HP máximo',              buff:{ hpBonus:    30   } },
    t_xp:    { name:'Aprendizado Acelerado', desc:'+10% XP em todas as skills', buff:{ xpBonus:    0.10 } },
    t_regen: { name:'Recuperação Rápida',    desc:'+1 HP/MP por tick de regen', buff:{ regenBonus: 1    } },
    t_loot:  { name:'Caçador de Tesouros',   desc:'+15% gold de drops de mob',  buff:{ lootBonus:  0.15 } },
};
function totalLevelsAbove10(p){
    if (!p.skills) return 0;
    let sum = 0;
    for (const sk of Object.values(p.skills)){
        sum += Math.max(0, (sk.val || 10) - 10);
    }
    return sum;
}
function talentPointsEarned(p){ return Math.floor(totalLevelsAbove10(p) / 10); }
function talentPointsUsed(p){
    if (!p.talents) return 0;
    let n = 0;
    for (const id of Object.keys(p.talents)){
        if (p.talents[id] && TALENT_DEFS[id]) n++;
    }
    return n;
}
function talentPointsAvailable(p){ return Math.max(0, talentPointsEarned(p) - talentPointsUsed(p)); }

// Helpers de bump duplo (ranking all-time + season). Sempre usar em vez de
// mexer direto em r.mobKills/pkKills/bossKills/gold pra manter os dois em sync.
function bumpMobKill(name, isBoss){
    const r = ensureRanking(name); if (!r) return;
    const sr = ensureSeasonRanking(name);
    r.mobKills = (r.mobKills || 0) + 1;
    sr.mobKills = (sr.mobKills || 0) + 1;
    if (isBoss){
        r.bossKills = (r.bossKills || 0) + 1;
        sr.bossKills = (sr.bossKills || 0) + 1;
    }
}
function bumpPkKill(name){
    const r = ensureRanking(name); if (!r) return;
    const sr = ensureSeasonRanking(name);
    r.pkKills = (r.pkKills || 0) + 1;
    sr.pkKills = (sr.pkKills || 0) + 1;
}
function syncGoldRank(name, gold){
    const r = ensureRanking(name); if (!r) return;
    const sr = ensureSeasonRanking(name);
    r.gold = gold;
    sr.gold = gold;
}
function topSeason(limit){
    return Array.from(seasonState.ranking.entries())
        .map(([name, r]) => ({
            name,
            mobs:   r.mobKills  || 0,
            pvp:    r.pkKills   || 0,
            bosses: r.bossKills || 0,
            gold:   r.gold      || 0,
            total:  seasonCombinedScore(r),
        }))
        .filter(e => e.total > 0)
        .sort((a,b) => b.total - a.total)
        .slice(0, limit);
}
function checkSeasonRollover(){
    const newId = currentSeasonId();
    if (newId === seasonState.id) return;
    // Mudou o mês — encerra a season anterior, abre nova.
    const closedId = seasonState.id;
    const top10 = topSeason(10);
    const champion = top10[0]?.name || null;
    seasonState.archive.unshift({
        id: closedId,
        top: top10,
        champion,
        closedAt: Date.now(),
    });
    if (seasonState.archive.length > 12) seasonState.archive.length = 12;
    // Concede Coroa de Temporada ao campeão (online ou via acc.save)
    if (champion){
        const winnerKey = `COROA_TEMPORADA`;
        let onlinePlayer = null;
        for (const p of players.values()){
            if (!p.disconnected && p.name && p.name.toLowerCase() === champion.toLowerCase()){
                onlinePlayer = p; break;
            }
        }
        if (onlinePlayer){
            incInv(onlinePlayer, winnerKey, 1);
            onlinePlayer.seasonsWon = Array.isArray(onlinePlayer.seasonsWon) ? onlinePlayer.seasonsWon : [];
            if (!onlinePlayer.seasonsWon.includes(closedId)) onlinePlayer.seasonsWon.push(closedId);
            sendInvUpdate(onlinePlayer, { seasonReward:{ id: closedId } });
        } else {
            // Offline — credita no save
            try {
                const acc = getAccount(champion);
                if (acc && acc.save){
                    acc.save.inv = acc.save.inv || {};
                    acc.save.inv[winnerKey] = (acc.save.inv[winnerKey] || 0) + 1;
                    acc.save.seasonsWon = Array.isArray(acc.save.seasonsWon) ? acc.save.seasonsWon : [];
                    if (!acc.save.seasonsWon.includes(closedId)) acc.save.seasonsWon.push(closedId);
                    if (typeof flushAccounts === 'function') flushAccounts();
                }
            } catch(e){ console.warn('[season] erro ao creditar offline:', e.message); }
        }
        broadcast(null, { t:'serverMsg', level:'event', text:`🏆 Temporada ${closedId} encerrada! Campeão: ${champion}` });
    } else {
        broadcast(null, { t:'serverMsg', level:'info', text:`🏆 Temporada ${closedId} encerrada (sem campeão).` });
    }
    // Reset
    seasonState.id = newId;
    seasonState.ranking = new Map();
    // Persist imediato pra não perder em crash
    if (typeof saveStateToDisk === 'function') saveStateToDisk();
    console.log(`[season] rollover ${closedId} → ${newId}, champion=${champion || '(nenhum)'}`);
}
setInterval(checkSeasonRollover, 60 * 1000);   // checa a cada minuto
function topGuildRanking(limit){
    // Agrega stats por guild somando os rankings de cada membro.
    // total = mobs + pvp*5 + bosses*20 (PvP e bosses pesam mais)
    const out = [];
    for (const g of guilds.values()){
        let mobs = 0, pvp = 0, bosses = 0;
        for (const name of g.members){
            const r = rankings.get(name);
            if (!r) continue;
            mobs   += r.mobKills  || 0;
            pvp    += r.pkKills   || 0;
            bosses += r.bossKills || 0;
        }
        const total = mobs + pvp * 5 + bosses * 20;
        if (total > 0) out.push({ name: g.name, members: g.members.length, total, mobs, pvp, bosses });
    }
    return out.sort((a,b) => b.total - a.total).slice(0, limit);
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
        season: {
            id: seasonState.id,
            ranking: Array.from(seasonState.ranking.entries()),
            archive: seasonState.archive,
        },
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
        // Season: restaura id/ranking/archive. Se o id salvo ≠ atual, o rollover
        // vai disparar no próximo checkSeasonRollover() (intervalo de 60s).
        if (d.season && typeof d.season === 'object'){
            if (typeof d.season.id === 'string') seasonState.id = d.season.id;
            if (Array.isArray(d.season.ranking)){
                seasonState.ranking = new Map(d.season.ranking);
            }
            if (Array.isArray(d.season.archive)){
                seasonState.archive = d.season.archive.slice(0, 12);
            }
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
// crypto já é importado no topo do arquivo.
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE_PATH
    || (process.env.STATE_FILE_PATH
        ? path.join(path.dirname(process.env.STATE_FILE_PATH), 'accounts.json')
        : path.join(__dirname, 'accounts.json'));
const ACCOUNTS_SALT = process.env.ACCOUNTS_SALT || 'valadares-v1-salt';
const SAVE_THROTTLE_MS = 5 * 1000;
const SAVE_MAX_BYTES = 200 * 1024;   // 200KB por save é folgado pro JSON atual

const accounts = new Map();   // nameLower -> { name, pwHash, save, savedAt, createdAt }

// Sanity caps pra detectar/bloquear save adulterado via F12.
// Valores generosos pra qualquer progressão legítima, mas barram trapaça óbvia.
const SAVE_CAPS = {
    gold: 100_000_000,    // 100M de ouro
    skill: 200,           // skills raramente passam de 100 naturalmente
    itemQty: 9999,        // qty por item no inv/baú
    invKeys: 250,         // items distintos
    chestKeys: 250,       // items distintos por baú
    seloMax: 5,           // selos não passam de 5
    hpMax: 99_999,        // HP/MP máximo absurdo
    xpBonus: 2.0,         // permaBuffs.xpBonus — +200% no máximo
    statsKeys: 100,       // mobKills tem ~30 tipos; 100 é teto generoso
    questsKeys: 200,      // active/completed/daily juntos
    flagsKeys: 200,       // flags + questFlags
};
function clampNumber(v, max, fallback = 0){
    if (typeof v !== 'number' || !isFinite(v) || v < 0) return fallback;
    return Math.min(v, max);
}
function sanitizeSave(data, ownerName){
    if (!data || typeof data !== 'object') return data;
    let touched = false;
    const log = (k, was, now) => { touched = true; console.warn(`[save:${ownerName}] clamp ${k}: ${was} → ${now}`); };
    // Gold
    if ('gold' in data){
        const orig = data.gold;
        data.gold = clampNumber(orig, SAVE_CAPS.gold, 0);
        if (data.gold !== orig) log('gold', orig, data.gold);
    }
    // Selos PvP
    if ('selos' in data){
        const orig = data.selos;
        data.selos = clampNumber(orig, SAVE_CAPS.seloMax, 0);
        if (data.selos !== orig) log('selos', orig, data.selos);
    }
    // Skills — cap em val
    if (data.skills && typeof data.skills === 'object'){
        for (const sk of Object.keys(data.skills)){
            const s = data.skills[sk];
            if (!s || typeof s !== 'object') continue;
            if (typeof s.val === 'number' && s.val > SAVE_CAPS.skill){
                log(`skill.${sk}.val`, s.val, SAVE_CAPS.skill);
                s.val = SAVE_CAPS.skill;
            }
        }
    }
    // Inv — limita qty por item e quantidade de keys
    if (data.inv && typeof data.inv === 'object'){
        const keys = Object.keys(data.inv);
        if (keys.length > SAVE_CAPS.invKeys){
            log('inv keys', keys.length, SAVE_CAPS.invKeys);
            for (const k of keys.slice(SAVE_CAPS.invKeys)) delete data.inv[k];
        }
        for (const k of Object.keys(data.inv)){
            const orig = data.inv[k];
            const v = clampNumber(orig, SAVE_CAPS.itemQty, 0);
            if (v <= 0){ delete data.inv[k]; continue; }
            if (v !== orig){ log(`inv.${k}`, orig, v); data.inv[k] = v; }
        }
    }
    // Baús — mesmo tratamento
    if (data.chests && typeof data.chests === 'object'){
        for (const cId of Object.keys(data.chests)){
            const chest = data.chests[cId];
            if (!chest || typeof chest !== 'object') continue;
            const keys = Object.keys(chest);
            if (keys.length > SAVE_CAPS.chestKeys){
                log(`chest.${cId} keys`, keys.length, SAVE_CAPS.chestKeys);
                for (const k of keys.slice(SAVE_CAPS.chestKeys)) delete chest[k];
            }
            for (const k of Object.keys(chest)){
                const orig = chest[k];
                const v = clampNumber(orig, SAVE_CAPS.itemQty, 0);
                if (v <= 0){ delete chest[k]; continue; }
                if (v !== orig){ log(`chest.${cId}.${k}`, orig, v); chest[k] = v; }
            }
        }
    }
    // HP / MP máximos — clamp em 99k pra evitar HP de 1 bilhão
    for (const k of ['hp', 'mp', 'maxHp', 'maxMp']){
        if (k in data){
            const orig = data[k];
            data[k] = clampNumber(orig, SAVE_CAPS.hpMax, 0);
            if (data[k] !== orig) log(k, orig, data[k]);
        }
    }
    // Posição — NaN/fora-do-mapa quebra render do sprite (player invisível). Força (50,50)
    // se inválido. Sintoma observado: amigo entra no mobile + PC e save sincronizou ruim.
    for (const k of ['x', 'y']){
        if (k in data){
            const orig = data[k];
            const v = (typeof orig === 'number' && isFinite(orig) && orig >= 1 && orig <= 98) ? Math.floor(orig) : 50;
            if (v !== orig){ log(`pos.${k}`, orig, v); data[k] = v; }
        }
    }
    // permaBuffs — xpBonus pode dar XP infinito permanente se adulterado
    if (data.permaBuffs && typeof data.permaBuffs === 'object'){
        for (const k of Object.keys(data.permaBuffs)){
            const orig = data.permaBuffs[k];
            if (typeof orig !== 'number') continue;
            const cap = k === 'xpBonus' ? SAVE_CAPS.xpBonus : 10;   // outros buffs futuros: cap 10x
            const v = clampNumber(orig, cap, 0);
            if (v !== orig){ log(`permaBuffs.${k}`, orig, v); data.permaBuffs[k] = v; }
        }
    }
    // Stats — cap quantidade de keys + valores (evita DoS por save gigante de mobKills fake)
    if (data.stats && typeof data.stats === 'object'){
        if (data.stats.mobKills && typeof data.stats.mobKills === 'object'){
            const mk = data.stats.mobKills;
            const keys = Object.keys(mk);
            if (keys.length > SAVE_CAPS.statsKeys){
                log('stats.mobKills keys', keys.length, SAVE_CAPS.statsKeys);
                for (const k of keys.slice(SAVE_CAPS.statsKeys)) delete mk[k];
            }
            for (const k of Object.keys(mk)){
                mk[k] = clampNumber(mk[k], 9_999_999, 0);
            }
        }
        for (const k of ['pkKills', 'pkDeaths', 'mobDeaths', 'bossKills']){
            if (typeof data.stats[k] === 'number'){
                data.stats[k] = clampNumber(data.stats[k], 9_999_999, 0);
            }
        }
    }
    // Quests + flags — cap quantidade de keys (evita save inflado por mau ator)
    for (const field of ['quests', 'flags', 'questFlags']){
        if (data[field] && typeof data[field] === 'object'){
            const limit = field === 'quests' ? SAVE_CAPS.questsKeys : SAVE_CAPS.flagsKeys;
            const keys = Object.keys(data[field]);
            if (keys.length > limit){
                log(`${field} keys`, keys.length, limit);
                for (const k of keys.slice(limit)) delete data[field][k];
            }
        }
    }
    // Email — clampa em 120 chars, força string (evita injeção de objeto)
    if ('email' in data){
        const orig = data.email;
        const v = typeof orig === 'string' ? orig.trim().slice(0, 120) : '';
        if (v !== orig){ log('email', typeof orig === 'string' ? `${orig.length}c` : typeof orig, `${v.length}c`); data.email = v; }
    }
    return data;
}

function hashPwServer(clientHash){
    return crypto.createHash('sha256').update(ACCOUNTS_SALT + ':' + String(clientHash || '')).digest('hex');
}
function validAccountName(n){
    return typeof n === 'string' && n.length >= 1 && n.length <= 14 && /^[A-Za-z0-9_\- ]+$/.test(n);
}
function getAccount(name){ return accounts.get(String(name || '').toLowerCase()); }
function createAccount(name, clientHash, email){
    const a = {
        name, pwHash: hashPwServer(clientHash),
        save: null, savedAt: 0, createdAt: Date.now(),
        email: null, emailVerified: false, resetToken: null,
    };
    accounts.set(name.toLowerCase(), a);
    if (email && setAccountEmail(a, email) !== true){
        // Email inválido ou em uso — conta foi criada sem ele, user pode adicionar depois
        console.warn(`[auth] conta ${name} criada sem email (motivo: setAccountEmail falhou)`);
    }
    queueSaveAccounts();
    return a;
}
function verifyAccount(name, clientHash){
    const a = getAccount(name);
    if (!a) return false;
    return a.pwHash === hashPwServer(clientHash);
}
// Admin: lê estado salvo + online de um player. Retorna null se conta não existe.
function adminCheckUser(rawName){
    const nameLower = String(rawName || '').toLowerCase().trim();
    if (!nameLower) return null;
    const a = accounts.get(nameLower);
    if (!a) return null;
    let online = null;
    for (const pp of players.values()){
        if (pp.name && pp.name.toLowerCase() === nameLower){
            online = { x:pp.x, y:pp.y, hp:pp.hp, maxHp:pp.maxHp, mp:pp.mp, maxMp:pp.maxMp, gold:pp.gold };
            break;
        }
    }
    const s = a.save || {};
    return {
        name: a.name,
        email: a.email || null,
        createdAt: a.createdAt || 0,
        savedAt: a.savedAt || 0,
        save: { x:s.x, y:s.y, hp:s.hp, maxHp:s.maxHp, mp:s.mp, maxMp:s.maxMp, gold:s.gold },
        online,
    };
}
// Admin: reseta pos/hp do player. Corrige sprite invisível por save bichado.
function adminResetUser(rawName){
    const nameLower = String(rawName || '').toLowerCase().trim();
    if (!nameLower) return { ok:false, reason:'empty' };
    const a = accounts.get(nameLower);
    if (!a) return { ok:false, reason:'not_found' };
    a.save = a.save || {};
    a.save.x = 50; a.save.y = 50;
    // Restaura hp/mp pra topo do cap conhecido (se inválido)
    const mxH = (typeof a.save.maxHp === 'number' && a.save.maxHp > 0) ? a.save.maxHp : 100;
    const mxM = (typeof a.save.maxMp === 'number' && a.save.maxMp >= 0) ? a.save.maxMp : 0;
    a.save.maxHp = mxH; a.save.maxMp = mxM;
    a.save.hp = mxH; a.save.mp = mxM;
    a.savedAt = Date.now();
    // Se online, aplica imediato + força client a redesenhar
    let online = false;
    for (const pp of players.values()){
        if (pp.name && pp.name.toLowerCase() === nameLower){
            pp.x = 50; pp.y = 50;
            pp.hp = mxH; pp.maxHp = mxH;
            pp.mp = mxM; pp.maxMp = mxM;
            online = true;
            if (pp.ws.readyState === 1){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text:'Admin resetou sua posição. Recarregando…' }));
                broadcastPstatsAll(pp);
                // Força o client teleportar (server manda pstats + cliente recarrega)
                pp.ws.send(JSON.stringify({ t:'forceTeleport', x:50, y:50 }));
            }
            break;
        }
    }
    queueSaveAccounts();
    console.log(`[admin] reset user: ${nameLower} (online=${online})`);
    return { ok:true, name:a.name, online };
}
// Admin: remove conta + kicka player online + persiste. Retorna info pro caller.
function deleteUserAccount(rawName){
    const nameLower = String(rawName || '').toLowerCase().trim();
    if (!nameLower) return { ok:false, reason:'empty' };
    const a = accounts.get(nameLower);
    if (!a) return { ok:false, reason:'not_found' };
    // Tira do índice de email
    if (a.email) emailToAccount.delete(a.email.toLowerCase());
    accounts.delete(nameLower);
    // Kicka player online (se houver) e remove do Map
    let kicked = false;
    for (const [pid, pp] of Array.from(players.entries())){
        if (pp.name && pp.name.toLowerCase() === nameLower){
            try {
                if (pp.ws && pp.ws.readyState === 1){
                    pp.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text:'Sua conta foi removida pelo admin.' }));
                    pp.ws.close(4001, 'account_deleted');
                }
            } catch {}
            players.delete(pid);
            kicked = true;
        }
    }
    queueSaveAccounts();
    console.log(`[admin] conta removida: ${nameLower} (online=${kicked})`);
    return { ok:true, name:a.name, kicked };
}

// ─── Fase 5.5: Email + recuperação de senha ────────────────────────────────
// Email armazenado em lowercase. Único por conta (Map auxiliar emailToAccount).
// Reset token: 32 bytes hex, válido 1h. Envio via Resend (env RESEND_API_KEY)
// — se não configurado, server loga URL de reset no stdout (modo dev/preview).
const emailToAccount = new Map();   // email lowercase → nameLower
function isValidEmail(s){
    if (typeof s !== 'string') return false;
    const e = s.trim();
    if (e.length < 5 || e.length > 120) return false;
    return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(e);
}
function setAccountEmail(acc, email){
    if (!isValidEmail(email)) return 'invalid_email';
    const norm = email.trim().toLowerCase();
    const owner = emailToAccount.get(norm);
    if (owner && owner !== acc.name.toLowerCase()) return 'email_in_use';
    // Remove email antigo do índice se existir
    if (acc.email) emailToAccount.delete(acc.email);
    acc.email = norm;
    emailToAccount.set(norm, acc.name.toLowerCase());
    queueSaveAccounts();
    return true;
}
function findAccountByEmail(email){
    const norm = String(email || '').trim().toLowerCase();
    const nameLower = emailToAccount.get(norm);
    return nameLower ? accounts.get(nameLower) : null;
}
function generateResetToken(){
    return crypto.randomBytes(24).toString('hex');
}
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;   // 1h
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;  // 1 reset / minuto / conta
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Valadares <noreply@send.valadares.app.br>';
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://valadares.app.br';
async function sendEmail(to, subject, html){
    if (!RESEND_API_KEY){
        console.log(`[email:dev] TO=${to} SUBJECT="${subject}"\n${html}`);
        return { ok: true, dev: true };
    }
    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
        });
        if (!r.ok){
            const body = await r.text().catch(() => '');
            console.error(`[email] Resend HTTP ${r.status}: ${body}`);
            return { ok: false, error: `http_${r.status}` };
        }
        return { ok: true };
    } catch (e){
        console.error('[email] erro:', e.message);
        return { ok: false, error: e.message };
    }
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
                if (!a || !a.name || !a.pwHash) continue;
                accounts.set(a.name.toLowerCase(), a);
                // Fase 5.5: reconstrói índice email → conta
                if (a.email && typeof a.email === 'string'){
                    emailToAccount.set(a.email.toLowerCase(), a.name.toLowerCase());
                }
            }
        }
        console.log(`[accounts] ${accounts.size} contas carregadas de disco (${emailToAccount.size} com email)`);
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
    // Hunter HL: se foi o último caçador do target, credita bonus
    if (m.hunter && m.huntTargetId != null){
        const tp = players.get(m.huntTargetId);
        if (tp){
            const stillAlive = Array.from(monsters.values()).some(x =>
                x.id !== m.id && x.hunter && x.huntTargetId === tp.id && x.hp > 0);
            if (!stillAlive){
                const COOLDOWN_MS = 5 * 60 * 1000;
                tp._lastHlHuntClaim = Date.now();
                const amount = 200 + Math.floor(Math.random() * 250);
                tp.gold = (tp.gold || 0) + amount;
                syncGoldRank(tp.name, tp.gold);
                sendInvUpdate(tp, { goldDelta:{ amount, reason:'hl_hunt' } });
                if (tp.ws && tp.ws.readyState === 1){
                    tp.ws.send(JSON.stringify({ t:'hlHuntResult', ok:true, amount, retryAt: tp._lastHlHuntClaim + COOLDOWN_MS }));
                }
            }
        }
    }
    monsters.delete(m.id);
    const killer = players.get(killerId);
    const loot = rollLoot(m.type);
    // T1: XP authoritative na skill da arma equipada do killer
    let xpGained = 0, skillUsed = null;
    if (killer){
        skillUsed = weaponSkillOf(killer);
        gainSkillXpServer(killer, skillUsed, m.xp || 1);
        xpGained = m.xp || 1;
    }
    if (killer && killer.ws.readyState === 1){
        killer.ws.send(JSON.stringify({
            t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level, loot,
            skill: skillUsed, xpGained,
        }));
        // Envia skills atualizadas (autoritativo)
        sendInvUpdate(killer, { skills: killer.skills, reason:'mobKill' });
    }
    broadcast(killerId, { t:'mobDead', mobId:m.id, byName: killer?.name || '?', level: m.level });
    if (killer){
        bumpMobKill(killer.name, !!m.unique);
        sharePartyKill(killer, m);
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

// ─── T2: Regen passivo HP/MP autoritativo server-side ──────────────────────
// Cliente para de aplicar regen quando online; server roda tick e broadcasta
// pstats (incluindo o próprio player). Anti-AFK preservado via mensagem
// tabActive { active } que o cliente envia no visibilitychange.
const SRV_ARMOR_UPGRADES = [
    null,
    { def: 1 },
    { def: 2 },
    { def: 3, hpRegen: 1 },
    { def: 5, hpRegen: 2 },
    { def: 7, hpRegen: 3 },
];
function srvUpgradeBonusArmor(itemKey){
    const tier = getUpgradeTier(itemKey);
    return SRV_ARMOR_UPGRADES[tier.plus] || null;
}
function totalDefenseServer(p){
    if (!p.equipped) return 0;
    let total = 0;
    for (const slot of ['weapon','offhand','armor','head','feet','neck']){
        const k = p.equipped[slot];
        if (!k) continue;
        const tier = getUpgradeTier(k);
        const meta = ITEM_META[tier.base];
        if (meta && typeof meta.def === 'number') total += meta.def;
        const up = srvUpgradeBonusArmor(k);
        if (up && typeof up.def === 'number') total += up.def;
    }
    return total;
}
function armorHpRegenServer(p){
    if (!p.equipped) return 0;
    let total = 0;
    for (const slot of ['armor','offhand','head','feet','neck']){
        const k = p.equipped[slot];
        if (!k) continue;
        const up = srvUpgradeBonusArmor(k);
        if (up && typeof up.hpRegen === 'number') total += up.hpRegen;
    }
    return total;
}
function pvpMultsServer(p){
    const s = Math.min(5, p.selos || 0);
    const m = { regenHp: s >= 5 ? 2 : 1, regenMp: s >= 5 ? 2 : 1 };
    if (p.highlander){
        m.regenHp = Math.max(m.regenHp, 2);
        m.regenMp = Math.max(m.regenMp, 2);
    }
    return m;
}
function broadcastPstatsAll(p){
    const payload = JSON.stringify({
        t:'pstats', id:p.id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp,
        cosmetic:p.cosmetic, equipped:p.equipped, badges:p.badges || []
    });
    for (const other of players.values()){
        if (other.ws.readyState === 1) other.ws.send(payload);
    }
}
const REGEN_HP_BASE_MS = 4000;
const REGEN_MP_BASE_MS = 2000;
function tickPlayerRegen(){
    const now = Date.now();
    for (const p of players.values()){
        if (!p.ws || p.ws.readyState !== 1) continue;
        if ((p.hp ?? 100) <= 0) continue;
        if (p._tabActive === false) continue;
        p._regenHpAt = p._regenHpAt || now;
        p._regenMpAt = p._regenMpAt || now;
        const inPz = inSafe(p.x, p.y);
        const pzHp = inPz ? 4 : 1;
        const pzMp = inPz ? 3 : 1;
        const mults = pvpMultsServer(p);
        const armorHp = armorHpRegenServer(p);
        const talent = (p.permaBuffs && p.permaBuffs.regenBonus) || 0;
        const hpInterval = REGEN_HP_BASE_MS / (mults.regenHp * pzHp);
        const mpInterval = REGEN_MP_BASE_MS / (mults.regenMp * pzMp);
        let changed = false;
        const maxHp = p.maxHp || 100;
        const maxMp = p.maxMp || 0;
        if (now - p._regenHpAt >= hpInterval && p.hp < maxHp){
            const heal = 1 + armorHp + (inPz ? 1 : 0) + talent;
            p.hp = Math.min(maxHp, p.hp + heal);
            p._regenHpAt = now;
            changed = true;
        }
        if (maxMp > 0 && now - p._regenMpAt >= mpInterval && p.mp < maxMp){
            const mpGain = (inPz ? 2 : 1) + talent;
            p.mp = Math.min(maxMp, p.mp + mpGain);
            p._regenMpAt = now;
            changed = true;
        }
        // ManaBuff (POTION_MP): 8mp/s autoritativo enquanto ativo.
        if (p.manaBuff && maxMp > 0){
            if (now >= p.manaBuff.until){
                p.manaBuff = null;
                changed = true;
            } else if (p.mp < maxMp){
                const elapsed = now - (p.manaBuff.lastTickAt || now);
                if (elapsed >= 250){   // tick ~4× por segundo
                    const gain = Math.max(1, Math.floor(elapsed * p.manaBuff.mpPerSec / 1000));
                    p.mp = Math.min(maxMp, p.mp + gain);
                    p.manaBuff.lastTickAt = now;
                    changed = true;
                }
            }
        }
        if (changed) broadcastPstatsAll(p);
    }
}
setInterval(tickPlayerRegen, 500);

// ─── Fase 5 N3: DoTs em players (poison/bleed) + stun server-side ──────────
// Espelha ATTACKER_STATUS do cliente. tickAI chama applyAttackerStatus(target,
// mobType) após aplicar dmg direto. tickPlayerDots roda 1×1s, drena hp e
// broadcasta pstats + float. Stun é só duração (cliente respeita pra input).
const ATTACKER_STATUS = {
    SPIDER:   { dot:[{ type:'poison', chance:0.15, dmg:2, ticks:4, intervalMs:3000, label:'Aranha' }] },
    SCORPION: { dot:[{ type:'poison', chance:0.30, dmg:3, ticks:5, intervalMs:3000, label:'Escorpião' }] },
    LIZARD:   { dot:[{ type:'bleed',  chance:0.20, dmg:1, ticks:6, intervalMs:2000, label:'Lagarto' }] },
    TROLL:    { stun:[{ chance:0.10, durationMs:1500, label:'Troll' }] },
    MINOTAUR: { stun:[{ chance:0.25, durationMs:2000, label:'Minotauro' }] },
    SENHOR_VALADARES: {
        stun:[{ chance:0.45, durationMs:2500, label:'Senhor de Valadares' }],
        dot: [{ type:'bleed', chance:0.60, dmg:6, ticks:6, intervalMs:2000, label:'Senhor de Valadares' }],
    },
};
function applyAttackerStatus(target, mobType){
    const entry = ATTACKER_STATUS[mobType];
    if (!entry || !target) return;
    if (entry.dot){
        for (const d of entry.dot){
            if (Math.random() >= d.chance) continue;
            target.dots = target.dots || [];
            const totalNew = d.dmg * d.ticks;
            const existing = target.dots.find(x => x.type === d.type);
            const totalOld = existing ? existing.dmg * existing.ticksLeft : 0;
            if (totalNew >= totalOld){
                if (existing){
                    existing.dmg = d.dmg;
                    existing.ticksLeft = d.ticks;
                    existing.intervalMs = d.intervalMs;
                    existing.nextTickAt = Date.now() + d.intervalMs;
                } else {
                    target.dots.push({
                        type: d.type, dmg: d.dmg, ticksLeft: d.ticks,
                        intervalMs: d.intervalMs, nextTickAt: Date.now() + d.intervalMs,
                    });
                }
                if (target.ws && target.ws.readyState === 1){
                    target.ws.send(JSON.stringify({ t:'playerDot', type:d.type, source:d.label }));
                }
            }
        }
    }
    if (entry.stun){
        for (const s of entry.stun){
            if (Math.random() >= s.chance) continue;
            const endAt = Date.now() + s.durationMs;
            if (!target._stunnedUntil || target._stunnedUntil < endAt){
                target._stunnedUntil = endAt;
                if (target.ws && target.ws.readyState === 1){
                    target.ws.send(JSON.stringify({ t:'playerStun', durationMs:s.durationMs, source:s.label }));
                }
            }
        }
    }
}
const PLAYER_DOT_COLORS = { poison:'#74d176', bleed:'#cc3030', burn:'#ff8030' };
function tickPlayerDots(){
    const now = Date.now();
    for (const p of players.values()){
        if (!p.dots || !p.dots.length) continue;
        if (!p.ws || p.ws.readyState !== 1) continue;
        if ((p.hp ?? 100) <= 0){ p.dots.length = 0; continue; }
        let hpChanged = false;
        for (let i = p.dots.length - 1; i >= 0; i--){
            const d = p.dots[i];
            if (now < d.nextTickAt) continue;
            const dmg = d.dmg;
            p.hp = Math.max(0, p.hp - dmg);
            hpChanged = true;
            // float no próprio player (server manda playerFloat)
            for (const other of players.values()){
                if (other.ws.readyState !== 1) continue;
                other.ws.send(JSON.stringify({
                    t:'playerFloat', id:p.id, text:`-${dmg}`,
                    color: PLAYER_DOT_COLORS[d.type] || '#aaa',
                }));
            }
            d.ticksLeft--;
            if (d.ticksLeft <= 0){
                p.dots.splice(i, 1);
                if (p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'playerDotEnd', type:d.type }));
                }
            } else {
                d.nextTickAt = now + d.intervalMs;
            }
            if (p.hp === 0){
                p.dots.length = 0;
                break;
            }
        }
        if (hpChanged) broadcastPstatsAll(p);
    }
}
setInterval(tickPlayerDots, 1000);

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

// ─── Eventos Diários (rotativos por dia) ──────────────────────────────────
// 3 tipos rotativos por dia (deterministic baseado em dayN). Janela 60min em
// hora pseudo-random entre 13h e 21h BRT. Anúncio global ao abrir/fechar.
const DAILY_EVENT_TYPES = [
    { id:'gold_rain', name:'Chuva de Ouro',       emoji:'💰', desc:'Cai ouro do céu pros players online (a cada 30s)', durationMin: 60 },
    { id:'siege',     name:'Cerco Demoníaco',     emoji:'👹', desc:'Hordas extras de mobs no centro do mapa',           durationMin: 60 },
    { id:'wisdom',    name:'Bênção da Sabedoria', emoji:'📜', desc:'+50% de XP em todas as skills',                     durationMin: 60 },
];
function getBrtDate(){ return new Date(Date.now() - 3*60*60*1000); }
function getDayN(){ return Math.floor(getBrtDate().getTime() / 86400000); }
function getCurrentDailyEvent(){
    const dayN = getDayN();
    const type = DAILY_EVENT_TYPES[Math.abs(dayN) % DAILY_EVENT_TYPES.length];
    // Hora pseudo-random entre 13h-21h (8 horas possíveis) — determinístico por dia
    const hashHour = (Math.abs(dayN * 2654435761) >>> 0) % 8;
    const startHour = 13 + hashHour;
    return { dayN, type, startHour };
}
function isDailyEventActive(info){
    const d = getBrtDate();
    const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    const startMin = info.startHour * 60;
    return nowMin >= startMin && nowMin < startMin + info.type.durationMin;
}
function getDailyEventEndMs(info){
    // Timestamp UTC real do startHour BRT: o "Date BRT" tem o dia-BRT, e startHour+3 = UTC
    const d = getBrtDate();
    const realStartUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), info.startHour + 3, 0, 0);
    return realStartUtc + info.type.durationMin * 60_000;
}
let dailyEventState = {
    currentDay: -1,
    type: null,
    isActive: false,
    announcedOpen: false,
    announcedClose: false,
    nextTickAt: 0,
    extraMobIds: [],
};
function tickDailyEvent(){
    const info = getCurrentDailyEvent();
    if (dailyEventState.currentDay !== info.dayN){
        // Vira o dia — reseta tudo
        if (dailyEventState.isActive){
            // Cleanup do estado anterior (caso server fique online cruzando meia-noite com evento ativo)
            cleanupDailyEvent();
        }
        dailyEventState = {
            currentDay: info.dayN,
            type: info.type,
            isActive: false,
            announcedOpen: false,
            announcedClose: false,
            nextTickAt: 0,
            extraMobIds: [],
        };
        console.log(`[daily] novo dia: ${info.type.id} às ${info.startHour}h BRT`);
    }
    const active = isDailyEventActive(info);
    const endMs = getDailyEventEndMs(info);
    if (active && !dailyEventState.isActive){
        dailyEventState.isActive = true;
        dailyEventState.announcedOpen = true;
        broadcastMsg('event', `${info.type.emoji} ${info.type.name}: ${info.type.desc} (${info.type.durationMin} min)`);
        broadcast(null, { t:'eventBonus', id: info.type.id, name: info.type.name, emoji: info.type.emoji, xpMul: info.type.id === 'wisdom' ? 1.5 : 1.0, until: endMs });
        console.log(`[daily] ${info.type.id} aberto`);
    } else if (!active && dailyEventState.isActive){
        dailyEventState.isActive = false;
        dailyEventState.announcedClose = true;
        broadcastMsg('warn', `${info.type.emoji} ${info.type.name} encerrou.`);
        broadcast(null, { t:'eventBonus', id:null, xpMul: 1.0, until: 0 });
        cleanupDailyEvent();
        console.log(`[daily] ${info.type.id} fechado`);
    }
    if (active){
        const now = Date.now();
        if (now >= dailyEventState.nextTickAt){
            applyDailyEventTick();
            const interval = info.type.id === 'gold_rain' ? 30_000 : info.type.id === 'siege' ? 60_000 : 60_000;
            dailyEventState.nextTickAt = now + interval;
        }
    }
}
function applyDailyEventTick(){
    const t = dailyEventState.type;
    if (!t) return;
    if (t.id === 'gold_rain'){
        // Dá 30-60g pra todos online (não fantasmas). N3 fase 3: server é fonte única —
        // antes cliente ALSO somava amount localmente (bug: dobrava o gold). Agora envia
        // via invUpdate.goldDelta com reason='gold_rain'; cliente só exibe feedback.
        for (const p of players.values()){
            if (p.disconnected) continue;
            const amount = 30 + Math.floor(Math.random() * 31);
            p.gold = (p.gold || 0) + amount;
            syncGoldRank(p.name, p.gold);
            sendInvUpdate(p, { goldDelta:{ amount, reason:'gold_rain' } });
        }
    } else if (t.id === 'siege'){
        // Spawna 3-4 mobs random no anel ao redor do centro (raio 12-25)
        const siegeMobs = ['ORC', 'SKELETON', 'WOLF', 'SPIDER'];
        const count = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++){
            const type = siegeMobs[Math.floor(Math.random() * siegeMobs.length)];
            const ang = Math.random() * Math.PI * 2;
            const r = 12 + Math.random() * 13;
            const x = Math.round(50 + Math.cos(ang) * r);
            const y = Math.round(50 + Math.sin(ang) * r);
            const m = spawnMob(type, x, y);
            if (m){
                m.fromEvent = true;
                dailyEventState.extraMobIds.push(m.id);
                if (dailyEventState.extraMobIds.length > 60) dailyEventState.extraMobIds.shift();
            }
        }
    }
    // 'wisdom' não precisa de tick — multiplier é aplicado pelo cliente
}
function cleanupDailyEvent(){
    // Despawna mobs extras pendentes (siege)
    for (const id of dailyEventState.extraMobIds){
        if (monsters.has(id)){
            monsters.delete(id);
            broadcast(null, { t:'mobDead', mobId: id, byName:'evento encerrou', level: 1 });
        }
    }
    dailyEventState.extraMobIds = [];
}
// Snapshot pro client recém-conectado saber se tem evento ativo
function dailyEventSnapshot(){
    const info = getCurrentDailyEvent();
    const active = isDailyEventActive(info);
    return {
        id: info.type.id,
        name: info.type.name,
        emoji: info.type.emoji,
        desc: info.type.desc,
        startHour: info.startHour,
        active,
        xpMul: (active && info.type.id === 'wisdom') ? 1.5 : 1.0,
        until: active ? getDailyEventEndMs(info) : 0,
    };
}
setInterval(tickDailyEvent, 30_000);
setTimeout(tickDailyEvent, 8_000);   // primeiro check 8s após boot

// ─── Duelos 1v1 consensuais ──────────────────────────────────────────────
const duelInvites = new Map();   // toId -> { fromId, fromName, amount, expiresAt }
const DUEL_INVITE_TIMEOUT_MS = 30_000;
const DUEL_MAX_MS = 3 * 60_000;   // 3 min cap (sem vencedor = empate)

function startDuel(p1, p2, amount){
    p1.gold = Math.max(0, (p1.gold || 0) - amount);
    p2.gold = Math.max(0, (p2.gold || 0) - amount);
    const r1 = ensureRanking(p1.name); if (r1) r1.gold = p1.gold;
    const r2 = ensureRanking(p2.name); if (r2) r2.gold = p2.gold;
    const startedAt = Date.now();
    p1.duel = { opponentId: p2.id, opponentName: p2.name, amount, startedAt };
    p2.duel = { opponentId: p1.id, opponentName: p1.name, amount, startedAt };
    const until = startedAt + DUEL_MAX_MS;
    sendTo(p1.id, { t:'duelStart', opponentId: p2.id, opponentName: p2.name, amount, until, gold: p1.gold });
    sendTo(p2.id, { t:'duelStart', opponentId: p1.id, opponentName: p1.name, amount, until, gold: p2.gold });
    broadcastMsg('event', `⚔ ${p1.name} vs ${p2.name} — DUELO! Aposta: ${amount}g cada`);
}

function endDuel(winner, loser, draw){
    const amount = (winner.duel && winner.duel.amount) || (loser.duel && loser.duel.amount) || 0;
    if (draw){
        winner.gold = (winner.gold || 0) + amount;
        loser.gold  = (loser.gold  || 0) + amount;
    } else {
        winner.gold = (winner.gold || 0) + amount * 2;
    }
    syncGoldRank(winner.name, winner.gold);
    syncGoldRank(loser.name,  loser.gold);
    const rW = ensureRanking(winner.name);
    const rL = ensureRanking(loser.name);
    if (rW && !draw){ rW.duelWins = (rW.duelWins || 0) + 1; }
    if (rL && !draw){ rL.duelLosses = (rL.duelLosses || 0) + 1; }
    sendTo(winner.id, { t:'duelEnd', winner:true,  draw:!!draw, amount, opponentName: loser.name,  gold: winner.gold });
    sendTo(loser.id,  { t:'duelEnd', winner:false, draw:!!draw, amount, opponentName: winner.name, gold: loser.gold });
    if (draw){
        broadcastMsg('warn', `⚔ Duelo entre ${winner.name} e ${loser.name} terminou empate.`);
    } else {
        broadcastMsg('event', `🏆 ${winner.name} venceu o duelo contra ${loser.name}! (+${amount * 2}g)`);
    }
    winner.duel = null;
    loser.duel = null;
}

function tickDuels(){
    const now = Date.now();
    // Expira invites
    for (const [toId, inv] of duelInvites){
        if (inv.expiresAt <= now){
            duelInvites.delete(toId);
            const from = players.get(inv.fromId);
            if (from) sendTo(from.id, { t:'serverMsg', level:'warn', text:`Convite de duelo a ${inv.toName || '?'} expirou.` });
        }
    }
    // Empata duels que duraram demais
    const visited = new Set();
    for (const p of players.values()){
        if (!p.duel || visited.has(p.id)) continue;
        if (now - p.duel.startedAt > DUEL_MAX_MS){
            const opp = players.get(p.duel.opponentId);
            if (opp && opp.duel && opp.duel.opponentId === p.id){
                endDuel(p, opp, true);   // draw
                visited.add(p.id);
                visited.add(opp.id);
            } else {
                p.duel = null;   // opponent sumiu
            }
        }
    }
}
setInterval(tickDuels, 5_000);

// ─── Party 1-4 players ─────────────────────────────────────────────────────
// Grupo efêmero (não persiste). Lidera quem cria. Compartilha XP de mob por
// proximidade (raio 12) e dá visibilidade do HP dos colegas no minimap.
const parties = new Map();        // partyId → { id, leader, members:[name], createdAt }
const partyInvites = new Map();   // toName(lower) → { partyId, fromId, fromName, expiresAt }
const PARTY_MAX = 4;
const PARTY_INVITE_TIMEOUT_MS = 60_000;
const PARTY_SHARE_RADIUS = 12;
const PARTY_XP_FRACTION = 0.6;    // membros próximos ganham 60% do XP base do mob
let nextPartyId = 1;

function findPartyOfPlayer(name){
    const low = name.toLowerCase();
    for (const party of parties.values()){
        if (party.members.some(n => n.toLowerCase() === low)) return party;
    }
    return null;
}
function partyMembersOnline(party){
    const out = [];
    const wanted = new Set(party.members.map(n => n.toLowerCase()));
    for (const pp of players.values()){
        if (pp.disconnected) continue;
        if (wanted.has(pp.name.toLowerCase())) out.push(pp);
    }
    return out;
}
function broadcastPartyUpdate(party){
    if (!party) return;
    const payload = { t:'partyUpdate', partyId: party.id, leader: party.leader, members: party.members };
    for (const pp of partyMembersOnline(party)){
        if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify(payload));
    }
}
function sendPartyEnded(memberName){
    for (const pp of players.values()){
        if (!pp.disconnected && pp.name.toLowerCase() === memberName.toLowerCase() && pp.ws.readyState === 1){
            pp.ws.send(JSON.stringify({ t:'partyUpdate', deleted: true }));
            break;
        }
    }
}
function handlePartyCommand(p, text){
    const parts = text.split(/\s+/);
    const sub = (parts[1] || '').toLowerCase();
    const arg = parts.slice(2).join(' ').trim();
    const myParty = findPartyOfPlayer(p.name);
    const id = p.id;
    if (sub === 'invite'){
        if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /party invite NOME' }); return; }
        if (arg.toLowerCase() === p.name.toLowerCase()){ sendTo(id, { t:'serverMsg', level:'warn', text:'Não dá pra convidar a si mesmo.' }); return; }
        let target = null;
        for (const pp of players.values()){
            if (!pp.disconnected && pp.name.toLowerCase() === arg.toLowerCase()){ target = pp; break; }
        }
        if (!target){ sendTo(id, { t:'serverMsg', level:'warn', text:`"${arg}" não está online.` }); return; }
        const targetParty = findPartyOfPlayer(target.name);
        if (targetParty){ sendTo(id, { t:'serverMsg', level:'warn', text:`${target.name} já está em outra party.` }); return; }
        let party = myParty;
        if (!party){
            // Cria party com o convidante como líder
            party = { id: nextPartyId++, leader: p.name, members: [p.name], createdAt: Date.now() };
            parties.set(party.id, party);
            broadcastPartyUpdate(party);
        } else if (party.leader !== p.name){
            sendTo(id, { t:'serverMsg', level:'warn', text:'Só o líder convida.' });
            return;
        }
        if (party.members.length >= PARTY_MAX){
            sendTo(id, { t:'serverMsg', level:'warn', text:`Party cheia (max ${PARTY_MAX}).` });
            return;
        }
        partyInvites.set(target.name.toLowerCase(), { partyId: party.id, fromId: id, fromName: p.name, expiresAt: Date.now() + PARTY_INVITE_TIMEOUT_MS });
        sendTo(target.id, { t:'serverMsg', level:'event', text:`👥 ${p.name} te convidou pra party. Use /party accept` });
        sendTo(target.id, { t:'partyInvite', fromName: p.name, expiresIn: PARTY_INVITE_TIMEOUT_MS });
        sendTo(id, { t:'serverMsg', level:'info', text:`Convite enviado pra ${target.name} (60s).` });
        return;
    }
    if (sub === 'accept'){
        const inv = partyInvites.get(p.name.toLowerCase());
        if (!inv || inv.expiresAt < Date.now()){
            partyInvites.delete(p.name.toLowerCase());
            sendTo(id, { t:'serverMsg', level:'warn', text:'Sem convites de party pendentes.' });
            return;
        }
        const party = parties.get(inv.partyId);
        if (!party){ partyInvites.delete(p.name.toLowerCase()); sendTo(id, { t:'serverMsg', level:'warn', text:'A party não existe mais.' }); return; }
        if (myParty){ sendTo(id, { t:'serverMsg', level:'warn', text:'Você já está numa party. /party leave primeiro.' }); return; }
        if (party.members.length >= PARTY_MAX){ sendTo(id, { t:'serverMsg', level:'warn', text:`Party cheia (max ${PARTY_MAX}).` }); return; }
        party.members.push(p.name);
        partyInvites.delete(p.name.toLowerCase());
        // Notifica todos os membros
        for (const pp of partyMembersOnline(party)){
            if (pp.ws.readyState === 1){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'event', text:`✦ ${p.name} entrou na party!` }));
            }
        }
        broadcastPartyUpdate(party);
        return;
    }
    if (sub === 'leave'){
        if (!myParty){ sendTo(id, { t:'serverMsg', level:'warn', text:'Você não está em party.' }); return; }
        const wasLeader = myParty.leader === p.name;
        myParty.members = myParty.members.filter(n => n !== p.name);
        sendTo(id, { t:'partyUpdate', deleted: true });
        sendTo(id, { t:'serverMsg', level:'info', text:'Você saiu da party.' });
        if (myParty.members.length === 0){
            parties.delete(myParty.id);
            return;
        }
        if (wasLeader) myParty.leader = myParty.members[0];
        for (const pp of partyMembersOnline(myParty)){
            if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text:`👥 ${p.name} saiu da party.` }));
        }
        broadcastPartyUpdate(myParty);
        return;
    }
    if (sub === 'kick'){
        if (!myParty){ sendTo(id, { t:'serverMsg', level:'warn', text:'Sem party.' }); return; }
        if (myParty.leader !== p.name){ sendTo(id, { t:'serverMsg', level:'warn', text:'Só o líder dá kick.' }); return; }
        if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /party kick NOME' }); return; }
        if (arg.toLowerCase() === p.name.toLowerCase()){ sendTo(id, { t:'serverMsg', level:'warn', text:'Use /party leave pra sair.' }); return; }
        if (!myParty.members.find(n => n.toLowerCase() === arg.toLowerCase())){
            sendTo(id, { t:'serverMsg', level:'warn', text:`"${arg}" não está na party.` });
            return;
        }
        myParty.members = myParty.members.filter(n => n.toLowerCase() !== arg.toLowerCase());
        sendPartyEnded(arg);
        if (myParty.members.length === 0){
            parties.delete(myParty.id);
        } else {
            for (const pp of partyMembersOnline(myParty)){
                if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text:`👥 ${p.name} removeu ${arg} da party.` }));
            }
            broadcastPartyUpdate(myParty);
        }
        return;
    }
    if (sub === 'info' || sub === ''){
        if (!myParty){ sendTo(id, { t:'serverMsg', level:'info', text:'Sem party. /party invite NOME pra criar.' }); return; }
        const memberLine = myParty.members.map(n => n === myParty.leader ? `👑 ${n}` : n).join(', ');
        sendTo(id, { t:'serverMsg', level:'info', text:`Party (${myParty.members.length}/${PARTY_MAX}): ${memberLine}` });
        return;
    }
    sendTo(id, { t:'serverMsg', level:'warn', text:'Subcomandos: invite NOME, accept, leave, kick NOME, info' });
}

function sharePartyKill(killer, mob){
    if (!killer) return;
    const party = findPartyOfPlayer(killer.name);
    if (!party || party.members.length < 2) return;
    const shareXp = Math.max(1, Math.round((mob.xp || 0) * PARTY_XP_FRACTION));
    for (const pp of partyMembersOnline(party)){
        if (pp.name === killer.name) continue;
        if (chebyshev(pp.x, pp.y, mob.x, mob.y) > PARTY_SHARE_RADIUS) continue;
        if (pp.ws.readyState !== 1) continue;
        // T3: XP authoritative na skill da arma equipada do membro
        const skill = weaponSkillOf(pp);
        gainSkillXpServer(pp, skill, shareXp);
        pp.ws.send(JSON.stringify({ t:'partyShareKill', mobType: mob.type, xp: shareXp, skill, fromName: killer.name }));
        sendSkillsOnly(pp, 'partyShare');
    }
}

function tickPartyInvites(){
    const now = Date.now();
    for (const [key, inv] of partyInvites){
        if (inv.expiresAt <= now){
            partyInvites.delete(key);
            const from = players.get(inv.fromId);
            if (from && from.ws.readyState === 1){
                from.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text:`Convite de party expirou.` }));
            }
        }
    }
}
setInterval(tickPartyInvites, 10_000);

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
    if (megaBoss.spawnedAt){ console.log('[mega] skip: já vivo'); return; }
    if (!allBossesAtMaxLevel()){
        const levels = BOSSES.map(b => `${b.type}=${bossLevel.get(b.type) || 1}`).join(' ');
        console.log(`[mega] skip: bosses não estão maxados — ${levels}`);
        return;
    }
    const cdLeft = MEGA_BOSS_COOLDOWN_MS - (Date.now() - megaBoss.lastResolvedAt);
    if (cdLeft > 0){
        console.log(`[mega] skip: cooldown ${Math.floor(cdLeft/60000)}min restantes`);
        return;
    }
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

// Remove TODOS os ghosts com este nome (exceto o próprio id, se passado).
// Chamado em auth, join e close pra impedir acúmulo quando o WS cai antes do join.
function removeGhostsByName(name, exceptId){
    if (!name) return 0;
    let n = 0;
    for (const [oid, op] of players){
        if (oid === exceptId) continue;
        if (op.disconnected && op.name === name){
            players.delete(oid);
            broadcast(null, { t:'leave', id: oid });
            n++;
        }
    }
    if (n > 0) console.log(`    [cleanup] ${n} ghost(s) de ${name} removidos`);
    return n;
}

// ─── Conexões ───────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
    const id = nextId++;
    const p  = { ws, id, name:'Anônimo', x:50, y:50, dir:'down', hp:100, maxHp:100 };
    players.set(id, p);
    console.log(`[+] ${id} conectou (${players.size} online)`);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // Heartbeat app-level — cliente manda a cada ~25s pra evitar idle timeout
        // de proxies (Cloudflare/Railway costumam fechar WS após 60s sem dados C→S).
        if (msg.t === 'ping') {
            try { ws.send(JSON.stringify({ t:'pong' })); } catch {}
            return;
        }

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
                // Email opcional no registro inicial — user pode adicionar depois.
                // Se passou email inválido ou em uso, conta é criada sem ele.
                const optEmail = isValidEmail(msg.email) ? msg.email : null;
                acc = createAccount(name, pwHash, optEmail);
                isNew = true;
                console.log(`[auth] nova conta: ${name}${acc.email ? ' (com email)' : ''}`);
            } else if (!verifyAccount(name, pwHash)){
                ws.send(JSON.stringify({ t:'authFail', reason:'bad_password' }));
                return;
            }
            p.authed = true;
            p.authedName = acc.name;
            // Já limpa ghosts antigos no momento do auth — mesmo se o WS cair antes do join,
            // não acumula corpos órfãos. Importante quando rede do user oscila bastante.
            removeGhostsByName(acc.name, id);
            ws.send(JSON.stringify({
                t:'authOk', isNew, save: acc.save || null, savedAt: acc.savedAt || 0,
                hasEmail: !!acc.email,
            }));
            return;
        }

        // ─── Fase 5.5: Adicionar/alterar email da conta (autenticado) ──────
        if (msg.t === 'setEmail') {
            if (!p.authed || !p.authedName) return;
            const acc = getAccount(p.authedName);
            if (!acc) return;
            const result = setAccountEmail(acc, String(msg.email || ''));
            if (result === true){
                if (p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'setEmailResult', ok:true, email:acc.email }));
                }
                console.log(`[auth] email setado pra conta ${acc.name}`);
            } else {
                if (p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'setEmailResult', ok:false, reason: result }));
                }
            }
            return;
        }

        // ─── Fase 5.5: Solicitar reset de senha via WS (alternativa ao HTTP) ──
        if (msg.t === 'passwordResetRequest') {
            // Resposta opaca: NÃO revela se email existe (anti-enumeration)
            const ok = () => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'passwordResetResult', ok:true })); };
            const email = String(msg.email || '').trim().toLowerCase();
            if (!isValidEmail(email)){ ok(); return; }
            const acc = findAccountByEmail(email);
            if (!acc){ ok(); return; }
            // Cooldown anti-spam
            const now = Date.now();
            if (acc.resetToken && acc.resetToken.requestedAt && now - acc.resetToken.requestedAt < RESET_REQUEST_COOLDOWN_MS){
                ok(); return;
            }
            const token = generateResetToken();
            acc.resetToken = { token, expiresAt: now + RESET_TOKEN_TTL_MS, requestedAt: now };
            queueSaveAccounts();
            const resetUrl = `${SITE_BASE_URL}/reset?t=${token}`;
            const html = `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
                    <h2 style="color:#8b2020">Valadares — Recuperação de senha</h2>
                    <p>Olá <b>${acc.name}</b>,</p>
                    <p>Recebemos uma solicitação pra redefinir a senha da sua conta no Valadares. Clica no link abaixo nos próximos 60 minutos:</p>
                    <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#d4a847;color:#0a0805;text-decoration:none;border-radius:4px;font-weight:600">Redefinir senha</a></p>
                    <p style="color:#666;font-size:13px">Se o botão não funcionar, copie e cole: <br><code>${resetUrl}</code></p>
                    <p style="color:#666;font-size:13px">Se você não pediu isso, pode ignorar este email — sua senha continua a mesma.</p>
                    <hr style="border:0;border-top:1px solid #eee;margin:24px 0">
                    <p style="color:#999;font-size:11px">Valadares · Paranaguá/PR</p>
                </div>`;
            sendEmail(acc.email, 'Valadares — Redefinir sua senha', html).then(r => {
                if (!r.ok) console.error(`[reset] email pra ${acc.email} falhou:`, r.error);
            });
            ok();
            return;
        }

        // ─── Fase 5.5: Confirmar reset com token + nova senha ─────────────
        if (msg.t === 'passwordResetConfirm') {
            const token = String(msg.token || '');
            const newPwHash = String(msg.pwHash || '');
            if (!token || !newPwHash){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'passwordResetConfirmResult', ok:false, reason:'missing_fields' }));
                return;
            }
            // Busca conta com esse token
            let acc = null;
            for (const a of accounts.values()){
                if (a.resetToken && a.resetToken.token === token){ acc = a; break; }
            }
            if (!acc || !acc.resetToken || acc.resetToken.expiresAt < Date.now()){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'passwordResetConfirmResult', ok:false, reason:'invalid_or_expired' }));
                return;
            }
            acc.pwHash = hashPwServer(newPwHash);
            acc.resetToken = null;
            queueSaveAccounts();
            console.log(`[reset] senha trocada pra conta ${acc.name}`);
            if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'passwordResetConfirmResult', ok:true, name:acc.name }));
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
            // Hardening Nível 1: clampa valores absurdos antes de persistir
            sanitizeSave(data, p.authedName);
            // N3 fase 2: sincroniza inv/gold/equipped/chests do save → p (server fica em paridade
            // com cliente que pode ter mutado via quest/event/cosmético que ainda é client-side).
            // Lockdown FULL é pra próxima fase (depende de migrar quest rewards pro server).
            ensurePlayerInvSlots(p);
            // N3 fase 3 LOCKDOWN: server é fonte única de inv/gold/equipped/chests.
            // saveUpload do cliente NÃO sobrescreve mais esses campos — toda mutação
            // dessas grandezas precisa passar pelos handlers server-side (questTurnIn,
            // invEquip, invChest, attackMob, shop, craft, forja, etc).
            // Cliente continua enviando-os no save (compat), mas server descarta. Se
            // houver divergência (ex: save local mais novo que p.*), o próximo
            // sendInvUpdate ressincroniza o cliente.
            // T3 LOCKDOWN de skills: server agora é fonte única. Todas as 7 fontes de XP
            // (mob kill, hit melee, distância, escudo apanha, party share, treino, magia)
            // passam por handlers server-side autoritativos. saveUpload IGNORA data.skills
            // — cliente continua enviando no save por compat, mas server descarta.
            // Em divergência, próximo invUpdate corrige.
            if (data.quests && typeof data.quests === 'object'){
                p.quests = {
                    active: (data.quests.active && typeof data.quests.active === 'object') ? data.quests.active : {},
                    completed: Array.isArray(data.quests.completed) ? data.quests.completed.slice(0, 200) : [],
                    daily: (data.quests.daily && typeof data.quests.daily === 'object') ? data.quests.daily : null,
                };
            }
            if (data.questFlags && typeof data.questFlags === 'object') p.questFlags = data.questFlags;
            if (data.flags && typeof data.flags === 'object') p.flags = data.flags;
            if (data.permaBuffs && typeof data.permaBuffs === 'object') p.permaBuffs = data.permaBuffs;
            // M5: talents hidratam aqui APENAS se ainda não temos no server.
            // Como talents agora viram permaBuffs ao serem alocados via handler,
            // se o save do cliente trouxer talents que o server desconhece, ainda
            // confiamos pra compat — server lockdown FULL fica pra fase futura.
            if (data.talents && typeof data.talents === 'object'){
                p.talents = p.talents || {};
                for (const tid of Object.keys(data.talents)){
                    if (TALENT_DEFS[tid] && data.talents[tid]) p.talents[tid] = true;
                }
            }
            // Server é autoritativo em maxHp/maxMp/hp/mp (lockdown N3 fase 5).
            // Cliente às vezes envia undefined (race conditions entre devices) — força
            // os valores do server pra não persistir lixo no acc.save.
            if (typeof p.maxHp === 'number' && isFinite(p.maxHp)) data.maxHp = p.maxHp;
            if (typeof p.maxMp === 'number' && isFinite(p.maxMp)) data.maxMp = p.maxMp;
            if (typeof p.hp === 'number' && isFinite(p.hp))       data.hp    = p.hp;
            if (typeof p.mp === 'number' && isFinite(p.mp))       data.mp    = p.mp;
            // Pos também — cliente pode mandar NaN/undefined
            if (typeof p.x === 'number' && isFinite(p.x)) data.x = p.x;
            if (typeof p.y === 'number' && isFinite(p.y)) data.y = p.y;
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
            // N3 fase 2: hidrata inv/equipped/gold/chests do save (server vira dono).
            // Se cliente legado (sem auth) ou conta nova, pega do msg como antes.
            ensurePlayerInvSlots(p);
            const acc = p.authedName ? getAccount(p.authedName) : null;
            if (acc && acc.save){
                if (acc.save.inv && typeof acc.save.inv === 'object') p.inv = { ...acc.save.inv };
                if (acc.save.equipped && typeof acc.save.equipped === 'object') p.equipped = { ...p.equipped, ...acc.save.equipped };
                if (acc.save.chests && typeof acc.save.chests === 'object'){
                    for (const cid of ['b1','b2','b3','b4']){
                        if (acc.save.chests[cid] && typeof acc.save.chests[cid] === 'object'){
                            p.chests[cid] = { ...acc.save.chests[cid] };
                        }
                    }
                }
                if (typeof acc.save.gold === 'number') p.gold = acc.save.gold;
                // N3 fase 3: quest state pro server validar turn-ins
                if (acc.save.skills && typeof acc.save.skills === 'object') p.skills = acc.save.skills;
                if (acc.save.quests && typeof acc.save.quests === 'object'){
                    p.quests = {
                        active: (acc.save.quests.active && typeof acc.save.quests.active === 'object') ? acc.save.quests.active : {},
                        completed: Array.isArray(acc.save.quests.completed) ? acc.save.quests.completed.slice(0, 200) : [],
                        daily: (acc.save.quests.daily && typeof acc.save.quests.daily === 'object') ? acc.save.quests.daily : null,
                    };
                }
                if (acc.save.questFlags && typeof acc.save.questFlags === 'object') p.questFlags = acc.save.questFlags;
                if (acc.save.flags && typeof acc.save.flags === 'object') p.flags = acc.save.flags;
                if (acc.save.permaBuffs && typeof acc.save.permaBuffs === 'object') p.permaBuffs = acc.save.permaBuffs;
                if (acc.save.talents && typeof acc.save.talents === 'object'){
                    p.talents = {};
                    for (const tid of Object.keys(acc.save.talents)){
                        if (TALENT_DEFS[tid] && acc.save.talents[tid]) p.talents[tid] = true;
                    }
                }
            } else {
                if (msg.equipped && typeof msg.equipped === 'object') p.equipped = { ...p.equipped, ...msg.equipped };
            }
            if (Array.isArray(msg.badges)){
                p.badges = msg.badges.filter(s => typeof s === 'string' && s.length < 32).slice(0, 2);
            }
            // Fase 5: maxHp/maxMp autoritativos no server — recalcula baseado em
            // skills + talent hpBonus. Cliente fica com valor server via pstats.
            // Inicializa hp/mp do save (cliente envia no join) só na primeira vez.
            if (p.maxHp == null && typeof msg.maxHp === 'number') p.maxHp = msg.maxHp;
            if (p.maxMp == null && typeof msg.maxMp === 'number') p.maxMp = msg.maxMp;
            if (p.hp == null && typeof msg.hp === 'number') p.hp = msg.hp;
            if (p.mp == null && typeof msg.mp === 'number') p.mp = msg.mp;
            recomputeMaxStatsServer(p);
            // Garante hp/mp dentro do novo cap (se save tava com cap maior)
            if (typeof p.hp === 'number') p.hp = Math.min(p.hp, p.maxHp);
            if (typeof p.mp === 'number') p.mp = Math.min(p.mp, p.maxMp);
            if (p.hp == null) p.hp = p.maxHp;
            if (p.mp == null) p.mp = p.maxMp;
            // Limpa TODOS os ghosts com mesmo nome — não dá pra confiar que só existe 1
            // (race condition de reconexões rápidas, ou WS órfão antes do join).
            removeGhostsByName(p.name, id);
            console.log(`    ${id} = ${p.name}${isAdmin(p.name) ? ' [admin]' : ''}`);
            ws.send(JSON.stringify({
                t:'state', you: id,
                players: snapshotPlayers(),
                mobs: snapshotMobs(),
                motd: SERVER_MOTD_RUNTIME,
                isAdmin: isAdmin(p.name),
                dailyEvent: dailyEventSnapshot(),
                groundDrops: snapshotGroundDrops(),
            }));
            // Manda inv/equipped/gold/chests autoritativos pro cliente após o join,
            // pra cobrir o caso do save server ser mais recente que o save local.
            sendInvUpdate(p, { chests: p.chests, reason:'join' });
            broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp, equipped: p.equipped || null, cosmetic: p.cosmetic || null, badges: p.badges || [], guild: findGuildOfPlayer(p.name)?.name || null } });
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
            // T2: cliente também sinaliza selos + highlander pra server calcular
            // regen autoritativo (pvpMultsServer). Clamp via sanitizeSave já cuida.
            if (typeof msg.selos === 'number' && isFinite(msg.selos)){
                p.selos = Math.max(0, Math.min(5, msg.selos | 0));
            }
            if (typeof msg.highlander === 'boolean'){
                p.highlander = msg.highlander;
            }
            broadcast(null, { t:'pvp', id, pvp:p.pvp });
            return;
        }

        if (msg.t === 'tabActive') {
            // T2: cliente sinaliza visibilidade (visibilitychange). Server pausa
            // regen quando tabActive=false pra preservar anti-AFK do cliente.
            p._tabActive = msg.active !== false;
            return;
        }

        if (msg.t === 'float') {
            broadcast(id, { t:'float', id, text:msg.text, color:msg.color, big:!!msg.big });
            return;
        }

        if (msg.t === 'attackVfx') {
            // Cosmético de partícula ao atacar — propaga pros outros renderizarem
            const color = typeof msg.color === 'string' ? msg.color.slice(0, 12) : null;
            if (color) broadcast(id, { t:'attackVfx', id, color });
            return;
        }

        // ─── N3: consumir item (food/potion) ────────────────────────────
        if (msg.t === 'invConsume') {
            const key = typeof msg.key === 'string' ? msg.key.slice(0, 64) : null;
            const meta = key && ITEM_META[key];
            if (!meta || (meta.kind !== 'food' && meta.kind !== 'potion')){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Item não consumível.' });
                return;
            }
            if (!hasInv(p, key, 1)){
                sendInvUpdate(p, { consume:{ ok:false, key, reason:'no_item' } });
                return;
            }
            incInv(p, key, -1);
            // HP/food: aplicação instant + autoritativa (lockdown N3 ignora hp do client).
            // MP/potion: regen-over-time (8mp/s × 10s) autoritativo via p.manaBuff —
            // tickPlayerRegen aplica o ganho. Não pode empilhar com manaBuff já ativo.
            const maxHp = p.maxHp || 100;
            const maxMp = p.maxMp || 0;
            let healed = 0, manaBuffApplied = false;
            if (meta.heal && (p.hp ?? 0) < maxHp){
                healed = Math.min(meta.heal, maxHp - (p.hp ?? 0));
                p.hp = Math.min(maxHp, (p.hp ?? 0) + meta.heal);
            }
            if (meta.manaheal && maxMp > 0){
                const now = Date.now();
                const active = p.manaBuff && p.manaBuff.until > now;
                if (!active){
                    p.manaBuff = { mpPerSec: 8, until: now + 10000, lastTickAt: now };
                    manaBuffApplied = true;
                }
            }
            sendInvUpdate(p, { consume:{ ok:true, key, heal: meta.heal || 0, manaheal: meta.manaheal || 0, healed, manaBuff: manaBuffApplied ? { mpPerSec:8, lifeMs:10000 } : null } });
            if (healed > 0) broadcastPstatsAll(p);
            return;
        }

        // ─── N3: Bênção da Fênix (consumo autoritativo) ─────────────────
        if (msg.t === 'invUseBlessing') {
            if (!hasInv(p, 'BENCAO_FENIX', 1)){
                sendTo(id, { t:'invUpdate', inv: p.inv || {}, gold: p.gold || 0, bencao:{ applied:false, reason:'no_item' } });
                return;
            }
            incInv(p, 'BENCAO_FENIX', -1);
            sendInvUpdate(p, { bencao:{ applied:true } });
            return;
        }

        // ─── N3: Shop buy/sell server-side ───────────────────────────────
        if (msg.t === 'invShop') {
            const op = msg.op;
            // Mercador em (52,49). Player tem que estar adjacente (chebyshev ≤1).
            if (Math.max(Math.abs(p.x - 52), Math.abs(p.y - 49)) > 1){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Aproxime-se do Mercador.' }); return;
            }
            if (op === 'buy'){
                const offer = SHOP_BUY[msg.idx | 0];
                if (!offer){ sendTo(id, { t:'serverMsg', level:'warn', text:'Oferta inválida.' }); return; }
                if ((p.gold || 0) < offer.price){ sendTo(id, { t:'serverMsg', level:'warn', text:`Sem ouro (${offer.price}g).` }); return; }
                p.gold -= offer.price;
                incInv(p, offer.item, offer.qty || 1);
                sendInvUpdate(p, { shop:{ op:'buy', item: offer.item, qty: offer.qty || 1, price: offer.price } });
                return;
            }
            if (op === 'sell'){
                const itemKey = typeof msg.itemKey === 'string' ? msg.itemKey.slice(0, 64) : null;
                if (!itemKey) return;
                // Permite vender items upgrade _PLUS_N — preço base do tier base
                const tier = getUpgradeTier(itemKey);
                if (!ITEM_META[tier.base]){ sendTo(id, { t:'serverMsg', level:'warn', text:'Item inválido.' }); return; }
                const have = (p.inv && p.inv[itemKey]) || 0;
                if (have <= 0) return;
                let qty = 1;
                if (msg.qtyStr === 'all') qty = have;
                else qty = Math.max(1, Math.min(have, msg.qty | 0 || 1));
                const unit = sellPriceFor(tier.base);
                const total = unit * qty;
                incInv(p, itemKey, -qty);
                p.gold = (p.gold || 0) + total;
                sendInvUpdate(p, { shop:{ op:'sell', item: itemKey, qty, total } });
                return;
            }
            return;
        }

        // ─── N3: Craft server-side ───────────────────────────────────────
        if (msg.t === 'invCraft') {
            const idx = msg.idx | 0;
            const r = RECIPES[idx];
            if (!r){ sendTo(id, { t:'serverMsg', level:'warn', text:'Receita inválida.' }); return; }
            // Tem que estar perto da bancada (50,52) — chebyshev ≤ 1
            if (Math.max(Math.abs(p.x - 50), Math.abs(p.y - 52)) > 1){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Aproxime-se da bancada.' }); return;
            }
            for (const [k, q] of Object.entries(r.in)){
                if (!hasInv(p, k, q)){ sendTo(id, { t:'serverMsg', level:'warn', text:`Sem material: ${k} (${q}×)` }); return; }
            }
            const cost = itemGoldCost(r.out);
            if ((p.gold || 0) < cost){ sendTo(id, { t:'serverMsg', level:'warn', text:`Sem ouro (${cost}g).` }); return; }
            for (const [k, q] of Object.entries(r.in)) incInv(p, k, -q);
            p.gold -= cost;
            incInv(p, r.out, r.qtyOut || 1);
            sendInvUpdate(p, { craft:{ ok:true, out: r.out, qty: r.qtyOut || 1, cost } });
            return;
        }

        // ─── N3: Forja server-side ───────────────────────────────────────
        if (msg.t === 'invForge') {
            const itemKey = typeof msg.itemKey === 'string' ? msg.itemKey.slice(0, 64) : null;
            if (!itemKey) return;
            const tier = getUpgradeTier(itemKey);
            const baseMeta = ITEM_META[tier.base];
            if (!baseMeta){ sendTo(id, { t:'serverMsg', level:'warn', text:'Item inválido pra forja.' }); return; }
            const targetPlus = tier.plus + 1;
            if (targetPlus > UPGRADE_MAX){ sendTo(id, { t:'serverMsg', level:'warn', text:'Já no nível máximo (+' + UPGRADE_MAX + ').' }); return; }
            const have = (p.inv && p.inv[itemKey]) || 0;
            if (have < 3){ sendTo(id, { t:'serverMsg', level:'warn', text:'Precisa de 3× pra forjar.' }); return; }
            const cost = forgeCostFor(tier.base, targetPlus);
            if ((p.gold || 0) < cost){ sendTo(id, { t:'serverMsg', level:'warn', text:`Sem ouro (${cost}g).` }); return; }
            // Desconta 3× material + ouro ANTES do roll
            incInv(p, itemKey, -3);
            p.gold = (p.gold || 0) - cost;
            const failChance = UPGRADE_FAIL[targetPlus];
            if (Math.random() < failChance){
                // Falha: devolve 2 de 3 (perde só 1)
                incInv(p, itemKey, 2);
                sendInvUpdate(p, { forge:{ ok:false, itemKey, cost } });
                return;
            }
            // Sucesso — cria item upgrade no inv server
            const newKey = makeUpgradeKey(tier.base, targetPlus);
            incInv(p, newKey, 1);
            sendInvUpdate(p, { forge:{ ok:true, itemKey, newKey, cost, plus: targetPlus } });
            return;
        }

        // ─── N3 fase 2: Equip / Unequip server-side ─────────────────────
        if (msg.t === 'invEquip') {
            ensurePlayerInvSlots(p);
            const itemKey = typeof msg.itemKey === 'string' ? msg.itemKey.slice(0, 64) : null;
            if (!itemKey) return;
            // Item upgrade _PLUS_N usa o base pra slot lookup
            const tier = getUpgradeTier(itemKey);
            const def = ITEM_META[tier.base];
            if (!def){ sendTo(id, { t:'serverMsg', level:'warn', text:'Item inválido.' }); return; }
            const slot = SLOT_OF_KIND[def.kind];
            if (!slot){ sendTo(id, { t:'serverMsg', level:'warn', text:'Item não-equipável.' }); return; }
            if (!hasInv(p, itemKey, 1)){
                sendInvUpdate(p, { equipOp:{ ok:false, reason:'no_item' } });
                return;
            }
            // Conflito 2H ↔ escudo
            if (slot === 'weapon' && def.hand === '2h' && p.equipped.offhand){
                incInv(p, p.equipped.offhand, 1);
                p.equipped.offhand = null;
            }
            if (slot === 'offhand' && p.equipped.weapon){
                const wTier = getUpgradeTier(p.equipped.weapon);
                const wDef = ITEM_META[wTier.base];
                if (wDef && wDef.hand === '2h'){
                    incInv(p, p.equipped.weapon, 1);
                    p.equipped.weapon = null;
                }
            }
            // Tira o atual do slot e equipa o novo
            if (p.equipped[slot]) incInv(p, p.equipped[slot], 1);
            incInv(p, itemKey, -1);
            p.equipped[slot] = itemKey;
            sendInvUpdate(p, { equipOp:{ ok:true, slot, itemKey } });
            // Broadcast pstats pros outros verem o visual
            broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, equipped:p.equipped, badges:p.badges || [] });
            return;
        }
        if (msg.t === 'invUnequip') {
            ensurePlayerInvSlots(p);
            const slot = typeof msg.slot === 'string' ? msg.slot : null;
            if (!slot || !(slot in p.equipped)) return;
            const k = p.equipped[slot];
            if (!k) return;
            incInv(p, k, 1);
            p.equipped[slot] = null;
            sendInvUpdate(p, { equipOp:{ ok:true, slot, itemKey:null } });
            broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, equipped:p.equipped, badges:p.badges || [] });
            return;
        }

        // ─── N3 fase 2: Pickup do chão (groundDrops autoritativo) ───────
        if (msg.t === 'groundPickup') {
            ensurePlayerInvSlots(p);
            const ids = Array.isArray(msg.ids) ? msg.ids.slice(0, 20) : (msg.id ? [msg.id] : []);
            if (!ids.length) return;
            const removed = [];
            let pickedGold = 0;
            for (const dropId of ids){
                const d = groundDrops.get(dropId);
                if (!d) continue;
                // Pickup auto-range: chebyshev ≤1 (mesma regra do cliente pickupAt)
                if (Math.max(Math.abs(p.x - d.x), Math.abs(p.y - d.y)) > 1) continue;
                groundDrops.delete(dropId);
                if (d.type === 'GOLD'){
                    p.gold = (p.gold | 0) + (d.qty | 0);
                    pickedGold += d.qty;
                    syncGoldRank(p.name, p.gold);
                } else {
                    incInv(p, d.type, d.qty | 0 || 1);
                }
                removed.push(dropId);
            }
            if (removed.length){
                broadcast(null, { t:'groundRemove', ids: removed });
                sendInvUpdate(p, { pickup:{ ids: removed, gold: pickedGold } });
            }
            return;
        }

        // ─── N3 fase 2: Chest deposit/withdraw server-side ──────────────
        if (msg.t === 'invChest') {
            ensurePlayerInvSlots(p);
            const cid = typeof msg.chestId === 'string' ? msg.chestId : null;
            const op  = typeof msg.op === 'string' ? msg.op : null;
            if (!cid || !CHEST_POS[cid]){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Baú inválido.' });
                return;
            }
            // Adjacência ao baú (chebyshev ≤ 1)
            const pos = CHEST_POS[cid];
            if (Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y)) > 1){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Aproxime-se do baú.' });
                return;
            }
            if (!p.chests[cid]) p.chests[cid] = {};
            const bag = p.chests[cid];
            const itemKey = typeof msg.itemKey === 'string' ? msg.itemKey.slice(0, 64) : null;
            const rawQty  = msg.qty;
            const wantAll = rawQty === 'all';
            const reqQty  = wantAll ? 0 : Math.max(1, rawQty | 0);

            const cleanBagAfter = () => {
                if (Object.keys(bag).filter(k => k !== '_GOLD').length === 0 && !bag._GOLD){
                    p.chests[cid] = {};
                }
            };
            const replyChests = (extra) => sendInvUpdate(p, Object.assign({ chests: p.chests, chestOp:{ chestId: cid, op } }, extra || {}));

            if (op === 'deposit'){
                if (!itemKey) return;
                const have = (p.inv && p.inv[itemKey]) || 0;
                if (!have) return;
                const qty = wantAll ? have : Math.min(have, reqQty);
                if (qty <= 0) return;
                incInv(p, itemKey, -qty);
                bag[itemKey] = (bag[itemKey] || 0) + qty;
                replyChests({ moved:{ item:itemKey, qty, dir:'in' } });
                return;
            }
            if (op === 'withdraw'){
                if (!itemKey) return;
                const have = bag[itemKey] || 0;
                if (!have) return;
                const qty = wantAll ? have : Math.min(have, reqQty);
                if (qty <= 0) return;
                bag[itemKey] -= qty;
                if (bag[itemKey] <= 0) delete bag[itemKey];
                incInv(p, itemKey, qty);
                cleanBagAfter();
                replyChests({ moved:{ item:itemKey, qty, dir:'out' } });
                return;
            }
            if (op === 'depositGold'){
                const gold = Math.max(0, (p.gold | 0));
                if (gold <= 0) return;
                p.gold = 0;
                bag._GOLD = (bag._GOLD || 0) + gold;
                syncGoldRank(p.name, 0);
                replyChests({ goldMoved:{ amount: gold, dir:'in' } });
                return;
            }
            if (op === 'withdrawGold'){
                const gold = bag._GOLD || 0;
                if (gold <= 0) return;
                delete bag._GOLD;
                p.gold = (p.gold | 0) + gold;
                syncGoldRank(p.name, p.gold);
                cleanBagAfter();
                replyChests({ goldMoved:{ amount: gold, dir:'out' } });
                return;
            }
            if (op === 'depositAll'){
                let moved = 0;
                for (const [k, q] of Object.entries(p.inv || {})){
                    if (!q) continue;
                    bag[k] = (bag[k] || 0) + q;
                    moved += q;
                }
                p.inv = {};
                let goldMoved = 0;
                if (p.gold){
                    goldMoved = p.gold;
                    bag._GOLD = (bag._GOLD || 0) + p.gold;
                    p.gold = 0;
                    syncGoldRank(p.name, 0);
                }
                replyChests({ depositAll:{ moved, goldMoved } });
                return;
            }
            if (op === 'withdrawAll'){
                let moved = 0;
                for (const [k, q] of Object.entries(bag)){
                    if (k === '_GOLD' || !q) continue;
                    incInv(p, k, q);
                    moved += q;
                }
                const gold = bag._GOLD || 0;
                if (gold){
                    p.gold = (p.gold | 0) + gold;
                    syncGoldRank(p.name, p.gold);
                }
                p.chests[cid] = {};
                replyChests({ withdrawAll:{ moved, gold } });
                return;
            }
            sendTo(id, { t:'serverMsg', level:'warn', text:'Operação de baú inválida.' });
            return;
        }

        // PvP entre players (vivo ou ghost)
        if (msg.t === 'pvpAttack') {
            const tgt = players.get(msg.targetId);
            if (!tgt) return;
            // Duelo consensual: permite ataque mesmo sem PvP toggle, se for o oponente
            const inDuel = p.duel && p.duel.opponentId === tgt.id && tgt.duel && tgt.duel.opponentId === id;
            if (!inDuel){
                if (!p.pvp) return;
                if (!tgt.pvp && !tgt.disconnected) return;   // se vivo, precisa estar com PvP
            }
            if (chebyshev(p.x, p.y, tgt.x, tgt.y) > (msg.range || 1)) return;
            const amount = Math.max(1, msg.amount | 0);
            // T3: XP de skill por hit PvP (autoritativo)
            const isRanged = (msg.range || 1) > 1;
            gainSkillXpServer(p, isRanged ? 'Distância' : weaponSkillOf(p), 1);
            sendSkillsOnly(p, 'pvpAttack');
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
                    // N3 fase 2: credita gold + item authoritativos no killer (cliente já não soma local)
                    if (goldDrop > 0){
                        p.gold = (p.gold | 0) + goldDrop;
                        syncGoldRank(p.name, p.gold);
                    }
                    if (droppedItem){
                        incInv(p, droppedItem, 1);
                    }
                    sendInvUpdate(p, { pvpGain:{ amount: goldDrop, item: droppedItem || null, ghost:true } });
                    sendTo(id, { t:'pkKill', victimId: msg.targetId, victimName: tgt.name,
                                 victimHadSelos:false, goldGain: goldDrop, dropHighlander:false,
                                 droppedItem, ghost:true, dropX: tgt.x, dropY: tgt.y });
                    broadcastMsg('warn', `💀 ${p.name} acabou com o corpo de ${tgt.name}!`);
                    players.delete(msg.targetId);
                    broadcast(null, { t:'leave', id: msg.targetId });
                }
                return;
            }
            // Fase 5: dano de PvP aplicado server-side com defesa percentual
            // (espelha cliente). pvpHit ainda é mandado pra FX/log/pkDeathBy
            // detection, mas com `actual` pra cliente NÃO aplicar local.
            const def = totalDefenseServer(tgt);
            const reduction = def > 0 ? def / (def + 30) : 0;
            const actual = Math.max(1, Math.round(amount * (1 - reduction)));
            if ((tgt.hp ?? 100) > 0){
                tgt.hp = Math.max(0, (tgt.hp ?? 100) - actual);
                broadcastPstatsAll(tgt);
            }
            if (tgt.ws.readyState === 1){
                tgt.ws.send(JSON.stringify({ t:'pvpHit', from:id, fromName:p.name, amount, actual }));
            }
            broadcast(id, { t:'float', id:msg.targetId, text:`-${actual}`, color:'#ff3030', big:true });
            return;
        }

        // Cliente envia snapshot de gold/inv/stats pra body stays + visibility
        if (msg.t === 'playerSync') {
            // N3 fase 3 LOCKDOWN: ignora msg.gold, msg.inv e msg.equipped do cliente.
            // Gold/inv/equipped só mudam via handlers server-side (questTurnIn, attackMob,
            // shop, craft, forja, invEquip, invChest, groundPickup, etc). Cliente continua
            // enviando esses campos (compat), mas server descarta silenciosamente.
            // Fase 5 LOCKDOWN: msg.hp/mp/maxHp/maxMp todos ignorados. Mutações vêm de
            // tickPlayerRegen, tickAI mob attack, tickPlayerDots, pvpAttack handler,
            // spellCast handler, invConsume, invUseBlessing, talentAlloc (hpBonus),
            // gainSkillXpServer (level up → recomputeMaxStats), playerDeath flow.
            // Server vira fonte única — F12 player.hp=99999 não passa.
            let statsChanged = false;
            // Cosmético: propaga pros outros (string ou null, máx 32 chars)
            if ('cosmetic' in msg){
                const cos = (typeof msg.cosmetic === 'string' && msg.cosmetic.length < 32) ? msg.cosmetic : null;
                if (cos !== p.cosmetic){ p.cosmetic = cos; statsChanged = true; }
            }
            // Badges de conquista: até 2 strings curtas
            if (Array.isArray(msg.badges)){
                const bs = msg.badges.filter(s => typeof s === 'string' && s.length < 32).slice(0, 2);
                p.badges = bs;
                statsChanged = true;
            }
            if (statsChanged){
                broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, equipped:p.equipped, badges:p.badges || [] });
            }
            return;
        }
        // ─── N3 fase 3: Quest turn-in server-side ──────────────────────────
        // Cliente envia { t:'questTurnIn', kind:'simple'|'chain', questId?, chainId?, stageId?, choiceId? }
        // Server valida (adjacência ao NPC, items, anti-replay) e aplica reward authoritative.
        // Falha = { t:'questResult', ok:false, reason } pra UI; sucesso reconcilia via invUpdate.
        if (msg.t === 'questTurnIn') {
            const reject = (reason) => {
                if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'questResult', ok:false, reason }));
            };
            // Anti-spam: 1 op a cada 400ms
            const now = Date.now();
            p._lastQuestAt = p._lastQuestAt || 0;
            if (now - p._lastQuestAt < 400) return reject('rate_limit');
            p._lastQuestAt = now;

            const kind = msg.kind;
            if (kind === 'daily'){
                // Cliente envia { kind:'daily', dailyId }. Server lê a entry do save do player
                // (cliente é a fonte da lista do dia), valida no pool, usa reward DA TABELA.
                if (!isAdjacentTo(p, QUEST_NPCS.atendente)) return reject('not_at_npc');
                p.quests = p.quests || { active:{}, completed:[] };
                const daily = p.quests.daily || { list:[], claimed:[] };
                const dailyId = String(msg.dailyId || '');
                const entry = (daily.list || []).find(q => q && q.id === dailyId);
                if (!entry || !entry.goal) return reject('unknown_quest');
                if ((daily.claimed || []).includes(dailyId)) return reject('already_done');
                const pool = findDailyPoolEntry(entry.goal.kind, entry.goal.type, entry.goal.count);
                if (!pool) return reject('bad_daily');   // cliente forjou entry fake
                // valida items se kind='item'
                if (pool.kind === 'item' && !hasInv(p, pool.type, pool.count)) return reject('no_items');
                if (pool.kind === 'item') incInv(p, pool.type, -pool.count);
                daily.claimed = daily.claimed || [];
                daily.claimed.push(dailyId);
                p.quests.daily = daily;
                const reward = { gold: pool.gold, xp: pool.xp || {} };
                const delta = applyQuestReward(p, reward);
                sendInvUpdate(p, {
                    questResult:{ ok:true, kind:'daily', questId:dailyId, delta },
                    skills: p.skills, quests: p.quests,
                });
                return;
            }
            if (kind === 'simple'){
                const q = QUESTS_BY_ID[String(msg.questId || '')];
                if (!q) return reject('unknown_quest');
                if (!isAdjacentTo(p, QUEST_NPCS.atendente)) return reject('not_at_npc');
                p.quests = p.quests || { active:{}, completed:[] };
                p.quests.active = p.quests.active || {};
                p.quests.completed = p.quests.completed || [];
                if (!p.quests.active[q.id]) return reject('not_active');
                if (p.quests.completed.includes(q.id)) return reject('already_done');
                // valida items se a goal pede coleta
                if (q.goal.kind === 'item' && !hasInv(p, q.goal.type, q.goal.count)) return reject('no_items');
                // consome items + marca completa
                if (q.goal.kind === 'item') incInv(p, q.goal.type, -q.goal.count);
                delete p.quests.active[q.id];
                p.quests.completed.push(q.id);
                const delta = applyQuestReward(p, q.reward);
                sendInvUpdate(p, {
                    questResult:{ ok:true, kind:'simple', questId:q.id, delta },
                    skills: p.skills, quests: p.quests,
                    flags: p.flags || null, permaBuffs: p.permaBuffs || null,
                });
                return;
            }
            if (kind === 'chain'){
                const chain = QUEST_CHAINS[String(msg.chainId || '')];
                if (!chain) return reject('unknown_chain');
                const npc = QUEST_NPCS[chain.npc];
                if (!isAdjacentTo(p, npc)) return reject('not_at_npc');
                const stage = chain.stages.find(s => s.id === String(msg.stageId || ''));
                if (!stage) return reject('unknown_stage');
                p.questFlags = p.questFlags || {};
                p.questFlags[msg.chainId] = p.questFlags[msg.chainId] || {};
                const progress = p.questFlags[msg.chainId];
                if (progress[stage.id]) return reject('stage_done');
                // pre-stages: tudo antes do atual precisa estar completo
                for (const prev of chain.stages){
                    if (prev.id === stage.id) break;
                    if (!progress[prev.id]) return reject('prev_stage_pending');
                }
                // valida items
                if (stage.kind === 'item' && !hasInv(p, stage.type, stage.count)) return reject('no_items');
                if (stage.kind === 'multiItem'){
                    for (const [k, n] of Object.entries(stage.items)){
                        if (!hasInv(p, k, n)) return reject('no_items');
                    }
                }
                // resolve reward (choice pega de stage.choices[choiceId].reward)
                let reward = stage.reward;
                if (stage.kind === 'choice'){
                    const ci = msg.choiceId | 0;
                    if (!Array.isArray(stage.choices) || !stage.choices[ci]) return reject('bad_choice');
                    reward = stage.choices[ci].reward;
                }
                // consome items
                if (stage.kind === 'item') incInv(p, stage.type, -stage.count);
                if (stage.kind === 'multiItem'){
                    for (const [k, n] of Object.entries(stage.items)) incInv(p, k, -n);
                }
                // marca completo
                progress[stage.id] = true;
                const delta = applyQuestReward(p, reward);
                sendInvUpdate(p, {
                    questResult:{ ok:true, kind:'chain', chainId:msg.chainId, stageId:stage.id, choiceId: msg.choiceId ?? null, delta },
                    skills: p.skills, questFlags: p.questFlags,
                    flags: p.flags || null, permaBuffs: p.permaBuffs || null,
                });
                return;
            }
            return reject('bad_kind');
        }

        // ─── T4: Highlander Hunt server-side spawn + claim ─────────────────
        // Cliente envia { t:'hlHuntTrigger' } quando timer de 3min vence após virar
        // Highlander. Server spawna 3 CACADOR hunters perto do player, autoritativos
        // (visíveis pra todos via mobs snapshot/batch). Crédito é automático quando
        // o último cair em handleMobDeath. Compat: legacy hlHuntClaim vira no-op
        // pra clients antigos (server passa a creditar via mob kill, não claim).
        if (msg.t === 'hlHuntClaim') return;
        if (msg.t === 'hlHuntTrigger') {
            const COOLDOWN_MS = 5 * 60 * 1000;
            const now = Date.now();
            p._lastHlHuntClaim = p._lastHlHuntClaim || 0;
            if (now - p._lastHlHuntClaim < COOLDOWN_MS){
                if (p.ws && p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'hlHuntResult', ok:false, reason:'cooldown', retryAt: p._lastHlHuntClaim + COOLDOWN_MS }));
                }
                return;
            }
            // Anti-replay: se já tem hunters ativos pra esse player, ignora trigger
            const already = Array.from(monsters.values()).some(x => x.hunter && x.huntTargetId === p.id && x.hp > 0);
            if (already){
                if (p.ws && p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'hlHuntResult', ok:false, reason:'already_active' }));
                }
                return;
            }
            // Spawn 3 hunters num raio 8-12 ao redor do player (4 cantos mapeados,
            // mantém o feel "vêm de longe", mas em positions walkable).
            const corners = [
                { x:5, y:5 }, { x:M_W-6, y:5 }, { x:5, y:M_H-6 }, { x:M_W-6, y:M_H-6 },
            ];
            // Embaralha pra variedade
            for (let i = corners.length - 1; i > 0; i--){
                const j = Math.floor(Math.random() * (i+1));
                [corners[i], corners[j]] = [corners[j], corners[i]];
            }
            let spawned = 0;
            for (const c of corners){
                if (spawned >= 3) break;
                for (let tries = 0; tries < 40; tries++){
                    const x = c.x + Math.floor(Math.random()*6) - 3;
                    const y = c.y + Math.floor(Math.random()*6) - 3;
                    if (x < 1 || y < 1 || x >= M_W-1 || y >= M_H-1) continue;
                    if (!isWalkable(x, y)) continue;
                    if (inSafe(x, y) || inCave(x, y)) continue;
                    if (mobAt(x, y) || playerAt(x, y)) continue;
                    const mob = spawnMob('CACADOR', x, y);
                    if (mob){
                        mob.hunter = true;
                        mob.huntTargetId = p.id;
                        mob.aggro = 999;
                        spawned++;
                    }
                    break;
                }
            }
            if (spawned < 1){
                if (p.ws && p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'hlHuntResult', ok:false, reason:'no_spawn' }));
                }
                return;
            }
            broadcastMobs();   // empurra snapshot pros clientes verem na hora
            console.log(`[hl_hunt] ${spawned} caçadores spawnados pra ${p.name}`);
            return;
        }

        // ─── T3: Treino no boneco / altar server-side ──────────────────────
        // Cliente envia { t:'trainAttempt', skill }. Server valida adjacência,
        // gold + aplica XP autoritative. Rate-limit 1500ms entre tentativas
        // (TRAINING_TIME no cliente é 2000ms — margem).
        if (msg.t === 'trainAttempt') {
            const reject = (reason) => {
                if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'trainResult', ok:false, reason }));
            };
            const skill = String(msg.skill || '');
            if (!p.skills || !p.skills[skill]) return reject('unknown_skill');
            // Rate limit
            const now = Date.now();
            p._lastTrainAt = p._lastTrainAt || 0;
            if (now - p._lastTrainAt < 1500) return reject('too_fast');
            p._lastTrainAt = now;
            // Adjacência: Magia treina no Altar, demais skills no Boneco
            const DUMMY = { x:48, y:51 };
            const ALTAR = { x:50, y:48 };
            const target = skill === 'Magia' ? ALTAR : DUMMY;
            if (Math.max(Math.abs(p.x - target.x), Math.abs(p.y - target.y)) > 1){
                return reject(skill === 'Magia' ? 'not_at_altar' : 'not_at_dummy');
            }
            const sk = p.skills[skill];
            const cost = Math.max(5, (sk.val || 10) * 2);
            if ((p.gold || 0) < cost) return reject('no_gold');
            p.gold -= cost;
            syncGoldRank(p.name, p.gold);
            const xp = Math.max(1, Math.floor((sk.xpNext || 50) / 60));
            gainSkillXpServer(p, skill, xp);
            sendInvUpdate(p, {
                trainResult:{ ok:true, skill, xp, cost },
                skills: p.skills,
                reason:'train',
            });
            return;
        }

        // ─── T3: Cast de magia server-side (creditar XP de Magia) ──────────
        // Cliente envia { t:'spellCast', spellKey, hits } pós-cast local.
        // Server clampa hits, valida spellKey, aplica XP. Sem migrar mp/cooldown:
        // cliente continua dono dessa lógica (já tem cap natural via custos).
        if (msg.t === 'spellCast') {
            // Fase 5: server aplica manaCost + heal authoritative pra magia Cura.
            // Outras magias só têm manaCost (dmg é processado em attackMob/aoe).
            const SPELLS_META = {
                FIREBALL: { manaCost: 18 },
                HEAL:     { manaCost: 12, healBase: 30 },
                RAIO:     { manaCost: 10 },
                EXORI:    { manaCost: 25 },
                TAUNT:    { manaCost: 8 },
                FURY:     { manaCost: 20 },
            };
            const spellKey = String(msg.spellKey || '');
            const sp = SPELLS_META[spellKey];
            if (!sp) return;
            const now = Date.now();
            p._lastSpellAt = p._lastSpellAt || 0;
            if (now - p._lastSpellAt < 600) return;
            p._lastSpellAt = now;
            // Mana check + aplicar custo
            if ((p.mp ?? 0) < sp.manaCost){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'spellResult', ok:false, reason:'low_mana', spellKey }));
                return;
            }
            p.mp = Math.max(0, (p.mp ?? 0) - sp.manaCost);
            // Cura aplica heal
            let healedAmount = 0;
            if (sp.healBase){
                const magiaSk = (p.skills && p.skills.Magia && p.skills.Magia.val) || 10;
                const amount = sp.healBase + Math.floor(magiaSk / 2) + Math.floor(Math.random()*4) - 1;
                const maxHp = p.maxHp || 100;
                healedAmount = Math.min(Math.max(1, amount), maxHp - (p.hp ?? 0));
                if (healedAmount > 0){
                    p.hp = Math.min(maxHp, (p.hp ?? 0) + healedAmount);
                }
            }
            broadcastPstatsAll(p);
            // XP de Magia (compat — cliente continua enviando hits)
            const hits = Math.max(1, Math.min(5, msg.hits | 0 || 1));
            gainSkillXpServer(p, 'Magia', hits);
            sendSkillsOnly(p, 'spellCast');
            if (sp.healBase && p.ws.readyState === 1){
                p.ws.send(JSON.stringify({ t:'spellResult', ok:true, spellKey, healed: healedAmount }));
            }
            return;
        }

        // ─── M5: Talent allocation server-side ─────────────────────────────
        // Cliente envia { t:'talentAlloc', talentId }. Server valida que existe
        // ponto disponível (earned-used > 0), aplica permaBuff e devolve estado.
        if (msg.t === 'talentAlloc') {
            const reject = (reason) => {
                if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'talentResult', ok:false, reason }));
            };
            const tid = String(msg.talentId || '');
            const def = TALENT_DEFS[tid];
            if (!def) return reject('unknown_talent');
            p.talents = p.talents || {};
            if (p.talents[tid]) return reject('already_owned');
            if (talentPointsAvailable(p) < 1) return reject('no_points');
            // Aplica permaBuff
            p.permaBuffs = p.permaBuffs || {};
            for (const [k, v] of Object.entries(def.buff)){
                p.permaBuffs[k] = (p.permaBuffs[k] || 0) + v;
            }
            p.talents[tid] = true;
            // Fase 5: hpBonus (Constituição) altera maxHp — recalcula server-side.
            if (def.buff && typeof def.buff.hpBonus === 'number'){
                recomputeMaxStatsServer(p);
                broadcastPstatsAll(p);
            }
            sendInvUpdate(p, {
                talentResult:{ ok:true, talentId: tid },
                talents: p.talents,
                permaBuffs: p.permaBuffs,
            });
            return;
        }

        // ─── M6: Cassino slot machine (gold sink) ──────────────────────────
        // RNG + payout autoritativos no server. Cliente envia { amount },
        // server valida 100-10000g, debita aposta, rola 3 símbolos e credita
        // payout via goldDelta. House edge ~9% no longo prazo.
        if (msg.t === 'casinoSpin') {
            const CASINO_NPC_POS = { x: 48, y: 50 };
            const CASINO_WEIGHTS = [
                { key:'CHERRY',  weight:35, mult3:3 },
                { key:'LEMON',   weight:25, mult3:5 },
                { key:'GRAPE',   weight:20, mult3:10 },
                { key:'SEVEN',   weight:15, mult3:20 },
                { key:'DIAMOND', weight:5,  mult3:100 },
            ];
            const totalWeight = CASINO_WEIGHTS.reduce((s,x) => s + x.weight, 0);
            const now = Date.now();
            p._lastCasinoAt = p._lastCasinoAt || 0;
            if (now - p._lastCasinoAt < 800) return;   // rate limit
            p._lastCasinoAt = now;
            if (chebyshev(p.x, p.y, CASINO_NPC_POS.x, CASINO_NPC_POS.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'casinoResult', error:'not_at_npc' }));
                return;
            }
            const bet = Math.max(100, Math.min(10000, msg.amount | 0));
            if ((p.gold || 0) < bet){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'casinoResult', error:'no_gold' }));
                return;
            }
            // Debita aposta
            p.gold -= bet;
            // Rola 3 símbolos
            const rollOne = () => {
                let r = Math.random() * totalWeight;
                for (const s of CASINO_WEIGHTS){
                    r -= s.weight;
                    if (r <= 0) return s;
                }
                return CASINO_WEIGHTS[0];
            };
            const symbols = [rollOne(), rollOne(), rollOne()];
            let payout = 0, mult = 0, kind = 'sem combo';
            if (symbols[0].key === symbols[1].key && symbols[1].key === symbols[2].key){
                mult = symbols[0].mult3;
                payout = bet * mult;
                kind = `3× ${symbols[0].key}`;
            } else if (symbols[0].key === symbols[1].key || symbols[1].key === symbols[2].key || symbols[0].key === symbols[2].key){
                // 2 iguais: devolve aposta (sensação de "quase ganhei")
                mult = 1;
                payout = bet;
                kind = 'par';
            }
            if (payout > 0){
                p.gold += payout;
            }
            syncGoldRank(p.name, p.gold);
            sendInvUpdate(p, { goldDelta:{ amount: payout - bet, reason: payout - bet > 0 ? 'casino_win' : 'casino_loss' } });
            if (p.ws.readyState === 1){
                p.ws.send(JSON.stringify({
                    t:'casinoResult',
                    symbols: symbols.map(s => s.key),
                    bet, payout, mult, kind,
                }));
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
            // ─── N3 fase 2: consumo de munição/lança autoritativo ────
            // Munição (arco/besta): cliente indica ammoKey usado; server decrementa.
            // Se cliente mentiu (não tinha), rejeita o ataque.
            let invDirty = false;
            if (typeof msg.ammoKey === 'string'){
                const ammoKey = msg.ammoKey.slice(0, 32);
                const meta = ITEM_META[ammoKey];
                if (!meta || meta.kind !== 'ammo' || !hasInv(p, ammoKey, 1)){
                    sendInvUpdate(p, { ammoBlocked: ammoKey });
                    return;
                }
                incInv(p, ammoKey, -1);
                invDirty = true;
            }
            // Lança arremessada: tira do equipped.weapon. Se houver outra no inv, re-equipa.
            if (msg.throwSpear){
                ensurePlayerInvSlots(p);
                const wKey = p.equipped.weapon;
                const wTier = wKey ? getUpgradeTier(wKey) : null;
                const wMeta = wTier && ITEM_META[wTier.base];
                if (!wMeta || !wMeta.throwable){
                    sendInvUpdate(p, { ammoBlocked: 'no_spear' });
                    return;
                }
                p.equipped.weapon = null;
                if (hasInv(p, wKey, 1)){
                    incInv(p, wKey, -1);
                    p.equipped.weapon = wKey;
                }
                invDirty = true;
                // Propaga equipped pra outros players
                broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, equipped:p.equipped, badges:p.badges || [] });
            }
            if (invDirty) sendInvUpdate(p, { reason:'ammo' });
            // teto de dano: 3x o dmg base do mob (margem confortável pros crits)
            const cap = (MTYPE[m.type]?.hp || 50) + 50;  // teto generoso
            const dmg = Math.max(1, Math.min(msg.amount | 0, cap));
            m.hp = Math.max(0, m.hp - dmg);
            // T1/T3: XP de skill por hit (não só por kill).
            // - Melee (range≤1, sem ammo, sem spear): +1 na skill da arma
            // - Distância (range>1 OU ammo OU throwSpear): +1 em Distância
            const isRanged = range > 1 || typeof msg.ammoKey === 'string' || !!msg.throwSpear;
            gainSkillXpServer(p, isRanged ? 'Distância' : weaponSkillOf(p), 1);
            // Skills atualizadas — só envia se não vai morrer (mobKill abaixo envia skills no payload)
            if (m.hp > 0) sendSkillsOnly(p, 'attackHit');
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
                // Loot autoritativo: server roda LOOT e mantém drops no chão.
                // Cada item ganha id server-side; broadcast spawn pra TODOS verem.
                const loot = rollLoot(m.type);
                // M5 talent t_loot: +15% gold de drops. Aplica antes do spawn.
                const lootBonus = p.permaBuffs?.lootBonus || 0;
                if (lootBonus > 0){
                    for (const it of loot){
                        if (it && it.type === 'GOLD' && it.qty > 0){
                            it.qty = Math.max(1, Math.round(it.qty * (1 + lootBonus)));
                        }
                    }
                }
                const spawnedDrops = [];
                for (const it of loot){
                    if (!it || !it.type) continue;
                    const d = spawnGroundDrop(m.x, m.y, it.type, it.qty | 0 || 1);
                    spawnedDrops.push({ id:d.id, x:d.x, y:d.y, type:d.type, qty:d.qty });
                }
                // T1: XP authoritative na skill da arma equipada
                const skillUsed = weaponSkillOf(p);
                gainSkillXpServer(p, skillUsed, m.xp || 1);
                // killer recebe mobKill (com loot legado pra compat de fallback no client)
                sendTo(id, { t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level, loot, drops: spawnedDrops, skill: skillUsed, xpGained: m.xp || 1 });
                // Envia skills atualizadas (autoritativo)
                sendInvUpdate(p, { skills: p.skills, reason:'mobKill' });
                // outros recebem só mobDead + groundSpawn (sem loot, sem xp)
                broadcast(id, { t:'mobDead', mobId:m.id, byName:p.name, level:m.level });
                if (spawnedDrops.length) broadcast(id, { t:'groundSpawn', drops: spawnedDrops });
                // Ranking: incrementa mobKills (e bossKills se for unique) — all-time + season
                bumpMobKill(p.name, !!m.unique);
                sharePartyKill(p, m);
            }
            return;
        }

        if (msg.t === 'pkDeath') {
            const killer = players.get(msg.killerId);
            // Se ambos estavam num duelo entre si, processa como vitória de duel (sem selo, sem drop)
            if (killer && p.duel && p.duel.opponentId === killer.id && killer.duel && killer.duel.opponentId === id){
                endDuel(killer, p, false);
                return;
            }
            // N3 fase 2: transfere gold authoritative entre vítima e killer
            // (cliente legacy ainda atualizava player.gold via playerSync; agora server faz)
            const requestedGain = Math.max(0, msg.goldGain | 0);
            const actualGain = Math.min(requestedGain, p.gold | 0);
            if (actualGain > 0){
                p.gold -= actualGain;
                syncGoldRank(p.name, p.gold);
                if (killer){
                    killer.gold = (killer.gold | 0) + actualGain;
                    syncGoldRank(killer.name, killer.gold);
                }
            }
            // Highlander drop: vítima perde CORACAO_HL (se tinha) e killer ganha 1
            if (msg.dropHighlander && killer && hasInv(p, 'CORACAO_HL', 1)){
                incInv(p, 'CORACAO_HL', -1);
                incInv(killer, 'CORACAO_HL', 1);
            }
            if (actualGain > 0 || msg.dropHighlander) sendInvUpdate(p, { pvpLoss:{ amount: actualGain, dropHighlander: !!msg.dropHighlander } });
            if (killer && (actualGain > 0 || msg.dropHighlander)) sendInvUpdate(killer, { pvpGain:{ amount: actualGain, dropHighlander: !!msg.dropHighlander } });
            if (killer && killer.ws.readyState === 1){
                killer.ws.send(JSON.stringify({
                    t:'pkKill',
                    victimId: id, victimName: p.name,
                    victimHadSelos: !!msg.hadSelos,
                    goldGain: actualGain,
                    dropHighlander: !!msg.dropHighlander,
                }));
            }
            broadcastMsg('warn', `⚔ ${killer?killer.name:'?'} matou ${p.name}` + (msg.dropHighlander?' (Highlander caiu!)':''));
            // Ranking: incrementa pkKills do killer (all-time + season)
            if (killer) bumpPkKill(killer.name);
            return;
        }

        // Duelo 1v1 — comandos via chat-like (consumido antes do broadcast normal)
        if (msg.t === 'duelInvite') {
            const toName = String(msg.toName || '').trim().substring(0, 14);
            const amount = Math.max(50, Math.min(1_000_000, msg.amount | 0));
            if (!toName) return;
            if (toName.toLowerCase() === p.name.toLowerCase()){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Não dá pra duelar consigo mesmo.' });
                return;
            }
            if (p.duel){ sendTo(id, { t:'serverMsg', level:'warn', text:'Você já está em duelo.' }); return; }
            if ((p.gold || 0) < amount){ sendTo(id, { t:'serverMsg', level:'warn', text:`Aposta acima do seu ouro (${p.gold || 0}g).` }); return; }
            let target = null;
            for (const pp of players.values()){
                if (!pp.disconnected && pp.name.toLowerCase() === toName.toLowerCase()){ target = pp; break; }
            }
            if (!target){ sendTo(id, { t:'serverMsg', level:'warn', text:`"${toName}" não está online.` }); return; }
            if (target.duel){ sendTo(id, { t:'serverMsg', level:'warn', text:`${target.name} já está em duelo.` }); return; }
            if ((target.gold || 0) < amount){ sendTo(id, { t:'serverMsg', level:'warn', text:`${target.name} não tem ${amount}g pra cobrir.` }); return; }
            duelInvites.set(target.id, { fromId: id, fromName: p.name, amount, expiresAt: Date.now() + 30_000 });
            sendTo(target.id, { t:'duelInvite', fromId: id, fromName: p.name, amount });
            sendTo(id, { t:'serverMsg', level:'info', text:`⚔ Convite enviado a ${target.name} (${amount}g).` });
            return;
        }
        if (msg.t === 'duelAccept') {
            const inv = duelInvites.get(id);
            if (!inv || inv.expiresAt < Date.now()){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text:'Nenhum convite de duelo pendente.' });
                return;
            }
            const from = players.get(inv.fromId);
            if (!from || from.disconnected){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text:'O desafiante saiu.' });
                return;
            }
            if (from.duel || p.duel){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text:'Um dos jogadores já está em duelo.' });
                return;
            }
            if ((from.gold || 0) < inv.amount || (p.gold || 0) < inv.amount){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text:'Um dos jogadores não tem ouro suficiente.' });
                sendTo(from.id, { t:'serverMsg', level:'warn', text:'Duelo cancelado: gold insuficiente.' });
                return;
            }
            duelInvites.delete(id);
            startDuel(from, p, inv.amount);
            return;
        }
        if (msg.t === 'duelReject') {
            const inv = duelInvites.get(id);
            if (!inv) return;
            duelInvites.delete(id);
            const from = players.get(inv.fromId);
            if (from && from.ws.readyState === 1){
                sendTo(from.id, { t:'serverMsg', level:'warn', text:`${p.name} recusou o duelo.` });
            }
            sendTo(id, { t:'serverMsg', level:'info', text:'Duelo recusado.' });
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
                guilds: topGuildRanking(limit),
                season: {
                    id: seasonState.id,
                    top: topSeason(limit),
                    archive: seasonState.archive.slice(0, 12),
                },
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
            // Trade só na PZ central (zona segura) — anti-griefing em campo aberto
            if (!inSafe(p.x, p.y) || !inSafe(target.x, target.y)){
                sendTo(id, { t:'serverMsg', level:'warn', text:'Trade só pode ser feito na Zona Segura (PZ central).' });
                return;
            }
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
            // /party ... — sistema de party (XP shared)
            if (text.startsWith('/party')){
                handlePartyCommand(p, text);
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
                    sendTo(id, { t:'serverMsg', level:'info', text:'Admin: /say · /event · /warn · /info · /motd · /setboss TYPE LV · /respawnboss TYPE · /megaboss status|spawn|reset · /deluser NOME · /checkuser NOME · /resetuser NOME' });
                    return;
                }
                if (cmd === '/deluser'){
                    if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /deluser NOME' }); return; }
                    if (arg.toLowerCase() === p.name.toLowerCase()){
                        sendTo(id, { t:'serverMsg', level:'warn', text:'Não dá pra excluir a si mesmo via comando.' });
                        return;
                    }
                    const res = deleteUserAccount(arg);
                    if (!res.ok){
                        sendTo(id, { t:'serverMsg', level:'warn', text: res.reason === 'not_found' ? `Conta "${arg}" não existe.` : 'Falha ao remover.' });
                        return;
                    }
                    sendTo(id, { t:'serverMsg', level:'info', text:`Conta ${res.name} removida${res.kicked ? ' (estava online — desconectado)' : ''}.` });
                    return;
                }
                if (cmd === '/checkuser'){
                    if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /checkuser NOME' }); return; }
                    const info = adminCheckUser(arg);
                    if (!info){ sendTo(id, { t:'serverMsg', level:'warn', text:`Conta "${arg}" não existe.` }); return; }
                    const s = info.save;
                    const o = info.online;
                    sendTo(id, { t:'serverMsg', level:'info', text:`${info.name} ${o?'[online]':'[offline]'} · save: pos=(${s.x},${s.y}) hp=${s.hp}/${s.maxHp} mp=${s.mp}/${s.maxMp} gold=${s.gold}${o?` · live: pos=(${o.x},${o.y}) hp=${o.hp}/${o.maxHp}`:''}` });
                    return;
                }
                if (cmd === '/resetuser'){
                    if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /resetuser NOME' }); return; }
                    const res = adminResetUser(arg);
                    if (!res.ok){
                        sendTo(id, { t:'serverMsg', level:'warn', text: res.reason === 'not_found' ? `Conta "${arg}" não existe.` : 'Falha.' });
                        return;
                    }
                    sendTo(id, { t:'serverMsg', level:'info', text:`Player ${res.name} resetado para (50,50)${res.online ? ' (online — aplicado imediato)' : ' (offline — próximo login pega)'}` });
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
                if (cmd === '/megaboss'){
                    const sub = (arg || '').toLowerCase();
                    if (sub === 'status' || sub === ''){
                        const levels = BOSSES.map(b => `${b.type}=Lv${bossLevel.get(b.type) || 1}`).join(' · ');
                        const cdLeft = MEGA_BOSS_COOLDOWN_MS - (Date.now() - megaBoss.lastResolvedAt);
                        const cdTxt = cdLeft > 0 ? `${Math.floor(cdLeft/60000)}min restantes` : 'pronto';
                        const alive = megaBossIsAlive() ? 'SIM' : 'NÃO';
                        sendTo(id, { t:'serverMsg', level:'info', text:`Mega: vivo=${alive} · maxed=${allBossesAtMaxLevel()} · cd=${cdTxt} · ${levels}` });
                        return;
                    }
                    if (sub === 'spawn'){
                        if (megaBoss.spawnedAt){
                            sendTo(id, { t:'serverMsg', level:'warn', text:'Mega já vivo' });
                            return;
                        }
                        const m = spawnMob(MEGA_BOSS_TYPE, MEGA_BOSS_POS.x, MEGA_BOSS_POS.y);
                        if (!m){ sendTo(id, { t:'serverMsg', level:'warn', text:'Falha ao spawnar' }); return; }
                        megaBoss.spawnedAt = Date.now();
                        saveStateToDisk();
                        broadcastMsg('event', `⚡ O Senhor de Valadares despertou em (${MEGA_BOSS_POS.x}, ${MEGA_BOSS_POS.y})! [admin]`);
                        console.log(`[mega] forçado por admin ${p.name}`);
                        return;
                    }
                    if (sub === 'reset'){
                        megaBoss.spawnedAt = 0;
                        megaBoss.lastResolvedAt = 0;
                        for (const x of Array.from(monsters.values())) if (x.type === MEGA_BOSS_TYPE) monsters.delete(x.id);
                        saveStateToDisk();
                        sendTo(id, { t:'serverMsg', level:'info', text:'Mega resetado (cooldown zerado, instância removida).' });
                        return;
                    }
                    sendTo(id, { t:'serverMsg', level:'info', text:'Uso: /megaboss status | spawn | reset' });
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
        // Duelo ativo: abandonar conta como derrota (oponente leva o pot)
        if (p.duel){
            const opp = players.get(p.duel.opponentId);
            if (opp && opp.duel && opp.duel.opponentId === id){
                endDuel(opp, p, false);
            } else {
                p.duel = null;
            }
        }
        // Party: ao desconectar, sai da party (se único membro, dissolve)
        if (p.name){
            const party = findPartyOfPlayer(p.name);
            if (party){
                party.members = party.members.filter(n => n !== p.name);
                if (party.members.length === 0){
                    parties.delete(party.id);
                } else {
                    if (party.leader === p.name) party.leader = party.members[0];
                    for (const pp of partyMembersOnline(party)){
                        if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text:`👥 ${p.name} desconectou da party.` }));
                    }
                    broadcastPartyUpdate(party);
                }
            }
        }
        // Body stays: mantém ghost por GHOST_TIMEOUT_MS, atacável e droppable
        if (p.disconnected){ players.delete(id); return; }
        // Se o player nunca chegou a logar (WS caiu antes do join), só remove — não vira ghost órfão sem nome
        if (!p.name || p.name === 'Anônimo'){
            // Mas ainda pode ter autenticado — usa authedName se houver
            if (p.authedName){
                removeGhostsByName(p.authedName, id);
            }
            players.delete(id);
            console.log(`[x] ${id} desconectou antes do join — removido`);
            return;
        }
        p.disconnected = true;
        p.disconnectedAt = Date.now();
        // Remove ghosts antigos com mesmo nome — mantém só este (o mais recente)
        removeGhostsByName(p.name, id);
        console.log(`[~] ${id} (${p.name}) virou ghost — ${(GHOST_TIMEOUT_MS/60000).toFixed(0)}min até sumir`);
        broadcast(id, { t:'ghost', id, name:p.name });
    });

    ws.on('error', (e) => console.error(`[!] ${id}:`, e.message));
});

console.log(`╔══════════════════════════════════════╗`);
console.log(`║   VALADARES SERVER em ws://:${PORT}    ║`);
console.log(`║   ${monsters.size} mobs · autoritativo (mobs+combate)   ║`);
console.log(`╚══════════════════════════════════════╝`);
