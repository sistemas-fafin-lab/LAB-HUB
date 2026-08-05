import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

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
  apagarPacienteCompleto,
  inventariarPaciente,
  resolverPaciente,
  type PacienteAlvo,
} from '../src/lib/apagarPaciente.js'
import type { Log } from '../src/lib/expurgo.js'
import { createSupabaseMock, type StorageHandler, type SupaHandler } from './helpers.js'

const PAC = 'pac-1'
const AUTH = 'auth-user-1'

const ALVO: PacienteAlvo = { id: PAC, nome: 'Paciente Teste', authUserId: AUTH, excluidoEm: null }

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

function montar(opts: { handler: SupaHandler; storage?: StorageHandler; deleteUser?: unknown }) {
  const mock = createSupabaseMock(opts as Parameters<typeof createSupabaseMock>[0])
  h.setSb(mock.client)
  return mock
}

/** Cenário-padrão: 1 documento, 1 resultado com laudo, 1 exame, 1 agendamento. */
const CENARIO: SupaHandler = (call) => {
  if (call.table === 'documentos') {
    return { data: [{ id: 'd1', storage_path: `${PAC}/d1.pdf` }], error: null }
  }
  if (call.table === 'resultados') {
    return {
      data: [{ id: 'r1', laudo_url: 'laudos/r1.pdf', declaracao_url: null }],
      error: null,
    }
  }
  if (call.table === 'exam_results') return { data: [{ id: 'e1' }], error: null }
  if (call.table === 'agendamentos') return { data: [{ id: 'a1' }], error: null }
  return { data: [], error: null }
}

describe('resolverPaciente', () => {
  it('normaliza o CPF antes de consultar — o operador digita com pontuação', async () => {
    const mock = montar({
      handler: () => ({ data: [{ id: PAC, nome: 'X', auth_user_id: AUTH, excluido_em: null }], error: null }),
    })

    await resolverPaciente({ cpf: '123.456.789-09' })

    expect(mock.calls[0]?.filters.cpf).toBe('12345678909')
  })

  it('devolve null quando não existe, em vez de lançar', async () => {
    montar({ handler: () => ({ data: [], error: null }) })
    await expect(resolverPaciente({ id: PAC })).resolves.toBeNull()
  })
})

describe('inventariarPaciente', () => {
  it('acha órfão no bucket — objeto sem linha que aponte para ele', async () => {
    montar({
      handler: CENARIO,
      storage: (call) =>
        call.op === 'list'
          ? // d1 tem linha; d9 é o órfão que um teste antigo deixou para trás.
            { data: call.opcoesList?.offset === 0 ? [{ name: 'd1.pdf' }, { name: 'd9.jpg' }] : [], error: null }
          : { data: [], error: null },
    })

    const inv = await inventariarPaciente(ALVO, criarLog())

    expect(inv.objetosDocumentos).toEqual([`${PAC}/d1.pdf`])
    expect(inv.objetosOrfaos).toEqual([`${PAC}/d9.jpg`])
    expect(inv.objetosLaudos).toEqual(['laudos/r1.pdf'])
    expect(inv).toMatchObject({ documentos: 1, resultados: 1, examResults: 1, agendamentos: 1 })
  })

  it('varre o bucket pelo prefixo do paciente, não a raiz', async () => {
    const mock = montar({ handler: CENARIO })

    await inventariarPaciente(ALVO, criarLog())

    const list = mock.storageCalls.find((c) => c.op === 'list')
    expect(list?.bucket).toBe('documentos')
    expect(list?.paths).toEqual([PAC])
  })

  it('pagina o list — um bucket com mais de uma página não esconde objeto', async () => {
    const primeira = Array.from({ length: 100 }, (_, i) => ({ name: `p${i}.jpg` }))
    const mock = montar({
      handler: CENARIO,
      storage: (call) => {
        if (call.op !== 'list') return { data: [], error: null }
        return { data: call.opcoesList?.offset === 0 ? primeira : [{ name: 'ultimo.jpg' }], error: null }
      },
    })

    const inv = await inventariarPaciente(ALVO, criarLog())

    expect(mock.storageCalls.filter((c) => c.op === 'list')).toHaveLength(2)
    expect(inv.objetosOrfaos).toHaveLength(101)
  })

  it('não manda o mesmo PDF duas vezes quando é laudo de um e declaração de outro', async () => {
    montar({
      handler: (call) =>
        call.table === 'resultados'
          ? {
              data: [
                { id: 'r1', laudo_url: 'laudos/x.pdf', declaracao_url: null },
                { id: 'r2', laudo_url: null, declaracao_url: 'laudos/x.pdf' },
              ],
              error: null,
            }
          : { data: [], error: null },
    })

    const inv = await inventariarPaciente(ALVO, criarLog())

    expect(inv.objetosLaudos).toEqual(['laudos/x.pdf'])
  })
})

