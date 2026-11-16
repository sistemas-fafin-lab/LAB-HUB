import { afterEach, describe, expect, it, vi } from 'vitest'
import { armazenamentoDaSessao, salvarManterConectado } from './supabase'

function memoria() {
  const dados = new Map<string, string>()
  return {
    dados,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('onde a sessão fica', () => {
  it('marcado (padrão): localStorage; desmarcado: sessionStorage; sair limpa os dois', () => {
    const local = memoria()
    const sessao = memoria()
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', sessao)

    armazenamentoDaSessao.setItem('sb-token', 'a')
    expect(local.dados.get('sb-token')).toBe('a')

    salvarManterConectado(false)
    armazenamentoDaSessao.setItem('sb-token', 'b')
    expect(sessao.dados.get('sb-token')).toBe('b')
    expect(armazenamentoDaSessao.getItem('sb-token')).toBe('b')

    armazenamentoDaSessao.removeItem('sb-token')
    expect(local.dados.has('sb-token')).toBe(false)
    expect(sessao.dados.has('sb-token')).toBe(false)
  })
})
