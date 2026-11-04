import { afterEach, describe, expect, it } from 'vitest'
import type { Exam, ExamPanel } from './exame'
import { resumoDasTendencias, tendenciasDosExames } from './tendencias'
import { salvarFuso } from './regiao'

afterEach(() => salvarFuso('America/Sao_Paulo'))

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

  it('ignora valor não numérico, exame substituído e sem data; usa os grupos quando há', () => {
    const lista = tendenciasDosExames([
      exame('e', '2026-04-10', [painel('Ureia', '33')], { groups: [{ name: 'Bioquímica', panels: [painel('Ureia', '33')] }] }),
      exame('d', undefined, [painel('Ureia', '50')]),
      exame('c', '2026-03-10', [painel('Ureia', '99')], { retificado: true }),
      exame('a', '2026-01-10', [painel('Glicose', '<5')], { groups: [{ name: 'Bioquímica', panels: [painel('Ureia', '30')] }] }),
    ])
    expect(lista.map((t) => [t.marcador, t.serie])).toEqual([['Ureia', [30, 33]]])
  })

  it('pedido ainda parcial entra com os valores já liberados', () => {
    const [t] = tendenciasDosExames([
      exame('b', '2026-02-10', [painel('Glicose', '95'), painel('TSH', '')], { status: 'analyzing' }),
      exame('a', '2026-01-10', [painel('Glicose', '90')]),
    ])
    expect(t).toMatchObject({ marcador: 'Glicose', serie: [90, 95], exameId: 'b' })
  })

  it('ponto é separador de milhar, como nos laudos (6.500 leucócitos, 212.000 plaquetas)', () => {
    const lista = tendenciasDosExames([
      exame('b', '2026-02-10', [painel('Leucócitos', '6.800', true, '/mm³'), painel('Plaquetas', '212.000', true, '/mm³')]),
      exame('a', '2026-01-10', [painel('Leucócitos', '6.500', true, '/mm³'), painel('Plaquetas', '1.234,5', true, '/mm³')]),
    ])
    // "0.500" não é milhar (grupo de milhar não começa em 0): é 0,5.
    const [creat] = tendenciasDosExames([
      exame('b', '2026-02-10', [painel('Creatinina', '0.500')]),
      exame('a', '2026-01-10', [painel('Creatinina', '0.4')]),
    ])
    expect(creat?.serie).toEqual([0.4, 0.5])
    const leuco = lista.find((t) => t.marcador === 'Leucócitos')
    expect(leuco).toMatchObject({ serie: [6500, 6800], variacao: '+300 desde a coleta anterior' })
    expect(lista.find((t) => t.marcador === 'Plaquetas')?.serie).toEqual([1234.5, 212000])
  })

  it('duas versões do mesmo dia: vale a mais recente (a primeira da lista, que vem do mais novo para o mais antigo)', () => {
    const [t] = tendenciasDosExames([
      exame('nova', '2026-02-10', [painel('Glicose', '97', false)]),
      exame('velha', '2026-02-10', [painel('Glicose', '91')]),
      exame('jan', '2026-01-10', [painel('Glicose', '90')]),
    ])
    expect(t).toMatchObject({ serie: [90, 97], exameId: 'nova', tom: 'accent' })
  })

  it('o dia de um horário de liberação é o do fuso escolhido', () => {
    // 22:30 do dia 11 e 09:00 do dia 11 em Brasília: uma coleta só, não entra.
    const doDia = [
      exame('b', '2026-05-12T01:30:00Z', [painel('Glicose', '95')], { origem: 'flowlab' }),
      exame('a', '2026-05-11T12:00:00Z', [painel('Glicose', '90')], { origem: 'flowlab' }),
    ]
    expect(tendenciasDosExames(doDia)).toEqual([])
    // Em Noronha (GMT-2) a primeira já é 23:30 do dia 11 — continua um dia só; em
    // UTC seriam dois dias.
    salvarFuso('America/Noronha')
    expect(tendenciasDosExames(doDia)).toEqual([])
  })

  it('marcadores de mesmo nome em grupos ou exames diferentes não se misturam', () => {
    const lista = tendenciasDosExames([
      exame('b', '2026-02-10', [], {
        groups: [
          { name: 'Série Branca', panels: [painel('Neutrófilos', '60', true, '%')] },
          { name: 'Líquor', panels: [painel('Neutrófilos', '5', true, '%')] },
        ],
      }),
      exame('a', '2026-01-10', [], { groups: [{ name: 'Série Branca', panels: [painel('Neutrófilos', '58', true, '%')] }] }),
      exame('t2', '2026-02-10', [painel('Resultado', '2,1', true, '')], { name: 'TSH' }),
      exame('t1', '2026-01-10', [painel('Resultado', '1,1', true, '')], { name: 'T4 livre' }),
    ])
    expect(lista.map((t) => [t.marcador, t.serie])).toEqual([['Neutrófilos', [58, 60]]])
  })

  it('o mesmo exame vindo do FlowLab e do laboratório não conta como duas coletas', () => {
    expect(
      tendenciasDosExames([
        exame('fl', '2026-05-12T15:00:00Z', [painel('Glicose', '92')], { origem: 'flowlab' }),
        exame('lis', '2026-05-10', [painel('Glicose', '92')], { origem: 'lis' }),
      ]),
    ).toEqual([])
  })

  it('marcador com histórico no FlowLab e no laboratório vira um cartão só, o da fonte com mais coletas', () => {
    const lista = tendenciasDosExames([
      exame('l3', '2026-03-10', [painel('Glicose', '93')], { origem: 'lis', name: 'Glicose' }),
      exame('f2', '2026-02-20T12:00:00Z', [painel('Glicose', '95')], { origem: 'flowlab', name: 'Glicose' }),
      exame('l2', '2026-02-10', [painel('Glicose', '92')], { origem: 'lis', name: 'Glicose' }),
      exame('f1', '2026-01-20T12:00:00Z', [painel('Glicose', '94')], { origem: 'flowlab', name: 'Glicose' }),
      exame('l1', '2026-01-10', [painel('Glicose', '90')], { origem: 'lis', name: 'Glicose' }),
    ])
    expect(lista.map((t) => [t.marcador, t.serie])).toEqual([['Glicose', [90, 92, 93]]])
  })

  it('"Estável" e "Igual à coleta anterior" seguem a mesma comparação', () => {
    const [t] = tendenciasDosExames([
      exame('c', '2026-03-10', [painel('Glicose', '92,0')]),
      exame('b', '2026-02-10', [painel('Glicose', '92')]),
      exame('a', '2026-01-10', [painel('Glicose', '92,4')]),
    ])
    expect(t).toMatchObject({ direcao: 'flat', variacao: 'Igual à coleta anterior' })
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
