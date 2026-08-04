import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxy hoisted p/ o singleton supabase (mesmo padrão dos demais testes de rota).
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

import { createHmac } from 'node:crypto'
import { ExamResultRepository } from '../src/laudos/repository.js'
import { laudosRoutes } from '../src/routes/laudos.js'
import { resultadosRoutes } from '../src/routes/resultados.js'
import { webhooksRoutes } from '../src/routes/webhooks.js'
import { aadDe, cifrar, cifrarJson, decifrar, decifrarJson } from '../src/lib/crypto.js'
import { toAgendamento, toDocumento, toResultado } from '../src/lib/mappers.js'
import { buildApp, createSupabaseMock, type SupaCall, type SupaHandler } from './helpers.js'

// Criptografia de coluna do dado clínico (auditoria § S-06 / Parte 3).
//
// O que estes testes protegem, e que os testes de rota existentes não veriam:
// eles mockam o banco, então continuariam verdes se a cifra parasse de
// acontecer — a asserção precisa ser sobre o VALOR que sai em direção ao
// Postgres, e sobre o que a API faz com uma linha cifrada que volta dele.

const LAUDO_ID = '44444444-4444-4444-4444-444444444444'
const RES_ID = '55555555-5555-5555-5555-555555555555'
const AG_ID = '66666666-6666-6666-6666-666666666666'
const AUTH = { authorization: 'Bearer token-valido' }

let app: FastifyInstance
afterEach(async () => {
  await app?.close()
  vi.clearAllMocks()
})

function laudo(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LAUDO_ID,
    name: 'Hemograma Completo',
    status: 'ready',
    summary: 'Hemoglobina 14,2 g/dL',
    panels: [],
    source: 'merged',
    partial: false,
    ...over,
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

describe('leitura — a API decifra o que está cifrado no banco', () => {
  function appDeLaudos(linha: Record<string, unknown>) {
    const handler: SupaHandler = (call) => {
      if (call.table === 'pacientes') {
        return { data: { id: 'pac-1', cpf: '52998224725' }, error: null }
      }
      if (call.table === 'exam_results') return { data: linha, error: null }
      return { data: null, error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)
    return buildApp(laudosRoutes)
  }

  it('GET /laudos/:id devolve o laudo guardado só na coluna cifrada', async () => {
    const laudos = [laudo()]
    app = await appDeLaudos({
      id: LAUDO_ID,
      result: null, // a coluna em claro já não tem nada
      result_enc: cifrarJson(laudos, aadDe('exam_results', 'result', LAUDO_ID)),
    })

    const res = await app.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: AUTH })

    expect(res.statusCode).toBe(200)
    expect(res.json()[0].summary).toBe('Hemoglobina 14,2 g/dL')
  })

  it('GET /laudos/:id continua servindo a linha antiga, ainda em claro', async () => {
    // Compatibilidade durante a migração: enquanto o backfill não passou, a
    // linha só tem a coluna em claro. Quebrar isto tiraria o laudo do ar entre o
    // deploy e o backfill.
    app = await appDeLaudos({ id: LAUDO_ID, result: [laudo()], result_enc: null })

    const res = await app.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: AUTH })

    expect(res.statusCode).toBe(200)
    expect(res.json()[0].summary).toBe('Hemoglobina 14,2 g/dL')
  })

  it('o envelope movido para a linha de outro paciente NÃO é servido', async () => {
    // O ataque que o AAD existe para impedir, exercitado ponta a ponta: quem tem
    // escrita no banco copia o `result_enc` do paciente A para a linha do
    // paciente B. Sem AAD isto devolveria 200 com o prontuário alheio — e nada
    // no sistema acusaria. Com AAD, a linha morre aqui.
    const envelopeDeOutraLinha = cifrarJson(
      [laudo({ summary: 'PRONTUÁRIO DE OUTRA PESSOA' })],
      aadDe('exam_results', 'result', 'linha-de-outro-paciente'),
    )
    app = await appDeLaudos({ id: LAUDO_ID, result: null, result_enc: envelopeDeOutraLinha })

    const res = await app.inject({ method: 'GET', url: `/laudos/${LAUDO_ID}`, headers: AUTH })

    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('OUTRA PESSOA')
  })

  it('GET /resultados decifra paineis e resumo', async () => {
    const paineis = [{ nome: 'Glicose', valor: '92', unidade: 'mg/dL' }]
    const handler: SupaHandler = (call) => {
      if (call.table === 'pacientes') return { data: { id: 'pac-1' }, error: null }
      if (call.table === 'resultados') {
        return {
          data: [
            {
              id: RES_ID,
              paciente_id: 'pac-1',
              agendamento_id: null,
              exame_nome: 'Glicemia',
              categoria: null,
              status: 'ready',
              resumo: null,
              paineis: [],
              resumo_enc: cifrar('Glicemia normal', aadDe('resultados', 'resumo', RES_ID)),
              paineis_enc: cifrarJson(paineis, aadDe('resultados', 'paineis', RES_ID)),
              laudo_url: null,
              declaracao_url: null,
              liberado_em: '2026-08-01T12:00:00.000Z',
              flowlab_analise_id: null,
            },
          ],
          error: null,
        }
      }
      return { data: null, error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)
    app = await buildApp(resultadosRoutes)

    const res = await app.inject({ method: 'GET', url: '/resultados', headers: AUTH })

    expect(res.statusCode).toBe(200)
    const [primeiro] = res.json()
    expect(primeiro.resumo).toBe('Glicemia normal')
    expect(primeiro.paineis).toEqual(paineis)
  })
})

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

