# Valadares — Análise Geral

Estudo do estado do jogo. Diagnóstico honesto: o que tá bom, o que tá fraco, o que pode quebrar, e onde investir energia.

---

## 📊 Visão de números

- **Cliente:** 6.612 linhas (single HTML/JS) — grande mas coeso
- **Server:** 727 linhas Node + ws
- **Mobs:** 17 tipos · **Itens:** 50+ · **Skills:** 7 · **Magias:** 3 · **Bosses únicos:** 3 (escalam Lv1→10)
- **Mapa:** 100×100 tiles · 4 biomas · 5 cavernas
- **Modais:** 9 (baú, craft, altar, treino, stats, shop, quests, login, reconnect)
- **Hosting:** Vercel (cliente) + Railway pago (server) · WSS · persistência state.json

---

## 💪 Pontos fortes

### 1. Profundidade pra um jogo browser
Em menos de 8k linhas tem: combate melee/ranged/magia, 7 skills com curva XP, 50+ itens com craft, PvP com Selos+Highlander, body stays, status effects, persistência. Surpreende.

### 2. Arquitetura MP sólida
- Server autoritativo de mobs + combate validado (range, dano teto)
- Fallback offline limpo (joga sem WS)
- Reconexão automática + bloqueio anti-farm offline
- Snapshot 250ms suporta diversos players sem stress

### 3. UX coerente
- Tema âmbar/dourado consistente
- Sprites pixel art auto-gerados (cache por size, sem assets externos)
- Atalhos cobrindo todo o jogo (1 tecla = 1 ação)
- Modais com overlay padronizado, exclusivos
- Mini-mapa com fog of war

### 4. Sistema de mensagens server→cliente (4 levels + admin)
Maduro pra debug, eventos, comunicação. Comandos `/say`, `/event`, `/motd` permitem ação remota.

### 5. Persistência multi-camada
- `localStorage` por personagem (cliente)
- `state.json` server-side
- Pronto pra Railway Volume

---

## 🚨 Pontos fracos / Riscos

### 1. **Cliente é fonte da verdade pra muita coisa que devia ser server** 🔴
- Inventário: cliente decide o que tem, envia via `playerSync`. Anti-cheat só tem teto de **dano por mob**, não de items.
- Skills: 100% cliente. Player pode editar `player.skills.Espada.val = 999` no DevTools e atacar com isso.
- Gold: cliente decide. Drop, craft, train, sell — tudo local. Server confia.

**Impacto:** mod inflado, gold infinito, items forjados. Hoje só não é exploit pq amigos são confiáveis.

**Fix sugerido (futuro):** server precisaria gerenciar inv + gold + skills. **Reescrita pesada**, ~1 semana.

### 2. **Combate desbalanceado: defesa demais zera dano**
`damagePlayer` faz `blocked = min(amount-1, totalDefense())`. Garante toma pelo menos 1, mas player com 25 def vs mob 5 dmg sempre toma 1. Anula scaling de dificuldade.

**Fix:** defesa absorve **percentual** em vez de absoluto:
```js
const reduction = totalDefense() / (totalDefense() + 30);  // diminishing returns
const actual = Math.max(1, Math.round(amount * (1 - reduction)));
```
Defesa 30 = 50% redução. 60 = 67%. Nunca zera.

### 3. **Skill cap não definido**
Skills sobem infinito sem teto. Não tem incentivo pra parar de treinar nem desafio progressivo. ROADMAP item #2.

**Sugestão:** cap 100 com diminishing returns acima de 80 (precisa 2x XP por nível).

### 4. **Conteúdo se esgota rápido em ~2h**
3 bosses, 5 quests iniciais, 50 itens. Player ativo bate em tudo, mata todos os bosses e termina as quests em ~2-3h. Não tem **endgame loop** real.

**Sugestão:** quests diárias (3 randomizadas por dia), dungeons rotativas (1 nova por semana), eventos de mundo.

### 5. **Sem comunicação entre players além do chat**
Não tem grupo/party, trade direto, friend list, mail. Pra multiplayer crescer precisa disso.

### 6. **Movimento é tile-by-tile sem auto-walk** (revertido)
Pra mundo 100×100, andar 20 tiles é exaustivo. Pathfinding click-to-move (estilo Tibia tradicional) ajudaria muito a sensação de fluidez.

### 7. **Mobile/touch totalmente ignorado**
Layout assume teclado + mouse. Mobile não joga.

### 8. **Sons / música ausentes**
ROADMAP #17. Single-handedly muda a sensação do jogo. Web Audio API é fácil de plugar.

### 9. **Sem progressão visual do personagem**
Skin única. Botas Vento muda cor, mas só. Customização visual = engajamento longo.

### 10. **Server tick AI simples**
Mobs perseguem com pathfinding ingênuo (1 step em direção ao player). Travam fácil em árvores/água. Sem A* nem fluxo.

---

## 🎯 Top 10 melhorias priorizadas

### Tier 1 — Alto impacto, baixo esforço
1. **Defesa percentual** — 1 fórmula, equilibra tudo (~30 min)
2. **Skill cap 100 + curva final** — define teto, dá objetivo (~1h)
3. **2H mais lento** — atrasa 1.4× delay em armas 2H, equilibra build (~30 min)
4. **3 quests diárias randomizadas** — reaproveita engine de quests existente (~2h)

