-- S-06 fase 2a — cifra o RÓTULO, não só o valor.
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-06
--
-- O QUE A FASE 1 DEIXOU PASSAR
-- 20260803130000 cifrou o conteúdo do exame (`exam_results.result`,
-- `resultados.paineis`, `resultados.resumo`) e deixou o NOME do exame em claro.
-- Em produção isso é, literalmente:
--
--   pacientes.nome            resultados.exame_nome
--   "<nome do paciente>"  →   "TESTE RÁPIDO COMBO — COVID-19 / INFLUENZA A E B"
--
-- Um join de uma linha. Para dado de saúde o rótulo costuma ser a revelação
-- inteira: Beta-HCG diz gravidez, carga viral diz o diagnóstico, e nenhum dos
-- dois precisa do número medido para contar a história. Cifrar o valor e deixar
-- a etiqueta é trancar o cofre com a etiqueta colada na porta.
--
-- Mesma situação, pelo mesmo motivo:
--   * `agendamentos.exames`      — a mesma revelação, antes da coleta;
--   * `documentos.nome_arquivo`  — "pedido_medico_hemograma.pdf" conta igual;
--   * `exam_results.cpf`         — SEGUNDA cópia do CPF fora de `pacientes`.
--     Cifrar `pacientes.cpf` (fase 2b) e deixar esta coluna não protegeria nada:
--     o CPF continuaria no dump, ligado ao mesmo `paciente_id`.
--
-- POR QUE ESTAS COLUNAS E NÃO `pacientes.nome`
-- Nenhuma delas é filtrada, ordenada ou comparada em SQL — foi conferido antes
-- de escrever esta migration:
--   * a busca "por nome ou categoria" da tela de resultados é filtro NO CLIENTE
--     (apps/web ResultsPage), sobre a lista que a API já devolveu decifrada;
--   * `exam_results.cpf` é comparado em JS por dígitos (`conferirCpf`), nunca
--     com `.eq` no SQL — está escrito em laudos/repository.ts e é anterior a
--     este trabalho.
-- Então cifrar aqui não quebra consulta nenhuma e não pede blind index.
-- `pacientes.nome` é o oposto: sustenta o typeahead da recepção (`ilike`), e a
-- decisão registrada foi mantê-lo em claro — identificar a pessoa certa no
-- balcão é controle de segurança do paciente, e degradá-lo troca um risco
-- hipotético de dump por um risco diário de trocar laudo entre pessoas.
--
-- MESMO PADRÃO DA FASE 1, DE PROPÓSITO
-- Só ACRESCENTA coluna. A API passa a escrever nas duas e a ler da cifrada
-- quando existir; enquanto convivem, voltar o deploy reverte sem perder dado.
--
-- E O QUE ISSO IMPLICA, DITO SEM MEIA-VOLTA: enquanto a coluna em claro
-- continuar preenchida, o dump continua entregando tudo. A proteção só existe
-- de fato na migration que PARA de escrever em claro e derruba as colunas — a
-- etapa definitiva, que vale para esta fase e para a fase 1, que ainda não a
-- fez. Ver o bloco final deste arquivo.

alter table public.resultados    add column if not exists exame_nome_enc   text;
alter table public.resultados    add column if not exists categoria_enc    text;
alter table public.agendamentos  add column if not exists exames_enc       text;
alter table public.documentos    add column if not exists nome_arquivo_enc text;
alter table public.exam_results  add column if not exists cpf_enc          text;

comment on column public.resultados.exame_nome_enc is
  'Nome do exame cifrado (AES-256-GCM, envelope v1:<keyId>:<iv>:<tag>:<ct>). AAD = resultados:exame_nome:<id>. '
  'O rótulo é dado de saúde por si só — ver § S-06 fase 2a.';

comment on column public.resultados.categoria_enc is
  'Categoria do exame cifrada. AAD = resultados:categoria:<id>. Ver § S-06.';

comment on column public.agendamentos.exames_enc is
  'Snapshot dos exames da coleta (JSON) cifrado. AAD = agendamentos:exames:<id>. Ver § S-06.';

comment on column public.documentos.nome_arquivo_enc is
  'Nome do arquivo enviado, cifrado — o nome descreve o documento (pedido médico, carteirinha). '
  'AAD = documentos:nome_arquivo:<id>. Ver § S-06.';

comment on column public.exam_results.cpf_enc is
  'CPF usado para consultar o LIS, cifrado. Comparado em JS por dígitos, nunca em SQL. '
  'AAD = exam_results:cpf:<id>. Ver § S-06.';

-- =====================================================================
-- O QUE PRECISA SER RESOLVIDO ANTES DE DERRUBAR AS COLUNAS EM CLARO
-- =====================================================================
-- Uma dependência que as colunas da fase 1 não tinham:
--
--   uq_resultado_agendamento_exame  UNIQUE (agendamento_id, exame_nome)
--
-- É ela que torna o webhook de resultado idempotente: o FlowLab entrega
-- at-least-once, a reentrega bate no 23505 e a rota responde 200 em vez de
-- gravar o mesmo exame duas vezes. Sobre coluna cifrada essa unicidade não
-- existe — cada envelope tem IV próprio, então o mesmo exame gera valores
-- diferentes e a constraint deixa de barrar qualquer coisa. Derrubar
-- `exame_nome` sem substituir a chave transforma cada reentrega num resultado
-- duplicado na tela do paciente.
--
-- Dois caminhos, e a escolha não é para esta migration:
--
--   (a) `exame_flowlab_id` — a coluna JÁ EXISTE nesta tabela e está sem uso; o
--       payload do webhook não a envia. Se o FlowLab passar a mandar o id do
--       exame, a unicidade vira (agendamento_id, exame_flowlab_id): opaca, não
--       revela nada e não precisa de cifra. É a saída limpa, e depende deles.
--
--   (b) Índice cego com HMAC, no formato hmac(chave, agendamento_id || nome).
--       Incluir o `agendamento_id` NA MENSAGEM não é detalhe: sem ele, o mesmo
--       exame teria o mesmo hash na base inteira e a contagem por hash
--       entregaria o catálogo por análise de frequência (o exame mais repetido
--       de um laboratório não é difícil de adivinhar). Com ele, o que resta
--       visível é "dois exames iguais na MESMA coleta" — exatamente o que a
--       unicidade proíbe. Custo conhecido: índice cego não acompanha rotação de
--       chave, então rotacionar exige recalcular a coluna toda no mesmo passo.
