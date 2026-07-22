import { randomUUID } from 'node:crypto'
import type { AolExam, AplisExam, Laudo } from '../types.js'
import type { ExamMapperStrategy } from '../ExamMapperStrategy.js'
import { buildMeta } from '../mapperHelpers.js'

// Último recurso do registry: tipo de exame que não casou com nenhuma estratégia
// conhecida. Despeja os analitos como texto num único marcador "Laudo" e marca
// `partial: true` — assumimos que o mapeamento está incompleto, não que o
// resultado esteja pronto.
export const genericStrategy: ExamMapperStrategy = {
  canHandle: () => true,

  map(aol: AolExam, aplis: AplisExam | null, _cpf: string): Laudo {
    const meta = buildMeta(aol, aplis)
    const laudoTexto =
      aol.analitos.length > 0
        ? aol.analitos.map((a) => `${a.nome}: ${a.valor ?? '—'} ${a.unidade ?? ''}`).join('\n')
        : 'Resultado disponível no laudo.'

    return {
      id: randomUUID(),
      name: aol.nome_exame ?? 'Exame',
      category: 'Análises Clínicas',
      ...meta,
      status: 'partial',
      summary: laudoTexto.slice(0, 200),
      panels: [{ name: 'Laudo', value: laudoTexto, unit: '', ref: '', ok: true, trend: [] }],
      exam_type: aol.nome_exame ?? 'unknown',
      codigo_os: aol.codigo_os,
      codigo_lis: aplis?.codigo_lis ?? null,
      source: aplis ? 'merged' : 'aol',
      partial: true,
    }
  },
}
