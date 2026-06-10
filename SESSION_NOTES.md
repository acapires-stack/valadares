# Notas de Sessão

> Apenas a sessão atual. Sessões anteriores: `docs/archive/sessions-pre-may28.md`.
> Roadmap e backlog: `ROADMAP.md`. Estado completo: memória `project_valadares.md`.
> (A leva 29/05 anterior — devlog, M6 Tinturaria, M8 Auction, M4 fase 1+2 — está
> nos ✅ RESOLVIDO do ROADMAP.)

---

## 🌩️🎬 Sessão 10/06 (cont.2) — Cloudflare-ready + ● REC modo-janela (app v1.0.11) + /give admin ✅ DEPLOYADO (push direto, server vazio)

**Pedido do dono:** Cloudflare na frente do ws + REC-janela no Electron + Espada/Escudo do
Guardião +5 no boneco `claude` ("para eu testar mais fundo").

**Server (`054c804`):**
- **`adminGiveItem(nome, key, qtd)`** — valida key em `ITEM_META` (aceita forja `BASE_PLUS_N`
  até +5), online entrega na hora (`incInv`+`sendInvUpdate`), offline persiste no
  `accounts.json` (conta sem save → `no_save`). Exposto no **chat admin `/give NOME KEY [QTD]`**
  (+ `/help`) e no **`POST /api/admin/action kind:'give'`** (uso via ADMIN_TOKEN).
  Harness `_test_give.js` **8/8** (erros + online com invUpdate + offline persistido; gotcha:
  conta nova tem `acc.save=null` até o 1º saveUpload → teste força um save antes de deslogar).
- **`clientIp()` Cloudflare-aware** — atrás do proxy laranja o último hop do XFF é um edge CF
  (todos os players colapsariam em ~6 IPs → `MAX_CONN_PER_IP` e rate-limits quebravam); agora
  usa `CF-Connecting-IP` **só quando o hop ∈ ranges públicos da CF** (lista v4/v6 embutida,
  override env `CF_IP_RANGES`; parser CIDR BigInt trata v4-mapped `::ffff:`). Header forjado em
  conexão direta no Railway segue ignorado; sem CF nada muda → **flip desacoplado do deploy**.
  Harness `_test_cfip.js` **22/22**.

**Cliente (`21acfe8`):** `startRecording` async — no desktop (`window.electronApi.isDesktop`)
tenta `getDisplayMedia` (janela inteira COM HUD/inventário/chat); app antigo sem handler
rejeita → **fallback canvas limpo** (provado no preview: browser puro + electronApi simulado,
console 0-erro). Áudio via masterGain nos 2 modos; tracks da captura liberados no
`finishRecording` (indicador do SO não fica preso); track encerrado por fora fecha limpo.
Chave nova `log.rec_started_window` pt/en (paridade **702/702**).

**Electron (`59b2721`, v1.0.11):** `setDisplayMediaRequestHandler` entrega **source sintético
`{id: mainWindow.getMediaSourceId(), name:'Valadares'}`** — SEM picker, sempre a própria janela.
**GOTCHAS provados no harness `_test_capture.js`:** (1) `desktopCapturer.getSources` NÃO enumera
janelas do próprio processo no WGC/Windows (o match por id NUNCA casaria; fallback por nome
chegou a capturar a janela do JOGO do dono aberta); (2) `data:` URL não é secure context
(`navigator.mediaDevices` ausente) — usar `loadFile`; (3) prova final: vídeo **784x560 = janela
800x600**, não a tela 1080p. + env `VALADARES_URL` sobrepõe a URL em dev (harness local).
**Release publicada:** github.com/acapires-stack/valadares/releases/tag/v1.0.11 (Setup +
Portable + blockmap + latest.yml — espelho da v1.0.10); auto-update pega em ≤15min.

**Deploy:** servidor **VAZIO confirmado 2×** via `/api/admin/state` (0 online) → push direto
`c788fa1..59b2721` (precedente 09-10/06; dono avisado e escolheu "pusha agora, fico fora").
Vercel ~1min (grep `rec_started_window`). **Railway bootou em ~2.8min** (cache Docker quente —
bem abaixo dos ~12min históricos), confirmado por uptime_s=170 + probe do `kind:'give'` novo.
**Itens DADOS:** `ESPADA_GUARDIAO_PLUS_5` + `ESCUDO_GUARDIAO_PLUS_5` → save do `claude`
(offline, entra no login). Curiosidade: conta-fantasma `__probe__` (probe WS antigo) devolveu
`no_save` e validou esse caminho em prod.

**✅ FLIP DO CLOUDFLARE FEITO (mesma sessão, via Chrome MCP — dono mandou print do dash e eu
dirigi o browser dele):** SSL/TLS da zona **Full → Full (strict)** ("Encryption mode updated
successfully") + registro `ws` **DNS only → Proxied** ("DNS record updated successfully").
**Verificação ponta a ponta:** DNS público agora resolve IPs anycast CF (104.21.55.67 /
172.67.170.156, antes 69.46.46.108 Railway direto) · HTTP 200 com `Server: cloudflare` +
**`CF-RAY ...-GRU` = POP São Paulo** (a mitigação do lag: BR→US via backbone CF) · **probe WS
real `_probe_cfws.js`: handshake wss:// OPEN em 830ms** via proxy (sem auth/join — não cria
sessão). Reverter (se precisar): nuvem laranja → cinza no mesmo registro.

**⏳ Pendências:** dono validar in-game: jogar via CF (latência percebida) + itens no inventário
do `claude` + REC do app v1.0.11 gravando com UI. **Backlog endgame:** forja +10 (último item) ·
validação PvP Selos/HL.

---

## 🕳️ Sessão 10/06 — MASMORRA ESCALÁVEL (sem fundo + boss por banda + checkpoint + ranking) ✅ PUSHADO via /manutencao (`cbb4039`)

**Item #2 do backlog de endgame.** Decisões do dono (AskUserQuestion, todas as recomendações):
**sem fundo + ranking de profundidade · atalho por boss · boss a cada 5 andares · mix de mobs do mundo.**
Mapeamento prévio por workflow (4 leitores + crítico): cravou que a escala é **LINEAR** (`1+0.6·(andar−1)`,
não 1.6^n — o comentário do M7 era notação errada), que o teto 5 tinha **3 semânticas** + espelho no
cliente, e 2 lacunas novas: **pvpAttack sem mesmo-andar** e **groundPickup sem floor** (coords 40-60
sobrepõem cidade/masmorra/arena).

**Server (`server/server.js`):**
- `DUNGEON_MAX_FLOOR` morreu → `DUNGEON_FLOOR_HARD_CAP=999` (teto técnico; arena 9000+ reservada) +
  helpers GLOBAIS `isDungeonFloor`/`isBossFloor` (o local de spawnDungeonMobs saiu; fMult/rollLoot usam
  o helper — arena nunca escala).
- `genDungeonGrid`: TODO andar tem descida (=ponto BFS mais fundo); andar de banda (5,10,15…) ganha
  `stairs.boss` = 2º ponto mais fundo a ≥3 tiles da descida ("guarda" a escada sem bloquear o tile).
- Boss por banda: spawn em `isBossFloor` (era `=== 5`); escala `bMult = 1+0.30·(andar−5)` só pro
  SENHOR_PROFUNDEZAS (andar 5 = ×1 idêntico; 10 = 12.5k hp; 20 = 27.5k). Cooldown 8min POR ANDAR
  (`dungeonBossDeath` multi-chave). Drake/Golem desacoplados (`WORLD_BOSS_RESPAWN_SLOW_MS`).
- Mix por banda: `dungeonMobTypesFor(floor)` — 1-4 Sombra/Carrasco · 5-9 +Esqueleto · 10-14 +Troll ·
  15-19 +Drake/Golem · 20+ +Minotauro (sprites/IA/loot já existiam nos 2 lados; fraquezas elementais
  dão variedade pro mago).
- Loot paga a profundidade: `rollLoot(type, luck, floor)` — GOLD ×(1+0.15·(andar−1)), item chance
  relativa +5%/andar (cap 0.95). Sublinear vs hp do mob (+60%/andar) de propósito (não inflaciona
  vs loja MP). Knobs: `DUNGEON_LOOT_SCALE`/`DUNGEON_ITEM_LUCK_SCALE`.
- **Checkpoint:** `onDungeonBossDeath` (caminho ÚNICO dos 2 sites de morte) dá `p.dungeonUnlock=floor`
  a todo damager online no andar + killer; grava DIRETO no acc.save + re-stamp no saveUpload
  (server-owned); `enterDungeon` aceita `{floor:N}` (válido: banda ≤ unlock; forjado degrada pro 1).
- **Ranking de profundidade:** `entry.depth` (andar mais fundo alcançado, set em enterDungeonFloor) +
  `entry.depthBoss` (tiebreak) na entry de `rankings` (mesmo veículo do arenaRating → persiste no
  state.json). `topDepthRanking` + campo `depths` no `/api/ranking` e WS `getRanking`.
- **Segurança (carona):** pvpAttack exige mesmo-andar (espelha attackMob) · groundPickup idem ·
  handler `pvp` ignora fora do floor 0 (PvP forçado infurável) · **fix do "reconecta no mato"
  (causa-raiz)**: saveUpload grava DUNGEON_RETURN em vez de coords vivas quando floor≠0.

**Cliente (`play.html`):** gate de descida = presença de `stairs.down` (server-auth; constante
`DUNGEON_MAX_FLOOR_C` REMOVIDA); badge `Andar X` sem /5 + guard `!player._arena` (mostrava
"Andar 9001/5" na arena); 2ª rampa visual nos andares 6→20 (rampa 1→5 validada pelo dono INTACTA);
**modal seletor de entrada** (`dungeonEnterModal`, monta via tr() na abertura, ESC na chain global);
handler `dungeonUnlock` (toast) + `state.dungeonUnlock`; togglePvP bloqueado na masmorra; rótulos
de escada via tr() (último PT hardcoded do canvas); aba 🕳 PROFUNDEZAS no ranking modal.
**+ `ranking.html`:** aba/painel/renderDepths espelhando a Arena (tr() sem params lá → replace
manual). **16 chaves i18n pt/en novas — paridade 701/701.**

**Verificação:**
- Harness E2E `_test_depths.js` **24/24** — server REAL com 1 patch (entrada→PZ, dispensa caminhada
  de overworld): descida 1→6 com BFS no grid do server (a trava antiga caía no 5→6), banda 5 com
  boss+descida, boss hp 5000 (regressão), bossSpot ≥3 da descida, mix com Esqueleto, hp ×1.6 no
  andar 2, **boss morto por 2 clientes → unlock multi-damager**, persistência pós-reconexão,
  atalho `enterDungeon{floor:5}` direto, floor 10 forjado degrada pro 1, getRanking depths.
  GOTCHA do harness: attackMob espera **`monsterId`**, não `mobId`; perseguição de boss precisa
  de **BFS real** (greedy emperra na caverna torta — o mesmo bug da IA dos mobs).
- `_check_client.js`: sintaxe play/ranking + paridade 701/701 + 16 chaves + usadas todas definidas.
- Preview :3333: modal seletor (screenshot), aba depths in-game (screenshot), flip EN completo,
  ranking.html PT/EN + degradação graciosa com API velha (sem `depths` → empty state), 0 erro console.

