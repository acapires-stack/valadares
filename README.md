# Valadares

RPG tile-based estilo Tibia, no browser.

## Como jogar (SOLO)

Basta abrir `index.html` no browser, ou rodar um servidor estático na pasta:

```
npx serve valadares -p 3333
```

Acesse `http://localhost:3333`, digite o nome do personagem, clique **SOLO**.

## Como jogar (MULTIPLAYER)

1. Instale dependências do servidor (uma vez):
   ```
   cd valadares/server
   npm install
   ```

2. Rode o servidor:
   ```
   npm start
   ```
   Aparece `VALADARES SERVER em ws://:8080`.

3. Abra o jogo em quantos browsers/abas quiser, clique **MULTIPLAYER**.

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | Mover |
| ESPAÇO | Atacar (1 hit no monstro na direção) |
| Q | Auto-ataque (persegue alvo travado) |
| Click no monstro | Selecionar alvo |

## Sistema de skills

Cada arma tem sua própria skill que sobe com o uso:

- **Espada** (arma atual) — sobe XP a cada hit
- **Machado / Clava / Distância / Escudo** — preparados, sem armas ainda

Dano = `dmg_base + skill/3 + random(0..4)`

## Monstros

| Nome | HP | Dano | XP |
|---|---|---|---|
| Rato | 18 | 4 | 8 |
| Cobra | 35 | 8 | 18 |
| Aranha | 50 | 11 | 30 |
| Lobo | 80 | 15 | 55 |
| Orc | 140 | 22 | 120 |

50 monstros spawnam no mapa. Ficam vagando até você chegar perto (6 tiles) — aí perseguem.

## Morte

Ao morrer, volta ao spawn e perde 10% do XP atual.

## Arquitetura

```
valadares/
  index.html        ← cliente (browser)
  server/
    server.js       ← servidor WebSocket
    package.json
  README.md
```

## Próximos passos

- Diferenciar visualmente cada tipo de monstro
- Inventário e drops (poções, ouro)
- Mais armas (machado, clava, arco)
- Magias / spells (gasta mana)
- NPCs e missões
- Servidor autoritativo (combate validado no servidor)
- Persistência de personagens
