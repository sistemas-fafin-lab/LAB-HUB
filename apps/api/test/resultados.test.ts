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

import { resultadosRoutes } from '../src/routes/resultados.js'
import {
  buildApp,
  createSupabaseMock,
  type StorageHandler,
  type SupaHandler,
  type SupaResult,
} from './helpers.js'

const RES_ID = '44444444-4444-4444-4444-444444444444'
const AUTH = { authorization: 'Bearer token-valido' }
const DECLARACAO_PATH = `pac-1/${RES_ID}.pdf`

function resultadoRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RES_ID,
    paciente_id: 'pac-1',
    agendamento_id: null,
    exame_nome: 'Hemograma completo',
    categoria: null,
    status: 'liberado',
    resumo: null,
    paineis: [],
    laudo_url: null,
    declaracao_url: DECLARACAO_PATH,
    liberado_em: '2026-07-20T12:00:00.000Z',
    flowlab_analise_id: null,
    ...over,
  }
}

function supaHandler(scenario: { resultados?: SupaResult } = {}): SupaHandler {
  return (call) => {
    if (call.table === 'pacientes') return { data: { id: 'pac-1' }, error: null }
    if (call.table === 'resultados') {
      return scenario.resultados ?? { data: resultadoRow(), error: null }
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

let app: FastifyInstance
afterEach(async () => {
  await app?.close()
  vi.clearAllMocks()
})

async function pedirDeclaracao(id = RES_ID) {
  return app.inject({ method: 'GET', url: `/resultados/${id}/declaracao`, headers: AUTH })
}

describe('GET /resultados/:id/declaracao — erro de banco ≠ não encontrado (P-05)', () => {
  it('falha do banco devolve 500, e não um 404 mentiroso', async () => {
    // O defeito corrigido: `if (error || !resultado)` fazia uma falha
    // transitória virar "declaração não encontrada". O paciente lia que o laudo
    // dele não existe — e desistia, em vez de tentar de novo.
    const mock = setup({ resultados: { data: null, error: { message: 'timeout' } } })
    app = await buildApp(resultadosRoutes)

    const res = await pedirDeclaracao()

    expect(res.statusCode).toBe(500)
    expect(res.json().message).toBe('Falha ao carregar resultado')
    // E não chega a pedir URL assinada para um path que não foi lido.
    expect(mock.storageCalls).toHaveLength(0)
  })

  it('resultado inexistente devolve 404', async () => {
    const mock = setup({ resultados: { data: null, error: null } })
    app = await buildApp(resultadosRoutes)

    const res = await pedirDeclaracao()

    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBe('Declaração não encontrada')
    expect(mock.storageCalls).toHaveLength(0)
  })

  it('resultado sem declaração devolve o MESMO 404 do inexistente', async () => {
    // Deliberado: a resposta não pode contar se o id existe e é de outra pessoa,
    // se existe e ainda não tem PDF, ou se não existe.
    setup({ resultados: { data: resultadoRow({ declaracao_url: null }), error: null } })
    app = await buildApp(resultadosRoutes)

    const res = await pedirDeclaracao()

    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBe('Declaração não encontrada')
  })

  it('filtra sempre pelo paciente do token, nunca por id vindo da URL', async () => {
    const mock = setup()
    app = await buildApp(resultadosRoutes)
    await pedirDeclaracao()

    const consulta = mock.calls.find((c) => c.table === 'resultados')
    expect(consulta?.filters).toMatchObject({ id: RES_ID, paciente_id: 'pac-1' })
  })
})

describe('GET /resultados/:id/declaracao — TTL da signed URL (P-05)', () => {
  it('assina por 300s, e não pelos 3600s anteriores', async () => {
    // Signed URL é capability ao portador sobre laudo: uma hora de validade
    // sobrevive a histórico de browser e a link compartilhado por engano.
    const mock = setup()
    app = await buildApp(resultadosRoutes)

    const res = await pedirDeclaracao()

    expect(res.statusCode).toBe(200)
    expect(res.json().url).toBe(`https://signed.test/${DECLARACAO_PATH}`)
    expect(mock.storageCalls[0]).toMatchObject({
      bucket: 'laudos',
      op: 'createSignedUrl',
      paths: [DECLARACAO_PATH],
      ttl: 300,
    })
  })

  it('falha ao assinar devolve 500', async () => {
    setup({}, () => ({ data: null, error: { message: 'storage fora do ar' } }))
    app = await buildApp(resultadosRoutes)

    const res = await pedirDeclaracao()

    expect(res.statusCode).toBe(500)
    expect(res.json().message).toBe('Falha ao gerar URL assinada')
  })
})

describe('GET /resultados', () => {
  it('lista os resultados do paciente autenticado', async () => {
    const mock = setup({ resultados: { data: [resultadoRow()], error: null } })
    app = await buildApp(resultadosRoutes)

    const res = await app.inject({ method: 'GET', url: '/resultados', headers: AUTH })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0]).toMatchObject({ id: RES_ID, exameNome: 'Hemograma completo' })
    expect(mock.calls.find((c) => c.table === 'resultados')?.filters).toMatchObject({
      paciente_id: 'pac-1',
    })
  })

  // A ordem que o banco devolve é o que decide qual versão é a vigente; a
  // marcação em si é testada em retificacao.test.ts. Aqui só se confere que a
  // rota realmente aplica a marcação (já houve versão em que ela existia como
  // função e ninguém a chamava).
  it('marca a versão anterior quando o mesmo exame vem duas vezes no agendamento', async () => {
    setup({
      resultados: {
        data: [
          resultadoRow({
            id: RES_ID,
            agendamento_id: 'ag-1',
            liberado_em: '2026-08-04T12:00:00.000Z',
          }),
          resultadoRow({
            id: '55555555-5555-5555-5555-555555555555',
            agendamento_id: 'ag-1',
            liberado_em: '2026-08-01T12:00:00.000Z',
          }),
        ],
        error: null,
      },
    })
    app = await buildApp(resultadosRoutes)

    const res = await app.inject({ method: 'GET', url: '/resultados', headers: AUTH })

    expect(res.statusCode).toBe(200)
    const [novo, velho] = res.json()
    expect(novo.retificadoPor).toBeUndefined()
    expect(velho.retificadoPor).toBe(RES_ID)
  })

  it('falha do banco devolve 500', async () => {
    setup({ resultados: { data: null, error: { message: 'timeout' } } })
    app = await buildApp(resultadosRoutes)

    const res = await app.inject({ method: 'GET', url: '/resultados', headers: AUTH })

    expect(res.statusCode).toBe(500)
  })

  it('sem token não chega ao banco', async () => {
    const mock = setup()
    app = await buildApp(resultadosRoutes)

    const res = await app.inject({ method: 'GET', url: '/resultados' })

    expect(res.statusCode).toBe(401)
    expect(mock.calls).toHaveLength(0)
  })
})

describe('trilha de auditoria de acesso (S-08)', () => {
  const trilha = (mock: ReturnType<typeof setup>) =>
    mock.calls.filter((c) => c.table === 'auditoria_acesso' && c.op === 'insert')

  it('a listagem registra o acesso com a quantidade exposta', async () => {
    const mock = setup({ resultados: { data: [resultadoRow(), resultadoRow()], error: null } })
    app = await buildApp(resultadosRoutes)

    await app.inject({ method: 'GET', url: '/resultados', headers: AUTH })

    expect(trilha(mock)[0]?.payload).toMatchObject({
      ator_tipo: 'paciente',
      ator_id: 'pac-1',
      titular_id: 'pac-1',
      acao: 'resultados.listar',
      quantidade: 2,
    })
  })

  it('a declaração registra o id do resultado', async () => {
    const mock = setup()
    app = await buildApp(resultadosRoutes)

    await pedirDeclaracao()

    expect(trilha(mock)[0]?.payload).toMatchObject({
      acao: 'resultado.declaracao',
      recurso_tipo: 'resultado',
      recurso_id: RES_ID,
    })
  })

  it('404 e 500 não geram linha: a trilha conta o que saiu, não o que se tentou', async () => {
    // Sem este corte, a trilha viraria um log de requisições — e a pergunta que
    // ela existe para responder ("o que vazou?") ficaria enterrada nas
    // tentativas que não expuseram nada.
    const semDeclaracao = setup({ resultados: { data: resultadoRow({ declaracao_url: null }), error: null } })
    app = await buildApp(resultadosRoutes)
    expect((await pedirDeclaracao()).statusCode).toBe(404)
    expect(trilha(semDeclaracao)).toHaveLength(0)
    await app.close()

    const falha = setup({ resultados: { data: null, error: { message: 'timeout' } } })
    app = await buildApp(resultadosRoutes)
    expect((await pedirDeclaracao()).statusCode).toBe(500)
    expect(trilha(falha)).toHaveLength(0)
  })

  it('trilha indisponível não derruba a leitura do paciente', async () => {
    // A escolha do § S-08: negar o laudo porque a auditoria caiu seria o dano
    // maior. A linha perdida vai para o log da API (ver test/auditoria.test.ts).
    const mock = createSupabaseMock({
      handler: (call) => {
        if (call.table === 'auditoria_acesso') return { data: null, error: { message: 'permission denied' } }
        if (call.table === 'pacientes') return { data: { id: 'pac-1' }, error: null }
        return { data: [resultadoRow()], error: null }
      },
    })
    h.setSb(mock.client)
    app = await buildApp(resultadosRoutes)

    const res = await app.inject({ method: 'GET', url: '/resultados', headers: AUTH })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })
})
