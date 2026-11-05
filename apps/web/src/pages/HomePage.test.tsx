import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Agendamento } from '@lab-hub/shared'
import type { Exam } from '../lib/exame'
import { HomePage } from './HomePage'
import { aoAvisar } from '../lib/avisos'

// A Visão geral renderizada: só os hooks de dados, o cliente `api` e as flags
// são dublês. As flags são constantes em lib/flags; aqui viram getters para o
// mesmo teste poder ligar e desligar cada bloco.
const flags = vi.hoisted(() => ({
  hero: false,
  acompanhamento: false,
  extras: false,
  recentes: false,
}))
vi.mock('../lib/flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/flags')>()),
  get MOSTRAR_RESULTADO_HERO() {
    return flags.hero
  },
  get MOSTRAR_ACOMPANHAMENTO() {
    return flags.acompanhamento
  },
  get MOSTRAR_PROXIMOS_PASSOS_EXTRAS() {
    return flags.extras
  },
  get MOSTRAR_EXAMES_RECENTES() {
    return flags.recentes
  },
}))

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

const coletas = vi.hoisted(() => ({
  agendamentos: [] as Agendamento[],
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
  setStatus: vi.fn(),
}))
vi.mock('../lib/useAgendamentos', () => ({ useAgendamentos: () => coletas }))

const declaracao = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ api: { declaracao } }))

const acoes = {
  onOpenExam: vi.fn(),
  onOpenColeta: vi.fn(),
  onAgendar: vi.fn(),
  onVerColetas: vi.fn(),
  onVerResultados: vi.fn(),
}

function exame(over: Partial<Exam> = {}): Exam {
  return {
    id: 'e-1',
    name: 'Hemograma Completo',
    category: 'Hematologia',
    date: '28 Jul 2026',
    fullDate: '28 de julho de 2026',
    unit: 'Unidade Asa Sul',
    doctor: 'Dra. Ana Lima',
    crm: 'CRM/DF 12345',
    status: 'ready',
    summary: '',
    panels: [],
    ...over,
  }
}

const AMANHA = new Date(Date.now() + 86_400_000).toISOString()
const ONTEM = new Date(Date.now() - 86_400_000).toISOString()

function coleta(over: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'a-1',
    pacienteId: 'p-1',
    postoFlowlabId: 'posto-1',
    postoNome: 'Unidade Asa Norte',
    dataHora: AMANHA,
    status: 'confirmado',
    criadoEm: ONTEM,
    ...over,
  }
}

const abrir = (nome = 'Marina Souza Lima') => render(<HomePage nome={nome} {...acoes} />)
const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome })

beforeEach(() => {
  Object.assign(flags, { hero: false, acompanhamento: false, extras: false, recentes: false })
  Object.assign(resultados, { exams: [exame()], loading: false, error: null })
  Object.assign(coletas, { agendamentos: [], loading: false, error: null })
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('saudação', () => {
  it.each([
    ['08:00', 'Bom dia, Marina'],
    ['14:00', 'Boa tarde, Marina'],
    ['20:00', 'Boa noite, Marina'],
  ])('às %s cumprimenta com a hora e o primeiro nome', (hora, saudacao) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`2026-11-04T${hora}:00`))
    abrir()
    expect(screen.getByText(saudacao)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Que bom te ver de volta' })).toBeTruthy()
  })

  it('sem o nome ainda carregado, cumprimenta só com a hora', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T08:00:00'))
    abrir('')
    expect(screen.getByText('Bom dia')).toBeTruthy()
  })
})

