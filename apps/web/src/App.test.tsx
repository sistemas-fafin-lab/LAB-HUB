import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { Agendamento, Paciente } from '@lab-hub/shared'
import type { Exam } from './components/shared/WebHero'

// ---------------------------------------------------------------------------
// O App inteiro montado numa URL inicial. Só a sessão (AuthContext), os hooks
// de dados, o cliente `api` e o analytics são dublês — router, páginas e
// shell são os reais. É aqui que se afirma o que o paciente vê ao abrir um
// link, recarregar, voltar/avançar e entrar sem sessão.
// ---------------------------------------------------------------------------

// Sessão observável: trocar `auth.session` dentro de um teste re-renderiza o
// App, como o onAuthStateChange do Supabase faz depois do login.
const auth = {
  session: null as object | null,
  loading: false,
  ouvintes: new Set<() => void>(),
  snapshot: { session: null as object | null, loading: false },
  set(session: object | null) {
    this.session = session
    this.snapshot = { session, loading: this.loading }
    for (const avisa of this.ouvintes) avisa()
  },
}
vi.mock('./lib/AuthContext', () => ({
  useAuth: () => {
    const s = useSyncExternalStore(
      (avisa) => {
        auth.ouvintes.add(avisa)
        return () => auth.ouvintes.delete(avisa)
      },
      () => auth.snapshot,
    )
    return { ...s, signOut: async () => auth.set(null) }
  },
}))

const resultados = { exams: [] as Exam[], loading: false, error: null as string | null }
vi.mock('./lib/useResultados', async (importOriginal) => {
  const real = await importOriginal<typeof import('./lib/useResultados')>()
  return {
    ...real,
    useResultados: () => resultados,
    useContagemResultados: () => resultados.exams.length,
    atualizaResultados: vi.fn(),
  }
})

const agendamentos = { lista: [] as Agendamento[] }
vi.mock('./lib/useAgendamentos', () => ({
  useAgendamentos: () => ({
    agendamentos: agendamentos.lista,
    loading: false,
    error: null,
    reload: vi.fn(),
    setStatus: vi.fn(),
  }),
}))

vi.mock('./lib/useDocumentos', () => ({
  useDocumentos: () => ({
    documentos: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    enviar: vi.fn(),
    remover: vi.fn(),
    enviando: false,
    limparErro: vi.fn(),
  }),
}))

const PACIENTE: Paciente = {
  id: 'pac-1',
  authUserId: 'auth-1',
  nome: 'Maria Souza',
  email: 'maria@example.com',
  cpf: '52998224725',
  sexo: 'F',
  dataNascimento: '1990-03-14',
}
vi.mock('./lib/usePaciente', () => ({
  usePaciente: () => ({ paciente: PACIENTE, loading: false, error: null, setPaciente: vi.fn() }),
}))

// Nenhuma tela precisa de resposta da rede para o que se afirma aqui.
const nunca = () => new Promise<never>(() => {})
vi.mock('./lib/api', () => ({
  api: { get: nunca, post: nunca, put: nunca, del: nunca, upload: nunca, declaracao: nunca, documentoUrl: nunca },
  ApiError: class extends Error {},
}))

const trackPageview = vi.fn()
vi.mock('./lib/analytics', () => ({
  initAnalytics: vi.fn(),
  track: vi.fn(),
  trackPageview: (...args: unknown[]) => trackPageview(...args),
}))

const { App } = await import('./App')

const SESSAO = { user: { id: 'auth-1', email: PACIENTE.email } }

function exame(over: Partial<Exam> = {}): Exam {
  return {
    id: 'exame-1',
    name: 'Hemograma completo',
    category: 'Hematologia',
    date: '20 Jul 2026',
    fullDate: '20 de julho de 2026',
    unit: 'Lab Hub',
    doctor: 'Dra. Larissa Mendes',
    crm: 'CRM-DF 15750',
    status: 'ready',
    summary: '',
    panels: [],
    ...over,
  }
}

function agendamento(over: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'ag-1',
    pacienteId: 'pac-1',
    postoFlowlabId: 'posto-1',
    postoNome: 'Unidade Asa Sul',
    dataHora: '2026-11-10T10:00:00.000Z',
    status: 'confirmado',
    criadoEm: '2026-11-01T10:00:00.000Z',
    ...over,
  } as Agendamento
}

/** Monta o App como se o paciente tivesse aberto `url` na barra de endereço. */
function abre(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const caminho = () => window.location.pathname + window.location.search

beforeEach(() => {
  auth.set(SESSAO)
  resultados.exams = [exame()]
  agendamentos.lista = [agendamento()]
  trackPageview.mockClear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom não implementa
})

describe('cada tela abre pela própria URL', () => {
  it.each([
    ['/', 'Que bom te ver de volta.'],
    ['/resultados', 'Seus resultados'],
    ['/agendar', 'Agendas/Coletas'],
    ['/coletas', 'Agendas/Coletas'],
    ['/documentos', 'Documentos'],
    ['/configuracoes', 'Configurações'],
    ['/perfil', 'Maria Souza'],
  ])('%s mostra "%s"', (url, titulo) => {
    abre(url)
    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeTruthy()
  })
})

describe('rotas com parâmetro', () => {
  it('/exame/:id abre o detalhe daquele exame', () => {
    resultados.exams = [exame(), exame({ id: 'exame-2', name: 'Glicose em jejum' })]
    abre('/exame/exame-2')
    expect(screen.getByRole('heading', { level: 1, name: 'Glicose em jejum' })).toBeTruthy()
  })

  it('/laudo/:id abre o laudo daquele exame, com o voltar para o detalhe', () => {
    abre('/laudo/exame-1')
    fireEvent.click(screen.getByRole('button', { name: /^Voltar$/ }))
    expect(caminho()).toBe('/exame/exame-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Hemograma completo' })).toBeTruthy()
  })

  it('/coleta/:id abre a linha do tempo daquela coleta', () => {
    abre('/coleta/ag-1')
    expect(screen.getByRole('heading', { name: 'Linha do tempo' })).toBeTruthy()
  })

  it('exame que não existe mostra "não encontrado" com volta para Resultados', () => {
    abre('/exame/sumiu')
    expect(screen.getByRole('heading', { level: 1, name: 'Exame não encontrado' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: /Voltar para resultados/ }))
    expect(caminho()).toBe('/resultados')
  })

  it('enquanto os exames carregam, não declara o exame inexistente', () => {
    resultados.exams = []
    resultados.loading = true
    try {
      abre('/exame/exame-1')
      expect(screen.queryByText('Exame não encontrado')).toBeNull()
      expect(screen.getByText('Carregando exame…')).toBeTruthy()
    } finally {
      resultados.loading = false
    }
  })
})

