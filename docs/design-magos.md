# Rework de Magos — Wands, Escalonamento e Dano Elemental

> Design doc — 2026-06-05. Status: ✅ COMPLETO — Fases 1, 2a, 2b e 3 implementadas e
> verificadas localmente. Falta só o dono validar o feel in-game + deploy via /manutencao.
> Origem: o caster não escala. No Magia 80 o EXORI/Fireball tira ~35 por mob enquanto
> uma espada intermediária bate ~55-70 de graça, mais rápido e crita. Mago é inviável
> como classe-núcleo (não dá pra "upar" com magia). Este doc fecha a solução.

---

## 1. Diagnóstico (números reais do código)

As três fontes de dano usam a MESMA progressão por skill: `+1 a cada 3 pontos`
(`floor(skill/3)`). O gap está em tudo que vem por cima:

| Ataque | Fórmula | Dano @80 | Cadência | Mana | Crita? | Talento dano? |
|---|---|---|---|---|---|---|
| Raio Místico | `8 + Magia/3` | ~32 | 1100ms | 15 | ❌ | ❌ |
| Bola de Fogo | `12 + Magia/3` | ~38 | 1500ms | 20 | ❌ | ❌ |
| Exori (AoE) | `11 + Magia/3` /mob | ~35 | 4000ms | 40 | ❌ | ❌ |
| Espada Guardião ★ (base 16) | `16 + Espada/3` + crit + talento | ~55-70 | ~400-600ms | 0 | ✅ | ✅ |
| Espada Eterna ★★ (base 30) | `30 + Espada/3` + crit + talento | ~75-95 | ~400-600ms | 0 | ✅ | ✅ + DoT |

### Três causas-raiz
1. **Base da magia é congelada** (8-12 pra sempre). A base da arma sobe 3→30 (+27).
   O guerreiro progride trocando de arma; o mago não tem o que trocar.
2. **Magia não crita.** Melee/distância rolam crit ×2 (até ×2.5) a 25-50%.
3. **Magia pula o `applyAttackMults`** (Golpe Pesado +dano%, colar Coração HL, Fúria,
   mults de PvP) — tudo isso é só de arma branca hoje.

---

## 2. Decisões de design (travadas com o dono)

1. **Wand obrigatória** pra castar ataque mágico (identidade de classe forte).
2. **Tiro básico da wand**: ataque normal com wand equipada = projétil mágico
   spammável, escala, **mana 0** (igual auto-ataque de wand no Tibia). É o que
   sustenta o upar. As magias de cooldown são burst/AoE por cima.
3. **Magia crita e recebe talentos de dano** (unifica o pipeline com o melee).
4. **+2 magias de área** novas.
5. **Dano elemental MÉDIO** — só mobs icônicos têm fraqueza/resistência; resto neutro.
6. **Elemento HÍBRIDO** — cada magia tem elemento fixo; a wand dá afinidade (+20% no
   elemento dela).

---

## 3. Pipeline de dano (modelo final)

```
bruto = wand.base + magia.base + floor(Magia/3) + roll(±2)
× crit            (playerCritChance() × critMultPlayer() ×2~2.5)  ← NOVO p/ magia
× applyAttackMults (talentos de dano, Fúria, colar)              ← NOVO p/ magia
× 1.20  SE magia.elemento == wand.elemento   (afinidade — Fase 2)
× modMob(elemento)  (×1.5 fraco / ×0.5 resiste / ×1.0 neutro — Fase 2)
dmg = max(1, floor(bruto))
```

### Sanity check (Cajado Eterno base 30, Magia 80)
- **Tiro básico:** `30 + 26 = ~56`, mana 0, na cadência de ataque, crita → empata
  com a Espada Eterna. Resolve o upar.
- **Bola de Fogo num Esqueleto:** `30 + 12 + 26 = 68` × 1.2 (afinidade) × 1.5 (fraco)
  ≈ **122** + queimadura. Burst forte, gated por mana+cooldown.

---

## 4. Wands (nova classe de item)

`kind:'wand'`, `skill:'Magia'`, `hand:'2h'` (mago abre mão do escudo — troca defesa
por poder à distância). Campo novo `element: 'fire' | 'ice' | 'energy' | null`.
Range do tiro básico: ~5-6 tiles.

| Wand | base | Elemento | Onde |
|---|---|---|---|
| Varinha de Aprendiz | 6 | neutro | compra barata / craft (cedo) |
| Cajado de Fogo | 13 | fire | craft (mats de Drake/Esqueleto) |
| Cajado de Gelo | 13 | ice | craft |
| Cajado de Raio | 13 | energy | craft |
| Cajado Rúnico ★ | 20 | 1 elemento | forja |
| Cajado Eterno ★★ | 30 | afinidade forte | endgame (espelha Espada Eterna) |

---

## 5. Kit de magia (elementos)

| Magia | Elemento | Tipo | Efeito | Mana | CD |
|---|---|---|---|---|---|
| Tiro da Wand (básico) | o da wand | single, spammável | escala, crita | **0** | attack-speed |
| Bola de Fogo | 🔥 fire | single, range 8 | Queimadura (DoT — já existe) | 20 | 1500ms |
| Raio Místico | ⚡ energy | single, range 10, rápido | chance de Choque | 15 | 1100ms |
| Exori | 🔥 fire | AoE 3 | explosão em pacote | 40 | 4000ms |
| **Nova Glacial** 🆕 | ❄️ ice | AoE 3 | dano + Lentidão (−40% vel, 3s) | 45 | 4500ms |
| **Tempestade** 🆕 | ⚡ energy | AoE 4 | nuke de pacote | 60 | 8000ms |

