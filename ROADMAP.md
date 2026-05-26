# Valadares — Roadmap & Linha de Pensamento

> RPG tile-based estilo Tibia rodando no browser. Single-player + multiplayer básico.
> Este arquivo é o **mapa mental** do projeto: o que existe, o que falta, e por quê.

---

## 📂 Estrutura de arquivos

```
valadares/
  index.html          ← Cliente completo (game + UI + lógica)
  server/
    server.js         ← WebSocket server (Node.js + ws)
    package.json
  README.md           ← Instruções de instalação/rodar
  ROADMAP.md          ← este arquivo
  DESIGN_PVP.md       ← design detalhado do sistema PvP
  .gitignore
```

**Como rodar:**
```bash
# Cliente (browser)
npx serve valadares -p 3333          # acesse http://localhost:3333

# Servidor MP (opcional)
cd valadares/server && npm install && npm start
# escuta em ws://localhost:8080
```

Ou, no Claude Code: ambos `valadares` e `valadares-mp` configurados em `.claude/launch.json`.

---

## ✅ O QUE JÁ EXISTE

### Mundo & Render
- Mapa procedural 100×100 com grama, terra, água, pedra, árvores
- **Bioma neve** no quadrante superior (y<32) — tiles brancos/azulados, **Trolls exclusivos** (só nascem em tiles SNOW)
- **Bioma deserto** quadrante inferior-direito (y>68, x>52) — tiles amarelo-dourados, **Lagartos + Escorpiões exclusivos** (só nascem em tiles SAND)
- **Cavernas**: 5 (Morcegos 18,80 · Antro do Minotauro 82,18 · Cripta dos Mortos 18,18 · **Covil do Drake 82,80** · **Abismo do Golem 70,90**) com tiles próprios e mobs exclusivos
- **PZ (Zona Segura)** ao redor do spawn — piso de pedra, 4 tochas, sem combate
- **Animação suave** entre tiles (player e monstros deslizam, câmera segue float)
- Tile types: GRASS, DIRT, TREE, WATER, STONE, CAVE, CAVE_WALL, **SNOW, SAND**
- **Mini-mapa** 140×140 px no topo da sidebar esquerda (canvas dedicado), fog of war, descobre ao andar, mostra mobs/players/bosses coloridos

### Personagem
- **Visual no boneco**: armadura, elmo, escudo, arma e botas aparecem desenhados
- Movimento WASD/setas com **diagonal** (custo 1.5×)
- HP/MP com regen passivo
- **Save persistente** no localStorage por nome (sessão auto-login + posição/HP/MP preservados ao deslogar — sem cheat de teleporte)
- **Logout bloqueado** se em PvP ativo (selos/highlander/hurt recente)
- 6 skills: Punho, Espada, Machado, Clava, Distância, Escudo, Magia
- Stats derivados das skills: HP máx, MP máx, defesa de escudo, **velocidade** (cap −40ms)

### Combate
- **Melee**: Espada/Machado/Clava/Adaga/Maça/Marreta etc — dano + def por arma
- **2H** bloqueia o slot do escudo
- **Lanças 1H** com range melee **3 tiles** + arremesso (F) consumindo a lança
- **Ranged** (Arco, Arco de caça, Besta) — consome flechas automaticamente
- **Magia**: 1 spell ativo por vez (compra no altar)
  - Bola de Fogo (R, 8 dmg, range 8, 20mp)
  - Cura (R, +20 HP self, 25mp, funciona na PZ)
  - Raio Místico (R, 5 dmg, range 10, 15mp, projétil tipo beam)
- **Crítico** (4% base + skill da arma) e **Esquiva** (skill Escudo)
- Damage numbers flutuantes + tingimento vermelho no boneco ao apanhar

