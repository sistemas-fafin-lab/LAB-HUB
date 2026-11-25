-- Migration: elo da O.S. para o pedido de origem em `exam_results`
--
-- PROBLEMA
-- Um pedido despachado ao Álvaro em mais de uma remessa (sangue no dia, urina
-- ou fezes depois) vira 2 ou 3 O.S. — 15% das requisições na medição de
-- 25/11/2026. A cache guarda UMA linha por O.S. e `codigo_lis` é único global,
-- então só uma O.S. cabe na linha da requisição; as outras vivem em linha
-- própria, sem `codigo_lis`, e saíam na tela como card separado do pedido
-- (só se juntavam quando a data de coleta coincidia).
--
-- O QUE MUDA
-- Coluna nova, na linha da O.S., com o código da requisição de que ela é
-- remessa. Quem a preenche é a busca de laudos, a partir do PDF "Laudo EXTERNO"
-- anexado à requisição (ou do `idOsLis`); quem a lê é a fusão de cards ao
-- servir. Ver docs/LAUDOS_LIS.md e o ticket 03 de
-- .scratch/vinculo-os-laudo-externo.
--
-- POR QUE COLUNA NOVA, E NÃO UNICIDADE (codigo_lis, codigo_os)
-- A unicidade global de `codigo_lis` é o que detecta "este código já pertence
-- à linha de outro paciente" (conflitoDePosse no insertAwaiting). A coluna nova
-- não toca nela.
--
-- Sem FK e sem unicidade de propósito: várias O.S. apontam para o mesmo
-- pedido, e o elo só é lido dentro das linhas do MESMO paciente — um código
-- que não exista entre elas simplesmente não funde nada.
--
-- Sem backfill: as linhas já gravadas ficam com null (comportamento de antes)
-- e ganham o elo sozinhas na próxima busca do paciente com LAUDOS_OS_VIA_PDF
-- ligada.
--
-- ORDEM DE DEPLOY: aplicar ANTES de subir a API que lê a coluna — o PostgREST
-- responde 400 para coluna inexistente no select, e a rota de laudos cairia
-- inteira. A API antiga ignora a coluna, então aplicar antes é seguro.
--
-- Idempotente.

alter table public.exam_results
  add column if not exists codigo_lis_pedido text;

comment on column public.exam_results.codigo_lis_pedido is
  'Requisição do ApLIS (codigo_lis de outra linha do mesmo paciente) de que esta O.S. é remessa. Null na linha da própria requisição e na O.S. sem pedido conhecido.';
