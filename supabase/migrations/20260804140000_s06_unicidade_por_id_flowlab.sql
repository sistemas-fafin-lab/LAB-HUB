-- =====================================================================
-- Troca a chave de idempotência do webhook: (agendamento, exame_nome) →
-- exame_flowlab_id
--
-- ⚠ NÃO APLICADA AINDA — ver PRÉ-REQUISITOS abaixo. Se o ledger
-- (`supabase_migrations.schema_migrations`) tiver 22 linhas e a pasta tiver 23
-- arquivos, é ESTA que falta, e é de propósito. Não é drift.
--
-- PRÉ-REQUISITOS, na ordem:
--   1. Deploy do LAB-HUB gravando `exame_flowlab_id`     — FEITO (04/08, probe 400)
--   2. Deploy do FlowLab mandando `exameFlowlabId`       — Vercel, commit 184cbf4
--   3. Uma entrega real conferida com o id preenchido    — não há tráfego
--      orgânico neste caminho; precisa ser forçada
--
-- O passo 2 é o que importa. Aplicar isto antes dele deixa a coluna NOT NULL
-- enquanto o FlowLab ainda entrega sem o campo: todo resultado tomaria
-- not_null_violation (23502) e nenhum seria gravado. Falha alta e recuperável
-- (o webhook retenta), mas é uma parada de serviço evitável.
--
-- POR QUE ISTO EXISTE
--
-- `uq_resultado_agendamento_exame UNIQUE (agendamento_id, exame_nome)` fazia
-- duas coisas ao mesmo tempo, e uma delas era errada:
--
--   ✓ tornava o webhook at-least-once idempotente (reentrega → 23505 → 200)
--   ✗ fazia um resultado CORRIGIDO do mesmo exame colidir com o anterior,
--     receber o mesmo 200, e o FlowLab então marcar `entregue_ao_labhub = true`
--     — descartado e registrado como entregue
--
-- Deduplicar por `exame_flowlab_id` (= `ac_resultados.id`, uuid PK do outro
-- lado) separa as duas: mesmo id é reentrega de verdade; id novo é resultado
-- novo e passa. E, de quebra, tira o `exame_nome` do caminho da idempotência —
-- que é o que permitia mantê-lo em texto puro apesar de já existir cifrado.
--
-- A SEGUNDA VERSÃO NA TELA JÁ ESTÁ TRATADA
--
-- Com esta migration um segundo resultado do mesmo exame passa a existir de
-- verdade. A decisão de produto (04/08) foi mostrar as duas, a nova em cima e a
-- anterior marcada — `lib/retificacao.ts` + selo "Versão anterior" no `ExamRow`
-- + faixa de aviso no `ExamDetailPage`. Isso foi implantado ANTES desta
-- migration de propósito: na ordem inversa haveria uma janela com duas linhas
-- idênticas na tela e nada dizendo qual vale.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As linhas que não têm id do FlowLab
-- ---------------------------------------------------------------------
-- São 2, semeadas, com `agendamento_id` null — nunca passaram pelo webhook (a
-- rota sempre grava o agendamento resolvido) e portanto não existe
-- `ac_resultados.id` correspondente para elas. Ficam com uuid sorteado, que é
-- exatamente o que a coluna significa: um identificador opaco e único.
--
-- Sorteado em vez de apagado por decisão do usuário (04/08): são a única
-- evidência em produção de que a cifra da fase 1/2a funciona ponta a ponta (os
-- 18/18 envelopes conferidos no backfill) e o único conteúdo do portal da conta
-- de teste. Apagá-las custaria essa prova.
update public.resultados
   set exame_flowlab_id = gen_random_uuid()
 where exame_flowlab_id is null;

-- ---------------------------------------------------------------------
-- 2. A coluna passa a ser obrigatória
-- ---------------------------------------------------------------------
-- Sem isto a unicidade não vale nada: em unique do Postgres null é DISTINTO de
-- null, então linhas sem id nunca colidiriam entre si e a idempotência do
-- webhook simplesmente não existiria.
--
-- O schema zod segue com `exameFlowlabId` OPCIONAL de propósito. Um payload sem
-- o campo bate aqui e vira 23502 → 500 → o FlowLab recebe 502 e NÃO marca
-- `entregue_ao_labhub`. Alto e recuperável. Exigir no zod daria 400 com mensagem
-- melhor, mas obrigaria a implantar código e migration no mesmo instante — e
-- errar essa ordem é pior do que a mensagem pior.
alter table public.resultados
  alter column exame_flowlab_id set not null;

-- Com a coluna NOT NULL o predicado parcial de `uq_resultado_flowlab`
-- (`where exame_flowlab_id is not null`) é sempre verdadeiro — o índice passa a
-- cobrir a tabela inteira. Fica como está: recriá-lo sem o predicado seria uma
-- reescrita de índice para nenhum ganho, e o predicado documenta de onde veio.

-- ---------------------------------------------------------------------
-- 3. A chave antiga sai
-- ---------------------------------------------------------------------
-- A partir daqui `exame_nome` não participa mais de nenhuma restrição, índice ou
-- filtro SQL. É a pré-condição para parar de escrevê-lo em claro e derrubar a
-- coluna — o passo que finalmente faz a fase 2a proteger contra dump.
alter table public.resultados
  drop constraint uq_resultado_agendamento_exame;
