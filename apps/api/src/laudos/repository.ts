import { randomUUID } from 'node:crypto'
import { aadDe, cifrar, cifrarJson, decifrar, decifrarJson } from '../lib/crypto.js'
import { supabase } from '../lib/supabase.js'
import { DatabaseError } from './errors.js'
import { conferirCpf, deveBloquear } from './identidade.js'
import type { ExamResultRow, Laudo } from './types.js'

// Acesso à tabela `exam_results`. Tudo é escopado por `paciente_id`: o CPF serve
// para consultar os LIS, nunca para filtrar o banco — quem manda é o paciente
// resolvido do token.

const TABELA = 'exam_results'
// Sem `cpf` e `result`: as colunas em claro foram dropadas (S-06, migration do
// corte). Nomear coluna inexistente aqui não é erro silencioso — o PostgREST
// responde 400 e a rota inteira cai.
const COLUNAS = 'id, paciente_id, cpf_enc, codigo_os, codigo_lis, result_enc, cached_at'

/**
 * CPF da linha, cifrado ou não (S-06 fase 2a).
 *
 * Esta coluna é a SEGUNDA cópia do CPF no banco, fora de `pacientes` — deixá-la
 * em claro anularia cifrar `pacientes.cpf`, porque o dump continuaria trazendo o
 * documento ligado ao mesmo `paciente_id`. Cifrar aqui não custou consulta
 * nenhuma: a comparação sempre foi em JS por dígitos (`conferirCpf`), nunca com
 * `.eq` no SQL — ver a nota de segunda chave em `findByPaciente`.
 */
function cpfDaLinha(linha: { id: string; cpf_enc?: unknown }): string {
  if (linha.cpf_enc) return decifrar(linha.cpf_enc as string, aadDe(TABELA, 'cpf', linha.id))
  // Sem coluna em claro para onde cair — ela foi dropada. Lançar, e não devolver
  // vazio: este CPF é a SEGUNDA CHAVE que impede servir o laudo de outra pessoa
  // (`conferirCpf` em findByPaciente). Uma string vazia não abriria a porta — a
  // comparação falha e bloqueia —, mas apareceria como "paciente sem laudo
  // nenhum", o sintoma mais caro de investigar que este código sabe produzir.
  throw new Error(`exam_results ${linha.id} está sem cpf_enc`)
}

// `result` cifrado é a lista de laudos da linha (hoje um elemento: o pedido
// consolidado; ver ExamResultRow). Envelope gravado antes da mudança para lista
// guardava um objeto único — normalizamos na leitura para não depender de
// migração de dado.
function comoLaudos(result: unknown): Laudo[] {
  if (!result) return []
  return (Array.isArray(result) ? result : [result]) as Laudo[]
}

interface LinhaComResult {
  id: string
  result_enc?: string | null
}

/**
 * Decodifica o laudo da linha, cifrado ou não (S-06).
 *
 * A criptografia acaba aqui: acima deste ponto o serviço enxerga `Laudo[]` e não
 * sabe que existe envelope. É o mesmo motivo pelo qual a decifragem não fica nas
 * rotas — cada ponto de leitura que soubesse do formato seria mais um lugar para
 * a próxima pessoa esquecer o AAD.
 *
 * Sem envelope é linha SEM resultado (requisição registrada, laudo ainda não
 * buscado) — não linha antiga: a coluna em claro não existe mais. Falha ao
 * decifrar propaga em vez de virar lista vazia, senão chave errada apareceria
 * como "o laboratório ainda não liberou".
 */
export function laudosDaLinha(linha: LinhaComResult): Laudo[] {
  if (!linha.result_enc) return []
  return comoLaudos(decifrarJson<Laudo[]>(linha.result_enc, aadDe(TABELA, 'result', linha.id)))
}

/**
 * Linha crua → `ExamResultRow`, decifrando e tirando `result_enc` do caminho.
 *
 * `result` continua distinguindo "sem resultado" (null) de "resultado vazio"
 * ([]) como antes do S-06 — o serviço decide revalidar no LIS a partir dessa
 * diferença, e achatá-la faria o cache reconsultar (ou deixar de reconsultar)
 * sozinho.
 */
