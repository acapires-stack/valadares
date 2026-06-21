# Valadares

RPG tile-based estilo Tibia, jogável no browser. MMO **online** (servidor autoritativo), com contas, PvP, masmorra procedural, magias, craft, quests, arena e leilão.

🎮 **Jogar:** https://valadares.app.br/jogar
🖥️ **Cliente desktop (Windows):** baixe em https://valadares.app.br (seção Download)

## Como jogar

1. Abra https://valadares.app.br/jogar
2. Crie a conta (nome + email + senha — o email serve pra recuperar a senha)
3. Entre e jogue. Progresso fica salvo no servidor (some do cliente não perde nada).

> Não há mais modo SOLO/offline — o jogo é online-only.

## Controles

| Tecla | Ação |
|---|---|
| `WASD` / setas | Mover (diagonais ok) |
| `ESPAÇO` | Atacar / engajar o alvo |
| `TAB` | Trocar de alvo · clique mira um alvo |
| `R` | Lançar magia (precisa comprar no altar, tecla `M`) |
| `F` | Arremessar lança |
| `E` comer · `B` baú · `C` craft · `M` altar · `T` treino | Ações |
| `Q` quests · `I` stats · `K` talentos · `L` ranking · `N` amigos · `O` opções · `P` PvP | Painéis |

No mobile, os botões na tela cobrem mover/atacar e os painéis.

## Desenvolvimento local

**Cliente** (estático, sem build):
```
npx serve valadares -p 3333          # ou: python -m http.server 3333 --directory .
```
Abre em `http://localhost:3333`. O jogo é `play.html` (servido em `/jogar` em produção); `index.html` é a landing.

**Servidor** (Node ≥18):
```
cd server
npm install        # uma vez
npm start          # = node server/server.js → ws://localhost:8080
```

> O cliente tem um *version-gate* que força reload quando a versão diverge do servidor. Pra logar contra um servidor local, sete `CLIENT_VERSION = '1.0.9'` antes do login (no console ou editando o cliente). Combate é bloqueado na zona segura (PZ, raio 4 no centro 50,50) — saia de 46–54 pra testar luta.

## Arquitetura

```
valadares/
  play.html          ← o jogo (HTML/JS/Canvas, single-file)
  index.html         ← landing bilíngue PT/EN
  ranking.html · admin.html · reset.html · terms.html · privacy.html
  server/
    server.js        ← servidor WebSocket + REST (single-file, autoritativo)
    _test_*.js       ← harnesses de teste standalone (node _test_xxx.js)
  electron/          ← wrapper desktop Windows (auto-update via GitHub Releases)
  devlog/            ← gerador estático de devlog (node devlog/build.js)
  docs/              ← designs e auditorias de segurança
  ROADMAP.md · SESSION_NOTES.md
```

**Servidor autoritativo (lockdown N3):** gold, inventário, equipamento, baús, skills e hp/mp são 100% server-side — o cliente só espelha. Protocolo WebSocket por frames JSON `{t:'...'}`. Persistência em `state.json` (mundo) + `accounts.json` (contas/saves) no Volume `/data` do Railway.

**Produção:** cliente no **Vercel** (`valadares.app.br`), servidor no **Railway** (`wss://ws.valadares.app.br`), Cloudflare na frente, pagamentos via MercadoPago, email via Resend.

> Detalhes de operação, deploy e o ritual de manutenção antes de pushar o servidor estão no [`CLAUDE.md`](CLAUDE.md) e no [`ROADMAP.md`](ROADMAP.md).
