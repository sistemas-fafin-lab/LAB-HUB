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
  type RpcHandler,
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

// ── Trilha de auditoria do canal do FlowLab (S-08) ──────────────────────────────

describe('trilha de auditoria de acesso pelo FlowLab (S-08)', () => {
  const trilha = (mock: ReturnType<typeof setup>) =>
    mock.calls.filter((c) => c.table === 'auditoria_acesso' && c.op === 'insert')

  it('registra o titular do agendamento, sem ator_id — o FlowLab é sistema, não pessoa', async () => {
    const mock = setup()
    app = await buildApp(integracaoRoutes)

    await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(trilha(mock)[0]?.payload).toMatchObject({
      ator_tipo: 'flowlab',
      ator_id: null,
      titular_id: 'pac-1',
      acao: 'integracao.documentos.listar',
      recurso_tipo: 'agendamento',
      recurso_id: AG_ID,
      quantidade: 2,
    })
  })

  it('conta o que SAIU: documento cuja assinatura falhou não entra na quantidade', async () => {
    const mock = setup({}, (call) => {
      if (call.op !== 'createSignedUrls') return { data: null, error: null }
      return {
        data: [
          { path: `pac-1/${DOC_COLETA}.jpg`, signedUrl: `https://signed.test/pac-1/${DOC_COLETA}.jpg`, error: null },
          { path: `pac-1/${DOC_PERENE}.jpg`, signedUrl: null, error: 'falhou' },
        ],
        error: null,
      }
    })
    app = await buildApp(integracaoRoutes)

    await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(trilha(mock)[0]?.payload).toMatchObject({ quantidade: 1 })
  })

  it('agendamento sem documento também vira linha — é a varredura de ids que se quer ver', async () => {
    // Uma sequência de respostas vazias é o desenho de uma enumeração. Auditar
    // só o acerto deixaria justamente a busca invisível.
    const mock = setup({ documentos: { data: [], error: null } })
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'GET', url: URL_DOCS, headers: CHAVE })

    expect(res.statusCode).toBe(200)
    expect(trilha(mock)[0]?.payload).toMatchObject({
      acao: 'integracao.documentos.listar',
      recurso_id: AG_ID,
      quantidade: 0,
    })
  })

  it('401 não gera linha: sem chave válida a requisição nem chega ao banco', async () => {
    const mock = setup()
    app = await buildApp(integracaoRoutes)

    await app.inject({ method: 'GET', url: URL_DOCS, headers: { 'x-api-key': 'errada' } })

    expect(trilha(mock)).toHaveLength(0)
  })

  it('a busca de pacientes registra a quantidade e NÃO o termo digitado', async () => {
    // A rota por onde a FLOWLAB_API_KEY (o P-06, risco aceito) varre a base. O
    // termo carrega nome ou CPF — gravá-lo faria da trilha mais um lugar com PII
    // em claro, que é exatamente o que lib/http.ts já evita no log.
    const mock = createSupabaseMock({
      handler: (call) =>
        call.table === 'pacientes'
          ? { data: [{ id: 'pac-1', nome: 'Maria Souza', cpf: '52998224725', data_nascimento: '1990-01-01' }], error: null }
          : { data: null, error: null },
    })
    h.setSb(mock.client)
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/integracao/pacientes/buscar?q=Maria',
      headers: CHAVE,
    })

    expect(res.statusCode).toBe(200)
    const payload = trilha(mock)[0]?.payload as Record<string, unknown>
    expect(payload).toMatchObject({
      ator_tipo: 'flowlab',
      acao: 'integracao.pacientes.buscar',
      recurso_tipo: 'paciente',
      quantidade: 1,
      titular_id: null,
    })
    expect(JSON.stringify(payload)).not.toContain('Maria')
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
          // Devolve o que o insert de fato gravou. Desde o corte do S-06 o nome
          // vai SÓ cifrado, e ecoar a coluna em claro (agora ausente) fazia o
          // mapeamento cair — o `.select()` do PostgREST devolve a linha real.
          nome_arquivo: p.nome_arquivo ?? null,
          nome_arquivo_enc: p.nome_arquivo_enc,
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

// ---------------------------------------------------------------------------
// POST /integracao/pacientes/:pacienteId/correcao-identidade
//
// Depois do claim, CPF e nascimento são imutáveis no banco (trigger da migration
// 20260730120000). Esta rota é a única saída, e o que ela precisa garantir é:
// só a recepção chega nela, entrada inválida nem toca o banco, e as recusas da
// RPC viram o status HTTP certo em vez de 500 genérico.
// ---------------------------------------------------------------------------

const PAC_ID = '55555555-5555-5555-5555-555555555555'
const CPF_NOVO = '52998224725' // dígitos verificadores válidos
const URL_CORRECAO = `/integracao/pacientes/${PAC_ID}/correcao-identidade`

const CORPO_VALIDO = {
  cpf: '529.982.247-25', // formatado de propósito: a API normaliza
  dataNascimento: '1990-05-05',
  motivo: 'CPF digitado errado no cadastro do balcão',
  autorizadoPor: 'recepcao.ana',
  documentoConferido: 'RG',
}

function setupCorrecao(rpc?: RpcHandler) {
  const mock = createSupabaseMock({
    handler: supaHandler(),
    ...(rpc ? { rpc } : {}),
  })
  h.setSb(mock.client)
  return mock
}