describe('escrita — o que sai em direção ao banco vai cifrado', () => {
  it('o webhook do FlowLab grava paineis e resumo cifrados', async () => {
    const calls: SupaCall[] = []
    const handler: SupaHandler = (call) => {
      calls.push(call)
      if (call.table === 'agendamentos') {
        return { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
      }
      return { error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)
    app = await buildApp(webhooksRoutes)

    const payload = {
      agendamentoLabhubId: AG_ID,
      exameNome: 'Glicemia de jejum',
      resumo: 'Dentro da referência',
      paineis: [
        { nome: 'Glicose', valor: '92', unidade: 'mg/dL', ref: '70 a 99', ok: true },
      ],
      liberadoEm: '2026-08-01T12:00:00.000Z',
    }
    const body = JSON.stringify(payload)
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/resultados',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': createHmac('sha256', process.env.FLOWLAB_WEBHOOK_SECRET!)
          .update(body)
          .digest('hex'),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(201)

    const insert = calls.find((c) => c.table === 'resultados' && c.op === 'insert')
    const gravado = insert?.payload as Record<string, unknown>

    // O id vem da API, não do banco: o AAD precisa dele antes de cifrar.
    expect(gravado.id).toMatch(/^[0-9a-f-]{36}$/)

    // E o que foi gravado decifra de volta no original — pelo AAD daquela linha.
    const id = gravado.id as string
    expect(
      decifrarJson(gravado.paineis_enc as string, aadDe('resultados', 'paineis', id)),
    ).toEqual(payload.paineis)
    expect(decifrar(gravado.resumo_enc as string, aadDe('resultados', 'resumo', id))).toBe(
      'Dentro da referência',
    )
  })

  it('saveResult escreve nas DUAS colunas, e a cifrada decifra de volta', async () => {
    // Escrita dupla é o que torna a fase 1 reversível: enquanto a coluna em
    // claro continuar sendo preenchida, voltar o deploy não perde laudo nenhum.
    // Se um dia alguém "limpar" o `result` daqui achando que é resíduo, este
    // teste cai — e é para cair.
    const calls: SupaCall[] = []
    const handler: SupaHandler = (call) => {
      calls.push(call)
      return { error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)

    const laudos = [laudo()] as unknown as Parameters<ExamResultRepository['saveResult']>[1]
    await new ExamResultRepository().saveResult(LAUDO_ID, laudos)

    const update = calls.find((c) => c.table === 'exam_results' && c.op === 'update')
    const gravado = update?.payload as Record<string, unknown>

    expect(gravado.result).toEqual(laudos)
    expect(
      decifrarJson(gravado.result_enc as string, aadDe('exam_results', 'result', LAUDO_ID)),
    ).toEqual(laudos)
  })

  it('resumo ausente não gera envelope vazio', async () => {
    const calls: SupaCall[] = []
    const handler: SupaHandler = (call) => {
      calls.push(call)
      if (call.table === 'agendamentos') {
        return { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
      }
      return { error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)
    app = await buildApp(webhooksRoutes)

    const body = JSON.stringify({
      agendamentoLabhubId: AG_ID,
      exameNome: 'Glicemia de jejum',
      paineis: [],
      liberadoEm: '2026-08-01T12:00:00.000Z',
    })
    await app.inject({
      method: 'POST',
      url: '/webhooks/resultados',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': createHmac('sha256', process.env.FLOWLAB_WEBHOOK_SECRET!)
          .update(body)
          .digest('hex'),
      },
      payload: body,
    })

    const insert = calls.find((c) => c.table === 'resultados' && c.op === 'insert')
    const gravado = insert?.payload as Record<string, unknown>
    expect(gravado).not.toHaveProperty('resumo_enc')
    expect(gravado.paineis_enc).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Fase 2a — o RÓTULO, não só o valor
// ---------------------------------------------------------------------------
//
// A fase 1 cifrou o conteúdo do exame e deixou o nome dele em claro. Em
// produção isso era, num join de uma linha: "<paciente>" → "TESTE RÁPIDO COMBO
// — COVID-19 / INFLUENZA A E B". Para dado de saúde o rótulo costuma ser a
// revelação inteira, e é isso que estes testes protegem.

describe('fase 2a — rótulos e identificadores', () => {
  const DOC_ID = '77777777-7777-7777-7777-777777777777'
  const EXAM_ID = '88888888-8888-8888-8888-888888888888'

  it('toResultado decifra o nome do exame e a categoria', () => {
    const linha = {
      id: RES_ID,
      paciente_id: 'pac-1',
      agendamento_id: null,
      // Em claro fica um valor DIFERENTE do cifrado: se o mapper cair na coluna
      // errada, o teste diz qual das duas ele leu em vez de passar por acaso.
      exame_nome: 'placeholder em claro',
      categoria: 'categoria em claro',
      status: 'ready',
      resumo: null,
      paineis: [],
      exame_nome_enc: cifrar(
        'TESTE RÁPIDO COMBO — COVID-19 / INFLUENZA A E B',
        aadDe('resultados', 'exame_nome', RES_ID),
      ),
      categoria_enc: cifrar('Imunologia', aadDe('resultados', 'categoria', RES_ID)),
      laudo_url: null,
      declaracao_url: null,
      liberado_em: null,
      flowlab_analise_id: null,
    }

    const r = toResultado(linha)

    expect(r.exameNome).toBe('TESTE RÁPIDO COMBO — COVID-19 / INFLUENZA A E B')
    expect(r.categoria).toBe('Imunologia')
  })

  it('toResultado ainda serve a linha antiga, só em claro', () => {
    const r = toResultado({
      id: RES_ID,
      paciente_id: 'pac-1',
      agendamento_id: null,
      exame_nome: 'Glicemia de jejum',
      categoria: 'Bioquímica',
      status: 'ready',
      resumo: null,
      paineis: [],
      laudo_url: null,
      declaracao_url: null,
      liberado_em: null,
      flowlab_analise_id: null,
    })

    expect(r.exameNome).toBe('Glicemia de jejum')
    expect(r.categoria).toBe('Bioquímica')
  })

  // O AAD é o que impede mover envelope de uma linha para outra. Sem ele, quem
  // tem escrita no banco troca o rótulo de um paciente pelo de outro e nada
  // acusa — o mesmo ataque que a fase 1 já barrava para o conteúdo.
  it('rótulo cifrado sob o AAD de OUTRA linha não é servido', () => {
    const linha = {
      id: RES_ID,
      paciente_id: 'pac-1',
      agendamento_id: null,
      exame_nome: 'Glicemia',
      categoria: null,
      status: 'ready',
      resumo: null,
      paineis: [],
      exame_nome_enc: cifrar('Carga viral', aadDe('resultados', 'exame_nome', 'outra-linha')),
      laudo_url: null,
      declaracao_url: null,
      liberado_em: null,
      flowlab_analise_id: null,
    }

    expect(() => toResultado(linha)).toThrow()
  })

  it('toAgendamento decifra os exames da coleta', () => {
    const exames = [{ nome: 'Beta HCG', codigo: 'BHCG' }]
    const ag = toAgendamento({
      id: AG_ID,
      paciente_id: 'pac-1',
      posto_flowlab_id: 'posto-1',
      posto_nome: 'Unidade Centro',
      data_hora: '2026-08-01T12:00:00.000Z',
      status: 'realizado',
      flowlab_id: null,
      criado_em: '2026-08-01T10:00:00.000Z',
      exames: null,
      exames_enc: cifrarJson(exames, aadDe('agendamentos', 'exames', AG_ID)),
    })

    expect(ag.exames).toEqual(exames)
  })

  it('toDocumento decifra o nome do arquivo', () => {
    const doc = toDocumento({
      id: DOC_ID,
      paciente_id: 'pac-1',
      agendamento_id: null,
      tipo: 'pedido_medico',
      nome_arquivo: 'placeholder.pdf',
      storage_path: 'pac-1/x.pdf',
      mime_type: 'application/pdf',
      tamanho_bytes: 10,
      criado_em: '2026-08-01T10:00:00.000Z',
      nome_arquivo_enc: cifrar(
        'pedido_medico_hemograma.pdf',
        aadDe('documentos', 'nome_arquivo', DOC_ID),
      ),
    })

    expect(doc.nomeArquivo).toBe('pedido_medico_hemograma.pdf')
  })

  it('o webhook grava o nome do exame e a categoria cifrados', async () => {
    const calls: SupaCall[] = []
    const handler: SupaHandler = (call) => {
      calls.push(call)
      if (call.table === 'agendamentos') {
        return { data: { id: AG_ID, paciente_id: 'pac-1' }, error: null }
      }
      return { error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)
    app = await buildApp(webhooksRoutes)

    const payload = {
      agendamentoLabhubId: AG_ID,
      exameNome: 'TESTE RÁPIDO COMBO — COVID-19 / INFLUENZA A E B',
      categoria: 'Imunologia',
      paineis: [],
      liberadoEm: '2026-08-01T12:00:00.000Z',
    }
    const body = JSON.stringify(payload)
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/resultados',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': createHmac('sha256', process.env.FLOWLAB_WEBHOOK_SECRET!)
          .update(body)
          .digest('hex'),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(201)
    const gravado = calls.find((c) => c.table === 'resultados' && c.op === 'insert')
      ?.payload as Record<string, unknown>
    const id = gravado.id as string

    expect(decifrar(gravado.exame_nome_enc as string, aadDe('resultados', 'exame_nome', id))).toBe(
      payload.exameNome,
    )
    expect(decifrar(gravado.categoria_enc as string, aadDe('resultados', 'categoria', id))).toBe(
      'Imunologia',
    )
    // Escrita dupla: é o que mantém o deploy reversível enquanto as duas colunas
    // convivem. Derrubar a coluna em claro é migration própria.
    expect(gravado.exame_nome).toBe(payload.exameNome)
  })

  it('insertAwaiting grava o CPF cifrado — a segunda cópia fora de `pacientes`', async () => {
    const calls: SupaCall[] = []
    h.setSb(
      createSupabaseMock({
        handler: (call) => {
          calls.push(call)
          return { error: null }
        },
      }).client,
    )

    await new ExamResultRepository().insertAwaiting('pac-1', '52998224725', 'LIS-1', null)

    const gravado = calls.find((c) => c.table === 'exam_results' && c.op === 'insert')
      ?.payload as Record<string, unknown>
    const id = gravado.id as string

    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(decifrar(gravado.cpf_enc as string, aadDe('exam_results', 'cpf', id))).toBe('52998224725')
  })

  // A checagem de segunda chave (linha cujo CPF diverge do paciente do token não
  // é servida) precisa continuar valendo com a coluna cifrada — senão cifrar
  // teria desarmado uma barreira de segurança em silêncio.
  it('a segunda chave continua bloqueando quando o CPF está cifrado', async () => {
    h.setSb(
      createSupabaseMock({
        handler: () => ({
          data: [
            {
              id: EXAM_ID,
              cpf: '52998224725', // em claro bate — só o cifrado diverge
              cpf_enc: cifrar('11144477735', aadDe('exam_results', 'cpf', EXAM_ID)),
              result: [laudo()],
              result_enc: null,
              cached_at: null,
            },
          ],
          error: null,
        }),
      }).client,
    )

    const laudos = await new ExamResultRepository().findByPaciente('pac-1', '52998224725')

    expect(laudos).toEqual([])
  })
})
