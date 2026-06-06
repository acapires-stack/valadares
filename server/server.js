// ═════════════════════════════════════════════════════════════════════════════
// VALADARES - Servidor Multiplayer (autoritativo de mobs)
// ═════════════════════════════════════════════════════════════════════════════
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 8080;
// Token de admin pro painel web (env var). Sem isso, /api/admin/* rejeita 401.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN) console.warn('[admin] ADMIN_TOKEN não configurado — painel web desabilitado');

// HTTP server compartilhado com WS upgrade + endpoints REST (webhook MP, criar PIX, health)
const httpServer = http.createServer((req, res) => handleHttpRequest(req, res));
// maxPayload: o maior frame legítimo é o saveUpload (SAVE_MAX_BYTES=200KB); 512KB dá
// folga e bloqueia frames gigantes (default do ws = 100MB) que travariam o event loop
// no JSON.parse (DoS de TODOS os players com uma mensagem só, sem auth).
const wss = new WebSocketServer({ server: httpServer, maxPayload: 512 * 1024 });
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
// Tolerância de frescor do ts da assinatura do webhook (audit 2026-06-03, pagamento #3).
// Defesa-em-profundidade contra replay de webhook assinado: a idempotência durável
// (markPaymentCredited/creditedPayments) já protege o financeiro, então isto é GENEROSO de
// propósito — nunca barrar um pagamento legítimo importa mais que a janela curta. MP assina
// CADA entrega (retries ganham ts novo), logo 15min cobre skew de relógio + atraso de
// processamento sem barrar retry legítimo, e ainda mata replay de assinatura antiga capturada.
const MP_TS_TOLERANCE_MS = parseInt(process.env.MP_TS_TOLERANCE_MS, 10) || (15 * 60 * 1000);
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
const _errorRateMap = new Map();   // ip → lastErrorAt (anti-flood do /api/error)
const _pixRateMap   = new Map();   // ip → lastCreateAt (anti-flood do /api/pix/create)
const _ipConnCount  = new Map();   // ip → nº de conexões WS abertas (anti-flood, audit 2026-06-03)
const MAX_CONN_PER_IP = parseInt(process.env.MAX_CONN_PER_IP, 10) || 30;   // teto generoso (CGNAT-safe p/ jogo pequeno), tunável por env
// Rate-limit global de mensagens por conexão (audit 2026-06-03 — anti-amplificação/DoS).
// Token bucket GENEROSO: combate/AoE real pica ~10-15 msg/s; teto sustentado 40/s, burst 80
// — bem acima do legítimo. Excedente é DESCARTADO (cliente reconcilia via updates
// autoritativos), e só derruba o socket em flood SUSTENTADO. Tunável por env.
const MSG_BUCKET_CAP       = parseInt(process.env.MSG_BUCKET_CAP, 10)       || 80;    // burst
const MSG_BUCKET_REFILL    = parseInt(process.env.MSG_BUCKET_REFILL, 10)    || 40;    // msgs/s sustentado
const MSG_FLOOD_DISCONNECT = parseInt(process.env.MSG_FLOOD_DISCONNECT, 10) || 400;   // descartes em flood sustentado → fecha ws
// IP do cliente atrás do proxy do Railway. O ÚLTIMO item do X-Forwarded-For é o que o
// proxy confiável anexou (os primeiros são injetáveis pelo cliente). Pegar split[0] era
// spoofável → permitia burlar rate-limit E inflar o Map indefinidamente (memory leak).
function clientIp(req){
    const xff = (req.headers['x-forwarded-for'] || '').toString();
    if (xff){
        const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length) return parts[parts.length - 1].slice(0, 45);
    }
    return ((req.socket && req.socket.remoteAddress) || '').toString().slice(0, 45);
}
// Comparação constant-time do admin token (audit 2026-06-03): `!==` curto-circuita no 1º
// byte → vaza um oráculo de timing do segredo. timingSafeEqual exige buffers de mesmo tamanho.
function adminTokenOk(token){
    if (!ADMIN_TOKEN) return false;
    const a = Buffer.from(String(token || ''), 'utf8');
    const b = Buffer.from(ADMIN_TOKEN, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Evict entradas velhas dos rate-maps (TTL 5min). Sem isto os Maps crescem ilimitado.
setInterval(() => {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [k, t] of _errorRateMap) if (t < cutoff) _errorRateMap.delete(k);
    for (const [k, t] of _pixRateMap)   if (t < cutoff) _pixRateMap.delete(k);
}, 5 * 60_000);
function httpJson(res, status, body){
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
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
    if (req.method === 'GET' && req.url === '/api/status'){
        // Tela de login consulta isto pra avisar manutenção de forma confiável (sem depender
        // de flag/reload no cliente). maintenance = lock do deploy ainda ativo.
        // minClientVersion/clientDownloadUrl: deixam o DESKTOP detectar versão velha já no
        // login (proativo), sem depender do bloqueio só na hora de conectar.
        return httpJson(res, 200, {
            maintenance: Date.now() < _maintenanceLockUntil,
            minClientVersion: MIN_CLIENT_VERSION,
            clientDownloadUrl: CLIENT_DOWNLOAD_URL,
        });
    }
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
            acc.pwHash = hashPwScrypt(pwHash);
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
        // Rate-limit por IP: cada create gera uma preference na conta MP real (custo +
        // risco de ban do merchant se floodar). 1 a cada 3s é folgado pro fluxo legítimo.
        const ip = clientIp(req);
        if ((_pixRateMap.get(ip) || 0) > Date.now() - 3000) return httpJson(res, 429, { error:'rate_limited' });
        _pixRateMap.set(ip, Date.now());
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
    // ─── Observabilidade ──────────────────────────────────────────────────
    // POST /api/error — cliente reporta erro JS. Sem auth (qualquer um pode reportar
    // o próprio erro), rate-limited por IP em memória pra evitar flood.
    if (req.method === 'POST' && req.url === '/api/error'){
        try {
            const body = await readBody(req);
            const ip = clientIp(req);
            // Rate limit: 1 erro/segundo por IP. Dropa silenciosamente se floodar.
            const now = Date.now();
            if ((_errorRateMap.get(ip) || 0) > now - 1000) return httpJson(res, 200, { ok:true, dropped:true });
            _errorRateMap.set(ip, now);
            recordError({
                kind: 'js_error',
                player: body.player || null,
                msg: body.msg || '',
                stack: body.stack || null,
                meta: { url: body.url ? String(body.url).slice(0, 300) : null, userAgent: (req.headers['user-agent'] || '').slice(0, 200) },
            });
            return httpJson(res, 200, { ok:true });
        } catch (e){ return httpJson(res, 400, { error:'invalid_body' }); }
    }
    // GET /api/admin/state?token=X — snapshot pro painel admin web
    if (req.method === 'GET' && req.url.startsWith('/api/admin/state')){
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token') || req.headers['x-admin-token'] || '';
        if (!adminTokenOk(token)) return httpJson(res, 401, { error:'unauthorized' });
        const onlineList = [];
        for (const p of players.values()){
            if (p.disconnected || !p.name || p.name === 'Anônimo') continue;
            onlineList.push({
                id: p.id,
                name: p.name,
                isAdmin: isAdmin(p.name),
                x: p.x, y: p.y,
                hp: p.hp, maxHp: p.maxHp,
                mp: p.mp, maxMp: p.maxMp,
                gold: p.gold || 0,
                connectedAt: p.connectedAt || null,
            });
        }
        return httpJson(res, 200, {
            now: Date.now(),
            uptime_s: Math.floor((Date.now() - counters.started_at) / 1000),
            online: onlineList,
            errors: errors.slice(-100).reverse(),   // últimos 100, mais recente primeiro
            counters: {
                connections_total: counters.connections_total,
                ws_closes: counters.ws_closes,
                errors_5min: errorsRecent5min(),
                total_accounts: accounts.size,
                state_mobs: monsters.size,
            },
        });
    }
    // POST /api/admin/action?token=X — comandos admin via web (reset, kick, say, etc)
    if (req.method === 'POST' && req.url.startsWith('/api/admin/action')){
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token') || req.headers['x-admin-token'] || '';
        if (!adminTokenOk(token)) return httpJson(res, 401, { error:'unauthorized' });
        try {
            const body = await readBody(req);
            const kind = String(body.kind || '');
            if (kind === 'reset'){
                const r = adminResetUser(body.target || '');
                return httpJson(res, 200, r);
            }
            if (kind === 'check'){
                const info = adminCheckUser(body.target || '');
                return httpJson(res, 200, info ? { ok:true, info } : { ok:false, reason:'not_found' });
            }
            if (kind === 'delete'){
                const r = deleteUserAccount(body.target || '');
                return httpJson(res, 200, r);
            }
            if (kind === 'say'){
                const text = String(body.text || '').slice(0, 200);
                const level = String(body.level || 'admin');
                if (text) broadcastMsg(level, text);
                return httpJson(res, 200, { ok:true });
            }
            if (kind === 'kick'){
                const target = String(body.target || '').toLowerCase();
                let kicked = false;
                for (const pp of players.values()){
                    if (pp.name && pp.name.toLowerCase() === target && pp.ws && pp.ws.readyState === 1){
                        try { pp.ws.close(4003, 'admin_kick'); } catch {}
                        kicked = true;
                    }
                }
                return httpJson(res, 200, { ok: kicked, target });
            }
            if (kind === 'spawn007'){
                spawnImpostorBot();
                return httpJson(res, 200, { ok: !!impostorBot, alive: !!impostorBot });
            }
            return httpJson(res, 400, { error:'unknown_kind' });
        } catch (e){ return httpJson(res, 400, { error:'invalid_body' }); }
    }
    return httpJson(res, 404, { error:'not_found' });
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
    if (!isValidEmail(email)){ return httpJson(res, 400, { error:'invalid_email' }); }
    const pkg = GOLD_PACKAGES[packageId];
    // NÃO persiste o email na conta aqui: este endpoint HTTP não tem sessão autenticada,
    // então `playerName` é arbitrário — gravar o email permitiria envenenar o save de
    // qualquer conta. O email segue só pro MP (payer/metadata) desta compra; o cliente
    // já guarda o email digitado localmente pra pré-preencher a próxima.
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
                    success: `${SITE_BASE_URL}/?pix=success`,
                    failure: `${SITE_BASE_URL}/?pix=failure`,
                    pending: `${SITE_BASE_URL}/?pix=pending`,
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
            console.error('[mp] ⚠️ MP_WEBHOOK_SECRET NÃO configurado — webhook REJEITADO (fail-closed). Configure o secret na Railway p/ creditar pagamentos. (audit 2026-06-03)');
            _mpSecretWarned = true;
        }
        return { ok:false, reason:'no_secret' };   // fail-CLOSED: sem secret, não confia em ninguém (antes: ok:true = aceitava qualquer POST)
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
    // Frescor do ts (audit 2026-06-03, pagamento #3): o HMAC acima já provou que o ts é
    // AUTÊNTICO (faz parte do manifest), então aqui só barramos REPLAY de uma assinatura
    // válida porém ANTIGA. CONSERVADOR: normaliza a unidade (segundos vs ms pela magnitude)
    // e faz fail-OPEN se o ts for inparseável/implausível — nunca rejeita por dúvida de
    // unidade. A idempotência durável (markPaymentCredited) é a proteção real; isto é extra.
    let tsMs = Number(ts);
    if (Number.isFinite(tsMs) && tsMs > 0){
        if (tsMs < 1e12) tsMs *= 1000;            // ~10 dígitos = segundos → ms; ~13 dígitos = já ms
        if (tsMs >= 1.5e12 && tsMs <= 5e12){      // só confia na unidade se cair em epoch plausível (~2017..2128)
            const skew = Math.abs(Date.now() - tsMs);
            if (skew > MP_TS_TOLERANCE_MS){ return { ok:false, reason:'stale_ts' }; }
        }
    }
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
        if (status === 'approved' && pending.playerName && pending.gold > 0 && !pending.credited && !creditedPayments.has(paymentId)){
            pending.credited = true;
            creditGoldToPlayer(pending.playerName, pending.gold, paymentId);
            markPaymentCredited(paymentId);   // idempotência durável (audit 2026-06-03): bloqueia re-crédito após restart
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
                flushAccounts();
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

// ─── Idempotência DURÁVEL de pagamentos (audit 2026-06-03) ───────────────────
// O Map mpPayments é só memória: um restart (deploy/OOM/plataforma) zerava o guard
// `pending.credited`, e um webhook reentregue (retry legítimo do MP OU replay de
// uma notificação assinada capturada) re-creditava o MESMO pagamento real — pagava
// 1×, recebia gold N×. Persistimos em disco o conjunto de paymentIds JÁ creditados;
// o webhook checa antes e grava o crédito. (Só impede DUPLICATA — nunca bloqueia o
// 1º crédito.) Co-localizado no MESMO volume do state (em prod = /data) — senão o
// __dirname do Railway é efêmero e a dedup sumiria a cada redeploy.
const MP_CREDITED_FILE = process.env.MP_CREDITED_PATH || path.join(path.dirname(STATE_FILE), 'mp_credited.json');
const creditedPayments = new Set();
try {
    const _arr = JSON.parse(fs.readFileSync(MP_CREDITED_FILE, 'utf8'));
    if (Array.isArray(_arr)) for (const _id of _arr) creditedPayments.add(String(_id));
    console.log(`[mp] idempotência: ${creditedPayments.size} pagamentos já creditados carregados`);
} catch { /* arquivo ainda não existe na 1ª execução — ok */ }
function markPaymentCredited(paymentId){
    creditedPayments.add(String(paymentId));
    try {
        const _tmp = MP_CREDITED_FILE + '.tmp';
        fs.writeFileSync(_tmp, JSON.stringify(Array.from(creditedPayments)));
        fs.renameSync(_tmp, MP_CREDITED_FILE);   // escrita atômica (tmp + rename)
    } catch(e){ console.warn('[mp] erro ao persistir idempotência de pagamento:', e.message); }
}

// ─── Constants do mundo ─────────────────────────────────────────────────────
const M_W = 100, M_H = 100;
// PZ: raio 4 (quadrado 9×9, de 46-54). Cliente em play.html:2601 deve bater.
const SAFE_RADIUS = 4, SAFE_CX = 50, SAFE_CY = 50;
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
    // ─── M4 Masmorra "As Profundezas" — mobs exclusivos, mais fortes ───
    SOMBRA:     { hp:230, dmg:22, speed:300, xp:220, aggro:7, intel:2 },   // rápido, assedia
    CARRASCO:   { hp:480, dmg:38, speed:500, xp:420, aggro:6, intel:3 },   // lento, pancada pesada — flanqueia (intel 3)
    SENHOR_PROFUNDEZAS: { hp:5000, dmg:110, speed:340, xp:3000, aggro:9, unique:true, intel:3 },   // ★ boss do andar 5 (3c)
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
    POTION_MP:{ kind:'potion', manaheal:80 },
    CARNE_LAGARTO: { kind:'food', heal:35 },
    BENCAO_FENIX:  { kind:'blessing' },
    // Bênção temporária — entregue só pela morte do 007. Some 24h depois.
    BENCAO_FENIX_TEMP: { kind:'blessing', tempTtlMs: 24 * 3600 * 1000 },
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
    // novas 1H (build de escudo) — sempre < a 2H de tier equivalente
    ESPADA_ACO:      { kind:'weapon', hand:'1h', base:9,  def:3 },
    LAMINA_DRACO_1H: { kind:'weapon', hand:'1h', base:12, def:4 },
    ESPADA_GUARDIAO: { kind:'weapon', hand:'1h', base:16, def:6 },
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
    // wands (cajado — skill via WEAPON_SKILL→Magia; ranged habilita o alcance do tiro
    // básico no weaponRangeServer; sem munição. base entra no cap de dano).
    VARINHA_APRENDIZ: { kind:'wand', hand:'2h', base:6,  def:1, ranged:5 },
    CAJADO_FOGO:      { kind:'wand', hand:'2h', base:13, def:2, ranged:5 },
    CAJADO_GELO:      { kind:'wand', hand:'2h', base:13, def:2, ranged:5 },
    CAJADO_RAIO:      { kind:'wand', hand:'2h', base:13, def:2, ranged:5 },
    CAJADO_RUNICO:    { kind:'wand', hand:'2h', base:20, def:4, ranged:6 },
    CAJADO_ETERNO:    { kind:'wand', hand:'2h', base:30, def:6, ranged:6 },
    // offhand/armaduras
    ESCUDO_MAD:   { kind:'offhand', def:3 },
    ESCUDO_FERRO: { kind:'offhand', def:6 },
    ESCUDO_OSSO:  { kind:'offhand', def:5 },
    ESCUDO_PEDRA: { kind:'offhand', def:8 },
    ESCUDO_GUARDIAO: { kind:'offhand', def:12 },   // ★ par defensivo das 1H lendárias
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
function itemGoldCost(key){
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

// Receitas (espelho de RECIPES do cliente, exceto display name).
// ⚠️ INDEX-SENSITIVE — o craft cruza por POSIÇÃO no array. Editar/reordenar aqui SEM
// espelhar em play.html (e vice-versa) quebra o craft silenciosamente. Manter em sync.
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
    // Fase 3 (rework de magos) — craft de wands. MESMA ORDEM/ÍNDICE do cliente (RECIPES).
    { out:'CAJADO_FOGO',    in:{ ESCAMA:4, GARRA:2, OSSO:6 } },
    { out:'CAJADO_GELO',    in:{ SILK:8, ASA_MORCEGO:4, OSSO:6 } },
    { out:'CAJADO_RAIO',    in:{ PEDRA_GOLEM:4, CHIFRE:2, OSSO:6 } },
    { out:'CAJADO_ETERNO',  in:{ CAJADO_RUNICO:1, CORACAO_HL:3, ESCAMA:5, PEDRA_GOLEM:5 } },
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
            { id:'cr1', kind:'visit', x:18, y:18, radius:3, reward:{ gold:80,  xp:{Magia:50} } },
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
            { id:'vh3', kind:'visit', x:78, y:18, radius:3, reward:{ gold:800, xp:{'Distância':80} } },
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
    // wands (Fase Magos) — espelha o cliente NA MESMA ORDEM (o buy usa o índice)
    { item:'VARINHA_APRENDIZ', price:150 },
    { item:'CAJADO_FOGO',      price:4000 },
    { item:'CAJADO_GELO',      price:4000 },
    { item:'CAJADO_RAIO',      price:4000 },
    { item:'CAJADO_RUNICO',    price:18000 },
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
    const bonus = (p.permaBuffs?.xpBonus || 0) + petBuffVal(p, 'xpBonus');
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

// ─────────────────────────────────────────────────────────────────────────
// M6 PET — buff passivo de economia/QoL (server-autoritativo). O pet EQUIPADO
// (p.pet) espelha o cosmético; o nível/xp por pet (p.pets[key]) é estado
// SERVER-autoritativo: concedido na morte de mob, persistido/sanitizado no load
// — NUNCA confiado do cliente (lição do saveUpload). O BUFF é DERIVADO de
// (pet, nível) no ponto de uso, JAMAIS gravado no permaBuffs (que é recalculado
// do zero no respec — misturar pet ali reintroduziria os bugs de rank/save).
const PET_DEFS = {
    PET_TATU:     { name:'Tatu-Cofre',      buffKey:'lootBonus',  l1:0.06, lMax:0.15, maxLvl:10, price:30000 },
    PET_VAGALUME: { name:'Vaga-lume Sábio', buffKey:'xpBonus',    l1:0.06, lMax:0.15, maxLvl:10, price:30000 },
    PET_GATO:     { name:'Gato Preto',      buffKey:'rareLuck',   l1:0.10, lMax:0.30, maxLvl:10, price:40000 },
    PET_ESPIRITO: { name:'Espírito Vital',  buffKey:'regenBonus', l1:1,    lMax:3,    maxLvl:10, price:25000 },
};
const PET_XP_BASE = 120;   // xp p/ subir do nível 1→2; cresce ×1.5 por nível
function petXpNext(lvl){ return Math.floor(PET_XP_BASE * Math.pow(1.5, Math.max(1, lvl) - 1)); }
// Valor do buff do pet equipado pra uma key específica (0 se não tiver/não bater).
// Escala linear entre l1 (nível 1) e lMax (maxLvl). Derivado — nunca persistido.
function petBuffVal(p, buffKey){
    const key = p && p.pet; if (!key) return 0;
    const def = PET_DEFS[key]; if (!def || def.buffKey !== buffKey) return 0;
    const owned = p.pets && p.pets[key]; if (!owned) return 0;   // só vale se for dono
    const lvl = Math.max(1, Math.min(def.maxLvl, owned.lvl | 0));
    if (def.maxLvl <= 1) return def.lMax;
    return def.l1 + (def.lMax - def.l1) * (lvl - 1) / (def.maxLvl - 1);
}
// Concede xp ao pet EQUIPADO na morte de mob. Server-autoritativo. Retorna
// snapshot {key,lvl,xp,next,leveled} pro cliente atualizar a barra (ou null).
function gainPetXp(p, amount){
    const key = p && p.pet; if (!key) return null;
    const def = PET_DEFS[key]; if (!def) return null;
    p.pets = p.pets || {};
    const owned = p.pets[key]; if (!owned) return null;
    if ((owned.lvl | 0) >= def.maxLvl){ owned.lvl = def.maxLvl; owned.xp = 0; return { key, lvl:def.maxLvl, xp:0, next:0, leveled:false }; }
    owned.xp = (owned.xp | 0) + Math.max(0, amount | 0);
    let leveled = false;
    while (owned.lvl < def.maxLvl && owned.xp >= petXpNext(owned.lvl)){
        owned.xp -= petXpNext(owned.lvl);
        owned.lvl++;
        leveled = true;
    }
    if (owned.lvl >= def.maxLvl) owned.xp = 0;
    return { key, lvl:owned.lvl, xp:owned.xp, next: owned.lvl >= def.maxLvl ? 0 : petXpNext(owned.lvl), leveled };
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
    const mpExtra = (p.permaBuffs?.manaBonus) || 0;   // talent t_mana (Pacto Arcano)
    const newMaxHp = 100 + above + hpExtra;
    const newMaxMp = 100 + Math.floor(above / 2) + mpExtra;
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

// ─── M8 Auction House — helpers cross-player ──────────────────────────────
// grantGoldByName/grantItemByName: entrega gold/item pra player pelo nome,
// mesmo se estiver offline (persiste em accounts.json). Usado quando venda
// fecha (paga seller) ou listing expira (devolve item pro dono).
function grantGoldByName(name, amount, reason){
    if (!name || amount <= 0) return false;
    for (const p of players.values()){
        if (p.disconnected) continue;
        if (p.name && p.name.toLowerCase() === String(name).toLowerCase()){
            p.gold = (p.gold || 0) + amount;
            syncGoldRank(p.name, p.gold);
            sendInvUpdate(p, { goldDelta:{ amount, reason } });
            return true;
        }
    }
    try {
        const acc = getAccount(name);
        if (acc && acc.save){
            acc.save.gold = (acc.save.gold || 0) + amount;
            flushAccounts();
            return true;
        }
    } catch (e){ console.warn('[grantGold]', e.message); }
    return false;
}
function grantItemByName(name, itemKey, qty, reason){
    if (!name || !itemKey || qty <= 0) return false;
    for (const p of players.values()){
        if (p.disconnected) continue;
        if (p.name && p.name.toLowerCase() === String(name).toLowerCase()){
            incInv(p, itemKey, qty);
            sendInvUpdate(p, { itemDelta:{ itemKey, qty, reason } });
            return true;
        }
    }
    try {
        const acc = getAccount(name);
        if (acc && acc.save){
            acc.save.inv = acc.save.inv || {};
            acc.save.inv[itemKey] = (acc.save.inv[itemKey] || 0) + qty;
            flushAccounts();
            return true;
        }
    } catch (e){ console.warn('[grantItem]', e.message); }
    return false;
}

// Slot derivado do tipo de item (espelha SLOT_OF_KIND do cliente)
const SLOT_OF_KIND = {
    weapon:'weapon', wand:'weapon', offhand:'offhand', armor:'armor',
    head:'head', feet:'feet', neck:'neck', cosmetic:'cosmetic',
};
// Posição dos 4 baús (espelha CHESTS do cliente)
const CHEST_POS = {
    b1: { x:47, y:48 }, b2: { x:53, y:48 },
    b3: { x:47, y:52 }, b4: { x:53, y:52 },
};
// N3 fase 2: groundItems autoritativos
const groundDrops = new Map();   // id -> { id, x, y, type, qty, floor, spawnedAt, owner, ownerName, ownerUntil }
let _nextGroundId = 1;
const GROUND_TTL_MS = 5 * 60 * 1000;  // 5min — após isso, despawna
// Anti-ninja: a bag de mob comum fica RESERVADA a quem deu mais dano (+ party dele)
// por esta janela; depois vira livre pra qualquer um. owner=null → sem trava (PK/etc).
const LOOT_LOCK_MS = 15 * 1000;
function spawnGroundDrop(x, y, type, qty, floor, owner, ownerName, ownerUntil){
    const id = 'g' + (_nextGroundId++);
    const drop = { id, x, y, type, qty, floor: floor || 0, spawnedAt: Date.now(),
                   owner: owner ?? null, ownerName: ownerName ?? null, ownerUntil: ownerUntil || 0 };
    groundDrops.set(id, drop);
    return drop;
}
function snapshotGroundDrops(floor){
    return Array.from(groundDrops.values())
      .filter(d => floor === undefined || (d.floor || 0) === floor)
      .map(d => ({ id:d.id, x:d.x, y:d.y, type:d.type, qty:d.qty, owner:d.owner, ownerName:d.ownerName, ownerUntil:d.ownerUntil }));
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
    // M4 Masmorra — loot escalado (gold alto + chance de material/item raro)
    SOMBRA: [
        ['GOLD', 1.00, 30, 80], ['POTION', 0.30, 1, 2], ['POTION_MP', 0.25, 1, 2],
        ['ESSENCIA', 0.20, 1, 1], ['ESCAMA', 0.08, 1, 1], ['OSSO', 0.30, 1, 2],
    ],
    CARRASCO: [
        ['GOLD', 1.00, 80, 200], ['POTION', 0.50, 2, 4], ['POTION_MP', 0.30, 1, 3],
        ['ESSENCIA', 0.40, 1, 2], ['PEDRA_GOLEM', 0.12, 1, 1], ['ESCAMA', 0.12, 1, 1],
        ['MACHADO_MINO', 0.05, 1, 1], ['CORACAO_HL', 0.02, 1, 1],
    ],
    SENHOR_PROFUNDEZAS: [
        ['GOLD', 1.00, 600, 1600], ['ESSENCIA', 1.00, 3, 6], ['POTION', 1.00, 5, 10], ['POTION_MP', 1.00, 4, 8],
        ['CORACAO_HL', 0.50, 1, 2],
        ['ARMADURA_ESCAMA', 0.35, 1, 1], ['ELMO_DRACO', 0.30, 1, 1], ['ESCUDO_PEDRA', 0.28, 1, 1],
        ['MARTELO_GOLEM', 0.22, 1, 1], ['ESPADA_DRACO', 0.20, 1, 1], ['ESPADA_HL', 0.18, 1, 1],
        ['MACHADO_MINO', 0.15, 1, 1], ['BOTAS_VENTO', 0.10, 1, 1],
        ['CAPA_SOMBRA', 0.15, 1, 1], ['TRAIL_GELO', 0.10, 1, 1],
        ['ESPADA_ETERNA', 0.05, 1, 1], ['ARMADURA_TRONO', 0.08, 1, 1],
        // novas 1H + escudo — viabilizam o build de escudo (#7/#8). Aço comum (porta de entrada), Guardião raro.
        ['ESPADA_ACO', 0.40, 1, 1], ['LAMINA_DRACO_1H', 0.25, 1, 1], ['ESPADA_GUARDIAO', 0.12, 1, 1], ['ESCUDO_GUARDIAO', 0.12, 1, 1],
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
function rollLoot(mobType, luck){
    const table = LOOT[mobType];
    if (!table) return [];
    const lk = Math.max(0, luck || 0);   // Sortudo (t_luck): + chance relativa de ITENS (gold inalterado)
    const out = [];
    for (const [type, chance, qMin, qMax] of table){
        const c = type === 'GOLD' ? chance : Math.min(0.95, chance * (1 + lk));
        if (Math.random() < c){
            const qty = qMin + Math.floor(Math.random() * (qMax - qMin + 1));
            out.push({ type, qty });
        }
    }
    return out;
}

const BOSS_RESPAWN_MS = 5 * 60 * 1000;
const DUNGEON_BOSS_RESPAWN_MS = 8 * 60 * 1000;
// Teto de dano por hit (anti-forja de msg.amount no attackMob). O maior hit
// LEGÍTIMO possível é ~372: arma mítica forjada (ESPADA_ETERNA base 30 +5 = 37)
// + skill no cap (floor(200/3)=66) + variância (2) = 105, ×2 crit = 210, × mults
// máximos (selos+HL+buff ≈ 1,77) ≈ 372. 600 dá folga (nunca capa hit real) mas
// impede one-shot de boss (ex.: Senhor das Profundezas 5000hp → ≥9 hits) e o
// roubo de 100% do damageBy num único golpe forjado.
const MAX_HIT_DMG = 600;
// Intervalo mínimo entre ataques (attackMob) por player. O ataque legítimo mais
// rápido é 680ms (attackDelay 800 × atkSpd máx 0,15 da forja), então 200ms tem
// 3,4× de folga e nunca bloqueia jogo limpo — mas impede rajada de hits forjados.
const ATTACK_MIN_INTERVAL_MS = 200;
// Deploy 2b: cadência mínima por AÇÃO de ataque de ARMA. O ataque legítimo MAIS
// rápido é ~510ms (attackDelay 800 × atkSpd máx 0,15 da forja × Fúria 0,25 =
// 800×0,85×0,75). 400ms fica 110ms abaixo disso → nunca engole hit limpo (mesmo com
// jitter) mas corta o spam forjado (era 200ms/hit = ~2× DPS mesmo após o cap de dano).
// Magia (janela do spellCast) é ISENTA — o Exori dispara vários attackMob no mesmo tick
// e a frequência já é limitada pelo rate-limit 600ms do spellCast.
const ATTACK_ACTION_MIN_MS = 400;
const BOSS_POS  = { type:'ORC_LIDER',   x:46, y:95, respawn: BOSS_RESPAWN_MS };
const DRAKE_POS = { type:'DRAKE_LIDER', x:82, y:80, respawn: DUNGEON_BOSS_RESPAWN_MS };
const GOLEM_POS = { type:'GOLEM_REI',   x:70, y:90, respawn: DUNGEON_BOSS_RESPAWN_MS };
const BOSSES = [BOSS_POS, DRAKE_POS, GOLEM_POS];
const bossDeath = new Map(); // type -> deathAt
// M4 anti-farm: cooldown de respawn do boss da masmorra (Senhor das Profundezas).
// Sem isso, spawnDungeonMobs repunha o boss no tick seguinte (8s) sempre que o andar
// 5 tinha player e nenhum boss vivo → farm infinito ("matei e já spawnou de novo").
// In-memory e efêmero como a própria masmorra: NÃO persiste no save nem precisa de
// cleanup — bounded a 1 chave (DUNGEON_MAX_FLOOR) e é apagado no respawn.
const dungeonBossDeath = new Map(); // floor -> deathAt
const bossLevel = new Map(); // type -> 1..10 (escala stats no respawn)
const BOSS_LEVEL_CAP = 10;
const GHOST_TIMEOUT_MS = 3 * 60 * 1000;   // body stays 3 min após logout

// M7 Arena — posição do Mestre da Arena (borda inferior-central da PZ, livre de
// outros NPCs/features por ≥2 sqm). Definido aqui (antes de NPC_POSITIONS) pra
// entrar na lista de proteção; o módulo da arena (mais abaixo) reusa esta const.
const ARENA_NPC = { x: 50, y: 54 };
// Posições dos NPCs (espelhadas do cliente). Mob não ataca player adjacente a NPC (mini-PZ raio 2).
// Mantém aqui no server porque cliente é dono dos NPCs (não precisa sincronizar tudo).
// Também usado pelo questTurnIn pra validar adjacência no momento da entrega.
const QUEST_NPCS = {
    atendente:  { x:47, y:53 },   // canto SO da PZ (sync com play.html NPCS)
    eremita:    { x:22, y:22 },
    ferreiro:   { x:78, y:22 },
    cacadora:   { x:76, y:78 },
    mineiro:    { x:66, y:90 },
    crepusculo: { x:28, y:75 },
    vohrim:     { x:15, y:50 },
    vendedor:   { x:75, y:20 },
};
const NPC_POSITIONS = [
    { x:47, y:47 },  // mercador (canto NO da PZ)
    { x:53, y:50 },  // banqueiro (E meio da PZ)
    { x:47, y:50 },  // crupiê (O meio da PZ)
    { x:53, y:53 },  // tintureira (canto SE da PZ)
    { x:53, y:47 },  // leiloeiro (canto NE da PZ)
    QUEST_NPCS.atendente,
    QUEST_NPCS.eremita,
    QUEST_NPCS.ferreiro,
    QUEST_NPCS.cacadora,
    QUEST_NPCS.mineiro,
    QUEST_NPCS.crepusculo,
    QUEST_NPCS.vohrim,
    QUEST_NPCS.vendedor,
    ARENA_NPC,   // mestre da arena (M7) — protege o tile como os outros NPCs da PZ
];
const NPC_PROTECT_RADIUS = 1;   // 3×3 ao redor do NPC (suficiente pra ler modal)
const NPC_PROTECT_COMBAT_GRACE_MS = 2000;   // ao atacar, perde proteção por 2s

// Santuário dos NPCs de MUNDO (fora da PZ da cidade): zona segura MAIOR (5×5) e
// visível, pra dar espaço de ler o diálogo sem apanhar. Diferente da mini-PZ 3×3,
// aqui o mob também NÃO pisa (vira clareira, ver mobTileOk/spawns) → quem te
// perseguia para na borda e, como você não é mirado dentro, larga (leash natural).
// Os NPCs da cidade já têm a PZ 9×9. O Vendedor (75,20) cola no Ferreiro (78,22) e
// também ganha santuário → vira uma zona contígua protegida (#11).
const SANCTUARY_RADIUS = 2;   // 5×5
const SANCTUARY_NPCS = [
    QUEST_NPCS.eremita, QUEST_NPCS.ferreiro, QUEST_NPCS.cacadora,
    QUEST_NPCS.mineiro, QUEST_NPCS.crepusculo, QUEST_NPCS.vohrim, QUEST_NPCS.vendedor,
];
function inSanctuary(x, y){
    for (const n of SANCTUARY_NPCS){
        if (Math.max(Math.abs(x - n.x), Math.abs(y - n.y)) <= SANCTUARY_RADIUS) return true;
    }
    return false;
}
function playerNearNpc(p){
    // Santuário 5×5 (NPCs de mundo): abrigo TOTAL — o mob larga o alvo mesmo se você
    // atacou de dentro. Sem isto a grace abaixo reativava o alvo e os mobs empilhavam
    // na borda tentando entrar (não pisam no santuário). #9
    if (inSanctuary(p.x, p.y)) return true;
    // Mini-PZ 3×3: cancelada se o player atacou recentemente (anti-cheese de NPC-escudo)
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
const HL_HUNT_COOLDOWN_MS = 5 * 60 * 1000;          // cooldown do claim de Highlander Hunt
const megaBoss = {
    spawnedAt: 0,         // 0 = não está vivo
    lastResolvedAt: 0,    // última vez que morreu ou expirou
};

// Admin: travado em 'alcione' (não usa env, segurança extra)
// Admin: nome do dono (configurável por env ADMIN_NAME) OU flag isAdmin na conta. A flag
// permite grant granular no futuro; o fallback por nome garante que o dono nunca perde
// acesso mesmo sem a flag setada. (Audit: tirar o 'alcione' hardcoded como ponto único.)
const ADMIN_NAMES = (process.env.ADMIN_NAME || 'alcione,claude').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
function isAdmin(name){
    const n = String(name || '').toLowerCase();
    if (ADMIN_NAMES.includes(n)) return true;
    const a = getAccount(name);
    return !!(a && a.isAdmin);
}

// MOTD via env (mensagem do dia, aparece pra todos ao conectar)
const SERVER_MOTD = process.env.SERVER_MOTD || '';
let SERVER_MOTD_RUNTIME = SERVER_MOTD;  // pode ser editado via /motd (até reiniciar)

// ─── Estado ─────────────────────────────────────────────────────────────────
let nextId = 1;
let nextMobId = 1;

// Momento em que o processo (re)iniciou. Usado pra detectar reconexões logo
// após um deploy/restart — nesses casos o player não teve culpa de cair, então
// curamos HP/MP cheios no join (evita "morri/meia-vida no update"). Fora dessa
// janela (server rodando há tempo), o HP do save é mantido (sem exploit de
// relogar pra curar em PvP).
const SERVER_BOOT_TIME = Date.now();
const POST_BOOT_HEAL_MS = 3 * 60 * 1000;   // 3 min após boot

// ─── M4 "As Profundezas" — masmorra aberta vertical ───────────────────────
// Andar compartilhado e perigoso (PvP forçado). 5 andares (boss no 5). O server
// é DONO do layout: genDungeonGrid gera cada andar como caverna procedural
// (cellular automata, determinística por andar) e rastreia p.floor + posição.
// Entrada: Antro do Minotauro (83,17). Player desce → chega em (50,52) no andar.
// Fase 2: as escadas do andar (subida/descida/boss) são PROCEDURAIS — escolhidas
// por genDungeonGrid em chão alcançável (subida perto da chegada e no lado OPOSTO
// à descida pra não pisar sem querer; descida/boss no ponto mais fundo). A saída
// do andar 1 volta pra PZ da cidade (50,50).
const DUNGEON_ENTRANCE = { x: 83, y: 17 };   // escada no Antro do Minotauro (82,18) — fora da PZ, gated por mobs fortes
const DUNGEON_RETURN   = { x: 50, y: 50 };   // SAÍDA SEGURA: PZ da cidade (antes 83,18 = no meio dos minotauros = morte ao sair)
const DUNGEON_SPAWN    = { x: 50, y: 52 };   // chegada FIXA ao entrar/trocar de andar (genDungeonGrid garante clareira aqui)
const DUNGEON_MAX_FLOOR = 5;                  // Fase 3: 5 andares (boss no 5 — slice 3c)
const DUNGEON_FLOOR_SCALE = 0.6;              // +60% hp/dmg/xp por andar de profundidade (andar 1 = base)
const DUNGEON_BOSS_TYPE  = 'SENHOR_PROFUNDEZAS';   // ★ boss único do último andar (3c)
const DUNGEON_BOSS_SPAWN = { x: 50, y: 42 };       // fundo da sala (longe da chegada 50,52; > aggro 9 → dorme até você chegar perto)
// Sala jogável do andar (grid do cliente: CAVE de 40-60, parede em volta).
// Box = sala visível INTEIRA (CAVE 40-60) pra mobs usarem a beirada também.
// Antes era 41-59 (1 tile menor): no canto/beirada só 1-2 mobs alcançavam o
// player → o resto enfileirava. Com 40-60 alcançam até 3 no canto / 5 na borda.
const DUNGEON_ROOM = { x0: 40, y0: 40, x1: 60, y1: 60 };

// ─── M4 3b Fase 2: grid PROCEDURAL do andar (server = DONO do layout) ───────
// O server gera o grid WALL/FLOOR de cada andar (cellular automata) e o transmite
// ao cliente no dungeonEnter; mobs/spawn/colisão/escadas usam ESTE grid. Cavernas
// orgânicas, DETERMINÍSTICAS por andar (mesmo andar = mesmo layout; cache efêmero
// regenera idêntico). Garante: clareira na chegada, tudo conectado (flood-fill),
// escadas em chão alcançável (subida PERTO / descida no ponto mais FUNDO). Se a
// geração sair pequena/desconexa, cai pra sala cheia (= Fase 1) — nunca quebra.
const DUNGEON_REGION = DUNGEON_ROOM;     // região coberta pelo grid (40..60 = 21×21)
const dungeonFloors = new Map();          // floor → { region, rows, walkable:Set, floorTiles:[], stairs }
// PRNG determinístico (mulberry32) — seed pelo andar (+ tentativa de retry).
function dungeonRng(seed){
    let s = (seed >>> 0) || 1;
    return function(){
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function genDungeonGrid(floor){
    const { x0, y0, x1, y1 } = DUNGEON_REGION;
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    const sx = DUNGEON_SPAWN.x - x0, sy = DUNGEON_SPAWN.y - y0;   // chegada em coords locais
    const idx = (lx, ly) => ly * W + lx;
    const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    // Gera caverna; cada tentativa muda o seed. wall[i]=1 parede, 0 chão.
    let wall = null;
    for (let attempt = 0; attempt < 6 && !wall; attempt++){
        const rng = dungeonRng((floor * 0x9E3779B1) ^ (attempt * 0x85EBCA77));
        const w = new Uint8Array(W * H);
        for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++)
            w[idx(lx, ly)] = (lx === 0 || ly === 0 || lx === W - 1 || ly === H - 1 || rng() < 0.45) ? 1 : 0;
        // suavização CA (4 passes): vira parede com >=5 vizinhos-parede (fora do grid conta como parede)
        for (let it = 0; it < 4; it++){
            const nw = new Uint8Array(W * H);
            for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++){
                let walls = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
                    if (!dx && !dy) continue;
                    const nx = lx + dx, ny = ly + dy;
                    walls += (nx < 0 || ny < 0 || nx >= W || ny >= H) ? 1 : w[idx(nx, ny)];
                }
                nw[idx(lx, ly)] = walls >= 5 ? 1 : 0;
            }
            w.set(nw);
        }
        // clareira garantida na chegada (raio 2 = sala de pouso, sem mob em cima)
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){
            const nx = sx + dx, ny = sy + dy;
            if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) w[idx(nx, ny)] = 0;
        }
        // conectividade: flood-fill de chão a partir da chegada; chão isolado → parede
        const seen = new Uint8Array(W * H);
        const stack = [idx(sx, sy)]; seen[idx(sx, sy)] = 1;
        let reachCount = 1;
        while (stack.length){
            const c = stack.pop(), cx = c % W, cy = (c / W) | 0;
            for (const [dx, dy] of NB4){
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = idx(nx, ny);
                if (!seen[ni] && w[ni] === 0){ seen[ni] = 1; reachCount++; stack.push(ni); }
            }
        }
        for (let i = 0; i < W * H; i++) if (w[i] === 0 && !seen[i]) w[i] = 1;
        if (reachCount >= 90) wall = w;   // caverna boa (área jogável suficiente)
    }
    // Fallback: sala cheia 40-60 (= comportamento Fase 1) se nenhuma tentativa serviu
    if (!wall){
        wall = new Uint8Array(W * H);
        for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++)
            if (lx === 0 || ly === 0 || lx === W - 1 || ly === H - 1) wall[idx(lx, ly)] = 1;
    }

    // BFS de distância a partir da chegada (escolhe escadas perto/longe)
    const dist = new Int16Array(W * H).fill(-1);
    const q = [idx(sx, sy)]; dist[idx(sx, sy)] = 0;
    for (let head = 0; head < q.length; head++){
        const c = q[head], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of NB4){
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = idx(nx, ny);
            if (wall[ni] === 0 && dist[ni] < 0){ dist[ni] = dist[c] + 1; q.push(ni); }
        }
    }

    // rows / walkable / floorTiles (coords GLOBAIS) + acha o ponto mais FUNDO (far)
    // e os candidatos de SUBIDA (anel perto da chegada, fora da clareira).
    const chebySp = (gx, gy) => Math.max(Math.abs(gx - DUNGEON_SPAWN.x), Math.abs(gy - DUNGEON_SPAWN.y));
    const rows = [], walkable = new Set(), floorTiles = [], upCands = [];
    let far = null, farD = -1;
    for (let ly = 0; ly < H; ly++){
        let row = '';
        for (let lx = 0; lx < W; lx++){
            const isFloor = wall[idx(lx, ly)] === 0;
            row += isFloor ? '1' : '0';
            if (isFloor){
                const gx = x0 + lx, gy = y0 + ly;
                walkable.add(gx + ',' + gy); floorTiles.push({ x: gx, y: gy });
                const d = dist[idx(lx, ly)];
                if (d >= 0){
                    if (d > farD){ farD = d; far = { x: gx, y: gy }; }           // descida/boss: mais fundo
                    const cs = chebySp(gx, gy);
                    if (cs >= 3 && cs <= 9) upCands.push({ x: gx, y: gy });      // subida: perto, fora da clareira
                }
            }
        }
        rows.push(row);
    }
    if (!far) far = { x: DUNGEON_SPAWN.x, y: DUNGEON_SPAWN.y };
    // Subida = candidato perto da chegada MAIS DISTANTE da descida (lados opostos →
    // explorar rumo à descida não passa pela saída; evita "subiu sem querer").
    let up = null, upScore = -1;
    for (const c of upCands){
        const sc = Math.max(Math.abs(c.x - far.x), Math.abs(c.y - far.y));
        if (sc > upScore){ upScore = sc; up = c; }
    }
    if (!up) up = far;   // sala minúscula: degenera
    const lastFloor = floor >= DUNGEON_MAX_FLOOR;
    const stairs = {
        spawn: { x: DUNGEON_SPAWN.x, y: DUNGEON_SPAWN.y },
        up:    { x: up.x,  y: up.y  },
        down:  lastFloor ? null : { x: far.x, y: far.y },     // escada de descida = ponto mais fundo
        boss:  lastFloor ? { x: far.x, y: far.y } : null,     // boss no ponto mais fundo do andar 5
    };
    return { floor, region: { x0, y0, x1, y1 }, rows, walkable, floorTiles, stairs };
}
function getDungeonFloor(floor){
    if (!dungeonFloors.has(floor)) dungeonFloors.set(floor, genDungeonGrid(floor));
    return dungeonFloors.get(floor);
}
function dungeonTileWalkable(floor, x, y){
    const g = dungeonFloors.get(floor);
    return !!g && g.walkable.has(x + ',' + y);
}
const DUNGEON_MOB_TARGET = 9;                 // população de mobs no andar 1
const DUNGEON_MOB_TYPES  = ['SOMBRA', 'SOMBRA', 'CARRASCO'];   // pesos: mais Sombra
// Mob pode pisar no tile? No andar usa o box da sala (sem PZ, sem grid do
// overworld). No overworld, regra normal (walkable + fora da PZ).
// Tiles de transição (escadas + chegada) onde mob NÃO pode ficar — senão bloqueia
// o player de entrar/sair/subir/descer (não dá pra andar pro tile de um mob).
function isTransitionTile(floor, x, y){
    if ((floor || 0) === 0){
        return (x === DUNGEON_ENTRANCE.x && y === DUNGEON_ENTRANCE.y) ||
               (x === DUNGEON_RETURN.x   && y === DUNGEON_RETURN.y);
    }
    // Fase 2: escadas são por-andar (procedural). Lê o grid já gerado (não força
    // geração). Boss NÃO entra aqui de propósito — senão spawnMob bloquearia o
    // próprio tile do boss; mob comum já evita o boss pelo 3×3 de spawnDungeonMobs.
    const g = dungeonFloors.get(floor);
    if (!g) return false;
    const s = g.stairs;
    return (s.spawn && x === s.spawn.x && y === s.spawn.y) ||
           (s.up    && x === s.up.x    && y === s.up.y)    ||
           (s.down  && x === s.down.x  && y === s.down.y);
}
function mobTileOk(m, x, y){
    const f = m.floor || 0;
    if (isTransitionTile(f, x, y)) return false;   // não fica em cima da escada/chegada
    if (f >= 1){
        return dungeonTileWalkable(f, x, y);   // M4 3b: grid real do andar (não mais só o box)
    }
    return isWalkable(x, y) && !inSafe(x, y) && !inSanctuary(x, y);
}
// Player pode pisar no tile? (movimento autoritativo do handler `pos`). Floor>=1
// usa o grid real do andar; floor 0 usa o terreno do overworld. AO CONTRÁRIO de
// mobTileOk, NÃO exclui PZ/santuário (o player FICA lá). E NÃO checa ocupação por
// mob/NPC/outro player: isso é nicety de colisão do cliente, não exploit, e validar
// arriscaria desync (server e cliente nem sempre concordam quem ocupa um tile no
// mesmo instante → snap-back indevido). Só valida terreno: fecha teleporte/parede/água.
function playerTileWalkable(p, x, y){
    const f = p.floor || 0;
    if (f >= 1) return dungeonTileWalkable(f, x, y);
    return isWalkable(x, y);
}

// ─── M8 Auction House — state global ──────────────────────────────────────
// Trade assíncrono via NPC Leiloeiro em (50, 48). Server escrowa o item
// (sai do p.inv), debita gold do comprador na compra, paga seller (online
// ou offline) menos 5% comissão (gold sink). Listings expiram em 24h e
// voltam pro seller. Persistido em state.json.
const AUCTION_NPC_POS      = { x: 53, y: 47 };   // sync com NPCS.leiloeiro em play.html
const AUCTION_COMMISSION   = 0.05;
const AUCTION_DURATION_MS  = 24 * 60 * 60 * 1000;
const AUCTION_MAX_LISTINGS = 10;
const AUCTION_MIN_PRICE    = 1;
const AUCTION_MAX_PRICE    = 10_000_000;
let nextAuctionId = 1;
const auctions = new Map();   // id → { id, sellerName, itemKey, qty, price, listedAt, expiresAt }

function sendAuctionsTo(p){
    if (!p || !p.ws || p.ws.readyState !== 1) return;
    const mine = [], browse = [];
    const myName = (p.name || '').toLowerCase();
    for (const a of auctions.values()){
        if (a.sellerName.toLowerCase() === myName) mine.push(a);
        else browse.push(a);
    }
    browse.sort((x, y) => x.price - y.price);
    mine.sort((x, y) => x.expiresAt - y.expiresAt);
    p.ws.send(JSON.stringify({ t:'auctions', browse, mine, serverNow: Date.now() }));
}
function tickAuctionExpire(){
    const now = Date.now();
    let expired = 0;
    for (const a of [...auctions.values()]){
        if (a.expiresAt > now) continue;
        auctions.delete(a.id);
        if (grantItemByName(a.sellerName, a.itemKey, a.qty, 'auction_expired')){
            expired++;
        } else {
            console.warn(`[auction] expired but couldn't return ${a.qty}× ${a.itemKey} to ${a.sellerName}`);
        }
    }
    if (expired > 0) console.log(`[auction] ${expired} listing(s) expiraram e voltaram pro seller`);
}
const players  = new Map(); // id -> { ws, id, name, x, y, dir, pvp, hp, maxHp }
const monsters = new Map(); // id -> { id, type, x, y, dir, hp, maxHp, dmg, speed, aggro, unique, lastMoveAt, lastAttackAt }

// ─── Helpers ────────────────────────────────────────────────────────────────
function chebyshev(ax, ay, bx, by){ return Math.max(Math.abs(ax-bx), Math.abs(ay-by)); }
function manhattan(ax, ay, bx, by){ return Math.abs(ax-bx) + Math.abs(ay-by); }
function inSafe(x, y){ return chebyshev(x, y, SAFE_CX, SAFE_CY) <= SAFE_RADIUS; }
// M4: zona segura SÓ vale na cidade (floor 0). Na masmorra (floor ≥ 1) não há
// PZ — as coords coincidem com a PZ da cidade, mas lá é perigoso (mobs atacam,
// regen normal, PvP forçado). Use este helper onde a segurança depende do player.
function playerInSafe(p){ return (p.floor || 0) === 0 && inSafe(p.x, p.y); }
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
// M4: floor opcional. undefined = global (todos). Definido = só players do
// andar `floor`. Quem não tem p.floor é tratado como 0 (overworld).
function broadcast(except, msg, floor){
    const data = JSON.stringify(msg);
    for (const p of players.values()){
        if (p.id === except) continue;
        if (floor !== undefined && (p.floor || 0) !== floor) continue;
        if (p.ws.readyState === 1) p.ws.send(data);
    }
}

// ── i18n (Fase 2, Opção B): o server traduz a serverMsg pro idioma do player ──
// (p.lang, capturado no join). Fallback sempre PT, então cliente legado/sem lang
// vê exatamente o que via antes (zero regressão). Per-player usa trp(p,...);
// broadcast usa broadcastMsgKey() que traduz POR destinatário (cada um no seu idioma).
const I18N_SRV = {
  pt: {
    'srv.guild_already': 'Você já está numa guild.',
    'srv.guild_bad_name': 'Nome inválido. 3-16 chars, letras/números/_/-.',
    'srv.guild_exists': 'Já existe guild com esse nome.',
    'srv.guild_created': '✦ Guild "{name}" criada! Você é o líder.',
    'srv.no_guild': 'Você não tem guild.',
    'srv.leader_only_invite': 'Só o líder convida.',
    'srv.guild_usage_invite': 'Uso: /guild invite NOME',
    'srv.bad_name': 'Nome inválido.',
    'srv.guild_full': 'Guild cheia (máx {max}).',
    'srv.guild_invited': '👥 {name} convidou você pra guild "{guild}". Use /guild join',
    'srv.invite_sent_60': 'Convite enviado pra {name} (60s).',
    'srv.no_invites': 'Sem convites pendentes.',
    'srv.guild_gone': 'Guild não existe mais.',
    'srv.guild_joined': '✦ Você entrou na guild "{guild}"!',
    'srv.guild_member_joined': '👥 {name} entrou na guild.',
    'srv.guild_left': 'Você saiu da guild "{guild}".',
    'srv.guild_member_left': '👥 {name} saiu da guild.',
    'srv.guild_none_help': 'Sem guild. Use /guild create NOME ou /guild join (após convite).',
    'srv.guild_none_yet': 'Nenhuma guild ainda.',
    'srv.guild_list': 'Guilds: {list}',
    'srv.guild_subcmds': 'Subcomandos: create NOME, invite NOME, join, leave, info, list',
    'srv.season_end': '🏆 Temporada {id} encerrada! Campeão: {champion}',
    'srv.season_end_nochamp': '🏆 Temporada {id} encerrada (sem campeão).',
    'srv.admin_reset_pos': 'Admin resetou sua posição. Recarregando…',
    'srv.account_removed': 'Sua conta foi removida pelo admin.',
    'srv.duel_invite_expired': 'Convite de duelo a {name} expirou.',
    'srv.duel_self': 'Não dá pra duelar consigo mesmo.',
    'srv.duel_already': 'Você já está em duelo.',
    'srv.duel_wager_high': 'Aposta acima do seu ouro ({g}g).',
    'srv.not_online': '"{name}" não está online.',
    'srv.target_dueling': '{name} já está em duelo.',
    'srv.target_cant_cover': '{name} não tem {g}g pra cobrir.',
    'srv.duel_invite_sent': '⚔ Convite enviado a {name} ({g}g).',
    'srv.no_duel_invite': 'Nenhum convite de duelo pendente.',
    'srv.challenger_left': 'O desafiante saiu.',
    'srv.someone_dueling': 'Um dos jogadores já está em duelo.',
    'srv.someone_no_gold': 'Um dos jogadores não tem ouro suficiente.',
    'srv.duel_cancelled_gold': 'Duelo cancelado: gold insuficiente.',
    'srv.duel_declined_by': '{name} recusou o duelo.',
    'srv.duel_declined': 'Duelo recusado.',
    'srv.party_usage_invite': 'Uso: /party invite NOME',
    'srv.party_self': 'Não dá pra convidar a si mesmo.',
    'srv.target_in_party': '{name} já está em outra party.',
    'srv.party_full': 'Party cheia (max {max}).',
    'srv.party_invited': '👥 {name} te convidou pra party. Use /party accept',
    'srv.no_party_invite': 'Sem convites de party pendentes.',
    'srv.party_gone': 'A party não existe mais.',
    'srv.party_already': 'Você já está numa party. /party leave primeiro.',
    'srv.party_member_joined': '✦ {name} entrou na party!',
    'srv.no_party': 'Você não está em party.',
    'srv.party_left': 'Você saiu da party.',
    'srv.party_member_left': '👥 {name} saiu da party.',
    'srv.no_party_short': 'Sem party.',
    'srv.leader_only_kick': 'Só o líder dá kick.',
    'srv.party_usage_kick': 'Uso: /party kick NOME',
    'srv.party_use_leave': 'Use /party leave pra sair.',
    'srv.not_in_party': '"{name}" não está na party.',
    'srv.party_kicked': '👥 {name} removeu {target} da party.',
    'srv.no_party_help': 'Sem party. /party invite NOME pra criar.',
    'srv.party_info': 'Party ({n}/{max}): {members}',
    'srv.party_subcmds': 'Subcomandos: invite NOME, accept, leave, kick NOME, info',
    'srv.party_invite_expired': 'Convite de party expirou.',
    'srv.party_member_dc': '👥 {name} desconectou da party.',
    'srv.save_too_big': 'Save muito grande ({kb}KB) — não foi gravado.',
    'srv.restore_not_allowed': 'Restauração não liberada. Peça ao admin: /allowrestore SEU_NOME',
    'srv.restore_only_empty': 'Restauração só em conta zerada (a sua não está vazia).',
    'srv.backup_invalid': 'Backup inválido/ausente.',
    'srv.backup_too_big': 'Backup grande demais.',
    'srv.backup_also_empty': 'O backup também está vazio — nada a restaurar.',
    'srv.backup_saved': '✦ Backup gravado no servidor ({gold}g)! Saia e entre de novo (SAIR → entrar) pra carregar tudo.',
    'srv.not_consumable': 'Item não consumível.',
    'srv.near_merchant': 'Aproxime-se do Mercador.',
    'srv.bad_offer': 'Oferta inválida.',
    'srv.no_gold_g': 'Sem ouro ({g}g).',
    'srv.bad_item': 'Item inválido.',
    'srv.bad_recipe': 'Receita inválida.',
    'srv.near_bench': 'Aproxime-se da bancada.',
    'srv.no_material': 'Sem material: {k} ({q}×)',
    'srv.bad_item_forge': 'Item inválido pra forja.',
    'srv.max_level': 'Já no nível máximo (+{n}).',
    'srv.need_3x_forge': 'Precisa de 3× pra forjar.',
    'srv.not_equipable': 'Item não-equipável.',
    'srv.bad_chest': 'Baú inválido.',
    'srv.near_chest': 'Aproxime-se do baú.',
    'srv.bad_chest_op': 'Operação de baú inválida.',
    'srv.need_wand': 'Precisa de uma wand equipada.',
    'srv.no_mana': 'Sem mana suficiente.',
    'srv.no_mana_short': 'Sem mana.',
    'srv.respec_cost': 'Respec custa {g}g — você não tem.',
    'srv.bad_trade': 'Trade inválido.',
    'srv.trade_pz_only': 'Trade só pode ser feito na Zona Segura (PZ central).',
    'srv.trade_too_far': 'Aproxime-se mais (max 3 tiles).',
    'srv.someone_trading': 'Um dos dois já está em trade.',
    'srv.trade_declined_by': '{name} recusou o trade.',
    'srv.chat_slow': 'Devagar com o chat.',
    'srv.nothing_respec': 'Nada pra redistribuir.',
    'srv.entered_world': '✦ {name} entrou em Valadares',
    /*SRVPT*/
  },
  en: {
    'srv.guild_already': 'You are already in a guild.',
    'srv.guild_bad_name': 'Invalid name. 3-16 chars, letters/numbers/_/-.',
    'srv.guild_exists': 'A guild with that name already exists.',
    'srv.guild_created': '✦ Guild "{name}" created! You are the leader.',
    'srv.no_guild': 'You have no guild.',
    'srv.leader_only_invite': 'Only the leader can invite.',
    'srv.guild_usage_invite': 'Usage: /guild invite NAME',
    'srv.bad_name': 'Invalid name.',
    'srv.guild_full': 'Guild full (max {max}).',
    'srv.guild_invited': '👥 {name} invited you to the guild "{guild}". Use /guild join',
    'srv.invite_sent_60': 'Invite sent to {name} (60s).',
    'srv.no_invites': 'No pending invites.',
    'srv.guild_gone': 'Guild no longer exists.',
    'srv.guild_joined': '✦ You joined the guild "{guild}"!',
    'srv.guild_member_joined': '👥 {name} joined the guild.',
    'srv.guild_left': 'You left the guild "{guild}".',
    'srv.guild_member_left': '👥 {name} left the guild.',
    'srv.guild_none_help': 'No guild. Use /guild create NAME or /guild join (after an invite).',
    'srv.guild_none_yet': 'No guilds yet.',
    'srv.guild_list': 'Guilds: {list}',
    'srv.guild_subcmds': 'Subcommands: create NAME, invite NAME, join, leave, info, list',
    'srv.season_end': '🏆 Season {id} ended! Champion: {champion}',
    'srv.season_end_nochamp': '🏆 Season {id} ended (no champion).',
    'srv.admin_reset_pos': 'Admin reset your position. Reloading…',
    'srv.account_removed': 'Your account was removed by the admin.',
    'srv.duel_invite_expired': 'Duel invite to {name} expired.',
    'srv.duel_self': 'You cannot duel yourself.',
    'srv.duel_already': 'You are already in a duel.',
    'srv.duel_wager_high': 'Wager above your gold ({g}g).',
    'srv.not_online': '"{name}" is not online.',
    'srv.target_dueling': '{name} is already in a duel.',
    'srv.target_cant_cover': '{name} does not have {g}g to cover it.',
    'srv.duel_invite_sent': '⚔ Invite sent to {name} ({g}g).',
    'srv.no_duel_invite': 'No pending duel invite.',
    'srv.challenger_left': 'The challenger left.',
    'srv.someone_dueling': 'One of the players is already in a duel.',
    'srv.someone_no_gold': 'One of the players does not have enough gold.',
    'srv.duel_cancelled_gold': 'Duel cancelled: not enough gold.',
    'srv.duel_declined_by': '{name} declined the duel.',
    'srv.duel_declined': 'Duel declined.',
    'srv.party_usage_invite': 'Usage: /party invite NAME',
    'srv.party_self': 'You cannot invite yourself.',
    'srv.target_in_party': '{name} is already in another party.',
    'srv.party_full': 'Party full (max {max}).',
    'srv.party_invited': '👥 {name} invited you to a party. Use /party accept',
    'srv.no_party_invite': 'No pending party invite.',
    'srv.party_gone': 'The party no longer exists.',
    'srv.party_already': 'You are already in a party. /party leave first.',
    'srv.party_member_joined': '✦ {name} joined the party!',
    'srv.no_party': 'You are not in a party.',
    'srv.party_left': 'You left the party.',
    'srv.party_member_left': '👥 {name} left the party.',
    'srv.no_party_short': 'No party.',
    'srv.leader_only_kick': 'Only the leader can kick.',
    'srv.party_usage_kick': 'Usage: /party kick NAME',
    'srv.party_use_leave': 'Use /party leave to exit.',
    'srv.not_in_party': '"{name}" is not in the party.',
    'srv.party_kicked': '👥 {name} removed {target} from the party.',
    'srv.no_party_help': 'No party. /party invite NAME to create one.',
    'srv.party_info': 'Party ({n}/{max}): {members}',
    'srv.party_subcmds': 'Subcommands: invite NAME, accept, leave, kick NAME, info',
    'srv.party_invite_expired': 'Party invite expired.',
    'srv.party_member_dc': '👥 {name} disconnected from the party.',
    'srv.save_too_big': 'Save too large ({kb}KB) — it was not saved.',
    'srv.restore_not_allowed': 'Restore not allowed. Ask the admin: /allowrestore YOUR_NAME',
    'srv.restore_only_empty': 'Restore only on an empty account (yours is not empty).',
    'srv.backup_invalid': 'Backup invalid/missing.',
    'srv.backup_too_big': 'Backup too large.',
    'srv.backup_also_empty': 'The backup is also empty — nothing to restore.',
    'srv.backup_saved': '✦ Backup saved on the server ({gold}g)! Log out and back in (EXIT → enter) to load everything.',
    'srv.not_consumable': 'Item not consumable.',
    'srv.near_merchant': 'Get closer to the Merchant.',
    'srv.bad_offer': 'Invalid offer.',
    'srv.no_gold_g': 'Not enough gold ({g}g).',
    'srv.bad_item': 'Invalid item.',
    'srv.bad_recipe': 'Invalid recipe.',
    'srv.near_bench': 'Get closer to the bench.',
    'srv.no_material': 'Missing material: {k} ({q}×)',
    'srv.bad_item_forge': 'Invalid item for forging.',
    'srv.max_level': 'Already at max level (+{n}).',
    'srv.need_3x_forge': 'Need 3× to forge.',
    'srv.not_equipable': 'Item not equippable.',
    'srv.bad_chest': 'Invalid chest.',
    'srv.near_chest': 'Get closer to the chest.',
    'srv.bad_chest_op': 'Invalid chest operation.',
    'srv.need_wand': 'You need a wand equipped.',
    'srv.no_mana': 'Not enough mana.',
    'srv.no_mana_short': 'No mana.',
    'srv.respec_cost': 'Respec costs {g}g — you cannot afford it.',
    'srv.bad_trade': 'Invalid trade.',
    'srv.trade_pz_only': 'Trade can only be done in the Safe Zone (central PZ).',
    'srv.trade_too_far': 'Get closer (max 3 tiles).',
    'srv.someone_trading': 'One of you is already trading.',
    'srv.trade_declined_by': '{name} declined the trade.',
    'srv.chat_slow': 'Slow down with the chat.',
    'srv.nothing_respec': 'Nothing to redistribute.',
    'srv.entered_world': '✦ {name} entered Valadares',
    /*SRVEN*/
  }
};
function trp(p, key, params){
  const lang = (p && p.lang === 'en') ? 'en' : 'pt';
  let s = (I18N_SRV[lang] && I18N_SRV[lang][key]);
  if (s == null) s = (I18N_SRV.pt && I18N_SRV.pt[key]);
  if (s == null) s = key;
  if (params) for (const k in params) s = s.split('{'+k+'}').join(params[k]);
  return s;
}
// Broadcast traduzido por destinatário — cada player recebe no seu próprio idioma.
function broadcastMsgKey(level, key, params, fromName, except){
  for (const p of players.values()){
    if (except !== undefined && p.id === except) continue;
    if (!p.ws || p.ws.readyState !== 1) continue;
    const out = { t:'serverMsg', level, text: String(trp(p, key, params)).substring(0, 280) };
    if (fromName) out.from = fromName;
    p.ws.send(JSON.stringify(out));
  }
  console.log(`[msg ${level}]${fromName?' '+fromName+':':''} ${key}`);
}

// Mensagens do servidor pra todos — levels: 'info' | 'warn' | 'event' | 'admin'
function broadcastMsg(level, text, fromName){
    const out = { t:'serverMsg', level, text: String(text).substring(0, 280) };
    if (fromName) out.from = fromName;
    broadcast(null, out);
    console.log(`[msg ${level}]${fromName?' '+fromName+':':''} ${text}`);
}
// Manutenção: countdown de avisos antes de um deploy/restart MANUAL. O aviso NÃO
// pode vir do deploy (o Railway mata o processo em segundos) — é o admin que dispara
// isto ANTES de pushar. Ao reiniciar, a janela pós-boot (POST_BOOT_HEAL_MS) cura e
// joga todo mundo na PZ. Timers one-shot; re-disparar cancela o countdown anterior.
let _maintenanceTimers = [];
let _maintenanceLockUntil = 0;   // > now → rejeita novas conexões (janela do deploy); auto-expira
function startMaintenanceCountdown(mins){
    for (const t of _maintenanceTimers) clearTimeout(t);
    _maintenanceTimers = [];
    const m = Math.max(1, Math.min(10, (mins | 0) || 3));
    const totalMs = m * 60 * 1000;
    broadcastMsg('warn', `🔧 MANUTENÇÃO em ${m} min — o servidor vai reiniciar. Você voltará pra Zona Segura.`);
    const marks = [];
    for (let k = m - 1; k >= 1; k--) marks.push([totalMs - k * 60000, `🔧 Manutenção em ${k} min.`]);
    marks.push([totalMs - 30000, '🔧 Manutenção em 30 segundos — volte pra um lugar seguro.']);
    marks.push([totalMs - 10000, '🔧 Manutenção em 10 segundos!']);
    marks.push([totalMs, '🔄 Manutenção iniciando — o servidor pode reiniciar a qualquer momento. Você reaparecerá na Zona Segura.']);
    for (const [at, txt] of marks){
        if (at > 0) _maintenanceTimers.push(setTimeout(() => broadcastMsg('warn', txt), at));
    }
    // Ao FIM do countdown: tranca novas conexões e DESLOGA todo mundo (clean). Antes só
    // avisava — por isso a reconexão do deploy ainda criava sessão fantasma. Sem sessão
    // viva no restart, não há fantasma pra atropelar save. O lock auto-expira (failsafe se
    // o push não vier); o processo novo nasce com lock=0 → reabre. Pushar dentro da janela.
    const LOCK_MS = 5 * 60 * 1000;
    _maintenanceTimers.push(setTimeout(() => {
        _maintenanceLockUntil = Date.now() + LOCK_MS;
        let n = 0;
        for (const [oid, op] of players){
            try { if (op.ws && op.ws.readyState === 1){ op.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text:'🔧 Manutenção — desconectado. Volte em ~1 min; seu progresso está salvo.' })); op.ws.close(4030, 'maintenance'); } } catch {}
            op.disconnected = true; players.delete(oid); n++;
        }
        console.log(`[maintenance] lock ${LOCK_MS/60000}min + ${n} player(s) desconectado(s)`);
    }, totalMs + 500));
    console.log(`[maintenance] countdown ${m}min disparado`);
}
function sendTo(id, msg){
    const p = players.get(id);
    if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}