describe('próximos passos', () => {
  const passos = () => within(screen.getByRole('region', { name: 'Próximos passos' }))

  it('sem coleta futura, convida a agendar', () => {
    abrir()
    expect(passos().getByText('Agendar nova coleta')).toBeTruthy()
    fireEvent.click(passos().getByRole('button', { name: 'Agendar' }))
    expect(acoes.onAgendar).toHaveBeenCalledOnce()
  })

  it('com coleta futura, mostra a mais próxima, com dia e unidade, e abre o detalhe dela', () => {
    coletas.agendamentos = [
      coleta({ id: 'depois', dataHora: new Date(Date.now() + 5 * 86_400_000).toISOString(), postoNome: 'Unidade Depois' }),
      coleta({ id: 'antes', postoNome: 'Unidade Antes' }),
      coleta({ id: 'passada', dataHora: ONTEM, postoNome: 'Unidade Passada' }),
      coleta({ id: 'cancelada', status: 'cancelado', postoNome: 'Unidade Cancelada' }),
    ]
    abrir()
    expect(passos().getByText('Preparo para a próxima coleta')).toBeTruthy()
    expect(passos().getByText(/Unidade Antes/)).toBeTruthy()
    expect(passos().queryByText('Agendar nova coleta')).toBeNull()
    fireEvent.click(passos().getByRole('button', { name: 'Ver' }))
    expect(acoes.onOpenColeta).toHaveBeenCalledWith('antes')
  })

  it('não diz para agendar enquanto as coletas carregam', () => {
    coletas.loading = true
    abrir()
    expect(passos().queryByText('Agendar nova coleta')).toBeNull()
    expect(passos().getByRole('status', { name: 'Carregando' })).toBeTruthy()
  })
})

describe('em andamento', () => {
  const bloco = () => within(screen.getByRole('region', { name: 'Em andamento' }))

  it('sem coleta ativa, leva a agendar', () => {
    coletas.agendamentos = [coleta({ status: 'cancelado' }), coleta({ id: 'r', status: 'realizado', dataHora: ONTEM })]
    abrir()
    expect(bloco().getByText('Nenhuma coleta em andamento')).toBeTruthy()
    fireEvent.click(bloco().getByRole('button', { name: 'Agendar coleta' }))
    expect(acoes.onAgendar).toHaveBeenCalledOnce()
  })

  it('lista a coleta com a situação em texto e a etapa, e abre o detalhe dela', () => {
    coletas.agendamentos = [coleta({ id: 'c-1', status: 'em_coleta', dataHora: ONTEM, postoNome: 'Unidade Asa Norte' })]
    abrir()
    expect(bloco().getByText(/Check-in feito/)).toBeTruthy()
    expect(bloco().getByText('3 de 5')).toBeTruthy()
    fireEvent.click(bloco().getByRole('button', { name: /Unidade Asa Norte/ }))
    expect(acoes.onOpenColeta).toHaveBeenCalledWith('c-1')
  })

  it.each([
    ['pendente', 'Pendente', '1 de 5'],
    ['confirmado', 'Confirmado', '1 de 5'],
    ['bloqueado', 'Pendência', '2 de 5'],
  ] as const)('coleta %s aparece como "%s", na etapa %s', (status, rotulo, etapa) => {
    coletas.agendamentos = [coleta({ status })]
    abrir()
    expect(bloco().getByText(new RegExp(rotulo))).toBeTruthy()
    expect(bloco().getByText(etapa)).toBeTruthy()
  })

  it('não conta como em andamento a coleta realizada, a cancelada nem a que passou da hora sem check-in', () => {
    coletas.agendamentos = [
      coleta({ id: '1', status: 'realizado', postoNome: 'Unidade Realizada' }),
      coleta({ id: '2', status: 'cancelado', postoNome: 'Unidade Cancelada' }),
      coleta({ id: '3', status: 'confirmado', dataHora: ONTEM, postoNome: 'Unidade Passada' }),
    ]
    abrir()
    expect(bloco().getByText('Nenhuma coleta em andamento')).toBeTruthy()
  })

  it('mostra no máximo 3 coletas, a que tem pendência primeiro', () => {
    coletas.agendamentos = [
      coleta({ id: '1', postoNome: 'Unidade 1' }),
      coleta({ id: '2', postoNome: 'Unidade 2' }),
      coleta({ id: '3', postoNome: 'Unidade 3' }),
      coleta({ id: '4', postoNome: 'Unidade Pendência', status: 'bloqueado', dataHora: ONTEM }),
    ]
    abrir()
    const abrirColeta = bloco().getAllByRole('button', { name: /Unidade/ })
    expect(abrirColeta).toHaveLength(3)
    expect(abrirColeta[0]?.textContent).toMatch(/Unidade Pendência/)
  })

  it('"Minhas coletas" leva à lista', () => {
    abrir()
    fireEvent.click(bloco().getByRole('button', { name: 'Minhas coletas' }))
    expect(acoes.onVerColetas).toHaveBeenCalledOnce()
  })

  it('carregando mostra o esqueleto, sem afirmar que não há coletas', () => {
    coletas.loading = true
    abrir()
    expect(bloco().getByRole('status', { name: 'Carregando' })).toBeTruthy()
    expect(bloco().queryByText('Nenhuma coleta em andamento')).toBeNull()
  })

  it('com erro, mostra a mensagem da API e deixa tentar de novo, sem afirmar que não há coletas', () => {
    coletas.error = 'Serviço indisponível'
    abrir()
    expect(bloco().getByText('Serviço indisponível')).toBeTruthy()
    expect(bloco().queryByText('Nenhuma coleta em andamento')).toBeNull()
    fireEvent.click(bloco().getByRole('button', { name: 'Tentar novamente' }))
    expect(coletas.reload).toHaveBeenCalledOnce()
  })
})

