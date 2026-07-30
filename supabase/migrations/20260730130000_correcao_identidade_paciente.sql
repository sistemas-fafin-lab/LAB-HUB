-- Migration: correção autorizada de CPF/data de nascimento após o claim
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-01 (trava de identidade) e § S-08 (trilha)
--
-- CONTEXTO
-- A migration 20260730120000 congelou `cpf`, `data_nascimento` e `auth_user_id`
-- depois que a conta é vinculada. Isso fecha a cadeia do S-01, mas deixa sem
-- saída o erro de digitação percebido tarde: a recepção digita o CPF errado ao
-- criar o paciente-fantasma, a pessoa se cadastra, e só meses depois alguém nota.
--
-- POR QUE PRECISA DE AUTORIZAÇÃO EXTERNA
-- Nenhum dado que o sistema já guarda serve para liberar essa troca. CPF antigo,
-- nascimento antigo, e-mail, telefone, código por SMS — o atacante do S-01 tem
-- tudo isso, porque a conta é dele. O que precisa ser provado é que o CPF NOVO
-- pertence a quem pede, e disso o banco não sabe nada. Quem sabe é a recepção,
-- olhando o documento físico — a mesma conferência que ela já faz ao cadastrar.
--
-- DESENHO
-- A exceção do trigger não é um flag solto (um flag global seria derrubado por
-- qualquer bug numa rota qualquer). Ela é amarrada a uma LINHA de autorização:
-- o trigger só libera se existir, nesta mesma transação, um registro em
-- `correcoes_identidade` que confira exatamente com a mudança sendo feita.
-- Consequência prática: `PUT /pacientes/me` continua sem conseguir tocar no CPF
-- nem por bug, porque não passa por este caminho.

-- =====================================================================
-- 1. Trilha de correções (append-only)
--    Também é o primeiro pedaço concreto do S-08: registra quem autorizou,
--    qual documento foi conferido e o valor anterior.
-- =====================================================================

create table public.correcoes_identidade (
  id                  uuid primary key default gen_random_uuid(),
  paciente_id         uuid not null references public.pacientes(id) on delete cascade,
  cpf_anterior        text not null,
  cpf_novo            text not null,
  nascimento_anterior date not null,
  nascimento_novo     date not null,
  motivo              text not null,   -- ex.: "CPF digitado errado no cadastro do balcão"
  autorizado_por      text not null,   -- operador da recepção (login/id no FlowLab)
  documento_conferido text not null,   -- 'RG' | 'CNH' | 'CTPS' | ...
  criado_em           timestamptz not null default now()
);

create index idx_correcoes_identidade_paciente on public.correcoes_identidade (paciente_id);

alter table public.correcoes_identidade enable row level security;
-- Sem policy de propósito: nenhum role de cliente tem grant aqui (ver
-- 20260730120000) e a API usa service_role, que ignora RLS. Trilha de auditoria
-- não é dado de portal — o paciente não lê a própria trilha.

-- Append-only DE VERDADE: nem a API pode reescrever a história. O INSERT fica;
-- UPDATE/DELETE saem. O `on delete cascade` acima continua funcionando porque
-- ação de FK não passa por checagem de privilégio — se o paciente for apagado
-- (direito do titular, LGPD art. 18 VI), a trilha dele vai junto, como deve.
revoke update, delete, truncate on public.correcoes_identidade from service_role;

-- =====================================================================
-- 2. Trigger: agora com uma única saída, e ela é auditada
-- =====================================================================

create or replace function public.pacientes_bloqueia_troca_identidade()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_correcao uuid;
begin
  -- Antes do claim a linha é um fantasma da recepção e segue livre para correção
  -- (inclusive pelo UPDATE de POST /cadastro, que é quem preenche o auth_user_id).
  if old.auth_user_id is null then
    return new;
  end if;

  -- Vínculo de conta: imutável, sem exceção nenhuma. Não é campo digitado, então
  -- não existe "erro de digitação" nele — só troca de dono.
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Vínculo de conta é imutável'
      using errcode = '42501';
  end if;

  -- Nada de identidade mudou: caminho normal (PUT /pacientes/me e afins).
  if new.cpf is not distinct from old.cpf
     and new.data_nascimento is not distinct from old.data_nascimento then
    return new;
  end if;

  -- Mudou CPF e/ou nascimento: só passa acompanhado de uma autorização
  -- registrada NESTA transação por public.corrigir_identidade_paciente().
  -- O `true` em current_setting evita erro quando a GUC nunca foi definida.
  begin
    v_correcao := nullif(current_setting('app.correcao_identidade', true), '')::uuid;
  exception when others then
    v_correcao := null;  -- GUC malformada vale como ausente: bloqueia.
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
$$;

-- =====================================================================
-- 3. A única porta de correção
--    SEM security definer de propósito: quem chama é o service_role, que já tem
--    os privilégios necessários. Elevar aqui só criaria mais uma função
--    privilegiada para auditar (ver S-07), sem ganho nenhum.
-- =====================================================================

