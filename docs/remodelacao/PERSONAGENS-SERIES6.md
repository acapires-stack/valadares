# Personagens e equipamentos KayKit Series 6

**Resultado local:** a seleção comprada agora aparece no jogador, em serviços da vila e nos orcs/trolls. O código visual usa os estados, posições, tempos, itens, cores, cosméticos e controles existentes. Não acrescenta classe, tipo de monstro, regra de dano ou seleção obrigatória de aparência.

## Seleção em uso

| Modelo do pacote | Papel visual no jogo | Reserva individual |
| --- | --- | --- |
| Farmer_A e Farmer_B | ferreiro, mineiro, atendente, leiloeiro, crupiê, domador | Knight ou Rogue_Hooded |
| Lorekeeper | eremita, Vohrim, banqueiro | Mage ou Knight |
| Cleric | Madame Crepúsculo e vendedor de almas | Mage |
| MagicalGirl | tintureira | Mage |
| Hoarder | mercador | Rogue_Hooded |
| OrcBrute | orc e líder orc | Barbarian |
| Monstrosity | troll | Barbarian |

O jogador mantém o rig Knight, Mage ou Rogue_Hooded conforme a arma; machados agora usam o Barbarian, que já pertencia ao jogo e traz silhueta apropriada. Armadura, elmos, capas, coroas, tintas e anexos continuam ligados aos equipamentos reais do personagem. Não foi criada escolha de gênero ou aparência. Os outros seis personagens do catálogo Series 6 não foram incluídos no jogo porque seus temas (rifles, soldado de brinquedo, samurai futurista, criatura vegetal e guerreiro aviário) não têm papel equivalente no elenco atual; os acessórios pertinentes foram avaliados separadamente.

| Arma/equipamento existente | Novo acessório visual |
| --- | --- |
| espada | AvianSwordsman_Sword |
| machado | Orc_Axe |
| maça | Cleric_Mace |
| lança | PlantWarrior_Spear |
| cajado | Lorekeeper_Staff |
| arco | PlantWarrior_Bow_withString |
| escudo equipado | Cleric_Shield |

O acessório acompanha o encaixe da mão e a animação do personagem. A cor definida pelo item continua aplicada ao material; se o arquivo opcional falhar, a arma ou o escudo geométrico anterior permanece utilizável. Trocar equipamento remove o acessório antigo e refaz apenas o ator afetado.

## Carregamento e proveniência

Os cinco modelos legados carregam para iniciar a cena. Os oito novos personagens, quatro conjuntos de animação e sete acessórios são requisitados **somente quando um ator visível precisa deles**. Cada recurso tem uma única requisição em andamento, é reutilizado pelos atores e falha de modo individual para a aparência antiga. A interface deixa de esperar os 19 GLBs opcionais para ficar pronta. Em uma cena de teste que mostra todos os novos papéis e seis armas ao mesmo tempo, os opcionais ainda precisam ser baixados; esse ensaio não representa o download inicial típico.

Os 19 GLBs opcionais selecionados totalizam **9.071.588 bytes**; os cinco legados somam **4.523.460 bytes**. O script `tools/modern/prepare-characters-series6.py` extrai apenas os modelos necessários do ZIP comprado. Sete acessórios em glTF/BIN/PNG foram reunidos em GLBs com textura embutida. O diretório `modern/assets/characters-series6/` inclui licença original CC0 de Kay Lousberg e manifesto com SHA-256 de cada fonte e saída; o ZIP completo não faz parte do produto.

Os modelos de personagem Series 6 vieram sem clipes próprios. Repouso, movimento, dano e morte usam `Rig_Medium` ou `Rig_Large` do mesmo pacote. Para orc e troll, o script incorpora as rotações do golpe `1H_Melee_Attack_Chop` do Barbarian CC0 já presente no jogo, ligadas aos ossos homônimos; nenhuma posição ou regra de combate foi alterada. Se o modelo ou o rig opcional falhar, o Barbarian continua animado.

## Prova de navegador isolado

`node tools/modern/qa-characters-series6.cjs` confirmou oito modelos, sete acessórios visíveis, 32 orientações de NPCs/monstros, 24 de jogadores, seis estados de ataque, deslocamento da arma junto da mão no golpe, troca espada→cajado→espada e fallback sob falha de modelo/escudo. `node tools/modern/qa-monster-identity.cjs` cobre as identidades dos tipos de monstro e o golpe do orc; `node tools/modern/qa-facing.cjs` cobre as quatro direções e direção inferida de movimento. As capturas de atores, armas e golpes ficam em `tools/modern/.local/characters-series6/`. Esses ensaios comprovam a apresentação isolada em Chrome; a partida integrada é validada pelo responsável da integração.
