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
import { aadDe, cifrar, cifrarJson } from '../src/lib/crypto.js'

const LAUDO_ID = '44444444-4444-4444-4444-444444444444'
const CPF = '52998224725' // CPF válido pelos dígitos verificadores

// Laudo mínimo no formato gravado em exam_results.result.
//
// `source: 'merged'` (valores do Álvaro + capa do ApLIS) é o padrão porque o
// portal só exibe laudo com valor do Álvaro — ver LAUDOS_SOMENTE_ALVARO. Um
// fixture 'aplis' seria filtrado, e os testes que não são sobre esse corte
// falhariam por um motivo que não é o deles.
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
    codigo_os: '458213',
    codigo_lis: '0200058505001',
    source: 'merged',
    partial: false,
    ...over,
  }
}

/**
 * Completa as linhas de `exam_results` dos cenários com `id` e `cpf`.
 *
 * Os testes daqui são sobre cache, fusão de fontes e corte de fonte, e por isso
 * escrevem a linha com o mínimo que a asserção precisa. Só que uma linha real
 * SEMPRE tem as duas colunas — `cpf` é a segunda chave que impede servir o laudo
 * de outra pessoa —, e desde o corte do S-06 o repositório lança quando não acha
 * o CPF em nenhuma das duas colunas, em vez de seguir com `undefined`. Preencher
 * aqui mantém cada teste no seu assunto sem deixar a suíte exercitar uma linha
 * que o banco não produz.
 */
