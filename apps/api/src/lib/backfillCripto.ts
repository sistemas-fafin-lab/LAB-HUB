import type { Logger } from 'pino'
import { aadDe, cifrar, cifrarJson, criptografiaConfigurada } from './crypto.js'
import { supabase } from './supabase.js'

/**
 * Backfill da criptografia de coluna (S-06, passo 3 do plano de migração).
 *
 * Cifra o que já estava gravado em claro quando o deploy da escrita dupla subiu.
 * Linha nova não passa por aqui — ela já nasce cifrada.
 *
 * Três propriedades que fazem isto ser re-executável sem medo, e que são o
 * motivo de existir um script em vez de um `UPDATE` só:
 *
 * 1. **Idempotente.** Só toca em linha com a coluna cifrada AINDA vazia. Rodar
 *    duas vezes não re-cifra nada nem gera envelope novo.
 * 2. **Em lotes.** A base é pequena hoje, mas um `UPDATE` único que falhe no
 *    meio deixa metade migrada e nenhum registro de onde parou.
 * 3. **Não apaga o texto puro.** A coluna em claro continua lá, e é o que
 *    permite reverter o deploy a qualquer momento. Removê-la é migration
 *    própria, depois de observar produção.
 */

const LOTE = 100

export interface ResultadoBackfill {
  examResults: number
  resultados: number
  // Fase 2a — os rótulos. Contadores próprios porque as linhas já cifradas na
  // fase 1 continuam com o rótulo em claro: as duas contagens divergem, e
  // somá-las esconderia um backfill que parou no meio.
  rotulos: number
  agendamentos: number
  documentos: number
  examResultsCpf: number
}

export async function backfillCriptografia(log: Logger): Promise<ResultadoBackfill> {
  if (!criptografiaConfigurada()) {
    throw new Error(
      'PII_KEY_K1 não configurada: sem chave não há o que cifrar. Defina a env antes de rodar o backfill.',
    )
  }

  return {
    examResults: await backfillExamResults(log),
    resultados: await backfillResultados(log),
    rotulos: await backfillRotulos(log),
    agendamentos: await backfillAgendamentos(log),
    documentos: await backfillDocumentos(log),
    examResultsCpf: await backfillExamResultsCpf(log),
  }
}

