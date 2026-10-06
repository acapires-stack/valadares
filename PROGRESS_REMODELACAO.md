# Novo Valadares — estado da entrega

Atualizado em 06/10/2026. Autorização: construir a versão paralela até o jogo integrado, sem aprovações por partes, preservando jogabilidade, combate e liberdade. Não há Senna ou Goal inferido.

## Revisão de elenco e escala — candidato integrado em 06/10

Pedido de Alcione: estudar antes de mudar, revisar os monstros e a relação personagem/casas, preservar os pontos bons (orcs e trolls), avaliar os arquivos de avatar e usar uma conta/bot de teste. Comparação com 81b618b e 5373640 concluída; nenhuma volta integral ao antigo nem compressão geral dos corpos. Sete aparências atuais, identidade independente da arma, regras e liberdade preservadas.

- Os 22 tipos foram comparados e capturados em movimento. Corrigidos cálculo de escala do minotauro, massa e ancoragem das asas de drakes, porte de chefes, junções e contato com solo das criaturas procedurais. Mantidos os fatores 0,5 já solicitados para cinco animais. Orcs/líder, troll, lobo e esqueleto preservados. Bárbaro não exibe escudo sem offhand.
- Casas: portal proporcional e oficina alinhada ao tile real, janelas/texturas recompostas, camas/banco coerentes. Beirais maiores foram rejeitados porque agravavam ocultação nas quinas. Cobertura, volume, grade e colisões preservados. Quatro entradas/saídas e móveis afetados passaram.
- Seleção considera as partes visíveis antes da tolerância antiga. Baseline falhou em 52/676 pontos; geometria final passou 676/676 e três negativos de invisibilidade. Revisão complementar de vizinhos, menu remoto, chão e morte visual:10/10.
- O grupo adjacente ainda encobria o jogador. Após prova visual separada, foi integrado player-visibility.js: silhueta ciana apenas nos pixels encobertos do jogador local, sem tingir partes livres nem criar alvos. Sete corpos × três armas, corrida/golpe, clear/rebuild, ocultação, destroy/recriação e fallback sem stencil passaram; nenhuma destruição dos recursos originais. Não há suporte do efeito a morphs futuros, que são omitidos sem impedir o jogo.
- Ferramenta reutilizável tools/modern/qa-roster-playthrough.cjs usa backend nativo, conta temporária e dados isolados. Baseline 2D/3D e candidato 3D passaram movimento, três armas, dano/morte, coleta vinculada ao drop e relogin exato, zero correções/JS. Galerias são provas visuais; combate nativo usa ratos, sem alterar seus atributos. Guias legados e corrida do instrumento contra autoataque foram tratados no teste, não escondidos como defeitos corrigidos do produto.
- Build final:224 arquivos,86 recursos, foco/clássico/compacto, sete escolhas, efeito ativo e limpeza ao logout; zero falhas/JS. Fontes privadas e contas ficam fora do build. Raiz inspecionou grupo adjacente, silhueta, fachadas e telas do pacote.
- Avatar modular: roupas Peasant/Ranger/híbridas masculinas e femininas caminham/correm/golpeiam com bibliotecas Standard públicas oficiais. Jog embutido era estático. Cabeça/pescoço, arma, acabamento de junções e integração ainda pendentes; não entrou no jogo, nenhuma compra nova.

Publicação reversível do frontend já autorizada; antes desta publicação, cliente5373640/backendaf8d955. O estado público conclusivo fica em C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/publicacao-elenco-receipt.json e work/revisao-profissional/STATUS.md. Recuperação de código para5373640, sem contas, será preservada no mesmo workspace. Servidor não requer reinício: arquivos deste lote ficam fora dos watchPatterns do Railway.

Relatório consolidado: outputs/Revisao-elenco-e-escala.md no workspace da conversa. Estudos/testes: work/revisao-profissional/revisao-elenco. Fauna procedural, minotauro adaptado, identidade de alguns chefes e personalização profunda continuam lacunas de arte; não declarar o jogo inteiro acabado.

## Retorno de uso — escorpião/lagarto publicados; dragões em análise

