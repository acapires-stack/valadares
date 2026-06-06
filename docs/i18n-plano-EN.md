# Internacionalização (EN) — Levantamento + Plano de Contingência

> **Status:** EM ANDAMENTO — **Fase 0 (infra) + Fase 1 parcial (UI estática) FEITAS 06/06** (local, cliente-only, NÃO-pushado: commits `87a6bd8`+`7e9e96a`). Ver §8 e SESSION_NOTES.
> **Natureza:** começou como contingência; o dono pediu pra iniciar. Demais fases = quando o dono aprovar/expandir.
> **Escopo combinado com o dono:** apenas (a) uma **opção EN dentro do jogo** (toggle PT/EN)
> e (b) **página(s) escritas em EN** (landing/marketing). **NÃO** inclui dobrar
> comunidade/suporte/marketing — o jogo fica bilíngue, a **operação segue PT-first**.
> **Levantamento medido em:** 05/06/2026 (play.html 15.121 linhas / server.js 8.084 linhas).

---

## 1. Decisão estratégica (resumo)

- Ter feito o jogo em **PT-BR foi a escolha certa pra começar**: Tibia-like + Brasil é
  o público mais apaixonado do gênero, na própria língua; dev **solo** rende mais marketando/
  suportando no idioma nativo; MercadoPago + `.br` já casam com esse público.
- **Inglês é ADITIVO, não rebuild.** É uma feature (i18n), não refazer o jogo.
- **Gatilho de ativação** (ver §7): puxar isto só quando houver sinal de expansão
  (tração no PT saturando, players EN pedindo, ou vontade de marketing global).

---

## 2. Levantamento — inventário de strings (medido)

| Balde | O que é | Qtd medida | Dificuldade |
|---|---|---|---|
| **Dados de conteúdo** | nomes/descrições de itens, magias, mobs, NPCs, quests | ~330 entradas (319 no play.html¹ + 30 no server) | 🟢 Fácil (troca 1:1) |
| **Mensagens do cliente** | chamadas `log()` (chat/avisos) | 248 (**143 dinâmicas**²) | 🟡 Média |
| **Mensagens do server** | envios `{t:'serverMsg', text:...}` | 152 (**68 dinâmicas**²) | 🟡 Média + decisão de arquitetura (§3) |
| **Texto de combate** | floats (dano, "Esquivou!") | 39 | 🟢 Fácil |
| **Tooltips HTML** | `title=` / `placeholder=` | 44 | 🟢 Fácil |
| **UI estática** | `<button>` + cabeçalhos de painel | ~125 botões + ~100–150 labels | 🟢🟡 Fácil-média |
| **SUBTOTAL in-game** | | **≈ 950–1.050 strings** | |
| **Páginas avulsas** | index/terms/privacy/ranking/reset | ~1.700 linhas de prosa | 🔵 Bloco separado |

¹ Padrão `name/desc/title/label/text/hint/tip: '...'`.
² **Dinâmicas** = template literal com `${}` (ex.: `Respec custa ${COST}g`). São **~211 no total** —
a parte cara: viram template parametrizado e batem na gramática (ordem das palavras EN ≠ PT).

**Observações que reduzem o custo:**
- O `server.js` é **fortemente comentado em PT** (701 das 945 linhas com acento são comentário) →
  **comentário não traduz**. Sobram ~244 linhas reais no server.
- O cliente **já renderiza conteúdo por chave** (nomes vivem no `play.html`); o server fala por
  IDs/chaves na maior parte — só **manda texto pronto** nas 152 `serverMsg` (ver §3).
- Português é mais "comprido" e tem gênero/concordância; **EN costuma ser mais curto** → o layout
  que cabe em PT quase sempre cabe em EN (pouco risco de quebrar tela).

---

## 3. Arquitetura

**Núcleo:** função `t(chave, params)` + dicionários `pt` / `en` + **toggle PT/EN** (default PT) +
persistência (`localStorage`) + **fallback** (chave faltando mostra o outro idioma, nunca tela em branco).

