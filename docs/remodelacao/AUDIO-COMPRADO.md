# Áudio comprado no Valadares

## Fonte e seleção

Fonte local do Alcione: `Gamemaster_Audio_Pro_Sound_Collection_v1.3_16bit_44.1k.zip` (v1.3, 16-bit/44,1 kHz). O ZIP completo passou por `ZipFile.testzip()` em 06/10/2026, sem falha de CRC. A seleção contém 33 MP3 mono, 22,05 kHz, 48–64 kb/s de efeitos e ambiências (679.018 bytes), mais quatro MP3 estéreo, 44,1 kHz, 96 kb/s de música (5.952.760 bytes). Total: 37 arquivos e 6.631.778 bytes. O jogo não inclui o ZIP nem os WAV originais. `modern/assets/audio/manifest.json` relaciona cada arquivo ao nome original, tamanho e SHA-256. Não havia arquivo identificado como licença, termos ou EULA dentro do ZIP; o comprovante e os termos da compra devem permanecer junto ao arquivo original do proprietário. A [página do fabricante](https://www.gamemasteraudio.com/product/pro-sound-collection/) anuncia licença comercial para o produto, mas não substitui a conferência dos termos específicos da compra.

Regenerar a seleção com `python tools/modern/prepare-audio.py`; verificar arquivos existentes com `python tools/modern/prepare-audio.py --check`. A regeneração requer FFmpeg local e o ZIP no diretório Downloads do usuário, ou `--zip CAMINHO`. O script confere o CRC dos 37 membros escolhidos enquanto os lê. O pacote final não redistribui a coleção completa.

## Funcionamento

`game-audio.js` inicia o carregamento das nove amostras mais comuns na primeira cena ativa com efeitos ligados; as demais são carregadas no primeiro uso. A primeira emissão de uma amostra ainda não decodificada usa o efeito sintetizado. Uma falha de rede, arquivo ausente ou decodificação mantém esse fallback. O crítico usa um impacto pesado curto; seus fallbacks e os da varinha usam sons mais graves. A música agora usa `<audio>` conectado ao barramento Web Audio, carrega só a faixa da área ativa e alterna as duas da praça. Ao terminar, deixa 30–90 segundos apenas com a ambiência; na troca estável de área, cruza as trilhas em 2,5 segundos. O combate atenua a música da área sem iniciar tema a cada golpe; a atenuação persiste por três segundos após a última indicação de combate. Uma falha de música deixa apenas a ambiência e tenta a próxima faixa após intervalo, sem voltar à frase sintetizada. O som de coleta comum também fica mais baixo durante combate. Os limites de vozes e de rajada existentes continuam ativos. Efeitos, paisagens e música mantêm volumes separados. Master 0, música 0, cena inativa e aba oculta pausam a trilha; efeitos 0 silencia efeitos; `dispose()` encerra loops, mídia, vozes, timer e requisições pendentes.

Ambientes comprados: PZ (parque), campo/floresta, caverna e interior. Neve, deserto e água mantêm o ambiente sintetizado até existir uma seleção adequada. Trilha da praça: `music_calm_tree_of_life.wav` e `music_calm_green_lake_serenade.wav`; campo: `music_misty_woods_calling.wav`; caverna: `music_epic_orchestral_bg_underscore.wav` (nomes originais sob `zz_Bonus_Music_zz`). A adequação artística depende da escuta de Alcione em uso.

Os arquivos precisam estar disponíveis em `/modern/assets/audio/*.mp3` no build estático. `manifest.json` serve para auditoria/regeneração e não é requisitado pelo jogo.

## Contrato para a interface

O motor aceita `play('footstep', { material })`, com `material` igual a `grass`, `dirt`, `stone` ou `wood`. Se omitido, deriva do bioma corrente; em interior, usa madeira. Chamar somente após deslocamento local confirmado, respeitando a cadência do personagem. O motor aplica intervalo mínimo de 115 ms entre passos e limite de vozes. A interface também pode informar `setScene({ interior: true })` ao entrar em edifício e `setScene({ interior: false })` ao sair. A propriedade é opcional e não altera os demais parâmetros de `setScene`.

As chamadas já existentes a `play(kind, details)`, `playSfx(builder)`, `setVolumes`, `setScene` e `dispose` conservam suas assinaturas. A camada de interface deve manter os controles atuais de volume e não acionar o áudio antes do gesto de usuário que cria o AudioContext.