### Inteligência dos Mobs
- **Intel 1** (Rato, Cobra, Morcego, Lagarto): chegam em fila, dumb
- **Intel 2** (Aranha, Lobo, Orc, Esqueleto, Troll, Drake, Golem, Escorpião): cercam, evitam amontoar
- **Intel 3** (Orc Líder, Minotauro, Drake Ancião, Golem Rei): flanqueiam por trás
- **Difficulty curve por região**:
  - Anel 1 (6-14): Rato, Cobra | Anel 2 (14-24): Cobra, Aranha, Rato | Anel 3 (24-36): Aranha, Lobo | Anel 4 (36+): Lobo, Orc
  - Bioma **neve**: Troll (160hp/14dmg) — só em tiles SNOW
  - Bioma **deserto**: Lagarto (55/9) + Escorpião (75/11) — só em tiles SAND
- **Caçadores** (Highlander Hunt): aggro global, perseguem pelo mapa inteiro
- Respawn dinâmico por anel (mantém população viva)
- Boss **Orc Líder** em (46,95) com 6 guardas, respawn 5 min
- Boss **Drake Ancião** no Covil do Drake (82,80), respawn 8 min
- Boss **Golem Rei** no Abismo do Golem (70,90), respawn 8 min
- **Bosses escalonam ★ Lv1→10** a cada respawn (HP +15%, dmg +10%, xp +20% por nível). Reset diário às 00:00 zera o nível.

### Itens & Inventário
- **50+ itens**: armas (1H/2H/ranged), armaduras, escudos, comidas, poções, materiais, munição
- **Novos endgame**: Espada Dracônica (base 14), Martelo do Golem (base 13), Armadura de Escamas (def 9), Escudo de Pedra (def 8), Elmo Dracônico (def 4)
- **Novos 1H**: Sabre, Adaga Dupla, Bordão de Pedra
- **Novos materiais**: Escama de Drake, Pedra do Golem, Garra de Lagarto
- **Equipamento** em 6 slots: mão dir, mão esq, corpo, cabeça, pés, **pescoço**
- **Drops** com chance específica por monstro
- **Auto-pickup** ao andar (raio 1)
- **Sidebar** mostra cada slot equipado com stats + munição quando arco
- **Inventário** scrollável em coluna própria

### DP (Depósito Pessoal) na PZ
- **4 baús independentes** (cor de fechadura por baú, sem categoria)
- **Bancada de craft** (C) — 15 receitas consumindo materiais + ouro
- **Altar de magias** (M) — troca/compra magia ativa + treina Magia
- **Boneco de treino** (T) — treina arma equipada ou Escudo (gold + tempo)

### Sistema de Treino
- Cada sessão = 2s + custa max(5, skill×2) gold
- XP escala com xpNext (~60 sessões = 1 nível em qualquer skill)
- Boneco treina armas + Escudo (se equipado)
- Altar treina Magia separado

### Economia
- **Ouro** central — drops de mobs + craft + treino + altar custam
- Crafts comuns 24-100g, top-tier 3000-5000g
- Boss Líder dropa 100-250g

### PvP (Selos de Sangue + Highlander) — rebalanceado
- Toggle PvP (P) — **exige 5000g** pra ligar
- Cada PK kill = +1 selo (cap 5) com bônus escalonado:
  - +5% dmg/selo · crit a partir do 3º (+3%/selo) · spd do 4º (+5%/selo) · regen 2× só no 5º
- **PZ lock** com 3+ selos por 5 min
- **Highlander**: 5 selos + último kill em alguém com selo → coroa dourada + aura + bônus extra
  - HL bônus: +10% dmg, +15% spd (cap stack final ~+42% dmg, ~−25% delay com Coração)
- **Coração do Highlander**: dropa do Drake/Highlander morto (5%), equipável (Pescoço, +5%dmg, +3%spd, +3%def)
- **Vingança** (5min): vingador recupera 100% skills perdidas; killer vingado perde **60%**
- **Drop**: 10% do gold cai pro killer na morte PvP
- **Visual**: ☠ escala com selos + aura vermelha (3+) + coroa+aura dourada (Highlander)
- **Highlander Hunt**: 3 min após ascender → 3 Caçadores surgem nos cantos do mapa com aggro global. Matar os 3 = 200–450g
- Anúncios globais via servidor MP

