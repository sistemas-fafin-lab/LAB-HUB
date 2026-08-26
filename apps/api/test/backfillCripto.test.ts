import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from 'pino'

// Proxy hoisted p/ o singleton supabase, mesmo padrão dos demais testes.
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

import { backfillCriptografia, verificarBackfill } from '../src/lib/backfillCripto.js'
import { aadDe, decifrar, hashCpf } from '../src/lib/crypto.js'
import { createSupabaseMock, type SupaHandler, type SupaResult } from './helpers.js'

// Backfill de `pacientes.cpf` → `cpf_hash`/`cpf_enc` (fase 2b do S-06, ticket
// 01). `resultados.exame_nome` já tinha o mesmo formato e continua sem teste
// dedicado; o que muda aqui é só a segunda coluna que o módulo passou a cobrir.

function fakeLog(): Logger {
  return { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as Logger
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('backfillCriptografia — pacientes.cpf_hash/cpf_enc', () => {
  it('migra a linha pendente gravando cpf_hash e cpf_enc a partir do cpf em claro', async () => {
    const linha = { id: 'pac-1', cpf: '52998224725' }
    let updatePayload: Record<string, unknown> | undefined

    const handler: SupaHandler = (call) => {
      if (call.table !== 'pacientes') return { data: null, error: null }
      if (call.op === 'select') return { data: [linha], error: null }
      if (call.op === 'update') {
        updatePayload = call.payload as Record<string, unknown>
        // Ecoa a linha — é o que o UPDATE guardado por `.is('cpf_hash', null)`
        // devolve quando de fato encontra e atualiza a linha (ver o teste da
        // guarda de corrida logo abaixo, onde ele devolve vazio).
        return { data: { id: linha.id }, error: null }
      }
      return { data: null, error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)

    const resultado = await backfillCriptografia(fakeLog())

    expect(resultado.pacientes).toBe(1)
    expect(updatePayload?.cpf_hash).toBe(hashCpf(linha.cpf))
    expect(
      decifrar(updatePayload?.cpf_enc as string, aadDe('pacientes', 'cpf', linha.id)),
    ).toBe(linha.cpf)
  })

  // Mesma guarda de corrida de `backfillRotulos`: se uma escrita concorrente
  // (um cadastro novo, por exemplo) preencheu cpf_hash entre o SELECT e o
  // UPDATE deste backfill, o filtro faz o UPDATE não encontrar a linha em vez
  // de sobrescrever um par mais novo com um derivado do mesmo `cpf`.
  it('o UPDATE usa .is(cpf_hash, null) como guarda contra escrita concorrente', async () => {
    const linha = { id: 'pac-1', cpf: '52998224725' }
    const handler: SupaHandler = (call) => {
      if (call.table !== 'pacientes') return { data: null, error: null }
      if (call.op === 'select') return { data: [linha], error: null }
      return { data: null, error: null }
    }
    const mock = createSupabaseMock({ handler })
    h.setSb(mock.client)

    await backfillCriptografia(fakeLog())

    const update = mock.calls.find((c) => c.table === 'pacientes' && c.op === 'update')
    expect(update?.filters).toMatchObject({ id: linha.id, cpf_hash: null })
  })

  // Corrida de verdade: entre o SELECT do backfill e o UPDATE guardado, um
  // cadastro concorrente já preencheu cpf_hash — o guard `.is('cpf_hash',
  // null)` não casa mais, e o PostgREST responde sem linha. O contador de
  // progresso não pode contar isso como migração.
  it('não conta no total quando o guard perde a corrida (update não encontra linha)', async () => {
    const linha = { id: 'pac-1', cpf: '52998224725' }
    const handler: SupaHandler = (call) => {
      if (call.table !== 'pacientes') return { data: null, error: null }
      if (call.op === 'select') return { data: [linha], error: null }
      if (call.op === 'update') return { data: null, error: null } // guard não achou nada
      return { data: null, error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)

    const resultado = await backfillCriptografia(fakeLog())

    expect(resultado.pacientes).toBe(0)
  })

  it('rodar duas vezes seguidas não altera nada na segunda execução (idempotência)', async () => {
    const linha = { id: 'pac-1', cpf: '52998224725' }
    const migradas = new Set<string>()

    const handler: SupaHandler = (call) => {
      if (call.table !== 'pacientes') return { data: null, error: null }
      if (call.op === 'select') {
        return { data: migradas.has(linha.id) ? [] : [linha], error: null }
      }
      if (call.op === 'update') {
        migradas.add(call.filters.id as string)
        return { data: { id: linha.id }, error: null }
      }
      return { data: null, error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)

    const primeira = await backfillCriptografia(fakeLog())
    const segunda = await backfillCriptografia(fakeLog())

    expect(primeira.pacientes).toBe(1)
    expect(segunda.pacientes).toBe(0)
  })

  it('varre em lotes de até 100, continuando enquanto o lote vier cheio', async () => {
    const TOTAL = 150
    const linhas = Array.from({ length: TOTAL }, (_, i) => ({
      id: `pac-${String(i).padStart(4, '0')}`,
      cpf: String(10000000000 + i),
    }))
    const pendentes = new Set(linhas.map((l) => l.id))
    const tamanhosDosLotes: number[] = []

    const handler: SupaHandler = (call) => {
      if (call.table !== 'pacientes') return { data: null, error: null }
      if (call.op === 'select') {
        const pagina = linhas.filter((l) => pendentes.has(l.id)).slice(0, 100)
        tamanhosDosLotes.push(pagina.length)
        return { data: pagina, error: null }
      }
      if (call.op === 'update') {
        const id = call.filters.id as string
        pendentes.delete(id)
        return { data: { id }, error: null }
      }
      return { data: null, error: null }
    }
    h.setSb(createSupabaseMock({ handler }).client)

    const resultado = await backfillCriptografia(fakeLog())

    expect(resultado.pacientes).toBe(TOTAL)
    expect(pendentes.size).toBe(0)
    // Um lote cheio (100, continua) seguido do resto (50, encerra) — dois
    // SELECTs, não um só varrendo tudo de uma vez.
    expect(tamanhosDosLotes).toEqual([100, 50])
  })

  it('sem CPF_HASH_KEY, recusa rodar (fail-closed)', async () => {
    vi.stubEnv('CPF_HASH_KEY', '')
    h.setSb(createSupabaseMock({ handler: () => ({ data: [], error: null }) }).client)

    await expect(backfillCriptografia(fakeLog())).rejects.toThrow(/CPF_HASH_KEY não configurada/)
  })

  it('sem PII_KEY_K1, recusa rodar (fail-closed, mesma checagem de sempre)', async () => {
    vi.stubEnv('PII_KEY_K1', '')
    h.setSb(createSupabaseMock({ handler: () => ({ data: [], error: null }) }).client)

    await expect(backfillCriptografia(fakeLog())).rejects.toThrow(/PII_KEY_K1 não configurada/)
  })
})

describe('verificarBackfill — pacientes.cpf_hash', () => {
  it('reporta quantas linhas de pacientes ainda têm cpf sem par cpf_hash/cpf_enc', async () => {
    const handler: SupaHandler = (call) => {
      if (call.table === 'pacientes') return { data: null, error: null, count: 3 } as SupaResult
      return { data: null, error: null, count: 0 } as SupaResult
    }
    h.setSb(createSupabaseMock({ handler }).client)

    expect(await verificarBackfill()).toEqual({ rotulos: 0, pacientes: 3 })
  })

  it('zero é o sinal verde: nenhuma linha com cpf pendente', async () => {
    h.setSb(
      createSupabaseMock({
        handler: () => ({ data: null, error: null, count: 0 }) as SupaResult,
      }).client,
    )

    expect(await verificarBackfill()).toEqual({ rotulos: 0, pacientes: 0 })
  })
})
