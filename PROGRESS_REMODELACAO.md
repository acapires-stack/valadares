# Novo Valadares — estado da entrega

Atualizado em 06/10/2026. Autorização: construir a versão paralela até o jogo integrado, sem aprovações por partes, preservando jogabilidade, combate e liberdade. Não há Senna ou Goal inferido.

## Atualização: publicação autorizada

Alcione autorizou agora: "sobe ela para eu jogar com minha conta". O registro local abaixo documenta a entrega anterior; sua restrição a publicação foi superada por este pedido.

- Entrada nova: https://valadares.app.br/jogar3d. Entrada clássica /jogar preservada. Ambas usam o mesmo backend e contas reais; não há migração de dados.
- Cinco footprints do mapa são compartilhados pelo cliente clássico, 3D e servidor. Colisões exigem a atualização conjunta.
- Vercel publica dist-web gerado por tools/build-web.cjs, somente recursos do navegador. Docker inclui modern-world.js; Railway acompanha alterações deste módulo.
- Revisão independente da publicação concluída: empacotamento, mapa, cache, manutenção e retorno à versão anterior conferidos.
- Próxima ação: QA focal das duas entradas, commit local, manutenção /manutencao 1 uma única vez; confirmar maintenance:true antes do push. Depois verificar Railway, Vercel e sessão real em /jogar3d.
- Recuperação: base e17408b6ac8fc490cbf904b7f98dc52611794945; Railway anterior 4857bba4-6625-4eb1-94fd-77edc8c8c798. Reverter cliente e servidor juntos durante manutenção, preservando volume /data e contas. Nenhum restore de saves ou mudança de credenciais.
- Recibo final de publicação ficará em outputs/Novo-Valadares-publicado.md no workspace desta conversa.

## Fonte e isolamento

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
