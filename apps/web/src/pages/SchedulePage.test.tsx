import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Agendamento, PostoDisponivel } from '@lab-hub/shared'
import { SchedulePage } from './SchedulePage'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { aoAvisar } from '../lib/avisos'
import type { Aviso } from '../lib/avisos'
import { JEJUM_LABEL, REGRAS_GERAIS, RESSALVA_PREPARO } from '../lib/preparo'

// A tela renderizada: só o cliente `api`, o analytics e os documentos são
// dublês. useAgendamentos fica real, para a lista reagir a reenviar e cancelar.
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), documentoUrl: vi.fn() },
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
const documentos = {
  documentos: [] as unknown[],
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
  enviar: vi.fn(),
  remover: vi.fn(),
  enviando: false,
  limparErro: vi.fn(),
}
const useDocumentos = vi.fn((_id?: string) => documentos)
vi.mock('../lib/useDocumentos', () => ({ useDocumentos: (id?: string) => useDocumentos(id) }))

const get = vi.mocked(api.get)
const post = vi.mocked(api.post)

const DIA = 86_400_000
const emDias = (n: number, hora = 8, min = 0) => {
  const d = new Date(Date.now() + n * DIA)
  d.setHours(hora, min, 0, 0)
  return d.toISOString()
}

const ag = (over: Partial<Agendamento> = {}): Agendamento => ({
  id: 'ag-1',
  pacienteId: 'p',
  postoFlowlabId: 'posto-1',
  postoNome: 'Unidade Asa Sul',
  dataHora: emDias(5),
  status: 'confirmado',
  criadoEm: emDias(-1),
  ...over,
})

const posto = (over: Partial<PostoDisponivel> = {}): PostoDisponivel => ({
  id: 'posto-1',
  nome: 'Unidade Asa Sul',
  endereco: 'SGAS 915',
  slots: [emDias(2, 8), emDias(2, 8, 30), emDias(2, 10), emDias(3, 9)],
  ...over,
})

let lista: Agendamento[]
let postos: PostoDisponivel[]

