import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Laudo, Paciente, Resultado } from '@lab-hub/shared'
import type { Exam } from '../lib/exame'

const estado = { exams: [] as Exam[], loading: false, error: null as string | null }

// `combinaExams` real (não mockado): a composição/ordenação da consulta admin
// tem de ser a MESMA usada pela visão normal, e mockar aqui esconderia uma
// regressão nela. Só `useResultados`/`atualizaResultados` (a conta da sessão)
// são dublês — a tela não precisa de rede para isso.
vi.mock('../lib/useResultados', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/useResultados')>()
  return {
    ...real,
    useResultados: () => estado,
    atualizaResultados: vi.fn(),
  }
})

class ApiErrorMock extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}
const adminResultadosPorCpf = vi.fn()
vi.mock('../lib/api', () => ({
  api: { adminResultadosPorCpf: (...args: unknown[]) => adminResultadosPorCpf(...args) },
  ApiError: ApiErrorMock,
}))

const { ResultsPage } = await import('./ResultsPage')
const { atualizaResultados } = await import('../lib/useResultados')

const ADMIN_EMAIL = 'teste@gmail.com'
const CPF_VALIDO = '52998224725' // dígitos verificadores reais
const CPF_VALIDO_B = '11144477735' // segundo CPF válido — troca de paciente sem sair da aba

// Promise controlável de fora — usada para simular respostas atrasadas e
// testar a proteção contra corrida entre pedidos administrativos.
function pendente<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function paciente(email: string): Paciente {
  return {
    id: 'pac-1',
    authUserId: 'auth-1',
    nome: 'Fulano de Tal',
    email,
    cpf: '11111111111',
    sexo: 'M',
    dataNascimento: '1990-01-01',
  }
}

function resultado(over: Partial<Resultado> = {}): Resultado {
  return {
    id: 'res-1',
    pacienteId: 'alvo-1',
    exameNome: 'Hemograma completo',
    status: 'ready',
    paineis: [],
    liberadoEm: '2026-07-20T12:00:00.000Z',
    ...over,
  }
}

function laudo(over: Partial<Laudo> = {}): Laudo {
  return {
    id: 'laudo-1',
    name: 'Colesterol Total',
    category: 'Bioquímica',
    date: '10 Mai 2026',
    fullDate: '10 de maio de 2026',
    data_coleta: '2026-05-10',
    data_registro: '2026-05-10',
    data_emissao: '2026-05-12',
    material: 'Soro',
    metodo: 'Enzimático',
    laboratorio: { nome: 'CLAF', cnes: '', endereco: '' },
    unit: 'CLAF',
    doctor: 'Dra. Ana Lima',
    crm: 'CRM/DF 12345',
    status: 'ready',
    summary: '',
    panels: [],
    exam_type: 'Colesterol',
    codigo_os: '',
    codigo_lis: 'REQ-1',
    source: 'merged',
    partial: false,
    ...over,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  adminResultadosPorCpf.mockReset()
  vi.mocked(atualizaResultados).mockClear()
})

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

function monta(
  exams: Exam[],
  opts: { paciente?: Paciente | null; onOpenExam?: (exam: Exam) => void; onAgendar?: () => void } = {},
) {
  estado.exams = exams
  estado.loading = false
  estado.error = null
  return render(
    <ResultsPage
      onOpenExam={opts.onOpenExam ?? (() => {})}
      onAgendar={opts.onAgendar ?? (() => {})}
      {...(opts.paciente !== undefined ? { paciente: opts.paciente } : {})}
    />,
  )
}

