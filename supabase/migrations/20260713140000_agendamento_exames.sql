-- Migration: snapshot dos exames coletados no agendamento.
-- Delta aplicável a um banco onde a init (20260626120000) já rodou.
--
-- Os exames são selecionados no FlowLab na hora de registrar a coleta
-- (ac_agendamento_exames, gravado na mesma transação que faz coletado). Chegam ao
-- LAB-HUB pelo webhook /webhooks/coletas junto com o status 'coletado'/'realizado'
-- e ficam guardados aqui como snapshot só p/ exibição na timeline do paciente.
--
-- jsonb (não tabela normalizada): a lista é apenas de leitura — nunca filtrada nem
-- joinada —, consistente com o padrão de snapshot usado nos dois sistemas.
-- Nullable, sem backfill: agendamentos antigos ficam sem exames (nada a mostrar).
-- Formato: [{ "nome": string, "isCultura": boolean, "material"?: string }]

alter table agendamentos
  add column if not exists exames jsonb;
