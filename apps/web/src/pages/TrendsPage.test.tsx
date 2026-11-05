import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Exam, ExamPanel } from '../lib/exame'

// Tendências a partir dos resultados do paciente: só useResultados é dublê.

const resultados = vi.hoisted(() => ({
  exams: [] as Exam[],
  loading: false,
  error: null as string | null,
  atualiza: vi.fn(),
}))
vi.mock('../lib/useResultados', () => ({
  useResultados: () => resultados,
  atualizaResultados: resultados.atualiza,
}))

const { TrendsPage } = await import('./TrendsPage')

const painel = (name: string, value: string, ok = true, unit = 'mg/dL', ref = '70 – 99'): ExamPanel => ({
  name,
  value,
  unit,
  ref,
  ok,
  trend: [],
})

const exame = (id: string, coletadoEm: string, panels: ExamPanel[]): Exam => ({
  id,
  name: 'Bioquímica',
  category: '',
  date: '',
  fullDate: '',
  unit: '',
  doctor: '',
  crm: '',
  status: 'ready',
  summary: '',
  panels,
  coletadoEm,
})

function renderiza() {
  const onOpenExam = vi.fn()
  const onVerResultados = vi.fn()
  render(<TrendsPage onOpenExam={onOpenExam} onVerResultados={onVerResultados} />)
  return { onOpenExam, onVerResultados }
}

beforeEach(() => {
  vi.clearAllMocks()
  resultados.exams = []
  resultados.loading = false
  resultados.error = null
})

describe('com histórico', () => {
  beforeEach(() => {
    resultados.exams = [
      exame('jan', '2026-01-10', [painel('Glicose', '90'), painel('Colesterol LDL', '120', true, 'mg/dL', 'até 130')]),
      exame('jul', '2026-07-10', [painel('Glicose', '92'), painel('Colesterol LDL', '138', false, 'mg/dL', 'até 130')]),
    ]
  })

  it('mostra o resumo e um cartão por marcador, o fora da referência primeiro', () => {
    renderiza()
    expect(screen.getByRole('heading', { level: 1, name: 'Como você está evoluindo' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Em resumo' }).textContent).toContain(
      'De 2 marcadores acompanhados, 1 está dentro da referência e 1 está fora (Colesterol LDL).',
    )
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Em resumo', 'Colesterol LDL', 'Glicose'])
  })

  it('o cartão traz o último valor, a variação e a nota da referência', () => {
    renderiza()
    const ldl = within(screen.getByRole('region', { name: 'Colesterol LDL' }))
    expect(ldl.getByText('138')).toBeTruthy()
    expect(ldl.getByText('mg/dL')).toBeTruthy()
    expect(ldl.getByText('+18 desde a coleta anterior')).toBeTruthy()
    expect(ldl.getByText('Fora da referência (até 130). Converse com seu médico sobre este resultado.')).toBeTruthy()
  })

  it('"Ver exame" abre o exame da última coleta', () => {
    const { onOpenExam } = renderiza()
    fireEvent.click(within(screen.getByRole('region', { name: 'Glicose' })).getByRole('button', { name: 'Ver exame' }))
    expect(onOpenExam).toHaveBeenCalledWith(expect.objectContaining({ id: 'jul' }))
  })
})

describe('sem histórico suficiente', () => {
  it('uma coleta só mostra o estado vazio, que leva aos resultados', () => {
    resultados.exams = [exame('jan', '2026-01-10', [painel('Glicose', '90')])]
    const { onVerResultados } = renderiza()
    expect(screen.getByText('Ainda não há histórico suficiente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver resultados' }))
    expect(onVerResultados).toHaveBeenCalled()
  })
})

describe('carregamento e erro', () => {
  it('enquanto carrega, mostra o esqueleto', () => {
    resultados.loading = true
    renderiza()
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeTruthy()
    expect(screen.queryByText('Ainda não há histórico suficiente')).toBeNull()
  })

  it('erro sem resultados mostra a mensagem e tenta de novo', () => {
    resultados.error = 'Falha de rede'
    renderiza()
    expect(screen.getByText('Falha de rede')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(resultados.atualiza).toHaveBeenCalled()
  })
})