describe('estado vazio', () => {
  it('diz que ainda não há resultados quando a conta não tem exame nenhum', () => {
    monta([])

    expect(screen.getByText('Nenhum resultado ainda')).toBeTruthy()
  })

  it('leva a agendar quem não tem exame nenhum', () => {
    const onAgendar = vi.fn()
    monta([], { onAgendar })

    fireEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }))

    expect(onAgendar).toHaveBeenCalledTimes(1)
  })

  it('diz que o FILTRO não casou quando existem exames escondidos por ele', () => {
    monta([exame()])

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'zzz' } })

    // Sem o caminho de volta ao filtro, o paciente com filtro ativo concluía que
    // não tinha exames. E o convite a agendar seria falso aqui.
    expect(screen.getByText('Nenhum exame encontrado')).toBeTruthy()
    expect(screen.getByText(/limpe os filtros/)).toBeTruthy()
    expect(screen.queryByText('Nenhum resultado ainda')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Agendar coleta' })).toBeNull()
  })

  it('"Limpar filtros" desfaz busca, status e período', () => {
    monta([exame({ name: 'Glicemia' })])

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByText('Em andamento'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Período' }), { target: { value: '30d' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))

    expect(screen.getByText('Glicemia')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Buscar por nome/)).toHaveProperty('value', '')
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveProperty('value', 'all')
  })
})

describe('carregando e erro', () => {
  it('mostra o esqueleto no carregamento, sem dizer que a lista está vazia', () => {
    estado.exams = []
    estado.loading = true
    estado.error = null
    render(<ResultsPage onOpenExam={() => {}} onAgendar={() => {}} />)

    expect(screen.getByRole('status', { name: 'Carregando' })).toBeTruthy()
    expect(screen.queryByText('Nenhum resultado ainda')).toBeNull()
  })

  it('mostra a mensagem da API e deixa tentar de novo', () => {
    estado.exams = []
    estado.loading = false
    estado.error = 'O servidor falhou. Tente de novo em instantes.'
    render(<ResultsPage onOpenExam={() => {}} onAgendar={() => {}} />)

    expect(screen.getByText('O servidor falhou. Tente de novo em instantes.')).toBeTruthy()
    expect(screen.queryByText('Nenhum resultado ainda')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(atualizaResultados).toHaveBeenCalledTimes(1)
  })
})

describe('busca', () => {
  const exames = () => [
    exame({ id: 'a', name: 'Glicemia', category: 'Bioquímica' }),
    exame({ id: 'b', name: 'Hemograma Completo', category: 'Hematologia' }),
  ]
  const buscar = (texto: string) =>
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: texto } })

  it('encontra pelo nome, sem diferenciar maiúsculas', () => {
    monta(exames())

    buscar('GLICEMIA')

    expect(screen.getByText('Glicemia')).toBeTruthy()
    expect(screen.queryByText('Hemograma Completo')).toBeNull()
  })

  it('encontra pela categoria', () => {
    monta(exames())

    buscar('hematologia')

    expect(screen.getByText('Hemograma Completo')).toBeTruthy()
    expect(screen.queryByText('Glicemia')).toBeNull()
  })
})