**Deploy:** dono rodou `/manutencao` → `maintenance:true` confirmado → push `769a8fd..cbb4039` na
janela. Vercel confirmado no ar em ~45s (grep `dungeonEnterModal`). Railway monitorado pelo campo
`depths` no `/api/ranking` (sinal de container novo — NÃO o flag maintenance, lição de 09/06).
Revisão adversarial multi-agente rodou em paralelo ao deploy.

**⏳ Validar in-game (dono):** descer além do 5 · boss do 10 (12.5k hp) · toast/seletor do atalho ·
aba Profundezas com dado real · visual dos andares 6+ · "reconecta no mato" não acontece mais.
(Obs 10/06 tarde: prod já mostra `claude` depth 20/boss 20 no `/api/ranking.depths` — se foi o dono
jogando, descida+boss por banda+checkpoint já provados em prod.)
**Knobs de balance** (1 linha cada): DUNGEON_BOSS_SCALE 0.30 · DUNGEON_LOOT_SCALE 0.15 ·
DUNGEON_ITEM_LUCK_SCALE 0.05 · bandas do dungeonMobTypesFor.

**Revisão adversarial (follow-up 10/06 tarde):** achados recuperados do journal do workflow
(`wf_56a68f9b-398.json` no diretório da sessão anterior — `search_session_transcripts` bloqueado
em modo não-supervisionado, mas o JSON no disco tem o `result` completo). **1 confirmado / 0
refutados:** `dungeonEnterModal` fora do `closeAllModals()` + `openDungeonEnterModal` não fechava
os outros modais → hotkey (L/Q/etc.) com o seletor aberto abria o modal POR BAIXO do backdrop
opaco ("tecla morta"; empate de z-index 200 resolve por ordem do DOM). **Fix de 2 linhas ✅
DEPLOYADO (`39fb07a`, client-only → push direto, só Vercel, sem /manutencao):** id na lista do
closeAllModals (play.html:6561) + `closeAllModals()` no início de openDungeonEnterModal (antes do
display:flex, :13873). `_check_client.js` TUDO OK (paridade 701/701). Teste de UI no preview
pulado a pedido do dono (economia de sessão; fix trivial + checker verde).

---

## 🏟️ Sessão 09/06 (cont.) — ARENA PÚBLICA: Elo da Arena PvP no ranking ✅ DEPLOYADO (server vazio, push direto)

**Pedido do dono:** item #1 do backlog de endgame ("Arena pública", ½ sessão / maior ROI). "pode fazer automato, se não tiver gente no servidor pode subir já". Modo autônomo + deploy autorizado se servidor vazio.

**O que era:** a Arena 1v1 já tinha Elo real server-autoritativo (`arenaRating`/`arenaWins`/`arenaLosses` via `arenaEloUpdate` em server.js:5097, persistido no `state.json` dentro da entry de `rankings`), mas ficava **fora do ranking público** — só visível no modal `arenaStats` do NPC. Esta sessão expõe esse Elo no ranking.

