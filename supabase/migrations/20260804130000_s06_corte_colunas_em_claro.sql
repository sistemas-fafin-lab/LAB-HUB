-- =====================================================================
-- S-06 — o corte: as colunas em claro deixam de ser obrigatórias
--
-- Este é o passo 1 de 3 do que finalmente faz a criptografia PROTEGER alguma
-- coisa. As fases 1 (03/08) e 2a (04/08) cifraram o dado e deixaram o texto puro
-- ao lado, ainda escrito a cada inserção — de propósito, é o que tornava os
-- deploys reversíveis. O efeito colateral é que até hoje um `pg_dump` entrega
-- tudo em claro, cifra ou não. Conferido em 04/08: `resultados.resumo` tinha 2
-- linhas em claro ao lado das 2 cifradas.
--
--   1. ESTA migration       — as colunas em claro viram anuláveis
--   2. deploy do código     — para de escrever nelas
--   3. migration do drop    — as colunas somem  ← só aqui a proteção existe
--
-- O passo 3 é irreversível e fica para depois de observar produção alguns dias.
-- Entre o 2 e o 3 as linhas ANTIGAS continuam em claro; só as novas nascem
-- limpas.
--
-- SETE COLUNAS, E NÃO OITO
--
-- `resultados.exame_nome` fica de fora: ele ainda participa de
-- `uq_resultado_agendamento_exame`, e unicidade não existe sobre coluna cifrada
-- com IV aleatório. Ele sai junto da migration `20260804140000` (a troca para o
-- `exame_flowlab_id`), que por sua vez espera o deploy do FlowLab. Nenhuma das
-- outras sete depende disso — foi por isso que este bloco veio primeiro.
--
-- POR QUE ANULÁVEL É UM PASSO SEPARADO DO DROP
--
-- Quatro destas colunas são NOT NULL. Se o código parasse de escrevê-las antes
-- desta migration, TODA inserção falharia — laudo do LIS, resultado do FlowLab e
-- upload de documento, os três de uma vez. Anular primeiro é o que torna o
-- passo 2 um deploy comum, e não uma janela de manutenção.
--
-- E o inverso também importa: esta migration sozinha não muda comportamento
-- nenhum. O código ainda preenche as sete, então ela pode ser aplicada com o
-- build atual no ar, sem pressa para o passo 2.
--
-- A CONTRAPARTIDA, que passa a valer no passo 3
--
-- Sem a coluna em claro, a chave É o dado. Perder `PII_KEY_K1` deixa de ser
-- incidente e vira perda irreversível de resultado clínico. Ela precisa de cópia
-- em cofre SEPARADO de onde o banco vive — é custódia de chave, assunto
-- diferente do backup do banco.
-- =====================================================================

-- `resultados.paineis` — os marcadores medidos (fase 1).
-- O default some junto: sem ele, uma inserção que não cite a coluna gravaria
-- '[]' em claro e a linha ficaria com painel vazio em claro E painel cheio
-- cifrado. Divergência silenciosa entre as duas cópias é pior que qualquer uma
-- das duas.
alter table public.resultados alter column paineis drop not null;
alter table public.resultados alter column paineis drop default;

-- `documentos.nome_arquivo` — o nome descreve o documento (fase 2a).
alter table public.documentos alter column nome_arquivo drop not null;

-- `exam_results.cpf` — a segunda cópia do CPF fora de `pacientes` (fase 2a).
alter table public.exam_results alter column cpf drop not null;

-- As outras três do bloco já eram anuláveis e não precisam de DDL nenhuma;
-- ficam listadas para a próxima migration (o drop) não ter de redescobrir quais
-- são:
--   resultados.resumo        (fase 1)
--   resultados.categoria     (fase 2a)
--   agendamentos.exames      (fase 2a)
--   exam_results.result      (fase 1 — o laudo completo, a coluna de maior
--                             valor de todo o S-06)
