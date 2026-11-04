import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExamDetailPage } from './ExamDetailPage'
import type { Exam, ExamPanel } from '../lib/exame'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { aoAvisar } from '../lib/avisos'

vi.mock('../lib/api', () => ({ api: { declaracao: vi.fn() } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

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
    <ExamDetailPage exam={exame(panels, over)} onBack={() => {}} onViewLaudo={() => {}} />,
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

// Aberto pela consulta admin (ResultsPage): os valores continuam visíveis,
// mas "Ver laudo"/declaração montam o documento a partir da sessão LOGADA
// (usePaciente() em LaudoPage) — em consulta admin isso imprimiria o exame de
// outro paciente com a identidade de quem está logado. Ver o campo em
// lib/exame.ts.
describe('consulta administrativa por CPF', () => {
  it('mostra os valores e o aviso de somente leitura', () => {
    monta([painel()], { somenteLeituraAdmin: true })

    expect(screen.getByText('Glicose')).toBeTruthy()
    expect(screen.getByText(/somente leitura/)).toBeTruthy()
  })

  it('esconde "Ver laudo" e "Baixar PDF"', () => {
    monta([painel()], { somenteLeituraAdmin: true, declaracaoUrl: '/algum/path.pdf' })

    expect(screen.queryByText('Ver laudo')).toBeNull()
    expect(screen.queryByText('Baixar PDF')).toBeNull()
  })

  it('fora da consulta admin os dois continuam disponíveis', () => {
    monta([painel()], { declaracaoUrl: '/algum/path.pdf' })

    expect(screen.getByText('Ver laudo')).toBeTruthy()
    expect(screen.getByText('Baixar PDF')).toBeTruthy()
  })
})

describe('coluna Tendência', () => {
  it('não aparece quando nenhum marcador tem série histórica', () => {
    // O laudo dos LIS traz UM valor por marcador (toTrend devolve no máximo um
    // ponto) e o mini-gráfico precisa de dois — a coluna ficava sempre vazia,
    // com o cabeçalho sobre nada.
    monta([painel(), painel({ name: 'Ureia', trend: [30] })])

    expect(screen.queryByText('Tendência')).toBeNull()
  })

  it('aparece assim que algum marcador tem dois pontos ou mais', () => {
    monta([painel({ trend: [88, 92] })])

    expect(screen.getByText('Tendência')).toBeTruthy()
  })
})

describe('cabeçalho', () => {
  it('mostra o nome como título, a situação, o número do laboratório e a categoria', () => {
    monta([painel()], { numeroLaudo: 'REQ-77' })

    expect(screen.getByRole('heading', { level: 1, name: 'Glicemia' })).toBeTruthy()
    expect(screen.getByText('Liberado')).toBeTruthy()
    expect(screen.getByText('#REQ-77 · Bioquímica')).toBeTruthy()
  })

  it('não imprime travessão quando a fonte não tem médico nem unidade', () => {
    const { container } = monta([painel()], { doctor: '—', crm: '—', unit: '—' })

    expect(screen.getByText('24 de julho de 2026')).toBeTruthy()
    expect(container.textContent).not.toContain('—')
  })

  it('junta data, laboratório e médico com CRM', () => {
    monta([painel()], { laboratorio: 'CLAF', unit: 'Unidade Centro', doctor: 'Dra. Ana Lima', crm: 'CRM/DF 12345' })

    expect(screen.getByText('24 de julho de 2026 · CLAF · Dra. Ana Lima (CRM/DF 12345)')).toBeTruthy()
  })

  it('mostra o resumo quando existe', () => {
    monta([painel()], { summary: 'Valores dentro do esperado.' })

    expect(screen.getByText('Resumo')).toBeTruthy()
    expect(screen.getByText('Valores dentro do esperado.')).toBeTruthy()
  })

  it('o voltar leva aos resultados e "Ver laudo" ao laudo', () => {
    const onBack = vi.fn()
    const onViewLaudo = vi.fn()
    render(<ExamDetailPage exam={exame([painel()])} onBack={onBack} onViewLaudo={onViewLaudo} />)

    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver laudo' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onViewLaudo).toHaveBeenCalledTimes(1)
  })
})

describe('Baixar PDF', () => {
  it('não aparece sem declaração', () => {
    monta([painel()])

    expect(screen.queryByRole('button', { name: 'Baixar PDF' })).toBeNull()
  })

  it('abre a URL assinada e registra o evento, só com a origem do clique', async () => {
    vi.mocked(api.declaracao).mockResolvedValue({ url: 'https://assinada/pdf' } as never)
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    monta([painel()], { declaracaoUrl: '/algum/path.pdf' })

    fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' }))

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://assinada/pdf', '_blank', 'noopener'))
    expect(api.declaracao).toHaveBeenCalledWith('e-1')
    expect(track).toHaveBeenCalledWith('laudo_download', { origem: 'exame' })
  })

  it('avisa quando a declaração não pode ser baixada', async () => {
    vi.mocked(api.declaracao).mockRejectedValue(new Error('falhou'))
    const ouvinte = vi.fn()
    const cancelar = aoAvisar(ouvinte)
    monta([painel()], { declaracaoUrl: '/algum/path.pdf' })

    fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' }))

    await waitFor(() => expect(ouvinte).toHaveBeenCalledWith(expect.objectContaining({ tone: 'alert' })))
    cancelar()
  })
})

describe('marcadores', () => {
  it('mostra valor, unidade, referência e a situação em texto', () => {
    monta([painel(), painel({ name: 'Ureia', value: '80', unit: 'mg/dL', ref: '15 a 40', ok: false })])

    expect(screen.getByText('2 marcadores')).toBeTruthy()
    expect(screen.getByText('92')).toBeTruthy()
    expect(screen.getByText('70 a 99')).toBeTruthy()
    expect(screen.getByText('Dentro da referência')).toBeTruthy()
    expect(screen.getByText('80')).toBeTruthy()
    expect(screen.getByText('15 a 40')).toBeTruthy()
    expect(screen.getByText('Fora da referência')).toBeTruthy()
  })

  it('separa os marcadores por grupo, mesmo com nomes repetidos', () => {
    monta([], {
      groups: [
        { name: 'Série Branca', panels: [painel({ name: 'Leucócitos' })] },
        { name: 'Série Vermelha', panels: [painel({ name: 'Hemácias' })] },
      ],
      panels: [painel({ name: 'Leucócitos' }), painel({ name: 'Hemácias' })],
    })

    expect(screen.getByText('Série Branca')).toBeTruthy()
    expect(screen.getByText('Série Vermelha')).toBeTruthy()
    expect(screen.getByText('Hemácias')).toBeTruthy()
  })

  it('exame em análise que já tem valores continua mostrando os valores', () => {
    monta([painel()], { status: 'analyzing' })

    expect(screen.getByText('Em análise')).toBeTruthy()
    expect(screen.getByText('92')).toBeTruthy()
    expect(screen.queryByText('Resultado em andamento')).toBeNull()
  })

  it('exame em análise sem valores diz que está em andamento', () => {
    monta([], { status: 'analyzing' })

    expect(screen.getByText('Resultado em andamento')).toBeTruthy()
    expect(screen.queryByText('Marcadores')).toBeNull()
  })
})

describe('referência', () => {
  const TABELA = 'Até 12 anos: 10 a 20\nAdultos: 15 a 40'

  it('com várias linhas mostra o resumo numa linha e abre a tabela ao clicar', () => {
    monta([painel({ ref: TABELA })])
    const resumo = screen.getByRole('button', { name: 'Até 12 anos: 10 a 20 · Adultos: 15 a 40' })
    expect(resumo.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(resumo)

    expect(resumo.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/Até 12 anos: 10 a 20\s+Adultos: 15 a 40/)).toBeTruthy()
  })

  it('a tabela abre com o mouse em cima', () => {
    monta([painel({ ref: TABELA })])
    const resumo = screen.getByRole('button', { name: /Até 12 anos/ })

    fireEvent.mouseEnter(resumo)
    expect(resumo.getAttribute('aria-expanded')).toBe('true')

    fireEvent.mouseLeave(resumo)
    expect(resumo.getAttribute('aria-expanded')).toBe('false')
  })

  it('depois do clique, a tabela não some ao tirar o mouse', () => {
    monta([painel({ ref: TABELA })])
    const resumo = screen.getByRole('button', { name: /Até 12 anos/ })

    fireEvent.mouseEnter(resumo)
    fireEvent.click(resumo)
    fireEvent.mouseLeave(resumo)

    expect(resumo.getAttribute('aria-expanded')).toBe('true')
  })

  it('Esc e clique fora fecham a tabela', () => {
    monta([painel({ ref: TABELA })])
    const resumo = screen.getByRole('button', { name: /Até 12 anos/ })

    fireEvent.click(resumo)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(resumo.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(resumo)
    fireEvent.mouseDown(document.body)
    expect(resumo.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('etapas', () => {
  const NOMES = ['Agendamento', 'Check-in', 'Coleta', 'Análise', 'Liberação']

  it('exame liberado tem as cinco etapas concluídas, com rótulo em texto', () => {
    monta([painel()])

    for (const nome of NOMES) expect(screen.getByText(nome)).toBeTruthy()
    expect(screen.getByText('5 de 5')).toBeTruthy()
    expect(screen.queryByText('Etapa atual')).toBeNull()
  })

  it('exame em análise está na etapa de Análise', () => {
    monta([], { status: 'analyzing' })

    expect(screen.getByText('4 de 5')).toBeTruthy()
    expect(screen.getByText('Etapa atual')).toBeTruthy()
  })
})

describe('ficha da coleta', () => {
  it('mostra só o que a fonte informou', () => {
    monta([painel()], { dataColeta: '24 de julho de 2026', unit: 'Unidade Centro', material: 'Soro', metodo: 'Hexoquinase' })

    expect(screen.getByText('Soro')).toBeTruthy()
    expect(screen.getByText('Hexoquinase')).toBeTruthy()
    expect(screen.getByText('Unidade Centro')).toBeTruthy()
    expect(screen.getByText('Data da coleta')).toBeTruthy()
  })

  it('some quando a fonte não informou nada', () => {
    // O resultado do FlowLab não tem coleta: mostrar a liberação como "Data da
    // coleta" seria afirmar a data errada (ver dataColeta em Exam).
    monta([painel()], { unit: '—' })

    expect(screen.queryByText('Data da coleta')).toBeNull()
    expect(screen.queryByText('Material')).toBeNull()
  })
})

describe('laudo descritivo', () => {
  it('formato legado: painel único "Laudo" vira texto corrido, com a conclusão', () => {
    monta([painel({ name: 'Laudo', value: 'MACROSCOPIA:\nFragmento pardo.\nCONCLUSÃO\nNEGATIVO PARA LESÃO' })])

    expect(screen.getByText('MACROSCOPIA')).toBeTruthy()
    expect(screen.getByText('Fragmento pardo.')).toBeTruthy()
    expect(screen.getByText('CONCLUSÃO')).toBeTruthy()
    expect(screen.queryByText('Marcadores')).toBeNull()
  })

  it('formato em seções: um bloco por seção, sem tabela de marcadores', () => {
    const secao = (name: string, value: string) => ({ name, panels: [painel({ name: '', value })] })
    monta([], { groups: [secao('Macroscopia', 'Fragmento pardo.'), secao('Conclusão', 'Sem atipias.')] })

    expect(screen.getByText('Macroscopia')).toBeTruthy()
    expect(screen.getByText('Fragmento pardo.')).toBeTruthy()
    expect(screen.getByText('Sem atipias.')).toBeTruthy()
    expect(screen.queryByText('Marcadores')).toBeNull()
  })
})
