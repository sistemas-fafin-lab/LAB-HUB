-- Migration: verificação em duas etapas por e-mail (PV2-26)
-- Desenho: .scratch/portal-v2-paridade/desenho-dois-fatores.md
--
-- O Supabase não tem fator de MFA por e-mail. O segundo passo usa o código de
-- uso único do Supabase Auth (signInWithOtp/verifyOtp), e quem exige as duas
-- etapas é a API: com a preferência ligada, uma sessão aberta pela senha só lê
-- dado depois que o código for conferido PARA AQUELA SESSÃO (session_id do JWT).

-- =====================================================================
-- 1. Preferência do paciente. Só a API altera (depois de um código válido):
--    os roles de cliente não têm grant em `pacientes` (S-01).
-- =====================================================================
alter table public.pacientes
  add column if not exists dois_fatores_email boolean not null default false;

-- =====================================================================
-- 2. Estado da segunda etapa por sessão do Supabase.
-- =====================================================================
create table if not exists public.sessoes_dois_fatores (
  -- `session_id` do JWT do Supabase: a verificação vale para a sessão que
  -- entrou com a senha, não para o usuário inteiro.
  session_id    uuid primary key,
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  -- Preenchido quando o código confere. Null = ainda pendente.
  verificada_em timestamptz,
  -- Último envio de código (limite de 1 por minuto) e tentativas sobre ele
  -- (no máximo 5; zera a cada envio).
  enviado_em    timestamptz,
  tentativas    integer not null default 0 check (tentativas >= 0),
  criada_em     timestamptz not null default now(),
  -- Último uso da sessão verificada (renovado no máximo uma vez por dia). O
  -- expurgo conta a partir daqui: uma sessão ativa nunca perde a verificação.
  usada_em      timestamptz not null default now()
);

create index if not exists idx_sessoes_dois_fatores_paciente
  on public.sessoes_dois_fatores (paciente_id);
create index if not exists idx_sessoes_dois_fatores_usada_em
  on public.sessoes_dois_fatores (usada_em);

alter table public.sessoes_dois_fatores enable row level security;
-- Sem policy: nenhum role de cliente lê ou escreve aqui; a API usa a chave
-- secreta, que ignora a RLS.
revoke all on table public.sessoes_dois_fatores from anon, authenticated;

-- =====================================================================
-- 3. Códigos errados por conta. O limite de tentativas da sessão zera a cada
--    código novo e a cada login; este, não: com a senha vazada, dá para pedir
--    código e entrar de novo à vontade, mas não errar mais que o limite por
--    hora na mesma conta.
-- =====================================================================
create table if not exists public.bloqueios_dois_fatores (
  paciente_id uuid primary key references public.pacientes(id) on delete cascade,
  falhas      integer not null default 0 check (falhas >= 0),
  -- Início da janela de contagem; passada uma hora, a contagem recomeça.
  desde       timestamptz not null default now()
);

alter table public.bloqueios_dois_fatores enable row level security;
revoke all on table public.bloqueios_dois_fatores from anon, authenticated;
