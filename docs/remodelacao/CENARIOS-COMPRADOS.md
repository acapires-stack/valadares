# Cenários KayKit no cliente moderno

Os ZIPs originais continuam em `C:\Users\Alcione\Downloads`. O preparo lê apenas
os modelos escolhidos e gera GLB autocontido em `modern/assets/scenery`; não
descompacta nem altera os arquivos de origem. Execute `py
tools/modern/prepare-scenery.py` para conferir novamente o CRC dos seis ZIPs
(FREE, EXTRA e SOURCE dos dois pacotes) e reproduzir os arquivos. O manifesto
`modern/assets/scenery/manifest.json` registra pacote, origem interna no ZIP,
tamanho e SHA-256 de cada GLB. Total atual: **21 modelos, 936.868 bytes**.

| Pacote | Uso selecionado | Licença |
| --- | --- | --- |
| KayKit Forest Nature Pack 1.0 EXTRA | Cinco árvores, duas rochas e dois arbustos da paleta Color1 | CC0 1.0, Kay Lousberg; cópia em `modern/assets/scenery/LICENSE-forest.txt` |
| KayKit Dungeon Pack 1.1 EXTRA | Barris, caixas, baú, estandarte, tocha, parede quebrada, entulho, mesa, cadeira e balcão | CC0 1.0, Kay Lousberg; cópia em `modern/assets/scenery/LICENSE-dungeon.txt` |

No exterior, árvores e rochas compradas substituem os volumes geométricos quando
terminam de carregar; o desenho anterior permanece como recuperação se faltar
algum arquivo. O carregamento é assíncrono e a API `createWorld` continua
síncrona. Os objetos são apresentação: passabilidade, interação, monstros,
rotas e colisão continuam decididos pelo mapa autoritativo. A estrada de terra
e a praça de pedra continuam livres; folhagem baixa aparece esparsamente nas
bordas e as fachadas recebem detalhes pequenos. A floresta usa copa arredondada
e árvores mais estreitas ao norte; as rochas e paredes quebradas diferenciam as
áreas de ruínas sem erguer barreiras novas nos caminhos.

Os interiores usam os pisos compartilhados `1000` (pousada) e `1001`
(oficina), no grid `x=46..54`, `y=46..52`. O corredor central entre o spawn
`(50,50)` e a saída `(50,51)` fica vazio. A pousada tem piso de madeira, uma
mesa no recanto oeste e balcão junto à parede leste. A oficina tem piso de
pedra, forno com luz de brasa, bigorna desenhada com materiais já existentes e
suprimentos periféricos. O pacote Dungeon não contém modelo de forja nem
bigorna; esses dois elementos são composições de cenário, não ativos KayKit.

Prévia isolada: `tools/modern/prepare-scenery-preview.html` usa o mesmo
`world.js` e um mapa sintético, sem servidor nem conta de jogador. A verificação
em Chrome headless via Playwright carregou os 21 GLB sem falhas nas cinco cenas
(vila, floresta, ruínas, pousada e oficina). Medições da prévia: 169–290 draw
calls no exterior e 44–50 nos interiores; são números do mapa sintético em
renderização por software, não FPS de jogo em GPU real. A amostra densa da vila
ficou em 13 FPS com SwiftShader, enquanto a pousada ficou em 60 FPS. O mundo
real tem outra densidade de árvores e requer conferência no cliente completo.
Capturas ficam fora do
repositório em `C:\Users\Alcione\Documents\Codex\2026-10-06\valadare\scenery-test`.
