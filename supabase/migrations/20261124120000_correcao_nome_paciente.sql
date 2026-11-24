-- Migration: correção do NOME do paciente pela recepção do FlowLab
--
-- PROBLEMA
-- O nome do paciente vive só em `pacientes.nome` (o agendamento aponta para o
-- paciente). O FlowLab guarda uma cópia do nome quando recebe o agendamento e,
-- desde 24/11/2026, deixa a recepção corrigir essa cópia depois da coleta
-- (RPC editar_coleta de lá). Sem uma saída aqui, a correção ficava só no
-- FlowLab: o portal e os laudos seguiam com o nome digitado errado.
--
-- ESCOPO: ERRO DE DIGITAÇÃO
-- A troca é no CADASTRO da pessoa — vale para todos os agendamentos dela. Não
-- serve para "agendamento ligado ao paciente errado": renomear aí trocaria o
-- nome de outra pessoa. O FlowLab avisa isso na tela; aqui o que se garante é a
-- trilha de quem pediu, de que valor para qual.
--
-- Por que não usar PUT /pacientes/me: aquele é o canal do PRÓPRIO paciente
-- (JWT). A recepção entra pelo canal de API key, como na correção de identidade
-- (20260730130000), e a troca fica registrada na trilha abaixo.
--
-- Idempotente nas partes que podem ser (if not exists / create or replace).

-- =====================================================================
-- 1. Trilha append-only
-- =====================================================================
create table if not exists public.correcoes_nome (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references public.pacientes(id) on delete cascade,
  agendamento_id  uuid references public.agendamentos(id) on delete set null,
  nome_anterior   text not null,
  nome_novo       text not null,
  solicitado_por  text not null,   -- operador do FlowLab (nome/login)
  criado_em       timestamptz not null default now()
);

create index if not exists idx_correcoes_nome_paciente on public.correcoes_nome (paciente_id);

alter table public.correcoes_nome enable row level security;
-- Sem policy de propósito, como correcoes_identidade: a API usa service_role,
-- e a trilha não é dado de portal.

-- Append-only: a API grava, mas não reescreve a história. O cascade da FK segue
-- funcionando (ação de FK não passa por checagem de privilégio).
revoke update, delete, truncate on public.correcoes_nome from service_role;

-- =====================================================================
-- 2. RPC: troca o nome e grava a trilha na mesma transação
-- =====================================================================
-- Parte do AGENDAMENTO (o id que o FlowLab conhece: ac_agendamentos.labhub_id),
-- não do paciente — o FlowLab não guarda pacientes.id.
create or replace function public.corrigir_nome_paciente(
  p_agendamento_id uuid,
  p_nome           text,
  p_solicitado_por text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_nome           text := nullif(regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  v_solicitado_por text := nullif(btrim(coalesce(p_solicitado_por, '')), '');
  v_paciente_id    uuid;
  v_nome_anterior  text;
  v_correcao_id    uuid;
begin
  if v_nome is null then
    raise exception 'Informe o nome do paciente' using errcode = '22023';
  end if;
  if length(v_nome) > 200 then
    raise exception 'Nome longo demais' using errcode = '22023';
  end if;
  if v_solicitado_por is null then
    raise exception 'solicitado_por é obrigatório' using errcode = '22023';
  end if;

  select a.paciente_id into v_paciente_id
    from public.agendamentos a
   where a.id = p_agendamento_id;
  if v_paciente_id is null then
    raise exception 'Agendamento não encontrado' using errcode = 'P0002';
  end if;

  select p.nome into v_nome_anterior
    from public.pacientes p
   where p.id = v_paciente_id
     for update;

  -- Já está certo (ex.: retry do FlowLab): nada a gravar, e não é erro.
  if v_nome_anterior = v_nome then
    return jsonb_build_object(
      'correcaoId', null,
      'pacienteId', v_paciente_id,
      'alterado', false
    );
  end if;

  update public.pacientes set nome = v_nome where id = v_paciente_id;

  insert into public.correcoes_nome (paciente_id, agendamento_id, nome_anterior, nome_novo, solicitado_por)
  values (v_paciente_id, p_agendamento_id, v_nome_anterior, v_nome, v_solicitado_por)
  returning id into v_correcao_id;

  return jsonb_build_object(
    'correcaoId', v_correcao_id,
    'pacienteId', v_paciente_id,
    'alterado', true
  );
end;
$$;

-- Só a API (service_role) chama.
revoke execute on function public.corrigir_nome_paciente(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.corrigir_nome_paciente(uuid, text, text)
  to service_role;