**Mudança (server + 2 clientes, cirúrgica):**
- **server.js:** novo helper `topArenaRanking(limit)` (logo após `topRanking`) — filtra só quem disputou (`arenaRating != null || wins+losses > 0`; o `!= null` garante incluir jogador que só empatou, pois empate mexe no rating mas não em wins/losses), mapeia `{name, rating, wins, losses}`, ordena por rating desc. Campo `arena:` adicionado nos **2 emit sites**: HTTP `/api/ranking` (:188) e WS `getRanking` (:7757). **Sem mudança de persistência** (arena já vivia na entry de rankings).
- **play.html:** aba `⚔ ARENA` no modal (entre PvP e BOSSES) + branch de render em `renderRankingBody` (rating grande + ✔V/✘D + winrate%, destaque "(você)", cores de medalha — espelha o layout de season/guilds) + `arena` no `labels` (empty state) + i18n `ranking.tab_arena`/`arena_header`/`arena_winrate` (pt+en).
- **ranking.html:** aba `🏟 Arena` + painel + `renderArena()` (tabela #/Jogador/Rating/V–D(winrate%)) + chamada no `load()` + i18n `rk.tab_arena`/`rating`/`record`/`empty_arena` (pt+en).

**Verificação (preview :3333, sem login):** `node --check` server ✅ + parse inline dos 2 HTMLs 0-erro; teste lógico do `topArenaRanking` **5/5 asserts** (exclui quem nunca lutou · inclui só-empate · ordena por rating · winrate correto). Render exercitado direto via `preview_eval` injetando mock: ranking.html tabela PT(#/Jogador/Rating/V–D) + EN(#/Player/Rating/W–L) + empty state pt/en, **console 0-erro**, screenshot; play.html modal `⚔ ARENA` com "(você)" destacado + winrate 74%/56%/0% + empty "Ninguém com Arena ainda.", **console 0-erro**, screenshot.

**Deploy:** **servidor VAZIO confirmado** via `/api/admin/state` (token do Railway, sem criar sessão-fantasma de WS) → **ONLINE: 0**, uptime 1831s. Push direto `2533495..bb15140` (autorizado p/ server vazio; sem `/manutencao` pois não há ninguém pra deslogar — o gotcha do build>lock de 09/06 não se aplica sem players). **Vercel já no ar** (cliente novo serve a aba em `/ranking` e `/jogar`). **Railway em build (~12min)** — monitor em background polando `/api/ranking` até o campo `arena` aparecer (sinal definitivo do container novo, não o flag `maintenance` que auto-expira).

**Pendência:** confirmar boot do container novo (monitor) + olhada in-game do dono (1ª vez que a aba aparece com dados reais quando alguém jogar arena). Risco baixo — server-auth intacto, só leitura/exposição de dado já existente.

---

## 🪄 Sessão 09/06 — Magia LIBERADA pra qualquer arma (remove gate da wand) · masmorra 3b confirmada in-game

**Dono:** "masmorra ficou ótima" (✅ valida o tint/badge do M4-3b in-game — pendência fechada) + "vamos liberar as magias para qualquer arma".

**Contexto:** a Fase 1 do rework de magos travou **wand obrigatória** pra castar magia de ataque (identidade de classe). O dono reverteu: quer castar magia segurando qualquer arma.

**Mudança (cirúrgica — 2 gates):**
- Cliente `castSpell` (play.html ~12714): removido o `if ((sp.damage||sp.aoeRange) && !isWand) → log(need_wand); return`.
- Server `spellCast` (server.js ~6847): removido o reject `wandBaseServer(p)===0`.
- A pipeline de dano JÁ funcionava com `wandBase=0` (sempre foi o caminho sem-wand) → nada mais a mexer.

**Design resultante:** wand não é mais obrigatória, mas segue sendo a melhor escolha — **soma a base dela** ao dano + **afinidade elemental +20%** + tem o **tiro básico spammável** (auto-ataque do cajado, mana 4). Sem wand a magia sai com base 0 (dano da magia + Magia/3 + crit + talentos); crit e fraqueza do mob valem pros dois. Cura/buff/taunt sempre foram livres. Strings `log.need_wand`/`srv.need_wand` ficaram órfãs (mantidas pra não quebrar paridade i18n 681/681).

**Verificação:** `node --check` server ✅ + parse do `<script>` inline do cliente ✅. Design doc `design-magos.md` decisão #1 marcada como REVERTIDA.

**Deploy:** ✅ FEITO + VALIDADO in-game (dono: "deu tudo certo, estamos intactos e sem mensagem"). Commit `5f42dbf` (server+cliente+design-doc+SESSION_NOTES), push `e66a0a6..5f42dbf`. Magia agora casta com espada/qualquer arma, sem o aviso "Precisa de wand equipada".

**⚠️ GOTCHA DE DEPLOY (lição):** o build do Docker no Railway demorou **~12min**, MAIS que o **lock de manutenção de 5min** (`LOCK_MS` em server.js:2029, auto-expira). Sequência do erro: (1) dono pôs manut 3min → lock 5min + deslogou todo mundo; (2) push no início da janela ✅; (3) build demorou >5min → lock EXPIROU → dono **voltou a logar no server VELHO** (gate antigo ainda disparou `srv.need_wand`, mesmo com cliente novo já no Vercel); (4) build terminou (imagem `17:25:35Z`) e o container novo **trocou com o dono online**. O `maintenance:false` que vi aos 206s era o **lock velho expirando**, NÃO o deploy novo — declarei "no ar" cedo demais. **Save sobreviveu** (dedup/lockdown das auditorias + estado salvo 6s antes do reboot), mas foi sorte. **Correção de processo p/ próxima:** NÃO confiar no flag `maintenance` (auto-expira) como sinal de "deploy pronto" — monitorar a conclusão REAL do Railway (`railway logs --build` / timestamp da imagem / boot do container novo). Railway linkado nesta pasta: projeto `humorous-acceptance` / serviço `valadares` / env `production`. Detalhe em `reference_valadares_deploy_monitor`.

---

## 🌐 Sessão 06/06 (cont. 3) — i18n Fase 3 TAIL: tooltips + chrome de TODOS os modais ✅ DEPLOYADO (cliente `11917a3`) · server `3f29fb0` SEGURADO

**Pedido do dono:** "tail da fase 3 pode fazer" (Ultracode ligado → exaustivo). Fecha o item 2 (tooltips) e item 3 (chrome dos modais). Item 4 (nomes de quest no server) = **NO-OP** confirmado.

**Descoberta (workflow `wqp8xiwn0`):** 8 agentes paralelos varreram tooltips + ~20 modais + server.js → **306 strings candidatas** + crítico de completude. Crítico cravou: (a) leak real em `renderStats` (lista de kills usava `def.name` cru → `mobName`); (b) overlays conexão/loading/forgot fora das funções de render; (c) categorias do inventário: `label` é CHAVE de colapso → traduzir só no display; (d) **server quest names = NO-OP** (server manda só códigos/números, cliente traduz) — só o reject do `trainAttempt` era leak real; (e) pular jargão EN===PT (PvP kills/online/Rating/atk-def-spd) e `toLocaleString`.

**Item 2 — tooltips (cliente):** `itemFullDesc(def, key)` (assinatura ganhou `key`) → 1ª linha `itmName(key)`, desc `itemDescEn(key)`, e `tip.*` (ataque/defesa/atkspd/alcance/procs veneno/sangra/fogo/heal/etc.) + 3 call sites passam a key. Altar `statLine` (5 ramos) → `altar.stat_*`.

**Item 3 — chrome (cliente, ~tudo via tr()/data-i18n):** loja/baú/bancada(craft+forja+describeUpgradeBonuses+banner)/altar/treino(já era)/casino/leilão(4 renders+confirms)/loja-ouro(MercadoPago)/pets/tinturaria/talentos/arena/trade/amigos/guild/ranking(temporada+listas+labels LANG-aware)/stats(cards+lista+summary)/conquistas/widgets(target/pvp/bosses→mobName/party/daily/players-online) + **categorias do inventário** (`catLabelInv` traduz só display, `data-cat` cru) + **KEY_HELP_EN** (Opções) + **HTML estático** dos modais (heads/abas/botões/subtítulos/hints via `data-i18n`/`-html`/`-ph`; hints "ESC fechar" puros compartilham `hint.esc_close`) + **overlays** (reconexão/loading/forgot-pwd) + **modal de duelo** + fix de um `log('Use WASD...')` hardcoded.

**Item 4 — server (`3f29fb0`, SEGURADO):** só o reject do `trainAttempt` (6 chaves `srv.train_*` no `I18N_SRV` pt/en + `reject()` via `trp(p,key)`). **NÃO PUSHADO — toca `server/**` → exige `/manutenção` + logout do dono.** Quest names confirmados NO-OP (sem ação).

**Mecânica:** `tr()` + dict `I18N{pt,en}` (agora **681/681**, 0 assimetria) + helpers de conteúdo já existentes (itmName/mobName/spellName/etc.). Pulado o jargão EN===PT (falsos-positivos do crítico).

**Verificação:** `vm.Script` 0-erro (cliente) + `node --check` (server); **paridade programática 681/681**; **669 chaves usadas todas definidas nas 2 línguas** (único "missing" = `chave` num comentário); preview :3333 — **17 render funcs sem erro em EN + 0 vazamento PT** no DOM (incl. modais estáticos + duelo após applyI18n); amostras EN conferidas ("Sword · +4 attack · 1-handed", "by X · expires in 2h", "STORE ALL/TAKE ALL", "Materials"…).

**Deploy:** cliente `11917a3` pushado → Vercel confirmado no ar (`/jogar`: catLabelInv/dyeSlotLabel/KEY_HELP_EN/chest.your_bag/duel.challenged_you presentes). **SEM /manutenção** (não tocou `server/**` no push). Server `3f29fb0` aguarda `/manutenção`.

**⏳ Próximo /manutenção do dono:** push do `3f29fb0` (trainAttempt EN) + validar in-game (treinar errado mostra reject em EN). **Tail da Fase 3 FECHADO** — só sobra a camada de tradução do MercadoPago/server-sourced (data.error etc.) e lore/flavor PT por escolha.

---

## 🌐 Sessão 06/06 (cont. 2) — i18n Fase 3.1: DIÁLOGOS DE NPC + QUESTS ✅ DEPLOYADO (cliente-only, `cd58f70`)

**Pedido do dono:** "pode executar a faze 3.1 em automato" (autônomo, valida in-game depois). Fecha o
**maior pedaço** do tail da Fase 3 — as quests/chains que ainda estavam 100% em PT.

**Mecanismo (= o sugerido no handoff):** mapas `QUEST_EN` (5 quests) + `CHAIN_EN` (7 chains: name +
stages{name,desc} + choices) keyados por id, logo após `QUEST_CHAINS` (play.html). Helpers com **fallback
PT**: `qName/qDesc`, `chainNameOf/stageNameOf/stageDescOf/choiceLabelOf`, `dailyNameOf/dailyDescOf` —
as **diárias** são geradas por template client-side, então o nome/desc são **re-derivados em EN a partir
do `goal`** (mob/itmName + count), **SEM tocar no save** (PT cai no `q.name`/`q.desc` baked). Dados PT
originais intactos.

**Render roteado:** `renderChainDialog` (flavor de conclusão, escolhas, desc do estágio, progresso
item/multiItem/mob/visit via itmName/mobName+tr, botões aceitar/entregar/em-progresso, meta da etapa),
`describeReward` (prefixo/flag/`(permanente)` via tr + itmName + skillDisp nos nomes de skill),
`renderQuests` (diárias + principais: badges, botões, goal collect/kill, reward, títulos 📅 DAILIES /
📜 MAIN, reset, "no dailies"). + **10 logs/toasts** passam o nome **traduzido** (stageNameOf/qName/
dailyNameOf/choiceLabelOf).

**+29 chaves** `chain.*`/`reward.*`/`quest.*` nas 2 seções do I18N (dict agora **431/431** pt/en, 0 assimetria).

**Verificação:** `vm.Script` no JS inline (731k chars, **0 erro**); paridade pt/en programática (431=431,
todas as 29 novas presentes); preview :3333 — helpers no caminho EN + **render REAL** de quests/diálogo +
**fallback PT** no DOM, **0 vazamento, console 0-erro**. Amostras: "📜 The Dead of the Crypt · stage 1/4 ·
Go to (18,18) · Reward: 80g + 50xp Magic · accept quest" / "Daily: ⚔ 15× Bat · Kill 15 Bats before midnight".

**Deploy:** cliente-only (só `play.html`) → `git push origin main`, Vercel rebuilda, **SEM /manutenção**
(não toca `server/**`; default segue PT para quem já joga). Não havia commit de server segurado (sem gafe-30/05).

**⏳ Tail da Fase 3 restante (NÃO-3.1):** tooltips de stat (`itemFullDesc`/altar `statLine`) + chrome dos
OUTROS modais (loja comprar/vender, talentos, altar "Estudar Magia"). E o server (`server.js`) ainda manda
o NOME da quest em PT nas mensagens de conclusão — separado, exigiria `/manutenção`.

---

## 🌐 Sessão 06/06 — i18n INGLÊS: Fase 0 + Fase 1 (UI estática + títulos dos modais) ✅ DEPLOYADO · expandindo

**Pedido do dono** (saiu pra dormir, autorizou autônomo "com todas as permissões"): ter **opção EN** no jogo + página EN, pro caso de expandir. De manhã revisou e mandou subir ("manda, deu certo, pode continuar"). Plano completo: `docs/i18n-plano-EN.md`.

**🔒 Cliente-only (zero risco de save):** ✅ **DEPLOYADO 06/06** via `git push` (Vercel rebuilda; **SEM /manutenção** — não toca `server/**`, ninguém online afetado; default segue PT pra quem já joga). **Commits no ar:** `87a6bd8` núcleo + `7e9e96a` tutoriais + `8ae585b` títulos das ~22 janelas/modais. (A regra do /manutenção é só pra push de `server/**`; cliente-only é seguro.)

**Fase 0 — infra (`play.html`, logo após CONSTANTES):** `I18N{pt,en}` + `tr(key,params)` (⚠️ `tr`, NÃO `t` — `t` já é param de tile no código) + `applyI18n()` (atributos: `data-i18n`=textContent / `data-i18n-ph`=placeholder / `data-i18n-title` / `data-i18n-html`=innerHTML p/ texto com `<kbd>`/`<b>`) + `LANG` (detecta navegador `en*`→en senão pt; persiste em localStorage `valadares_lang`) + **fallback lang→pt→chave** (nunca tela em branco) + `setLang()` + `updateLangButtons()` + listener `DOMContentLoaded`→applyI18n. CSS `.lang-btn`/`.lang-active`.

**Fase 1 — fatia ESTÁTICA traduzida (83 marcações data-i18n):** tela de **login** (placeholders/labels/links) + **toggle PT|EN** (no login E no modal de Opções) + modal de **Opções** (nova seção IDIOMA/LANGUAGE + áudio/acessibilidade/sistema/tutorial/teclas/close-hint) + **barra de controles** + **tutorial de boas-vindas** (6 seções, `<kbd>`/`<b>` preservados via data-i18n-html) + **tutorial mobile** + **títulos das ~22 janelas/modais** (Mercador/Stats/Quests/Altar/Treino/Talentos/Arena/Loja de Ouro/Casino/Tinturaria/Pets/Leilões/Conquistas/Guild/Ranking/Bancada…) + **HUD in-game** (3 sidebars: Mapa/stats/Equipamento/Combate/Inventário + tabs/filtros do log COMBATE/dano/mortes/sistema + placeholder do chat + title do REC). **Total: 110 marcações data-i18n** (commits `980392c` HUD + anteriores). ⚠️ Seguem PT (Fase 2/3): **corpos dinâmicos** dos modais + **mensagens** (log/serverMsg/floats ~211) + **nomes de conteúdo** (itens/mobs/magias ~330, precisa mecanismo de localização no dado).

**✅ Testado no preview (:3333, SEM server — login/tutorial não dependem de WS):** flip por **clique real** (Senha→Password, ENTRAR→ENTER, "esqueci minha senha"→"forgot my password"...), **persistência no reload** (reabre em EN), Opções/controles/tutorial 100% EN, fallback OK, **console 0-erro**. Screenshots PT e EN conferidos.

**🆕 + LANDING `index.html` BILÍNGUE PT/EN ✅ FEITA 06/06 (commit `fdb641a`, LOCAL/NÃO-PUSHADA — dono pediu pra revisar a VOZ de marketing antes de publicar).** i18n **self-contained** na index (dict próprio pt/en, não compartilha com o play.html), **toggle no nav sempre-visível** (fora do menu que some no mobile), auto-detect do navegador + **mesma chave `valadares_lang`** do jogo (idioma consistente site↔game), atualiza `document.title` + `<html lang>`, badge RECOMENDADO→RECOMMENDED via CSS `[data-lang=en]`. **72 data-i18n** (nav/hero/12 features/3 passos/download/footer/smartscreen com markup). Testado por **eval** no preview (flip completo PT↔EN, title/lang, markup preservado, console 0-erro; o screenshot trava pelo `fetch` da GitHub API da própria página, não é bug). **▶ Deploy quando o dono aprovar a voz:** `git push` (Vercel, cliente-only). ⚠️ SEO profundo (hreflang/páginas separadas) fica pra depois — hoje é toggle + auto-detect (capta visitante direto, não indexação EN).

**🆕 + PÁGINAS AVULSAS bilíngues ✅ DEPLOYADAS 06/06:** **ranking** (`18f7277` — estático via data-i18n + tabelas dinâmicas via `tr()` no render + re-render no toggle + locale de data), **termos** (`4758071`) e **privacidade** (`5fe0f84`) — termos/privacidade usam **dual-bloco** (`data-lang-content` PT/EN alternado, melhor pra prosa longa) com **aviso de tradução de cortesia (versão PT prevalece)** e refs BR mantidas (CDC art.49 / LGPD / ANPD / Lei 13.709). Cada página é **self-contained** (i18n próprio). ✅ **Toda a UI visível do jogo + landing + páginas avulsas estão bilíngues e NO AR.** (HUD e páginas listados abaixo como "falta" JÁ FORAM FEITOS.)

**⏳ PRÓXIMAS FATIAS (com o dono — todas em `docs/i18n-plano-EN.md`):** HUD in-game (muito é JS dinâmico, precisa login pra testar) · mensagens dinâmicas (log/serverMsg/floats, ~211 = "Fase 2") · conteúdo (itens/magias/mobs/quests ~330) · demais modais (inventário/loja/craft/quests/ranking/PvP/arena) · mensagens do server (precisa locale no server) · páginas avulsas (index/terms/privacy). **Padrão pronto e mecânico:** marcar `data-i18n*` no elemento + chave no dict pt/en.

**▶ Pra deployar (quando o dono aprovar):** cliente-only → `git push origin main` (Vercel rebuilda; **SEM /manutenção**). Validar in-game: toggle no login + nas Opções; recarregar mantém idioma.

---

## 🌐 Sessão 06/06 (continuação) — i18n Fase 2 + 2.5 + 3 (conteúdo) ✅ DEPLOYADO · 1 pendência grande

**Dono pediu Fase 2 inteira → depois 2.5 → depois Fase 3, autônomo ("pode fazer automato, ai verifico tudo").** Tudo testado no preview (console 0-erro, paridade pt/en, flip EN). Dados PT originais intactos; mecanismo = dict/maps EN + helpers com fallback.

### Fase 2 — mensagens dinâmicas ✅
- **Cliente (`3b9fed2`):** 247 `log()` + 10 floats de texto → `tr('chave',{params})`. Dict `log.*`/`float.*`/`lbl.*`. `join` manda `lang: LANG`. Admin/[admin] e relays seguem PT.
- **Server (`00aee74`, Opção B):** `p.lang` no join (fallback PT = zero regressão) + `I18N_SRV{pt,en}` + `trp(p,key,params)` + `broadcastMsgKey()` (traduz por destinatário). ~95 serverMsg player-facing. Admin/maintenance/`5656` "entrou em outro lugar" (cliente detecta por `text.includes`) seguem PT de propósito.

### Fase 2.5 — toasts + dicts de erro ✅ (`e5d194d`, cliente)
18 `showServerToast` + 7 dicts de erro inline (auth/questResult/dungeon/arena/auction/dye/pet) + innerHTML de resultado → `toast.*`/`err.*`/`res.*`. Dict cliente: **303/303 pt/en, 0 vazamento**.

### Fase 3 — conteúdo (nomes+descrições) ✅ 5 deploys cliente
`cec8e87` skills · `6e316de` mobs(22) · `e4c94cc` itens(87) · `a01015e` magias(9)+NPCs(15) · `9add7ad` talentos(15)/conquistas(20)/pets(4)/receitas. Mapas `MTYPE_EN/ITEM_EN/SPELL_EN/NPC_EN/TALENT_EN/ACH_EN/PET_EN` + helpers `mobName/itmName/spellName/npcName/talName/achName/petNameOf/skillDisp` (+ catLabel/tierLabel/BUFFLABEL_EN). **Paridade total verificada.** Mob name é baked em `m.name` no snapshot (combate/battle list/logs grátis). Item `itmName` trata `_PLUS_N`. Receitas reusam `itmName(r.out)`.

### ⚠️ GAFE — server pushado SEM /manutenção
O push do cliente 2.5 **arrastou o commit do server `00aee74`** junto (empilhei 2.5 sobre o server "segurado"; `git push` manda a cadeia). Railway redeployou — **HTTP 200 o tempo todo, sem downtime**, código já verificado; risco mitigado pelas hardenings pós-30/05. **LIÇÃO:** ao segurar commit de `server/**`, NÃO empilhar commit pushável em cima (commitar server por último ou `git stash`). Dono deve conferir personagem no login.

### ⏳ FALTA (Fase 3 tail — retomar AQUI na próxima sessão)
1. **Diálogos de NPC + quests** (o MAIOR pedaço; o que o dono mais citou): conversas das chains em `QUEST_CHAINS` (~3000 linhas, ~100-200 falas: eremita/ferreiro/cacadora/mineiro/crepusculo/vohrim/vendedor) + `QUESTS` (nomes/descrições) + estágios/escolhas + progresso de quest (item names em 6071 etc). Render: `renderChainDialog`/`renderQuests`. Mecanismo sugerido: mapa `CHAIN_EN`/`QUEST_EN` por id+stage OU campos `*En` inline + rotear os renders.
2. **Tooltips de stat** (hover): `itemFullDesc` ("+4 ataque · 2 mãos", veneno/sangra…) + altar `statLine` ("dano base · range · cd"). itemFullDesc precisa receber a `key` (hoje só recebe `def`) pra puxar `ITEM_EN[key].desc`.
3. **Chrome de UI dos modais:** botões/labels PT (loja "comprar"/"vender"/"inventário vazio", talentos "comprar"/"sem pontos"/"Redistribuir", altar "Estudar Magia", summaries, confirm() de pet). É prosa de interface, não-conteúdo.

**Deploy:** cliente tudo no ar (Vercel). Server `00aee74` no ar (deployado pela gafe). `main...origin/main` limpo. Prod: valadares.app.br 200 / ws maintenance:false.

---

## 🧪 Sessão 05-06/06 — POÇÃO DE MANA volta a curar DIRETO (instant) ✅ DEPLOYADO 06/06 + no ar

**Pedido do dono:** "voltar o pot de mana para curar direto — entra em conflito com o regen dos ataques."

**Diagnóstico:** a poção era **regen-over-time** (`manaBuff`: 8 mp/s × 10s = 80 MP via `tickPlayerRegen`).
O gotejamento não acompanhava o gasto de mana em combate (tiro básico 4 / magia 45-60) **e** o cliente
**travava a re-bebida por 10s** (`eatBestFood`: "Regen de mana ainda ativa — aguarde acabar"). Esse era o atrito.
Não há "regen no ataque" separado no server — o conflito é gasto-em-combate vs. gotejamento + trava.

**Mudança (server-autoritativa, espelha o HP):** poção restaura **80 MP na hora**.
- `server.js`: `POTION_MP.manaheal` 50→**80** (o 50 era só flag; o buff entregava 80); o consumo aplica
  `manaheal` direto em `p.mp` (cap `maxMp`) + `broadcastPstatsAll`; **removido** o tick de `manaBuff` em
  `tickPlayerRegen`. Payload do consume agora manda `manaHealed`.
- `play.html`: handler de `invUpdate.consume` aplica `manaHealed` na hora (+float/log "+80 MP"); `eatBestFood`
  sem a trava de 10s; tooltip "Restaura 80 MP na hora"; **removido o andaime morto** do `manaBuff`
  (declaração, `tickRegen`+chamada no loop, `manaBuffActive`, ícone ⚗, clear de status). 12 edições / 2 arquivos.

**Verificação:** `node --check` server OK + parse do JS inline do play.html OK + grep **zero** referência
solta a `manaBuff/tickRegen/manaBuffActive`. **Static só — behavioral é in-game do dono** (toca server).

**⏳ Deploy:** toca `server/**` → exige `/manutenção`. Validar in-game: MP baixo → beber → **sobe na hora**;
beber 2× seguidas **sem trava**; tooltip "Restaura 80 MP na hora". Balance: o **80** é tunável (1 linha em
`server.js`:598 + `play.html`:3816; mantido = total que a poção já entregava).

---

## 🪄 Sessão 05/06/2026 (noite) — REWORK DE MAGOS (Fases 1 + 2a + 2b) ✅ TODO DEPLOYADO

> Estado completo + commits + gotchas na memória `project_valadares.md` (status do topo). Resumo:

**Problema (dono):** caster não escalava — EXORI/Fireball ~35 @Magia80 vs espada ~55-70 grátis que crita.
3 causas: base da magia congelada (8-12 pra sempre vs arma 3→30), magia não critava, magia pulava
`applyAttackMults`. **Design fechado com o dono** (doc `docs/design-magos.md`): wand OBRIGATÓRIA + tiro
básico spammável + magia crita+talentos + +2 AoE novas + elemental MÉDIO (fraqueza só em mobs icônicos)
+ HÍBRIDO (elemento fixo por magia, wand dá afinidade +20%).

**Deployado (em ordem):**
- `a55e8bd` **Fase 1** — classe `kind:'wand'` (skill Magia, 2h, ranged, 6 tiers base6→30) cliente+server;
  tiro básico no `doAttack` (escala wand.base+Magia/3, crita, applyAttackMults); gate (magia de ataque
  exige wand, cliente+server); magia soma wandBase+crit+mults; cap server wand-aware (×6 spell, melee
  via weaponSkillOf→Magia); wands na loja. Validado E2E local + via /manutencao.
- `1840da2` **fix UI equipar** (client-only) — wand caía em "Outros"/não equipava: faltava em
  `ITEM_CATEGORIES` 'Armas' + lista de equipáveis (~play.html:10266).
- `8040c19` **fix projétil PvP/007** (client-only) — `pvpAttackPlayer` não tinha `projectiles.push`
  (dano+alcance já ok); add projétil pra wand/arco vs player.
- `da8e229` **Fase 2a elemental** (client-only) — `MOB_ELEM` (Drake fraco gelo/resiste fogo, Golem fraco
  raio, Esqueleto/Aranha/Cobra fracos fogo, Sombra/Carrasco fracos raio) + `elementalMult` (afinidade
  ×1.2 × fraqueza ×1.5/resist ×0.5) aplicado no tiro básico + magias; elemento fixo (FIREBALL/EXORI=fire,
  RAIO=energy); tooltip de fraqueza na Battle List (`mobWeaknessIcons`, lê `e.ref.type`).
- `7618316` **Fase 2b-mana** (server) — tiro básico custa **4 mana** (`WAND_MANA_COST`, descontado no
  `attackMob` quando `!spellWin` + arma é wand; magias pagam no spellCast) + conserta a UI das "flechas"
  (hasRanged/tooltip excluem wand → "✦ 4 mana/tiro").
- `0464882` **Fase 2b-status** (server) — ❄️ congelar (gelo, mob ×1.8 lento 3s) + ⚡ choque (raio, mob
  pula o turno 0.7s) no `tickAI`; 22% chance/hit (`elementStatusRoll`); boss(`unique`)=IMUNE; aplica
  `m.frozenUntil`/`m.shockedUntil` no attackMob; glifo ❄/⚡ reusa o pipeline de DoT (`glyphMap`/sync/
  `mobsSignature`). 2b (mana+status) DEPLOYADO SEM /manutencao (dono "pode subir, sai do jogo" +
  precedente 03/06; Vercel confirmado por curl, Railway zero-downtime sem gap).

**⚠️ Confirmação do SERVER pendente:** não testei behavioral em prod (sem creds; testmago é só local).
Dono confirma in-game: atacar c/ wand = −4 mana; wand de gelo/raio = glifo ❄/⚡; boss imune.

**Lições do harness de teste (recorrentes):**
1. **Testar o CAMINHO DE UI, não só a função** — 2 bugs (equipar via clique; tooltip `e.type` vs
   `e.ref.type`) passaram porque o teste E2E chamava a função direto via eval (bypass da UI). Kind novo
   precisa entrar em TODAS as listas de UI (categoria + equipável + sprite dispatch + glifo), não só em
   SLOT_OF_KIND/ITEMS/WEAPON_SKILL.
2. **Movimento por-eval sofre snap-back** do server (pos autoritativa) → fazer walk+ação num ÚNICO eval
   async atômico (sem janela pro snap-back). Eval async muito longo às vezes estoura o timeout de 30s
   (game loop ocupada, 500+ mobs) → manter curto (sleeps ~370ms, poucos passos).
3. **Harness local:** `node server/server.js` :8080 com `ADMIN_NAME=...,testmago` + preview python/npx
   :3333; login `CLIENT_VERSION='1.0.10'` bare + `tryLogin(true)`; sair da PZ por oeste-2-depois-norte
   (a coluna central tem NPCs altar/domador). Status server → reiniciar o WS (cliente só precisa reload).

---

## 🪄 Sessão 05/06/2026 (continuação) — REWORK DE MAGOS Fase 3 ✅ FEITA (verificada local, NÃO deployada)

**Fecha o rework.** Tudo em paridade cliente (`play.html`) + server (`server/server.js`), commit pendente.

- **2 AoE novas** (ramo `sp.aoeRange` do `castSpell` já era genérico → só plugar na tabela):
  - **Nova Glacial** ❄️ (ice, raio 3, 13 dano, 45 mana, cd 4.5s) — **congela GARANTIDO** (slow 3s)
    via `statusChance:1.0`; boss imune (`!m.unique`). Novo helper `aoeStatusRoll(sp)` (statusChance
    da magia manda; senão cai no default do elemento). Reusa o freeze que já existe da Fase 2b.
  - **Tempestade** ⚡ (energy, raio 4, 20 dano, 60 mana, cd 8s) — nuke puro (`statusChance:0`).
  - Espelhadas no `SPELLS_META` do server (`GLACIAL`/`TEMPESTADE`, range=aoeRange autoriza o
    attackMob via `_spellWindow`). Aparecem sozinhas no Altar (switchCost 600/1200). Cap ×6
    wand-aware já comporta sem clipar.
- **Receitas de craft de wand** (cliente + server `RECIPES`, **index-sincronizado** — conferido com
  diff, 32 entradas idênticas): Cajado de Fogo `{ESCAMA:4,GARRA:2,OSSO:6}`, Cajado de Gelo
  `{SILK:8,ASA_MORCEGO:4,OSSO:6}` (seda gélida — não há mob de gelo, decisão do dono), Cajado de Raio
  `{PEDRA_GOLEM:4,CHIFRE:2,OSSO:6}`, **Cajado Eterno ★★** `{CAJADO_RUNICO:1,CORACAO_HL:3,ESCAMA:5,
  PEDRA_GOLEM:5}` (espelha ESPADA_HL — fecha o gap do endgame que não tinha fonte). **Loja mantida**
  (decisão do dono: craft + loja = mat-sink E gold-sink).

**Verificação local (server :8080 + preview :3333, testmago admin Magia 80):**
- ✅ Sintaxe (server `node --check`; JS inline do play.html via `vm.Script`). RECIPES index-sync (diff). Chaves SPELLS_META batem.
- ✅ Runtime: `aoeStatusRoll(GLACIAL)`→`[{freeze}]`, `(TEMPESTADE)`→undefined. Console limpo.
- ✅ Altar renderiza as 2 magias (stats/cor/custo); Bancada renderiza as 4 receitas (mats/custo). Screenshots.
- ✅ Server reconhece as 2 magias: `spellCast GLACIAL` desconta 45 mana, `TEMPESTADE` 60; controle (magia fake) desconta 0. Wand-gate OK (Cajado de Gelo equipado).

**⚠️ Gotcha do harness (confirmado):** o browser do preview roda em **Electron** (UA `Electron/41.6.1`)
→ o server aplica o gate de versão do app desktop e bloqueia `app=v?` (CLIENT_VERSION null). **Bypass:
setar `CLIENT_VERSION='1.0.10'` ANTES de `tryLogin(true)`** (a memória `reference_valadares_local_test`
já dizia; agora com causa-raiz no log: `[auth] electron desatualizado bloqueado`).

**NÃO testado in-game (deferido ao dono — infra inalterada + provada):** freeze aplicado num mob vivo
(precisa combate fora da PZ; pipeline da Fase 2b inalterado) e craft consumindo mats→entregando wand
(sem `/give` admin; `invCraft` é código inalterado + índice verificado).

**✅ DEPLOYADO + VALIDADO IN-GAME (05/06, `67ff4b6`):** dono rodou `/manutencao 5` → monitorei
`/api/status` até `maintenance:true` (countdown desloga todos = sem fantasma, anti-30/05) → re-confirmei
e pushei na janela do lock. Vercel (cliente novo, grep `Nova Glacial`/`aoeStatusRoll`) + Railway (boot
novo `maintenance:false` ~1.5min, zero-downtime) confirmados por curl. **Dono testou tudo in-game:
"funcionando, ficou BEM FORTE".** Decisão: **deixar rodar forte** (mago saiu de inviável→forte; nerf só
se desequilibrar vs melee — knobs em `design-magos.md` / memória). Rework de magos (Fases 1→3) FECHADO.

---

## 🗡️ Sessão 05/06/2026 — Fix de combate: EXORI (ordem do spellCast) + targeting PvP (estilo Tibia)

Retomada "valadares". Antes, o dono mandou um clipe (REC) do gameplay; identifiquei spam visual do
"Esquivou!" (empilha 2-3 em enxame) + que o "O Senhor de Valadares ★★" é o mega boss SENHOR_VALADARES
(18000 HP, server.js:563), não título. Depois o dono reportou 3 sintomas de combate: (1) EXORI não
pegava mob mais longe, (2) PvP ligado não dava dano em mob, (3) mobs "param na tela". Revisão a fundo
(server+cliente) → **2 bugs reais, o 3º consequência. Tudo client-only (`play.html`).**

**#1 EXORI (ordem de mensagem):** o `spellCast` (que abre `_spellWindow` no server, autorizando o
range 3 do AoE — server.js:6567/7062) era enviado DEPOIS do burst de `attackMob` (via `gainMagiaXp` no
fim do bloco AoE). WS processa em ordem → os `attackMob` chegavam com a janela FECHADA → server caía no
range da ARMA (1) → rejeitava todo mob além de 1 tile. Cooldown do EXORI (4s) > janela (1s) ⟹ TODA
investida falhava (só o anel colado). FIREBALL/RAIO já mandavam o spellCast ANTES (10997 antes do 11004)
— o AoE estava invertido. Fix: coleta alvos → `spellCast` 1º → burst de `attackMob` depois.

**#2 targeting PvP (decisão do dono, estilo Tibia Secure Mode):** o auto-mira dava score (dist−15) pra
player inimigo (targetNearest:10617 + loop auto-engage:14106) → grudava em qualquer player/bot visível
(o **007**/ClaudeBot reproduzia) e ignorava mob. Regra nova: player só é alvo se **PvP ligado E dentro
do range de ataque** (`cheb ≤ wRange`); fora do range não é alvo (sem perseguir); dentro, prioridade
igual a mob (sem o −15). Pesquisei o Tibia (Secure Mode / white skull) pra fundamentar. **Nota:** clicar
player longe não persegue mais (pela regra). White-skull auto-flag ("atacar liga meu PvP") ficou OPCIONAL
(recomendei manter o toggle P explícito — auto-flag arrisca flagar sem querer, ex.: EXORI pega aliado).

**#3 "mobs param na tela":** consequência — mob não morria (#1/#2) → enxame acumulava → no tickAI o mob
só anda pra tile livre (server.js:2225); enxame denso = body-block → parados. Sumiu com #1/#2.

**Validação:** vm.Script 0 erros; boot do cliente no browser 0 erros de console. Tentei o harness local
mas tropecei (usei `window.CLIENT_VERSION` em vez do `CLIENT_VERSION` bare + cliquei ENTRAR em vez de
`tryLogin(true)` → version-gate bloqueou; e o screenshot do preview deu timeout) → caí na validação
IN-GAME do dono, que cobre melhor o #2 (precisa de 2º player PvP = o 007). [harness local É viável — ver
memória reference-valadares-local-test.] **DEPLOY `d1f7c48`** (client-only, +26/−8 em play.html) → Vercel
confirmado no ar (~8s, `aoeTargets` na prod). **Dono validou in-game (PvP ATIVO + /manutencao + 007 via
/spawn007): "deu tudo certo"** — 007 longe = bate em mob; 007 perto = vira alvo; EXORI raio inteiro;
Esqueleto danificável durante o PvP. ✅

