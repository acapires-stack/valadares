# Valadares — Roadmap v2

> Mapa de decisão pra próximas sessões. Lista o que falta organizado por
> **impacto × esforço** + **definição de pronto** por item.
> O `ROADMAP.md` antigo continua sendo o registro histórico — este aqui é
> o "norte" pra próximas escolhas.

---

## 🎯 Princípios pra escolher o que fazer

1. **Retenção > novidade** — feature que faz player voltar amanhã > feature que diverte 1 hora.
2. **Playable em 1 sessão** — corte cada onda em <90min de trabalho. Se passar, divide.
3. **Server-side por padrão** — nada que credita gold/inv/XP fica só no cliente.
4. **Verifica antes de commitar** — DOM eval, ou eval no preview. Bug em prod custa redeploy.
5. **Documenta o "porquê"**, não o "o quê" — código já mostra o que faz; o motivo some no histórico.

---

## 🥇 Onda imediata (próximas 2-3 sessões)

### M1 — Mobile / touch [PESADA]

**Pra quê**: 10× audiência potencial. RPG tile-based é o caso de uso perfeito pra celular.

**Definição de pronto** (MVP):
- Joystick virtual no canto inferior esquerdo (drag pra mover, 8 direções)
- Botão flutuante de ataque (substitui SPACE) no canto inferior direito
- Botões secundários colapsáveis: magia, lança, comer
- Viewport meta + prevenção de pinch zoom + landscape lock recomendado
- Sidebars laterais colapsáveis (hamburguer no topo)
- Modais (baú/shop/inv) com altura adaptativa
- Detecção `('ontouchstart' in window)` — UI mobile só aparece em touch device

**Riscos**:
- Combate em tempo real pode ficar difícil sem precisão de teclado
- Performance: canvas em mid-range Android (testar com throttle)
- Tap-to-attack vs hold-to-attack: ergonomia diferente

**Esforço**: 90-120min sessão única (MVP). Polimentos vêm depois.

---

### M2 — Mob kill XP server-side [TECH DEBT]

**Pra quê**: fecha o último vetor de cheat (F12 → `player.skills.Espada.val = 200`). Hoje XP de quest é server, mas XP de mob kill é client. Lockdown de skills no saveUpload só vale depois disso.

**Definição de pronto**:
- Server emite `mobKill { mobId, skillKey, xp }` ao matar
- Cliente recebe e aplica via novo handler (ou via `invUpdate { skillsXp: {...} }`)
- saveUpload passa a IGNORAR `data.skills.{val,xp,xpNext}` (ou clampa)
- Fallback offline mantém XP local

**Esforço**: 60min.

---

### M3 — Season + leaderboard mensal [RETENÇÃO]

**Pra quê**: cria FOMO saudável — player volta no mês seguinte pra subir no ranking. Já temos ranking persistido; falta camada de "season".

**Definição de pronto**:
- Server tem `seasonId` (YYYY-MM) e `seasonRanking` (resetada no dia 1 às 00:00 BRT)
- Tab nova no modal `L`: "SEASON" mostra top 10 do mês + meses anteriores arquivados
- Cosmético `COROA_TEMPORADA_<YYYY-MM>` granted pro #1 do mês anterior no rollover
- Histórico das 12 últimas seasons fica em `accounts.json` ou arquivo separado

**Esforço**: 60-90min.

---

## 🥈 Próxima onda (médio prazo)

### M4 — Dungeons instanciadas [ENDGAME]

**Pra quê**: endgame fresco. Hoje quem maxou bosses + raid não tem mais nada novo a fazer.

**Definição de pronto** (MVP, 1 dungeon):
- Portal na PZ com NPC `Sentinela do Abismo`
- Sala instanciada gerada por seed (10×10 tiles, 3 salas conectadas)
- 8-12 mobs + mini-boss único no final
- Reward garantido (1 Coração HL, 1 cosmético raro, ou material profissão)
- Cooldown 24h por player

**Esforço**: 2-3 sessões. Sistema de instância é novo.

---

### M5 — Talent tree leve [BUILD VARIETY]

**Pra quê**: hoje todo player vira a mesma coisa (skill cap infinito). Talent tree dá identidade.

**Definição de pronto**:
- A cada 10 níveis em qualquer skill, 1 talent point
- Árvore de ~15 talents: +5% crit, +10% range arco, regen 2× na PZ, etc
- Modal `K` (Talents) — alocar/resetar (custa 1k g)
- Recomputa stats ao alocar

**Esforço**: 90-120min.

---

### M6 — Gold sinks reais [ECONOMIA]

**Pra quê**: gold infla. Dailies + bosses + drops dão 5-10k/dia easy. Sinks atuais (craft, treino, magia) são fracos.

**Definição de pronto** (escolher 2-3):
- Cassino na PZ: slot 100g (chance 5% de 10×, chance 1% de 100×, EV negativa)
- Tinturaria: mudar cor do nome (5000g)
- Pet cosmético: pequeno bicho seguindo o player (10k, sem stats)
- Upgrade da casa do player (M11): cada nível 20k g

