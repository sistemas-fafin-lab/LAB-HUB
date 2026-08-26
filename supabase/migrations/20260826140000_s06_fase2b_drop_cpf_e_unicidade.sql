-- S-06 fase 2b, ticket 04 — o drop: `pacientes.cpf` em claro sai, `cpf_hash`
-- assume a unicidade definitiva.
--
-- Fecha a coreografia começada em `20260826120000` (escrita dupla) e cortada
-- em `20260826130000` (fim da escrita em claro): a partir daqui `cpf_hash` é a
-- ÚNICA fonte de busca e unicidade de CPF em `pacientes` — exatamente o que o
-- comentário de `20260826130000:37-48` já anunciava que ficaria para aqui.
--
-- PRECONDIÇÃO, MESMO ESPÍRITO DE `20260804160000`
-- `backfillCripto.ts#verificarBackfill()` precisa confirmar zero linhas de
-- `pacientes` com `cpf_hash` nulo em todo ambiente onde isto sobe. Depois do
-- corte do ticket 03 nenhuma escrita nova deveria deixar essa lacuna (a
-- escrita falha fechada sem `CPF_HASH_KEY`), mas o guard abaixo confere de
-- qualquer jeito, no MESMO batch do `set not null` — se disparar, nada foi
-- alterado ainda (transação implícita de migration multi-statement).
--
-- O QUE MAIS PRECISAVA MUDAR JUNTO, E POR QUÊ
-- Dropar a coluna não é só "apagar uma linha do CREATE TABLE". Duas peças do
-- S-01/S-08 (auditoria § S-01, § S-08) leem `pacientes.cpf` dentro do próprio
-- Postgres, fora do alcance do "não sobra referência no código da API":
--
--   1. `pacientes_bloqueia_troca_identidade()` (o trigger de identidade, na
--      versão mais recente em `20260731170000`) compara `new.cpf`/`old.cpf` a
--      cada UPDATE de QUALQUER linha de `pacientes` — inclusive `PUT
--      /pacientes/me`, que nunca toca CPF. Sem ajuste, a primeira atualização
--      de paciente depois deste DROP quebraria com "record new has no field
--      cpf", parando o portal inteiro, não só a correção de identidade.
--      Ajuste: o ramo de CPF sai do trigger. Não é perda de proteção — desde
--      o ticket 03 `cpf` nunca mais é escrito (nasce sempre nulo), então
--      `new.cpf is not distinct from old.cpf` já dava sempre verdade para
--      toda linha criada depois do corte; o ramo já era morto. `data_
--      nascimento` continua sendo a única coisa que o trigger ainda trava.
--   2. `corrigir_identidade_paciente()` lê `v_pac.cpf` (checagem de "nada a
--      corrigir") e faz `where cpf = p_cpf_novo` (pré-checagem amigável de
--      conflito) — exatamente os dois pontos que o comentário de
--      `20260826130000:29-35` já apontava como pendentes para este ticket.
--      Os dois viram comparação por `cpf_hash`, que exige receber o hash do
--      CPF novo DENTRO da transação — daí o parâmetro `p_cpf_hash_novo`, que
--      `routes/integracao.ts` já calcula com `hashCpf()` antes de chamar a
--      RPC (mesmo padrão do ticket 03 para `cpf_enc`).
--
-- E A TRILHA DE AUDITORIA (`correcoes_identidade.cpf_anterior`)?
-- Também lia `v_pac.cpf`. Sem a coluna, a RPC não tem como saber o CPF
-- anterior em claro — e não tem como decifrar `cpf_enc` sozinha, porque a
-- chave de cifra mora fora do banco (§ S-06, cabeçalho de crypto.ts). Por
-- isso `p_cpf_anterior_texto`: a API decifra o `cpf_enc` ATUAL do paciente
-- (ainda o valor antigo, porque o UPDATE de `cpf_hash`/`cpf_enc` só acontece
-- DEPOIS da RPC voltar, no mesmo ponto onde já acontecia desde o ticket 03) e
-- passa o texto pronto. A trilha continua com o CPF anterior em claro, sem
-- que nenhuma função SQL precise da chave. `cpfAnterior` sai do retorno da
-- RPC — a API já tem o valor decifrado antes de chamá-la, devolvê-lo de volta
-- seria eco.
--
-- O exists() de correcoes_identidade dentro do TRIGGER (que confirma "esta
-- correção autorizou exatamente esta troca") também perde a comparação por
-- CPF — ficaria comparando texto em claro com texto em claro sem problema,
-- mas o ramo de CPF já saiu do trigger no item 1 acima, então a comparação
-- nunca chega a rodar. `paciente_id` + data de nascimento nova/antiga
-- continuam garantindo que só uma correção autorizada NESTA transação libera
-- o UPDATE.

-- =====================================================================
-- 1. Guard — mesmo padrão de `20260804160000`: confere antes de dropar
-- =====================================================================

do $$
declare
  v_pendentes integer;
begin
  select count(*) into v_pendentes
    from public.pacientes
   where cpf_hash is null;

  if v_pendentes > 0 then
    raise exception
      'Drop de pacientes.cpf abortado: % linha(s) sem cpf_hash — rode backfillCripto.ts e '
      'confirme verificarBackfill() = 0 antes de reaplicar esta migration', v_pendentes;
  end if;
end $$;

-- =====================================================================
-- 2. O drop e a unicidade definitiva
--    `drop column cpf` leva junto, sem CASCADE, as duas constraints de coluna
--    única que só dependem dela (`pacientes_cpf_key`, `pacientes_cpf_check`)
--    — nenhuma das duas é referenciada por mais nada.
-- =====================================================================

alter table public.pacientes drop column cpf;

alter table public.pacientes alter column cpf_hash set not null;

comment on column public.pacientes.cpf_hash is
  'Índice cego do CPF: HMAC-SHA256 determinístico (chave CPF_HASH_KEY, fora do banco, '
  'NUNCA reaproveitada de PII_KEY_*), em base64. Fonte DEFINITIVA de busca e unicidade de '
  'CPF em pacientes — a coluna em claro foi dropada (S-06 fase 2b, ticket 04). Nunca '
  'exposto ao cliente. Ver § S-06 fase 2b.';

-- =====================================================================
-- 3. Trigger de identidade — o ramo de CPF sai, data_nascimento continua
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

  -- CPF saiu da checagem (S-06, ticket 04): a coluna em claro foi dropada e não
  -- há mais NEW/OLD para comparar. Sem perda de proteção real — desde o ticket
  -- 03 nenhum código escreve `cpf` (nasce sempre nulo), então
  -- `new.cpf is not distinct from old.cpf` já dava sempre verdade para toda
  -- linha criada depois do corte; este ramo já era código morto.
  -- `data_nascimento` é a única coisa que o trigger ainda trava.
  --
  -- LACUNA CONHECIDA, HERDADA DO TICKET 03, NÃO DESTE DROP: um UPDATE que
  -- troque só `cpf_hash`/`cpf_enc` (sem tocar `data_nascimento`) passa direto
  -- por este early-return sem exigir `correcoes_identidade`/GUC — exatamente
  -- o padrão do UPDATE de sincronização que `routes/integracao.ts` faz LOGO
  -- APÓS a RPC retornar (fora da transação dela, de propósito, porque a RPC
  -- não escreve cpf_hash/cpf_enc — ver 20260826130000). Fechar isso exigiria
  -- a RPC também escrever cpf_hash/cpf_enc na MESMA transação (redesenho do
  -- ticket 03, fora do escopo deste). Hoje o único código que faz esse UPDATE
  -- é o próprio caminho já autorizado pela RPC; não há uma segunda porta de
  -- escrita de cpf_hash/cpf_enc na base de código atual.
  if new.data_nascimento is not distinct from old.data_nascimento then
    return new;
  end if;

  begin
    v_correcao := nullif(current_setting('app.correcao_identidade', true), '')::uuid;
  exception when others then
    v_correcao := null;
  end;

  -- Sem `cpf_anterior`/`cpf_novo` no exists: viraram texto de auditoria puro,
  -- gravado pela RPC a partir do que a API já decifrou/calculou — comparar
  -- contra eles aqui exigiria decifrar dentro do Postgres, que não tem a chave
  -- (§ S-06). A garantia que importa — "só passa se corrigir_identidade_
  -- paciente() rodou nesta transação, para ESTE paciente, PARA ESTA troca de
  -- nascimento" — continua de pé com paciente_id + data nova/antiga.
  if v_correcao is null or not exists (
    select 1
      from public.correcoes_identidade c
     where c.id                  = v_correcao
       and c.paciente_id         = old.id
       and c.nascimento_anterior = old.data_nascimento
       and c.nascimento_novo     = new.data_nascimento
  ) then
    raise exception
      'Data de nascimento é imutável após a vinculação da conta; use corrigir_identidade_paciente()'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- =====================================================================
-- 4. RPC de correção — pré-checagens migram para cpf_hash; a trilha ganha o
--    CPF anterior já decifrado pela API (a chave não existe no banco)
-- =====================================================================

drop function if exists public.corrigir_identidade_paciente(uuid, text, date, text, text, text);

create function public.corrigir_identidade_paciente(
  p_paciente_id         uuid,
  p_cpf_novo            text,
  p_cpf_hash_novo       text,
  p_cpf_anterior_texto  text,
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
  -- sem isso, as duas leriam o mesmo estado e a trilha ficaria mentindo.
  select * into v_pac from public.pacientes where id = p_paciente_id for update;
  if not found then
    raise exception 'Paciente não encontrado' using errcode = 'P0002';
  end if;

  -- (Aqui ficava a recusa de paciente sem conta. Ver 20260731140000: desde
  -- aquela migration, corrigir_identidade_paciente() também atende o
  -- "fantasma" sem auth_user_id — reintroduzir essa recusa aqui quebraria de
  -- novo a correção de CPF do paciente ainda não reivindicado.)

  -- Era `v_pac.cpf = p_cpf_novo`; sem a coluna em claro, cpf_hash é quem sabe
  -- responder "é o mesmo CPF" (ticket 04, ver cabeçalho desta migration).
  if v_pac.cpf_hash = p_cpf_hash_novo and v_pac.data_nascimento = p_nascimento_novo then
    raise exception 'Nada a corrigir: CPF e data de nascimento já são estes'
      using errcode = '22023';
  end if;

  -- Checagem antecipada só para dar erro legível; a garantia real continua
  -- sendo o UNIQUE de pacientes.cpf_hash. Dois cadastros com o mesmo CPF não
  -- são caso de correção e sim de FUSÃO — que mexe em agendamentos e
  -- documentos e por isso não acontece aqui.
  if exists (
    select 1 from public.pacientes
     where cpf_hash = p_cpf_hash_novo and id <> p_paciente_id
  ) then
    raise exception 'CPF já pertence a outro cadastro; este caso é de fusão, não de correção'
      using errcode = '23505';
  end if;

  -- `p_cpf_anterior_texto`, não `v_pac.cpf`: a API decifrou o `cpf_enc` atual
  -- ANTES de chamar esta RPC (ver rota `integracao.ts`) porque a chave de
  -- cifra não existe aqui dentro. `cpf_novo` continua vindo direto do
  -- parâmetro, como sempre — nunca dependeu da coluna em claro.
  insert into public.correcoes_identidade (
    paciente_id, cpf_anterior, cpf_novo,
    nascimento_anterior, nascimento_novo,
    motivo, autorizado_por, documento_conferido
  ) values (
    p_paciente_id, p_cpf_anterior_texto, p_cpf_novo,
    v_pac.data_nascimento, p_nascimento_novo,
    btrim(p_motivo), btrim(p_autorizado_por), btrim(p_documento_conferido)
  ) returning * into v_correcao;

  -- Abre a exceção do trigger para ESTA correção e só até o fim da transação
  -- (o `true` de set_config é o `set local`).
  perform set_config('app.correcao_identidade', v_correcao.id::text, true);

  -- cpf_hash/cpf_enc do CPF novo continuam FORA daqui, de propósito (ticket
  -- 03): a API os grava logo depois desta RPC voltar (routes/integracao.ts) —
  -- a chave de hash/cifra nunca entra no banco.
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
  delete from public.exam_results where paciente_id = p_paciente_id;
  get diagnostics v_laudos = row_count;

  -- Sem `cpfAnterior`: a API já tinha o valor decifrado antes de chamar esta
  -- RPC (é de lá que vem `p_cpf_anterior_texto`) — devolvê-lo de volta seria
  -- eco, não informação nova.
  return jsonb_build_object(
    'correcaoId',           v_correcao.id,
    'pacienteId',           p_paciente_id,
    'laudosInvalidados',    v_laudos,
    'corrigidoEm',          v_correcao.criado_em
  );
end;
$$;

-- Só a API (service_role) chama. Fecha o PUBLIC herdado, como sempre.
revoke execute on function public.corrigir_identidade_paciente(
  uuid, text, text, text, date, text, text, text
) from public, anon, authenticated;
grant execute on function public.corrigir_identidade_paciente(
  uuid, text, text, text, date, text, text, text
) to service_role;

-- =====================================================================
-- 5. Como validar depois de aplicar
-- =====================================================================
--   select * from public.pacientes limit 1;
--     -- não deve existir coluna `cpf` no resultado, só `cpf_hash`/`cpf_enc`
--
--   update public.pacientes set nome = nome where id = '<qualquer id>';
--     -- deve PASSAR (PUT /pacientes/me não toca identidade) — é o teste que
--     -- prova que o ajuste do trigger não quebrou o caminho comum
--
--   select public.corrigir_identidade_paciente(
--     '<paciente_id>', '<cpf 11 dígitos>', '<hash do cpf novo>',
--     '<cpf anterior em claro>', '<YYYY-MM-DD>',
--     'CPF digitado errado no balcão', 'recepcao.ana', 'RG');
--   select * from public.correcoes_identidade order by criado_em desc limit 1;
