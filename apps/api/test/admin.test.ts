import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxy hoisted p/ o singleton supabase.
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

import { adminRoutes } from '../src/routes/admin.js'
import { buildApp, createSupabaseMock, type SupaHandler, type SupaResult } from './helpers.js'

const ADMIN_EMAIL_VAR = 'ADMIN_EMAIL'
const AMBIENTE = 'NODE_ENV'
const originalAdminEmail = process.env[ADMIN_EMAIL_VAR]
const originalAmbiente = process.env[AMBIENTE]

afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env[ADMIN_EMAIL_VAR]
  else process.env[ADMIN_EMAIL_VAR] = originalAdminEmail
  if (originalAmbiente === undefined) delete process.env[AMBIENTE]
  else process.env[AMBIENTE] = originalAmbiente
})

const ADMIN_EMAIL = 'teste@gmail.com'
const ALVO_ID = 'alvo-pac-1'
const CPF_VALIDO = '52998224725' // dígitos verificadores reais
const RES_ID = '44444444-4444-4444-4444-444444444444'

function habilitarAdminDev(): void {
  delete process.env[AMBIENTE]
  process.env[ADMIN_EMAIL_VAR] = ADMIN_EMAIL
}

function authHeader(): Record<string, string> {
  return { authorization: 'Bearer token-valido' }
}

function pacienteAlvoRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: ALVO_ID, nome: 'Maria Alvo', cpf: CPF_VALIDO, ...over }
}

function resultadoRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RES_ID,
    paciente_id: ALVO_ID,
    agendamento_id: null,
    exame_nome: 'Hemograma completo',
    categoria: null,
    status: 'liberado',
    resumo: null,
    paineis: [],
    laudo_url: null,
    declaracao_url: 'alvo-pac-1/algum-arquivo.pdf',
    liberado_em: '2026-07-20T12:00:00.000Z',
    flowlab_analise_id: null,
    ...over,
  }
}

interface Cenario {
  pacienteAlvo?: SupaResult
  resultados?: SupaResult
  getUser?: SupaResult
}

function supaHandler(cenario: Cenario): SupaHandler {
  return (call) => {
    if (call.table === 'pacientes') {
      return cenario.pacienteAlvo ?? { data: pacienteAlvoRow(), error: null }
    }
    if (call.table === 'resultados') {
      return cenario.resultados ?? { data: [resultadoRow()], error: null }
    }
    return { data: null, error: null }
  }
}

function setup(cenario: Cenario = {}) {
  const mock = createSupabaseMock({
    handler: supaHandler(cenario),
    getUser: cenario.getUser ?? {
      data: { user: { id: 'auth-user-1', email: ADMIN_EMAIL } },
      error: null,
    },
  })
  h.setSb(mock.client)
  return mock
}

let app: FastifyInstance
afterEach(async () => {
  await app?.close()
  vi.clearAllMocks()
})

async function buscarPorCpf(cpf: string, headers: Record<string, string> = authHeader()) {
  return app.inject({
    method: 'GET',
    url: `/admin/resultados-por-cpf?cpf=${encodeURIComponent(cpf)}`,
    headers,
  })
}

