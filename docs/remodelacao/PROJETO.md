# Valadares — projeto de remodelação
**Concepção inicial • 6 de outubro de 2026 • frente paralela**

## A proposta

Criar uma nova apresentação de Valadares em **3D estilizado, com câmera alta fixa, mundo autoral e interface mais leve**, preservando a liberdade, a movimentação e o jeito de lutar que Alcione aprovou.

A direção é um mundo de pedra clara, telhas de terracota, vegetação verde-jade, água turquesa e forjas âmbar. Personagens têm silhuetas reconhecíveis, armas visíveis e animações expressivas. A ambição é fazer alguém entender a aventura e querer entrar só de observar uma cena curta.

**Recomendação técnica inicial: PlayCanvas para o novo cliente Web.** A escolha será confirmada por uma pequena área jogável com arte de qualidade e combate real. O resultado desta etapa é pesquisa, direção criativa e plano; ainda não existe uma versão jogável desta proposta.

![Conceito visual de Valadares](C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/outputs/valadares-nova-direcao-conceito.png)

*A prancha foi gerada com a ferramenta integrada de imagem. Representa composição, materiais, cores e atmosfera. Não é captura do jogo, demonstração do motor ou garantia de desempenho. A densidade de detalhes será ajustada no cenário real.*

## O novo Valadares que proponho

### Mundo e mapa

A vila inicial ganha uma praça aberta, forja reconhecível, ponte sobre um rio e um marco visível à distância. O jogador encontra os serviços pelo ambiente e por ícones consistentes; nomes completos aparecem quando úteis. Os caminhos conduzem a lugares diferentes, e não apenas a corredores com outra textura.

| Região proposta | Identidade visual | Sensação e função |
|---|---|---|
| Vila e rio | Pedra clara, madeira, telha, bandeiras e água em movimento | Acolhimento, encontro e serviços; praça ampla para enxergar outros jogadores |
| Floresta | Verde-jade, raízes, clareiras e ruínas entre as árvores | Descoberta, caminhos alternativos e lutas legíveis |
| Ruínas da Forja | Pedra azul-acinzentada, cobre, carvão e luz âmbar | Expedição com ambiente próprio; o chefe é reconhecido pela forma e pela animação |
| Regiões futuras | Paleta, arquitetura, som e marco exclusivos | Expansão por lugares memoráveis, depois de acertar a primeira região |

O mapa será desenhado pela experiência de atravessá-lo: chegada, descoberta de um marco, escolha de rota, encontro e retorno. Desvios e atalhos recompensam curiosidade. A informação de perigo orienta a escolha; não cria exigências novas de nível, classe ou conclusão de tutorial.

Relevo, margens e vegetação dão profundidade. No primeiro protótipo, as superfícies caminháveis respeitam a lógica atual de coordenadas e colisões. Uma ponte ou escada visual precisa corresponder a um caminho válido no servidor; mudar a topologia do mundo exigirá dados de mapa compatíveis nas duas pontas.

### Personagem, combate e som

O personagem precisa continuar identificável no tamanho real de jogo, inclusive no celular. Espada, machado, arco, lança e magia terão poses e impactos próprios. Armaduras compartilham uma base de animação e pontos de encaixe para facilitar a expansão do catálogo.

A animação acompanha os tempos de ataque existentes. O brilho, o som e a reação do inimigo indicam impacto sem esconder o alvo ou atrasar a resposta. Não acrescentar esquiva, combos obrigatórios, mira diferente ou bloqueio de movimento como consequência da troca visual.

A câmera é alta, fixa e orientada de forma consistente com os comandos. Telhados e copas ficam transparentes quando ocultam o personagem. O campo de visão útil deve preservar as condições de combate atuais; aumentar zoom ou enxergar além dos limites não pode gerar vantagem involuntária.

Som ambiente caracteriza cada região; passos e golpes usam variações discretas. Volume, efeitos intensos e movimento de câmera permanecem ajustáveis.

### Interface

