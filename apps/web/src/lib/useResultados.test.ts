import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Laudo, RespostaLaudos, Resultado } from '@lab-hub/shared'

// Testes do cache de módulo que serve a tela de Resultados.
//
// O estado (`estado`, `buscadoEm`, `buscando`) vive em variáveis de MÓDULO,
// compartilhadas por ResultsPage, HomePage, TopbarSearch e Sidebar. Isso é o que
// faz a lista aparecer instantânea ao trocar de tela — e é também o que
// transforma um bug de limpeza em vazamento de dado clínico entre pacientes.
// Daí o `resetModules` a cada teste: sem ele um teste herdaria a lista do
// anterior e a suíte esconderia justamente a falha que existe para pegar.

// Handler do onAuthStateChange registrado pelo módulo no load; é por ele que os
// testes simulam login/logout/troca de conta.
type Handler = (evento: string, sessao: { user: { id: string } } | null) => void
let aoMudarAuth: Handler

const get = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Handler) => {
        aoMudarAuth = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))

vi.mock('./api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }))

type Modulo = typeof import('./useResultados')

/**
 * Recarrega o módulo (zerando o cache) e monta o hook de verdade.
 *
 * Ler o estado pelo `useResultados` em vez de expor a variável interna mantém o
 * teste no mesmo caminho da tela: useSyncExternalStore, inscrição e notificação
 * incluídos. Se a notificação parar de acontecer, o teste vê.
 */
async function montaHook(): Promise<{ mod: Modulo; ler: () => ReturnType<Modulo['useResultados']> }> {
  vi.resetModules()
  const mod = await import('./useResultados')
  const { result } = renderHook(() => mod.useResultados())
  return { mod, ler: () => result.current }
}

function laudo(over: Partial<Laudo> = {}): Laudo {
  return {
    id: 'laudo-1',
    name: 'Hemograma Completo',
    category: 'Hematologia',
    date: '12 Mai 2026',
    fullDate: '12 de maio de 2026',
    data_coleta: '2026-05-12',
    data_registro: '2026-05-12',
    data_emissao: '2026-05-18',
    material: '',
    metodo: '',
    unit: 'CLAF',
    doctor: 'Dra. Ana Lima',
    crm: 'CRM/DF 12345',
    status: 'ready',
    summary: '',
    panels: [],
    exam_type: 'Hemograma',
    codigo_os: '',
    codigo_lis: 'REQ-1',
    source: 'aplis',
    partial: false,
    ...over,
  } as Laudo
}

function resultado(over: Partial<Resultado> = {}): Resultado {
  return {
    id: 'res-1',
    exameNome: 'Colesterol',
    categoria: 'Bioquímica',
    status: 'ready',
    liberadoEm: '2026-05-10T00:00:00.000Z',
    resumo: '',
    paineis: [],
    ...over,
  } as Resultado
}

/** Respostas das duas fontes, na ordem em que `busca()` as dispara. */
function respondeCom(opts: { resultados?: Resultado[] | Error; laudos?: Laudo[] | Error }) {
  get.mockImplementation((rota: string) => {
    const alvo = rota === '/resultados' ? opts.resultados : opts.laudos
    if (alvo instanceof Error) return Promise.reject(alvo)
    if (rota === '/resultados') return Promise.resolve(alvo ?? [])
    return Promise.resolve({ exams: alvo ?? [], source: 'cached' } as RespostaLaudos)
  })
}

beforeEach(() => {
  get.mockReset()
  // A degradação parcial loga por design; o ruído não ajuda a ler a saída.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('isolamento entre contas', () => {
  it('descarta a lista do usuário anterior quando outro faz login na mesma aba', async () => {
    respondeCom({ laudos: [laudo({ name: 'Hemograma do paciente A' })] })
    const { mod, ler } = await montaHook()

    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'user-a' } }))
    await act(() => mod.atualizaResultados())
    expect(ler().exams.map((e) => e.name)).toEqual(['Hemograma do paciente A'])

    // Troca de conta SEM reload: é o cenário real (signOut → outro login).
    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'user-b' } }))

    // O ponto que importa: nada do paciente A sobra para o B ver, nem por um
    // instante — a lista é zerada na hora, antes de qualquer busca nova.
    expect(ler().exams).toEqual([])
    expect(ler().loading).toBe(true)
  })

  it('logout descarta a lista', async () => {
    respondeCom({ laudos: [laudo()] })
    const { mod, ler } = await montaHook()

    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'user-a' } }))
    await act(() => mod.atualizaResultados())
    expect(ler().exams).toHaveLength(1)

    act(() => aoMudarAuth('SIGNED_OUT', null))

    expect(ler().exams).toEqual([])
  })

  it('renovação de token do MESMO usuário não descarta o cache', async () => {
    // Se contasse como troca, o cache seria zerado a cada refresh de token e a
    // tela piscaria "carregando" sem motivo.
    respondeCom({ laudos: [laudo()] })
    const { mod, ler } = await montaHook()

    act(() => aoMudarAuth('SIGNED_IN', { user: { id: 'user-a' } }))
    await act(() => mod.atualizaResultados())

    act(() => aoMudarAuth('TOKEN_REFRESHED', { user: { id: 'user-a' } }))

    expect(ler().exams).toHaveLength(1)
  })
})

