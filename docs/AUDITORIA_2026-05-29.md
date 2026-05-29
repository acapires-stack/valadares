# Auditoria completa do Valadares — 29/05/2026

> Auditoria do jogo inteiro (server + cliente + repo) por fan-out de 4 agentes +
> verificação manual. Objetivo do dono: segurança + "limpar coisas mais velhas".
> O que foi **aplicado+deployado** está em ✅. O resto está **priorizado pra revisar
> JUNTOS** (com teste in-game) — não foi blind-deployado de propósito.

---

## ✅ APLICADO + DEPLOYADO (deploy autônomo 29/05)

| Fix | Sev | O quê |
|---|---|---|
| **Lockdown do save** | 🔴 CRÍTICO | `saveUpload` agora sobrescreve `gold/inv/skills/equipped/chests` pelos valores VIVOS do server antes de persistir ([server.js:4389](../server/server.js)). |
| **maxPayload no WS** | 🟠 alto | `new WebSocketServer({..., maxPayload: 512*1024 })` ([server.js:17](../server/server.js)). |
| `FIXED_COSTS` removido | limpeza | objeto sempre vazio + branch morto em `itemGoldCost`. |
| Docs | limpeza | posições de NPC no ROADMAP (Tintureira 53,53 / Leiloeiro 53,47). |

### 🔴 O CRÍTICO em detalhe (o achado #1 da auditoria)
`setPlayerSave` faz `a.save = data` (grava o save do cliente **as-is**). O `saveUpload`
sobrescrevia só `hp/mp/x/y/dyes` com valores do server — **NÃO** gold/inv/skills/
equipped/chests. O `sanitizeSave` só *clampa* (gold ≤ 100M, skill ≤ 200). E o `join`
re-hidrata `p.gold/inv/skills` desse save. **Resultado:** um cliente forjava
`{t:'saveUpload', data:{gold:1e8, inv:{...9999}, skills:{tudo 200}, equipped:{melhor +5}}}`
→ reconectava → server carregava como legítimo. **Furava o lockdown N3 inteiro de forma
PERSISTENTE e minava a venda de gold (MercadoPago).** O comentário no código dizia que o
server "descartava" esses campos — **mentira, não descartava**. O lockdown era só
em tempo-real (`playerSync`), nunca na persistência.
- **Fix aplicado:** espelha o que já era feito com hp/mp/x/y. Cliente honesto: `data.* já
  == p.*` → no-op. Forjador: bloqueado. **Baixo risco** (mesmo padrão do hp/mp que já
  roda em prod). ⚠️ **TESTE quando voltar:** forje um save via F12 e confirme que reconectar
  NÃO aplica (gold volta ao valor real).
- ⚠️ **Não desfaz exploração passada:** se alguém já forjou gold antes, o valor está no
  save. Use `/checkuser NOME` pra auditar contas suspeitas e `/resetuser` se preciso.

---

## 🔴 SEGURANÇA — pra revisar (NÃO aplicado; precisa decisão/teste)

**[ALTO] Re-claim de daily reward** — `questTurnIn kind:'daily'` valida a reward contra
`DAILY_POOL` (bom), mas o anti-replay (`daily.claimed`) vem do save do CLIENTE. Logo: completa
daily → `saveUpload` com `quests.daily.claimed=[]` → re-claim infinito (gold+XP). **Fix:**
guardar `claimed`/`list` da daily server-side (parte do lockdown de quests). Risco do fix: médio.

**[MÉDIO] Hash de senha fraco** — `sha256(ACCOUNTS_SALT + clientHash)`, sem salt por conta,
salt default hardcoded `'valadares-v1-salt'` se env não setada. Se `accounts.json` vazar →
brute-force trivial. **Fix:** migrar pra `scrypt`/`argon2` com salt aleatório por conta
(rehash no login). Garantir `ACCOUNTS_SALT` setada em prod. Risco: médio (migração transparente).

**[MÉDIO] `/api/pix/create` sem rate-limit** — spam gera N preferences na conta MP real
(custo/ban do merchant). Também grava `email` em conta arbitrária por `playerName`. **Fix:**
rate-limit por IP + só gravar email na conta da sessão. Risco: seguro.

**[MÉDIO] `pos` sem rate-limit** — cliente malicioso manda milhares de `pos`/s → amplificação
de broadcast pra todos no andar. **Fix:** throttle por player (~80-100ms, abaixo do movimento
legítimo). Risco: seguro (mesmo padrão do attackMob rate-limit que já fizemos).

**[MÉDIO] `_errorRateMap` vaza + XFF spoofável** — `/api/error` usa `x-forwarded-for`
(cliente controla) como chave e nunca limpa o Map → vazamento de memória ilimitado; `meta.url`
sem cap. **Fix:** usar IP real, TTL/evict no Map, `url.slice(0,300)`. Risco: seguro.

**[BAIXO] `float` sem cap** — `t:'float'` propaga `text`/`color` do cliente sem limite (sem
XSS — é canvas, mas custo de banda). **Fix:** `slice(0,48)` + validar cor. Risco: seguro.

**[BAIXO] `/guild join` sem dedup nem cap** — `g.members.push` sem checar duplicata/limite;
`guildInvites` com chave crua. **Fix:** dedup + cap + validar nome. Risco: seguro.

