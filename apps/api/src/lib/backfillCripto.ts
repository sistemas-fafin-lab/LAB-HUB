import type { Logger } from 'pino'
import { aadDe, cifrar, criptografiaConfigurada } from './crypto.js'
import { supabase } from './supabase.js'

/**
 * Backfill da criptografia de coluna (S-06).
 *
 * Ele existia para cifrar o que já estava gravado em claro quando o deploy da
 * escrita dupla subiu, e cobria oito colunas. Sete foram cifradas, conferidas
 * (0 pendentes em produção, 04/08) e tiveram a coluna em claro **dropada** —
 * não há mais de onde ler o texto puro, então as funções correspondentes não
 * foram apenas desativadas: elas quebrariam contra o banco (o PostgREST
 * responde 400 a coluna inexistente).
 *
 * A oitava, `pacientes.cpf` (fase 2b), teve o mesmo ciclo — escrita dupla
 * (`20260826120000`), corte (`20260826130000`) e drop (`20260826140000`,
 * ticket 04) — só que com índice CEGO (HMAC determinístico) em vez de AEAD,
 * porque era a chave de busca e de unicidade do domínio inteiro e `cifrar()`
 * (IV aleatório) quebraria as duas. `backfillPacientes()`/a parte de
 * `pacientes` em `verificarBackfill()` saíram junto do drop, mesma decisão já
 * registrada acima para as sete primeiras — apagar, não manter por simetria.
 *
 * Resta uma única coluna ainda escrita nas duas formas: `resultados.
 * exame_nome`, que participa de `uq_resultado_agendamento_exame` — unicidade
 * não existe sobre coluna cifrada com IV aleatório. Some quando a unicidade
 * migrar para o `exame_flowlab_id` (migration `20260804140000`), e **este
 * arquivo inteiro deixa de ter função** — apagar, não manter por simetria.
 *
 * As três propriedades que sempre valeram continuam valendo para o que sobrou:
 * idempotente (só toca em linha com a coluna cifrada vazia), em lotes, e não
 * apaga o texto puro — removê-lo é migration própria.
 */

const LOTE = 100

export interface ResultadoBackfill {
  rotulos: number
}

export async function backfillCriptografia(log: Logger): Promise<ResultadoBackfill> {
  if (!criptografiaConfigurada()) {
    throw new Error(
      'PII_KEY_K1 não configurada: sem chave não há o que cifrar. Defina a env antes de rodar o backfill.',
    )
  }

  return {
    rotulos: await backfillRotulos(log),
  }
}

/** `resultados.exame_nome` — o rótulo do exame, a última coluna com as duas formas. */
async function backfillRotulos(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('resultados')
      .select('id, exame_nome')
      .is('exame_nome_enc', null)
      // "Sem `_enc`" deixou de significar "falta cifrar" depois do corte: linha
      // nova nasce cifrada. Sem este guarda, uma linha com as duas vazias seria
      // relida para sempre e o laço nunca esvaziaria.
      .not('exame_nome', 'is', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler rótulos de resultados: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const { error: updateError } = await supabase
        .from('resultados')
        .update({
          exame_nome_enc: cifrar(linha.exame_nome as string, aadDe('resultados', 'exame_nome', id)),
        })
        .eq('id', id)
        // Guarda contra corrida com a API: se a linha foi cifrada por um insert
        // entre o select e o update, este filtro faz o update não encontrar nada
        // em vez de sobrescrever um envelope mais novo com um derivado de dado
        // velho.
        .is('exame_nome_enc', null)

      if (updateError) throw new Error(`Falha ao cifrar rótulo de ${id}: ${updateError.message}`)
      total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill rótulos: lote cifrado')
    if (data.length < LOTE) break
  }

  return total
}

/**
 * Quantas linhas ainda têm conteúdo em claro sem par cifrado. Zero é o sinal
 * verde para dropar a coluna em claro correspondente.
 */
export async function verificarBackfill(): Promise<{ rotulos: number }> {
  const { count: rotulos, error: errRotulos } = await supabase
    .from('resultados')
    .select('id', { count: 'exact', head: true })
    .is('exame_nome_enc', null)
    .not('exame_nome', 'is', null)
  if (errRotulos) throw new Error(`Falha ao verificar resultados.exame_nome_enc: ${errRotulos.message}`)

  return { rotulos: rotulos ?? 0 }
}