- Cliente atual: `5373640d69665a867324331665d1ddcade032e27`, publicado às 19h15 de 06/10. Acrescenta SCORPION/LIZARD ao fator visual 0,5 já aplicado a RAT/SNAKE/SPIDER. Vercel `dpl_JC3n8hd1tQx5exEP7yoPJrvXMjCT` Ready; hash público de actors.js igual ao commit, health200 e maintenancefalse. Recibo `work/publicacao-escorpiao-lagarto-receipt.json` no workspace da conversa. Backend permanece em af8d955; Railway não reiniciou (publicação SKIPPED por watchPatterns).
- Redução focal comparada antes/depois: escala exata, posição no chão e encaminhamento de clique preservados; RAT/DRAKE como controles inalterados. Evidência em `work/revisao-profissional/escorpiao-lagarto-metade`. Reversão somente do arquivo em `work/rollback-escorpiao-lagarto-af8d955.patch`, validada sem restaurar dados.
- Fotos grandes de escorpião/lagarto correspondiam à aba ainda com código af8d955: Debugger.getScriptSource confirmou somente RAT/SNAKE/SPIDER na lista carregada. Debugger desativado ao terminar; usuário orientado a Ctrl+F5. Captura posterior já mostra lagarto menor. Não aplicar novamente 50% sobre o tamanho publicado.
- Alcione exigiu avaliar consequências na jogabilidade. Revisão focal independente concluída:40/40 cliques pelo renderer/handler reais em1440x900 e844x390, incluindo corpo, área tolerante, chão e vizinhos. A área de seleção não encolheu. Rato/cobra perdem detalhe em tela compacta; não confundir seleção funcionando com aceite artístico. Parecer final `work/revisao-profissional/FAUNA-SELECAO.md`, sem alterações de produto. Cenário sintético em memória; não comprova toque físico nem toda aglomeração real.
- Rosto: Andarilho usa Rogue_Head_Hooded, capuz e máscara escondem a face; câmera superior acentua isso. Não é falha de tintura nem malha ausente. Não existe alternativa Rogue sem capuz nos arquivos confirmados. Diagnóstico e capturas em `work/revisao-profissional/rostos/DIAGNOSTICO.md`; nenhuma troca automática do personagem.
- Dragões: usuário pediu análise, não edição. Comparação controlada confirmou torso/cabeça/focinho engrossados pelo fator2 nas esferas, sem acompanhar pernas/asas. Massa projetada do núcleo ficou aproximadamente3x; líder já tem asas2,23x mais largas que o comum. Não aprovar como arte final. Propostas numéricas são hipóteses ainda não testadas/aplicadas. Parecer em `work/revisao-profissional/drakes-analise/PARECER.md`.
- Series6 comprado contém14 personagens completos,36 acessórios/objetos glTF (não36 armas),26 fontes Blender e animações gerais/movimento. Não contém catálogo pronto de rosto/cabelo/armaduras modulares nem biblioteca completa de combate. Armas separadas são úteis; trajes em geral pertencem aos personagens completos. Adventurers EXTRA não confirmado como compra. Nenhuma compra nova.

Esta seção substitui as referências ao cliente af8d955 abaixo; o backend continua nessa versão. Acabamento geral e personalização modular permanecem incompletos.

## Revisão profissional — publicada em 06/10/2026 às 19h03

Cliente e servidor publicados juntos em `af8d955716a1ef2fac8e0cbbf218a5dd1baff07b`, incluindo o pedido posterior de reduzir rato/cobra/aranha para 50% do tamanho visual. Vercel `dpl_6HScKgonQ9dsmYZF1ZAop8MoRp3w` Ready, alias valadares.app.br; Railway `6d887bf0-6e89-4fda-b030-451997a86e55` SUCCESS, iniciado22:02:49Z, volume existente montado e 36 contas carregadas. Retorno de código para 81b618b preparado e validado em `C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/rollback-profissional-81b618b.patch`, sem restore de contas.

