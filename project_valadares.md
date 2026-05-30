# Valadares — Memória do Projeto (estado completo)

> Snapshot durável pra retomar o contexto em qualquer sessão. O **detalhe vivo** mora em:
> `ROADMAP.md` (norte/backlog), `SESSION_NOTES.md` (sessão atual), `docs/archive/sessions-pre-may30.md`
> (histórico) e `docs/AUDITORIA_2026-05-29.md` (relatório de segurança).
> Última atualização: **30/05/2026**.

---

## 🎮 O que é

RPG tile-based estilo Tibia, jogável no browser (e desktop via Electron). PvP, masmorra
mortal, economia com gold, monetização real (PIX/Cartão via MercadoPago). Produção tem
jogador(es) real(is) — **não quebrar sem testar**.

- Dono: **acapires@gmail.com** (personagem in-game `alcione`).
- Admins in-game: `alcione`, `claude` (env `ADMIN_NAMES`).

## 🌐 Stack & deploy

| Camada | Tecnologia | Onde |
|---|---|---|
| Cliente | HTML/JS único (`play.html`, ~700KB, JS inline) | Vercel — https://valadares.app.br/jogar |
| Server | Node + `ws` (WebSocket autoritativo), arquivo único `server/server.js` (~6700 linhas) | Railway (Dockerfile), Volume `/data` |
| Desktop | Electron v1.0.3, auto-update via electron-updater | GitHub Releases |
| Pagamento | MercadoPago Checkout Pro (Preference API), webhook HMAC | dep `mercadopago` no `package.json` RAIZ |
| Auth/email | email + reset de senha via Resend | — |
| Persistência | `accounts.json` no Volume `/data` (escrita atômica + backups rotativos) | Railway |

- **Deploy**: push em `main` → Vercel (cliente) + Railway (server) auto-deploy.
- **Watch paths Railway** (`railway.json`): só `server/**`, `package.json`, `package-lock.json`,
  `Dockerfile`, `railway.json` reconectam players. Push só-de-cliente NÃO reconecta ninguém.
- **WS de produção**: `wss://ws.valadares.app.br`. Local não dá pra testar WS de prod;
  cliente testável em preview (porta 3333).

## 🔒 Anti-cheat (lockdown N3 FULL)

Server-autoritativo: `gold`, `inv`, `equipped`, `chests`, `skills`, `hp`, `mp`, `maxHp`,
`maxMp`, XP de mob/magia, daily claim. Forjar `player.X` no F12 não persiste pra nada disso.

- **Vetores remanescentes**: só cosmético/trail/animação (zero impacto). Movimento (`p.x/y`)
  e cadência/`range` de ataque ainda são client-trusted → mitigados por clamp de coords,
  `MAX_HIT_DMG=600` e `ATTACK_MIN_INTERVAL_MS=200`. Refactor autoritativo de movimento é o
  caminho definitivo (deferido, sistêmico).
- **Save hardening (30/05)**: trava anti-wipe (save vazio nunca sobrescreve cheio), matar
  sessão dupla por `authedName`, escrita atômica (tmp+rename) + 24 backups rotativos em
  `/data/accounts_backups` + load com fallback.
- **Hash de senha**: `scrypt` com salt por conta (`scrypt$<salt>$<hash>`), rehash transparente
  no login das contas legadas. NÃO depende de `ACCOUNTS_SALT` (mudar env não quebra migradas).

## ⚙️ Sistemas de jogo (estado atual)

- **Combate/skills**: skill por arma sobe com uso; dano server-side. Crítico e esquiva
  **base 1,5% / teto TOTAL 25%** (cap inclui talento/pvp), valendo em PvE (mob crita ×2 e
  player esquiva, ambos espelhados no `tickAI` server-side).
- **Masmorra M4 "As Profundezas"** (aberta, mortal, estilo Tibia — NÃO instanciada): 5 andares,
  entrada no Antro do Minotauro (83,17), PvP forçado, mobs escalam +60%/andar. Boss andar 5
  = "O Senhor das Profundezas" (5000hp), loot top-tier por dano. **3b procedural feito (30/05):**
  cada andar é uma caverna procedural (cellular automata) gerada no server (`server/dungeon-gen.js`)
  e enviada pro cliente no `dungeonEnter`; escadas/chegada/boss variam por andar; andar efêmero.
- **Economia/social**: ranking público, amigos, trade, guild, eventos diários, season +
  leaderboard mensal (Coroa de Temporada), talent tree (6 passivos), cassino.
- **Gold sinks**: Tinturaria (cosmético), Auction House (NPC Leiloeiro, escrow 24h, 5% comissão).
- **Monetização**: venda de gold via PIX/Cartão, webhook credita online/offline.

## 🧭 Princípios de decisão

1. Retenção > novidade. 2. Playable em 1 sessão (<90min, senão divide). 3. Server-side por
padrão (nada que credita gold/inv/XP fica só no cliente). 4. Verifica antes de commitar.
5. Documenta o "porquê", não o "o quê".

## ⚠️ Lições críticas (não repetir)

- **NUNCA pushar `server/**` com player online.** Sempre `/manutencao` (avisa + DESLOGA todos +
  trava novas conexões) ANTES de pushar — o aviso roda no server VELHO, então dispara antes do
  push. Incidente 30/05: deploy direto com dono online zerou a conta `alcione` (itens
  irrecuperáveis). Registrado em `[[feedback-valadares-deploy]]`.
- **`/security-review` + `/code-review` comparam o branch contra `origin/main`** — código já
  shipado (`origin/main`==HEAD) dá diff vazio. Auditoria de feature já em prod tem que ser manual.
- **Render por key exata quebra item forjado** (`X_PLUS_N`): sempre resolver `getUpgradeTier(key).base`.
- **Pós-lockdown**, qualquer mutação local de hp/mp some no próximo tick — se o cliente aplica
  efeito local, o handler do server tem que aplicar autoritativo + `broadcastPstatsAll`.
- MercadoPago/DNS/Resend/Railway/electron-builder: detalhes em `ROADMAP.md` › "Lições aprendidas".

## 🛠 Convenções de trabalho

- Repo local do dono: `D:/claude/valadares` (commits via `git -C`). Branch de produção: `main`.
- Sessões em cloud: branch `claude/...`, abre PR draft.
- `SESSION_NOTES.md` guarda **só a sessão atual**; ao virar o dia/sessão, arquivar as antigas
  em `docs/archive/sessions-pre-mayXX.md` (newest-first) e refletir resolvidos no `ROADMAP.md`.

## 🎯 Foco da próxima sessão

1. **Testar/calibrar M4 3b in-game** (feito 30/05, não testável local): conectividade in-game,
   mobs presos ao piso, IA em caverna torta, balanceamento. Polish: tonalidade por profundidade
   + indicador de andar.
2. Smoke tests P0.5 (webhook MP credita 1×, T4 Caçadores HL, bot 007 1h).
3. Deferidos do audit: remover ~500 linhas de código offline + sends de protocolo residuais
   (precisam de server vivo pra validar). Refactor de movimento autoritativo (sistêmico).
