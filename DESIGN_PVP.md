# Sistema PvP — Selos de Sangue + Highlander

> Design alinhado em sessão de perguntas/respostas (cada decisão validada pelo player).
> Pode ser revisado no futuro mudando aqui antes de codar.

---

## 1. Pré-requisitos pra entrar em PvP

- Player precisa ter **pelo menos 5 000 gold** pra ligar PvP
- Se gold cair abaixo durante PvP ativo: aviso no log, mas PvP continua até manualmente desligar
- Tecla **P** alterna PvP (já existe)

## 2. Selos de Sangue

Cada PK kill = +1 nível de Selo (cap **5**).

| Nível | Bônus |
|---|---|
| 1 | +10% dano |
| 2 | +10% dano + 10% crit |
| 3 | +10% dano + 10% crit + 10% velocidade |
| 4 | +10% dano + 10% crit + 10% velocidade + HP regen 2× |
| 5 | Tudo combinado |

- **Duração:** até morrer (selos não expiram sozinhos)
- **Visual:** ☠ vermelho escalando (mais brilhante por nível)

## 3. PZ Lock

- **3 selos ou mais** → bloqueado da PZ por **5 minutos**
- Timer reseta ao morrer
- Se entrar na PZ enquanto bloqueado, é jogado pra fora

## 4. Highlander — "Só pode haver Um"

**Ascensão:**
- Acumular 5 selos
- **5º kill precisa ser em alguém com pelo menos 1 selo** (não vale farmar noob)
- Ao virar Highlander, anúncio global no chat: `⚔ X virou o Highlander!`

**Bônus extras (cumulativos com selos):**
- +20% dano
- +30% velocidade
- HP/MP regen 2× (cumulativo com selo 4)
- 👑 **Coroa dourada** flutuando acima do nome
- **Aura dourada pulsante** ao redor

**Duração:** Indefinido, até morrer (mesmo se selos caírem)
**PZ:** Pode entrar normal

**Quando morre:**
- Anúncio: `⚔ Y derrotou o Highlander X!`
- Trono fica **vago** (próximo precisa ascender pelo critério normal)
- Matador ganha **Coração do Highlander** (item)

## 5. Coração do Highlander

**Tipo:** Item equipável (slot novo **Pescoço**) + material de craft

**Stats equipado:**
- +10% dano
- +5% velocidade

**Regras:**
- Só **1 equipado** por vez
- Demais ficam no inventário
- Usado em crafts lendários futuros (ex: Espada do Highlander = 3 Corações)

## 6. Vingança

**Janela:** 5 minutos após morrer pra um player

**Vingador (vítima original):**
- Mata o killer dentro da janela
- **Recupera 100% das skills perdidas** na morte original

**Killer (vingado):**
- Sofre **60% de perda de skills** (dobro da pena normal)
- Sem chance de recuperar (vingança não tem vingança)

## 7. PK Death (morrer pra outro player)

- Perde 30% das skills (normal)
- Perde 60% se foi morto em vingança válida
- **20% do gold carregado** cai pro killer
- Não dropa itens do inventário

## 8. Visual no canvas

| Estado | Aparência |
|---|---|
| PvP off | Normal |
| PvP on (sem selo) | ☠ pequeno vermelho |
| Selo 1-2 | ☠ médio + corpo levemente avermelhado |
| Selo 3-4 | ☠ intenso + aura vermelha leve |
| Selo 5 | ☠ máximo + aura vermelha forte |
| **Highlander** | 👑 coroa dourada + aura dourada pulsante + nome em dourado |

## 9. Fases de implementação

| Fase | Entrega |
|---|---|
| 1 | Regra 5k gold + selos + bônus + PZ lock + visual |
| 2 | Highlander (ascensão, coroa, bônus, anúncio) |
| 3 | Coração (item, slot Pescoço, drop ao matar) |
| 4 | Vingança (timer, recovery, dupla pena) |
| 5 | PK gold drop (20%) |

## 10. Ideias futuras (não implementar agora)

- Crafts lendários com Coração (Espada do Highlander, Armadura do Conquistador)
- Ranking público de PKs (kill count)
- Bandeira de guilda quando integrar guildas
- Recompensa em ouro do servidor por desafiar Highlanders
- Eventos especiais (Highlander Hunt: todos ganham bônus pra caçar o Highlander atual)
