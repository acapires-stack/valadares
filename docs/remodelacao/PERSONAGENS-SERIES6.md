# Personagens Series 6 — seleção para a remodelação

**Escopo:** seis personagens visuais do pacote comprado *KayKit Monthly Mystery Characters Series 6 (1.1)*. A jogabilidade, tipos de monstros, colisões, posições, tempos de ataque, equipamentos do jogador e controles continuam os mesmos. Os cinco modelos de personagens anteriores permanecem disponíveis.

| Novo modelo | Aplicação | Reserva se falhar |
| --- | --- | --- |
| Farmer_A | ferreiro, mercador, atendente, domador | Knight ou Rogue_Hooded conforme papel anterior |
| Farmer_B | mineiro, leiloeiro, crupiê | Knight ou Rogue_Hooded |
| Lorekeeper | eremita, embaixador Vohrim, banqueiro | Mage ou Knight |
| Cleric | tintureira, Madame Crepúsculo, vendedor de almas | Mage |
| OrcBrute | orc e líder orc | Barbarian |
| Monstrosity | troll | Barbarian |

Os outros NPCs, chefes, monstros e personagens dos jogadores mantêm as aparências anteriores. Orc e troll usam o mesmo tipo, dano e caixa de colisão que já tinham. Os adereços de diferenciação existentes continuam na cena. Equipamentos procedurais dos jogadores também permanecem; revisar armas e escudos de modelos embutidos é uma etapa posterior.

## Integração e origem

Os seis GLBs originais e quatro pacotes de animação compartilhados foram extraídos seletivamente para `modern/assets/characters-series6/`. O ZIP inteiro não entra no produto. A licença original CC0 está em `LICENSE.txt`, e `manifest.json` registra caminho, tamanho e SHA-256 de cada arquivo. O script `tools/modern/prepare-characters-series6.py` reproduz a seleção a partir do ZIP original indicado no script.

Os personagens originais da Series 6 não têm clipes embutidos; recebem `Rig_Medium` ou `Rig_Large` do próprio pacote. Esses arquivos trazem repouso, movimento, dano e morte. Para orc e troll atacarem de forma visível, o script acrescenta aos dois GLBs as **rotações** do clipe `1H_Melee_Attack_Chop` do Barbarian CC0 já usado no projeto, associadas por nome de osso. O manifesto registra tanto o hash da origem quanto o hash do GLB gerado. Mãos, armas e armadura procedurais continuam seguindo os ossos animados. O modelo antigo entra individualmente se faltar o novo modelo ou um dos seus pacotes de animação.

O pacote adicional soma **7.060.972 bytes** em dez GLBs; os cinco GLBs antigos somam **4.523.460 bytes** e seguem carregados para reserva e demais personagens. Os dez recursos novos carregam em paralelo após os antigos. Esta etapa aumenta o download inicial de modelos; o teste isolado registra tempo de carga e cadência de quadros como referência, sem equivaler a prova de desempenho em todos os computadores.

## Verificação

- `node tools/modern/qa-characters-series6.cjs`: confirma os seis modelos selecionados, malhas e clipes visíveis, 24 combinações de orientação, movimento real do braço no golpe de orc e troll e fallback de Cleric para Mage sob falha de rede.
- `node tools/modern/qa-monster-identity.cjs`: confere a identidade visual de todos os tipos de monstros e ataque; `node tools/modern/qa-facing.cjs`: confere as quatro direções e direção de movimento dos jogadores.
- Capturas locais: `tools/modern/.local/characters-series6/seis-personagens.png` e `golpe-orc-troll.png`. Elas são evidência da cena isolada em Chrome, não da partida online.
