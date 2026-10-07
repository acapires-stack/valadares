# Personagens e equipamento — integração de 07/10/2026

O catálogo conserva os sete corpos anteriores, com largura fina, e adiciona oito modelos Adventurers 2.0. Ranger está entre os básicos gratuitos. Engineer, Druid e Barbarian Large custam 5.000 gold a cada mudança para aquele corpo; a compra não cria um desbloqueio permanente. Trocar apenas a paleta é gratuito. Masculino/feminino depende do corpo disponível: não existe par por classe nem editor modular de rosto, botas ou armadura neste pacote.

A Tintureira permite experimentar antes de confirmar. Somente o servidor cobra, exige proximidade para uma troca paga e salva aparência, saldo e recibo antes de confirmar. O reenvio do mesmo pedido não cobra novamente. A arma não escolhe o corpo; qualquer traje pode usar as mesmas famílias de equipamentos. O Large mantém sua estatura autoral maior, com o perfil de largura já aprovado; alcance, colisão, atributos e regras de combate permanecem os mesmos.

Os modelos Weapons Bits e as duas bestas Adventurers são ligados aos IDs reais dos itens, inclusive versões aprimoradas. Os ícones correspondentes aparecem no inventário, equipamento e loot. As animações distinguem tiro, magia, estocada e armas de uma/duas mãos. `prepare-legacy-stabs.cjs` recupera estocadas originais descartadas na exportação compacta dos quatro corpos antigos, sem alterar sua malha ou esqueleto.

O Guardião da Mata usa o Plant Warrior original com seu equipamento. Os robôs têm a própria Forja Esquecida; não substituem o elenco da expedição antiga. O Senhor de Valadares recupera a apresentação de coroa e rosto anteriores. NPCs e os demais monstros aprovados conservam seus modelos e proporções.

Nos abrigos de NPCs do mundo aberto, novos spawns e respawns evitam a área protegida, e ataques do jogador não podem partir de dentro dela. Continua possível se defender do próprio caçador especial Highlander. A proteção considera o andar, evitando aplicar coordenadas de NPCs externos dentro das masmorras.

Validações locais incluíram compra/repetição/relogin/troca de armas com conta temporária, combate conectado na Forja, corpos e empunhaduras no renderizador, entrada/saída da Oficina com Large e layouts foco/clássico/compacto. O pacote de recuperação preserva os IDs comprados, gold e recibos, desabilitando temporariamente apenas visuais/rota novos; não reverte contas nem restaura um servidor que desconheça o catálogo.