describe('navegação e histórico do navegador', () => {
  it('abrir um exame na lista muda a URL; voltar e avançar trocam a tela', async () => {
    abre('/resultados')
    fireEvent.click(screen.getByText('Hemograma completo'))
    expect(caminho()).toBe('/exame/exame-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Hemograma completo' })).toBeTruthy()

    act(() => window.history.back())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Seus resultados' })).toBeTruthy())
    expect(caminho()).toBe('/resultados')

    act(() => window.history.forward())
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Hemograma completo' })).toBeTruthy(),
    )
  })

  it('as abas de Agendas/Coletas são URLs', () => {
    abre('/agendar')
    fireEvent.click(screen.getByRole('button', { name: /Minhas coletas/ }))
    expect(caminho()).toBe('/coletas')
  })

  it('o menu lateral navega por URL', () => {
    abre('/')
    fireEvent.click(screen.getByRole('button', { name: 'Documentos' }))
    expect(caminho()).toBe('/documentos')
    expect(screen.getByRole('heading', { level: 1, name: 'Documentos' })).toBeTruthy()
  })

  it('rota oculta por flag cai na Visão geral', () => {
    abre('/tendencias') // MOSTRAR_TENDENCIAS = false
    expect(caminho()).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Que bom te ver de volta.' })).toBeTruthy()
  })
})

describe('sem sessão', () => {
  it('qualquer rota leva a /entrar?next=<rota> e, depois do login, volta a ela', () => {
    auth.set(null)
    abre('/exame/exame-1?aba=marcadores')
    expect(caminho()).toBe('/entrar?next=%2Fexame%2Fexame-1%3Faba%3Dmarcadores')
    expect(screen.getByRole('heading', { level: 1, name: 'Bem-vindo de volta' })).toBeTruthy()

    act(() => auth.set(SESSAO))
    expect(caminho()).toBe('/exame/exame-1?aba=marcadores')
    expect(screen.getByRole('heading', { level: 1, name: 'Hemograma completo' })).toBeTruthy()
  })

  it.each([
    'https://outro.site/roubo',
    '//outro.site/roubo',
    '/\\outro.site/roubo',
    'javascript:alert(1)',
    '/.//outro.site/roubo',
    '/..//outro.site/roubo',
    '/entrar',
    '/entrar/',
  ])('next %s é ignorado e o login leva à Visão geral', (next) => {
    auth.set(null)
    abre(`/entrar?next=${encodeURIComponent(next)}`)
    act(() => auth.set(SESSAO))
    expect(caminho()).toBe('/')
  })
})

describe('sair', () => {
  it('quem entra depois de um logout não herda a tela de quem saiu, nem pelo voltar', async () => {
    abre('/resultados')
    fireEvent.click(screen.getByText('Hemograma completo'))
    expect(caminho()).toBe('/exame/exame-1')

    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Sair/ })))
    expect(caminho()).toBe('/entrar')

    // Volta para o Perfil de quem saiu: sem sessão, cai na entrada SEM `next`.
    act(() => window.history.back())
    await waitFor(() => expect(window.location.pathname).toBe('/entrar'))
    expect(caminho()).toBe('/entrar')

    act(() => auth.set(SESSAO))
    expect(caminho()).toBe('/')
  })
})

describe('rota desconhecida', () => {
  it('mostra 404 com um link de volta que navega sem recarregar', () => {
    abre('/isso-nao-existe')
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: /Voltar para a visão geral/ }))
    expect(caminho()).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Que bom te ver de volta.' })).toBeTruthy()
  })
})

describe('pageview', () => {
  it('dispara uma vez por mudança de URL, com o nome da tela e sem o id', () => {
    abre('/resultados')
    expect(trackPageview.mock.calls).toEqual([['results']])

    fireEvent.click(screen.getByText('Hemograma completo'))
    expect(trackPageview.mock.calls).toEqual([['results'], ['exam']])
  })

  it('redirecionamento registra só o destino', () => {
    abre('/tendencias')
    expect(trackPageview.mock.calls).toEqual([['home']])
  })

  it('exame inexistente registra a página não encontrada', () => {
    abre('/exame/sumiu')
    expect(trackPageview.mock.calls).toEqual([['nao-encontrada']])
  })

  it('404 registra a página não encontrada', () => {
    abre('/isso-nao-existe')
    expect(trackPageview.mock.calls).toEqual([['nao-encontrada']])
  })
})
