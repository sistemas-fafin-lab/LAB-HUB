-- Migration: marca da busca histórica de laudos em `pacientes`
--
-- PROBLEMA
-- A busca de laudos olha só APLIS_PERIODO_DIAS para trás (90). O cache em
-- `exam_results` é o que guarda o exame depois que ele sai da janela — mas quem
-- cria a conta DEPOIS disso não tem cache nenhum, e o exame nunca aparece. Caso
-- real de 25/11/2026: exames de 22 e 23/06, conta criada em 24/11, lista vazia.
--
-- O QUE MUDA
-- Enquanto esta coluna for null, a busca de laudos faz a busca HISTÓRICA:
-- ApLIS com janela longa (APLIS_PERIODO_PRIMEIRO_ACESSO_DIAS, 5 anos por
-- padrão) e AOL em janelas curtas em torno de cada requisição antiga. Ela só é
-- preenchida quando as listagens do ApLIS e da AOL responderam sem falha — uma
-- falha deixa a busca histórica para a próxima vez, em vez de esconder o exame
-- para sempre.
--
-- POR QUE EM `pacientes`, E NÃO "SEM LINHA EM exam_results"
-- "Primeiro acesso = sem cache" é frágil nos dois sentidos: uma falha da AOL
-- no primeiro acesso já grava as requisições do ApLIS, e a partir daí a busca
-- nunca mais seria histórica; e quem já tinha conta antes desta mudança, com
-- exame antigo nunca descoberto, também ficaria de fora.
--
-- Sem backfill, de propósito: as contas existentes ficam com null e ganham a
-- busca histórica uma vez, na próxima revalidação — é como elas recuperam o
-- que a janela curta deixou passar.
--
-- ORDEM DE DEPLOY: aplicar ANTES de subir a API que lê a coluna. Sem ela a
-- leitura falha, a API trata como "não buscado" e faz a busca histórica em
-- TODA busca (correto, só mais lento); a gravação falha e vira log.
--
-- Idempotente.

alter table public.pacientes
  add column if not exists laudos_historico_em timestamptz;

comment on column public.pacientes.laudos_historico_em is
  'Quando a busca histórica de laudos (janela longa, primeiro acesso) foi concluída sem falha de LIS. Null = ainda por fazer.';
