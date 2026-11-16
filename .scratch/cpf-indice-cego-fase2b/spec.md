## Problem Statement

`pacientes.cpf` continua em texto puro: `text not null unique check (cpf ~ '^\d{11}$')`, criada em `20260626120000_init_dominio_labhub.sql`. A trilha de criptografia de coluna (auditoria § S-06) já cifrou `resultados`, `exam_results`, `agendamentos.exames` e `documentos.nome_arquivo`, e o comentário de `20260803170000_s06_fase2a_rotulos_cifrados.sql:21` já anuncia a próxima etapa: "Cifrar `pacientes.cpf` (fase 2b)". Não existe, porém, nenhuma migration, coluna ou código para essa fase — é só uma intenção registrada em comentário.

Cifrar `pacientes.cpf` do mesmo jeito que as colunas anteriores não funciona. `cifrar()` (`apps/api/src/lib/crypto.ts:137`) usa AES-256-GCM com IV aleatório por chamada — não-determinístico de propósito, para impedir análise de frequência. Isso é exatamente o que quebra:

- o `unique` da coluna, porque o mesmo CPF gravado duas vezes produz ciphertexts diferentes e a constraint para de barrar duplicata;
- toda busca exata por CPF em SQL, que hoje existe em `apps/api/src/routes/cadastro.ts:40`, `apps/api/src/routes/integracao.ts:322` e `:347`, e `apps/api/src/lib/apagarPaciente.ts:87` — todos fazem `.eq('cpf', cpfNorm)`.

As colunas já cifradas pelo S-06 evitaram esse problema porque nenhuma delas era comparada em SQL — o próprio comentário da fase 2a documenta essa checagem prévia (`exam_results.cpf` é comparado em JS, nunca em SQL; a busca de resultados é filtro no cliente). `pacientes.cpf` é o caso oposto: é o identificador de busca do domínio inteiro.

Esse bloqueio não é só da fase 2b em si. O spec `.scratch/consulta-dev-resultados-por-cpf/` (consulta administrativa de resultados por CPF) também assume busca exata por CPF contra a coluna atual, e herdaria o mesmo problema se a fase 2b avançasse primeiro sem solução.

## Solution

Separar as duas responsabilidades que a coluna `cpf` acumula hoje — "posso comparar" e "posso ler de volta" — em duas colunas com primitivas diferentes:

- `cpf_hash`: HMAC-SHA256 determinístico do CPF normalizado, com uma chave dedicada fora do banco. Mesmo CPF sempre produz o mesmo hash, então continua suportando `unique` e `.eq('cpf_hash', ...)` exatamente como a coluna em claro suporta hoje. O hash não é reversível sem a chave: um dump do banco não devolve o CPF, só permite confirmar igualdade entre linhas — a mesma informação que o `unique` já expõe.
- `cpf_enc`: envelope AEAD gerado pelo `cifrar()` já existente, decifrado no servidor só quando o CPF precisa ser exibido (cadastro, recepção, telas administrativas). Não é comparável em SQL, propositalmente — a comparação é sempre via `cpf_hash`.

A chave do HMAC (`CPF_HASH_KEY`) é distinta das `PII_KEY_K*` usadas pelo AEAD. Reaproveitar uma chave entre duas primitivas criptográficas diferentes (HMAC e AES-GCM) é uma prática a evitar — não haveria ganho nenhum e a mistura complica a análise de segurança de ambas sem necessidade.

A migração segue a mesma coreografia que o S-06 já usou nas colunas anteriores, documentada nas migrations `20260803130000` → `20260803170000` → `20260804130000` → `20260804160000`: coluna nova convive com a antiga (escrita dupla), backfill das linhas existentes, corte da escrita em claro, e só then o drop da coluna antiga e da constraint. Cada etapa é reversível até a anterior ser confirmada, e o backfill reaproveita o formato já estabelecido em `apps/api/src/lib/backfillCripto.ts` (idempotente, em lotes, nunca sobrescreve uma linha já preenchida).

## User Stories