beforeEach(() => {
  lista = []
  postos = [posto()]
  Object.assign(documentos, { documentos: [], loading: false, error: null, enviando: false })
  useDocumentos.mockClear()
  get.mockImplementation(async (url: string) => (url === '/agendamentos' ? lista : postos) as never)
  post.mockResolvedValue({} as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

const props = {
  dark: false,
  onAba: vi.fn(),
  onAbrirColeta: vi.fn(),
  onFecharColeta: vi.fn(),
}

const naLista = () => render(<SchedulePage {...props} aba="minhas" selectedId={null} />)
const noAgendar = () => render(<SchedulePage {...props} aba="agendar" selectedId={null} />)
const noDetalhe = (id = 'ag-1') => render(<SchedulePage {...props} aba="minhas" selectedId={id} />)

function avisos() {
  const recebidos: Aviso[] = []
  const cancela = aoAvisar((a) => recebidos.push(a))
  return { recebidos, cancela }
}

describe('Minhas coletas', () => {
  it('mostra carregando e depois a lista', async () => {
    lista = [ag()]
    naLista()
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /Unidade Asa Sul.*Confirmado/ })).toBeTruthy()
  })

  it('erro mostra a mensagem da API e tenta de novo', async () => {
    get.mockRejectedValueOnce(new Error('API fora do ar'))
    lista = [ag()]
    naLista()
    expect(await screen.findByText('API fora do ar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('button', { name: /Unidade Asa Sul.*Confirmado/ })).toBeTruthy()
  })

  it('sem coletas, o vazio leva a agendar', async () => {
    naLista()
    expect(await screen.findByText('Nenhuma coleta em andamento')).toBeTruthy()
    const painel = screen.getByText('Nenhuma coleta em andamento').parentElement as HTMLElement
    fireEvent.click(within(painel).getByRole('button', { name: 'Agendar coleta' }))
    expect(props.onAba).toHaveBeenCalledWith('agendar')
  })

  it('destaca a próxima coleta com o jejum e abre o detalhe', async () => {
    lista = [ag({ id: 'longe', dataHora: emDias(9) }), ag({ id: 'perto', dataHora: emDias(2) })]
    naLista()
    const proxima = await screen.findByRole('region', { name: 'Próxima coleta' })
    expect(within(proxima).getByText(`Jejum de ${JEJUM_LABEL}`)).toBeTruthy()
    fireEvent.click(within(proxima).getByRole('button', { name: 'Ver detalhes' }))
    expect(props.onAbrirColeta).toHaveBeenCalledWith('perto')
  })

  it('separa em andamento e histórico, com a contagem de cada um', async () => {
    lista = [
      ag({ id: 'a', status: 'em_coleta' }),
      ag({ id: 'b', postoNome: 'Unidade Norte', status: 'realizado', dataHora: emDias(-3) }),
      ag({ id: 'c', postoNome: 'Unidade Sul', status: 'cancelado', dataHora: emDias(-5) }),
    ]
    naLista()
    expect(await screen.findByRole('button', { name: /Em andamento\s*1/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Unidade Norte/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Histórico\s*2/ }))
    expect(screen.getByRole('button', { name: /Unidade Norte.*Realizado/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Unidade Sul.*Cancelado/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Unidade Asa Sul.*Check-in feito/ })).toBeNull()
  })

  it('a falta (agendada com a hora vencida) vai para o histórico', async () => {
    lista = [ag({ dataHora: emDias(-2) })]
    naLista()
    expect(await screen.findByRole('button', { name: /Histórico\s*1/ })).toBeTruthy()
    expect(screen.getByText('Nenhuma coleta em andamento')).toBeTruthy()
  })

  it('clicar na linha abre a coleta', async () => {
    lista = [ag({ status: 'em_coleta' })]
    naLista()
    fireEvent.click(await screen.findByRole('button', { name: /Unidade Asa Sul.*Check-in feito/ }))
    expect(props.onAbrirColeta).toHaveBeenCalledWith('ag-1')
  })

  it('pendência na recepção aparece em alerta e leva ao detalhe', async () => {
    lista = [ag({ status: 'bloqueado' })]
    naLista()
    const alerta = await screen.findByRole('region', { name: 'Coleta com pendência' })
    expect(within(alerta).getByText(/verifique seus documentos/)).toBeTruthy()
    fireEvent.click(within(alerta).getByRole('button', { name: 'Ver detalhes' }))
    expect(props.onAbrirColeta).toHaveBeenCalledWith('ag-1')
  })

  it('não fala em recoleta: o sistema não tem esse dado', async () => {
    lista = [ag({ status: 'bloqueado' })]
    naLista()
    await screen.findByText(/tem pendência na recepção/)
    expect(screen.queryByText(/recoleta/i)).toBeNull()
  })

  it('Recarregar busca as coletas de novo', async () => {
    lista = [ag()]
    naLista()
    await screen.findByText('Próxima coleta')
    const antes = get.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(antes))
  })

  it('"Agendar coleta" do cabeçalho vai para o agendamento', async () => {
    naLista()
    await screen.findByText('Nenhuma coleta em andamento')
    fireEvent.click(screen.getAllByRole('button', { name: 'Agendar coleta' })[0] as HTMLElement)
    expect(props.onAba).toHaveBeenCalledWith('agendar')
  })
})

describe('reenviar ao FlowLab', () => {
  it('só a coleta pendente oferece, e reenviar recarrega a lista', async () => {
    lista = [ag({ status: 'pendente' })]
    naLista()
    const botoes = await screen.findAllByRole('button', { name: 'Reenviar' })
    const antes = get.mock.calls.length
    fireEvent.click(botoes[0] as HTMLElement)
    await waitFor(() => expect(post).toHaveBeenCalledWith('/agendamentos/ag-1/sync', {}))
    expect(track).toHaveBeenCalledWith('agendamento_resync')
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(antes))
  })

  it('coleta confirmada não oferece', async () => {
    lista = [ag()]
    naLista()
    await screen.findByText('Próxima coleta')
    expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull()
  })

  it('a falha do reenvio avisa o paciente', async () => {
    const { recebidos, cancela } = avisos()
    lista = [ag({ status: 'pendente' })]
    post.mockRejectedValueOnce(new Error('FlowLab fora do ar'))
    naLista()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reenviar' }))[0] as HTMLElement)
    await waitFor(() => expect(recebidos[0]).toMatchObject({ tone: 'alert', message: 'FlowLab fora do ar' }))
    cancela()
  })
})