function snapshotPlayers(floor){
    return Array.from(players.values())
      .filter(p => floor === undefined || (p.floor || 0) === floor)
      .map(p => ({
        id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:!!p.pvp,
        hp:p.hp ?? 100, maxHp:p.maxHp ?? 100,
        mp:p.mp ?? 0, maxMp:p.maxMp ?? 0,
        cosmetic: p.cosmetic || null,
        pet: p.pet || null,
        equipped: p.equipped || null,
        badges: p.badges || [],
        dyes: p.dyes || null,
        guild: findGuildOfPlayer(p.name)?.name || null,
        ghost: !!p.disconnected,
    }));
}
function mobAt(x, y, floor){
    for (const m of monsters.values()){
        if (m.x !== x || m.y !== y || m.hp <= 0) continue;
        if (floor !== undefined && (m.floor || 0) !== floor) continue;
        return m;
    }
    return null;
}
function playerAt(x, y, floor){
    for (const p of players.values()){
        if (p.disconnected) continue;
        if (floor !== undefined && (p.floor || 0) !== floor) continue;
        if (p.x === x && p.y === y) return p;
    }
    return null;
}
// Empurra mob 1 tile pro lado se ele acabou ficando em cima de player (race condition
// entre tickAI do server e movimento client-authoritative).
function bumpMobAwayFrom(x, y, floor){
    const m = mobAt(x, y, floor);
    if (!m) return;
    const f = m.floor || 0;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const [dx, dy] of dirs){
        const nx = m.x + dx, ny = m.y + dy;
        if (nx < 1 || ny < 1 || nx >= M_W-1 || ny >= M_H-1) continue;
        if (!isWalkable(nx, ny)) continue;
        if (inSafe(nx, ny)) continue;
        if (mobAt(nx, ny, f)) continue;
        if (playerAt(nx, ny, f)) continue;
        m.x = nx; m.y = ny;
        return;
    }
}
function spawnMob(type, x, y, floor){
    const def = MTYPE[type];
    if (!def) return null;
    if (isTransitionTile(floor || 0, x, y)) return null;   // nunca spawna em cima de escada/chegada
    // Bosses escalam por nível (cap 10): hp x(1+0.15k), dmg x(1+0.10k), xp x(1+0.20k) com k = lvl-1
    const level = def.unique ? Math.max(1, Math.min(BOSS_LEVEL_CAP, bossLevel.get(type) || 1)) : 1;
    const k = level - 1;
    // Fase 3: mobs comuns escalam por profundidade da masmorra (+60%/andar; andar 1 = base).
    const fMult = (!def.unique && (floor || 0) >= 1) ? (1 + DUNGEON_FLOOR_SCALE * ((floor || 0) - 1)) : 1;
    const hp  = def.unique ? Math.round(def.hp  * (1 + k * 0.15)) : Math.round(def.hp  * fMult);
    const dmg = def.unique ? Math.round(def.dmg * (1 + k * 0.10)) : Math.round(def.dmg * fMult);
    const xp  = def.unique ? Math.round(def.xp  * (1 + k * 0.20)) : Math.round(def.xp  * fMult);
    const m = {
        id: nextMobId++, type, x, y, dir:'down',
        spawnX: x, spawnY: y,    // âncora pra wandering (volta pra perto)
        floor: floor || 0,       // M4: andar onde o mob vive (0 = overworld)
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
            if (inSafe(x, y) || inCave(x, y) || inSanctuary(x, y) || mobAt(x, y)) continue;
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
            if (inSafe(x, y) || inCave(x, y) || inSanctuary(x, y) || mobAt(x, y)) continue;
            spawnMob(b.types[Math.floor(Math.random() * b.types.length)], x, y);
            placed++;
        }
    }
    // Bosses
    for (const b of BOSSES) if (!monsters.has(b.type)) spawnMob(b.type, b.x, b.y);
    console.log(`[world] ${monsters.size} mobs spawnados`);
}

