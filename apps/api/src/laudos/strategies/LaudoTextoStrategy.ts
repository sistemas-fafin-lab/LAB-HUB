import { randomUUID } from 'node:crypto'
import type { AolExam, AplisExam, Laudo } from '../types.js'
import type { ExamMapperStrategy } from '../ExamMapperStrategy.js'
import { buildMeta } from '../mapperHelpers.js'

// Exames cujo resultado é um TEXTO de laudo, não analitos com faixa de
// referência: citologia, biópsia, imuno-histoquímica. Não há o que comparar com
// valor de referência, então o texto inteiro vira um único marcador "Laudo".
//
// No pipeline original isto eram dois arquivos (CitologiaStrategy e
// BiopsiaStrategy) com o mesmo corpo; a única diferença real entre eles é o
// rótulo exibido e a categoria.
function makeLaudoTextoStrategy(displayName: string, category: string): ExamMapperStrategy {
  return {
    // Quem resolve a estratégia é o registry, por código/nome do exame.
    canHandle: () => false,

    map(aol: AolExam, aplis: AplisExam | null, _cpf: string): Laudo {
      const meta = buildMeta(aol, aplis)

      // Nestes exames a AOL devolve o texto do laudo como "analitos" — cada
      // parágrafo numa linha. Sem unidade, que aqui não faz sentido.
      const laudoTexto =
        aol.analitos.length > 0
          ? aol.analitos.map((a) => `${a.nome}: ${a.valor ?? '—'}`).join('\n')
          : 'Resultado disponível no laudo.'

      return {
        id: randomUUID(),
        name: displayName,
        category,
        ...meta,
        status: 'ready',
        summary: laudoTexto.slice(0, 200),
        panels: [{ name: 'Laudo', value: laudoTexto, unit: '', ref: '', ok: true, trend: [] }],
        exam_type: aol.nome_exame ?? category,
        codigo_os: aol.codigo_os,
        codigo_lis: aplis?.codigo_lis ?? null,
        source: aplis ? 'merged' : 'aol',
        partial: aplis === null,
      }
    },
  }
}

// Citologia — códigos 0085, 0031, 0032, 0049, 0020
export const citologiaBaseLiquidaStrategy = makeLaudoTextoStrategy('Citologia de Base Líquida', 'Citologia')
export const colpocitologiaStrategy = makeLaudoTextoStrategy('Colpocitologia Oncótica', 'Citologia')
export const gramBacterioscopiaStrategy = makeLaudoTextoStrategy('Gram / Bacterioscopia', 'Citologia')
export const citologiaDiversaStrategy = makeLaudoTextoStrategy('Citologia Diversa', 'Citologia')
export const capturaHibridaStrategy = makeLaudoTextoStrategy('Captura Híbrida', 'Citologia')

// Biópsia e imuno-histoquímica — códigos 0100, 0101, 0102, 0103, 0300
export const biopsiaGeralStrategy = makeLaudoTextoStrategy('Biópsia Geral', 'Biópsia')
export const biopsiaSimplesStrategy = makeLaudoTextoStrategy('Biópsia Simples', 'Biópsia')
export const biopsiaFragmentosStrategy = makeLaudoTextoStrategy('Biópsia de Múltiplos Fragmentos', 'Biópsia')
export const biopsiaComplexaStrategy = makeLaudoTextoStrategy('Biópsia Complexa', 'Biópsia')
export const imunohistoquimicaStrategy = makeLaudoTextoStrategy('Imunohistoquímica', 'Imunohistoquímica')