describe('cancelar coleta', () => {
  async function pedeCancelamento() {
    fireEvent.click((await screen.findAllByRole('button', { name: 'Cancelar' }))[0] as HTMLElement)
    return screen.getByRole('dialog', { name: 'Cancelar coleta?' })
  }

  it('pede confirmação antes de cancelar', async () => {
    lista = [ag()]
    naLista()
    const caixa = await pedeCancelamento()
    expect(post).not.toHaveBeenCalled()
    fireEvent.click(within(caixa).getByRole('button', { name: 'Manter coleta' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(post).not.toHaveBeenCalled()
  })

  it('Esc fecha a confirmação sem cancelar', async () => {
    lista = [ag()]
    naLista()
    await pedeCancelamento()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(post).not.toHaveBeenCalled()
  })

  it('não promete liberar o horário: a API só tenta avisar o FlowLab', async () => {
    lista = [ag()]
    naLista()
    const caixa = await pedeCancelamento()
    expect(within(caixa).queryByText(/fica livre/)).toBeNull()
  })

  it('confirmar chama a API, registra o evento e move a coleta para o histórico', async () => {
    lista = [ag()]
    naLista()
    const caixa = await pedeCancelamento()
    fireEvent.click(within(caixa).getByRole('button', { name: 'Cancelar coleta' }))
    expect(track).toHaveBeenCalledWith('agendamento_cancelado')
    await waitFor(() => expect(post).toHaveBeenCalledWith('/agendamentos/ag-1/cancelar', {}))
    expect(await screen.findByRole('button', { name: /Histórico\s*1/ })).toBeTruthy()
  })

  it('se a API falhar, recarrega do servidor e avisa', async () => {
    const { recebidos, cancela } = avisos()
    lista = [ag()]
    post.mockRejectedValueOnce(new Error('Falha ao cancelar agendamento'))
    naLista()
    const caixa = await pedeCancelamento()
    const antes = get.mock.calls.length
    fireEvent.click(within(caixa).getByRole('button', { name: 'Cancelar coleta' }))
    await waitFor(() => expect(recebidos[0]).toMatchObject({ tone: 'alert', message: 'Falha ao cancelar agendamento' }))
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(antes))
    expect(await screen.findByRole('button', { name: /Em andamento\s*1/ })).toBeTruthy()
    cancela()
  })

  it.each(['em_coleta', 'realizado', 'cancelado', 'bloqueado'] as const)('coleta %s não oferece cancelar', async (status) => {
    lista = [ag({ status })]
    naLista()
    await screen.findByRole('button', { name: /Em andamento/ })
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Histórico/ }))
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })
})

