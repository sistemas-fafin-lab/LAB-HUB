# 02 - Consolidar laudo LIS cacheado na consulta por CPF

**What to build:** Estender o caminho administrativo já funcional para que uma consulta por CPF também entregue os `laudo` que já existem no cache LIS (`exam_results`). O administrador deve ver a mesma composição de fontes que a aba Resultados do portal do paciente, sem disparar uma busca ao vivo no ApLIS ou na AOL.

A composição precisa preservar as barreiras de identidade, a descriptografia, o corte de fontes vigente, o tratamento de versões retificadas e a ordenação usada pela visão normal. O resultado continua read-only e limitado ao paciente cujo CPF foi consultado.

**Blocked by:** 01 - Habilitar consulta dev de resultado FlowLab por CPF.

**Status:** ready-for-agent

- [ ] Um CPF válido consultado pelo administrador retorna, além dos `resultado` FlowLab, os `laudo` presentes no cache LIS do paciente encontrado.
- [ ] A leitura dos `laudo` usa o `paciente_id` resolvido pela API e a conferência do CPF gravado na linha do cache; um cache vinculado incorretamente não é exibido.
- [ ] Os campos cifrados do `exam_results` são descriptografados pelo caminho existente do servidor, sem expor envelopes ou colunas cifradas ao web.
- [ ] A política vigente de fontes é preservada: laudos ocultados pelo corte de exibição atual continuam ocultos também na consulta administrativa.
- [ ] A consulta administrativa não chama ApLIS, AOL ou qualquer serviço de busca ao vivo, não usa `refresh=true` e não cria ou atualiza linhas de cache.
- [ ] O botão Atualizar, quando usado no modo administrativo, repete somente a leitura dos `resultado` e do cache LIS já persistido.
- [ ] O web converte `resultado` e `laudo` para a mesma representação resumida usada pela aba Resultados, sem criar uma segunda apresentação visual.
- [ ] Itens das duas fontes são ordenados pela mesma regra da visão normal, do mais recente para o mais antigo, preservando a ordem de versões retificadas.
- [ ] Paciente sem laudos cacheados continua podendo aparecer com seus `resultado` FlowLab; a ausência de uma fonte não transforma a resposta inteira em erro.
- [ ] Falha de banco ou de descriptografia não é apresentada como “nenhum resultado” e recebe erro seguro para tentativa posterior.
- [ ] A cobertura automatizada comprova a leitura do cache, a filtragem de identidade, a composição das fontes, o corte vigente, a ordenação e a ausência de chamadas aos LIS.
