# Notas de Sessão

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
