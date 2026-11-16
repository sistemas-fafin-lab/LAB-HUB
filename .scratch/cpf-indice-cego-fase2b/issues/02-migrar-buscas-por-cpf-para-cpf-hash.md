# 02 - Migrar buscas por CPF para `cpf_hash`

**What to build:** Trocar os quatro pontos que hoje fazem `.eq('cpf', cpfNorm)` para comparar por `.eq('cpf_hash', hashCpf(cpfNorm))`, e trocar toda leitura de CPF para exibição pela decifragem de `cpf_enc`. Ao final deste ticket, `pacientes.cpf` em claro deixa de ser lido por qualquer caminho da API — só continua sendo escrito, para não quebrar nada antes do corte do ticket 03.

**Blocked by:** 01 - Adicionar `cpf_hash` e `cpf_enc` em `pacientes`, com escrita dupla.

**Status:** ready-for-agent

- [ ] `apps/api/src/routes/cadastro.ts:40` busca paciente existente por `.eq('cpf_hash', hashCpf(cpf))` em vez de `.eq('cpf', cpf)`.
- [ ] `apps/api/src/routes/integracao.ts:322` e `:347` (fluxo de recepção/agendamento) buscam paciente por `cpf_hash` da mesma forma, sem alterar o contrato observável da rota.
- [ ] `apps/api/src/lib/apagarPaciente.ts:87` localiza o paciente-alvo da exclusão por `cpf_hash` quando o seletor recebido for CPF.
- [ ] Toda resposta da API que hoje devolve o CPF do paciente em claro passa a lê-lo de `cpf_enc` decifrado no servidor, nunca da coluna `cpf`.
- [ ] Nenhum caminho da API lê `pacientes.cpf` para busca ou para exibição depois deste ticket — a coluna continua existindo e sendo escrita (ticket 01), só não é mais consultada.
- [ ] O comportamento observável de cada uma das quatro rotas para um CPF existente, um CPF inexistente e um CPF malformado permanece idêntico ao de antes da migração.
- [ ] A suíte cobre os quatro pontos de busca encontrando o paciente certo via `cpf_hash`, e confirma — via mock do Supabase — que nenhum deles chama `.eq('cpf', ...)` mais.
- [ ] Um teste de regressão confirma que a resposta de cada rota contém o CPF correto (decifrado de `cpf_enc`), idêntico ao que a coluna em claro devolvia antes.

## Comments