**A bifurcação que define o custo — mensagens do server:**
o server hoje manda texto pronto (`{t:'serverMsg', text:'Precisa de uma wand'}`). Pra traduzir:

- **Opção A (limpa):** server manda **chave** (`key:'need_wand'`), cliente traduz. Mexe nos 152
  envios + no render. Arquitetura correta, mais trabalho.
- **Opção B (pragmática, recomendada p/ começar):** server guarda o **idioma do player** no login e
  traduz com um helper `tr(p,'need_wand')` + dicionário no server. Menos invasiva; duplica dicionário
  (client+server), mas é o caminho rápido e seguro pra um jogo vivo.

**Guarda anti-vazamento (essencial):** um `grep`/check (pre-commit ou CI) que **rejeita string em PT
solta** (acento fora do dicionário). É a defesa contra o modo de falha nº1 do i18n indie: *language leak*
(hardcodar PT por pressa) e *drift* (mudar PT e esquecer o EN).

---

## 4. Plano em fases (cada etapa já vai pro ar sozinha)

**Não é big-bang.** Solta parcial e completa com o tempo — risco baixo, sempre jogável.

| Fase | Entrega | Esforço |
|---|---|---|
| **0** | Scaffolding: `t()` + dicionários + toggle + fallback + guard | ~1 sessão |
| **1** | **UI principal** traduzida → *"o jogo abre em inglês"* (já anunciável) | ~1–2 sessões |
| **2** | Mensagens: `log()` + floats + `serverMsg` (inclui as ~211 dinâmicas) | ~1–2 sessões |
| **3** | **Conteúdo**: itens, magias, mobs, NPCs, quests | ~1–2 sessões |
| **4** | **Páginas em EN**: landing (index) primeiro; legal (terms/privacy) opcional | ~1 sessão |

> **Total bem-feito: ~6–8 sessões — mas fatiável** em semanas, sempre com o jogo no ar.
> MVP (toggle + UI + mensagens-chave, conteúdo fica PT) cabe em **~2–3 sessões**.
> Conteúdo de lore/flavor é a **menor prioridade** — pode ficar em PT mais tempo; traduz só o funcional.

---

## 5. Como nós dois executaríamos (o fluxo real)

A divisão é a **mesma de hoje**:

- **Claude faz:** scaffolding, extração das ~950 strings em lotes, **tradução PT↔EN na hora**
  (sem tradutor externo / sem ferramenta de localização), e o guard anti-vazamento.
- **Dono faz:** testa **cada lote in-game** (como já faz) e dispara **`/manutenção`** nos lotes
  que tocam `server/**`.

**Dia a dia depois de pronto** (praticamente idêntico ao atual):
1. Dono pede uma feature → 2. Claude coda **já com as duas línguas** (string nasce no dicionário) →
3. Dono testa in-game e deploya. Custo extra por feature: **~5–10%** (não 2×); guard avisa se vazou.

---

## 6. Riscos e regras (jogo vivo, usuários reais)

- **Ritual de deploy** ([[feedback-valadares-deploy]]): lote que toca `server/**` exige `/manutenção`
  + logout limpo ANTES. NUNCA pushar server com player online.
- **`play.html` é arquivo único gigante** (15k linhas) → find/replace em massa é arriscado;
  fazer em lotes + **teste in-game por lote** (um `t()` digitado errado = label em branco/cliente quebrado).
- **Fallback obrigatório** pra nunca exibir tela em branco em chave faltante.
- **Vercel** (cliente) e **Railway watch paths** (só `server/**`/`package.json`/`Dockerfile`/`railway.json`
  reconectam) — push só-de-cliente não derruba ninguém.

---

## 7. Gatilho de ativação (quando puxar isto)

Executar quando aparecer **sinal real de expansão**, p.ex.:
- crescimento no público PT desacelerando / mercado saturando;
- players de fora pedindo inglês;
- decisão de investir em **marketing global** / streamers internacionais;
- um **clipe/vídeo** começar a vazar pra fora do Brasil.