describe('GET /admin/resultados-por-cpf — autorização', () => {
  it('sem token não chega ao banco (401)', async () => {
    habilitarAdminDev()
    const mock = setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO, {})

    expect(res.statusCode).toBe(401)
    expect(mock.calls).toHaveLength(0)
  })

  it('token inválido devolve 401', async () => {
    habilitarAdminDev()
    setup({ getUser: { data: { user: null }, error: { message: 'invalid' } } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(401)
  })

  it('em produção, mesmo com ADMIN_EMAIL configurado e e-mail batendo, nega (403)', async () => {
    process.env[AMBIENTE] = 'production'
    process.env[ADMIN_EMAIL_VAR] = ADMIN_EMAIL
    const mock = setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(403)
    expect(mock.calls.find((c) => c.table === 'resultados')).toBeUndefined()
  })

  it('fora de produção, sem ADMIN_EMAIL configurado, nega (403)', async () => {
    delete process.env[AMBIENTE]
    delete process.env[ADMIN_EMAIL_VAR]
    setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(403)
  })

  it('sessão autenticada com e-mail diferente do configurado nega (403)', async () => {
    habilitarAdminDev()
    setup({ getUser: { data: { user: { id: 'auth-user-2', email: 'outro@gmail.com' } }, error: null } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(403)
  })

  it('comparação de e-mail ignora caixa', async () => {
    habilitarAdminDev()
    setup({ getUser: { data: { user: { id: 'auth-user-1', email: 'TESTE@GMAIL.COM' } }, error: null } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(200)
  })
})

describe('GET /admin/resultados-por-cpf — validação de CPF', () => {
  it('CPF inválido devolve 400 sem consultar paciente-alvo nem resultados', async () => {
    habilitarAdminDev()
    const mock = setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf('12345678900')

    expect(res.statusCode).toBe(400)
    expect(mock.calls.find((c) => c.table === 'resultados')).toBeUndefined()
    expect(mock.calls.find((c) => c.table === 'pacientes' && c.filters.cpf)).toBeUndefined()
  })

  it('aceita CPF formatado, normalizando para 11 dígitos antes de consultar', async () => {
    habilitarAdminDev()
    const mock = setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf('529.982.247-25')

    expect(res.statusCode).toBe(200)
    const consultaAlvo = mock.calls.find((c) => c.table === 'pacientes' && c.filters.cpf)
    expect(consultaAlvo?.filters).toMatchObject({ cpf: CPF_VALIDO, excluido_em: null })
  })
})

describe('GET /admin/resultados-por-cpf — resolução do paciente-alvo', () => {
  it('paciente inexistente devolve 404', async () => {
    habilitarAdminDev()
    setup({ pacienteAlvo: { data: null, error: null } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(404)
  })

  it('exclui paciente com excluido_em preenchido, filtrando na query', async () => {
    habilitarAdminDev()
    const mock = setup()
    app = await buildApp(adminRoutes)

    await buscarPorCpf(CPF_VALIDO)

    const consultaAlvo = mock.calls.find((c) => c.table === 'pacientes' && c.filters.cpf)
    expect(consultaAlvo?.filters.excluido_em).toBe(null)
  })

  it('falha do banco ao buscar paciente devolve 500', async () => {
    habilitarAdminDev()
    setup({ pacienteAlvo: { data: null, error: { message: 'timeout' } } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(500)
  })
})

describe('GET /admin/resultados-por-cpf — sucesso', () => {
  it('devolve identidade mínima e os resultados do paciente resolvido pelo servidor', async () => {
    habilitarAdminDev()
    const mock = setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.paciente).toMatchObject({ id: ALVO_ID, nome: 'Maria Alvo', cpf: CPF_VALIDO })
    expect(body.resultados).toHaveLength(1)
    expect(body.resultados[0]).toMatchObject({ id: RES_ID, exameNome: 'Hemograma completo' })

    // A listagem de resultados usa o id resolvido no servidor pela busca do
    // CPF — nunca um id que o navegador poderia enviar.
    const consultaResultados = mock.calls.find((c) => c.table === 'resultados')
    expect(consultaResultados?.filters).toMatchObject({ paciente_id: ALVO_ID })
  })

  // Spec (Implementation Decisions): "Não serão retornados... capacidades de
  // download" — mesmo sendo só o path do bucket (não uma signed URL), a
  // consulta admin não devolve nenhuma referência a arquivo de terceiro.
  it('não devolve laudoUrl nem declaracaoUrl mesmo quando o resultado tem declaração', async () => {
    habilitarAdminDev()
    setup()
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.json().resultados[0]).not.toHaveProperty('declaracaoUrl')
    expect(res.json().resultados[0]).not.toHaveProperty('laudoUrl')
  })

  it('paciente encontrado sem resultado devolve lista vazia (200), não 404', async () => {
    habilitarAdminDev()
    setup({ resultados: { data: [], error: null } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(200)
    expect(res.json().resultados).toEqual([])
  })

  it('falha do banco ao listar resultados devolve 500', async () => {
    habilitarAdminDev()
    setup({ resultados: { data: null, error: { message: 'timeout' } } })
    app = await buildApp(adminRoutes)

    const res = await buscarPorCpf(CPF_VALIDO)

    expect(res.statusCode).toBe(500)
  })
})