**✅ LOTE DEPLOYADO via /manutencao (05/06) — push `dccbe71` no instante `maintenance:true` (fast-forward `d1f7c48..dccbe71`, git local==origin).** 4 fixes,
validados por vm.Script/node --check; **cliente CONFIRMADO no ar no Vercel** (grep `bumpDodgeFloat`/`_sessionReplaced`/`enablePvpWhiteSkull` no play.html da prod); server pushado + reachable estável:
- **🟢 "Esquivou! ×N" (`c020cac`, cliente):** o float de esquiva empilhava numa parede verde com esquiva alta +
  enxame; agora `bumpDodgeFloat()` mescla num único contador (renova enquanto esquiva) + throttle 120ms no som.
  Provado no preview (5 esquivas → 1 float "×5"; pós-expirar cria novo).
- **🛑 Anti-loop de sessão (`52b084e`, cliente):** o cliente reconectava em QUALQUER queda, inclusive no close
  `4031` "session-replaced" → duas sessões da MESMA conta se derrubavam em LOOP infinito (sintoma do dono:
  Conectando→Autenticado→Desconectado repetindo, em qualquer mapa, com 1 só player logado). Agora o `onclose`
  detecta 4031 (ou o aviso serverMsg, backup p/ proxy trocar o código) e PARA de reconectar. Workaround
  imediato pré-deploy: fechar TODAS as instâncias + reabrir UMA.