describe('primeira coleta (estado vazio)', () => {
  const convite = () => screen.queryByRole('region', { name: /primeira coleta/ })

  beforeEach(() => {
    resultados.exams = []
  })

  it.each([false, true])('sem exames nem coletas, leva a agendar (flag do destaque: %s)', (hero) => {
    flags.hero = hero
    abrir()
    expect(convite()).toBeTruthy()
    fireEvent.click(within(convite() as HTMLElement).getByRole('button', { name: 'Agendar coleta' }))
    expect(acoes.onAgendar).toHaveBeenCalledOnce()
  })

  it('só com coleta cancelada, ainda convida', () => {
    coletas.agendamentos = [coleta({ status: 'cancelado' })]
    abrir()
    expect(convite()).toBeTruthy()
  })

  it.each(['confirmado', 'realizado'] as const)('com coleta %s, não é a primeira', (status) => {
    coletas.agendamentos = [coleta({ status })]
    abrir()
    expect(convite()).toBeNull()
  })

  it('quem faltou à coleta marcada e não tem exames ainda é convidado', () => {
    coletas.agendamentos = [coleta({ status: 'confirmado', dataHora: ONTEM })]
    abrir()
    expect(convite()).toBeTruthy()
  })

  it('com exames, não aparece', () => {
    resultados.exams = [exame()]
    abrir()
    expect(convite()).toBeNull()
  })

  it.each([
    ['os exames carregam', () => (resultados.loading = true)],
    ['as coletas carregam', () => (coletas.loading = true)],
    ['os exames falharam', () => (resultados.error = 'Falhou')],
    ['as coletas falharam', () => (coletas.error = 'Falhou')],
  ])('não afirma nada enquanto %s', (_caso, prepara) => {
    prepara()
    abrir()
    expect(convite()).toBeNull()
  })
})

