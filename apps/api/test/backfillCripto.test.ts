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
import { createSupabaseMock, type SupaHandler, type SupaResult } from './helpers.js'

// O backfill de `pacientes.cpf` → `cpf_hash`/`cpf_enc` (fase 2b do S-06) e sua
// verificação saíram junto do drop da coluna em claro (ticket 04) — não sobra
// coluna nenhuma para migrar. Só resta `resultados.exame_nome`, que já
// convivia sem teste dedicado próprio (ver o cabeçalho de backfillCripto.ts);
// o que fica aqui é o fail-closed genérico do módulo e o verificarBackfill()
// que sobreviveu.

function fakeLog(): Logger {
  return { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as Logger
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('backfillCriptografia', () => {
  it('sem PII_KEY_K1, recusa rodar (fail-closed)', async () => {
    vi.stubEnv('PII_KEY_K1', '')
    h.setSb(createSupabaseMock({ handler: () => ({ data: [], error: null }) }).client)

    await expect(backfillCriptografia(fakeLog())).rejects.toThrow(/PII_KEY_K1 não configurada/)
  })
})

describe('verificarBackfill — resultados.exame_nome_enc', () => {
  it('reporta quantas linhas de resultados ainda têm exame_nome sem exame_nome_enc', async () => {
    const handler: SupaHandler = (call) => {
      if (call.table === 'resultados') return { data: null, error: null, count: 3 } as SupaResult
      return { data: null, error: null, count: 0 } as SupaResult
    }
    h.setSb(createSupabaseMock({ handler }).client)

    expect(await verificarBackfill()).toEqual({ rotulos: 3 })
  })

  it('zero é o sinal verde: nenhuma linha pendente', async () => {
    h.setSb(
      createSupabaseMock({
        handler: () => ({ data: null, error: null, count: 0 }) as SupaResult,
      }).client,
    )

    expect(await verificarBackfill()).toEqual({ rotulos: 0 })
  })
})
