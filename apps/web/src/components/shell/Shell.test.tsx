import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Exam } from '../shared/WebHero'

// ---------------------------------------------------------------------------
// O shell sozinho (substitui o antigo Topbar.test). Dublês: resultados (a
// busca e o contador do menu), analytics e as flags — estas com getters, para
// cada teste ligar ou desligar uma flag como o código de produção a lê.
// ---------------------------------------------------------------------------

const flags = { chatbot: false, notificacoes: false, dependentes: false }
vi.mock('../../lib/flags', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/flags')>()
  return {
    ...real,
    get MOSTRAR_CHATBOT() {
      return flags.chatbot
    },
    get MOSTRAR_NOTIFICACOES() {
      return flags.notificacoes
    },
    get MOSTRAR_DEPENDENTES() {
      return flags.dependentes
    },
  }
})

const resultados = { exams: [] as Exam[] }
vi.mock('../../lib/useResultados', () => ({
  useResultados: () => ({ exams: resultados.exams, loading: false, error: null }),
  useContagemResultados: () => resultados.exams.length,
}))

const track = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...a: unknown[]) => track(...a) }))

const { Shell } = await import('./Shell')

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

function monta() {
  const props = {
    onToggleDark: vi.fn(),
    onOpenExam: vi.fn(),
    onLogout: vi.fn(),
    onSessaoExpirada: vi.fn(),
  }
  render(
    <Shell nome="Maria Souza" ativo="home" href="/" chaveDaPagina="home" dark={false} {...props}>
      <h1>Conteúdo</h1>
    </Shell>,
  )
  return props
}

const caminho = () => window.location.pathname + window.location.search

beforeEach(() => {
  flags.chatbot = false
  flags.notificacoes = false
  flags.dependentes = false
  resultados.exams = [exame()]
  track.mockClear()
  window.history.replaceState(null, '', '/')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('menu da conta', () => {
  it('mostra o nome e as iniciais do paciente da sessão', () => {
    monta()
    const botao = screen.getByRole('button', { name: 'Abrir menu da conta' })
    expect(botao.textContent).toContain('MS')
    expect(botao.textContent).toContain('Maria')
    expect(botao.textContent).toContain('Titular')
  })

  it('"Meu perfil" leva ao Perfil — o mesmo destino do item no menu', () => {
    monta()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu da conta' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Meu perfil' }))
    expect(caminho()).toBe('/perfil')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('"Sair" registra o logout e chama a saída', () => {
    const { onLogout } = monta()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu da conta' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair' }))
    expect(track).toHaveBeenCalledWith('logout')
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('Esc fecha o menu', () => {
    monta()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu da conta' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('flags do cabeçalho e do suporte', () => {
  it('desligadas: sem sino, sem seletor de dependentes, sem chatbot', () => {
    monta()
    expect(screen.queryByRole('button', { name: 'Notificações' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir suporte' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu da conta' }))
    expect(screen.queryByText('Perfil ativo')).toBeNull()
  })

  it('MOSTRAR_NOTIFICACOES liga o sino', () => {
    flags.notificacoes = true
    monta()
    fireEvent.click(screen.getByRole('button', { name: 'Notificações' }))
    expect(screen.getByText('Nenhuma notificação.')).toBeTruthy()
  })

  it('MOSTRAR_DEPENDENTES liga o seletor de perfil ativo', () => {
    flags.dependentes = true
    monta()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu da conta' }))
    expect(screen.getByText('Perfil ativo')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Marina Madeiro/ }))
    expect(screen.getByRole('button', { name: 'Abrir menu da conta' }).textContent).toContain('Esposa')
  })

  it('MOSTRAR_CHATBOT liga a Lia, que saúda pelo primeiro nome', () => {
    flags.chatbot = true
    monta()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir suporte' }))
    const suporte = screen.getByRole('dialog', { name: 'Suporte' })
    expect(within(suporte).getByText(/Olá, Maria\. Sou a Lia/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Suporte' })).toBeNull()
  })
})

describe('tema', () => {
  it('o botão do cabeçalho alterna o tema', () => {
    const { onToggleDark } = monta()
    fireEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
    expect(onToggleDark).toHaveBeenCalledOnce()
  })
})

describe('busca', () => {
  const busca = () => screen.getByRole('combobox', { name: 'Buscar' })

  it('Ctrl+K foca a busca de qualquer lugar', () => {
    monta()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(document.activeElement).toBe(busca())
  })

  it('acha exame pelo marcador, sem acento, e Enter abre o exame', () => {
    resultados.exams = [
      exame({ panels: [{ name: 'Hemácias', value: '4,8', unit: 'milhões/mm³', ref: '', ok: true, trend: [] }] }),
    ]
    const { onOpenExam } = monta()
    fireEvent.change(busca(), { target: { value: 'hemacias' } })
    const lista = screen.getByRole('listbox')
    expect(within(lista).getByRole('option', { name: /Marcador · Hemácias/ })).toBeTruthy()

    fireEvent.keyDown(busca(), { key: 'Enter' })
    expect(onOpenExam).toHaveBeenCalledWith(resultados.exams[0])
    // Só o tipo: o termo digitado é dado de saúde e nunca vai para o analytics.
    expect(track).toHaveBeenCalledWith('busca_resultado_clique', { tipo: 'exam' })
  })

  it('acha exame pelo médico', () => {
    monta()
    fireEvent.change(busca(), { target: { value: 'larissa' } })
    expect(screen.getByRole('option', { name: /Hemograma completo/ })).toBeTruthy()
  })

  it('sem termo lista as páginas do menu, sem as ocultas por flag', () => {
    monta()
    fireEvent.focus(busca())
    const paginas = within(screen.getByRole('group', { name: 'Ir para' }))
    expect(paginas.getByRole('option', { name: 'Documentos' })).toBeTruthy()
    expect(paginas.queryByRole('option', { name: 'Tendências' })).toBeNull()
  })

  it('escolher uma página navega para ela', () => {
    monta()
    fireEvent.change(busca(), { target: { value: 'docum' } })
    fireEvent.click(screen.getByRole('option', { name: 'Documentos' }))
    expect(caminho()).toBe('/documentos')
    expect(track).toHaveBeenCalledWith('busca_resultado_clique', { tipo: 'page' })
  })

  it('setas mudam o resultado escolhido', () => {
    monta()
    fireEvent.focus(busca())
    fireEvent.keyDown(busca(), { key: 'ArrowDown' })
    fireEvent.keyDown(busca(), { key: 'Enter' })
    expect(caminho()).toBe('/resultados') // 2ª página: Visão geral → Resultados
  })

  it('termo sem resultado avisa', () => {
    monta()
    fireEvent.change(busca(), { target: { value: 'xyzzy' } })
    expect(screen.getByText('Nenhum resultado para “xyzzy”.')).toBeTruthy()
  })

  it('Esc fecha a lista', () => {
    monta()
    fireEvent.change(busca(), { target: { value: 'hemo' } })
    fireEvent.keyDown(busca(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
