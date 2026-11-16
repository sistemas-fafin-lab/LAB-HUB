import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Agendamento } from '@lab-hub/shared'

type Handler = (evento: string, sessao: { user: { id: string } } | null) => void
let aoMudarAuth: Handler
const get = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Handler) => {
        aoMudarAuth = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))
vi.mock('./api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }))

const ag = (over: Partial<Agendamento> = {}): Agendamento =>
  ({
    id: 'a-1',
    pacienteId: 'p',
    postoFlowlabId: 'posto-1',
    postoNome: 'Unidade',
    dataHora: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'confirmado',
    criadoEm: '2026-11-01T10:00:00Z',
    ...over,
  }) as Agendamento

async function modulo() {
  vi.resetModules()
  return import('./useAgendamentos')
}

beforeEach(() => get.mockReset())

describe('useAgendamentos (cache de módulo)', () => {
  it('dois componentes montados juntos dividem uma requisição só', async () => {
    get.mockResolvedValue([ag()])
    const mod = await modulo()
    const a = renderHook(() => mod.useAgendamentos())
    const b = renderHook(() => mod.useAgendamentos())
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    expect(get).toHaveBeenCalledTimes(1)
    expect(b.result.current.agendamentos).toHaveLength(1)
  })

  it('contagem de coletas em andamento: null antes da busca, depois o número', async () => {
    let responde: (v: Agendamento[]) => void = () => {}
    get.mockReturnValue(new Promise((ok) => (responde = ok)))
    const mod = await modulo()
    renderHook(() => mod.useAgendamentos())
    const contagem = renderHook(() => mod.useContagemColetasAtivas())
    expect(contagem.result.current).toBeNull()
    await act(async () => responde([ag(), ag({ id: 'a-2', status: 'cancelado' })]))
    expect(contagem.result.current).toBe(1)
  })

  it('setStatus muda a lista de todos os consumidores', async () => {
    get.mockResolvedValue([ag()])
    const mod = await modulo()
    const a = renderHook(() => mod.useAgendamentos())
    const b = renderHook(() => mod.useAgendamentos())
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    act(() => a.result.current.setStatus('a-1', 'cancelado'))
    expect(b.result.current.agendamentos[0]?.status).toBe('cancelado')
  })

  it('trocar de usuário descarta a lista do anterior, mesmo com a resposta dele chegando depois', async () => {
    let respondeAntigo: (v: Agendamento[]) => void = () => {}
    get.mockReturnValueOnce(new Promise((ok) => (respondeAntigo = ok)))
    const mod = await modulo()
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-1' } }))
    const a = renderHook(() => mod.useAgendamentos())
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-2' } }))
    await act(async () => respondeAntigo([ag({ postoNome: 'De quem saiu' })]))
    expect(a.result.current.agendamentos).toEqual([])
  })
})
