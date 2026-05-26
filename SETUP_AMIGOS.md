# Setup: Jogar Valadares com Amigos pela Internet

> Tempo total: ~20 min. Funciona com qualquer Hostinger compartilhado (não precisa Node lá).

## Arquitetura

```
┌─────────────────┐                ┌──────────────────────┐
│  Amigo (browser)│ ── HTTP ──────►│ Hostinger (estático) │
│                 │                │  index.html do jogo  │
│                 │ ─── WSS ──┐    └──────────────────────┘
└─────────────────┘           │
                              │
                              ▼
                  ┌────────────────────────┐
                  │ Cloudflare Tunnel      │
                  │ wss://xyz.trycloud...  │
                  └─────────┬──────────────┘
                            │
                            ▼
                  ┌────────────────────────┐
                  │  SEU PC (Node server)  │
                  │  ws://localhost:8080   │
                  └────────────────────────┘
```

**Resumindo:**
- Cliente HTML fica no Hostinger (junto com o site da empresa, em `/valadares/`)
- Server WS fica no SEU PC, exposto via Cloudflare Tunnel
- Amigos abrem o link no browser, conectam direto

---

## Passo 1 — Subir cliente no Hostinger

1. Entre no painel Hostinger → **File Manager**
2. Abra a pasta `public_html` (onde está o site da empresa)
3. Crie uma nova pasta: `valadares`
4. Faça upload de **um único arquivo**: `valadares/index.html` (o do seu PC)
5. Teste: abra `https://seudominio.com.br/valadares/`
   - Deve aparecer a tela de login do jogo
   - Vai mostrar "OFFLINE" porque o server ainda não tá exposto
   - **O site da empresa em `seudominio.com.br/` continua intacto**

> 💡 Se o File Manager não deixa subir HTML, tente via FTP (FileZilla). Credenciais ficam em Hostinger → **Acesso FTP**.

---

## Passo 2 — Instalar Cloudflare Tunnel no seu PC

### Windows
1. Baixa em: https://github.com/cloudflare/cloudflared/releases/latest
   - Arquivo: `cloudflared-windows-amd64.exe`
2. Renomeie para `cloudflared.exe` e coloque numa pasta acessível (ex: `C:\Tools\`)

### Verificar
Abra PowerShell e roda:
```powershell
C:\Tools\cloudflared.exe --version
```
Deve mostrar a versão.

---

## Passo 3 — Rodar o tunnel apontando pro server WS

Com o server MP rodando (`node valadares/server/server.js`), abra outra janela do PowerShell:

```powershell
C:\Tools\cloudflared.exe tunnel --url http://localhost:8080
```

Vai aparecer algo tipo:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://acid-rabbit-79-foo.trycloudflare.com                                              |
+--------------------------------------------------------------------------------------------+
```

**Anote essa URL.** Ela é o seu server WS público. Deixe essa janela aberta — fechar = tunnel cai.

> ⚠️ A URL muda toda vez que você reinicia o tunnel. Pra URL fixa, crie conta grátis Cloudflare e siga: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

---

## Passo 4 — Compartilhar com amigos

Pegue a URL do tunnel e troque `https://` por `wss://`:
- Tunnel: `https://acid-rabbit-79-foo.trycloudflare.com`
- WS:     `wss://acid-rabbit-79-foo.trycloudflare.com`

Cole no link:
```
https://seudominio.com.br/valadares/?ws=wss://acid-rabbit-79-foo.trycloudflare.com
```

Manda esse link pro amigo via WhatsApp. Ele abre, cria personagem, **a URL fica salva no navegador dele** — nas próximas vezes ele só precisa abrir `seudominio.com.br/valadares/`.

### Alternativa: amigo configura manualmente
Se você preferir mandar só `seudominio.com.br/valadares/`, o amigo clica em **"servidor"** na tela de login, cola a URL `wss://...` e salva.

---

## Checklist de operação diária

Toda vez que for jogar com amigos:

1. ✅ Liga o PC
2. ✅ Roda o server: `cd D:\claude\valadares\server && node server.js`
3. ✅ Roda o tunnel: `C:\Tools\cloudflared.exe tunnel --url http://localhost:8080`
4. ✅ Manda a URL nova pro grupo (se o tunnel rodou de novo, mudou)
5. 🎮 Joga

Quando acabar de jogar:
- `Ctrl+C` nas duas janelas
- Estado salvo automaticamente em `server/state.json` (mobs, bosses, níveis) — sobrevive a restart

---

## Solução de problemas

| Sintoma | Provável causa | Fix |
|---|---|---|
| Página abre mas fica "OFFLINE" | URL WS errada/tunnel offline | Confere a URL do tunnel, recarrega com `?ws=...` correto |
| Tunnel diz "connection refused" | Server Node não está rodando | Roda `node valadares/server/server.js` antes do tunnel |
| Amigo vê o jogo mas trava no login | Browser sem JS habilitado | Quase nunca acontece — testa em outro browser |
| Aparece outro com seu nome | Ghost ainda no servidor por 3 min | Espera 3 min, ou reinicia o server |
| URL trycloudflare expirou | Tunnel free reseta às vezes | Reroda o `cloudflared tunnel --url ...` |

---

## Próximo passo (futuro): URL fixa do servidor

Se quiser que a URL não mude (mais cômodo pros amigos), siga:
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/

Resumo: cadastra conta Cloudflare grátis → `cloudflared tunnel login` → `cloudflared tunnel create valadares-ws` → configura `~/.cloudflared/config.yml`. URL fica fixa tipo `https://valadares.seu-cf-domain.com`.

Aí dá pra hardcodar no cliente direto (sem `?ws=...`).
