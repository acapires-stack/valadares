# Notas de Sessão

> Apenas a sessão atual. Sessões anteriores: `docs/archive/sessions-pre-may28.md`.
> Roadmap e backlog: `ROADMAP.md`. Estado completo: memória `project_valadares.md`.
> (A leva 29/05 anterior — devlog, M6 Tinturaria, M8 Auction, M4 fase 1+2 — está
> nos ✅ RESOLVIDO do ROADMAP.)

---

## 🎯 Sessão 01/06/2026 (cont. 4) — Battle List (lista de combate clicável) no lugar da janela de alvo

Dono: contra o bot **007** o alvo só aparecia na janela, não no mundo; e com **boss no meio da multidão**
não dava pra setar ele. Visão dele = a **Battle List do Tibia** (lista de bichos, clica/anda por todos).
**Descoberta-chave no diagnóstico:** hoje NÃO dá pra clicar num mob pra mirar — o `click` do canvas só
mirava player e **só em PvP**; mob só por Tab/auto, e o `targetScore` prioriza perto+ferido → o boss (HP
alto) nunca era pego.

**Decisões do dono:** ordenar por **DISTÂNCIA** (mais perto no topo); **NÃO travar** o alvo (mantém a auto-troca).

**Implementado (tudo em `play.html` — CLIENTE only → deploy só Vercel, sem `/manutencao`, sem reconexão):**
- `getBattleList()`: mobs visíveis + players PvP visíveis, ordenado por distância (Chebyshev), desempate por id (estável).
- `renderTargetWidget()` reescrito: a seção **"Combate"** (ex-"Alvo") vira **lista clicável** — dot+nome+barra HP,
  alvo atual com `.active` + tag AUTO. PZ → zona segura; vazio → "Nenhum inimigo à vista".
- Listener delegado em `#targetWidget`: clique numa linha mira o inimigo (mob/boss/player).
- `canvas` click: agora mira **MOB** no tile (fora da PZ), além do player PvP (era só player) → resolve "boss na multidão".
- `cycleBattleList()`: Espaço (`engage`) e Tab andam pela lista em ordem e dão a volta. (`targetNearest` mantido só no auto-engage passivo.)
- Marcador de alvo (retângulo vermelho) agora desenhado também no **player remoto alvo** → conserta o "007 só na janela".
- CSS `.bl-*` novo. ⚠️ As classes `.target-name/.target-hp-bar/.target-meta/.target-auto-tag` ficaram **órfãs** (dead CSS — limpar depois).

**Verificado no preview** (mobs fake via eval): ordem por distância ✓; 5 linhas ✓; **clique no boss → mira o boss**
(id+aggro) ✓; ciclo anda+wrap ✓; `.active`+AUTO ✓; **boot 0 erros** ✓. **Falta in-game:** anel no player alvo,
clique-no-mundo, teclas Espaço/Tab, e o feel com mobs reais.

**Follow-up (pós-teste do dono, mesmo dia):** dono notou "às vezes a lista não pega os mais próximos, pela
velocidade/transição". Causa: `getBattleList` usava pos **LÓGICA**, mas `getCamera` segue `player.renderX/Y` e o
mob é desenhado em renderX/Y → no deslize (~280ms) a lógica "pula" 1 tile antes do visual. Fix: a lista usa pos
**VISUAL (render)** — `vis` espelha o culling do desenho (`cam-1..cam+VP+1`), e a `dist` usa render **arredondado**
(ordem inteira estável, alinhada ao que se vê). Verificado no preview (mob lógico-longe/visual-perto sobe pro topo;
0 erros). Cliente-only.

---

## 🔒 Sessão 01/06/2026 (cont. 3) — loot do mob comum TRAVADO por dano (anti-ninja) + fix DoT-loot

Dono escolheu, de 3 opções, a **"bag travada por dano, depois libera"** (mantém o feel Tibia de loot no
chão; protege no multiplayer). Insight dele: como o boneco já cata tudo no chão (raio 2 + pickup-ao-matar),
"concentrar o drop no tile" não mudaria nada — o problema real é **de quem é o loot** quando 2+ players
batem no mesmo mob (ninja).

**Server (`server.js`):**
- `damageBy` agora em **TODOS** os mobs (hit + DoT), não só `unique` (era a infra que já existia pro boss).
- Helpers `lootOwnerOf` (top-damager, fallback killer) + `dropMobLoot` (espalha 3×3 + carimba
  `owner/ownerName/ownerUntil`, `LOOT_LOCK_MS=15s`) — extraído do `attackMob`, reusado nos 2 caminhos de morte.
- `groundPickup`: durante a janela, só o dono + a **party dele** (`findPartyOfPlayer`) catam; depois, livre.
  O ouro também trava (principal alvo de ninja).
- **Bônus — bug latente FECHADO:** mob morto por **DoT** (`handleMobDeath`) mandava só `loot` sem `drops`
  server-side → o cliente criava drop com id LOCAL (numérico) que o `groundPickup` nunca catava (só envia
  ids `g…`) = **loot perdido online**. Agora `handleMobDeath` também usa `dropMobLoot` + broadcast `groundSpawn`
  (caminho idêntico ao `attackMob`); aplica de quebra o t_loot (+15% gold) que faltava no DoT.

**Cliente (`play.html`):** `groundItems` carregam `owner/ownerName/ownerUntil` (5 pushes: snapshot,
groundSpawn, mobKill, 2× dungeon). `lootLockedToOther(it)` (nunca trava pra mim/minha party via `isPartyMate`)
filtra o auto-pickup (`pickupAt`) e pinta 🔒 + escurece em `drawGroundItem`. Clock skew afeta só o visual —
o server é autoritativo no pickup.

**Verificado local:** `node --check` server ✓; `vm.Script` do JS inline ✓; **boot do cliente 0 erros** no preview;
`lootLockedToOther` nos 5 ramos ✓ (trava só pra outro com janela ativa; libera mim/expirado/sem-dono/sem-lock).

⚠️ **Mexe em `server/**` → deploy só com `/manutencao` + logout.** **Checklist in-game (2 contas):** (1) solo:
bag cai e cata na hora (sem regressão); (2) solo com arma de DoT: bag agora aparece/cata; (3) multiplayer:
top-damager cata, o outro vê 🔒 e só após 15s; (4) party do dono cata no lock; (5) boss inalterado (direto no inv).

---

## ✅ Sessão 01/06/2026 (cont. 2) — fix de mana + LOTE de 7 bugs do .docx (2 deploys via /manutencao)