describe('filtro de status', () => {
  const exames = () => [
    exame({ id: 'a', name: 'Exame pronto', status: 'ready' }),
    exame({ id: 'b', name: 'Exame na bancada', status: 'analyzing' }),
  ]

  it('"Liberados" deixa só os liberados', () => {
    monta(exames())

    fireEvent.click(screen.getByText('Liberados'))

    expect(screen.getByText('Exame pronto')).toBeTruthy()
    expect(screen.queryByText('Exame na bancada')).toBeNull()
  })

  it('"Em andamento" deixa só os ainda não liberados', () => {
    monta(exames())

    fireEvent.click(screen.getByText('Em andamento'))

    expect(screen.getByText('Exame na bancada')).toBeTruthy()
    expect(screen.queryByText('Exame pronto')).toBeNull()
  })

  it('"Todos" volta a mostrar tudo e o filtro ativo fica marcado', () => {
    monta(exames())

    fireEvent.click(screen.getByText('Liberados'))
    expect(screen.getByRole('button', { name: /^Liberados/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByText('Todos'))

    expect(screen.getByRole('button', { name: /^Todos/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Exame pronto')).toBeTruthy()
    expect(screen.getByText('Exame na bancada')).toBeTruthy()
  })

  it('cada filtro mostra quantos exames tem', () => {
    monta(exames())

    expect(screen.getByRole('button', { name: 'Todos 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Liberados 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Em andamento 1' })).toBeTruthy()
  })
})

describe('filtro de período', () => {
  const diasAtras = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)
  const escolher = (valor: string) =>
    fireEvent.change(screen.getByRole('combobox', { name: 'Período' }), { target: { value: valor } })

  it.each([
    ['30d', 'Últimos 30 dias', 10, 60],
    ['90d', 'Últimos 90 dias', 60, 120],
    ['12m', 'Últimos 12 meses', 300, 400],
  ])('%s (%s) corta pela data da coleta', (valor, _rotulo, dentro, fora) => {
    monta([
      exame({ id: 'a', name: 'Dentro do período', coletadoEm: diasAtras(dentro) }),
      exame({ id: 'b', name: 'Fora do período', coletadoEm: diasAtras(fora) }),
    ])

    escolher(valor)

    expect(screen.getByText('Dentro do período')).toBeTruthy()
    expect(screen.queryByText('Fora do período')).toBeNull()
  })

  it('exame sem data de coleta sai quando há período escolhido, e só então', () => {
    monta([exame({ name: 'Sem data' })])
    expect(screen.getByText('Sem data')).toBeTruthy()

    escolher('30d')

    expect(screen.queryByText('Sem data')).toBeNull()
  })
})

describe('lista', () => {
  it('mantém a ordem que vem do hook', () => {
    monta([exame({ id: 'a', name: 'Exame 2' }), exame({ id: 'b', name: 'Exame 1' })])

    expect(screen.getAllByText(/^Exame \d$/).map((el) => el.textContent)).toEqual(['Exame 2', 'Exame 1'])
  })

  it('abre o exame da linha, sem marca de consulta administrativa', () => {
    const onOpenExam = vi.fn()
    monta([exame({ name: 'Glicemia' })], { onOpenExam })

    fireEvent.click(screen.getByText('Glicemia'))

    expect(onOpenExam.mock.calls[0]?.[0]).toMatchObject({ name: 'Glicemia' })
    expect(onOpenExam.mock.calls[0]?.[0].somenteLeituraAdmin).toBeUndefined()
  })

  it('mostra a situação de cada exame em texto', () => {
    monta([exame({ id: 'a', status: 'ready' }), exame({ id: 'b', status: 'analyzing' })])

    expect(screen.getByText('Liberado')).toBeTruthy()
    expect(screen.getByText('Em análise')).toBeTruthy()
  })

  it('conta quantos exames a busca deixou', () => {
    monta([exame({ id: 'a', name: 'Glicemia' }), exame({ id: 'b', name: 'Ureia' })])

    expect(screen.getByText('2 de 2 exames')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'ureia' } })

    expect(screen.getByText('1 de 2 exames')).toBeTruthy()
  })

  it('"Atualizar" busca a lista de novo', async () => {
    monta([exame()])

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))

    await waitFor(() => expect(atualizaResultados).toHaveBeenCalledTimes(1))
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

// ---------------------------------------------------------------------------
// Consulta administrativa de dev (CPF) — ver .scratch/consulta-dev-resultados-por-cpf
// ---------------------------------------------------------------------------
describe('consulta administrativa por CPF — visibilidade do campo', () => {
  it('não aparece sem sessão', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    monta([])

    expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
  })

  it('não aparece para uma sessão com e-mail diferente do configurado', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    monta([], { paciente: paciente('outro@gmail.com') })

    expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
  })

  it('não aparece sem VITE_ADMIN_EMAIL configurado, mesmo com o e-mail certo', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '')
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
  })

  it('aparece para a sessão autorizada', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    expect(screen.getByPlaceholderText(/Consultar por CPF/)).toBeTruthy()
  })

  it('a visão normal (sem sessão admin) continua igual à de antes — regressão', () => {
    // Mesmo teste do bloco "estado vazio" acima, sem VITE_ADMIN_EMAIL: garante
    // que a capacidade nova não vazou para quem não é a sessão autorizada.
    monta([])

    expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
    expect(screen.getByText('Nenhum resultado ainda')).toBeTruthy()
  })

  // Fora de dev (build de produção), a visibilidade do campo passa a exigir
  // também o disjuntor — ver .scratch/consulta-admin-cpf-producao.
  describe('fora do modo de desenvolvimento — matriz de disjuntor + e-mail', () => {
    it('não aparece com disjuntor ligado e e-mail batendo, mas ainda em dev — precondição', () => {
      // Sanity check da matriz abaixo: confirma que só stubar DEV como false já
      // muda o resultado, isolando o efeito do disjuntor nos casos seguintes.
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_ADMIN_RESULTS_ENABLED', 'true')
      vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
      monta([], { paciente: paciente(ADMIN_EMAIL) })

      expect(screen.getByPlaceholderText(/Consultar por CPF/)).toBeTruthy()
    })

    it('não aparece com disjuntor desligado, mesmo com e-mail certo', () => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_ADMIN_RESULTS_ENABLED', 'false')
      vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
      monta([], { paciente: paciente(ADMIN_EMAIL) })

      expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
    })

    it('não aparece com disjuntor ligado, sem e-mail configurado', () => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_ADMIN_RESULTS_ENABLED', 'true')
      vi.stubEnv('VITE_ADMIN_EMAIL', '')
      monta([], { paciente: paciente(ADMIN_EMAIL) })

      expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
    })

    it('não aparece sem disjuntor e sem e-mail configurados', () => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_ADMIN_RESULTS_ENABLED', 'false')
      vi.stubEnv('VITE_ADMIN_EMAIL', '')
      monta([], { paciente: paciente(ADMIN_EMAIL) })

      expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
    })

    it('aparece com disjuntor ligado e e-mail batendo', () => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_ADMIN_RESULTS_ENABLED', 'true')
      vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
      monta([], { paciente: paciente(ADMIN_EMAIL) })

      expect(screen.getByPlaceholderText(/Consultar por CPF/)).toBeTruthy()
    })

    it('não aparece com disjuntor ligado e e-mail da sessão não autorizado', () => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_ADMIN_RESULTS_ENABLED', 'true')
      vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
      monta([], { paciente: paciente('outro@gmail.com') })

      expect(screen.queryByPlaceholderText(/Consultar por CPF/)).toBeNull()
    })
  })
})