### Status effects
- Engine poison/stun/bleed com tick, centralizada em `rollAttackerStatus(mobType)`
- **Aranha** → veneno 15% / −2hp/3s × 4 ticks
- **Escorpião** → veneno forte 30% / −3hp/3s × 5 ticks
- **Lagarto** → sangra 20% / −1hp/2s × 6 ticks
- **Troll** → stun 10% / 1.5s
- **Minotauro** → stun forte 25% / 2.0s
- **Stun** bloqueia move + attack do player; ícones flutuam acima do boneco (☠ ⚡ 🩸)
- Funciona em modo offline (damagePlayer) e online (handler mobHit)
- Limpa ao morrer

### NPCs + Quests
- **2 NPCs na PZ leste**:
  - **Mercador** (52,49) — vende poção/flecha/comida + compra qualquer item (30% do preço base)
  - **Atendente** (52,51) — quadro de quests
- Interagir: ESPAÇO ao lado OU tecla **Q** abre o quadro
- **5 quests iniciais** com tracker auto:
  1. Caçada infestante (10 ratos → 50g + 100xp Punho)
  2. Defenda o pátio (5 cobras → 80g + 100xp Espada)
  3. Trama da Aranha (5 sedas → 200g)
  4. Cabeças de Orc (3 orcs → 300g + 50xp 3 skills)
  5. O Líder (Orc Líder → 500g)

### Estatísticas (tecla I)
- Modal com cards: mobs mortos, bosses, PvP kills, mortes (mob/PvP), tempo de jogo, K/D
- Lista detalhada de kills por tipo de mob (bordas douradas em bosses)

### Multiplayer (server autoritativo)
- Server Node + ws: 150+ mobs gerados, tickAI (300ms), snapshot 250ms broadcast
- **Mapa gerado server-side** com mesma seed (42) do cliente — bosses/mobs em tiles válidos
- **Combate validado**: cliente envia attackMob, server valida range/dano, broadcasta updates
- **Cliente em modo online** (`serverAuthMobs=true`) skipa simulação local
- **Offline** (sem WS): cliente continua simulando local
- **Chat real**: tab CHAT alterna com COMBATE, Enter envia, broadcast a todos
- **Body stays**: corpo fica 3 min após logout, atacável por outros (drop 10% gold + 1 item)
- **Persistência server-side**: `state.json` salvo a cada 30s + ao SIGINT (mobs, bosses, níveis)
- **Railway Volume montado** em `/data/state.json` — sobrevive a deploys (config feita 26/05)
- **Reset diário 00:00**: bosses voltam ao Lv1
- **WS URL configurável**: ?ws=... na query, localStorage, ou auto-detect por hostname
- **Ghost duplicado fix**: reconectar com mesmo nome remove ghost antigo automaticamente
- **Mensagens do servidor (4 levels)**: info (azul) / warn (amarelo) / event (dourado) / admin (vermelho pulsante)
- **MOTD**: enviado no state inicial
- **Comandos admin (alcione hardcode)**: /say /event /warn /info /motd /setboss /respawnboss
- **Reconexão automática infinita** com backoff (2-10s) + overlay "RECONECTANDO" visível
- **Anti-farm offline**: WS cai → bloqueia ataques+movimento até reconectar
- **Auto-update**: cliente fetcha HEAD a cada 60s, se ETag mudou → saveState+reload
- **NPCs viram mini-PZ** (raio 2): mob não ataca player adjacente a NPC

### UI/UX
- Login com nome + senha (hash local) + auto-login por sessão + **link "servidor"** pra customizar WS URL
- Layout: mini-mapa + personagem (esquerda) | canvas + chat panel embaixo | direita (PvP/Equip/Bosses/Alvo+Online) | inventário
- Sidebars laterais com altura sincronizada via JS (acompanha a maior)
- **Paper doll** visual no equipamento (3×3 grid, ícones pixel art coloridos)
- **Sprites pixel art** de todos os itens (canvas off-screen + cache por (item, size))
- Barra HP **e MP** sempre visível acima do boneco (HP em cima, MP embaixo)
- Modal: baú, craft, altar, treino, login, **stats (I)**, **shop**, **quests (Q)** — todos com overlay+centralização
- Log de combate com **filtros**: tudo / dano / mortes / loot / sistema
- Tabs no chat panel: COMBATE / CHAT (chat funcional, tab pulsa quando nova msg)
- Widgets sidebar direita: Status PvP (selos visuais + Hunt countdown), Equipamento (paper doll), Bosses (timer respawn + Lv), Alvo (HP bar grande), Online
- Tema âmbar/dourado sobre escuro, fonte serif no título

