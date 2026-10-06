# Identidade visual dos monstros — candidato local

O problema observado era a repetição do mesmo corpo humanoide com outra cor ou tamanho. A nova apresentação usa os cinco modelos locais que já serviam aos jogadores e NPCs e acrescenta geometria própria às famílias de inimigos. Nada muda na vida, dano, alcance, posição, ataques, projéteis ou dados salvos.

| Família | Leitura visual |
| --- | --- |
| Animais e répteis | Rato baixo com orelhas e cauda; lobo com focinho, juba e presas; lagarto comprido com crista; cobra sinuosa. |
| Insetos e voadores | Aranha e escorpião com oito patas e carapaças diferentes; escorpião com ferrão. Morcego suspenso com asas largas e nervuras. |
| Humanoides | Orc com presas e ombreiras; líder com estandarte; troll pesado com braços grandes; minotauro com focinho e chifres; esqueleto exposto; caçador com capuz e arco; carrasco mascarado. |
| Espectros | Sombra sem pernas, manto afunilado, olhos luminosos, flutuação e braços que se movem ao atacar. |
| Dragões e golens | Drake alado com cauda e espinhos; Ancião com asas e chifres maiores; golem de pedra com juntas e runas; Rei com torreões, coroa e núcleo luminoso. |
| Chefes finais | Senhor das Profundezas com chifres e energia violeta; Senhor de Valadares com armadura, ombreiras e coroa douradas; Arauto com aletas laterais e insígnia clara. |

O aumento dos corpos feitos com formas geométricas melhora a leitura na câmera inclinada do jogo. Os humanoides continuam usando os modelos e as animações existentes. A orientação de todos segue a direção informada pelo jogo, inclusive durante movimento e combate.

Validação local: `node tools/modern/qa-monster-identity.cjs` carregou os modelos reais no Chrome isolado, verificou as 22 entradas de `MTYPE`, gerou capturas nomeadas por tipo, verificou as quatro direções de orc, drake, golem e sombra e observou animação de ataque no orc e na sombra. `node tools/modern/qa-facing.cjs` continuou passando para jogadores e movimento. Ambos terminaram sem erro de página. As capturas estão em [fauna](evidencias-monstros/fauna.png), [humanoides](evidencias-monstros/humanoides.png), [chefes](evidencias-monstros/chefes.png) e [quatro direções](evidencias-monstros/quatro-direcoes.png).

O ensaio usa uma cena visual isolada. Ainda cabe observar a composição final em jogo, com mapa, iluminação e interface, antes de publicar.