**1) Mana cliente×server (commit `644921f`, deployado):** o `SPELLS_META` do server tinha custos
errados E 2 chaves quebradas. Alinhado à tabela `SPELLS` do cliente (fonte canônica): FIREBALL
18→20, HEAL 12→25, RAIO 10→15, EXORI 25→40. Renomeadas `TAUNT`→`PROVOCACAO` (8→25) e `FURY`→`FURIA`
(20→35) — o cliente enviava `PROVOCACAO`/`FURIA`, que caíam no `if(!sp)return` → saíam DE GRAÇA
(sem mana nem XP de Magia). Agora custam e treinam. Comentário de sincronia nos 2 lados.

**2) Lote de 7 itens do "jogo bugs.docx" (commit `c432609`, deployado):** o dono mandou .docx com 11
itens; avaliei 1 a 1 contra o código (5 imagens extraídas via zipfile). #4 (dano estranho) já estava
resolvido pelo combate autoritativo. Implementados:
- **#5 🔴 CRÍTICO — morte na masmorra:** `playerDie` (cliente) só teleportava x/y pra (50,50)
  mantendo `player.floor`, e o server NÃO zerava `target.floor` na morte → renascia **colado no boss**
  no andar e o AI do andar seguia batendo ("mobs fora da tela") + dava pra matar o boss morto. Fix:
  nova `returnPlayerToTown(p,id)` (server, extraída do `exitDungeon`) chamada em `tickAI` +
  `tickPlayerDots`; `playerDie` (cliente) sai pro overworld; `groundItems` limpos/repopulados por
  andar (`dungeonEnter`/`dungeonExit` mandam `groundDrops`) → loot não vaza entre andares.
- **#8 + escudo:** 3 espadas 1h (ESPADA_ACO 9, LAMINA_DRACO_1H 12, ESPADA_GUARDIAO 16) +
  ESCUDO_GUARDIAO def 12. ⚠️ Foram em `ITEMS` (cliente) **E** `ITEM_META`+`WEAPON_SKILL` (server) — o
  cap de dano autoritativo usa `meta?.base||5`, então arma só-no-cliente seria CLIPADA (base 5) e o XP
  iria pro Punho. Build de escudo sem igualar as 2H (16 < Eterna 30).
- **#7:** as 1h novas + ESCUDO_GUARDIAO entram no loot do `SENHOR_PROFUNDEZAS` por chance (Aço 0.40,
  Lâmina 0.25, Guardião/Escudo 0.12).
- **#11:** santuário 5×5 pro Vendedor de Almas (75,20), contíguo ao Ferreiro — reverte a exclusão "de
  propósito" da cont.5 (dono mudou de ideia).
- **#9:** mob larga o alvo no santuário — `playerNearNpc` checa `inSanctuary` ANTES da grace de 2s →
  não empilha mais na borda ao atacar de dentro.
- **#10:** ESC sempre para o ataque — o handler do chat input fazia `stopPropagation` (comia o ESC
  global → `clearTarget`); agora chama `clearTarget` no próprio handler do input.
- **#2:** quest "pegar de novo" — `sanitizeSave` montava `validStages` só com os `stage.id` PUROS e
  DELETAVA `_started`/`_kills`/`_visited` a cada save → progresso de chain perdido no round-trip.
  Allowlist corrigida (id puro + flags; `_kills` clampado em `stage.count`). Turn-in valida server-side
  e nunca confiou nessas flags → sem vetor novo.

**✅ #1 (chat estoura em combate) — DEPLOYADO (`a20cfc1`, cliente-only):** com o repro do dono (aba
COMBATE + log cheio) cravei: `syncChatHeight` usava `TABS_H=28`/`INPUT_H=36` FIXOS e só rodava em
resize/load. Na aba COMBATE a barra ganha os `#logFilters` (>28px) → o `#log` calculado com 28
estourava pra fora da tela. Fix: mede `.chat-tabs`/`#chatInputRow` REAIS + recalcula `syncChatHeight()`
ao trocar de aba.

**3º lote (cont.2) — 2 follow-ups pós-teste in-game do dono (deploy via /manutencao):**
- **#2b — modal de quest "emperra":** entregar funcionava no server (creditava ouro/xp), mas o modal
  não atualizava pro próximo estágio (tinha que fechar/reabrir). Causa: o handler do `questResult.ok`
  re-renderizava o chainDialog via `(window.NPCS||[])`, mas `NPCS` é `const` (não vira `window.NPCS`)
  → `undefined` → não achava o NPC. Fix: usa `NPCS` direto. (≠ do #2 sanitize, que era perda de
  progresso no round-trip de save — os dois eram bugs reais distintos.)
- **#3/#6 — coleta de loot ("loot de trás não pega"):** o pickup era raio 1 (3×3), mas o drop é 3×3 ao
  redor do MOB e você ataca a 1 tile → os itens do lado oposto ficavam a 2 tiles. Fix: raio 2 (5×5) no
  `pickupAt` (cliente) + `groundPickup` (server, valida proximidade) — os dois lados.

**Pós-deploy — CACHE DO ELECTRON (lição cara):** o dono reportou #1 e #2b "ainda quebrados" depois do
deploy — eram AMBOS **cache do Electron** (relogar reconecta o WS mas mantém o `play.html` cacheado em
disco; reiniciar o PC tb não resolve). **`Ctrl+Shift+R` (Forçar Recarregamento)** consertou os dois de
uma vez. Gravado em [[feedback-valadares-deploy]] — SUSPEITAR DE CACHE (e conferir o Vercel via `curl |
grep <string do fix>`) ANTES de re-investigar o código. Gastei vários ciclos "consertando" o que já
estava certo. **#1 e #2b CONFIRMADOS OK** pós hard reload. Também subiu **pickup-ao-matar** (`a1fcf16`,
cliente-only): coleta o loot na hora da morte (raio 2) sem precisar andar.

**⏳ PENDENTE → próxima sessão:** o dono disse que **o loot ainda ficou "estranho"** (NÃO detalhou o quê)
e deixou pra depois. No início da próxima, **pedir o detalhe**. Opções: o teu **#3/#6 "cair junto"**
(drop CONCENTRADO no tile do mob em vez de espalhar 3×3 — server, precisa /manutencao; com IDs
server-autoritativos não "some" ao empilhar) e/ou revisar o pickup-ao-matar / o raio. Commits do dia:
mana `644921f`, lote `c432609`, #1-altura `a20cfc1`, #2b+loot `84ae225`, #1-CSS `0e094ed`, pickup `a1fcf16`.