Ctrl+F5 de Alcione recuperou o acesso à aba existente. Comando `/manutencao 1` enviado uma vez, recibo e locktrue confirmados antes do push. Verificação pública final PASS:43 recursos/rotas iguais ao commit,0 diferenças,3 rotas privadas404,health200,maintenancefalse. Recibo `work/publicacao-profissional-receipt.json` da conversa. Após reinício, claude ONLINE observado na PZ50/50, HP1361/1361, MP724/724 e ouro354287; não foi feito ensaio com recursos da conta. Aba ainda precisava recarregar o frontend; informado a Alcione que o novo Ctrl+F5 carrega a revisão.

Esta seção supera os estados de entrega abaixo, mantidos como histórico. Alcione reprovou a revisão como acabamento integral e pediu especialistas; após Ctrl+F5 confirmou melhora e manteve o pedido. Não declarar remodelação completa.

Quatro especialistas encerrados, nenhum escritor de produto ativo. Sete trajes independentes da arma e persistentes, proporções corretas, Skeleton_Minion e Wolf completos, golpes/impacto/morte sincronizados, áudio com variantes, minimapa nos dois layouts e quatro interiores revistos. Evidências e limites em `docs/remodelacao/REVISAO-PROFISSIONAL-20261006.md`. Build público 223 arquivos; ensaio integrado final após redução da fauna PASS,89 recursos,zero erros HTTP/JS,foco/clássico/compacto. Produção em af8d955.

Ainda falta arte autoral para parte da fauna, minotauro e chefes, corda/flecha do arco, visual próprio da besta e personalização modular. Downloads Standard Quaternius não cobrem a composição pronta; nenhuma compra adicional ou encaixe improvisado. Apreciação auditiva não foi fingida por medições.

Alcione esclareceu que a janela dos downloads é Salvar como. Arquivos necessários já salvos; não abrir novos downloads que dependam de clique nativo. Prévia adicional 3338/8098 ativa, sessão local12262;3337/8097 preservada. Publicação desta revisão concluída. Personalização modular e arte autoral faltante permanecem escopo não concluído, com lacunas e recursos necessários documentados; não substituir esses itens por encaixes improvisados. Nenhuma compra adicional.

## Revisão integrada dos pacotes — publicada em 06/10/2026 às 15h56

Alcione mudou a orientação de retoques isolados para revisar o conjunto, explorar ao máximo os pacotes e só então voltar a jogar. Escopo e evidência completos em `docs/remodelacao/REVISAO-INTEGRADA-20261006.md`. Inclui cenários por ambiente, armas e personagens selecionados da Series6, minimapa com descoberta preservada, músicas completas do acervo, loot sem sobreposição e protocolo de movimento confirmado.

QA integrado passou: quatro interiores, bancada/treino/altar com efeitos reais na conta sintética, saída/reentrada/reload, viewport compacto, 196 recursos sem falha e zero erros JS. Proxy local de atraso900ms passou49 passos sem posCorrect. Limite: o relato original de recuo em produção não foi capturado; rede muito lenta ainda causa espera. Simulação reproduziu falha de rajada antiga e verificou a correção, inclusive respawn. Revisão independente concluída. Ajuste final de composição da biblioteca recapturado em QA focal, corredor e altar preservados.

Publicado cliente e servidor: `81b618b90a8949fe240670d5b62d8f0f5c99d01e`. Vercel `dpl_D6QiWSSZKwee9DRvQGsFrLgmy5kN` Ready com alias valadares.app.br; Railway `0093b654-4788-40dd-a9bd-e92b46db6c27` SUCCESS, iniciado18:56:08Z, 36contas carregadas e volume existente preservado. Manutenção1min enviada uma vez pela sessão administrativa existente e recibo recebido; locktrue confirmado antes do push. Verificação pública final PASS:58recursos/rotas correspondem ao commit,0diferenças,3rotas privadas404,health200,maintenancefalse. Recibo `C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/publicacao-integracao-receipt.json`. Reversão para runtimec1dc6f7 preparada em `work/rollback-integracao-c1dc6f7.patch` nessa conversa, validada por gitapplycheck (sem restaurar contas). Preview adicional3338/8098 encerrada normalmente;3337/8097 preservada.

