---
slug: sprint-producao
title: Sprint de produção — do single-player ao MMO em 4 dias
date: 2026-05-28
summary: Como Valadares saiu do "rodando localmente" pra ter domínio próprio, server autoritativo, monetização real, cliente desktop e SEO em 4 dias corridos. Spoiler — o gargalo nunca é código.
tags: [sprint, produção, infra]
---

## ⏱ O ponto de partida

Domingo 24/05/2026, Valadares era um arquivo HTML com mob single-player, sem persistência. Quinta 28/05, ele estava em produção com:

- Domínio próprio (valadares.app.br)
- Server WS autoritativo na Railway com volume persistente
- Cliente desktop (Electron) com auto-update via GitHub Releases
- Pagamentos em PIX e cartão via MercadoPago
- Email transacional via Resend (reset de senha funcionando)
- Sistema social: ranking, amigos, party 4-player, trade, guilds
- Sazonalidade mensal com Coroa de Temporada
- Talent tree com 6 passivos
- SEO base: sitemap, robots.txt, schema.org, Search Console verificado

4 dias. E não — não é mérito de "código rápido". Cada dia teve um gargalo diferente.

## 🗓 Dia 1 — 24/05: server WS autoritativo

O salto mais difícil. Migrar de "lógica no cliente" pra "server é a fonte da verdade" exige reescrever **tudo que importa**: mob AI, combate, drops, regen.

A decisão que economizou horas: **mob tick rodando no server**, broadcast diff. Cliente só desenha. Quem joga não nota a diferença, mas agora F12 não move sprite de mob.

Persistência no Railway Volume (`/data/state.json`). Saves a cada N segundos + on disconnect. Sobrevive a redeploys.

## 🗓 Dia 2 — 25-26/05: sociais

Ranking, amigos, trade entre players, guilds, eventos diários. Tudo isso parece "feature simples" até você lembrar que precisa:

- Validar que A e B aceitam o trade (race condition: A cancela enquanto B confirma)
- Escrowar items no server pra evitar duplicação
- Broadcast só pros membros da guild (não pro mundo inteiro)
- Persistir guilds num save separado

O escrow de trade levou 2 horas. A lógica do "aceito → travado, mas posso destravar até o outro lado aceitar também" é cheia de canto.

## 🗓 Dia 3 — 27/05: monetização

MercadoPago Checkout Pro (Preference API). Webhook valida HMAC pra não aceitar callback forjado:

```js
// Server recebe POST /webhook/mp com header x-signature
// Calcula HMAC-SHA256 de "id:<id>;ts:<ts>;" com secret
// Compara em tempo constante. Mismatch = 401.
```

**Lição cara:** SDK do MercadoPago precisa estar no `package.json` da **raiz** do repo. Railway roda `npm install` na raiz, não na subpasta `server/`.

Gold creditado via reason canônico `mp_purchase` no `goldDelta`. Idempotência por payment ID — webhook pode chegar 2x, gold só credita 1x.

## 🗓 Dia 4 — 28/05 madrugada: tudo junto

Sessão de ~7 horas com 20+ commits. Lockdown N3 fase 3 (saveUpload ignora msg.gold/inv/equipped/chests/skills do cliente), mobile touch controls, season system, talent tree, SEO base.

E a maior batalha do dia: **Dockerfile**.

Railpack/Nixpacks do Railway quebraram aleatoriamente — build falhava sem erro claro. Solução foi escrever um `Dockerfile` na raiz e fazer o Railway buildar isso direto. `nixpacks.toml` ficou como fallback.

## 🧠 O que não é código

O que mais custou tempo:

- **DNS** — Registro.br → Cloudflare leva 1-3h pra delegação NS. Records DNS-only (cinza, sem proxy laranja) pra Vercel/Railway senão SSL handshake quebra.
- **Resend** — domínio precisa ser verificado antes de mandar email. Sem isso → 403 silencioso.
- **Gmail quoted-printable** — corrompe `=` em URLs longas de email. URL com `?token=` virava `?\xEF\xBF\xBD`. Mudei pra `?t=` e funcionou.
- **MercadoPago painel** — webhooks de PRODUÇÃO e TESTE são separados. Configurar nos 2.

Resumo: o código que importa pra rodar o jogo eu poderia escrever em uma tarde. **Os 4 dias foram quase todos na infra.**

## 📊 Snapshot pós-sprint

- 20+ commits só na madrugada do 27→28
- ~3.800 linhas no `server/server.js`
- ~11.000 linhas no `play.html`
- Anti-cheat lockdown N3 FULL — gold/inv/equipped/chests/skills/hp/mp 100% server-side
- 1 usuário real (eu) + auditoria pendente

A próxima sprint foi inteira de segurança. Conto no próximo post.