describe('apagarPacienteCompleto', () => {
  it('apaga os bytes dos DOIS buckets antes da linha do paciente', async () => {
    const mock = montar({
      handler: CENARIO,
      storage: (call) =>
        call.op === 'list'
          ? { data: call.opcoesList?.offset === 0 ? [{ name: 'd1.pdf' }, { name: 'd9.jpg' }] : [], error: null }
          : { data: [], error: null },
    })

    const inv = await inventariarPaciente(ALVO, criarLog())
    mock.storageCalls.length = 0
    mock.calls.length = 0

    const r = await apagarPacienteCompleto(ALVO, inv, criarLog())

    expect(mock.storageCalls.map((c) => ({ bucket: c.bucket, paths: c.paths }))).toEqual([
      { bucket: 'documentos', paths: [`${PAC}/d1.pdf`] }, // com linha
      { bucket: 'documentos', paths: [`${PAC}/d9.jpg`] }, // órfão
      { bucket: 'laudos', paths: ['laudos/r1.pdf'] },
    ])
    expect(r).toMatchObject({
      documentosRemovidos: 1,
      orfaosRemovidos: 1,
      laudosRemovidos: 1,
      objetosRemovidos: 3,
      authRemovido: true,
    })

    // O delete da linha do paciente é o ÚLTIMO delete de banco, depois de todo
    // o Storage — é ele que dispara o cascade e cega qualquer retry.
    const deletes = mock.calls.filter((c) => c.op === 'delete')
    expect(deletes.at(-1)?.table).toBe('pacientes')
    expect(deletes.at(-1)?.filters.id).toBe(PAC)
  })

  it('aborta sem apagar linha nenhuma se o Storage falhar', async () => {
    const mock = montar({
      handler: CENARIO,
      storage: (call) =>
        call.op === 'list' ? { data: [], error: null } : { data: null, error: { message: 'fora do ar' } },
    })

    const inv = await inventariarPaciente(ALVO, criarLog())
    mock.calls.length = 0

    await expect(apagarPacienteCompleto(ALVO, inv, criarLog())).rejects.toThrow(/Storage/)

    expect(mock.calls.filter((c) => c.op === 'delete')).toHaveLength(0)
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })

  it('não apaga o usuário do Auth se a linha do paciente não saiu', async () => {
    const mock = montar({
      handler: (call) =>
        call.table === 'pacientes' && call.op === 'delete'
          ? { data: null, error: { message: 'nope' } }
          : CENARIO(call),
    })

    const inv = await inventariarPaciente(ALVO, criarLog())

    await expect(apagarPacienteCompleto(ALVO, inv, criarLog())).rejects.toThrow(/apagar o paciente/)
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })

  it('conta órfã no Auth não derruba o apagamento — só vira log', async () => {
    const mock = montar({
      handler: CENARIO,
      deleteUser: { data: null, error: { message: 'auth fora do ar' } },
    })
    const log = criarLog()

    const inv = await inventariarPaciente(ALVO, log)
    const r = await apagarPacienteCompleto(ALVO, inv, log)

    expect(r.authRemovido).toBe(false)
    expect(mock.deleteUser).toHaveBeenCalled()
    expect(log.erros).toHaveLength(1)
  })

  it('paciente sem conta vinculada não chama o Auth', async () => {
    const mock = montar({ handler: CENARIO })
    const semConta: PacienteAlvo = { ...ALVO, authUserId: null }

    const inv = await inventariarPaciente(semConta, criarLog())
    const r = await apagarPacienteCompleto(semConta, inv, criarLog())

    expect(mock.deleteUser).not.toHaveBeenCalled()
    expect(r.authRemovido).toBe(false)
  })
})
