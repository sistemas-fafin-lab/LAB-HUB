-- Migration: retenção da trilha de auditoria de acesso — 6 meses
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-08 (LGPD arts. 15/16 e 6º III)
--
-- Fecha a decisão que 20260803140000 deixou explicitamente em aberto. Aquela
-- migration criou `auditoria_acesso` append-only e anotou o impasse: o `ip` é
-- dado pessoal e guardar a trilha para sempre troca um problema de auditoria por
-- um de minimização — mas o DELETE está revogado do service_role justamente
-- porque apagar linha de trilha é o privilégio que a tabela existe para negar.
--
-- O PRAZO: 6 MESES
-- Decisão do responsável, registrada em 03/08/2026. Cobre o ciclo típico de
-- descoberta de incidente (o intervalo entre o acesso indevido e alguém
-- perceber), que é a única finalidade desta tabela. Depois disso a linha não
-- responde mais a pergunta nenhuma que já não tenha sido feita, e passa a ser
-- só um `inet` guardado sem propósito.
--
-- COMO ESTE ARQUIVO EVITA REABRIR O BURACO
-- A saída NÃO é devolver DELETE ao service_role, nem criar um segundo papel com
-- senha própria (mais uma credencial para vazar, e o cron do VPS teria de
-- carregá-la). É uma função `security definer` que apaga por um corte FIXO NO
-- CORPO:
--
--   * o corte não é parâmetro. Se fosse, uma chave de serviço comprometida
--     chamaria a função com interval '0 seconds' e a trilha inteira sumiria —
--     o mesmo estrago do DELETE que revogamos, só que por outra porta;
--   * mudar o prazo exige migration, que é o certo: 6 meses é decisão de
--     conformidade documentada, não um botão de operação;
--   * o que o service_role ganha não é "apagar da trilha", é "apagar o que já
--     venceu". Quem entrar na API hoje continua sem conseguir remover a linha
--     que registra que ele entrou — que é a propriedade toda.

-- =====================================================================
-- 1. O registro de que o expurgo aconteceu
-- =====================================================================
-- Sem isto, uma trilha com buraco é ambígua: retenção e adulteração deixam
-- exatamente a mesma marca (linhas que não estão lá). Esta tabela é o que
-- responde "sumiram porque venceram, neste dia, tantas" — e é ela que torna a
-- ausência de linhas antigas uma afirmação verificável em vez de uma lacuna.
create table if not exists public.auditoria_retencao (
  id            uuid primary key default gen_random_uuid(),
  executado_em  timestamptz not null default now(),
  corte         timestamptz not null,   -- tudo anterior a isto foi removido
  removidas     integer not null,       -- inclusive 0: a execução que não achou nada também é fato
  mais_antiga   timestamptz,            -- extremos do que saiu; null quando removidas = 0
  mais_recente  timestamptz
);

comment on table public.auditoria_retencao is
  'Execuções da retenção de auditoria_acesso (S-08). Append-only: explica os buracos da trilha.';

create index if not exists idx_auditoria_retencao_executado
  on public.auditoria_retencao (executado_em desc);

-- Mesmo tratamento da trilha que ela documenta: quem pode reescrever o registro
-- do expurgo pode forjar a explicação de um apagamento.
alter table public.auditoria_retencao enable row level security;
revoke update, delete, truncate on public.auditoria_retencao from service_role;

-- =====================================================================
-- 2. A rotina
-- =====================================================================
create or replace function public.expurgar_auditoria_acesso()
returns table (removidas integer, corte timestamptz, mais_antiga timestamptz, mais_recente timestamptz)
language plpgsql
security definer
-- search_path fixo: exigência do S-10 e, aqui, mais que higiene — sem ele o
-- caller escolheria por qual `auditoria_acesso` a função definer passa.
set search_path = public, pg_temp
as $$
declare
  -- 6 meses, no corpo e não na assinatura. Ver o cabeçalho.
  v_corte       timestamptz := now() - interval '6 months';
  v_removidas   integer;
  v_mais_antiga timestamptz;
  v_mais_recente timestamptz;
begin
  with saiu as (
    delete from public.auditoria_acesso
     where ocorrido_em < v_corte
    returning ocorrido_em
  )
  select count(*)::integer, min(ocorrido_em), max(ocorrido_em)
    into v_removidas, v_mais_antiga, v_mais_recente
    from saiu;

  -- Na mesma transação do delete, de propósito: ou a trilha perde as linhas E
  -- fica dito por quê, ou não perde nada.
  insert into public.auditoria_retencao (corte, removidas, mais_antiga, mais_recente)
  values (v_corte, v_removidas, v_mais_antiga, v_mais_recente);

  return query select v_removidas, v_corte, v_mais_antiga, v_mais_recente;
end;
$$;

comment on function public.expurgar_auditoria_acesso() is
  'Remove linhas de auditoria_acesso com mais de 6 meses e registra a execução. Corte fixo no corpo: não aceita parâmetro (S-08).';

-- Postgres concede EXECUTE a PUBLIC ao criar função. Numa `security definer`
-- isso vazaria a capacidade para `anon` — a linha abaixo não é formalidade.
revoke execute on function public.expurgar_auditoria_acesso() from public;
revoke execute on function public.expurgar_auditoria_acesso() from anon, authenticated;
grant  execute on function public.expurgar_auditoria_acesso() to service_role;
