---
slug: endgame-e-arena
title: Prometi uma dungeon. Saiu o endgame inteiro.
date: 2026-06-04
summary: As Profundezas, Casa de Leilão, Tinturaria, Pets, árvore de talentos de verdade, combate autoritativo e Arena PvP 1v1. Duas semanas em que o jogo deixou de ser "jogável" pra ter pra onde ir depois do primeiro boss.
tags: [endgame, pvp, dungeon, design, anti-cheat]
---

## 📌 De onde a gente parou

O último post terminou assim: *"Próxima sessão: feature P1. Provavelmente dungeons instanciadas ou casa de leilão."*

Fiz os dois. E não parei aí. Nas duas semanas seguintes o Valadares deixou de ser um jogo que você **termina** (mata os 3 bosses, forja +5, e aí?) pra um jogo que tem **endgame** — lugar pra ir, gente pra enfrentar, build pra otimizar. Esse post é o apanhado.

## 🕳 As Profundezas — a masmorra que NÃO é instanciada

A primeira decisão foi a mais importante, e foi de design, não de código.

A tentação óbvia era fazer dungeon instanciada: você entra, é só seu, farma em paz. Mas num jogo com PvP isso é veneno — **farm seguro = pay-to-win fácil**. Quem joga mais horas em segurança vira intocável.

Então As Profundezas é o contrário: masmorra **aberta e mortal**, estilo Tibia. 5 andares, cada um com cavernas **geradas na hora** (cellular automata semeado pelo número do andar — mesmo andar, mesmo mapa; andar novo, caverna nova). Pisou lá dentro, **PvP liga sozinho**. Os mobs (Sombra Errante, Carrasco Abissal) escalam **+60% por andar** — no quinto, são quase 3,5× os do primeiro. E lá no fundo mora o **Senhor das Profundezas**: 5000 de vida, loot de topo, dividido por quem mais bateu.

Sem regra de morte nova: morreu pra mob, perde 15% das skills e volta pra cidade (perdeu a descida). Morreu pra player, o killer leva seu ouro. As penalidades que já existiam bastaram.

## 🏛 Casa de Leilão e 🎨 Tinturaria — a economia ganha vida

Com ouro entrando, ele precisa **sair**. Dois sumidouros novos:

- **Casa de Leilão** (NPC Leiloeiro): anuncia um item por 24h, o servidor segura no escrow, 5% de comissão na venda. Pela primeira vez o preço das coisas é decidido pelo mercado, não por mim numa tabela.
- **Tinturaria** (NPC Tintureira): 4 peças tingíveis, 12 cores. Puramente cosmético, puro gold sink. Vaidade é o melhor imposto.

## 🐾 Pets que ajudam sem desequilibrar

Pet "ter por ter" é fraco. Pet que dá dano vira pay-to-win. Então os pets do Valadares dão poder **fora do combate**: Tatu-Cofre (+ouro), Vaga-lume (+XP), Gato Preto (+sorte no loot), Espírito Vital (+regen). Você adota no Domador, equipa um, e ele sobe de nível matando ao seu lado — economia e conveniência, nunca dano cru.

Detalhe técnico que me deu trabalho: o bônus do pet é **derivado no servidor** na hora do uso, nunca gravado no personagem. Misturar buff de pet com os buffs permanentes teria reintroduzido uma casta de bugs de save que já tinham me mordido antes.

## 🌟 Talentos viram uma árvore de verdade

Um print de um jogador escancarou o problema: os 6 talentos antigos, **todos maxados**, e **24 pontos parados** sem onde investir. Endgame nenhum.

Aí a árvore cresceu: **14 talentos, até 5 ranks cada**. Dano, crítico, mana, velocidade de ataque, vampirismo, redução de dano, sorte — e a 🕯️ **Segunda Chance**, que revive você uma vez por luta. Errou a build? **Respec por 5000 de ouro** redistribui tudo.

Esse aqui me ensinou uma lição cara sobre persistência. Mudei talento de "tem/não tem" pra "rank de 0 a 5" e esqueci de atualizar **um** dos lugares que salvavam — e a cada save os ranks colapsavam pra 1. Quando você muda a forma de um dado, varre **todos** os pontos onde ele é gravado, não só o principal.

## 🔒 O dia em que o cliente parou de ser confiável

Conteúdo é bonito, mas teve uma onda que foi pura fundação: **mover o combate e o movimento pro servidor**.

Antes, o cliente dizia "andei pra cá" e "dei tanto de dano" — e o servidor confiava. Em PvP isso é convite pra trapaça (teletransporte, dano inflado, atravessar parede). A reescrita validou tudo no servidor, com uma filosofia que evitou quebrar o jogo: **capar, não recalcular**. O número que você vê na tela continua o seu número — o servidor só barra o exagero. Subir skill ainda aumenta o dano; o que não dá mais é forjar um 999 no console.

E um bug que só apareceu **ao vivo**: a morte por monstro deixava sua vida em zero **no servidor** (o respawn era só no cliente). Jogando, você nem percebia — relogar ou tomar uma poção consertava. Mas deixar o personagem **parado farmando** na masmorra virava um loop de morte drenando 15% de skill por ciclo. O tipo de coisa que teste automatizado nenhum pega e só um AFK de verdade revela.

De quebra, a **Battle List** estilo Tibia: a janela de alvo virou uma lista clicável de tudo que está em volta, ordenada por distância. Achar o boss no meio da multidão deixou de ser sorte.

## ⚔ Arena PvP 1v1 — duelo limpo, com placar

E o mais recente: **Arena**. Fala com o Mestre da Arena, entra na fila, o sistema te casa com alguém. Aposta de ouro é opcional (vencedor leva o pote); o que sempre conta é o **rating Elo**. A luta acontece numa **arena isolada** — ninguém de fora interfere, ninguém te ganka no meio.

O truque de implementação foi não construir nada novo: a arena **reusa a máquina da masmorra**. Um duelo é só uma "masmorra" de um andar só onde os dois entram, o PvP liga e o servidor cuida do resto — teleporte, isolamento, colisão, tudo de graça. Os dois bugs que escaparam (um mob de masmorra gigante aparecendo na arena, e a Zona Segura bloqueando ataque dentro do duelo) só apareceram no teste ao vivo — e renderam uma regra que eu repito agora: **instância que reusa coordenadas da cidade precisa checar o andar, não só o lugar.**

## 🎒 Bônus: o inventário que respirava

Por último, um pedido direto de quem joga: itens forjados e raros tinham tantos atributos que o texto **se sobrepunha** e virava sopa de letrinha. Reorganizei pra duas linhas — nome em cima, atributos em "chips" embaixo. Raridade virou **cor** (dourado = lendário, roxo = mítico), o nível de forja virou um selo no ícone. Some o app que **congelava ao perder o foco** no Windows (corrigido), e o jogo ficou bem mais agradável de... usar.

## 🧠 A lição das duas semanas

A fase de lançamento é sobre **não quebrar**. A fase seguinte é sobre **ter pra onde ir**. As duas exigem disciplinas opostas: uma é paranoia (segurança, save, anti-cheat), a outra é generosidade (conteúdo, sistemas, recompensa). O erro é tentar as duas no mesmo dia com a mesma cabeça.

E o melhor backlog continua sendo gente jogando: o print dos pontos parados pediu a árvore de talentos, o AFK na masmorra achou o loop de morte, o "tá tudo embolado no inventário" virou o redesign. Eu só fui atrás.

Próxima parada: **Arena 3v3** em time, e um tier de endgame pra quem já maxou tudo. Conto como foi.
