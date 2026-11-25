import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'
import { AolService } from '../src/laudos/aol.js'

// A listagem `orders/status` da AOL para no teto de páginas. Parar é de
// propósito (segura a request), mas parar CALADO não: em 25/11/2026 o teto
// cortou as O.S. de junho de uma janela de 180 dias sem rastro nenhum. Quem
// some ali é exame do paciente, então o corte precisa aparecer no log.

/** Uma página da AOL: uma O.S. por página, `hasNext` como o cenário pedir. */
function pagina(n: number, hasNext: boolean): Response {
  return new Response(
    JSON.stringify({
      data: [{ orderId: 380000000 + n, idOsLis: `00400000000${n}` }],
      hasNext,
      nextCursor: hasNext ? `cursor-${n + 1}` : null,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function logEspiao() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('AolService.listOrders — teto de páginas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a AOL ainda tinha páginas quando o teto chegou: avisa no log que a listagem foi cortada', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => pagina(++n, true)))
    const log = logEspiao()

    const ordens = await new AolService().listOrders('2026-05-29', '2026-11-25', log as unknown as FastifyBaseLogger)

    expect(ordens).toHaveLength(40)
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn.mock.calls[0]![0]).toMatchObject({
      dataInicial: '2026-05-29',
      dataFinal: '2026-11-25',
      paginas: 40,
      ordens: 40,
    })
  })

  it('a listagem acabou antes do teto: nenhum aviso', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => pagina(++n, n < 3)))
    const log = logEspiao()

    const ordens = await new AolService().listOrders('2026-08-27', '2026-11-25', log as unknown as FastifyBaseLogger)

    expect(ordens).toHaveLength(3)
    expect(log.warn).not.toHaveBeenCalled()
  })
})
