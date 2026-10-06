# Revisão integrada dos pacotes — Valadares

## Direção aprovada

Alcione pediu uma revisão do conjunto, explorando todo o acervo comprado conforme a necessidade, antes de voltar a jogar e relatar detalhes. A entrega reúne cenário, personagens/equipamentos, minimapa, som e os defeitos de movimento e sobreposição. Regras de combate, progressão, acesso ao mapa e liberdade de escolha continuam as existentes.

## Aplicação do acervo

- Dungeon: mobília, iluminação decorativa, livros, mineração e peças de ruína aplicados por função nas quatro casas e nas cavernas. Corredores, portas, bancada, altar e treino mantêm as coordenadas autoritativas.
- Forest: árvores, arbustos e rochas com silhuetas e paletas por região. Relevo visual não inventa obstáculos ou alturas jogáveis.
- Series 6: oito personagens pertinentes, seis armas e escudo nos equipamentos existentes. O herói continua usando rigs compatíveis com suas animações; machado usa Barbarian. Rifles, robôs e outros temas sem papel no jogo ficam no catálogo, sem serem inseridos à força. Escolha estética masculina/feminina continua uma evolução futura.
- Pro Sound: quatro músicas completas, duas da praça alternadas, uma de campo e uma de caverna. Streaming, pausa entre faixas, transição entre zonas e redução durante combate. A frase sintetizada curta deixa de ser trilha. Efeitos e ambiente conservam volumes independentes.
- Novos modelos são solicitados quando a cena precisa deles, com cache e aparência de reserva. Os originais comprados e arquivos editáveis ficam fora da publicação.

O inventário integral e o vínculo recurso→uso estão em `INVENTARIO-PACOTES-20261006.md`, `CENARIOS-COMPRADOS.md`, `PERSONAGENS-SERIES6.md` e `DIRECAO-SONORA-20261006.md`. SOURCE contém as fontes editáveis dos modelos EXTRA, não uma terceira leva de modelos. Não foi necessária nova compra.

## Interface e estabilidade

O minimapa ganhou desenho próprio, leitura local mais próxima, norte, direção, portas e serviços. A descoberta é respeitada em todos os pisos; monstros visíveis, jogadores e membros do grupo mantêm as regras de informação anteriores. A janela de loot fica ao lado do cartão de HP no foco 3D; Jornada não cobre a legenda do mapa.

O movimento passa a negociar confirmações de passos entre cliente e servidor. Até quatro passos ficam em trânsito; com atraso, o cliente aguarda a confirmação e retoma a cadência normal. Correções e mudanças de piso trocam a geração de movimento, descartando pacotes antigos. O servidor conserva os cinco créditos de rajada, recarga de 70 ms, adjacência e colisões. Cliente antigo continua compatível. O respawn é identificado separadamente e só usa a autorização concedida após morte, no ponto de nascimento; passos normais pendentes não consomem essa autorização.

Uma falha de rajada do protocolo antigo foi reproduzida localmente. Não houve registro do incidente original da conta de Alcione, então não se atribui sua ocorrência específica à rede. Sob latência muito alta ainda pode haver espera entre passos; não se promete eliminar atraso de conexão.

## Validação integrada

- Navegador real e servidor isolado: 49 passos confirmados, incluindo envio em lotes com atraso de 900 ms, zero correções de posição e zero erros. Cadência normal: 27 passos em aproximadamente 2,2 s. Evidência `evidencias-integracao/movimento.json`.
- Simulação do handler real: atraso de 30 a 1.200 ms, ordem/geração, colisão, salto inválido, respawn após passo pendente, recusa de respawn forjado. A rajada antiga reproduz correção; a janela nova passa.
- Jogo real isolado: quatro interiores, uso da bancada com ouro/inventário, treino físico e mágico com XP/custo, saída/reentrada, parada do treino ao afastar, retorno à vila ao reconectar e equipamento preservado. Zero erros JavaScript; 196 carregamentos de recursos sem falha no percurso. Viewport compacto emulado de 844×390 também passou.
- Servidor: duas contas sintéticas, pisos compartilhados e isolamento de serviços/trocas, distância inválida, save/relogin. Estado e contas de produção não foram usados nos testes.
- Áudio: reprodução real em Chrome, mudo separado, aba oculta, troca/retorno de zona, intervalo entre músicas, falha de arquivo e pedidos seletivos. Não houve avaliação auditiva humana neste teste; o gosto e equilíbrio musical serão conferidos por Alcione jogando.
- Atores: armas seguindo a mão, direção, ataques, troca de equipamento e aparência de reserva quando falta arquivo. Cenários e minimapa também têm testes focais e capturas. Revisão independente não encontrou bloqueio material no conjunto.

Não há comprovação de desempenho em aparelho celular físico. A liberdade do mapa e as operações normais continuam no aceite. A publicação e seu recibo são registrados no checkpoint do projeto após o término da verificação pública.