O mundo passa a ocupar a maior parte da tela. Vida, mana, alvo e ações frequentes ficam visíveis; inventário, talentos, receitas e detalhes podem ser abertos por painel ou atalho. No desktop, o jogador pode fixar painéis conforme sua preferência.

Orientações são opcionais e dispensáveis. O jogador pode explorar, lutar, treinar, trocar de arma ou abrir sistemas desde que as regras atuais permitam. Modernizar a apresentação não deve introduzir restrições de escolha.

No celular, o projeto precisa ser desenhado para toque desde o primeiro cenário: controles alcançáveis, texto legível e espaço para observar a luta. A entrada pelo navegador continua sendo prioridade.

## O que a pesquisa sustenta

**Um mundo pode ganhar presença visual preservando sua identidade.** A atualização Radiant Wilds de Albion, lançada em abril de 2026, trabalha iluminação, terreno, água, vegetação e identidade dos biomas. Isso oferece uma referência concreta para pensar ambiente como conjunto. Não é prova de que o mesmo tratamento aumentará nossa aquisição. [Anúncio oficial de Albion](https://albiononline.com/news/radiant-wilds-live), [explicação da atualização](https://albiononline.com/update/radiant-wilds).

**Coerência artística é parte do produto.** A equipe de Supergiant descreve a integração entre ilustração, ambiente e identidade de seus jogos. A lição aplicável é manter linguagem visual consistente entre mundo, personagens e menus; copiar seu volume de produção não seria uma estimativa realista para Valadares. [Equipe de Supergiant](https://www.supergiantgames.com/team/).

**Pixel art continua sendo uma direção viável de jogos contemporâneos.** Core Keeper é uma referência de apresentação e exploração em pixel art. Sua existência não determina a preferência dos jovens por Valadares; serve para evitar a conclusão automática de que somente 3D pode atrair. [Página oficial do produto na Steam](https://store.steampowered.com/app/1621690/Core_Keeper/).

Minha escolha por 3D estilizado decorre do pedido de pensar uma nova apresentação, da oportunidade de construir mapas com profundidade e da reutilização de personagens animados e equipamentos. É uma decisão de projeto, não uma conclusão estatística sobre idade.

A campanha consultada nesta conversa mostrou cliques, mas ainda não ligou cada visita a início de jogo e retorno. Portanto, o visual antigo como causa de perda de jogadores permanece uma hipótese. O recorte inicial proposto para avaliar atração é de jovens adultos, aproximadamente 18–34 anos; não há preferência visual desse grupo comprovada pelos dados atuais.

## Motor: comparação e decisão

| Tecnologia | O que oferece | Encaixe no projeto e limite relevante |
|---|---|---|
| **PlayCanvas — recomendado para a primeira prova** | Motor 3D Web, JavaScript/TypeScript, modelos, materiais, animações; uso com editor ou independente | Aproxima-se do ambiente técnico atual. Podemos fazer um cliente organizado, separado, usando o servidor Node/WS existente. Ainda exige produzir arte e medir o jogo em aparelhos reais. |
| **Godot 4 — alternativa se as prioridades mudarem** | Motor e editor completos para 2D/3D | O destino Web usa WebAssembly e WebGL2/Compatibility. A documentação atual não permite exportar projetos C# de Godot 4 para Web. Requer outro fluxo de cliente; ganha interesse se aplicativo nativo virar prioridade. |
| **Phaser — alternativa para uma direção 2D nova** | Framework de jogo 2D para Web, com cenas, entrada e câmeras | Bom para uma apresentação totalmente redesenhada em 2D. Não é o caminho escolhido para o mundo 3D proposto. |
| **PixiJS — opção de renderização 2D** | Renderizador e organização de objetos visuais | Permite uma apresentação sob medida, com mais sistemas de jogo e ferramentas a compor por conta própria. |
| **Three.js — biblioteca 3D** | Renderização, cenas e câmeras | Pode produzir ótima arte; demanda mais composição de ferramentas de jogo. O fracasso visual anterior não demonstra uma incapacidade da biblioteca. |

Fontes técnicas: [PlayCanvas independente do editor](https://developer.playcanvas.com/user-manual/engine/standalone/), [Godot Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Phaser](https://docs.phaser.io/phaser/getting-started/what-is-phaser), [PixiJS](https://pixijs.com/8.x/guides/components/renderers), [Three.js e desenvolvimento de jogos](https://threejs.org/manual/pages/game.html).

PlayCanvas documenta WebGL2 como base e WebGPU como possibilidade com retorno a WebGL2. O projeto deve funcionar no caminho WebGL2; WebGPU não será requisito para entrar. Suporte declarado ao navegador não garante desempenho aceitável em qualquer aparelho. [Navegadores suportados](https://developer.playcanvas.com/user-manual/engine/supported-browsers/).

**Fazer uma primeira prova em PlayCanvas.** Não desenvolver dois clientes completos em paralelo para decidir. Se a cena não alcançar boa leitura, fluidez e custo de arte viável, diagnosticar o motivo: qualidade artística, densidade, carregamento ou limitação técnica. Só então comparar a alternativa pertinente, com o mesmo conteúdo.

O fluxo inicial pode usar o motor localmente com TypeScript e arquivos versionados. O serviço de editor online e eventuais pacotes pagos de arte não são pré-requisitos desta proposta. Nenhuma contratação foi feita.

## Como preservar o jogo que funciona

O projeto paralelo terá um cliente separado, ativos próprios e ambiente de teste separado. O servidor continua responsável por combate, recompensas, inventário e persistência. A nova apresentação recebe estado e envia os comandos previstos pelo protocolo.

A organização proposta é: **entrada do jogador → adaptador de comandos → servidor atual → estado recebido → animação, cenário e interface**. O cliente pode suavizar a apresentação, mas não inventa dano, loot, posição válida ou tempo de ataque.

O código atual já possui uma ponte de estado para o modo 3D, mas ela depende de desenhos e estruturas do cliente existente. Ela é uma referência de integração, não um cliente novo pronto. A separação das regras e da apresentação precisa ser demonstrada.

O contrato de preservação inclui:

- Mesmas regras de movimento, alcance, ataque, magia, alvo e uso de itens.
- Mesma progressão e liberdade de escolha de equipamentos.
- Preservação de personagem, inventário, ouro e recompensas na futura migração.
- Retorno de conexão, sair/entrar e mudança de área sem divergência.
- Sem executar dois clientes com o mesmo personagem simultaneamente para comparar resultados.
- Comparação inicial com contas e estado de teste, preservando a operação atual.

Se o novo mapa alterar caminhos ou áreas acessíveis, essa mudança será tratada como conteúdo de mundo com colisões e spawns correspondentes. Não será escondida dentro de uma troca de renderizador.

## Entregas do projeto paralelo

| Etapa | Entrega concreta | O que precisa ficar demonstrado |
|---|---|---|
| **0. Concepção — entregue nesta rodada** | Pesquisa, direção de arte, prancha e este plano | Há uma proposta de identidade e uma razão para a escolha técnica |
| **1. Primeira cena real** | Um trecho da praça, personagem animado, arma, água, luz e vegetação no navegador | Captura do motor em movimento, escala correta e resultado visual que convença ao ser visto |
| **2. Combate preservado** | Um encontro com inimigo em servidor de teste, ataque, magia, dano, loot e interação | Comandos e resultados corretos, resposta equivalente, alvo sempre legível |
| **3. Pequena aventura completa** | Vila → caminho de floresta → uma sala da Forja → retorno | Experiência de aproximadamente 5–10 minutos, duas famílias de arma, recompensa e interface utilizável |
| **4. Revisão em aparelhos e uso** | Desktop, Android e Safari/iPhone quando disponível; reentrada e reconexão | Limites conhecidos e correções da cena real; aprovação visual ao jogar, não só em imagem |
| **5. Expansão por regiões** | Mais equipamentos, inimigos, serviços e mapas | Produção repetível com o mesmo padrão; ampliação conforme cada região fica pronta |

A primeira cena pede poucos ativos reais: um personagem com conjunto de animações, um inimigo, uma arma, módulos de construção, terreno, vegetação e água. Arquivos de modelagem, texturas, animações e suas licenças precisam acompanhar o projeto. Uma imagem gerada não substitui esses ativos. PlayCanvas tem importação de modelos e animação; o trabalho de arte permanece necessário. [Modelos e ativos](https://developer.playcanvas.com/user-manual/assets/models/), [animação](https://developer.playcanvas.com/user-manual/animation/).

O maior fator de prazo é alcançar e repetir a qualidade de arte. A primeira cena deve medir o tempo de produzir e revisar um personagem e um conjunto de cenário antes de estimar o mundo inteiro. O orçamento será separado em programação, modelagem/animação, ambiente, áudio e verificação; esta pesquisa não fecha um orçamento ou data de lançamento.

## Como saber se melhorou

São metas de projeto a confirmar no protótipo, não resultados medidos:

| Dimensão | Comparação proposta |
|---|---|
| Arte | Capturas reais e movimento nas mesmas condições; mundo coerente, materiais distinguíveis, personagem legível |
| Combate | Cenários controlados com mesmas regras, posições e equipamentos; alcance, cadência, dano, alvo e consumo preservados |
| Fluidez | Buscar 60 fps no desktop de referência e ao menos 30 fps sustentados no celular de referência; registrar quedas e aquecimento após 15 minutos |
| Entrada | Medir carregamento sem cache em rede limitada e tempo até controlar o personagem; orçamento inicial proposto de até 10 MB antes de jogar, restante por região |
| Densidade | Medir entidades realmente visíveis e cenas carregadas; registrar separadamente jogadores, inimigos, objetos e efeitos |
| Interesse | Comparar clipes reais e a primeira sessão: vontade de jogar, compreensão do que acontece, início da partida e retorno |
| Liberdade | Orientação dispensável; nada novo impede escolher arma, explorar ou acessar sistemas permitidos pelas regras |

A comparação visual pode começar com Alcione e avaliação interna. Quando houver participantes novos, incluir pessoas da faixa pretendida e jogadores que gostam do Valadares atual. Uma amostra pequena orienta correções, mas não comprova aumento de retenção de toda a população. Recrutamento não bloqueia o desenvolvimento.

Para medir a campanha, o próximo desenho de dados deverá ligar origem da visita, início da partida e retorno, com dados mínimos e definição clara dos eventos. Não atribuir um jogador ao TikTok só porque entrou durante a campanha.

## Lições aplicadas, sem prender o novo ao passado

Os registros locais de julho descrevem uma apresentação que passou nos testes técnicos e foi rejeitada visualmente. Chão chapado, relevo pouco perceptível, cores lavadas e excesso de etiquetas aparecem como problemas concretos. Eles mostram por que o projeto precisa de direção de arte e inspeção em movimento.

Há também um candidato LPC de agosto nos registros históricos, com avaliação visual então pendente; ele não deve ser confundido automaticamente com a mesma tentativa. O novo projeto terá identidade própria e uma cena real como primeira prova.

Nesta rodada não houve alteração no jogo publicado. O próximo marco proposto é **a primeira cena real em PlayCanvas**, usando a identidade da prancha e a lógica de movimento existente como referência, antes de construir o restante do mundo.

## Rastreabilidade

Pesquisa técnica e referências oficiais consultadas em 06/10/2026. Base atual lida: worktree `C:\claude\_worktrees\valadares-retencao-20261006`, commit `e17408b6ac8fc490cbf904b7f98dc52611794945`; `CLAUDE.md` sobre Canvas/Node/3D e `ROADMAP.md`, linhas 196 e 204–209, sobre a experiência visual anterior. A proposta não declara que as tecnologias pesquisadas foram instaladas ou testadas.

Prancha produzida pela ferramenta integrada `image_gen`; arquivo `valadares-nova-direcao-conceito.png`. O prompt integral está no arquivo complementar `prompt-arte-valadares.txt`.
