import { afterEach, describe, expect, it, vi } from 'vitest'

// Proxy hoisted p/ o singleton supabase, igual aos demais testes.
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

import {
  excluirContaPaciente,
  expurgarDocumentosVencidos,
  expurgarTrilhaAuditoria,
  type Log,
} from '../src/lib/expurgo.js'
import { createSupabaseMock, type StorageHandler, type SupaHandler, type SupaResult } from './helpers.js'

const PAC = 'pac-1'
const AUTH = 'auth-user-1'
const EXCLUSAO = 'exc-1'

// Logger silencioso que guarda o que foi registrado — o log é o único sinal de
// alguns caminhos de falha, então ele é asserção, não ruído.
function criarLog(): Log & { erros: object[] } {
  const erros: object[] = []
  return {
    info: () => {},
    warn: () => {},
    error: (obj) => {
      erros.push(obj)
    },
    erros,
  }
}

function doc(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, storage_path: `${PAC}/${id}.pdf`, paciente_id: PAC, ...over }
}

const DIA = 24 * 60 * 60 * 1000

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('expurgarDocumentosVencidos', () => {
  function montar(opts: { handler: SupaHandler; storage?: StorageHandler }) {
    const mock = createSupabaseMock(opts)
    h.setSb(mock.client)
    return mock
  }

  it('apaga os bytes ANTES da linha — a ordem é a garantia contra órfão', async () => {
    const mock = montar({
      handler: (call) => {
        if (call.table === 'documentos' && call.op === 'select') {
          // Só a consulta dos de coleta devolve alvo; a dos perenes vem vazia.
          return { data: call.filters['agendamento_id__not_is'] === null ? [doc('d1')] : [], error: null }
        }
        return { data: [], error: null }
      },
    })

    const r = await expurgarDocumentosVencidos(criarLog())

    expect(r.documentosRemovidos).toBe(1)
    expect(mock.storageCalls).toEqual([
      { bucket: 'documentos', op: 'remove', paths: [`${PAC}/d1.pdf`] },
    ])
    // A ordem real: o delete da linha só existe depois do remove do Storage.
    const del = mock.calls.find((c) => c.op === 'delete')
    expect(del?.table).toBe('documentos')
    expect(del?.filters.id__in).toEqual(['d1'])
  })

  it('não apaga a linha se o Storage falhar — o próximo ciclo tenta de novo', async () => {
    const mock = montar({
      handler: (call) =>
        call.table === 'documentos' && call.op === 'select' && call.filters['agendamento_id__not_is'] === null
          ? { data: [doc('d1')], error: null }
          : { data: [], error: null },
      storage: () => ({ data: null, error: { message: 'storage fora do ar' } }),
    })

    await expect(expurgarDocumentosVencidos(criarLog())).rejects.toThrow(/Storage/)
    expect(mock.calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('poupa o documento perene de paciente que ainda tem coleta na janela', async () => {
    const mock = montar({
      handler: (call) => {
        if (call.table === 'documentos' && call.op === 'select') {
          // Nada vencido por coleta; um perene antigo do PAC.
          return call.filters['agendamento_id__not_is'] === null
            ? { data: [], error: null }
            : { data: [doc('perene-1')], error: null }
        }
        // O paciente aparece como ativo: tem agendamento dentro da janela.
        if (call.table === 'agendamentos') {
          return { data: [{ paciente_id: PAC }], error: null }
        }
        return { data: [], error: null }
      },
    })

    const r = await expurgarDocumentosVencidos(criarLog())

    expect(r.documentosRemovidos).toBe(0)
    expect(mock.storageCalls).toEqual([])
  })

  it('apaga o perene quando o paciente está inativo', async () => {
    const mock = montar({
      handler: (call) => {
        if (call.table === 'documentos' && call.op === 'select') {
          return call.filters['agendamento_id__not_is'] === null
            ? { data: [], error: null }
            : { data: [doc('perene-1')], error: null }
        }
        if (call.table === 'agendamentos') return { data: [], error: null } // sem coleta recente
        return { data: [], error: null }
      },
    })

    const r = await expurgarDocumentosVencidos(criarLog())

    expect(r.documentosRemovidos).toBe(1)
    expect(mock.storageCalls[0]?.paths).toEqual([`${PAC}/perene-1.pdf`])
  })

  it('usa os prazos do ambiente para calcular o corte', async () => {
    vi.stubEnv('RETENCAO_DOC_COLETA_DIAS', '30')
    const mock = montar({ handler: () => ({ data: [], error: null }) })

    await expurgarDocumentosVencidos(criarLog())

    const consulta = mock.calls.find((c) => c.filters['agendamento_id__not_is'] === null)
    const corte = new Date(consulta?.filters['agendamentos.data_hora__lt'] as string).getTime()
    // ~30 dias atrás, com folga de um dia p/ não depender do relógio do CI.
    expect(Math.abs(Date.now() - corte - 30 * DIA)).toBeLessThan(DIA)
  })

  it('ignora prazo inválido no ambiente e mantém o padrão', async () => {
    vi.stubEnv('RETENCAO_DOC_COLETA_DIAS', 'noventa')
    const mock = montar({ handler: () => ({ data: [], error: null }) })

    await expurgarDocumentosVencidos(criarLog())

    const consulta = mock.calls.find((c) => c.filters['agendamento_id__not_is'] === null)
    const corte = new Date(consulta?.filters['agendamentos.data_hora__lt'] as string).getTime()
    expect(Math.abs(Date.now() - corte - 90 * DIA)).toBeLessThan(DIA)
  })
})

describe('excluirContaPaciente', () => {
  function montar(opts: {
    handler?: SupaHandler
    storage?: StorageHandler
    rpc?: (c: { fn: string; args: Record<string, unknown> }) => SupaResult
    deleteUser?: SupaResult
  }) {
    const mock = createSupabaseMock({
      handler: opts.handler ?? ((call) =>
        call.table === 'documentos' && call.op === 'select'
          ? { data: [doc('d1')], error: null }
          : { data: null, error: null }),
      ...(opts.storage ? { storage: opts.storage } : {}),
      rpc: opts.rpc ?? (() => ({ data: { exclusao_id: EXCLUSAO, auth_user_id: AUTH }, error: null })),
      ...(opts.deleteUser ? { deleteUser: opts.deleteUser } : {}),
    })
    h.setSb(mock.client)
    return mock
  }

  it('segue a ordem: documentos, desvínculo, Auth, trilha', async () => {
    const mock = montar({})

    await excluirContaPaciente(PAC, criarLog())

    // 1) bytes fora antes de tudo
    expect(mock.storageCalls[0]).toMatchObject({ op: 'remove', paths: [`${PAC}/d1.pdf`] })
    // 2) desvínculo pela RPC, nunca por update solto em pacientes
    expect(mock.rpcCalls).toEqual([{ fn: 'excluir_conta_paciente', args: { p_paciente_id: PAC } }])
    expect(mock.calls.some((c) => c.table === 'pacientes' && c.op === 'update')).toBe(false)
    // 3) só então o usuário sai do Auth
    expect(mock.deleteUser).toHaveBeenCalledWith(AUTH)
    // 4) trilha fechada com a contagem
    const trilha = mock.calls.find((c) => c.table === 'exclusoes_conta')
    expect(trilha?.op).toBe('update')
    expect(trilha?.payload).toMatchObject({ documentos_removidos: 1 })
    expect(trilha?.filters.id).toBe(EXCLUSAO)
  })

  it('não toca no Auth se o desvínculo falhar — senão o cascade leva o prontuário', async () => {
    const mock = montar({ rpc: () => ({ data: null, error: { message: 'boom' } }) })

    await expect(excluirContaPaciente(PAC, criarLog())).rejects.toThrow(/excluir conta/i)
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })

  it('não desvincula se os documentos não puderam ser apagados', async () => {
    const mock = montar({ storage: () => ({ data: null, error: { message: 'fora do ar' } }) })

    await expect(excluirContaPaciente(PAC, criarLog())).rejects.toThrow(/Storage/)
    expect(mock.rpcCalls).toEqual([])
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })

  it('conclui e registra quando o Auth falha: o acesso já morreu no desvínculo', async () => {
    const mock = montar({ deleteUser: { data: null, error: { message: 'auth fora do ar' } } })
    const log = criarLog()

    // Não relança: repetir não é possível, o paciente já está desvinculado.
    await expect(excluirContaPaciente(PAC, log)).resolves.toBeUndefined()
    expect(log.erros.some((e) => 'exclusaoId' in e)).toBe(true)
    // A trilha fica ABERTA (auth_removido_em null) — é o sinal de pendência.
    expect(mock.calls.some((c) => c.table === 'exclusoes_conta')).toBe(false)
  })
})

describe('expurgarTrilhaAuditoria', () => {
  function montar(rpc?: (c: { fn: string; args: Record<string, unknown> }) => SupaResult) {
    const mock = createSupabaseMock({
      handler: () => ({ data: [], error: null }),
      rpc:
        rpc ??
        (() => ({
          data: {
            removidas: 3,
            corte: '2026-02-03T00:00:00.000Z',
            mais_antiga: '2026-01-02T10:00:00.000Z',
            mais_recente: '2026-02-02T23:00:00.000Z',
          },
          error: null,
        })),
    })
    h.setSb(mock.client)
    return mock
  }

  // A asserção mais importante do arquivo: se um dia alguém transformar o corte
  // em argumento "para facilitar o teste", este teste quebra — e deve quebrar.
  // Corte parametrizável = este processo consegue zerar a trilha inteira, que é
  // o estrago que o revoke do DELETE (migration 20260803140000) existe p/ negar.
  it('chama a RPC SEM argumentos — o prazo mora no banco, não em quem chama', async () => {
    const mock = montar()

    await expurgarTrilhaAuditoria(criarLog())

    expect(mock.rpcCalls).toHaveLength(1)
    expect(mock.rpcCalls[0]?.fn).toBe('expurgar_auditoria_acesso')
    expect(Object.keys(mock.rpcCalls[0]?.args ?? {})).toEqual([])
  })

  it('devolve o que saiu, para o cron ter o que registrar', async () => {
    montar()

    await expect(expurgarTrilhaAuditoria(criarLog())).resolves.toEqual({
      removidas: 3,
      corte: '2026-02-03T00:00:00.000Z',
    })
  })

  it('execução que não acha nada é sucesso, não silêncio', async () => {
    montar(() => ({
      data: { removidas: 0, corte: '2026-02-03T00:00:00.000Z', mais_antiga: null, mais_recente: null },
      error: null,
    }))

    const r = await expurgarTrilhaAuditoria(criarLog())
    expect(r?.removidas).toBe(0)
  })

  // Falhar aqui não pode escalar: o script roda a retenção DEPOIS dos documentos
  // e um throw faria o cron reportar falha de uma rotina que já concluiu a parte
  // irreversível. Reter a trilha um dia a mais é o lado recuperável.
  it('não lança quando a RPC falha — só registra', async () => {
    montar(() => ({ data: null, error: { message: 'permission denied' } }))
    const log = criarLog()

    await expect(expurgarTrilhaAuditoria(log)).resolves.toBeNull()
    expect(log.erros).toHaveLength(1)
  })

  it('trata resposta vazia sem erro como falha, e não como zero removidas', async () => {
    montar(() => ({ data: null, error: null }))
    const log = criarLog()

    await expect(expurgarTrilhaAuditoria(log)).resolves.toBeNull()
    expect(log.erros).toHaveLength(1)
  })
})
