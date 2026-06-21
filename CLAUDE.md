# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Idioma: responder em **português do Brasil** (o dono opera no Brasil). Produção tem 1+ jogador real — não quebrar sem testar.

## O que é

**Valadares** — RPG tile-based estilo Tibia, jogável no browser. MMO online-only (modo SOLO/offline foi removido). Em produção: cliente em https://valadares.app.br/jogar, server WS em wss://ws.valadares.app.br.

**Repositório:** este diretório é um **git repo próprio** (`acapires-stack/valadares`, branch única `main`), aninhado dentro de `D:\claude\`. Comitar sempre com `git -C "D:/claude/valadares"` para não cair no repo pai (SGX). Push na `main` → **Vercel + Railway auto-deployam**.

## Stack & layout

- **Cliente** — HTML/JS/Canvas puro, **sem build step**. `play.html` (~17k linhas) é o jogo inteiro num arquivo. `index.html` é a landing (bilíngue PT/EN). Outras páginas servidas estáticas: `ranking.html`, `admin.html`, `reset.html`, `terms.html`, `privacy.html`, `og.html`. (O `README.md` está parcialmente defasado — descreve o modo SOLO antigo.)
- **Server** — Node.js single-file `server/server.js` (~8.7k linhas / ~490KB). `ws` para WebSocket + `http` cru para REST, no mesmo `PORT`. Deps: `ws`, `mercadopago`. ⚠️ O `package.json` da **raiz** é o que o Railway instala — o SDK do MercadoPago tem que ficar nas deps da raiz, não em `server/`.
- **Desktop** — `electron/` (wrapper do site oficial, v1.0.11), auto-update via `electron-updater` + GitHub Releases.
- **Devlog** — `devlog/` gerador estático Node zero-dep.

## Comandos

```bash
# Cliente local (estático, porta 3333)
npx serve valadares -p 3333          # ou: python -m http.server 3333 --directory D:/claude/valadares
# (no Claude Code: preview_start name:valadares → localhost:3333, é o que o .claude/launch.json configura)

# Server local (porta 8080)
cd valadares/server && npm install   # uma vez
npm start                            # = node server/server.js → ws://localhost:8080

# Testes — harness standalone, sem framework (server/_test_*.js, são gitignored)
node server/_test_depths.js          # ex: masmorra, 24/24 esperado
node server/_test_arena.js           # arena PvP
# Cada _test_*.js sobe uma instância isolada do server e roda asserts; rodar direto com node.

# Devlog (adicionar post)
#   1. criar valadares/devlog/posts/<slug>.md (frontmatter YAML + corpo MD)
#   2. node devlog/build.js   → gera devlog/index.html + devlog/<slug>.html
#   3. commit

# Electron (build Windows)
cd electron && npm run build         # electron-builder --win --x64 → electron/dist/
```

**Testar local** (memória do projeto): o cliente tem um *version-gate* que força reload em mismatch com o server. Pra logar contra um server local, setar `CLIENT_VERSION='1.0.9'` antes do login. Combate é bloqueado na PZ (raio 4 no centro 50,50) — sair de 46–54 pra testar luta.

## Arquitetura — o essencial

**1. O server é a fonte da verdade (lockdown "N3 FULL").** `gold`, `inv`, `equipped`, `chests`, `skills`, `hp/mp/maxHp/maxMp` são 100% server-side. Mutação local desses campos some no próximo tick. Só cosmético/trail/animação é client-trusted. **Invariante central: nada que credite gold/inventário/XP pode viver só no cliente.** Ao adicionar feature que dá recompensa, o handler do server é o dono — o cliente só espelha (ver `docs/COMBATE_AUTORITATIVO_2026-06-01.md`).

**2. Protocolo WS** — frames JSON `{t:'...'}`. O dispatch é uma cadeia `if (msg.t === '...')` dentro de `wss.on('connection')` → `ws.on('message')` (~`server.js:5898`), ~55 tipos (`auth`, `join`, `pos`, `attackMob`, `spellCast`, `invEquip`, `invForge`, `enterDungeon`, `arenaJoin`, `tradeRequest`, …). **Portão de auth:** mensagens pré-auth são só `ping`/`auth`; em `server.js:6068` há `if (!p.authed || !p.authedName) return;` que bloqueia todo o resto. **Admin e identidade usam `p.authedName` (conta provada), NUNCA `p.name` (falsificável)** — esse portão foi o fix de um bypass crítico de admin.

**3. Game loop** — ~25 `setInterval` envolvidos por `safeTick(nome, fn)` (engole exceções pra um tick com erro não derrubar o server). Principais: `tickAI` (IA de mob), `broadcastMobs`/`broadcastMobsFull` (snapshots, **filtrados por floor**), `tickPlayerRegen` (500ms), `tickPlayerDots`, `tickRespawns`, `spawnDungeonMobs`, `tickArena`, `tickDuels`, `tickMegaBoss`, `tickGhosts` (corpo fica 3min após logout), `saveStateToDisk` (30s).

**4. Mundo & dados** — mapa 100×100 (`M_W`/`M_H`). Tudo definido como constantes no topo do `server.js`: tiles `T`, tipos de mob `MTYPE`, itens `ITEM_META`, receitas `RECIPES`, quests `QUESTS`/`QUEST_CHAINS`, loja `SHOP_BUY`, loot `LOOT`, pets `PET_DEFS`, NPCs em posições fixas. PZ (zona segura) = raio `SAFE_RADIUS` no centro.

**5. Floors / masmorra "As Profundezas"** — o campo `floor` separa planos. floor 0 = overworld (cidade, NPCs, PZ). floor ≥ 1 = masmorra **procedural por andar** (`genDungeonGrid`, cellular automata; **o server é dono do grid** e o envia no `dungeonEnter`; cliente desenha via `applyDungeonGrid`). Boss a cada `DUNGEON_BOSS_EVERY` andares, escala +60%/andar. PvP forçado dentro da masmorra. Broadcast/tickAI/snapshots filtrados por floor. Entrada no Antro do Minotauro (83,17). Floors 9000+ reservados para instâncias de Arena. Save NÃO grava coords de masmorra (deslogar lá = renasce na cidade).

**6. Persistência** (Railway Volume `/data`, sobrevive a redeploys; tudo gitignored):
- `state.json` — estado do mundo/mobs (`saveStateToDisk` a cada 30s, escrita atômica).
- `accounts.json` — contas + saves (`loadAccountsFromDisk`). Senha = **scrypt** com salt por conta, formato dual SHA-256/legado djb2 com migração transparente. Save passa por `sanitizeSave` (clampa gold/skills, sobrescreve hp/mp/x/y autoritativo) + trava anti-wipe "empty-over-full".
- `mp_credited.json` — ledger de idempotência de pagamento (`markPaymentCredited`).
- `accounts_backups/` — backups periódicos; `restoreUpload` restaura.

**7. REST endpoints** (mesma porta do WS): `/health`, `/api/status` (campo `maintenance`), `/api/packages`, `/api/password-reset/{request,confirm}`, `/api/ranking`, `/api/pix/create`, `/webhook/mp` (HMAC-SHA256 validado por `MP_WEBHOOK_SECRET`), `/api/error`, `/api/admin/state`, `/api/admin/action` (os dois gated por `ADMIN_TOKEN`, compare timing-safe).

**8. Resolução do WS no cliente** (`resolveWsUrl` em `play.html`): `?ws=` na query → `localStorage 'valadares:ws'` → localhost → senão `wss://ws.valadares.app.br`.