describe('consulta administrativa por CPF — validação e busca', () => {
  function buscar(cpf: string) {
    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: cpf } })
    fireEvent.click(screen.getByText('Buscar'))
  }

  it('CPF inválido mostra erro e não dispara requisição', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar('123')

    expect(screen.getByText('CPF inválido')).toBeTruthy()
    expect(adminResultadosPorCpf).not.toHaveBeenCalled()
  })

  it('Enter dispara a mesma busca que o botão', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), {
      target: { value: CPF_VALIDO },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/Consultar por CPF/), { key: 'Enter' })

    await waitFor(() => expect(adminResultadosPorCpf).toHaveBeenCalledWith(CPF_VALIDO))
  })

  it('sucesso substitui a lista pela do paciente encontrado, com nome e CPF completo', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
    })
    monta([exame({ name: 'Exame da sessão' })], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)

    await waitFor(() => expect(screen.getByText('Maria Alvo')).toBeTruthy())
    expect(screen.getByText('529.982.247-25')).toBeTruthy()
    expect(screen.getByText('Hemograma completo')).toBeTruthy()
    // A lista PRÓPRIA some — as duas listas nunca aparecem misturadas.
    expect(screen.queryByText('Exame da sessão')).toBeNull()
  })

  it('linha da consulta admin abre o detalhe marcado como somente leitura', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
    })
    const onOpenExam = vi.fn()
    monta([], { paciente: paciente(ADMIN_EMAIL), onOpenExam })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Hemograma completo')).toBeTruthy())
    fireEvent.click(screen.getByText('Hemograma completo'))

    // Os valores do resultado de outro paciente podem ser vistos — mas a flag
    // é quem faz o detalhe esconder "Ver laudo"/declaração (ver ExamDetailPage
    // e o campo em lib/exame.ts), que montariam o documento com a identidade
    // da sessão logada, não a do paciente consultado.
    expect(onOpenExam).toHaveBeenCalledTimes(1)
    expect(onOpenExam.mock.calls[0]?.[0]).toMatchObject({
      name: 'Hemograma completo',
      somenteLeituraAdmin: true,
    })
  })

  it('CPF sem paciente correspondente mostra estado distinto de "sem resultado"', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockRejectedValue(new ApiErrorMock(404, 'Paciente não encontrado'))
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)

    await waitFor(() =>
      expect(screen.getByText(/Nenhum paciente encontrado com este CPF/)).toBeTruthy(),
    )
  })

  it('paciente encontrado sem resultado mostra mensagem própria, distinta da de paciente não encontrado', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Sem Resultado', cpf: CPF_VALIDO },
      resultados: [],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)

    await waitFor(() =>
      expect(screen.getByText('Nenhum resultado encontrado para Maria Sem Resultado.')).toBeTruthy(),
    )
    expect(screen.queryByText(/Nenhum paciente encontrado/)).toBeNull()
  })

  it('"Voltar aos meus resultados" limpa a consulta e restaura a lista própria', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado()],
    })
    monta([exame({ name: 'Exame da sessão' })], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Maria Alvo')).toBeTruthy())

    fireEvent.click(screen.getByText('Voltar aos meus resultados'))

    expect(screen.queryByText('Maria Alvo')).toBeNull()
    expect(screen.getByText('Exame da sessão')).toBeTruthy()
  })
})

