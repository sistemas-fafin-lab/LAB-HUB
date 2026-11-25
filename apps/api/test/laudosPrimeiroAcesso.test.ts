import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'
import type { IAolService, AolOrderRef } from '../src/laudos/aol.js'
import type { IAplisService } from '../src/laudos/aplis.js'
import { IntegrationError } from '../src/laudos/errors.js'
import type { IExamResultRepository } from '../src/laudos/repository.js'
import { LaudoService } from '../src/laudos/service.js'
import type { AolExam, AplisRequisicao, ExamResultRow, Laudo } from '../src/laudos/types.js'

// Busca histórica no primeiro acesso.
//
// A varredura normal olha só APLIS_PERIODO_DIAS para trás (90). Quem cria a
// conta depois disso tinha a lista vazia para sempre: o exame já tinha saído da
// janela antes de existir cache para guardá-lo. Enquanto a busca histórica do
// paciente não tiver sido CONCLUÍDA, o ApLIS é varrido com a janela longa e a
// AOL é consultada em janelas curtas em torno de cada requisição antiga.
//
// Códigos, O.S. e CPF são inventados.

const PACIENTE = 'pac-1'
const CPF = '52998224725'
const HOJE = '2026-11-25T12:00:00Z'

class RepositorioEmMemoria implements IExamResultRepository {
  linhas: ExamResultRow[] = []
  historicoBuscado = false
  marcarHistorico = vi.fn(async () => {
    this.historicoBuscado = true
  })
  #serial = 0

  async historicoJaBuscado(): Promise<boolean> {
    return this.historicoBuscado
  }
  async marcarHistoricoBuscado(): Promise<void> {
    await this.marcarHistorico()
  }
  async findByPaciente(): Promise<Laudo[]> {
    return this.linhas.flatMap((l) => (l.result ?? []).map((laudo) => ({ ...laudo, cached_at: l.cached_at! })))
  }
  async findAllRows(): Promise<ExamResultRow[]> {
    return [...this.linhas]
  }
  async findByCodigoLis(_p: string, codigoLis: string): Promise<ExamResultRow | null> {
    return this.linhas.find((l) => l.codigo_lis === codigoLis) ?? null
  }
  async findByCodigoOs(_p: string, codigoOs: string): Promise<ExamResultRow | null> {
    return this.linhas.find((l) => l.codigo_os === codigoOs) ?? null
  }
  async insertAwaiting(
    _p: string,
    _cpf: string,
    codigoLis: string | null,
    codigoOs: string | null,
    pedido: string | null = null,
  ): Promise<void> {
    this.linhas.push({
      id: `linha-${++this.#serial}`,
      paciente_id: PACIENTE,
      cpf: CPF,
      codigo_lis: codigoLis,
      codigo_os: codigoOs,
      codigo_lis_pedido: pedido,
      result: null,
      cached_at: null,
    })
  }
  async setPedidoDeOrigem(id: string, pedido: string): Promise<void> {
    this.linhas.find((l) => l.id === id)!.codigo_lis_pedido = pedido
  }
  async setCodigoOs(id: string, codigoOs: string): Promise<void> {
    this.linhas.find((l) => l.id === id)!.codigo_os = codigoOs
  }
  async desvincularOs(id: string): Promise<void> {
    Object.assign(this.linhas.find((l) => l.id === id)!, { codigo_os: null, result: null, cached_at: null })
  }
  async saveResult(id: string, result: Laudo[]): Promise<void> {
    const linha = this.linhas.find((l) => l.id === id)!
    linha.result = result
    linha.cached_at = new Date().toISOString()
  }
  async renewCachedAt(): Promise<void> {}
}

/** Requisição como a listagem do ApLIS a devolve (data em DD/MM/AAAA HH:mm). */
function requisicao(codigo: string, solicitacao: string): AplisRequisicao {
  return {
    cod_requisicao: codigo,
    id_requisicao: `id-${codigo}`,
    data_solicitacao: solicitacao,
    data_liberacao: null,
    tipo_exame: 'MEDICINA LABORATORIAL',
    paciente: { nome: 'Paciente Exemplo', cpf: CPF, data_nascimento: null, sexo: null },
    procedimentos: [],
    local: { nome: '', endereco: null, numero: null },
  }
}