describe('degradação quando uma fonte falha', () => {
  it('uma fonte fora do ar não zera a lista da outra', async () => {
    respondeCom({ resultados: new Error('FlowLab fora do ar'), laudos: [laudo()] })
    const { mod, ler } = await montaHook()

    await act(() => mod.atualizaResultados())

    expect(ler().exams).toHaveLength(1)
    expect(ler().error).toBeNull()
  })

  it('as duas falhando na PRIMEIRA busca vira erro na tela', async () => {
    respondeCom({ resultados: new Error('sem rede'), laudos: new Error('sem rede') })
    const { mod, ler } = await montaHook()

    await act(() => mod.atualizaResultados())

    expect(ler().error).toBe('sem rede')
    expect(ler().loading).toBe(false)
  })

  it('as duas falhando COM cache mantêm a lista antiga na tela', async () => {
    respondeCom({ laudos: [laudo()] })
    const { mod, ler } = await montaHook()
    await act(() => mod.atualizaResultados())

    respondeCom({ resultados: new Error('caiu'), laudos: new Error('caiu') })
    await act(() => mod.atualizaResultados())

    // Revalidação falha não pode apagar o que o paciente já está vendo.
    expect(ler().exams).toHaveLength(1)
    expect(ler().error).toBeNull()
  })
})

describe('união das duas fontes', () => {
  it('ordena por coleta, do mais recente para o mais antigo', async () => {
    respondeCom({
      resultados: [resultado({ liberadoEm: '2026-05-10T00:00:00.000Z' })],
      laudos: [
        laudo({ id: 'l-1', name: 'Recente', data_coleta: '2026-05-20' }),
        laudo({ id: 'l-2', name: 'Antigo', data_coleta: '2026-04-01' }),
      ],
    })
    const { mod, ler } = await montaHook()

    await act(() => mod.atualizaResultados())

    expect(ler().exams.map((e) => e.name)).toEqual(['Recente', 'Colesterol', 'Antigo'])
  })

  // Duas versões do mesmo exame podem sair com o MESMO `liberadoEm` (uma
  // correção reliberada no mesmo minuto, ou o FlowLab repetindo o carimbo da
  // liberação original). Aí as duas chaves de ordenação empatam e quem decide é
  // a ordem que a API mandou — ela já vem com a vigente primeiro. Se esta
  // ordenação deixasse de ser estável, o paciente veria "Versão anterior" acima
  // do laudo que vale.
  it('mantém a versão vigente acima da anterior quando a liberação empata', async () => {
    const mesmoInstante = '2026-08-04T12:00:00.000Z'
    respondeCom({
      resultados: [
        resultado({ id: 'vigente', exameNome: 'Hemograma', liberadoEm: mesmoInstante }),
        resultado({
          id: 'anterior',
          exameNome: 'Hemograma',
          liberadoEm: mesmoInstante,
          retificadoPor: 'vigente',
        }),
      ],
      laudos: [],
    })
    const { mod, ler } = await montaHook()

    await act(() => mod.atualizaResultados())

    expect(ler().exams.map((e) => e.id)).toEqual(['vigente', 'anterior'])
    expect(ler().exams.map((e) => e.retificado)).toEqual([undefined, true])
  })
})