function comoExamResultRow(linha: Record<string, unknown>): ExamResultRow {
  // As colunas cifradas saem do objeto: acima deste ponto ninguém deve escolher
  // entre a versão clara e a cifrada — foi essa escolha espalhada que a fase 1
  // já tinha evitado concentrando a decifragem aqui.
  const { result_enc: _cifrado, cpf_enc: _cpfCifrado, ...resto } = linha
  const bruta: LinhaComResult = {
    id: linha.id as string,
    result_enc: linha.result_enc as string | null,
  }
  return {
    ...resto,
    cpf: cpfDaLinha(linha as { id: string }),
    result: linha.result_enc != null ? laudosDaLinha(bruta) : null,
  } as ExamResultRow
}

export interface IExamResultRepository {
  /**
   * Laudos já resolvidos do paciente (linhas sem resultado ficam de fora).
   * `cpf` é o do paciente do token: linha cuja coluna `cpf` divirja dele não é
   * servida (ver a nota de segunda chave na implementação).
   */
  findByPaciente(pacienteId: string, cpf: string): Promise<Laudo[]>
  /** Todas as linhas, inclusive as que ainda aguardam resultado. */
  findAllRows(pacienteId: string): Promise<ExamResultRow[]>
  findByCodigoLis(pacienteId: string, codigoLis: string): Promise<ExamResultRow | null>
  findByCodigoOs(pacienteId: string, codigoOs: string): Promise<ExamResultRow | null>
  insertAwaiting(
    pacienteId: string,
    cpf: string,
    codigoLis: string | null,
    codigoOs: string | null,
  ): Promise<void>
  /** Liga a OS da AOL a uma linha existente (link determinístico via idOsLis). */
  setCodigoOs(id: string, codigoOs: string): Promise<void>
  /** Grava os laudos da linha e renova o TTL. */
  saveResult(id: string, result: Laudo[]): Promise<void>
  /** Renova só o TTL — usado quando o conteúdo clínico não mudou. */
  renewCachedAt(id: string): Promise<void>
}

export class ExamResultRepository implements IExamResultRepository {
  async findByPaciente(pacienteId: string, cpf: string): Promise<Laudo[]> {
    // `id` entrou no select por causa do S-06: ele compõe o AAD e sem ele não há
    // como decifrar. O filtro é só por `result_enc` desde o corte — a coluna em
    // claro não existe mais, e o `or(...)` que cobria as duas iria buscar uma
    // coluna inexistente (PostgREST 400, rota inteira fora).
    const { data, error } = await supabase
      .from(TABELA)
      .select('id, cpf_enc, result_enc, cached_at')
      .eq('paciente_id', pacienteId)
      .not('result_enc', 'is', null)

    if (error) {
      throw new DatabaseError('Falha ao buscar laudos do paciente', { pacienteId, cause: error })
    }

    // Segunda chave, de propósito: `paciente_id` já escopa a busca, mas o `cpf`
    // gravado na linha é o que foi usado para consultar o LIS. Exigir os dois
    // batendo faz com que uma linha vinculada ao paciente errado ANTES desta
    // barreira existir pare de ser servida — sem isso o cache continuaria
    // entregando o vínculo errado para sempre, já que o caminho cacheado nunca
    // volta ao LIS para reconferir. Comparado por dígitos (e não com `.eq` no
    // SQL) para sobreviver a uma regravação de `pacientes.cpf` com formatação
    // diferente: só bloqueia divergência real, não diferença de pontuação.
    // `cached_at` é coluna, não vive dentro do JSON — mas o serviço precisa dele
    // junto do laudo para decidir se o cache venceu, então é injetado aqui.
    // Com `result` sendo lista, a ordenação por data saiu do SQL para cá.
    return (data ?? [])
      .filter((row) => !deveBloquear(conferirCpf(cpf, cpfDaLinha(row as { id: string }))))
      .flatMap((row) =>
        laudosDaLinha(row as LinhaComResult).map((l) => ({
          ...l,
          ...(row.cached_at ? { cached_at: row.cached_at as string } : {}),
        })),
      )
      .sort((a, b) => (b.data_emissao ?? '').localeCompare(a.data_emissao ?? ''))
  }

  async findAllRows(pacienteId: string): Promise<ExamResultRow[]> {
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS)
      .eq('paciente_id', pacienteId)
      .order('criado_em', { ascending: false })

