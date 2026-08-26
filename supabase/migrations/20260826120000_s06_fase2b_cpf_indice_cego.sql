-- S-06 fase 2b — índice cego para `pacientes.cpf`.
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-06; comentário desde
--       20260803170000_s06_fase2a_rotulos_cifrados.sql:21 ("Cifrar
--       pacientes.cpf (fase 2b) ...").
--
-- POR QUE NÃO É SÓ CIFRAR COMO AS OUTRAS
-- `cifrar()` usa AES-256-GCM com IV aleatório por chamada — não-determinístico
-- de propósito, para impedir análise de frequência. É exatamente o que quebra
-- para esta coluna: o `unique` de `cpf` para de barrar duplicata (o mesmo CPF
-- gravado duas vezes gera ciphertexts diferentes), e toda busca exata por CPF
-- em SQL (`cadastro.ts`, `integracao.ts` x2, `apagarPaciente.ts`) para de achar
-- a linha.
--
-- Por isso duas colunas, cada uma com a primitiva certa para o que precisa
-- fazer:
--   * `cpf_hash` — HMAC-SHA256 determinístico (`CPF_HASH_KEY`, PRÓPRIA e nunca
--     reaproveitada de `PII_KEY_*`). Mesmo CPF sempre produz o mesmo hash, então
--     sustenta `unique` e `.eq(...)` do jeito que a coluna em claro sustenta
--     hoje — sem devolver o CPF de um dump.
--   * `cpf_enc` — envelope AEAD do `cifrar()` já existente, para exibição.
--     Nunca comparado em SQL de propósito; a comparação é sempre via
--     `cpf_hash`.
--
-- MESMO PADRÃO DA FASE 1/2A, DE PROPÓSITO
-- Só ACRESCENTA coluna, nullable, sem tocar na `unique`/`check` de `cpf`. A API
-- passa a escrever nas três formas; enquanto convivem, voltar o deploy é
-- suficiente para reverter. A busca continua por `cpf` até a migration do
-- ticket 02, e o corte da escrita em claro (ticket 03) só acontece depois do
-- backfill confirmar zero linhas pendentes.
--
-- `cpf_hash` fica SEM `unique`/`not null` aqui, mesmo sendo função determinística
-- de uma coluna que já é `unique` hoje (não há duplicata a temer). É decisão de
-- sequenciamento, não de segurança: a unicidade DEFINITIVA (`not null unique`,
-- substituindo a de `cpf`) é o ticket 04, junto do drop da coluna em claro —
-- reunir as duas no mesmo passo evita uma constraint extra que precisaria ser
-- desfeita de novo dali a duas migrations.

alter table public.pacientes add column if not exists cpf_hash text;
alter table public.pacientes add column if not exists cpf_enc  text;

comment on column public.pacientes.cpf_hash is
  'Índice cego do CPF: HMAC-SHA256 determinístico (chave CPF_HASH_KEY, fora do banco, '
  'NUNCA reaproveitada de PII_KEY_*), em base64. Sustenta busca exata e unicidade sem expor '
  'o CPF em texto puro num dump. Nunca exposto ao cliente. Ver § S-06 fase 2b.';

comment on column public.pacientes.cpf_enc is
  'CPF cifrado em AES-256-GCM pela API, para exibição. Envelope v1:<keyId>:<iv>:<tag>:<ct>, '
  'AAD = pacientes:cpf:<id>. Não comparado em SQL — comparação é sempre via cpf_hash. Ver § S-06.';

-- Sem mexer em privilégio: grant de tabela cobre coluna nova automaticamente, e
-- `anon`/`authenticated` não têm nenhum desde o S-01.
