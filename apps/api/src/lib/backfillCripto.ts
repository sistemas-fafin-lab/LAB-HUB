import type { Logger } from 'pino'
import { aadDe, cifrar, criptografiaConfigurada, hashCpf, hashCpfConfigurado } from './crypto.js'
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
 * Restam duas colunas ainda escritas nas duas formas:
 *   * `resultados.exame_nome` — participa de `uq_resultado_agendamento_exame`,
 *     e unicidade não existe sobre coluna cifrada com IV aleatório. Some
 *     quando a unicidade migrar para o `exame_flowlab_id` (migration
 *     `20260804140000`).
 *   * `pacientes.cpf` (fase 2b, migration `20260826120000`) — pelo mesmo
 *     motivo, mas com índice CEGO (HMAC determinístico) em vez de AEAD: é a
 *     chave de busca e de unicidade do domínio inteiro, e `cifrar()` (IV
 *     aleatório) quebraria as duas.
 *
 * Quando as duas colunas em claro caírem, **este arquivo inteiro deixa de ter
 * função** — apagar, não manter por simetria.
 *
 * As três propriedades que sempre valeram continuam valendo para as duas que
 * sobraram: idempotente (só toca em linha com a coluna cifrada/hash vazia), em
 * lotes, e não apaga o texto puro — removê-lo é migration própria.
 */

const LOTE = 100

export interface ResultadoBackfill {
  rotulos: number
  pacientes: number
}

export async function backfillCriptografia(log: Logger): Promise<ResultadoBackfill> {
  if (!criptografiaConfigurada()) {
    throw new Error(
      'PII_KEY_K1 não configurada: sem chave não há o que cifrar. Defina a env antes de rodar o backfill.',
    )
  }
  if (!hashCpfConfigurado()) {
    throw new Error(
      'CPF_HASH_KEY não configurada: sem chave não há como gerar o índice cego do CPF. ' +
        'Defina a env antes de rodar o backfill.',
    )
  }

  return {
    rotulos: await backfillRotulos(log),
    pacientes: await backfillPacientes(log),
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

/** `pacientes.cpf` — o índice cego (fase 2b). */
async function backfillPacientes(log: Logger): Promise<number> {
  let total = 0

  for (;;) {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, cpf')
      .is('cpf_hash', null)
      // Mesmo guarda de `backfillRotulos`: linha nova já nasce com o par
      // hash/cifrado, então "sem cpf_hash" só significa "falta migrar" quando
      // também há `cpf` para gerar o par a partir dele.
      .not('cpf', 'is', null)
      .limit(LOTE)

    if (error) throw new Error(`Falha ao ler CPFs de pacientes: ${error.message}`)
    if (!data?.length) break

    for (const linha of data) {
      const id = linha.id as string
      const cpf = linha.cpf as string
      const { data: atualizada, error: updateError } = await supabase
        .from('pacientes')
        .update({
          cpf_hash: hashCpf(cpf),
          cpf_enc: cifrar(cpf, aadDe('pacientes', 'cpf', id)),
        })
        .eq('id', id)
        // Guarda contra corrida com a API: se a linha ganhou o par hash/cifrado
        // entre o select e o update (escrita dupla de um cadastro concorrente),
        // este filtro faz o update não encontrar nada em vez de sobrescrever um
        // par mais novo com um derivado do mesmo `cpf`.
        .is('cpf_hash', null)
        // `.select()` só para o UPDATE dizer se de fato encontrou a linha —
        // sem isto, uma corrida perdida contra este guarda ainda somaria em
        // `total`, e o log de progresso mentiria sobre quanto foi migrado.
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(`Falha ao gerar índice cego do CPF de ${id}: ${updateError.message}`)
      }
      if (atualizada) total += 1
    }

    log.info({ lote: data.length, total }, 'Backfill pacientes: lote migrado')
    if (data.length < LOTE) break
  }

  return total
}

/**
 * Quantas linhas ainda têm conteúdo em claro sem par cifrado. Zero é o sinal
 * verde para dropar a coluna em claro correspondente.
 */
export async function verificarBackfill(): Promise<{ rotulos: number; pacientes: number }> {
  const { count: rotulos, error: errRotulos } = await supabase
    .from('resultados')
    .select('id', { count: 'exact', head: true })
    .is('exame_nome_enc', null)
    .not('exame_nome', 'is', null)
  if (errRotulos) throw new Error(`Falha ao verificar resultados.exame_nome_enc: ${errRotulos.message}`)

  const { count: pacientes, error: errPacientes } = await supabase
    .from('pacientes')
    .select('id', { count: 'exact', head: true })
    .is('cpf_hash', null)
    .not('cpf', 'is', null)
  if (errPacientes) throw new Error(`Falha ao verificar pacientes.cpf_hash: ${errPacientes.message}`)

  return { rotulos: rotulos ?? 0, pacientes: pacientes ?? 0 }
}