// ─── Respawn dinâmico ───────────────────────────────────────────────────────
// M4: mantém a população de mobs no andar 1. Spawna na sala (evitando escada
// e ponto de chegada do player). Chamado no boot e periodicamente.
function spawnDungeonMobs(){
    // Fase 3: mantém população em CADA andar com player; limpa andares vazios
    // (masmorra efêmera — não simula andar sem ninguém e evita acúmulo de mobs).
    // M7 FIX: só andares de MASMORRA (1..DUNGEON_MAX_FLOOR). A arena usa floor 9000+ como
    // instância isolada e NÃO pode entrar aqui — senão este tick (8s) spawnava SOMBRA/CARRASCO
    // escalados por 1.6^9000 (≈1.2M HP / one-shot de 60k) na arena, e deletava o grid da arena
    // no meio da partida. O grid/limpeza da arena é gerido por endArenaMatch/returnFromArena.
    const isDungeonFloor = (f) => f >= 1 && f <= DUNGEON_MAX_FLOOR;
    const floorsWithPlayers = new Set();
    for (const p of players.values()){ const f = p.floor || 0; if (isDungeonFloor(f)) floorsWithPlayers.add(f); }
    for (const m of Array.from(monsters.values())){
        if (isDungeonFloor(m.floor || 0) && !floorsWithPlayers.has(m.floor || 0)) monsters.delete(m.id);
    }
    // M4 3b: descarta o grid de andares de MASMORRA vazios (efêmero; regenera ao reentrar)
    for (const f of [...dungeonFloors.keys()]){ if (isDungeonFloor(f) && !floorsWithPlayers.has(f)) dungeonFloors.delete(f); }
    for (const floor of floorsWithPlayers){
        const g = getDungeonFloor(floor);   // M4 3b: grid do andar (layout/escadas/floor tiles)
        // ★ Boss do último andar: 1 por vez, com cooldown de respawn pós-morte (anti-farm)
        if (floor === DUNGEON_MAX_FLOOR){
            const hasBoss = Array.from(monsters.values()).some(mm => mm.type === DUNGEON_BOSS_TYPE && (mm.floor||0) === floor && mm.hp > 0);
            // Cooldown anti-farm: só repõe o boss DUNGEON_BOSS_RESPAWN_MS (8min) após a
            // última morte. Sem isso, matar e ficar no andar 5 = respawn no tick (8s).
            // 1ª descida (sem morte registrada) → deadAt 0 → spawna na hora. OK.
            const deadAt = dungeonBossDeath.get(floor) || 0;
            const bs = g.stairs.boss || DUNGEON_BOSS_SPAWN;
            if (!hasBoss && Date.now() - deadAt >= DUNGEON_BOSS_RESPAWN_MS){
                spawnMob(DUNGEON_BOSS_TYPE, bs.x, bs.y, floor);
                dungeonBossDeath.delete(floor);   // respawnou: zera o cooldown pro próximo ciclo
            }
        }
        let count = 0;
        for (const m of monsters.values()) if ((m.floor || 0) === floor && m.hp > 0 && !m.unique) count++;
        // não nasce em cima das escadas/chegada/boss (3×3 ao redor de cada uma)
        const stairTiles = new Set();
        for (const s of [g.stairs.spawn, g.stairs.up, g.stairs.down, g.stairs.boss]){
            if (s) for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) stairTiles.add((s.x+dx)+','+(s.y+dy));
        }
        let tries = 0;
        while (count < DUNGEON_MOB_TARGET && tries < 120 && g.floorTiles.length){
            tries++;
            const t = g.floorTiles[Math.floor(Math.random() * g.floorTiles.length)];
            const x = t.x, y = t.y;
            if (stairTiles.has(x + ',' + y)) continue;   // longe das escadas/chegada
            if (mobAt(x, y, floor)) continue;
            const type = DUNGEON_MOB_TYPES[Math.floor(Math.random() * DUNGEON_MOB_TYPES.length)];
            const mob = spawnMob(type, x, y, floor);
            if (mob) count++;
        }
    }
}

// Fase 3: coloca o player num andar da masmorra (entrada nova OU troca de andar).
// Popula o andar ANTES de mandar o snapshot (senão chega numa sala vazia). `dir`
// só rotula a direção no cliente (log/toast).
function enterDungeonFloor(p, id, floor, dir){
    p.floor = floor;
    const g = getDungeonFloor(floor);          // M4 3b: server é dono do layout do andar
    p.x = g.stairs.spawn.x; p.y = g.stairs.spawn.y;
    spawnDungeonMobs();
    if (p.ws.readyState === 1){
        p.ws.send(JSON.stringify({
            t:'dungeonEnter', floor, dir: dir || 'down', x: p.x, y: p.y,
            grid: { region: g.region, rows: g.rows },   // M4 3b: cliente desenha ESTE grid
            stairs: g.stairs,
            players: snapshotPlayers(floor).filter(sp => sp.id !== id),
            mobs: snapshotMobs(floor),
            groundDrops: snapshotGroundDrops(floor),   // #5: cliente limpa/repopula loot do andar (não vaza entre andares)
        }));
    }
    broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:true, hp:p.hp, maxHp:p.maxHp, equipped: p.equipped || null, cosmetic: p.cosmetic || null, pet: p.pet || null, badges: p.badges || [], dyes: p.dyes || null, guild: findGuildOfPlayer(p.name)?.name || null } }, floor);
}

// Tira o player da masmorra e o devolve pra cidade (overworld): restaura o PvP,
// zera o floor, teleporta pra saída segura (PZ) e manda o snapshot da cidade
// (players/mobs/loot). Usado ao sair pela escada (andar 1) E ao MORRER na masmorra
// — sem isto a morte só teleportava x/y pra (50,50) mantendo p.floor no andar, então
// o player renascia DENTRO da masmorra colado no boss e o AI do andar seguia batendo. (#5)
function returnPlayerToTown(p, id){
    if ((p.floor || 0) > 0) broadcast(id, { t:'leave', id }, p.floor);   // some do andar
    p.pvp = !!p._pvpBeforeDungeon;
    p.floor = 0;
    p.x = DUNGEON_RETURN.x; p.y = DUNGEON_RETURN.y;
    if (p.ws && p.ws.readyState === 1){
        p.ws.send(JSON.stringify({
            t:'dungeonExit', x: p.x, y: p.y, pvp: p.pvp,
            players: snapshotPlayers(0).filter(sp => sp.id !== id),
            mobs: snapshotMobs(0),
            groundDrops: snapshotGroundDrops(0),
        }));
    }
    broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp, equipped: p.equipped || null, cosmetic: p.cosmetic || null, pet: p.pet || null, badges: p.badges || [], dyes: p.dyes || null, guild: findGuildOfPlayer(p.name)?.name || null } }, 0);
}

