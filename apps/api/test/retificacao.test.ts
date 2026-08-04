import { describe, expect, it } from 'vitest'
import type { Resultado } from '@lab-hub/shared'
import { marcarRetificados } from '../src/lib/retificacao.js'

const AG = 'ag-1'

function r(over: Partial<Resultado> & { id: string }): Resultado {
  return {
    pacienteId: 'pac-1',
    agendamentoId: AG,
    exameNome: 'Hemograma completo',
    status: 'ready',
    paineis: [],
    liberadoEm: '2026-08-01T12:00:00.000Z',
    ...over,
  }
}

describe('marcarRetificados', () => {
  it('marca o mais antigo apontando para o que o substituiu', () => {
    const [novo, velho] = marcarRetificados([
      r({ id: 'novo', liberadoEm: '2026-08-04T12:00:00.000Z' }),
      r({ id: 'velho', liberadoEm: '2026-08-01T12:00:00.000Z' }),
    ])
    expect(novo?.retificadoPor).toBeUndefined()
    expect(velho?.retificadoPor).toBe('novo')
  })

  // A ordem de ENTRADA é quem decide a versão vigente — a rota é que ordena.
  // Se este módulo reordenasse por conta própria, teria dois critérios de
  // "mais novo" no sistema, e eles divergiriam no dia em que a rota mudasse.
  it('não reordena: quem vem primeiro na lista é a versão vigente', () => {
    const saida = marcarRetificados([
      r({ id: 'primeiro', liberadoEm: '2026-08-01T12:00:00.000Z' }),
      r({ id: 'segundo', liberadoEm: '2026-08-04T12:00:00.000Z' }),
    ])
    expect(saida.map((x) => x.id)).toEqual(['primeiro', 'segundo'])
    expect(saida[0]?.retificadoPor).toBeUndefined()
    expect(saida[1]?.retificadoPor).toBe('primeiro')
  })

  it('marca a terceira versão também, sempre apontando para a vigente', () => {
    const saida = marcarRetificados([
      r({ id: 'v3' }),
      r({ id: 'v2' }),
      r({ id: 'v1' }),
    ])
    expect(saida.map((x) => x.retificadoPor)).toEqual([undefined, 'v3', 'v3'])
  })

  it('exames diferentes no mesmo agendamento não se retificam', () => {
    const saida = marcarRetificados([
      r({ id: 'a', exameNome: 'Hemograma completo' }),
      r({ id: 'b', exameNome: 'Glicemia de jejum' }),
    ])
    expect(saida.every((x) => x.retificadoPor === undefined)).toBe(true)
  })

  it('mesmo exame em agendamentos diferentes não se retifica', () => {
    const saida = marcarRetificados([
      r({ id: 'a', agendamentoId: 'ag-1' }),
      r({ id: 'b', agendamentoId: 'ag-2' }),
    ])
    expect(saida.every((x) => x.retificadoPor === undefined)).toBe(true)
  })

  // Sem agendamento não existe "mesma visita": dois exames de mesmo nome feitos
  // com meses de diferença são dois exames, não uma correção. Marcar o antigo
  // como "versão anterior" esconderia um resultado legítimo do histórico.
  it('resultado sem agendamento nunca é marcado, mesmo com nome igual', () => {
    const saida = marcarRetificados([
      r({ id: 'a', agendamentoId: undefined }),
      r({ id: 'b', agendamentoId: undefined }),
    ])
    expect(saida.every((x) => x.retificadoPor === undefined)).toBe(true)
  })

  it('resultado sem liberadoEm não é marcado', () => {
    const saida = marcarRetificados([
      r({ id: 'a', liberadoEm: undefined }),
      r({ id: 'b', liberadoEm: undefined }),
    ])
    expect(saida.every((x) => x.retificadoPor === undefined)).toBe(true)
  })

  // O separador do agrupamento tem de ser um caractere impossível no nome do
  // exame. Com concatenação crua, ('ag' + 'X') e ('a' + 'gX') virariam a mesma
  // chave e um exame seria marcado como versão anterior de outro.
  it('não confunde grupos por concatenação de agendamento e nome', () => {
    const saida = marcarRetificados([
      r({ id: 'a', agendamentoId: 'ag', exameNome: 'X' }),
      r({ id: 'b', agendamentoId: 'a', exameNome: 'gX' }),
    ])
    expect(saida.every((x) => x.retificadoPor === undefined)).toBe(true)
  })

  it('não muta a lista nem os objetos recebidos', () => {
    const entrada = [r({ id: 'novo' }), r({ id: 'velho' })]
    const velhoOriginal = entrada[1]!
    marcarRetificados(entrada)
    expect(velhoOriginal.retificadoPor).toBeUndefined()
    expect(entrada).toHaveLength(2)
  })

  it('lista vazia devolve lista vazia', () => {
    expect(marcarRetificados([])).toEqual([])
  })
})
