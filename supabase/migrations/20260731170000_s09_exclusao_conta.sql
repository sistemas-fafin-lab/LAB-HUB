-- Migration: exclusão de conta do titular (LGPD art. 18, VI) sem apagar prontuário
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-09 (retenção/expurgo) e § S-08 (trilha)
--
-- O QUE "EXCLUIR A CONTA" PODE SIGNIFICAR NUM LABORATÓRIO
-- A LGPD dá ao titular o direito de eliminação (art. 18, VI), e o art. 16, I
-- ressalva a retenção necessária ao cumprimento de obrigação legal ou
-- regulatória — e laudo clínico É obrigação legal: a Resolução CFM 1.821/2007
-- exige a guarda do prontuário por 20 anos a contar do último registro. Apagar
-- `exam_results`/`resultados` a pedido do paciente não seria privacidade, seria
-- destruição de registro que a lei manda guardar.
--
-- Então a exclusão aqui é PRECISA, não total:
--
--   APAGA   conta de acesso (auth.users), documentos que o paciente enviou
--           (identidade, carteirinha, pedido médico — insumo, não prontuário),
--           e-mail, telefone e convênio.
--   RETÉM   nome, CPF, data de nascimento, agendamentos, resultados e laudos —
--           o prontuário, sob o art. 16, I. Sem nome e CPF o prontuário retido
--           não identifica ninguém e deixa de cumprir a obrigação que justifica
--           a retenção.
--
-- A ARMADILHA QUE ISTO DESARMA
-- `pacientes.auth_user_id` referencia `auth.users(id)` ON DELETE CASCADE, e
-- `agendamentos`, `resultados`, `exam_results`, `documentos` e
-- `correcoes_identidade` referenciam `pacientes(id)` ON DELETE CASCADE. Ou seja:
-- um `auth.admin.deleteUser()` inocente hoje apaga em silêncio o prontuário
-- inteiro E a trilha de auditoria — deixando os arquivos órfãos no bucket, que é
-- exatamente o que a migration 20260715120000 avisou que aconteceria.
--
-- A ordem correta é DESVINCULAR ANTES de apagar o usuário do Auth: com
-- `auth_user_id = null`, o cascade não encontra o que derrubar. É isso que a RPC
-- abaixo faz — e é por isso que ela precisa existir, já que o trigger de
-- identidade (S-01) proíbe justamente mexer em `auth_user_id`.
--
-- MESMO DESENHO DA CORREÇÃO DE IDENTIDADE
-- A saída não é um flag solto: o trigger só libera o desvínculo se existir,
-- nesta mesma transação, uma linha em `exclusoes_conta` que confira com a
-- mudança. Um bug em qualquer outra rota continua sem conseguir desvincular.

-- =====================================================================
-- 1. Marca de exclusão no prontuário retido
-- =====================================================================

alter table public.pacientes
  add column if not exists excluido_em timestamptz;

comment on column public.pacientes.excluido_em is
  'Quando o titular pediu a exclusão da conta (LGPD art. 18, VI). A linha '
  'permanece como prontuário retido (art. 16, I); só o vínculo de acesso e os '
  'dados de contato foram apagados.';

-- =====================================================================
-- 2. Trilha de exclusões (append-only, como correcoes_identidade)
-- =====================================================================

create table if not exists public.exclusoes_conta (
  id                   uuid primary key default gen_random_uuid(),
  paciente_id          uuid not null references public.pacientes(id) on delete cascade,
  -- Guardado para reconciliação: se a API cair entre o desvínculo e o
  -- `deleteUser`, este é o único ponteiro que resta para terminar o serviço.
  -- É um UUID opaco, não um identificador pessoal — diferente do e-mail, que
  -- NÃO guardamos aqui justamente por ser o dado que o titular pediu para
  -- apagar.
  auth_user_id_anterior uuid not null,
  -- Preenchido pela API depois que o usuário some do Auth. Enquanto for null,
  -- a exclusão está pela metade e precisa de atenção humana.
  auth_removido_em     timestamptz,
  documentos_removidos integer not null default 0,
  criado_em            timestamptz not null default now()
);

create index if not exists idx_exclusoes_conta_paciente
  on public.exclusoes_conta (paciente_id);

alter table public.exclusoes_conta enable row level security;
-- Sem policy, pelo mesmo motivo de `correcoes_identidade`: nenhum role de
-- cliente tem grant aqui e a API usa service_role, que ignora RLS.

-- Append-only: o INSERT fica, UPDATE/DELETE saem — com UMA exceção deliberada,
-- o `auth_removido_em`, que só pode ir de null para uma data. Sem esse UPDATE a
-- trilha não consegue registrar que a exclusão terminou; com ele solto, a
-- história seria reescrevível. A coluna é protegida pelo trigger logo abaixo.
revoke update, delete, truncate on public.exclusoes_conta from service_role;
grant update (auth_removido_em, documentos_removidos) on public.exclusoes_conta to service_role;