Entrega integrada pronta para o teste de Alcione; recarregar /jogar3d aplica o novo cliente. Nenhuma compra, campanha ou publicação social foi feita. Avaliação auditiva e experiência no aparelho do usuário permanecem retorno de uso, não foram fingidas por testes técnicos. Sem escritores ou publicação pendente; eventual commit documental após81b618b não altera o runtime publicado.

## Estado atual: pacotes publicados em 06/10/2026

- Alcione autorizou a publicação para jogar com sua conta. Cliente e servidor dos pacotes estão publicados juntos no commit `27cb45460dce981b5cab4586c6ff1d54fc4d0981`: Railway `73aea5a2-feb6-4f3f-bf46-4a5a4dc8c8bd` SUCCESS (log: 36 contas carregadas) e Vercel `dpl_2PMppwGssWKzE7ZvFZmXyY1rMEUm`. Entrada: https://valadares.app.br/jogar3d; a entrada clássica e os serviços externos continuam.
- Recibo público: 68 recursos retornaram 200 e corresponderam aos arquivos publicados; três rotas privadas retornaram 404. O `/health` respondeu 502 durante o corte. Nova verificação direta da raiz em `2026-10-06T18:04:03.2713289Z` confirmou `/health` 200 com `{ok:true}` e `/api/status` com `maintenance:false`, `minClientVersion:"1.0.7"` e `clientDownloadUrl:"https://valadares.app.br/#download"`. O 502 fica preservado no histórico do recibo; estado final da publicação: PASS.
- Quatro interiores opcionais: pousada com taverna; oficina com bancada de criação (C); biblioteca com altar (M); mercado com treino (T). Portas usam G; há saída, reentrada e retorno ao mundo. O pacote também inclui 21 cenários, 33 sons e 22 tipos de monstro diferenciados.
- QA integrado PASS nas quatro salas: criação real com custo em ouro, treino real com custo e XP, saída/reentrada/reload, viewport compacto emulado e zero erros JavaScript. Viewport emulado não comprova uso em celular físico. Conta claude observada online após o deploy com HP1329/1329, MP724/724 e ouro314256, inicialmente com cliente anterior ainda carregado; reload confirmou modern-world.js?v=2. Em nova observação Alcione já jogava no cliente atualizado, com portas rotuladas e recursos comprados visíveis. Inventário completo não foi revisado.
- Reversão de código preparada em `C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/rollback-pacotes-c2146a0.patch`, com `git apply --check` aprovado. Reverter cliente e servidor juntos para `c2146a0`, sem restaurar contas.
- Aparências masculinas/femininas e história adicional permanecem ideias para exploração futura. Recibo detalhado em `C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/outputs/Novo-Valadares-pacotes-publicados.md`.

### Retorno de Alcione após jogar — publicado

- Compra Series6 confirmada pelo itch.io em06/10/2026, US$19,99; download recuperado pelo fluxo normal do site após recarregar a página e acompanhar o evento antes do clique. ZIP `C:/Users/Alcione/Downloads/KayKit_Mystery_Monthly_Series_6_(1.1).zip`,41650373bytes, CRC integral OK. Original preservado; URL privada de compra não registrada nem publicada.
- Pedidos: reduzir sons agudos repetidos nas batalhas; melhorar sala de treino muito marrom e boneco; melhorar personagens em geral. Integração visual/audio autorizada, sem alterar regras ou contas. Áudio e sala/atores têm escritores separados; raiz integra e publica frontend após QA. Nenhum reinício do servidor é necessário para esses arquivos.
- Melhoria de conteúdo/história continua proposta; importação visual selecionada da Series6 substitui aparência de tipos/papéis existentes, não cria novas regras nem escolha de gênero.
- Candidato final do retorno: sala de treino com pedra clara/reboco/estandartes azuis e boneco KayKit completo; seis modelos Series6 selecionados para moradores, orcs e trolls. Ataque dos dois monstros remapeado do clipe CC0 existente, com movimento do braço comprovado no Chrome. Aparência base do jogador permanece a mesma neste lote.
- Áudio: melodia aguda e oitava deixam de tocar no combate, com retorno após intervalo; crítico seco de0,35s substitui metal prolongado; nove efeitos comuns são pré-carregados após ativação, e efeitos sintetizados de reserva ficam menos agudos. QA de áudio com WebAudio real e análise espectral passou; apreciação auditiva final depende do retorno de Alcione.
- QA integrado do retorno PASS: login, carregamento dos modelos novos, entrada na sala, aproximação do boneco, abertura do treino e saída andando;55recursosHTTPsemfalha e0errosJS. Captura real do cliente de teste em docs/remodelacao/evidencias-revisao/sala-treino-em-jogo.png. Build148arquivos/18113302bytes. Nenhum arquivo do backend ou acompanhado pelo Railway mudou; publicação é somente frontend. Préviaextra3338/8098 encerrada;3337/8097 preservada.
- Publicado: commit c1dc6f713b05abf2407324e3911687aafee38740, Vercel dpl_E2tHeaZXjNC6LW2t3dGE5g6665BH Ready em06/10/2026 às15h27(Brasília). Domínio valadares.app.br confirmado. Verificação final:24recursos públicos/rotas correspondem ao commit,0diferenças, rotas privadas404, health200 e manutençãofalse. Railway marcou evento f1f36a75-0323-45aa-a362-77b54a46c0ab SKIPPED conforme watchPatterns; servidor permanece no73aea5a2-feb6-4f3f-bf46-4a5a4dc8c8bd, sem reinício. Reversão frontend para27cb454 preparada emwork/rollback-revisao-27cb454.patch, gitapplycheckPASS. Recibo emwork/publicacao-revisao-receipt.json na conversa. Usuário precisa recarregar sua aba para aplicar este último cliente; não interrompemos sua partida novamente.

