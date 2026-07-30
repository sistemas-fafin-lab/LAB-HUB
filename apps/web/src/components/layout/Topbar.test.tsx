import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Topbar } from './Topbar'

// A busca chama a API por resultados; aqui só interessa o bloco do paciente.
vi.mock('../../lib/useResultados', () => ({ useResultados: () => ({ exams: [], loading: false }) }))
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

function monta(onNav = vi.fn()) {
  const r = render(
    <Topbar
      nome="Maria Souza"
      iniciais="MS"
      dark={false}
      onToggleDark={() => {}}
      onOpenExam={() => {}}
      onNav={onNav}
    />,
  )
  return { ...r, onNav }
}

describe('bloco do paciente na topbar', () => {
  it('leva ao Perfil — o mesmo destino do item no menu lateral', () => {
    // O avatar no canto superior direito é onde se espera clicar para ver a
    // própria conta; antes era só um <div> decorativo e o clique não fazia nada.
    const { getByLabelText, onNav } = monta()

    getByLabelText('Abrir perfil').click()

    expect(onNav).toHaveBeenCalledWith('profile')
  })
})
