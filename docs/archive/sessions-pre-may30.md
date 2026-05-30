# Notas de Sessão

## 🔬 Sessão 29/05/2026 (cont. 2) — Auditoria COMPLETA do jogo (autônoma)

Dono pediu auditoria do jogo todo pra segurança + "limpar coisas mais velhas". Rodei
fan-out de 4 agentes (server segurança, server limpeza, cliente, cross-cutting/repo) +
verifiquei à mão. **Relatório completo e priorizado: [`docs/AUDITORIA_2026-05-29.md`](docs/AUDITORIA_2026-05-29.md).**

**✅ Aplicado + deployado (autônomo):**
- 🔴 **CRÍTICO — lockdown do save**: `saveUpload` gravava `gold/inv/skills/equipped/chests`
  do CLIENTE as-is (`setPlayerSave` faz `a.save=data`; só hp/mp/x/y eram sobrescritos), e o
  join re-hidratava → **gold/itens/skills forjados PERSISTENTES** (furava o lockdown N3 inteiro
  + a venda de gold MP). O comentário dizia "server descarta" mas o código NÃO descartava. Fix:
  sobrescreve esses 5 campos com os valores vivos do server antes de persistir (espelha hp/mp/x/y).
- 🟠 **maxPayload=512KB** no WebSocketServer (frame de 100MB travava o event loop = DoS de todos).
- Limpeza: removido `FIXED_COSTS` (branch morto); corrigidas posições de NPC no ROADMAP.

**📋 Documentado pra revisar JUNTOS (não blind-deployado — dono fora):** re-claim de daily,
hash de senha fraco, rate-limits (pos/pix), `_errorRateMap` leak; ~500 linhas de código offline
(extrair/remover), handlers de protocolo mortos (trainResult/spellResult sem feedback de erro),
`RECIPES` duplicado index-sensitive, dead code (client `attack()`, CSS órfão), bug do `castSpell`
sem guard. Tudo no doc da auditoria.

> ⚠️ Testar o **lockdown do save** in-game é o mais importante (forjar saveUpload → confirmar bloqueio).

---

## 🔒 Sessão 29/05/2026 (cont.) — Auditoria da masmorra + 4 fixes de combate/loot

Pedido do dono: auditar a masmorra Fase 3 antes de seguir. **Descoberta de processo:**
`/security-review` + `/code-review` comparam o branch contra `origin/main` — e como a
Fase 3 já está em produção (`origin/main` == HEAD), o diff é vazio. Eles auditam *feature
branch antes do merge*, não código já shipado. Auditoria feita **manual** nas funções
nomeadas (handlers de transição, `spawnDungeonMobs`, escala, `distributeBossLoot`,
`isTransitionTile`).

### 🔴 CRÍTICO — dano client-side permitia one-shot do boss + roubo de 100% do loot
`attackMob` capava o dano em `MTYPE[m.type].hp + 50` (comentário mentia "3× dmg"). Pro
boss (5000hp) o teto era 5050: `{t:'attackMob', amount:5050}` matava em **1 hit** e
levava todo o loot top-tier (`damageBy` = 100%). Pré-existente, mas o boss 5000hp de Fase
3 elevou pra crítico (e neutralizava o cooldown). **2 fixes:**
- `MAX_HIT_DMG = 600` — maior hit legítimo ≈ **372** (arma mítica+forja 37 + skill cap
  `floor(200/3)`=66 + var 2 = 105, ×2 crit = 210, × mults máx ~1,77). 600 = folga 1,6×,
  nunca capa hit real; boss vira ≥9 hits.
- `ATTACK_MIN_INTERVAL_MS = 200` — rate-limit no attackMob. Ataque legítimo mais rápido =
  **680ms** (`attackDelay` 800 × `atkSpd` máx 0,15 da forja; cliente trava o input nisso),
  então 200ms tem 3,4× de folga (campo dedicado `_lastAttackMobAt`, não colide com a
  mini-PZ). Juntos fecham o farm: ≥9 hits a ≥200ms = ≥1,8s, e o boss revida.

### 🟠 MÉDIO — loot de boss farmável por alts em party
`distributeBossLoot` em party puxava TODOS os membros no andar (peso 1), mesmo com 0 de
dano → alts parados no andar 5 farmavam loot. **Fix:** só quem deu dano entra no rateio.
(Removida a var morta `bossFloor` de quebra.)

### 🟡 BAIXO — deferido (sistêmico, trust de movimento/combate do jogo todo)
- Transição de andar é **UX-gated**: `p.x/y` é client-trusted → dá pra *rushar* 1→5 em
  ~2,4s (anti-spam 600ms). A máquina de estados de floor É server-side (sem pulo
  arbitrário). Resolver o crítico tira o valor disso.
- `range` do attackMob é client-side → ataque de longe.
> Refactor de movimento autoritativo é o caminho — fora do escopo de hotfix.

### ✅ O que estava correto
Escala `1+0,6·(andar-1)` (andar 5 = 3,4×), boss isolado do leveling do mundo, clamp de
coords no `pos`, DoTs clampados, `isTransitionTile`, PvP forçado persistindo pelos andares.

### 🔧 Procedimento de manutenção (deploy gracioso) — ideia do dono
Resolve "cai no mato" + "preso na masmorra pós-deploy" de uma vez.
- **Reconnect → PZ**: na janela pós-boot (`POST_BOOT_HEAL_MS`, 3min) o join agora cura
  E manda `p.x/y = (50,50)` (centro da PZ). A posição vai no snapshot self do `state` →
  o cliente aplica sozinho (já era autoritativo em x/y). Flag `maintenance` → toast. Só
  na janela → não vira fuga de PvP em reconexão normal.
- **Countdown de aviso**: `/manutencao [min]` (admin) ou botão no painel admin
  (seção MANUTENÇÃO). `startMaintenanceCountdown` faz broadcasts cronometrados
  (Xmin → 30s → 10s → "reiniciando"). **Nuance**: o aviso NÃO sai do deploy (o Railway
  mata o processo em segundos) — o dono dispara ANTES de pushar.
- **Fluxo**: [botão 🔧 avisar 3min] → countdown → [push perto do fim] → restart → todos
  reconectam curados na PZ. (Este 1º deploy já ativa o reconnect→PZ; só o countdown
  ainda não, pq roda no server velho.)

---

## 📅 Sessão 29/05/2026 — M4 Fase 3 (descida + boss) + polish da masmorra

**6 commits** (`cf0e937` → `c6ed9f1`). Deploys feitos com o dono sozinho no servidor.

### ✅ M4 Fase 3 (a masmorra agora é uma descida real)
- **3a — descida multi-andar** [`efed9cd`]: **5 andares**. Escada de descida (50,57)
  → andar+1; subida (50,50) → andar-1 (andar 1 → cidade). Chega sempre em (50,52).
  Mobs comuns escalam **+60%/andar** (andar 5 ≈ 3,4×). Spawn/limpeza por andar
  (efêmero). Handlers `enterDungeon`/`descendDungeon`/`exitDungeon` + helper
  `enterDungeonFloor` (popula antes do snapshot). Fog do overworld só salvo na entrada.
- **3c — boss do andar 5** [`cae70b8`]: **O Senhor das Profundezas** (unique,
  5000hp/110dmg, intel 3, spawn 50,42). Loot top-tier **por dano** (`distributeBossLoot`).
  Isolado do leveling dos bosses do mundo → respawna Lv1 fresco a cada delve.
  ✔ **Confirmado in-game** (dono tirou ~1800hp dele antes de um deploy resetar).

### ✅ Entrada do M4 movida [`cf0e937`]
Da beirada da PZ (50,46) → **Antro do Minotauro (83,17)**, fora da PZ, gated por mobs.
Novato não cai mais sem querer. Retorno em (83,18).

### ✅ Reconexão / infra
- **Preso na masmorra após deploy** [`cf0e937`]: `t:'state'` reseta floor→cidade +
  desliga PvP forçado no reconnect (era "boneco preso + PvP travado").
