-- =====================================================================
-- Correção: a trilha de exclusão de conta não pode morrer junto com o
-- paciente que ela testemunha.
--
-- Defeito introduzido pela própria S-09 (20260731170000). A tabela nasceu
-- com:
--
--   paciente_id uuid not null references public.pacientes(id) on delete cascade
--
-- O fluxo correto de exclusão (RPC `excluir_conta_paciente`) NÃO apaga a
-- linha de `pacientes` — ele anula o `auth_user_id`, anonimiza o contato e
-- marca `excluido_em`, justamente para desarmar os cascades. Então nesse
-- caminho a trilha sobrevive.
--
-- Mas o cascade continuava armado para QUALQUER OUTRO delete da linha do
-- paciente: limpeza manual, script de teste, `delete from pacientes` no
-- painel. E foi o que aconteceu neste banco — em 03/08/2026 as estatísticas
-- do Postgres mostravam `exclusoes_conta` com 2 inserções e 0 linhas vivas,
-- junto de 6 pacientes apagados que levaram 55 `exam_results` no mesmo
-- cascade.
--
-- Uma trilha de auditoria que desaparece junto com o objeto auditado não
-- prova nada. O caso em que ela MAIS importa — alguém apagou o paciente — é
-- exatamente o caso em que ela sumia.
--
-- Correção: remover a FK. Não é descuido; é o desenho certo para tabela de
-- trilha. FK existe para garantir integridade de relação VIVA, e a trilha
-- não registra uma relação — registra um fato histórico, que continua
-- verdadeiro depois que o outro lado deixa de existir. `paciente_id` fica
-- como valor opaco, sem constraint que propague delete.
--
-- Não guardamos hash de CPF junto. Foi considerado e descartado: o espaço de
-- CPF é pequeno o bastante (11 dígitos, e só ~10^9 válidos pelo dígito
-- verificador) para um hash sem segredo ser revertido por força bruta em
-- tempo trivial. Seria o CPF em texto puro com etapa extra, numa tabela feita
-- para durar mais que o paciente — trocaria um problema de auditoria por um
-- de LGPD. O `auth_user_id_anterior`, que já está lá, é um UUID opaco e
-- identifica a conta sem identificar a pessoa.
-- =====================================================================

alter table public.exclusoes_conta
  drop constraint if exists exclusoes_conta_paciente_id_fkey;

comment on column public.exclusoes_conta.paciente_id is
  'ID do paciente no momento da exclusão. DELIBERADAMENTE sem foreign key: '
  'a trilha registra um fato histórico e precisa sobreviver ao delete da '
  'linha de pacientes. Ver o cabeçalho de 20260803120000.';

-- O índice continua valendo: a consulta "houve exclusão para este paciente?"
-- é a que a trilha responde, e o trigger de identidade depende dela.
create index if not exists idx_exclusoes_conta_paciente
  on public.exclusoes_conta (paciente_id);
