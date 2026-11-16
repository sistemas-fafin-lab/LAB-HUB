import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SettingsPage } from './SettingsPage'
import { fusoAtual, salvarFuso } from '../lib/regiao'
import { api, ApiError } from '../lib/api'
import { aoAvisar } from '../lib/avisos'
import type { Aviso } from '../lib/avisos'

vi.mock('../lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/api')>()
  return { ...real, api: { del: vi.fn() } }
})
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
const df = vi.hoisted(() => ({ estado: vi.fn(), enviar: vi.fn(), preferencia: vi.fn() }))
vi.mock('../lib/doisFatores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/doisFatores')>()),
  doisFatores: df,
}))

const UA_CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const UA_SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

function renderiza(dark = false) {
  const onSetDark = vi.fn()
  const onContaExcluida = vi.fn()
  render(<SettingsPage dark={dark} onSetDark={onSetDark} onContaExcluida={onContaExcluida} />)
  return { onSetDark, onContaExcluida }
}

const painel = (titulo: string) => screen.getByRole('region', { name: titulo })

function armazenamentoEmMemoria() {
  // O localStorage do jsdom fica encoberto pelo do Node; um em memória basta.
  const dados = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  })
}

beforeEach(() => {
  armazenamentoEmMemoria()
  df.estado.mockResolvedValue({ ativa: false, pendente: false, enviadoEm: null })
  df.enviar.mockResolvedValue({ enviadoEm: new Date().toISOString() })
})
afterEach(() => {
  salvarFuso('America/Sao_Paulo')
  vi.unstubAllGlobals()
})

describe('cabeçalho', () => {
  it('mostra o título e a descrição', () => {
    renderiza()
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeTruthy()
    expect(screen.getByText('Preferências, notificações, privacidade e segurança da conta.')).toBeTruthy()
  })
})

