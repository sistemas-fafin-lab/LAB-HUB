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

import { integracaoRoutes } from '../src/routes/integracao.js'
import {
  buildApp,
  createSupabaseMock,
  type StorageHandler,
  type SupaHandler,
  type SupaResult,
} from './helpers.js'

const AG_ID = '11111111-1111-1111-1111-111111111111'
const DOC_PERENE = '33333333-3333-3333-3333-333333333333'
const DOC_COLETA = '44444444-4444-4444-4444-444444444444'

const CHAVE = { 'x-api-key': 'test-flowlab-key' } // = FLOWLAB_API_KEY do test/setup.ts

function docRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    paciente_id: 'pac-1',
    agendamento_id: null,
    tipo: 'identidade',
    nome_arquivo: 'rg.jpg',
    storage_path: `pac-1/${id}.jpg`,
    mime_type: 'image/jpeg',
    tamanho_bytes: 36,
    criado_em: '2026-07-15T00:00:00.000Z',
    ...over,
  }
}

function supaHandler(scenario: { agendamento?: SupaResult; documentos?: SupaResult } = {}): SupaHandler {
  return (call) => {
    if (call.table === 'agendamentos') {
      return scenario.agendamento ?? { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
    }
    if (call.table === 'documentos') {
      return (
        scenario.documentos ?? {
          data: [
            docRow(DOC_PERENE),
            docRow(DOC_COLETA, { agendamento_id: AG_ID, tipo: 'pedido_medico' }),
          ],
          error: null,
        }
      )
    }
    return { data: null, error: null }
  }
}

function setup(scenario: Parameters<typeof supaHandler>[0] = {}, storage?: StorageHandler) {
  const mock = createSupabaseMock({
    handler: supaHandler(scenario),
    ...(storage ? { storage } : {}),
  })
  h.setSb(mock.client)
  return mock
}

const URL_DOCS = `/integracao/agendamentos/${AG_ID}/documentos`

let app: FastifyInstance
afterEach(async () => {
  await app?.close()
  vi.clearAllMocks()
})

describe('GET /integracao/agendamentos/:labhubId/documentos', () => {
  it('401 sem x-api-key', async () => {
    setup()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS })

    expect(res.statusCode).toBe(401)
  })

  it('401 com x-api-key errada', async () => {
    setup()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS, headers: { 'x-api-key': 'errada' } })

    expect(res.statusCode).toBe(401)
  })

  // O canal não se confunde com o do paciente: JWT não abre a rota de integração.
  it('401 com Authorization: Bearer de paciente no lugar da chave', async () => {
    setup()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'GET',
      url: URL_DOCS,
      headers: { authorization: 'Bearer jwt-de-paciente' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('devolve perenes + os da coleta, com URLs frescas', async () => {
    const mock = setup()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.agendamentoLabhubId).toBe(AG_ID)
    expect(body.documentos).toHaveLength(2)
    expect(body.documentos[0].url).toContain('https://signed.test/')
    expect(new Date(body.documentos[0].expiraEm).getTime()).toBeGreaterThan(Date.now())
    // Uma ida ao Storage p/ os dois documentos, não duas.
    expect(mock.storageCalls).toHaveLength(1)
    expect(mock.storageCalls[0]?.op).toBe('createSignedUrls')
  })

  // O escopo é sempre derivado do agendamento: não há como pedir "docs do paciente X".
  it('escopa por paciente do agendamento + perenes via .or()', async () => {
    const mock = setup()
    app = await buildApp(integracaoRoutes)

    await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    const query = mock.calls.find((c) => c.table === 'documentos')
    expect(query?.filters).toMatchObject({ paciente_id: 'pac-1' })
    expect(query?.filters.__or).toBe(`agendamento_id.eq.${AG_ID},agendamento_id.is.null`)
  })

  it('400 em labhubId não-uuid (guarda da interpolação no .or())', async () => {
    setup()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/integracao/agendamentos/nao-e-uuid/documentos',
      headers: CHAVE,
    })

    expect(res.statusCode).toBe(400)
  })

  it('404 em agendamento inexistente', async () => {
    setup({ agendamento: { data: null, error: null } })
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(res.statusCode).toBe(404)
  })

  it('sem documentos: lista vazia e nenhuma ida ao Storage', async () => {
    const mock = setup({ documentos: { data: [], error: null } })
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(res.statusCode).toBe(200)
    expect(res.json().documentos).toEqual([])
    expect(mock.storageCalls).toHaveLength(0)
  })

  // createSignedUrls erra POR ITEM: o que falhou sai fora, os outros seguem.
  it('omite o documento cuja assinatura falhou e casa os demais por path', async () => {
    setup({}, (call) => {
      if (call.op !== 'createSignedUrls') return { data: null, error: null }
      return {
        data: [
          // Fora de ordem de propósito: casar por índice trocaria as URLs.
          { path: `pac-1/${DOC_COLETA}.jpg`, signedUrl: `https://signed.test/pac-1/${DOC_COLETA}.jpg`, error: null },
          { path: `pac-1/${DOC_PERENE}.jpg`, signedUrl: null, error: 'falhou' },
        ],
        error: null,
      }
    })
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(res.statusCode).toBe(200)
    const { documentos } = res.json()
    expect(documentos).toHaveLength(1)
    // Sobreviveu o certo, com a URL do PRÓPRIO path.
    expect(documentos[0].id).toBe(DOC_COLETA)
    expect(documentos[0].url).toContain(DOC_COLETA)
  })
})