## Deploy & topologia

- **Cliente → Vercel → `valadares.app.br`** (estático, sem build, root dir `valadares`). `vercel.json` faz os rewrites (`/jogar`→`play.html`, `/ranking`, `/admin`, `/devlog/...`) + headers `no-cache` nos `.html`.
- **Server → Railway → `wss://ws.valadares.app.br`** (build por `Dockerfile`, node:18-slim, Volume em `/data`). `railway.json` tem `watchPatterns` = só `server/**` + arquivos de package/Docker redeployam. **Por isso push client-only (play.html, index.html, …) vai pro Vercel e NÃO reinicia o server** — ninguém online é derrubado.
- **Cloudflare** proxia o registro `ws` (nuvem laranja). O server lê o IP real via `CF-Connecting-IP`, confiável só quando o hop é de range Cloudflare (`CF_IP_RANGES`) — senão os rate-limits por IP colapsariam todos os players num punhado de IPs.
- **Pagamentos:** MercadoPago Checkout Pro (Preference API; PIX + cartão). Webhook produção e teste são separados.
- **Email:** Resend (reset de senha + alerta de login/nova-conta).
- **Segredos** vivem só nas env vars do Railway (`.env` é gitignored): `ADMIN_TOKEN`, `ADMIN_NAME`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_BASE_URL`, `STATE_FILE_PATH`, `MAX_CONN_PER_IP`, etc.

## ⚠️ Ritual de deploy (regra inegociável)

**NUNCA pushar `server/**` com jogador ONLINE.** Uma sessão fantasma pode gravar um save vazio por cima de um cheio e corromper a conta (já zerou o boneco do dono uma vez). Antes de pushar mudança de server **ou de mergear PR que toca `server/**`**:

1. Disparar manutenção pelo admin (countdown `/manutencao`) — o server avisa, seta `_maintenanceLockUntil`, derruba players com code 4030 e rejeita novos `auth`.
2. Confirmar `/api/status` → `maintenance:true` (janela do lock ativa = seguro pushar).
3. Pushar / mergear. O lock auto-expira em ~1 min.

Push **client-only** (não toca `server/**`) é seguro a qualquer hora — Railway não redeploya. Acumular mudanças de server e deployar em lote.

## Onde está a história

- `ROADMAP.md` — norte de decisão (backlog priorizado, marcos, **lições aprendidas** sobre MercadoPago/DNS/Resend/Railway/electron-builder/lockdown/save-corruption).
- `SESSION_NOTES.md` — registro cronológico do que rolou por sessão.
- `docs/` — designs e auditorias de segurança: `COMBATE_AUTORITATIVO_2026-06-01.md`, `design-magos.md`, `design-pvp.md`, `AUDITORIA_2026-05-29.md`, `AUDITORIA_2026-06-03.md`, `i18n-plano-EN.md`.
- i18n: toda UI visível (jogo + landing + páginas avulsas) é bilíngue PT/EN. No cliente a função de tradução é **`tr()`**, não `t()` (`t` é tile). Idioma em `localStorage 'valadares_lang'`, default PT.
