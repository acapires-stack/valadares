# Cenários KayKit no cliente moderno

Os ZIPs originais continuam em `C:\Users\Alcione\Downloads`. `py tools/modern/prepare-scenery.py` lê somente os modelos selecionados e suas dependências, gera GLBs autocontidos em `modern/assets/scenery` e atualiza o manifesto com origem, tamanho e SHA-256. A validação integral de CRC dos sete ZIPs registrada no manifesto é **histórica**; o preparo atual não a repete. Os originais não são modificados.

A seleção atual tem **52 modelos Forest/Dungeon**, somando **2.418.136 bytes**. O boneco de treino Series 6 ocupa mais **115.164 bytes**; portanto o catálogo de cenário soma 53 GLBs e 2.533.300 bytes. Os modelos carregam apenas quando a área/chunk os solicita. Depois de um lote, o renderer recompõe os chunks próximos; enquanto isso, os volumes anteriores continuam como recuperação. O mapa autoritativo continua decidindo passabilidade, serviços, monstros, rotas e colisão.

| Origem | Uso na seleção | Licença preservada |
| --- | --- | --- |
| Forest Nature Pack 1.0 EXTRA | Dez silhuetas de árvore em Color1/Color2, quatro arbustos e cinco rochas; bosques e bordas de ruína. | CC0 1.0, Kay Lousberg; `modern/assets/scenery/LICENSE-forest.txt`. |
| Dungeon Pack 1.1 EXTRA | Barris, baú, tochas, mobília, livros, estantes, cama, mineração, andaime, pilar e paredes decorativas; interiores e caverna. | CC0 1.0, Kay Lousberg; `modern/assets/scenery/LICENSE-dungeon.txt`. |
| Monthly Mystery Series 6 | Base do boneco de treino existente, preservada na sala de treino. | CC0 1.0, Kay Lousberg; `modern/assets/scenery/LICENSE-series6.txt`. |

Os interiores `1000..1003` ocupam a grade `x=46..54`, `y=46..52`. Os detalhes comprados ficam junto das paredes ou nas bancadas; o corredor `x≈50` entre o serviço `(50,46)`, o spawn `(50,50)` e a saída `(50,51)` continua visualmente livre. A oficina mantém a forja e a bigorna compostas localmente porque Dungeon não fornece esses modelos. Caverna e ruínas usam as peças estruturais somente como apresentação sobre tiles já bloqueados; elas não mudam o mapa.

`node tools/modern/qa-scenery-catalog.cjs` abre `modern/world.js` no Chrome headless com mapas sintéticos e salva oito capturas em `docs/remodelacao/evidencias-catalogo/catalogo-*.png`. Foram 0 erros de página/asset; 169–292 draw calls em exteriores/caverna e 54–77 nos interiores. A luz da prévia usa o mesmo `shadowBias`, `normalOffsetBias` e resolução de sombra do renderer de produção. Esses números são da prévia, não desempenho de partida em aparelho físico. O inventário, a matriz recurso→uso e as lacunas estão em [INVENTARIO-PACOTES-20261006.md](INVENTARIO-PACOTES-20261006.md).