function exameDaOs(codigoOs: string): AolExam {
  return {
    codigo_os: codigoOs,
    data_solicitacao: '2026-06-23',
    data_liberacao: '2026-06-25',
    nome_exame: `EXAME ${codigoOs}`,
    codigo_tipo: null,
    status: 'liberado',
    material: 'soro',
    metodo: null,
    doctor: null,
    crm_documento: null,
    paciente_cpf: CPF,
    analitos: [{ nome: 'GLICOSE', valor: '90', unidade: 'mg/dL', referencia: '70 a 99' }],
  }
}

/** Uma O.S. da AOL e o dia em que a listagem `orders/status` a devolve. */
interface OrdemNaAol extends AolOrderRef {
  dia: string
}

interface Cenario {
  requisicoes?: AplisRequisicao[]
  ordens?: OrdemNaAol[]
}

function montar(cenario: Cenario = {}) {
  const repo = new RepositorioEmMemoria()
  const requisicoes = cenario.requisicoes ?? []

  const aplis = {
    requisicaoListar: vi.fn(async (_cpf: string, _ini: string, _fim: string) => requisicoes),
    requisicaoResultado: vi.fn(async (codigo: string) => requisicoes.find((r) => r.cod_requisicao === codigo)!),
  } satisfies IAplisService
  // Como a AOL real: a listagem devolve as O.S. do dia >= dataInicial e
  // < dataFinal (o fim é exclusivo — medido em 25/11/2026).
  const aol = {
    listOrders: vi.fn(async (ini: string, fim: string) =>
      (cenario.ordens ?? [])
        .filter((o) => o.dia >= ini && o.dia < fim)
        .map(({ orderId, idOsLis }) => ({ orderId, idOsLis })),
    ),
    fetchExam: vi.fn(async (codigoOs: string) => [exameDaOs(codigoOs)]),
  } satisfies IAolService

  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const servico = new LaudoService(repo, aplis, aol, null)
  const buscar = () => servico.fetchAndCacheExams(PACIENTE, CPF, false, log as unknown as FastifyBaseLogger)

  return { repo, aplis, aol, log, buscar }
}

const inicioDaListagemDoApLIS = (aplis: { requisicaoListar: ReturnType<typeof vi.fn> }): string =>
  aplis.requisicaoListar.mock.calls[0]![1] as string

// ---------------------------------------------------------------------------

