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

// ── POST (upload da recepção do FlowLab) ────────────────────────────────────────

// Magic bytes REAIS de JPEG (detectarTipoArquivo confere os bytes, não a extensão
// nem o header). Precisa de ≥12 bytes (BYTES_MINIMOS do lib/fileType.ts).
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(10)])
// Sem assinatura conhecida → detectarTipoArquivo devolve null (falha fechada).
const LIXO_BYTES = Buffer.from('isto-nao-e-um-arquivo-suportado')

// Diferente do GET, o upload faz insert().select().single(): o handler devolve UMA
// linha (não o array) e, por padrão, ecoa o payload para as asserções fazerem sentido.
function uploadSupaHandler(
  scenario: { agendamento?: SupaResult; insert?: SupaResult } = {},
): SupaHandler {
  return (call) => {
    if (call.table === 'agendamentos') {
      return scenario.agendamento ?? { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
    }
    if (call.table === 'documentos' && call.op === 'insert') {
      if (scenario.insert) return scenario.insert
      const p = call.payload as Record<string, unknown>
      return {
        data: {
          ...docRow(p.id as string),
          agendamento_id: p.agendamento_id,
          tipo: p.tipo,
          nome_arquivo: p.nome_arquivo,
          storage_path: p.storage_path,
          mime_type: p.mime_type,
          tamanho_bytes: p.tamanho_bytes,
        },
        error: null,
      }
    }
    return { data: null, error: null }
  }
}

function setupUpload(
  scenario: Parameters<typeof uploadSupaHandler>[0] = {},
  storage?: StorageHandler,
) {
  const mock = createSupabaseMock({
    handler: uploadSupaHandler(scenario),
    ...(storage ? { storage } : {}),
  })
  h.setSb(mock.client)
  return mock
}

const OCTET = { ...CHAVE, 'content-type': 'application/octet-stream' }

describe('POST /integracao/agendamentos/:labhubId/documentos', () => {
  it('401 sem x-api-key', async () => {
    setupUpload()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: `${URL_DOCS}?tipo=identidade`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: JPEG_BYTES,
    })

    expect(res.statusCode).toBe(401)
  })

  it('201 sobe o arquivo, grava a linha e devolve o metadado', async () => {
    const mock = setupUpload()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: `${URL_DOCS}?tipo=identidade`,
      headers: { ...OCTET, 'x-nome-arquivo': encodeURIComponent('meu rg.jpg') },
      payload: JPEG_BYTES,
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.tipo).toBe('identidade')
    expect(body.mimeType).toBe('image/jpeg')
    expect(body.nomeArquivo).toBe('meu rg.jpg')
    // Sem URL: a recepção não exibe o doc agora (o check-in pede signed URL depois).
    expect(body.url).toBeUndefined()

    // Subiu ao Storage com o mime SNIFFADO e path {paciente_id}/{uuid}.jpg.
    const up = mock.storageCalls.find((c) => c.op === 'upload')
    expect(up).toBeDefined()
    expect(up?.paths[0]).toMatch(/^pac-1\/[0-9a-f-]+\.jpg$/)
    expect((up?.options as { contentType?: string })?.contentType).toBe('image/jpeg')

    // Gravou a linha anexada AO AGENDAMENTO (aparece no check-in desta coleta).
    const ins = mock.calls.find((c) => c.table === 'documentos' && c.op === 'insert')
    expect(ins?.payload).toMatchObject({
      paciente_id: 'pac-1',
      agendamento_id: AG_ID,
      tipo: 'identidade',
      mime_type: 'image/jpeg',
    })
  })

  it('400 em tipo fora do enum', async () => {
    setupUpload()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: `${URL_DOCS}?tipo=laudo`,
      headers: OCTET,
      payload: JPEG_BYTES,
    })

    expect(res.statusCode).toBe(400)
  })

  it('400 em labhubId não-uuid', async () => {
    setupUpload()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/integracao/agendamentos/nao-e-uuid/documentos?tipo=identidade',
      headers: OCTET,
      payload: JPEG_BYTES,
    })

    expect(res.statusCode).toBe(400)
  })

  // Falha fechada pelos magic bytes: nome/header não enganam — nada sobe nem grava.
  it('400 em formato não suportado, sem tocar no Storage', async () => {
    const mock = setupUpload()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: `${URL_DOCS}?tipo=identidade`,
      headers: { ...OCTET, 'x-nome-arquivo': encodeURIComponent('malicioso.jpg') },
      payload: LIXO_BYTES,
    })

    expect(res.statusCode).toBe(400)
    expect(mock.storageCalls).toHaveLength(0)
    expect(mock.calls.some((c) => c.table === 'documentos' && c.op === 'insert')).toBe(false)
  })

  it('404 em agendamento inexistente, sem tocar no Storage', async () => {
    const mock = setupUpload({ agendamento: { data: null, error: null } })
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: `${URL_DOCS}?tipo=identidade`,
      headers: OCTET,
      payload: JPEG_BYTES,
    })

    expect(res.statusCode).toBe(404)
    expect(mock.storageCalls).toHaveLength(0)
  })

  // Insert falhou depois do upload: remove o objeto órfão (LGPD) e responde 500.
  it('compensa o órfão no Storage quando o insert falha', async () => {
    const mock = setupUpload({ insert: { data: null, error: { message: 'boom' } } })
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: `${URL_DOCS}?tipo=identidade`,
      headers: OCTET,
      payload: JPEG_BYTES,
    })

    expect(res.statusCode).toBe(500)
    const up = mock.storageCalls.find((c) => c.op === 'upload')
    const rm = mock.storageCalls.find((c) => c.op === 'remove')
    expect(up).toBeDefined()
    expect(rm).toBeDefined()
    // Removeu exatamente o path que subiu.
    expect(rm?.paths[0]).toBe(up?.paths[0])
  })
})
