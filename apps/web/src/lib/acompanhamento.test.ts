import { describe, expect, it } from 'vitest'
import type { Exam, ExamPanel } from './exame'
import type { Tendencia } from './tendencias'
import { itensDeAcompanhamento } from './acompanhamento'

const tendencia = (marcador: string, serie: number[], fora = false): Tendencia => ({
  marcador,
  valor: String(serie[serie.length - 1]),
  unidade: 'mg/dL',
  variacao: 'variação',
  tom: fora ? 'accent' : 'neutral',
  direcao: 'up',
  nota: '',
  serie,
  exameId: 'e',
  foraDaReferencia: fora,
  eixo: { inicio: 'mai', fim: 'out' },
})

const painel = (name: string, ok: boolean, value = '10', unit = 'mg/dL'): ExamPanel => ({ name, value, unit, ref: '', ok, trend: [] })
const exame = (panels: ExamPanel[]) => ({ id: 'ult', status: 'ready', panels }) as unknown as Exam

describe('itensDeAcompanhamento', () => {
  it('ordem: tendência fora, marcador fora sem série, demais por variação; no máximo 3', () => {
    const itens = itensDeAcompanhamento(
      [tendencia('Glicose', [90, 91]), tendencia('LDL', [150, 170], true), tendencia('TSH', [2, 4])],
      exame([painel('Ferritina', false, '8', 'ng/mL'), painel('Sódio', true)]),
    )
    expect(itens.map((i) => i.titulo)).toEqual(['LDL', 'Ferritina', 'TSH'])
    expect(itens[1]).toMatchObject({ sub: 'Fora da referência · 8 ng/mL', icone: 'alert-circle', destino: { tipo: 'exame', id: 'ult' } })
    expect(itens[0]!.destino).toEqual({ tipo: 'tendencias' })
  })

  it('não repete marcador que já tem série', () => {
    const itens = itensDeAcompanhamento([tendencia('LDL', [150, 170], true)], exame([painel('LDL', false)]))
    expect(itens.map((i) => i.titulo)).toEqual(['LDL'])
  })

  it('sem dado: vazio', () => {
    expect(itensDeAcompanhamento([], undefined)).toEqual([])
  })
})
