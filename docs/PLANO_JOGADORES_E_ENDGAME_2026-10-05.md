# Valadares — jogadores, variedade de armas e mundo

Registrado em 05/10/2026 e revisado em 06/10/2026 a pedido de Alcione. **Estado: os quatro pontos foram implementados em 06/10, com validação local descrita abaixo.**

## Implementação de 06/10/2026

- **Início:** o guia opcional acompanha a primeira caçada, a entrega agora inclui um Porrete e a confirmação oferece equipá-lo. O painel Jornada sugere uma aventura, e suas rotas e expedição ficam acessíveis mesmo sem aceitar ou concluir a primeira missão.
- **Progressão:** Jornada mostra missão, recompensa, materiais, ouro e rotas de equipamento. Fabricação usa recibo persistente; reentrada consulta a operação pendente. A primeira missão e a expedição salvam a recompensa antes de confirmar. Falha de gravação não consome os materiais, e a recompensa da expedição permanece pendente quando a mochila está cheia.
- **Equipamentos:** 19 peças novas completam Machado, Clava, Distância, Lança e Espada com Escudo até T7, com arte própria. Receitas garantidas cobrem as faixas intermediárias; na ascensão T6→T7, a mesa permite escolher a família do resultado superior. A opção clássica, as chances e a proteção contra azar permanecem disponíveis.
- **Expedição:** Ruínas da Forja é acessível perto do Ferreiro, para um jogador, em três câmaras conectadas. A missão pede quatro orcs, três golens e um chefe. Cada conclusão concede três Fragmentos da Forja; a primeira também concede o Machado da Forja. O fragmento alimenta as novas receitas. A instância não ativa PvP; sair ou desconectar devolve o personagem à cidade.

O percurso foi conferido com cliente e servidor locais isolados: cadastro, primeira missão, equipamento, reentrada, fabricação das famílias e dois ciclos completos da expedição, incluindo recompensa inicial e repetida. Os testes de regressão cobrem proteção contra duplicidade, falha ao salvar, mochila cheia e recuperação. Computador e celular na horizontal foram conferidos; o modo vertical conserva o aviso existente para virar o aparelho. Isso comprova os fluxos observados, não retenção nem equilíbrio definitivo.

**Liberdade de escolha (Alcione, 06/10):** nenhuma classe ou arma é imposta, o guia pode ser recolhido e a primeira missão não libera nem bloqueia as novidades. A faixa 18 da expedição é recomendação, não requisito de entrada. Em um ensaio local com skills 18, conjunto T3 e oito poções de vida, o percurso completo levou 66 segundos, consumiu seis poções e terminou com recompensa resgatada; o teste não estima a experiência de todos os jogadores. As novas lanças são armas permanentes de combate a três passos com escudo, sem consumo por arremesso; o comportamento das lanças antigas permanece.

**Recuperação compatível:** `PROGRESSION_ENABLED=0` suspende novas fabricações e novas entradas na expedição, preservando catálogo, equipamentos conquistados, consultas de recibos, resgate pendente e saída. O comportamento foi testado localmente. Não restaurar o servidor anterior à expansão depois que novos itens forem emitidos: ele desconhece o catálogo. Qualquer aplicação da contingência usa a manutenção normal do jogo antes do redeploy; reativar com `PROGRESSION_ENABLED=1` após a correção.

O restante do documento preserva o raciocínio e as hipóteses do plano. A duração de 15–25 minutos era uma hipótese inicial; não é uma medição da rota implementada.

O pedido é ampliar as opções de fim de jogo, principalmente machados e outras armas, e depois dar mais conteúdo ao mapa. Em 06/10, Alcione esclareceu que reunir uma turma agora é difícil e que devemos continuar melhorando o jogo para receber melhor quem chegar. **Conseguir jogadores não é condição para avançar.** A prioridade é tornar a experiência inicial compreensível, a evolução recompensadora e os estilos de combate variados, com entregas pequenas que possam ser conferidas no jogo.

