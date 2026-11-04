import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// O App montado numa URL com EM_MANUTENCAO ligada. Arquivo à parte do
// App.test porque a flag é constante de módulo: aqui ela é dublada ligada.
// ---------------------------------------------------------------------------

vi.mock('./lib/flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/flags')>()),
  EM_MANUTENCAO: true,
}))

vi.mock('./lib/AuthContext', () => ({
  useAuth: () => ({ session: null, loading: false, signOut: async () => {} }),
}))

const { App } = await import('./App')

describe('em manutenção', () => {
  it.each(['/', '/resultados', '/entrar'])('%s mostra a tela de manutenção, com "Tentar novamente"', (url) => {
    window.history.replaceState(null, '', url)
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Estamos em manutenção' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
    // Nada do portal por trás: nem a entrada nem o redirecionamento para ela.
    expect(screen.queryByRole('heading', { name: 'Bem-vindo de volta' })).toBeNull()
    expect(window.location.pathname).toBe(url)
  })
})
