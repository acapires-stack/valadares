# Roteiro local do elenco

Executar a partir da raiz do repositório, com a prévia HTTP local em `127.0.0.1:3338` disponível:

```powershell
node tools/modern/qa-roster-playthrough.cjs --label candidate
```

O instrumento captura os 22 tipos definidos no cliente, chefes e um grupo de drakes, com avatar próximo e nomes explícitos, em desktop e 844×390. Essas cenas são **somente visuais**. Separadamente, um backend real e temporário executa o roteiro jogável com movimento nas quatro direções, seleção, espada, cajado, arco, dano, morte, loot, coleta e relogin. Depois repete o roteiro no cliente clássico `/jogar`, na mesma conta e no mesmo backend isolado. No candidato 3D, uma cena complementar posterior verifica o encaminhamento de cliques em vizinhos, remoto, chão e cadáver retido; usa atores sintéticos e interrompe a entrada antes da regra de jogo, registrada separadamente em `input-review.json`.

```powershell
# Referência fixada no Git (actors + renderer, sem reverter arquivo de trabalho)
node tools/modern/qa-roster-playthrough.cjs --label baseline --actors-ref 5373640

# Só cenas visuais; não repetir combate já válido
node tools/modern/qa-roster-playthrough.cjs --mode visual --label candidate

# Só roteiro jogável; preserva atlas anterior se o hash do ator for o mesmo
node tools/modern/qa-roster-playthrough.cjs --mode combat --label candidate

# Delta somente no 3D; conserva a prova anterior do clássico
node tools/modern/qa-roster-playthrough.cjs --clients modern --label candidate-final

# Só encaminhamento de entrada e grupo apertado no mundo real; sem combate
node tools/modern/qa-roster-playthrough.cjs --mode input --label candidate-final-input

# Prova de design, somente no navegador: silhueta do jogador ocluso
node tools/modern/qa-roster-playthrough.cjs --mode input --occlusion-probe --label occlusion-proposal

# Módulo integrado: seleção focal, sete trajes, três armas e ciclo de vida
node tools/modern/qa-roster-playthrough.cjs --mode input --visibility-lifecycle --label visibility-integrated

# Ciclo de vida isolado do mesmo módulo/rigs, sem backend
node tools/modern/qa-roster-playthrough.cjs --mode visibility --label visibility-lifecycle

# Mundo local para teste manual: imprime endereço, conta e senha sintéticos
node tools/modern/qa-roster-playthrough.cjs --mode play --label manual
```

O modo manual fica disponível até `Ctrl+C`. A conta é sempre `RevisaoRuntime`, criada do zero nessa instância, com armas, flechas e consumíveis de teste. A porta WS é efêmera e limitada a `127.0.0.1`; não é o backend compartilhado 8098. O frontend continua sendo o da prévia 3338. Não há argumento de URL de produção nem de arquivo de contas externo. O servidor auxiliar recusa diretórios fora de `TEMP/valadares-roster-*` e exige um marcador de QA. Seus arquivos temporários ficam preservados como evidência. `--clients modern` ou `--clients classic` limita o percurso ao cliente afetado; o padrão `both` percorre os dois.

A rotina chama a função nativa `spawnMob` para criar ratos em tiles caminháveis conectados à praça. Não muda HP, dano, velocidade, alcance, inteligência, chance de loot ou atributos do produto. A navegação escolhe um caminho alcançável pela posição atual dos monstros; AI, desvios, crítico e loot continuam nativos, portanto timestamps e quantidade exata de drops variam. A sequência de ações e os critérios de verificação são fixos. O autoataque do jogo pode começar antes do clique explícito e escolher outra vítima ao morrer a anterior; o resultado identifica seleção e vítima do combate separadamente. Para fotografar inventário e relogar sem continuar atirando, o personagem retorna à zona segura por movimento normal.

Resultados e capturas ficam no diretório `work/revisao-profissional/revisao-elenco/<label>` do workspace de revisão. Use `--out <diretório>` para mudar apenas o destino dos artefatos. O roteiro congela os módulos de ator, renderer e mundo na abertura para evitar mistura de edições durante a captura; os hashes constam do resultado. Não há dependência do arquivo de contas real. O ambiente desta revisão usa Chrome local e Playwright do workspace de ferramentas já instalado.

Asserções de combate/persistência são obrigatórias; erros deixam `result.json`, trace dos eventos e uma captura do ponto de falha. Um atlas renderizado ou clique programado não deve ser apresentado como prova de combate, leitura humana, toque físico ou qualidade final de todos os monstros.