- **Watch paths Railway** [`efed9cd`, `railway.json`]: push só-de-cliente NÃO reconecta
  ninguém (só `server/**`/`package.json`/`Dockerfile`/`railway.json`). ✔ Confirmado
  (deploy `c6ed9f1`, só cliente, não reconectou).

### ✅ IA / loot / UI / sprites
- **Mobs em fila** [`efed9cd`+`f36c28b`]: (1) `pickSurroundSlot` validava com regra de
  cidade (`inSafe`) → na masmorra rejeitava tudo → fila. Agora `mobTileOk` floor-aware.
  (2) `DUNGEON_ROOM` 41-59 → **40-60** (= sala visível): no canto só 1 mob alcançava;
  agora 3. Carrasco → `intel 3` (flanco).
- **Loot espalhado** [`efed9cd`]: `DROP_SPREAD` apertado pro **3×3** (coletar não puxa mob).
- **Scroll do inventário** [`efed9cd`]: preserva `scrollTop` no re-render.
- **Mobs em cima da escada** [`296bac8`]: `isTransitionTile` em `mobTileOk`+`spawnMob`
  — mob não fica na escada/chegada (bloqueava entrar/subir/descer).
- **Sprite de +N** [`cf0e937`+`f36c28b`+`c6ed9f1`]: itens forjados (`X_PLUS_N`) perdiam
  o sprite especial (comparação por **key exata**). Resolvido com `getUpgradeTier(key).base`
  em `drawWeaponSprite` (arma na mão), `drawItemSprite` (ícones) e `drawCharacter`
  (armadura/elmo/botas no boneco). → **gotcha recorrente**: todo render que faz
  `key === 'X'` quebra pra forjado; resolver a base.

### ⚠️ Pendências (pra próxima)
- **✅ 🔁 Boss respawna NA HORA ao morrer — RESOLVIDO** (ver seção Auditoria+fixes
  acima): `dungeonBossDeath` (Map floor→ts) + gate de 8min no `spawnDungeonMobs` +
  registro nos 2 caminhos de morte (`handleMobDeath` + attackMob). Foi junto do
  deploy da auditoria.
- **Reconexão da masmorra cai no mato** (coords da masmorra no overworld; dono saiu em
  (40,40)). Fix OFERECIDO, não feito: jogar na cidade (50,50) com trava one-shot no join
  (anti-abuso de teleporte/fuga de PvP). Aguardando OK do dono.
- **Deploy mid-fight resetou o boss do dono.** Regra reforçada: **avisar antes de
  deployar** se o dono puder estar em combate. (já em [[feedback-valadares-deploy]])
- **Escadas em linha (x=50) = previsível/fácil** (feedback do dono). Caminho: randomizar
  a escada de DESCIDA por andar (seed pelo floor) OU resolver de vez no 3b.
- **Balanceamento boss/andares**: dono confirmou "tá difícil" (bom); calibrar hp/dmg/loot
  após o veredito final do playtest.

### 🎯 Próxima sessão (definido com o dono)
1. **Auditoria completa** — segurança + código das mudanças da masmorra/boss: novos
   handlers (`descendDungeon`, transições), `spawnDungeonMobs`/despawn, escala de stats,
   `distributeBossLoot`, `isTransitionTile`. Rodar `/security-review` + `/code-review`.
2. **M4 3b completo** — layout **procedural por andar** (sala diferente cada andar; o
   server precisa do **grid real** pra spawn/colisão — hoje usa bounding box 40-60).
   Resolve as "escadas em linha" de quebra.

---

## 📅 Sessão 27→28/05/2026 (madrugada — sessão maratona)

**Sessão histórica de ~7 horas** com 20+ commits. Fechou Hardening N3 fase 3
inteira, lançou suporte mobile, season system, talent tree, todas as fontes
de XP server-side e setup completo de SEO. Domínio próprio em propagação.

### 🎯 Estado do projeto pós-sessão

- ✅ **Anti-cheat 100%**: gold, inv, equipped, chests, skills — TUDO server-side
- ✅ **Mobile playable**: touch controls + responsivo (10× audiência potencial)
- ✅ **Retenção mensal**: season + leaderboard com Coroa de Temporada
- ✅ **Build variety**: talent tree (6 talentos passivos)
- ✅ **SEO base**: Search Console verificado + sitemap submetido + indexação solicitada
- 🕐 **Domínio próprio**: `ws.valadares.app.br` configurado (propagando DNS)

### 📦 Commits da sessão (em ordem)

| # | Commit | Feature |
|---|---|---|
| 1 | `b98e4c3` | HMAC do webhook MercadoPago (anti-forge) |
| 2 | `0ba06ca` | Tabs CHAT/COMBATE invertidas + NPC Banqueiro de gold |
| 3 | `2755088` | Email do comprador no checkout MP |
| 4 | `ce340c6` | N3 fase 3 — ondas 1+2 (quest reward + daily quest server-side) |
| 5 | `94aa000` | N3 fase 3 — ondas 3+4 (daily events + Highlander Hunt) |
| 6 | `147bcd5` | N3 fase 3 — onda 5 (lockdown saveUpload/playerSync) |
| 7 | `701dcf7` | nixpacks.toml + NPCs espaçados (1 tile entre cada) |
| 8 | `7c140cd` | SESSION_NOTES (este arquivo) |
| 9 | `6141d5f` | **Dockerfile** pra bypass do Railpack quebrado do Railway |
| 10 | `0125ff3` | Fix bug: cosméticos não equipam (lista equippable + slot paper-doll) |
| 11 | `4abadc2` | **Mobile / touch controls** + viewport + ROADMAP_v2.md |
| 12 | `cc59d43` | Landing destaca mobile (hero + features + steps) |
| 13 | `1476268` | **M3 Season + Leaderboard mensal** + Coroa de Temporada |
| 14 | `d9da8ce` | **M5 Talent tree** (6 passivos server-side) |
| 15 | `e33bca7` | **T1 Mob kill XP server-side** (último cheat fechado) |
| 16 | `5e861bc` | **T3 LOCKDOWN COMPLETO** — skills 100% server-side |
| 17 | `13fba9d` | SEO: robots.txt + sitemap.xml + meta tags + schema.org |
| 18 | `4992543` | Google Search Console — meta tag de verificação |

### ⚠️ INFRA — Atenção a estes pontos

1. **Dockerfile substituiu Railpack/Nixpacks** no Railway.
   Se mexer no build do servidor, edita o `Dockerfile` na raiz (não o
   `nixpacks.toml` que ficou só como fallback).

2. **Meta tag de verificação do Google** no `<head>` do `index.html`:
   ```html
   <meta name="google-site-verification" content="VsqFjI2-u1YIfcgyI-mDR0GuSLyFVtrJvaS2VAjIBa8">
   ```
   **NÃO REMOVER** ou perde acesso ao Search Console.

3. **Lockdown total** no saveUpload: cliente envia `data.skills/inv/gold/
   equipped/chests` mas server **ignora**. Toda mutação dessas grandezas só
   acontece via handlers server-side (~15 handlers).

4. **3 referências hardcoded** ao Railway antigo que precisam virar `ws.valadares.app.br` quando DNS propagar:
   - `play.html:5197` — `PRODUCTION_WS_URL`
   - `play.html:6178` — fallback HTTP base
   - `server/server.js:22` — `MP_BASE_URL` (webhook MP)

### 🌐 DOMÍNIO `ws.valadares.app.br`

**Status atual (01:43 BRT 28/05):** salvos no Registro.br, em propagação interna.

DNS records no Registro.br:
| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `ws` | `y42t76d8.up.railway.app.` |
| TXT | `_railway-verify.ws` | `railway-verify=08431d58149682988b0c3e2e7d8fd29417f8378733514484f649ae95d3d63f` |

Pra confirmar amanhã se propagou:
```powershell
nslookup ws.valadares.app.br a.auto.dns.br
nslookup -type=TXT _railway-verify.ws.valadares.app.br a.auto.dns.br
```
Se ambos responderem, Railway vai detectar em <30min e ficar **Active** 🔒.

### 🔍 SEO — Google Search Console

