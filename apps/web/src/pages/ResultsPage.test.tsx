import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Laudo, Paciente, Resultado } from '@lab-hub/shared'
import type { Exam } from '../components/shared/WebHero'

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

const ADMIN_EMAIL = 'teste@gmail.com'
const CPF_VALIDO = '52998224725' // dígitos verificadores reais

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
  opts: { paciente?: Paciente | null; onOpenExam?: (exam: Exam) => void } = {},
) {
  estado.exams = exams
  estado.loading = false
  estado.error = null
  return render(
    <ResultsPage
      dark={false}
      onOpenExam={opts.onOpenExam ?? (() => {})}
      {...(opts.paciente !== undefined ? { paciente: opts.paciente } : {})}
    />,
  )
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
    expect(screen.getByText(/Nenhum resultado disponível ainda/)).toBeTruthy()
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

  it('linha da consulta admin não abre o detalhe do exame', async () => {
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

    expect(onOpenExam).not.toHaveBeenCalled()
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
