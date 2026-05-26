# Railway Volume — Persistência do `state.json`

> Sem volume: o mundo (mobs, bossLevel, posições) **reseta a cada `git push`**.
> Com volume: o estado **sobrevive entre deploys**.

O código do server já lê a variável de ambiente `STATE_FILE_PATH`:

```js
const STATE_FILE = process.env.STATE_FILE_PATH || path.join(__dirname, 'state.json');
```

Só falta configurar 2 coisas no painel Railway: **criar o volume** + **setar a env var**.

---

## Passo-a-passo

### 1. Acessar o serviço
1. Abre https://railway.app/dashboard
2. Clica no projeto **valadares-production** (ou nome do seu projeto)
3. Clica no serviço Node (o que tem o `valadares` rodando)

### 2. Criar o volume
1. Na aba do serviço, procura **Settings** ou **Volumes** (depende da versão do painel)
2. Clica em **Create Volume** (ou **+ New Volume**)
3. Preenche:
   - **Name**: `state` (qualquer nome)
   - **Mount path**: `/data`
   - **Size**: o menor disponível (1GB é mais que suficiente — o state.json tem ~20-50KB)
4. **Save / Create**

O serviço vai reiniciar sozinho com o volume montado em `/data`.

### 3. Setar a env var
1. Ainda no serviço, abre a aba **Variables** (ou **Environment**)
2. Clica em **+ New Variable**
3. Preenche:
   - **Key**: `STATE_FILE_PATH`
   - **Value**: `/data/state.json`
4. **Save**

Railway vai detectar a mudança e reiniciar de novo.

### 4. Verificar nos logs

Abre a aba **Deployments** → o deployment mais recente → **View Logs**.

Procura por:
```
[state] carregado de disco — N mobs, salvo há X.Y min
```

ou (na primeira vez, antes do primeiro auto-save):
```
[world] N mobs spawnados
```

Se viu `[state] carregado`, está funcionando. ✅

---

## Como testar que persiste

1. Joga um pouco — mata um boss, deixa o nível do boss subir
2. Faz um `git push` qualquer (mesmo trivial, tipo update no README)
3. Espera Railway redeployar (~1-2 min)
4. Recarrega o cliente
5. Confere: o nível do boss continua **igual** ao que estava antes do push

> 💡 O auto-save roda a cada 60s. Se o deploy ocorrer entre saves, pode perder até 1min de estado. Pra forçar save antes do deploy: SIGINT no container (não dá no Railway sem CLI), ou simplesmente espera 60s.

---

## Resumo do que rola por baixo dos panos

| Sem volume | Com volume |
|---|---|
| Container morre → `state.json` morre junto (filesystem efêmero) | Container morre → `state.json` no `/data` é montado em outro container novinho |
| Cada push = mundo do zero | Cada push = mundo continua de onde estava |
| Bosses sempre Lv1 após deploy | Bosses mantêm progressão Lv1→10 ★ |
| `nextMobId` reseta → novos IDs do zero | IDs continuam sequenciais |

---

## Troubleshooting

| Sintoma | Diagnóstico | Fix |
|---|---|---|
| Logs dizem "spawnInitial" após cada deploy | Volume não foi montado ou env var não setada | Confere as 2 coisas no painel |
| Logs: "erro ao salvar: EACCES" | Permissão no path errado | Tenta outro mount path (`/app/data` em vez de `/data`) |
| Mundo persiste mas tá bugado | Pode ter mob legado num tile inválido | `rm /data/state.json` (via Railway CLI) força mundo novo |
| Disk full no Railway | Improvável (state.json < 1MB) | Aumenta o volume ou limpa estado |

---

## Comando útil (Railway CLI, opcional)

Se quiser inspecionar/limpar o estado direto:

```bash
# Instala Railway CLI (1x só):
npm install -g @railway/cli
railway login

# Conecta no projeto:
railway link

# Vê o state.json:
railway run cat /data/state.json | head -100

# Reset do mundo (apaga state.json, próximo restart spawnInitial roda):
railway run rm /data/state.json
```