// Ticket 02 — laudo LIS cacheado (ver .scratch/consulta-dev-resultados-por-cpf).
describe('consulta administrativa por CPF — laudos do cache LIS', () => {
  function buscar(cpf: string) {
    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: cpf } })
    fireEvent.click(screen.getByText('Buscar'))
  }

  it('mostra também os laudos do cache LIS, sem uma segunda representação visual', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
      laudos: [laudo({ name: 'Colesterol Total' })],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)

    await waitFor(() => expect(screen.getByText('Hemograma completo')).toBeTruthy())
    // Mesmo `ExamRow` das duas fontes na visão normal — não um card diferente.
    expect(screen.getByText('Colesterol Total')).toBeTruthy()
  })

  it('ordena as duas fontes pela mesma regra da visão normal — mais recente primeiro', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [
        resultado({ id: 'r-antigo', exameNome: 'Resultado antigo', liberadoEm: '2026-01-05T00:00:00.000Z' }),
      ],
      laudos: [laudo({ id: 'l-recente', name: 'Laudo recente', data_coleta: '2026-07-01' })],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)

    await waitFor(() => expect(screen.getByText('Laudo recente')).toBeTruthy())
    const nomes = screen.getAllByText(/Laudo recente|Resultado antigo/).map((el) => el.textContent)
    expect(nomes).toEqual(['Laudo recente', 'Resultado antigo'])
  })

  it('paciente sem laudo cacheado ainda mostra os resultado FlowLab', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
      laudos: [],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)

    await waitFor(() => expect(screen.getByText('Hemograma completo')).toBeTruthy())
  })
})

describe('consulta administrativa por CPF — Atualizar', () => {
  function buscar(cpf: string) {
    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: cpf } })
    fireEvent.click(screen.getByText('Buscar'))
  }

  it('repete a consulta do CPF exibido, e não a lista própria', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
      laudos: [],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Maria Alvo')).toBeTruthy())
    adminResultadosPorCpf.mockClear()

    fireEvent.click(screen.getByText('Atualizar'))

    await waitFor(() => expect(adminResultadosPorCpf).toHaveBeenCalledWith(CPF_VALIDO))
  })

  it('falha técnica no Atualizar mostra erro seguro sem apagar o banner', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValueOnce({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
      laudos: [],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Maria Alvo')).toBeTruthy())

    adminResultadosPorCpf.mockRejectedValueOnce(new ApiErrorMock(500, 'O servidor falhou. Tente de novo em instantes.'))
    fireEvent.click(screen.getByText('Atualizar'))

    await waitFor(() =>
      expect(screen.getByText('O servidor falhou. Tente de novo em instantes.')).toBeTruthy(),
    )
    // O banner do paciente consultado continua — a falha não vira "sem resultado".
    expect(screen.getByText('Maria Alvo')).toBeTruthy()
  })
})