1. Como responsável pela aplicação, quero que `pacientes.cpf` pare de existir em texto puro no banco, para fechar o mesmo risco de vazamento lógico (dump, backup, réplica, Studio) já mitigado nas demais colunas do S-06.
2. Como responsável pela aplicação, quero manter a busca exata por CPF funcionando sem degradação, para que cadastro, recepção (FlowLab) e exclusão de paciente continuem operando sem mudança de comportamento observável.
3. Como responsável pela aplicação, quero que a unicidade de CPF continue garantida pelo banco, para que dois cadastros com o mesmo CPF continuem sendo impossíveis de gravar.
4. Como responsável pela segurança, quero que a chave do índice cego seja independente das chaves de criptografia de coluna existentes, para não misturar primitivas HMAC e AEAD sob o mesmo segredo.
5. Como responsável pela aplicação, quero que a ausência da chave do índice cego derrube o boot em produção, no mesmo espírito de `validarCriptografia()`, para que a proteção nunca dependa de alguém lembrar de configurá-la.
6. Como responsável pela aplicação, quero um backfill idempotente e em lotes para as linhas existentes, reaproveitando o padrão já usado em `backfillCripto.ts`, para popular `cpf_hash`/`cpf_enc` sem downtime e sem risco de reprocessar linha já migrada.
7. Como responsável pela aplicação, quero confirmar zero linhas pendentes antes de cortar a escrita em claro, para que o corte nunca aconteça com dado ainda não migrado.
8. Como desenvolvedor, quero que o `hashCpf()` normalize a entrada do mesmo jeito que o resto do domínio (só dígitos), para que buscas com CPF mascarado ou formatado continuem encontrando a linha certa.
9. Como responsável pela aplicação, quero que o `cpf_hash` nunca seja exposto ao web, para que ele permaneça um detalhe interno de busca do servidor, não um identificador que o cliente manipula.
10. Como responsável pela aplicação, quero que a leitura do CPF para exibição sempre venha da decifragem de `cpf_enc` no servidor, para que não exista um segundo caminho de leitura em claro depois do corte.
11. Como responsável pela aplicação futura de consulta administrativa por CPF, quero que a busca exata continue disponível depois da fase 2b, para que aquele spec não precise ser redesenhado.
12. Como responsável pela operação, quero que a rotação futura da chave do índice cego seja uma operação documentada e coordenada, para que ninguém tente rotacioná-la como se fosse uma chave AEAD versionada por linha.

## Implementation Decisions

- Nova env de servidor `CPF_HASH_KEY` (base64 de 32 bytes), lida em `apps/api/src/lib/crypto.ts` ao lado de `PII_KEY_K*`, mas em um mapa próprio — nunca reaproveitar uma chave `PII_KEY_*` para o HMAC.
- `hashCpf(cpfNormalizado: string): string` = `HMAC-SHA256(cpfNormalizado, CPF_HASH_KEY)`, saída em base64. Sem AAD — o hash não decifra nada, só compara; não há posição de linha para amarrar.
- Diferente do envelope AEAD (`v1:k1:...`), o hash não carrega `keyId` embutido nem suporta rotação gradual por linha. Rotação de `CPF_HASH_KEY` é uma operação única e coordenada que recalcula `cpf_hash` de todas as linhas — não entra nesta entrega além do backfill inicial, que já cobre o caso de partir de zero.
- `pacientes.cpf_hash`: `text`, `unique` quando preenchida (constraint parcial ou normal após o backfill completo — a decisão de índice único parcial vs. total fica para a migration de cada ticket, conforme o estado da coluna naquele momento).
- `pacientes.cpf_enc`: `text`, envelope do `cifrar()` existente, AAD `aadDe('pacientes', 'cpf', id)` — mesmo formato usado nas demais colunas do S-06.
- Toda escrita de CPF de paciente (criação e qualquer atualização) passa a gravar `cpf_hash` e `cpf_enc` junto da coluna em claro, enquanto ela existir.
- Os quatro pontos de busca exata (`cadastro.ts:40`, `integracao.ts:322`, `integracao.ts:347`, `apagarPaciente.ts:87`) trocam `.eq('cpf', cpfNorm)` por `.eq('cpf_hash', hashCpf(cpfNorm))`.
- O backfill estende `apps/api/src/lib/backfillCripto.ts` seguindo exatamente o padrão de `backfillRotulos`: seleciona linhas com `cpf_hash`/`cpf_enc` nulos e `cpf` preenchido, em lotes, grava com guarda contra corrida (`.is('cpf_hash', null)` no update), e nunca lê o texto puro para nada além de gerar o par hash/cifrado.
- `validarCriptografia()` (ou uma checagem irmã) passa a exigir `CPF_HASH_KEY` também, com a mesma queda de boot em produção e aviso em dev que já existe para `PII_KEY_K1`.
- A sequência de migrations segue o precedente do S-06: colunas novas sem corte → corte da escrita em claro (só depois de `verificarBackfill()` confirmar zero pendências) → drop da coluna `cpf` e da constraint `unique` antiga, com `cpf_hash` assumindo o `unique` definitivo.
- Depois do drop, o código de escrita dupla e a função de backfill de CPF deixam de ter função e devem ser removidos — mesma decisão já registrada no comentário de `backfillCripto.ts:19` para as colunas anteriores ("apagar, não manter por simetria").

