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

/**
 * Confere o que o passo 4 do plano manda conferir: nenhuma linha com conteúdo em
 * claro e a coluna cifrada vazia. Zero nos dois é o sinal verde para a fase 2.
 */
export async function verificarBackfill(): Promise<{ examResults: number; resultados: number }> {
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

  return { examResults: examResults ?? 0, resultados: resultados ?? 0 }
}