### Tier 2 — Alto impacto, médio esforço
5. **Sons básicos (hit, kill, magia, drop)** — Web Audio + 8 SFX (~2h)
6. **Click-to-move (pathfinding A*)** — fluidez gigante, ~3h
7. **Mais magias (Exori AoE, Provocação, Buff)** — sistema já existe (~2h)
8. **Grupos/party com bônus de XP** — ROADMAP #11 (~3h)

### Tier 3 — Estrutural (semana cheia, alto valor)
9. **Server autoritativo de inv/gold/skills** — anti-cheat real, suporta MP aberto
10. **Mobile responsivo + touch controls** — abre pra phones

---

## 🐛 Bugs conhecidos / pequenos

| # | Bug | Severidade | Fix sugerido |
|---|---|---|---|
| B1 | `state.json` reseta a cada `git push` no Railway | Média | Configurar Railway Volume (já documentado) |
| B2 | Players muito longe somem do snapshot? (não confirmado) | Baixa | Confirmar lista players |
| B3 | Chat overflow não scroll suave em volume alto | Baixa | `scroll-behavior: smooth` |
| B4 | Movimento bloqueado mesmo quando WS volta antes do próximo tick | Baixa | Reagir ao ws.onopen mais rápido |
| B5 | Stun não tem feedback sonoro / vibração | Baixa | Adicionar shake da câmera |
| B6 | Mobs não desviam de obstáculos no AI do server | Média | Path A* simples (cube de 100×100 é pequeno) |
| B7 | Sem rate limit no chat (spam possível) | Média | Server limita a 5 msgs / 10s por player |

---

## 📈 Curva de progressão atual

| Fase | Tempo | Foco |
|---|---|---|
| **Spawn → Sair PZ** | 0-5min | Aprender WASD, comer queijo, matar Ratos |
| **Anel 1-2** | 5-20min | Cobra, Aranha. Drops de Adaga, Lança, primeira armadura |
| **Anel 3** | 20-50min | Lobo, descobrir biomas (Troll/Lagarto), 1ª magia |
| **Anel 4 + Cavernas** | 50min-2h | Orc, Esqueletos, Bats. Skill ~25-40 |
| **Bosses + Endgame** | 2-4h | Orc Líder, Drake, Golem. Coração HL drop |
| **Lendários + PvP** | 4h+ | Crafts ★ (3 corações), Highlander, Hunt |
| **Pós-endgame** | ⚠️ vazio | Sem nada novo. Player para de jogar. |

**Gargalo principal:** o **pós-endgame** é fraco. Quest diária + dungeon rotativa resolveria.

---

## 🌐 Multiplayer — análise

### Funciona bem
- Posição/rotação sincronizadas
- Combate validado no server (range + dano teto)
- Body stays funcional
- Chat com 4 levels de mensagem

### Limitações
- **Sem rooms / instâncias** — todos no mesmo mundo. 50 players viraria caos
- **Sem matchmaking PvP** — todos PvP entre si quando ligado
- **Sem ranking** — quem matou mais bosses? Quem é o melhor PK? Não tem
- **Sem chat de canal** — só global. Pra grupo, privado, guild → não tem
- **Trade** — sem sistema de troca direta entre players

---

## 💰 Monetização (se quiser explorar)

Não é necessário, mas possível:
- Skins/cosméticos (vendido) — não afeta gameplay
- "Premium" com 5 baús extras
- Domínio próprio → marca/comunidade no Discord
- Patreon

Mas **não recomendo agora**. Foca em conteúdo, ganha base de jogadores ativos, depois pensa.

---

## 🎮 Recomendação de roadmap pros próximos 30 dias

### Semana 1 — Balanceamento
- Defesa percentual (Tier1#1)
- Skill cap (Tier1#2)
- 2H mais lento (Tier1#3)
- Quests diárias randomizadas (Tier1#4)

### Semana 2 — Conteúdo
- 3 magias novas (AoE, Provocação, Buff)
- 1 dungeon nova (mob/boss/loot novo) — quadrante noroeste vazio
- 5 quests novas (matar X de Y bioma, entregar Z item)

### Semana 3 — Polish
- Sons básicos (8 SFX)
- Click-to-move
- Mobile-friendly (layout responsivo + touch)

### Semana 4 — Multiplayer pro
- Grupos/party
- Ranking de bosses
- Trade direto entre players

---

## 🏁 Resumo executivo

**Estado atual:** **8/10** — jogo divertido por 2-4h, multiplayer estável, infra sólida.
**Maior risco:** trust do cliente (anti-cheat) em mundo aberto pra estranhos.
**Maior oportunidade:** endgame loop (quests diárias + dungeons rotativas) que mantém o player voltando.

Você tem um jogo real funcionando online com amigos. Daqui pra frente é decidir entre **polir o que existe** (Tier 1+2) ou **investir em infra de multiplayer aberto** (Tier 3+sec authoritativa) pra publicar mais aberto.
