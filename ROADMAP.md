# Valadares — Roadmap

> Mapa de decisão pra próximas sessões. O `SESSION_NOTES.md` tem o registro
> cronológico do que rolou; este aqui é o **norte**.

---

## 🟢 Estado em 28/05/2026

- Cliente: https://valadares.app.br/jogar (Vercel)
- Server WS: wss://ws.valadares.app.br (Railway, Volume `/data`)
- Electron desktop: v1.0.3 (auto-update via electron-updater)
- Monetização: MercadoPago Checkout Pro (PIX + Cartão)
- Anti-cheat: lockdown N3 FULL — gold/inv/equipped/chests/skills/hp/mp 100% server-side
- Auth: email + reset de senha (Resend)
- Mobile playable, season system, talent tree

---

## 🧭 Princípios pra escolher o que fazer

1. **Retenção > novidade** — feature que faz player voltar amanhã > feature que diverte 1 hora.
2. **Playable em 1 sessão** — corte cada onda em <90min de trabalho. Se passar, divide.
3. **Server-side por padrão** — nada que credita gold/inv/XP fica só no cliente.
4. **Verifica antes de commitar** — preview eval ou DOM check. Bug em prod custa redeploy.
5. **Documenta o "porquê"**, não o "o quê" — o código mostra o que faz; o motivo some no histórico.

---

## 🥇 Backlog priorizado

### ✅ P0 + P0.5 RESOLVIDOS (sessão 29/05)

