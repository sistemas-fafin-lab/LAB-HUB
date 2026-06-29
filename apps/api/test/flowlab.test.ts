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
