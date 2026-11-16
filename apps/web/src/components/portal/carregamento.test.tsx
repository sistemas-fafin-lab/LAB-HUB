import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FalhaAoCarregar } from './carregamento'

describe('FalhaAoCarregar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra título, mensagem da API e o botão de nova tentativa', () => {
    render(<FalhaAoCarregar titulo="Não foi possível carregar seus exames" erro="Falha na rede" onTentar={() => {}} />)
    expect(screen.getByText('Não foi possível carregar seus exames')).toBeTruthy()
    expect(screen.getByText('Falha na rede')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Tentar novamente/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('fica em "Tentando" enquanto tenta, por no mínimo 600 ms', async () => {
    vi.useFakeTimers()
    const onTentar = vi.fn(() => Promise.resolve())
    render(<FalhaAoCarregar titulo="Erro" erro="x" onTentar={onTentar} />)

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(onTentar).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: /Tentando/ }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(599)
    })
    expect((screen.getByRole('button', { name: /Tentando/ }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect((screen.getByRole('button', { name: /Tentar novamente/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('volta ao normal mesmo quando a nova tentativa falha', async () => {
    vi.useFakeTimers()
    render(<FalhaAoCarregar titulo="Erro" erro="x" onTentar={() => Promise.reject(new Error('de novo'))} />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect((screen.getByRole('button', { name: /Tentar novamente/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
