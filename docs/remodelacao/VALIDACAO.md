# Validação local — versão paralela

## Como abrir

Na raiz deste worktree, execute `& .\tools\modern\start.ps1`. O script instala apenas `ws` em `tools/modern/.local-deps` se ainda não existir e inicia dois processos ocultos. Abra:

`http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097`

Conta sintética: **TesteVal18** / **Valadares18!**. As sete habilidades começam em 18, com Machado do Minotauro equipado, outra espada, 30 poções de vida, 30 de mana, provisões e ouro. O jogo não tem um nível único do personagem; nível 18 aqui significa nível 18 nas habilidades. A mesma conta e o save permanecem para a próxima abertura. Para conferir: `& .\tools\modern\status.ps1`; para encerrar somente estes processos: `& .\tools\modern\stop.ps1`.

O servidor é o `server/server.js` deste worktree. `tools/modern/backend-local.cjs` faz a adaptação de execução que prende a porta WS em `127.0.0.1`. O cliente real é `play.html`, entregue por HTTP em `/jogar`. A query `?ws=` seleciona o WS local; a preferência fica na origem local do navegador. Os processos locais desativam pagamentos, avisos por email e administração. Dados, logs e PIDs ficam em `tools/modern/.local/`; a pasta é ignorada pelo Git e não é servida pelo HTTP. Nenhuma conta ou save de produção é importado.

## Verificação automatizada

`node tools/modern/smoke.cjs` usa o protocolo WS real e confere HTTP `/jogar`, módulos do renderer, `/health`, autenticação, entrada no mundo, habilidades/inventário da conta, gravação em `accounts.json` e reentrada com o mesmo save. A conta de teste não é recriada se o arquivo já existir, para preservar progresso local.

Resultado em 06/10/2026: **PASS** nos caminhos acima. A validação visual, movimento, combate, NPC, masmorra, expedição e uso em tela móvel devem ser registrados pela integração principal; o teste WS focal não substitui esses fluxos. O backend carrega diretamente os módulos da raiz, inclusive alterações posteriores, ao reiniciar o runner.

## Troca real de áreas no navegador

`node tools/modern/qa-areas.cjs` usa Chrome e Playwright disponíveis nesta máquina. O ensaio consulta mapa, posições e diagnóstico sem alterar o estado do jogo por JavaScript; movimento usa WASD, a expedição usa os botões da Jornada, e a masmorra usa as escadas. O caminho evita tiles ocupados por monstros vivos e recalcula após cada passo. A tecla E usa comida pelo fluxo normal quando necessário.

As capturas e resultados `work/...` citados abaixo ficam em `C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/`. Os relatórios selecionados também foram preservados em `docs/remodelacao/evidencias/`.

Em 06/10/2026, **expedição passou**: personagem caminhou até o Velho Ferreiro em (78,22), entrou pela Jornada em `floor=8000`, o renderer apresentou o mesmo andar com mapa novo e 9 chunks, e a ação de saída junto à escada devolveu ao mapa da cidade em `floor=0`. Captura: `work/modern-expedition.png`; dados: `work/modern-areas-result.json`.

Depois, **Profundezas passaram em ensaio separado** (`$env:DUNGEON_ONLY='1'; node tools/modern/qa-areas.cjs`): WASD acionou a entrada (83,17), personagem e renderer passaram a `floor=1` com mapa de masmorra e 9 chunks; caminhar até a escada de subida (59,43) devolveu ambos a `floor=0` e ao mapa externo. Captura: `work/modern-dungeon.png`; dados: `work/modern-dungeon-result.json`. O renderer não registrou erro nem o navegador `pageerror` nesses marcos. O renderer limita NPCs ao andar externo pelo código em `modern/actors.js`; o teste registrou contagem de entidades visíveis, mas não distinguiu NPCs nessa contagem.

O primeiro ensaio conjunto entrou na masmorra, porém a conta morreu no percurso por ataques de Troll antes de completar a rota. Um ensaio seguinte entrou no andar 1, mas o script continuou procurando (83,17) no mapa novo e classificou incorretamente a rota como sem caminho; o harness foi corrigido para parar ao mudar de andar. Essas falhas não demonstraram defeito de transição ou do renderer. O save da conta de teste permaneceu isolado; ao fim da validação, o arquivo local ainda registrava Machado e Punho 18, 30 poções e o Machado do Minotauro equipado.

## Integração e acabamento finais

- Combate real por seleção no 3D: mortes de ratos e cobra, experiência, ouro e loot. Os painéis de baú, criação, altar, treino e loja abriram nas posições correspondentes; a troca de arma pelo inventário foi efetivada. Não foram repetidas todas as operações internas de receitas, comércio ou talentos.
- HUD: botões dos sete painéis gerais, fechar por Escape inclusive em campos de texto, ficha, equipamento, inventário, chat e alternância de layout. Tamanhos 1024×768, 1366×768 e 1920×1080. Nenhum erro de página. `modern-hud-result.json`.
- Duas sessões reais: personagem remoto animado, clique direito na projeção 3D, convite de troca recebido, negociação aberta nos dois clientes e cancelamento nos dois sem transferência. `modern-social-result.json`.
- Toque emulado 844×390 com DPR2: joystick, menu, reconexão, save/reentrada e fallback visual; canvas 3D medido sobre o original. `modern-touch-result.json`. Sem celular físico.
- Modelos finais: cinco GLBs runtime carregados, 11 inimigos humanoides conferidos em repouso, corrida e golpe em harness; personagens, pets, armas, tintas e cosméticos integrados.
- Cena final real 1600×1000: 60 FPS, 379 draw calls, cinco modelos carregados, sem asset faltante ou erro de página. A perda de contexto WebGL injetada devolveu o canvas clássico e o personagem continuou andando conectado. `modern-final-result.json`.
- Mapa idêntico entre cliente e servidor: 10.000 tiles, 8.410 alcançáveis, 15 pontos de interesse acessíveis e cinco prédios. `map-check.cjs`.
- A revisão técnica independente já ocorreu e os achados acionáveis foram corrigidos (cosméticos, identidade do loot, recuperação visual, liberação da gravação). A dependência modern-world.js é obrigatória e acompanha a entrega.

Não houve publicação, teste de carga MMO, avaliação de preferência do público jovem ou teste em hardware móvel físico. A arte conceitual não é captura do jogo; a captura final está em evidencias/vila-final.png.
