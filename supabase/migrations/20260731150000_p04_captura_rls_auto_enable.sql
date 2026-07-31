-- Migration: traz para o repositório os objetos que só existiam no banco
-- Ref.: docs/AUDITORIA_SEGURANCA.md § P-04 (migrations não refletem o banco) e § S-07
--
-- POR QUE ESTA MIGRATION EXISTE
-- `rls_auto_enable()` e o event trigger `ensure_rls` estão em produção desde
-- antes deste repositório: vieram do painel do Supabase, não de migration
-- nenhuma. Consequência prática do P-04: recriar o ambiente do zero a partir de
-- `supabase/migrations/` produzia um banco SEM esta proteção — e ela é justamente
-- a que faz toda tabela nova nascer com RLS habilitado. O ambiente recriado seria
-- mais frouxo que produção exatamente no ponto que o S-01 tratou.
--
-- O DDL abaixo foi extraído do catálogo do banco de produção em 31/07/2026
-- (`pg_get_functiondef` + `pg_event_trigger`), não reescrito de memória.
--
-- ⚠️ `create event trigger` exige papel com privilégio de superusuário. No
-- ambiente local (`supabase start`) isso vale e a migration roda inteira. Contra
-- um projeto hospedado, o `postgres` do CLI pode não ter esse direito — e é por
-- isso que esta migration nasce marcada como JÁ APLICADA no ledger de produção
-- (ver o registro do P-04): lá os dois objetos já existem, e não há o que aplicar.
--
-- Sobre o S-07: o achado era `rls_auto_enable()` ser SECURITY DEFINER e estar
-- exposta em /rest/v1/rpc/ para `anon`. Isso já foi fechado em 20260730120000
-- (`revoke execute ... from public`), e o `revoke` é repetido no fim daqui para
-- que um ambiente recriado não volte a nascer com o buraco aberto. Mantemos o
-- SECURITY DEFINER porque a função precisa dele para alterar tabela de terceiro
-- — o que a torna segura é não ser executável por quem não deve.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- Fecha o EXECUTE herdado do pseudo-role PUBLIC, que `anon` e `authenticated`
-- herdam — sem isto o PostgREST publica a função em /rest/v1/rpc/ (S-07).
revoke execute on function public.rls_auto_enable() from public;
