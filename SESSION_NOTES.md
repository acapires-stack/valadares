# Notas de Sessão

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