**Esforço**: 60min cada (~2-3h total se escolher 3).

---

### M7 — Arena PvP 1v1 / 3v3 [SOCIAL/COMPETITIVO]

**Pra quê**: PvP atual é world-PvP com risco real. Arena dá PvP "seguro" pra quem quer competir sem perder progresso.

**Definição de pronto**:
- Sala instanciada (sem mobs, sem PZ)
- ELO simples (Start 1000, ±15 por match)
- Reward: cosmético sazonal por liga (Bronze/Prata/Ouro/Lendário)
- Modo 1v1 first; 3v3 com party fica pra depois

**Esforço**: 2 sessões.

---

### M8 — Auction house [MARKETPLACE]

**Pra quê**: economia entre players hoje é só trade direto P2P. AH cria mercado real + gold sink (comissão 5%).

**Definição de pronto**:
- NPC `Leiloeiro` na PZ
- Modal: listar item (preço + duração 6h/12h/24h), buscar items à venda
- Comissão 5% sobre venda
- Server mantém `listings` Map

**Esforço**: 2 sessões.

---

## 🥉 Longo prazo / aspiracional

### M9 — Mapas adicionais (Submundo, Ilha)
Portais na PZ → regiões com mobs/biomas exclusivos. Cliente já é multi-map ready? Provavelmente precisa refactor.
**Esforço**: 4+ sessões.

### M10 — Crafting profundo (profissões)
Ferreiro/Alquimista/Caçador com árvore própria. Mat raras só profissionais conseguem. Cria interdependência entre players.
**Esforço**: 3-4 sessões.

### M11 — Casa do player
Compra terreno (50k g), decora com móveis cosméticos. Visitável por outros via `/visit nome`.
**Esforço**: 3 sessões.

### M12 — Battle Pass mensal
10 níveis grátis + 20 premium (R$ 15). XP do BP ganho jogando. Reseta mensalmente.
**Esforço**: 2-3 sessões.

### M13 — Arco narrativo global
Lore unindo os 7 chains atuais. Final-game quest (50h+) com cinemática text-based + cutscenes ASCII.
**Esforço**: muito design + 4+ sessões code.

---

## 🛠 Dívida técnica a fechar

| # | Item | Esforço | Quando |
|---|---|---|---|
| T1 | Mob kill XP server-side | 60min | Já listado (M2) |
| T2 | Regen HP/MP server-side | 60min | Junto com T1 |
| T3 | Lockdown de skills no saveUpload | 30min | Depois de T1+T2 |
| T4 | Spawn Caçadores HL server-side | 60min | Quando quiser hunting funcionar em MP |
| T5 | Webhook signature MP validada em prod (testar end-to-end) | 30min | Próximo deploy real |
| T6 | sanity check Vercel/Railway sincronizados | 30min | Sempre antes de feature grande |

---

## 📐 Métricas pra decidir prioridade

Sugestão de medir antes de decidir:
- **DAU** (daily active users) atual
- **Tempo médio de sessão**
- **Taxa de retenção D1/D7/D30**
- **Top 3 features citadas em chat** (pedir feedback explícito)
- **Causa #1 de churn** (player parou — por quê?)

Sem isso, decisões viram chute. Vale criar um Google Form simples ou comando `/feedback` que loga no server.

---

## 🚦 Como decidir entre as M's

```
M alta = (impacto × confiança) ÷ esforço
```

Pra um RPG indie em fase de crescimento:
- **Impacto alto** = retenção (M3 season, M4 dungeons, M5 talents)
- **Confiança alta** = features já validadas em jogos similares (Tibia, Tap Titans, Soul Knight)
- **Esforço baixo** = <2 sessões

Hoje as melhores apostas pelo critério acima:
1. **M1 Mobile** (impacto: 10× audiência | confiança: alta | esforço: 1 sessão)
2. **M3 Season** (impacto: retenção mensal | confiança: alta | esforço: 1 sessão)
3. **M4 Dungeons** (impacto: endgame solução | confiança: alta | esforço: 2-3 sessões)

---

## 📅 Sugestão de plano de 4 semanas

| Semana | Foco | Entregáveis |
|---|---|---|
| 1 | Mobile MVP (M1) + T1 (XP server) | Mobile playable + cheat fechado |
| 2 | Season (M3) + Gold sinks (M6) | FOMO + economia saudável |
| 3 | Dungeons MVP (M4) | Endgame fresco |
| 4 | Polimento + métricas + feedback | Form de feedback + dashboard |

---

## 🧭 Norte do projeto

> "Um RPG tile-based que cabe num ônibus, e ainda tem profundidade pra
> um endgame de 100h. Pixel art procedural, server autoritativo,
> jogabilidade simples na superfície e complexa no fundo."

Não é Tibia. Não é Diablo. É **Valadares** — escala onde os outros não chegam (browser + mobile) e tem profundidade onde os clones param (raid+season+talents).
