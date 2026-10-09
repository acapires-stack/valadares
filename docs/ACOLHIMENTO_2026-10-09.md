# Acolhimento e companheiros — 09/10/2026

Base: 620c995. Alterações: porta touch separada da hotbar; primeira missão antes das diárias; interface simples para conta nova; recompensas de Clava/arma equipada; prazo UTC compartilhado; site mobile/ajuda; métricas agregadas protegidas e GA opcional; dez companheiros explicitamente automáticos.

Companheiros patrulham a vila e arredores, acompanham um humano por vez e auxiliam apenas monstros comuns já atingidos por um humano presente. Limite compartilhado de 15% HP, sem último golpe, saque, inventário, PvP, contas ou ranking. Não entram em interiores/masmorras. Portas, NPCs e serviços fixos são evitados. COMPANIONS_ENABLED=0 desativa a função.

Revisão independente: economia/auth/save compatíveis. Divulgação da medição interna adicionada a privacy.html; painel esclarece retorno após primeiro login observado, não cadastro. Achado sobre fallback 2D não se aplica: base publicada já é exclusivamente 3D; QA das rotas incluindo ?visual=classic e das falhas/reparação confirma recuperação 3D sem fallback clássico.

Validação: 101 testes passaram na primeira suíte; três arquivos não iniciaram por dependência ws ausente na cópia. Dependência local existente reutilizada; os cinco testes desses três arquivos passaram. 106 testes ao todo sem falha de produto pendente. Build público 469 arquivos, sem servidor/saves/ferramentas. JS inline e diff conferidos.

QA integrado: work/qa-3d-only/2026-10-09T14-55-58-315Z-b2195a/result.json. Dez atores, patrulha, clique no modelo, seguir/dispensar, desktop/mobile, evento janela, saída/reentrada, persistência e proteção admin. Ciclo de rollback executou server.js da base 620c995 com dados sintéticos produzidos pela nova versão; login/logout preservaram ouro e engagement; retorno à nova versão confirmou dez atores. work/qa-acolhimento.cjs reproduz o ensaio local.
QA regressão 3D: work/qa-3d-only/2026-10-09T14-57-51-799Z-f33f34/result.json. Rotas, movimento, layouts, reentrada, perda WebGL/módulo e recuperação; zero erro JS inesperado.

Reversão operacional: manutenção autenticada, confirmar maintenance=true/online=0; reverter este commit e publicar novamente, preservando o volume /data e todos os accounts/state. Não restaurar snapshot antigo de contas. Formato de conta é aditivo e a base preserva engagement desconhecido. Flag permite desligar apenas companheiros com redeploy. Sem novos itens ou migração destrutiva.

Limites: mobile é emulação, não aparelho físico; ajuda no combate comprovada por teste da simulação autoritativa, não por sessão longa pública. D1/D7 exigem passagem de dias e jogadores reais; não há resultado de retenção reivindicado.
