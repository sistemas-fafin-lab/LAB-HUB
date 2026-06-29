import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxies hoisted p/ os singletons supabase e flowlab.
const h = vi.hoisted(() => {
  let sb: Record<string, unknown> | null = null
  let fl: Record<string, unknown> | null = null
  return {
    sbProxy: new Proxy({}, { get: (_t, p: string) => sb?.[p] }),
    flProxy: new Proxy({}, { get: (_t, p: string) => fl?.[p] }),
    setSb: (x: Record<string, unknown>) => {
      sb = x
    },
    setFl: (x: Record<string, unknown>) => {
      fl = x
    },
  }
})
vi.mock('../src/lib/supabase.js', () => ({ supabase: h.sbProxy }))
vi.mock('../src/lib/flowlab.js', () => ({ flowlab: h.flProxy }))

import { agendamentosRoutes } from '../src/routes/agendamentos.js'
import { buildApp, createSupabaseMock, type SupaHandler, type SupaResult } from './helpers.js'

const AG_ID = '11111111-1111-1111-1111-111111111111'
const POSTO_ID = '22222222-2222-2222-2222-222222222222'
const SLOT = '2026-07-01T10:00:00.000Z'

function pendingRow(): Record<string, unknown> {
  return {
    id: AG_ID,
    paciente_id: 'pac-1',
    posto_flowlab_id: POSTO_ID,
    posto_nome: 'Posto Centro',
    data_hora: SLOT,
    status: 'pendente',
    flowlab_id: null,
    criado_em: '2026-06-29T00:00:00.000Z',
  }
}

// Roteia as queries do fluxo de agendamentos pelo cenário do teste.
function supaHandler(scenario: {
  load?: SupaResult
  claim?: SupaResult
  insert?: SupaResult
}): SupaHandler {
  return (call) => {
    if (call.table === 'pacientes') {
      // Lookup do auth (filtro auth_user_id) vs. carga de dados (filtro id).
      if ('auth_user_id' in call.filters) return { data: { id: 'pac-1' }, error: null }
      return { data: { nome: 'Maria', telefone: '+5511999999999' }, error: null }
    }
    if (call.table === 'agendamentos') {
      if (call.op === 'insert') return scenario.insert ?? { data: null, error: null }
      if (call.op === 'select') return scenario.load ?? { data: null, error: null }
      // Reivindicação do lock (UPDATE condicional com status=pendente).
      if (call.op === 'update' && call.filters.status === 'pendente') {
        return scenario.claim ?? { data: null, error: null }
      }
      return { error: null } // confirm / release
    }
    return { data: null, error: null }
  }
}

function flowlabMock(over: Partial<{ receiveAgendamento: unknown; getDisponibilidade: unknown }> = {}) {
  return {
    getDisponibilidade: over.getDisponibilidade ?? vi.fn(async () => []),
    receiveAgendamento: over.receiveAgendamento ?? vi.fn(async () => ({ flowlabId: 'fl-new' })),
    invalidarDisponibilidade: vi.fn(),
  }
}

describe('POST /agendamentos/:id/sync (reprocesso + lock anti-corrida)', () => {
  let app: FastifyInstance

  async function sync(): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: 'POST',
      url: `/agendamentos/${AG_ID}/sync`,
      headers: { authorization: 'Bearer test-token' },
    })
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : {} }
  }

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  it('é idempotente em agendamento já confirmado: não chama o FlowLab', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: { ...pendingRow(), status: 'confirmado', flowlab_id: 'fl-old' }, error: null } }),
    })
    const fl = flowlabMock()
    h.setSb(supa.client)
    h.setFl(fl)
    app = await buildApp(agendamentosRoutes)

    const { status, body } = await sync()
    expect(status).toBe(200)
    expect(body.status).toBe('confirmado')
    expect(body.flowlabId).toBe('fl-old')
    expect(fl.receiveAgendamento).not.toHaveBeenCalled()
    // Não tenta reivindicar o lock.
    expect(supa.calls.some((c) => c.table === 'agendamentos' && c.op === 'update')).toBe(false)
  })

  it('sincroniza pendente com sucesso e confirma', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: pendingRow(), error: null }, claim: { data: pendingRow(), error: null } }),
    })
    const fl = flowlabMock({ receiveAgendamento: vi.fn(async () => ({ flowlabId: 'fl-new' })) })
    h.setSb(supa.client)
    h.setFl(fl)
    app = await buildApp(agendamentosRoutes)

    const { status, body } = await sync()
    expect(status).toBe(200)
    expect(body.status).toBe('confirmado')
    expect(body.flowlabId).toBe('fl-new')
    expect(fl.receiveAgendamento).toHaveBeenCalledOnce()
  })

  it('responde 502 quando o FlowLab está indisponível', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: pendingRow(), error: null }, claim: { data: pendingRow(), error: null } }),
    })
    const fl = flowlabMock({
      receiveAgendamento: vi.fn(async () => {
        throw new Error('FlowLab fora')
      }),
    })
    h.setSb(supa.client)
    h.setFl(fl)
    app = await buildApp(agendamentosRoutes)

    const { status } = await sync()
    expect(status).toBe(502)
  })

  it('não chama o FlowLab quando o lock já está tomado por outro processo', async () => {
    // load diz "pendente", mas o UPDATE de reivindicação não afeta nenhuma linha
    // (data: null) — outro processo já detém o lock. É o cerne da anti-corrida.
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: pendingRow(), error: null }, claim: { data: null, error: null } }),
    })
    const fl = flowlabMock()
    h.setSb(supa.client)
    h.setFl(fl)
    app = await buildApp(agendamentosRoutes)

    const { status, body } = await sync()
    expect(status).toBe(200)
    expect(body.status).toBe('pendente')
    expect(fl.receiveAgendamento).not.toHaveBeenCalled()
  })

  it('responde 404 quando o agendamento não existe (ou não é do paciente)', async () => {
    const supa = createSupabaseMock({ handler: supaHandler({ load: { data: null, error: null } }) })
    h.setSb(supa.client)
    h.setFl(flowlabMock())
    app = await buildApp(agendamentosRoutes)

    const { status } = await sync()
    expect(status).toBe(404)
  })
})

