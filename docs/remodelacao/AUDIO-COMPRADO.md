# Áudio comprado no Valadares

## Fonte e seleção

Fonte local do Alcione: `Gamemaster_Audio_Pro_Sound_Collection_v1.3_16bit_44.1k.zip` (v1.3, 16-bit/44,1 kHz). O ZIP completo passou por `ZipFile.testzip()` em 06/10/2026, sem falha de CRC. A seleção contém 33 arquivos MP3 mono, 22,05 kHz, 48–64 kb/s, total de 679.018 bytes. O jogo não inclui o ZIP nem os WAV originais. `modern/assets/audio/manifest.json` relaciona cada arquivo ao nome original, tamanho e SHA-256. Não havia arquivo identificado como licença, termos ou EULA dentro do ZIP; o comprovante e os termos da compra devem permanecer junto ao arquivo original do proprietário.

Regenerar a seleção com `python tools/modern/prepare-audio.py`; verificar arquivos existentes com `python tools/modern/prepare-audio.py --check`. A regeneração requer FFmpeg local e o ZIP no diretório Downloads do usuário, ou `--zip CAMINHO`. O script confere o CRC dos 33 membros extraídos. O pacote final é pequeno de propósito e não redistribui a coleção completa.

## Funcionamento

`game-audio.js` inicia o carregamento das nove amostras mais comuns na primeira cena ativa com efeitos ligados; as demais são carregadas no primeiro uso. A primeira emissão de uma amostra ainda não decodificada usa o efeito sintetizado. Uma falha de rede, arquivo ausente ou decodificação mantém esse fallback. O crítico usa agora um impacto pesado curto em lugar do toque metálico prolongado; seus fallbacks e os da varinha usam sons mais graves. Em combate, a música mantém as notas graves de base e omite a melodia aguda e sua oitava até um segundo após o último estado de combate. O som de coleta comum também fica mais baixo durante combate. Os limites de vozes e de rajada existentes continuam ativos. Efeitos usam o volume de efeitos; paisagens usam o volume ambiente; música sintetizada continua no volume de música. Master 0, efeitos 0, cena inativa e aba oculta silenciam a emissão. `dispose()` encerra loops, vozes, timer e requisições pendentes.

Ambientes comprados: PZ (parque), campo/floresta, caverna e interior. Neve, deserto e água mantêm o ambiente sintetizado até existir uma seleção adequada. A música não foi substituída por faixas do pacote.

Os arquivos precisam estar disponíveis em `/modern/assets/audio/*.mp3` no build estático. `manifest.json` serve para auditoria/regeneração e não é requisitado pelo jogo.

## Contrato para a interface

O motor aceita `play('footstep', { material })`, com `material` igual a `grass`, `dirt`, `stone` ou `wood`. Se omitido, deriva do bioma corrente; em interior, usa madeira. Chamar somente após deslocamento local confirmado, respeitando a cadência do personagem. O motor aplica intervalo mínimo de 115 ms entre passos e limite de vozes. A interface também pode informar `setScene({ interior: true })` ao entrar em edifício e `setScene({ interior: false })` ao sair. A propriedade é opcional e não altera os demais parâmetros de `setScene`.

As chamadas já existentes a `play(kind, details)`, `playSfx(builder)`, `setVolumes`, `setScene` e `dispose` conservam suas assinaturas. A camada de interface deve manter os controles atuais de volume e não acionar o áudio antes do gesto de usuário que cria o AudioContext.
