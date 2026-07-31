-- =====================================================================
-- P-05 — Unifica as duas funções de trigger de `atualizado_em`
-- =====================================================================
--
-- O banco tinha DUAS funções de trigger com corpo idêntico:
--
--   set_updated_at()     -> trg_agendamentos_updated    on agendamentos
--   set_atualizado_em()  -> trg_exam_results_atualizado_em on exam_results
--
-- A segunda nasceu de um engano registrado por escrito na migration
-- 20260721120000_exam_results_lis.sql: "set_updated_at() foi criada na migration
-- inicial para `agendamentos`; aqui a coluna se chama atualizado_em, então o
-- trigger precisa da sua própria função". A premissa é falsa —
-- `set_updated_at()` também atribui `new.atualizado_em`, nunca existiu coluna
-- `updated_at` neste schema. Restou manutenção dobrada para zero ganho.
--
-- Fica `set_atualizado_em()`, que é a que tem o nome do que a função faz. O
-- nome em inglês da outra é justamente o que induziu ao erro.
--
-- Confirmado em produção antes de escrever esta migration (consulta somente
-- leitura em pg_proc/pg_trigger): cada função serve exatamente UM trigger, e
-- não há uso fora dos dois acima.

-- 1. Recria a sobrevivente com `search_path` fixo.
--
--    `search_path = ''` é a recomendação do advisor do Supabase (S-10): sem
--    isso, quem controlar o search_path da sessão decide quais objetos os nomes
--    não-qualificados resolvem. Aqui o corpo só chama `now()` (pg_catalog, que
--    está sempre no caminho), então a mudança é inerte hoje — vale para o dia
--    em que o corpo crescer.
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- 2. Repõe o trigger de `agendamentos` apontando para ela.
--
--    Ordem importa: o trigger novo entra antes do drop da função antiga, e o
--    `drop trigger` + `create trigger` acontecem na mesma transação — não há
--    janela em que um UPDATE em `agendamentos` passe sem carimbar a data.
drop trigger if exists trg_agendamentos_updated on public.agendamentos;

create trigger trg_agendamentos_updated
  before update on public.agendamentos
  for each row
  execute function public.set_atualizado_em();

-- 3. Só então a duplicata sai.
--
--    Sem `cascade`: se algum trigger fora deste repositório ainda depender dela
--    (o P-04 registra que as migrations não são a fonte da verdade), o drop
--    falha e a migration inteira volta atrás — melhor que derrubar em silêncio
--    o carimbo de data de uma tabela que ninguém mapeou.
drop function if exists public.set_updated_at();
