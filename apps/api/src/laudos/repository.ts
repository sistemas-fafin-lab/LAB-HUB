import { supabase } from '../lib/supabase.js'
import { DatabaseError } from './errors.js'
import type { ExamResultRow, Laudo } from './types.js'

// Acesso à tabela `exam_results`. Tudo é escopado por `paciente_id`: o CPF serve
// para consultar os LIS, nunca para filtrar o banco — quem manda é o paciente
// resolvido do token.

const TABELA = 'exam_results'

// `result` no banco é a lista de laudos da linha (hoje um elemento: o pedido
// consolidado; ver ExamResultRow). Linha gravada antes da mudança para lista
// guardava um objeto único — normalizamos na leitura para não depender de
// migração de dado.
function comoLaudos(result: unknown): Laudo[] {
  if (!result) return []
  return (Array.isArray(result) ? result : [result]) as Laudo[]
}

export interface IExamResultRepository {
  /** Laudos já resolvidos do paciente (linhas sem resultado ficam de fora). */
  findByPaciente(pacienteId: string): Promise<Laudo[]>
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
  async findByPaciente(pacienteId: string): Promise<Laudo[]> {
    const { data, error } = await supabase
      .from(TABELA)
      .select('result, cached_at')
      .eq('paciente_id', pacienteId)
      .not('result', 'is', null)

    if (error) {
      throw new DatabaseError('Falha ao buscar laudos do paciente', { pacienteId, cause: error })
    }

    // `cached_at` é coluna, não vive dentro do JSON — mas o serviço precisa dele
    // junto do laudo para decidir se o cache venceu, então é injetado aqui.
    // Com `result` sendo lista, a ordenação por data saiu do SQL para cá.
    return (data ?? [])
      .flatMap((row) =>
        comoLaudos(row.result).map((l) => ({
          ...l,
          ...(row.cached_at ? { cached_at: row.cached_at as string } : {}),
        })),
      )
      .sort((a, b) => (b.data_emissao ?? '').localeCompare(a.data_emissao ?? ''))
  }

  async findAllRows(pacienteId: string): Promise<ExamResultRow[]> {
    const { data, error } = await supabase
      .from(TABELA)
      .select('id, paciente_id, cpf, codigo_os, codigo_lis, result, cached_at')
      .eq('paciente_id', pacienteId)
      .order('criado_em', { ascending: false })

    if (error) {
      throw new DatabaseError('Falha ao listar linhas de laudo', { pacienteId, cause: error })
    }
    return (data ?? []).map((r) => ({
      ...r,
      result: r.result ? comoLaudos(r.result) : null,
    })) as ExamResultRow[]
  }

  async findByCodigoLis(pacienteId: string, codigoLis: string): Promise<ExamResultRow | null> {
    const { data, error } = await supabase
      .from(TABELA)
      .select('id, paciente_id, cpf, codigo_os, codigo_lis, result, cached_at')
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
    return { ...data, result: data.result ? comoLaudos(data.result) : null } as ExamResultRow
  }

  async findByCodigoOs(pacienteId: string, codigoOs: string): Promise<ExamResultRow | null> {
    const { data, error } = await supabase
      .from(TABELA)
      .select('id, paciente_id, cpf, codigo_os, codigo_lis, result, cached_at')
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
    return { ...data, result: data.result ? comoLaudos(data.result) : null } as ExamResultRow
  }

  async insertAwaiting(
    pacienteId: string,
    cpf: string,
    codigoLis: string | null,
    codigoOs: string | null,
  ): Promise<void> {
    const { error } = await supabase.from(TABELA).insert({
      paciente_id: pacienteId,
      cpf,
      codigo_lis: codigoLis,
      codigo_os: codigoOs,
      result: null,
      cached_at: null,
    })

    if (error) {
      throw new DatabaseError('Falha ao registrar requisição pendente', {
        pacienteId,
        codigoLis,
        codigoOs,
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
    const { error } = await supabase
      .from(TABELA)
      .update({ result, cached_at: new Date().toISOString() })
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