---

## 📋 TODO ATUAL (do que falta)

### Curto prazo
| # | Item | Notas |
|---|---|---|
| 1 | ✅ **Mais magias** | **Exori** (AoE raio 3, 40mp/cd 4s, dano base 7) · **Provocação** (taunt raio 5, 25mp/cd 8s, força aggro em grupo) · **Fúria** (buff +25% dmg/+25% spd por 12s, 35mp/cd 30s, com aura pulsante) |
| 2 | **Skill cap / limitações** | Decisão: deixar **infinito** (sem cap), conforme decidido |
| 3 | ~~2H ataca mais devagar~~ | ❌ **Descartado** — jogo está balanceado assim |
| 4 | ✅ **Crafts lendários com Coração** | Espada do Highlander ★ (3 corações, base 20/def 8), Armadura do Trono ★ (2 corações, def 14), Coroa do Vendedor ★ (1 coração, def 7). Custo 8-12k g + materiais raros |
| — | ✅ **Defesa percentual** | reduction = def/(def+30) — diminishing returns, sem mais "tomar 1 sempre" |
| — | ✅ **Quests diárias** | 3 randomizadas por dia, tracker auto, recompensa 2-3× normal, reset 00:00 |
| — | ✅ **Quest chains narrativas** | 5 chains com NPCs no mundo (Eremita/Ferreiro/Caçadora/Mineiro/Vendedor de Almas oculto) |
| — | ✅ **Decisão moral** | Vendedor de Almas: Coroa lendária OU +5% XP permanente |
| — | ✅ **Mega Raid: Senhor de Valadares ★★** | Trigger 3 bosses Lv10, spawna (50,30), 30min vida, dropa Coroa de Valadares (def 20) + Espada Eterna (base 30/def 12), reset bossLevel ao morrer, cooldown 24h |

### Médio prazo (sistemas)
| # | Item | Notas |
|---|---|---|
| 5 | ~~Classes (Guerreiro/Tank/Arqueiro/Mago)~~ | ❌ **Descartado** — magias do altar já dão variedade, sem precisar de classes fixas |
| 6 | ✅ **NPCs / Quests** | Mercador (52,49) + Atendente (52,51) na PZ. 5 quests iniciais com tracker auto. Tecla Q abre quadro. Shop compra/vende items |
| 7 | ✅ **Status effects** | Engine poison/stun/bleed com tick. Aranha aplica veneno (15%, -2hp/3s × 4). Stun bloqueia move+attack. Ícones flutuam acima do boneco |
| 8 | ✅ **Body stays no logout** | Server mantém ghost 3 min após disconnect. Atacável (PvP), HP processado server-side. Ao morrer dropa 10% gold + 1 item random pro killer. Visual cinza + 💤 |

### Longo prazo (multiplayer real)
| # | Item | Notas |
|---|---|---|
| 9 | ✅ **Monstros sincronizados** | Server autoritativo: spawna 146+ mobs no início, tickAI (300ms) move/ataca, snapshot 250ms broadcast pra todos. Cliente em modo online (`serverAuthMobs=true`) skipa simulação local. Offline: simulação local como antes |
| 10 | ✅ **Combate MP validado** | Cliente envia `attackMob {monsterId, amount, range, crit}`. Server valida range (chebyshev) + dano ≤ teto. Aplica HP, broadcasta `mobUpdate`, on death envia `mobKill` (loot/xp local) + `mobDead` (remove pra todos) |
| 11 | ~~Bônus de grupo~~ | ❌ **Descartado** — jogo está emocionante assim |
| 12 | ✅ **Chat real** | Tab CHAT alterna com COMBATE, input habilitado. Enter envia `chat {text}`. Server broadcasta a todos. Self-msg vem azul, others douradas, tab pulsa laranja quando inativa |

