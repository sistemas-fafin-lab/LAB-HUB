# 03 - Completar ciclo de vida e isolamento do modo admin

**What to build:** Fechar o ciclo de vida do modo administrativo na aba Resultados depois que a consulta de `resultado` FlowLab e `laudo` LIS cacheado estiver disponível. O administrador deve conseguir entrar, trocar o paciente consultado, reconhecer todos os estados da operação e sair explicitamente sem deixar dados de terceiro misturados com a visão do paciente titular.

Esta fatia entrega a experiência final e a proteção contra estado obsoleto: filtros normais ficam fora do modo administrativo, a lista consultada é somente leitura, erros não são confundidos com ausência de dados e qualquer retorno à navegação normal restaura a conta autenticada.

**Blocked by:** 02 - Consolidar laudo LIS cacheado na consulta por CPF.

**Status:** ready-for-agent

- [ ] Ao entrar no modo administrativo, a lista própria é substituída e os filtros de status, período e texto da visão normal ficam ocultos.
- [ ] O banner do modo administrativo identifica o paciente pelo nome e CPF completo, e deixa claro que a lista exibida pertence ao CPF consultado.
- [ ] O administrador consegue submeter outro CPF sem sair da aba; enquanto a nova consulta carrega, os resultados do paciente anterior não permanecem apresentados como se fossem do novo paciente.
- [ ] O estado de carregamento impede ambiguidade sobre qual consulta está em andamento e evita submissões concorrentes que possam sobrescrever a lista com uma resposta antiga.
- [ ] CPF inválido, paciente não encontrado, paciente sem resultados e falha técnica apresentam mensagens distintas e coerentes com os contratos da API.
- [ ] Falha técnica mostra mensagem genérica e permite tentar novamente sem expor stack, SQL, detalhes do Supabase ou informações internas dos LIS.
- [ ] O botão Atualizar repete a consulta do CPF atualmente exibido usando somente os dados persistidos, mantendo o banner e o contexto administrativo.
- [ ] O controle para voltar aos próprios resultados limpa o CPF e restaura a lista do paciente autenticado; trocar de aba também encerra o modo administrativo.
- [ ] As linhas administrativas são realmente read-only: não chamam a navegação de detalhe e não oferecem acesso a laudo, PDF ou declaração do paciente consultado.
- [ ] Uma resposta tardia ou uma falha de uma consulta anterior não consegue substituir ou contaminar os resultados do CPF submetido por último.
- [ ] Fora do modo administrativo, a lista, os filtros, o Atualizar e a abertura de detalhes do paciente autenticado continuam funcionando como antes.
- [ ] O estado administrativo não reutiliza nem contamina o cache global dos resultados do paciente autenticado, inclusive após logout, troca de conta ou retorno à aba.
- [ ] A capacidade permanece exclusiva do web local/dev e não é adicionada ao app mobile, ao FlowLab ou a ambientes não autorizados.
- [ ] A suíte cobre as transições de estado no DOM, o isolamento entre consultas e a regressão da visão normal, além das respostas de erro do boundary HTTP.
