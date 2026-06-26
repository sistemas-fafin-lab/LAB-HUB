-- Migration: Fase 1 — Domínio LAB-HUB (Portal do Paciente)
-- Cria os tipos enum, as tabelas de domínio (pacientes, agendamentos, resultados),
-- RLS, índices, trigger de updated_at e o bucket de storage para PDFs.
-- Ref.: docs/PLANO_ANALISES_CLINICAS.md (Fase 1)

-- =====================================================================
-- 1. Tipos enumerados (conjuntos fechados, donos do app)
--    Postos/exames/categorias NÃO são enums: são dados de referência do
--    FlowLab (proxy + snapshot). Ver D3 no plano.
-- =====================================================================

create type sexo as enum ('M', 'F');
create type resultado_status as enum ('analyzing', 'ready');

-- =====================================================================
-- 2. pacientes (D2: modelo 1:1 com auth.users; dependentes adiados)
-- =====================================================================

create table pacientes (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid references auth.users(id) on delete cascade,
  nome            text not null,
  email           text not null,
  cpf             text not null unique check (cpf ~ '^\d{11}$'),  -- só dígitos; normalizar na API
  sexo            sexo not null,
  data_nascimento date not null,
  telefone        text,
  criado_em       timestamptz not null default now()
);

alter table pacientes enable row level security;

create policy "paciente vê só o próprio perfil"
  on pacientes for all
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- =====================================================================
-- 3. agendamentos
--    posto_flowlab_id = id canônico do posto no FlowLab (dono do dado)
--    posto_nome       = snapshot p/ exibição e histórico
-- =====================================================================

create table agendamentos (
  id               uuid primary key default gen_random_uuid(),
  paciente_id      uuid not null references pacientes(id) on delete cascade,
  posto_flowlab_id uuid not null,
  posto_nome       text not null,
  data_hora        timestamptz not null,
  status           text not null default 'pendente',  -- pendente | confirmado | cancelado | realizado
  flowlab_id       uuid,                               -- id no FlowLab (preenchido após sync)
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

alter table agendamentos enable row level security;

create policy "paciente vê só seus agendamentos"
  on agendamentos for all
  using (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  )
  with check (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  );

create index idx_agendamentos_paciente on agendamentos (paciente_id);
create index idx_agendamentos_data on agendamentos (data_hora, posto_flowlab_id);

-- =====================================================================
-- 4. resultados (D1: painéis estruturados; PDF é opcional)
--    exame_nome/categoria = snapshots de texto vindos do webhook FlowLab
-- =====================================================================

create table resultados (
  id                 uuid primary key default gen_random_uuid(),
  paciente_id        uuid not null references pacientes(id) on delete cascade,
  agendamento_id     uuid references agendamentos(id),
  exame_nome         text not null,                       -- snapshot (ex.: "Hemograma Completo")
  categoria          text,                                -- snapshot (ex.: "Sangue")
  exame_flowlab_id   uuid,                                -- (opcional) id do exame no catálogo FlowLab
  status             resultado_status not null default 'analyzing',
  resumo             text,                                -- observações clínicas
  paineis            jsonb not null default '[]',         -- [{nome,valor,unidade,ref,ok,trend}]
  laudo_url          text,                                -- PDF opcional (D1)
  declaracao_url     text,                                -- PDF opcional (D1)
  liberado_em        timestamptz,
  flowlab_analise_id uuid,                                -- id no FlowLab
  criado_em          timestamptz not null default now()
);

alter table resultados enable row level security;

create policy "paciente vê só seus resultados"
  on resultados for all
  using (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  )
  with check (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  );

-- =====================================================================
-- 5. Trigger de updated_at em agendamentos
-- =====================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_agendamentos_updated
  before update on agendamentos
  for each row
  execute function set_updated_at();

-- =====================================================================
-- 6. Storage bucket privado para laudos/declarações (PDF)
--    Bucket privado e SEM policy pública: só o service_role (a API)
--    acessa, gerando signed URLs sob demanda após checar o dono.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('laudos', 'laudos', false)
on conflict (id) do nothing;