### Conteúdo (mundo)
| # | Item | Notas |
|---|---|---|
| 13 | ✅ **Mais cavernas/biomas** | Covil do Drake (82,80), Abismo do Golem (70,90). Bioma neve (y<32) com Troll exclusivo, deserto (y>68,x>52) com Lagarto + Escorpião exclusivos |
| 14 | ✅ **Mais bosses** | Drake Ancião (700hp, resp 8min), Golem Rei (900hp, resp 8min). Drops: Escama, Pedra do Golem, endgame gear |
| 15 | ✅ **Evento Highlander Hunt** | 3 min após virar Highlander → 3 Caçadores de Recompensa surgem nos cantos do mapa e perseguem globalmente. Matar os 3 = 400-800g |
| 16 | ✅ **Mais armas exclusivas** | Sabre (1H Espada), Adaga Dupla (1H Espada), Bordão (1H Clava), Espada Dracônica 2H, Martelo do Golem 2H. Armaduras: Armadura de Escamas (def 9), Escudo de Pedra (def 8), Elmo Dracônico (def 4) |

### Polish
| # | Item | Notas |
|---|---|---|
| 17 | ✅ **Sons** | Web Audio sintetizado (osciladores + filtros + reverb leve). Hooks: hit, crit, dano, kill, magia, pickup, level-up, morte. Sem arquivos externos, respeita volume do settings |
| 18 | ✅ **Tutorial in-game** | Modal único no primeiro login com 6 seções (Mundo/Combate/Base/Progressão/PvP/Dicas). Flag `tutSeen:<user>` no localStorage. Reabre pelo settings |
| 19 | ✅ **Settings panel** | Tecla **O**. Sliders volume geral + efeitos (música reservada). Botão "ver tutorial de novo". Lista de teclas read-only. Persiste em `valadares:settings` |

---

## 🎯 Decisões de Design (alinhadas com o player)

| Tópico | Decisão |
|---|---|
| **Progressão** | Apenas por skills (não há nível de personagem) |
| **Save** | Persiste posição/HP/MP — não tem "logout pra escapar" |
| **PZ** | Bloqueia ataque dos 2 lados |
| **PK barrier** | 5 000 g mínimo pra ligar PvP |
| **Bônus selo** | Escalonado: +5%dmg/selo, crit do 3º (+3%), spd do 4º (+5%), regen 2× só no 5º |
| **HL bônus** | +10% dmg, +15% spd, regen 2× (cap stack ~+42% com Coração) |
| **Coração HL** | +5% dmg, +3% spd, +3% def (era +10/+5/0) |
| **Highlander** | Trono vago após morte, matador ganha Coração |
| **Vingança** | Janela 5 min, recupera 100% / pena dobrada |
| **Drop morte PvP** | 10% gold (sem drop de item por enquanto) |
| **Mini-mapa** | Overlay no canvas, fog of war, descobre andando |

---

## 🧠 Linha de pensamento

A gente começou criando um clone básico de Tibia, mais focado em **single-player com loop sólido**.
Cada decisão segue 3 princípios:

1. **Sistemas simples mas com profundidade.** Cada feature tem um trade-off — não é "tudo bom".
2. **Skills no centro.** Tudo deriva de skills: HP, MP, dano, defesa, velocidade.
3. **Multiplayer cresce devagar.** Hoje é só visual; combate sincronizado fica pra Fase 2.

**Padrão de trabalho:**
- Sessão começa: leio este ROADMAP, escolho 1-2 items do TODO
- Codo, testo via eval no preview
- Atualizo README/ROADMAP com mudanças relevantes
- Sessão termina: faço commit no git

---

## 📜 Comandos úteis

```bash
git log --oneline -10                 # ver últimas mudanças
git status                            # o que mudou desde último commit
```

No console do browser (F12):
```js
player.gold += 10000        // tester: ganhar gold
wipeSave()                  // apaga save do char atual
player.selos = 5            // testa Highlander (precisa kill final em alguém com selo)
```

---

## 🔗 Doc detalhado por sistema

- **`DESIGN_PVP.md`** — selos, highlander, vingança, ouro, drops
- (futuro: DESIGN_CLASSES.md, DESIGN_QUESTS.md quando criarmos)