Até lá: **PT-BR é o padrão e está certo.** Este doc é só o roteiro guardado.

---

## 8. Estado atual (atualizado 06/06)

- **Fase 0 (infra) + Fase 1 PARCIAL FEITAS** — `play.html`, cliente-only, **NÃO-pushado**
  (commits `87a6bd8` núcleo + `7e9e96a` tutoriais). Testado no preview (flip por clique,
  persistência no reload, console limpo).
- **Coberto (61 marcações `data-i18n`):** login + toggle PT|EN (login+Opções) + modal de Opções
  (+seção idioma) + barra de controles + tutorial de boas-vindas + tutorial mobile.
- **Infra:** `tr(key,params)` (⚠️ `tr`, não `t`) + `applyI18n()` (data-i18n / -ph / -title / -html)
  + `LANG` (detecta navegador + persiste localStorage) + fallback lang→pt→chave + `setLang()`.
- **Falta (com o dono):** HUD in-game · mensagens dinâmicas (~211) · conteúdo (~330) · demais modais
  · mensagens do server (locale no server) · páginas avulsas (index/terms/privacy). Padrão pronto:
  marcar `data-i18n*` + chave no dict pt/en.
- **Deploy (quando o dono aprovar):** `git push origin main` — **cliente-only, SEM /manutenção**.

---

## 9. Fase 2 — FEITA (06/06)

**Mensagens dinâmicas traduzidas: `log()` + floats (cliente) + `serverMsg` (server).**

### Cliente (`play.html`) — ✅ pronto, deploy SEM /manutenção
- **~230 chaves** `log.*` / `float.*` / `lbl.*` no dict `pt`/`en` (paridade 227/227, **0 vazamentos**).
- **247 `log()`** player-facing → `tr('log.x', {params})`. Sobraram 25 intencionais: 3 já
  traduzidos via `tr('lbl.*')` (classe CSS dinâmica), 7 sem PT (interpolação/`serverMsg` relay),
  **15 admin** (`[admin]`, "Só admin", "Digite o nome da conta") deixados em PT (operador).
- **10 floats** de texto (Esquivou!/SEM FLECHAS/VENENO/…); numéricos não traduzem.
- `join` agora manda `lang: LANG` pro server (Opção B).

### Server (`server/server.js`) — ✅ pronto, deploy **EXIGE /manutenção**
- **Opção B**: `p.lang` capturado no join (fallback PT = zero regressão p/ cliente legado).
  `I18N_SRV {pt,en}` + `trp(p,key,params)` + `broadcastMsgKey()` (traduz por destinatário).
- **97 chaves** `srv.*` (paridade 97/97, 0 vazamentos). ~95 `serverMsg` player-facing → `trp(...)`.
- Deixados PT de propósito: bloco **admin** (`/say`,`/deluser`,`/setskills`… ~36), maintenance,
  e **`5656`** ("entrou em outro lugar") — o cliente detecta sessão-duplicada por `text.includes`,
  traduzir quebraria o anti-loop.

### Verificação
- Cliente: preview console limpo, flip PT/EN OK, render de amostras OK, paridade+leak OK.
- Server: `node --check` OK, **boota limpo** (585 mobs), paridade+leak OK.

### Ordem de deploy (importante)
1. **Cliente primeiro** (Vercel, sem /manutenção): novo cliente manda `lang`; server velho ignora → PT, sem regressão.
2. **Server depois** (Railway, watch paths) sob **/manutenção** + 0 players: aí o EN do server passa a fluir.

### Fase 2.5 (pendente — NÃO feito): toasts client-side `showServerToast('event','PT…')` +
dicts de erro inline (dye/auction/pet/arena-cancel/dungeon) + auth `msgs` + questResult `reasons`.
São banners/labels separados do log; ficam PT até a 2.5. **Fase 3** segue = conteúdo (itens/magias/mobs ~330).
