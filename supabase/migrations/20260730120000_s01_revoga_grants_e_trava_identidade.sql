-- Migration: S-01 — fecha a escrita de `anon`/`authenticated` no schema public
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-01 (CRÍTICO)
--
-- PROBLEMA
-- As 5 tabelas de domínio nasceram com o grant padrão do Supabase
-- (`{anon,authenticated}=arwdDxtm`), ou seja INSERT/UPDATE/DELETE/TRUNCATE para
-- qualquer portador da anon key — que está no bundle do browser, como deve estar.
-- A RLS não segura isso: ela restringe QUAIS LINHAS, nunca QUAIS COLUNAS. Um
-- paciente logado satisfaz o `with check` ao editar a própria linha, inclusive
-- editando o `cpf`. Cadeia completa:
--
--   1. supabase.from('pacientes').update({ cpf: '<CPF da vítima>' })   -- passa na RLS
--   2. GET /api/v1/laudos?refresh=true
--   3. routes/laudos.ts lê o CPF DO BANCO (o desenho está certo: o CPF nunca vem
--      do cliente) e consulta os LIS — com o CPF que o atacante acabou de plantar
--   4. conferirCpf() compara token × laudo e BATE, porque o CPF de origem mudou
--
-- Resultado: histórico clínico de qualquer pessoa a partir de um CPF.
--
-- POR QUE O REVOKE É SEGURO
-- Nenhum front-end acessa tabela direto: não há um único `.from()`, `.rpc()`,
-- `.storage` ou `.channel()` em apps/web/src nem em apps/mobile/src — o único
-- uso do cliente anon é `supabase.auth.*`. Toda leitura de dado passa pela API
-- com service_role, que NÃO é afetada por este arquivo (o service_role mantém
-- todos os privilégios). Logo estes grants não servem a nada hoje.

-- =====================================================================
-- 1. Revoga os privilégios existentes
--    O service_role e o postgres mantêm os seus (não são citados aqui).
-- =====================================================================

revoke all privileges on all tables    in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- `revoke ... from anon, authenticated` NÃO remove o grant ao pseudo-role
-- PUBLIC, que anon e authenticated herdam. As 3 funções do schema têm
-- `=X/postgres` (EXECUTE para PUBLIC), então é preciso revogar à parte.
--
-- Fazemos isso só em rls_auto_enable(), que é a única SECURITY DEFINER e está
-- exposta em /rest/v1/rpc/ (ver S-07). set_updated_at() e set_atualizado_em()
-- ficam como estão de propósito: retornam `trigger`, e o PostgREST não expõe
-- função de trigger como RPC — não há superfície a fechar, e mexer no ACL
-- delas é risco desnecessário no caminho de DML.
revoke execute on function public.rls_auto_enable() from public;

-- =====================================================================
-- 2. Impede que uma tabela FUTURA nasça aberta
--    Sem isto, a próxima `create table` no schema public repete o problema.
-- =====================================================================

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- NOTA: `alter default privileges` só afeta os defaults do role que executa o
-- comando (aqui, `postgres`). Existe uma segunda entrada em pg_default_acl com
-- grantor `supabase_admin`, que não podemos alterar por não sermos membros dele.
-- Ela só se aplica a objetos criados PELO supabase_admin; as migrations rodam
-- como `postgres`, então o default acima é o que vale na prática. Se algum dia
-- uma tabela aparecer com grant para anon sem ter passado por aqui, é esse o
-- caminho — confira com a query do passo 4.

-- =====================================================================
-- 3. Trava de identidade (defesa em profundidade)
--    Mesmo com a porta do PostgREST fechada, a identidade do paciente não deve
--    mudar nem pelo caminho do service_role: é ela que amarra o registro
--    clínico. Um bug futuro numa rota passa a falhar barulhento em vez de
--    trocar o dono de um prontuário em silêncio.
-- =====================================================================

-- Sem SECURITY DEFINER de propósito: a função só lê OLD/NEW e não toca em
-- nenhuma tabela, então não precisa de privilégio elevado (e não vira mais uma
-- função privilegiada para auditar).
create or replace function public.pacientes_bloqueia_troca_identidade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Antes do claim (auth_user_id null) a linha é um "fantasma" da recepção e
  -- ainda pode ser corrigida — inclusive pelo UPDATE de POST /cadastro, que é
  -- justamente quem preenche o auth_user_id. Depois do claim, congela.
  if old.auth_user_id is not null then
    if new.cpf is distinct from old.cpf then
      raise exception 'CPF é imutável após a vinculação da conta';
    end if;
    if new.data_nascimento is distinct from old.data_nascimento then
      raise exception 'Data de nascimento é imutável após a vinculação da conta';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Vínculo de conta é imutável';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pacientes_identidade on public.pacientes;

create trigger trg_pacientes_identidade
  before update on public.pacientes
  for each row
  execute function public.pacientes_bloqueia_troca_identidade();

-- Compatibilidade conferida com as únicas rotas que dão UPDATE em `pacientes`:
--   - routes/cadastro.ts     → old.auth_user_id É null no claim; passa.
--   - routes/pacientes.ts    → PUT /pacientes/me altera só nome, telefone e
--                              convenio_*; passa.
-- routes/integracao.ts só faz select/insert. Correção de dado errado após o
-- claim passa a exigir intervenção administrativa — que é o ponto.

-- =====================================================================
-- 4. Como validar depois de aplicar
-- =====================================================================
--
--   select has_table_privilege('authenticated', 'public.pacientes', 'UPDATE');  -- false
--   select has_table_privilege('anon',          'public.pacientes', 'SELECT');  -- false
--   select has_table_privilege('service_role',  'public.pacientes', 'UPDATE');  -- true
--
--   select relname, relacl from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r';   -- sem anon= / authenticated=
--
-- As policies de RLS ficam como estão: defesa em profundidade custa zero aqui.
-- Se um dia o front precisar ler direto, conceda só `select` nas colunas
-- necessárias e troque as policies `for all` por `for select`.
