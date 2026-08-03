-- S-06 (Parte 3) — criptografia do dado clínico em repouso.
--
-- Fase 1 do plano de migração: acrescenta as colunas cifradas SEM tocar nas
-- colunas em claro. A partir do deploy que acompanha esta migration a API passa
-- a escrever nas duas, e a ler da cifrada quando ela existir. Enquanto as duas
-- convivem, voltar o deploy é suficiente para reverter — nenhum dado se perde.
-- A remoção das colunas em claro é uma migration futura, e é a única etapa
-- definitiva.
--
-- Escopo: só o dado CLÍNICO, que é o de maior valor e o de menor atrito —
-- nenhuma destas colunas é filtrada, ordenada ou comparada em SQL, então cifrar
-- não quebra consulta nenhuma. As colunas de `pacientes` (cpf, nome, e-mail,
-- nascimento) ficam para uma fase própria: elas SÃO comparadas por igualdade
-- pelo trigger de identidade e pela RPC de correção (S-01), e cifrá-las sem
-- antes migrar essas comparações para blind index quebraria o claim do cadastro
-- e o PUT /pacientes/me. Ver Parte 3 § 3.4 da auditoria.
--
-- Tipo `text` e não `bytea`: o envelope é ASCII (`v1:k1:iv:tag:ct` em base64) e
-- assim continua legível em `psql`, dump e Studio — sem virar `\x` ilegível na
-- hora de depurar. O custo é ~33% de overhead de base64, aceitável no volume
-- deste projeto.

alter table public.exam_results add column if not exists result_enc text;
alter table public.resultados   add column if not exists paineis_enc text;
alter table public.resultados   add column if not exists resumo_enc  text;

comment on column public.exam_results.result_enc is
  'Laudo completo (JSON) cifrado em AES-256-GCM pela API. Envelope v1:<keyId>:<iv>:<tag>:<ct>, '
  'AAD = exam_results:result:<id>. A chave vive na env da API (PII_KEY_*), NUNCA no banco — '
  'é o que torna um dump inútil. Ver auditoria § S-06.';

comment on column public.resultados.paineis_enc is
  'Valores medidos por painel (JSON) cifrados. AAD = resultados:paineis:<id>. Ver § S-06.';

comment on column public.resultados.resumo_enc is
  'Observação clínica cifrada. AAD = resultados:resumo:<id>. Ver § S-06.';

-- Sem mexer em privilégio: grant de tabela cobre coluna nova automaticamente, e
-- `anon`/`authenticated` não têm nenhum desde o S-01. Coluna cifrada não muda
-- isso — são camadas independentes, e é justamente essa independência que faz a
-- criptografia valer contra o cenário "role mal configurado no futuro".
