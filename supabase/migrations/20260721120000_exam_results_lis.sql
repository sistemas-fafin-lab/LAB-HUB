-- Migration: cache de laudos buscados nos LIS (ApLIS e AOL/Álvaro Online)
-- Delta aplicável a um banco onde a init (20260626120000) já rodou.
--
-- Porquê: até aqui o LAB-HUB só conhecia um resultado quando o FlowLab o
-- EMPURRAVA (POST /webhooks/resultados → tabela `resultados`). Isso cobre só o
-- que passou pela operação interna. Esta tabela é a outra ponta: a API BUSCA os
-- laudos direto nos sistemas do laboratório e cacheia aqui.
--
-- As duas fontes CONVIVEM e não se falam: `resultados` continua sendo do
-- FlowLab, `exam_results` é dos LIS. Quem une as duas é o front
-- (apps/web/src/lib/useResultados.ts). Ver docs/LAUDOS_LIS.md.
--
-- `result` guarda o laudo inteiro já normalizado (tipo Laudo de @lab-hub/shared),
-- e não colunas espalhadas: o formato vem dos LIS e muda sem aviso, então o
-- schema não deve ser refém dele. `null` = requisição conhecida mas resultado
-- ainda não liberado.

create table exam_results (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references pacientes(id) on delete cascade,
  cpf           text not null,                -- chave de busca nos LIS (só dígitos)
  codigo_os     text,                         -- OS no AOL; null em linha só-ApLIS
  codigo_lis    text unique,                  -- requisição no ApLIS
  result        jsonb,                        -- null = aguardando resultado
  cached_at     timestamptz,                  -- null enquanto `result` for null
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- `codigo_lis unique` é o que impede duplicar a mesma requisição a cada
-- revalidação. Serve mesmo com as linhas só-AOL (codigo_lis null): no Postgres
-- NULLs são distintos entre si, então múltiplas linhas sem código LIS convivem.
create index idx_exam_results_paciente on exam_results (paciente_id);

alter table exam_results enable row level security;

-- Mesma policy de `resultados`: o paciente só enxerga o que é dele. A API usa a
-- service role (ignora RLS) e filtra por paciente_id na mão — esta policy é a
-- segunda barreira, para acesso direto via anon key.
create policy "paciente vê só seus laudos"
  on exam_results for all
  using (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  )
  with check (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  );

-- set_updated_at() foi criada na migration inicial para `agendamentos`; aqui a
-- coluna se chama atualizado_em, então o trigger precisa da sua própria função.
create or replace function set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_exam_results_atualizado_em
  before update on exam_results
  for each row
  execute function set_atualizado_em();