- Propriedade: `https://valadares.app.br/` (Prefixo do URL)
- Verificação: meta tag HTML ✅
- Sitemap: `sitemap.xml` enviado ✅
- Indexação solicitada: `/` e `/jogar` ✅
- Linha do tempo: 1-3 dias indexação inicial · 1-2 semanas em buscas específicas

### 📋 PENDENTE pra próximas sessões

#### Curto prazo (1-2 sessões)
- [ ] **Atualizar URL** pra `wss://ws.valadares.app.br` (3 pontos no código) — quando DNS propagar
- [ ] **og:image** — criar JPG 1200x630 promo pra preview social
- [ ] **T4 Spawn Caçadores HL server-side** (~60min) — Hunt em MP visualmente broken
- [ ] **T2 Regen HP/MP server-side** (~60min) — completa a dívida técnica

#### Médio prazo (ROADMAP_v2.md)
- [ ] **M4 Dungeons instanciadas** (2-3 sessões) — endgame fresco
- [ ] **M6 Gold sinks** (~60min cada) — cassino, tinturaria, pet cosmético
- [ ] **M7 Arena PvP 1v1/3v3** (2 sessões)
- [ ] **M8 Auction house** (2 sessões)

#### Conteúdo / marketing
- [ ] **Backlinks**: Reddit, Discord, Twitter, post de gameplay
- [ ] **Itch.io page** linkando pra `valadares.app.br`
- [ ] **Adicionar Website link** no repo GitHub (`acapires-stack/valadares`)

### 🧪 Coisas a TESTAR amanhã (depois do deploy de tudo)

1. **Login no jogo** — confirmar que tabs CHAT/COMBATE estão invertidas
2. **NPC Banqueiro** em (52,50) — clica e abre loja de gold MP
3. **Cosmético equipável** — equipa Capa do Cético/Aura via inv
4. **Tecla K** abre modal de Talentos — comprar um talent
5. **Tecla L** → aba TEMPORADA — ver leaderboard mensal
6. **Quest reward** — completar uma daily ou simples, ver gold creditado pelo server
7. **Mobile** — abrir `valadares.app.br/jogar` no celular, testar joystick + botões
8. **Cheat test** (F12 → Console): `player.skills.Espada.val = 200` — matar um mob → server reescreve pro valor real

### 🔐 Estado de segurança final

| Vetor | Status |
|---|---|
| Forjar gold via F12 | ❌ Server lockdown |
| Forjar inv via F12 | ❌ Server lockdown |
| Forjar equipped/chests via F12 | ❌ Server lockdown |
| Forjar skills via F12 | ❌ Server lockdown (T3 completo) |
| Forjar quest reward | ❌ Server validation |
| Forjar webhook MP | ❌ HMAC validation |
| Dobrar gold de Chuva de Ouro | ❌ Bug fix |
| Cheat XP de mob kill | ❌ T1 server-side |
| Cheat XP de magia | ❌ Server handler `spellCast` |
| Cheat XP de treino | ❌ Server handler `trainAttempt` |

**Praticamente nada relevante pra progressão é editável no F12 mais.**

---

## 📅 Sessão 27/05/2026 (noite N3 fase 3 + QoL)

Sessão grande: fechou **fase 3 do Hardening** (lockdown total de gold/inv server-side), além de várias melhorias de QoL e segurança.

### 🛡 Hardening N3 fase 3 — completo

**Onda 1 — Quest reward server-side** (`questTurnIn`)
- 5 quests simples (q_ratos, q_cobras, q_seda, q_orcs, q_lider)
- 7 chains × 25 stages (cripta, forja, drake, mina, vohrim, crepusculo, vendedor) — kinds item, multiItem, mob, visit, choice
- Validações: adjacência ao NPC, items requeridos, anti-replay (`quests.completed` / `questFlags[chainId][stageId]`), pre-stages, choiceId existe, rate limit 400ms
- Hidratação no join: server carrega `skills/quests/questFlags/flags/permaBuffs` do save

**Onda 2 — Daily quests server-side**
- Server tem `DAILY_POOL` espelhado — reward vem da TABELA, não do save
- Cliente forjar `gold:99999` na entry vira no-op (server usa o pool)
- Anti-replay via `quests.daily.claimed`

**Onda 3 — Daily events server-side**
- **Bug fix crítico**: Chuva de Ouro dobrava o gold (server creditava E cliente somava no `eventReward`). Agora server credita via `invUpdate.goldDelta(reason='gold_rain')`; cliente só feedback visual.
- Bênção da Sabedoria aplica +50% XP também em quest reward server-side (gainSkillXpServer)

**Onda 4 — Highlander Hunt server-side**
- Cliente NÃO mais credita `player.gold` direto quando mata os 3 caçadores. Online → `hlHuntClaim` → server gera bonus (200-450g) + cooldown 5min. Offline → fallback local (single-player).

**Onda 5 — Lockdown total**
- `saveUpload` e `playerSync` IGNORAM `gold/inv/equipped/chests` do cliente
- Toda mutação passa por handlers server-side: questTurnIn, attackMob (loot), shop, craft, forja, invEquip, invChest, groundPickup, invConsume, invUseBlessing, hlHuntClaim, webhook MP
- Validado e2e: cliente forjou gold:99999 + ESPADA_ETERNA + COROA_VALADARES → tudo descartado pelo server

### 💳 MercadoPago — segurança + UX

- **HMAC do webhook**: novo `MP_WEBHOOK_SECRET` (env Railway) valida `x-signature` de toda chamada em `/webhook/mp`. Cliente falsa request → REJEITADO. Sem secret = modo dev/compat.
- **Email do comprador no checkout**: campo `email` no modal `goldShopModal`, validação cliente + server (regex), persistido em `player.email` (próxima compra vem pré-preenchida). Server passa `payer.email` na preferência MP — Checkout Pro pré-preenche + comprador recebe recibo no email real.

### 🎨 QoL

- **Tabs invertidas**: chat panel agora abre com `CHAT` ativa (era COMBATE). Ordem visual também trocada.
- **NPC Banqueiro de gold**: novo NPC dourado entre Mercador e Atendente. Interagir abre `goldShopModal` (loja MercadoPago) — antes só `/loja` no chat achava.
- **NPCs espaçados**: Mercador/Banqueiro/Atendente em (52,48)/(52,50)/(52,52) com 1 tile vazio entre cada (estavam colados em 49/50/51).

### 🐛 Build do Railway

- `nixpacks.toml` explícito (provider=node, sem aptPkgs) — build estava falhando com `secret ID missing for "" environment variable / install apt packages: libatomic1`.

### 📦 Commits da sessão

`b98e4c3` HMAC · `0ba06ca` tabs+Banqueiro · `2755088` email checkout ·
`ce340c6` N3 ondas 1+2 · `94aa000` N3 ondas 3+4 · `147bcd5` N3 onda 5 (lockdown) ·
`701dcf7` nixpacks + NPCs espaçados.

---

## 📅 Sessão 27/05/2026 (N3 fase 2 + Electron build)

Foco: fechar as 5 ops pendentes do Hardening N3 fase 2 + buildar o Electron desktop.

### 🛡 Hardening N3 fase 2 — completo

**1. Equip/Unequip server-side**
- Mensagens novas: `invEquip { itemKey }` e `invUnequip { slot }`
- Server (`SLOT_OF_KIND` espelhado) valida posse, resolve conflito 2H↔offhand, mexe `p.inv` e `p.equipped`
- Resposta: `invUpdate { inv, gold, equipped, equipOp:{ ok, slot, itemKey } }` + broadcast `pstats` pros outros players verem o visual atualizado
- Cliente faz mutação otimista pra UI snappy; server reconcilia via invUpdate

**2. Chest deposit/withdraw server-side**
- Mensagem: `invChest { op, chestId, itemKey?, qty? }` com 6 ops:
  deposit · withdraw · depositGold · withdrawGold · depositAll · withdrawAll
- Server valida adjacência ao baú (CHEST_POS hardcoded mesma posição do cliente)
- `p.chests = { b1:{}, b2:{}, b3:{}, b4:{} }` agora é autoritativo, hidratado de `acc.save.chests` no join
- Resposta: `invUpdate { inv, chests, chestOp, moved/goldMoved/depositAll/withdrawAll }`

