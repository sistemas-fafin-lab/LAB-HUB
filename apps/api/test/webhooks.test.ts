import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxy hoisted para o singleton supabase: cada teste injeta seu mock via setSb.
const h = vi.hoisted(() => {
  let sb: Record<string, unknown> | null = null
  return {
    sbProxy: new Proxy({}, { get: (_t, p: string) => sb?.[p] }),
    setSb: (x: Record<string, unknown>) => {
      sb = x
    },
  }
})
vi.mock('../src/lib/supabase.js', () => ({ supabase: h.sbProxy }))

import { webhooksRoutes } from '../src/routes/webhooks.js'
import { buildApp, createSupabaseMock, signHmac, type SupaHandler } from './helpers.js'

const AG_ID = '11111111-1111-1111-1111-111111111111'

function validPayload(): Record<string, unknown> {
  return {
    agendamentoLabhubId: AG_ID,
    exameNome: 'Hemograma completo',
    paineis: [],
    liberadoEm: '2026-06-29T12:00:00.000Z',
  }
}

async function postWebhook(
  app: FastifyInstance,
  raw: string,
  signature = signHmac(raw),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/resultados',
    headers: { 'content-type': 'application/json', 'x-webhook-signature': signature },
    payload: raw,
  })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

describe('POST /webhooks/resultados', () => {
  let app: FastifyInstance

  async function setup(handler: SupaHandler): Promise<ReturnType<typeof createSupabaseMock>> {
    const supa = createSupabaseMock({ handler })
    h.setSb(supa.client)
    app = await buildApp(webhooksRoutes)
    return supa
  }

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  it('rejeita assinatura HMAC inválida com 401', async () => {
    await setup(() => ({ data: null, error: null }))
    const { status } = await postWebhook(app, JSON.stringify(validPayload()), 'assinatura-errada')
    expect(status).toBe(401)
  })

  it('responde 200 ignored (sem gravar) quando o agendamento não existe', async () => {
    const supa = await setup((call) => {
      if (call.table === 'agendamentos') return { data: null, error: null }
      return { data: null, error: null }
    })
    const { status, body } = await postWebhook(app, JSON.stringify(validPayload()))
    expect(status).toBe(200)
    expect(body.ignored).toBe('agendamento_nao_encontrado')
    // Não deve tentar inserir o resultado.
    expect(supa.calls.some((c) => c.table === 'resultados')).toBe(false)
  })

  it('responde 500 (sem ack) em erro transitório ao carregar o agendamento', async () => {
    const supa = await setup((call) => {
      if (call.table === 'agendamentos') return { data: null, error: { message: 'db indisponível' } }
      return { data: null, error: null }
    })
    const { status } = await postWebhook(app, JSON.stringify(validPayload()))
    expect(status).toBe(500)
    // Não confunde erro transitório com "não encontrado": não grava nada.
    expect(supa.calls.some((c) => c.table === 'resultados')).toBe(false)
  })

  it('grava o resultado e responde 201 no caminho feliz', async () => {
    await setup((call) => {
      if (call.table === 'agendamentos') {
        return { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
      }
      if (call.table === 'resultados') return { error: null }
      return { data: null, error: null }
    })
    const { status, body } = await postWebhook(app, JSON.stringify(validPayload()))
    expect(status).toBe(201)
    expect(body.ok).toBe(true)
  })

  it('trata reentrega duplicada (23505) como idempotente: 200 sem erro', async () => {
    await setup((call) => {
      if (call.table === 'agendamentos') {
        return { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
      }
      if (call.table === 'resultados') return { error: { code: '23505' } }
      return { data: null, error: null }
    })
    const { status, body } = await postWebhook(app, JSON.stringify(validPayload()))
    expect(status).toBe(200)
    expect(body.idempotency).toBe('ignored')
  })
})