function completarExamResults(res: SupaResult): SupaResult {
  const completar = (linha: unknown, i: number): unknown => {
    if (!linha || typeof linha !== 'object') return linha
    const l = { id: `row-${i + 1}`, ...(linha as Record<string, unknown>) }
    const id = l.id as string
    // Depois do corte do S-06 as colunas em claro não existem mais: o cenário
    // escreve `cpf`/`result` por legibilidade e a conversão para envelope
    // acontece aqui, com o AAD correto da linha.
    const { cpf, result, ...resto } = l
    return {
      ...resto,
      cpf_enc: cifrar((cpf as string) ?? CPF, aadDe('exam_results', 'cpf', id)),
      ...(result != null
        ? { result_enc: cifrarJson(result, aadDe('exam_results', 'result', id)) }
        : { result_enc: null }),
    }
  }

  // O cenário é UM valor para todas as chamadas à tabela, mas o repositório usa
  // tanto `select` de lista quanto `maybeSingle` — daí as duas formas.
  if (Array.isArray(res.data)) return { ...res, data: res.data.map(completar) }
  if (res.data && typeof res.data === 'object') return { ...res, data: completar(res.data, 0) }
  return res
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
      return completarExamResults(scenario.examResults ?? { data: [], error: null })
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
  vi.unstubAllEnvs()
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
    // Este teste é sobre a RESILIÊNCIA do pipeline, não sobre o corte de fonte:
    // o laudo que ele produz é ApLIS puro (requisição sem OS no Álvaro), que o
    // padrão esconderia. Desligar a flag mantém o teste medindo o que ele mede.
    vi.stubEnv('LAUDOS_SOMENTE_ALVARO', 'false')

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

// Decisão de operação: por ora o portal exibe só laudo com valor medido no
// Álvaro Online. O corte é de EXIBIÇÃO — o ApLIS continua sendo consultado e o
// laudo ApLIS-only continua no cache, esperando a flag voltar.
describe('corte de fonte (LAUDOS_SOMENTE_ALVARO)', () => {
  const frescos = (...laudos: Array<Record<string, unknown>>): SupaResult => ({
    data: laudos.map((l) => ({ result: [l], cached_at: new Date().toISOString() })),
    error: null,
  })

  it('esconde da lista o laudo que só existe no ApLIS', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const server = await build(
      supaHandler({
        examResults: frescos(
          laudo({ name: 'Só no ApLIS', source: 'aplis', codigo_os: '' }),
          laudo({ name: 'Veio do Álvaro', source: 'merged' }),
        ),
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(200)
    const nomes = (res.json() as { exams: Array<{ name: string }> }).exams.map((e) => e.name)
    expect(nomes).toEqual(['Veio do Álvaro'])
  })

  it("mantém o laudo 'aol' puro, sem capa do ApLIS", async () => {
    vi.stubGlobal('fetch', vi.fn())
    const server = await build(
      supaHandler({
        examResults: frescos(laudo({ name: 'Só no Álvaro', source: 'aol', codigo_lis: null })),
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    const nomes = (res.json() as { exams: Array<{ name: string }> }).exams.map((e) => e.name)
    expect(nomes).toEqual(['Só no Álvaro'])
  })

  it('devolve lista vazia — e não erro — para quem só tem laudo do ApLIS', async () => {
    // O cache EXISTE, só não tem nada exibível. Não pode cair no caminho ao
    // vivo: seria varrer os LIS a cada requisição para chegar na mesma lista.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const server = await build(
      supaHandler({ examResults: frescos(laudo({ source: 'aplis', codigo_os: '' })) }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { source: string; exams: unknown[] }
    expect(body.exams).toEqual([])
    expect(body.source).toBe('cached')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('volta a mostrar as duas fontes com a flag desligada', async () => {
    vi.stubEnv('LAUDOS_SOMENTE_ALVARO', 'false')
    vi.stubGlobal('fetch', vi.fn())
    const server = await build(
      supaHandler({
        examResults: frescos(
          laudo({ name: 'Só no ApLIS', source: 'aplis', codigo_os: '' }),
          laudo({ name: 'Veio do Álvaro', source: 'merged' }),
        ),
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    const nomes = (res.json() as { exams: Array<{ name: string }> }).exams.map((e) => e.name)
    expect(nomes).toEqual(['Só no ApLIS', 'Veio do Álvaro'])
  })

  it('502 — e não lista vazia — quando a AOL cai e o corte esvazia o resultado', async () => {
    // O buraco que este teste fecha: a AOL fora do ar NÃO zera a busca (o ApLIS
    // responde), então os laudos existem — mas saem todos como `source: 'aplis'`
    // e o corte de fonte descarta cada um. Antes, a tela recebia [] com HTTP 200
    // e afirmava "você não tem exames", quando o certo era "não conseguimos
    // consultar". Repare que a flag fica no PADRÃO (ligada): é a configuração de
    // produção que produzia a mentira.
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
      // Só a AOL cai — é ela que sobrevive ao corte de fonte.
      if (String(url).includes('aol.test')) {
        return Promise.reject(new Error('read ECONNRESET'))
      }

      const { cmd } = JSON.parse(init?.body ?? '{}') as { cmd: string }
      if (cmd === 'requisicaoListar') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              dat: { sucesso: 1, qtdPaginas: 1, lista: [{ CodRequisicao: 'REQ-1', CPF: CPF, NomExame: 'TSH' }] },
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            dat: {
              sucesso: 1,
              codRequisicao: 'REQ-1',
              dtaColeta: '12/05/2026',
              dtaSaida: '18/05/2026',
              nomExame: 'TSH',
              paciente: { nome: 'Fulano', cpf: CPF },
              procedimentos: [{ nome: 'TSH', resultado: '2,1', unidade: 'mUI/L', referencia: '0,4 - 4,0' }],
              localOrigem: { nome: 'CLAF' },
            },
          }),
          { status: 200 },
        ),
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    // `result: null` → nada exibível em cache, então cai no caminho ao vivo.
    const server = await build(
      supaHandler({
        examResults: {
          data: [
            { id: 'row-1', paciente_id: 'pac-1', cpf: CPF, codigo_os: null, codigo_lis: 'REQ-1', result: null, cached_at: null },
          ],
          error: null,
        },
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(502)
  })

  it('200 com lista vazia quando a AOL responde e o paciente é mesmo só-ApLIS', async () => {
    // O contraponto do teste acima, e o que prova que o 502 de lá vem da AOL e
    // não de um efeito colateral do cenário: MESMO caminho ao vivo, MESMO laudo
    // ApLIS-only descartado pelo corte — mas com a AOL respondendo. Sem falha de
    // integração, lista vazia é a verdade (o paciente não tem laudo do Álvaro),
    // e a resposta certa é 200. A diferença entre "não tem" e "não sei" é
    // exatamente o que a correção passou a enxergar.
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
      if (String(url).includes('aol.test')) {
        return Promise.resolve(new Response(JSON.stringify({ data: [], hasNext: false }), { status: 200 }))
      }

      const { cmd } = JSON.parse(init?.body ?? '{}') as { cmd: string }
      if (cmd === 'requisicaoListar') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              dat: { sucesso: 1, qtdPaginas: 1, lista: [{ CodRequisicao: 'REQ-1', CPF: CPF, NomExame: 'TSH' }] },
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            dat: {
              sucesso: 1,
              codRequisicao: 'REQ-1',
              dtaColeta: '12/05/2026',
              dtaSaida: '18/05/2026',
              nomExame: 'TSH',
              paciente: { nome: 'Fulano', cpf: CPF },
              procedimentos: [{ nome: 'TSH', resultado: '2,1', unidade: 'mUI/L', referencia: '0,4 - 4,0' }],
              localOrigem: { nome: 'CLAF' },
            },
          }),
          { status: 200 },
        ),
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    const server = await build(
      supaHandler({
        examResults: {
          data: [
            { id: 'row-1', paciente_id: 'pac-1', cpf: CPF, codigo_os: null, codigo_lis: 'REQ-1', result: null, cached_at: null },
          ],
          error: null,
        },
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(200)
    expect((res.json() as { exams: unknown[] }).exams).toEqual([])
  })

  it('404 no GET /laudos/:id de uma linha só-ApLIS — senão ela sairia por aqui', async () => {
    const server = await build(
      supaHandler({
        examResults: { data: { result: [laudo({ source: 'aplis', codigo_os: '' })] }, error: null },
      }),
    )

    const res = await server.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })

    expect(res.statusCode).toBe(404)
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

describe('trilha de auditoria de acesso (S-08)', () => {
  // O mock precisa ser alcançável para inspecionar a trilha, e `build()` não o
  // devolve — daí a montagem local.
  async function buildComMock(handler: SupaHandler) {
    const mock = createSupabaseMock({ handler })
    h.setSb(mock.client)
    app = await buildApp(laudosRoutes)
    return { mock, server: app }
  }
  const trilha = (mock: ReturnType<typeof createSupabaseMock>) =>
    mock.calls.filter((c) => c.table === 'auditoria_acesso' && c.op === 'insert')

  it('a listagem registra quantos laudos foram entregues', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { mock, server } = await buildComMock(
      supaHandler({
        examResults: {
          data: [{ result: [laudo(), laudo({ name: 'Glicemia' })], cached_at: new Date().toISOString() }],
          error: null,
        },
      }),
    )

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(200)
    expect(trilha(mock)[0]?.payload).toMatchObject({
      ator_tipo: 'paciente',
      ator_id: 'pac-1',
      titular_id: 'pac-1',
      acao: 'laudos.listar',
      quantidade: 2,
    })
  })

  it('a leitura registra o id da LINHA do cache, não o id sorteado do laudo', async () => {
    // `laudo().id` é regerado a cada mapeamento; gravá-lo produziria um
    // recurso_id que não aponta para nada quando a trilha for consultada depois.
    const { mock, server } = await buildComMock(
      supaHandler({ examResults: { data: { result: [laudo()] }, error: null } }),
    )

    await server.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })

    expect(trilha(mock)[0]?.payload).toMatchObject({
      acao: 'laudos.ler',
      recurso_tipo: 'exam_result',
      recurso_id: LAUDO_ID,
      quantidade: 1,
    })
  })

  it('o 404 do laudo de outro paciente não vira linha na trilha', async () => {
    const { mock, server } = await buildComMock(
      supaHandler({ examResults: { data: null, error: null } }),
    )

    expect((await server.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })).statusCode).toBe(404)
    expect(trilha(mock)).toHaveLength(0)
  })

  it('trilha indisponível não derruba o laudo do paciente', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { mock, server } = await buildComMock((call) => {
      if (call.table === 'auditoria_acesso') return { data: null, error: { message: 'permission denied' } }
      return supaHandler({ examResults: { data: { result: [laudo()] }, error: null } })(call)
    })

    const res = await server.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: auth })

    expect(res.statusCode).toBe(200)
    expect(trilha(mock)).toHaveLength(1) // tentou gravar, e a falha ficou no log
  })
})