create or replace function public.corrigir_identidade_paciente(
  p_paciente_id         uuid,
  p_cpf_novo            text,
  p_nascimento_novo     date,
  p_motivo              text,
  p_autorizado_por      text,
  p_documento_conferido text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pac      public.pacientes%rowtype;
  v_correcao public.correcoes_identidade%rowtype;
  v_laudos   integer;
begin
  if p_cpf_novo !~ '^\d{11}$' then
    raise exception 'CPF deve conter exatamente 11 dígitos' using errcode = '22023';
  end if;
  if coalesce(btrim(p_motivo), '') = ''
     or coalesce(btrim(p_autorizado_por), '') = ''
     or coalesce(btrim(p_documento_conferido), '') = '' then
    raise exception 'motivo, autorizado_por e documento_conferido são obrigatórios'
      using errcode = '22023';
  end if;

  -- `for update` serializa duas correções concorrentes sobre o mesmo paciente:
  -- sem isso, as duas leriam o mesmo cpf_anterior e a trilha ficaria mentindo.
  select * into v_pac from public.pacientes where id = p_paciente_id for update;
  if not found then
    raise exception 'Paciente não encontrado' using errcode = 'P0002';
  end if;

  if v_pac.auth_user_id is null then
    raise exception 'Paciente ainda não vinculado a uma conta: corrija direto no cadastro'
      using errcode = '22023';
  end if;

  if v_pac.cpf = p_cpf_novo and v_pac.data_nascimento = p_nascimento_novo then
    raise exception 'Nada a corrigir: CPF e data de nascimento já são estes'
      using errcode = '22023';
  end if;

  -- Checagem antecipada só para dar erro legível; a garantia real continua sendo
  -- o UNIQUE de pacientes.cpf. Dois cadastros com o mesmo CPF não são caso de
  -- correção e sim de FUSÃO — que mexe em agendamentos e documentos e por isso
  -- não acontece aqui.
  if exists (
    select 1 from public.pacientes
     where cpf = p_cpf_novo and id <> p_paciente_id
  ) then
    raise exception 'CPF já pertence a outro cadastro; este caso é de fusão, não de correção'
      using errcode = '23505';
  end if;

  insert into public.correcoes_identidade (
    paciente_id, cpf_anterior, cpf_novo,
    nascimento_anterior, nascimento_novo,
    motivo, autorizado_por, documento_conferido
  ) values (
    p_paciente_id, v_pac.cpf, p_cpf_novo,
    v_pac.data_nascimento, p_nascimento_novo,
    btrim(p_motivo), btrim(p_autorizado_por), btrim(p_documento_conferido)
  ) returning * into v_correcao;

  -- Abre a exceção do trigger para ESTA correção e só até o fim da transação
  -- (o `true` de set_config é o `set local`).
  perform set_config('app.correcao_identidade', v_correcao.id::text, true);

  update public.pacientes
     set cpf = p_cpf_novo,
         data_nascimento = p_nascimento_novo
   where id = p_paciente_id;

  -- Fecha logo, para que qualquer outro UPDATE que caia nesta mesma transação
  -- volte a encontrar a trava fechada.
  perform set_config('app.correcao_identidade', '', true);

  -- O cache dos LIS foi buscado com o CPF ANTIGO (exam_results.cpf). Mantê-lo
  -- depois da troca é exibir no portal o histórico de outra pessoa — exatamente
  -- o estrago do S-01, por outra porta. Apaga; o próximo
  -- GET /laudos?refresh=true repovoa a partir do CPF novo.
  delete from public.exam_results where paciente_id = p_paciente_id;
  get diagnostics v_laudos = row_count;

  return jsonb_build_object(
    'correcaoId',           v_correcao.id,
    'pacienteId',           p_paciente_id,
    'cpfAnterior',          v_correcao.cpf_anterior,
    'nascimentoAnterior',   v_correcao.nascimento_anterior,
    'laudosInvalidados',    v_laudos,
    'corrigidoEm',          v_correcao.criado_em
  );
end;
$$;

-- Só a API (service_role) chama. Fecha o PUBLIC herdado, como em 20260730120000.
revoke execute on function public.corrigir_identidade_paciente(uuid, text, date, text, text, text)
  from public, anon, authenticated;
grant execute on function public.corrigir_identidade_paciente(uuid, text, date, text, text, text)
  to service_role;

-- =====================================================================
-- 4. Como validar
-- =====================================================================
--   -- deve FALHAR (sem autorização):
--   update public.pacientes set cpf = '...' where auth_user_id is not null;
--
--   -- deve PASSAR e deixar rastro:
--   select public.corrigir_identidade_paciente(
--     '<paciente_id>', '<cpf 11 dígitos>', '<YYYY-MM-DD>',
--     'CPF digitado errado no balcão', 'recepcao.ana', 'RG');
--   select * from public.correcoes_identidade order by criado_em desc limit 1;
