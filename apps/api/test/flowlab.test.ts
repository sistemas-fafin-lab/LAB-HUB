import { afterEach, describe, expect, it, vi } from 'vitest'
// FLOWLAB_TIMEOUT_MS=100 vem do test/setup.ts e é lido no load deste módulo.
import { flowlab } from '../src/lib/flowlab.js'

describe('client FlowLab', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lança erro de timeout quando o FlowLab não responde no prazo', async () => {
    // fetch que nunca resolve sozinho: só rejeita quando o AbortSignal aborta —
    // AbortSignal.timeout dispara TimeoutError após FLOWLAB_TIMEOUT_MS (100ms).
    vi.stubGlobal('fetch', (_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason))
      }),
    )
    await expect(flowlab.getDisponibilidade()).rejects.toThrow(/timeout após 100ms/)
  })

  it('propaga erro HTTP do FlowLab com status e corpo', async () => {
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 500 }))
    await expect(flowlab.getDisponibilidade()).rejects.toThrow(/get-disponibilidade: 500/)
  })
})

describe('cache de disponibilidade (só exibição)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    flowlab.invalidarDisponibilidade() // isola o estado do cache entre testes
  })

  function stubDisponibilidade(): { calls: () => number } {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      return new Response(JSON.stringify([{ id: 'p1', nome: 'Posto', endereco: 'Rua', slots: [] }]), {
        status: 200,
      })
    })
    return { calls: () => calls }
  }

  it('reusa o cache dentro do TTL: uma única chamada ao FlowLab', async () => {
    const fetchSpy = stubDisponibilidade()
    await flowlab.getDisponibilidadeCacheada()
    await flowlab.getDisponibilidadeCacheada()
    expect(fetchSpy.calls()).toBe(1)
  })

  it('coalesce de misses concorrentes: uma única chamada ao FlowLab', async () => {
    const fetchSpy = stubDisponibilidade()
    await Promise.all([flowlab.getDisponibilidadeCacheada(), flowlab.getDisponibilidadeCacheada()])
    expect(fetchSpy.calls()).toBe(1)
  })

  it('refaz a busca após invalidar (ex.: novo agendamento)', async () => {
    const fetchSpy = stubDisponibilidade()
    await flowlab.getDisponibilidadeCacheada()
    flowlab.invalidarDisponibilidade()
    await flowlab.getDisponibilidadeCacheada()
    expect(fetchSpy.calls()).toBe(2)
  })
})