As seções abaixo preservam o histórico das etapas anteriores e suas limitações na data em que foram escritas.

## Atualização: publicação autorizada

Alcione autorizou agora: "sobe ela para eu jogar com minha conta". O registro local abaixo documenta a entrega anterior; sua restrição a publicação foi superada por este pedido.

- Entrada nova: https://valadares.app.br/jogar3d. Entrada clássica /jogar preservada. Ambas usam o mesmo backend e contas reais; não há migração de dados.
- Cinco footprints do mapa são compartilhados pelo cliente clássico, 3D e servidor. Colisões exigem a atualização conjunta.
- Vercel publica dist-web gerado por tools/build-web.cjs, somente recursos do navegador. Docker inclui modern-world.js; Railway acompanha alterações deste módulo.
- Revisão independente da publicação concluída: empacotamento, mapa, cache, manutenção e retorno à versão anterior conferidos.
- Publicação concluída: c2146a0 em main; Railway a52ca232-c7af-4406-bb1d-540ba2e21999 e Vercel 8CNabyBbiWt6fHMZRcPrpXSkQxE1 SUCCESS. Manutenção enviada uma vez e lock confirmado antes do push. Servidor carregou 36 contas; health OK. Cliente, módulos e cinco modelos públicos com hashes iguais ao commit. Conta claude online em /jogar3d, renderer ready, HP/mana/skills preservados, combate/XP/loot observados enquanto Alcione jogava. Próxima ação: incorporar o retorno de Alcione sobre o teste; sem publicação adicional pendente.
- Recuperação: base e17408b6ac8fc490cbf904b7f98dc52611794945; Railway anterior 4857bba4-6625-4eb1-94fd-77edc8c8c798. Reverter cliente e servidor juntos durante manutenção, preservando volume /data e contas. Nenhum restore de saves ou mudança de credenciais.
- Recibo final de publicação ficará em outputs/Novo-Valadares-publicado.md no workspace desta conversa.

## Fonte e isolamento

## Atualização em trabalho: pacotes comprados, interiores e monstros

