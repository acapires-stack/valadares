---
slug: maratona-seguranca
title: Maratona de segurança — 17 vulnerabilidades fechadas em duas sessões
date: 2026-05-29
summary: Auditoria pós-lançamento encontrou 5 CRITICAL, e isso virou uma maratona de hardening. No final, mais 12 issues fechadas — incluindo um handler que aceitava HP do cliente direto.
tags: [segurança, hardening, server]
---

## 🔒 Por que auditar

No último commit da sprint de lançamento, marquei um TODO: "rodar auditoria de segurança antes da próxima feature". Eu sabia que tinha pressa demais nos últimos 4 dias e que alguns handlers tinham passado sem peer-review.

A auditoria rodou na manhã do 29/05 e veio com **5 CRITICAL/HIGH**:

1. Handler `pos` aceitava `hp/maxHp` do cliente
2. Sem `uncaughtException` global → throw em `tickAI` matava o processo
3. `ws.on('message')` sem try/catch geral → mensagem ruim derrubava o server
4. `pvpAttack` sem cap em `amount`/`range` → F12 one-shot
5. `pvpAttack` sem rate limit → 100 hits/s + farm XP

## #1 — O handler `pos` aceitava HP do cliente

Esse foi o mais embaraçoso. O lockdown N3 cobria `saveUpload`, `playerSync` e ~15 handlers de mutação. Mas o handler `pos` (que atualiza posição quando o player anda) estava assim:

```js
case 'pos': {
  p.x = clamp(msg.x, 0, MAP_W - 1);
  p.y = clamp(msg.y, 0, MAP_H - 1);
  if (typeof msg.hp === 'number') p.hp = msg.hp;       // 🔴
  if (typeof msg.maxHp === 'number') p.maxHp = msg.maxHp; // 🔴
  break;
}
```

Esse `if (typeof msg.hp === 'number')` sobrevivia desde antes do lockdown — provavelmente porque "o cliente precisa atualizar HP quando regenera". Acontece que a regen tinha virado server-side desde o T2.

F12 no cliente, mandar `{t:'pos', x:.., y:.., hp: 99999, maxHp: 99999}` → players imortais.

Fix: remover qualquer mutação de stats do handler `pos`. Server é dono.

## #2 e #3 — Sem `uncaughtException`, qualquer throw mata prod

Caso clássico de Node: `tickAI` roda a cada 100ms. Se algum mob entrar num estado inválido (item null, target já desconectado, etc.) e o handler dispara `TypeError`, o evento sobe até o topo do loop e **mata o processo**.

Railway reinicia, mas no meio:

- Players perdem conexão
- Estado em memória que não tinha persistido ainda some
- Logs de erro são parciais (nem sempre dá tempo de flush)

Fix duplo:

```js
process.on('uncaughtException', (err) => {
  console.error('[fatal:uncaught]', err);
  // não rethrow — log e segue
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal:unhandled]', err);
});
```

E o handler de message:

```js
ws.on('message', async (raw) => {
  try {
    const msg = JSON.parse(raw);
    await dispatch(ws, msg);
  } catch (err) {
    console.error('[ws:msg]', err);
    // não fecha o socket — só loga
  }
});
```

Isso não é "fingir que tá tudo bem". É garantir que **um player mal-intencionado** não derruba o server pros outros.

## #4 e #5 — `pvpAttack` sem cap nem rate limit

Esse handler aceita um amount calculado no cliente (legado pré-lockdown). F12, mandar `{t:'pvpAttack', target:'X', amount: 99999}` → one-shot.

Pior: nada limita frequência. Loop infinito mandando 100 attacks/segundo = farm de XP de skill via PvP.

Fix:

```js
// Cap server-side por skill+equip
const maxAtk = computeMaxDamage(p);
const amount = Math.min(msg.amount | 0, maxAtk);

// Rate limit por conn
if (now - p._lastPvpAttack < 600) return; // 600ms entre hits
p._lastPvpAttack = now;
```

## 🟡 P0.5 — Mais 5 issues que apareceram

Depois de fechar os P0, fiz uma segunda passada e achei:

- `permaBuffs` aceitava qualquer chave do cliente → construí allowlist a partir de `TALENT_DEFS`
- `pkDeath` confiava em `msg.killerId` → server determina autonomamente
- `flags`/`questFlags` sem allowlist → set de 6 keys válidas + validação por `chainId`
- ADMIN_TOKEN passava por query string → migrei pra header `X-Admin-Token`
- `broadcastMobs` sempre full snapshot → skip-when-unchanged via signature + snapshot full só a cada 10s

## 🟡 Nova auditoria 29/05 à tarde — 6 vetores de rate limit

Bateu o sininho de "talvez ainda tenha gente abusando" e fiz uma terceira passada focada em rate limit:

1. **🔴 `announce` sem admin check** — qualquer player podia broadcast spam. Fix: `isAdmin()` + 2s rate
2. **🟡 `auth` sem rate limit** — brute force passwords. Fix: 5 tentativas/30s por conn → fecha
3. **🟡 `duelInvite` sem rate limit** — pop-up infinito de assédio. Fix: 3s
4. **🟡 `tradeRequest` sem rate limit** — mesma coisa. Fix: 3s
5. **🟡 `getRanking` sem rate limit** — CPU spike. Fix: 1s
6. **🟡 `passwordResetRequest` sem rate limit** — CPU via `findAccountByEmail` O(N). Fix: 5/min

## 📊 Resultado final

| Categoria | Quantos |
|---|---|
| CRITICAL (P0) | 5 |
| P0.5 (HIGH) | 5 + 1 missed (pkDeath) |
| Nova auditoria (rate limit) | 6 |
| **Total fechado em 2 sessões** | **17** |

Commits:
- [`58c1d72`](https://github.com/acapires-stack/valadares/commit/58c1d72) — P0
- [`0e727c1`](https://github.com/acapires-stack/valadares/commit/0e727c1) — P0.5
- [`7bae381`](https://github.com/acapires-stack/valadares/commit/7bae381) — rate limit

## 🧠 Lição

Auditoria periódica não é luxo. É a única coisa que pega o canto cego do "eu já cobri isso no lockdown N3". O lockdown cobria `saveUpload` e `playerSync`. Não cobria `pos`. Não cobria `pvpAttack`. Não cobria `announce`.

**Cada handler novo é um vetor novo.** Trate como tal.

Próximo post: o overhaul mobile que veio porque a esposa achou ruim no celular.
