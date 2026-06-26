-- Migration: idempotência do webhook de resultados (#6)
-- Delta aplicável a um banco onde a init (20260626120000) já rodou.
--
-- Webhooks são at-least-once: o FlowLab pode reenviar o mesmo payload (retry de
-- rede, timeout). Sem chave natural única, cada reentrega cria uma linha duplicada.
-- Esta constraint garante 1 resultado por (agendamento, exame); a API trata a
-- violação (SQLSTATE 23505) como idempotente. Ver docs/melhorias.md item #6.
--
-- Pré-requisito: a tabela não pode ter duplicatas existentes em
-- (agendamento_id, exame_nome), senão o ADD CONSTRAINT falha. Para checar antes:
--   select agendamento_id, exame_nome, count(*)
--   from resultados group by 1, 2 having count(*) > 1;

alter table resultados
  add constraint uq_resultado_agendamento_exame
  unique (agendamento_id, exame_nome);