- **🛡️ Teto anti-enxame (server `tickAI`):** fix do "morri cercado" (pendente do 31/05). Os 2 combinados:
  (1) máx de atacantes que ACERTAM por janela de cooldown (`SWARM_MAX_ATTACKERS`=4) + (2) teto de dano/s como
  % do HP máx (`SWARM_DMG_PCT_PER_SEC`=0.30), ambos env-tunáveis. Hit absorvido vira 0 (sem mobHit; evita "-0").
  Atacante único / boss raramente bate no cap (1 < K e 1 hit < 30%/s).
- **🏴 White-skull (cliente):** atacar DIRETO (clicar/mirar) um player com PvP ligado liga o TEU PvP
  automaticamente (`enablePvpWhiteSkull`, mesmo gate de ouro do toggle); AoE/EXORI NÃO liga (só acerta mob).
  Relaxei o gate `if(player.pvp)` do clique-em-player (senão mirar inimigo com PvP off era impossível e o
  white-skull ficava inalcançável). Alvo segue precisando de PvP on (consensual preservado).

**Deploy:** ✅ feito via /manutencao (dono disparou ~1min; monitor de `/api/status` pushou na trava; git local==origin).
Cliente no ar (Vercel, confirmado por grep). **⚠️ FALTA VALIDAR IN-GAME na próxima** — dono deu confirmação LEVE
("acredito que deu tudo certo"), sem teste cercado de verdade. Conferir: (1) **teto do enxame** (server) — ficar
cercado NÃO deleta (máx 4 batem + 30%/s do HP); (2) **white-skull** — clicar player com PvP off liga teu PvP e
ataca, AoE não liga; (3) **Esquivou! ×N** sem parede; (4) **loop de sessão** sumiu (abrir 2 janelas → a 2ª para).

**Pendências (fora do lote):** M7 fase 2 (3v3 + ladder), pwHash legacy removal, bot de arena turbinado.

---

## ⚔ Sessão 04/06/2026 — M7 Arena PvP 1v1 (matchmaking) + Lote 1b (quest server-auth) + pwHash dual-format

Retomada "valadares" → "fazer as coisas do M7". Escopo travado com o dono (AskUserQuestion): **1v1 núcleo**
(fila+matchmaking+instância+rating+countdown), **aposta de gold OPCIONAL** (vencedor leva o pote), e **+ os 2
itens de segurança adiados** (Lote 1b + pwHash). 3v3 e recompensa cosmética semanal ficam pra **fase 2 do M7**.

**Descoberta que barateou tudo:** o duelo 1v1 consensual (`/duelo`) já existia inteiro. E a arena vira
**instância reusando a máquina de masmorra** — `enterDungeonClient` força `player.pvp=true` (cliente) + o
handler de dungeon força `p.pvp=true` (server) → combate, isolamento (broadcast por floor), teleporte e
colisão **já funcionam** num floor único por partida. Só faltou a camada de fila/match/rating + UI.