- Alcione confirmou os sete downloads concluídos e autorizou integrar. Pediu também identidade visual dos monstros e melhorias úteis no mapa, preservando a liberdade de explorar.
- Base publicada preservada: c2146a0; HEAD documental 3a61a2a. Recuperação desta atualização usa c2146a0 para cliente/servidor juntos, sem restaurar dados.
- Arquivos originais ficam em Downloads, fora da publicação. Somente seleções convertidas entram em modern/assets; modern/_source é ignorado.
- Escritores: áudio em game-audio.js/assets/audio; cenário em world.js/scenery.js/assets/scenery; interiores em modern-world.js/server.js; monstros em actors.js. Raiz integra cliente, ponte, HUD e build. Revisão independente do contrato dos interiores atribuída ao agente dos monstros após sua entrega visual.
- Interiores opcionais: pousada porta (44,46), piso1000; oficina porta (52,45), piso1001; spawn (50,50), saída (50,51). Grid autoritativo, piso compartilhado, PvP desativado dentro, retorno à porta. Serviços externos preservados.
- Integração concluída: 21 cenários GLB (936.868 bytes), 33 sons MP3 (682.571 bytes), 22 tipos de monstro diferenciados, minimapa com portas/marcos conhecidos e zoom interno. Portas por botão/clique/G e saída também andando. Música e controles de volume preservados.
- QA integrado real local PASS: duas salas, movimento, proteção PvP, volta à porta, reentrada, saída andando, reload interno com equipamento preservado, recursos HTTP sem erro e botão funcionando em 844x390. Combate com rato e dano observado na captura bosque.png. Renderer sem erro; carregamento inicial amostrado em 42 FPS, bosque em 59 e interiores em 60 nesta máquina, sem garantia para celular físico.
- QA servidor autoritativo com duas contas PASS: distância inválida, salas compartilhadas, reentrada imediata, PvP/masmorra/serviços externos/troca antiga separados por piso, save/relogin em PZ. Revisão cruzada identificou e motivou as correções de trade tardio e serviços por coordenadas sobrepostas. Cliente checkPzLock limitado ao overworld para não expulsar personagem para fora do grid interno.
- Mapa compartilhado: 10.000 tiles iguais, 8.410 alcançáveis, 15 marcos, 5 prédios. Monstros: 22 tipos e quatro direções; orientação dos jogadores preservada. Áudio: CRC do ZIP, decodificação/hashes, mute, aba, saída/reentrada e fallback verificados.
- Build público: 134 arquivos/10.924.145 bytes, sem ZIPs, WAVs, originais, ferramentas, saves ou documentos internos. Downloads originais preservados. Runner adicional 3338/8098 encerrado após QA; runner anterior 3337/8097 preservado.
- Próximo: revisão final do contrato, commit e preparo de reversão para c2146a0; manutenção e publicação conjunta autorizadas. Ainda não reivindicar esta atualização como publicada.
- Acréscimo pedido por Alcione concluído: bancada funcional na ferraria; templo na biblioteca (1002, porta57/49) e sala de treino no mercado (1003, porta43/53), altar/boneco funcionais. Serviços da praça preservados. QA integrado PASS nas quatro casas, criação com ouro/inventário, treino de Magia e físico com XP/custo, parada ao sair do ponto, reentrada, reload de volta ao overworld e viewport compacto. 104 carregamentos de recursos conferidos; nenhum erro JS/HTTP. Ao relogar, utiliza o último save de superfície; save efetuado dentro converte posição para PZ.
- Revisão independente encerrada sem bloqueio no acréscimo. Custo de troca de magia continua a rotina preexistente do cliente; não foi convertido em nova operação autoritativa. O custo/XP de treinamento e a criação foram verificados no servidor e na interface.
- Futuro solicitado: aparências masculinas e femininas com escolha estética livre, sem vincular a classe, atributos ou benefícios. Ainda não implementado; preservar compatibilidade com roupas/equipamentos/animações ao selecionar modelos.

### Registro anterior de isolamento

- Worktree: C:/claude/_worktrees/valadares-remodelacao-20261006.
- Branch: remodelacao/novo-valadares-20261006; base e17408b6ac8fc490cbf904b7f98dc52611794945.
- Base canônica preservada: C:/claude/_worktrees/valadares-retencao-20261006. Nada publicado ou alterado no site, contas, campanhas ou pagamentos de produção.
- Todos os escritores delegados encerraram. Raiz responde pela integração final.

## Implementado

