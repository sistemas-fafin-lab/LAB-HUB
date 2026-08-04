import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import FormData from 'form-data'

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

import { documentosRoutes } from '../src/routes/documentos.js'
import { aadDe, decifrar } from '../src/lib/crypto.js'
import {
  buildApp,
  createSupabaseMock,
  type StorageHandler,
  type SupaHandler,
  type SupaResult,
} from './helpers.js'

const DOC_ID = '33333333-3333-3333-3333-333333333333'
const AG_ID = '11111111-1111-1111-1111-111111111111'
const OUTRO_AG_ID = '99999999-9999-9999-9999-999999999999'

// Cabeçalhos reais dos formatos, com folga p/ passar do mínimo de 12 bytes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])
const PDF = Buffer.concat([Buffer.from('%PDF-1.4', 'latin1'), Buffer.alloc(32)])
const EXE = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(32)])

function docRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DOC_ID,
    paciente_id: 'pac-1',
    agendamento_id: null,
    tipo: 'identidade',
    nome_arquivo: 'rg.jpg',
    storage_path: `pac-1/${DOC_ID}.jpg`,
    mime_type: 'image/jpeg',
    tamanho_bytes: 36,
    criado_em: '2026-07-15T00:00:00.000Z',
    ...over,
  }
}

// Roteia as queries do fluxo de documentos pelo cenário do teste.
function supaHandler(scenario: {
  agendamento?: SupaResult
  insert?: SupaResult
  load?: SupaResult
  del?: SupaResult
} = {}): SupaHandler {
  return (call) => {
    if (call.table === 'pacientes') return { data: { id: 'pac-1' }, error: null }
    if (call.table === 'agendamentos') {
      return scenario.agendamento ?? { data: { id: AG_ID }, error: null }
    }
    if (call.table === 'documentos') {
      if (call.op === 'insert') return scenario.insert ?? { data: docRow(), error: null }
      if (call.op === 'delete') return scenario.del ?? { error: null }
      return scenario.load ?? { data: docRow(), error: null }
    }
    return { data: null, error: null }
  }
}

// Spy de notifyDocumento compartilhado por teste (recriado no setup).
let notifyDocumentoSpy: ReturnType<typeof vi.fn>

function setup(scenario: Parameters<typeof supaHandler>[0] = {}, storage?: StorageHandler) {
  const mock = createSupabaseMock({
    handler: supaHandler(scenario),
    ...(storage ? { storage } : {}),
  })
  h.setSb(mock.client)
  notifyDocumentoSpy = vi.fn(async () => ({ ok: true }))
  h.setFl({ notifyDocumento: notifyDocumentoSpy })
  return mock
}

// Monta o corpo multipart. `ordemInvertida` põe os campos de texto DEPOIS do
// arquivo — o caso que quebraria se a rota lesse parte.fields antes do toBuffer().
function multipart(opts: {
  buffer: Buffer
  filename: string
  contentType: string
  tipo?: string
  agendamentoId?: string
  ordemInvertida?: boolean
}) {
  const form = new FormData()
  const campos = () => {
    if (opts.tipo) form.append('tipo', opts.tipo)
    if (opts.agendamentoId) form.append('agendamentoId', opts.agendamentoId)
  }
  if (!opts.ordemInvertida) campos()
  form.append('file', opts.buffer, { filename: opts.filename, contentType: opts.contentType })
  if (opts.ordemInvertida) campos()
  return { payload: form, headers: form.getHeaders() }
}

let app: FastifyInstance
afterEach(async () => {
  await app?.close()
  vi.clearAllMocks()
})

const AUTH = { authorization: 'Bearer token-valido' }