describe('preparo na lista', () => {
  it('abre com o clique, com os textos atuais, e fecha com Esc', async () => {
    lista = [ag()]
    naLista()
    const [botao] = await screen.findAllByRole('button', { name: 'Preparo para a coleta' })
    fireEvent.click(botao as HTMLElement)
    expect(botao?.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/Última refeição até/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(botao?.getAttribute('aria-expanded')).toBe('false')
  })

  it.each(['em_coleta', 'bloqueado'] as const)('%s: oferece só se ainda se aplica', async (status) => {
    lista = [ag({ status })]
    naLista()
    await screen.findByRole('button', { name: /Em andamento/ })
    const esperado = status === 'bloqueado' ? 1 : 0
    expect(screen.queryAllByRole('button', { name: 'Preparo para a coleta' })).toHaveLength(esperado)
  })
})

describe('Agendar coleta', () => {
  const horario = (nome: RegExp) => screen.getByRole('button', { name: nome })

  it('carrega as unidades da disponibilidade e escolhe a primeira', async () => {
    postos = [posto(), posto({ id: 'posto-2', nome: 'Unidade Norte', endereco: 'W3 Norte' })]
    noAgendar()
    expect(screen.getAllByRole('status', { name: 'Carregando' }).length).toBeGreaterThan(0)
    const primeira = await screen.findByRole('button', { name: /Unidade Asa Sul/ })
    expect(primeira.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('W3 Norte')).toBeTruthy()
    expect(get).toHaveBeenCalledWith('/postos/disponibilidade')
  })

  it('trocar de unidade mostra os horários dela', async () => {
    postos = [posto({ slots: [emDias(2, 8)] }), posto({ id: 'posto-2', nome: 'Unidade Norte', slots: [emDias(2, 15)] })]
    noAgendar()
    fireEvent.click(await screen.findByRole('button', { name: /Unidade Norte/ }))
    expect(horario(/^15:00$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^08:00$/ })).toBeNull()
  })

  it('agenda só depois de confirmar, com posto e horário', async () => {
    const { recebidos, cancela } = avisos()
    post.mockResolvedValue(ag({ id: 'novo' }) as never)
    noAgendar()
    fireEvent.click(await screen.findByRole('button', { name: /^08:00$/ }))
    expect(post).not.toHaveBeenCalled()

    const caixa = screen.getByRole('dialog', { name: 'Confirmar agendamento' })
    expect(within(caixa).getByText(/pedido médico/)).toBeTruthy()
    fireEvent.click(within(caixa).getByRole('button', { name: 'Confirmar coleta' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/agendamentos', { postoFlowlabId: 'posto-1', dataHora: emDias(2, 8) }),
    )
    await waitFor(() => expect(props.onAbrirColeta).toHaveBeenCalledWith('novo'))
    expect(track).toHaveBeenCalledWith('agendamento_confirmado', { posto: 'Unidade Asa Sul' })
    expect(recebidos[0]).toMatchObject({ title: 'Coleta confirmada' })
    cancela()
  })

  it('a coleta recém-criada abre sem esperar a lista recarregar', async () => {
    post.mockResolvedValue(ag({ id: 'novo' }) as never)
    const { rerender } = noAgendar()
    fireEvent.click(await screen.findByRole('button', { name: /^08:00$/ }))
    get.mockImplementation(() => new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar coleta' }))
    await waitFor(() => expect(props.onAbrirColeta).toHaveBeenCalledWith('novo'))

    rerender(<SchedulePage {...props} aba="minhas" selectedId="novo" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Coleta agendada' })).toBeTruthy()
  })

  it('cancelar a confirmação não agenda', async () => {
    noAgendar()
    fireEvent.click(await screen.findByRole('button', { name: /^08:00$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(post).not.toHaveBeenCalled()
  })

  it('enquanto agenda, a caixa não fecha', async () => {
    post.mockImplementation(() => new Promise(() => {}))
    noAgendar()
    fireEvent.click(await screen.findByRole('button', { name: /^08:00$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar coleta' }))
    expect(await screen.findByRole('button', { name: 'Agendando…' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('recusa da API mostra a mensagem dela e registra o erro', async () => {
    post.mockRejectedValue(new Error('Horário indisponível'))
    noAgendar()
    fireEvent.click(await screen.findByRole('button', { name: /^08:00$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar coleta' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Horário indisponível')
    expect(track).toHaveBeenCalledWith('agendamento_erro', { motivo: 'Horário indisponível' })
    expect(props.onAbrirColeta).not.toHaveBeenCalled()
  })

  it('horários indisponíveis ficam marcados e não abrem a confirmação', async () => {
    noAgendar()
    const preso = await screen.findByRole('button', { name: /09:00.*indisponível/ })
    expect(preso.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(preso)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/Horários riscados/)).toBeTruthy()
  })

  it('sem nenhum indisponível, a legenda não aparece', async () => {
    postos = [posto({ slots: [emDias(2, 8), emDias(2, 8, 30)] })]
    noAgendar()
    await screen.findByRole('button', { name: /^08:00$/ })
    expect(screen.queryByText(/Horários riscados/)).toBeNull()
  })

  it('escolher outro dia mostra os horários dele', async () => {
    noAgendar()
    await screen.findByRole('button', { name: /^08:00$/ })
    const dias = screen.getAllByRole('button', { pressed: false }).filter((b) => b.dataset.dia !== undefined)
    fireEvent.click(dias[0] as HTMLElement)
    expect(horario(/^09:00$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^08:00$/ })).toBeNull()
  })

  describe('carrossel de dias', () => {
    const medidas = (el: HTMLElement, scrollLeft: number) => {
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: 300 })
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 800 })
      Object.defineProperty(el, 'scrollLeft', { configurable: true, value: scrollLeft })
    }

    it('navega por botões e desliga a seta no fim', async () => {
      const scrollBy = vi.fn()
      Element.prototype.scrollBy = scrollBy
      noAgendar()
      await screen.findByRole('button', { name: /^08:00$/ })
      const anteriores = screen.getByRole('button', { name: 'Dias anteriores' }) as HTMLButtonElement
      const proximos = screen.getByRole('button', { name: 'Próximos dias' }) as HTMLButtonElement
      const trilho = screen.getByRole('group', { name: 'Dias com horário' })

      medidas(trilho, 0)
      fireEvent.scroll(trilho)
      expect(anteriores.disabled).toBe(true)
      expect(proximos.disabled).toBe(false)

      fireEvent.click(proximos)
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }))
      expect((scrollBy.mock.calls[0]?.[0] as ScrollToOptions).left).toBeGreaterThan(0)

      medidas(trilho, 500)
      fireEvent.scroll(trilho)
      expect(anteriores.disabled).toBe(false)
      expect(proximos.disabled).toBe(true)
      fireEvent.click(anteriores)
      expect((scrollBy.mock.calls[1]?.[0] as ScrollToOptions).left).toBeLessThan(0)
    })
  })

  it('preparo com os textos atuais', async () => {
    noAgendar()
    await screen.findByRole('button', { name: /^08:00$/ })
    expect(screen.getByText(`Jejum de ${JEJUM_LABEL}`)).toBeTruthy()
    for (const regra of REGRAS_GERAIS) expect(screen.getByText(regra.texto)).toBeTruthy()
    expect(screen.getByText(RESSALVA_PREPARO)).toBeTruthy()
  })

  it('sem unidades: estado vazio', async () => {
    postos = []
    noAgendar()
    expect(await screen.findByText('Nenhuma unidade disponível no momento.')).toBeTruthy()
  })

  it('unidade sem horários: avisa', async () => {
    postos = [posto({ slots: [] })]
    noAgendar()
    expect(await screen.findByText('Sem horários disponíveis nesta unidade.')).toBeTruthy()
  })

  it('erro ao carregar mostra a mensagem da API e tenta de novo', async () => {
    get.mockRejectedValueOnce(new Error('Disponibilidade fora do ar'))
    noAgendar()
    expect(await screen.findByText('Disponibilidade fora do ar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('button', { name: /^08:00$/ })).toBeTruthy()
  })

  it('Recarregar busca a disponibilidade de novo', async () => {
    noAgendar()
    await screen.findByRole('button', { name: /^08:00$/ })
    const antes = get.mock.calls.filter(([u]) => u === '/postos/disponibilidade').length
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
    await waitFor(() =>
      expect(get.mock.calls.filter(([u]) => u === '/postos/disponibilidade').length).toBe(antes + 1),
    )
  })

  it('voltar leva a Minhas coletas', async () => {
    noAgendar()
    fireEvent.click(screen.getByRole('button', { name: 'Minhas coletas' }))
    expect(props.onAba).toHaveBeenCalledWith('minhas')
  })
})

describe('detalhe da coleta', () => {
  it('enquanto carrega não declara a coleta inexistente', () => {
    get.mockImplementation(() => new Promise(() => {}))
    noDetalhe()
    expect(screen.getByRole('status').textContent).toContain('Carregando coleta')
    expect(screen.queryByText('Coleta não encontrada')).toBeNull()
  })

  it('coleta que não existe mostra "não encontrada" com volta', async () => {
    noDetalhe('sumiu')
    expect(await screen.findByText('Coleta não encontrada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para minhas coletas' }))
    expect(props.onFecharColeta).toHaveBeenCalled()
  })

  it('erro ao carregar não vira "não encontrada"', async () => {
    get.mockRejectedValueOnce(new Error('API fora do ar'))
    noDetalhe()
    expect(await screen.findByText('API fora do ar')).toBeTruthy()
    expect(screen.queryByText('Coleta não encontrada')).toBeNull()
  })

  it('mostra a unidade, as etapas com rótulo e volta para a lista', async () => {
    lista = [ag({ status: 'em_coleta' })]
    noDetalhe()
    expect(await screen.findByRole('heading', { level: 1, name: 'Coleta em andamento' })).toBeTruthy()
    expect(screen.getAllByText(/Unidade Asa Sul/).length).toBeGreaterThan(0)
    for (const etapa of ['Agendamento', 'Check-in', 'Análise', 'Liberação']) {
      expect(screen.getAllByText(etapa).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Etapa atual', { selector: '.lh-ov' }).parentElement?.textContent).toContain('Coleta')
    fireEvent.click(screen.getByRole('button', { name: 'Minhas coletas' }))
    expect(props.onFecharColeta).toHaveBeenCalled()
  })

  it('durante o check-in não diz que a amostra já foi coletada', async () => {
    lista = [ag({ status: 'em_coleta' })]
    noDetalhe()
    expect(await screen.findByText('Amostra sendo coletada no posto.')).toBeTruthy()
    expect(screen.queryByText('Amostra coletada.')).toBeNull()
  })

  it.each([
    ['pendente', 'Coleta agendada', 'Agendamento'],
    ['confirmado', 'Coleta agendada', 'Agendamento'],
    ['realizado', 'Coleta realizada', 'Análise'],
    ['bloqueado', 'Coleta com pendência', 'Pendência'],
    ['cancelado', 'Coleta cancelada', 'Cancelado'],
  ] as const)('%s: "%s", etapa atual %s', async (status, titulo, etapa) => {
    lista = [ag({ status })]
    noDetalhe()
    expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeTruthy()
    expect(screen.getByText('Etapa atual', { selector: '.lh-ov' }).parentElement?.textContent).toContain(etapa)
  })

  it('pendência explica o que fazer na etapa em atenção, sem falar em recoleta', async () => {
    lista = [ag({ status: 'bloqueado' })]
    noDetalhe()
    expect(await screen.findByText('Pendência na recepção')).toBeTruthy()
    expect(screen.getByText(/verifique seus documentos \(identidade, guia e pedido médico\)/)).toBeTruthy()
    expect(screen.queryByText(/recoleta/i)).toBeNull()
  })

  it('cancelada avisa, e não sobra etapa atual nem previsão', async () => {
    lista = [ag({ status: 'cancelado' })]
    noDetalhe()
    expect(await screen.findByText('Esta coleta foi cancelada.')).toBeTruthy()
    expect(screen.queryByText('Etapa atual', { selector: 'span' })).toBeNull()
    expect(screen.getByText('Previsão', { selector: '.lh-ov' }).parentElement?.textContent).toContain('—')
  })

  it('preparo completo enquanto a coleta não aconteceu', async () => {
    lista = [ag()]
    noDetalhe()
    expect(await screen.findByText(/Última refeição até/)).toBeTruthy()
    for (const regra of REGRAS_GERAIS) expect(screen.getByText(regra.texto)).toBeTruthy()
    expect(screen.getByText(RESSALVA_PREPARO)).toBeTruthy()
    expect(screen.getByText('Jejum', { selector: '.lh-ov' }).parentElement?.textContent).toContain(JEJUM_LABEL)
  })

  it.each(['em_coleta', 'realizado', 'cancelado'] as const)('%s: sem preparo', async (status) => {
    lista = [ag({ status })]
    noDetalhe()
    await screen.findByRole('heading', { name: 'Linha do tempo' })
    expect(screen.queryByText(/Última refeição até/)).toBeNull()
    expect(screen.getByText('Jejum', { selector: '.lh-ov' }).parentElement?.textContent).toContain('—')
  })

  it('lista os exames coletados, marcando as culturas', async () => {
    lista = [
      ag({
        status: 'realizado',
        exames: [
          { nome: 'Hemograma', isCultura: false, material: 'Sangue' },
          { nome: 'Urocultura', isCultura: true },
        ],
      }),
    ]
    noDetalhe()
    expect(await screen.findByText('Hemograma')).toBeTruthy()
    expect(screen.getByText('Sangue')).toBeTruthy()
    expect(screen.getByText('Cultura')).toBeTruthy()
  })

  it('documentos da coleta: pede pelo id e oferece envio enquanto faz sentido', async () => {
    lista = [ag()]
    noDetalhe()
    expect(await screen.findByRole('heading', { name: 'Documentos desta coleta' })).toBeTruthy()
    expect(useDocumentos).toHaveBeenCalledWith('ag-1')
    expect(screen.getByText(/JPG, PNG, WEBP ou PDF/)).toBeTruthy()
  })

  it('coleta realizada: some o envio, ficam os anexos', async () => {
    documentos.documentos = [
      { id: 'd-1', tipo: 'pedido_medico', nomeArquivo: 'pedido.pdf', mimeType: 'application/pdf', tamanhoBytes: 10, criadoEm: emDias(-1) },
    ]
    lista = [ag({ status: 'realizado' })]
    noDetalhe()
    expect(await screen.findByRole('heading', { name: 'Documentos desta coleta' })).toBeTruthy()
    expect(screen.queryByText(/JPG, PNG, WEBP ou PDF/)).toBeNull()
  })

  it('cancelada sem anexos: a seção de documentos some', async () => {
    lista = [ag({ status: 'cancelado' })]
    noDetalhe()
    await screen.findByText('Esta coleta foi cancelada.')
    expect(screen.queryByRole('heading', { name: 'Documentos desta coleta' })).toBeNull()
  })

  it('cancelar a partir do detalhe usa a mesma confirmação', async () => {
    lista = [ag()]
    noDetalhe()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar coleta' }))
    const caixa = screen.getByRole('dialog', { name: 'Cancelar coleta?' })
    fireEvent.click(within(caixa).getByRole('button', { name: 'Cancelar coleta' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/agendamentos/ag-1/cancelar', {}))
    expect(await screen.findByRole('heading', { level: 1, name: 'Coleta cancelada' })).toBeTruthy()
  })

  it('não promete o que não existe', async () => {
    lista = [ag()]
    noDetalhe()
    await screen.findByRole('heading', { name: 'Linha do tempo' })
    expect(screen.queryByText(/push|e-mail|SMS|Remarcar|calendário|Como chegar/i)).toBeNull()
  })
})
