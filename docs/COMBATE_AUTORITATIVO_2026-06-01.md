# Combate autoritativo — Design (Deploy 2 do refactor mov./combate)

> Status: **APROVADO. Deploy 2a (range + cap de dano) IMPLEMENTADO 01/06 — só server, cliente não muda.** Verificado: node --check + teste isolado 19/19. Aguardando deploy via /manutencao. **2b (cadência) pendente.**
> Contexto: o Deploy 1 (movimento autoritativo) já está no ar e validado (commit `55c2080`, 01/06).
> Este doc cobre a 2ª metade: tirar o `attackMob` (combate PvE) do client-trust.
> Regra de ouro: **deploy ISOLADO do movimento** — se um número de dano sair errado in-game,
> tem que ficar óbvio que é o combate, não ficar grudado na mudança de movimento.

---

## 1. O que está aberto hoje (`attackMob`, server.js:6047)

O cliente manda `{ t:'attackMob', monsterId, amount, range, crit, dots, ammoKey?, throwSpear? }`.
O server hoje:

| Campo | Tratamento atual | Buraco |
|---|---|---|
| `range` | `range = msg.range \|\| 1`; rejeita se `chebyshev > range` | **range é do cliente** → manda `range:99` e bate de qualquer canto do mapa |
| `amount` | `dmg = clamp(msg.amount, 1, MAX_HIT_DMG=600)` | flat 600 vs hit legítimo máx ~372 → +60%/hit, e **sempre crita o teto** |
| cadência | rate-limit **por mob** 200ms (`_lastHitMob`) | legítimo mais rápido = ~680ms → **~3,4× a frequência** num mesmo alvo (e o teto por-mob não limita ações across-mobs) |

Combinado: dano por hit inflado + cadência inflada + alcance infinito. Não one-shota (o teto 600 segura), mas
é ~5× DPS e imune a revide (bate de longe). É o último grande vetor client-trusted do jogo (junto com o movimento, que já fechou).

**PvP NÃO tem esse problema** — `pvpAttack` já passa por `pvpDamageCapServer` (base×15+100) e `pvpRangeCapServer`
(range da arma, cap 8). O PvE (`attackMob`) é o lado menos blindado. **A ideia central deste design é espelhar a blindagem do PvP no PvE.**

---

## 2. Princípio: **CAPAR, não RECALCULAR**

O medo de tornar o combate autoritativo é ter que **recalcular o dano no server espelhando a fórmula do cliente
exatamente** — e, se errar um multiplicador, **todo player passa a ver número errado** (parece nerf/bug). A fórmula
do cliente é acoplada e depende de estado que vive só no cliente (o buff **Fúria** `+25% dano`, por exemplo).

**Saída (a mesma do PvP):** o server **não recalcula** o dano — ele **mantém o `amount` que o cliente mandou**
(então o número que o player vê continua sendo o roll real dele) e só **barra o teto** com um cap **por arma/skill**
em vez do flat 600. Cheater com arma fraca mandando 600 → capado no máximo real daquele setup. Player legítimo →
passa intacto. **Zero risco de "número errado".**

Fórmula do dano no cliente (pra referência do cap):
- **Melee** ([play.html:5368](../play.html)): `base = w.base + floor(skill/3)`; `dmg = max(1, base + rand(0..4) − 2)`; se crit `×2`; `applyAttackMults` = `pvpMults().dmg × (CORACAO_HL ? 1.05 : 1) × buffMult().dmg(Fúria 1.25)`.
- **Ranged** ([play.html:5322](../play.html)): `base = wItem.base + arrow.ammoBonus + floor(skill/3)`; idem variância/crit; `× buffMult().dmg` (só Fúria, sem pvp/CORACAO).
- **Arremesso** ([play.html:5217](../play.html)): `wItem.throwDmg + floor(skill/3) + rand(0..4) − 2`; crit `×2`.
- **Magia** (Exori/Fireball/Raio): `base da magia + floor(Magia/3)` (escala com a skill Magia), crit `×2`, `× buffMult().dmg`.
- **Crit** ([play.html:5163](../play.html)): `0.015 + max(0, skill−10)×0.004` + pvp; cap 25%, + mérito (perma) por cima; teto 50%.

O `pvpDamageCapServer` (base×15+100) já cobre tudo isso com folga generosa (ex.: ESPADA_ETERNA base 30 → cap 550, legit máx ~360 → **1,5× de folga**, nunca clipa hit real). Vamos reusar a mesma filosofia pro PvE.

