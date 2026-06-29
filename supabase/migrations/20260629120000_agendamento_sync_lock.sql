-- Migration: lock de sincronização de agendamentos com o FlowLab (anti duplo-envio).
-- Delta aplicável a um banco onde a init (20260626120000) já rodou.
--
-- Em syncs concorrentes do mesmo agendamento (ex.: POST /agendamentos/:id/sync
-- disparado 2x, ou retry do cliente), apenas um processo deve chamar o FlowLab —
-- senão o agendamento é criado em duplicidade lá. 'sincronizando_em' funciona
-- como lock: a API reivindica a linha num UPDATE condicional atômico que só passa
-- se sincronizando_em < now() - TTL (lock livre ou vencido). Quem não reivindicar
-- não chama o FlowLab.
--
-- Default no passado (epoch) = "sem lock" — agendamentos existentes ficam
-- imediatamente sincronizáveis. O TTL (SYNC_LOCK_TTL_MS na API) recupera linhas
-- presas caso um processo caia segurando o lock no meio do sync.

alter table agendamentos
  add column if not exists sincronizando_em timestamptz not null default to_timestamp(0);
