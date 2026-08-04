import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExamDetailPage } from './ExamDetailPage'
import type { Exam, ExamPanel } from '../components/shared/WebHero'

vi.mock('../lib/api', () => ({ api: { declaracao: vi.fn() } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const painel = (over: Partial<ExamPanel> = {}): ExamPanel => ({
  name: 'Glicose',
  value: '92',
  unit: 'mg/dL',
  ref: '70 a 99',
  ok: true,
  trend: [],
  ...over,
})

function exame(panels: ExamPanel[], over: Partial<Exam> = {}): Exam {
  return {
    id: 'e-1',
    name: 'Glicemia',
    category: 'Bioquímica',
    date: '24 Jul 2026',
    fullDate: '24 de julho de 2026',
    unit: '',
    doctor: '—',
    crm: '—',
    status: 'ready',
    summary: '',
    panels,
    ...over,
  } as Exam
}

const monta = (panels: ExamPanel[], over: Partial<Exam> = {}) =>
  render(
    <ExamDetailPage exam={exame(panels, over)} onBack={() => {}} dark={false} onViewLaudo={() => {}} />,
  )

// Ler valor superado como se fosse o atual é o dano que a marcação evita. Na
// lista um selo basta (o paciente está escolhendo); aqui ele está lendo, então
// o aviso precisa vir antes dos valores.
describe('laudo substituído', () => {
  it('avisa que existe versão mais recente', () => {
    monta([painel()], { retificado: true })

    expect(screen.getByText(/Este laudo foi substituído/)).toBeTruthy()
  })

  it('não avisa nada no laudo vigente', () => {
    monta([painel()])

    expect(screen.queryByText(/substituíd/)).toBeNull()
  })
})

describe('coluna Tendência', () => {
  it('não aparece quando nenhum marcador tem série histórica', () => {
    // O laudo dos LIS traz UM valor por marcador (toTrend devolve no máximo um
    // ponto) e o Sparkline precisa de dois — a coluna ficava sempre vazia,
    // com o cabeçalho sobre nada.
    monta([painel(), painel({ name: 'Ureia', trend: [30] })])

    expect(screen.queryByText('Tendência')).toBeNull()
  })

  it('aparece assim que algum marcador tem dois pontos ou mais', () => {
    monta([painel({ trend: [88, 92] })])

    expect(screen.getByText('Tendência')).toBeTruthy()
  })
})
