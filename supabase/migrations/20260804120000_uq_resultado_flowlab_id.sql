-- =====================================================================
-- Identidade opaca do resultado vinda do FlowLab (S-06, destrava a fase 2b
-- do rótulo)
--
-- POR QUE ISTO EXISTE
--
-- A fase 2a cifrou `resultados.exame_nome`, mas a coluna em claro continua
-- preenchida e sendo escrita — ou seja, a cifra ainda não protege contra dump.
-- O que impede derrubar o texto puro é esta constraint:
--
--   uq_resultado_agendamento_exame  UNIQUE (agendamento_id, exame_nome)
--
-- Ela é o que torna o webhook idempotente: o FlowLab entrega at-least-once, e a
-- reentrega bate no 23505 em vez de duplicar o resultado. Unicidade não existe
-- sobre coluna cifrada com IV aleatório — dois envelopes do mesmo texto são
-- diferentes. Logo: enquanto a idempotência depender do NOME, o nome fica em
-- claro.
--
-- A saída é deduplicar pela identidade do resultado, não pelo texto do rótulo.
-- `ac_resultados.id` do FlowLab é uuid PK, estável, e já estava carregado no
-- handler que monta o webhook — mandá-lo custou uma linha lá.
--
-- O DEFEITO QUE ISTO TAMBÉM CONSERTA
--
-- O FlowLab NÃO tem unicidade em (agendamento_id, exame_nome) do lado dele; só
-- nós temos. Um resultado corrigido/reliberado do mesmo exame colide aqui,
-- recebe 200 {idempotency:'ignored'} e o FlowLab então marca
-- `entregue_ao_labhub = true`. O resultado corrigido é descartado E registrado
-- como entregue. Deduplicar pelo id do resultado desfaz isso: id novo é
-- resultado novo, e passa.
--
-- POR QUE SÓ METADE DO CAMINHO AGORA
--
-- Esta migration NÃO derruba a unique antiga e NÃO torna a coluna NOT NULL.
-- O FlowLab em produção ainda não manda o campo. Se a unicidade passasse para
-- (agendamento_id, exame_flowlab_id) hoje, todo resultado chegaria com null —
-- e null é DISTINTO de null em unique do Postgres, então a constraint nunca
-- dispararia e a idempotência do webhook simplesmente sumiria. Retry de rede
-- viraria resultado duplicado no portal do paciente.
--
-- Então aqui vai só o que é seguro com os dois lados em qualquer versão:
-- unicidade global do id do FlowLab. Ela é aditiva (linhas antigas têm null e
-- não são afetadas), pega a reentrega verdadeira mesmo antes da troca, e não
-- remove nenhuma garantia existente.
--
-- O QUE FALTA, e o que cada coisa exige:
--   1. deploy do FlowLab mandando `exameFlowlabId`  (Vercel)
--   2. conferir que todo resultado novo chega com o id preenchido
--   3. decisão de PRODUTO: com a unique antiga fora, um segundo resultado
--      genuíno do mesmo exame passa a ser aceito e aparece DUAS VEZES no
--      portal. Exibir as duas? A nova substitui? Marcar a antiga como
--      retificada? Sem essa resposta, trocar a constraint troca um bug
--      silencioso por um comportamento de tela indefinido.
--   4. migration própria: `exame_flowlab_id` NOT NULL, drop da
--      `uq_resultado_agendamento_exame`, e só então parar de escrever
--      `exame_nome` em claro e derrubar a coluna.
--
-- Estado dos dados hoje (conferido em 04/08/2026): as 2 linhas de `resultados`
-- em produção têm `agendamento_id` null — não vieram do webhook (a rota sempre
-- grava o agendamento resolvido), foram semeadas. Não há o que fazer backfill:
-- não existe `ac_resultados.id` correspondente para elas.
-- =====================================================================

-- Global, não por agendamento: `ac_resultados.id` é PK do outro lado, então
-- repetição significa reentrega do MESMO resultado — nunca dois resultados
-- diferentes. Restringir a constraint ao agendamento deixaria passar um payload
-- que aponta o mesmo resultado do FlowLab para dois agendamentos, que é
-- exatamente o tipo de embaralhamento que não queremos no dado clínico.
--
-- NULLs seguem distintos (padrão do Postgres): linhas antigas e as entregas do
-- FlowLab ainda não atualizado convivem sem colidir entre si.
create unique index if not exists uq_resultado_flowlab
  on public.resultados (exame_flowlab_id)
  where exame_flowlab_id is not null;

comment on column public.resultados.exame_flowlab_id is
  'ac_resultados.id no FlowLab — identidade opaca do resultado. É por ela que a '
  'reentrega do webhook é deduplicada, e é o que permitirá cifrar exame_nome de '
  'verdade (derrubando a coluna em claro). Null só em linhas anteriores a esta '
  'integração.';
