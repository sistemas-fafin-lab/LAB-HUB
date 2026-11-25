import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'

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
import { LaudoOriginalService } from '../src/laudos/laudoOriginal.js'
import { ExamResultRepository } from '../src/laudos/repository.js'
import { IntegrationError } from '../src/laudos/errors.js'
import type { IAplisService } from '../src/laudos/aplis.js'
import type { AnexoLaudoExterno } from '../src/laudos/aplisSite.js'
import type { VinculoLaudoExterno } from '../src/laudos/laudoExterno.js'
import type { IAnexosLaudoExterno } from '../src/laudos/vinculoPdf.js'
import type { AplisRequisicao } from '../src/laudos/types.js'
import { aadDe, cifrar } from '../src/lib/crypto.js'
import { buildApp, createLoggerSpy, createSupabaseMock, type SupaCall } from './helpers.js'

// O paciente baixa o PDF que o laboratório de apoio emitiu, o mesmo anexado à
// requisição no apLIS. Os testes entram pela rota HTTP; do lado de fora ficam
// só o que é de fato externo: a API do apLIS e o site interno (com a leitura do
// PDF), trocados por dublês. Nenhum PDF nem dado real entra aqui.

const PACIENTE = 'pac-1'
const CPF = '52998224725'
const OUTRO_CPF = '11144477735'
const REQ = '0040000000001'
const ID_REQ = '9001'
const LINHA = 'linha-1'
const PDF = new TextEncoder().encode('%PDF-1.4 conteudo de teste')

const auth = { authorization: 'Bearer token-valido' }

const anexo = (idAnexo: string, over: Partial<AnexoLaudoExterno> = {}): AnexoLaudoExterno => ({
  idAnexo,
  // O nome que a recepção deu ao arquivo: pode trazer o nome de alguém.
  nomeArquivo: `FULANO DE TAL ${idAnexo}.pdf`,
  retificacao: false,
  ...over,
})

const laudoDe = (...cpfs: (string | null)[]): VinculoLaudoExterno => ({
  layout: 'atual',
  os: cpfs.map((cpf, i) => ({ numero: `11111110${i}`, cpf, nome: null, nascimento: null, paginas: 1 })),
})

interface Cenario {
  anexos?: AnexoLaudoExterno[]
  /** O que a leitura do PDF devolve, por id de anexo. Padrão: uma O.S. do paciente. */
  laudos?: Record<string, VinculoLaudoExterno>
  /** CPFs impressos em páginas sem O.S.; `null` = algum ilegível. Padrão: nenhum. */
  cpfsSemOs?: string[] | null
  /** O paciente dono do token. Padrão: o dono da requisição. */
  pacienteDoToken?: string
  comSite?: boolean
  siteForaDoAr?: boolean
}

let app: FastifyInstance | null = null

/** apLIS que não acha a requisição — basta para o teste do limite, que só conta chamadas. */
const aplisVazio = (): IAplisService => ({
  requisicaoListar: async () => [],
  requisicaoResultado: async () => {
    throw new Error('não usado')
  },
})

async function montar(cenario: Cenario = {}) {
  const pacienteDoToken = cenario.pacienteDoToken ?? PACIENTE
  const supa = createSupabaseMock({
    handler: (call: SupaCall) => {
      if (call.table === 'pacientes') {
        return {
          data: {
            id: pacienteDoToken,
            cpf_enc: cifrar(CPF, aadDe('pacientes', 'cpf', pacienteDoToken)),
            data_nascimento: '1990-01-01',
            sexo: 'M',
          },
          error: null,
        }
      }
      if (call.table === 'exam_results' && call.op === 'select') {
        // A linha é do PACIENTE: só responde ao filtro com o id dele.
        const eDele = call.filters.paciente_id === PACIENTE && call.filters.codigo_lis === REQ
        return {
          data: eDele
            ? {
                id: LINHA,
                paciente_id: PACIENTE,
                cpf_enc: cifrar(CPF, aadDe('exam_results', 'cpf', LINHA)),
                codigo_os: '111111100',
                codigo_lis: REQ,
                codigo_lis_pedido: null,
                result_enc: null,
                cached_at: null,
              }
            : null,
          error: null,
        }
      }
      return { data: null, error: null }
    },
  })
  h.setSb(supa.client)

  const aplis = {
    requisicaoListar: vi.fn(async (): Promise<AplisRequisicao[]> => [
      {
        cod_requisicao: REQ,
        id_requisicao: ID_REQ,
        data_solicitacao: null,
        data_liberacao: null,
        tipo_exame: null,
        paciente: { nome: '', cpf: CPF, data_nascimento: null, sexo: null },
        procedimentos: [],
        local: { nome: '', endereco: null, numero: null },
      },
    ]),
    requisicaoResultado: vi.fn(async () => {
      throw new Error('não usado')
    }),
  } satisfies IAplisService

  const site = {
    listarAnexos: vi.fn(async () => {
      if (cenario.siteForaDoAr) throw new IntegrationError('apLIS site: timeout', 'aplis-site')
      return cenario.anexos ?? [anexo('501')]
    }),
    baixarAnexo: vi.fn(async (a: AnexoLaudoExterno) => ({
      pdf: PDF,
      vinculo: cenario.laudos?.[a.idAnexo] ?? laudoDe(CPF),
      // `null` é um valor do cenário (CPF ilegível), não ausência.
      cpfsSemOs: cenario.cpfsSemOs === undefined ? [] : cenario.cpfsSemOs,
    })),
  } satisfies IAnexosLaudoExterno

  const log = createLoggerSpy()
  const laudoOriginal = new LaudoOriginalService(
    new ExamResultRepository(),
    aplis,
    cenario.comSite === false ? null : site,
  )
  app = await buildApp((instancia) => laudosRoutes(instancia, { laudoOriginal }), { logger: log })

  const auditoria = () =>
    supa.calls.filter((c) => c.table === 'auditoria_acesso' && c.op === 'insert').map((c) => c.payload)
  return { app, aplis, site, log, supa, auditoria }
}

