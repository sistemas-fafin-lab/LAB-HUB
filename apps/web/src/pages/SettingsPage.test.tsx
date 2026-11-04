import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SettingsPage } from './SettingsPage'
import { fusoAtual, salvarFuso } from '../lib/regiao'

const UA_CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const UA_SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

function renderiza(dark = false) {
  const onSetDark = vi.fn()
  render(<SettingsPage dark={dark} onSetDark={onSetDark} />)
  return { onSetDark }
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

beforeEach(armazenamentoEmMemoria)
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
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('sem MOSTRAR_PRIVACIDADE_EXTRAS, Privacidade traz só "Excluir minha conta"', () => {
    renderiza()
    const privacidade = within(painel('Privacidade'))
    expect(privacidade.queryByText('Compartilhar com médicos')).toBeNull()
    expect(privacidade.queryByText('Verificação em duas etapas')).toBeNull()
    expect(privacidade.getByText('Excluir minha conta')).toBeTruthy()
    expect(privacidade.getByText('Apaga todos os seus dados após 30 dias')).toBeTruthy()
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