**[BAIXO] admin por nome** — `isAdmin(name) === 'alcione'`. Single point: se a conta cair,
ganha admin. **Fix:** flag `isAdmin` na conta, não string de nome. Risco: seguro.

> ✅ Verificado SÓLIDO (sem achado): trade (atômico), auction (escrow ok), casino/forja/
> craft/shop/dye (gold debitado antes do roll, clamps), pvpAttack/pkDeath (caps+anti-cheat),
> reset de senha (token 192-bit, TTL, anti-enum), webhook MP (consulta API real + anti-duplo-crédito).

---

## 🧹 LIMPEZA — pra revisar (verificado pelos agentes; remover COM teste)

### Server (`server/server.js`)
- **Handlers legados mortos:** `t:'kill'` (no-op, mas cliente ainda envia em `killMonster`!),
  `t:'hlHuntClaim'` (no-op, cliente não envia mais). Remover os 2 LADOS juntos.
- **`ws.on('error')` duplicado** (2 listeners por conexão — o 2º só loga de novo). Remover o simples.
- **Dedup:** `_isValidEmail`→`isValidEmail` (usar a estrita); `dotColor` inline →`PLAYER_DOT_COLORS`;
  `COOLDOWN_MS` (HL hunt) definido 2× → extrair `HL_HUNT_COOLDOWN_MS`; `3000` hardcoded →`DOT_TICK_INTERVAL_MS`.
- **7× `typeof fn === 'function'`** guards inúteis (módulo único). Trocar por call direto.
- **`p.legacy = true`** (4400) — write-only, nunca lido. Remover.
- **Comentários stale:** bloco "M4 MVP 1 andar/sem mobs" (~1201, hoje é Fase 3, 5 andares+boss);
  prefixos "N3 fase 2/3", "Fase 5" espalhados; comentário "Bot 007" solto no `spellCast`.
- **`[mega] skip` logs** disparam a cada morte de boss — throttlar ou remover.
- **`duelWins`/`duelLosses`** acumulados em rankings mas nunca expostos — confirmar uso futuro.

### Cliente (`play.html`)
- **`function attack()`** (~4912) — morto (substituído por `engage()`/`doAttack()`). ~18 linhas.
- **CSS órfão** `.po-hp-bar`/`.po-hp-fill` (0 usos). `console.log('[autoupdate]...')` debug.
  Comentário "MELEE (lógica antiga)" enganoso.
- **🐛 BUG latente:** `castSpell()` (~11021) chama `killMonster(m)` SEM guard `serverAuthMobs`
  (diferente de doAttack/throwSpear) → pode dessincronizar mob online ("mob zumbi"). **Adicionar guard.**
- **~500 linhas de código offline/single-player** (spawnInitialMonsters ~250, updateMonster ~100,
  fallbacks `else` em doAttack/castSpell/throwSpear/tickRegen/completeStage/etc ~150). **Decisão:**
  manter (modo offline) e extrair pra `offline.js`, OU remover se offline não é mais suportado.
  ⚠️ NÃO é morto — roda quando `!serverAuthMobs`. Precisa sua decisão de produto.

### Protocolo morto (cliente↔server)
- **Sem feedback de erro:** server manda `{t:'trainResult/spellResult/talentResult', ok:false}`
  como mensagem de topo, mas o cliente **não trata** → jogador não vê "sem mana"/"sem pontos".
  **Fix fácil e seguro:** converter pra `serverMsg` no server (cliente já renderiza). Recomendado.
- **WS residual** (fluxo migrado pra HTTP): `setEmailResult`, `passwordResetResult`,
  `passwordResetConfirmResult` enviados mas sem handler no cliente; `pong`, `eventReward` (cliente
  trata mas server nunca manda), `pkDeath` legacy. Limpar.

### Constantes duplicadas cliente↔server (divergência silenciosa = bug)
- **`RECIPES[]` (30 receitas) duplicado byte-a-byte e INDEXADO POR POSIÇÃO** — editar/reordenar
  num lado sem o outro quebra o craft silenciosamente. Marcar "INDEX-SENSITIVE — sync" nos 2.
- `SAFE_RADIUS/CX/CY` (PZ), `CRAFT_POS` (inline no server, sem const), posições de NPC — hoje
  batem, mas qualquer mudança unilateral cria bug. Idealmente: 1 fonte compartilhada.

### Repo
- **`.gitignore`** não cobre `electron/dist/` nem `electron/node_modules/` (binários de build no
  working tree). Adicionar.
- **`itch-wrapper.html`** untracked, sem referência em lugar nenhum — decidir: commitar (itch.io),
  gitignore, ou apagar.
- **Docs stale:** `electron/README.md` e `docs/deployment.md` apontam pra URL antiga
  (`valadares-xi.vercel.app`) — atualizar pra `valadares.app.br` ou arquivar.

---

## Próximo passo sugerido (quando voltar)
1. **Testar o lockdown do save** in-game (forjar saveUpload → confirmar bloqueio). É o mais importante.
2. Decidir o **lockdown de daily** + **rate-limits** (pos/pix) — fáceis e seguros, mato junto.
3. Decidir o **código offline** (manter+extrair vs remover) — é o maior ganho de "clean".
4. Limpezas triviais (dead code/dedup/comentários) num lote, testando.