// Respawn PvE server-autoritativo (fix do LOOP DE MORTE — 2026-06-03).
// BUG: a morte deixava hp=0 no SERVIDOR. O respawn era 100% client-side (o cliente
// seta hp cheio LOCAL + manda `pos`), mas o handler de `pos` IGNORA hp pelo lockdown N3
// → ficava cliente="cheio" × servidor="morto" (0). A regen pula hp<=0, então o servidor
// nunca recuperava sozinho. A cada pstats(hp=0) o cliente re-disparava playerDie() =
// LOOP de morte drenando 15% de skill por ciclo (catastrófico em AFK/auto-farm, que não
// toma poção nem reloga pra sair do 0). Agora o servidor RESSUSCITA de fato.
function respawnPlayerServer(p, id){
    if (!p) return;
    p.dots = [];                                   // clean slate: sem DoT herdado da morte (não sangra pós-respawn)
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    if ((p.floor || 0) > 0) returnPlayerToTown(p, id);   // masmorra → cidade (zera floor + manda dungeonExit pro cliente)
    broadcastPstatsAll(p);                         // servidor e cliente concordam (hp cheio) → o loop não se forma
}

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
                if (inSafe(x, y) || inCave(x, y) || inSanctuary(x, y) || mobAt(x, y)) continue;
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
                if (inSafe(x, y) || inCave(x, y) || inSanctuary(x, y) || mobAt(x, y)) continue;
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
// 🛡️ Anti-enxame (fix "morri cercado") — caps tunáveis por env, aplicados no tickAI quando
// vários mobs cercam um player: (1) máx de mobs que ACERTAM por janela de cooldown;
// (2) teto de dano por SEGUNDO como % do HP máx (rede de segurança contra burst).
// Atacante único / boss raramente bate nos caps (1 < K e 1 hit < 30%/s). Hits absorvidos = 0.
const SWARM_MAX_ATTACKERS   = parseInt(process.env.SWARM_MAX_ATTACKERS, 10)   || 4;
const SWARM_DMG_PCT_PER_SEC = parseFloat(process.env.SWARM_DMG_PCT_PER_SEC)   || 0.30;
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
            if (!mobTileOk(m, x, y)) continue;   // floor-aware: masmorra valida a sala; overworld = walkable + fora da PZ
            const occ = mobAt(x, y, m.floor);
            if (occ && occ !== m) continue;
            if (playerAt(x, y, m.floor)) continue;
            const d = Math.max(Math.abs(m.x - x), Math.abs(m.y - y));
            let score = d;
            // intel >=2: penaliza vagas perto de outros mobs (espalha)
            if (intel >= 2){
                let cluster = 0;
                for (const om of monsters.values()){
                    if (om === m || om.hp <= 0 || (om.floor||0) !== (m.floor||0)) continue;
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
// Esquiva do player SERVER-SIDE (espelha playerDodgeChance do cliente: base 1.5% +
// 0.6%/ponto de Escudo acima de 10, + talento, teto TOTAL 25%). ANTES só existia no
// cliente (damagePlayer), que NÃO roda online → a esquiva era MORTA em PvE.
function playerDodgeChanceServer(p){
    const esc = (p.skills && p.skills['Escudo'] && p.skills['Escudo'].val) || 10;
    const skillBased = 0.015 + Math.max(0, esc - 10) * 0.006;
    const perma = (p.permaBuffs && p.permaBuffs.dodgeBonus) || 0;
    // base+skill teto 25%; mérito (talento/quest) soma POR CIMA — é conquista do
    // player, não deve ser comida pelo teto. Teto de segurança 50% (anti-invencível).
    return Math.min(0.50, Math.min(0.25, skillBased) + perma);
}
// Fase 2b — status de controle elemental (gelo=freeze/lentidão, raio=shock/atordoa).
const FREEZE_MS = 3000;        // gelo: lentidão por 3s
const SHOCK_MS = 700;          // raio: atordoa (pula o turno) por 0.7s
const FREEZE_SLOW_MULT = 1.8;  // mob frozen anda ~1.8× mais devagar
function tickAI(){
    const now = Date.now();
    for (const m of monsters.values()){
        if (m.hp <= 0) continue;
        // ⚡ Choque (raio): atordoado pula o turno (sem mover/atacar). DoT segue no tickMobDots.
        if (m.shockedUntil && now < m.shockedUntil) continue;
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
            const mFloor = m.floor || 0;   // M4: mob só mira player do mesmo andar
            for (const p of players.values()){
                if ((p.hp ?? 100) <= 0) continue;
                if ((p.floor || 0) !== mFloor) continue;
                if (playerInSafe(p)) continue;   // PZ só protege na cidade; masmorra é perigosa
                if (playerNearNpc(p)) continue;   // mini-PZ ao redor de NPCs
                const d = chebyshev(m.x, m.y, p.x, p.y);
                if (d <= m.aggro && d < td){ target = p; td = d; }
            }
        }
        // Sem target: wandering leve (não vale pra bosses/unique — eles ficam no spot)
        if (!target){
            if (m.unique) continue;
            const wanderCd = Math.floor(m.speed * 1.8 * ((m.frozenUntil && now < m.frozenUntil) ? FREEZE_SLOW_MULT : 1));
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
            if (!mobTileOk(m, nx, ny)) continue;
            if (mobAt(nx, ny, m.floor)) continue;
            if (playerAt(nx, ny, m.floor)) continue;
            m.x = nx; m.y = ny;
            m.dir = dy > 0 ? 'down' : dy < 0 ? 'up' : dx > 0 ? 'right' : 'left';
            m.lastMoveAt = now;
            continue;
        }
        // adjacente → atacar
        if (td <= 1){
            if (now - m.lastAttackAt >= ATTACK_CD_MS){
                m.lastAttackAt = now;
                // Grace period: primeiros 10s após connect player é imune (dano=0).
                // Protege contra death durante reconnect (deploy do server, rede oscilando).
                // Mob continua tickando AI normalmente — só não aplica dano.
                const graceLeft = 10000 - (now - (target.connectedAt || 0));
                if (graceLeft > 0){
                    // Anima ataque do mob (cliente vê o swing) mas sem dano
                    if (target.ws && target.ws.readyState === 1){
                        try { target.ws.send(JSON.stringify({ t:'mobHit', mobId: m.id, amount: 0, actual: 0, immune: true })); } catch {}
                    }
                    continue;
                }
                // 🕯️ Segunda Chance: 2s de imunidade pós-revive — anima o swing mas sem dano.
                if ((target._invulnUntil || 0) > now){
                    if (target.ws && target.ws.readyState === 1){
                        try { target.ws.send(JSON.stringify({ t:'mobHit', mobId: m.id, amount: 0, actual: 0, immune: true })); } catch {}
                    }
                    continue;
                }
                // Esquiva do player (espelha cliente). ANTES só rodava no cliente offline →
                // esquiva morta em PvE; o player tomava dano "esquivando". Agora vale aqui.
                if (Math.random() < playerDodgeChanceServer(target)){
                    if (target.ws.readyState === 1){
                        target.ws.send(JSON.stringify({ t:'mobHit', mobId:m.id, mobType:m.type, dmg:m.dmg, actual:0, dodged:true }));
                    }
                    gainSkillXpServer(target, 'Escudo', 1);   // treina Escudo na esquiva (como o cliente fazia)
                } else {
                    // Crit do mob (×2, espelha cliente) + defesa percentual. ANTES o crit do
                    // mob não era aplicado online (cosmético/a favor do player); agora vale.
                    const mobCrit = Math.random() < ((MTYPE[m.type] && MTYPE[m.type].crit) || 0);
                    const raw = mobCrit ? m.dmg * 2 : m.dmg;
                    const def = totalDefenseServer(target);
                    const reduction = def > 0 ? def / (def + 30) : 0;
                    const tRed = Math.min(0.5, (target.permaBuffs && target.permaBuffs.dmgReduction) || 0);   // Pele de Pedra (teto seg. 50%)
                    let actual = Math.max(1, Math.round(raw * (1 - reduction) * (1 - tRed)));
                    // 🛡️ Anti-enxame: (1) máx de atacantes por janela de cooldown + (2) teto de dano/s (% HP máx).
                    // Hit absorvido vira 0 (o mob já gastou o cooldown acima). Por player, tunável por env.
                    if (now - (target._atkWinStart || 0) > ATTACK_CD_MS){ target._atkWinStart = now; target._atkCount = 0; }
                    if ((target._atkCount || 0) >= SWARM_MAX_ATTACKERS){ actual = 0; }
                    else { target._atkCount = (target._atkCount || 0) + 1; }
                    if (actual > 0){
                        if (now - (target._dmgSecStart || 0) > 1000){ target._dmgSecStart = now; target._dmgSecTotal = 0; }
                        const secCap = Math.max(1, Math.round((target.maxHp || 100) * SWARM_DMG_PCT_PER_SEC));
                        const room = secCap - (target._dmgSecTotal || 0);
                        actual = room <= 0 ? 0 : Math.min(actual, room);
                        target._dmgSecTotal = (target._dmgSecTotal || 0) + actual;
                    }
                    // Absorvido pelo cap → sem dano, sem mobHit (evita "-0"); o mob segue em cooldown.
                    if (actual <= 0) continue;
                    if ((target.hp ?? 100) > 0){
                        const newHp = Math.max(0, (target.hp ?? 100) - actual);
                        // 🕯️ Segunda Chance: se o golpe MATARIA, tenta reviver no lugar (só PvE).
                        // Reviveu → hp já setado + pstats no helper; NÃO aplica DoT/stun, NÃO morre,
                        // NÃO returnPlayerToTown (mantém o player na masmorra = preserva a run).
                        if (newHp === 0 && trySecondChance(target)){
                            /* reviveu — pula toda a sequência de morte */
                        } else {
                            target.hp = newHp;
                            broadcastPstatsAll(target);
                            // Fase 5: DoT/stun authoritative no server (rollAttackerStatus
                            // do cliente fica como no-op quando online).
                            applyAttackerStatus(target, m.type);
                            // Morreu → o cliente respawna no spawn (playerDie manda pos pro
                            // outro lado do mapa). Libera 1 pos não-adjacente (anti-teleporte).
                            if (target.hp === 0){
                                target._posGraceUntil = Date.now() + 60000;
                                // Fix LOOP DE MORTE (2026-06-03): ressuscita server-side (HP/MP cheios)
                                // + (masmorra→cidade, dentro do helper). O pstats(hp=0) já saiu acima
                                // (broadcastPstatsAll(target)) → o cliente viu a morte/penalidade UMA vez;
                                // aqui o servidor ressuscita pra não ficar "morto" e re-disparar playerDie.
                                respawnPlayerServer(target, target.id);
                            }
                        }
                    }
                    if (target.ws.readyState === 1){
                        target.ws.send(JSON.stringify({ t:'mobHit', mobId:m.id, mobType:m.type, dmg:m.dmg, actual, crit:mobCrit }));
                    }
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
        const effectiveSpeed = Math.floor(((td > 1) ? m.speed * 0.6 : m.speed) * ((m.frozenUntil && now < m.frozenUntil) ? FREEZE_SLOW_MULT : 1));
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
            if (!mobTileOk(m, nx, ny)) continue;
            if (mobAt(nx, ny, m.floor)) continue;
            if (playerAt(nx, ny, m.floor)) continue;   // não entra no tile de player
            m.x = nx; m.y = ny;
            m.dir = dy > 0 ? 'down' : dy < 0 ? 'up' : dx > 0 ? 'right' : 'left';
            break;
        }
    }
}

// ─── Snapshots ──────────────────────────────────────────────────────────────
const SNAPSHOT_MS = 250;
function snapshotMobs(floor){
    const now = Date.now();
    return Array.from(monsters.values())
      .filter(m => floor === undefined || (m.floor || 0) === floor)
      .map(m => {
        const ds = (m.dots && m.dots.length) ? m.dots.map(d => ({ type:d.type })) : [];
        if (m.frozenUntil && now < m.frozenUntil) ds.push({ type:'freeze' });
        if (m.shockedUntil && now < m.shockedUntil) ds.push({ type:'shock' });
        return {
            id:m.id, type:m.type, x:m.x, y:m.y, dir:m.dir, hp:m.hp, maxHp:m.maxHp, unique:!!m.unique,
            level: m.level || 1,
            hunter: m.hunter ? 1 : undefined,
            dots: ds.length ? ds : undefined,
        };
    });
}
// Snapshot leve do estado de mobs pro skip-when-unchanged. Não inclui dots
// detalhados (só count), pra reduzir custo de comparação. Se algum dot proc
// fizer mob mudar de "tem dot" pra "não tem dot", o count diferencia.
function mobsSignature(list){
    const now = Date.now();
    let s = '';
    for (const m of list){
        const ctrl = (m.frozenUntil > now ? 'F' : '') + (m.shockedUntil > now ? 'S' : '');
        s += `${m.id}:${m.x},${m.y}:${m.hp}:${m.dir}:${(m.dots && m.dots.length) || 0}${ctrl};`;
    }
    return s;
}
// M4: broadcast de mobs POR ANDAR. Cada player só recebe os mobs do seu floor.
// skip-when-unchanged agora é por floor (Map floor→sig). Com todos em floor 0
// há 1 só grupo — comportamento idêntico ao anterior.
const _lastMobsSigByFloor = new Map();
function broadcastMobs(){
    const floorsWithPlayers = new Set();
    for (const p of players.values()) floorsWithPlayers.add(p.floor || 0);
    for (const f of floorsWithPlayers){
        const list = snapshotMobs(f);
        const sig = mobsSignature(list);
        if (_lastMobsSigByFloor.get(f) === sig) continue;
        _lastMobsSigByFloor.set(f, sig);
        const data = JSON.stringify({ t:'mobs', list });
        for (const p of players.values()){
            if ((p.floor || 0) !== f) continue;
            if (p.ws.readyState === 1) p.ws.send(data);
        }
    }
}
// Periodicamente força broadcast cheio — corrige qualquer drift de cliente
// que tenha perdido um snapshot (ex.: reconnect sem state sync). Cliente
// recebe um 'mobs' completo a cada 10s no pior caso.
function broadcastMobsFull(){
    _lastMobsSigByFloor.clear();
    broadcastMobs();
}
setInterval(safeTick('broadcastMobsFull', broadcastMobsFull), 10_000);

// ─── Guilds ────────────────────────────────────────────────────────────────
// Persiste em state.json. Estrutura: { name, leader, members:[names], createdAt }
const guilds = new Map();   // name → guild
const guildInvites = new Map();  // toName → { guildName, fromName, expiresAt }
const GUILD_MAX_MEMBERS = 30;
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
        if (myGuild){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_already') }); return; }
        const name = arg.substring(0, 16);
        if (!/^[A-Za-z0-9_-]{3,16}$/.test(name)){
            sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_bad_name') });
            return;
        }
        if (guilds.has(name)){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_exists') }); return; }
        guilds.set(name, { name, leader: p.name, members: [p.name], createdAt: Date.now() });
        sendToFn({ t:'serverMsg', level:'event', text: trp(p, 'srv.guild_created', {name}) });
        broadcastFn(null, { t:'guildUpdate', name, members:[p.name], leader: p.name });
        return;
    }
    if (sub === 'invite'){
        if (!myGuild){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.no_guild') }); return; }
        if (myGuild.leader !== p.name){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.leader_only_invite') }); return; }
        if (!arg){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_usage_invite') }); return; }
        if (!validAccountName(arg)){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_name') }); return; }
        if (myGuild.members.length >= GUILD_MAX_MEMBERS){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_full', {max: GUILD_MAX_MEMBERS}) }); return; }
        // Evict convites expirados antes de inserir (chave crua antes crescia o Map sem limite)
        const _tnow = Date.now();
        for (const [k, v] of guildInvites) if (v.expiresAt < _tnow) guildInvites.delete(k);
        guildInvites.set(arg, { guildName: myGuild.name, fromName: p.name, expiresAt: Date.now() + 60_000 });
        // Avisa o alvo se online
        for (const pp of players.values()){
            if (!pp.disconnected && pp.name.toLowerCase() === arg.toLowerCase() && pp.ws.readyState === 1){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'event', text: trp(pp, 'srv.guild_invited', {name: p.name, guild: myGuild.name}) }));
                break;
            }
        }
        sendToFn({ t:'serverMsg', level:'info', text: trp(p, 'srv.invite_sent_60', {name: arg}) });
        return;
    }
    if (sub === 'join'){
        if (myGuild){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_already') }); return; }
        const inv = guildInvites.get(p.name);
        if (!inv || inv.expiresAt < Date.now()){
            sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.no_invites') });
            return;
        }
        const g = guilds.get(inv.guildName);
        if (!g){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_gone') }); guildInvites.delete(p.name); return; }
        if (g.members.includes(p.name)){ guildInvites.delete(p.name); return; }   // dedup: já é membro
        if (g.members.length >= GUILD_MAX_MEMBERS){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_full', {max: GUILD_MAX_MEMBERS}) }); return; }
        g.members.push(p.name);
        guildInvites.delete(p.name);
        sendToFn({ t:'serverMsg', level:'event', text: trp(p, 'srv.guild_joined', {guild: g.name}) });
        // Notifica membros online
        for (const pp of players.values()){
            if (pp.ws.readyState === 1 && g.members.includes(pp.name) && pp.name !== p.name){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text: trp(pp, 'srv.guild_member_joined', {name: p.name}) }));
            }
        }
        broadcastFn(null, { t:'guildUpdate', name: g.name, members: g.members, leader: g.leader });
        return;
    }
    if (sub === 'leave'){
        if (!myGuild){ sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.no_guild') }); return; }
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
        sendToFn({ t:'serverMsg', level:'info', text: trp(p, 'srv.guild_left', {guild: myGuild.name}) });
        // Avisa restantes online
        for (const pp of players.values()){
            if (pp.ws.readyState === 1 && myGuild.members.includes(pp.name)){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text: trp(pp, 'srv.guild_member_left', {name: p.name}) }));
            }
        }
        if (guilds.has(myGuild.name)){
            broadcastFn(null, { t:'guildUpdate', name: myGuild.name, members: myGuild.members, leader: myGuild.leader });
        }
        return;
    }
    if (sub === 'info' || sub === ''){
        if (!myGuild){ sendToFn({ t:'serverMsg', level:'info', text: trp(p, 'srv.guild_none_help') }); return; }
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
        if (!guilds.size){ sendToFn({ t:'serverMsg', level:'info', text: trp(p, 'srv.guild_none_yet') }); return; }
        const lines = Array.from(guilds.values()).map(g => `${g.name} (${g.members.length})`);
        sendToFn({ t:'serverMsg', level:'info', text: trp(p, 'srv.guild_list', {list: lines.join(', ')}) });
        return;
    }
    sendToFn({ t:'serverMsg', level:'warn', text: trp(p, 'srv.guild_subcmds') });
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
    ESPADA_ACO:'Espada', LAMINA_DRACO_1H:'Espada', ESPADA_GUARDIAO:'Espada',
    // Distância (arcos + lanças arremessáveis)
    ARCO:'Distância', ARCO_CACA:'Distância', BESTA:'Distância',
    LANCA:'Distância', LANCA_LONGA:'Distância',
    // Clava
    BORDAO:'Clava', CLAVA:'Clava', MACA:'Clava', MACA_GIGANTE:'Clava',
    MARRETA:'Clava', MARTELO:'Clava', MARTELO_GOLEM:'Clava', PORRETE:'Clava',
    // Machado
    MACHADO:'Machado', MACHADO_MINO:'Machado',
    // Magia (wands/cajados — ataque mágico à distância, sem munição)
    VARINHA_APRENDIZ:'Magia', CAJADO_FOGO:'Magia', CAJADO_GELO:'Magia', CAJADO_RAIO:'Magia',
    CAJADO_RUNICO:'Magia', CAJADO_ETERNO:'Magia',
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
// Talents passivos que aplicam permaBuffs. MULTI-RANK (Fase 1): cada talento pode ser
// comprado até `max` vezes e o buff SOMA por rank. 1 ponto a cada 10 levels totais.
// Server é autoritativo: handler talentAlloc valida pontos + rank + aplica permaBuff.
// (crit/dodge ainda respeitam o teto de segurança 50% no cálculo do stat.)
const TALENT_DEFS = {
    t_crit:  { name:'Olho de Águia',         desc:'+5% chance crítica',         buff:{ critBonus:  0.05 }, max:5 },
    t_dodge: { name:'Reflexos Felinos',      desc:'+5% chance de esquiva',      buff:{ dodgeBonus: 0.05 }, max:5 },
    t_hp:    { name:'Constituição',          desc:'+30 HP máximo',              buff:{ hpBonus:    30   }, max:5 },
    t_xp:    { name:'Aprendizado Acelerado', desc:'+10% XP em todas as skills', buff:{ xpBonus:    0.10 }, max:5 },
    t_regen: { name:'Recuperação Rápida',    desc:'+1 HP/MP por tick de regen', buff:{ regenBonus: 1    }, max:5 },
    t_loot:  { name:'Caçador de Tesouros',   desc:'+15% gold de drops de mob',  buff:{ lootBonus:  0.15 }, max:5 },
    // Fase 2 — endgame (QoL + Poder). Multi-rank max 5, sem gating. Buffs server-autoritativos,
    // capados no sanitize (allowlist = max_rank × buff). crit/dodge/dano seguem tetos no cálculo.
    t_mana:     { name:'Pacto Arcano',     desc:'+20 mana máxima',             buff:{ manaBonus:      20   }, max:5 },
    t_speed:    { name:'Passos Leves',     desc:'+4% velocidade de movimento', buff:{ moveSpeedBonus: 0.04 }, max:5 },
    t_luck:     { name:'Sortudo',          desc:'+10% chance de drop de itens',buff:{ rareLuck:       0.10 }, max:5 },
    t_power:    { name:'Golpe Pesado',     desc:'+4% dano corpo a corpo',      buff:{ damageBonus:    0.04 }, max:5 },
    t_critdmg:  { name:'Precisão Mortal',  desc:'crítico +10% mais forte',     buff:{ critDmgBonus:   0.10 }, max:5 },
    t_lifesteal:{ name:'Vampirismo',       desc:'cura 3% do dano causado',     buff:{ lifesteal:      0.03 }, max:5 },
    t_armor:    { name:'Pele de Pedra',    desc:'+3% redução de dano',         buff:{ dmgReduction:   0.03 }, max:5 },
    t_atkspeed: { name:'Mãos Rápidas',     desc:'+3% velocidade de ataque',    buff:{ atkSpdBonus:    0.03 }, max:5 },
    // Fase 2b — 🕯️ Segunda Chance: revive 1× ao morrer (SÓ PvE), +20% HP por rank, cooldown 30min.
    // buff:{} de propósito — o efeito é gated pelo RANK (p.talents.t_secondchance), NÃO por permaBuffs;
    // o loop do talentAlloc sobre def.buff vira no-op (não suja permaBuffs nem a allowlist do sanitize).
    // Server-autoritativo: intercepta a morte em tickAI/tickPlayerDots via trySecondChance (abaixo).
    t_secondchance: { name:'Segunda Chance', desc:'Revive 1× ao morrer (+20% HP/rank, recarga 30min)', buff:{}, max:5 },
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
        // multi-rank: soma os ranks. Legado boolean `true` → Number(true)=1 (rank 1).
        if (TALENT_DEFS[id]) n += Math.max(0, Math.floor(Number(p.talents[id]) || 0));
    }
    return n;
}
function talentPointsAvailable(p){ return Math.max(0, talentPointsEarned(p) - talentPointsUsed(p)); }

// ─── Segunda Chance (Fase 2b) — revive server-autoritativo ───────────────────
// Quando o player MORRERIA por PvE (mob/veneno), se tem o talento e está fora de
// cooldown: seta hp = rank×20% do maxHp em vez de 0, marca cooldown (timestamp
// absoluto que persiste no save, padrão dailyClaim) e dá 2s de imunidade. Os
// caminhos de morte (tickAI/tickPlayerDots) chamam trySecondChance ANTES de matar.
// PvP (pvpAttack/processPkDeathServerSide) NÃO usa isto — decisão "só PvE".
const SECOND_CHANCE_CD_MS     = 30 * 60 * 1000;   // 30min de cooldown
const SECOND_CHANCE_INVULN_MS = 2000;             // 2s sem tomar dano pós-revive
function secondChanceReady(p){
    const rank = Math.floor(Number(p.talents && p.talents.t_secondchance) || 0);
    return rank >= 1 && !((p.scReadyAt || 0) > Date.now());
}
function trySecondChance(p){            // true = reviveu (o caller PULA a morte)
    if (!secondChanceReady(p)) return false;
    const rank = Math.floor(Number(p.talents.t_secondchance) || 0);
    p.hp = Math.max(1, Math.ceil((p.maxHp || 100) * Math.min(100, rank * 20) / 100));   // %HP por rank em INTEIRO (evita drift de float: 3*0.20=0.6000…1 → daria 301 em vez de 300)
    p.scReadyAt    = Date.now() + SECOND_CHANCE_CD_MS;   // seta JÁ → anti-duplo-proc no mesmo tick (AoE/enxame)
    p._invulnUntil = Date.now() + SECOND_CHANCE_INVULN_MS;
    if (p.ws && p.ws.readyState === 1){
        try { p.ws.send(JSON.stringify({ t:'secondChance', hp:p.hp, readyAt:p.scReadyAt, rank })); } catch {}
    }
    broadcastPstatsAll(p);   // outros (mesmo andar) veem o hp revivido
    return true;
}

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
                    flushAccounts();
                }
            } catch(e){ console.warn('[season] erro ao creditar offline:', e.message); }
        }
        broadcastMsgKey('event', 'srv.season_end', {id: closedId, champion});
    } else {
        broadcastMsgKey('info', 'srv.season_end_nochamp', {id: closedId});
    }
    // Reset
    seasonState.id = newId;
    seasonState.ranking = new Map();
    // Persist imediato pra não perder em crash
    saveStateToDisk();
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
            aggro:m.aggro, unique:m.unique, level:m.level, floor:m.floor||0,
        })),
        nextAuctionId,
        auctions: Array.from(auctions.values()),
    };
    try {
        // Escrita ATÔMICA (audit 2026-06-03): tmp + rename, como o accounts.json. Antes era
        // writeFileSync direto → crash/OOM/disco-cheio no meio corrompia o state.json e o boot
        // caía em spawnInitial(), descartando TODOS os auctions (itens em escrow somem pra sempre).
        const _tmp = STATE_FILE + '.tmp';
        fs.writeFileSync(_tmp, JSON.stringify(snap), 'utf8');
        fs.renameSync(_tmp, STATE_FILE);
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
        // M8 Auction House
        if (typeof d.nextAuctionId === 'number') nextAuctionId = d.nextAuctionId;
        if (Array.isArray(d.auctions)){
            auctions.clear();
            for (const a of d.auctions){
                if (!a || typeof a.id !== 'number' || !a.sellerName || !a.itemKey) continue;
                auctions.set(a.id, {
                    id: a.id,
                    sellerName: String(a.sellerName).slice(0, 32),
                    itemKey: String(a.itemKey).slice(0, 40),
                    qty: Math.max(1, a.qty | 0),
                    price: Math.max(1, a.price | 0),
                    listedAt: a.listedAt | 0,
                    expiresAt: a.expiresAt | 0,
                });
            }
        }
        monsters.clear();
        let _stuckInWater = 0;
        if (Array.isArray(d.monsters)){
            for (const m of d.monsters){
                // Saneamento: descarta mob comum do overworld preso em tile não-walkable
                // (ex: lago) — respawna limpo pelo ciclo normal. Uniques/masmorra preservados.
                if (!m.unique && (m.floor||0) === 0 && !isWalkable(m.x, m.y)){ _stuckInWater++; continue; }
                monsters.set(m.id, {
                    id:m.id, type:m.type, x:m.x, y:m.y, dir:m.dir||'down',
                    hp:m.hp, maxHp:m.maxHp, dmg:m.dmg, speed:m.speed, xp:m.xp,
                    aggro:m.aggro, unique:!!m.unique, level:m.level||1, floor:m.floor||0,
                    intel: m.intel || (MTYPE[m.type]?.intel || 1),  // backfill saves antigos
                    lastMoveAt: 0, lastAttackAt: 0,
                });
            }
        }
        const ageMs = Date.now() - (d.savedAt || 0);
        console.log(`[state] carregado de disco — ${monsters.size} mobs${_stuckInWater?`, ${_stuckInWater} presos em água descartados`:''}, salvo há ${(ageMs/60000).toFixed(1)}min`);
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
// Allowlist de flags persistentes — qualquer key fora dessa lista é deletada
// no sanitizeSave. Adicionar nova flag aqui ao adicionar quest/feature que use.
// Atualizar QUEST_CHAINS reward.flag e play.html ao mesmo tempo.
const FLAGS_ALLOWLIST = new Set([
    'flag_vendedor_revealed', 'flag_vendedor_killed',
    'flag_vohrim_traitor',    'flag_vohrim_exposed',
    'firstPartyShare',        'everHighlander',
]);
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
    // permaBuffs — allowlist estrita. Antes: cliente podia forjar qualquer
    // key (ex.: `permaBuffs.damageMultiplier=10`) e ela viraria buff persistente
    // se algum sistema futuro lesse essa key. Agora rejeitamos keys fora do
    // TALENT_DEFS + cap por key alinhado ao talent. Talents são single-rank,
    // então cap = valor do buff. xpBonus mantém SAVE_CAPS.xpBonus (2.0) como
    // margem pra futuros talents/eventos. Keys desconhecidas: deletadas.
    if (data.permaBuffs && typeof data.permaBuffs === 'object'){
        // Constrói tabela de allowlist a partir de TALENT_DEFS. Multi-rank: cap = max
        // rank × valor do buff (somado, caso 2 talentos futuros compartilhem a key).
        const allowed = {};
        for (const def of Object.values(TALENT_DEFS)){
            if (!def.buff) continue;
            const ranks = def.max || 1;
            for (const [bk, bv] of Object.entries(def.buff)){
                allowed[bk] = (allowed[bk] || 0) + bv * ranks;
            }
        }
        // auras de quest somam POR CIMA do talento (Aura do Vidente +5% esquiva; Vendedor +5% xp)
        allowed.dodgeBonus = (allowed.dodgeBonus || 0) + 0.05;
        allowed.xpBonus = Math.max((allowed.xpBonus || 0) + 0.05, SAVE_CAPS.xpBonus);   // margem pra eventos futuros
        for (const k of Object.keys(data.permaBuffs)){
            if (!(k in allowed)){
                log(`permaBuffs.${k}`, data.permaBuffs[k], '(deletado: key não-allowlisted)');
                delete data.permaBuffs[k];
                continue;
            }
            const orig = data.permaBuffs[k];
            if (typeof orig !== 'number'){
                log(`permaBuffs.${k}`, orig, '(deletado: não-número)');
                delete data.permaBuffs[k];
                continue;
            }
            const v = clampNumber(orig, allowed[k], 0);
            if (v !== orig){ log(`permaBuffs.${k}`, orig, v); data.permaBuffs[k] = v; }
        }
    }
    // talents — multi-rank: clampa cada um a [0, max] inteiro; remove keys desconhecidas
    // (o buff em si já é capado em permaBuffs acima; isto mantém o contador de pontos honesto).
    if (data.talents && typeof data.talents === 'object'){
        for (const k of Object.keys(data.talents)){
            if (!TALENT_DEFS[k]){ log(`talents.${k}`, data.talents[k], '(deletado: id desconhecido)'); delete data.talents[k]; continue; }
            const max = TALENT_DEFS[k].max || 1;
            const v = Math.max(0, Math.min(max, Math.floor(Number(data.talents[k]) || 0)));   // legado boolean true → 1
            if (v === 0){ delete data.talents[k]; }
            else if (v !== data.talents[k]){ log(`talents.${k}`, data.talents[k], v); data.talents[k] = v; }
        }
    }
    // 🕯️ Segunda Chance: cooldown é timestamp absoluto — aceita só número ≥ 0 (defesa p/ backup de restore).
    if ('scReadyAt' in data){
        const v = Number(data.scReadyAt);
        if (!isFinite(v) || v < 0){ delete data.scReadyAt; }
        else if (v !== data.scReadyAt){ data.scReadyAt = Math.floor(v); }
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
    // Quests — só cap de quantidade de keys (quests são objetos complexos
    // validados em handlers separados, não dá pra allowlistar facilmente).
    if (data.quests && typeof data.quests === 'object'){
        const keys = Object.keys(data.quests);
        if (keys.length > SAVE_CAPS.questsKeys){
            log('quests keys', keys.length, SAVE_CAPS.questsKeys);
            for (const k of keys.slice(SAVE_CAPS.questsKeys)) delete data.quests[k];
        }
    }
    // flags — allowlist estrita. Antes: cliente podia forjar
    // flags.everHighlander, flags.flag_vohrim_exposed (qualquer flag) → ganhar
    // recompensas/cosméticos sem completar quest. Agora keys fora da lista
    // são deletadas. Valores não-boolean também (apenas true|false aceitos).
    if (data.flags && typeof data.flags === 'object'){
        for (const k of Object.keys(data.flags)){
            if (!FLAGS_ALLOWLIST.has(k)){
                log(`flags.${k}`, data.flags[k], '(deletado: key fora da allowlist)');
                delete data.flags[k];
                continue;
            }
            if (data.flags[k] !== true && data.flags[k] !== false){
                log(`flags.${k}`, data.flags[k], '(coerced para boolean)');
                data.flags[k] = !!data.flags[k];
            }
        }
    }
    // questFlags — allowlist por chainId (keys = chainId de QUEST_CHAINS).
    // Dentro de cada chain: progress por stageId. Valida que stageId existe
    // na chain antes de aceitar.
    if (data.questFlags && typeof data.questFlags === 'object'){
        for (const chainId of Object.keys(data.questFlags)){
            const chain = QUEST_CHAINS[chainId];
            if (!chain){
                log(`questFlags.${chainId}`, '(deletado: chain desconhecida)', null);
                delete data.questFlags[chainId];
                continue;
            }
            const progress = data.questFlags[chainId];
            if (!progress || typeof progress !== 'object'){
                delete data.questFlags[chainId];
                continue;
            }
            // Allowlist POR STAGE: o id puro (= stage completo) + as flags de progresso
            // (_started/_visited = bool; _kills = número clampado em stage.count). ANTES o
            // validStages só tinha os ids puros → o sanitize DELETAVA _started/_kills/_visited
            // a cada save → o player perdia o progresso da chain ("tinha que pegar a quest de
            // novo"). O turn-in valida tudo server-side e nunca confiou nessas flags. #2
            const stageById = new Map(chain.stages.map(s => [s.id, s]));
            for (const key of Object.keys(progress)){
                const baseId = key.replace(/_(started|kills|visited)$/, '');
                const st = stageById.get(baseId);
                if (!st){
                    log(`questFlags.${chainId}.${key}`, progress[key], '(deletado: stage desconhecido)');
                    delete progress[key];
                    continue;
                }
                if (key.endsWith('_kills')){
                    const n = Math.floor(Number(progress[key]));
                    progress[key] = isFinite(n) ? Math.max(0, Math.min(st.count || 9999, n)) : 0;
                } else if (progress[key] !== true && progress[key] !== false){
                    progress[key] = !!progress[key];
                }
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

// Hash de senha. Contas novas/migradas usam scrypt (deliberadamente lento) com salt
// ALEATÓRIO POR CONTA, no formato `scrypt$<saltHex>$<hashHex>`. O sha256 legado (salt
// global ACCOUNTS_SALT) só verifica contas antigas pra migrá-las no login. scrypt NÃO
// depende de ACCOUNTS_SALT → mudar a env não quebra contas já migradas (só travaria
// as legadas ainda não migradas — por isso ACCOUNTS_SALT deve permanecer estável).
// scryptSync bloqueia ~15ms, mas só roda em login/registro/reset (eventos raros).
const SCRYPT_KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
function hashPwLegacy(clientHash){
    return crypto.createHash('sha256').update(ACCOUNTS_SALT + ':' + String(clientHash || '')).digest('hex');
}
function hashPwScrypt(clientHash){
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(clientHash || ''), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString('hex');
    return `scrypt$${salt}$${derived}`;
}
// Verifica em tempo constante. Detecta o formato: scrypt$… (novo) vs hex 64 (sha256 legado).
function verifyPwHash(stored, clientHash){
    if (typeof stored !== 'string' || !stored) return false;
    if (stored.startsWith('scrypt$')){
        const parts = stored.split('$');   // ['scrypt', saltHex, hashHex]
        if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
        const calc = crypto.scryptSync(String(clientHash || ''), parts[1], SCRYPT_KEYLEN, SCRYPT_PARAMS).toString('hex');
        const a = Buffer.from(calc, 'hex'), b = Buffer.from(parts[2], 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    const calc = hashPwLegacy(clientHash);
    const a = Buffer.from(calc, 'hex'), b = Buffer.from(stored, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// ── Variantes ASSÍNCRONAS do scrypt (audit 2026-06-03 — anti-DoS de event-loop) ──
// crypto.scrypt (async) deriva fora do event loop, ao contrário do scryptSync que bloqueia
// ~15ms cada. Usadas SÓ no hot path de auth (createAccount/verifyAccount). Paths raros
// (reset HTTP, rehash legado→scrypt) seguem síncronos — rodam 1× por conta, custo irrelevante.
function scryptAsync(clientHash, salt){
    return new Promise((resolve, reject) => {
        crypto.scrypt(String(clientHash || ''), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (err, dk) => {
            if (err) reject(err); else resolve(dk.toString('hex'));
        });
    });
}
async function hashPwScryptAsync(clientHash){
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(clientHash, salt);
    return `scrypt$${salt}$${derived}`;
}
async function verifyPwHashAsync(stored, clientHash){
    if (typeof stored !== 'string' || !stored) return false;
    if (stored.startsWith('scrypt$')){
        const parts = stored.split('$');   // ['scrypt', saltHex, hashHex]
        if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
        const calc = await scryptAsync(clientHash, parts[1]);
        const a = Buffer.from(calc, 'hex'), b = Buffer.from(parts[2], 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    const calc = hashPwLegacy(clientHash);   // sha256 legado é barato/síncrono
    const a = Buffer.from(calc, 'hex'), b = Buffer.from(stored, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function validAccountName(n){
    return typeof n === 'string' && n.length >= 1 && n.length <= 14 && /^[A-Za-z0-9_\- ]+$/.test(n);
}
// Detecta save "vazio-default": skills base 10, sem inv/gold/equip/baú. Espelha o
// isEmptyDefaultSave do cliente. Usado pela TRAVA ANTI-WIPE no saveUpload — uma sessão
// fantasma (p.* vazio) gravava por cima do save cheio e zerava a conta no reconnect.
function isEmptyDefaultSaveServer(d){
    if (!d || typeof d !== 'object') return true;
    const skills = (d.skills && typeof d.skills === 'object') ? d.skills : {};
    const skillsTen = Object.values(skills).every(s => !s || s.val === 10 || s.val == null);
    const noInv    = !d.inv || Object.keys(d.inv).length === 0;
    const noGold   = !d.gold;
    const noEquip  = !d.equipped || Object.values(d.equipped).every(v => !v);
    const noChests = !d.chests || Object.values(d.chests).every(c => !c || Object.keys(c).length === 0);
    return skillsTen && noInv && noGold && noEquip && noChests;
}
function getAccount(name){ return accounts.get(String(name || '').toLowerCase()); }
async function createAccount(name, clientHash, email){
    const pwHash = await hashPwScryptAsync(clientHash);   // async: não bloqueia o event loop
    const a = {
        name, pwHash,
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
// Verifica a conta aceitando DOIS formatos de transporte do cliente (dual-format):
//   clientHash       = SHA-256 forte (cliente novo) — ou djb2, se for cliente ANTIGO
//   clientHashLegacy = djb2 fraco (o cliente novo manda como fallback de migração)
// O stored do server é sempre scrypt(clientHash). Migração transparente: conta cujo
// stored foi derivado do djb2 valida pelo legado e é RE-DERIVADA a partir do SHA-256
// forte no 1º login com o cliente novo. Cliente ANTIGO (sem clientHashLegacy) segue
// funcionando: o djb2 vem em clientHash e casa direto (+ rehash sha256-legado→scrypt).
async function verifyAccount(name, clientHash, clientHashLegacy){
    const a = getAccount(name);
    if (!a) return false;
    // 1) Transporte atual (SHA-256 do cliente novo, OU djb2 do cliente antigo)
    if (await verifyPwHashAsync(a.pwHash, clientHash)){
        if (!String(a.pwHash || '').startsWith('scrypt$')){
            a.pwHash = hashPwScrypt(clientHash);   // rehash sha256-legado→scrypt (1× por conta)
            queueSaveAccounts();
        }
        return true;
    }
    // 2) Fallback djb2: conta ainda não migrada pro transporte forte → migra AGORA
    if (clientHashLegacy && await verifyPwHashAsync(a.pwHash, clientHashLegacy)){
        a.pwHash = hashPwScrypt(clientHash);       // re-deriva o stored a partir do SHA-256 forte
        queueSaveAccounts();
        console.log(`[auth] ${name}: transporte de senha migrado djb2→SHA-256`);
        return true;
    }
    return false;
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
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text: trp(pp, 'srv.admin_reset_pos') }));
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
                    pp.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text: trp(pp, 'srv.account_removed') }));
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
// ─── Persistência robusta do accounts.json (rede de segurança — incidente 30/05) ───
// Antes: writeFileSync direto (crash no meio = arquivo corrompido), ZERO backup, e load
// sem fallback (arquivo corrompido no boot = TODAS as contas viram novas = wipe geral).
// Agora: escrita ATÔMICA (tmp+rename), BACKUPS rotativos com timestamp, load com FALLBACK
// pro backup mais recente, e trava contra gravar vazio por cima de cheio.
const ACCOUNTS_BACKUP_DIR = path.join(path.dirname(ACCOUNTS_FILE), 'accounts_backups');
const ACCOUNTS_BACKUP_KEEP = 24;
const ACCOUNTS_BACKUP_INTERVAL_MS = 10 * 60 * 1000;   // no máx 1 backup a cada 10min
let _lastAccountsBackupAt = 0;

// Contagem de contas no arquivo de disco: >0 ok, 0 vazio, -1 ausente/corrompido.
function _diskAccountsCount(){
    try {
        if (!fs.existsSync(ACCOUNTS_FILE)) return -1;
        const d = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
        return (d && Array.isArray(d.accounts)) ? d.accounts.length : -1;
    } catch { return -1; }
}
// Snapshot do accounts.json ATUAL (se válido e não-vazio) num backup com timestamp.
function backupAccountsFile(){
    try {
        if (!fs.existsSync(ACCOUNTS_FILE)) return;
        const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
        const parsed = JSON.parse(raw);   // throws se corrompido → não backupa lixo
        if (!parsed || !Array.isArray(parsed.accounts) || parsed.accounts.length === 0) return;
        if (!fs.existsSync(ACCOUNTS_BACKUP_DIR)) fs.mkdirSync(ACCOUNTS_BACKUP_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(ACCOUNTS_BACKUP_DIR, `accounts-${stamp}.json`), raw, 'utf8');
        const files = fs.readdirSync(ACCOUNTS_BACKUP_DIR).filter(f => f.startsWith('accounts-') && f.endsWith('.json')).sort();
        while (files.length > ACCOUNTS_BACKUP_KEEP){ try { fs.unlinkSync(path.join(ACCOUNTS_BACKUP_DIR, files.shift())); } catch {} }
    } catch(e){ console.warn('[accounts] backup falhou (segue):', e.message); }
}
function flushAccounts(){
    try {
        const out = { v:1, savedAt: Date.now(), accounts: Array.from(accounts.values()) };
        // Trava: nunca grava 0 contas sobre um arquivo que TINHA contas (anti-wipe de arquivo).
        if (out.accounts.length === 0 && _diskAccountsCount() > 0){
            console.warn('[accounts] BLOQUEADO flush de 0 contas sobre arquivo populado');
            return;
        }
        // Backup rotativo do estado ATUAL antes de sobrescrever (no máx 1/10min).
        const now = Date.now();
        if (now - _lastAccountsBackupAt > ACCOUNTS_BACKUP_INTERVAL_MS){ backupAccountsFile(); _lastAccountsBackupAt = now; }
        // Escrita ATÔMICA: grava no .tmp e renomeia (rename atômico — crash no meio não
        // corrompe o arquivo bom; o pior caso é perder a última gravação, não tudo).
        const tmp = ACCOUNTS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(out), 'utf8');
        fs.renameSync(tmp, ACCOUNTS_FILE);
    } catch(e){ console.error('[accounts] erro ao salvar:', e.message); }
}
function queueSaveAccounts(){
    if (_accountsSaveTimer) return;
    _accountsSaveTimer = setTimeout(() => { _accountsSaveTimer = null; flushAccounts(); }, 2000);
}
function loadAccountsFromDisk(){
    const tryLoad = (file) => {
        if (!fs.existsSync(file)) return null;
        const d = JSON.parse(fs.readFileSync(file, 'utf8'));   // throws se corrompido
        if (!d || d.v !== 1 || !Array.isArray(d.accounts)) return null;
        return d.accounts;
    };
    let list = null, src = 'principal';
    try { list = tryLoad(ACCOUNTS_FILE); }
    catch(e){ console.error('[accounts] arquivo PRINCIPAL corrompido:', e.message); }
    // Fallback: principal ausente/corrompido/vazio → backup válido mais recente.
    if (!list || list.length === 0){
        try {
            if (fs.existsSync(ACCOUNTS_BACKUP_DIR)){
                const files = fs.readdirSync(ACCOUNTS_BACKUP_DIR).filter(f => f.startsWith('accounts-') && f.endsWith('.json')).sort().reverse();
                for (const f of files){
                    try { const l = tryLoad(path.join(ACCOUNTS_BACKUP_DIR, f)); if (l && l.length){ list = l; src = 'backup ' + f; console.warn(`[accounts] ⚠ RECUPERADO do ${src} (${l.length} contas)`); break; } } catch {}
                }
            }
        } catch {}
    }
    if (!list){ console.log('[accounts] nenhuma conta pra carregar (arquivo novo?)'); return; }
    for (const a of list){
        if (!a || !a.name || !a.pwHash) continue;
        accounts.set(a.name.toLowerCase(), a);
        if (a.email && typeof a.email === 'string') emailToAccount.set(a.email.toLowerCase(), a.name.toLowerCase());
    }
    console.log(`[accounts] ${accounts.size} contas carregadas (fonte: ${src}, ${emailToAccount.size} com email)`);
}
loadAccountsFromDisk();

// ─── Observabilidade: errors ring + counters ──────────────────────────────
// Anel circular dos últimos N erros (FIFO). Persiste no Volume pra sobreviver
// a restart. Inclui: erros JS do cliente, [ws:close] do server, warnings de
// sanitizeSave, bug reports do botão in-game (futuro).
const ERRORS_FILE = (process.env.STATE_FILE_PATH
    ? path.join(path.dirname(process.env.STATE_FILE_PATH), 'errors.json')
    : path.join(__dirname, 'errors.json'));
const ERRORS_CAP = 200;
const errors = [];   // { ts, kind, player, msg, stack?, meta? }

// ─── Version gate ─────────────────────────────────────────────────────────
// Cliente Electron desatualizado é bloqueado no auth (auto-update do
// electron-updater nem sempre dispara — força user a baixar manualmente).
// Browser nunca é bloqueado (Vercel serve sempre a última build).
// Override via env var MIN_CLIENT_VERSION sem precisar redeploy do código.
const MIN_CLIENT_VERSION = process.env.MIN_CLIENT_VERSION || '1.0.7';
const CLIENT_DOWNLOAD_URL = process.env.CLIENT_DOWNLOAD_URL || 'https://valadares.app.br/#download';
function parseSemver(s){
    const m = String(s || '').match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
}
function isVersionTooOld(clientVer, minVer){
    const c = parseSemver(clientVer);
    const m = parseSemver(minVer);
    if (!c || !m) return false; // não consegue parsear: passa (fail-open)
    for (let i = 0; i < 3; i++){
        if (c[i] < m[i]) return true;
        if (c[i] > m[i]) return false;
    }
    return false; // exatamente igual = OK
}
const counters = {
    connections_total: 0,
    ws_closes: {},   // { '1006': N, '1001': N, ... }
    started_at: Date.now(),
};
let _errorsSaveTimer = null;
function recordError(entry){
    const safe = {
        ts: Date.now(),
        kind: String(entry.kind || 'unknown').slice(0, 32),
        player: entry.player ? String(entry.player).slice(0, 32) : null,
        msg: entry.msg ? String(entry.msg).slice(0, 500) : '',
        stack: entry.stack ? String(entry.stack).slice(0, 2000) : null,
        meta: entry.meta || null,
    };
    errors.push(safe);
    if (errors.length > ERRORS_CAP) errors.splice(0, errors.length - ERRORS_CAP);
    if (_errorsSaveTimer) return;
    _errorsSaveTimer = setTimeout(() => {
        _errorsSaveTimer = null;
        try { fs.writeFileSync(ERRORS_FILE, JSON.stringify({ v:1, errors }), 'utf8'); }
        catch(e){ console.error('[errors] erro ao salvar:', e.message); }
    }, 3000);
}
function loadErrorsFromDisk(){
    if (!fs.existsSync(ERRORS_FILE)) return;
    try {
        const d = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf8'));
        if (d && Array.isArray(d.errors)) errors.push(...d.errors.slice(-ERRORS_CAP));
        console.log(`[errors] ${errors.length} entradas carregadas de disco`);
    } catch(e){ console.error('[errors] erro ao carregar:', e.message); }
}
loadErrorsFromDisk();
function errorsRecent5min(){
    const cutoff = Date.now() - 5*60*1000;
    return errors.filter(e => e.ts > cutoff).length;
}

// Guardas globais: throw num tick (equipped=null em save legado, race condition,
// undefined dereference) derrubava o processo inteiro — 50 players caem juntos.
// uncaughtException/unhandledRejection: registra + segue. safeTick: wrapper que
// envolve cada tick em try/catch.
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err && err.stack || err);
    try { recordError({ kind:'uncaughtException', msg: err && err.message || String(err), stack: err && err.stack || null }); } catch {}
});
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    try { recordError({ kind:'unhandledRejection', msg: (reason && reason.message) || String(reason), stack: (reason && reason.stack) || null }); } catch {}
});
function safeTick(name, fn){
    return () => {
        try { fn(); }
        catch (err) {
            console.error(`[tick:${name}]`, err && err.stack || err);
            try { recordError({ kind:'tick:'+name, msg: err && err.message || String(err), stack: err && err.stack || null }); } catch {}
        }
    };
}

// Inicia mundo
let lastResetDay = new Date().toDateString();
if (!loadStateFromDisk()) spawnInitial();
setInterval(safeTick('saveStateToDisk', saveStateToDisk), STATE_SAVE_INTERVAL_MS);
setInterval(safeTick('tickAuctionExpire', tickAuctionExpire), 60 * 1000);   // M8: devolve listings expiradas
process.on('SIGINT',  () => { saveStateToDisk(); flushAccounts(); console.log('[state] salvo ao sair (SIGINT)'); process.exit(0); });
process.on('SIGTERM', () => { saveStateToDisk(); flushAccounts(); console.log('[state] salvo ao sair (SIGTERM)'); process.exit(0); });
setInterval(safeTick('tickAI', tickAI), TICK_AI_MS);
setInterval(safeTick('broadcastMobs', broadcastMobs), SNAPSHOT_MS);
setInterval(safeTick('tickRespawns', tickRespawns), 1000);
setInterval(safeTick('spawnDungeonMobs', spawnDungeonMobs), 8000);   // M4: repõe mobs do andar
spawnDungeonMobs();   // popula o andar 1 no boot
setInterval(safeTick('tickPartyHp', tickPartyHp), 3000);   // HP da party no widget

// ─── Bot 007 — caça ao impostor ────────────────────────────────────────
// Player virtual no Map de players. Anda random, ataca players adjacentes,
// HP alto pra exercitar combate. Recompensa pra quem matar: 5k gold +
// Bênção da Fênix temporária (24h). Spawn a cada 1h.
const BOT_NAME = '007';
const BOT_HP_MAX = 12000;
const BOT_DAMAGE = 90;
const BOT_DEFENSE = 60;
const BOT_DURATION_MS = 5 * 60 * 1000;
const BOT_SPAWN_INTERVAL_MS = 60 * 60 * 1000;
const BOT_REWARD_GOLD = 5000;
const BOT_BENCAO_TTL_MS = 24 * 3600 * 1000;
const BOT_NULL_WS = { readyState: 3, send: () => {} };
let impostorBot = null;

function spawnImpostorBot(){
    if (impostorBot) return;
    let x, y, tries = 0;
    do {
        x = 8 + Math.floor(Math.random() * (M_W - 16));
        y = 8 + Math.floor(Math.random() * (M_H - 16));
        tries++;
    } while ((inSafe(x, y) || !isWalkable(x, y)) && tries < 200);
    if (tries >= 200){ console.warn('[007] não achou pos walkable'); return; }
    const id = nextId++;
    impostorBot = {
        id, name: BOT_NAME,
        x, y, dir:'down',
        hp: BOT_HP_MAX, maxHp: BOT_HP_MAX, mp:0, maxMp:0,
        gold:0, inv:{}, equipped:{ weapon:'SABRE', armor:'ARMADURA', cape:null }, chests:{},
        cosmetic:null, badges:['007'], skills:{}, talents:{}, permaBuffs:{},
        ws: BOT_NULL_WS,
        _isBot: true,
        pvp: true,
        spawnedAt: Date.now(),
        _lastMoveAt: 0, _lastAttackAt: 0,
        connectedAt: Date.now(),
    };
    players.set(id, impostorBot);
    counters.connections_total++;
    broadcast(null, { t:'join', player: {
        id, name: BOT_NAME, x, y, dir:'down', pvp:true,
        hp: BOT_HP_MAX, maxHp: BOT_HP_MAX,
        equipped: impostorBot.equipped, cosmetic:null, badges:['007'],
        guild: null,
    }});
    broadcastMsg('event', `⚡ O Agente 007 surgiu em Valadares (${x},${y})! Recompensa: ${BOT_REWARD_GOLD}g + Bênção da Fênix (24h) pra quem derrotar!`);
    recordError({ kind:'bot_spawn', player: BOT_NAME, msg:`spawn em (${x},${y})`, meta:{ id, hp: BOT_HP_MAX } });
    console.log(`[007] spawn id=${id} em (${x},${y})`);
}

function tickImpostorBot(){
    if (!impostorBot) return;
    if (impostorBot.hp <= 0){ despawnImpostorBot('killed'); return; }
    const now = Date.now();
    if (now - impostorBot.spawnedAt > BOT_DURATION_MS){ despawnImpostorBot('timeout'); return; }
    // Persegue player mais próximo se algum tiver em raio 8; senão move random
    let target = null, bestD = 999;
    for (const pp of players.values()){
        if (pp._isBot || pp.disconnected || (pp.hp ?? 100) <= 0) continue;
        const d = chebyshev(pp.x, pp.y, impostorBot.x, impostorBot.y);
        if (d < bestD){ bestD = d; target = pp; }
    }
    if (now - impostorBot._lastMoveAt > 700){
        impostorBot._lastMoveAt = now;
        let dx = 0, dy = 0;
        if (target && bestD <= 12 && bestD > 1){
            dx = Math.sign(target.x - impostorBot.x);
            dy = Math.sign(target.y - impostorBot.y);
            if (dx !== 0 && dy !== 0){ if (Math.random() < 0.5) dx = 0; else dy = 0; }
        } else {
            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            [dx, dy] = dirs[Math.floor(Math.random()*4)];
        }
        const nx = impostorBot.x + dx, ny = impostorBot.y + dy;
        if ((dx || dy) && isWalkable(nx, ny) && !inSafe(nx, ny)){
            // Não pisa em cima de outro player
            let blocked = false;
            for (const pp of players.values()){
                if (pp.id === impostorBot.id) continue;
                if (pp.x === nx && pp.y === ny){ blocked = true; break; }
            }
            if (!blocked){
                impostorBot.x = nx; impostorBot.y = ny;
                if (dy < 0) impostorBot.dir = 'up';
                else if (dy > 0) impostorBot.dir = 'down';
                else if (dx < 0) impostorBot.dir = 'left';
                else impostorBot.dir = 'right';
            }
        }
    }
    // Atacar player adjacente
    if (target && bestD <= 1 && now - impostorBot._lastAttackAt > 900){
        impostorBot._lastAttackAt = now;
        // Grace: 007 não bate em alvo recém-conectado (10s)
        if (now - (target.connectedAt || 0) < 10000){
            if (target.ws && target.ws.readyState === 1){
                try { target.ws.send(JSON.stringify({ t:'pvpHit', from: impostorBot.id, fromName: BOT_NAME, amount: 0, actual: 0, immune: true })); } catch {}
            }
            return;
        }
        const def = totalDefenseServer(target);
        const reduction = def > 0 ? def / (def + 30) : 0;
        const actual = Math.max(1, Math.round(BOT_DAMAGE * (1 - reduction)));
        target.hp = Math.max(0, (target.hp || 100) - actual);
        broadcastPstatsAll(target);
        broadcast(null, { t:'float', id: target.id, text:`-${actual}`, color:'#ff3030', big:true });
        if (target.ws && target.ws.readyState === 1){
            try { target.ws.send(JSON.stringify({ t:'pvpHit', from: impostorBot.id, fromName: BOT_NAME, amount: BOT_DAMAGE, actual })); } catch {}
        }
        if (target.hp === 0){
            broadcastMsg('warn', `💀 O Agente 007 derrotou ${target.name}!`);
        }
    }
}

function killImpostorBot(killer){
    if (!impostorBot) return;
    killer.gold = (killer.gold || 0) + BOT_REWARD_GOLD;
    syncGoldRank(killer.name, killer.gold);
    incInv(killer, 'BENCAO_FENIX_TEMP', 1);
    // Marca expiry pra cleanup futuro
    killer._bencaoTempExpiry = (killer._bencaoTempExpiry || []);
    killer._bencaoTempExpiry.push(Date.now() + BOT_BENCAO_TTL_MS);
    sendInvUpdate(killer, { goldDelta:{ amount: BOT_REWARD_GOLD, reason:'bot_007' }, bot007Kill:true });
    broadcastMsg('event', `⚡ ${killer.name} DERROTOU o Agente 007! +${BOT_REWARD_GOLD}g + Bênção 24h.`);
    recordError({ kind:'bot_kill', player: killer.name, msg:'killed 007', meta:{ killerId: killer.id } });
    despawnImpostorBot('killed', killer.name);
}

function despawnImpostorBot(reason, byName){
    if (!impostorBot) return;
    const id = impostorBot.id;
    players.delete(id);
    impostorBot = null;
    broadcast(null, { t:'leave', id });
    if (reason === 'timeout'){
        broadcastMsg('info', `O Agente 007 desapareceu. Ninguém conseguiu detê-lo a tempo.`);
    }
    console.log(`[007] despawn (${reason}${byName?' por '+byName:''})`);
}

// Cleanup de bênções temp expiradas (1 tick/min). Remove do inv quando expira.
function tickBencaoTempCleanup(){
    const now = Date.now();
    for (const pp of players.values()){
        if (pp._isBot || !pp._bencaoTempExpiry || !pp._bencaoTempExpiry.length) continue;
        const before = pp._bencaoTempExpiry.length;
        pp._bencaoTempExpiry = pp._bencaoTempExpiry.filter(ts => ts > now);
        const expired = before - pp._bencaoTempExpiry.length;
        if (expired > 0 && pp.inv && pp.inv.BENCAO_FENIX_TEMP){
            pp.inv.BENCAO_FENIX_TEMP = Math.max(0, pp.inv.BENCAO_FENIX_TEMP - expired);
            if (pp.inv.BENCAO_FENIX_TEMP <= 0) delete pp.inv.BENCAO_FENIX_TEMP;
            sendInvUpdate(pp, { bencaoExpired: expired });
        }
    }
}

setInterval(safeTick('tickImpostorBot', tickImpostorBot), 250);
setInterval(safeTick('spawnImpostorBot', spawnImpostorBot), BOT_SPAWN_INTERVAL_MS);
setInterval(safeTick('tickBencaoTempCleanup', tickBencaoTempCleanup), 60 * 1000);

// Anti-ninja (mob comum): "dono" do loot = quem deu mais dano (fallback = killer).
// Online → null se nem o top-damager nem o killer estão presentes (bag fica livre).
function lootOwnerOf(m, killer){
    const dmgBy = m.damageBy || {};
    let bestId = null, best = 0;
    for (const pid in dmgBy){ if (dmgBy[pid] > best){ best = dmgBy[pid]; bestId = Number(pid); } }
    const top = bestId != null ? players.get(bestId) : null;
    if (top && !top.disconnected) return top;
    if (killer && !killer.disconnected) return killer;
    return null;
}
// Espalha o loot do mob comum no chão (3×3 quando há vários itens) e CARIMBA o dono
// + janela de lock (LOOT_LOCK_MS) em cada drop. Retorna o payload pros clientes
// (mobKill.drops / groundSpawn). Extraído do handler de attackMob; reusado também na
// morte por DoT (handleMobDeath) — antes o DoT mandava só `loot` e o drop se perdia.
const MOB_DROP_SPREAD = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];   // só 3×3: loot perto da morte (coletar não puxa mais mob)
function dropMobLoot(m, loot, killer){
    const owner = lootOwnerOf(m, killer);
    const ownerId = owner ? owner.id : null;
    const ownerName = owner ? owner.name : null;
    const ownerUntil = owner ? (Date.now() + LOOT_LOCK_MS) : 0;
    const spawned = [];
    let spreadIdx = 0;
    for (const it of loot){
        if (!it || !it.type) continue;
        let dx = 0, dy = 0;
        if (loot.length > 2){
            for (let t = 0; t < MOB_DROP_SPREAD.length; t++){
                const o = MOB_DROP_SPREAD[(spreadIdx + t) % MOB_DROP_SPREAD.length];
                if (mobTileOk(m, m.x + o[0], m.y + o[1])){ dx = o[0]; dy = o[1]; spreadIdx = (spreadIdx + t + 1) % MOB_DROP_SPREAD.length; break; }
            }
        }
        const d = spawnGroundDrop(m.x + dx, m.y + dy, it.type, it.qty | 0 || 1, m.floor, ownerId, ownerName, ownerUntil);
        spawned.push({ id:d.id, x:d.x, y:d.y, type:d.type, qty:d.qty, owner:ownerId, ownerName, ownerUntil });
    }
    return spawned;
}

// M4 anti-ninja: distribui o loot de um boss unique entre quem deu dano.
// Gold = proporcional à contribuição; itens = sorteio ponderado pelo dano
// (quem bateu mais tem mais chance de cada item). Vai DIRETO pro inventário —
// não cai no chão. fallbackKiller leva tudo se ninguém foi rastreado.
function distributeBossLoot(m, loot, fallbackKiller){
    const dmgBy = m.damageBy || {};
    // Quem deu dano (online)
    const damagers = [];
    for (const pid in dmgBy){
        const pp = players.get(Number(pid));
        if (pp && !pp.disconnected && dmgBy[pid] > 0) damagers.push({ p: pp, dmg: dmgBy[pid] });
    }
    if (!damagers.length){
        if (fallbackKiller && !fallbackKiller.disconnected) damagers.push({ p: fallbackKiller, dmg: 1 });
        else return;
    }
    // Beneficiários + peso:
    //  - Se algum damager está em PARTY → divide IGUAL entre todos os membros
    //    online da(s) party(s) no mesmo andar + os damagers solo (peso 1 cada).
    //  - Senão (todos solo) → por dano individual (peso = dano).
    const inParty = damagers.some(d => findPartyOfPlayer(d.p.name));
    const benef = new Map();   // pid -> { p, weight }
    if (inParty){
        // Em party: quem DEU DANO divide igual. (Antes puxava TODOS os membros da
        // party no andar, mesmo com 0 de dano → alts parados no andar 5 farmavam o
        // loot do boss. Agora só participa do rateio quem efetivamente bateu.)
        for (const d of damagers) benef.set(d.p.id, { p: d.p, weight: 1 });
    } else {
        for (const d of damagers) benef.set(d.p.id, { p: d.p, weight: d.dmg });
    }
    const contribs = Array.from(benef.values()).map(b => ({ p: b.p, dmg: b.weight }));
    const totalDmg = contribs.reduce((s, c) => s + c.dmg, 0) || 1;
    const got = new Map();   // pid -> { p, gold, items:{} }
    const slot = (pp) => { let g = got.get(pp.id); if (!g){ g = { p: pp, gold: 0, items: {} }; got.set(pp.id, g); } return g; };
    for (const it of loot){
        if (!it || !it.type) continue;
        if (it.type === 'GOLD'){
            let dist = 0;
            for (const c of contribs){
                const share = Math.floor((it.qty || 0) * (c.dmg / totalDmg));
                if (share > 0){ slot(c.p).gold += share; dist += share; }
            }
            const rest = (it.qty || 0) - dist;   // arredondamento → maior peso
            if (rest > 0){ const top = contribs.reduce((a,b) => b.dmg > a.dmg ? b : a, contribs[0]); slot(top.p).gold += rest; }
        } else {
            let r = Math.random() * totalDmg, winner = contribs[0];
            for (const c of contribs){ r -= c.dmg; if (r <= 0){ winner = c; break; } }
            const g = slot(winner.p);
            g.items[it.type] = (g.items[it.type] || 0) + (it.qty | 0 || 1);
        }
    }
    for (const g of got.values()){
        const pp = g.p;
        if (g.gold > 0){ pp.gold = (pp.gold || 0) + g.gold; syncGoldRank(pp.name, pp.gold); }
        for (const type in g.items) incInv(pp, type, g.items[type]);
        sendInvUpdate(pp, {
            goldDelta: g.gold > 0 ? { amount: g.gold, reason:'boss_loot' } : undefined,
            bossLoot: { boss: m.type, gold: g.gold, items: g.items },
        });
    }
}

// ─── Lote 1b: progresso de quest SERVER-AUTORITATIVO ──────────────────────
// Antes a contagem de kills/visitas era client-trusted (F12 forjava progress e
// reivindicava reward sem fazer a quest). Agora o SERVER conta kills (attackMob +
// handleMobDeath) e visitas (handler pos), valida no turnIn, e manda questProgress
// pro cliente refletir. questFlags já é server-owned/persistido (audit 03/06).
function serverCurrentChainStage(p, chainId){
    const chain = QUEST_CHAINS[chainId];
    if (!chain) return null;
    const prog = (p.questFlags && p.questFlags[chainId]) || {};
    for (const stage of chain.stages){ if (!prog[stage.id]) return stage; }   // 1ª não-completa
    return null;
}
function creditQuestKill(p, mobType){
    if (!p || !mobType) return;
    // Quests simples ativas (goal mob do tipo)
    if (p.quests && p.quests.active){
        for (const qid of Object.keys(p.quests.active)){
            const q = QUESTS_BY_ID[qid];
            if (!q || q.goal.kind !== 'mob' || q.goal.type !== mobType) continue;
            if (Array.isArray(p.quests.completed) && p.quests.completed.includes(qid)) continue;
            const st = p.quests.active[qid] || (p.quests.active[qid] = { progress: 0 });
            if ((st.progress | 0) < q.goal.count){
                st.progress = (st.progress | 0) + 1;
                sendTo(p.id, { t:'questProgress', kind:'simple', questId: qid, progress: st.progress });
            }
        }
    }
    // Chains (stage atual = mob do tipo)
    for (const chainId of Object.keys(QUEST_CHAINS)){
        const stage = serverCurrentChainStage(p, chainId);
        if (!stage || stage.kind !== 'mob' || stage.type !== mobType) continue;
        p.questFlags = p.questFlags || {};
        p.questFlags[chainId] = p.questFlags[chainId] || {};
        const key = stage.id + '_kills';
        if ((p.questFlags[chainId][key] || 0) < stage.count){
            p.questFlags[chainId][key] = (p.questFlags[chainId][key] || 0) + 1;
            p.questFlags[chainId][stage.id + '_started'] = true;   // UI: marca engajado
            sendTo(p.id, { t:'questProgress', kind:'chain', chainId, flags: p.questFlags[chainId] });
        }
    }
}
function creditQuestVisit(p, x, y){
    if (!p) return;
    for (const chainId of Object.keys(QUEST_CHAINS)){
        const stage = serverCurrentChainStage(p, chainId);
        if (!stage || stage.kind !== 'visit' || typeof stage.x !== 'number') continue;
        if (Math.max(Math.abs(x - stage.x), Math.abs(y - stage.y)) > (stage.radius || 1)) continue;
        p.questFlags = p.questFlags || {};
        p.questFlags[chainId] = p.questFlags[chainId] || {};
        if (!p.questFlags[chainId][stage.id + '_visited']){
            p.questFlags[chainId][stage.id + '_visited'] = true;
            p.questFlags[chainId][stage.id + '_started'] = true;
            sendTo(p.id, { t:'questProgress', kind:'chain', chainId, flags: p.questFlags[chainId] });
        }
    }
}

// Resolve a morte de um mob (extração da lógica do attackMob handler) —
// reutilizado pra mortes por DoT (veneno/sangra/fogo).
function handleMobDeath(m, killerId){
    if (m.unique){
        if (m.type === MEGA_BOSS_TYPE){
            const killer = players.get(killerId);
            if (killer) handleMegaBossDeath(killer, m);
        } else if (BOSSES.some(b => b.type === m.type)) {   // só os 3 bosses do mundo escalam/respawnam por timer
            bossDeath.set(m.type, Date.now());
            const cur = bossLevel.get(m.type) || 1;
            const next = Math.min(BOSS_LEVEL_CAP, cur + 1);
            bossLevel.set(m.type, next);
            console.log(`[boss] ${m.type} morto (Lv${cur}) por DoT/killer=${killerId} → próximo Lv${next}`);
            saveStateToDisk();
            checkMegaBossSpawn();
        } else if (m.type === DUNGEON_BOSS_TYPE) {   // boss da masmorra: registra cooldown anti-farm (não escala/persiste como os do mundo)
            dungeonBossDeath.set(m.floor || 0, Date.now());
            console.log(`[dungeon] ${DUNGEON_BOSS_TYPE} morto no andar ${m.floor||0} (DoT/killer=${killerId}) → cooldown ${DUNGEON_BOSS_RESPAWN_MS/60000}min`);
        }
    }
    // Hunter HL: se foi o último caçador do target, credita bonus
    if (m.hunter && m.huntTargetId != null){
        const tp = players.get(m.huntTargetId);
        if (tp){
            const stillAlive = Array.from(monsters.values()).some(x =>
                x.id !== m.id && x.hunter && x.huntTargetId === tp.id && x.hp > 0);
            if (!stillAlive){
                tp._lastHlHuntClaim = Date.now();
                const amount = 200 + Math.floor(Math.random() * 250);
                tp.gold = (tp.gold || 0) + amount;
                syncGoldRank(tp.name, tp.gold);
                sendInvUpdate(tp, { goldDelta:{ amount, reason:'hl_hunt' } });
                if (tp.ws && tp.ws.readyState === 1){
                    tp.ws.send(JSON.stringify({ t:'hlHuntResult', ok:true, amount, retryAt: tp._lastHlHuntClaim + HL_HUNT_COOLDOWN_MS }));
                }
            }
        }
    }
    monsters.delete(m.id);
    const killer = players.get(killerId);
    const loot = rollLoot(m.type, ((killer && killer.permaBuffs && killer.permaBuffs.rareLuck) || 0) + (killer ? petBuffVal(killer, 'rareLuck') : 0));
    const isBoss = !!m.unique;
    // M5 talent t_loot (+15% gold) — espelha o caminho do attackMob.
    if (!isBoss && killer){
        const lootBonus = (killer.permaBuffs?.lootBonus || 0) + petBuffVal(killer, 'lootBonus');
        if (lootBonus > 0){ for (const it of loot){ if (it && it.type === 'GOLD' && it.qty > 0) it.qty = Math.max(1, Math.round(it.qty * (1 + lootBonus))); } }
    }
    // M4 anti-ninja: boss distribui por dano (direto no inv); mob comum cai no chão
    // com dono+lock (dropMobLoot). Antes a morte por DoT mandava só `loot` sem `drops`
    // server-side → o cliente criava drop com id local que o groundPickup nunca catava
    // = loot perdido online. Agora o caminho do DoT é igual ao do attackMob.
    let spawnedDrops = [];
    if (isBoss) distributeBossLoot(m, loot, killer);
    else spawnedDrops = dropMobLoot(m, loot, killer);
    // T1: XP authoritative na skill da arma equipada do killer
    let xpGained = 0, skillUsed = null, petGain = null;
    if (killer){
        skillUsed = weaponSkillOf(killer);
        gainSkillXpServer(killer, skillUsed, m.xp || 1);
        xpGained = m.xp || 1;
        petGain = gainPetXp(killer, m.xp || 1);
        creditQuestKill(killer, m.type);   // Lote 1b: conta kill de quest (DoT/unificado)
    }
    if (killer && killer.ws.readyState === 1){
        killer.ws.send(JSON.stringify({
            t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level, loot: isBoss ? [] : loot,
            drops: spawnedDrops, skill: skillUsed, xpGained, petGain,
        }));
        // Envia skills atualizadas (autoritativo)
        sendInvUpdate(killer, { skills: killer.skills, reason:'mobKill' });
    }
    broadcast(killerId, { t:'mobDead', mobId:m.id, byName: killer?.name || '?', level: m.level });
    // outros veem a bag aparecer (mesma do attackMob); scoped no andar
    if (!isBoss && spawnedDrops.length) broadcast(killerId, { t:'groundSpawn', drops: spawnedDrops }, m.floor);
    if (killer){
        bumpMobKill(killer.name, !!m.unique);
        sharePartyKill(killer, m);
    }
}

// Ticka DoTs em mobs (veneno/sangra/fogo). Roda a cada 1s, processa dots
// expirados, aplica dano, broadcasta updates+floats.
const DOT_TICK_INTERVAL_MS = 3000;
const DOT_COLORS = { poison:'#74d176', bleed:'#cc3030', burn:'#ff8030' };  // DoT type → cor do float (mob + player)
function tickMobDots(){
    const now = Date.now();
    const updates = [];
    const floats  = [];
    for (const m of monsters.values()){
        if (!m.dots || !m.dots.length || m.hp <= 0) continue;
        let touched = false;
        for (let i = m.dots.length - 1; i >= 0; i--){
            const d = m.dots[i];
            if (now < d.nextTickAt) continue;
            const dmg = d.dmg;
            m.hp = Math.max(0, m.hp - dmg);
            // Anti-ninja: dano de DoT conta pro dono do loot (todos os mobs agora)
            if (d.byId != null){ m.damageBy = m.damageBy || {}; m.damageBy[d.byId] = (m.damageBy[d.byId] || 0) + dmg; }
            floats.push({ mobId: m.id, text: `-${dmg}`, color: DOT_COLORS[d.type] || '#aaa' });
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
setInterval(safeTick('tickMobDots', tickMobDots), 1000);

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
// Processa morte PvP server-side — chamado quando pvpAttack zera hp do alvo.
// Antes: cliente vítima mandava msg.pkDeath {killerId, goldGain, dropHighlander}
// e server confiava → cúmplice podia farmar kills no ranking forjando msgs.
// Agora: server transfere gold (10% do que vítima tinha) + CORACAO_HL se tinha
// + 1 selo pro killer + ranking. Tudo autoritativo.
function processPkDeathServerSide(killer, victim){
    if (!killer || !victim) return;
    // Morte PvP: o cliente respawna no spawn local (bloco "Respawn no spawn") e pode
    // nem mandar pos até o 1º movimento. Libera 1 pos não-adjacente pra reconciliar a
    // posição autoritativa sem snap-back. Concedido só na morte → não vira fuga de PvP.
    victim._posGraceUntil = Date.now() + 60000;
    // Duelo: usa endDuel em vez do flow normal (não dá selo, não dropa)
    if (killer.duel && killer.duel.opponentId === victim.id && victim.duel && victim.duel.opponentId === killer.id){
        endDuel(killer, victim, false);
        return;
    }
    // M7 Arena: mesma partida → endArenaMatch (sem selo, sem drop de gold/HL, sem pena de skill)
    if (killer.arena && victim.arena && killer.arena.matchId === victim.arena.matchId){
        endArenaMatch(killer, victim, false);
        return;
    }
    // Gold drop: 10% do que vítima tinha (alinhado com ghost kill)
    const goldDrop = Math.floor((victim.gold || 0) * 0.10);
    if (goldDrop > 0){
        victim.gold = Math.max(0, (victim.gold || 0) - goldDrop);
        killer.gold = (killer.gold | 0) + goldDrop;
        syncGoldRank(victim.name, victim.gold);
        syncGoldRank(killer.name, killer.gold);
    }
    // Highlander drop: vítima perde CORACAO_HL (se tinha) e killer ganha 1
    const dropHighlander = hasInv(victim, 'CORACAO_HL', 1);
    if (dropHighlander){
        incInv(victim, 'CORACAO_HL', -1);
        incInv(killer, 'CORACAO_HL', 1);
    }
    // Sinaliza vítima (UI mostra "você perdeu Xg") + killer (ganhou Xg)
    if (goldDrop > 0 || dropHighlander){
        sendInvUpdate(victim, { pvpLoss:{ amount: goldDrop, dropHighlander } });
        sendInvUpdate(killer, { pvpGain:{ amount: goldDrop, dropHighlander } });
    }
    // pkKill pro killer (UI float + log + selos de sangue)
    if (killer.ws.readyState === 1){
        killer.ws.send(JSON.stringify({
            t: 'pkKill',
            victimId: victim.id, victimName: victim.name,
            victimHadSelos: (victim.selos || 0) >= 1,
            goldGain: goldDrop,
            dropHighlander,
        }));
    }
    broadcastMsg('warn', `⚔ ${killer.name} matou ${victim.name}` + (dropHighlander ? ' (Highlander caiu!)' : ''));
    bumpPkKill(killer.name);
    console.log(`[pk] ${killer.name} → ${victim.name} (autoritativo) gold=${goldDrop} hl=${dropHighlander}`);
}

// Cap de dano PvP server-side. Cliente envia `amount` no pvpAttack — sem cap,
// F12 → `{amount:99999}` one-shotta qualquer um. Margem generosa pra cobrir
// dano máximo legítimo: base arma + forja+5 (+7 base) + skill bonus (+50-66) +
// crit (×2) + pvpMults (×1.35 com 5 selos + highlander) + CORACAO_HL (×1.05).
// Ex.: ESPADA_ETERNA base 30 → cap 550 (dano legit máximo ~360). 99999 ainda bloqueia.
function pvpDamageCapServer(p){
    const wKey = p.equipped?.weapon;
    if (!wKey) return 100;
    const tier = getUpgradeTier(wKey);
    const meta = ITEM_META[tier.base];
    const base = meta?.base || 5;
    return base * 15 + 100;
}
// Cap de range PvP. Cliente envia `range` — sem cap aceitaria range:999.
// Melee = 1; ranged usa weapon.ranged (4-8); throwable usa weapon.throwable.
function pvpRangeCapServer(p){
    const wKey = p.equipped?.weapon;
    if (!wKey) return 1;
    const tier = getUpgradeTier(wKey);
    const meta = ITEM_META[tier.base];
    if (meta && typeof meta.ranged === 'number') return Math.min(8, meta.ranged);
    if (meta && typeof meta.throwable === 'number') return Math.min(8, meta.throwable);
    return 1;
}

// ─── Combate PvE autoritativo (Deploy 2a) ────────────────────────────────────
// Mesma filosofia do PvP: o cliente segue mandando amount/range no attackMob,
// mas o server DERIVA o alcance e CAPA o dano. O número que o player vê continua
// o roll dele (zero risco de "dano errado"); só o exagero é barrado.
// Alcance da arma = o máximo que ela alcança legitimamente (ranged/throwable; a
// lança 1H usa throwable, que cobre o meleeRange dela). Punho/melee puro = 1.
// Cap 8 (nenhuma arma passa disso; magia de range maior entra pela janela de spell).
function weaponRangeServer(p){
    const wKey = p.equipped && p.equipped.weapon;
    if (!wKey) return 1;
    const tier = getUpgradeTier(wKey);
    const meta = ITEM_META[tier.base];
    if (!meta) return 1;
    return Math.min(8, Math.max(meta.ranged || 0, meta.throwable || 0, 1));
}
// Teto de dano por hit no PvE. Mantém msg.amount; só limita o exagero.
// Magia (dentro da janela do spellCast): teto pelo dano da magia + Magia/3, folga
// ×4 (crit×2 · Fúria×1,25 · pvp×1,35 · variância). Arma: teto POR PLAYER, generoso
// (NUNCA clipa hit legítimo — usa base+forja+skill que o server conhece, com a maior
// skill relevante; ×4 cobre crit+mults, +7 cobre ammo/variância) mas MUITO mais
// apertado que o flat 600 pra setup fraco. (Não reusa pvpDamageCapServer base×15+100:
// aquele clipa build de Distância/forja alta de baixa base — risco de "número errado".)
// Mana do tiro básico da wand (Fase 2b). Descontado no attackMob (ataque de arma sem
// janela de magia). As magias de cooldown já pagam no spellCast.
const WAND_MANA_COST = 4;
// Base da wand equipada (0 se não for wand). Entra no cap de magia e no gate de ataque.
function wandBaseServer(p){
    const wKey = p.equipped && p.equipped.weapon;
    if (!wKey) return 0;
    const base = String(wKey).replace(/_PLUS_\d+$/, '');
    const meta = ITEM_META[base];
    return (meta && meta.kind === 'wand') ? (meta.base || 0) : 0;
}
function attackDamageCapServer(p, spellWin){
    if (spellWin){
        const magia = (p.skills && p.skills.Magia && p.skills.Magia.val) || 10;
        // spellWin.damage já inclui a base da wand (janela aberta no spellCast). ×6 cobre
        // crit×2 + afinidade×1.2 + fraqueza×1.5 (Fase 2) + variância; slack cobre talentos.
        const dmgB  = (p.permaBuffs && p.permaBuffs.damageBonus)  || 0;
        const critB = (p.permaBuffs && p.permaBuffs.critDmgBonus) || 0;
        const slack = (1 + dmgB) * (1 + critB / 2);
        return Math.round(((spellWin.damage + Math.floor(magia / 3)) * 6 + 50) * slack);
    }
    const wKey = p.equipped && p.equipped.weapon;
    const tier = wKey ? getUpgradeTier(wKey) : { base: null, plus: 0 };
    const base = (tier.base && ITEM_META[tier.base] && ITEM_META[tier.base].base) || 2;
    const meleeSk = (p.skills && p.skills[weaponSkillOf(p)] && p.skills[weaponSkillOf(p)].val) || 10;
    const distSk  = (p.skills && p.skills['Distância'] && p.skills['Distância'].val) || 10;
    const skillBonus = Math.floor(Math.max(meleeSk, distSk) / 3);
    // Fase 2: o cap precisa acomodar Golpe Pesado (+dano) e Precisão Mortal (crit ×2→×2.x),
    // senão o hit legítimo buffado seria clipado. Folga POR PLAYER → sem talento, cap = o de antes.
    const dmgB  = (p.permaBuffs && p.permaBuffs.damageBonus)  || 0;
    const critB = (p.permaBuffs && p.permaBuffs.critDmgBonus) || 0;
    const slack = (1 + dmgB) * (1 + critB / 2);
    return Math.round(((base + tier.plus * 5 + skillBonus + 7) * 4 + 40) * slack);
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
        cosmetic:p.cosmetic, pet:p.pet||null, equipped:p.equipped, badges:p.badges || [], dyes: p.dyes || null,
        scReadyAt: p.scReadyAt || 0   // 🕯️ Segunda Chance: cliente mostra cooldown no modal
    });
    const f = p.floor || 0;   // M4: só players do mesmo andar veem os stats
    for (const other of players.values()){
        if ((other.floor || 0) !== f) continue;
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
        const inPz = playerInSafe(p);   // regen turbo só na cidade, não na masmorra
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
            const heal = 1 + armorHp + (inPz ? 1 : 0) + talent + Math.round(petBuffVal(p, 'regenBonus'));
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
        if (changed) broadcastPstatsAll(p);
    }
}
setInterval(safeTick('tickPlayerRegen', tickPlayerRegen), 500);

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
function tickPlayerDots(){
    const now = Date.now();
    for (const p of players.values()){
        if (!p.dots || !p.dots.length) continue;
        if (!p.ws || p.ws.readyState !== 1) continue;
        if ((p._invulnUntil || 0) > now) continue;   // 🕯️ Segunda Chance: imunidade pós-revive — sem tick de DoT
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
                    color: DOT_COLORS[d.type] || '#aaa',
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
                // 🕯️ Segunda Chance (só PvE): se o DoT letal NÃO veio de um player vivo, tenta reviver.
                // (Hoje todo DoT em player vem de mob → sempre PvE; o guard é à prova de futuro p/ DoT de PvP.)
                const dotFromPlayer = d.byId && players.has(d.byId);
                if (!dotFromPlayer && trySecondChance(p)){
                    p.dots.length = 0;   // limpa DoTs ao reviver — clean slate
                    hpChanged = true;
                    break;
                }
                // Morte por DoT → cliente respawna no spawn. Libera 1 pos não-adjacente.
                p._posGraceUntil = Date.now() + 60000;
                // Sinaliza hp=0 ao cliente (dispara playerDie/penalidade UMA vez) ANTES de ressuscitar,
                // senão o respawn server-side cheio faria o cliente nem ver a morte.
                broadcastPstatsAll(p);
                // Fix LOOP DE MORTE (2026-06-03): ressuscita server-side cheio + (masmorra→cidade).
                // (respawnPlayerServer já zera p.dots — clean slate.)
                respawnPlayerServer(p, p.id);
                break;
            }
        }
        if (hpChanged) broadcastPstatsAll(p);
    }
}
setInterval(safeTick('tickPlayerDots', tickPlayerDots), 1000);

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
setInterval(safeTick('tickEvent', tickEvent), 60_000);
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
            // Acha posição walkable no anel (raio 12-25). ANTES spawnava direto na coord
            // do ângulo/raio sem validar → mobs nasciam dentro do lago (tile WATER).
            let sx = 0, sy = 0, found = false;
            for (let tries = 0; tries < 30; tries++){
                const ang = Math.random() * Math.PI * 2;
                const r = 12 + Math.random() * 13;
                const x = Math.round(50 + Math.cos(ang) * r);
                const y = Math.round(50 + Math.sin(ang) * r);
                if (x < 1 || y < 1 || x >= M_W-1 || y >= M_H-1) continue;
                if (!isWalkable(x, y)) continue;
                if (inSafe(x, y) || inCave(x, y) || inSanctuary(x, y)) continue;
                if (mobAt(x, y) || playerAt(x, y)) continue;
                sx = x; sy = y; found = true; break;
            }
            if (!found) continue;
            const m = spawnMob(type, sx, sy);
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
setInterval(safeTick('tickDailyEvent', tickDailyEvent), 30_000);
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
            if (from) sendTo(from.id, { t:'serverMsg', level:'warn', text: trp(from, 'srv.duel_invite_expired', {name: inv.toName || '?'}) });
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
setInterval(safeTick('tickDuels', tickDuels), 5_000);

// ─── M7 Arena PvP 1v1 (matchmaking) ───────────────────────────────────────
// Diferente do duelo (desafio DIRETO, no mundo): a arena é FILA + matchmaking
// (o server casa 2 players com a MESMA aposta) numa INSTÂNCIA isolada — um floor
// único por partida, reusando a máquina de masmorra (broadcast/colisão/teleporte
// já são filtrados por floor). Aposta de gold é OPCIONAL (0 = só rating). Rating
// é Elo (base 1000). Recompensa cosmética semanal fica pra fase 2 do M7.
const arenaQueue = [];                       // [{ id, name, wager, joinedAt }]
const arenaMatches = new Map();              // matchId -> { id1, id2, floor, wager, startedAt }
let arenaFloorSeq = 9000;                    // floor único por match (> DUNGEON_MAX_FLOOR=5, sem colisão)
let arenaMatchSeq = 0;
const ARENA_FIGHT_DELAY_MS = 3000;           // countdown 3..2..1 antes de liberar o hit
const ARENA_MAX_MS = 3 * 60 * 1000;          // empate por timeout (espelha DUEL_MAX_MS)
const ARENA_REGION = { x0: 44, y0: 46, x1: 56, y1: 54 };   // sala 13×9 (coords isoladas por floor)
const ARENA_SPAWN_A = { x: 46, y: 50 };      // canto O
const ARENA_SPAWN_B = { x: 54, y: 50 };      // canto L
const ARENA_JOIN_COOLDOWN_MS = 800;          // anti-spam de entrar/sair da fila

// Grid da arena: sala retangular fechada (paredes na borda, chão dentro). MESMO
// shape que genDungeonGrid → applyDungeonGrid no cliente e dungeonTileWalkable no
// server funcionam sem mudança. Sem escadas (stairs nulas).
function genArenaGrid(floor){
    const { x0, y0, x1, y1 } = ARENA_REGION;
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    const rows = [], walkable = new Set(), floorTiles = [];
    for (let ly = 0; ly < H; ly++){
        let row = '';
        for (let lx = 0; lx < W; lx++){
            const isWall = (lx === 0 || ly === 0 || lx === W - 1 || ly === H - 1);
            row += isWall ? '0' : '1';
            if (!isWall){
                const gx = x0 + lx, gy = y0 + ly;
                walkable.add(gx + ',' + gy); floorTiles.push({ x: gx, y: gy });
            }
        }
        rows.push(row);
    }
    const stairs = { spawn: { x: ARENA_SPAWN_A.x, y: ARENA_SPAWN_A.y }, up: null, down: null, boss: null };
    return { floor, region: { x0, y0, x1, y1 }, rows, walkable, floorTiles, stairs };
}

// Teleporta UM player pra instância da arena (clone enxuto de enterDungeonFloor).
// O grid já está registrado em dungeonFloors (startArenaMatch). spawn = canto do player.
function enterArenaFloor(p, id, floor, spawn, opponentName){
    p.floor = floor;
    const g = dungeonFloors.get(floor);
    p.x = spawn.x; p.y = spawn.y;
    if (p.ws && p.ws.readyState === 1){
        p.ws.send(JSON.stringify({
            t:'dungeonEnter', floor, dir:'down', x:p.x, y:p.y,
            grid: { region: g.region, rows: g.rows },
            stairs: g.stairs,
            players: snapshotPlayers(floor).filter(sp => sp.id !== id),
            mobs: [], groundDrops: [],
            arena: true, opponentName,
        }));
    }
    broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:true, hp:p.hp, maxHp:p.maxHp, equipped: p.equipped || null, cosmetic: p.cosmetic || null, pet: p.pet || null, badges: p.badges || [], dyes: p.dyes || null, guild: findGuildOfPlayer(p.name)?.name || null } }, floor);
}

