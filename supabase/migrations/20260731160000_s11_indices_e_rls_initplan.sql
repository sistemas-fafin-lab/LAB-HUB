-- Migration: índices de cobertura de FK e RLS reavaliada uma vez por query
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-11 (performance)
--
-- Dois problemas apontados pelo advisor de performance, com pesos MUITO
-- diferentes neste projeto. Vale registrar a diferença, senão alguém no futuro
-- acha que a segunda metade desta migration acelerou alguma coisa.
--
-- 1) ÍNDICES FALTANDO — impacto real.
--    `pacientes.auth_user_id` é o lookup do `apps/api/src/middlewares/auth.ts`,
--    executado em TODA requisição autenticada. `resultados.paciente_id` é o
--    filtro de toda consulta de resultado. Nenhuma das duas colunas tinha
--    índice: `agendamentos`, `documentos` e `exam_results` ganharam o seu,
--    `pacientes` e `resultados` ficaram para trás.
--
--    Com as 8 linhas de hoje o planner vai preferir seq scan de qualquer jeito
--    — tabela pequena, ler tudo é mais barato que o índice. O ganho aparece
--    quando a base crescer, e é aí que não dá para estar sem: um seq scan por
--    request autenticado escala com o cadastro inteiro.
--
-- 2) `auth_rls_initplan` — hoje é HIGIENE, não performance.
--    O advisor avisa que `auth.uid()` é reavaliada por linha em vez de uma vez
--    por query. Verdade, mas a API fala com o banco pela service_role
--    (`apps/api/src/lib/supabase.ts`), que IGNORA RLS — e desde o S-01 nem
--    `anon` nem `authenticated` têm grant nenhum nestas tabelas. Ou seja: estas
--    policies não rodam em nenhum caminho vivo hoje. Elas são a segunda
--    barreira, a que passa a valer se alguém devolver grant ao PostgREST ou se
--    a API um dia usar o JWT do paciente.
--
--    Corrigimos mesmo assim, porque é de graça e porque a hora de a policy estar
--    certa é ANTES de ela voltar a ser o que segura o acesso — não depois.
--
-- Nada aqui muda QUEM enxerga O QUÊ: `(select auth.uid())` devolve exatamente o
-- mesmo valor que `auth.uid()`. A diferença é só o Postgres poder resolver a
-- expressão uma vez (InitPlan) em vez de por linha. Usamos `alter policy` em vez
-- de drop/create justamente para não haver janela em que a tabela fique sem
-- policy, e para preservar nome, comando e roles sem depender de os reescrevermos
-- corretamente.

-- ---------------------------------------------------------------------------
-- 1) Índices de cobertura
-- ---------------------------------------------------------------------------

create index if not exists idx_pacientes_auth_user  on public.pacientes  (auth_user_id);
create index if not exists idx_resultados_paciente  on public.resultados (paciente_id);

-- ---------------------------------------------------------------------------
-- 2) `auth.uid()` resolvida uma vez por query
-- ---------------------------------------------------------------------------

alter policy "paciente vê só o próprio perfil" on public.pacientes
  using       ((select auth.uid()) = auth_user_id)
  with check  ((select auth.uid()) = auth_user_id);

alter policy "paciente vê só seus agendamentos" on public.agendamentos
  using       (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())))
  with check  (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())));

alter policy "paciente vê só seus resultados" on public.resultados
  using       (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())))
  with check  (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())));

alter policy "paciente vê só seus documentos" on public.documentos
  using       (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())))
  with check  (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())));

alter policy "paciente vê só seus laudos" on public.exam_results
  using       (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())))
  with check  (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())));