## Testing Decisions

- Reaproveitar o mock encadeável do Supabase já usado pela suíte da API (o mesmo padrão de `criptografiaColunas.test.ts`).
- `hashCpf()`: mesmo CPF normalizado sempre produz o mesmo hash; CPFs diferentes produzem hashes diferentes; a saída não depende de formatação (com ou sem máscara, desde que normalizado antes).
- `cifrar`/`decifrar` de `cpf_enc` seguem a cobertura já existente do módulo — não precisa de teste novo além de confirmar o AAD `pacientes:cpf:<id>`.
- Escrita: criar paciente grava `cpf_hash` e `cpf_enc` corretos junto do `cpf` em claro (enquanto a coluna existir); duas tentativas com o mesmo CPF são rejeitadas pela constraint em `cpf_hash`.
- Leitura: os quatro pontos de busca (`cadastro`, `integracao` x2, `apagarPaciente`) encontram o paciente certo via `cpf_hash`, e nenhum deles volta a comparar contra `cpf` em claro depois de migrado.
- Backfill: idempotente (rodar duas vezes não altera nada na segunda), não sobrescreve linha já preenchida (mesma guarda de corrida que `backfillRotulos`), e `verificarBackfill()` equivalente reporta zero pendências só quando toda linha com `cpf` tem par `cpf_hash`/`cpf_enc`.
- Corte de escrita: sem `CPF_HASH_KEY` configurada, a escrita falha fechado (não grava CPF em nenhuma forma), no mesmo espírito do comportamento já testado para `PII_KEY_K1`.
- Regressão: nenhuma resposta da API expõe `cpf_hash` ou o envelope `cpf_enc` cru ao cliente — só o CPF decifrado, nos mesmos formatos já contratados hoje.

## Out of Scope

- Rotação automática ou gradual de `CPF_HASH_KEY`; só o procedimento manual coordenado fica documentado.
- Índice cego para qualquer outra coluna além de `pacientes.cpf`.
- A consulta administrativa de resultados por CPF em si (`.scratch/consulta-dev-resultados-por-cpf/`) — esta entrega apenas garante que a busca exata continue disponível para aquele spec consumir.
- Qualquer mudança em `exam_results.cpf` (já cifrada desde a fase 2a) ou nas demais colunas do S-06.
- Alterações no app mobile ou no FlowLab.
- Busca parcial, por prefixo ou fuzzy de CPF — a busca continua exclusivamente exata, como já é hoje.

## Further Notes

- Esta entrega desbloqueia duas coisas ao mesmo tempo: a "fase 2b" mencionada em comentário desde `20260803170000_s06_fase2a_rotulos_cifrados.sql:21`, e a busca exata por CPF de que `.scratch/consulta-dev-resultados-por-cpf/` depende.
- `cpf_hash` sozinho não é segredo no sentido de "não pode vazar" — é um índice de igualdade, não o CPF. O que precisa permanecer fora de alcance é a chave (`CPF_HASH_KEY`), do mesmo jeito que as `PII_KEY_*` já são tratadas: fora do banco, fora do backup do banco, em cofre separado.
- A autorização de quem pode consultar CPF de terceiro (admin, recepção, etc.) não muda com esta entrega — ela é resolvida por controle de acesso em cada rota, não pela criptografia da coluna. Este spec só garante que a busca continue funcionando depois que a coluna deixar de estar em claro.
