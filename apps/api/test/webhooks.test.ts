import { afterEach, describe, expect, it, vi } from 'vitest'
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

function validColeta(status: 'em_coleta' | 'coletado' | 'bloqueado' = 'coletado'): Record<string, unknown> {
  return { agendamentoLabhubId: AG_ID, status }
}

// Snapshot de exames que acompanha o 'coletado' (um comum + uma cultura).
const EXAMES = [
  { nome: 'Hemograma completo', isCultura: false, material: 'Soro' },
  { nome: 'Urocultura', isCultura: true, material: 'Urina' },
]

async function postColeta(
  app: FastifyInstance,
  raw: string,
  signature = signHmac(raw),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/coletas',
    headers: { 'content-type': 'application/json', 'x-webhook-signature': signature },
    payload: raw,
  })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

// Handler que responde o SELECT do agendamento com `atual` e aceita o UPDATE.
function agendamentoComStatus(atual: string): SupaHandler {
  return (call) => {
    if (call.table === 'agendamentos' && call.op === 'update') return { error: null }
    if (call.table === 'agendamentos') return { data: { id: AG_ID, status: atual }, error: null }
    return { data: null, error: null }
  }
}

const houveUpdate = (supa: ReturnType<typeof createSupabaseMock>): boolean =>
  supa.calls.some((c) => c.table === 'agendamentos' && c.op === 'update')

describe('POST /webhooks/coletas', () => {
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
    await setup(agendamentoComStatus('confirmado'))
    const { status } = await postColeta(app, JSON.stringify(validColeta()), 'assinatura-errada')
    expect(status).toBe(401)
  })

  it('rejeita status desconhecido com 400', async () => {
    await setup(agendamentoComStatus('confirmado'))
    const raw = JSON.stringify({ agendamentoLabhubId: AG_ID, status: 'inexistente' })
    const { status } = await postColeta(app, raw)
    expect(status).toBe(400)
  })

  it('responde 200 ignored quando o agendamento não existe', async () => {
    const supa = await setup((call) => {
      if (call.table === 'agendamentos') return { data: null, error: null }
      return { data: null, error: null }
    })
    const { status, body } = await postColeta(app, JSON.stringify(validColeta()))
    expect(status).toBe(200)
    expect(body.ignored).toBe('agendamento_nao_encontrado')
    expect(houveUpdate(supa)).toBe(false)
  })

  it('responde 500 (sem ack) em erro transitório ao carregar o agendamento', async () => {
    const supa = await setup((call) => {
      if (call.table === 'agendamentos' && call.op === 'update') return { error: null }
      if (call.table === 'agendamentos') return { data: null, error: { message: 'db indisponível' } }
      return { data: null, error: null }
    })
    const { status } = await postColeta(app, JSON.stringify(validColeta()))
    expect(status).toBe(500)
    expect(houveUpdate(supa)).toBe(false)
  })

  it("mapeia 'coletado' → 'realizado' e grava (200)", async () => {
    const supa = await setup(agendamentoComStatus('em_coleta'))
    const { status, body } = await postColeta(app, JSON.stringify(validColeta('coletado')))
    expect(status).toBe(200)
    expect(body.status).toBe('realizado')
    const upd = supa.calls.find((c) => c.table === 'agendamentos' && c.op === 'update')
    expect((upd?.payload as { status?: string })?.status).toBe('realizado')
  })

  it("mapeia 'em_coleta' → 'em_coleta' e grava (200)", async () => {
    const supa = await setup(agendamentoComStatus('confirmado'))
    const { status, body } = await postColeta(app, JSON.stringify(validColeta('em_coleta')))
    expect(status).toBe(200)
    expect(body.status).toBe('em_coleta')
    const upd = supa.calls.find((c) => c.table === 'agendamentos' && c.op === 'update')
    expect((upd?.payload as { status?: string })?.status).toBe('em_coleta')
  })

  it("mapeia 'bloqueado' → 'bloqueado' e grava (200)", async () => {
    await setup(agendamentoComStatus('em_coleta'))
    const { status, body } = await postColeta(app, JSON.stringify(validColeta('bloqueado')))
    expect(status).toBe(200)
    expect(body.status).toBe('bloqueado')
  })

  it('é idempotente quando o status já é o alvo: 200 sem update', async () => {
    const supa = await setup(agendamentoComStatus('realizado'))
    const { status, body } = await postColeta(app, JSON.stringify(validColeta('coletado')))
    expect(status).toBe(200)
    expect(body.idempotency).toBe('ignored')
    expect(houveUpdate(supa)).toBe(false)
  })

  it('não regride de realizado: 200 ignored sem update', async () => {
    const supa = await setup(agendamentoComStatus('realizado'))
    const { status, body } = await postColeta(app, JSON.stringify(validColeta('em_coleta')))
    expect(status).toBe(200)
    expect(body.ignored).toBe('ja_realizado')
    expect(houveUpdate(supa)).toBe(false)
  })

  it('não revive um cancelado: 200 ignored sem update', async () => {
    const supa = await setup(agendamentoComStatus('cancelado'))
    const { status, body } = await postColeta(app, JSON.stringify(validColeta('coletado')))
    expect(status).toBe(200)
    expect(body.ignored).toBe('cancelado')
    expect(houveUpdate(supa)).toBe(false)
  })

  it('responde 500 quando o UPDATE falha', async () => {
    await setup((call) => {
      if (call.table === 'agendamentos' && call.op === 'update') return { error: { message: 'falhou' } }
      if (call.table === 'agendamentos') return { data: { id: AG_ID, status: 'em_coleta' }, error: null }
      return { data: null, error: null }
    })
    const { status } = await postColeta(app, JSON.stringify(validColeta('coletado')))
    expect(status).toBe(500)
  })

  it("grava status e exames quando o 'coletado' traz a lista", async () => {
    const supa = await setup(agendamentoComStatus('em_coleta'))
    const raw = JSON.stringify({ ...validColeta('coletado'), exames: EXAMES })
    const { status, body } = await postColeta(app, raw)
    expect(status).toBe(200)
    expect(body.status).toBe('realizado')
    const upd = supa.calls.find((c) => c.table === 'agendamentos' && c.op === 'update')
    const payload = upd?.payload as { status?: string; exames?: unknown[] }
    expect(payload?.status).toBe('realizado')
    expect(payload?.exames).toEqual(EXAMES)
  })

  it("não grava exames quando o 'coletado' vem sem a lista", async () => {
    const supa = await setup(agendamentoComStatus('em_coleta'))
    const { status } = await postColeta(app, JSON.stringify(validColeta('coletado')))
    expect(status).toBe(200)
    const upd = supa.calls.find((c) => c.table === 'agendamentos' && c.op === 'update')
    expect(upd?.payload as object).not.toHaveProperty('exames')
  })

  it('reconciliação: já realizado sem exames grava só os exames (200)', async () => {
    const supa = await setup(agendamentoComStatus('realizado'))
    const raw = JSON.stringify({ ...validColeta('coletado'), exames: EXAMES })
    const { status, body } = await postColeta(app, raw)
    expect(status).toBe(200)
    expect(body.exames).toBe(EXAMES.length)
    const upd = supa.calls.find((c) => c.table === 'agendamentos' && c.op === 'update')
    const payload = upd?.payload as { status?: string; exames?: unknown[] }
    expect(payload?.exames).toEqual(EXAMES)
    // Update só de exames — não mexe no status.
    expect(payload?.status).toBeUndefined()
  })
})
