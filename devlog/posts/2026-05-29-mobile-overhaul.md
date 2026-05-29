---
slug: mobile-overhaul
title: Mobile overhaul — quando a esposa achou ruim no celular
date: 2026-05-29
summary: Top-bar fixa, hotbar inferior com 5 botões, onboarding mobile específico e orientation lock. O melhor feedback de UX vem de quem nunca jogou nada parecido.
tags: [mobile, UX, design]
---

## 📱 O catalisador

Mostrei o jogo pra esposa. Desktop ela curtiu — visual escuro, fonte Cinzel, atmosfera de Tibia. No celular ela tentou jogar e travou em 30 segundos.

> "Não consigo achar onde aperta pra usar poção. E tá pequeno. E quando viro o celular fica esquisito."

Esse foi o melhor user feedback possível. Ela não sabia o que era hotbar, não tinha referência de RPG, e ainda assim apontou exatamente os 3 problemas que importavam:

1. **Discoverability** — onde clica?
2. **Tamanho de toque** — alvo pequeno demais
3. **Orientation** — landscape vs portrait

## 🎯 Fase A — Top-bar mobile fixa

Desktop tem HUD flutuante com HP/MP em cantos. No celular isso vira "onde tá meu HP?" porque o jogador olha pro centro da tela.

Fix: top-bar fixa quando `body.touch` está ativo. HP/MP em barras horizontais largas + gold + nome do player. Sempre visível, sempre no topo.

```css
@media (pointer: coarse) {
  body.touch .mobile-topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    /* ... */
  }
}
```

Detecção via `pointer: coarse` + classe `touch` no body só ativa em mobile. Desktop não muda nada.

## 🎮 Fase B — Hotbar inferior com 5 slots

A hotbar desktop tem 12 slots numerados (1-9, 0, -, =). No mobile isso é overkill — ninguém aperta 12 botões diferentes com o polegar.

Reduzi pra 5 slots fixos com os essenciais:

- 🧪 HP — poção de vida
- 💧 MP — poção de mana
- 🍖 COMER — food
- ✦ MAGIA — abre menu de magias
- ↗ LANÇA — ataque à distância

Cada slot é um quadrado de 56×56px (Apple HIG recomenda 44×44 mínimo). Tap = uso. Esses 5 cobrem 95% do gameplay mobile.

## 🎓 Fase C — Onboarding mobile

Tutorial desktop assumia teclado e mouse. No mobile precisava reescrever:

- "Toque na tela pra andar" em vez de "WASD"
- "Mantenha pressionado pra atacar" em vez de "espaço"
- "Arraste pra esquerda na tela pra abrir inventário" em vez de "I"

Detecção: se `body.classList.contains('touch')`, mostra tutorial alternativo. Texto curto, screenshot real do botão correspondente.

## 🔄 Fase D — Orientation lock

Esse foi o mais chato. Jogo é landscape por design — câmera + chat + barras só fazem sentido com tela larga.

Em portrait fica esmagado. Solução: detectar e bloquear com overlay.

```js
function checkOrientation() {
  if (window.innerHeight > window.innerWidth) {
    document.body.classList.add('portrait-lock');
  } else {
    document.body.classList.remove('portrait-lock');
  }
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
```

CSS:

```css
.portrait-lock::before {
  content: "Vire o celular pra modo paisagem";
  position: fixed;
  inset: 0;
  background: #0a0805;
  color: #d4a847;
  /* center text + ícone de rotação */
  z-index: 9999;
}
```

Simples e brutalmente eficaz. Vira o celular ou não joga.

## 🛠 Decisões que valeram

**1. Não fazer "design responsivo" puro.** Fazer mobile-first com fork explícito no `body.touch`. Tentar fazer o HUD desktop "encolher" pro mobile sempre vira problema. Reescreve o HUD pra mobile, mantém os 2 lados separados.

**2. Tap area ≥ 56px.** Apple HIG diz 44px. Material diz 48px. Eu fui 56px por margem de erro com dedos grandes / unhas / luvas no inverno. Dá uma diferença visível.

**3. Zero "swipe gestures" não-óbvios.** Mobile gamer médio não conhece swipe esquerda pra inventário. Botão visível > gesto.

**4. Loop "mostra → quebra → fix" com testers reais.** Esposa quebrou em 30s. Mãe quebrou de outro jeito no desktop. Esse loop é mais útil que qualquer "best practice de UX mobile".

## 🖥 Bonus track — desktop também precisou de carinho

A mãe testou o Electron na semana seguinte e quebrou de jeitos diferentes:

- **v1.0.5**: maximize() com `ready-to-show` + zoom auto pra resolução 1080p
- **v1.0.6**: `setInterval` 15min pra auto-update + botão manual no menu + log persistente
- **v1.0.7**: server gate de versão (detecta Electron via UA + clientVersion) + modal "versão antiga"
- **v1.0.8**: F11 com triple backup (menu accelerator + globalShortcut + before-input-event)

Cada bump foi um print da mãe no WhatsApp dizendo "tá assim agora". 4 versões em uma noite.

## 📊 Métricas da sessão

- 13 commits, ~10h
- 5 releases Electron (v1.0.4 → v1.0.8)
- 0 incidentes em prod com players reais
- ~1100 / -200 linhas líquidas

## 🧠 A lição

Best practice de UX mobile mais valiosa: **assistir um não-gamer tentar jogar**. Em 30 segundos você vê 3 problemas que documentação nenhuma cobre.

Próxima sessão: feature P1. Provavelmente dungeons instanciadas ou casa de leilão. Vou contar como foi.
