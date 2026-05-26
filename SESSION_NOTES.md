# Sessão 25/05/2026 — Resumo

Sessão longa cobrindo balanceamento, MP autoritativo, NPCs/quests, body stays, setup pra amigos jogarem online.

---

## ✅ O que ficou pronto

### Mundo / balanceamento
- Mob **Escorpião** novo (deserto, 75hp/11dmg)
- Mobs reorganizados por bioma: **Troll** só nasce em SNOW, **Lagarto + Escorpião** só em SAND
- **Abismo do Golem** movido (60,85)→(70,90) pra equilibrar distância
- Server gera mesmo mapa do cliente (seed 42) e valida walkability ao spawnar — sem mais mob na água/árvore
- **Spawn dinâmico** repõe rings + cavernas + biomas com burst até 3 mobs/tick

### Combate / progressão
- **2H** continua igual (a discussão "2H mais lento" ficou pendente)
- **Status effects engine** (poison/stun/bleed) — Aranha aplica veneno
- **Bosses escalonam ★ Lv1→10** por respawn (HP +15%, dmg +10%, xp +20% por nível)
- **Reset diário 00:00** zera bossLevel + respawna Lv1
- **Highlander rebalanceado** (cap stack era +87% dmg, agora +42%)
  - Selos: +5%dmg, crit do 3º (+3%), spd do 4º (+5%), regen 2× só no 5º
  - HL: +10% dmg, +15% spd
  - Coração HL: +5% dmg, +3% spd, +3% def
- **Gold drops reduzidos**: bosses 60-250g (era 100-400), Caçador 40-100g (era 80-180), Drop PK 20%→10%, Hunt reward 200-450 (era 400-800)
- **Drops premium** dos bosses reduzidos (ESPADA_DRACO 50%→30%, MARTELO_GOLEM 50%→30%, CORACAO_HL 8%→5%, BOTAS_VENTO 12%→6%)

### NPCs + Quests (#6 do roadmap)
- **2 NPCs na PZ leste**: Mercador (52,49) e Atendente (52,51)
- Interação: ESPAÇO adjacente OU tecla **Q** (Atendente abre direto)
- **Shop**: 8 items à venda + vende qualquer item do inv (30% preço base)
- **5 quests iniciais** com tracker auto-atualizado em kills/pickups

### Multiplayer (#9 #10 #12 do roadmap)
- **Server autoritativo de mobs** — 146+ mobs gerados, tickAI move/ataca, snapshot 250ms
- **Combate validado** — server checa range/dano, broadcasta updates
- **Chat real** — tab CHAT funcional, broadcast WS
- **Body stays** (#8) — corpo fica 3 min após logout, atacável, dropa 10% gold + 1 item
- **Ghost duplicado** (fix): reconectar com mesmo nome remove ghost antigo
- **Persistência server-side**: `state.json` salvo 60s + SIGINT (mobs, bossLevel, bossDeath)
- **WS URL configurável** no cliente: query `?ws=...`, localStorage, ou auto-detect por hostname

### UI/UX (várias melhorias)
- **Mini-mapa** no topo da sidebar esquerda (canvas dedicado 140×140) — tirou o overlay
- **Chat panel** abaixo do canvas (não sobreposto) + altura 110px
- **Paper doll** no equipamento (3×3 grid, layout: cabeça/pescoço · arma/corpo/escudo · pés)
- **Sprites pixel art** de todos os 50+ itens via canvas off-screen
- **Sidebar direita reorganizada**: PvP / Equipamento / Bosses / [Alvo + Online split 50/50]
- **Widget Alvo** (HP bar visual + nome + AUTO badge)
- **Widget Bosses** (timer respawn + Lv ★)
- **Widget PvP** (5 caveiras visuais + estado HIGHLANDER + Hunt countdown)
- **Modal Stats** (tecla I) — mobs mortos por tipo, PvP K/D, tempo de jogo
- **Inventário** estica junto com sidebar do personagem
- **HP/MP bars** sempre visíveis sobre o boneco (HP em cima, MP embaixo, swap respeitado)
- **Modais** todos com overlay+centralização padronizado, exclusivos (abrir 1 fecha o resto)

### Fixes
- Auto-target perdido após mob morrer
- 1º target não pegando → causa raiz: **Q tinha 2 bindings** (toggle auto-attack + abrir quests). Removido o legado
- Mob nascendo na água → server agora valida walkability
- Spawn geral lento → reposição em rings+caves+biomas com burst
- Auto-walk tentado mas reprovado (boneco andava sozinho) → revertido

---

## 📌 Onde paramos

**Não conseguiu logar no Hostinger** — vai tentar amanhã.

### Próximo passo (quando logar no Hostinger):
1. Lê o **[SETUP_AMIGOS.md](SETUP_AMIGOS.md)** — passo-a-passo completo
2. Cria pasta `valadares/` em `public_html/` no File Manager do Hostinger
3. Upload do `valadares/index.html` lá
4. Testa abrir `https://seudominio.com.br/valadares/` — deve aparecer login (offline)
5. Baixa cloudflared.exe, roda `cloudflared tunnel --url http://localhost:8080`
6. Compartilha com amigos: `https://seudominio.com.br/valadares/?ws=wss://...`

### Estado salvo do mundo
- **`valadares/server/state.json`** — 153 mobs persistidos. Server carrega no startup.
- Apaga esse arquivo se quiser mundo "novo" no próximo restart.

---

## 🎯 TODO restante do ROADMAP (gameplay)

Curto prazo:
- **#1** Mais magias (AoE, Provocação, Buff)
- **#2** Skill cap (definir teto e curva final)
- **#3** 2H ataca mais devagar (equilibra 1H+escudo vs 2H)
- **#4** Crafts lendários com Coração (Espada do Highlander = 3 Corações)

Médio prazo:
- **#5** Classes (Guerreiro/Tank/Arqueiro/Mago) com 1 magia única cada
- **#11** Bônus de grupo (+20% XP perto de outro player) — único pendente do bloco MP

Polish:
- **#17** Sons / música
- **#18** Tutorial in-game
- **#19** Settings panel

### Sugestões minhas (não no ROADMAP)
- **Status effects** estender pra mais mobs (Escorpião veneno forte, Troll stun, Lagarto sangra) — engine já pronto, só plugar
- **Quest pickup** do Highlander Hunt (300-500g recompensa virou contrato real)
- **Auto-respawn de NPCs** — se morrer perto deles, ressurge na PZ
- **Multiclasse**: depois de Lv X em todas as skills, ganha "Hibrido"

---

## 🗂 Arquivos relevantes

| Arquivo | O que tem |
|---|---|
| `valadares/index.html` | Cliente completo (~6000 linhas) |
| `valadares/server/server.js` | Server WS autoritativo |
| `valadares/server/state.json` | Estado persistido (gitignored) |
| `valadares/ROADMAP.md` | Roadmap completo atualizado |
| `valadares/SETUP_AMIGOS.md` | Guia pra colocar amigos online |
| `valadares/DESIGN_PVP.md` | Detalhes do sistema PvP (não tocado hoje) |
| `.claude/launch.json` | Configuração dos 2 servers (cliente 3333 + MP 8080) |

---

## 🛌 Boa noite

Você fez muita coisa hoje. Quando voltar, abra o ROADMAP pra retomar a lista, e o SETUP_AMIGOS quando for hospedar.

Servers no preview continuam rodando (cliente em 3333, MP em 8080). State.json preserva o mundo.