O objetivo é reduzir motivos para abandono. Sem jogadores novos, podemos verificar funcionamento, clareza e equilíbrio; retenção só poderá ser medida quando houver uso real. Esta revisão substitui a ordem anterior que colocava recrutamento como primeira entrega.

## Sequência proposta

| Ordem | Entrega | Como conferir se ajudou |
| --- | --- | --- |
| 1 | Conferir o percurso inicial: cadastro, movimento, primeira luta, loot, equipamento e próxima missão. Corrigir os obstáculos encontrados e aproveitar o guia existente. | Um personagem novo, sem comandos administrativos nem orientação externa, consegue completar a primeira missão, equipar o prêmio e identificar o próximo objetivo. Conferir computador e celular, além de sair e voltar com o progresso preservado. |
| 2 | Revisar a progressão e as recompensas: objetivo da próxima melhoria, origem dos itens, custos e proteção contra azar. Corrigir lacunas observadas sem refazer sistemas que já funcionam. | A recompensa chega e aparece; o jogador entende como melhorar o equipamento e quanto custa. Conferir persistência, inventário cheio e reconexão nos fluxos afetados. Ajustes de dificuldade dependem de comparação em combate. |
| 3 | Completar a progressão de Machado, depois Clava/Martelo e Distância, e ampliar alternativas de uma mão com escudo. Entregar uma família por vez. | Personagens com investimento equivalente conseguem enfrentar o mesmo conteúdo com diferenças compreensíveis de dano, defesa, alcance e consumo. Cada família tem uma rota de obtenção até o fim do jogo. |
| 4 | Acrescentar uma expedição curta, com identidade visual, missão, chefe e recompensa própria, aproveitando o mundo ou as Profundezas. | A rota pode ser encontrada e concluída por um jogador do nível previsto, sem depender de grupo ou horário marcado. A recompensa dá um objetivo claro e há motivo para uma nova visita. |
| 5 | Continuar em ciclos pequenos: conferir cada entrega no jogo, corrigir problemas concretos e escolher a próxima melhoria. Incorporar relatos de novos jogadores conforme chegarem. | Registrar o que foi observado e o que ainda precisa de uso real. Quando houver jogadores, acompanhar primeira missão, equipamento e retorno no dia seguinte e em 7 dias. |

Recrutamento, kit de convite e encontros ficam como oportunidades futuras, sem bloquear armas, correções ou mapa. Esta revisão não altera campanhas existentes nem inicia novos convites ou gastos. O conteúdo principal deve continuar útil com poucos jogadores e sem encontros combinados.

As verificações de desenvolvimento devem cobrir o fluxo afetado e a reutilização, com demonstração para Alcione quando houver uma entrega conferível. Contas de teste, administrativas e personagens acelerados não contam como retenção. Quando houver jogadores novos, usar contagens e denominadores, por exemplo “6 de 12 voltaram no dia seguinte”, e aproveitar os registros existentes antes de acrescentar coleta. Uma amostra pequena orienta correções; não comprova sucesso comercial.

As etapas 1 e 2 são uma revisão focal dos percursos existentes, não uma reforma completa antes das armas. Corrigir os impedimentos concretos e seguir para a primeira linha de machados; melhorias opcionais continuam no backlog.

## Lacuna de equipamentos registrada em 05/10/2026

Consulta de 05/10 em `server/server.js` (ITEM_META/WEAPON_SKILL) e `transmutation-rules.js`, base de gameplay 7958965. Reconfirmar o trecho afetado antes de implementar:

| Família | Limite atual da mesa | Direção de design proposta |
| --- | --- | --- |
| Espada de duas mãos | Faixa 7: Espada do Infinito | Referência de poder e comparação, preservando os equipamentos conquistados. |
| Magia | Faixa 7: Cajado Astral | Referência de alcance e custo de mana. |
| Machado | Faixa 3: Machado do Minotauro | Completar faixas intermediárias e altas; golpes fortes, menor defesa, combinação com crítico e efeitos já existentes. |
| Clava/martelo | Faixa 4: Martelo do Golem | Completar faixas altas; alternativa resistente, com dano e defesa equilibrados. |
| Distância | Besta na faixa 3; lança longa na faixa 2 | Arco/besta de duas mãos com munição e lança de uma mão com escudo, cada qual com seu custo e alcance. |
| Espada de uma mão + escudo | Faixa 5: Espada e Escudo do Guardião | Uma rota defensiva que também tenha continuidade no fim do jogo. |

Nomes provisórios para discutir: **Machado do Cataclismo**, **Martelo do Colosso** e **Arco do Eclipse**. Os nomes e efeitos são ideias; atributos, chances e fontes de obtenção ainda precisam ser definidos.

Começar por uma linha de Machado e compará-la em combate com a espada equivalente; depois aplicar o aprendizado a Clava e Distância. Comparar tempo para derrotar inimigos, dano recebido, poções/munição, alcance e custo para adquirir a peça com skills e melhorias equivalentes. Somente igualar o número de ataque não assegura equilíbrio.

A transmutação exige cuidado específico: a consulta de 05/10 registrou três resultados Ascendentes. Aumentar a lista reduz a chance de obter uma peça específica, mesmo mantendo a chance total e a proteção. Antes de ampliar, definir como buscar a família desejada — por exemplo, receita obtida em uma missão ou escolha de família na mesa, ainda como alternativas de design. Manter o progresso da proteção e mostrar claramente a chance total e os resultados possíveis. Planejar também ingredientes míticos das novas famílias para que todos os estilos tenham uma rota de evolução.

## Uma expansão pequena e com propósito

Conceito para a primeira área: **Ruínas da Forja**, nome provisório. Uma rota de 15–25 minutos, encontrável por missão, com dois tipos de inimigo reaproveitados, um encontro de chefe e uma recompensa ligada à nova linha de machados. Esses tempos e quantidades são recorte de protótipo, não conteúdo existente.

Priorizar uma missão ou receita que dê um objetivo previsível; o sorteio raro pode complementar a recompensa. Aproveitar as Profundezas já existentes para testar ambientes e objetivos diferentes entre trechos, em vez de apenas aumentar vida e dano dos mesmos inimigos. A primeira rota proposta atende a progressão da nova linha de machados; definir a faixa de nível ao comparar os equipamentos e conferir o percurso completo com um personagem equivalente. Ajustar depois com relatos reais, sem esperar uma turma para começar. Quando usar as Profundezas, preservar e comunicar suas regras atuais de PvP e morte.

Ideia adicional para quando houver público: uma **caçada comunitária** em horário combinado, usando um chefe existente e reconhecimento cosmético para os primeiros participantes. É opcional e não condiciona a progressão principal; os jogadores devem conseguir participar com diferentes armas.

## Referências pesquisadas e aplicação ao Valadares

- A filosofia publicada pela ArenaNet inclui progressão horizontal e aproveitamento de sistemas existentes; também considera enriquecer mapas existentes. Nossa aplicação proposta é criar alternativas de combate e dar objetivos às áreas. É uma referência histórica de design, não prova de que o Valadares já terá o mesmo resultado. [Guild Wars 2 — What's Next](https://www.guildwars2.com/en/news/whats-next-for-guild-wars-2/).
- A documentação Steamworks descreve testes com grupos controlados e recomenda contato direto com os jogadores, indicando onde e que tipo de feedback enviar. Também aborda encontros coordenados para multiplayer. Essa referência fica para quando houver público; reunir um grupo não é pré-requisito do plano revisado, nem pressupõe lançamento na Steam. [Steam Playtest — documentação oficial](https://partner.steamgames.com/doc/features/playtest).

**Próximo ciclo:** incorporar o uso de Alcione e, quando disponíveis, relatos de jogadores para ajustar dificuldade, custos e clareza. As quatro entregas já possuem implementação e evidência local; recrutar uma turma continua sem ser condição para melhorar o jogo.