### Status novos (estendem o framework `poison/bleed/burn`)
- **❄️ Congelar** (ice): reduz `mob.speed` por N ticks.
- **⚡ Choque** (energy): mob perde 1 ação (atordoa ~0.6s).

---

## 6. Matriz de fraqueza — MÉDIO (só icônicos; resto neutro)

Mobs reais (`server.js:541-561`):

| Mob (hp) | 🔥 Fogo | ❄️ Gelo | ⚡ Raio | Lógica |
|---|---|---|---|---|
| Drake / Drake Líder (130/700) | −50% | **+50%** | — | dragão de fogo |
| Golem / Golem Rei (200/900) | −50% | — | **+50%** | pedra racha no choque |
| Esqueleto (90) | **+50%** | — | −50% | osso seco queima |
| Aranha / Cobra / Escorpião | **+50%** | −50% | — | sangue-frio |
| Sombra / Carrasco (230/480) | — | — | **+50%** | trevas vs. luz |
| Senhor das Profundezas (5000, boss) | −50% | −50% | **+50%** | traga o elemento certo |
| resto (Rato/Lobo/Orc/Mino/Troll/Lagarto/Morcego) | neutro | neutro | neutro | — |

`modMob`: +50% = ×1.5, −50% = ×0.5, vazio = ×1.0.

---

## 7. Mudanças no server (todas pequenas)
- `_spellWindow` soma `wand.base` ao `damage` → o cap `attackDamageCapServer`
  (server.js:4221) precisa abrir folga pro crit também: hoje é `(dmg + Magia/3)×4 + 50`;
  com crit×2.5 × afinidade × fraqueza estoura ×4 → subir pra ~×6 ou espelhar o cap do
  melee (que já conta crit). MAX_HIT_DMG=600 segue como teto absoluto.
- Dano de magia roteado por crit + `applyAttackMults` (espelhar no cliente).
- 2 status novos (congelar/atordoar) no tick autoritativo de DoT.
- Tabela de fraqueza por `mobType` aplicada no `attackMob` (com o elemento da magia).
- Gate: ataque mágico exige `kind:'wand'` equipada (cliente + server).

---

## 8. Plano de deploy (3 fases, cada uma testável + via /manutencao)

### Fase 1 — Fundação *(deixa o mago jogável)*
- Classe `wand` + tiers + sprite (`drawItemSprite`) — cliente + server em sincronia.
- Gate: ataque mágico exige wand equipada.
- Tiro básico da wand (via `doAttack`, ramo mágico: sem flecha, projétil mágico,
  escala `wand.base + Magia/3`, crita, mana 0).
- Magia (Fireball/Raio/Exori) soma `wand.base` + passa por crit + `applyAttackMults`.
- Cap do server wand-aware (+ folga de crit).
- Migração: Varinha de Aprendiz barata no vendedor (ninguém fica travado).
- Elemento é só cosmético/cor nesta fase (a matemática elemental entra na Fase 2).

### Fase 2 — Elemental
- Elemento fixo por magia + afinidade da wand (+20%).
- Status ❄️ congelar / ⚡ choque.
- Tabela de fraqueza nos mobs icônicos.
- Dica de fraqueza no tooltip do mob.

### Fase 3 — Conteúdo ✅ FEITA (2026-06-05, verificada local)
- ✅ **Nova Glacial** (ice, AoE raio 3, 13 dano base, 45 mana, cd 4.5s) — **congela GARANTIDO**
  (slow 3s) via `statusChance:1.0`; boss imune (`!m.unique` no server).
- ✅ **Tempestade** (energy, AoE raio 4, 20 dano base, 60 mana, cd 8s) — nuke puro
  (`statusChance:0`, troca CC por dano+alcance). Reusam o ramo `sp.aoeRange` do `castSpell`;
  espelhadas no `SPELLS_META` do server (range=aoeRange autoriza o attackMob); aparecem
  sozinhas no Altar (switchCost 600 / 1200). Novo helper `aoeStatusRoll(sp)`.
- ✅ **Receitas de craft de wand** (cliente + server `RECIPES`, index-sincronizado):
  Cajado de Fogo `{ESCAMA:4,GARRA:2,OSSO:6}`, Cajado de Gelo `{SILK:8,ASA_MORCEGO:4,OSSO:6}`
  (seda gélida — não há mob de gelo), Cajado de Raio `{PEDRA_GOLEM:4,CHIFRE:2,OSSO:6}`,
  **Cajado Eterno ★★** `{CAJADO_RUNICO:1,CORACAO_HL:3,ESCAMA:5,PEDRA_GOLEM:5}` (espelha
  ESPADA_HL — fecha o gap do endgame, que não tinha fonte nenhuma). Loja mantida (decisão do
  dono: craft + loja = mat-sink E gold-sink). Custo de ouro do craft = base×8+def×12 (~128g
  elemental / ~312g Eterno).
- ⏳ **Ajuste fino de balance** — números acima são chute informado; afinar com o dono in-game.

---

## 9. Migração do mago atual
Wand vira obrigatória → quem casta sem cajado para de atacar com magia no deploy.
Mitigação: **Varinha de Aprendiz** barata no vendedor/Altar (ou grant no 1º login
pós-deploy se o player tiver Magia investida e nenhuma wand). Comunicar no /devlog.

---

## 10. Riscos / notas
- Combate é server-autoritativo (filosofia "capar-não-recalcular"): o número do
  cliente nunca pode passar do cap, senão o server clipa e o float "mente". Por isso
  o cap precisa subir JUNTO com a wand/crit nesta fase.
- Não quebrar o melee: o pipeline de magia REUSA `applyAttackMults`/`playerCritChance`,
  não os altera.
- Testar local (server :8080 + preview :3333) antes de qualquer /manutencao.
- Deploy só via /manutencao com 0 player online (regra de ouro — ver
  feedback-valadares-deploy).