// Ticket 03 — ciclo de vida e isolamento do modo admin (ver
// .scratch/consulta-dev-resultados-por-cpf/issues/03-...).
describe('consulta administrativa por CPF — filtros da visão normal ficam ocultos', () => {
  function buscar(cpf: string) {
    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: cpf } })
    fireEvent.click(screen.getByText('Buscar'))
  }

  it('esconde a busca por nome/categoria, os filtros de status e o período durante a consulta', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo' })],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    // Fora do modo admin os filtros da visão normal estão todos lá.
    expect(screen.getByPlaceholderText(/Buscar por nome/)).toBeTruthy()
    expect(screen.getByText('Liberados')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeTruthy()

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Maria Alvo')).toBeTruthy())

    expect(screen.queryByPlaceholderText(/Buscar por nome/)).toBeNull()
    expect(screen.queryByText('Liberados')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Período' })).toBeNull()
  })

  it('um filtro de status ou texto deixado de uma sessão normal anterior não esconde itens da lista admin', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValue({
      paciente: { id: 'alvo-1', nome: 'Maria Alvo', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Hemograma completo', status: 'analyzing' })],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    // Filtra por "Liberados" e digita um texto que não bate com o exame do
    // paciente consultado — se o bypass do modo admin falhar, o exame some.
    fireEvent.click(screen.getByText('Liberados'))
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'zzz' } })

    buscar(CPF_VALIDO)

    await waitFor(() => expect(screen.getByText('Hemograma completo')).toBeTruthy())
  })
})

describe('consulta administrativa por CPF — trocar de paciente sem sair da aba', () => {
  function buscar(cpf: string) {
    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: cpf } })
    fireEvent.click(screen.getByText('Buscar'))
  }

  it('o campo de CPF continua disponível em consulta ativa e permite trocar de paciente', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValueOnce({
      paciente: { id: 'alvo-1', nome: 'Paciente A', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Exame de A' })],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Exame de A')).toBeTruthy())

    adminResultadosPorCpf.mockResolvedValueOnce({
      paciente: { id: 'alvo-2', nome: 'Paciente B', cpf: CPF_VALIDO_B },
      resultados: [resultado({ id: 'res-b', exameNome: 'Exame de B' })],
    })
    buscar(CPF_VALIDO_B)

    await waitFor(() => expect(screen.getByText('Paciente B')).toBeTruthy())
    expect(screen.getByText('Exame de B')).toBeTruthy()
    // A lista do paciente anterior não fica misturada com a do novo.
    expect(screen.queryByText('Exame de A')).toBeNull()
    expect(screen.queryByText('Paciente A')).toBeNull()
  })

  it('enquanto a nova consulta carrega, os resultados do paciente anterior não continuam na tela', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValueOnce({
      paciente: { id: 'alvo-1', nome: 'Paciente A', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Exame de A' })],
    })
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Exame de A')).toBeTruthy())

    const { promise, resolve } = pendente<{
      paciente: { id: string; nome: string; cpf: string }
      resultados: ReturnType<typeof resultado>[]
    }>()
    adminResultadosPorCpf.mockReturnValueOnce(promise)

    buscar(CPF_VALIDO_B)

    // Em voo: nem o exame antigo (que não é mais o CPF exibido) nem o novo
    // ainda aparecem — a lista cede lugar ao skeleton de carregamento.
    await waitFor(() => expect(screen.queryByText('Exame de A')).toBeNull())

    resolve({
      paciente: { id: 'alvo-2', nome: 'Paciente B', cpf: CPF_VALIDO_B },
      resultados: [resultado({ id: 'res-b', exameNome: 'Exame de B' })],
    })

    await waitFor(() => expect(screen.getByText('Exame de B')).toBeTruthy())
  })

  it('uma resposta atrasada de uma consulta anterior não sobrescreve o CPF submetido por último', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    monta([], { paciente: paciente(ADMIN_EMAIL) })

    // O botão "Buscar" fica desabilitado durante uma busca em voo (proteção de
    // primeira linha), mas o campo de texto continua ativo — duas teclas Enter
    // em sequência rápida ainda alcançam `consultarCpf` duas vezes antes da
    // primeira resolver. A guarda de pedido é quem protege este caso.
    const input = screen.getByPlaceholderText(/Consultar por CPF/)

    const primeira = pendente<{
      paciente: { id: string; nome: string; cpf: string }
      resultados: ReturnType<typeof resultado>[]
    }>()
    adminResultadosPorCpf.mockReturnValueOnce(primeira.promise)
    fireEvent.change(input, { target: { value: CPF_VALIDO } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(adminResultadosPorCpf).toHaveBeenCalledTimes(1))

    const segunda = pendente<{
      paciente: { id: string; nome: string; cpf: string }
      resultados: ReturnType<typeof resultado>[]
    }>()
    adminResultadosPorCpf.mockReturnValueOnce(segunda.promise)
    fireEvent.change(input, { target: { value: CPF_VALIDO_B } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(adminResultadosPorCpf).toHaveBeenCalledTimes(2))

    // A consulta mais recente (B) resolve primeiro; a mais antiga (A) chega DEPOIS.
    segunda.resolve({
      paciente: { id: 'alvo-2', nome: 'Paciente B', cpf: CPF_VALIDO_B },
      resultados: [resultado({ id: 'res-b', exameNome: 'Exame de B' })],
    })
    await waitFor(() => expect(screen.getByText('Paciente B')).toBeTruthy())

    primeira.resolve({
      paciente: { id: 'alvo-1', nome: 'Paciente A', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Exame de A' })],
    })

    // A resposta atrasada de A não pode substituir B, que é o CPF exibido por último.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByText('Paciente B')).toBeTruthy()
    expect(screen.queryByText('Paciente A')).toBeNull()
    expect(screen.queryByText('Exame de A')).toBeNull()
  })
})