describe('aparência', () => {
  it('marca o tema atual e troca pelo callback', () => {
    const { onSetDark } = renderiza(false)
    const aparencia = within(painel('Aparência'))
    const claro = aparencia.getByRole('button', { name: 'Claro' })
    const escuro = aparencia.getByRole('button', { name: 'Escuro' })
    expect(claro.getAttribute('aria-pressed')).toBe('true')
    expect(escuro.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(escuro)
    expect(onSetDark).toHaveBeenCalledWith(true)
    fireEvent.click(claro)
    expect(onSetDark).toHaveBeenLastCalledWith(false)
  })

  it('no escuro, a opção marcada é Escuro', () => {
    renderiza(true)
    expect(screen.getByRole('button', { name: 'Escuro' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Claro' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('flags (desligadas)', () => {
  it('sem MOSTRAR_NOVIDADES, não há o cartão de novidades', () => {
    renderiza()
    expect(screen.queryByText('Como você quer receber novidades')).toBeNull()
    // O único interruptor que sobra é o da verificação em duas etapas (real).
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['Verificação em duas etapas'])
  })

  it('sem MOSTRAR_PRIVACIDADE_EXTRAS, Privacidade e segurança não traz "Compartilhar com médicos"', () => {
    renderiza()
    const privacidade = within(painel('Privacidade e segurança'))
    expect(privacidade.queryByText('Compartilhar com médicos')).toBeNull()
    expect(privacidade.getByText('Excluir minha conta')).toBeTruthy()
    expect(privacidade.getByText('Encerra o acesso e apaga seus documentos e contatos')).toBeTruthy()
    expect(privacidade.getByRole('button', { name: 'Solicitar' })).toBeTruthy()
  })
})

describe('idioma e região', () => {
  const select = (rotulo: string) =>
    within(painel('Idioma e região')).getByLabelText(rotulo, { selector: 'select' }) as HTMLSelectElement
  const opcao = (rotulo: string, texto: string) =>
    within(select(rotulo)).getByRole('option', { name: texto }) as HTMLOptionElement

  it('abre em Português, Brasília e mg/dL', () => {
    renderiza()
    expect(select('Idioma').value).toBe('pt-BR')
    expect(select('Fuso horário').value).toBe('America/Sao_Paulo')
    expect(select('Unidades').value).toBe('metric')
  })

  it('troca o fuso horário e guarda a escolha neste aparelho', () => {
    renderiza()
    fireEvent.change(select('Fuso horário'), { target: { value: 'America/Manaus' } })
    expect(select('Fuso horário').value).toBe('America/Manaus')
    expect(fusoAtual()).toBe('America/Manaus')
    expect(localStorage.getItem('labhub:fuso')).toBe('America/Manaus')
    expect(opcao('Fuso horário', 'Fernando de Noronha (GMT-2)').disabled).toBe(false)
  })

  it('outros idiomas e o sistema internacional aparecem, mas ainda não podem ser escolhidos', () => {
    renderiza()
    expect(opcao('Idioma', 'English (em breve)').disabled).toBe(true)
    expect(opcao('Idioma', 'Español (em breve)').disabled).toBe(true)
    expect(opcao('Unidades', 'Sistema internacional (mmol/L) (em breve)').disabled).toBe(true)
  })
})

describe('sem controles sem backend', () => {
  it('dispositivos lista só este aparelho, pelo navegador, e não oferece sair de outros', () => {
    vi.stubGlobal('navigator', { userAgent: UA_CHROME_WINDOWS })
    renderiza()
    const dispositivos = within(painel('Dispositivos conectados'))
    expect(dispositivos.getByText('Chrome · Windows')).toBeTruthy()
    expect(dispositivos.getByText('Este aparelho · sessão atual')).toBeTruthy()
    expect(dispositivos.queryByRole('button')).toBeNull()
  })

  it('reconhece Safari no iPhone (a UA também cita Mac OS X)', () => {
    vi.stubGlobal('navigator', { userAgent: UA_SAFARI_IPHONE })
    renderiza()
    expect(screen.getByText('Safari · iOS')).toBeTruthy()
  })
})

describe('excluir a conta', () => {
  const del = vi.mocked(api.del)
  afterEach(() => del.mockReset())

  function avisos() {
    const recebidos: Aviso[] = []
    const cancela = aoAvisar((a) => recebidos.push(a))
    return { recebidos, cancela }
  }

  it('"Solicitar" abre a confirmação, que diz o que é apagado e o que fica', () => {
    renderiza()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar' }))
    const caixa = within(screen.getByRole('dialog', { name: 'Excluir sua conta?' }))
    expect(caixa.getByText(/documentos que você enviou/)).toBeTruthy()
    expect(caixa.getByText(/Laudos, agendamentos/)).toBeTruthy()
    fireEvent.click(caixa.getByRole('button', { name: 'Manter conta' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('confirmar chama o DELETE e sai da conta', async () => {
    del.mockResolvedValue(undefined)
    const { onContaExcluida } = renderiza()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' })))
    expect(del).toHaveBeenCalledWith('/pacientes/me')
    expect(onContaExcluida).toHaveBeenCalledOnce()
  })

  it('erro da API avisa e mantém a caixa aberta', async () => {
    const { recebidos, cancela } = avisos()
    del.mockRejectedValue(new ApiError(500, 'O servidor falhou. Tente de novo em instantes.'))
    const { onContaExcluida } = renderiza()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' })))
    await waitFor(() => expect(recebidos[0]).toMatchObject({ tone: 'alert', message: 'O servidor falhou. Tente de novo em instantes.' }))
    expect(screen.getByRole('dialog', { name: 'Excluir sua conta?' })).toBeTruthy()
    expect(onContaExcluida).not.toHaveBeenCalled()
    cancela()
  })

  it('429 pede para esperar um minuto', async () => {
    const { recebidos, cancela } = avisos()
    del.mockRejectedValue(new ApiError(429, 'x'))
    renderiza()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' })))
    await waitFor(() => expect(recebidos[0]?.message).toBe('Muitas tentativas. Aguarde um minuto e tente de novo.'))
    cancela()
  })
})

describe('verificação em duas etapas', () => {
  const interruptor = () => screen.getByRole('switch', { name: 'Verificação em duas etapas' })

  it('ligar pede o código; com ele, liga e avisa', async () => {
    const recebidos: Aviso[] = []
    const cancela = aoAvisar((a) => recebidos.push(a))
    df.preferencia.mockResolvedValue({ ativa: true })
    renderiza()
    await waitFor(() => expect(interruptor().getAttribute('aria-disabled')).toBeNull())
    fireEvent.click(interruptor())
    const caixa = within(screen.getByRole('dialog', { name: 'Confirme com o código' }))
    expect(df.enviar).toHaveBeenCalledWith('confirmacao')
    fireEvent.paste(caixa.getByLabelText('Dígito 1'), { clipboardData: { getData: () => '123456' } })
    await act(async () => fireEvent.click(caixa.getByRole('button', { name: 'Ligar verificação' })))
    expect(df.preferencia).toHaveBeenCalledWith(true, '123456')
    expect(interruptor().getAttribute('aria-checked')).toBe('true')
    expect(recebidos.some((a) => a.title === 'Verificação em duas etapas ligada')).toBe(true)
    cancela()
  })

  it('com a verificação ligada, excluir a conta também pede o código', async () => {
    df.estado.mockResolvedValue({ ativa: true, pendente: false, enviadoEm: null })
    vi.mocked(api.del).mockResolvedValue(undefined)
    const { onContaExcluida } = renderiza()
    await waitFor(() => expect(interruptor().getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar' }))
    const caixa = within(screen.getByRole('dialog', { name: 'Excluir sua conta?' }))
    fireEvent.paste(caixa.getByLabelText('Dígito 1'), { clipboardData: { getData: () => '654321' } })
    await act(async () => fireEvent.click(caixa.getByRole('button', { name: 'Excluir conta' })))
    expect(api.del).toHaveBeenCalledWith('/pacientes/me', { codigo: '654321' })
    expect(onContaExcluida).toHaveBeenCalledOnce()
  })
})
