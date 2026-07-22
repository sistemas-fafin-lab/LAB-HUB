import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxy hoisted p/ o singleton supabase (mesmo padrão de documentos.test.ts).
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

import { laudosRoutes } from '../src/routes/laudos.js'
import { buildApp, createSupabaseMock, type SupaHandler, type SupaResult } from './helpers.js'

const LAUDO_ID = '44444444-4444-4444-4444-444444444444'
const CPF = '52998224725' // CPF válido pelos dígitos verificadores

// Laudo mínimo no formato gravado em exam_results.result.
function laudo(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LAUDO_ID,
    name: 'Hemograma Completo',
    category: 'Hematologia',
    date: '12 Mai 2026',
    fullDate: '12 de maio de 2026',
    data_coleta: '2026-05-12',
    data_registro: '2026-05-12',
    data_emissao: '2026-05-18',
    material: 'Sangue Total com EDTA',
    metodo: 'Citometria de fluxo',
    laboratorio: { nome: 'CLAF', cnes: '', endereco: '' },
    unit: 'CLAF',
    doctor: 'Dra. Ana Lima',
    crm: 'CRM/DF 12345',
    status: 'ready',
    summary: 'Todos os analitos dentro dos valores de referência.',
    panels: [],
    exam_type: 'Hemograma',
    codigo_os: '',
    codigo_lis: '0200058505001',
    source: 'aplis',
    partial: false,
    ...over,
  }
}

// Roteia as queries das rotas de laudo pelo cenário do teste.
function supaHandler(
  scenario: { paciente?: SupaResult; examResults?: SupaResult } = {},
): SupaHandler {
  return (call) => {
    if (call.table === 'pacientes') {
      return (
        scenario.paciente ?? {
          data: { id: 'pac-1', cpf: CPF, data_nascimento: '2001-01-01', sexo: 'M' },
          error: null,
        }
      )
    }
    if (call.table === 'exam_results') {
      return scenario.examResults ?? { data: [], error: null }
    }
    return { data: null, error: null }
  }
}

let app: FastifyInstance | null = null

async function build(handler: SupaHandler, getUser?: SupaResult): Promise<FastifyInstance> {
  const mock = createSupabaseMock({ handler, ...(getUser ? { getUser } : {}) })
  h.setSb(mock.client)
  app = await buildApp(laudosRoutes)
  return app
}

afterEach(async () => {
  await app?.close()
  app = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const auth = { authorization: 'Bearer token-valido' }

describe('GET /laudos', () => {
  it('rejeita requisição sem token', async () => {
    const server = await build(supaHandler())

    const res = await server.inject({ method: 'GET', url: '/laudos' })

    expect(res.statusCode).toBe(401)
  })

  it('serve do cache sem consultar os LIS quando o laudo está fresco', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    // `result` é a lista de laudos da linha (um por exame da OS).
    const server = await build(
      supaHandler({
        examResults: { data: [{ result: [laudo()], cached_at: new Date().toISOString() }], error: null },
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { source: string; exams: Array<{ name: string }> }
    expect(body.source).toBe('cached')
    expect(body.exams[0]?.name).toBe('Hemograma Completo')
    // O ponto do cache: nenhuma chamada saiu para o ApLIS/AOL.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('responde 502 quando o ApLIS falha e não há nada em cache', async () => {
    // Sem linhas no banco, a busca ao vivo é síncrona — a falha do LIS chega ao cliente.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const server = await build(supaHandler({ examResults: { data: [], error: null } }))

    const res = await server.inject({ method: 'GET', url: '/laudos?refresh=true', headers: auth })

    expect(res.statusCode).toBe(502)
  })

  it('não deixa uma requisição quebrada derrubar as demais', async () => {
    // requisicaoListar devolve duas requisições; a segunda falha no detalhe.
    const fetchSpy = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const { cmd, dat } = JSON.parse(init.body) as { cmd: string; dat: Record<string, string> }

      if (cmd === 'requisicaoListar') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              dat: {
                sucesso: 1,
                qtdPaginas: 1,
                lista: [
                  { CodRequisicao: 'REQ-1', CPF: CPF, NomExame: 'PCR' },
                  { CodRequisicao: 'REQ-2', CPF: CPF, NomExame: 'TSH' },
                ],
              },
            }),
            { status: 200 },
          ),
        )
      }

      if (dat.codRequisicao === 'REQ-2') {
        return Promise.resolve(new Response('erro interno', { status: 500 }))
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            dat: {
              sucesso: 1,
              codRequisicao: 'REQ-1',
              dtaColeta: '12/05/2026',
              dtaSaida: '18/05/2026',
              nomExame: 'PCR',
              paciente: { nome: 'Fulano', cpf: CPF },
              procedimentos: [{ nome: 'PCR', resultado: '3,1', unidade: 'mg/L', referencia: '0 - 5' }],
              localOrigem: { nome: 'CLAF' },
            },
          }),
          { status: 200 },
        ),
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    // findAllRows devolve as duas linhas recém-registradas.
    const server = await build(
      supaHandler({
        examResults: {
          data: [
            { id: 'row-1', paciente_id: 'pac-1', cpf: CPF, codigo_os: null, codigo_lis: 'REQ-1', result: null, cached_at: null },
            { id: 'row-2', paciente_id: 'pac-1', cpf: CPF, codigo_os: null, codigo_lis: 'REQ-2', result: null, cached_at: null },
          ],
          error: null,
        },
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos?refresh=true', headers: auth })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { exams: Array<{ codigo_lis: string }> }
    expect(body.exams).toHaveLength(1)
    expect(body.exams[0]?.codigo_lis).toBe('REQ-1')
  })
})

describe('GET /laudos/:id', () => {
  it('devolve os laudos da linha do próprio paciente', async () => {
    const server = await build(supaHandler({ examResults: { data: { result: [laudo()] }, error: null } }))

    const res = await server.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })

    expect(res.statusCode).toBe(200)
    expect((res.json() as Array<{ name: string }>)[0]?.name).toBe('Hemograma Completo')
  })

  it('normaliza linha antiga com laudo único em lista', async () => {
    // Linha gravada antes da mudança de granularidade: objeto em vez de lista.
    const server = await build(supaHandler({ examResults: { data: { result: laudo() }, error: null } }))

    const res = await server.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })

    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ name: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]?.name).toBe('Hemograma Completo')
  })

  it('não devolve laudo de outro paciente', async () => {
    // O filtro por paciente_id na query faz o Supabase não achar a linha.
    const mock = createSupabaseMock({
      handler: (call) => {
        if (call.table === 'pacientes') return { data: { id: 'pac-1', cpf: CPF }, error: null }
        // Só devolve o laudo se a busca estiver escopada no paciente do token.
        if (call.filters.paciente_id !== 'pac-1') return { data: { result: laudo() }, error: null }
        return { data: null, error: null }
      },
    })
    h.setSb(mock.client)
    app = await buildApp(laudosRoutes)

    const res = await app.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })

    expect(res.statusCode).toBe(404)
    // Garante que o escopo foi aplicado, e não que a rota só devolveu vazio por acaso.
    const consulta = mock.calls.find((c) => c.table === 'exam_results')
    expect(consulta?.filters.paciente_id).toBe('pac-1')
  })
})