describe('busca histórica no primeiro acesso', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(HOJE))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('primeiro acesso: o ApLIS é varrido com a janela longa (5 anos)', async () => {
    const { aplis, buscar } = montar()

    await buscar()

    expect(inicioDaListagemDoApLIS(aplis)).toBe('2021-11-26')
  })

  it('busca histórica já concluída: volta a janela normal de 90 dias', async () => {
    const { repo, aplis, buscar } = montar()
    repo.historicoBuscado = true

    await buscar()

    expect(inicioDaListagemDoApLIS(aplis)).toBe('2026-08-27')
  })

  it('requisição mais antiga que a janela normal: a O.S. dela na AOL chega à tela', async () => {
    // O caso que motivou a busca histórica: pedido de 23/06, conta criada em
    // novembro. A AOL lista a O.S. no dia seguinte ao pedido.
    const { aol, buscar } = montar({
      requisicoes: [requisicao('0040000000005', '23/06/2026 08:28')],
      ordens: [{ orderId: '383000001', idOsLis: '0040000000005', dia: '2026-06-24' }],
    })

    const { exams } = await buscar()

    expect(exams.map((e) => e.codigo_os)).toEqual(['383000001'])
    // A AOL NÃO é varrida com a janela longa — só a normal e a curta em torno
    // do pedido antigo.
    expect(aol.listOrders.mock.calls.map(([ini, fim]) => [ini, fim])).toEqual([
      ['2026-08-27', '2026-11-25'],
      ['2026-06-21', '2026-07-23'],
    ])
  })

  it('pedidos antigos próximos dividem a mesma janela da AOL; o distante ganha a sua', async () => {
    const { aol, buscar } = montar({
      requisicoes: [
        requisicao('0040000000005', '23/06/2026 08:28'),
        requisicao('0040000000004', '22/06/2026 08:33'),
        requisicao('0040000000001', '10/03/2025 09:00'),
        // Recente: já coberto pela listagem normal, não gera janela.
        requisicao('0040000000009', '20/11/2026 08:00'),
      ],
    })

    await buscar()

    expect(aol.listOrders.mock.calls.map(([ini, fim]) => [ini, fim])).toEqual([
      ['2026-08-27', '2026-11-25'],
      ['2025-03-08', '2025-04-09'],
      ['2026-06-20', '2026-07-23'],
    ])
  })

  describe('a marca de concluída', () => {
    it('busca histórica sem falha: é gravada', async () => {
      const { repo, buscar } = montar({
        requisicoes: [requisicao('0040000000005', '23/06/2026 08:28')],
      })

      await buscar()
      expect(repo.marcarHistorico).toHaveBeenCalledTimes(1)
    })

    it('ApLIS fora do ar: não é gravada — a próxima busca tenta a histórica de novo', async () => {
      const { repo, aplis, buscar } = montar()
      aplis.requisicaoListar.mockRejectedValue(new IntegrationError('ApLIS fora do ar', 'aplis'))

      await buscar().catch(() => {})

      expect(repo.marcarHistorico).not.toHaveBeenCalled()
    })

    it('AOL falha só na janela histórica: não é gravada, mas a O.S. recente aparece', async () => {
      const { repo, aol, buscar } = montar({
        requisicoes: [
          requisicao('0040000000005', '23/06/2026 08:28'),
          requisicao('0040000000009', '20/11/2026 08:00'),
        ],
        ordens: [{ orderId: '390000009', idOsLis: '0040000000009', dia: '2026-11-21' }],
      })
      aol.listOrders.mockImplementation(async (ini: string) => {
        if (ini < '2026-08-27') throw new IntegrationError('AOL fora do ar', 'aol')
        return [{ orderId: '390000009', idOsLis: '0040000000009' }]
      })

      const { exams } = await buscar()

      expect(exams.map((e) => e.codigo_os)).toEqual(['390000009'])
      expect(repo.marcarHistorico).not.toHaveBeenCalled()
    })

    it('AOL fora do ar já na janela normal: não é gravada', async () => {
      const { repo, aol, buscar } = montar({
        requisicoes: [requisicao('0040000000005', '23/06/2026 08:28')],
      })
      aol.listOrders.mockRejectedValue(new IntegrationError('AOL fora do ar', 'aol'))

      await buscar().catch(() => {})

      expect(repo.marcarHistorico).not.toHaveBeenCalled()
    })

    it('requisição sem data legível: não é gravada — não houve onde procurar a O.S. dela', async () => {
      const { repo, buscar } = montar({
        requisicoes: [{ ...requisicao('0040000000005', ''), data_solicitacao: null }],
      })

      await buscar()

      expect(repo.marcarHistorico).not.toHaveBeenCalled()
    })

    it('marca ilegível: faz a busca histórica (errar para o lado de buscar)', async () => {
      const { repo, aplis, buscar } = montar()
      repo.historicoJaBuscado = async () => {
        throw new Error('banco fora')
      }

      await buscar()

      expect(inicioDaListagemDoApLIS(aplis)).toBe('2021-11-26')
    })
  })

  it('com cache fresco mas busca histórica por concluir: revalida com a janela longa', async () => {
    // O primeiro acesso em que a AOL falhou deixa cache (a capa do ApLIS).
    // Esperar o TTL esconderia o exame antigo por um dia.
    const { repo, aplis, buscar } = montar()
    await repo.insertAwaiting(PACIENTE, CPF, '0040000000005', null)
    await repo.saveResult(repo.linhas[0]!.id, [{ id: 'l', source: 'aplis' } as Laudo])

    const { source } = await buscar()

    expect(source).toBe('cached')
    await vi.waitFor(() => expect(aplis.requisicaoListar).toHaveBeenCalled())
    expect(inicioDaListagemDoApLIS(aplis)).toBe('2021-11-26')
  })

  it('com cache fresco e busca histórica concluída: não toca nos LIS', async () => {
    const { repo, aplis, buscar } = montar()
    repo.historicoBuscado = true
    await repo.insertAwaiting(PACIENTE, CPF, '0040000000005', null)
    await repo.saveResult(repo.linhas[0]!.id, [{ id: 'l', source: 'aplis' } as Laudo])

    await buscar()
    await new Promise((r) => setTimeout(r, 0))

    expect(aplis.requisicaoListar).not.toHaveBeenCalled()
  })
})
