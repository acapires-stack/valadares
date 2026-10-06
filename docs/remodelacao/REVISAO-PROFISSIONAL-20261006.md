# Revisão de atores, combate, áudio e interface

06/10/2026. Candidato local validado sobre o runtime publicado 81b618b. A revisão corrige falhas concretas; não declara a direção de arte inteira concluída.

## Resultado

- Sete personagens completos e cinco paletas, escolhidos livremente pelo botão Personagem ou V. Trocar a arma não muda o corpo. Aparência salva pelo servidor, preservada no relogin e no cliente clássico. Sábio, Clérigo e Maga arcana aproveitam o Series6 comprado.
- Escalas uniformes preservam proporções. Skeleton_Minion substitui o esqueleto pesado. Wolf oficial Quaternius, CC0, usa seus próprios clipes. Removidos volumes improvisados sobre personagens e chefes.
- Preparação, contato e retorno dos golpes acompanham a cadência. Dano continua autoritativo e imediato. A vítima morta sai imediatamente da seleção; apenas sua representação aguarda brevemente o contato antes de morrer/desaparecer. Confirmações antigas não usam o golpe seguinte. Troca de arma, cancelamento, piso e desconexão limpam efeitos pendentes.
- Sons de lançamento e impacto separados; variantes sem repetição imediata, volumes ajustados e cache atualizado. A música comprada permanece. Efeitos de morte por dano contínuo não aparecem no piso errado; recompensas continuam preservadas.
- Minimapa moderno nos layouts foco e clássico da versão 3D, inclusive menu de toque. Painéis e escolha de aparência cabem na tela compacta. Quatro interiores percorridos, serviços acessíveis, colisões e sala de treino corrigidos.

## Verificação

Contas sintéticas em servidor local isolado 3338/8098; nenhuma conta real alterada por ensaio. Persistência inclui gravação rejeitada/recuperação, idempotência, payload inválido, cliente clássico e relogin. Três trajes novos examinados em seis famílias de arma. Testes de pisos e confirmação atrasada passaram. Revisões independentes de persistência e apresentação letal concluídas.

Captura de combate real local: três mortes, sem fallback sonoro, clipping ou erro JavaScript; imagem retida até o contato e descartada depois. Isso comprova a sequência técnica, não escuta artística. Wolf foi inspecionado no renderer e no cenário com representação visual de teste; não alegamos caçada autoritativa completa desse monstro.

Build público: 223 arquivos. A versão empacotada foi aberta, com 88 recursos modernos conferidos, zero erro HTTP/JavaScript, foco/clássico/compacto e prévias dos três trajes novos. Fontes de servidor, ferramentas e saves ficam fora da publicação.

Evidências detalhadas: C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/ (RUNTIME.md, AUDIO.md, ATORES.md, AMBIENTE-UX.md, REVISAO-PERSISTENCIA-APARENCIA.md e integracao-final/result.json).

## Limites ainda reais

Rato, cobra, aranha, escorpião, lagarto, morcego, drakes, golems e pets ainda usam formas procedurais. Minotauro e alguns chefes precisam de arte própria. Arco não anima corda/flecha na mão; besta compartilha visual de arco. Sete trajes não são editor modular de rosto/cabelo. Os dois pacotes Standard gratuitos examinados não entregam composição modular pronta com combate completo; não foram recortados nem houve compra adicional.

A apreciação auditiva exige escuta; não foi alegada pelas medições. Não houve validação em celular físico ou teste de carga. Números flutuantes e projéteis conservam sua apresentação própria. O problema preexistente de alcance PvP não foi alterado nesta revisão.

## Publicação e recuperação

Autorização de Alcione para publicar e jogar com a conta existente permanece válida. Cliente e servidor devem ser publicados juntos após o comando administrativo normal de manutenção e confirmação do bloqueio. Preservar volume e contas. Reversão de código para 81b618b; nunca restaurar contas como parte dessa reversão. O checkpoint registra commit, recibo público e estado real da publicação.
