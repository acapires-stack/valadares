---
slug: lancamento
title: Valadares está no ar — RPG tile-based no navegador
date: 2026-05-28
summary: Depois de uma sprint maluca de produção, o Valadares ganhou domínio próprio, cliente desktop e monetização. Esse é o primeiro post do devlog — vou usar esse espaço pra contar os bastidores.
tags: [lançamento, milestone]
---

## ⚔ O jogo está no ar

Valadares é um RPG tile-based online no navegador, inspirado em Tibia. Combate, forja, party, guild, raid bosses, PvP com selos — tudo direto no browser, sem download obrigatório.

- 🌐 Joga online: [valadares.app.br/jogar](https://valadares.app.br/jogar)
- 🖥 Cliente desktop (Electron): [valadares.app.br/#download](https://valadares.app.br/#download)
- 📱 Mobile: roda no celular também
- 🏆 Ranking público: [valadares.app.br/ranking](https://valadares.app.br/ranking)

## 🧭 Por que esse devlog existe

Eu venho trabalhando no Valadares em sessões longas com o Claude Code, e cada sessão deixa um rastro grande de decisões — vulnerabilidades fechadas, sistemas que migraram pro server, escolhas de stack, lições aprendidas.

A maior parte disso some no histórico do git. Esse devlog é um lugar pra registrar **o "porquê"** das decisões — não só o "o quê". E pra quem chegou agora, é um catálogo dos bastidores.

## 🛠 Stack atual

| Camada | Tecnologia |
|---|---|
| Cliente | HTML/JS puro (~11k linhas em `play.html`) |
| Server | Node.js + ws (WebSocket) na Railway |
| DNS / CDN | Cloudflare (DNS only, sem proxy) |
| Estático | Vercel |
| Desktop | Electron + electron-updater |
| Email transacional | Resend |
| Pagamentos | MercadoPago Checkout Pro |
| Domínio | valadares.app.br (Registro.br) |

Server autoritativo: tudo que envolve gold, inventário, equipamento, baú, skills, HP/MP, mobs e PvP roda no server. F12 no cliente não muda nada que importa.

## 🎯 O que vem por aí

Os próximos posts cobrem:

- A sprint de produção que tirou o jogo do single-player e colocou em prod em 4 dias
- A maratona de segurança que fechou 17 vulnerabilidades em duas sessões
- O overhaul mobile (que veio porque a esposa achou ruim no celular)

Bem-vindo ao devlog. ⚔
