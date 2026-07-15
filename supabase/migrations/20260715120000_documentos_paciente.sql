-- Migration: documentos pessoais do paciente (identidade, carteirinha, pedido médico)
-- Delta aplicável a um banco onde a init (20260626120000) já rodou.
--
-- Porquê: o check-in na recepção é lento porque o funcionário confere os
-- documentos com o paciente já no balcão. O paciente passa a anexá-los ao
-- agendar, e a conferência acontece antes de ele chegar.
--
-- O check-in roda no FlowLab (outro sistema, outro Supabase), mas os arquivos
-- ficam SÓ aqui: o FlowLab lê por signed URL fresca via
-- GET /api/v1/integracao/agendamentos/:labhubId/documentos. Uma cópia dos bytes,
-- um lugar para apagar (LGPD).
--
-- agendamento_id nullable é o eixo do modelo:
--   null       → documento perene do paciente (identidade, carteirinha): sobe
--                uma vez e vale para toda coleta.
--   preenchido → documento daquela coleta (pedido médico).
--
-- ATENÇÃO (LGPD): o `on delete cascade` apaga a LINHA, não o objeto no Storage.
-- Apagar um paciente pelo banco deixa os arquivos órfãos no bucket. Qualquer
-- rotina de expurgo precisa fazer storage.remove ANTES do delete da linha.

-- =====================================================================
-- 1. Tipo do documento (conjunto fechado, dono do app — igual a `sexo`)
--    Só os que o paciente ENVIA. Atestado/declaração/laudo são OUTPUTS do
--    laboratório e já vivem em `resultados` (declaracao_url/laudo_url).
-- =====================================================================

create type tipo_documento as enum ('identidade', 'carteirinha', 'pedido_medico', 'outro');

-- =====================================================================
-- 2. documentos
--    Sem unique em (paciente_id, tipo): gente tem RG *e* CNH, frente *e* verso
--    da carteirinha. A UI oferece "substituir"; o banco não impõe.
-- =====================================================================

create table documentos (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references pacientes(id) on delete cascade,
  agendamento_id uuid references agendamentos(id) on delete cascade,
  tipo           tipo_documento not null,
  -- Nome original do arquivo — EXIBIÇÃO apenas. Nunca entra na composição do
  -- path (evita path traversal, colisão e nome inválido no Storage).
  nome_arquivo   text not null,
  -- Path no bucket 'documentos', nunca URL — é o que createSignedUrl espera.
  -- O check espelha o .refine de schemas/resultado.ts (declaracaoUrl).
  storage_path   text not null unique check (storage_path !~* '^https?://'),
  -- Tipo REAL, detectado por magic bytes na API. NÃO é o Content-Type do
  -- cliente, que é texto livre e mente.
  mime_type      text not null,
  tamanho_bytes  integer not null check (tamanho_bytes > 0),
  criado_em      timestamptz not null default now()
);

alter table documentos enable row level security;

create policy "paciente vê só seus documentos"
  on documentos for all
  using (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  )
  with check (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  );

create index idx_documentos_paciente on documentos (paciente_id);
-- Parcial: a maioria das linhas é perene (agendamento_id null) e nunca casa
-- este filtro. Índice menor e alinhado à query real.
create index idx_documentos_agendamento
  on documentos (agendamento_id)
  where agendamento_id is not null;

-- =====================================================================
-- 3. Storage bucket privado para documentos do paciente
--    Bucket novo (não reusa 'laudos'): ciclo de vida, retenção e conjunto de
--    MIME diferentes — 'laudos' guarda output do laboratório, este guarda
--    input do paciente. Privado e SEM policy: só o service_role (a API) acessa,
--    gerando signed URLs sob demanda após checar o dono.
--
--    file_size_limit/allowed_mime_types são cinto-e-suspensório: o Storage os
--    confere contra o content-type que a API envia, e a API envia o tipo
--    SNIFFADO por magic bytes. A validação de verdade está em lib/fileType.ts.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  10485760,  -- 10 MB; foto de identidade/carteirinha e PDF de pedido cabem folgado
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