- PlayCanvas 2.23.0 em bundle local, cinco modelos KayKit CC0 animados e otimizados, procedência/licenças fixadas. Downloads e otimização reproduzíveis. GLBs originais preservados localmente e ignorados pelo Git; runtimes acompanham a versão.
- Mundo em chunks com terreno contínuo, água animada, vegetação, prédios com telhados/fundações/detalhes, objetos de serviço, biomas, masmorras e expedições. Cinco footprints compartilhados por cliente e servidor.
- Personagem local/remoto, NPCs, todos os tipos de inimigos, quatro pets, armas, armaduras, tintas, cosméticos, loot identificado, seleção, magias, projéteis e impactos.
- HUD desktop de tela inteira, vida/mana, mapa, ações rápidas e gavetas. Layout clássico e toque preservados. Escape corrigido em talentos e campos de texto de modais.
- Ponte de leitura entre apresentação e sistemas existentes. Regras de dano, progressão, combate, alcance e escolha permanecem as do jogo. Enquadramento adapta-se à tela; nenhum zoom ou requisito novo.
- Gravação do novo cenário libera as faixas ao encerrar. Falha de atualização ou perda WebGL devolve o visual clássico sem desconectar o personagem.
- Servidor real isolado em loopback: HTTP3337/WS8097. Dados sintéticos persistidos em tools/modern/.local; sem pagamentos/email/admin. Launcher abre/reutiliza esta cópia e preserva save.

## Evidência de funcionamento

- Mapa: 10.000 tiles iguais; 8.410 alcançáveis; 15 pontos importantes acessíveis; cinco prédios. map-check.cjs PASS.
- Login, WASD, seleção projetada, combate com mortes/XP/loot/ouro, troca de arma, acesso aos painéis de loja/baú/criação/altar/treino e gerais. As operações internas de cada receita/talento não foram exaustivamente repetidas.
- Expedição real e Profundezas1: entrada, mapas do renderer/servidor sincronizados, saída/retorno à cidade. Falhas anteriores do harness por rota bloqueada, morte ou continuar procurando coordenada do mapa antigo foram identificadas; resultados finais separados preservados.
- Toque emulado844x390/DPR2: joystick, menu, reconexão, reload/save e recuperação visual. Corrigida interferência CSS que zerava altura do novo canvas.
- HUD 1024x768,1366x768,1920x1080: ações, painéis, Escape, chat e troca de layout.
- Correção após uso de Alcione: yaw horizontal dos atores estava invertido. Corrigidos esquerda/direita e orientação inferida por deslocamento. qa-facing.cjs reproduziu a inversão antes e passou nas quatro direções, diagonais e orientação explícita de combate depois; captura dos modelos confirmada. Servidor e conta ativa não foram interrompidos; recarregar a página carrega o ajuste.
- Duas sessões: presença remota animada, clique direito no personagem3D, convite/aceite/cancelamento de troca em ambos os clientes, sem transferência.
- Cinco modelos runtime carregam no jogo real; 11 tipos humanoides com repouso/corrida/golpe no harness visual. Captura final da vila:60FPS/379drawcalls, sem errosJS ou asset perdido. GPU perdida por injeção: canvasclássico ativo, conexão viva, movimento confirmado.
- Revisão independente concluída uma vez. Cosméticos/loot/fallback/captura corrigidos; modern-world.js obrigatório e incluído no pacote. Experimento de pós-processamento rejeitado visualmente e não integrado.

Relatórios selecionados e captura: docs/remodelacao/evidencias/. Detalhes: docs/remodelacao/VALIDACAO.md. Capturas e scripts de ensaio completos também permanecem em C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/.

## Limites comprovados e acesso

- Versão jogável local paralela; publicação não executada. Não reivindicar aceite visual do usuário ou reprodução literal da imagem conceitual.
- Sem teste em celular físico, carga de muitos jogadores ou evidência de aquisição/retenção do público jovem. FPS em computador não garante FPS em telefone.
- Abrir Abrir Novo Valadares.cmd; conta local TesteVal18 / Valadares18!. Dados e progresso dos ensaios preservados. Guia em LEIA-ME-NOVO-VALADARES.md.
- Entrega reunida em outputs/Novo-Valadares-3D-local-20261006.zip no workspace desta conversa, com arquivos, licenças e dependência local. Atalho e guia no mesmo diretório. Commit local registrado; sem push/deploy ou pedido de aprovação de pedaços.