Auditoria 28/05 (5 críticos) + P0.5 (5 pendentes) + nova auditoria 29/05
(6 novos vetores de rate limit). Total: **16 vulnerabilidades fechadas**
em 4 commits ([58c1d72](https://github.com/acapires-stack/valadares/commit/58c1d72),
[0e727c1](https://github.com/acapires-stack/valadares/commit/0e727c1),
[7bae381](https://github.com/acapires-stack/valadares/commit/7bae381),
[ed8a438](https://github.com/acapires-stack/valadares/commit/ed8a438)).

### 🔴 P0.6 — Hardening pendente pra próxima auditoria

> **🔬 AUDITORIA COMPLETA DO JOGO (29/05) — relatório priorizado em [`docs/AUDITORIA_2026-05-29.md`](docs/AUDITORIA_2026-05-29.md).** Aplicado+deployado: 🔴 **lockdown do save** (`saveUpload` gravava gold/inv/skills do cliente as-is → forja PERSISTENTE; furava o lockdown N3 + a venda de gold) + 🟠 **maxPayload** (DoS). Pra revisar JUNTOS (com teste in-game): re-claim de daily, hash de senha fraco, rate-limits pos/pix, ~500 linhas de código offline, protocolo morto (trainResult/spellResult sem feedback), `RECIPES` dup index-sensitive, dead code. O `_errorRateMap leak` abaixo está coberto no relatório.

- **✅ AUDITORIA COMPLETA (masmorra Fase 3) — FEITA 29/05.** Manual: os skills `/security-review`+`/code-review` só comparam o branch contra `origin/main`, e a Fase 3 já está shipada (`origin/main`==HEAD) → diff vazio. Achados: 🔴 **crítico** (dano client-side one-shotava o boss 5000hp e roubava 100% do loot via `damageBy` → `MAX_HIT_DMG=600` + rate-limit `ATTACK_MIN_INTERVAL_MS=200` no attackMob), 🟠 **médio** (alts parados em party farmavam loot do boss → só damager divide), 🟡 **baixo** deferido. Detalhes no `SESSION_NOTES.md`.
- **🔧 Refactor de movimento/combate autoritativo (deferido, do audit)** — `p.x/y` (transição de andar) e `range`/cadência de ataque são client-trusted. Hoje mitigado por clamp de coords + `MAX_HIT_DMG` + rate-limit; o caminho definitivo é o server validar movimento e cadência por arma. Sistêmico — fora de hotfix.

- **Same-player 2× simultâneo** (mobile + PC) cria 2 entries no `players` Map → state inconsistency
- **`_errorRateMap` leak lento** — sem cleanup periódico, cresce indefinidamente
- **Algumas funções server-side assumem `p.inv` existe** — TypeError potencial em save legado
- **broadcastMobs ainda usa full snapshot** quando muda — pra >20 players ativos, precisa diff verdadeiro com novo `t` no protocolo

### 🟢 P0.5 — Verificações de smoke test antes de feature

- Verificar webhook MP credita 1× só na próxima venda PIX aprovada (log Railway: `[mp] gold creditado online: NOME +N`)
- Validar T4 Caçadores HL em MP (highlander → 3min → outro player vê em laranja)
- Confirmar bot 007 spawnando a cada 1h automático

### ✅ #12 Devlog (RESOLVIDO — sessão 29/05 tarde)

Gerador estático em `devlog/build.js` (Node puro, zero deps). Posts MD com
frontmatter YAML → HTML com tema visual do site. 4 posts iniciais cobrindo
lançamento + sprint produção + maratona segurança + mobile overhaul. Live em
[valadares.app.br/devlog](https://valadares.app.br/devlog). Schema.org
BlogPosting em cada post. Pra adicionar post novo: criar `.md` em
`devlog/posts/`, rodar `node devlog/build.js`, commit.

### 🟡 P1 — Próximas features (escolher 1 por sessão)

**M4 "As Profundezas" — masmorra ABERTA vertical** [endgame] 🎯 EM ANDAMENTO (3a descida + 3c boss ✅; falta 3b procedural)
> Decisão de design (29/05): NÃO instanciada. Insight do dono: instância
> fechada = farm seguro = pay-to-win fácil num jogo PvP. Em vez disso,
> masmorra aberta e mortal estilo Tibia — melhor loot, maior perigo (mobs
> fortes + outros players).

- **Andares de verdade** (sistema `floor`/z): escadas descem a níveis separados.
  Você só vê quem está no mesmo andar. Broadcast/tickAI filtrados por floor.
- **PvP forçado**: pisou na masmorra (floor ≥ 1), PvP liga automático.
- **Morte usa penalidades que JÁ existem** (sem regra nova):
  - mob → perde 15% das skills treinadas + volta pra cidade (perde a descida)
  - player → killer leva 10% do gold + Coração HL (processPkDeathServerSide)
- **Mobs novos exclusivos**, mais fortes por profundidade.
- **Loot**: gold escalado + chance de item raro por andar.
- Save NÃO lembra o floor — deslogar na masmorra = renasce na cidade (efêmero).

**Plano faseado** (cada fase sobe testada, overworld nunca quebra):
1. ✅ **Infra** (RESOLVIDO 29/05): conceito de `floor`, escada PZ (50,46) → andar 1
   (sala caverna 40-60), broadcast/tickAI/snapshots filtrados por floor, PvP
   forçado, cliente troca grid `map`. Objetos da cidade não vazam pro andar
   (NPCs/altar/craft/baú/dummy/tochas guardados por floor 0). PZ só no floor 0
   (playerInSafe/playerInSafeZone). Commits 9dd2312, 9f685fd, 13d984e, d2783d4.
2. ✅ **Combate** (RESOLVIDO 29/05): mobs novos SOMBRA (rápido) + CARRASCO (tanque)
   no MTYPE server+cliente. spawnDungeonMobs mantém ~9 no andar (tick 8s).
   mobTileOk prende mobs na sala. Loot escalado, drops com floor. floor persiste
   no save de mobs. Commits c2d5b30.
   - **Loot de boss por dano (anti-ninja)** [679f74f, cbe56ee]: bosses unique
     distribuem loot DIRETO no inv de quem bateu (rastreado em m.damageBy). Solo
     = proporcional ao dano; em PARTY = divide IGUAL entre membros no andar.
     NÃO cai no chão. Mobs comuns continuam dropando (espalhado em anel).
3. ✅ **3a — Descida multi-andar** (RESOLVIDO 29/05, efed9cd): 5 andares; escada
   descida (50,57)/subida (50,50); chega em (50,52); mobs escalam +60%/andar
   (andar 5 ≈ 3,4×); spawn/limpeza por andar (efêmero). Entrada movida da PZ pro
   **Antro do Minotauro (83,17)** (cf0e937). IA de cerco floor-aware + box da sala
   = 40-60 (fim da "fila" no canto). Loot 3×3. Mobs não ficam nas escadas.
4. ✅ **3c — Boss do andar 5** (RESOLVIDO 29/05, cae70b8): **O Senhor das
   Profundezas** (5000hp/110dmg, intel 3, spawn 50,42), loot top-tier por dano,
   respawna Lv1 fresco a cada delve (isolado do leveling dos bosses do mundo).
5. 🎯 **3b — Geração procedural por andar** (PRÓXIMA SESSÃO): cada andar com
   layout/sala diferente. Server precisa do **grid real** (hoje usa bounding box
   fixo 40-60) pra spawn/colisão. Resolve as "escadas em linha" (posições por
   andar). Polish: tonalidade por profundidade + indicador de andar.

**✅ M6 Tinturaria — gold sink cosmético** (RESOLVIDO sessão 29/05)
- NPC Tintureira em (53,53) na PZ, 4 slots tingíveis com 12 cores
- 5.000g/aplicação · 1.000g/remover · server autoritativo
- Detalhes: [commit e97fbd1](https://github.com/acapires-stack/valadares/commit/e97fbd1)

**M6 Pet cosmético** [~60min]
- Segue o player, sem combat impact

**M7 Arena PvP** [2 sessões]
- Bracket 1v1 e 3v3 com matchmaking simples (queue → match quando 2/6 prontos)
- Recompensa cosmética semanal

**✅ M8 Auction House** (RESOLVIDO sessão 29/05 — 1 sessão, não 2)
- NPC Leiloeiro em (53, 47). Modal BROWSE/MINHAS/VENDER.
- Server escrowa, 24h por listing, 5% comissão, máx 10 ativos.
- Helpers grantGoldByName/grantItemByName entregam pra offline players.
- Detalhes: [commit 5bb5073](https://github.com/acapires-stack/valadares/commit/5bb5073)

### 🟢 P2 — Marketing / SEO
- Backlinks: post Reddit (r/WebGames, r/incremental_games), Discord servers RPG, Twitter
- Itch.io: updates de release/changelog
- YouTube/TikTok short de gameplay (30s)

### 🟢 P3 — Polish operacional
- Botão "Suporte" no jogo abre modal com email + form (`contato@valadares.app.br`)
- Painel admin web (sem ser dentro do jogo): vendas, ranking de gasto, gold manual
- Analytics privacy-friendly (Plausible ou Umami)
- Email "obrigado pela compra" no `goldDelta` de `mp_purchase`

### 🟢 P4 — Comercialização escala (quando faturar >R$1k/mês)
- CNPJ + advogado já validados privacy/terms
- Emissão de NF eletrônica via NFe.io ou similar
- Cashback automático de gold se MP travar (refund handler)

---

## 🏁 Marcos concluídos (compacto)

**Maio 2026 — sprint final pra produção:**
- 24-25/05: server WS autoritativo de mobs, body stays, persistência Railway Volume
- 26/05: sociais (ranking, amigos, trade, guild, eventos diários)
- 27/05: visual overhaul, MercadoPago em prod, Electron build, HMAC webhook MP
- 27→28/05 madrugada: N3 fase 3 lockdown FULL, mobile/touch, season + talent tree, SEO
- 28/05 manhã: domínio `ws.valadares.app.br`, GitHub Actions release (v1.0.3), T4 Caçadores HL server-side, T2 light, Fase 5 N3 lockdown FULL (hp/mp/maxHp/maxMp)
- 28/05 tarde: privacy/terms, ranking público, cassino, fase 5.5 auth+email+reset
- 28/05 ~13h+: pots curando (fix lockdown), party UX (right-click + modal), admin UI completo (`/deluser` `/checkuser` `/resetuser`), boneco repositionado, hardening de save (clamp x/y, force hp/mp server-side no save)

> Histórico cronológico detalhado: `SESSION_NOTES.md` (sessão atual) e `docs/archive/sessions-pre-may28.md` (sessões anteriores).

---

## ⚠️ Lições aprendidas (não cair de novo)

**MercadoPago**
- Preference API (Checkout Pro) > Payment API direto. Não exige homologação.
- Webhook PRODUÇÃO e TESTE são separados — configurar nos 2.
- SDK `mercadopago` precisa estar no `package.json` RAIZ (Railway roda npm install lá).
- MP não permite o dono da conta pagar pra si — pra testar: outra conta/cartão.

**DNS / Cloudflare**
- Email Routing exige NS no Cloudflare. ImprovMX é alternativa sem migrar.
- Records que apontam pra Vercel/Railway: **DNS only (cinza)** — proxy laranja quebra SSL.
- Apex IP `76.76.21.21` (Vercel) tá OK — NÃO trocar pra `216.198.79.1`.
- Quando "Add domain" no Cloudflare, scanner pode perder records — sempre conferir antes de "Continue activation".

**Email (Resend)**
- Domínio precisa ser verificado no Resend antes de enviar. Sem isso → 403.
- Gmail quoted-printable corrompe `=` em URLs → vira `\xEF\xBF\xBD`. Solução: `?t=` em vez de `?token=`.
- API key só mostra UMA vez — copiar pro bloco de notas local, sem print.

**Railway**
- "Save" no Variables NÃO aplica — clicar "Deploy" (botão roxo) força redeploy.
- Às vezes redeploy não recarrega vars — "Restart" como fallback.
- Deploy demora ~1-2min; ocasionalmente trava em "Taking a snapshot" — esperar até ~10min antes de cancelar.

**electron-builder**
- Default cria release como DRAFT — invisível pra anônimos. Solução: `releaseType: "release"` no `build.publish`.
- NSIS no Windows precisa Developer Mode ON pra build LOCAL (symlinks). CI Windows-latest funciona ootb.

**Anti-cheat / lockdown N3**
- F12 forjar `player.X` no client falha pra gold/inv/equipped/chests/hp/mp/maxHp/maxMp/skills.
- Únicos vetores remanescentes: trail/cosmético/animação (zero impacto game).
- DoTs poison/bleed são server-side. Stun é client-side mas server propaga.
- **Pegadinha**: depois do lockdown, qualquer mutação local de hp/mp some no próximo tick do server. Se cliente precisa "aplicar efeito local", o handler do server precisa também aplicar autoritativo + broadcastPstatsAll (pots foram o exemplo).

**Save corruption**
- Cliente em race entre devices (mobile + PC) pode mandar `maxHp:undefined` no saveUpload.
- Mitigação: server sobrescreve `hp/mp/maxHp/maxMp/x/y` com valores autoritativos antes de persistir.
- Comando admin `/checkuser NOME` + `/resetuser NOME` resolve casos pontuais.

**Segurança operacional**
- NUNCA tirar print de API keys, tokens, secrets, env vars com valor visível.
- Se vazar: revogar, gerar nova, atualizar Railway, redeploy.
- API key vazada no chat = comprometida (logs/backups podem persistir).

---

## 🛠 Padrão de trabalho

- Commits sempre via `git -C "D:/claude/valadares"` (repo dentro de `D:/claude/`).
- Branch única `main`. Push → Vercel + Railway auto-deploy.
- Mudanças server-only sobem direto pra Railway (não dá pra testar WS local).
- Mudanças client testáveis em preview (`launch.json` tem `valadares` na porta 3333).
- Auto-update do Electron puxa nova versão em até 60s sem reload manual.
- Produção tem 1+ usuário real — não quebrar sem testar.