describe('destaque do último exame (MOSTRAR_RESULTADO_HERO)', () => {
  const titulo = () => screen.queryByRole('heading', { level: 2, name: /Seu último exame/ })

  it('flag desligada: não aparece, mesmo com exame liberado', () => {
    abrir()
    expect(titulo()).toBeNull()
  })

  describe('flag ligada', () => {
    beforeEach(() => {
      flags.hero = true
    })

    it('mostra o exame liberado mais recente, não o que ainda está em análise', () => {
      resultados.exams = [
        exame({ id: 'novo', name: 'Glicemia', status: 'analyzing' }),
        exame({ id: 'liberado', name: 'Hemograma', dataColeta: '24 de julho de 2026' }),
      ]
      abrir()
      expect(titulo()).toBeTruthy()
      expect(screen.getByText('Hemograma — coletado em 24 de julho de 2026, na Unidade Asa Sul.')).toBeTruthy()
      fireEvent.click(botao('Ver resultado'))
      expect(acoes.onOpenExam).toHaveBeenCalledWith(resultados.exams[1])
    })

    it('sem data de coleta, não afirma que foi coletado: cita a liberação', () => {
      resultados.exams = [exame({ name: 'Hemograma', dataEmissao: '28 de julho de 2026', unit: '—' })]
      abrir()
      expect(screen.getByText('Hemograma — liberado em 28 de julho de 2026.')).toBeTruthy()
    })

    it('conta marcadores e os fora da referência', () => {
      const painel = { name: 'X', value: '1', unit: '', ref: '', trend: [] }
      resultados.exams = [exame({ panels: [{ ...painel, ok: true }, { ...painel, ok: false }, { ...painel, ok: true }] })]
      abrir()
      const destaque = screen.getByRole('region', { name: /Seu último exame/ })
      expect(destaque.textContent).toMatch(/3\s*marcadores/)
      expect(destaque.textContent).toMatch(/1\s*fora da referência/)
    })

    it('baixa a declaração pela URL assinada, só quando ela existe', async () => {
      const abre = vi.spyOn(window, 'open').mockReturnValue(null)
      declaracao.mockResolvedValue({ url: 'https://assinada/x.pdf' })
      resultados.exams = [exame({ id: 'e-9', declaracaoUrl: 'path/x.pdf' })]
      abrir()
      fireEvent.click(botao('Baixar PDF'))
      expect(declaracao).toHaveBeenCalledWith('e-9')
      await vi.waitFor(() => expect(abre).toHaveBeenCalledWith('https://assinada/x.pdf', '_blank', 'noopener'))
      cleanup()

      resultados.exams = [exame()]
      abrir()
      expect(screen.queryByRole('button', { name: 'Baixar PDF' })).toBeNull()
    })

    it('avisa quando o PDF não pode ser baixado', async () => {
      const ouvinte = vi.fn()
      const cancela = aoAvisar(ouvinte)
      declaracao.mockRejectedValue(new Error('404'))
      resultados.exams = [exame({ declaracaoUrl: 'path/x.pdf' })]
      abrir()
      fireEvent.click(botao('Baixar PDF'))
      await vi.waitFor(() => expect(ouvinte).toHaveBeenCalledWith(expect.objectContaining({ tone: 'alert' })))
      cancela()
    })

    it('carregando mostra o esqueleto no lugar do destaque', () => {
      resultados.exams = []
      resultados.loading = true
      abrir()
      expect(screen.getByRole('status', { name: 'Carregando seus exames' })).toBeTruthy()
    })

    it('exame em análise e nenhum liberado: avisa que ainda não há resultado', () => {
      resultados.exams = [exame({ status: 'analyzing' })]
      abrir()
      expect(screen.getByText('Nenhum resultado ainda')).toBeTruthy()
      expect(titulo()).toBeNull()
    })

    it('com erro, mostra a mensagem da API e deixa tentar de novo', () => {
      resultados.exams = []
      resultados.error = 'Serviço indisponível'
      abrir()
      expect(screen.getByText('Serviço indisponível')).toBeTruthy()
      fireEvent.click(botao('Tentar novamente'))
      expect(resultados.atualiza).toHaveBeenCalledOnce()
    })
  })
})

describe('acompanhamento (MOSTRAR_ACOMPANHAMENTO)', () => {
  it('segue a flag', () => {
    abrir()
    expect(screen.queryByRole('region', { name: 'Acompanhamento' })).toBeNull()
    cleanup()

    flags.acompanhamento = true
    abrir()
    const bloco = within(screen.getByRole('region', { name: 'Acompanhamento' }))
    expect(bloco.getByText('Colesterol LDL')).toBeTruthy()
    expect(bloco.getByText('Ativo')).toBeTruthy()
  })
})