describe('POST /agendamentos/:id/cancelar (mantém histórico)', () => {
  let app: FastifyInstance

  async function cancelar(): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: 'POST',
      url: `/agendamentos/${AG_ID}/cancelar`,
      headers: { authorization: 'Bearer test-token' },
    })
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : {} }
  }

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  it('cancela um agendamento confirmado e devolve status cancelado', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: { ...pendingRow(), status: 'confirmado', flowlab_id: 'fl-old' }, error: null } }),
    })
    h.setSb(supa.client)
    h.setFl(flowlabMock())
    app = await buildApp(agendamentosRoutes)

    const { status, body } = await cancelar()
    expect(status).toBe(200)
    expect(body.status).toBe('cancelado')
    // Não deleta a linha — só faz UPDATE de status (preserva o histórico).
    expect(supa.calls.some((c) => c.table === 'agendamentos' && c.op === 'delete')).toBe(false)
    expect(supa.calls.some((c) => c.table === 'agendamentos' && c.op === 'update')).toBe(true)
  })

  it('é idempotente em agendamento já cancelado: não faz novo UPDATE', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: { ...pendingRow(), status: 'cancelado' }, error: null } }),
    })
    h.setSb(supa.client)
    h.setFl(flowlabMock())
    app = await buildApp(agendamentosRoutes)

    const { status, body } = await cancelar()
    expect(status).toBe(200)
    expect(body.status).toBe('cancelado')
    expect(supa.calls.some((c) => c.table === 'agendamentos' && c.op === 'update')).toBe(false)
  })

  it('responde 409 ao tentar cancelar uma coleta já realizada', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ load: { data: { ...pendingRow(), status: 'realizado' }, error: null } }),
    })
    h.setSb(supa.client)
    h.setFl(flowlabMock())
    app = await buildApp(agendamentosRoutes)

    const { status } = await cancelar()
    expect(status).toBe(409)
  })

  it('responde 404 quando o agendamento não existe (ou não é do paciente)', async () => {
    const supa = createSupabaseMock({ handler: supaHandler({ load: { data: null, error: null } }) })
    h.setSb(supa.client)
    h.setFl(flowlabMock())
    app = await buildApp(agendamentosRoutes)

    const { status } = await cancelar()
    expect(status).toBe(404)
  })
})

describe('POST /agendamentos (criação resiliente a falha do FlowLab)', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  it('mantém 201 com status pendente quando o sync inicial falha', async () => {
    const supa = createSupabaseMock({
      handler: supaHandler({ insert: { data: pendingRow(), error: null }, claim: { data: pendingRow(), error: null } }),
    })
    const fl = flowlabMock({
      getDisponibilidade: vi.fn(async () => [{ id: POSTO_ID, nome: 'Posto Centro', slots: [SLOT] }]),
      receiveAgendamento: vi.fn(async () => {
        throw new Error('FlowLab fora')
      }),
    })
    h.setSb(supa.client)
    h.setFl(fl)
    app = await buildApp(agendamentosRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/agendamentos',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      payload: JSON.stringify({ postoFlowlabId: POSTO_ID, dataHora: SLOT }),
    })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).status).toBe('pendente')
  })
})
