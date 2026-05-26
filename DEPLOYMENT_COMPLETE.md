# Deployment Valadares

Status do deploy + próximos passos.

---

## ✅ Concluído

### Server WebSocket — Railway
- **URL pública:** `wss://valadares-production.up.railway.app`
- **Plataforma:** Railway.app
- **Runtime:** Node + `ws` lib
- **Persistência:** `state.json` salvo no container (atenção: efêmero entre redeploys — ver "Persistência em produção" abaixo)
- **Status:** ✅ rodando

### Cliente — apontando pro Railway
- **Arquivo:** [`index.html`](index.html) (commit `65e5a56`)
- **Lógica de resolução** ([index.html:3330-3354](index.html:3330)):
  1. `?ws=wss://...` na query string (override)
  2. `localStorage 'valadares:ws'`
  3. localhost → `ws://localhost:8080`
  4. **Qualquer outro host → `wss://valadares-production.up.railway.app`** ← Railway
- **Git:** commitado e pushado pro GitHub `acapires-stack/valadares` (branch main)

---

## 🚀 Pendente — deploy do cliente no Vercel

**Por que Vercel:** hospedagem estática grátis, deploy via Git push, SSL automático, CDN global. URL tipo `valadares-xyz.vercel.app`.

**Passos** (aguardando comando do guia/AI parceira):
1. Criar conta Vercel (login com GitHub)
2. Importar repositório `acapires-stack/valadares`
3. Configurar:
   - Framework: **Other** (é HTML puro, sem build)
   - Root Directory: `valadares` (porque o `index.html` está numa subpasta)
   - Build Command: (vazio)
   - Output Directory: (vazio, vai servir o root direto)
4. Deploy
5. Acessar URL Vercel — deve carregar e conectar no Railway automaticamente

---

## 🧪 Como testar agora (antes do Vercel)

### Teste 1 — localhost (sem mudanças)
```bash
cd D:\claude\valadares
npx serve . -p 3333
```
Abre http://localhost:3333 — vai conectar em `ws://localhost:8080` (server local).
> ⚠️ Pra esse modo, precisa rodar `cd server && node server.js` também.

### Teste 2 — qualquer URL não-localhost
Abre o `index.html` direto no browser via `file:///D:/claude/valadares/index.html`:
- Hostname vazio → cai no fallback de localhost
- **Não vai testar o Railway** assim

Pra testar Railway agora mesmo, **adiciona `?ws=`**:
```
file:///D:/claude/valadares/index.html?ws=wss://valadares-production.up.railway.app
```

Ou abre em qualquer hosting estático (Netlify Drop, GitHub Pages, etc) — vai usar Railway sozinho.

---

## ⚠️ Atenção: Persistência em produção

O `state.json` é salvo **dentro do container do Railway**. Quando você dá deploy novo (push de código), o container é **recriado e perde o state.json**.

**Soluções pra dados sobreviverem deploys:**

| Opção | Como | Custo |
|---|---|---|
| **Railway Volumes** | Cria volume persistente no painel Railway, monta em `/data`, ajusta `STATE_FILE` pra `/data/state.json` | Grátis até 5GB |
| **Postgres/SQLite externo** | Substitui JSON por DB (Railway tem Postgres free tier) | Grátis até limites |
| **Supabase/Turso** | DB hospedado externo | Free tier generoso |
| **Ignorar** (mundo resetar a cada deploy) | Não faz nada — é só pequeno problema | Zero |

Recomendação **inicial**: usar **Railway Volume** quando quiser dados persistentes entre deploys.

```bash
# No Railway painel:
# 1. Vai em Settings → Volumes
# 2. Cria volume "state", monta em /data
# 3. Adiciona env var: STATE_FILE_PATH=/data/state.json
```

E ajusta no `server.js`:
```js
const STATE_FILE = process.env.STATE_FILE_PATH || path.join(__dirname, 'state.json');
```

(Isso já fica pra depois — agora foca em colocar o Vercel no ar.)

---

## 📋 Checklist de deployment

- [x] Server WS subido (Railway)
- [x] URL Railway funciona (`wss://valadares-production.up.railway.app`)
- [x] Cliente apontando pra Railway em produção
- [x] Commit + push pro GitHub
- [x] **Deploy cliente no Vercel** — `valadares-xi.vercel.app` ✅
- [x] **Railway Volume montado** — `/data/state.json` ✅ (state persiste entre deploys)
- [x] **vercel.json no-cache** — reload simples já pega versão nova
- [x] **Auto-update silencioso** — cliente recarrega sozinho ao detectar deploy novo
- [x] **Railway Hobby plan pago** — sem dormir
- [ ] Compartilhar URL com amigos
- [ ] (Opcional) Domínio customizado no Vercel (se quiser usar seu próprio)

---

## 🗂 URLs relevantes

| Recurso | URL |
|---|---|
| **Cliente local** | http://localhost:3333 (precisa `npx serve`) |
| **Server local** | ws://localhost:8080 (precisa `node server/server.js`) |
| **Server produção** | `wss://valadares-production.up.railway.app` |
| **Cliente produção** | (em breve via Vercel) |
| **Repo GitHub** | https://github.com/acapires-stack/valadares |
| **Railway dashboard** | https://railway.app/dashboard |

---

## 🆘 Problemas comuns

| Sintoma | Diagnóstico | Fix |
|---|---|---|
| Cliente Vercel não conecta | Railway dormiu / fora do ar | Visita o dashboard Railway, vê se serviço rodando |
| WS conecta mas dá `1006` em segundos | Railway free tier pode dormir após X min sem tráfego | Considera Hobby plan ($5/mês) sem sleep |
| Mundo resetou após push | Railway recriou container, perdeu state.json | Implementa Railway Volumes (ver acima) |
| `Mixed content` no console | Cliente HTTPS tentando ws:// (não wss://) | A função `resolveWsUrl` já força wss em produção, mas confere URL no localStorage com `setWsUrl(...)` |

---

## 📝 Próximas mensagens esperadas

Quando você (ou a AI parceira) der continuidade:
- **"Crie o deploy no Vercel"** → eu falo o passo-a-passo no painel
- **"Vercel deu erro X"** → eu diagnostico
- **"Quero domínio próprio"** → eu configuro DNS no Vercel/Railway
- **"Quero persistência"** → eu implemento Railway Volumes + ajusto server.js