/** `exam_results.result` — o laudo completo; a coluna de maior valor do S-06. */
async function backfillExamResults(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('exam_results')
      .select('id, result')
      .is('result_enc', null)
      .not('result', 'is', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler exam_results: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const envelope = cifrarJson(linha.result, aadDe('exam_results', 'result', linha.id as string))
      const { error: updateError } = await supabase
        .from('exam_results')
        .update({ result_enc: envelope })
        .eq('id', linha.id)
        // Guarda contra corrida com a API: se a linha foi cifrada por um
        // saveResult() entre o select e o update, este filtro faz o update não
        // encontrar nada em vez de sobrescrever um envelope mais novo com um
        // derivado de dado velho.
        .is('result_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar exam_results ${linha.id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill exam_results: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/** `resultados.paineis` e `.resumo` — o que chega pelo webhook do FlowLab. */
async function backfillResultados(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    // `paineis` é NOT NULL default '[]', então a condição de "falta cifrar" é a
    // coluna cifrada estar vazia — não a origem ter conteúdo.
    const { data, error } = await supabase
      .from('resultados')
      .select('id, paineis, resumo')
      .is('paineis_enc', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler resultados: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const resumo = linha.resumo as string | null

      const { error: updateError } = await supabase
        .from('resultados')
        .update({
          paineis_enc: cifrarJson(linha.paineis, aadDe('resultados', 'paineis', id)),
          ...(resumo ? { resumo_enc: cifrar(resumo, aadDe('resultados', 'resumo', id)) } : {}),
        })
        .eq('id', id)
        .is('paineis_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar resultados ${id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill resultados: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/** `resultados.exame_nome` e `.categoria` — o rótulo do exame (fase 2a). */
async function backfillRotulos(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('resultados')
      .select('id, exame_nome, categoria')
      .is('exame_nome_enc', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler rótulos de resultados: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const categoria = linha.categoria as string | null

      const { error: updateError } = await supabase
        .from('resultados')
        .update({
          exame_nome_enc: cifrar(linha.exame_nome as string, aadDe('resultados', 'exame_nome', id)),
          ...(categoria
            ? { categoria_enc: cifrar(categoria, aadDe('resultados', 'categoria', id)) }
            : {}),
        })
        .eq('id', id)
        .is('exame_nome_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar rótulo de ${id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill rótulos: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/** `agendamentos.exames` — quais exames a pessoa vai fazer (fase 2a). */
async function backfillAgendamentos(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    // Só quem TEM snapshot: agendamento sem `exames` não tem o que cifrar, e
    // incluí-lo faria o laço nunca esvaziar.
    const { data, error } = await supabase
      .from('agendamentos')
      .select('id, exames')
      .is('exames_enc', null)
      .not('exames', 'is', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler agendamentos: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const { error: updateError } = await supabase
        .from('agendamentos')
        .update({ exames_enc: cifrarJson(linha.exames, aadDe('agendamentos', 'exames', id)) })
        .eq('id', id)
        .is('exames_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar agendamento ${id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill agendamentos: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/** `documentos.nome_arquivo` — o nome descreve o documento (fase 2a). */
async function backfillDocumentos(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('documentos')
      .select('id, nome_arquivo')
      .is('nome_arquivo_enc', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler documentos: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const { error: updateError } = await supabase
        .from('documentos')
        .update({
          nome_arquivo_enc: cifrar(
            linha.nome_arquivo as string,
            aadDe('documentos', 'nome_arquivo', id),
          ),
        })
        .eq('id', id)
        .is('nome_arquivo_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar documento ${id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill documentos: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/** `exam_results.cpf` — a segunda cópia do CPF fora de `pacientes` (fase 2a). */
async function backfillExamResultsCpf(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('exam_results')
      .select('id, cpf')
      .is('cpf_enc', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler cpf de exam_results: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const { error: updateError } = await supabase
        .from('exam_results')
        .update({ cpf_enc: cifrar(linha.cpf as string, aadDe('exam_results', 'cpf', id)) })
        .eq('id', id)
        .is('cpf_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar cpf de ${id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill exam_results.cpf: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/**
 * Confere o que o passo 4 do plano manda conferir: nenhuma linha com conteúdo em
 * claro e a coluna cifrada vazia. Zero nos dois é o sinal verde para a fase 2.
 */
export async function verificarBackfill(): Promise<{
  examResults: number
  resultados: number
  rotulos: number
  agendamentos: number
  documentos: number
  examResultsCpf: number
}> {
  const { count: examResults, error: e1 } = await supabase
    .from('exam_results')
    .select('id', { count: 'exact', head: true })
    .is('result_enc', null)
    .not('result', 'is', null)
  if (e1) throw new Error(`Falha ao verificar exam_results: ${e1.message}`)

  const { count: resultados, error: e2 } = await supabase
    .from('resultados')
    .select('id', { count: 'exact', head: true })
    .is('paineis_enc', null)
  if (e2) throw new Error(`Falha ao verificar resultados: ${e2.message}`)

  const pendentes = async (
    tabela: string,
    colunaEnc: string,
    exigirOrigem?: string,
  ): Promise<number> => {
    let q = supabase.from(tabela).select('id', { count: 'exact', head: true }).is(colunaEnc, null)
    if (exigirOrigem) q = q.not(exigirOrigem, 'is', null)
    const { count, error } = await q
    if (error) throw new Error(`Falha ao verificar ${tabela}.${colunaEnc}: ${error.message}`)
    return count ?? 0
  }

  return {
    examResults: examResults ?? 0,
    resultados: resultados ?? 0,
    rotulos: await pendentes('resultados', 'exame_nome_enc'),
    agendamentos: await pendentes('agendamentos', 'exames_enc', 'exames'),
    documentos: await pendentes('documentos', 'nome_arquivo_enc'),
    examResultsCpf: await pendentes('exam_results', 'cpf_enc'),
  }
}