const URL_LISTA = `/laudos/requisicoes/${REQ}/original`
const urlDoArquivo = (idAnexo: string): string => `${URL_LISTA}/${idAnexo}`

beforeEach(() => {
  vi.stubEnv('LAUDOS_OS_VIA_PDF', 'true')
})

afterEach(async () => {
  await app?.close()
  app = null
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /laudos/requisicoes/:codigoLis/original/:idAnexo — baixar o laudo original', () => {
  it('entrega o PDF do paciente e registra o download na trilha de auditoria', async () => {
    const { app, site, auditoria } = await montar()

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toBe(`attachment; filename="laudo-original-${REQ}.pdf"`)
    expect(Buffer.compare(res.rawPayload, Buffer.from(PDF))).toBe(0)
    // A listagem do site é feita com o id interno que o apLIS deu à requisição.
    expect(site.listarAnexos).toHaveBeenCalledWith(ID_REQ, REQ)
    expect(auditoria()).toEqual([
      expect.objectContaining({
        ator_tipo: 'paciente',
        ator_id: PACIENTE,
        titular_id: PACIENTE,
        acao: 'laudo.original',
        recurso_tipo: 'exam_result',
        recurso_id: LINHA,
      }),
    ])
  })

  it('a resposta não é cacheável e nada é gravado no Storage', async () => {
    const { app, supa } = await montar()

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.headers['cache-control']).toBe('no-store')
    expect(supa.storageCalls).toEqual([])
  })

  it('sem token: 401, sem consultar o apLIS', async () => {
    const { app, aplis, site } = await montar()

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501') })

    expect(res.statusCode).toBe(401)
    expect(aplis.requisicaoListar).not.toHaveBeenCalled()
    expect(site.listarAnexos).not.toHaveBeenCalled()
  })

  it('laudo de outro paciente responde como inexistente', async () => {
    const { app, aplis, site, auditoria } = await montar({ pacienteDoToken: 'pac-2' })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(404)
    expect(aplis.requisicaoListar).not.toHaveBeenCalled()
    expect(site.listarAnexos).not.toHaveBeenCalled()
    expect(auditoria()).toEqual([])
  })

  it('CPF do PDF diverge: recusa a entrega, loga como erro e não registra download', async () => {
    const { app, log, auditoria } = await montar({ laudos: { '501': laudoDe(OUTRO_CPF) } })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.rawPayload.includes(Buffer.from('%PDF'))).toBe(false)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ pacienteId: PACIENTE, codigoLis: REQ, idAnexo: '501', veredito: 'diverge' }),
      expect.stringContaining('RECUSADA'),
    )
    expect(auditoria()).toEqual([])
  })

  it('PDF sem CPF legível (indisponível): também recusa e loga como erro', async () => {
    const { app, log, auditoria } = await montar({ laudos: { '501': laudoDe(null) } })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(409)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ veredito: 'indisponivel' }),
      expect.stringContaining('RECUSADA'),
    )
    expect(auditoria()).toEqual([])
  })

  it('PDF que não deu para ler não é entregue', async () => {
    const { app } = await montar({ laudos: { '501': { os: [], layout: 'ilegivel' } } })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(409)
  })

  it('arquivo com uma O.S. de outro CPF entre as do paciente não é entregue', async () => {
    // Caso real de 25/11/2026: um PDF com três O.S., uma delas de outro CPF.
    // O arquivo sai inteiro, então basta uma página alheia para não sair.
    const { app } = await montar({ laudos: { '501': laudoDe(CPF, OUTRO_CPF, CPF) } })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(409)
  })

  it('página sem O.S. com o CPF de outra pessoa: o arquivo não é entregue', async () => {
    // Todas as O.S. são do paciente, mas há uma folha alheia sem cabeçalho.
    const { app, log } = await montar({ cpfsSemOs: [OUTRO_CPF] })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(409)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ veredito: 'diverge' }),
      expect.stringContaining('RECUSADA'),
    )
  })

  it('página sem O.S. com o CPF do próprio paciente não impede a entrega', async () => {
    const { app } = await montar({ cpfsSemOs: [CPF] })

    expect((await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })).statusCode).toBe(200)
  })

  it('CPF ilegível numa página sem O.S.: o arquivo não é entregue', async () => {
    const { app } = await montar({ cpfsSemOs: null })

    expect((await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })).statusCode).toBe(409)
  })

  it('anexo que não está na requisição do paciente responde como inexistente, sem ser baixado', async () => {
    const { app, site } = await montar({ anexos: [anexo('501')] })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('999'), headers: auth })

    expect(res.statusCode).toBe(404)
    expect(site.baixarAnexo).not.toHaveBeenCalled()
  })

  it('site interno fora do ar: "indisponível no momento", sem erro técnico', async () => {
    const { app } = await montar({ siteForaDoAr: true })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(502)
    expect(res.json().message).toBe(
      'O laudo original está indisponível no momento. Tente novamente mais tarde.',
    )
    expect(res.payload).not.toMatch(/timeout|apLIS/i)
  })

  it('flag LAUDOS_OS_VIA_PDF desligada: a rota responde como inexistente', async () => {
    vi.stubEnv('LAUDOS_OS_VIA_PDF', 'false')
    const { app, site } = await montar()

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(404)
    expect(site.listarAnexos).not.toHaveBeenCalled()
  })

  it('sem credenciais do site interno: a rota responde como inexistente', async () => {
    const { app } = await montar({ comSite: false })

    const res = await app.inject({ method: 'GET', url: urlDoArquivo('501'), headers: auth })

    expect(res.statusCode).toBe(404)
  })
})

