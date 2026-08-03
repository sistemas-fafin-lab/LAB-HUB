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