**A — Arena 1v1 (server `server.js` + cliente `play.html`):**
- Estado: `arenaQueue`/`arenaMatches`/`arenaFloorSeq` (floor 9000+ por match, isolado), `ARENA_NPC` (50,54 —
  borda inferior da PZ, livre de outros NPCs), `genArenaGrid` (sala 13×9 no shape de `genDungeonGrid`).
- Ciclo: `arenaJoin {wager}` (valida adjacência ao NPC + gold) → `tickArena` (2s) casa 2 com **wager igual** →
  `startArenaMatch` (escrow estilo `startDuel`, grid registrado em `dungeonFloors`, teleporta os 2 curados/PvP
  forçado/DoTs limpos via `enterArenaFloor`) → `arenaCountdown` (3s; `pvpAttack` bloqueia hit antes do `fightAt`
  e só aceita o oponente) → morte (ramo de arena em `processPkDeathServerSide`) ou forfeit/timeout →
  `endArenaMatch` (pote 2×/refund + **Elo K=32 piso 100** `arenaRating`/`arenaWins`/`arenaLosses` — auto-persiste
  no `rankings`/`state.json` + `returnFromArena` ao lugar de origem + cura). Abandono (close) e guards
  `if(p.arena)return` nos handlers de escada.
- Cliente: NPC "Mestre da Arena" + modal `#arenaModal` (rating/W-L, input de aposta, entrar/sair) + overlay de
  countdown "⚔ vs NOME → LUTE!" + handlers `arenaStats/arenaQueued/arenaCancel/arenaCountdown/arenaEnd`. Branch
  `msg.arena` no `enterDungeonClient` (chrome próprio, sem escada). **Guards de morte sem penalidade**
  (`player._arena`) no `pstats`/`playerDie`/`pkDeathBy` — server resolve via `arenaEnd` (sem perda de 15% skill).

**B — Lote 1b (quest progress server-autoritativo, `server.js` + `play.html`):**
Antes a contagem de kills/visitas era client-trusted (F12 forjava `progress`/`_kills`/`_visited` e reivindicava
sem fazer). Agora: `creditQuestKill` nos **2** caminhos de morte (attackMob melee/magia + handleMobDeath/DoT) +
`creditQuestVisit` no handler `pos` (coords das visitas cr1=18,18 / vh3=78,18 adicionadas ao server). Validação
no `questTurnIn` (mob: `progress>=count`; visit: `_visited`). `saveUpload` para de confiar no `progress` de mob
do cliente (server-owned, quest nova entra em 0). Cliente: handler `questProgress` (aplica valor absoluto do
server por cima do otimista local). **Caveat (aceito pelo dono):** quest de mob/visita **em andamento no deploy
reconta do zero** — item-quest não afeta (deriva do inventário).

**C — pwHash djb2→SHA-256 (dual-format, `server.js` + `play.html`):**
O `clientHash` é opaco pro server (faz scrypt por cima). O cliente agora manda **`pwHash`=SHA-256 forte** +
**`pwHashLegacy`=djb2**. `verifyAccount(name, hash, legacy)`: tenta o forte; se falhar e vier o legado, valida
pelo legado e **re-deriva o stored a partir do SHA-256** (migração transparente, sem fricção). Cliente ANTIGO
(só djb2 em `pwHash`, sem legacy) **segue funcionando** (casa direto). `reset.html` fica em djb2 de propósito
(o login migra; mudar arriscaria lockout). `admin.html` usa token, não muda.

**Testes (harnesses isolados `server/_test_*.js`, ignorados pelo git):** sobem o server num tempdir + WS cru.
- `_test_pwhash.js` **7/7**: conta nova SHA-256, re-login, senha errada, conta legada migra, pós-migração só
  SHA-256, backward-compat (cliente antigo djb2). **Sem lockout.**
- `_test_arena.js` **10/10**: auth dos 2, matchmaking (wager igual), countdown + oponente certo, teleporte
  `dungeonEnter arena:true`, forfeit→vencedor+Elo mudou+retorno `dungeonExit`.
- `_test_lote1b.js` **3/3**: `progress` forjado via saveUpload → turn-in **rejeitado `not_done`** (exploit fechado).
- `node --check` em todos + JS inline do play.html/reset.html sem erro. **Preview**: play.html carrega sem erro de
  console, `hashPwSha256` funciona no browser (s256: estável), modal+overlay da arena renderizam (screenshots ok).

**✅ DEPLOYADO — CONFIRMADO NO AR (04/06, via curl+git):** `main`==`origin/main` (após `fetch`); server
`ws.valadares.app.br` `/health` ok + `maintenance:false`; cliente `valadares.app.br/jogar` serve o código novo
(`Mestre da Arena`/`arenaModal`/`arenaJoin`/`hashPwSha256`) → Railway+Vercel auto-deployaram (a frase "não
deployado" abaixo era snapshot de meio-de-sessão, antes do push). Deploy 1 = `1efd23a` via `/manutencao`.

**🐛 2 HOTFIXES pegos NO TESTE IN-GAME (e por isso valeu testar ao vivo):**
1. **`5516b76` (server, 2º `/manutencao`) — mob de masmorra spawnando na arena:** o tick `spawnDungeonMobs` (8s)
   coletava TODOS os floors≥1 com players → incluía o floor 9001 da arena → spawnava SOMBRA/CARRASCO escalados
   por `1.6^9000` (~1,2M HP / dano 60k) que one-shotavam os lutadores. Fix: `spawnDungeonMobs` trata SÓ floors
   `1..DUNGEON_MAX_FLOOR` (`isDungeonFloor`) nas 3 varreduras. Harness ganhou regressão (match >8s → 0 mob → **12/12**).
2. **`3afd7ba` (cliente, Vercel SEM `/manutencao`) — "Não pode PvP na PZ" travava o ataque na arena:** em
   `pvpAttackPlayer` o `playerInSafeZone()` é floor-gated mas o 2º termo `inSafeZone(tgt.x,tgt.y)` era CRU — e a
   região da arena (44-56×46-54) se sobrepõe às coords da PZ (46-54) → bloqueava. Fix: gate por floor (só PZ no
   floor 0). **LIÇÃO: instância que sobrepõe coords da PZ + `inSafeZone` cru = ação bloqueada na instância; sempre floor-gatear.**

**✅ VALIDADO IN-GAME (04/06):** dono logou (migração pwHash OK — está jogando na conta dele), entrou na fila da
arena, casou e **venceu o bot várias vezes** — caminho MORTE-POR-COMBATE (`processPkDeathServerSide`→arena→
`endArenaMatch`, que o harness só cobria via forfeit) CONFIRMADO + rating atualizado + retorno à cidade. Também
validei buff de conta de teste via painel admin ao vivo (`/setskills ClaudeBot 80` — exigiu o bot mandar 1
`saveUpload` p/ criar `acc.save`, senão o `/setskills` diz "conta não existe"). **Conta de teste `ClaudeBot`
ficou na prod** (skill 80, rating arena ~969, só derrotas) — inofensiva; dono pode `/deluser ClaudeBot` quando quiser.

**⏳ PENDENTE:** spot-check opcional de 1 quest de mob in-game (contagem server-side; já 3/3 no harness). **M7 fase
2: 3v3 (party) + recompensa cosmética semanal (ladder do `arenaRating` no rollover).** `pwHash` legacy pode sair
em ~semanas (após todos migrarem). **Bot de arena turbinado (arma + IA esperta)** = pedido em aberto pra dar
luta de verdade (hoje é punho puro, dano capado em 100 — vira só tanque ao buffar skill).

---

## 🩹 Sessão 03/06/2026 (cont. 2) — FIX do LOOP DE MORTE (`bc59235`) + validação do deploy de segurança + `/setskills`

Retomada "valadares". 1º reconciliei o estado: a maratona de segurança 03/06 já estava 100%
commitada/pushada/no ar (os 3 sensíveis viraram `88c6ddb`; a memória dizia "não commitado" —
corrigida). **Validação remota não-destrutiva do deploy** (probes WS, sem ghost session): portão
de auth do Lote 0 ATIVO em prod (join sem auth ignorado — teste diferencial baseline×join: zero
diferença); `/health`=200, `/api/status` maintenance:false, `/api/admin/state` com token falso →
401. (Os internos do `88c6ddb` — rate-limit/scrypt/ts — não têm sinal externo seguro; descansam
nos testes locais + validação in-game.)

**🐛 BUG reportado pelo dono (loop de morte na M4):** AFK farmando na masmorra, "morria, aparecia
cheio, tentava sair e morria de novo", drenando skill. **Causa-raiz (cravada no código):** a morte
PvE deixava `hp=0` no SERVIDOR. O respawn era 100% client-side — o cliente seta hp cheio LOCAL +
manda `pos`, mas o handler de `pos` IGNORA hp pelo lockdown N3 (server.js:5412), e
`tickPlayerRegen` pula `hp<=0` (4148). Logo: cliente="cheio" × servidor="morto" (0). A cada
`broadcastPstatsAll`(hp=0) o cliente re-disparava `playerDie()` (play.html:5844) = loop perdendo
**15% skill/ciclo** (play.html:4379). Player ativo escapa (poção/heal/relog cura o 0); AFK/auto-farm
não → loop. `returnPlayerToTown` também não restaurava HP. Gatilho provável: AFK na M4 recolocado
pela reconexão do redeploy `88c6ddb`.

**FIX (`bc59235`, server-only):** helper `respawnPlayerServer(p,id)` — zera `p.dots` + `hp/mp`
cheios + (masmorra→cidade via `returnPlayerToTown`) + `broadcastPstatsAll`. Chamado nos 2 sites de
morte PvE: `tickAI` (~2281) e `tickPlayerDots` (~4316), com o `pstats(0)` saindo ANTES (cliente vê
a morte/penalidade UMA vez, depois o servidor ressuscita → nada de loop). **Segunda Chance intacto**
(checado no `if (trySecondChance)` ANTES; o helper só roda no `else`/cooldown). **+ novo
`/setskills NOME N`** (admin): o `/skill` só edita o próprio char; este seta as 7 skills de OUTRO
player (online/offline). Usado `chucknorris→70` (compensação da perda no loop).

**DEPLOY sem /manutencao** (dono OFFLINE): probe de presença WS confirmou **0 players online** →
push direto seguro (a regra "nunca pushar server/** com player online" cumprida por VERIFICAÇÃO,
não pela /manutencao). Monitor de `/health` pegou o GAP (`000` às 18:30:25 = swap do Railway) +
estável `200` ~3min = boot limpo. **VALIDADO IN-GAME pelo dono:** morreu 1×, respawnou na cidade
INTACTO, sem loop; HP 760/760 estável confirmado por probe ao vivo (1 evento, zero oscilação). ✅

**Follow-up anotado:** PvP (`processPkDeathServerSide`) tem o MESMO gap (server hp=0 pós-morte) mas
risco BAIXO (respawna na PZ, sem mob/pvp pra re-cutucar o loop) → aplicar o mesmo respawn lá numa
próxima (cuidado com o fluxo de espectador). **LIÇÃO:** o lockdown de hp no `pos` (sem restore
server-side correspondente no respawn) deixou a morte PvE com hp=0 PERMANENTE no servidor — o
respawn era client-faked. Só validação IN-GAME pega esse tipo de desync.

---

## 🔒 Sessão 03/06/2026 (cont.) — Sensíveis da auditoria: 3 server-only FEITOS, 2 ADIADOS pelo dono

Retomada dos 4 itens "sensíveis/cross-file" que sobraram da auditoria (`docs/AUDITORIA_2026-06-03.md`).
**Feitos os 3 server-only** (testados local, no working tree, **NÃO commitados/deployados**); **2 cross-cliente
ADIADOS pelo dono** (resíduo Baixo). Diff: só `server/server.js` (+152/-42) → 1× /manutencao quando for subir.

**✅ Pagamento #3 — frescor de `ts` (`validateMpSignature`):** checagem de `|agora - ts|` DEPOIS do HMAC passar
(o ts é autêntico = parte do manifest). **Conservador** (a idempotência durável `markPaymentCredited` segue a
proteção real; isto é defesa-extra): normaliza unidade (`<1e12` = segundos→×1000; senão já ms), só aplica em
epoch plausível (1.5e12..5e12), janela `MP_TS_TOLERANCE_MS` default **15min** tunável, **fail-OPEN** em ts
inparseável/implausível. MP assina cada entrega → retry legítimo ganha ts novo, nunca é barrado. Testado: 9
casos de unidade (seg/ms frescos=ok, seg/ms 20min=stale, 10min=ok, micro/lixo/vazio=fail-open).

**✅ Resto do Lote 3 #8 — rate-limit global de msg:** token bucket por conexão no topo do `ws.on('message')`,
após o `ping` (isento p/ não matar heartbeat). `MSG_BUCKET_CAP=80` (burst) / `MSG_BUCKET_REFILL=40`/s (sustentado)
/ `MSG_FLOOD_DISCONNECT=400`, todos tunáveis por env. **Descarta** o excedente (cliente reconcilia via updates
autoritativos) e só **fecha o socket** em flood SUSTENTADO (o contador de drops só acumula quando o bucket fica
< meio cheio → pico legítimo não acumula rumo ao disconnect). + throttle do BROADCAST de `pvp` (300ms) — era o
pior fan-out (global por mensagem); o ESTADO segue atualizado, só o re-broadcast é limitado. NÃO toquei
float/attackVfx/playerSync/invEquip (o bucket global cobre; throttle neles arriscaria dropar cosmético de AoE).
Calibrado em simulação: 15/s e 30/s (combate real) = **0 drops**; 45/s = só dropa o excedente; 1000/s = dropa +
desconecta ~5s; burst 80/s sobrevive a pico curto.

**✅ Resto do Lote 3 #7 — scrypt async no auth:** `crypto.scrypt` (async) em vez de `scryptSync` (bloqueava
~15ms o event loop de TODOS por login). Helpers `scryptAsync`/`hashPwScryptAsync`/`verifyPwHashAsync`;
`createAccount`/`verifyAccount` viraram **async** (chamados só no ramo `auth`, confirmado por grep). Paths raros
seguem sync: reset HTTP (server.js:174) e rehash legado→scrypt. Ramo `auth` refatorado: guard `p._authPending`
(1 scrypt por socket por vez), conclusão (matar-sessão + authOk) no callback `.then`; `.catch`→`authFail
server_error`; `finishAuth` checa `ws.readyState` (socket pode fechar durante o scrypt). Matar-sessão-dupla e
trava anti-wipe preservados intactos. Testado E2E: harness isolado bootou o server em temp dir + WS cru → **4/4
PASS** (conta nova authOk isNew=true / login correto isNew=false / senha errada authFail bad_password / 2ª conta).

