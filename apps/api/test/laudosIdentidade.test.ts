import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxy hoisted p/ o singleton supabase (mesmo padrão de laudos.test.ts).
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
import { conferirCpf, deveBloquear } from '../src/laudos/identidade.js'
import { buildPacienteMap, normalizaIdOsLis } from '../src/laudos/aol.js'
import { ExamResultRepository } from '../src/laudos/repository.js'
import { DatabaseError } from '../src/laudos/errors.js'
import { buildApp, createSupabaseMock, type SupaHandler, type SupaResult } from './helpers.js'

// Testes da BARREIRA DE IDENTIDADE: o laudo servido é mesmo do paciente do token?
//
// O pipeline atribui uma OS a um paciente por um `idOsLis` digitado à mão pela
// recepção, sobre uma listagem que contém TODOS os pacientes da entidade. Estes
// testes fixam o que acontece quando esse palpite erra.

const CPF = '52998224725' // do paciente do token (válido pelos dígitos)
const OUTRO_CPF = '11144477735' // de terceiro — o que nunca pode vazar

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

interface Cenario {
  /** Linhas devolvidas por findAllRows (busca ao vivo). */
  linhas?: unknown[]
  /** Linhas devolvidas por findByPaciente (caminho cacheado). */
  cacheadas?: unknown[]
  /** Resultado do insert (p/ simular o conflito de posse). */
  insert?: SupaResult
}

function supaHandler(cenario: Cenario = {}): SupaHandler {
  return (call) => {
    if (call.table === 'pacientes') {
      // authenticate resolve por auth_user_id; dadosDoPaciente, por id.
      if (call.filters.auth_user_id) return { data: { id: 'pac-1' }, error: null }
      return {
        data: { id: 'pac-1', cpf: CPF, data_nascimento: '1990-01-01', sexo: 'M' },
        error: null,
      }
    }

    if (call.table === 'exam_results') {
      if (call.op === 'insert') return cenario.insert ?? { error: null }
      if (call.op === 'update') return { error: null }
      // findByPaciente é a única leitura que filtra por `result is not null`.
      if ('result__not_is' in call.filters) return { data: cenario.cacheadas ?? [], error: null }
      // findByCodigoLis / findByCodigoOs terminam em maybeSingle.
      if (call.filters.codigo_lis || call.filters.codigo_os) return { data: null, error: null }
      return { data: cenario.linhas ?? [], error: null }
    }

    return { data: null, error: null }
  }
}

// ---------------------------------------------------------------------------
// LIS
// ---------------------------------------------------------------------------

interface RespostaLis {
  /** Requisições devolvidas pelo requisicaoListar do ApLIS. */
  listar?: Array<Record<string, unknown>>
  /** `dat` do requisicaoResultado, por código de requisição. */
  resultado?: Record<string, Record<string, unknown>>
  /** Registros do orders/status da AOL. */
  ordens?: Array<{ orderId: string; idOsLis: string }>
  /** XML do PUT /v2/resultados da AOL. */
  xmlOs?: string
}

/** fetch que atende os dois LIS: ApLIS é POST com body JSON, AOL é GET/PUT. */
function fetchLis(resposta: RespostaLis) {
  return vi.fn((url: string | URL, init?: { method?: string; body?: string }) => {
    const alvo = String(url)

    if (alvo.includes('aplis')) {
      const { cmd, dat } = JSON.parse(init!.body!) as { cmd: string; dat: Record<string, string> }
      if (cmd === 'requisicaoListar') {
        const corpo = { dat: { sucesso: 1, qtdPaginas: 1, lista: resposta.listar ?? [] } }
        return Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }))
      }
      const encontrado = resposta.resultado?.[dat.codRequisicao!]
      if (!encontrado) return Promise.resolve(new Response('nao encontrado', { status: 404 }))
      return Promise.resolve(
        new Response(JSON.stringify({ dat: { sucesso: 1, ...encontrado } }), { status: 200 }),
      )
    }

    if (alvo.includes('orders/status')) {
      const corpo = { data: resposta.ordens ?? [], hasNext: false }
      return Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }))
    }

    return Promise.resolve(new Response(resposta.xmlOs ?? '<resultados/>', { status: 200 }))
  })
}

/** Requisição do ApLIS com um procedimento liberado. */
function datAplis(cpfDoPaciente: string, nome = 'GLICOSE'): Record<string, unknown> {
  return {
    codRequisicao: 'REQ-1',
    dtaColeta: '20/05/2026',
    dtaSaida: '22/05/2026',
    nomExame: 'MEDICINA LABORATORIAL',
    paciente: { nome: 'Fulano', cpf: cpfDoPaciente },
    procedimentos: [{ nome, resultado: '95', unidade: 'mg/dL', referencia: '70 - 99' }],
    localOrigem: { nome: 'CLAF' },
  }
}

/**
 * OS da AOL com um analito, declarando `cpfDaOs` como dono.
 *
 * A estrutura é a da resposta REAL de produção (OS 379779766, capturada em
 * 27/07/2026 com `auditar-vinculos.ts --dump-xml`): o <paciente> é um cadastro
 * e a <solicitacao> o referencia pelo atributo `paciente`. O CPF vai pontuado
 * de propósito — é como a Álvaro manda.
 */