---

## 3. As 3 peças

### Peça 1 — Range autoritativo (fecha "bater de longe")

O server passa a **derivar** o alcance permitido em vez de confiar no `msg.range`:

- **Ataque de arma:** `weaponRangeServer(p)` espelhando `pvpRangeCapServer` + lança melee:
  - melee normal → `1`
  - lança 1H (`meleeRange`, ex. LANCA/LANCA_LONGA = 3) → `meleeRange`
  - arco/besta (`ranged`) → `meta.ranged` (cap 8)
  - arremesso (`throwable`) → `meta.throwable` (cap 8)
- **Ataque de magia (Exori/Fireball/Raio):** o `attackMob` da magia chega com range > arma. **Autorização via `spellCast`**
  (que JÁ é mana-autoritativo — deduz mana, rate-limit 600ms, server.js:5661): quando uma magia de DANO é castada, o
  server abre uma **janela curta** `p._spellWindow = { range, until: now + 1000 }`. Enquanto a janela estiver ativa,
  o `attackMob` pode usar o **range da magia** (FIREBALL 8 / RAIO 10 / EXORI 3). Sem cast pago (mana real), sem range de magia.
  - Precisa adicionar os ranges no `SPELLS_META` do server (hoje só tem `manaCost`): FIREBALL `range:8`, RAIO `range:10`, EXORI `aoeRange:3`.
  - EXORI é AoE (vários `attackMob` no mesmo tick) → a janela (1s) cobre o burst inteiro.
- **Check:** `serverRange = janela ativa ? _spellWindow.range : weaponRangeServer(p)`; rejeita se `chebyshev(p, m) > serverRange`. (O `msg.range` deixa de mandar na distância; no máximo serve pro flag `isRanged` do XP, que pode ficar como está ou ser derivado server-side.)

**Fecha:** `range:99` de arma **e** de magia forjada. Custo: baixo (espelha `pvpRangeCapServer` + a janela).

### Peça 2 — Cap de dano por player (fecha "sempre 600")

Troca o flat `MAX_HIT_DMG=600` por `attackDamageCapServer(p, ctx)`:
- **Arma:** cap **por player, skill-aware** = `(base + plus×5 + floor(maxSkill/3) + 7) × 4 + 40` (base/forja/skill que o server já conhece; maior skill entre arma e Distância; ×4 cobre crit×2 + mults ~1,8 com folga; forja real máx = +7 no +5, e plus×5=25 cobre de sobra). **NÃO reusa `pvpDamageCapServer` (base×15+100)** — aquele **clipa** build de Distância/forja de baixa base (arco base 4, skill 200, Fúria+crit ≈ 187 > cap 160 = "número errado"). Verificado: cap nunca < legítimo (552≥372 melee forte, 348≥188 arco, 358≥193 Exori) e aperta o fraco (punho cap 88 « 600).
- **Magia (janela ativa):** `spellDamageCapServer(p, spellKey)` = `spellBase + floor(Magia/3) ) × 2 (crit) × 1.25 (Fúria) + margem`.
  Ex.: EXORI base 11, Magia 200 → 11+66 = 77 ×2 ×1.25 ≈ 193 → cap ~250.
- Mantém `dmg = min(msg.amount, cap)` — **número do cliente preservado**, só o teto muda de flat→por-player.

**Fecha:** cheater com arma fraca mandando 600 → capado no real (~100). Player legítimo → intacto.
**Risco:** cap apertado demais clipa hit legítimo (parece nerf). Mitigação: usar a mesma folga generosa do PvP (×15+100).

### Peça 3 — Cadência por arma (fecha "DPS ~3,4×") — *a mais sensível a tuning*

Hoje: rate-limit **por mob** 200ms. Legítimo mais rápido = ~680ms (e até ~510ms com Fúria+forja). O 200ms deixa 3,4× passar.

- Adiciona um **gate por AÇÃO de ataque** `p._lastAttackActionAt`: ataque de arma exige `now − _lastAttackActionAt ≥ cadenciaMin(p)`.
- `cadenciaMin(p)` = `effectiveAttackDelay` server-side no **pior caso (mais permissivo)**: `800 × (1 − atkSpd_arma) × (1 − 0.25 Fúria)`.
  Ex.: arma rápida (atkSpd 0.15) + Fúria → `800 × 0.85 × 0.75 ≈ 510ms`. Pra não clipar jitter, gate em ~**450ms**.
  Isso corta o DPS forjado de 3,4× → ~1,5×. (Não dá pra cravar 680ms sem rastrear Fúria/atkSpd exatos por player —
  por isso o gate é o pior-caso permissivo; ainda assim é >2× melhor que os 200ms de hoje.)