`node --check` ✓ após cada lote. **NÃO commitado** (aguarda o dono) — regra de deploy intocada: nunca pushar
server/** com player online; entra num único /manutencao + logout limpo.

**⏸️ ADIADOS pelo dono (resíduo Baixo, cross-cliente, fazer junto com M7):**
- **Lote 1b** (quests mob/visit server-auth): toca cliente (questAccept + render de progresso) e quest em
  andamento recontaria do zero no deploy. O re-claim INFINITO já morreu no Lote 1 — sobra só claim 1×/quest.
- **pwHash djb2→SHA-256**: Baixo (só pesa se accounts.json vazar; scrypt+rate-limit cobrem o online). Reset
  forçado inviável (conta sem email trancaria) → só **dual-format** serviria. Adiado.

---

## 🧹 Sessão 03/06/2026 — Resíduo da remoção do offline (fecha o que o 01/06 deixou)

Dono pediu pra "remover o offline". **Verificação primeiro** (pedido dele: "verifica se já não fizemos isso") —
e de fato **já tinha sido feito** na sessão 01/06 (`3456f36`+`1d924ca`, offline INTEIRO, deployado e testado
in-game). Sobrou só **cauda de código morto** que aquele lote neutralizou mas não arrancou:

- **`damagePlayer`** (~34 linhas) — dano client-side com dodge/crit/defesa/morte. Único chamador era a AI de
  mob local, removida em `1d924ca` → **zero referências** no repo (só sobra menção em comentário no server.js).
  Removida. (Escapou do 01/06 pq não é "símbolo de mob" — o grep de verificação de lá não pegava.)
- **Log enganoso** no `catch` de `connectMP`: "Servidor offline. Jogando sem multiplayer." → "Não foi possível
  conectar ao servidor" (não existe mais jogo sem server).
- **Comentários defasados** (melee/train/pickup) que diziam "offline aplica local" — hoje só o server é
  autoritativo (o cálculo local é só float/log/FX). `gainSkillXpLocal` mantido no-op de propósito (call sites).

**Client-only (Vercel).** JS inline compila (0 erros). PR #4 squash-merged em `main` (`8a2d592`), build verde.
Sem `server/**` → sem reconexão/`/manutencao`. ROADMAP atualizado (P0.6: offline+protocolo ✅ FECHADOS).

---

## 🐛 Sessão 02/06/2026 — RESPEC recalcula do ZERO (subtração deixava resíduo do bug de inflação)

Dono (manhã, pós-deploy do `fab98ca` + 1 respec): "respec não resetou tudo" — Crítico/Esquiva ainda em **50/50**.
Causa: o respec **SUBTRAÍA** `rank×buff`, mas o permaBuffs vinha **INFLADO** pelo rank-colapso (acima do que os
ranks justificavam) → sobrava resíduo, e re-alocar somou por cima. **Fix:** o respec agora **RECALCULA o
permaBuffs do ZERO** — zera os talentos e reconstrói SÓ as **auras de quest** (não-talento): `xpBonus` via flag
`flag_vendedor_killed`; `dodgeBonus` via posse do item `AURA_VIDENTE`. Crit/Esquiva voltam ao base (talento=0).
Server-only → /manutencao. **Dono respeca de novo pós-deploy** (claude é char de teste, sem problema). Vale pra
todos (preserva auras de quest no respec). `node --check` ✓.

**+ ⚡ Mãos Rápidas (8º talento da Fase 2, Ofensivo)** — pedido do dono ("vel. de ataque não tem talento?").
atk speed +3%/rank (max 5 = +15%; `atkSpdBonus` no `effectiveAttackDelay`, mesma fórmula da arma/Fúria, def nos
2 lados, sanitize auto-capa). Calibrado: pior caso (forja+5 0.15 × Fúria 0.25 × talento 0.15 = **433ms**) fica
ACIMA do cap de cadência do server (**400ms**) → não desperdiça rank. Verificado no preview: 800→680ms com +15%,
aparece no painel, 14 talentos compráveis. **Sobe JUNTO com o respec fix no mesmo /manutencao.**

---

## 🐛 Sessão 01/06/2026 (cont. 8) — FIX: ranks de talento colapsavam pra 1 a cada save

Dono: "só consigo ter 1 talento no nível 5, quando escolho outro reseta." **Bug que EU introduzi na Fase 1**
(esqueci de atualizar 2 lugares que tratavam talento como boolean tem/não-tem):
- **saveUpload** (`server.js`): a cada upload do save do cliente (periódico), `p.talents[tid] = true` **COLAPSAVA o
  rank vivo pra 1** → ranquear um talento "resetava" os outros.
- **login** (re-join): mesma coisa (`= true`) ao relogar.
Colateral: rank colapsa mas permaBuffs não → pontos "voltavam" (re-rank) e o buff inflava (capado no sanitize).

**Fix (server-only):** (1) saveUpload NÃO mexe mais em talents/permaBuffs (são server-autoritativos); persiste os
VIVOS do server no lockdown (`data.talents=p.talents`, `data.permaBuffs=p.permaBuffs`). (2) login restaura o RANK
numérico (clamp `[0,max]`; legado boolean→1). Verificado: `node --check` + clamp isolado (true→1, 5→5, 99→5, undef→0).

⚠️ **server/** → /manutencao.** **Recuperação pós-deploy:** o save do dono ficou com ranks colapsados (1s) +
permaBuffs acumulado (capado, inofensivo). Depois de deployar: **dono faz RESPEC (5000g)** → refunda + re-aloca
limpo. (Slate 100% limpo: admin pode zerar talents/permaBuffs.) LIÇÃO: ao mudar a forma de um dado (boolean→rank),
varrer TODOS os pontos de persistência (alloc/save/login/sanitize), não só o handler principal.

---

## 🎨 Sessão 01/06/2026 (cont. 7) — 2 tweaks de UI (pedido do dono): banner de forja + inventário mais largo

Cliente-only (`play.html`).
1. **Banner de resultado na bancada:** o float ✨/💥 aparecia no player **ATRÁS da modal opaca** → dono não via
   sucesso/falha. Agora banner verde/vermelho no topo do `forjaPanel` (`_forgeResult`, expira 30s) + fundo do
   `#craftModal` mais transparente (0.82→**0.55**).
2. **Inventário mais largo:** `#invSidebar` 165→**200px** + qty vira **"×N"** com `flex-shrink:0` (não corta em
   item forjado de nome longo) e nome com `min-width:0` (wrap gracioso).

Verificado no preview: inv 200px, bancada rgba .55, "×7" renderiza, `renderForja` sem erro, **boot 0 erros**.

⚠️ **Estes 2 são cliente-only**, MAS os commits de talento (Fase 1+2, server) já estão **à frente e não-pushados**
→ não dá pra pushar só o cliente sem levar o server junto (Railway redeploy = risco de wipe com dono online).
Então **tudo (UI + Fase 1 + Fase 2) sobe junto no próximo `/manutencao`**.

---

## ⚜️ Sessão 01/06/2026 (cont. 6) — Talentos Fase 2: 7 talentos novos (QoL+Poder) + respec

Dono escolheu **"QoL + Poder, todos abertos"** (sem gating). Add 7 talentos (a 🕯️ **Segunda Chance**/reviver
fica pra **Fase 2b** — mexe nos caminhos de morte/loot, sensível, não atropelar). Modelo aditivo multi-rank (max 5).

**Novos (TALENT_DEFS server + TALENT_DEFS_CLIENT cliente):** 🔮 Pacto Arcano (`manaBonus` +20), 👟 Passos Leves
(`moveSpeedBonus` +4%), 🍀 Sortudo (`rareLuck` +10%), ⚔️ Golpe Pesado (`damageBonus` +4%), 💥 Precisão Mortal
(`critDmgBonus` +0.1), 🩸 Vampirismo (`lifesteal` +3%), 🛡️ Pele de Pedra (`dmgReduction` +3%).