describe('passos extras (MOSTRAR_PROXIMOS_PASSOS_EXTRAS)', () => {
  it('segue a flag, sempre depois do passo da coleta', () => {
    abrir()
    expect(screen.queryByText('Compartilhar com médico')).toBeNull()
    expect(screen.queryByText('Baixar todos os laudos')).toBeNull()
    cleanup()

    flags.extras = true
    abrir()
    const titulos = within(screen.getByRole('region', { name: 'Próximos passos' }))
    expect(titulos.getByText('Agendar nova coleta')).toBeTruthy()
    expect(titulos.getByText('Compartilhar com médico')).toBeTruthy()
    expect(titulos.getByText('Baixar todos os laudos')).toBeTruthy()
  })
})

describe('exames recentes (MOSTRAR_EXAMES_RECENTES)', () => {
  const bloco = () => within(screen.getByRole('region', { name: 'Exames recentes' }))

  it('flag desligada: não aparece', () => {
    abrir()
    expect(screen.queryByRole('region', { name: 'Exames recentes' })).toBeNull()
  })

  describe('flag ligada', () => {
    beforeEach(() => {
      flags.recentes = true
    })

    it('lista os 5 mais recentes, com a situação em texto, e abre o exame', () => {
      resultados.exams = [
        exame({ id: '1', name: 'Exame A', status: 'analyzing' }),
        ...['B', 'C', 'D', 'E', 'F'].map((l) => exame({ id: l, name: `Exame ${l}` })),
      ]
      abrir()
      expect(bloco().getAllByRole('button', { name: /Exame [A-F]/ })).toHaveLength(5)
      expect(bloco().queryByText('Exame F')).toBeNull()
      const linha = bloco().getByRole('button', { name: /Exame A/ })
      expect(within(linha).getByText('Em análise')).toBeTruthy()
      expect(within(bloco().getByRole('button', { name: /Exame B/ })).getByText('Liberado')).toBeTruthy()
      fireEvent.click(linha)
      expect(acoes.onOpenExam).toHaveBeenCalledWith(resultados.exams[0])
    })

    it('marca a versão anterior de um laudo retificado', () => {
      resultados.exams = [exame({ retificado: true })]
      abrir()
      expect(bloco().getByText('Versão anterior')).toBeTruthy()
    })

    it('mostra o local e a data da coleta; em pedido sem médico único, a contagem de exames', () => {
      resultados.exams = [exame({ doctor: '—', totalExames: 3, dataColetaCurta: '24 Jul 2026' })]
      abrir()
      expect(bloco().getAllByText('3 exames').length).toBeGreaterThan(0)
      expect(bloco().getAllByText('Unidade Asa Sul · Coleta 24 Jul 2026').length).toBeGreaterThan(0)
    })

    it('"Ver todos" leva aos resultados', () => {
      abrir()
      fireEvent.click(bloco().getByRole('button', { name: 'Ver todos' }))
      expect(acoes.onVerResultados).toHaveBeenCalledOnce()
    })

    it('carregando mostra o esqueleto', () => {
      resultados.exams = []
      resultados.loading = true
      abrir()
      expect(bloco().getByRole('status', { name: 'Carregando' })).toBeTruthy()
    })

    it('sem exames, diz que não há resultado e não oferece "Ver todos"', () => {
      resultados.exams = []
      abrir()
      expect(bloco().getByText('Nenhum resultado ainda')).toBeTruthy()
      expect(bloco().queryByRole('button', { name: 'Ver todos' })).toBeNull()
    })

    it('com erro, mostra a mensagem da API em vez de dizer que não há resultado', () => {
      resultados.exams = []
      resultados.error = 'Serviço indisponível'
      abrir()
      expect(bloco().getByText('Serviço indisponível')).toBeTruthy()
      expect(bloco().queryByText('Nenhum resultado ainda')).toBeNull()
    })
  })
})