**3. Pickup do chão server-side**
- Server mantém `groundDrops` Map: `id → { id, x, y, type, qty, spawnedAt }`
- IDs server-side (prefixo `g`) atribuídos em `mobKill`. Broadcast `groundSpawn` pra TODOS verem drops dos outros (antes só o killer via)
- Mensagem: `groundPickup { ids: [...] }`. Server valida chebyshev ≤1 do drop, transfere pra `p.inv` ou `p.gold` (tipo `GOLD`)
- Broadcast `groundRemove { ids }` pra todos limparem o chão
- Auto-despawn de 5min via `tickGroundDespawn` (intervalo 30s)
- Cliente single-player offline (sem `serverAuthMobs`) continua usando lógica local

**4. Munição/lança server-side**
- `attackMob` aceita 2 flags novas:
  - `ammoKey`: server valida `ITEM_META[ammoKey].kind === 'ammo'` + `hasInv(p, ammoKey, 1)`, decrementa; se cliente mentir, rejeita o ataque
  - `throwSpear:true`: server consome `p.equipped.weapon` (valida `throwable`) e re-equipa do inv se houver outra lança
- Cliente faz mutação otimista; invUpdate reconcilia

**5. Lockdown parcial saveUpload + PvP gold authoritative**
- `saveUpload`: server agora SYNC `p.inv/equipped/gold/chests` ← `data.X` antes de salvar (mantém server-side em paridade com mutações client-side que ainda existem — quest rewards, daily events)
- `pkDeath` agora transfere gold authoritativo (vítima.gold -= n; killer.gold += n) + drop de CORACAO_HL via `incInv`. Cliente removeu a soma local (server credita via invUpdate)
- `pvpAttack` (ghost kill) também credita gold + droppedItem via `incInv` server-side
- Lockdown FULL (bloquear writes do cliente) fica pra fase 3 — depende de migrar quest/event rewards pro server. Hoje ainda preserva `playerSync.inv/gold` aceitos pra cobrir essas mutações client-side.

### 💻 Electron build

- `cd valadares/electron && npm run build` rodado
- Sucesso parcial: `dist/win-unpacked/Valadares.exe` (188MB, com Chromium) gerado e funcional
- **NSIS installer falhou**: `winCodeSign-*.7z` não consegue extrair symlinks no Windows sem Developer Mode (erro "O cliente não tem o privilégio necessário"). Para rodar o build completo:
  - Habilitar Windows Developer Mode (Settings → Privacy & security → For developers → ON), OU
  - Rodar terminal como admin
- Workaround temporário: zipar a pasta `win-unpacked/` ou distribuir só o `.exe` portable
- Auto-update via electron-updater já configurado (publish: github, owner: acapires-stack) — só funciona depois que houver release publicada

### 📋 Pendente fase 3 (próxima sessão)

- Quest rewards server-side (NPC chain stages → server valida + grant)
- Daily event rewards server-side (Chuva de Ouro / Cerco / Sabedoria — server aplica)
- AÍ SIM bloquear `playerSync.inv/gold` e `saveUpload.{inv,gold,equipped,chests}` (server vira fonte única)

---

## 📅 Sessão 27/05/2026 (noite) — Pacote massivo: features novas + N3 + Electron + MercadoPago

> Sessão muito grande dividida em 3 blocos. ~22 commits, várias features
> novas, primeira camada do Hardening N3, e infra pra monetização.

### 🆕 Bloco 1: features novas (10 features)

**Visuais/MP:**
- **attackVfx broadcast** — PART_FOGO/PART_TROVAO dos outros players propagam via server (era só local).
- **Achievement system** — 14 conquistas iniciais → expandido pra 20 (com 6 ligadas às features novas). Tiers bronze/prata/ouro, modal J, badges visíveis ao lado do nome (até 2). Broadcast via playerSync + join.
- **Eventos diários rotativos** — 3 tipos (Chuva de Ouro, Cerco Demoníaco, Bênção da Sabedoria) deterministicamente alternados por dayN. Janela 60min em hora random BRT 13h-21h. Widget de countdown na sidebar.
- **Duelo 1v1 consensual** — `/duelo NOME APOSTA` com modal de convite, gold descontado/restaurado server-side. Vencedor 2× sem penalty PvP. Ranking duelWins/Losses.

**Quest chains:**
- **Madame Crepúsculo** (28,75) — 4 etapas + escolha moral Aura do Vidente (perma +5% esquiva) ou Capa do Cético (3000g).
- **Embaixador Vohrim** (15,50) — 5 etapas, vilão revelado. Coroa Sombria (pacto) ou Manto do Justo (recusa).

**Sistemas:**
- **Party 1-4 players** — `/party` system. XP 60% pra cada membro no raio 12. HP no minimap (verde, ignora fog). Widget sidebar.
- **Spectator mode** — 15s pós-morte câmera segue killer (player ou mob). Input bloqueado. ESC respawna. Overlay vermelho com countdown.
- **Death replay** — buffer rolling dos últimos 5s. Timeline +Xs · HP · evento no modal Stats.

**Cosméticos novos:** AURA_VIDENTE, CAPA_CETICO, COROA_SOMBRIA, MANTO_JUSTO

### 🛡 Bloco 2: Hardening N3 (parcial — 5 ops migradas)

Estratégia incremental, não big-bang. Cliente envia intenção → server valida + aplica → invUpdate de volta.

- **Forja** server-side — UPGRADE_FAIL/COST_MULT/MAX + getUpgradeTier portados. Server faz fail roll + cria _PLUS_N. F12 spawn de lendário via forja parou de funcionar.
- **Craft** server-side — RECIPES (28) espelhadas. Valida posição perto da bancada (50,52) + materiais + gold.
- **Shop buy/sell** server-side — SHOP_BUY espelhada. Valida adjacência ao Mercador (52,49) + gold/qty. Suporta venda de _PLUS_N.
- **Bênção da Fênix** server-side — cliente envia invUseBlessing e ESPERA confirmação antes de aplicar revive. playerDie/pkDeathBy viraram async com _dying guard.
- **Use potion/food** server-side — eatBestFood envia invConsume. Cliente aplica HP/manaBuff APENAS ao receber consume:{ok:true} do server.

**Server: ITEM_META** espelhado (87 items, só campos kind/heal/manaheal/base/def/speed/ranged).

**Pendente (deferred — vetores menos críticos):**
- Equip/Unequip (move, não cria)
- Chest deposit/withdraw (move)
- Pickup do chão (precisa server manter groundItems)
- Munição consumida (arrow/lança)
- saveUpload block do inv (depende dos outros virem)

Os 5 vetores **CRÍTICOS** (criar item do nada, gold infinito, etc) tão fechados. Equip/Chest são moves — não criam item — protegidos pelo cap de N1.

### 💻 Bloco 3: Electron desktop wrapper

`valadares/electron/` — main.js carrega site oficial num BrowserWindow nativo.
- F12 / Ctrl+Shift+I/J / Ctrl+U bloqueados em prod
- Auto-update via electron-updater apontando pra GitHub Releases
- electron-builder configurado (NSIS + Portable Windows x64)
- npm install local feito (~150MB)
- Pra build: `cd valadares/electron && npm run build` → gera `.exe` em `dist/`

### 💰 Bloco 4: MercadoPago PIX + Cartão (CHECKOUT PRO)

**Server (valadares/server/server.js):**
- HTTP server compartilhado com WS (`http.createServer` + `wss.on('upgrade')`)
- SDK `mercadopago@2.13` (instalado no package.json RAIZ, não no server/ — Railway usa o raiz)
- Endpoints: `/api/packages`, `/api/pix/create`, `/webhook/mp`, `/health`
- Token via env var `MP_ACCESS_TOKEN` no Railway
- 4 pacotes de gold: 10k/30k/100k/300k → R$10/25/70/180
- Mudou de **Payment API → Preference API (Checkout Pro)** porque Payment direto deu "Unauthorized use of live credentials" (exigia homologação da conta MP)
- Aceita PIX + Cartão Crédito (1× sem juros) + Débito. Boleto excluído.
- `creditGoldToPlayer` — online via WS (sendInvUpdate goldDelta), offline persiste em accounts.json

