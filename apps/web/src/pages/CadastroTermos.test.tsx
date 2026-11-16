import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// Cadastro com o aceite dos termos ligado (flag + documentos publicados). O
// caminho com a flag desligada, que é o de hoje, está em AuthGate.test.tsx.

const supa = vi.hoisted(() => ({ signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: supa }, salvarManterConectado: vi.fn() }))
const apiPost = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ api: { post: apiPost } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../lib/flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/flags')>()),
  MOSTRAR_ACEITE_TERMOS: true,
}))
vi.mock('../lib/termos', () => ({
  TERMOS_URL: 'https://exemplo.test/termos',
  PRIVACIDADE_URL: 'https://exemplo.test/privacidade',
  TERMOS_VERSAO: '2026-11',
  termosPublicados: () => true,
}))

const { AuthGate } = await import('./AuthGate')

const campo = (rotulo: string) => screen.getByLabelText(rotulo, { selector: 'input, select' }) as HTMLInputElement
const digita = (rotulo: string, valor: string) => fireEvent.change(campo(rotulo), { target: { value: valor } })

async function chegaNaSenha() {
  window.history.replaceState(null, '', '/entrar?modo=cadastro')
  render(<AuthGate comSessao={false} />)
  digita('Nome completo', 'Maria Souza')
  digita('CPF', '52998224725')
  digita('Nascimento', '14031990')
  digita('E-mail', 'maria@example.com')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' })))
  digita('Senha', 'SenhaForte123')
  digita('Confirmar senha', 'SenhaForte123')
}

const criaConta = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Criar conta' })))

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({ requiresEmailConfirmation: true, paciente: {} })
})

describe('aceite dos termos no cadastro', () => {
  it('sem aceitar, não cria a conta e pede o aceite', async () => {
    await chegaNaSenha()
    await criaConta()
    expect(apiPost).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Aceite os termos para continuar.')
  })

  it('os links abrem os documentos em outra aba, sem marcar a caixa', async () => {
    await chegaNaSenha()
    const termos = screen.getByRole('link', { name: 'Termos de uso' })
    expect(termos.getAttribute('href')).toBe('https://exemplo.test/termos')
    expect(termos.getAttribute('target')).toBe('_blank')
    fireEvent.click(termos)
    const caixa = screen.getByRole('checkbox', { name: /Li e aceito os Termos de uso/ })
    expect(caixa.getAttribute('aria-checked')).toBe('false')
  })

  it('aceito, manda a versão e o opt-in (marcado por padrão) para a API', async () => {
    await chegaNaSenha()
    fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito os Termos de uso/ }))
    await criaConta()
    expect(apiPost).toHaveBeenCalledWith('/cadastro', expect.objectContaining({ aceite: { termosVersao: '2026-11', avisos: true } }))
  })

  it('opt-in desmarcado vai como false', async () => {
    await chegaNaSenha()
    fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito os Termos de uso/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Quero receber avisos de resultado por e-mail e SMS.' }))
    await criaConta()
    expect(apiPost).toHaveBeenCalledWith('/cadastro', expect.objectContaining({ aceite: { termosVersao: '2026-11', avisos: false } }))
  })
})
