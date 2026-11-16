import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { aoAvisar } from '../../lib/avisos'
import type { Aviso } from '../../lib/avisos'

const conferirSenha = vi.fn()
const updateUser = vi.fn()
vi.mock('../../lib/supabase', () => ({
  conferirSenha: (...a: unknown[]) => conferirSenha(...a),
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { email: 'maria@example.com' } } }),
      updateUser: (...a: unknown[]) => updateUser(...a),
    },
  },
}))
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

const { CaixaAlterarSenha, errosDaTrocaDeSenha } = await import('./AlterarSenha')

const NOVA = 'NovaSenha#2026'

function preenche(atual: string, nova: string, confirmacao: string) {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: atual } })
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } })
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmacao } })
}

afterEach(() => vi.clearAllMocks())

describe('validação', () => {
  it('atual vazia, nova igual à atual e confirmação diferente', () => {
    expect(errosDaTrocaDeSenha('', NOVA, NOVA).atual).toBe('Informe a senha atual.')
    expect(errosDaTrocaDeSenha(NOVA, NOVA, NOVA).nova).toBe('A nova senha precisa ser diferente da atual.')
    expect(errosDaTrocaDeSenha('antiga', NOVA, 'outra').confirmacao).toBe('As senhas não conferem.')
    expect(errosDaTrocaDeSenha('antiga', 'curta', 'curta').nova).toBeTruthy()
  })
})

describe('alterar senha', () => {
  it('confere a atual, grava a nova, fecha e avisa', async () => {
    conferirSenha.mockResolvedValue(true)
    updateUser.mockResolvedValue({ error: null })
    const recebidos: Aviso[] = []
    const cancela = aoAvisar((a) => recebidos.push(a))
    const onFechar = vi.fn()
    render(<CaixaAlterarSenha aberta onFechar={onFechar} />)
    preenche('antiga', NOVA, NOVA)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' })))
    expect(conferirSenha).toHaveBeenCalledWith('maria@example.com', 'antiga')
    expect(updateUser).toHaveBeenCalledWith({ password: NOVA })
    expect(onFechar).toHaveBeenCalled()
    expect(recebidos[0]).toMatchObject({ title: 'Senha alterada', message: 'Use a nova senha no próximo acesso.' })
    cancela()
  })

  it('senha atual errada: não grava e diz no campo', async () => {
    conferirSenha.mockResolvedValue(false)
    render(<CaixaAlterarSenha aberta onFechar={() => {}} />)
    preenche('errada', NOVA, NOVA)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' })))
    await waitFor(() => expect(screen.getByText('Senha atual incorreta.')).toBeTruthy())
    expect(updateUser).not.toHaveBeenCalled()
  })
})