function xmlOs(cpfDaOs: string, analito = 'COLESTEROL TOTAL'): string {
  const pontuado = cpfDaOs.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return `<?xml version="1.0" encoding="UTF-8"?>
<resultados>
  <cadastros>
    <pacientes>
      <paciente codigo="442086219" codigo_lis="${pontuado}" nome="FULANO" sexo="F"/>
    </pacientes>
    <exame codigo="0040" descricao="COLESTEROL">
      <linhasresultado><linha codigo="L1" descricao="${analito}" unidade="mg/dL"/></linhasresultado>
    </exame>
  </cadastros>
  <solicitacao codigo="OS-DE-OUTRO" dataColeta="20/05/2026" paciente="442086219">
    <exame codigo="0040" dataresultado="22/05/2026">
      <resultado linharesultado="L1" resultado="300"/>
    </exame>
  </solicitacao>
</resultados>`
}

function linha(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'row-1',
    paciente_id: 'pac-1',
    cpf: CPF,
    codigo_os: null,
    codigo_lis: 'REQ-1',
    result: null,
    cached_at: null,
    ...over,
  }
}

let app: FastifyInstance | null = null

async function build(cenario: Cenario = {}): Promise<FastifyInstance> {
  const mock = createSupabaseMock({ handler: supaHandler(cenario) })
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

interface CorpoLaudos {
  exams: Array<{ name: string; source: string; panels: Array<{ name: string }> }>
}

// ---------------------------------------------------------------------------

describe('conferirCpf', () => {
  it('confere ignorando a formatação — a AOL manda pontuado e o ApLIS não', () => {
    expect(conferirCpf(CPF, '529.982.247-25')).toBe('confere')
    expect(conferirCpf('529.982.247-25', CPF)).toBe('confere')
  })

  it('acusa divergência entre CPFs completos', () => {
    expect(conferirCpf(CPF, OUTRO_CPF)).toBe('diverge')
  })

  it('trata ausente, vazio e truncado como indisponível, não como divergente', () => {
    expect(conferirCpf(CPF, null)).toBe('indisponivel')
    expect(conferirCpf(CPF, undefined)).toBe('indisponivel')
    expect(conferirCpf(CPF, '')).toBe('indisponivel')
    expect(conferirCpf(CPF, '5299822472')).toBe('indisponivel')
  })

  it('só bloqueia divergência — indisponível passa, senão a tela zeraria', () => {
    expect(deveBloquear('diverge')).toBe(true)
    expect(deveBloquear('indisponivel')).toBe(false)
    expect(deveBloquear('confere')).toBe(false)
  })
})

describe('buildPacienteMap', () => {
  // Forma real do cadastro (resposta de produção capturada em 27/07/2026).
  const cadastros = {
    pacientes: {
      paciente: [{ '@_codigo': '442086219', '@_codigo_lis': '179.532.547-00', '@_sexo': 'F' }],
    },
  }

  it('indexa o CPF do cadastro pelo código que a solicitação referencia', () => {
    expect(buildPacienteMap(cadastros).get('442086219')).toBe('17953254700')
  })

  it('não confunde o código interno da Álvaro com CPF', () => {
    // `codigo` tem 9 dígitos; só um valor de 11 vira identidade.
    const semCpf = { pacientes: { paciente: [{ '@_codigo': '442086219' }] } }
    expect(buildPacienteMap(semCpf).size).toBe(0)
  })

  it('cadastro ausente devolve mapa vazio em vez de explodir', () => {
    expect(buildPacienteMap({}).size).toBe(0)
    expect(buildPacienteMap(undefined).size).toBe(0)
  })
})

describe('normalizaIdOsLis', () => {
  it('a coerção O→0 pode fazer um idOsLis errado casar com a requisição de outro', () => {
    // É a razão de a barreira existir: o campo é digitado à mão e a normalização,
    // que recupera erros de digitação, também aproxima códigos de pacientes
    // diferentes. Aqui um "O" no lugar do zero produz um código legítimo alheio.
    expect(normalizaIdOsLis('OO4OOO1821OO6')).toBe('0040001821006')
  })
})

describe('GET /laudos — barreira de identidade', () => {
  it('não mostra o laudo quando o ApLIS devolve o CPF de outro paciente', async () => {
    vi.stubGlobal(
      'fetch',
      fetchLis({
        listar: [{ CodRequisicao: 'REQ-1', CPF, NomExame: 'MEDICINA LABORATORIAL' }],
        resultado: { 'REQ-1': datAplis(OUTRO_CPF) },
      }),
    )
    const server = await build({ linhas: [linha()] })

    const res = await server.inject({ method: 'GET', url: '/laudos?refresh=true', headers: auth })

    expect(res.statusCode).toBe(200)
    // O ponto: some da resposta em vez de aparecer com o nome do paciente certo.
    expect((res.json() as CorpoLaudos).exams).toHaveLength(0)
  })

  it('deixa passar quando o LIS não informa o CPF — indisponível não é divergente', async () => {
    // A instalação de teste do ApLIS não preenche o paciente; bloquear aqui
    // esvaziaria a tela de todo mundo em vez de proteger alguém.
    //
    // O laudo produzido é ApLIS puro, que o corte de fonte esconderia; a flag
    // sai do caminho para a asserção falar da barreira de identidade e não dele.
    vi.stubEnv('LAUDOS_SOMENTE_ALVARO', 'false')
    const semPaciente = { ...datAplis(CPF), paciente: {} }
    vi.stubGlobal(
      'fetch',
      fetchLis({
        listar: [{ CodRequisicao: 'REQ-1', CPF, NomExame: 'MEDICINA LABORATORIAL' }],
        resultado: { 'REQ-1': semPaciente },
      }),
    )
    const server = await build({ linhas: [linha()] })

    const res = await server.inject({ method: 'GET', url: '/laudos?refresh=true', headers: auth })

    expect(res.statusCode).toBe(200)
    expect((res.json() as CorpoLaudos).exams).toHaveLength(1)
  })

  it('OS vinculada ao paciente errado não entrega os valores alheios', async () => {
    // Cenário da colisão de idOsLis: a linha do paciente ficou ligada a uma OS de
    // terceiro. A AOL devolve os valores DELE; a requisição do ApLIS é legítima.
    //
    // A degradação testada aqui TERMINA num laudo ApLIS puro, que o corte de
    // fonte esconderia — em produção, com a flag ligada, o exame some em vez de
    // degradar (mais restritivo, e igualmente sem valor alheio). A flag sai do
    // caminho para o teste continuar provando que a OS alheia é descartada.
    vi.stubEnv('LAUDOS_SOMENTE_ALVARO', 'false')
    vi.stubGlobal(
      'fetch',
      fetchLis({
        listar: [{ CodRequisicao: 'REQ-1', CPF, NomExame: 'MEDICINA LABORATORIAL' }],
        resultado: { 'REQ-1': datAplis(CPF) },
        xmlOs: xmlOs(OUTRO_CPF),
      }),
    )
    const server = await build({ linhas: [linha({ codigo_os: 'OS-DE-OUTRO' })] })

    const res = await server.inject({ method: 'GET', url: '/laudos?refresh=true', headers: auth })

    expect(res.statusCode).toBe(200)
    const { exams } = res.json() as CorpoLaudos
    // Degrada para a capa do ApLIS — o exame do paciente continua visível...
    expect(exams).toHaveLength(1)
    expect(exams[0]?.source).toBe('aplis')
    // ...sem nenhum marcador vindo da OS alheia.
    expect(exams[0]?.panels.map((p) => p.name)).toEqual(['GLICOSE'])
  })

  it('não serve a linha cacheada cujo CPF gravado diverge do paciente do token', async () => {
    // Vínculo errado gravado ANTES da barreira: o caminho cacheado nunca volta ao
    // LIS, então sem esta checagem ele serviria o dado errado para sempre.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const fresco = new Date().toISOString()
    const server = await build({
      // `source: 'merged'` (valores do Álvaro) para os dois: o que se testa aqui
      // é o CPF gravado na linha, e um laudo ApLIS-only sairia da resposta pelo
      // corte de fonte — o teste passaria sem provar nada sobre a barreira.
      cacheadas: [
        { cpf: CPF, result: [{ name: 'Hemograma', source: 'merged', panels: [] }], cached_at: fresco },
        { cpf: OUTRO_CPF, result: [{ name: 'Laudo de outro', source: 'merged', panels: [] }], cached_at: fresco },
      ],
    })

    const res = await server.inject({ method: 'GET', url: '/laudos', headers: auth })

    expect(res.statusCode).toBe(200)
    const { exams } = res.json() as CorpoLaudos
    expect(exams.map((e) => e.name)).toEqual(['Hemograma'])
    // Cache fresco: nada saiu para o LIS — o filtro foi do lado de cá.
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('conflito de posse do codigo_lis', () => {
  it('marca a violação de unicidade como conflito, não como falha genérica', async () => {
    // `codigo_lis` é UNIQUE GLOBAL: 23505 significa que o código já é da linha de
    // outro paciente. Sem a marca, isso virava um warn indistinguível de erro de
    // banco — e o paciente legítimo ficava sem o laudo, em silêncio.
    const mock = createSupabaseMock({
      handler: () => ({ error: { code: '23505', message: 'duplicate key' } }),
    })
    h.setSb(mock.client)

    const erro = await new ExamResultRepository()
      .insertAwaiting('pac-1', CPF, 'REQ-1', null)
      .catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(DatabaseError)
    expect((erro as DatabaseError).context.conflitoDePosse).toBe(true)
  })

  it('erro de banco comum não é confundido com conflito de posse', async () => {
    const mock = createSupabaseMock({
      handler: () => ({ error: { code: '08006', message: 'connection failure' } }),
    })
    h.setSb(mock.client)

    const erro = await new ExamResultRepository()
      .insertAwaiting('pac-1', CPF, 'REQ-1', null)
      .catch((e: unknown) => e)

    expect((erro as DatabaseError).context.conflitoDePosse).toBe(false)
  })
})