    if (error) {
      throw new DatabaseError('Falha ao listar linhas de laudo', { pacienteId, cause: error })
    }
    return (data ?? []).map((r) => comoExamResultRow(r as Record<string, unknown>))
  }

  async findByCodigoLis(pacienteId: string, codigoLis: string): Promise<ExamResultRow | null> {
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS)
      .eq('paciente_id', pacienteId)
      .eq('codigo_lis', codigoLis)
      .maybeSingle()

    if (error) {
      throw new DatabaseError('Falha ao buscar laudo por codigo_lis', {
        pacienteId,
        codigoLis,
        cause: error,
      })
    }
    if (!data) return null
    return comoExamResultRow(data as Record<string, unknown>)
  }

  async findByCodigoOs(pacienteId: string, codigoOs: string): Promise<ExamResultRow | null> {
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS)
      .eq('paciente_id', pacienteId)
      .eq('codigo_os', codigoOs)
      .maybeSingle()

    if (error) {
      throw new DatabaseError('Falha ao buscar laudo por codigo_os', {
        pacienteId,
        codigoOs,
        cause: error,
      })
    }
    if (!data) return null
    return comoExamResultRow(data as Record<string, unknown>)
  }

  async insertAwaiting(
    pacienteId: string,
    cpf: string,
    codigoLis: string | null,
    codigoOs: string | null,
  ): Promise<void> {
    // Id gerado aqui, e não pelo `gen_random_uuid()` do banco, porque o AAD é
    // `tabela:coluna:id` e precisa existir ANTES de cifrar — mesmo motivo do
    // POST /webhooks/resultados.
    const id = randomUUID()

    const { error } = await supabase.from(TABELA).insert({
      id,
      // Só cifrado (S-06, o corte). `cifrar` em vez de `cifrarSeConfigurado`: a
      // versão tolerante devolvia null sem chave, o que agora significaria
      // gravar a linha SEM o CPF em lugar nenhum. Falhar é o certo — e em
      // produção é inalcançável, `validarCriptografia()` derruba o boot antes.
      cpf_enc: cifrar(cpf, aadDe(TABELA, 'cpf', id)),
      codigo_lis: codigoLis,
      codigo_os: codigoOs,
      cached_at: null,
    })

    if (error) {
      // 23505 = unique_violation. `codigo_lis` é UNIQUE GLOBAL (não por
      // paciente), então este erro significa que o código já pertence à linha de
      // OUTRO paciente — não é uma falha transitória de banco. O insert falhar é
      // o comportamento certo (fail-closed: ninguém vê o laudo do outro), mas
      // sem marcar o caso ele virava um warn genérico e o paciente legítimo
      // ficava sem o laudo, para sempre e em silêncio. Ver o log no service.
      throw new DatabaseError('Falha ao registrar requisição pendente', {
        pacienteId,
        codigoLis,
        codigoOs,
        conflitoDePosse: (error as { code?: string }).code === '23505',
        cause: error,
      })
    }
  }

  async setCodigoOs(id: string, codigoOs: string): Promise<void> {
    const { error } = await supabase.from(TABELA).update({ codigo_os: codigoOs }).eq('id', id)

    if (error) {
      throw new DatabaseError('Falha ao ligar a OS à linha do laudo', { id, codigoOs, cause: error })
    }
  }

  // Grava por `id` em vez de fazer upsert com onConflict em codigo_lis: as linhas
  // só-AOL têm codigo_lis null, e no Postgres NULL nunca casa conflito — o upsert
  // inseria uma linha nova a cada revalidação. Nesta altura do fluxo a linha
  // sempre existe (foi criada por insertAwaiting ou já veio do banco).
  async saveResult(id: string, result: Laudo[]): Promise<void> {
    // Só cifrado (S-06, o corte). A escrita dupla da fase 1 existia para o
    // deploy ser reversível; enquanto durou, `result` em claro anulava a
    // proteção que a coluna cifrada prometia — esta é a coluna de maior valor
    // do S-06, o laudo inteiro.
    const { error } = await supabase
      .from(TABELA)
      .update({
        result_enc: cifrarJson(result, aadDe(TABELA, 'result', id)),
        cached_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new DatabaseError('Falha ao gravar laudo', { id, cause: error })
    }
  }

  async renewCachedAt(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABELA)
      .update({ cached_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new DatabaseError('Falha ao renovar o cache do laudo', { id, cause: error })
    }
  }
}
