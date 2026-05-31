# Notas de Sessão

> Apenas a sessão atual. Sessões anteriores: `docs/archive/sessions-pre-may28.md`.
> Roadmap e backlog: `ROADMAP.md`. Estado completo: memória `project_valadares.md`.
> (A leva 29/05 anterior — devlog, M6 Tinturaria, M8 Auction, M4 fase 1+2 — está
> nos ✅ RESOLVIDO do ROADMAP.)

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