**#1 LOOT-TEXT cravado no preview (`85faade`):** o "loot estranho" que o dono via ERA o **texto do loot
do boss esticando a tela**. Reproduzi no preview (server estático local): a linha longa no `#log` esticava
o `#gameContainer` pra **836px** (canvas 720 + ~116px de preto à direita). `overflow-wrap`/`overflow-x`/
`max-width:100%` NÃO bastavam — sem largura travada, o `#chatPanel` expandia pro conteúdo e o `max-width`
não tinha referência. Fix: **`#chatPanel { width:0; min-width:100% }`** (trava ao canvas). Confirmado no
DOM: 836→722, log quebra a linha dentro. **#1 e o "loot estranho" RESOLVIDOS.** ✅ **Arquivo de 11 bugs
100% endereçado** — só o "cair junto" (#3/#6 drop concentrado) fica como melhoria OPCIONAL (a coleta já
funciona com raio 2 + pickup-ao-matar). LIÇÃO META: bug de layout = reproduzir no preview e medir o DOM
ANTES de chutar (errei 2x no #1 teorizando; o preview cravou em 3 evals).

**Deploys:** ambos via /manutencao. O `c432609` teve confirmação SÓLIDA — monitor pegou a janela de
restart do Railway (`true`→DOWN→`false`) + Vercel servindo `ESCUDO_GUARDIAO`. Dono valida in-game
pelo checklist (morte na masmorra, drop do boss, ESC, santuário, quest de chain).

---

## ✅ Sessão 01/06/2026 — AUDITORIA 29/05 fechada (dedup + offline removido + protocolo) + DEPLOY

Fechou a auditoria 29/05 inteira + deployou via /manutencao. **4 commits:** `1e389f1` (server.js dedup + dead
code cliente), `3456f36`+`1d924ca` (**remoção do offline INTEIRO**), `55cf611` (protocolo morto).

**Reconciliação 1ª:** a seção 🔴 SEGURANÇA da auditoria JÁ estava feita (lote `d5aec67`, 30/05 — daily/scrypt/
rate-limits). O que faltava era LIMPEZA: dedup server.js (`_isValidEmail`→`isValidEmail`, `DOT_COLORS`,
`HL_HUNT_COOLDOWN_MS`, 9 guards `typeof`), dead code cliente (`attack()`/CSS `.po-hp`/console.log), e os 2 grandes:

**Offline removido (~826 linhas; cliente 100% server-authoritative):** spawnMonster/spawnInitialMonsters/helpers,
updateMonster(AI)/pickSurroundSlot/tickMobDots, killMonster+rollDrops, branches `else` offline de doAttack/throwSpear/
castSpell, tickRegen/tickStatusEffects offline, fallbacks de completeStage/turnInQuest/claimDaily/quest-choice/pickupAt/
buyTalent, XP local em mobKilledByServer/tickTraining. No-op: rollAttackerStatus/gainSkillXpLocal/gainMagiaXp. Dead
helpers removidos: gainSkillXp, applyPoison/Stun/Bleed (status vem direto dos handlers playerDot/playerStun). game-start
sempre espera snapshot. Mantidos: `monsters[]`, BOSS_RESPAWN_MS (UI de respawn), hlHuntActive/Timer/HL_HUNT_DELAY_MS,
serverLoot-compat. Cortes grandes via script anchor-based (emoji/template-safe); `node --check` a cada etapa.

**Protocolo morto:** handlers WS `setEmail`/`passwordResetRequest`/`passwordResetConfirm` (cliente usa HTTP
`/api/password-reset/*`) + handler `eventReward` (gold rain é `invUpdate.goldDelta`). Mantidos `pong` (keepalive) e
`pkDeath` (vivo). `setAccountEmail` mantido (criação de conta).

**Testado IN-GAME local** (server :8080 + preview "valadares" :3333): loop completo online-only — login→289 mobs do
server→attackMob→dano (rate-limit 200ms ok)→kill→loot serverDrops (id `g1`)→XP+stats→pickup→inv. Zero erro.
⚠️ **Pegadinha do teste local:** o browser do preview tem UA Electron → trip no version-gate; bypass =
`CLIENT_VERSION='1.0.9'` ANTES do login. E combate bloqueado na PZ (sair de 46-54). Detalhe na memória.

**DEPLOY (~11:04 via /manutencao):** monitor em background vigiou `/api/status`, push fast-forward no instante do
`maintenance:true` (0 atrás, sem rebase). **Verificado no ar:** Vercel = cliente novo (símbolos offline = 0; doAttack/
applyMobsSnapshot presentes); Railway = server novo (check via WS: handler removido `passwordResetRequest` não responde
mais `passwordResetResult`); `/api/status`=maintenance:false. **Dono smoke-test OK in-game** (combate/loot/XP/masmorra). ✅

---

## ✅ Sessão 31/05/2026 (cont. 13) — DEPLOY do lote (cont.10+11+12) + verificação

Lote inteiro deployado via /manutencao (commit `67b4c19`): **M4 3b Fase 2** (masmorra procedural) + **3 bugs**
(loot de boss, Fúria, barras HP/MP) + **cap com mérito**. NO AR e confirmado (Vercel servindo o código novo;
`/api/status`=maintenance:false; Railway redeployado).

**Processo:** precisou de **2 janelas** de /manutencao — a 1ª expirou (~5min) enquanto eu adicionava o cap fix
(lição: commitar TUDO antes de o dono travar; o lock auto-expira em minutos). Na 2ª, um monitor em background
(`run_in_background`) vigiou `/api/status` e pushou no instante que travou (`maintenance:true` na iter 1), depois
outro confirmou o server de volta.

**Verificado pelo dono no painel:** crítico **30%** (Espada 71 → base+skill 25,9% capa em 25% + 5% talento),
esquiva **27,5%** (Escudo 45 → 22,5% < teto, + 5% Aura) — o mérito soma por cima, **correto**. A esquiva chega a
30% quando o Escudo passar de ~52 (aí base+skill bate no teto). (1ª vez o painel mostrou 25% velho = **cache do
Electron**; fechar/reabrir puxou o novo — o Vercel já servia o código novo, confirmado por curl.)

⏳ **Falta o dono validar IN-GAME (amanhã):** descer a masmorra 1→5 (cavernas/seta/escada ▼), 1 banner de loot de
boss, Fúria laranja+▲, barras HP/MP desgrudadas. **Pendências antigas:** repor skills perdidas (Espada 69→61 via
/skill admin); bugs de UI "piscada"/"desloca" (dono investiga repro); balance do enxame (cap por tick? — crit do
mob é no-op online).

---

## ⚖️ Sessão 31/05/2026 (cont. 12) — cap de crítico/esquiva: mérito (talento/quest) soma POR CIMA dos 25%

Dono, vendo a quest "Aura do Vidente" (+5% esquiva permanente) ser comida pelo teto: "limitei em 25% mas as
quests têm que somar, é mérito do player." Mudança: base+skill continua com **teto 25%**, mas os bônus
PERMANENTES ganhos (talento t_crit/t_dodge + auras de quest — ambos em `permaBuffs`) somam **POR CIMA**.
Teto de segurança **50%** (anti-invencível). Tocado: `playerCritChance`/`playerDodgeChance` (cliente) +
`playerDodgeChanceServer` (server, esquiva PvE é authoritative) + os 2 tooltips do painel. Verificado no DOM:
sem mérito 25%, com +5% de quest → **30%**, mérito alto → teto 50%. (Reverte em parte o "cap TOTAL inclui
talento/pvp" do 30/05 — agora o mérito permanente fica por cima; pvp/buff temporário segue dentro do teto 25%.)
Entrou junto no deploy da cont.10/11.

---

## 🩹 Sessão 31/05/2026 (cont. 11) — 3 bugs in-game (cliente): loot de boss, Fúria, barras HP/MP

Dono testando PRODUÇÃO (não o lote M4 da cont.10, que nem foi deployado) reportou 3 bugs — todos cliente (`play.html`):

**1. Loot de boss "bagunça a tela".** Matar boss disparava 2 banners gigantes empilhados: o toast 🏆 listando TODO
o loot (228g + 7 tipos → 2 linhas) + um 2º toast 💰 "+228 de ouro creditados" (o MESMO ouro, redundante, do
`goldDelta` da mesma msg). Fix: o toast de loot virou RESUMO compacto ("🏆 Loot de {boss}: 228g + 22 itens"; a
lista completa segue no log de combate) + suprime o toast de ouro quando a msg já traz `bossLoot`. 1 banner curto
no lugar de 2 gigantes.

**2. Fúria não subia a Vel. ataque (no painel).** Verificado EMPIRICAMENTE no preview: `effectiveAttackDelay` JÁ
aplica o buff (800→600ms) — o ataque REAL acelera. O bug era só DISPLAY: `updateSidebar()` não rodava ao cast/expirar,
então o painel ficava no valor velho (a diferença de Velocidade que o dono viu entre telas foi a RECONEXÃO da ss3,
não a Fúria). Fix: `updateSidebar()` no cast e na expiração + destaque (cor laranja + ▲) na Velocidade e Vel. ataque
enquanto a Fúria está ativa. Testado no DOM: sem buff `1.25/s` azul → com Fúria `1.67/s ▲` laranja; Velocidade `4.6→6.1/s`.

**3. Barras HP/MP coladas na cabeça.** As barras flutuantes ficavam em py-5 (HP) / py-1 (MP) — praticamente na
cabeça/elmo, tapando o item. Fix em `drawCharacter`: SEM nameTag (player local) sobem pra py-9/py-5 (folga acima da
cabeça); COM nome (remotos) mantêm a posição pra não invadir o nome.

Verificado: boot do cliente limpo (0 erros no console), bugs 1 e 2 testados no preview. **Os 3 são CLIENTE (play.html)
→ Vercel, NÃO reconecta (sem /manutencao).** ⚠️ Mas o `play.html` também já carrega as mudanças de cliente do M4
(cont.10) — pushar o cliente sobe as duas coisas juntas (é compatível com o server Fase-1 atual: o cliente desenha as
escadas que o server manda, então o M4-cliente roda mesmo antes do M4-server; as cavernas procedurais só aparecem
quando o server for deployado).

---

## 🗺️ Sessão 31/05/2026 (cont. 10) — M4 3b Fase 2: masmorra PROCEDURAL + navegação (⚠️ não deployado)

Dono: "M4 vamos revisar e terminar logo — desci no andar 1, quando fui descer ao 2º parei na PZ 50,50."

**Diagnóstico do bug (não era lógica do server):** o hotfix da cont. 9 deixou as escadas do andar
nos **cantos simétricos** (subida NW 43,43 / descida NE 57,43), as duas a 9 tiles da chegada (50,52)
e **fora do viewport** (VP 15×11 só mostra ~5 tiles pro norte) — e o **rótulo só aparecia a 1 tile**.
Resultado: o dono achou a escada errada (a de SUBIR, que no andar 1 = sair pra cidade 50,50) porque
não dava pra distinguir/achar a de descer. O server fez certo (validou adjacência, exitDungeon andar1→cidade).

**Fase 2 entregue (decisão da cont. 8: cavernas orgânicas):**
- **Server — `genDungeonGrid` procedural** (`server.js`): cellular automata (fill 45% + 4 passes),
  **determinístico por andar** (PRNG mulberry32 semeado pelo floor → mesmo andar = mesmo layout;
  cache efêmero regenera igual). Garante clareira na chegada (raio 2, sem mob em cima), **conectividade
  por flood-fill** (chão isolado vira parede → sala única), e **fallback pra sala cheia** se a geração
  sair pequena/desconexa (nunca quebra). Região 40-60 (21×21).
- **Server — escadas dinâmicas**: subida = chão perto da chegada (cheby 3-9) e **no lado OPOSTO à
  descida** (explorar rumo à descida não cruza a saída → evita "subiu sem querer"); descida = ponto
  mais FUNDO (BFS); boss (andar 5) também no fundo. `isTransitionTile` agora lê as escadas reais do
  andar (`dungeonFloors.get(floor).stairs`, sem o boss pra não bloquear o spawn dele); handlers
  `descendDungeon`/`exitDungeon` validam adjacência contra a escada real (antes: constantes fixas →
  quebraria com layout procedural). Removidas as constantes mortas `DUNGEON_EXIT`/`DUNGEON_DOWN`.
- **Cliente — navegação + clareza** (`play.html`): **seta na borda da tela** apontando a escada de
  descida (roxo ▼) e subida (azul ▲) quando fora de vista; **glifo ▲/▼ persistente + rótulo visível
  de longe** (não só a 1 tile) → nunca mais confundir sair com descer. **Matei o fallback stale**:
  `dunStairUp/Down` retornam null sem `dungeonStairs` (antes chutavam 50,50/50,57 = o tile errado);
  `checkDungeonStairs` e os draws guardam null. O cliente já desenhava o grid/escadas do server (Fase 1),
  então o procedural "encaixou".

**Verificação:** `node --check` server ✓; teste isolado do gerador (5 andares: chegada/escadas em chão,
descida cheby 10-11, subida cheby 3-9 oposta, tudo conectado, determinístico) ✓; sintaxe do JS inline
do cliente (vm.Script) ✓; **boot limpo no preview** (login renderiza, 0 erros no console). Math da seta
conferido à mão. **Caminho in-game só testável pós-deploy.**

**Balanceamento "dano cercado" (dono pediu nerf no crit do mob):** descoberto que **nenhum `MTYPE` tem
`crit`** → online o mob **nunca crita** (server manda `crit:false` sempre; cliente só exibe a flag). O
nerf seria no-op → **não mexi**. O "morri cercado" é só a SOMA do enxame. A própria clareira da Fase 2
(chegada sem mob 3×3) já tira o swarm de chegada. Pendente decisão do dono: **teto de dano por tick**
(fix real do enxame) ou deixar como está.

> ⚠️ **Mexe em `server/**` → NÃO pushado.** Deploy com `/manutencao` + logout limpo (regra do wipe 30/05).
> **Checklist in-game pós-deploy:** (1) descer andar 1→2→...→5 pela escada ▼ (não cai na cidade);
> (2) seta de borda aponta a descida; (3) subir volta 1 andar / andar 1 → cidade 50,50; (4) cada andar
> tem layout diferente e orgânico; (5) mob não nasce em cima de escada nem na clareira da chegada;
> (6) boss no andar 5 no fundo da caverna.

---

## 🐛 Sessão 31/05/2026 (cont. 9) — hotfixes pós-deploy da Fase 1 (bugs reportados in-game)

Testando o lote anterior in-game, o dono pegou bugs sérios na masmorra + 1 de mecânica. Corrigidos:

**1. "Subia sozinho de andar" + "morria ao sair da masmorra".** As escadas colavam na chegada:
chegada (50,52) e subida (50,50) a 2 tiles → andar 1 tile pro norte pisava na escada de subida sem
querer. E a SAÍDA do andar 1 cuspia em (83,18) = **dentro do Antro do Minotauro** (covil com ~12 mobs)
→ cercado e morto em segundos ao sair. Hotfix (server.js, constantes DUNGEON_*):
- `DUNGEON_RETURN` 83,18 → **(50,50) PZ da cidade** (saída segura, não no meio dos minotauros).
- `DUNGEON_EXIT` (subida) 50,50 → **(43,43) canto NO**; `DUNGEON_DOWN` (descida) 50,57 → **(57,43)
  canto NE**. ~9 tiles da chegada (50,52) → não pisa sem querer. (Hotfix dentro da sala 40-60 atual;
  a Fase 2 procedural com escadas naturalmente espalhadas fica pro próximo deploy.)

**2. Morrer "cercado" (várias mortes do dono).** NÃO é hit kill nem bug de dano — confirmado nos
números: morcego dá ~2 com a def dele, nenhum mob one-shota 340 HP. É o ENXAME (8+ mobs fracos batendo
no mesmo tick somam rápido) agravado pela saída no covil. A saída segura (item 1) mitiga muito. Balance
do dano-cercado (cap por tick / nerf crit do mob) ficou EM ABERTO — perguntei ao dono, ele vai decidir.

**3. Fúria não acelerava o ataque (só o movimento).** `effectiveAttackDelay` usava só o `atkSpd` da
arma, ignorava `player.buff.spd`. Fix (play.html): aplica `d * (1 - buff.spd)` — mesma fórmula da arma
e do `playerMoveDelay`. Verificado no preview: 800ms→600ms = +25% (1.25→1.67 atk/s); o painel "Vel.
ataque" passa a refletir o buff. O dano online já passava (rate-limit attackMob 200ms < 600ms, com folga).

**EM ABERTO (dono vai investigar pra ajudar a reproduzir):** "piscada" ao lutar + tela "desloca e volta"
+ loot de boss "bagunça a tela". No preview, encher a sidebar NÃO move o canvas (layout robusto) → causa
ainda não cravada. Fora deste deploy.

**Pendência operacional:** repor via admin (/skill) as skills que o dono perdeu nas mortes (Espada 69, etc.).

---

## 🏗️ Sessão 31/05/2026 (cont. 8) — M4 3b Fase 1 (grid server-autoritativo) + 2 fixes de UI

Dono pediu o M4 3b (masmorra procedural). Decisões dele: **cavernas orgânicas** + **entrega incremental (2 deploys)**.

**Fase 1 (commit 0f4b188) — server vira DONO do grid (layout idêntico, baixo risco):** hoje o cliente
gerava o andar mas IGNORAVA o floor (toda masmorra = sala vazia 40-60, escadas fixas em x=50). Agora o
server gera o grid WALL/FLOOR (`genDungeonGrid`/`getDungeonFloor`/`dungeonTileWalkable`), transmite no
`dungeonEnter` (grid+stairs) e usa nele mob/spawn/colisão (mobTileOk, spawnDungeonMobs sorteia floorTiles,
boss usa stairs.boss). Cliente desenha o grid recebido (`applyDungeonGrid`) + escadas do server
(`dunStairUp/Down`, fallback pras constantes). Cache efêmero (`dungeonFloors`) descartado quando o andar
esvazia. Fase 1 mantém a sala cheia 40-60 → **comportamento IDÊNTICO**. Verificado local (node --check ✓,
applyDungeonGrid=441 tiles ✓, boot do cliente limpo ✓). ⚠️ Caminho in-game só testável pós-deploy.
**Fase 2 (próximo deploy): cellular automata + escadas variáveis + polish.**

**2 fixes de UI (cliente):**
- **Chat/Combate bagunçava o layout**: o input do chat sumia no modo COMBATE → o `#chatPanel` encolhia
  ~37px e empurrava o layout do jogo ao alternar abas. Input agora SEMPRE visível (altura constante 318px
  nas 2 abas, medido no preview).
- **Quest vh3 "Selo Antigo do Antro"**: objetivo `visit` movido de (82,18) r3 → **(78,18) r3**. A área
  antiga englobava a porta do M4 (escada 83,17); agora chega só até x=81, longe da entrada. Cliente-only
  (server não valida a posição da visit, só o reward).

⚠️ O lote tem server (p.inv + Fase 1) → **NÃO pushado** (dono fora, sem `/manutencao`). Deploy quando voltar.

---

## 🧹 Sessão 31/05/2026 (cont. 7) — varredura do backlog (dívida técnica) + fix p.inv

Dono pediu pra atacar os 3 grupos (dívida técnica/segurança, housekeeping, P2+) enquanto saía. Varri:
- **Segurança da auditoria 29/05 = 100% fechada** já no `d5aec67` (30/05): re-claim daily, scrypt,
  rate-limits pos/pix, `_errorRateMap`, float/guild caps, isAdmin flag, castSpell guard, train/spell/
  talent→toast. ROADMAP/auditoria estavam desatualizados → corrigidos.
- **✅ Same-player 2× simultâneo**: confirmado FECHADO pela blindagem de 30/05 (auth derruba outra
  sessão da mesma conta por `authedName` + `players.delete`, server.js:4437). Marcado no ROADMAP.
- **✅ p.inv TypeError (FIX desta sessão)**: o player entra no `players` Map na CONEXÃO (4346) SEM
  inv; `ensurePlayerInvSlots` só rodava no join (4691) → janela onde um tick que itere `players` e
  toque `p.inv` sem guarda (ex.: pkDeath drop) dava TypeError. Fix: `ensurePlayerInvSlots(p)` já na
  conexão. Bot 007 já tinha inv. **Server → vai no lote do próximo deploy com /manutencao.**
- **itch-wrapper.html**: commitado (wrapper iframe do itch.io → valadares.app.br/jogar; ligado ao P2 itch).

**NÃO feito (precisa de você ou teste in-game, não dá AFK):** refactor movimento/combate autoritativo
(grande/sistêmico), remover offline ~500 linhas (decisão de produto + precisa server vivo), broadcastMobs
diff (escala), marketing/comercialização (ações suas), balanceamento boss (playtest), churn de baixo
valor (dead code `attack()`, dedups, comentários stale — verificar combate antes).

---

## 🎨 Sessão 31/05/2026 (cont. 6) — tela de login: fundo opaco (HUD não vaza mais)

Dono: "essa tela ficou torta". Diagnóstico no preview: o card de login JÁ estava perfeitamente
centralizado (boundingBox = centro do viewport nos 2 eixos) — o "torto" era o overlay `#login` com
fundo semi-transparente (radial 0.92→0.97), deixando o HUD do jogo (painel de personagem, chat,
"online/conectando") vazar atrás do card enquanto conecta → composição assimétrica, pior em tela
cheia com dados reais. Fix: fundo **OPACO** (`#15110b → #000`). 1 linha de CSS, cliente-only (Vercel;
`play.html` não está nos watch paths do Railway → não reconecta ninguém, sem `/manutencao`).
Verificado no preview (HUD some, card limpo, 0 erros no console).

---

## 🛡️ Sessão 31/05/2026 (cont. 5) — santuário 5×5 nos NPCs de mundo (ler diálogo sem apanhar)

Queixa do dono: parar pra falar com os NPCs externos (Eremita/Ferreiro/Caçadora/Mineiro/Crepúsculo/
Vohrim) = tomar porrada enquanto lê. A mini-PZ 3×3 (`playerNearNpc`) já cobria esses NPCs, mas (a) só
bloqueia a AQUISIÇÃO de alvo e (b) é cancelada por 2s a cada ataque seu — e como esses NPCs ficam no
meio dos mobs, você chega lutando e lê dentro da janela de grace → apanha. Os NPCs da cidade não
sofrem disso (PZ 9×9 forte e marcada). Escolha do dono: **santuário visível + leash, 5×5, mob larga na borda.**

- **Server** (`server.js`): `inSanctuary()` + `SANCTUARY_NPCS` raio 2 (5×5) ao redor dos 6 NPCs de
  mundo. `playerNearNpc` passa a cobrir o santuário (mob não mira quem está dentro, respeitando a grace
  de 2s anti-cheese). `mobTileOk` + os 6 spawns de overworld excluem o santuário → mob não pisa nem
  nasce lá (clareira = leash natural: quem perseguia para na borda e larga). Vendedor de Almas
  (oculto/sinistro) fica DE FORA, de propósito.
- **Cliente** (`play.html`): `sanctuary:true` nos 6 NPCs + helper `inSanctuary` espelhando o server.
  Render pinta tom verde + contorno (mantém o piso do bioma) pra mostrar a zona. Mob-step alinhado.

Resultado: pare de atacar perto do NPC → em ≤2s os mobs largam e você lê em paz; revidar reativa a
grace. Verificado: `node --check` server ✓ + JS inline cliente ✓. Não testável local (precisa server
vivo + login) → checklist in-game. ⚠️ Mexe no server → deploy com /manutencao.

---

## 🩹 Sessão 31/05/2026 (cont. 4) — aviso de manutenção robusto (/api/status)

O aviso de manutenção (`8237598`) dependia de flag `sessionStorage` + reload, rodando no cliente
**em memória** — frágil: se o cliente estava numa versão antiga na hora do deploy, não gravava a
flag e caía numa tela de login sem aviso (o dono pegou isso). Agora: endpoint `GET /api/status` no
server retorna `{maintenance: lock ativo}`; a tela de login consulta via
`fetch(SERVER_HTTP_BASE+'/api/status')` e mostra o aviso pelo **estado real** — não depende de
flag/timing/cache. CORS já liberado (`*`). A flag+reload fica como 1ª camada; o fetch cobre o resto.

---

## 🩹 Sessão 31/05/2026 (cont. 3) — /resetquests agora limpa as chains do mapa

O `/resetquests` (cont. 2) só zerava `quests.active/completed` (quests da **Atendente**, na PZ).
As **chains narrativas do mapa** (Eremita/Ferreiro/Caçadora/Mineiro/Crepúsculo/Vohrim) guardam o
progresso em `questFlags` — estrutura à parte que o comando não tocava → continuavam "concluídas"
no claude (vazaram da alcione antes do 9b948b6). Agora o `/resetquests` também zera `questFlags`
(save + estado vivo `p.questFlags` + empurra pro cliente via `invUpdate`). Diária e flags-de-mundo
preservados. Mexe no server → deploy com /manutencao.

---

## 🩹 Sessão 31/05/2026 (cont. 2) — EXORI (AoE) sem dano + botão reset quests

**EXORI/AoE não aplicava dano online** (reportado matando o Senhor de Valadares). O Exori dispara
1 `attackMob` por mob no raio, todos no mesmo tick. O rate-limit do `attackMob` (200ms, anti-rajada
forjada) era POR PLAYER → só o 1º hit passava, o resto sumia silenciosamente ("o dano aparece mas o
mob não morre"). Fix: rate-limit POR MOB (`p._lastHitMob` Map) — o AoE acerta todos os mobs do raio,
mas a trava contra rajada de hits forjados no MESMO mob (one-shot de boss) continua igual. Limpeza
preguiçosa do Map (>64 entradas, evict >5s). NÃO piora o boss (1 mob segue a 1 hit/200ms).

**Botão "reset quests"** no painel admin (GERENCIAR PLAYER, ao lado de check/reset pos) → manda
`/resetquests NOME` (campo vazio = a própria conta). O dono procurou o botão; só existia o comando.

**Escalonamento de magias por `Magia`.** Confirmado: dano (Fireball/Raio/Exori = base + Magia/3) e
cura (Cura/Cura-Grupo = base + Magia/2) JÁ escalavam. As 2 utilitárias eram FIXAS → agora escalam
também (pedido do dono): **Fúria** duração = 12s + Magia/10s (cap 200 → 32s); **Provocação** range =
5 + Magia/25 (cap 200 → 13). Cliente-side (onde essas magias são processadas). Descs atualizadas.

⚠️ O fix do EXORI mexe no server → deploy com /manutencao.

---

## 🩹 Sessão 31/05/2026 (cont.) — fixes pós-deploy: HP/MP do /skill, vazamento de quests, /resetquests

Testando o lote anterior in-game, surgiram 2 bugs + 1 comando novo:

**1. HP/MP não recalculavam ao editar skill via admin.** O `/skill` que adicionei mudava a skill mas
não chamava `recomputeMaxStatsServer` → maxHp/maxMp ficavam no valor antigo (boneco mostrava 122/111
de quando sumSkills=82, mesmo após editar pra 336 → o certo é 376/238). Relogar corrigia (login
recalcula em `:4722`). Fix: `/skill` agora chama `recomputeMaxStatsServer(p)` + `broadcastPstatsAll`
+ grava maxHp/maxMp/hp/mp no save → recalcula na hora.

**2. Vazamento de quests entre contas.** `applySaveData` resetava flags/questFlags/permaBuffs (fix
9b948b6) mas ESQUECEU `quests.active/completed` — ainda usava `if (d.quests)` sem else. Trocar de
conta sem F5 (alcione → claude) mantinha o `completed` da anterior → boneco novo aparecia com as
quests principais "concluídas". (As principais exigem aceitar+entregar no NPC, não auto-completam
por kill → era vazamento, não progresso.) Fix: reset explícito de active+completed (mesmo padrão do
flags/permaBuffs). Impede vazar de novo; saves já contaminados precisam de /resetquests.

**3. `/resetquests [NOME]`** (novo comando admin): zera active+completed da conta (online ou offline),
preserva a diária. Pra limpar contas que já pegaram o vazamento (ex: o claude).

(Itens 1-3 deployados no `33754d4`, via /manutencao — mexem no server.)

**4. Aviso de manutenção na tela de login** (cliente-only, push à parte — não reconecta Railway).
O `authFail reason:'maintenance'` recarregava a página; com o auto-login removido, isso caía numa
tela de login "nua" → o player achava que tinha perdido o personagem (foi o que confundiu o dono).
Agora grava flag em `sessionStorage` antes do reload e a tela de login exibe, persistente,
"🔧 Servidor em manutenção — volte em ~2 min. Seu personagem está salvo". Mensagem do toast também
melhorada. (Ideia do dono. A 2ª ideia — Claude rodar comandos via conta admin — fica pra depois:
o certo é via API admin HTTP, não logar como player, senão vira a sessão-fantasma do deploy.)

---

## 🛠️ Sessão 31/05/2026 — Admin edita char (server-side) + restore só admin + mobs no lago (`1f41f52`)

Deployado via `/manutencao` + logout (fluxo correto — sem repetir o wipe de 30/05).

**1. Admin edita char de verdade (server-autoritativo).** O painel admin (gold/skills/HP-MP)
mexia só no `player.*` do cliente → o lockdown N3 sobrescrevia com o valor vivo do server no
próximo sync → "edito e some em ~1min". Sintoma in-game: ouro 15000 no display mas Mercador
respondia "Sem ouro (1000g)" (server via o gold real <1000). Fix: 3 comandos no roteador admin
(`/gold N`, `/skill NOME N`, `/heal`) que aplicam em `p.*` vivo + gravam no `acc.save`
(`flushAccounts`) + empurram via `invUpdate`/`pstats`. O painel manda esses comandos via
`_adminSendChat` (otimista no cliente + autoritativo no server; quando o invUpdate volta, bate).
`/help` atualizado. Skills: Punho/Espada/Machado/Clava/Distância/Escudo/Magia.

**2. Restaurar backup → SÓ admin.** O botão "Restaurar do backup" estava no menu de Opções
(qualquer player) → permitia auto-restauração/rollback. Movido pro painel admin; `tryRestoreBackup`
E `restoreFromBackup` checam `isAdmin` (fecha até o vetor `window.restoreFromBackup` via console).

**3. Monstros nascendo no lago.** O evento `siege` (cerco) spawnava ORC/SKELETON/WOLF/SPIDER por
ângulo+raio ao redor do centro SEM validar o tile (`server.js` ~3850) → nasciam dentro do lago
(WATER não-walkable). Todos os outros spawns validavam; só o siege não. Fix: acha posição walkable
no anel (fora de PZ/caverna, sem sobrepor). Bônus: `loadStateFromDisk` descarta mob comum do
overworld preso em tile não-walkable (uniques/masmorra preservados) → limpa os já presos no boot.
`mapSeed=42` é fixo, então o mapa não muda entre deploys — era puramente o siege.

**4. Login automático removido** (cliente-only — push separado, não reconecta Railway). `tryAutoLogin`
entrava direto via `SESSION_KEY` (nome+hash no localStorage), pulando a tela. Agora só pré-preenche o
último nome usado; o player digita a senha e confirma (foco vai pro campo de senha). Ajuda a testar
conta comum vs admin sem deslogar/relogar.

**A testar no login:** (a) painel → ouro → comprar no Mercador → relogar (persiste); (b) player
comum não vê mais o botão de restore nas Opções; (c) cerco nasce em terra + log
`[state] … N presos em água descartados`.

---

## ⚔️ Sessão 30/05/2026 (cont. 3) — Rebalance do personagem + correção de PvE + claude admin (`dfe3f9f`)

Dono pediu pra repensar o sistema do personagem. Decisões dele:
- **Crítico**: base 4%→**1,5%**, teto total 30%→**25%**.
- **Esquiva**: base 2%→**1,5%**, teto **25%**. (cap TOTAL = inclui talento/pvp; painel nunca > 25%.)
- Resto inalterado (skills/hp/mp/ataque/defesa/velocidade/vel.ataque/talentos).

**🔧 Bug corrigido — esquiva MORTA em PvE:** dano mob→player é server-side (`tickAI`), que só
aplicava defesa — **ignorava esquiva e crit do mob**. Esquiva/crit-do-mob só rodavam no
`damagePlayer` client, que NÃO executa online → Escudo/dodge era decorativo em PvE e o mob
nunca critava. Agora `tickAI` aplica `playerDodgeChanceServer` (espelha o cliente) + crit do
mob (×2), mandando `dodged`/`crit` no `mobHit`.

**Visualização:** float verde "Esquivou!" + ★ crit do mob (laranja) com log; painel compacto
(`Velocidade X/s`, `Vel. ataque X/s`) + tooltip de breakdown nos 4 stats.

**claude vira admin** (`ADMIN_NAMES = alcione,claude`; antes `ADMIN_NAME` singular).

**✅ CONFIRMADO + CORRIGIDO (`9b948b6`):** o claude zerado mostrava 6,5% = 1,5% (base nova, ok)
+ 5% de `permaBuffs` velho (talentos da alcione) grudado no localStorage ao trocar de conta sem
reload. `applySaveData` resetava flags/questFlags/permaBuffs só com `if (d.X)` (sem else) → herdava
da conta anterior. Fix: reset explícito (`= d.X || {}`). Cliente-only (Vercel, sem reconexão).

**Vale pra TODOS os players** (fórmula ao vivo, não valor salvo): no próximo login, crit/esquiva de
todos recalculam com base 1,5% / teto TOTAL 25%. Builds de crit antigas sentem o nerf — o teto
total 25% inclui talento (antes o talento somava por cima do cap 30%, dava ~32%). Sem migração.

---

## 🔴 Sessão 30/05/2026 (cont.) — INCIDENTE: deploy zerou o boneco do dono + blindagem

**O que aconteceu:** pushei o lote de auditoria (`d5aec67`) **direto, com o dono online**,
SEM usar o `/manutencao` (que ele pediu e construímos no dia anterior, `f493cd1`, justo
pra isso). O restart forçou reconexão → **sessão fantasma vazia gravou save vazio por cima
do boneco logado** → conta `alcione` zerada. As tentativas de socorro (clicar "Restaurar
do backup" + relogar várias vezes, ANTES do fix) corromperam o backup local (manteve skills,
perdeu gold/itens). **Resultado: ~3-5 dias de itens/loot perdidos (irrecuperável).** Skills
voltaram (estavam no backup corrompido); gold reposto (478708, sabido pelo ranking); itens não.

**Causa-raiz:** `removeGhostsByName` só removia ghosts JÁ `disconnected` e casava por
`p.name` (='Anônimo' antes do join) → uma 2ª sessão VIVA escapava, e era ela (p.* vazio) que
gravava vazio. E `saveUpload`/persistência não tinham NENHUMA rede: sem trava empty-over-full,
sem escrita atômica, sem backup, e load sem fallback (arquivo corrompido = wipe GERAL).

**Lição de processo (gravada em [[feedback-valadares-deploy]]):** NUNCA pushar `server/**`
com player online. Sempre `/manutencao` + logout limpo antes. Correção técnica não vale nada
se zera um player. O dono (com razão): "esse jogo quem joga cuida do boneco, dos itens, da
progressão".

**Blindagem deployada (`7c97deb` + `2e616c8`):**
- 🔒 **Trava anti-wipe** (`saveUpload`): save vazio-default NUNCA sobrescreve `acc.save` cheio
  (`isEmptyDefaultSaveServer`). Mata o vetor.
- 🔪 **Matar sessão dupla** (no auth): nova conexão derruba QUALQUER outra sessão da mesma
  conta (viva ou fantasma, por `authedName`). Fecha a causa-raiz.
- 💾 **Persistência robusta do `accounts.json`**: escrita ATÔMICA (tmp+rename), BACKUPS
  rotativos (24, `/data/accounts_backups`), load com FALLBACK pro backup válido, trava de
  arquivo (0 contas não sobrescreve cheio). Testado isolado 7/7 (corrompi arquivo → recuperou
  com gold intacto).
- 🚪 **`/manutencao` agora DESLOGA todos** + tranca novas conexões (lock auto-expira) ao fim
  do countdown — antes só avisava. Cliente trata `authFail reason:maintenance` (retry 8s).
- 🛟 **Restauração admin** (`7c97deb`): `/allowrestore NOME` → on-join `restoreMode` → cliente
  manda backup local → server grava `acc.save` (só sobre conta zerada). Usado p/ tentar
  recuperar (trouxe skills; itens já estavam perdidos no backup corrompido).

---

## 🚀 Sessão 30/05/2026 — Lote de auditoria: pendentes FECHADOS + deployado

Dono pediu: revisar pendentes da auditoria + reconnect/deploy gracioso + M4 3b.
Revisão feita JUNTOS (decisões dele): offline = **remover de vez**; hash = **scrypt no lote**.

**✅ Deployado (commit `d5aec67`, push direto p/ main — dono autorizou "faço tudo"):**
- **Re-claim de daily TRAVADO** 🔴 — anti-replay era `daily.claimed` do save do cliente
  → forjava `claimed:[]` via saveUpload → re-claim infinito de gold+XP. Agora
  `p.dailyClaim` server-autoritativo (lockdown no persist, igual gold/inv) + id válido
  só `d_<hoje>_[0-2]` (= cap 3/dia mesmo forjando a lista). Cliente sincroniza o
  `claimed` cosmético do server pra UI cinza.
- **Hash scrypt** 🟠 — sha256(salt global) → `scrypt$<salt aleatório por conta>$<hash>`
  com **rehash transparente** no login das contas legadas (verifyPwHash detecta formato).
  **scrypt NÃO depende de ACCOUNTS_SALT** → mudar a env não quebra contas migradas
  (só travaria legadas não migradas — preservar o valor atual). Testado isolado (10/10).
- **Rate-limits + caps** — `pos` 40ms (piso legítimo é 80ms → 2× folga, sem rubber-band);
  `/api/pix/create` 3s/IP; `_errorRateMap` usa último item do XFF (não spoofável) + TTL
  evict (era leak ilimitado); `float` cap 48/16; `/guild join` dedup+cap 30+nome válido;
  pix não grava email em conta arbitrária; back_urls → SITE_BASE_URL.
- **castSpell guard** 🐛 — FIREBALL/RAIO faziam dano LOCAL + killMonster sem guard
  → "mob zumbi" e **nenhum dano real online** (server processa dano de magia via
  attackMob — vide comentário do handler spellCast). Agora espelha EXORI/doAttack:
  online manda attackMob, offline mata local. Mana/XP seguem via gainMagiaXp→spellCast.
- **train/spell/talent `ok:false` → toast** — eram mensagens de topo SEM handler no
  cliente (falha silenciosa). Convertidos pra `serverMsg` (cliente já renderiza).
- **isAdmin** por flag/env (`ADMIN_NAME`) com fallback por nome (dono nunca perde acesso).
- **Limpeza**: handlers mortos `kill`/`hlHuntClaim` (2 lados), `ws.on('error')` duplicado,
  `p.legacy`, logs `[mega] skip`; RECIPES marcado INDEX-SENSITIVE; `.gitignore` electron;
  docs com URL antiga (electron/README, deployment.md).

**Verificação:** `node --check` server OK; JS inline do cliente compila (0 erros);
`hashPwServer` 100% removido sem dangling; **server bootou local limpo** (4 contas, 252 mobs).
Caminho online não testável local → checklist pro dono.

> ⚠️ **TESTAR PÓS-DEPLOY:** (1) 🔴 LOGIN (conta existente loga c/ rehash; nova; reset).
> Se quebrar = scrypt → rollback. (2) 🔴 daily não re-claima ao forjar `claimed:[]`.
> (3) FIREBALL/RAIO causam dano online. (4) treinar sem gold / talento sem ponto = toast.

**#9 (reconnect→PZ + countdown `/manutencao`) já estava commitado/live** (`f493cd1`) — nada a fazer.

### ⏸ Deferido (com motivo)
- **Remover offline (~500 linhas)** + **sends de protocolo residuais**: não dá pra
  verificar local (remover offline quebra o teste em preview; precisa server vivo).
  500 linhas interligadas no deploy de segurança = risco evitável. Passo próprio focado.
- **M4 3b procedural**: feature grande, precisa decidir abordagem de geração. Próxima sessão.
- **itch-wrapper.html**: untracked, sem referência — decisão do dono (commitar/gitignore/apagar).
- Dedups de constante do audit (`_isValidEmail`, `dotColor`, `COOLDOWN_MS`) — churn de baixo valor.

---

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
