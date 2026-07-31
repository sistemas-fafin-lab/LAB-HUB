-- Migration: a correção de identidade passa a aceitar paciente SEM conta vinculada
-- Ref.: docs/AUDITORIA_SEGURANCA.md § P-01, § S-08 e o registro de 31/07/2026
--
-- O QUE ESTAVA ERRADO
-- A versão de 20260730130000 recusava paciente com `auth_user_id is null`:
--
--   'Paciente ainda não vinculado a uma conta: corrija direto no cadastro'
--
-- O raciocínio era defensável no papel — para o fantasma o trigger de identidade
-- não trava nada, então a correção não precisaria da saída de emergência. O que
-- não foi verificado é se "direto no cadastro" existia. Não existe: o FlowLab não
-- tem nenhuma tela que edite paciente, e o canal de integração do LAB-HUB não tem
-- rota de UPDATE de paciente. A mensagem mandava o operador para lugar nenhum.
--
-- E o caso recusado é a MAIORIA: em 31/07/2026, 6 dos 8 pacientes da base não
-- têm conta — são cadastros de balcão, justamente os mais sujeitos a CPF digitado
-- errado. A tela de correção cobria 2 de 8, e não os que doem.
--
-- POR QUE A MESMA CERIMÔNIA, E NÃO UMA EDIÇÃO SIMPLES
-- Trocar o CPF de um fantasma não é operação menor que trocar o de quem já tem
-- conta — é a mesma operação um passo antes. O CPF do fantasma é o que decide
-- QUEM vai poder reivindicar aquele registro no cadastro (P-01): mudá-lo entrega
-- o histórico daquela pessoa para outra, e não sobra rastro de quem mandou. Por
-- isso a exigência de motivo, documento conferido e trilha vale para os dois.
--
-- O QUE MUDA AQUI
-- Só a remoção daquela recusa. Todo o resto da função é idêntico: validação do
-- CPF, `for update`, "nada a corrigir", conflito de CPF (fusão), trilha
-- append-only, GUC de autorização, expurgo do cache de laudos.
--
-- O trigger NÃO muda e não precisa mudar: para `old.auth_user_id is null` ele já
-- devolve `new` na primeira linha. A GUC continua sendo definida nos dois casos
-- de propósito — um caminho só é um caminho a menos para divergir, e no dia em
-- que o trigger passar a cobrir o fantasma isto aqui já está correto.

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

  -- (Aqui ficava a recusa de paciente sem conta. Ver o cabeçalho.)

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
  --
  -- Para o fantasma isto normalmente apaga 0 linhas (só quem tem conta chega a
  -- GET /laudos), mas segue incondicional: a linha pode ter sido criada por
  -- outro caminho, e apagar de menos aqui é servir laudo alheio depois.
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

-- `create or replace` preserva os grants da 20260730130000 (revoke de public/anon/
-- authenticated, grant para service_role). Repetidos aqui assim mesmo: se algum
-- dia esta migration rodar num banco novo antes daquela, o default do PUBLIC não
-- pode sobrar.
revoke execute on function public.corrigir_identidade_paciente(uuid, text, date, text, text, text)
  from public, anon, authenticated;
grant execute on function public.corrigir_identidade_paciente(uuid, text, date, text, text, text)
  to service_role;