describe('POST /documentos', () => {
  it('rejeita executável renomeado como .jpg sem tocar no Storage', async () => {
    const mock = setup()
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: EXE,
      filename: 'identidade.jpg',
      contentType: 'image/jpeg', // mente, e o nome também
      tipo: 'identidade',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/Formato não suportado/)
    // O ponto que importa: nada subiu ao bucket.
    expect(mock.storageCalls).toHaveLength(0)
  })

  it('grava o tipo SNIFFADO, não o Content-Type declarado', async () => {
    const mock = setup({
      insert: { data: docRow({ mime_type: 'image/jpeg' }), error: null },
    })
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: JPEG,
      filename: 'doc.pdf',
      contentType: 'application/pdf', // mente: os bytes são JPEG
      tipo: 'identidade',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().mimeType).toBe('image/jpeg')

    const upload = mock.storageCalls.find((c) => c.op === 'upload')
    expect(upload?.options).toMatchObject({ contentType: 'image/jpeg' })
    // Extensão vem do sniff, não do nome enviado.
    expect(upload?.paths[0]).toMatch(/\.jpg$/)
  })

  // O corte do S-06 só protege se NENHUM caminho de escrita continuar
  // preenchendo a coluna em claro. Um que sobrasse manteria a base populada e a
  // migration do drop perderia dado — é o furo que a fase 1 teve por três meses
  // sem ninguém notar.
  it('grava o nome do arquivo SÓ na coluna cifrada', async () => {
    const mock = setup()
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: JPEG,
      filename: 'pedido_medico_hemograma.jpg',
      contentType: 'image/jpeg',
      tipo: 'pedido_medico',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(201)
    const gravado = mock.calls.find((c) => c.table === 'documentos' && c.op === 'insert')
      ?.payload as Record<string, unknown>
    expect(gravado).not.toHaveProperty('nome_arquivo')
    expect(
      decifrar(
        gravado.nome_arquivo_enc as string,
        aadDe('documentos', 'nome_arquivo', gravado.id as string),
      ),
    ).toBe('pedido_medico_hemograma.jpg')
  })

  it('deriva o path como {pacienteId}/{uuid}.{ext}', async () => {
    const mock = setup()
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: PDF,
      filename: 'pedido.pdf',
      contentType: 'application/pdf',
      tipo: 'pedido_medico',
      agendamentoId: AG_ID,
    })
    await app.inject({ method: 'POST', url: '/documentos', payload, headers: { ...headers, ...AUTH } })

    const upload = mock.storageCalls.find((c) => c.op === 'upload')
    expect(upload?.paths[0]).toMatch(
      /^pac-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    )
    expect(upload?.bucket).toBe('documentos')
  })

  it('avisa o FlowLab quando o pedido médico é anexado a um agendamento', async () => {
    setup({ insert: { data: docRow({ tipo: 'pedido_medico', agendamento_id: AG_ID }), error: null } })
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: PDF,
      filename: 'pedido.pdf',
      contentType: 'application/pdf',
      tipo: 'pedido_medico',
      agendamentoId: AG_ID,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(201)
    expect(notifyDocumentoSpy).toHaveBeenCalledWith({ labhubId: AG_ID, tipo: 'pedido_medico' })
  })

  it('não avisa o FlowLab para outros tipos de documento', async () => {
    setup()
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: JPEG,
      filename: 'rg.jpg',
      contentType: 'image/jpeg',
      tipo: 'identidade',
      agendamentoId: AG_ID,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(201)
    expect(notifyDocumentoSpy).not.toHaveBeenCalled()
  })

  it('não deixa uma falha ao notificar o FlowLab derrubar o upload', async () => {
    setup({ insert: { data: docRow({ tipo: 'pedido_medico', agendamento_id: AG_ID }), error: null } })
    notifyDocumentoSpy.mockRejectedValueOnce(new Error('flowlab fora do ar'))
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: PDF,
      filename: 'pedido.pdf',
      contentType: 'application/pdf',
      tipo: 'pedido_medico',
      agendamentoId: AG_ID,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    // O documento já está persistido; a notificação é best-effort.
    expect(res.statusCode).toBe(201)
  })

  it('compensa o insert falho removendo o objeto órfão', async () => {
    const mock = setup({ insert: { data: null, error: { message: 'boom' } } })
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: JPEG,
      filename: 'rg.jpg',
      contentType: 'image/jpeg',
      tipo: 'identidade',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(500)
    const upload = mock.storageCalls.find((c) => c.op === 'upload')
    const remove = mock.storageCalls.find((c) => c.op === 'remove')
    // Removeu exatamente o path que havia subido.
    expect(remove?.paths).toEqual([upload?.paths[0]])
  })

  it('recusa anexar a agendamento de outro paciente, sem subir nada', async () => {
    const mock = setup({ agendamento: { data: null, error: null } }) // não achou p/ este paciente
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: PDF,
      filename: 'pedido.pdf',
      contentType: 'application/pdf',
      tipo: 'pedido_medico',
      agendamentoId: OUTRO_AG_ID,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(404)
    expect(mock.storageCalls).toHaveLength(0)
  })

  it('parseia os campos que vieram DEPOIS do arquivo no FormData', async () => {
    setup()
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: JPEG,
      filename: 'rg.jpg',
      contentType: 'image/jpeg',
      tipo: 'identidade',
      ordemInvertida: true, // regressão do buffer-first
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(201)
  })

  it('rejeita tipo fora do enum', async () => {
    setup()
    app = await buildApp(documentosRoutes)

    const { payload, headers } = multipart({
      buffer: JPEG,
      filename: 'rg.jpg',
      contentType: 'image/jpeg',
      tipo: 'laudo', // não é um tipo que o paciente envia
    })
    const res = await app.inject({
      method: 'POST',
      url: '/documentos',
      payload,
      headers: { ...headers, ...AUTH },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /documentos', () => {
  it('filtra por escopo=perenes (agendamento_id is null)', async () => {
    const mock = setup({ load: { data: [docRow()], error: null } })
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'GET', url: '/documentos?escopo=perenes', headers: AUTH })

    expect(res.statusCode).toBe(200)
    const query = mock.calls.find((c) => c.table === 'documentos')
    expect(query?.filters).toMatchObject({ paciente_id: 'pac-1', agendamento_id: null })
  })

  it('filtra por agendamentoId', async () => {
    const mock = setup({ load: { data: [], error: null } })
    app = await buildApp(documentosRoutes)

    await app.inject({ method: 'GET', url: `/documentos?agendamentoId=${AG_ID}`, headers: AUTH })

    const query = mock.calls.find((c) => c.table === 'documentos')
    expect(query?.filters).toMatchObject({ paciente_id: 'pac-1', agendamento_id: AG_ID })
  })
})

