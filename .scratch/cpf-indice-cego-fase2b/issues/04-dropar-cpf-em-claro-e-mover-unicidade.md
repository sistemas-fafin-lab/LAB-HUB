# 04 - Dropar `pacientes.cpf` em claro e mover a unicidade para `cpf_hash`

**What to build:** Fechar a fase 2b: remover a coluna `pacientes.cpf` em texto puro e sua constraint `unique`, e tornar `cpf_hash` `not null unique` — a fonte definitiva de unicidade e busca de CPF. Remover também o código de escrita dupla e a rotina de backfill de CPF, que deixam de ter função depois do drop, seguindo a mesma decisão já registrada em `backfillCripto.ts` para as colunas anteriores do S-06 ("apagar, não manter por simetria").

**Blocked by:** 03 - Cortar a escrita de `pacientes.cpf` em claro.

**Status:** ready-for-agent

- [ ] Migration remove a coluna `pacientes.cpf` e a constraint `unique`/`check` associadas a ela.
- [ ] Migration torna `pacientes.cpf_hash` `not null unique`, assumindo a unicidade que a coluna em claro garantia antes.
- [ ] O código de escrita dupla do ticket 01/03 (gravar `cpf` junto de `cpf_hash`/`cpf_enc`) é removido — não sobra nenhuma referência a `pacientes.cpf` em claro no código da API.
- [ ] A rotina de backfill de CPF em `backfillCripto.ts` e sua verificação são removidas, já que não há mais coluna em claro para migrar.
- [ ] O PostgREST/Supabase client não referencia mais `cpf` de `pacientes` em nenhum select, insert ou update.
- [ ] A suíte inteira da API continua passando sem nenhuma referência a `pacientes.cpf` em claro, e os testes que cobriam a escrita dupla e o backfill de CPF são removidos junto do código que testavam.
- [ ] Uma consulta manual (ou teste) confirma que um `select *` em `pacientes` não retorna CPF em texto puro em nenhuma coluna.
- [ ] `docs/agents/domain.md` ou documentação equivalente de arquitetura, se mencionar a coluna `cpf`, é atualizada para refletir `cpf_hash`/`cpf_enc`.

## Comments
