-- =====================================================================
-- S-06 — o drop: as sete colunas em claro somem. É AQUI que a criptografia
-- passa a proteger alguma coisa.
--
-- ⚠ NÃO APLICADA AINDA — depende de deploy. Ver PRÉ-REQUISITO abaixo.
--
-- Até esta migration, "dado clínico cifrado" era meia verdade: a coluna cifrada
-- existia, e ao lado dela o texto puro continuava gravado. Um `pg_dump`, uma
-- réplica, um staging populado com dado real ou um bug de RLS entregavam tudo
-- em claro, cifra ou não. As fases 1 (03/08) e 2a (04/08) construíram a
-- fechadura; esta migration é a que tira a chave de baixo do tapete.
--
-- PRÉ-REQUISITO — e não é conservadorismo, é sequência
--
-- O código precisa ter PARADO DE LER estas colunas, e esse deploy ainda não
-- subiu. Não basta ter parado de escrever: `laudos/repository.ts` nomeia as
-- colunas no `select` do PostgREST, e coluna inexistente ali não é campo vazio —
-- é **400, com a rota `/laudos` inteira fora do ar**. Aplicar isto antes do
-- deploy derruba o portal de laudos no mesmo segundo.
--
--   1. deploy do LAB-HUB que para de escrever E de ler as sete   ← FALTA
--   2. observar produção alguns dias                             ← FALTA
--   3. esta migration
--
-- O passo 2 existe porque daqui não há volta: reverter o deploy depois deste
-- drop não traz o dado de volta, ele deixou de existir em claro.
--
-- ESTADO DOS DADOS, conferido em 04/08/2026 (antes de escrever)
--
-- Nenhuma linha em claro sem par cifrado, nas sete:
--   paineis 0 · resumo 0 · categoria 0 · exames 0 · nome_arquivo 0
--   result 0 · cpf 0
-- (`exam_results` está com 0 linhas — o cache de laudos está vazio porque a AOL
-- não responde do VPS; ver a pendência do Álvaro. `documentos` tem 16.)
--
-- Se esta migration for aplicada em outro ambiente, RECONFERIR antes: o drop não
-- avisa que está levando dado junto.
--
-- SETE, NÃO OITO
--
-- `resultados.exame_nome` fica. Ele participa de
-- `uq_resultado_agendamento_exame`, e unicidade não existe sobre coluna cifrada
-- com IV aleatório — dois envelopes do mesmo texto são diferentes. Ele sai na
-- `20260804140000`, que troca a unicidade para o `exame_flowlab_id` e espera o
-- deploy do FlowLab.
--
-- A PARTIR DAQUI A CHAVE É O DADO
--
-- Perder `PII_KEY_K1` deixa de ser incidente operacional e vira perda
-- irreversível de resultado clínico — o backup do banco não salva, porque o que
-- ele guarda é o envelope. A chave precisa de cópia em cofre SEPARADO de onde o
-- banco vive. É custódia de chave, assunto diferente do backup do banco.
-- =====================================================================

-- Fase 1 — o valor medido e o laudo completo.
alter table public.resultados    drop column resumo;
alter table public.resultados    drop column paineis;
alter table public.exam_results  drop column result;

-- Fase 2a — os rótulos e a segunda cópia do CPF.
alter table public.resultados    drop column categoria;
alter table public.agendamentos  drop column exames;
alter table public.documentos    drop column nome_arquivo;
alter table public.exam_results  drop column cpf;

-- Sobra `resultados.exame_nome`, e o comentário registra por quê — para quem
-- abrir a tabela depois não achar que foi esquecimento.
comment on column public.resultados.exame_nome is
  'ÚLTIMA coluna de dado clínico em texto puro. Sobrevive porque participa de '
  'uq_resultado_agendamento_exame, e unicidade não existe sobre coluna cifrada '
  'com IV aleatório. Sai junto da troca da unicidade para exame_flowlab_id '
  '(migration 20260804140000). O valor cifrado já está em exame_nome_enc.';
