import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'

const enviar = vi.fn()
const verificar = vi.fn()
vi.mock('../../lib/doisFatores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/doisFatores')>()),
  doisFatores: { enviar: (...a: unknown[]) => enviar(...a), verificar: (...a: unknown[]) => verificar(...a) },
}))
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

const { CodigoVerificacao } = await import('./pecas')
const { TelaCodigo } = await import('./TelaCodigo')
const { ApiError } = await import('../../lib/api')

function Campo({ inicial = '' }: { inicial?: string }) {
  const [v, setV] = useState(inicial)
  return (
    <>
      <CodigoVerificacao valor={v} onChange={setV} />
      <output data-testid="valor">{v}</output>
    </>
  )
}

const digito = (n: number) => screen.getByLabelText(`Dígito ${n}`) as HTMLInputElement
const valor = () => screen.getByTestId('valor').textContent

afterEach(() => vi.clearAllMocks())

describe('CodigoVerificacao', () => {
  it('seis campos numéricos; o primeiro com one-time-code e com o foco', () => {
    render(<Campo />)
    expect(screen.getAllByLabelText(/^Dígito \d$/)).toHaveLength(6)
    expect(digito(1).getAttribute('autocomplete')).toBe('one-time-code')
    expect(digito(1).getAttribute('inputmode')).toBe('numeric')
    expect(document.activeElement).toBe(digito(1))
  })

  it('digitar avança; colar distribui os 6 dígitos', () => {
    render(<Campo />)
    fireEvent.change(digito(1), { target: { value: '4' } })
    expect(valor()).toBe('4')
    expect(document.activeElement).toBe(digito(2))
    fireEvent.paste(digito(1), { clipboardData: { getData: () => '12 34 56' } })
    expect(valor()).toBe('123456')
  })

  it('Backspace num campo vazio apaga o anterior e volta para ele; setas andam', () => {
    render(<Campo inicial="12" />)
    digito(3).focus()
    fireEvent.keyDown(digito(3), { key: 'Backspace' })
    expect(valor()).toBe('1')
    expect(document.activeElement).toBe(digito(2))
    fireEvent.keyDown(digito(2), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(digito(1))
    fireEvent.keyDown(digito(1), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(digito(2))
  })
})

describe('TelaCodigo', () => {
  const monta = (onVerificado = vi.fn()) => {
    render(<TelaCodigo email="maria@example.com" enviadoEm={null} onVerificado={onVerificado} onVoltar={vi.fn()} />)
    return onVerificado
  }

  it('envia o código ao abrir e mostra o e-mail mascarado e a contagem', async () => {
    enviar.mockResolvedValue({ enviadoEm: new Date().toISOString() })
    monta()
    expect(enviar).toHaveBeenCalledWith('login')
    expect(screen.getByText('m•••@example.com')).toBeTruthy()
    expect(await screen.findByText(/Reenviar código em 0:\d\d/)).toBeTruthy()
  })

  it('sem os 6 dígitos, pede o código inteiro e nem chama a API', async () => {
    enviar.mockResolvedValue({ enviadoEm: new Date().toISOString() })
    monta()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verificar e entrar' })))
    expect(screen.getByText('Digite os 6 dígitos do código.')).toBeTruthy()
    expect(verificar).not.toHaveBeenCalled()
  })

  it('código errado: a mensagem da API e os campos limpos', async () => {
    enviar.mockResolvedValue({ enviadoEm: new Date().toISOString() })
    verificar.mockRejectedValue(
      new ApiError(400, 'Código inválido ou expirado. Confira a mensagem ou peça um novo código.', 'CODIGO_INVALIDO'),
    )
    monta()
    fireEvent.paste(digito(1), { clipboardData: { getData: () => '000000' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verificar e entrar' })))
    await waitFor(() => expect(screen.getByText(/Código inválido ou expirado/)).toBeTruthy())
    expect(digito(1).value).toBe('')
  })

  it('código certo: segue para o portal', async () => {
    enviar.mockResolvedValue({ enviadoEm: new Date().toISOString() })
    verificar.mockResolvedValue({ verificada: true })
    const onVerificado = monta()
    fireEvent.paste(digito(1), { clipboardData: { getData: () => '123456' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verificar e entrar' })))
    expect(verificar).toHaveBeenCalledWith('123456')
    expect(onVerificado).toHaveBeenCalledOnce()
  })

  it('reenvio recente (recarga): não envia de novo, só mostra a contagem', () => {
    render(<TelaCodigo email="maria@example.com" enviadoEm={new Date().toISOString()} onVerificado={vi.fn()} onVoltar={vi.fn()} />)
    expect(enviar).not.toHaveBeenCalled()
    expect(screen.getByText(/Reenviar código em 0:\d\d/)).toBeTruthy()
  })
})
