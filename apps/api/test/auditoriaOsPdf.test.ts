import { describe, expect, it } from 'vitest'
import { classificarOs } from '../src/laudos/auditoriaOsPdf.js'

// Requisições e O.S. inventadas. A classificação é por O.S.: de um lado o que o
// PDF anexado diz, do outro o que o `idOsLis` digitado na AOL diz.

const REQ_A = '0040000000001'
const REQ_B = '0040000000002'

describe('classificarOs', () => {
  it('O.S. no PDF e com idOsLis da mesma requisição: iguais', () => {
    const classes = classificarOs([{ requisicao: REQ_A, os: '111' }], [{ orderId: '111', idOsLis: REQ_A }], [REQ_A])

    expect(classes).toEqual([
      { os: '111', classe: 'iguais', requisicaoPdf: REQ_A, requisicaoIdOsLis: REQ_A, idOsLisEhCpf: false },
    ])
  })

  it('idOsLis com erro de digitação recuperável ("O" no lugar de zero) ainda é igual', () => {
    const classes = classificarOs(
      [{ requisicao: REQ_A, os: '111' }],
      [{ orderId: '111', idOsLis: 'OO4OOOOOOOOO1' }],
      [REQ_A],
    )
    expect(classes[0]!.classe).toBe('iguais')
  })

  it('O.S. no PDF sem idOsLis utilizável (vazio, CPF ou lixo): só no PDF', () => {
    const classes = classificarOs(
      [
        { requisicao: REQ_A, os: '111' }, // a AOL nem lista (idOsLis vazio)
        { requisicao: REQ_A, os: '222', cpf: '52998224725' }, // idOsLis = CPF do paciente
        { requisicao: REQ_B, os: '333' }, // idOsLis ilegível
      ],
      [
        { orderId: '222', idOsLis: '529.982.247-25' },
        { orderId: '333', idOsLis: 'SOL-2901101' },
      ],
      [REQ_A, REQ_B],
    )

    // A do CPF o método atual acha (card avulso, sem requisição): fica marcada.
    expect(classes.map((c) => [c.os, c.classe, c.requisicaoIdOsLis, c.idOsLisEhCpf])).toEqual([
      ['111', 'so_pdf', null, false],
      ['222', 'so_pdf', null, true],
      ['333', 'so_pdf', null, false],
    ])
  })

  it('idOsLis aponta uma requisição auditada e nenhum PDF traz a O.S.: só no idOsLis', () => {
    const classes = classificarOs([], [{ orderId: '444', idOsLis: REQ_A }], [REQ_A])

    expect(classes).toEqual([
      { os: '444', classe: 'so_idoslis', requisicaoPdf: null, requisicaoIdOsLis: REQ_A, idOsLisEhCpf: false },
    ])
  })

  it('PDF anexado numa requisição e idOsLis apontando outra: divergentes', () => {
    const classes = classificarOs([{ requisicao: REQ_A, os: '555' }], [{ orderId: '555', idOsLis: REQ_B }], [REQ_A, REQ_B])

    // Uma linha só: a O.S. não reaparece como "só no idOsLis" da requisição B.
    expect(classes).toEqual([
      { os: '555', classe: 'divergentes', requisicaoPdf: REQ_A, requisicaoIdOsLis: REQ_B, idOsLisEhCpf: false },
    ])
  })

  it('diverge também quando o idOsLis aponta uma requisição fora da auditoria', () => {
    const classes = classificarOs([{ requisicao: REQ_A, os: '555' }], [{ orderId: '555', idOsLis: '0040000009999' }], [REQ_A])

    expect(classes[0]).toMatchObject({ classe: 'divergentes', requisicaoIdOsLis: '0040000009999' })
  })

  it('ignora as O.S. da entidade que não tocam nenhuma requisição auditada', () => {
    const classes = classificarOs([], [{ orderId: '666', idOsLis: '0040000009999' }], [REQ_A])
    expect(classes).toEqual([])
  })

  it('a mesma O.S. em dois PDFs da mesma requisição conta uma vez', () => {
    const pdfs = [
      { requisicao: REQ_A, os: '111' },
      { requisicao: REQ_A, os: '111' },
    ]
    expect(classificarOs(pdfs, [], [REQ_A])).toHaveLength(1)
  })
})
