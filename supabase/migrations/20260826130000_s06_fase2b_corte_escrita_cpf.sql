-- S-06 fase 2b, ticket 03 — o corte: `pacientes.cpf` em claro deixa de ser
-- escrito.
--
-- Mesmo padrão de `20260804130000_s06_corte_colunas_em_claro.sql`: a coluna em
-- claro fica anulável AGORA, e só depois o deploy do código para de escrevê-la.
-- A ordem importa pelo mesmo motivo de lá — se o código parasse de gravar `cpf`
-- antes desta migration, toda inserção de paciente falharia contra o `not null`
-- ainda de pé (cadastro público e o find-or-create da recepção, os dois).
--
-- PRECONDIÇÃO, IGUAL À DE 04/08: verificarBackfill() (apps/api/src/lib/
-- backfillCripto.ts) precisa confirmar zero linhas de `pacientes` com `cpf`
-- preenchido e `cpf_hash`/`cpf_enc` nulos em todo ambiente onde isto sobe. Sem
-- isso, uma linha ainda não migrada perde a única forma que a busca (ticket 02)
-- consegue ler — ela já não lê `cpf`, e passaria a não ter `cpf_hash` para ler
-- no lugar.
--
-- POR QUE A RPC DE CORREÇÃO TAMBÉM MUDA AQUI
-- `corrigir_identidade_paciente` (20260730130000) grava `cpf` diretamente em
-- SQL — é o único outro caminho de escrita da coluna, além dos dois INSERTs da
-- API. Ela PARA de gravar `cpf`; `data_nascimento` continua. `cpf_hash`/
-- `cpf_enc` do CPF novo passam a ser gravados pela API logo após a RPC voltar
-- (routes/integracao.ts), não pela função — a chave de hash/cifra nunca entra
-- no banco (§ S-06, cabeçalho de crypto.ts), então a RPC não tem como calculá-
-- los. A API agora calcula os dois ANTES de chamar a RPC (com as variantes que
-- falham fechado, não as tolerantes) — se faltar `CPF_HASH_KEY`/`PII_KEY_K1`,
-- a correção falha ali, e a RPC nem chega a rodar: nenhuma trilha, nenhuma
-- invalidação de cache, nenhuma escrita.
--
-- O que NÃO muda aqui, de propósito: a leitura de `v_pac.cpf` (checagem de
-- "nada a corrigir") e o `exists (... where cpf = p_cpf_novo ...)` (checagem
-- antecipada de conflito, só para dar erro legível dentro da própria RPC).
-- Ambos continuam contra a coluna em claro, e vão ficando cegos para pacientes
-- pós-corte (sem `cpf`) — mover ESSA pré-checagem para `cpf_hash` (o que exige
-- passá-lo para dentro da transação da RPC) é o ticket 04. A pré-checagem
-- nunca foi a garantia real, só a mensagem de erro amigável — quem é.
--
-- POR QUE `cpf_hash` GANHA UNIQUE JÁ, E NÃO SÓ NO TICKET 04
-- A garantia real sempre foi essa: o constraint do banco. E é exatamente ela
-- que este corte, sozinho, aposentaria sem substituto — a partir daqui todo
-- paciente novo nasce com `cpf` sempre nulo, e `unique(cpf)` (20260626120000)
-- nunca rejeita dois NULLs entre si. Duas requisições concorrentes para o
-- MESMO CPF real (POST /cadastro, o find-or-create da recepção) passariam a
-- inserir duas linhas para a mesma pessoa sem erro nenhum — os `.code ===
-- '23505'` que cadastro.ts e integracao.ts já sabem tratar ficariam mortos
-- justamente quando mais precisam disparar. Não dá para esperar o ticket 04
-- (que ainda depende do drop de `cpf` e da limpeza do código de escrita
-- dupla) para fechar esse buraco — ele abre no instante em que este código
-- sobe, não quando aquele terminar.
--
-- Sem `not null` aqui: nenhuma linha corre risco por causa disso — `cpf_hash`
-- já é sempre gravado (a escrita falha fechada sem `CPF_HASH_KEY`, ver
-- crypto.ts), e a precondição deste corte (verificarBackfill() = 0) já exige
-- que nenhuma linha sem backfill sobreviva até aqui. `not null`, junto do
-- drop de `cpf` e da limpeza da escrita dupla, continua sendo o ticket 04 —
-- aqui entra só a parte que ESTE corte precisa para não regredir.

alter table public.pacientes alter column cpf drop not null;

alter table public.pacientes add constraint pacientes_cpf_hash_key unique (cpf_hash);

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

  -- (Aqui ficava a recusa de paciente sem conta. Ver 20260731140000.)

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

  -- S-06, ticket 03: `cpf` em claro deixou de ser gravado aqui. cpf_hash/cpf_enc
  -- do CPF novo são gravados pela API logo depois desta RPC voltar (ver o
  -- cabeçalho desta migration).
  update public.pacientes
     set data_nascimento = p_nascimento_novo
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

-- Assinatura inalterada: `create or replace` preserva os grants já aplicados
-- por 20260730130000/20260731140000. Repetidos aqui assim mesmo, pela mesma
-- razão de sempre — se esta migration algum dia rodar num banco novo antes
-- daquelas, o default do PUBLIC não pode sobrar.
revoke execute on function public.corrigir_identidade_paciente(uuid, text, date, text, text, text)
  from public, anon, authenticated;
grant execute on function public.corrigir_identidade_paciente(uuid, text, date, text, text, text)
  to service_role;