describe('consulta administrativa por CPF — Voltar cancela consulta em andamento', () => {
  function buscar(cpf: string) {
    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: cpf } })
    fireEvent.click(screen.getByText('Buscar'))
  }

  it('uma resposta atrasada não repopula a lista depois do Voltar', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValueOnce({
      paciente: { id: 'alvo-1', nome: 'Paciente A', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Exame de A' })],
    })
    monta([exame({ name: 'Exame da sessão' })], { paciente: paciente(ADMIN_EMAIL) })

    buscar(CPF_VALIDO)
    await waitFor(() => expect(screen.getByText('Paciente A')).toBeTruthy())

    const { promise, resolve } = pendente<{
      paciente: { id: string; nome: string; cpf: string }
      resultados: ReturnType<typeof resultado>[]
    }>()
    adminResultadosPorCpf.mockReturnValueOnce(promise)
    buscar(CPF_VALIDO_B)

    fireEvent.click(screen.getByText('Voltar aos meus resultados'))
    expect(screen.getByText('Exame da sessão')).toBeTruthy()

    resolve({
      paciente: { id: 'alvo-2', nome: 'Paciente B', cpf: CPF_VALIDO_B },
      resultados: [resultado({ id: 'res-b', exameNome: 'Exame de B' })],
    })

    // A resposta que chegou depois do Voltar não pode reabrir o modo admin.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByText('Exame da sessão')).toBeTruthy()
    expect(screen.queryByText('Paciente B')).toBeNull()
    expect(screen.queryByText('Exame de B')).toBeNull()
  })
})

describe('consulta administrativa por CPF — trocar de aba encerra o modo admin', () => {
  it('desmontar e remontar a página (troca de aba) não preserva a consulta anterior', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', ADMIN_EMAIL)
    adminResultadosPorCpf.mockResolvedValueOnce({
      paciente: { id: 'alvo-1', nome: 'Paciente A', cpf: CPF_VALIDO },
      resultados: [resultado({ exameNome: 'Exame de A' })],
    })
    const { unmount } = monta([], { paciente: paciente(ADMIN_EMAIL) })

    fireEvent.change(screen.getByPlaceholderText(/Consultar por CPF/), { target: { value: CPF_VALIDO } })
    fireEvent.click(screen.getByText('Buscar'))
    await waitFor(() => expect(screen.getByText('Paciente A')).toBeTruthy())

    unmount() // simula trocar de aba: o roteador desmonta ResultsPage

    monta([exame({ name: 'Exame da sessão' })], { paciente: paciente(ADMIN_EMAIL) })

    expect(screen.queryByText('Paciente A')).toBeNull()
    expect(screen.getByText('Exame da sessão')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Consultar por CPF/)).toHaveProperty('value', '')
  })
})