**Cliente (index.html):**
- Modal `/loja` com 4 pacotes
- `buyGoldPackage` POSTa `/api/pix/create`, abre `initPoint` numa nova aba
- Handler `invUpdate.goldDelta` exibe toast + addFloat quando MP confirma
- `SERVER_HTTP_BASE` derivado de `WS_URL`

**Configuração no painel MP necessária (ele fez):**
- Webhook URL PRODUÇÃO: `https://valadares-production.up.railway.app/webhook/mp`
- Evento: Pagamentos
- Cuidado: TESTE e PRODUÇÃO têm webhooks SEPARADOS no painel — configurar PROD

**Bug conhecido**: sandbox MP dá ERR_TOO_MANY_REDIRECTS quando test_user pertence à mesma conta de developer. Pular pra prod foi a saída.

### 📝 Decisões de design tomadas

- N3 fase 1 prioriza CRIAÇÃO de items (forja/craft) e GOLD/HP-impacto (shop/bençao/potion). Equip/Chest ficam pra fase 2.
- MercadoPago via Checkout Pro (não Payment API) — mais robusto, não exige homologação.
- Pra produção: env var no Railway (Restart pode ser necessário em vez de só Redeploy).
- Electron wrapper antes de N3 completo é OK porque inv será server-side em fase 2.

### 🐛 Conhecidos / pra próxima sessão

- N3 fase 2: Equip/Unequip/Chest/Pickup/Munição + bloquear writes do inv no saveUpload
- Webhook signature HMAC ainda não validada (server aceita qualquer POST). Adicionar `x-signature` check.
- Em produção, payer.email é forçado pra `valadares.{name}@gmail.com` (fake) — MP usa o email da conta logada se houver. Pra futuro: pedir email no checkout.

---

## 📅 Sessão 27/05/2026 (tarde) — Balance, QoL, UX polish

> 13 commits focados em jogabilidade real: balanceamento de forja, conforto de
> caster, auto-engage, multiplayer (épicos visíveis, trade modal/right-click,
> trade só na PZ), e polimento de UI.

### ⚖ Balance
- **Forja menos punitiva**: taxas de falha [40/60/75/88/95] → [20/35/50/65/80]
  + em falha perde só 1 dos 3 itens (era os 3). Chance de chegar em +5 sobe de
  0.036% → 1.82%. ~55 tentativas em média (vs ~2700 antes).
- **POTION_MP vira regen on-the-fly** (anti-chug): +8 mp/seg por 10s = 80 total.
  Não pode beber outra enquanto o buff tá ativo. Ícone ⚗ azul no status.

### 🎯 Combate / Engage
- **Auto-engage passivo**: fora da PZ, sem alvo → engaja primeiro mob do viewport
  automaticamente (não precisa SPACE). Funciona com PUNHO também (boneco novo sem arma).
- **Entrou em qualquer PZ** → cancela target + autoAttack na hora. Log explica.
- **Visual AoE pro Exori/Provocação**: anel grande do raio real (3 e 5 tiles) +
  gradient radial + 16 partículas voando radialmente.

### 🎒 Forja / Itens (display)
- **Status de armas forjadas** visível: badges inline (☠20% 🩸15% 🔥10%) + tooltip
  com tudo detalhado (chance, dano, ticks).
- **Vel. ataque + Procs no painel** do personagem (status sidebar).
- **Velocidade/Vel. ataque em tiles-por-segundo** (não mais ms): "7.9 tiles/s" e
  "1.25 atk/s". Quebra detalhada vai pro tooltip.

### 👥 Multiplayer
- **Épicos visíveis pros outros players**: cliente envia `equipped` em join+sync;
  server retransmite em pstats/snapshot/join broadcast; remote render usa
  `p.equipped` em vez do ESPADA hardcoded.
- **Modal estilizado de convite de trade** (substitui `confirm()` nativo): caixa
  com nome do inviter, countdown 20s, botões Aceitar/Recusar, auto-rejeita.
- **Trade só na PZ central** (anti-griefing): server bloqueia, botão fica dim com
  tooltip explicando.
- **Right-click no boneco** abre menu contextual (Trade / Whisper). Estilo Tibia.
  Online list ficou limpo: sem HP bar, sem botões — só nome + badge + distância.
  Lista só os OUTROS players (você já sabe que tá online).

### 🛠 UI / Auto-update
- **Overlays unificados**: update + loading viraram um só com title/desc dinâmicos.
  Após 8s sem responder mostra botão "🔄 RECARREGAR"; após 15s reload automático.
  Resolve casos de trava onde o usuário precisava lembrar de F5.

### 🐛 Validações em produção
- Fix de ghosts órfãos da sessão passada confirmado: `[cleanup] 1 ghost(s) de
  Tester2 removidos` apareceu no log do Railway durante reconexão real.

### 🎯 Tarde extra (combat + raid)
- **SPACE cicla alvo** quando já tem target (igual TAB). 1ª tecla pega o mais
  próximo, próximas ciclam pelos mobs do viewport.
- **Admin /megaboss status|spawn|reset**: debug + force-spawn pro Senhor de Valadares.
  Resolve "matei tudo Lv10 e não apareceu" (cooldown 24h era invisível).
- **checkMegaBossSpawn loga motivo** do skip (já vivo / não maxados / cooldown).
- **Buff do Senhor de Valadares** (raid boss endgame, 24h cooldown):
  HP 8000→18000 · DMG 50→75 · Speed 280→240ms · Crit 30%→40%
  Stun 35%→45% (2.5s) · Bleed 4×5→6×6 (36 dano cumulativo) · XP 5000→10000
- **Overlay update/loading cleanup**: resetava texto a cada chamada (sem resíduo),
  CSS class pro botão Reload com fade-in, timers 8s→10s e 15s→20s
  (menos chance de reload-loop em rede lenta), linha 'hint' restaurada.

---

## 📅 Sessão 27/05/2026 — Visual overhaul (4 features)

> Sessão focada em subir o teto visual sem reescrever nada. Tudo procedural
> em canvas; sem PNG, sem spritesheet. 5 commits, em prod.

### 🌅 Iluminação dinâmica + ciclo dia/noite
- Canvas offscreen `lightCanvas` com overlay escuro + cutouts via `destination-out`
- 8 keyframes: madrugada → amanhecer → meio-dia → tarde dourada → entardecer → anoitecer
- 1 dia in-game = **6 min reais**, começa às 08h ao carregar
- Tint sutil de cor por hora: laranja amanhecer, rosa-roxo entardecer, azul noite
- Cavernas: `darkness 0.78+` sempre, override do ciclo
- Cutouts: player (5-6 tiles), tochas PZ (4.5 + flicker), projéteis (2.2), outros players
- **Threshold skip 0.10**: manhã/dia/tarde sem overlay → sem cutouts visíveis, ciclo mais marcado
- Relógio in-game (`☀ 09:04`, `🌅 06:30`, `🌙 22:15`) no minimap
- **Bug fix**: `globalAlpha` causava acúmulo de resíduo entre frames; agora alpha vai na cor + `clearRect`

### 🚶 Bobbing de walk
- `getWalkBob(e)`: detecta movimento via `renderX/Y vs x/y`, devolve `sin(t*0.014)*1.6`
- `drawCharacter` e `drawMonster` ganharam param `bob`
- Sombra fica fixa no chão e encolhe levemente no pico do pulo
- Aplicado em player, remotos e todos mobs

### 🌫️ Partículas ambiente por bioma
- Pool `ambientParticles` cap 90, spawn a cada 70ms (6 amostras por tick)
- 6 tipos com física própria:
  - **snow** (norte): floquinhos brancos caindo com vento sutil
  - **sand** (deserto): riscos amarelos voando horizontal
  - **spray** (água): gotas pulando com gravidade
  - **ember** (tochas PZ): faíscas laranja subindo
  - **pollen** (grass): bolinhas verde-claro flutuando — `cor (220,255,160,0.5)`
  - **cave_drip** (caverna): gotas azuis caindo
