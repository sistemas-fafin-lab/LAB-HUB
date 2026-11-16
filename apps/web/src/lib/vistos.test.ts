import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Exam } from './exame'

type Handler = (evento: string, sessao: { user: { id: string } } | null) => void
let aoMudarAuth: Handler
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
const resultados = { exams: [] as Exam[], loading: false, error: null as string | null }
vi.mock('./useResultados', () => ({ useResultados: () => resultados }))

const exame = (id: string, status: Exam['status'] = 'ready') => ({ id, status }) as Exam

function armazenamento() {
  const dados = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  })
  return dados
}

async function modulo() {
  vi.resetModules()
  return import('./vistos')
}

beforeEach(() => {
  resultados.exams = []
  resultados.loading = false
  resultados.error = null
})

describe('exames novos', () => {
  it('primeira vez: o que já está liberado conta como visto; o que chega depois é novo', async () => {
    const dados = armazenamento()
    const mod = await modulo()
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-1' } }))
    resultados.exams = [exame('a'), exame('b', 'analyzing')]
    const { result, rerender } = renderHook(() => mod.useExamesNovos())
    expect(result.current.size).toBe(0)
    expect(JSON.parse(dados.get('lh:vistos:u-1')!)).toEqual(['a'])

    resultados.exams = [exame('c'), exame('a'), exame('b', 'analyzing')]
    rerender()
    expect([...result.current]).toEqual(['c'])
  })

  it('abrir o exame o tira dos novos', async () => {
    armazenamento().set('lh:vistos:u-1', JSON.stringify(['a']))
    const mod = await modulo()
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-1' } }))
    resultados.exams = [exame('a'), exame('c')]
    const { result } = renderHook(() => mod.useExamesNovos())
    expect([...result.current]).toEqual(['c'])
    act(() => mod.marcarVisto('c'))
    expect(result.current.size).toBe(0)
  })

  it('com erro na lista, não registra nada (senão o histórico viraria novo)', async () => {
    const dados = armazenamento()
    const mod = await modulo()
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-1' } }))
    resultados.error = 'falhou'
    renderHook(() => mod.useExamesNovos())
    expect(dados.has('lh:vistos:u-1')).toBe(false)
  })

  it('cada conta tem o próprio registro', async () => {
    const dados = armazenamento()
    dados.set('lh:vistos:u-1', JSON.stringify(['a']))
    dados.set('lh:vistos:u-2', JSON.stringify([]))
    const mod = await modulo()
    resultados.exams = [exame('a')]
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-1' } }))
    const { result } = renderHook(() => mod.useExamesNovos())
    expect(result.current.size).toBe(0)
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'u-2' } }))
    expect([...result.current]).toEqual(['a'])
  })
})
