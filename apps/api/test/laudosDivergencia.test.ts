import { describe, expect, it } from 'vitest'
import { pedidoDaOs } from '../src/laudos/divergencia.js'

// A regra de qual fonte vence quando o PDF "Laudo EXTERNO" e o `idOsLis`
// situam a mesma O.S. em requisições diferentes do paciente. Códigos inventados.

const REQ_A = '0040000000001'
const REQ_B = '0040000000002'
const REQ_C = '0040000000003'

describe('pedidoDaOs', () => {
  it('nenhuma fonte afirma nada: sem pedido, nada a decidir', () => {
    expect(pedidoDaOs([], null)).toEqual({ pedido: null, decidido: false, divergem: false })
  })

  it('só uma fonte afirma: vale o que ela diz, mas isso não autoriza corrigir o que está gravado', () => {
    expect(pedidoDaOs([REQ_A], null)).toEqual({ pedido: REQ_A, decidido: false, divergem: false })
    expect(pedidoDaOs([], REQ_B)).toEqual({ pedido: REQ_B, decidido: false, divergem: false })
  })

  it('as duas concordam: decidido, sem divergência', () => {
    expect(pedidoDaOs([REQ_A], REQ_A)).toEqual({ pedido: REQ_A, decidido: true, divergem: false })
  })

  it('a O.S. está no PDF de duas requisições e o idOsLis aponta uma delas: é essa', () => {
    expect(pedidoDaOs([REQ_A, REQ_B], REQ_B)).toEqual({ pedido: REQ_B, decidido: true, divergem: false })
  })

  it('divergem e vence o PDF: a requisição em que o laudo está anexado', () => {
    expect(pedidoDaOs([REQ_A], REQ_B, 'pdf')).toEqual({ pedido: REQ_A, decidido: true, divergem: true })
  })

  it('divergem e vence o idOsLis: a requisição que a recepção digitou', () => {
    expect(pedidoDaOs([REQ_A], REQ_B, 'idOsLis')).toEqual({ pedido: REQ_B, decidido: true, divergem: true })
  })

  it('vence o PDF, mas ele está anexado em duas requisições e nenhuma é a do idOsLis: não decide', () => {
    expect(pedidoDaOs([REQ_A, REQ_C], REQ_B, 'pdf')).toEqual({ pedido: null, decidido: false, divergem: true })
  })

  it('a mesma requisição repetida no PDF conta uma vez', () => {
    expect(pedidoDaOs([REQ_A, REQ_A], REQ_B, 'pdf')).toEqual({ pedido: REQ_A, decidido: true, divergem: true })
  })

  it('só o PDF afirma, em duas requisições: não há como escolher', () => {
    expect(pedidoDaOs([REQ_A, REQ_C], null)).toEqual({ pedido: null, decidido: false, divergem: false })
  })
})