**Hooks server:** `recomputeMaxStatsServer` (+manaBonus); `attackDamageCapServer` abre folga **POR PLAYER**
(`(1+dmgB)*(1+critB/2)`) pra não clipar Golpe/Precisão (sem talento = cap igual ao de antes); `tickAI` aplica
`dmgReduction` (teto seg. 50%); `attackMob` aplica `lifesteal` (cura % do dano, cap maxHp, broadcastPstats);
`rollLoot(mobType, luck)` boosta chance de **ITENS** (gold inalterado), threaded nos 2 call sites. Sanitize
auto-capa as keys novas (allowlist = `max×buff`).

**Hooks cliente:** `recomputeStats` (+manaBonus); `playerMoveDelay` (×(1−moveSpeedBonus)); `applyAttackMults`
(×(1+damageBonus)); helper `critMultPlayer()` (2 + critDmgBonus) nos **5 spots de crit** (melee/ranged/lança/magia/PvP).

**Respec** (server `talentRespec` + botão "↺ Redistribuir tudo (5000g)"): **SUBTRAI** a contribuição de cada
talento do permaBuffs (preserva auras de quest — sem derive do zero), zera ranks, devolve pontos, cobra 5000g.

**Verificado preview:** critMult 2.3, dano 100→120, move mais rápido, mana +60, **13 talentos compráveis**,
respec aparece/funciona; **boot 0 erros**. `node --check` server ✓; `vm.Script` cliente ✓. (Hooks de combate
— lifesteal/redução/luck/cap/respec — só testáveis **in-game**.)

⚠️ **server/** → deploy `/manutencao` + logout.** **Fase 2b:** Segunda Chance (reviver — caminhos de morte).

---

## ⚜️ Sessão 01/06/2026 (cont. 5) — Talentos MULTI-RANK (Fase 1 da expansão de endgame)

Dono aprovou a proposta de expandir os talentos (o print dele mostrou os 6 talentos single-rank **todos
maxados** + **24 pontos parados** — sem onde investir no endgame). **Fase 1:** dar RANKS aos 6 atuais
(**max 5** cada → 30 de capacidade, = os pontos atuais do dono).

**Server (`server.js`):** `TALENT_DEFS` ganha `max:5`/talento; `talentPointsUsed` SOMA os ranks (legado boolean
`true`→1 via `Number()`); `talentAlloc` valida `rank<max` + soma o buff por rank (reject `max_rank`); sanitize:
allowlist de permaBuffs agora = `max_rank × buff` (+ headroom das auras de quest: dodgeBonus +0.05 Aura do
Vidente, xpBonus +0.05 Vendedor); + clamp NOVO de `talents` (`[0,max]` inteiro, anti-forja do contador).
Modelo **ADITIVO** (permaBuffs += por rank) — sem derive/respec ainda, então **sem risco de apagar auras de quest**.

**Cliente (`play.html`):** `TALENT_DEFS_CLIENT` com `max:5`; `talentPointsUsed` soma ranks; `renderTalents` mostra
"RANK n/5" + botão "subir rank" / "✓ MÁX (5/5)"; `buyTalent` sobe até o max; log mostra o rank. Typo pré-existente
do resumo corrigido ("disponíveleis"→"disponíveis").

**Verificado no preview:** earned 18 / used 9 (t_crit 3 + dodge legado→1 + hp 5) / avail 9; render mostra RANK 3/5,
RANK 1/5 (legado boolean), ✓ MÁX (5/5), botão "subir rank"; **boot 0 erros**. `node --check` server ✓; `vm.Script` cliente ✓.

⚠️ **Mexe em `server/**` → deploy só com `/manutencao` + logout** (dono estava online). Crit/dodge seguem o teto de
segurança 50% no cálculo do stat, então ranquear não estoura. **Fase 2 (talentos NOVOS + gating + decisão PvP +
respec/derive-permaBuffs que mata a classe do vazamento) = próxima.**

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

**Follow-up 2 (mesmo dia):** dono achou que o clique "não setava mob em diagonal". Repro no preview: na real é
qualquer mob **ANDANDO** — o `canvas` click casava a pos **LÓGICA** (`m.x===tile`), mas a lógica fica 1 tile à
frente do desenho no deslize → clicar no mob em movimento errava (parado funcionava). Fix: o clique casa por
**render ARREDONDADO** (`monsters.find` + player remoto, no `click` e no `contextmenu`). `melee()` é Chebyshev,
então alcance/ataque já incluíam diagonal — era só o clique de seleção. Cliente-only.

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

## 🛟 Sessão 31/05/2026 (cont. 9) — "servidor offline" reportado por player + 2 fixes de cliente

**Contexto:** player reportou o jogo "só fica atualizando" (loop de reload), print mostrava o badge
**OFFLINE** no topo com o mundo rodando normal. Dono estava no celular → pediu pra resolver.

**Diagnóstico:**
- O **"OFFLINE"** do topo é só o badge de conexão do cliente (`#connStatus`): em SOLO, ou quando o WS cai,
  o jogo degrada pra simulação local — por isso o mundo renderiza. **Não** é o servidor caído.
- O **"só fica atualizando"** era o **auto-updater do cliente** (`checkClientUpdate`) recarregando em loop.
- **Causa real do player (confirmada pelo dono):** ele estava num **Electron desatualizado**. O gate de
  versão (`server.js`, só pra Electron via User-Agent) bloqueia app sem versão (v1.0.6-) ou < `MIN_CLIENT_VERSION`
  (padrão **1.0.7**) → manda `versionTooOld` → modal "VERSÃO DESATUALIZADA". Release publicada = **v1.0.9**.
  Player atualizou pra v1.0.9 → **resolveu**. ✔

**Fix 1 (PR #2, MERGEADO `cadc8d5`) — mata o loop de auto-reload (`play.html`):**
O `checkClientUpdate` recarregava quando o "fingerprint" do HTML mudava, mas: (1) rodava **até na tela de
login** (preso recarregando antes de entrar); (2) usava **`content-length`** como fingerprint → compressão
gzip/br varia por request/nó de CDN (Vercel) → falso positivo → reload; (3) recarregava no 1º sinal, sem
debounce. **Agora:** só checa em jogo (`started`), pula background/offline, usa só ETag/Last-Modified, e exige
a **mesma versão nova em 2 checks seguidos** antes de recarregar. Auto-update real (deploy) segue funcionando.

**Fix 2 (este commit) — detecção PROATIVA de versão no login (defesa em profundidade):**
- `server.js /api/status` agora devolve `minClientVersion` + `clientDownloadUrl`.
- `play.html`: helper `_cmpSemver` + no fetch de `/api/status` do login, se for **desktop** (`window.electronApi`)
  e `CLIENT_VERSION < minClientVersion` → abre o `showVersionTooOldModal` **já no login**, sem depender do
  bloqueio só na hora de conectar. Browser ignora (Vercel = sempre a última).
- Verificado: `node --check server` ✓; scripts inline do `play.html` ✓ (0 erros de sintaxe).

> ⚠️ Limite do ambiente: o sandbox bloqueia o host de produção (`host_not_allowed`), então não dá pra
> medir o Railway daqui. Se um player ficar OFFLINE mesmo atualizado, o próximo passo é o **log do Railway**.

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

---

## 📡 Sessão 10/06 (tarde) — lag/quedas: diagnóstico REDE (edge Railway) + fix anti-rubber-band ✅ DEPLOYADO (`1c7cd0b`)

Dono caiu várias vezes (closes 1006) + rubber-band ("demora pra sair da PZ") + seletor da
masmorra rejeitando com snap-back 83,17→52,48. Evidência: /health externo errático (0.5s→11s,
atrasos quantizados ~0.8/2s = retransmissão TCP) · ICMP estável · Google/Vercel rápidos ·
server local 4ms · **container novo vazio: loop interno 0-1ms enquanto probe externo via 11.6s**
→ 100% rota/edge Railway (CNAME direto, sem Cloudflare). Anti-wipe recusou saves vazios do
cliente dele durante as quedas (boneco intacto). Meus pushes client-only da tarde = SKIPPED
no Railway (não derrubaram ninguém).

Fix (`1c7cd0b`, push direto com 0 online + autorização do dono; monitor pelo campo `perf`):
1. **pos token bucket** — drop silencioso <40ms virava rubber-band com jitter (rajada de
   retransmissão descartada → pos não-adjacente → snap-back em cadeia). Agora: média 1/70ms,
   rajada ≤5, flood barrado com posCorrect throttled 300ms. Teleporte/speed-hack continuam
   bloqueados. Harness `_test_posburst.js` 6/6 (caminho do teste DENTRO da PZ — fora tem
   parede e dá falso reject).
2. **`perf` no /api/admin/state** — loop {last,max}, slow_ticks >100ms (via safeTick),
   mem/heap + warns no console. Próxima reclamação de lag: 1 curl separa app de rede.

**✅ VALIDADO in-game pelo dono na sequência: "andou e deu tudo certo, entrou normal na masmorra".**

---

## 🎬 Sessão 10/06 (tarde, cont.) — VÍDEO DE MARKETING produzido (item do backlog) ✅

Dono gravou 8min com o ● REC (boss das Profundezas andar 20 + Golem Rei/Drakes à noite + campos)
e autorizou produzir o marketing "com nosso programa full" (= Canva Pro). Pipeline:
ffmpeg local (folhas de contato → 5 segmentos re-encodados do source) + cartões Canva Pro
on-brand (Brand Kit kAHMAdgX2g0): abertura "VALADARES + RPG online estilo clássico — direto
no navegador" e encerramento "JOGUE GRÁTIS + valadares.app.br" (gerado→duplicado→texto trocado
via editing transaction = identidade idêntica; CTA gerado do zero saía fora de spec).
Pixel art escalada ×2 com flags=neighbor (nítida), crop centrado no player, áudio do jogo
com afades, x264 CRF18.

**Entregas (marketing/video/ + cópia em Downloads):**
- `valadares_highlight_720p.mp4` — 60.6s 1280×720 (YouTube/site/itch)
- `valadares_highlight_vertical.mp4` — 51.6s 1080×1920 (Shorts/Reels/TikTok)
- cartões PNG + segmentos webm (matéria-prima pra recortes)
Canva: abertura DAHMM6IYuEQ · encerramento DAHMM6o8oM0 (cópia editada) · vertical DAHMM_UiWq4.

**Gotchas Canva MCP:** thumbnails de candidato (design.canva.ai) são página JS — avaliar via
create-design-from-candidate→export-design→curl (--ssl-no-revoke!); gerador repete o título/
inventa elementos → regenerar com "REGRAS RÍGIDAS: ... UMA ÚNICA VEZ" ou editar cópia de design
aprovado (resize-design faz a versão vertical de graça).
**REC grava SÓ o canvas** (canvas.captureStream, play.html:13975) — UI/inventário não aparecem;
pra vídeo com interface: Game Bar (Win+Alt+R). Possível follow-up: modo "REC janela" no Electron.

**✅ Vídeos APROVADOS pelo dono ("gostei") na sequência — prontos pra postar.**
