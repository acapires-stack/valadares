# Execução — novo Valadares

Autorizado por Alcione em 06/10/2026: executar o projeto paralelo até uma versão completa jogável, sem apresentações ou aprovações por pedaço. Preservar combate, movimento, regras e liberdade. A concepção visual aprovada está em conceito.png; é referência de arte, não prova de implementação.

## Alvo e isolamento
- Base completa e funcional: e17408b. Worktree exclusiva C:/claude/_worktrees/valadares-remodelacao-20261006, branch remodelacao/novo-valadares-20261006.
- Nesta integração reutilizamos os sistemas maduros de play.html e servidor, extraindo uma ponte explícita de apresentação. Não reescrever regras para produzir outro jogo. Novo renderer PlayCanvas, modelos e materiais próprios/licenciados; não rasterizar sprites antigos em cubos.
- Não escrever nos worktrees de produção, não usar contas reais para testes, não importar saves reais, não alterar pagamentos/campanha.
- Publicar a frente paralela somente depois da validação; não substituir main por impulso. Nenhum gasto novo está autorizado por inferência.

## Contratos e escritores
- Raiz: modern/renderer.js, modern/entry.js, modern/vendor/, personagens e integração geral; direção artística, revisão e conclusão.
- Agente mundo: modern/world.js e modern/assets/world/ somente. Exporta createWorld(pc, app, bridge) → {update(dt), destroy(), diagnostics()}; pode async se necessário. Trabalha em coords do servidor: pc.x=tile.x, pc.z=tile.y, up=pc.y. Chão em y=0. Recebe bridge.getMap(), getPlayer(), getCamera(), T, M_W/M_H, inSafeZone, inSanctuary, getNpcs(), getProps(), getDayPhase(). Não altera bridge, HTML ou renderer. Precisa atualizar chunks ao mover/trocar floor; representar todos os biomas/tiles, corredores e saídas. Mapa/colisões são autoritativos: decoração não cria paredes invisíveis nem bloqueia caminho. Texturas, geometrias e materiais em volume moderado, sombra e água. Exporta também atualização de mundo; não cria entidades de jogadores/NPCs/inimigos.
- Agente UI/ponte: play.html, modern/ui.css e modern/ui.js somente. Define window.ValadaresModernBridge = {...r3dBridge(), getStarted:()=>started, getItems:()=>ITEMS, getMonsterTypes:()=>MTYPE, getProjectiles:()=>projectiles, getChatState:()=>({}), getCanvas:()=>canvas, getFloor:()=>player.floor||0, getTarget:()=>({id:player.target,type:player.targetType}), getStatus:()=>({connected:ws?.readyState===1})}; conferir nomes reais! Carrega modern/entry.js via type=module após script clássico. Não altera combate/servidor. Pode fornecer APIs adicionais necessárias documentando. UI contemporânea toda funcional, legível e responsiva, mundo principal, detalhes acessíveis sem gates.
- Agente servidor/validação: tools/modern/ e docs/remodelacao/VALIDACAO.md, pode gerar dados sintéticos isolados ignorados pelo Git. Não alterar server/server.js nesta fase. Preparar servidor isolado e contas de teste; conectar cliente real; cobrir entrada, reconexão, movimento, combate, itens, NPCs, dungeon, jornada/expedição/craft; documentar incompatibilidades. Não tocar nos arquivos dos outros.

## Contrato do renderer
- modern/entry.js espera a ponte e chama createRenderer(bridge), importando pc do bundle local modern/vendor/playcanvas.mjs.
- modern/renderer.js monta canvas sobre canvas existente e preserva o DOM de todos os sistemas. Engine tem seu update/render. O jogo mantém simulação original; a ponte só lê estado. Um erro visível recuperável não interrompe o jogo silenciosamente.
- Câmera alta fixa, ortográfica, norte coerente com teclas. Input de mouse/toque no novo canvas deve mapear raio ao chão e coordenada de mapa antes de selecionar alvo/andar; não encaminhar pixels sem conversão.
- O enquadramento acompanha a área disponível da tela para preencher o modo foco. O renderer mostra entidades dentro desse enquadramento; alcance, seleção automática, colisão, dano e validações continuam sob as regras originais e o servidor. A ampliação da área visual não amplia o alcance das armas. Nenhum zoom controlável foi introduzido.
- Render mostra player, remotos, pets, NPCs, monstros, loot, props, magias/projéteis, impactos, seleção e dados essenciais. Sem duplicar créditos ou simulação.

## Aceite de versão pronta
- Mundo e interface novos nos fluxos de jogo, sem cubo girando, cena vazia ou montagem fixa apresentada como jogo pronto.
- Câmera, colisão, seleção e interação condizem com o mundo. Personagens e armas animados e legíveis.
- Fluxo real: conta teste → cidade → exploração → combate/loot/equipamento → treino/craft/magia/quest → expedição/saída → salvar/reentrar; controles desktop/toque, painéis e teclas sem conflito.
- Capturas reais desktop/mobile, console limpo, sessões reiteradas e desempenho medido em máquina disponível. Emulação não comprova desempenho de celular físico; relatar limite.
- Nenhum resultado está aprovado somente porque compilou. Raiz observa a cena real, compara direção visual, corrige problemas e faz a verificação final.
- Não criar novas restrições de progressão ou requisitos de recrutamento. Sem diálogo de autorização a cada marco.

## Estado da integração
- Versão paralela local integrada e percorrida com servidor real. O estado atual, as evidências e os limites estão em PROGRESS_REMODELACAO.md e VALIDACAO.md. Produção preservada.