- Cap impede saturação; spawn condicional ao bioma do tile sob a amostra

### 🎨 Tile blending nas bordas
- `_blendEdges(t, tx, ty)`: 3 faixas de 2px com alpha 0.55/0.30/0.13 da cor do vizinho
- Aplicado entre GRASS, SAND, SNOW, DIRT, STONE
- Cortes definidos preservados em TREE, WATER, CAVE_WALL (intencional)
- Cada tile pinta seu lado da fronteira → transição simétrica de 6px

### 🚶‍♂️ Wandering de mobs fora de combate (server-side)
- `tickAI` antes só movia com target — mobs sem aggro ficavam congelados (visualmente esquisito)
- Agora vagam: cooldown 1.8× speed, 25% chance por tentativa, anti-frenético
- `spawnX/spawnY` salvos no spawn; volta pra casa se `distHome > 6` (65% prob)
- Bosses (`unique`) NÃO vagam — continuam guardando o spot por design
- Fallback automático pra mobs antigos sem `spawnX` no `state.json`

### 🐛 Conhecidos / observações
- Pollen pode parecer ruidoso pra alguns gostos — chance baixável de 8% → 4% se necessário
- Iluminação só ativa do entardecer (~17h+) em diante; manhã/dia totalmente limpos
- Tochas e outros players sempre emitem luz mesmo de dia (só visível quando overlay tá ativo)
- Taxa de wander: ~1 tile a cada 2-4s por mob (ajustável via `0.25` chance)

---

## 📅 Sessão 26/05/2026 (madrugada) — Polish, hardening e mais features

> Sessão longa após a noite: 15 commits encadeados, foco em fechar
> features iniciadas, melhorar feedback visual, e dar primeira camada
> de anti-cheat. Tudo em prod.

### 🛡️ Hardening Nível 1 + 2 (anti-cheat)
**Server (`sanitizeSave` no saveUpload):**
- Clampa gold (cap 100M), skills.val (200), itemQty (9999), invKeys/chestKeys (250)
- Clampa selos (5), HP/MP/maxHp/maxMp (99k), permaBuffs.xpBonus (≤2.0)
- Cap em stats.mobKills keys (100), quests/flags keys (200)
- Logs warn `[save:NAME] clamp X: was→now` quando algo é ajustado
- **Bloqueia ataque caseiro do F12** (`player.gold = Infinity` etc)

**Drops autoritativos (server):**
- Tabela `LOOT` espelho da `DROPS` do cliente (~70 entries)
- `rollLoot(mobType)` server-side ao morte do mob (em `handleMobDeath` e `attackMob`)
- `mobKill` payload carrega `loot: [{type, qty}]`
- Cliente usa loot do server quando vem; fallback `rollDrops` local se ausente (compat)
- **Cheater não pode mais editar `DROPS` no console** pra fazer rato dropar épico

### ⚔ Gameplay / Balanceamento
- **Magias +50% dano**: Bola de Fogo 8→12, Cura 20→30, Raio 5→8, Exori 7→11
- **Regen na PZ central** (raio 3): HP 4× / MP 3× mais rápido (+1/+1 extra). Pros novos
- **Anti-exploit AFK**: aba em background (`document.hidden`) NÃO regenera

### 🎨 Visual / UX
- **11 sprites épicos** no inventário com aura dourada nos lendários ★/★★
- **Épicos visíveis no boneco** (drawCharacter): armas 2H, armaduras, escudos, elmos, coroas
- **Coração do Highlander** refeito (forma de pingente com corrente em V + aura)
- **Modais com scroll** (`.chest-box` agora tem `max-height: 90vh`)
- **2 cosméticos novos: trail** (TRAIL_OURO, TRAIL_GELO) — rastro estrela cintilante
- **2 cosméticos novos: partículas** (PART_FOGO, PART_TROVAO) — faíscas ao atacar
- **Drops dos cosméticos** no Arauto (10-15%) + Senhor de Valadares (15-25% bônus)

### 🔊 Áudio ambient por bioma
- Loop de pink noise + bandpass + lowshelf moldados por bioma:
  - PZ (fogueira 220Hz), neve (vento 1400Hz), deserto (700Hz),
    caverna (eco 280Hz), grama (brisa 900Hz), água (320Hz)
- Crossfade ~0.6s via `setTargetAtTime`
- Slider "Ambient (bioma)" ativado em Settings (era "Música" disabled)

### 👥 Sociais
- **Lista de amigos server-side** (parte do save) — trocar de PC mantém amigos
- **Tag de guild** `[NOME]` em azul-prata acima do nome do boneco
- **Modal de membros** (`/guild info` agora abre modal): líder com 👑, online em verde
- **Ranking de guilds** (nova aba GUILDS no L): total = mobs + pvp×5 + bosses×20
- **Botões trade/msg** na sidebar Online: `⇄ trade` (dim se >3 sqm) + `✉ msg`
  (pré-preenche `/msg nome ` no chat)

### 📡 Conexão
- **Heartbeat WS**: cliente manda `{t:'ping'}` a cada 25s → server `{t:'pong'}`
  (evita idle timeout de proxy Cloudflare/Railway que matava em ~60s)
- **Overlay "RECONECTANDO" com atraso 3s** — blips de rede não incomodam
- Server agora propaga `guild` no snapshot de jogadores

### 🧹 Fixes do review final
- Trail dos outros players agora renderiza (era só local antes)
- `pickupAt` e `mobKilledByServer` ignoram items desconhecidos (proteção contra deploy parcial)
- Heartbeat limpo também em `ws.onerror` (não só `onclose`)

### 📂 Arquivos do server (em Volume Railway)
- `state.json` — mobs, bosses, rankings, guilds
- `accounts.json` — `{v:1, accounts: [{name, pwHash, save, savedAt, createdAt}]}`

### 🐛 Conhecidos / pendentes
- Cliente vê só **trail** dos outros players; **partículas** dos remotes ataques ainda
  não broadcastam (precisa novo `attackVfx` no server)
- Trade só foi testado solo — luapires AFK; falta confirmar end-to-end
- Inv ainda é client-state (Nível 3 do hardening): `player.inv.X = 5` direto via F12
  ainda funciona (mas qty é clampado em 9999)

---

## 📅 Sessão 26/05/2026 (noite) — Save server-side

> **Bug grave corrigido:** save vivia 100% no localStorage. Trocar de PC,
> de browser, ou limpar dados zerava o personagem. Caso real: alcione perdeu
> o boneco após reiniciar PC (na real era outro browser — o save tava no Edge).
> O amigo também perdeu trocando de PC. Migração pra save server-side.

### 🗄 Server (`server.js`)
- **`accounts.json` separado** no Railway Volume (path derivado de `STATE_FILE_PATH`)
- **Hash dobrado**: sha256(`ACCOUNTS_SALT` + clientHash) — cliente já manda hashPw leve, server reidrata com sha256+salt
- **Handler `auth`**: cria conta no primeiro login; valida senha; devolve `{save, savedAt, isNew}`
- **Handler `saveUpload`**: throttle 5s por player + cap 200KB JSON
- **`join` força nome da conta autenticada** (impede impersonate de qualquer um virar "alcione")
- Compat retroativa: cliente velho (sem auth) ainda conecta como `legacy=true`, mas sem persistência server
- SIGINT/SIGTERM faz `flushAccounts()` síncrono antes de sair

### 🧩 Cliente (`index.html`)
- Vars de sessão: `_wsAuthed`, `_authPwHash`, `_didInitialAuth`
- `tryLogin`/`tryAutoLogin` carregam `_authPwHash` (= hashPw da senha digitada)
- `connectMP.onopen` envia `auth` ANTES do `join`; só joina após `authOk`
- Timeout 8s no auth → fallback legado (joina sem sync) se server não responder
- `applyServerSave(d)` aplica save vindo do server e atualiza cache local
- `saveState()` envia `saveUpload` extra quando `_wsAuthed=true`
- **Reconexão durante jogo NÃO sobrescreve** com save server (preserva progresso offline) — em vez disso faz push do estado atual
- `authFail bad_password` → kicka pra login + limpa cache local (`acc:NAME` + `session`) + reload em 1.5s
- Refator: `loadState()` agora delega ao novo `applySaveData(d)` (mesma lógica, parametrizada)

