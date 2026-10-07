# Valadares — jogo 3D

Esta versão reúne o jogo existente e a nova apresentação 3D: mundo, personagens, inimigos, armas, efeitos e interface. Combate, habilidades, inventário, missões, comércio e progressão usam os sistemas do Valadares. Não foram acrescentadas exigências de nível, classe ou tutorial para escolher o que fazer.

## Abrir e jogar

Entrada pública única: **https://valadares.app.br/jogar**. O endereço antigo `/jogar3d` redireciona para essa entrada. Todas as contas usam o mesmo servidor e preservam seu progresso; não há seleção de visual 2D.

### Cópia local de desenvolvimento

No Windows deste projeto, abra **Abrir Novo Valadares.cmd**. Ele inicia a cópia local quando necessário e abre o navegador. Se já estiver rodando, reaproveita os processos e o progresso.

Endereço: **http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097**

Conta preparada para explorar: **TesteVal18** · senha **Valadares18!**. Também é possível criar outra conta pelo próprio jogo. A conta preparada começou com as sete habilidades em 18, provisões, ouro e Machado do Minotauro; o progresso dos ensaios foi mantido.

- **WASD** move; **Espaço** ataca/interage; clicar em um inimigo seleciona o alvo.
- **R** usa magia; **E** come; **F** lança; **Enter** abre o chat.
- Os botões inferiores abrem os sistemas e mostram seus atalhos.
- **Personagem**, **Equipamento e status** e **Inventário** abrem painéis. **Escape** fecha as janelas.
- **Layout completo** alterna a disposição dos painéis; a apresentação 3D do mundo permanece ativa nos dois layouts.
- Clique direito sobre outro jogador abre troca, mensagem e grupo pelas regras existentes.

Os saves locais ficam em `tools/modern/.local/`. Fechar o navegador mantém o servidor local ativo. Para encerrá-lo, execute `tools/modern/stop.ps1`; abrir o jogo novamente conserva os saves. A cópia necessita Node.js 18 ou superior (já instalado nesta máquina). O pacote inclui a dependência WebSocket local; no checkout, `tools/modern/start.ps1` instala essa dependência se ausente.

## O que foi conferido

Entrada, movimento, combate com dano/mortes/experiência/loot e troca de arma pelo inventário; acesso aos painéis de loja, baú, treino, altar, criação e demais sistemas; entrada e saída de expedição e masmorra; gravação de clipe; salvar e reentrar; duas sessões com personagem remoto e negociação de troca; tamanhos desktop de 1024 a 1920 pixels; joystick e menu em toque emulado; reconexão e recuperação visual. O ensaio dos painéis não repete individualmente todas as receitas, compras ou talentos do jogo original.

A cena da vila atingiu 60 quadros/s no computador usado naquele ensaio. Isso não representa garantia para todos os aparelhos. O toque foi emulado; ainda não houve ensaio em celular físico nem teste de carga com muitos jogadores. Se o 3D falhar ou o contexto gráfico for perdido, o cliente apresenta recuperação por recarga; não oferece uma versão jogável em 2D.

## Escopo desta entrega

Em 07/10/2026, Alcione aprovou o jogo testado como única versão pública e autorizou substituir a entrada antiga. A mudança afeta a apresentação e os acessos, preservando o servidor e as contas. O código e os recursos versionados anteriores à promoção foram preservados em backup Git completo na revisão `daa62467f3f21222ef59bf9285e80d50f3b0b82e`, fora da publicação web. O histórico de desenvolvimento continua preservado.

Pagamentos, emails e administração continuam desativados na cópia local de ensaio. A implementação pública usa 3D estilizado e os recursos integrados ao jogo; melhorias futuras não fazem parte desta promoção.

## Créditos

- Motor **PlayCanvas 2.23.0**, licença MIT em `modern/vendor/LICENSE-PlayCanvas.txt`.
- Personagens **KayKit Adventurers** e **KayKit Skeletons**, de Kay Lousberg, CC0. Licenças, commits de origem e hashes em `modern/assets/characters/`.
- Cenários, integração, interface e equipamentos 3D desta versão em `modern/`.
- Demais créditos e licenças do jogo original permanecem preservados.

Fontes dos modelos: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 e https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0.