const RPC_OK: RpcHandler = () => ({
  data: {
    correcaoId: '66666666-6666-6666-6666-666666666666',
    pacienteId: PAC_ID,
    cpfAnterior: '12345678909',
    nascimentoAnterior: '1990-05-05',
    laudosInvalidados: 3,
    corrigidoEm: '2026-07-30T12:00:00.000Z',
  },
  error: null,
})

describe('POST /integracao/pacientes/:pacienteId/correcao-identidade', () => {
  it('401 sem x-api-key — não é rota de portal', async () => {
    setupCorrecao()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({ method: 'POST', url: URL_CORRECAO, payload: CORPO_VALIDO })

    expect(res.statusCode).toBe(401)
  })

  // O JWT do paciente não abre esta rota: quem autoriza a troca é a recepção,
  // que conferiu o documento físico — não o dono da conta.
  it('401 com JWT de paciente no lugar da chave', async () => {
    const mock = setupCorrecao()
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: { authorization: 'Bearer jwt-de-paciente' },
      payload: CORPO_VALIDO,
    })

    expect(res.statusCode).toBe(401)
    expect(mock.rpcCalls).toHaveLength(0)
  })

  it('normaliza o CPF e repassa os campos de auditoria para a RPC', async () => {
    const mock = setupCorrecao(RPC_OK)
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: CHAVE,
      payload: CORPO_VALIDO,
    })

    expect(res.statusCode).toBe(200)
    expect(mock.rpcCalls).toHaveLength(1)
    expect(mock.rpcCalls[0]?.fn).toBe('corrigir_identidade_paciente')
    expect(mock.rpcCalls[0]?.args).toEqual({
      p_paciente_id: PAC_ID,
      p_cpf_novo: CPF_NOVO, // máscara removida
      p_nascimento_novo: '1990-05-05',
      p_motivo: 'CPF digitado errado no cadastro do balcão',
      p_autorizado_por: 'recepcao.ana',
      p_documento_conferido: 'RG',
    })
  })

  // O canal devolve confirmação, não PII: o operador só precisa reconhecer que a
  // linha certa mudou. Mesma regra do typeahead.
  it('devolve o CPF anterior mascarado e a contagem de laudos invalidados', async () => {
    setupCorrecao(RPC_OK)
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: CHAVE,
      payload: CORPO_VALIDO,
    })

    const body = res.json()
    expect(body.cpfAnteriorMascarado).toBe('•••.•••.•••-09')
    expect(body.laudosInvalidados).toBe(3)
    expect(body.correcaoId).toBe('66666666-6666-6666-6666-666666666666')
    // Nem o CPF antigo nem o novo saem inteiros na resposta.
    expect(res.body).not.toContain('12345678909')
    expect(res.body).not.toContain(CPF_NOVO)
  })

  it('400 e nenhuma ida ao banco quando o CPF tem dígito verificador errado', async () => {
    const mock = setupCorrecao(RPC_OK)
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: CHAVE,
      payload: { ...CORPO_VALIDO, cpf: '52998224726' },
    })

    expect(res.statusCode).toBe(400)
    expect(mock.rpcCalls).toHaveLength(0)
  })

  // Sem motivo/autorizador a trilha não serve para auditar nada, então a rota
  // recusa antes de tocar o banco.
  it.each([
    ['motivo vazio', { motivo: '' }],
    ['motivo curto demais', { motivo: 'erro' }],
    ['sem quem autorizou', { autorizadoPor: '   ' }],
    ['sem documento conferido', { documentoConferido: '' }],
    ['data inexistente', { dataNascimento: '1990-02-30' }],
  ])('400 com %s', async (_nome, over) => {
    const mock = setupCorrecao(RPC_OK)
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: CHAVE,
      payload: { ...CORPO_VALIDO, ...over },
    })

    expect(res.statusCode).toBe(400)
    expect(mock.rpcCalls).toHaveLength(0)
  })

  it('400 quando o pacienteId da URL não é uuid', async () => {
    const mock = setupCorrecao(RPC_OK)
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/integracao/pacientes/nao-e-uuid/correcao-identidade',
      headers: CHAVE,
      payload: CORPO_VALIDO,
    })

    expect(res.statusCode).toBe(400)
    expect(mock.rpcCalls).toHaveLength(0)
  })

  // As recusas da RPC vêm classificadas por SQLSTATE justamente para não virarem
  // 500 — a recepção precisa saber a diferença entre "não achei" e "é fusão".
  it.each([
    ['23505', 409, 'CPF já pertence a outro cadastro'],
    ['P0002', 404, 'Paciente não encontrado'],
    ['22023', 400, 'Nada a corrigir: CPF e data de nascimento já são estes'],
  ])('SQLSTATE %s vira HTTP %i', async (code, status) => {
    setupCorrecao(() => ({ data: null, error: { code, message: 'msg do banco' } }))
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: CHAVE,
      payload: CORPO_VALIDO,
    })

    expect(res.statusCode).toBe(status)
  })

  it('500 em erro de banco não classificado', async () => {
    setupCorrecao(() => ({ data: null, error: { code: '08006', message: 'conexão caiu' } }))
    app = await buildApp(integracaoRoutes)

    const res = await app.inject({
      method: 'POST',
      url: URL_CORRECAO,
      headers: CHAVE,
      payload: CORPO_VALIDO,
    })

    expect(res.statusCode).toBe(500)
    // Mensagem interna do banco não vaza para o cliente.
    expect(res.body).not.toContain('conexão caiu')
  })
})