### 🧪 Testes locais validados
- ✅ Login novo cria conta server-side, save sobe (gold/skills/inv via accounts.json)
- ✅ Limpar localStorage → relogar → server restaura tudo
- ✅ Senha errada → kick limpo + cache local invalidado
- ✅ Auto-login pós-reload mantém sessão autenticada

### 🚨 Migração automática
- Quem ainda tem save localStorage (qualquer browser/PC): no primeiro login pós-deploy, server cria conta nova (`isNew:true`), cliente faz `saveState()` imediato → save sobe pro server
- A partir daí, qualquer máquina nova / browser novo já restaura via auth

### 📂 Arquivos do server
- `state.json` — mobs, bosses, rankings, guilds (já existia)
- `accounts.json` (novo) — `{v:1, accounts: [{name, pwHash, save, savedAt, createdAt}]}`
- Path padrão: ao lado de `state.json` (Volume `/data/accounts.json` em prod)

---

## 📅 Sessão 26/05/2026 (cont.) — Polish massivo + features sociais

> **37 tasks completas numa única sessão.** Foco em bugs, segurança,
> retenção e gameplay. Tudo em produção (Vercel + Railway).

### 🔒 Bugs críticos corrigidos
- **Auto-update matava player** — durante 1s entre detect new version e reload, mobHit continuava chegando. Fix: `_isUpdating` flag gateia damage/poison + fecha WS + overlay claro
- **XSS via nomes de player** — log()/innerHTML sem escape. Fix: `escapeHtml()` em 12+ pontos (joins, MOTD, chat, target widget, PvP logs)
- **EventListener/Interval leak no logout** — saveState rodava N× após N logins. Fix: refs `_saveStateIntervalId` + clear
- **Save sobrescrevia com vazio pós-logout** — sanity check `isEmptyDefaultSave` + backup A/B + auto-recover
- **Mob entrava no tile do player** (race condition) — `bumpMobAwayFrom` no handler pos
- **Mobs faziam fila atrás do player** — server portou `pickSurroundSlot` (intel ≥2 cercam, intel 3 flanqueiam)
- **Atirar pela parede** — `hasLineOfSight` (Bresenham) em arco/lança/magia/Exori
- **Chat ficava preso no input** após Enter — agora dá blur automático + clearAllKeys
- **Bounds checks no server** — pos handler clampa x/y, hasLineOfSight com cap de iterações
- **Chat sem rate-limit** — throttle 1 msg/500ms no server

### ⚔ Gameplay novo
- **Anti-kite**: mobs intel≥2 e bosses sprintam (×0.6 speed) quando perseguindo a >1 tile
- **Boss heal Lv3+**: regen 2%/5s + 0.5% por nível acima de 3 (cap 5%)
- **Sistema de Forja**: 3 items iguais + ouro tentam upgrade +N. Cap +5. Falha 40%→95%. Stats por nível: base/def, atkSpd, moveSpd, hpRegen, veneno/sangra/fogo (DoT em mobs)
- **DoT engine em mobs**: server processa, cliente renderiza ícones ☠/🩸/🔥
- **Bênção da Fênix**: item anti-morte (15k no mercador, packs 5×/10× com desconto). Cancela morte por mob ou PvP, mantém skills/gold
- **Pacotes no shop**: poções vida/mana × 10/25 com desconto

### 🎨 UX/UI
- **Sons** procedurais (Web Audio): hit, dano, kill, magia, pickup, level-up, morte
- **Tutorial** no primeiro login
- **Settings** (tecla O): volume, "restaurar backup", "ver tutorial"
- **Painel ADMIN** (Settings, só alcione): restore manual de skills/gold/HP/MP + snapshot pré-morte automático
- **Inventário/baú categorizados** — Armas/Equipamento/Cosméticos/Bênçãos/Consumíveis/Munição/Materiais
- **Shop com qty buttons** (vender 1/10/tudo)
- **HP/MP visíveis** em outros players (broadcast via playerSync)
- **Mini-PZ NPC** reduzido pra raio 1 + quebra ao atacar (anti-cheese)

### 🌟 Features sociais (a sessão das 6)
- **#1 Ranking** (tecla L): top 10 em mobs/PvP/bosses/gold. Server agrega + persiste
- **#2 Eventos semanais**: boss **O Arauto** spawna sáb 20h-22h BRT em (50,65). Drops: gold + Bênção + cosméticos
- **#3 Cosméticos**: 5 items só visuais (capas/auras/nome dourado). Drop do Arauto. Propaga via pstats
- **#4 Amigos** (tecla N): lista local + whisper privado via `/msg nome texto`
- **#5 Trade direto**: `/trade nome` no chat (≤3 tiles). Modal 2 colunas + confirm atomic. Re-validação no server
- **#6 Guilds**: `/guild create NOME`, `invite`, `join`, `leave`, `info`, `list`. Chat exclusivo `/g msg`

### 🔧 Refactor / qualidade
- `applyAttackMults()` helper compartilhado (pvpMults + Coração + buff)
- `categorizeItems()` helper compartilhado entre inv e baú
- `mobBatch` no server bundle de update+float (12× menos tráfego)
- 3 magias adicionadas: **Exori** (AoE), **Provocação** (taunt), **Fúria** (buff +25% dmg/spd)

### 💰 Decisão comercial documentada
- **Monetização futura: só vender gold** (PIX via MercadoPago/Asaas). Itens (Bênção, forja, magias) continuam compra in-game
- **Modelo**: pay-to-skip-grind, não pay-to-win-direto
- Webhook gateway → server credita gold automático
- Painel admin já existe pra credit manual
- Volume mínimo viável: ~100 players ativos × R$15/mês

### 🎮 Atalhos novos
| Tecla | Função |
|---|---|
| L | Ranking |
| N | Amigos |
| O | Opções (já tinha) |

### 📍 Estado para retomar próxima sessão
- Tudo em produção. Auto-update do cliente puxa em até 60s
- 37 tasks completas — ROADMAP atualizado abaixo
- Sem bugs conhecidos pendentes
- Próximos focos sugeridos: testar com 5-10 amigos pra validar gameplay; depois open beta pra 50-100; só aí pensar em monetização