// Tira o player da arena de volta pra cidade, ao lugar de ORIGEM (clone de
// returnPlayerToTown mas usa p._arenaReturn em vez de DUNGEON_RETURN).
function returnFromArena(p, id){
    if ((p.floor || 0) > 0) broadcast(id, { t:'leave', id }, p.floor);
    p.pvp = !!p._pvpBeforeArena;
    const ret = p._arenaReturn || DUNGEON_RETURN;
    p.floor = 0;
    p.x = ret.x; p.y = ret.y;
    if (p.ws && p.ws.readyState === 1){
        p.ws.send(JSON.stringify({
            t:'dungeonExit', x: p.x, y: p.y, pvp: p.pvp,
            players: snapshotPlayers(0).filter(sp => sp.id !== id),
            mobs: snapshotMobs(0),
            groundDrops: snapshotGroundDrops(0),
        }));
    }
    broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp, equipped: p.equipped || null, cosmetic: p.cosmetic || null, pet: p.pet || null, badges: p.badges || [], dyes: p.dyes || null, guild: findGuildOfPlayer(p.name)?.name || null } }, 0);
    p._pvpBeforeArena = undefined;
    p._arenaReturn = undefined;
}

// Elo padrão (K=32, piso 100). Muta arenaRating dos dois registros de ranking.
function arenaEloUpdate(rW, rL, draw){
    const Ra = rW.arenaRating ?? 1000, Rb = rL.arenaRating ?? 1000;
    const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
    const Eb = 1 - Ea;
    const Sa = draw ? 0.5 : 1, Sb = draw ? 0.5 : 0;
    const K = 32;
    rW.arenaRating = Math.max(100, Math.round(Ra + K * (Sa - Ea)));
    rL.arenaRating = Math.max(100, Math.round(Rb + K * (Sb - Eb)));
}

// Cria a partida: escrow da aposta (igual startDuel), gera+registra o grid,
// teleporta os 2 pra instância (curados, DoTs limpos, PvP forçado), countdown.
function startArenaMatch(p1, p2, wager){
    // Re-valida gold no momento do match (pode ter mudado desde a fila)
    if (wager > 0 && ((p1.gold || 0) < wager || (p2.gold || 0) < wager)){
        for (const pp of [p1, p2]){
            if ((pp.gold || 0) >= wager){
                arenaQueue.push({ id: pp.id, name: pp.name, wager, joinedAt: Date.now() });
                sendTo(pp.id, { t:'arenaQueued', wager, size: arenaQueue.length, requeued: true });
            } else {
                sendTo(pp.id, { t:'arenaCancel', reason:'no_gold' });
            }
        }
        return;
    }
    // Escrow (igual startDuel)
    if (wager > 0){
        p1.gold = Math.max(0, (p1.gold || 0) - wager);
        p2.gold = Math.max(0, (p2.gold || 0) - wager);
        syncGoldRank(p1.name, p1.gold);
        syncGoldRank(p2.name, p2.gold);
    }
    const matchId = ++arenaMatchSeq;
    const floor = ++arenaFloorSeq;
    dungeonFloors.set(floor, genArenaGrid(floor));
    const fightAt = Date.now() + ARENA_FIGHT_DELAY_MS;
    arenaMatches.set(matchId, { id1: p1.id, id2: p2.id, floor, wager, startedAt: Date.now() });
    const setup = (p, opp) => {
        p._pvpBeforeArena = !!p.pvp;
        p._arenaReturn = { x: p.x, y: p.y };
        p.pvp = true;
        p.dots = [];                       // sem DoT residual de mob entrando na arena
        p.hp = p.maxHp; p.mp = p.maxMp;    // começa cheio
        p.arena = { matchId, opponentId: opp.id, opponentName: opp.name, floor, wager, fightAt };
    };
    setup(p1, p2);
    setup(p2, p1);
    // Teleporta os 2 (sequencial → o 2º já enxerga o 1º no snapshot do floor)
    enterArenaFloor(p1, p1.id, floor, ARENA_SPAWN_A, p2.name);
    enterArenaFloor(p2, p2.id, floor, ARENA_SPAWN_B, p1.name);
    sendTo(p1.id, { t:'arenaCountdown', until: fightAt, opponentName: p2.name, wager });
    sendTo(p2.id, { t:'arenaCountdown', until: fightAt, opponentName: p1.name, wager });
    broadcastPstatsAll(p1); broadcastPstatsAll(p2);
    console.log(`[arena] match ${matchId} floor ${floor}: ${p1.name} vs ${p2.name} (wager ${wager})`);
}

// Resolve a partida: pote (2× ao vencedor / refund no empate), Elo, W/L,
// arenaEnd, cura os 2, teleporta de volta, limpa estado/instância.
function endArenaMatch(winner, loser, draw){
    const wager   = (winner.arena && winner.arena.wager)   ?? (loser.arena && loser.arena.wager)   ?? 0;
    const matchId = (winner.arena && winner.arena.matchId) ?? (loser.arena && loser.arena.matchId);
    const floor   = (winner.arena && winner.arena.floor)   ?? (loser.arena && loser.arena.floor);
    if (wager > 0){
        if (draw){
            winner.gold = (winner.gold || 0) + wager;
            loser.gold  = (loser.gold  || 0) + wager;
        } else {
            winner.gold = (winner.gold || 0) + wager * 2;
        }
        syncGoldRank(winner.name, winner.gold);
        syncGoldRank(loser.name,  loser.gold);
    }
    const rW = ensureRanking(winner.name), rL = ensureRanking(loser.name);
    if (rW && rL){
        arenaEloUpdate(rW, rL, draw);
        if (!draw){ rW.arenaWins = (rW.arenaWins || 0) + 1; rL.arenaLosses = (rL.arenaLosses || 0) + 1; }
    }
    sendTo(winner.id, { t:'arenaEnd', winner:true,  draw:!!draw, wager, opponentName: loser.name,  rating: rW ? rW.arenaRating : 1000, gold: winner.gold });
    sendTo(loser.id,  { t:'arenaEnd', winner:false, draw:!!draw, wager, opponentName: winner.name, rating: rL ? rL.arenaRating : 1000, gold: loser.gold });
    if (draw) broadcastMsg('warn', `⚔ Arena: ${winner.name} e ${loser.name} empataram.`);
    else broadcastMsg('event', `🏆 ${winner.name} venceu a Arena contra ${loser.name}!` + (wager > 0 ? ` (+${wager * 2}g)` : ''));
    // Cura os 2 (esporte: começa e termina cheio; o perdedor não cai morto na cidade)
    winner.hp = winner.maxHp; winner.mp = winner.maxMp; winner.dots = [];
    loser.hp  = loser.maxHp;  loser.mp  = loser.maxMp;  loser.dots = [];
    winner.arena = null; loser.arena = null;
    returnFromArena(winner, winner.id);
    returnFromArena(loser, loser.id);
    broadcastPstatsAll(winner); broadcastPstatsAll(loser);
    if (matchId != null) arenaMatches.delete(matchId);
    if (floor != null) dungeonFloors.delete(floor);
    console.log(`[arena] match ${matchId} fim: ${draw ? 'empate' : winner.name + ' venceu'} (wager ${wager})`);
}

