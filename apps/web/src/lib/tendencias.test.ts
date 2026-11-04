import { describe, expect, it } from 'vitest'
import type { Exam, ExamPanel } from './exame'
import { resumoDasTendencias, tendenciasDosExames } from './tendencias'

const painel = (name: string, value: string, ok = true, unit = 'mg/dL', ref = '70 – 99'): ExamPanel => ({
  name,
  value,
  unit,
  ref,
  ok,
  trend: [],
})

function exame(id: string, coletadoEm: string | undefined, panels: ExamPanel[], extra: Partial<Exam> = {}): Exam {
  return {
    id,
    name: 'Exame',
    category: '',
    date: '',
    fullDate: '',
    unit: '',
    doctor: '',
    crm: '',
    status: 'ready',
    summary: '',
    panels,
    ...(coletadoEm ? { coletadoEm } : {}),
    ...extra,
  }
}

describe('tendenciasDosExames', () => {
  it('junta o mesmo marcador de coletas diferentes, em ordem de coleta, e mostra o último valor', () => {
    const [t, ...resto] = tendenciasDosExames([
      exame('c', '2026-07-01', [painel('Glicose', '95')]),
      exame('a', '2026-01-10', [painel('Glicose', '88')]),
      exame('b', '2026-04-05', [painel('Glicose', '91')]),
    ])
    expect(resto).toHaveLength(0)
    expect(t).toMatchObject({
      marcador: 'Glicose',
      valor: '95',
      unidade: 'mg/dL',
      serie: [88, 91, 95],
      direcao: 'up',
      variacao: '+4 desde a coleta anterior',
      tom: 'neutral',
      exameId: 'c',
      nota: 'Dentro da referência (70 – 99).',
    })
  })

  it('precisa de duas coletas: marcador de uma coleta só não entra', () => {
    expect(
      tendenciasDosExames([exame('a', '2026-01-10', [painel('Glicose', '88')]), exame('b', '2026-02-10', [painel('TSH', '2,1')])]),
    ).toEqual([])
  })

  it('lê vírgula decimal, mostra a variação com as casas do valor e marca o que está fora da referência', () => {
    const [t] = tendenciasDosExames([
      exame('a', '2026-01-10', [painel('Hemoglobina', '14,5', true, 'g/dL', '13,0 – 17,5')]),
      exame('b', '2026-03-10', [painel('Hemoglobina', '12,8', false, 'g/dL', '13,0 – 17,5')]),
    ])
    expect(t).toMatchObject({
      serie: [14.5, 12.8],
      direcao: 'down',
      variacao: '−1,7 desde a coleta anterior',
      tom: 'accent',
      nota: 'Fora da referência (13,0 – 17,5). Converse com seu médico sobre este resultado.',
    })
  })

  it('valores iguais em três ou mais coletas aparecem como estáveis', () => {
    const [t] = tendenciasDosExames([
      exame('a', '2026-01-10', [painel('Glicose', '92')]),
      exame('b', '2026-02-10', [painel('Glicose', '92')]),
      exame('c', '2026-03-10', [painel('Glicose', '92')]),
    ])
    expect(t).toMatchObject({ direcao: 'flat', variacao: 'Estável há 3 coletas' })
  })

  it('ignora valor não numérico, exame em análise, exame substituído e sem data; lê também os grupos do hemograma', () => {
    const lista = tendenciasDosExames([
      exame('a', '2026-01-10', [painel('Glicose', '<5'), painel('Ureia', '30')]),
      exame('b', '2026-02-10', [painel('Glicose', '90'), painel('Ureia', '31')], { status: 'analyzing' }),
      exame('c', '2026-03-10', [painel('Ureia', '99')], { retificado: true }),
      exame('d', undefined, [painel('Ureia', '50')]),
      exame('e', '2026-04-10', [], { groups: [{ name: 'Série Vermelha', panels: [painel('Ureia', '33')] }] }),
    ])
    expect(lista.map((t) => [t.marcador, t.serie])).toEqual([['Ureia', [30, 33]]])
  })

  it('o que está fora da referência vem primeiro', () => {
    const lista = tendenciasDosExames([
      exame('a', '2026-01-10', [painel('Glicose', '90'), painel('LDL', '120')]),
      exame('b', '2026-02-10', [painel('Glicose', '91'), painel('LDL', '140', false)]),
    ])
    expect(lista.map((t) => t.marcador)).toEqual(['LDL', 'Glicose'])
  })
})

describe('resumoDasTendencias', () => {
  it('conta os marcadores dentro e fora da referência, nomeando os de fora', () => {
    const lista = tendenciasDosExames([
      exame('a', '2026-01-10', [painel('Glicose', '90'), painel('LDL', '120'), painel('Ureia', '30')]),
      exame('b', '2026-02-10', [painel('Glicose', '91'), painel('LDL', '140', false), painel('Ureia', '31')]),
    ])
    expect(resumoDasTendencias(lista)).toBe('De 3 marcadores acompanhados, 2 estão dentro da referência e 1 está fora (LDL).')
  })

  it('todos dentro', () => {
    const lista = tendenciasDosExames([
      exame('a', '2026-01-10', [painel('Glicose', '90')]),
      exame('b', '2026-02-10', [painel('Glicose', '91')]),
    ])
    expect(resumoDasTendencias(lista)).toBe('De 1 marcador acompanhado, 1 está dentro da referência.')
  })
})
