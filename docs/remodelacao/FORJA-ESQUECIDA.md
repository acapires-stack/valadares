# Forja Esquecida — rota adicional

A expedição **Ruínas da Forja** permanece disponível com `id: ruinas_forja`, seus orcs, golems, chefe e apresentação originais. A **Forja Esquecida** acrescenta uma segunda rota na Jornada, pela mesma entrada do Velho Ferreiro em (78, 22). A oficina abandonada mistura metal antigo, ruína e vegetação. O nível 18 é sugestão, sem barreira de entrada.

| Rota | Pedido `expeditionEnter.expedition` | Layout | Encontros |
| --- | --- | --- | --- |
| Ruínas da Forja | `ruinas_forja` ou campo omitido | `forge_ruins_v1` | 4 `ORC`, 3 `GOLEM`, 1 `GOLEM_REI` |
| Forja Esquecida | `forja_esquecida` | `forge_forgotten_v2` | 4 `FORGE_SENTRY` (Sentinela da Forja / Forge Sentry), 3 `FORGE_CONSTRUCT` (Construto Esquecido / Forgotten Construct), 1 `FORGE_WARDEN` (Guardião da Forja / Forge Warden) |

O servidor responde com `dungeonEnter.expedition` e `expeditionLayout`. `expeditionResult.expedition` identifica a rota ativa; fora da instância, retorna `null`. Os dois layouts usam a mesma grade de três salas e os andares privados 8000–8999. Os novos tipos não entram nas tabelas de spawn do mundo aberto. Suas estatísticas base copiam ORC, GOLEM e GOLEM_REI; na instância, continuam os mesmos ajustes de dano e de vida do chefe.

As duas rotas compartilham `expeditionClears` e `expeditionPending`, sem migração de save. A primeira conclusão em qualquer uma delas guarda 1 Machado da Forja e 3 Fragmentos da Forja; cada conclusão seguinte guarda 3 fragmentos. Um prêmio pendente bloqueia nova entrada até o resgate. O resgate continua persistido antes de liberar o prêmio, e uma segunda chamada não entrega de novo. As contagens internas `guards`, `golems` e `boss` mantêm o contrato de rede, embora a interface mostre os nomes do tema ativo.

Validação local conectada em Chrome com conta e backend temporários: escolha das duas rotas pela Jornada, renderizador 3D, três salas, resgate, saída e reentrada; duas conclusões persistiram exatamente um Machado e seis Fragmentos. Um clique no corpo da Sentinela iniciou autoataques reais do cliente: impactos somaram seus 140 HP, com morte e 120 XP confirmados pelo servidor. Os demais inimigos foram concluídos por instrumentação apenas no backend de teste para verificar os prêmios; esse ensaio não mede dificuldade de toda a rota. Evidência local em `work/harmonizacao-2026-10-07/forja-conteudo/VALIDACAO-CONECTADA.md`.