describe('GET /documentos/:id/url', () => {
  it('404 em documento de outro paciente', async () => {
    setup({ load: { data: null, error: null } })
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'GET', url: `/documentos/${DOC_ID}/url`, headers: AUTH })

    expect(res.statusCode).toBe(404)
  })

  it('500 (não 404) quando o banco falha — erro transitório não vira "não encontrado"', async () => {
    setup({ load: { data: null, error: { message: 'timeout' } } })
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'GET', url: `/documentos/${DOC_ID}/url`, headers: AUTH })

    expect(res.statusCode).toBe(500)
  })

  it('devolve a signed URL com o TTL e o prazo de expiração', async () => {
    const mock = setup()
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'GET', url: `/documentos/${DOC_ID}/url`, headers: AUTH })

    expect(res.statusCode).toBe(200)
    expect(res.json().url).toContain('https://signed.test/')
    expect(new Date(res.json().expiraEm).getTime()).toBeGreaterThan(Date.now())
    expect(mock.storageCalls[0]).toMatchObject({ bucket: 'documentos', op: 'createSignedUrl' })
  })

  it('registra a emissão da URL na trilha de auditoria (S-08)', async () => {
    // O acesso auditável é a EMISSÃO: o download vai direto ao Storage e nunca
    // volta a esta API, então esta é a última vez que o sistema sabe quem pediu.
    const mock = setup()
    app = await buildApp(documentosRoutes)

    await app.inject({ method: 'GET', url: `/documentos/${DOC_ID}/url`, headers: AUTH })

    const linha = mock.calls.find((c) => c.table === 'auditoria_acesso' && c.op === 'insert')
    expect(linha?.payload).toMatchObject({
      ator_tipo: 'paciente',
      ator_id: 'pac-1',
      titular_id: 'pac-1',
      acao: 'documento.url',
      recurso_tipo: 'documento',
      recurso_id: DOC_ID,
    })
  })

  it('o 404 de documento alheio não gera linha na trilha', async () => {
    const mock = setup({ load: { data: null, error: null } })
    app = await buildApp(documentosRoutes)

    await app.inject({ method: 'GET', url: `/documentos/${DOC_ID}/url`, headers: AUTH })

    expect(mock.calls.filter((c) => c.table === 'auditoria_acesso')).toHaveLength(0)
  })
})

describe('DELETE /documentos/:id', () => {
  it('remove o arquivo ANTES da linha', async () => {
    const mock = setup()
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'DELETE', url: `/documentos/${DOC_ID}`, headers: AUTH })

    expect(res.statusCode).toBe(204)
    expect(mock.storageCalls.find((c) => c.op === 'remove')?.paths).toEqual([`pac-1/${DOC_ID}.jpg`])
    expect(mock.calls.some((c) => c.table === 'documentos' && c.op === 'delete')).toBe(true)
  })

  it('aborta e preserva a linha se o Storage falhar (permite retry)', async () => {
    const mock = setup({}, (call) =>
      call.op === 'remove' ? { data: null, error: { message: 'storage fora' } } : { data: null, error: null },
    )
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'DELETE', url: `/documentos/${DOC_ID}`, headers: AUTH })

    expect(res.statusCode).toBe(500)
    // A linha continua lá: o paciente reclica e tenta de novo.
    expect(mock.calls.some((c) => c.table === 'documentos' && c.op === 'delete')).toBe(false)
  })

  it('404 em documento de outro paciente', async () => {
    const mock = setup({ load: { data: null, error: null } })
    app = await buildApp(documentosRoutes)

    const res = await app.inject({ method: 'DELETE', url: `/documentos/${DOC_ID}`, headers: AUTH })

    expect(res.statusCode).toBe(404)
    expect(mock.storageCalls).toHaveLength(0)
  })
})
