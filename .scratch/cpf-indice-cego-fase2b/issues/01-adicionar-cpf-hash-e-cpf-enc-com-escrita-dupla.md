# 01 - Adicionar `cpf_hash` e `cpf_enc` em `pacientes`, com escrita dupla

**What to build:** Introduzir as duas colunas novas de `pacientes` — `cpf_hash` (índice cego determinístico, para busca e unicidade) e `cpf_enc` (envelope AEAD, para exibição) — sem tocar na coluna `cpf` em claro nem nos pontos de busca existentes. Todo caminho de escrita de paciente passa a gravar as três formas em paralelo. As linhas já existentes são preenchidas por um backfill idempotente.

Este ticket só adiciona; nada que já funciona pode mudar de comportamento. `cpf` continua sendo a fonte de verdade para busca e leitura até o ticket 02.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] Migration cria `pacientes.cpf_hash` (text) e `pacientes.cpf_enc` (text), nullable, sem alterar a constraint `unique` existente em `cpf`.
- [ ] Nova env `CPF_HASH_KEY` (base64 de 32 bytes) é lida em `apps/api/src/lib/crypto.ts`, num mapa separado das `PII_KEY_K*` — nenhuma chave é reaproveitada entre as duas primitivas.
- [ ] `hashCpf(cpfNormalizado: string): string` calcula HMAC-SHA256 determinístico com `CPF_HASH_KEY` e devolve base64; o mesmo CPF normalizado sempre produz o mesmo valor.
- [ ] A ausência de `CPF_HASH_KEY` é tratada com o mesmo padrão fail-closed de `validarCriptografia()`: derruba o boot em produção, avisa em dev sem quebrar o fluxo local.
- [ ] Toda criação de paciente grava `cpf_hash` (via `hashCpf`) e `cpf_enc` (via `cifrar`, AAD `aadDe('pacientes', 'cpf', id)`) além do `cpf` em claro já gravado hoje.
- [ ] Qualquer atualização existente que altere `pacientes.cpf` também atualiza `cpf_hash` e `cpf_enc` juntos, para as três formas nunca ficarem dessincronizadas.
- [ ] `apps/api/src/lib/backfillCripto.ts` ganha uma rotina para `pacientes` seguindo o mesmo formato de `backfillRotulos`: seleciona em lotes linhas com `cpf` preenchido e `cpf_hash`/`cpf_enc` nulos, grava as duas colunas, e usa `.is('cpf_hash', null)` no update como guarda contra corrida com escrita concorrente.
- [ ] Uma função equivalente a `verificarBackfill()` reporta quantas linhas de `pacientes` ainda têm `cpf` preenchido sem `cpf_hash`/`cpf_enc` — sinal verde para o corte do ticket 03 é zero.
- [ ] Rodar o backfill duas vezes seguidas não altera nenhuma linha na segunda execução (idempotência).
- [ ] Nenhuma rota da API expõe `cpf_hash` ou o envelope cru de `cpf_enc` na resposta ao cliente.
- [ ] A suíte cobre: determinismo do `hashCpf`, escrita das três formas na criação de paciente, backfill idempotente e em lotes, guarda de corrida do backfill, e o fail-closed sem `CPF_HASH_KEY`.

## Comments