function tickArena(){
    const now = Date.now();
    // 1. Timeout de partidas (empate, refund)
    for (const [mid, m] of [...arenaMatches]){
        if (now - m.startedAt <= ARENA_MAX_MS) continue;
        const p1 = players.get(m.id1), p2 = players.get(m.id2);
        if (p1 && p2 && p1.arena && p2.arena && p1.arena.matchId === mid && p2.arena.matchId === mid){
            endArenaMatch(p1, p2, true);
        } else {
            // órfã (algum sumiu sem fechar) — limpa instância e devolve quem sobrou
            arenaMatches.delete(mid);
            dungeonFloors.delete(m.floor);
            for (const pp of [p1, p2]) if (pp && pp.arena && pp.arena.matchId === mid){ pp.arena = null; returnFromArena(pp, pp.id); }
        }
    }
    // 2. Tira da fila quem saiu / entrou em duelo / arena / masmorra
    for (let i = arenaQueue.length - 1; i >= 0; i--){
        const e = arenaQueue[i], pp = players.get(e.id);
        if (!pp || pp.arena || pp.duel || (pp.floor || 0) !== 0) arenaQueue.splice(i, 1);
    }
    // 3. Casa 2 com a MESMA aposta (mais antigos primeiro)
    for (let i = 0; i < arenaQueue.length; i++){
        let matched = false;
        for (let j = i + 1; j < arenaQueue.length; j++){
            if (arenaQueue[i].wager !== arenaQueue[j].wager) continue;
            const a = arenaQueue[i], b = arenaQueue[j];
            arenaQueue.splice(j, 1); arenaQueue.splice(i, 1);   // remove os 2 (j > i → ordem ok)
            const p1 = players.get(a.id), p2 = players.get(b.id);
            if (p1 && p2) startArenaMatch(p1, p2, a.wager);
            matched = true; break;
        }
        if (matched) i = -1;   // array mutou → reinicia o scan
    }
}
setInterval(safeTick('tickArena', tickArena), 2_000);

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
    // M4 fix: inclui HP dos membros online. O widget de party dependia só de
    // pstats (esporádico) — se um pstats se perdia (reconexão/deploy), o HP
    // ficava stale (ex: "0/208"). Agora vem direto no partyUpdate, autoritativo.
    const memberHp = {};
    for (const pp of partyMembersOnline(party)){
        memberHp[pp.name] = { hp: pp.hp ?? 0, maxHp: pp.maxHp ?? 0 };
    }
    const payload = { t:'partyUpdate', partyId: party.id, leader: party.leader, members: party.members, memberHp };
    for (const pp of partyMembersOnline(party)){
        if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify(payload));
    }
}
// Reenvia partyUpdate de todas as parties a cada 3s pra manter o HP do widget
// atualizado mesmo sem pstats recente.
function tickPartyHp(){
    for (const party of parties.values()) broadcastPartyUpdate(party);
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
        if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_usage_invite') }); return; }
        if (arg.toLowerCase() === p.name.toLowerCase()){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_self') }); return; }
        let target = null;
        for (const pp of players.values()){
            if (!pp.disconnected && pp.name.toLowerCase() === arg.toLowerCase()){ target = pp; break; }
        }
        if (!target){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_online', {name: arg}) }); return; }
        const targetParty = findPartyOfPlayer(target.name);
        if (targetParty){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.target_in_party', {name: target.name}) }); return; }
        let party = myParty;
        if (!party){
            // Cria party com o convidante como líder
            party = { id: nextPartyId++, leader: p.name, members: [p.name], createdAt: Date.now() };
            parties.set(party.id, party);
            broadcastPartyUpdate(party);
        } else if (party.leader !== p.name){
            sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.leader_only_invite') });
            return;
        }
        if (party.members.length >= PARTY_MAX){
            sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_full', {max: PARTY_MAX}) });
            return;
        }
        partyInvites.set(target.name.toLowerCase(), { partyId: party.id, fromId: id, fromName: p.name, expiresAt: Date.now() + PARTY_INVITE_TIMEOUT_MS });
        sendTo(target.id, { t:'serverMsg', level:'event', text: trp(target, 'srv.party_invited', {name: p.name}) });
        sendTo(target.id, { t:'partyInvite', fromName: p.name, expiresIn: PARTY_INVITE_TIMEOUT_MS });
        sendTo(id, { t:'serverMsg', level:'info', text: trp(p, 'srv.invite_sent_60', {name: target.name}) });
        return;
    }
    if (sub === 'accept'){
        const inv = partyInvites.get(p.name.toLowerCase());
        if (!inv || inv.expiresAt < Date.now()){
            partyInvites.delete(p.name.toLowerCase());
            sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_party_invite') });
            return;
        }
        const party = parties.get(inv.partyId);
        if (!party){ partyInvites.delete(p.name.toLowerCase()); sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_gone') }); return; }
        if (myParty){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_already') }); return; }
        if (party.members.length >= PARTY_MAX){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_full', {max: PARTY_MAX}) }); return; }
        party.members.push(p.name);
        partyInvites.delete(p.name.toLowerCase());
        // Notifica todos os membros
        for (const pp of partyMembersOnline(party)){
            if (pp.ws.readyState === 1){
                pp.ws.send(JSON.stringify({ t:'serverMsg', level:'event', text: trp(pp, 'srv.party_member_joined', {name: p.name}) }));
            }
        }
        broadcastPartyUpdate(party);
        return;
    }
    if (sub === 'leave'){
        if (!myParty){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_party') }); return; }
        const wasLeader = myParty.leader === p.name;
        myParty.members = myParty.members.filter(n => n !== p.name);
        sendTo(id, { t:'partyUpdate', deleted: true });
        sendTo(id, { t:'serverMsg', level:'info', text: trp(p, 'srv.party_left') });
        if (myParty.members.length === 0){
            parties.delete(myParty.id);
            return;
        }
        if (wasLeader) myParty.leader = myParty.members[0];
        for (const pp of partyMembersOnline(myParty)){
            if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text: trp(pp, 'srv.party_member_left', {name: p.name}) }));
        }
        broadcastPartyUpdate(myParty);
        return;
    }
    if (sub === 'kick'){
        if (!myParty){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_party_short') }); return; }
        if (myParty.leader !== p.name){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.leader_only_kick') }); return; }
        if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_usage_kick') }); return; }
        if (arg.toLowerCase() === p.name.toLowerCase()){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_use_leave') }); return; }
        if (!myParty.members.find(n => n.toLowerCase() === arg.toLowerCase())){
            sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_in_party', {name: arg}) });
            return;
        }
        myParty.members = myParty.members.filter(n => n.toLowerCase() !== arg.toLowerCase());
        sendPartyEnded(arg);
        if (myParty.members.length === 0){
            parties.delete(myParty.id);
        } else {
            for (const pp of partyMembersOnline(myParty)){
                if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text: trp(pp, 'srv.party_kicked', {name: p.name, target: arg}) }));
            }
            broadcastPartyUpdate(myParty);
        }
        return;
    }
    if (sub === 'info' || sub === ''){
        if (!myParty){ sendTo(id, { t:'serverMsg', level:'info', text: trp(p, 'srv.no_party_help') }); return; }
        const memberLine = myParty.members.map(n => n === myParty.leader ? `👑 ${n}` : n).join(', ');
        sendTo(id, { t:'serverMsg', level:'info', text: trp(p, 'srv.party_info', {n: myParty.members.length, max: PARTY_MAX, members: memberLine}) });
        return;
    }
    sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.party_subcmds') });
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
                from.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text: trp(from, 'srv.party_invite_expired') }));
            }
        }
    }
}
setInterval(safeTick('tickPartyInvites', tickPartyInvites), 10_000);

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
setInterval(safeTick('tickBossHeal', tickBossHeal), 5000);

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
setInterval(safeTick('tickDailyReset', tickDailyReset), 60 * 1000);  // checa a cada minuto

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
    // Estados de "skip" são esperados (boss vivo / não maxado / cooldown) — sem log
    // pra não floodar a cada morte de boss. Só o spawn de fato é logado abaixo.
    if (megaBoss.spawnedAt) return;
    if (!allBossesAtMaxLevel()) return;
    const cdLeft = MEGA_BOSS_COOLDOWN_MS - (Date.now() - megaBoss.lastResolvedAt);
    if (cdLeft > 0) return;
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
setInterval(safeTick('tickMegaBoss', tickMegaBoss), 5000);

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
setInterval(safeTick('tickGhosts', tickGhosts), 15 * 1000);

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
wss.on('connection', (ws, request) => {
    const id = nextId++;
    // Teto de conexões por IP (audit 2026-06-03): sem isto um host abria sockets ILIMITADOS
    // → flood + (cada socket novo zerava o limite de auth por-conexão) alimentando o
    // scryptSync que BLOQUEIA o event loop. Conta só conexões ACEITAS; decrementa no close.
    // Default 30 (generoso p/ CGNAT de jogo pequeno), tunável por env MAX_CONN_PER_IP.
    const _connIp = clientIp(request);
    if ((_ipConnCount.get(_connIp) || 0) >= MAX_CONN_PER_IP){
        console.warn(`[conn] teto de ${MAX_CONN_PER_IP} conexões/IP atingido — recusando (id=${id})`);
        try { ws.close(4029, 'too-many-connections'); } catch {}
        return;
    }
    _ipConnCount.set(_connIp, (_ipConnCount.get(_connIp) || 0) + 1);
    // Detecta Electron pelo User-Agent — UA do Electron sempre contém 'Electron/X.Y.Z'.
    // Importante: clientes v1.0.6 e anteriores NÃO mandam `platform` no auth,
    // então sem essa detecção do UA o gate de versão seria pulado por eles
    // (fail-open quando platform != 'electron'). Com UA, fechamos esse buraco.
    const ua = (request?.headers?.['user-agent']) || '';
    const electronMatch = ua.match(/Electron\/(\d+\.\d+\.\d+)/i);
    const isElectronUA = !!electronMatch;
    const p  = { ws, id, name:'Anônimo', x:50, y:50, dir:'down', floor:0, hp:100, maxHp:100, connectedAt: Date.now(), isElectronUA, electronVer: electronMatch?.[1] || null };
    // Inicializa inv/equipped/chests/gold/skills JÁ na conexão (não só no join). Sem isto, um
    // player conectado-mas-não-joinado fica no Map com p.inv=undefined → um tick/handler que
    // itere `players` e toque p.inv sem guarda (ex.: pkDeath drop) dava TypeError. (audit 29/05)
    ensurePlayerInvSlots(p);
    players.set(id, p);
    counters.connections_total++;
    console.log(`[+] ${id} conectou (${players.size} online)${isElectronUA ? ` electron/${p.electronVer}` : ''}`);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // Envelope try/catch: qualquer throw num handler (forja em save legado,
        // race com tickAI, undefined dereference) cairia o processo inteiro
        // levando 50+ players juntos. Registra via recordError e continua.
        try {

        // Heartbeat app-level — cliente manda a cada ~25s pra evitar idle timeout
        // de proxies (Cloudflare/Railway costumam fechar WS após 60s sem dados C→S).
        if (msg.t === 'ping') {
            try { ws.send(JSON.stringify({ t:'pong' })); } catch {}
            return;
        }

        // ─── Rate-limit global de mensagens (audit 2026-06-03) ─────────────
        // Token bucket por conexão — defesa primária contra flood de amplificação
        // (handlers que re-broadcastam: pvp/float/attackVfx/playerSync/invEquip). ping é
        // isento (acima) pra nunca matar o heartbeat; auth+gameplay passam por aqui. Generoso:
        // descarta excedente (não desconecta no 1º estouro) e só derruba flood sustentado.
        {
            const nowMsg = Date.now();
            const lastTok = p._msgTokAt || nowMsg;
            p._msgTok = Math.min(MSG_BUCKET_CAP, (p._msgTok ?? MSG_BUCKET_CAP) + (nowMsg - lastTok) / 1000 * MSG_BUCKET_REFILL);
            p._msgTokAt = nowMsg;
            if (p._msgTok < 1){
                p._msgDropped = (p._msgDropped || 0) + 1;
                if (p._msgDropped >= MSG_FLOOD_DISCONNECT){
                    console.warn(`[flood] ${p.authedName || p.name || id} descartou ${p._msgDropped} msgs (flood sustentado) — fechando ws`);
                    try { ws.close(4029, 'msg-flood'); } catch {}
                }
                return;   // descarta a mensagem excedente
            }
            p._msgTok -= 1;
            // zera o contador de abuso só quando o cliente volta a ficar ocioso (bucket > meio cheio),
            // pra um pico legítimo não acumular rumo ao disconnect, mas um flood contínuo acumular.
            if (p._msgDropped && p._msgTok > MSG_BUCKET_CAP * 0.5) p._msgDropped = 0;
        }

        // ─── AUTH (precede join) ──────────────────────────────────────────
        // Cliente manda hash leve da senha; server aplica sha256(salt+hash).
        // Cria conta se não existir, devolve save server-side se houver.
        if (msg.t === 'auth') {
            // Lock de manutenção: rejeita novas conexões na janela do deploy (auto-expira;
            // o processo novo nasce com lock=0). Evita reconectar no server velho a ser morto.
            if (Date.now() < _maintenanceLockUntil){
                ws.send(JSON.stringify({ t:'authFail', reason:'maintenance' }));
                setTimeout(() => { try { ws.close(4030, 'maintenance'); } catch {} }, 200);
                return;
            }
            // Version gate: bloqueia Electron desatualizado. Source of truth é
            // o User-Agent (detectado na connection — `p.isElectronUA`). Não
            // dá pra confiar só em msg.platform porque cliente antigo (v1.0.6-)
            // simplesmente não envia esse campo. Browser sempre passa
            // (Vercel = latest); só ataca Electron.
            const clientVersion = String(msg.clientVersion || '').trim();
            if (p.isElectronUA){
                const noVer = !clientVersion;
                const tooOld = clientVersion && isVersionTooOld(clientVersion, MIN_CLIENT_VERSION);
                if (noVer || tooOld){
                    console.log(`[auth] electron desatualizado bloqueado: app=v${clientVersion || '?'} electron=v${p.electronVer || '?'} (min app ${MIN_CLIENT_VERSION})`);
                    ws.send(JSON.stringify({
                        t: 'versionTooOld',
                        current: clientVersion || null,
                        required: MIN_CLIENT_VERSION,
                        downloadUrl: CLIENT_DOWNLOAD_URL,
                    }));
                    setTimeout(() => { try { ws.close(4001, 'version-too-old'); } catch {} }, 200);
                    return;
                }
            }
            const name = String(msg.name || '').trim().substring(0, 14);
            const pwHash = String(msg.pwHash || '');
            const pwHashLegacy = String(msg.pwHashLegacy || '');   // djb2 (migração dual-format pwHash)
            if (!validAccountName(name)){
                ws.send(JSON.stringify({ t:'authFail', reason:'bad_name' }));
                return;
            }
            if (!pwHash){
                ws.send(JSON.stringify({ t:'authFail', reason:'no_password' }));
                return;
            }
            // Rate limit (audit 29/05): antes não havia limite no auth → atacante
            // podia spamar pwHashes brute-force. Agora cap em 5 tentativas/30s
            // por conexão. Atingiu o cap → recusa imediato + warn.
            const nowAuth = Date.now();
            p._authAttempts = (p._authAttempts || []).filter(t => nowAuth - t < 30000);
            if (p._authAttempts.length >= 5){
                console.warn(`[auth] rate limit ${p._authAttempts.length} tentativas em 30s — fechando ws`);
                ws.send(JSON.stringify({ t:'authFail', reason:'rate_limited' }));
                setTimeout(() => { try { ws.close(4029, 'auth-rate-limit'); } catch {} }, 200);
                return;
            }
            p._authAttempts.push(nowAuth);
            // ── Verificação de conta ASSÍNCRONA (audit 2026-06-03 — anti-DoS de event-loop) ──
            // scrypt fora do event loop (crypto.scrypt) pra um flood de login não congelar
            // movimento/combate/chat de TODOS (scryptSync bloqueava ~15ms cada). O guard
            // p._authPending impede vários scrypts concorrentes no mesmo socket. A conclusão
            // (matar-sessão + authOk) roda no callback; o resto do switch segue síncrono e intocado.
            if (p._authPending) return;   // já há uma auth em voo neste socket
            p._authPending = true;
            const optEmail = isValidEmail(msg.email) ? msg.email : null;
            const existingAcc = getAccount(name);
            const onAuthErr = (e) => {
                p._authPending = false;
                recordError({ kind:'auth', player:name, msg:e && e.message, stack:e && e.stack });
                try { ws.send(JSON.stringify({ t:'authFail', reason:'server_error' })); } catch {}
            };
            // Conclui a auth com a conta já resolvida. Espelha EXATAMENTE o fluxo síncrono antigo.
            const finishAuth = (acc, isNew) => {
                p._authPending = false;
                if (!ws || ws.readyState !== 1) return;   // socket fechou durante o scrypt → aborta
                // Auth ok — limpa contador
                p._authAttempts = [];
                p.authed = true;
                p.authedName = acc.name;
                // ★ CAUSA-RAIZ DO WIPE: mata QUALQUER outra sessão da mesma conta (viva OU fantasma).
                // removeGhostsByName só pegava ghosts JÁ `disconnected` e casava por `op.name` (que é
                // 'Anônimo' até o join) → uma 2ª sessão VIVA escapava, e era ELA, com p.* vazio, que
                // gravava save vazio por cima do bom. Aqui casa por authedName e DERRUBA a antiga
                // (fechar o WS → close handler só deleta quando disconnected, não salva; trava cobre o resto).
                const _accLower = acc.name.toLowerCase();
                for (const [oid, op] of players){
                    if (oid === id) continue;
                    const sameAcct = (op.authedName && op.authedName.toLowerCase() === _accLower) || (op.name === acc.name);
                    if (!sameAcct) continue;
                    op.disconnected = true;
                    try {
                        if (op.ws && op.ws.readyState === 1){
                            op.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text:'Sua conta entrou em outro lugar — esta sessão foi encerrada.' }));
                            op.ws.close(4031, 'session-replaced');
                        }
                    } catch {}
                    players.delete(oid);
                    broadcast(null, { t:'leave', id: oid });
                }
                ws.send(JSON.stringify({
                    t:'authOk', isNew, save: acc.save || null, savedAt: acc.savedAt || 0,
                    hasEmail: !!acc.email,
                }));
            };
            if (!existingAcc){
                // Email opcional no registro inicial — user pode adicionar depois.
                // Se passou email inválido ou em uso, conta é criada sem ele.
                createAccount(name, pwHash, optEmail).then(acc => {
                    console.log(`[auth] nova conta: ${name}${acc.email ? ' (com email)' : ''}`);
                    finishAuth(acc, true);
                }).catch(onAuthErr);
            } else {
                verifyAccount(name, pwHash, pwHashLegacy).then(ok => {
                    if (!ok){
                        p._authPending = false;
                        try { ws.send(JSON.stringify({ t:'authFail', reason:'bad_password' })); } catch {}
                        return;
                    }
                    finishAuth(existingAcc, false);
                }).catch(onAuthErr);
            }
            return;
        }

        // ─── PORTÃO DE AUTENTICAÇÃO (audit 2026-06-03 — CRÍTICO) ───────────
        // Tudo que não seja ping/auth (ambos já tratados acima, cada um com seu
        // próprio return) exige sessão autenticada. Sem isto, um socket podia
        // mandar `join` com name='alcione' (sem senha) e o isAdmin(p.name) POR
        // NOME o tratava como admin total (/gold infinito, /deluser, etc).
        // Agora nenhum handler com estado roda sem auth, e a autorização de
        // admin usa p.authedName (conta provada), nunca o p.name falsificável.
        if (!p.authed || !p.authedName) return;

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
                    sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.save_too_big', {kb: (sz/1024).toFixed(1)}) });
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
            // ─── Quest state: completed + questFlags são SERVER-AUTORITATIVOS (audit 2026-06-03)
            // Antes o cliente reenviava completed:[] / questFlags zerados a cada save e
            // re-reivindicava quests infinitamente (gold/itens/permaBuffs ilimitados via
            // questTurnIn). Agora o server IGNORA esses dois campos no saveUpload e mantém os
            // seus (mutados só por questTurnIn). `active` e `daily` seguem do cliente — active
            // é só "em quais quests estou"; daily tem anti-replay próprio em p.dailyClaim.
            if (data.quests && typeof data.quests === 'object'){
                p.quests = p.quests || { active:{}, completed:[], daily:null };
                // active: o cliente diz EM QUAIS quests está; mas o `progress` de mob é
                // SERVER-AUTORITATIVO (Lote 1b) — preserva o do server, IGNORA o do cliente
                // (senão F12 forja progress e reivindica sem matar). Quest nova entra em 0;
                // o server incrementa em creditQuestKill. (Caveat: quest de mob em andamento
                // no deploy recontа do zero — item-quest não afeta, deriva do inventário.)
                const _clientActive = (data.quests.active && typeof data.quests.active === 'object') ? data.quests.active : {};
                const _prevActive = p.quests.active || {};
                const _mergedActive = {};
                for (const _qid of Object.keys(_clientActive)){
                    const _prev = _prevActive[_qid];
                    _mergedActive[_qid] = { progress: (_prev && typeof _prev.progress === 'number') ? _prev.progress : 0 };
                }
                p.quests.active = _mergedActive;
                p.quests.daily  = (data.quests.daily && typeof data.quests.daily === 'object') ? data.quests.daily : null;
                if (!Array.isArray(p.quests.completed)) p.quests.completed = [];   // completed: preserva o do server
            }
            // questFlags (progresso de chains): server é dono — NÃO honra o do cliente.
            if (data.flags && typeof data.flags === 'object') p.flags = data.flags;
            // talents + permaBuffs são SERVER-AUTORITATIVOS (talentAlloc/talentRespec/quests).
            // saveUpload NÃO os toca — o cliente envia por compat, mas o server IGNORA e persiste
            // os valores VIVOS (lockdown abaixo). 🐛 FIX: o loop antigo fazia `p.talents[tid]=true`,
            // COLAPSANDO os ranks multi-rank pra 1 a cada save ("rankeio um talento e o outro reseta").
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
            // M6 Tinturaria — server é dono. Sobrescreve qualquer dyes do cliente
            // pelos valores autoritativos atuais (alteráveis só via handler dyeItem).
            data.dyes = p.dyes || {};
            // ★ LOCKDOWN N3 — ENFORCEMENT (antes era só comentário!). setPlayerSave faz
            // `a.save = data` as-is, e o join re-hidrata p.gold/inv/skills/equipped/chests
            // desse save. Sem sobrescrever aqui pelos valores VIVOS do server, um cliente
            // forjava {t:'saveUpload', data:{gold:1e8, inv:{...}, skills:{tudo 200}}} →
            // reconectava → server carregava como legítimo (furava o lockdown E a venda
            // de gold). Cliente honesto: data.* já == p.*, então é no-op. Forjador: bloqueado.
            if (typeof p.gold === 'number' && isFinite(p.gold)) data.gold = p.gold;
            if (p.inv && typeof p.inv === 'object')      data.inv = p.inv;
            if (p.skills && typeof p.skills === 'object') data.skills = p.skills;
            if (p.equipped && typeof p.equipped === 'object') data.equipped = p.equipped;
            if (p.chests && typeof p.chests === 'object') data.chests = p.chests;
            // talents (RANKS) + permaBuffs: persiste os do SERVER (vivos), não os do cliente —
            // senão o save do cliente reverteria os ranks (era a causa do "reseta ao escolher outro").
            if (p.talents && typeof p.talents === 'object') data.talents = p.talents;
            if (p.permaBuffs && typeof p.permaBuffs === 'object') data.permaBuffs = p.permaBuffs;
            // M6 Pet — server-autoritativo (nível/xp concedido na morte; equip via playerSync).
            // Persiste o estado VIVO do server (igual talents/permaBuffs); ignora o do cliente.
            if (p.pets && typeof p.pets === 'object') data.pets = p.pets;
            // Quest state autoritativo (audit 2026-06-03): persiste o p.quests / p.questFlags
            // VIVOS do server — completed + progresso de chain são mutados SÓ por questTurnIn.
            // Nunca os do cliente, que reenviava completed:[] / flags zerados pra re-claim infinito.
            if (p.quests && typeof p.quests === 'object') data.quests = p.quests;
            if (p.questFlags && typeof p.questFlags === 'object') data.questFlags = p.questFlags;
            data.pet = p.pet || null;
            // Lockdown do anti-replay de daily: server é dono (cliente forjava claimed:[]
            // pra re-claim). p.dailyClaim só muda no handler de daily; aqui só persiste.
            data.dailyClaim = p.dailyClaim || null;
            data.scReadyAt = p.scReadyAt || 0;   // 🕯️ Segunda Chance: cooldown persiste (server-autoritativo, timestamp absoluto)
            // ★ TRAVA ANTI-WIPE: nunca deixa um save vazio-default sobrescrever um acc.save
            // populado. Foi ISSO que zerou contas — uma sessão fantasma (p.* vazio, ex.: 2ª
            // conexão no reconnect do deploy) gravava {gold:0, inv:{}, skills base} por cima
            // do save cheio. `data` aqui já reflete p.* (lockdown acima). Se o que vai gravar
            // está vazio mas o save guardado está cheio → RECUSA (não persiste).
            const _accSave = getAccount(p.authedName);
            if (_accSave && !isEmptyDefaultSaveServer(_accSave.save) && isEmptyDefaultSaveServer(data)){
                console.warn(`[save] RECUSADO empty-over-full de ${p.authedName} (trava anti-wipe)`);
                return;
            }
            setPlayerSave(p.authedName, data);
            return;
        }

        // ─── Recuperação one-shot de conta zerada por bug (gated por admin) ───
        if (msg.t === 'restoreUpload') {
            if (!p.authed || !p.authedName) return;
            const acc = getAccount(p.authedName);
            if (!acc || !(acc._restoreUntil > Date.now())){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.restore_not_allowed') });
                return;
            }
            // Só restaura SOBRE conta zerada — impede forjar por cima de save cheio.
            if (!isEmptyDefaultSaveServer(acc.save)){
                acc._restoreUntil = 0;
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.restore_only_empty') });
                return;
            }
            const data = msg.data;
            if (!data || typeof data !== 'object'){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.backup_invalid') }); return; }
            try { if (JSON.stringify(data).length > SAVE_MAX_BYTES){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.backup_too_big') }); return; } } catch { return; }
            if (isEmptyDefaultSaveServer(data)){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.backup_also_empty') }); return; }
            sanitizeSave(data, p.authedName);   // clampa gold/skills
            acc.save = data;
            acc.savedAt = Date.now();
            acc._restoreUntil = 0;
            queueSaveAccounts();
            console.log(`[restore] ${p.authedName}: acc.save gravado do backup (gold=${data.gold || 0})`);
            sendTo(id, { t:'serverMsg', level:'event', text: trp(p, 'srv.backup_saved', {gold: data.gold||0}) });
            return;
        }

        if (msg.t === 'join') {
            // Auth é obrigatório (portão acima) → o nome é SEMPRE o da conta provada.
            // Nunca confiar em msg.name: era o vetor de impersonate e de admin sem
            // senha (join com name='alcione'). (audit 2026-06-03)
            p.name = p.authedName;
            p.lang = (msg.lang === 'en') ? 'en' : 'pt';   // i18n Opção B: idioma do player p/ serverMsg (fallback PT)
            // Posição AUTORITATIVA (audit 2026-06-03): ignora msg.x/msg.y (era teleporte p/
            // qualquer tile do overworld + fuga de PvP por reconexão). Default = spawn seguro;
            // o bloco do save abaixo sobrescreve pela ÚLTIMA posição PERSISTIDA no server,
            // validada. A janela pós-restart ainda força a PZ.
            p.x     = SAFE_CX;
            p.y     = SAFE_CY;
            p.pvp   = !!msg.pvp;
            p.hp    = msg.hp ?? 100;
            p.maxHp = msg.maxHp ?? 100;
            // N3 fase 2: hidrata inv/equipped/gold/chests do save (server vira dono).
            // Se cliente legado (sem auth) ou conta nova, pega do msg como antes.
            ensurePlayerInvSlots(p);
            const acc = p.authedName ? getAccount(p.authedName) : null;
            if (acc && acc.save){
                // Posição: última PERSISTIDA no server (validada). Default SAFE acima cobre
                // save sem x/y, tile inválido, ou logout na masmorra (coord não-walkable no
                // overworld → cai na PZ). Fecha o teleporte por msg.x/y forjado. (audit 2026-06-03)
                { const _x = Math.floor(Number(acc.save.x)), _y = Math.floor(Number(acc.save.y));
                  if (Number.isFinite(_x) && Number.isFinite(_y) && isWalkable(_x, _y)){ p.x = _x; p.y = _y; } }
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
                // Anti-replay de daily: hidrata SÓ do save server-side (nunca de data do saveUpload)
                if (acc.save.dailyClaim && typeof acc.save.dailyClaim === 'object') p.dailyClaim = acc.save.dailyClaim;
                if (typeof acc.save.scReadyAt === 'number') p.scReadyAt = acc.save.scReadyAt;   // 🕯️ Segunda Chance cooldown
                if (acc.save.questFlags && typeof acc.save.questFlags === 'object') p.questFlags = acc.save.questFlags;
                if (acc.save.flags && typeof acc.save.flags === 'object') p.flags = acc.save.flags;
                if (acc.save.permaBuffs && typeof acc.save.permaBuffs === 'object') p.permaBuffs = acc.save.permaBuffs;
                if (acc.save.talents && typeof acc.save.talents === 'object'){
                    p.talents = {};
                    for (const tid of Object.keys(acc.save.talents)){
                        if (!TALENT_DEFS[tid]) continue;
                        // preserva o RANK (multi-rank); legado boolean `true` → Number(true)=1
                        const v = Math.max(0, Math.min(TALENT_DEFS[tid].max || 1, Math.floor(Number(acc.save.talents[tid]) || 0)));
                        if (v > 0) p.talents[tid] = v;
                    }
                }
                // M6 Tinturaria: hidrata tintas autoritativas do save.
                if (acc.save.dyes && typeof acc.save.dyes === 'object'){
                    p.dyes = {};
                    for (const slot of ['armor','head','feet','cosmetic']){
                        const c = acc.save.dyes[slot];
                        if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) p.dyes[slot] = c;
                    }
                }
                // M6 Pet — hidrata estado autoritativo (sanitiza: só keys conhecidas,
                // nível clampado a [1,maxLvl], xp ≥ 0). Equipado só vale se for dono.
                if (acc.save.pets && typeof acc.save.pets === 'object'){
                    p.pets = {};
                    for (const k of Object.keys(acc.save.pets)){
                        const def = PET_DEFS[k]; if (!def) continue;
                        const rec = acc.save.pets[k]; if (!rec || typeof rec !== 'object') continue;
                        const lvl = Math.max(1, Math.min(def.maxLvl, Math.floor(Number(rec.lvl) || 1)));
                        const xp = Math.max(0, Math.floor(Number(rec.xp) || 0));
                        p.pets[k] = { lvl, xp };
                    }
                }
                if (typeof acc.save.pet === 'string' && p.pets && p.pets[acc.save.pet]) p.pet = acc.save.pet;
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
            // Reconexão logo após deploy/restart: cura cheio E joga na Zona Segura
            // (procedimento de manutenção). O player não teve culpa de cair, e voltar
            // no meio do mapa/masmorra era o "cai no mato". A posição (50,50) vai no
            // snapshot do state → o cliente aplica sozinho (linha "Server é autoritativo
            // em x/y"). Só vale na janela pós-boot → NÃO é fuga de PvP em reconexão
            // normal. Fora da janela: mantém a posição do save.
            const postRestart = Date.now() - SERVER_BOOT_TIME < POST_BOOT_HEAL_MS;
            if (postRestart){
                p.hp = p.maxHp;
                p.mp = p.maxMp;
                p.x = SAFE_CX; p.y = SAFE_CY;   // centro da PZ (cidade)
                console.log(`[restart] ${p.name} curado + levado pra PZ pós-restart`);
            }
            if (p.hp == null) p.hp = p.maxHp;
            if (p.mp == null) p.mp = p.maxMp;
            // Limpa TODOS os ghosts com mesmo nome — não dá pra confiar que só existe 1
            // (race condition de reconexões rápidas, ou WS órfão antes do join).
            removeGhostsByName(p.name, id);
            console.log(`    ${id} = ${p.name}${isAdmin(p.name) ? ' [admin]' : ''}`);
            // M4: login sempre nasce no overworld (masmorra é efêmera — deslogar
            // lá embaixo te traz pra cidade). Snapshots filtrados pelo floor do player.
            p.floor = 0;
            ws.send(JSON.stringify({
                t:'state', you: id,
                players: snapshotPlayers(p.floor),
                mobs: snapshotMobs(p.floor),
                motd: SERVER_MOTD_RUNTIME,
                isAdmin: isAdmin(p.name),
                dailyEvent: dailyEventSnapshot(),
                groundDrops: snapshotGroundDrops(p.floor),
                maintenance: postRestart || undefined,   // cliente mostra toast "levado pra PZ"
            }));
            // Manda inv/equipped/gold/chests autoritativos pro cliente após o join,
            // pra cobrir o caso do save server ser mais recente que o save local.
            sendInvUpdate(p, { chests: p.chests, pets: p.pets || {}, pet: p.pet || null, reason:'join' });
            // Recuperação: se admin liberou (_restoreUntil), pede o backup local do cliente.
            if (acc && acc._restoreUntil && acc._restoreUntil > Date.now()){
                sendTo(id, { t:'restoreMode' });
            }
            // Sincroniza estado da party: cliente pode ter widget stale se perdeu
            // partyUpdate enquanto offline. Garante que após (re)conexão o widget bate
            // com o server (ou some, se ele não está mais em party).
            const myParty = findPartyOfPlayer(p.name);
            if (myParty){
                ws.send(JSON.stringify({ t:'partyUpdate', partyId: myParty.id, leader: myParty.leader, members: myParty.members }));
            } else {
                ws.send(JSON.stringify({ t:'partyUpdate', deleted: true }));
            }
            broadcast(id, { t:'join', player: { id:p.id, name:p.name, x:p.x, y:p.y, dir:p.dir, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp, equipped: p.equipped || null, cosmetic: p.cosmetic || null, pet: p.pet || null, badges: p.badges || [], dyes: p.dyes || null, guild: findGuildOfPlayer(p.name)?.name || null } }, p.floor);
            // Anuncia entrada (só pros outros)
            broadcastMsgKey('info', 'srv.entered_world', {name: p.name}, null, id);
            return;
        }

        if (msg.t === 'pos') {
            // Rate-limit anti-flood: cada pos re-broadcasta pro andar inteiro. O cliente
            // legítimo anda no máximo 1 tile/80ms (playerMoveDelay tem piso Math.max(80,…)),
            // então 40ms dá 2× de folga — nunca dropa movimento real (mesmo com jitter) e
            // corta o flood de milhares/s. Campo dedicado pra não colidir com outros gates.
            const _now = Date.now();
            if (p._lastPosAt && _now - p._lastPosAt < 40) return;
            p._lastPosAt = _now;
            // Sanitiza/clampa coords antes de aceitar (cliente malicioso poderia
            // enviar {x:99999, y:99999} e quebrar tickAI/inCave/tileAt)
            const nx = Math.max(0, Math.min(M_W - 1, Math.floor(Number(msg.x)) || 0));
            const ny = Math.max(0, Math.min(M_H - 1, Math.floor(Number(msg.y)) || 0));
            // ── Movimento autoritativo (anti-teleporte) ──────────────────────────
            // O cliente legítimo anda 1 tile/vez pra tile caminhável (mapa determinístico
            // + walkable IDÊNTICO ao server; na masmorra, o grid veio do server). Forjar
            // {t:'pos', x, y} pulava pra QUALQUER lugar — parede/água, rush da masmorra
            // 1→5, fuga instantânea de PvP. Agora exige adjacência (cheby ≤1) + tile
            // caminhável; senão NÃO move e devolve posCorrect (snap-back). EXCEÇÃO: respawn
            // (morte/bênção) teleporta pro spawn — _posGraceUntil (setado nos sites de
            // morte) libera UM pos não-adjacente. Como só nasce APÓS morrer de verdade, o
            // player vivo não foge nem rusha por aqui (e o morto já pagou a penalidade).
            if (p._posGraceUntil && _now < p._posGraceUntil){
                p._posGraceUntil = 0;   // one-shot
                p.x = nx; p.y = ny;
            } else if (chebyshev(p.x, p.y, nx, ny) <= 1 && playerTileWalkable(p, nx, ny)){
                p.x = nx; p.y = ny;
            } else {
                sendTo(id, { t:'posCorrect', x: p.x, y: p.y, dir: p.dir });
                return;
            }
            p.dir = (typeof msg.dir === 'string' && msg.dir.length < 8) ? msg.dir : p.dir;
            if ((p.floor || 0) === 0) creditQuestVisit(p, p.x, p.y);   // Lote 1b: visita de quest server-auth
            // Lockdown N3: hp/maxHp são server-authoritative. msg.hp/msg.maxHp do
            // cliente NUNCA são aceitos aqui (F12 `{t:'pos',hp:99999}` virava invencível).
            // Mutações de hp vêm de tickAI/tickPlayerDots/pvpAttack/spellCast/invConsume
            // /playerDeath/recomputeMaxStats — esses já chamam broadcastPstatsAll.
            // Se um mob acabou no mesmo tile (race com tickAI), empurra
            bumpMobAwayFrom(p.x, p.y, p.floor);
            broadcast(id, { t:'pos', id, x:p.x, y:p.y, dir:p.dir, hp:p.hp, maxHp:p.maxHp }, p.floor);
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
            // Throttle do BROADCAST (audit 2026-06-03): toggle de PvP é humano/raro e este era
            // o pior fan-out (global por mensagem). O ESTADO já foi atualizado acima; aqui só
            // limitamos o re-broadcast a ~3/s. Eventual consistência via playerSync/snapshot.
            const nowPvp = Date.now();
            if (p._lastPvpBcastAt && nowPvp - p._lastPvpBcastAt < 300) return;
            p._lastPvpBcastAt = nowPvp;
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
            // Cap text/color do cliente: sem isto propaga string ilimitada pro andar
            // inteiro (custo de banda). Não é XSS (renderiza em canvas), só limita abuso.
            const text = typeof msg.text === 'string' ? msg.text.slice(0, 48) : '';
            if (!text) return;
            const color = typeof msg.color === 'string' ? msg.color.slice(0, 16) : '#ffffff';
            broadcast(id, { t:'float', id, text, color, big:!!msg.big });
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
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_consumable') });
                return;
            }
            if (!hasInv(p, key, 1)){
                sendInvUpdate(p, { consume:{ ok:false, key, reason:'no_item' } });
                return;
            }
            incInv(p, key, -1);
            // HP/food e MP/potion: aplicação instant + autoritativa (lockdown N3 ignora
            // hp/mp do client). A poção de mana já foi regen-over-time (manaBuff), mas o
            // gotejamento (8mp/s) brigava com o gasto de mana em combate e travava a
            // re-bebida por 10s → revertido pra restauração direta (cura na hora).
            const maxHp = p.maxHp || 100;
            const maxMp = p.maxMp || 0;
            let healed = 0, manaHealed = 0;
            if (meta.heal && (p.hp ?? 0) < maxHp){
                healed = Math.min(meta.heal, maxHp - (p.hp ?? 0));
                p.hp = Math.min(maxHp, (p.hp ?? 0) + meta.heal);
            }
            if (meta.manaheal && maxMp > 0 && (p.mp ?? 0) < maxMp){
                manaHealed = Math.min(meta.manaheal, maxMp - (p.mp ?? 0));
                p.mp = Math.min(maxMp, (p.mp ?? 0) + meta.manaheal);
            }
            sendInvUpdate(p, { consume:{ ok:true, key, heal: meta.heal || 0, manaheal: meta.manaheal || 0, healed, manaHealed } });
            if (healed > 0 || manaHealed > 0) broadcastPstatsAll(p);
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
            // Mercador em (47,47) — sync com NPCS.mercador em play.html.
            if (Math.max(Math.abs(p.x - 47), Math.abs(p.y - 47)) > 1){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.near_merchant') }); return;
            }
            if (op === 'buy'){
                const offer = SHOP_BUY[msg.idx | 0];
                if (!offer){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_offer') }); return; }
                if ((p.gold || 0) < offer.price){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_gold_g', {g: offer.price}) }); return; }
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
                if (!ITEM_META[tier.base]){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_item') }); return; }
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
            if (!r){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_recipe') }); return; }
            // Tem que estar perto da bancada (51,52) — chebyshev ≤ 1
            if (Math.max(Math.abs(p.x - 51), Math.abs(p.y - 52)) > 1){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.near_bench') }); return;
            }
            for (const [k, q] of Object.entries(r.in)){
                if (!hasInv(p, k, q)){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_material', {k, q}) }); return; }
            }
            const cost = itemGoldCost(r.out);
            if ((p.gold || 0) < cost){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_gold_g', {g: cost}) }); return; }
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
            if (!baseMeta){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_item_forge') }); return; }
            const targetPlus = tier.plus + 1;
            if (targetPlus > UPGRADE_MAX){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.max_level', {n: UPGRADE_MAX}) }); return; }
            const have = (p.inv && p.inv[itemKey]) || 0;
            if (have < 3){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.need_3x_forge') }); return; }
            const cost = forgeCostFor(tier.base, targetPlus);
            if ((p.gold || 0) < cost){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_gold_g', {g: cost}) }); return; }
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
            if (!def){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_item') }); return; }
            const slot = SLOT_OF_KIND[def.kind];
            if (!slot){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_equipable') }); return; }
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
            broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, pet:p.pet||null, equipped:p.equipped, badges:p.badges || [] });
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
            broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, pet:p.pet||null, equipped:p.equipped, badges:p.badges || [] });
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
                // Pickup auto-range: chebyshev ≤2 (5×5, mesma regra do cliente pickupAt). #3/#6:
                // era ≤1, mas o drop 3×3 do mob + você atacando a 1 tile deixava o loot de trás
                // (a 2 tiles) inalcançável até andar pra lá.
                if (Math.max(Math.abs(p.x - d.x), Math.abs(p.y - d.y)) > 2) continue;
                // Anti-ninja: durante a janela de lock, só o dono (top-damager) + a party
                // dele catam. Depois de ownerUntil, vira livre pra qualquer um.
                if (d.ownerUntil && Date.now() < d.ownerUntil && d.owner != null && d.owner !== p.id){
                    const op = d.ownerName ? findPartyOfPlayer(d.ownerName) : null;
                    const sameParty = !!(op && op.members.some(n => n.toLowerCase() === p.name.toLowerCase()));
                    if (!sameParty) continue;   // ainda travado pra esse player
                }
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
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_chest') });
                return;
            }
            // Adjacência ao baú (chebyshev ≤ 1)
            const pos = CHEST_POS[cid];
            if (Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y)) > 1){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.near_chest') });
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
            sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_chest_op') });
            return;
        }

        // PvP entre players (vivo ou ghost)
        if (msg.t === 'pvpAttack') {
            const tgt = players.get(msg.targetId);
            if (!tgt) return;
            // Rate limit: 400ms entre hits PvP (sem isso, F12 → 100 hits/s + farm
            // infinito de XP de skill via gainSkillXpServer abaixo).
            const nowPvp = Date.now();
            if (nowPvp - (p._lastPvpAt || 0) < 400) return;
            p._lastPvpAt = nowPvp;
            // M7 Arena: durante o countdown ninguém bate; e o alvo só pode ser o oponente da partida.
            if (p.arena){
                if (Date.now() < p.arena.fightAt) return;
                if (tgt.id !== p.arena.opponentId) return;
            }
            // Duelo consensual: permite ataque mesmo sem PvP toggle, se for o oponente
            const inDuel = p.duel && p.duel.opponentId === tgt.id && tgt.duel && tgt.duel.opponentId === id;
            // Bot 007 — qualquer player pode atacar sem precisar de PvP toggle
            const isBotTarget = !!tgt._isBot;
            if (!inDuel && !isBotTarget){
                if (!p.pvp) return;
                if (!tgt.pvp && !tgt.disconnected) return;   // se vivo, precisa estar com PvP
            }
            // PZ server-side (audit 2026-06-03): a regra "não ataca na Zona Segura" só existia
            // no cliente → um frame WS cru atacava/saqueava na PZ (inclusive o corpo ghost de
            // quem deslogou na cidade, que nem exige tgt.pvp). Aborta se atacante OU alvo estiver
            // na safe zone. Duelo consensual e bot 007 ficam de fora (combate combinado).
            if (!inDuel && !isBotTarget && (playerInSafe(p) || playerInSafe(tgt))) return;
            // Caps server-side: cliente envia amount/range mas sem cap aceitaria
            // {amount:99999, range:999} one-shottando alvo do outro lado do mapa.
            const rangeCap = pvpRangeCapServer(p);
            const range = Math.max(1, Math.min(rangeCap, msg.range | 0 || 1));
            if (chebyshev(p.x, p.y, tgt.x, tgt.y) > range) return;
            const dmgCap = pvpDamageCapServer(p);
            const amount = Math.max(1, Math.min(dmgCap, msg.amount | 0));
            // T3: XP de skill por hit PvP (autoritativo)
            const isRanged = range > 1;
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
            // 🕯️ Segunda Chance: 2s de imunidade pós-revive bloqueia até dano PvP (janela curta).
            if (!isBotTarget && (tgt._invulnUntil || 0) > Date.now()){
                if (tgt.ws && tgt.ws.readyState === 1){
                    try { tgt.ws.send(JSON.stringify({ t:'pvpHit', from:id, fromName:p.name, amount, actual:0 })); } catch {}
                }
                return;
            }
            // Fase 5: dano de PvP aplicado server-side com defesa percentual
            // (espelha cliente). pvpHit ainda é mandado pra FX/log/pkDeathBy
            // detection, mas com `actual` pra cliente NÃO aplicar local.
            // Bot 007 — defesa fixa, sem buffs aleatórios. E NÃO chama broadcastPstatsAll
            // (bot não tem ws e a função tenta enviar pros outros — usa broadcast direto)
            const def = isBotTarget ? BOT_DEFENSE : totalDefenseServer(tgt);
            const reduction = def > 0 ? def / (def + 30) : 0;
            const actual = Math.max(1, Math.round(amount * (1 - reduction)));
            const wasAlive = (tgt.hp ?? 100) > 0;
            if (wasAlive){
                tgt.hp = Math.max(0, (tgt.hp ?? 100) - actual);
                if (isBotTarget){
                    broadcast(null, { t:'pstats', id: tgt.id, hp: tgt.hp, maxHp: tgt.maxHp, mp: 0, maxMp: 0, cosmetic: null, pet: null, equipped: tgt.equipped, badges: tgt.badges || [] });
                } else {
                    broadcastPstatsAll(tgt);
                }
                // Marca quem foi o último atacante PvP (anti-cheat: previne
                // cúmplice fake creditar kill via msg.pkDeath forjado). Janela
                // de 8s — depois disso assume que dano não conta como "kill por X".
                if (!isBotTarget){
                    tgt._lastPvpAttackerId = id;
                    tgt._lastPvpAttackerName = p.name;
                    tgt._lastPvpAttackAt = Date.now();
                }
            }
            if (!isBotTarget && tgt.ws.readyState === 1){
                tgt.ws.send(JSON.stringify({ t:'pvpHit', from:id, fromName:p.name, amount, actual }));
            }
            // broadcast(null) inclui o atacante — antes ele não via o float do dano que dava
            broadcast(null, { t:'float', id:msg.targetId, text:`-${actual}`, color:'#ff3030', big:true });
            // Detecção morte do bot 007
            if (isBotTarget && tgt.hp === 0){
                killImpostorBot(p);
            }
            // Detecção morte autônoma server-side (PvP entre players). Antes:
            // a vítima tinha que mandar msg.pkDeath {killerId} e server confiava.
            // Cúmplice podia farmar kills no ranking forjando msgs. Agora o
            // server detecta sozinho quando hp chega a 0 por dano PvP e roda
            // todo o flow (transferência de gold, drop de highlander, ranking).
            // Marca `_pkServerHandled` pra ignorar a msg.pkDeath redundante.
            if (wasAlive && !isBotTarget && tgt.hp === 0 && !tgt._pkServerHandled){
                tgt._pkServerHandled = Date.now();
                processPkDeathServerSide(p, tgt);
            }
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
            // M6 Pet equipado: propaga pros outros. Só vale um pet que o player POSSUI.
            if ('pet' in msg){
                const pk = (typeof msg.pet === 'string' && msg.pet.length < 32 && p.pets && p.pets[msg.pet]) ? msg.pet : null;
                if (pk !== p.pet){ p.pet = pk; statsChanged = true; }
            }
            // Badges de conquista: até 2 strings curtas
            if (Array.isArray(msg.badges)){
                const bs = msg.badges.filter(s => typeof s === 'string' && s.length < 32).slice(0, 2);
                p.badges = bs;
                statsChanged = true;
            }
            if (statsChanged){
                broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, pet:p.pet||null, equipped:p.equipped, badges:p.badges || [], dyes: p.dyes || null });
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
                // Cliente envia { kind:'daily', dailyId }. Server lê a entry do save do
                // player (cliente é a fonte da lista do dia) só pra achar o goal, e valida
                // no pool usando a reward DA TABELA. ANTI-REPLAY é server-autoritativo via
                // p.dailyClaim — NÃO via daily.claimed do cliente, que era forjável: um
                // saveUpload com claimed:[] resetava → re-claim infinito de gold+XP.
                if (!isAdjacentTo(p, QUEST_NPCS.atendente)) return reject('not_at_npc');
                p.quests = p.quests || { active:{}, completed:[] };
                const daily = p.quests.daily || { list:[], claimed:[] };
                const dailyId = String(msg.dailyId || '');
                // id legítimo = d_<hoje>_<0..2> (espelha rollDailyQuests no cliente: 3/dia).
                // Limita a 3 claims/dia mesmo que o cliente forje a lista com N entries.
                const today = new Date().toISOString().slice(0, 10);
                const idm = /^d_(\d{4}-\d{2}-\d{2})_([0-2])$/.exec(dailyId);
                if (!idm || idm[1] !== today) return reject('unknown_quest');
                if (!p.dailyClaim || p.dailyClaim.day !== today) p.dailyClaim = { day: today, ids: [] };
                if (p.dailyClaim.ids.includes(dailyId)) return reject('already_done');
                const entry = (daily.list || []).find(q => q && q.id === dailyId);
                if (!entry || !entry.goal) return reject('unknown_quest');
                const pool = findDailyPoolEntry(entry.goal.kind, entry.goal.type, entry.goal.count);
                if (!pool) return reject('bad_daily');   // cliente forjou entry fake
                // valida items se kind='item'
                if (pool.kind === 'item' && !hasInv(p, pool.type, pool.count)) return reject('no_items');
                if (pool.kind === 'item') incInv(p, pool.type, -pool.count);
                p.dailyClaim.ids.push(dailyId);   // anti-replay autoritativo (persistido no lockdown)
                daily.claimed = daily.claimed || [];
                if (!daily.claimed.includes(dailyId)) daily.claimed.push(dailyId);   // cosmético p/ UI
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
                // Lote 1b: progresso de mob é server-autoritativo — valida no turn-in.
                if (q.goal.kind === 'mob'){
                    const prog = (p.quests.active[q.id] && p.quests.active[q.id].progress) | 0;
                    if (prog < q.goal.count) return reject('not_done');
                }
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
                // Lote 1b: mob/visit são server-autoritativos — valida progresso real.
                if (stage.kind === 'mob'  && ((progress[stage.id + '_kills']) | 0) < stage.count) return reject('not_done');
                if (stage.kind === 'visit' && !progress[stage.id + '_visited']) return reject('not_done');
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
        // o último cair em handleMobDeath (crédito via mob kill, não claim).
        if (msg.t === 'hlHuntTrigger') {
            const now = Date.now();
            p._lastHlHuntClaim = p._lastHlHuntClaim || 0;
            if (now - p._lastHlHuntClaim < HL_HUNT_COOLDOWN_MS){
                if (p.ws && p.ws.readyState === 1){
                    p.ws.send(JSON.stringify({ t:'hlHuntResult', ok:false, reason:'cooldown', retryAt: p._lastHlHuntClaim + HL_HUNT_COOLDOWN_MS }));
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
                    if (inSafe(x, y) || inCave(x, y) || inSanctuary(x, y)) continue;
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
                // ok:false não era tratado no cliente (falha silenciosa). serverMsg já renderiza.
                const txt = {
                    unknown_skill:'Skill desconhecida.', too_fast:'Calma — espere entre treinos.',
                    not_at_altar:'Treine Magia no Altar.', not_at_dummy:'Aproxime-se do Boneco de treino.',
                    no_gold:'Gold insuficiente pra treinar.',
                }[reason] || 'Não foi possível treinar.';
                sendTo(id, { t:'serverMsg', level:'warn', text: txt });
            };
            const skill = String(msg.skill || '');
            if (!p.skills || !p.skills[skill]) return reject('unknown_skill');
            // Rate limit
            const now = Date.now();
            p._lastTrainAt = p._lastTrainAt || 0;
            if (now - p._lastTrainAt < 1500) return reject('too_fast');
            p._lastTrainAt = now;
            // Adjacência: Magia treina no Altar, demais skills no Boneco
            const DUMMY = { x:49, y:52 };
            const ALTAR = { x:50, y:49 };
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
            // ⚠️ ESPELHO da tabela SPELLS do cliente (play.html ~10095) — a fonte canônica
            //    (nome/desc/tooltip). manaCost/range/damage DEVEM bater com lá, e as CHAVES
            //    também: o cliente envia spellKey=PROVOCACAO/FURIA (NÃO TAUNT/FURY) — chave
            //    errada cai no `if (!sp) return` e a magia sai de graça (sem mana/XP).
            const SPELLS_META = {
                FIREBALL: { manaCost: 20, range: 8, damage: 12 },
                HEAL:     { manaCost: 25, healBase: 30 },
                HEAL_GRUPO: { manaCost: 60, healBase: 25, groupRange: 8 },
                RAIO:     { manaCost: 15, range: 10, damage: 8 },
                EXORI:    { manaCost: 40, range: 3, damage: 11 },   // range = aoeRange
                PROVOCACAO: { manaCost: 25 },
                FURIA:    { manaCost: 35 },
                // Fase 3 — AoE novas (range = aoeRange; abre a janela que autoriza o attackMob)
                GLACIAL:    { manaCost: 45, range: 3, damage: 13 },
                TEMPESTADE: { manaCost: 60, range: 4, damage: 20 },
            };
            const spellKey = String(msg.spellKey || '');
            const sp = SPELLS_META[spellKey];
            if (!sp) return;
            // Fase Magos: magia de ATAQUE exige wand equipada (o cliente também gateia p/ UX).
            if (sp.range && sp.damage && wandBaseServer(p) === 0){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.need_wand') });
                return;
            }
            const now = Date.now();
            p._lastSpellAt = p._lastSpellAt || 0;
            if (now - p._lastSpellAt < 600) return;
            p._lastSpellAt = now;
            // Mana check + aplicar custo
            if ((p.mp ?? 0) < sp.manaCost){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_mana') });   // antes: spellResult ok:false (silencioso)
                return;
            }
            p.mp = Math.max(0, (p.mp ?? 0) - sp.manaCost);
            // Deploy 2a: magia de DANO abre uma janela curta que autoriza o attackMob
            // seguinte a usar o range/cap da MAGIA (não o da arma). A mana já foi paga e
            // validada acima → não dá pra forjar range de magia sem castar de verdade.
            // Exori (AoE) dispara vários attackMob no mesmo tick → a janela de 1s cobre o burst.
            if (sp.range) p._spellWindow = { range: sp.range, damage: (sp.damage || 12) + wandBaseServer(p), until: now + 1000 };
            // Cura em grupo — AoE de heal, alcança QUALQUER player em raio groupRange
            // (não precisa party). Cura o caster + outros players. Skipa bots e ghosts.
            let healedAmount = 0;
            let groupHealedCount = 0;
            if (sp.groupRange){
                const magiaSk = (p.skills && p.skills.Magia && p.skills.Magia.val) || 10;
                const baseAmount = sp.healBase + Math.floor(magiaSk / 2);
                for (const target of players.values()){
                    if (target._isBot) continue;
                    if (target.disconnected) continue;
                    if ((target.hp ?? 0) <= 0) continue;
                    if (chebyshev(target.x, target.y, p.x, p.y) > sp.groupRange) continue;
                    const mxHp = target.maxHp || 100;
                    if ((target.hp ?? 0) >= mxHp) continue;
                    const amt = Math.min(baseAmount + Math.floor(Math.random()*4) - 1, mxHp - (target.hp ?? 0));
                    if (amt <= 0) continue;
                    target.hp = Math.min(mxHp, (target.hp ?? 0) + amt);
                    if (target.id === p.id) healedAmount = amt;
                    broadcastPstatsAll(target);
                    broadcast(null, { t:'float', id: target.id, text:`+${amt}`, color:'#aaffaa', big:false });
                    groupHealedCount++;
                }
            } else if (sp.healBase){
                const magiaSk = (p.skills && p.skills.Magia && p.skills.Magia.val) || 10;
                const amount = sp.healBase + Math.floor(magiaSk / 2) + Math.floor(Math.random()*4) - 1;
                const maxHp = p.maxHp || 100;
                healedAmount = Math.min(Math.max(1, amount), maxHp - (p.hp ?? 0));
                if (healedAmount > 0){
                    p.hp = Math.min(maxHp, (p.hp ?? 0) + healedAmount);
                }
            }
            if (!sp.groupRange) broadcastPstatsAll(p);
            // Bot 007 ataca melee se for um dos membros heal — não precisa pstats extra
            // XP de Magia (compat — cliente continua enviando hits)
            const hits = Math.max(1, Math.min(5, msg.hits | 0 || 1));
            gainSkillXpServer(p, 'Magia', hits);
            sendSkillsOnly(p, 'spellCast');
            if (sp.healBase && p.ws.readyState === 1){
                p.ws.send(JSON.stringify({ t:'spellResult', ok:true, spellKey, healed: healedAmount, groupHealedCount }));
            }
            return;
        }

        // ─── M5: Talent allocation server-side ─────────────────────────────
        // Cliente envia { t:'talentAlloc', talentId }. Server valida que existe
        // ponto disponível (earned-used > 0), aplica permaBuff e devolve estado.
        if (msg.t === 'talentAlloc') {
            const reject = (reason) => {
                // ok:false não era tratado no cliente (falha silenciosa). serverMsg já renderiza.
                const txt = {
                    unknown_talent:'Talento desconhecido.', max_rank:'Esse talento já está no rank máximo.',
                    no_points:'Sem pontos de talento disponíveis.',
                }[reason] || 'Não foi possível alocar o talento.';
                sendTo(id, { t:'serverMsg', level:'warn', text: txt });
            };
            const tid = String(msg.talentId || '');
            const def = TALENT_DEFS[tid];
            if (!def) return reject('unknown_talent');
            p.talents = p.talents || {};
            const cur = Math.max(0, Math.floor(Number(p.talents[tid]) || 0));   // legado boolean → 1
            const max = def.max || 1;
            if (cur >= max) return reject('max_rank');
            if (talentPointsAvailable(p) < 1) return reject('no_points');
            // Aplica permaBuff (soma por rank)
            p.permaBuffs = p.permaBuffs || {};
            for (const [k, v] of Object.entries(def.buff)){
                p.permaBuffs[k] = (p.permaBuffs[k] || 0) + v;
            }
            p.talents[tid] = cur + 1;
            // Fase 5: hpBonus (Constituição) altera maxHp — recalcula server-side.
            if (def.buff && typeof def.buff.hpBonus === 'number'){
                recomputeMaxStatsServer(p);
                broadcastPstatsAll(p);
            }
            sendInvUpdate(p, {
                talentResult:{ ok:true, talentId: tid, rank: cur + 1, max },
                talents: p.talents,
                permaBuffs: p.permaBuffs,
            });
            return;
        }

        // Respec: zera os ranks e DEVOLVE os pontos, cobrando gold. Subtrai a contribuição de
        // cada talento do permaBuffs — preserva auras de QUEST (não recalcula do zero, sem risco
        // de apagar dodgeBonus da Aura do Vidente / xpBonus do Vendedor).
        if (msg.t === 'talentRespec') {
            p.talents = p.talents || {};
            const owned = Object.keys(p.talents).filter(t => TALENT_DEFS[t] && Math.floor(Number(p.talents[t]) || 0) > 0);
            if (!owned.length){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.nothing_respec') }); return; }
            const COST = 5000;
            if ((p.gold || 0) < COST){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.respec_cost', {g: COST}) }); return; }
            // RECALCULA o permaBuffs do ZERO (NÃO subtrai — a subtração deixava resíduo quando o
            // permaBuffs vinha INFLADO pelo bug do rank-colapso). Zera os talentos e reconstrói o
            // permaBuffs SÓ com as auras de QUEST (não-talento), re-derivadas das fontes:
            //   • xpBonus +5% → flag flag_vendedor_killed (Vendedor de Almas)
            //   • dodgeBonus +5% → posse do item AURA_VIDENTE (Aura do Vidente / Madame Crepúsculo)
            for (const tid of owned) delete p.talents[tid];
            const perma = {};
            if (p.flags && p.flags.flag_vendedor_killed) perma.xpBonus = 0.05;
            if (hasInv(p, 'AURA_VIDENTE', 1) || (p.equipped && p.equipped.cosmetic === 'AURA_VIDENTE')) perma.dodgeBonus = 0.05;
            p.permaBuffs = perma;
            p.gold -= COST; syncGoldRank(p.name, p.gold);
            recomputeMaxStatsServer(p);
            broadcastPstatsAll(p);
            sendInvUpdate(p, {
                talents: p.talents,
                permaBuffs: p.permaBuffs,
                goldDelta:{ amount: -COST, reason:'respec' },
                talentRespec:{ ok:true },
            });
            return;
        }

        // ─── M6: Cassino slot machine (gold sink) ──────────────────────────
        // RNG + payout autoritativos no server. Cliente envia { amount },
        // server valida 100-10000g, debita aposta, rola 3 símbolos e credita
        // payout via goldDelta. House edge ~9% no longo prazo.
        if (msg.t === 'casinoSpin') {
            const CASINO_NPC_POS = { x: 47, y: 50 };   // sync com NPCS.crupie em play.html
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

        // ─── M8 Auction House handlers ──────────────────────────────────────
        // Trade assíncrono via NPC Leiloeiro em (50, 48). Server escrowa item,
        // valida proximidade + rate limit + max listings + gold antes de mexer.
        // List/Cancel/Buy retornam invUpdate.auctionResult + auctions snapshot.
        if (msg.t === 'auctionList') {
            const now = Date.now();
            p._lastAuctionAt = p._lastAuctionAt || 0;
            if (now - p._lastAuctionAt < 800) return;
            p._lastAuctionAt = now;
            if (chebyshev(p.x, p.y, AUCTION_NPC_POS.x, AUCTION_NPC_POS.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'not_at_npc' }));
                return;
            }
            const itemKey = String(msg.itemKey || '').slice(0, 40);
            const qty   = Math.max(1, Math.min(999, msg.qty | 0));
            const price = Math.max(AUCTION_MIN_PRICE, Math.min(AUCTION_MAX_PRICE, msg.price | 0));
            // Aceita itens de ITEM_META ou variantes _PLUS_N (forja)
            const baseKey = itemKey.split('_PLUS_')[0];
            if (!ITEM_META[itemKey] && !ITEM_META[baseKey]){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'unknown_item' }));
                return;
            }
            if (!hasInv(p, itemKey, qty)){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'no_item' }));
                return;
            }
            let mineCount = 0;
            const myName = p.name.toLowerCase();
            for (const a of auctions.values()){
                if (a.sellerName.toLowerCase() === myName) mineCount++;
            }
            if (mineCount >= AUCTION_MAX_LISTINGS){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'max_listings' }));
                return;
            }
            // escrow
            incInv(p, itemKey, -qty);
            const id = nextAuctionId++;
            auctions.set(id, {
                id, sellerName: p.name, itemKey, qty, price,
                listedAt: now, expiresAt: now + AUCTION_DURATION_MS,
            });
            sendInvUpdate(p, { auctionResult:{ ok:true, op:'list', id, itemKey, qty, price } });
            sendAuctionsTo(p);
            return;
        }

        if (msg.t === 'auctionCancel') {
            const now = Date.now();
            p._lastAuctionAt = p._lastAuctionAt || 0;
            if (now - p._lastAuctionAt < 800) return;
            p._lastAuctionAt = now;
            if (chebyshev(p.x, p.y, AUCTION_NPC_POS.x, AUCTION_NPC_POS.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'not_at_npc' }));
                return;
            }
            const id = msg.id | 0;
            const a = auctions.get(id);
            if (!a || a.sellerName.toLowerCase() !== p.name.toLowerCase()){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'not_owner' }));
                return;
            }
            auctions.delete(id);
            incInv(p, a.itemKey, a.qty);
            sendInvUpdate(p, { auctionResult:{ ok:true, op:'cancel', id, itemKey: a.itemKey, qty: a.qty } });
            sendAuctionsTo(p);
            return;
        }

        if (msg.t === 'auctionBuy') {
            const now = Date.now();
            p._lastAuctionAt = p._lastAuctionAt || 0;
            if (now - p._lastAuctionAt < 800) return;
            p._lastAuctionAt = now;
            if (chebyshev(p.x, p.y, AUCTION_NPC_POS.x, AUCTION_NPC_POS.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'not_at_npc' }));
                return;
            }
            const id = msg.id | 0;
            const a = auctions.get(id);
            if (!a){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'not_found' }));
                return;
            }
            if (a.sellerName.toLowerCase() === p.name.toLowerCase()){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'own_listing' }));
                return;
            }
            if ((p.gold || 0) < a.price){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'auctionResult', error:'no_gold' }));
                return;
            }
            auctions.delete(id);
            p.gold -= a.price;
            syncGoldRank(p.name, p.gold);
            incInv(p, a.itemKey, a.qty);
            const sellerCut = Math.floor(a.price * (1 - AUCTION_COMMISSION));
            grantGoldByName(a.sellerName, sellerCut, 'auction_sold');
            sendInvUpdate(p, {
                goldDelta:{ amount: -a.price, reason: 'auction_buy' },
                itemDelta:{ itemKey: a.itemKey, qty: a.qty, reason: 'auction_buy' },
                auctionResult:{ ok:true, op:'buy', id, itemKey: a.itemKey, qty: a.qty, price: a.price, sellerName: a.sellerName },
            });
            sendAuctionsTo(p);
            console.log(`[auction] sold: ${p.name} bought ${a.qty}× ${a.itemKey} for ${a.price}g from ${a.sellerName}`);
            return;
        }

        if (msg.t === 'auctionBrowse') {
            sendAuctionsTo(p);
            return;
        }

        // ─── M4 Masmorra: descer/subir andares (Fase 3: 1..DUNGEON_MAX_FLOOR) ──
        // enterDungeon: overworld → andar 1 (escada do Antro). descendDungeon:
        // andar N → N+1 (escada de descida). exitDungeon: sobe 1 andar (andar 1 →
        // cidade). PvP forçado em qualquer andar; o toggle só é restaurado ao sair
        // pra cidade. Broadcast leave/join ressincroniza quem vê o player por floor.
        if (msg.t === 'enterDungeon') {
            const now = Date.now();
            p._lastFloorAt = p._lastFloorAt || 0;
            if (now - p._lastFloorAt < 600) return;   // anti-spam de transição
            if ((p.floor || 0) !== 0) return;          // já está num andar
            if (chebyshev(p.x, p.y, DUNGEON_ENTRANCE.x, DUNGEON_ENTRANCE.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'dungeonResult', error:'not_at_entrance' }));
                return;
            }
            p._lastFloorAt = now;
            broadcast(id, { t:'leave', id }, 0);       // some do overworld
            p._pvpBeforeDungeon = !!p.pvp;             // salva PvP pra restaurar na saída
            p.pvp = true;
            enterDungeonFloor(p, id, 1, 'down');
            console.log(`[dungeon] ${p.name} entrou nas Profundezas (andar 1)`);
            return;
        }

        if (msg.t === 'descendDungeon') {
            if (p.arena) return;   // M7: sem escada dentro da arena
            const now = Date.now();
            p._lastFloorAt = p._lastFloorAt || 0;
            if (now - p._lastFloorAt < 600) return;
            const cur = p.floor || 0;
            if (cur < 1 || cur >= DUNGEON_MAX_FLOOR) return;   // precisa estar num andar e não no último
            const sd = getDungeonFloor(cur).stairs.down;       // Fase 2: escada de descida do andar (procedural)
            if (!sd || chebyshev(p.x, p.y, sd.x, sd.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'dungeonResult', error:'not_at_exit' }));
                return;
            }
            p._lastFloorAt = now;
            broadcast(id, { t:'leave', id }, cur);     // some do andar atual
            enterDungeonFloor(p, id, cur + 1, 'down');
            console.log(`[dungeon] ${p.name} desceu pro andar ${cur + 1}`);
            return;
        }

        if (msg.t === 'exitDungeon') {
            if (p.arena) return;   // M7: sem escada dentro da arena
            const now = Date.now();
            p._lastFloorAt = p._lastFloorAt || 0;
            if (now - p._lastFloorAt < 600) return;
            const cur = p.floor || 0;
            if (cur === 0) return;                      // já está na cidade
            const su = getDungeonFloor(cur).stairs.up;          // Fase 2: escada de subida do andar (procedural)
            if (!su || chebyshev(p.x, p.y, su.x, su.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'dungeonResult', error:'not_at_exit' }));
                return;
            }
            p._lastFloorAt = now;
            if (cur === 1){
                // andar 1 → cidade (overworld): mesmo flow da morte na masmorra (#5)
                returnPlayerToTown(p, id);
                console.log(`[dungeon] ${p.name} voltou pra cidade`);
            } else {
                broadcast(id, { t:'leave', id }, cur);      // some do andar atual
                // sobe 1 andar (continua na masmorra, PvP segue forçado)
                enterDungeonFloor(p, id, cur - 1, 'up');
                console.log(`[dungeon] ${p.name} subiu pro andar ${cur - 1}`);
            }
            return;
        }

        // ─── M6 Tinturaria — gold sink cosmético ────────────────────────────
        // Override de cor por slot equipado (armor/head/feet/cosmetic). Cor é
        // do slot, não do item: trocar a armor mantém a tinta. Server é dono —
        // F12 com cor fora da palette ou slot inválido falha. Persiste em
        // p.dyes, broadcast via pstats pra outros verem em tempo real.
        if (msg.t === 'petBuy') {
            const PET_NPC_POS = { x: 50, y: 47 };   // sync com NPCS.domador em play.html
            const now = Date.now();
            p._lastPetBuyAt = p._lastPetBuyAt || 0;
            if (now - p._lastPetBuyAt < 800) return;
            p._lastPetBuyAt = now;
            if (chebyshev(p.x, p.y, PET_NPC_POS.x, PET_NPC_POS.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'petResult', error:'not_at_npc' }));
                return;
            }
            const key = String(msg.pet || '');
            const def = PET_DEFS[key];
            if (!def){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'petResult', error:'invalid' }));
                return;
            }
            p.pets = p.pets || {};
            if (p.pets[key]){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'petResult', error:'owned' }));
                return;
            }
            if ((p.gold || 0) < def.price){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'petResult', error:'no_gold' }));
                return;
            }
            p.gold -= def.price;
            p.pets[key] = { lvl: 1, xp: 0 };
            syncGoldRank(p.name, p.gold);
            if (p.authedName){
                const acc = getAccount(p.authedName);
                if (acc){
                    acc.save = acc.save || {};
                    acc.save.pets = { ...p.pets };
                    acc.save.gold = p.gold;
                    queueSaveAccounts();
                }
            }
            sendInvUpdate(p, { goldDelta:{ amount: -def.price, reason:'pet_buy' }, pets: p.pets });
            if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'petResult', ok:true, pet:key, pets:p.pets }));
            return;
        }
        if (msg.t === 'dyeItem') {
            const TINTUREIRA_POS = { x: 53, y: 53 };   // sync com NPCS.tintureira em play.html
            const DYE_SLOTS = ['armor', 'head', 'feet', 'cosmetic'];
            const DYE_PALETTE = [
                '#d04040','#e08020','#e0c040','#60c040','#40c0c0','#4080e0',
                '#a040e0','#e040a0','#ffffff','#202020','#a06030','#808080'
            ];
            const DYE_PRICE = 5000;
            const DYE_REMOVE_PRICE = 1000;
            const now = Date.now();
            p._lastDyeAt = p._lastDyeAt || 0;
            if (now - p._lastDyeAt < 800) return;
            p._lastDyeAt = now;
            if (chebyshev(p.x, p.y, TINTUREIRA_POS.x, TINTUREIRA_POS.y) > 1){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'dyeResult', error:'not_at_npc' }));
                return;
            }
            const slot = String(msg.slot || '');
            if (!DYE_SLOTS.includes(slot)) return;
            const color = (msg.color === null || msg.color === undefined) ? null : String(msg.color);
            if (color !== null && !DYE_PALETTE.includes(color)) return;
            if (!p.equipped || !p.equipped[slot]){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'dyeResult', error:'no_item' }));
                return;
            }
            const cost = (color === null) ? DYE_REMOVE_PRICE : DYE_PRICE;
            if ((p.gold || 0) < cost){
                if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'dyeResult', error:'no_gold' }));
                return;
            }
            p.gold -= cost;
            p.dyes = p.dyes || {};
            if (color === null) delete p.dyes[slot];
            else p.dyes[slot] = color;
            syncGoldRank(p.name, p.gold);
            // Persiste imediatamente no acc.save — sem esperar o próximo saveUpload
            // do cliente. Antes (bug): tinta sumia se o player reiniciasse o jogo
            // antes do save throttled de 5s do cliente disparar.
            if (p.authedName){
                const acc = getAccount(p.authedName);
                if (acc){
                    acc.save = acc.save || {};
                    acc.save.dyes = { ...p.dyes };
                    acc.save.gold = p.gold;
                    queueSaveAccounts();
                }
            }
            sendInvUpdate(p, {
                goldDelta:{ amount: -cost, reason: color === null ? 'dye_remove' : 'dye' },
                dyes: p.dyes,
            });
            if (p.ws.readyState === 1){
                p.ws.send(JSON.stringify({ t:'dyeResult', ok:true, slot, color }));
            }
            broadcastPstatsAll(p);
            return;
        }

        // ATAQUE A MOB (#10 validado)
        if (msg.t === 'attackMob') {
            const m = monsters.get(msg.monsterId);
            if (!m || m.hp <= 0) { sendTo(id, { t:'mobMissing', mobId: msg.monsterId }); return; }
            // Mesmo-andar (audit 2026-06-03): a masmorra (andares 1-5) vive na MESMA caixa de
            // coords globais (40-60) que o overworld → sem isto, um player no andar N acumulava
            // dano no boss do andar 5 (coords determinísticas) e roubava o loot via damageBy/
            // distributeBossLoot sem nunca ter descido. Exige o mesmo floor.
            if ((p.floor || 0) !== (m.floor || 0)) { sendTo(id, { t:'mobMissing', mobId: msg.monsterId }); return; }
            // Rate-limit anti-spam: o ataque legítimo MAIS rápido é 680ms (o cliente
            // trava o input nesse ritmo). 200ms tem 3,4× de folga — não afeta jogo
            // limpo, mas barra a rajada de hits forjados que (mesmo com o teto de 600)
            // mataria o boss 5000hp num piscar. Campo dedicado p/ não colidir com
            // lastAttackAt (que serve à mini-PZ do NPC).
            const nowAtk = Date.now();
            // Rate-limit POR MOB (não por player): o Exori (AoE) dispara vários attackMob no
            // mesmo tick — um por mob no raio. Um rate-limit por player deixava passar só o 1º
            // e o resto sumia ("dano aparece mas o mob não morre"). Por-mob permite o AoE
            // acertar todos, mas mantém a trava contra rajada de hits forjados no MESMO mob
            // (one-shot de boss). Limpeza preguiçosa evita o Map crescer.
            p._lastHitMob = p._lastHitMob || new Map();
            if (nowAtk - (p._lastHitMob.get(msg.monsterId) || 0) < ATTACK_MIN_INTERVAL_MS) return;
            p._lastHitMob.set(msg.monsterId, nowAtk);
            if (p._lastHitMob.size > 64){
                for (const [mid, t] of p._lastHitMob){ if (nowAtk - t > 5000) p._lastHitMob.delete(mid); }
            }
            const range = msg.range || 1;   // compat: só alimenta o flag isRanged do XP abaixo
            // Deploy 2a — alcance AUTORITATIVO: deriva do equip (arma) ou da janela de magia
            // (spellCast pago). Ignora o msg.range na distância → fecha o "range:99" (bater de
            // qualquer canto do mapa), pra ataque de arma E pra magia forjada.
            const spellWin = (p._spellWindow && Date.now() < p._spellWindow.until) ? p._spellWindow : null;
            const serverRange = spellWin ? spellWin.range : weaponRangeServer(p);
            if (chebyshev(p.x, p.y, m.x, m.y) > serverRange) return;
            p.lastAttackAt = Date.now();   // quebra mini-PZ do NPC por 2s
            // LOS — só valida pra alcance > 1 (ranged/magia); melee adjacente passa sem check
            if (serverRange > 1 && !hasLineOfSight(p.x, p.y, m.x, m.y)) return;
            // Deploy 2b — cadência por AÇÃO de ataque de ARMA. Magia (janela ativa) é
            // ISENTA: o Exori dispara N attackMob no mesmo tick e a frequência da magia já
            // é limitada pelo rate-limit 600ms do spellCast. (Em jogo limpo você ou casta
            // ou bate; o resíduo de bater durante a janela é auto-limitado pela mana, que é
            // server-autoritativa.) O rate-limit por-mob 200ms (acima) segue protegendo o boss.
            if (!spellWin){
                if (nowAtk - (p._lastAttackActionAt || 0) < ATTACK_ACTION_MIN_MS) return;
                p._lastAttackActionAt = nowAtk;
                // Fase 2b: tiro básico da wand custa mana (server-autoritativo). Ataque de arma
                // sem janela de magia + arma é wand → desconta. Magias pagam no spellCast.
                if (wandBaseServer(p) > 0){
                    if ((p.mp || 0) < WAND_MANA_COST){
                        sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_mana_short') });
                        return;
                    }
                    p.mp -= WAND_MANA_COST;
                    broadcastPstatsAll(p);
                }
            }
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
                broadcast(id, { t:'pstats', id, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, cosmetic:p.cosmetic, pet:p.pet||null, equipped:p.equipped, badges:p.badges || [] });
            }
            if (invDirty) sendInvUpdate(p, { reason:'ammo' });
            // teto de dano por hit — Deploy 2a: POR PLAYER (arma/skill ou magia na janela),
            // não mais o flat 600. Mantém o msg.amount (o número que o player vê é o roll
            // dele); só barra o exagero (arma fraca mandando 600 → capada no real dela).
            // MAX_HIT_DMG fica como teto absoluto de segurança (>372 legítimo → nunca clipa).
            const dmg = Math.max(1, Math.min(msg.amount | 0, attackDamageCapServer(p, spellWin), MAX_HIT_DMG));
            m.hp = Math.max(0, m.hp - dmg);
            // Vampirismo (t_lifesteal): cura % do dano causado (cap maxHp); sincroniza HP via pstats.
            const _ls = (p.permaBuffs && p.permaBuffs.lifesteal) || 0;
            if (_ls > 0 && dmg > 0 && (p.hp ?? 0) < (p.maxHp ?? 0)){
                p.hp = Math.min(p.maxHp, (p.hp || 0) + Math.max(1, Math.round(dmg * _ls)));
                broadcastPstatsAll(p);
            }
            // Anti-ninja: rastreia dano por player em TODOS os mobs — o dono do loot
            // (boss = direto no inv; mob comum = bag no chão) é quem deu mais dano.
            // damageBy some quando o mob é deletado na morte (sem leak).
            m.damageBy = m.damageBy || {}; m.damageBy[id] = (m.damageBy[id] || 0) + dmg;
            // T1/T3: XP de skill por hit (não só por kill).
            // - Melee (range≤1, sem ammo, sem spear): +1 na skill da arma
            // - Distância (range>1 OU ammo OU throwSpear): +1 em Distância
            const isRanged = range > 1 || typeof msg.ammoKey === 'string' || !!msg.throwSpear;
            gainSkillXpServer(p, isRanged ? 'Distância' : weaponSkillOf(p), 1);
            // Build de escudo (1-mão + escudo): o Escudo treina junto POR HIT, mesmo XP (pedido do dono).
            if (hasShieldEquipped(p)) gainSkillXpServer(p, 'Escudo', 1);
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
            // Fase 2b: status de CONTROLE elemental (gelo=freeze, raio=shock). Vêm no msg.dots
            // mas não são DoT de dano — setam timestamp no mob (lido no tickAI). Boss = imune.
            if (Array.isArray(msg.dots) && !m.unique){
                const nowS = Date.now();
                for (const d of msg.dots){
                    if (!d) continue;
                    if (d.type === 'freeze') m.frozenUntil = nowS + FREEZE_MS;
                    else if (d.type === 'shock') m.shockedUntil = nowS + SHOCK_MS;
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
                    } else if (BOSSES.some(b => b.type === m.type)) {   // só os 3 do mundo escalam/respawnam por timer
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
                    } else if (m.type === DUNGEON_BOSS_TYPE) {   // boss da masmorra: registra cooldown anti-farm
                        dungeonBossDeath.set(m.floor || 0, Date.now());
                        console.log(`[dungeon] ${DUNGEON_BOSS_TYPE} morto no andar ${m.floor||0} por ${p.name} → cooldown ${DUNGEON_BOSS_RESPAWN_MS/60000}min`);
                    }
                }
                monsters.delete(m.id);
                // Loot autoritativo: server roda LOOT e mantém drops no chão.
                // Cada item ganha id server-side; broadcast spawn pra TODOS verem.
                const loot = rollLoot(m.type, ((p.permaBuffs && p.permaBuffs.rareLuck) || 0) + petBuffVal(p, 'rareLuck'));
                // M5 talent t_loot: +15% gold de drops. Aplica antes do spawn.
                const lootBonus = (p.permaBuffs?.lootBonus || 0) + petBuffVal(p, 'lootBonus');
                if (lootBonus > 0){
                    for (const it of loot){
                        if (it && it.type === 'GOLD' && it.qty > 0){
                            it.qty = Math.max(1, Math.round(it.qty * (1 + lootBonus)));
                        }
                    }
                }
                let spawnedDrops = [];
                const isBoss = !!m.unique;
                if (isBoss){
                    // M4 anti-ninja: boss unique distribui o loot por dano, direto
                    // no inventário de quem bateu. NÃO cai no chão.
                    distributeBossLoot(m, loot, p);
                } else {
                    // Mob comum: cai no chão (3×3) com dono+lock (anti-ninja). dropMobLoot
                    // carimba owner/ownerUntil = top-damager (+ party dele) por LOOT_LOCK_MS.
                    spawnedDrops = dropMobLoot(m, loot, p);
                }
                // T1: XP authoritative na skill da arma equipada
                const skillUsed = weaponSkillOf(p);
                gainSkillXpServer(p, skillUsed, m.xp || 1);
                const petGain = gainPetXp(p, m.xp || 1);
                // Build de escudo (1-mão + escudo): o Escudo ganha o MESMO XP de kill que a arma (pedido do dono).
                // 2H e escudo são mutuamente exclusivos → escudo equipado ⇒ arma 1-mão.
                const shieldXp = hasShieldEquipped(p) ? (m.xp || 1) : 0;
                if (shieldXp > 0) gainSkillXpServer(p, 'Escudo', shieldXp);
                // killer recebe mobKill (boss → loot:[] pro cliente não criar drops)
                sendTo(id, { t:'mobKill', mobId:m.id, mobType:m.type, xp:m.xp, x:m.x, y:m.y, level:m.level, loot: isBoss ? [] : loot, drops: spawnedDrops, skill: skillUsed, xpGained: m.xp || 1, shieldXp, petGain });
                // Envia skills atualizadas (autoritativo)
                sendInvUpdate(p, { skills: p.skills, reason:'mobKill' });
                // outros recebem só mobDead + groundSpawn (sem loot, sem xp)
                broadcast(id, { t:'mobDead', mobId:m.id, byName:p.name, level:m.level }, m.floor);
                if (spawnedDrops.length) broadcast(id, { t:'groundSpawn', drops: spawnedDrops }, m.floor);
                // Ranking: incrementa mobKills (e bossKills se for unique) — all-time + season
                bumpMobKill(p.name, !!m.unique);
                sharePartyKill(p, m);
                creditQuestKill(p, m.type);   // Lote 1b: conta kill de quest (melee/magia)
            }
            return;
        }

        if (msg.t === 'pkDeath') {
            // Server agora detecta morte PvP autonomamente em pvpAttack quando
            // hp zera. Se _pkServerHandled foi setado nos últimos 15s, ignora
            // essa msg (era a vítima reportando o que o server já processou).
            if (p._pkServerHandled && (Date.now() - p._pkServerHandled) < 15000){
                return;
            }
            const killer = players.get(msg.killerId);
            // Anti-cheat: msg.killerId precisa bater com o último atacante PvP
            // dentro de 8s. Sem isso cúmplice fake podia enviar
            // {t:'pkDeath', killerId: amigo} e farmar selos/ranking pro amigo
            // sem nenhum combate real ter acontecido.
            const recentAttack = p._lastPvpAttackerId && (Date.now() - (p._lastPvpAttackAt || 0)) < 8000;
            if (!recentAttack || msg.killerId !== p._lastPvpAttackerId){
                console.warn(`[pkDeath] rejeitado: ${p.name} claimou killer ${msg.killerId} mas último atacante foi ${p._lastPvpAttackerId} (${Math.floor((Date.now() - (p._lastPvpAttackAt||0))/1000)}s atrás)`);
                return;
            }
            // Fallback (a detecção autônoma no pvpAttack já cobre o caminho normal e
            // setou grace). Aqui cobre o caso de race/duelo: a vítima respawna no spawn
            // → libera 1 pos não-adjacente. DEPOIS da validação anti-forja acima, então
            // não dá pra forjar pkDeath e se auto-conceder teleporte sem morrer de verdade.
            p._posGraceUntil = Date.now() + 60000;
            // Se ambos estavam num duelo entre si, processa como vitória de duel (sem selo, sem drop)
            if (killer && p.duel && p.duel.opponentId === killer.id && killer.duel && killer.duel.opponentId === id){
                endDuel(killer, p, false);
                return;
            }
            // Fallback (caso pvpAttack não tenha disparado o handler server-side
            // por algum motivo — race, disconnect, etc): roda flow autoritativo.
            // NOTA: goldDrop calculado server-side (não confia em msg.goldGain).
            if (!killer) return;
            processPkDeathServerSide(killer, p);
            return;
        }

        // Duelo 1v1 — comandos via chat-like (consumido antes do broadcast normal)
        if (msg.t === 'duelInvite') {
            // Rate limit (audit 29/05): sem isso um player podia spamar
            // duelInvite pra outro 100×/seg → pop-up infinito de assédio.
            const now = Date.now();
            if (p._lastDuelInviteAt && (now - p._lastDuelInviteAt) < 3000) return;
            p._lastDuelInviteAt = now;
            const toName = String(msg.toName || '').trim().substring(0, 14);
            const amount = Math.max(50, Math.min(1_000_000, msg.amount | 0));
            if (!toName) return;
            if (toName.toLowerCase() === p.name.toLowerCase()){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.duel_self') });
                return;
            }
            if (p.duel){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.duel_already') }); return; }
            if ((p.gold || 0) < amount){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.duel_wager_high', {g: p.gold || 0}) }); return; }
            let target = null;
            for (const pp of players.values()){
                if (!pp.disconnected && pp.name.toLowerCase() === toName.toLowerCase()){ target = pp; break; }
            }
            if (!target){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_online', {name: toName}) }); return; }
            if (target.duel){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.target_dueling', {name: target.name}) }); return; }
            if ((target.gold || 0) < amount){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.target_cant_cover', {name: target.name, g: amount}) }); return; }
            duelInvites.set(target.id, { fromId: id, fromName: p.name, amount, expiresAt: Date.now() + 30_000 });
            sendTo(target.id, { t:'duelInvite', fromId: id, fromName: p.name, amount });
            sendTo(id, { t:'serverMsg', level:'info', text: trp(p, 'srv.duel_invite_sent', {name: target.name, g: amount}) });
            return;
        }
        if (msg.t === 'duelAccept') {
            const inv = duelInvites.get(id);
            if (!inv || inv.expiresAt < Date.now()){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_duel_invite') });
                return;
            }
            const from = players.get(inv.fromId);
            if (!from || from.disconnected){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.challenger_left') });
                return;
            }
            if (from.duel || p.duel){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.someone_dueling') });
                return;
            }
            if ((from.gold || 0) < inv.amount || (p.gold || 0) < inv.amount){
                duelInvites.delete(id);
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.someone_no_gold') });
                sendTo(from.id, { t:'serverMsg', level:'warn', text: trp(from, 'srv.duel_cancelled_gold') });
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
                sendTo(from.id, { t:'serverMsg', level:'warn', text: trp(from, 'srv.duel_declined_by', {name: p.name}) });
            }
            sendTo(id, { t:'serverMsg', level:'info', text: trp(p, 'srv.duel_declined') });
            return;
        }

        // ─── M7 Arena — fila + matchmaking ───────────────────────────────
        if (msg.t === 'arenaJoin') {
            const now = Date.now();
            if (p._lastArenaQAt && now - p._lastArenaQAt < ARENA_JOIN_COOLDOWN_MS) return;
            p._lastArenaQAt = now;
            if (p.arena){ sendTo(id, { t:'arenaCancel', reason:'in_match' }); return; }
            if (p.duel){ sendTo(id, { t:'arenaCancel', reason:'in_duel' }); return; }
            if ((p.floor || 0) !== 0){ sendTo(id, { t:'arenaCancel', reason:'not_in_city' }); return; }
            if (chebyshev(p.x, p.y, ARENA_NPC.x, ARENA_NPC.y) > 1){ sendTo(id, { t:'arenaCancel', reason:'not_at_npc' }); return; }
            const already = arenaQueue.find(e => e.id === id);
            if (already){ sendTo(id, { t:'arenaQueued', wager: already.wager, size: arenaQueue.length }); return; }
            let wager = Math.max(0, Math.min(1_000_000, msg.wager | 0));
            if (wager > 0 && wager < 50) wager = 50;             // mínimo 50g se apostar (igual duelo)
            if (wager > (p.gold || 0)){ sendTo(id, { t:'arenaCancel', reason:'no_gold' }); return; }
            arenaQueue.push({ id, name: p.name, wager, joinedAt: now });
            sendTo(id, { t:'arenaQueued', wager, size: arenaQueue.length });
            console.log(`[arena] ${p.name} entrou na fila (wager ${wager}, fila ${arenaQueue.length})`);
            return;
        }
        if (msg.t === 'arenaLeaveQueue') {
            const qi = arenaQueue.findIndex(e => e.id === id);
            if (qi >= 0) arenaQueue.splice(qi, 1);
            sendTo(id, { t:'arenaCancel', reason:'left' });
            return;
        }
        if (msg.t === 'arenaStats') {
            const r = ensureRanking(p.name);
            sendTo(id, {
                t:'arenaStats',
                rating: (r && r.arenaRating) || 1000,
                wins:   (r && r.arenaWins)   || 0,
                losses: (r && r.arenaLosses) || 0,
                queued: arenaQueue.some(e => e.id === id),
                inMatch: !!p.arena,
            });
            return;
        }

        if (msg.t === 'getRanking') {
            // Rate limit (audit 29/05): getRanking percorre todos rankings —
            // 1000 req/seg = CPU spike. 1s entre requests é mais que suficiente.
            const now = Date.now();
            if (p._lastRankingAt && (now - p._lastRankingAt) < 1000) return;
            p._lastRankingAt = now;
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
            // CRITICAL FIX (audit 29/05): handler antes não checava admin
            // → qualquer player podia broadcast spam/phishing via F12.
            // Agora exige isAdmin + rate limit 2s.
            if (!isAdmin(p.authedName)){
                console.warn(`[announce] tentativa não-admin de ${p.name || '?'}`);
                return;
            }
            const now = Date.now();
            if (p._lastAnnounceAt && (now - p._lastAnnounceAt) < 2000) return;
            p._lastAnnounceAt = now;
            const text = String(msg.text || '').slice(0, 200);
            if (!text) return;
            broadcastMsg('info', text);
            console.log(`[announce] admin ${p.name}: ${text.slice(0, 80)}`);
            return;
        }

        // ─── TRADE ─────────────────────────────────────────────────────
        if (msg.t === 'tradeRequest') {
            // Rate limit (audit 29/05): trade request spam = pop-up infinito
            // de assédio. 3s entre requests pro mesmo player ou qualquer.
            const now = Date.now();
            if (p._lastTradeReqAt && (now - p._lastTradeReqAt) < 3000) return;
            p._lastTradeReqAt = now;
            const toName = String(msg.toName || '').trim().substring(0, 14);
            if (!toName || toName.toLowerCase() === p.name.toLowerCase()){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.bad_trade') });
                return;
            }
            let target = null;
            for (const pp of players.values()){
                if (!pp.disconnected && pp.name.toLowerCase() === toName.toLowerCase()){ target = pp; break; }
            }
            if (!target){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_online', {name: toName}) }); return; }
            // Trade só na PZ central (zona segura) — anti-griefing. Na masmorra
            // (floor ≥ 1) não há PZ, então trade não rola lá.
            if (!playerInSafe(p) || !playerInSafe(target)){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.trade_pz_only') });
                return;
            }
            if (chebyshev(p.x, p.y, target.x, target.y) > 3){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.trade_too_far') });
                return;
            }
            if (p.tradeId || target.tradeId){
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.someone_trading') });
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
                initiator.ws.send(JSON.stringify({ t:'serverMsg', level:'warn', text: trp(initiator, 'srv.trade_declined_by', {name: p.name}) }));
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
            if (!isAdmin(p.authedName)){
                p.lastChatAt = p.lastChatAt || 0;
                if (now - p.lastChatAt < 500){
                    if (now - (p.lastChatRateWarn || 0) > 2000){
                        sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.chat_slow') });
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
                sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.not_online', {name: toName}) });
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
            if (!isAdmin(p.authedName)){
                p.lastChatAt = p.lastChatAt || 0;
                if (now - p.lastChatAt < 500){
                    // Avisa só na primeira recusa dentro de uma janela de 2s pra não floodar de volta
                    if (now - (p.lastChatRateWarn || 0) > 2000){
                        sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.chat_slow') });
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
                if (!myGuild){ sendTo(id, { t:'serverMsg', level:'warn', text: trp(p, 'srv.no_guild') }); return; }
                for (const pp of players.values()){
                    if (pp.ws.readyState !== 1) continue;
                    if (!myGuild.members.includes(pp.name)) continue;
                    pp.ws.send(JSON.stringify({ t:'guildChat', fromName: p.name, guild: myGuild.name, text: body }));
                }
                return;
            }
            // Comandos admin — autorização pela conta PROVADA (p.authedName), nunca
            // pelo nome de exibição p.name (que era falsificável via join). (audit 2026-06-03)
            if (text.startsWith('/') && isAdmin(p.authedName)){
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
                if (cmd === '/manutencao' || cmd === '/manut'){
                    const mins = arg ? parseInt(arg, 10) : 3;
                    startMaintenanceCountdown(mins);
                    sendTo(id, { t:'serverMsg', level:'info', text:'Countdown de manutenção disparado. Pushe o deploy perto do fim — ao voltar, todos caem na PZ.' });
                    return;
                }
                if (cmd === '/help'){
                    sendTo(id, { t:'serverMsg', level:'info', text:'Admin: /say · /event · /warn · /info · /motd · /manutencao MIN · /setboss TYPE LV · /respawnboss TYPE · /megaboss status|spawn|reset · /deluser NOME · /checkuser NOME · /resetuser NOME · /allowrestore NOME · /gold N · /skill NOME N · /setskills NOME N · /heal · /resetquests NOME' });
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
                if (cmd === '/spawn007' || cmd === '/spawnimpostor'){
                    spawnImpostorBot();
                    sendTo(id, { t:'serverMsg', level:'info', text: impostorBot ? '007 spawnado.' : 'Falhou ao spawnar 007 (já existe ou sem pos walkable).' });
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
                if (cmd === '/allowrestore'){
                    if (!arg){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /allowrestore NOME' }); return; }
                    const acc = getAccount(arg);
                    if (!acc){ sendTo(id, { t:'serverMsg', level:'warn', text:`Conta "${arg}" não existe.` }); return; }
                    if (!isEmptyDefaultSaveServer(acc.save)){ sendTo(id, { t:'serverMsg', level:'warn', text:`Save de "${arg}" NÃO está zerado — restauração é só pra conta zerada por bug.` }); return; }
                    acc._restoreUntil = Date.now() + 10 * 60 * 1000;   // janela de 10min
                    sendTo(id, { t:'serverMsg', level:'info', text:`Restauração liberada pra "${arg}" (10min). Ele deve SAIR e ENTRAR — o cliente manda o backup automático; depois SAIR/ENTRAR de novo pra carregar.` });
                    console.log(`[restore] admin ${p.name} liberou restore de ${arg}`);
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
                // ─── Edição de char (admin) — autoritativo + persiste. Substitui o painel
                //     client-only (adminApplyGold/Skill/FullHeal) que o lockdown N3 revertia:
                //     o cliente forjava no display, mas o server re-hidratava o valor real
                //     no próximo sync. Agora a mudança é aplicada no `p` vivo + gravada no save.
                if (cmd === '/gold'){
                    const v = Math.max(0, Math.min(100000000, parseInt(arg, 10) || 0));
                    p.gold = v;
                    const acc = getAccount(p.authedName);
                    if (acc && acc.save) acc.save.gold = v;
                    syncGoldRank(p.name, p.gold);
                    flushAccounts();
                    sendInvUpdate(p, {});
                    sendTo(id, { t:'serverMsg', level:'info', text:`💰 Gold = ${v.toLocaleString('pt-BR')}` });
                    return;
                }
                if (cmd === '/skill'){
                    const sp = arg.split(/\s+/);
                    const skName = sp[0] || '';
                    const val = Math.max(10, Math.min(200, parseInt(sp[1], 10) || 10));
                    if (!p.skills || !p.skills[skName]){
                        sendTo(id, { t:'serverMsg', level:'warn', text:`Skill inválida. Use: ${Object.keys(p.skills || {}).join(', ')}` });
                        return;
                    }
                    p.skills[skName].val = val;
                    p.skills[skName].xp = 0;
                    p.skills[skName].xpNext = Math.floor(50 * Math.pow(1.15, val - 10));
                    recomputeMaxStatsServer(p);   // recalcula maxHp/maxMp pelas skills novas (senão ficam no valor antigo até relogar)
                    const acc = getAccount(p.authedName);
                    if (acc && acc.save){
                        acc.save.skills = p.skills;
                        acc.save.maxHp = p.maxHp; acc.save.maxMp = p.maxMp;
                        acc.save.hp = p.hp; acc.save.mp = p.mp;
                    }
                    flushAccounts();
                    sendInvUpdate(p, { skills: p.skills });
                    broadcastPstatsAll(p);   // empurra maxHp/maxMp/hp/mp novos pro cliente na hora
                    sendTo(id, { t:'serverMsg', level:'info', text:`${skName} = ${val} (maxHP ${p.maxHp}/maxMP ${p.maxMp})` });
                    return;
                }
                if (cmd === '/setskills'){
                    // Admin: seta TODAS as skills de OUTRO player pra N (compensação do loop de morte).
                    // O /skill acima só edita o próprio char; este alcança um alvo (online ou offline).
                    // Uso: /setskills NOME N
                    const sp = arg.split(/\s+/);
                    const targetName = (sp[0] || '').trim();
                    const val = Math.max(10, Math.min(200, parseInt(sp[1], 10) || 10));
                    if (!targetName){ sendTo(id, { t:'serverMsg', level:'warn', text:'Uso: /setskills NOME N' }); return; }
                    const acc = getAccount(targetName);
                    if (!acc || !acc.save){ sendTo(id, { t:'serverMsg', level:'warn', text:`Conta "${targetName}" não existe (cheque o nome/maiúsculas).` }); return; }
                    const SKILL_KEYS = ['Punho','Espada','Machado','Clava','Distância','Escudo','Magia'];
                    if (!acc.save.skills || typeof acc.save.skills !== 'object') acc.save.skills = {};
                    for (const sk of SKILL_KEYS){
                        acc.save.skills[sk] = { val, xp: 0, xpNext: Math.floor(50 * Math.pow(1.15, val - 10)) };
                    }
                    // Alvo ONLINE? aplica no player vivo + recalcula maxHp/maxMp na hora.
                    let note = ' (offline — vale no próximo login)';
                    for (const tp of players.values()){
                        if (tp.authedName && tp.authedName.toLowerCase() === targetName.toLowerCase()){
                            tp.skills = acc.save.skills;
                            recomputeMaxStatsServer(tp);
                            acc.save.maxHp = tp.maxHp; acc.save.maxMp = tp.maxMp;
                            sendInvUpdate(tp, { skills: tp.skills });
                            broadcastPstatsAll(tp);
                            note = ' (online — aplicado na hora)';
                            break;
                        }
                    }
                    flushAccounts();
                    sendTo(id, { t:'serverMsg', level:'info', text:`Skills de ${targetName} = ${val} em TODAS${note}` });
                    return;
                }
                if (cmd === '/heal'){
                    p.hp = p.maxHp;
                    p.mp = p.maxMp;
                    broadcastPstatsAll(p);
                    sendTo(id, { t:'serverMsg', level:'info', text:'❤ HP/MP cheios' });
                    return;
                }
                if (cmd === '/resetquests'){
                    const target = arg || p.name;
                    const acc = getAccount(target);
                    if (!acc){ sendTo(id, { t:'serverMsg', level:'warn', text:`Conta "${target}" não existe.` }); return; }
                    // Zera quests da Atendente (active+completed) E as chains do mapa
                    // (questFlags — Eremita/Ferreiro/etc.). Preserva a diária (legítima).
                    if (acc.save){
                        acc.save.quests = acc.save.quests || {};
                        acc.save.quests.active = {};
                        acc.save.quests.completed = [];
                        acc.save.questFlags = {};
                    }
                    // Se online, zera o estado vivo e empurra pro cliente.
                    let online = false;
                    for (const [, op] of players){
                        if (op.name && op.name.toLowerCase() === target.toLowerCase()){
                            if (op.quests){ op.quests.active = {}; op.quests.completed = []; }
                            op.questFlags = {};
                            sendInvUpdate(op, { quests: op.quests, questFlags: op.questFlags });
                            online = true;
                        }
                    }
                    flushAccounts();
                    sendTo(id, { t:'serverMsg', level:'info', text:`Quests de ${target} resetadas (Atendente + chains do mapa; diária preservada)${online ? ' [online]' : ''}.` });
                    return;
                }
                sendTo(id, { t:'serverMsg', level:'warn', text:`Comando desconhecido: ${cmd}. /help pra ver lista` });
                return;
            }
            broadcast(null, { t:'chat', id, name:p.name, text });
            return;
        }

        } catch (err) {
            // Erro num handler — não derruba processo. Loga + recordError.
            console.error(`[ws:msg-handler] id=${id} name=${p.name || '?'} t=${msg && msg.t || '?'} err=${err.message || err}`);
            recordError({
                kind: 'msg_handler',
                player: p.name || null,
                msg: err.message || String(err),
                stack: err.stack || null,
                meta: { id, msgType: (msg && msg.t) || null },
            });
        }
    });

    ws.on('error', (err) => {
        console.warn(`[ws:err] id=${id} name=${p.name || '?'} code=${err.code || '?'} msg=${err.message || err}`);
        recordError({ kind:'ws_error', player: p.name || null, msg: err.message || String(err), meta: { code: err.code || null, id } });
    });
    ws.on('close', (code, reasonBuf) => {
        // Decrementa o contador de conexões do IP (audit 2026-06-03); limpa a entrada no 0.
        { const _n = (_ipConnCount.get(_connIp) || 0) - 1;
          if (_n > 0) _ipConnCount.set(_connIp, _n); else _ipConnCount.delete(_connIp); }
        const reason = reasonBuf ? reasonBuf.toString().slice(0, 100) : '';
        console.log(`[ws:close] id=${id} name=${p.name || '?'} code=${code} reason=${reason || '(empty)'}`);
        counters.ws_closes[String(code)] = (counters.ws_closes[String(code)] || 0) + 1;
        // 1000/1001 são closes limpos — não geram entry de erro (poluiria log)
        if (code !== 1000 && code !== 1001){
            recordError({ kind:'ws_close', player: p.name || null, msg: `code=${code} reason=${reason || '(empty)'}`, meta: { code, id } });
        }
        // Duelo ativo: abandonar conta como derrota (oponente leva o pot)
        if (p.duel){
            const opp = players.get(p.duel.opponentId);
            if (opp && opp.duel && opp.duel.opponentId === id){
                endDuel(opp, p, false);
            } else {
                p.duel = null;
            }
        }
        // M7 Arena ativa: abandonar conta como derrota (oponente leva o pote)
        if (p.arena){
            const opp = players.get(p.arena.opponentId);
            if (opp && opp.arena && opp.arena.opponentId === id){
                endArenaMatch(opp, p, false);
            } else {
                const fl = p.arena.floor, mid = p.arena.matchId;
                p.arena = null;
                arenaMatches.delete(mid);
                dungeonFloors.delete(fl);
            }
        }
        // Sai da fila da arena se estava esperando
        { const _qi = arenaQueue.findIndex(e => e.id === id); if (_qi >= 0) arenaQueue.splice(_qi, 1); }
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
                        if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t:'serverMsg', level:'info', text: trp(pp, 'srv.party_member_dc', {name: p.name}) }));
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
        broadcast(id, { t:'ghost', id, name:p.name }, p.floor);
    });

});

console.log(`╔══════════════════════════════════════╗`);
console.log(`║   VALADARES SERVER em ws://:${PORT}    ║`);
console.log(`║   ${monsters.size} mobs · autoritativo (mobs+combate)   ║`);
console.log(`╚══════════════════════════════════════╝`);