### 🗺 Roadmap pós-sessão
- ✅ Tudo do roadmap original
- ✅ Bateria social (#1–#6 que o user pediu)
- 🟡 Ideias futuras se necessário:
  - Tag visual da guild no nome do boneco
  - Modal de membros da guild
  - Ranking de guilds
  - Trade via UI (drag-drop ou click do nome na lista online)
  - Mais cosméticos (efeitos especiais ao atacar, trail, etc)
  - Eventos extras (raid mensal, mini-events diários)
  - Sons ambient + música

---

## 📅 Sessão 26/05/2026 — Deploy + endgame loop + raid boss

### 🚀 Deploy completo
- ✅ **Cliente no Vercel:** https://valadares-xi.vercel.app (auto-deploy via GitHub push)
- ✅ **Server WS no Railway:** wss://valadares-production.up.railway.app (Hobby plan pago)
- ✅ **Railway Volume montado** em `/data` com env `STATE_FILE_PATH=/data/state.json`
  - state.json agora **sobrevive a deploys** — bossLevel não zera mais
- ✅ **vercel.json no-cache** no HTML → reload simples pega versão nova
- ✅ **Auto-update**: cliente recarrega sozinho em até 60s após novo deploy

### 🎮 Gameplay novo (endgame loop)
- **Defesa percentual** (diminishing returns): `def / (def + 30)`
- **Quests diárias** (3 randomizadas, reset 00:00 local, tracker auto)
- **5 chains narrativas** com NPCs no mundo:
  - 🧙 **Eremita** (22,22 norte/neve) — 4 etapas, liberar Vendedor de Almas
  - 🔨 **Velho Ferreiro** (78,22) — 3 etapas, recompensa Machado do Minotauro
  - 🏹 **Caçadora de Drakes** (76,78) — 3 etapas, Coração HL + Elmo Dracônico
  - ⛏ **Mineiro Perdido** (66,90) — 3 etapas, mata Golem Rei
  - 🎭 **Vendedor de Almas** (75,20, HIDDEN) — **decisão moral**: Coroa lendária OU +5% XP permanente
- **★★ Senhor de Valadares** — mega raid boss:
  - Trigger: todos 3 bosses Lv10 + cooldown 24h
  - HP 8000, dmg 50, stun 35%, bleed 50%, 30 min vida
  - Drops: **Coroa de Valadares ★★** (def 20), **Espada Eterna ★★** (base 30/def 12), 5-10k gold
  - Ao morrer: reset bossLevel pra Lv1 (ciclo recomeça)

### 🛠 Engines novas
- **Quest chains** data-driven (stages: mob/item/multiItem/visit/choice)
- **NPCs espalhados** com mini-PZ raio 2 (não morre lendo modal)
- **Status effects estendidos**: Aranha veneno, Escorpião veneno forte, Lagarto sangra, Troll stun, Minotauro stun forte, **Senhor de Valadares stun + bleed forte**
- **Sistema de mensagens** 4 levels + MOTD + comandos admin (/say, /event, /warn, /info, /motd, /setboss, /respawnboss)
- **PermaBuffs** (xpBonus do Vendedor)

### 🎨 UI/UX
- **Status conexão visível**: verde online / vermelho offline com glow
- **Lista de jogadores online enriquecida** (HP bar, distância sqm, badges 👑/☠/💤)
- **Toasts épicos** com 4 estilos
- **Overlay "CARREGANDO MUNDO"** no F5 (sem flicker de mobs)

### 🐛 Bugs corrigidos
- Lança ranged não dava dano além de 2 sqm (range hardcoded `1`)
- Offline farming (WS cai, player matava mob local)
- Auto-target perdido após mob morrer
- Atalhos disparando durante digitação no login
- Modais novos sem overlay/centralização
- Mob entrando no tile do player
- Ghost duplicado ao reconectar
- Flicker de mobs no F5
- **Morrer lendo modal de NPC** → NPCs viram mini-PZ
- Admin travado em "alcione" hardcode

### 📦 Arquivos importantes
- `index.html` — cliente (~7000 linhas agora)
- `server/server.js` — server (~870 linhas, Volume montado)
- `package.json` raiz — Railway start command
- `vercel.json` — no-cache no HTML
- `ROADMAP.md` — atualizado
- `DEPLOYMENT_COMPLETE.md` — Railway Volume agora ✅
- `RAILWAY_VOLUME.md` — guia completo
- `GAME_ANALYSIS.md` — análise de pontos fortes/fracos
- `SETUP_AMIGOS.md` — guia Cloudflare Tunnel (caminho alternativo)
- `DESIGN_PVP.md` — design original do PvP

---

## 📅 Sessão 25/05/2026 — Setup MP autoritativo, NPCs/quests, body stays

[Conteúdo da sessão anterior preservado abaixo]

### ✅ O que ficou pronto

#### Mundo / balanceamento
- Mob **Escorpião** novo (deserto, 75hp/11dmg)
- Mobs reorganizados por bioma: **Troll** só nasce em SNOW, **Lagarto + Escorpião** só em SAND
- **Abismo do Golem** movido (60,85)→(70,90) pra equilibrar distância
- Server gera mesmo mapa do cliente (seed 42) e valida walkability ao spawnar
- **Spawn dinâmico** repõe rings + cavernas + biomas com burst até 3 mobs/tick

#### Combate / progressão
- **Status effects engine** (poison/stun/bleed) — Aranha aplica veneno
- **Bosses escalonam ★ Lv1→10** por respawn (HP +15%, dmg +10%, xp +20% por nível)
- **Reset diário 00:00** zera bossLevel + respawna Lv1
- **Highlander rebalanceado** (era +87% dmg, agora +42%)
- **Gold drops reduzidos**: Drop PK 20%→10%, bosses menos generosos
- **Drops premium** dos bosses reduzidos

#### NPCs + Quests (#6 do roadmap)
- **2 NPCs na PZ leste**: Mercador (52,49) e Atendente (52,51)
- Interação: ESPAÇO adjacente OU tecla **Q**
- **Shop**: 8 items à venda + vende qualquer item do inv (30% preço base)
- **5 quests iniciais** com tracker auto-atualizado em kills/pickups

#### Multiplayer (#9 #10 #12 do roadmap)
- **Server autoritativo de mobs** — 146+ mobs, tickAI move/ataca, snapshot 250ms
- **Combate validado** — server checa range/dano, broadcasta updates
- **Chat real** — tab CHAT funcional, broadcast WS
- **Body stays** (#8) — corpo fica 3 min após logout, atacável, dropa 10% gold + 1 item
- **Persistência server-side**: `state.json` salvo periodicamente
- **WS URL configurável** no cliente

#### UI/UX (várias melhorias)
- **Mini-mapa** no topo da sidebar esquerda (canvas dedicado 140×140)
- **Chat panel** abaixo do canvas (não sobreposto)
- **Paper doll** no equipamento (3×3 grid)
- **Sprites pixel art** de todos os 50+ itens
- **Sidebar direita reorganizada**: PvP / Equipamento / Bosses / Alvo + Online split
- **Widget Alvo** (HP bar visual)
- **Widget Bosses** (timer respawn + Lv)
- **Widget PvP** (selos visuais)
- **Modal Stats** (tecla I)
- **Inventário** estica junto com sidebar do personagem
- **HP/MP bars** sempre visíveis sobre o boneco
- **Modais** com overlay+centralização padronizado

---

## 🎯 TODO restante do ROADMAP (gameplay)

Curto prazo:
- **#1** Mais magias (AoE, Provocação, Buff)
- **#3** 2H ataca mais devagar (equilibra 1H+escudo vs 2H)
- ~~#2 Skill cap~~ — decisão: **deixar infinito**
- ~~#4 Crafts lendários~~ — ✅ feito

Médio prazo:
- **#5** Classes (Guerreiro/Tank/Arqueiro/Mago) com 1 magia única cada
- **#11** Bônus de grupo (+20% XP perto de outro player)

Polish:
- **#17** Sons / música
- **#18** Tutorial in-game
- **#19** Settings panel

### Sugestões (não no ROADMAP)
- **Trade direto** entre players
- **Mensagens privadas** (whisper)
- **Ranking público** (mais bosses, mais PKs, etc)
- **Mais 1-2 chains narrativas** (engine pronto)
- **Eventos automáticos** semanais

---

## 🗂 URLs

| Recurso | URL |
|---|---|
| **Cliente produção** | https://valadares-xi.vercel.app |
| **Server WS** | wss://valadares-production.up.railway.app |
| **Repo** | https://github.com/acapires-stack/valadares |
| **Railway** | https://railway.app/dashboard |
| **Vercel** | https://vercel.com/dashboard |

## 🛠 Comandos admin in-game (chat, só alcione)

```
/say MSG              — toast vermelho pulsante (anúncio importante)
/event MSG            — toast dourado (evento épico)
/warn MSG             — toast amarelo
/info MSG             — toast azul
/motd MSG             — atualiza MOTD da sessão
/setboss TYPE LV      — força boss pra um nível (mata + ressuscita)
                       Ex: /setboss DRAKE_LIDER 5
/respawnboss TYPE     — força respawn no nível atual
/help                 — lista comandos
```

## 🌙 Estado pra retomar próxima sessão

- **Persistência funcional** (Railway Volume montado)
- **Pushes seguros** — eu posso commitar `server.js` sem zerar bossLevel
- **Auto-update funcionando** — amigos recarregam sozinhos em até 60s
- **Mega boss implementado** — só falta alguém triggerar (3 bosses Lv10)

Comece próxima sessão lendo este arquivo + ROADMAP.md.