create or replace function public.exclusoes_conta_append_only()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Só o fechamento é editável, e só uma vez: de null para uma data.
  if old.auth_removido_em is not null
     and new.auth_removido_em is distinct from old.auth_removido_em then
    raise exception 'Trilha de exclusão é append-only' using errcode = '42501';
  end if;

  if new.id                    is distinct from old.id
     or new.paciente_id           is distinct from old.paciente_id
     or new.auth_user_id_anterior is distinct from old.auth_user_id_anterior
     or new.criado_em             is distinct from old.criado_em then
    raise exception 'Trilha de exclusão é append-only' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_exclusoes_conta_append_only on public.exclusoes_conta;
create trigger trg_exclusoes_conta_append_only
  before update on public.exclusoes_conta
  for each row execute function public.exclusoes_conta_append_only();

-- =====================================================================
-- 3. Trigger de identidade: abre UMA saída para o desvínculo
--    Idêntico ao de 20260730130000, exceto pelo bloco do auth_user_id.
-- =====================================================================

create or replace function public.pacientes_bloqueia_troca_identidade()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_correcao uuid;
  v_exclusao uuid;
begin
  if old.auth_user_id is null then
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    begin
      v_exclusao := nullif(current_setting('app.exclusao_conta', true), '')::uuid;
    exception when others then
      v_exclusao := null;
    end;

    -- Três condições, todas necessárias. `new.auth_user_id is not null` é a que
    -- importa mais: a saída serve para DESVINCULAR (ir para null), nunca para
    -- apontar o paciente a OUTRA conta — isso continua sendo o sequestro que o
    -- S-01 fechou, e nenhuma autorização de exclusão o libera.
    if new.auth_user_id is not null
       or v_exclusao is null
       or not exists (
         select 1
           from public.exclusoes_conta e
          where e.id                    = v_exclusao
            and e.paciente_id           = old.id
            and e.auth_user_id_anterior = old.auth_user_id
       ) then
      raise exception 'Vínculo de conta é imutável' using errcode = '42501';
    end if;
  end if;

  if new.cpf is not distinct from old.cpf
     and new.data_nascimento is not distinct from old.data_nascimento then
    return new;
  end if;

  begin
    v_correcao := nullif(current_setting('app.correcao_identidade', true), '')::uuid;
  exception when others then
    v_correcao := null;
  end;

  if v_correcao is null or not exists (
    select 1
      from public.correcoes_identidade c
     where c.id                  = v_correcao
       and c.paciente_id         = old.id
       and c.cpf_anterior        = old.cpf
       and c.cpf_novo            = new.cpf
       and c.nascimento_anterior = old.data_nascimento
       and c.nascimento_novo     = new.data_nascimento
  ) then
    raise exception
      'CPF e data de nascimento são imutáveis após a vinculação da conta; use corrigir_identidade_paciente()'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- =====================================================================
-- 4. RPC: desvincula a conta e anonimiza o contato, numa transação só
--    Devolve o auth_user_id que a API ainda precisa apagar no Auth, e o id da
--    linha da trilha, que a API fecha depois de apagá-lo.
-- =====================================================================

create or replace function public.excluir_conta_paciente(p_paciente_id uuid)
returns table (exclusao_id uuid, auth_user_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid;
  v_exclusao     uuid;
begin
  -- `for update`: sem o lock, dois pedidos simultâneos inserem duas linhas na
  -- trilha e a segunda encontra auth_user_id já null.
  -- Colunas qualificadas por `p.`: sem isso, `auth_user_id` colide com o
  -- parâmetro OUT de mesmo nome e o plpgsql aborta por referência ambígua.
  select p.auth_user_id into v_auth_user_id
    from public.pacientes p
   where p.id = p_paciente_id
     for update;

  if not found then
    raise exception 'Paciente não encontrado' using errcode = 'P0002';
  end if;

  if v_auth_user_id is null then
    raise exception 'Paciente não possui conta vinculada' using errcode = '22023';
  end if;

  insert into public.exclusoes_conta (paciente_id, auth_user_id_anterior)
       values (p_paciente_id, v_auth_user_id)
    returning id into v_exclusao;

  -- `true` = local à transação: some no commit, não vaza para a próxima query
  -- que reusar esta conexão do pool.
  perform set_config('app.exclusao_conta', v_exclusao::text, true);

  update public.pacientes
     set auth_user_id       = null,
         email              = null,
         telefone           = null,
         convenio_operadora = null,
         convenio_plano     = null,
         excluido_em        = now()
   where id = p_paciente_id;

  return query select v_exclusao, v_auth_user_id;
end;
$function$;

-- Mesma postura da RPC de correção: fecha o EXECUTE herdado do PUBLIC (que
-- `anon` e `authenticated` herdam, e que faria o PostgREST publicar isto em
-- /rest/v1/rpc/) e devolve só ao service_role, que é a API.
revoke execute on function public.excluir_conta_paciente(uuid) from public;
grant  execute on function public.excluir_conta_paciente(uuid) to service_role;
