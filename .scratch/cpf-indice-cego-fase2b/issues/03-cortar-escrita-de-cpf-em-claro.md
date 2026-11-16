# 03 - Cortar a escrita de `pacientes.cpf` em claro

**What to build:** Parar de escrever a coluna `cpf` em claro em toda criação e atualização de paciente, só depois de confirmar que o backfill do ticket 01 zerou as pendências. `cpf_hash` e `cpf_enc` passam a ser as únicas formas gravadas a partir daqui — a coluna `cpf` continua existindo (só leitura, para permitir rollback até o drop do ticket 04), mas para de receber gravação nova.

Este é o mesmo padrão que `20260804130000_s06_corte_colunas_em_claro.sql` já aplicou às colunas anteriores do S-06: nunca cortar sem antes confirmar zero linhas pendentes.

**Blocked by:** 02 - Migrar buscas por CPF para `cpf_hash`.

**Status:** ready-for-agent

- [ ] Antes de qualquer mudança de código, a função de verificação do ticket 01 confirma zero linhas de `pacientes` com `cpf` preenchido e `cpf_hash`/`cpf_enc` nulos em todo ambiente onde o corte vai subir.
- [ ] Criação de paciente para de gravar `cpf`; grava só `cpf_hash` e `cpf_enc`.
- [ ] Qualquer atualização de paciente que hoje gravaria `cpf` para de fazê-lo; continua gravando `cpf_hash` e `cpf_enc`.
- [ ] Sem `CPF_HASH_KEY` configurada, a escrita de paciente falha fechado (não grava CPF em nenhuma forma) — no mesmo espírito do comportamento já existente para `PII_KEY_K1` depois do corte das colunas anteriores do S-06.
- [ ] Em produção, ausência de `CPF_HASH_KEY` derruba o boot, no mesmo padrão de `validarCriptografia()`.
- [ ] O backfill do ticket 01 deixa de ter linha nova para processar a partir deste ponto — nenhuma escrita depois do corte cria uma linha com `cpf` preenchido e `cpf_hash`/`cpf_enc` vazios.
- [ ] A suíte cobre: paciente novo não grava mais `cpf`, atualização não grava mais `cpf`, e a escrita falha fechado sem `CPF_HASH_KEY`.
- [ ] Nenhuma leitura ou busca muda de comportamento neste ticket — já foram migradas no ticket 02.

## Comments