- **Concilia o Exori (AoE):** com a janela de spell ativa (`_spellWindow`), os N `attackMob` do mesmo tick **não**
  passam pelo gate de ação (a frequência do AoE já é limitada pelo rate-limit 600ms do `spellCast`).
- **Mantém** o rate-limit por-mob 200ms (anti-rajada de hits forjados no MESMO mob — defesa do one-shot de boss).

**Risco:** é o gate mais sujeito a *feel* — apertado demais "engole" hits de quem tá com Fúria/arma rápida.
Requer `atkSpd` no `ITEM_META` do server (confirmar; o cliente tem em `ITEMS[].atkSpd`). **Por isso: candidato a deploy separado** (2b), depois de 2a (range+cap) validar liso.

---

## 4. Fases sugeridas

| Deploy | Peças | Risco | Por quê |
|---|---|---|---|
| **2a** | 1 (range) + 2 (cap dano) | Baixo | Ambas espelham o PvP testado; número do player não muda. Fecha os 2 buracos absurdos (alcance infinito + dano inflado). |
| **2b** | 3 (cadência) | Médio (tuning/feel) | Gate de cadência é sensível; melhor isolar pra observar rubber-band/"hit engolido" sozinho. |

(O dono pode optar por tudo num lote só — anotado como alternativa.)

---

## 5. Mudanças concretas (server.js, sem tocar cliente em 2a)

1. `SPELLS_META` (5664): adicionar `range`/`aoeRange` em FIREBALL(8)/RAIO(10)/EXORI(3); ao castar magia de dano,
   setar `p._spellWindow = { range, until: Date.now()+1000 }`.
2. `weaponRangeServer(p)` (novo, espelha `pvpRangeCapServer` + `meleeRange`).
3. `attackDamageCapServer(p, spellWin)` (novo): arma → skill-aware `(base + plus×5 + floor(maxSkill/3) + 7)×4+40`; magia (janela) → `(spellBase + floor(Magia/3))×4+50`. Mantém `min(amount, cap, MAX_HIT_DMG)` (600 fica como teto absoluto de segurança).
4. `attackMob` (6047): `serverRange = _spellWindow ativo ? range da janela : weaponRangeServer(p)`; trocar a distância
   pra usar `serverRange`; trocar `MAX_HIT_DMG` por `attackDamageCapServer`. (Peça 3 adiciona o gate de cadência aqui.)

**Cliente: nada em 2a** (continua mandando `amount`/`range`; o server só passa a ignorar/capar). Sem reconexão de cliente — mas mexe em `server/**` → **deploy via /manutencao** mesmo assim.

---

## 6. Verificação

- `node --check` + teste isolado dos caps (mesa de casos: arma fraca+600→capado; arma forte+roll real→passa; range arma; range magia só com janela; janela expira→rejeita).
- **In-game (pós-deploy):** (1) dano normal de cada arma aparece igual a hoje (número não mudou); (2) magia (Fireball/Raio/Exori)
  causa dano normal; (3) forjar `attackMob {amount:9999, range:99}` no console → capado + rejeitado por alcance; (4) Exori AoE
  segue acertando todos no raio; (5) [se 2b] cadência com Fúria/arma rápida não "engole" hit.

---

## 7. Pendências/limpezas achadas (fora do escopo, anotar)

- **Mismatch de mana cliente×server:** `SPELLS` (cliente) tem FIREBALL 20 / RAIO 15 / EXORI 40; `SPELLS_META` (server)
  tem 18 / 10 / 25. O server deduz MENOS mana do que o cliente mostra. Não quebra nada, mas é inconsistente — unificar um dia.
- **XP de skill no `attackMob` de magia:** hoje dá XP de arma/Distância (6118), não de Magia (a Magia vem do `spellCast`).
  Provavelmente ok (o cast já dá Magia), mas vale revisar quando mexer aqui.
- **`crit` do `attackMob`** é client-supplied e só cosmético (float ★) — com o cap por player o crit forjado já não infla além do teto.
