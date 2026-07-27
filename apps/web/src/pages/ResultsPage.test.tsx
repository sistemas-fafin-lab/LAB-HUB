import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Exam } from '../components/shared/WebHero'

const estado = { exams: [] as Exam[], loading: false, error: null as string | null }

vi.mock('../lib/useResultados', () => ({
  useResultados: () => estado,
  atualizaResultados: vi.fn(),
}))

const { ResultsPage } = await import('./ResultsPage')

function exame(over: Partial<Exam> = {}): Exam {
  return {
    id: 'e-1',
    name: 'Hemograma Completo',
    category: 'Hematologia',
    date: '24 Jul 2026',
    fullDate: '24 de julho de 2026',
    unit: '',
    doctor: 'Dra. Ana Lima',
    crm: 'CRM/DF 12345',
    status: 'ready',
    summary: '',
    panels: [],
    ...over,
  } as Exam
}

function monta(exams: Exam[]) {
  estado.exams = exams
  estado.loading = false
  estado.error = null
  return render(<ResultsPage dark={false} onOpenExam={() => {}} />)
}

describe('estado vazio', () => {
  it('diz que ainda não há resultados quando a conta não tem exame nenhum', () => {
    monta([])

    expect(screen.getByText(/Nenhum resultado disponível ainda/)).toBeTruthy()
  })

  it('diz que o FILTRO não casou quando existem exames escondidos por ele', () => {
    monta([exame()])

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'zzz' } })

    // A mensagem única antiga ("Nenhum exame encontrado") fazia o paciente com
    // filtro ativo concluir que não tinha exames.
    expect(screen.getByText(/Nenhum exame corresponde à busca/)).toBeTruthy()
  })
})

describe('promessa da tela', () => {
  it('não afirma que o histórico é completo', () => {
    const { container } = monta([exame()])

    // A busca nos LIS cobre uma janela de dias; prometer "histórico completo"
    // faz o paciente concluir que não fez exames num período em que fez.
    expect(container.textContent).not.toContain('Histórico completo')
    expect(container.textContent).toContain('Resultados mais antigos podem não aparecer')
  })
})
