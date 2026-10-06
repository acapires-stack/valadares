# Novo Valadares — estado da entrega

Atualizado em 06/10/2026. Autorização: construir a versão paralela até o jogo integrado, sem aprovações por partes, preservando jogabilidade, combate e liberdade. Não há Senna ou Goal inferido.

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