describe('GET /laudos/requisicoes/:codigoLis/original — os arquivos da requisição', () => {
  it('com mais de um PDF anexado, lista todos para o paciente escolher', async () => {
    const { app } = await montar({ anexos: [anexo('501'), anexo('502', { retificacao: true })] })

    const res = await app.inject({ method: 'GET', url: URL_LISTA, headers: auth })

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    // Só ids: o nome do arquivo no apLIS pode trazer o nome de alguém, e o PDF
    // ainda não foi conferido.
    expect(res.json()).toEqual({
      arquivos: [
        { id: '501', retificacao: false },
        { id: '502', retificacao: true },
      ],
    })
  })

  it('não baixa nenhum PDF nem registra download', async () => {
    const { app, site, auditoria } = await montar()

    await app.inject({ method: 'GET', url: URL_LISTA, headers: auth })

    expect(site.baixarAnexo).not.toHaveBeenCalled()
    expect(auditoria()).toEqual([])
  })

  it('sem token: 401', async () => {
    const { app } = await montar()

    expect((await app.inject({ method: 'GET', url: URL_LISTA })).statusCode).toBe(401)
  })

  it('requisição de outro paciente responde como inexistente', async () => {
    const { app, site } = await montar({ pacienteDoToken: 'pac-2' })

    const res = await app.inject({ method: 'GET', url: URL_LISTA, headers: auth })

    expect(res.statusCode).toBe(404)
    expect(site.listarAnexos).not.toHaveBeenCalled()
  })

  it('site interno fora do ar: "indisponível no momento"', async () => {
    const { app } = await montar({ siteForaDoAr: true })

    const res = await app.inject({ method: 'GET', url: URL_LISTA, headers: auth })

    expect(res.statusCode).toBe(502)
    expect(res.json().message).toMatch(/indisponível no momento/)
  })
})

describe('limite de requisições do laudo original', () => {
  it('é apertado como o da atualização forçada: a 6ª chamada no minuto é recusada', async () => {
    const { site } = await montar()
    await app?.close()
    const laudoOriginal = new LaudoOriginalService(new ExamResultRepository(), aplisVazio(), site)
    app = Fastify()
    await app.register(sensible)
    await app.register(rateLimit, { max: 600, timeWindow: '1 minute' })
    await app.register((instancia) => laudosRoutes(instancia, { laudoOriginal }))

    const status: number[] = []
    for (let i = 0; i < 6; i++) {
      status.push((await app.inject({ method: 'GET', url: URL_LISTA, headers: auth })).statusCode)
    }

    expect(status.slice(0, 5).every((s) => s !== 429)).toBe(true)
    expect(status[5]).toBe(429)
  })
})
