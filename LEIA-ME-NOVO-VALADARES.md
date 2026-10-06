# Novo Valadares — versão paralela local

Esta versão reúne o jogo existente e a nova apresentação 3D: mundo, personagens, inimigos, armas, efeitos e interface. Combate, habilidades, inventário, missões, comércio e progressão usam os sistemas do Valadares. Não foram acrescentadas exigências de nível, classe ou tutorial para escolher o que fazer.

## Abrir e jogar

No Windows deste projeto, abra **Abrir Novo Valadares.cmd**. Ele inicia a cópia local quando necessário e abre o navegador. Se já estiver rodando, reaproveita os processos e o progresso.

Endereço: **http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097**

Conta preparada para explorar: **TesteVal18** · senha **Valadares18!**. Também é possível criar outra conta pelo próprio jogo. A conta preparada começou com as sete habilidades em 18, provisões, ouro e Machado do Minotauro; o progresso dos ensaios foi mantido.

- **WASD** move; **Espaço** ataca/interage; clicar em um inimigo seleciona o alvo.
- **R** usa magia; **E** come; **F** lança; **Enter** abre o chat.
- Os botões inferiores abrem os sistemas e mostram seus atalhos.
- **Personagem**, **Equipamento e status** e **Inventário** abrem painéis. **Escape** fecha as janelas.
- **Layout clássico** alterna a disposição dos painéis; a nova apresentação do mundo permanece ativa.
- Clique direito sobre outro jogador abre troca, mensagem e grupo pelas regras existentes.

Os saves locais ficam em `tools/modern/.local/`. Fechar o navegador mantém o servidor local ativo. Para encerrá-lo, execute `tools/modern/stop.ps1`; abrir o jogo novamente conserva os saves. A cópia necessita Node.js 18 ou superior (já instalado nesta máquina). O pacote inclui a dependência WebSocket local; no checkout, `tools/modern/start.ps1` instala essa dependência se ausente.

## O que foi conferido

Entrada, movimento, combate com dano/mortes/experiência/loot e troca de arma pelo inventário; acesso aos painéis de loja, baú, treino, altar, criação e demais sistemas; entrada e saída de expedição e masmorra; gravação de clipe; salvar e reentrar; duas sessões com personagem remoto e negociação de troca; tamanhos desktop de 1024 a 1920 pixels; joystick e menu em toque emulado; reconexão e recuperação visual. O ensaio dos painéis não repete individualmente todas as receitas, compras ou talentos do jogo original.

A cena final da vila atingiu 60 quadros/s no computador usado. Isso não representa garantia para todos os aparelhos. O toque foi emulado; ainda não houve ensaio em celular físico nem teste de carga com muitos jogadores. Se o 3D falhar ou o contexto gráfico for perdido, o cliente permite continuar no visual clássico com a conexão e o personagem preservados.

## Escopo desta entrega

O jogo está disponível **localmente, em paralelo**. O site público, suas contas e seus pagamentos não foram substituídos. Pagamentos, emails e administração estão desativados neste servidor local. A proposta ilustrada permanece uma referência de direção de arte; a implementação usa 3D estilizado com modelos e geometrias próprios do jogo, e não reproduz literalmente cada detalhe da ilustração.

## Créditos

- Motor **PlayCanvas 2.23.0**, licença MIT em `modern/vendor/LICENSE-PlayCanvas.txt`.
- Personagens **KayKit Adventurers** e **KayKit Skeletons**, de Kay Lousberg, CC0. Licenças, commits de origem e hashes em `modern/assets/characters/`.
- Cenários, integração, interface e equipamentos 3D desta versão em `modern/`.
- Demais créditos e licenças do jogo original permanecem preservados.

Fontes dos modelos: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 e https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0.
