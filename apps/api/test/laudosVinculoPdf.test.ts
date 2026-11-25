import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'
import type { IAolService, AolOrderRef } from '../src/laudos/aol.js'
import type { IAplisService } from '../src/laudos/aplis.js'
import { IntegrationError } from '../src/laudos/errors.js'
import type { VinculoLaudoExterno } from '../src/laudos/laudoExterno.js'
import type { IExamResultRepository } from '../src/laudos/repository.js'
import { LaudoService } from '../src/laudos/service.js'
import type { AolExam, AplisRequisicao, ExamResultRow, Laudo } from '../src/laudos/types.js'
import { LaudosExternosDoSite, type ILaudosExternos } from '../src/laudos/vinculoPdf.js'

// Vínculo requisição ↔ O.S. pelo PDF "Laudo EXTERNO", exercitado pela busca ao
// vivo do LaudoService com as quatro dependências trocadas por dublês em
// memória. Códigos, O.S. e CPFs são inventados.
//
// A regra que atravessa todos os testes: o paciente vê TODOS os seus exames.
// Uma O.S. do paciente que o PDF revela nunca fica só no log.

const PACIENTE = 'pac-1'
const CPF = '52998224725'
const OUTRO_CPF = '11144477735'
const REQ_A = '0040000000001'
const REQ_B = '0040000000002'
const NOME = 'Paciente Exemplo'
const NASCIMENTO = '1990-01-01'

// ---------------------------------------------------------------------------
// Dublês
// ---------------------------------------------------------------------------

class RepositorioEmMemoria implements IExamResultRepository {
  linhas: ExamResultRow[] = []
  #serial = 0

  semente(codigoLis: string | null, codigoOs: string | null, pedido: string | null = null): ExamResultRow {
    const linha: ExamResultRow = {
      id: `linha-${++this.#serial}`,
      paciente_id: PACIENTE,
      cpf: CPF,
      codigo_lis: codigoLis,
      codigo_os: codigoOs,
      codigo_lis_pedido: pedido,
      result: null,
      cached_at: null,
    }
    this.linhas.push(linha)
    return linha
  }

  /** As O.S. gravadas, por requisição (`avulsa` = linha sem requisição). */
  vinculos(): Record<string, string | null> {
    return Object.fromEntries(this.linhas.map((l) => [l.codigo_lis ?? `avulsa:${l.codigo_os}`, l.codigo_os]))
  }

  /** O elo para o pedido de origem, por O.S. (só as linhas que o têm). */
  elos(): Record<string, string> {
    return Object.fromEntries(
      this.linhas.filter((l) => l.codigo_lis_pedido).map((l) => [l.codigo_os, l.codigo_lis_pedido!]),
    )
  }

  // Como o repositório real: o elo e o `cached_at` são colunas da linha,
  // entregues junto de cada laudo dela.
  async findByPaciente(): Promise<Laudo[]> {
    return this.linhas.flatMap((l) =>
      (l.result ?? []).map((laudo) => ({
        ...laudo,
        ...(l.cached_at ? { cached_at: l.cached_at } : {}),
        ...(l.codigo_lis_pedido ? { codigo_lis_pedido: l.codigo_lis_pedido } : {}),
      })),
    )
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
    this.semente(codigoLis, codigoOs, pedido)
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

function requisicao(codigo: string, over: Partial<AplisRequisicao> = {}): AplisRequisicao {
  return {
    cod_requisicao: codigo,
    id_requisicao: `id-${codigo}`,
    data_solicitacao: '2026-11-01',
    data_liberacao: '2026-11-03',
    tipo_exame: 'MEDICINA LABORATORIAL',
    paciente: { nome: NOME, cpf: CPF, data_nascimento: '01/01/1990', sexo: null },
    procedimentos: [],
    local: { nome: 'Posto', endereco: null, numero: null },
    ...over,
  }
}

function exameDaOs(codigoOs: string, cpf: string | null = CPF): AolExam {
  return {
    codigo_os: codigoOs,
    // Coleta diferente por O.S.: os cards não se fundem por data e cada O.S.
    // continua contável na resposta.
    data_solicitacao: `2026-10-${codigoOs.slice(-2)}`,
    data_liberacao: '2026-11-03',
    nome_exame: `EXAME ${codigoOs}`,
    codigo_tipo: null,
    status: 'liberado',
    material: 'soro',
    metodo: null,
    doctor: null,
    crm_documento: null,
    paciente_cpf: cpf,
    analitos: [{ nome: 'GLICOSE', valor: '90', unidade: 'mg/dL', referencia: '70 a 99' }],
  }
}

/**
 * Um PDF no layout atual; todas as O.S. com o mesmo CPF, salvo `cpfPorOs`.
 *
 * Só a O.S. com o CPF do paciente traz o nome e o nascimento dele: a de outro
 * CPF e a sem CPF vêm sem a segunda prova, a menos que o teste a dê em
 * `pessoaPorOs` — é assim que cada teste escolhe qual prova está em jogo.
 */
const pdf = (
  os: string[],
  cpf: string | null = CPF,
  cpfPorOs: Record<string, string | null> = {},
  pessoaPorOs: Record<string, { nome: string | null; nascimento: string | null }> = {},
): VinculoLaudoExterno => ({
  os: os.map((numero) => {
    const cpfDaOs = numero in cpfPorOs ? cpfPorOs[numero]! : cpf
    const pessoa =
      pessoaPorOs[numero] ?? (cpfDaOs === CPF ? { nome: NOME, nascimento: NASCIMENTO } : { nome: null, nascimento: null })
    return { numero, cpf: cpfDaOs, ...pessoa, paginas: 1 }
  }),
  layout: 'atual',
})

/** O mesmo paciente, como o laudo o imprime. */
const MESMA_PESSOA = { nome: 'PACIENTE EXEMPLO', nascimento: NASCIMENTO }

interface Cenario {
  requisicoes?: AplisRequisicao[]
  /** PDFs por requisição; uma função simula falha ou demora do site. */
  pdfs?: Record<string, VinculoLaudoExterno[] | (() => Promise<VinculoLaudoExterno[]>)>
  ordens?: AolOrderRef[]
  /** `false` monta o serviço sem a fonte de PDFs (credenciais do site ausentes). */
  comFonte?: boolean
}

function montar(cenario: Cenario = {}) {
  const repo = new RepositorioEmMemoria()
  const requisicoes = cenario.requisicoes ?? [requisicao(REQ_A)]

  const aplis = {
    requisicaoListar: vi.fn(async () => requisicoes),
    requisicaoResultado: vi.fn(
      async (codigo: string) => requisicoes.find((r) => r.cod_requisicao === codigo) ?? requisicao(codigo),
    ),
  } satisfies IAplisService
  const aol = {
    listOrders: vi.fn(async () => cenario.ordens ?? []),
    fetchExam: vi.fn(async (codigoOs: string) => [exameDaOs(codigoOs)]),
  } satisfies IAolService
  const externos = {
    lerDaRequisicao: vi.fn(async (_id: string, codigo: string) => {
      const doCenario = cenario.pdfs?.[codigo] ?? []
      return typeof doCenario === 'function' ? doCenario() : doCenario
    }),
  } satisfies ILaudosExternos

  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const servico = new LaudoService(repo, aplis, aol, cenario.comFonte === false ? null : externos)
  const buscar = () => servico.fetchAndCacheExams(PACIENTE, CPF, true, log as unknown as FastifyBaseLogger)

  return { repo, aplis, aol, externos, log, buscar, servico }
}

/**
 * As O.S. que chegam à tela do paciente, em ordem estável — estejam em card
 * próprio ou fundidas no card do pedido (que as lista separadas por vírgula).
 */
const osNaTela = (exams: Laudo[]): string[] => exams.flatMap((e) => (e.codigo_os ?? '').split(',')).sort()

/** O log estruturado do passo do PDF. */
function resumoDoPdf(log: { info: ReturnType<typeof vi.fn> }): Record<string, unknown> {
  const chamada = log.info.mock.calls.find((c) => /Laudo EXTERNO/.test(String(c[1])))
  return (chamada?.[0] ?? {}) as Record<string, unknown>
}

// ---------------------------------------------------------------------------

describe('vínculo da O.S. pelo PDF "Laudo EXTERNO"', () => {
  beforeEach(() => {
    vi.stubEnv('LAUDOS_OS_VIA_PDF', 'true')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('flag e configuração', () => {
    it('flag desligada (padrão): o site não é chamado e a requisição fica sem O.S.', async () => {
      vi.stubEnv('LAUDOS_OS_VIA_PDF', '')
      const { repo, externos, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111111'])] } })

      await buscar()

      expect(externos.lerDaRequisicao).not.toHaveBeenCalled()
      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
    })

    it('flag desligada: a varredura por idOsLis continua exatamente como era', async () => {
      // Sem a flag, a segunda O.S. que aponta uma requisição já ocupada segue
      // ignorada — o comportamento novo é só do caminho novo.
      vi.stubEnv('LAUDOS_OS_VIA_PDF', 'false')
      const { repo, buscar } = montar({
        ordens: [
          { orderId: '111111101', idOsLis: REQ_A },
          { orderId: '444444404', idOsLis: REQ_A },
        ],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
    })

    it('flag ligada sem credenciais do site: o caminho fica inerte', async () => {
      const { repo, buscar } = montar({ comFonte: false, pdfs: { [REQ_A]: [pdf(['111111111'])] } })

      await expect(buscar()).resolves.toBeDefined()
      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
    })
  })

  describe('uma O.S. na requisição', () => {
    it('grava a O.S. na linha da requisição e o laudo sai com os valores do Álvaro', async () => {
      const { repo, aol, externos, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111111'])] } })

      const { exams } = await buscar()

      expect(externos.lerDaRequisicao).toHaveBeenCalledWith(`id-${REQ_A}`, REQ_A)
      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111111' })
      expect(aol.fetchExam).toHaveBeenCalledWith('111111111')
      expect(exams).toHaveLength(1)
      expect(exams[0]).toMatchObject({ codigo_os: '111111111', codigo_lis: REQ_A })
    })

    it('a mesma O.S. em vários PDFs da requisição conta uma vez', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111111']), pdf(['111111111'])] } })

      await buscar()

      expect(repo.linhas).toHaveLength(1)
      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111111' })
    })

    it('requisição sem o id interno do apLIS é pulada, sem chamar o site', async () => {
      const { externos, buscar } = montar({ requisicoes: [requisicao(REQ_A, { id_requisicao: null })] })

      await buscar()

      expect(externos.lerDaRequisicao).not.toHaveBeenCalled()
    })
  })

  describe('várias O.S. na requisição: nenhum exame fica de fora', () => {
    it('a principal do PDF vai para a linha da requisição e as demais ganham linha própria', async () => {
      // A extração já entrega a principal primeiro (a que ocupa mais páginas).
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202', '111111101'])] } })

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({
        [REQ_A]: '333333303',
        'avulsa:222222202': '222222202',
        'avulsa:111111101': '111111101',
      })
      // O que importa para o paciente: as três O.S. chegam à tela.
      expect(osNaTela(exams)).toEqual(['111111101', '222222202', '333333303'])
    })

    it('O.S. em PDFs diferentes da mesma requisição: a do primeiro anexo é a da linha', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111101']), pdf(['222222202'])] } })

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', 'avulsa:222222202': '222222202' })
      expect(osNaTela(exams)).toEqual(['111111101', '222222202'])
    })

    it('requisição que já tem O.S. nunca é sobrescrita, mas recebe as outras O.S. do PDF', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] } })
      repo.semente(REQ_A, '111111101') // vinculada antes, pelo idOsLis

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', 'avulsa:333333303': '333333303' })
      expect(osNaTela(exams)).toEqual(['111111101', '333333303'])
    })

    it('O.S. que o paciente já tem como linha avulsa não é duplicada', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] } })
      repo.semente(null, '111111101') // achada antes pelo idOsLis = CPF

      await buscar()

      expect(repo.linhas.filter((l) => l.codigo_os === '111111101')).toHaveLength(1)
      expect(repo.vinculos()).toMatchObject({ [REQ_A]: '333333303' })
    })

    it('repetir a busca não duplica linhas', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['333333303', '222222202'])] },
        ordens: [{ orderId: '444444404', idOsLis: REQ_A }],
      })

      await buscar()
      const depoisDaPrimeira = repo.vinculos()
      await buscar()

      expect(repo.linhas).toHaveLength(3)
      expect(repo.vinculos()).toEqual(depoisDaPrimeira)
    })

    it('duas buscas simultâneas do mesmo paciente não gravam a mesma O.S. duas vezes', async () => {
      // Toda leitura com cache vencido dispara uma revalidação; duas juntas
      // passariam as duas pelo "já existe?" antes de qualquer uma gravar.
      const { repo, externos, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202'])] } })

      await Promise.all([buscar(), buscar()])

      expect(repo.linhas.map((l) => l.codigo_os).sort()).toEqual(['222222202', '333333303'])
      expect(externos.lerDaRequisicao).toHaveBeenCalledTimes(1)
    })

    it('O.S. que já é de outra requisição do paciente não é copiada para esta', async () => {
      // O caso "divergente" da auditoria: o PDF está na requisição A e o
      // idOsLis já ligou a mesma O.S. à requisição B. Nada é sobrescrito.
      const { repo, log, buscar } = montar({
        requisicoes: [requisicao(REQ_A), requisicao(REQ_B)],
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
      expect(resumoDoPdf(log)).toMatchObject({ divergentes: 1 })
    })

    it('O.S. que o idOsLis aponta para requisição já vinculada pelo PDF também entra', async () => {
      // "Só no idOsLis" da auditoria: o PDF não traz essa O.S., e a linha da
      // requisição já foi ocupada pela O.S. do PDF. Ela não pode sumir.
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '444444404', idOsLis: REQ_A }],
      })

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', 'avulsa:444444404': '444444404' })
      expect(osNaTela(exams)).toEqual(['111111101', '444444404'])
    })
  })

  describe('elo para o pedido de origem: várias O.S., um card só', () => {
    /** O card de um pedido na resposta. */
    const cardDe = (exams: Laudo[], codigoLis: string): Laudo | undefined =>
      exams.find((e) => e.codigo_lis === codigoLis)

    it('duas O.S. com coletas em datas diferentes saem fundidas no card do pedido', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303']), pdf(['222222202'])] } })

      const { exams } = await buscar()

      expect(repo.elos()).toEqual({ '222222202': REQ_A })
      expect(exams).toHaveLength(1)
      expect(osNaTela([cardDe(exams, REQ_A)!])).toEqual(['222222202', '333333303'])
      expect(exams[0]!.groups?.map((g) => g.name)).toEqual(['EXAME 222222202', 'EXAME 333333303'])
    })

    it('três O.S. vindas de um PDF só funcionam como duas', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202', '111111101'])] } })

      const { exams } = await buscar()

      expect(repo.elos()).toEqual({ '222222202': REQ_A, '111111101': REQ_A })
      expect(exams).toHaveLength(1)
      expect(osNaTela(exams)).toEqual(['111111101', '222222202', '333333303'])
    })

    it('requisição já vinculada pelo idOsLis recebe as O.S. restantes do PDF, com o elo', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] } })
      repo.semente(REQ_A, '111111101')

      const { exams } = await buscar()

      expect(repo.elos()).toEqual({ '333333303': REQ_A })
      expect(exams).toHaveLength(1)
      expect(osNaTela(exams)).toEqual(['111111101', '333333303'])
    })

    it('O.S. que já existe como linha avulsa (achada pelo CPF) ganha o elo, sem duplicar', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: CPF }],
      })
      repo.semente(null, '111111101')

      const { exams } = await buscar()

      expect(repo.linhas.filter((l) => l.codigo_os === '111111101')).toHaveLength(1)
      expect(repo.elos()).toEqual({ '111111101': REQ_A })
      expect(exams).toHaveLength(1)
    })

    it('linha própria gravada antes de existir o elo ganha-o na busca seguinte', async () => {
      // O estado que o ticket 02 deixou no banco: principal na requisição,
      // extra em linha própria, sem elo. Nenhuma migração manual.
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202'])] } })
      repo.semente(REQ_A, '333333303')
      repo.semente(null, '222222202')

      const { exams } = await buscar()

      expect(repo.linhas).toHaveLength(2)
      expect(repo.elos()).toEqual({ '222222202': REQ_A })
      expect(exams).toHaveLength(1)
    })

    it('a única O.S. do pedido, achada antes pelo CPF: o card do pedido sai com os exames dela', async () => {
      // A linha da requisição fica sem O.S. (nada é movido de linha); é o elo
      // que leva os valores ao card do pedido.
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111101'])] } })
      repo.semente(null, '111111101')

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ 'avulsa:111111101': '111111101', [REQ_A]: null })
      expect(exams).toHaveLength(1)
      expect(exams[0]).toMatchObject({ codigo_lis: REQ_A, codigo_os: '111111101', source: 'merged' })
    })

    it('O.S. sem elo continua fundida pela data de coleta', async () => {
      // idOsLis = CPF e nenhum PDF que a situe: vale a regra antiga.
      const { repo, buscar } = montar({
        requisicoes: [requisicao(REQ_A, { data_solicitacao: '2026-10-07' })],
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '555555507', idOsLis: CPF }], // coleta em 2026-10-07
      })

      const { exams } = await buscar()

      expect(repo.elos()).toEqual({})
      expect(exams).toHaveLength(1)
      expect(osNaTela(exams)).toEqual(['111111101', '555555507'])
    })

    it('O.S. que o idOsLis aponta para requisição já ocupada entra com o elo', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '444444404', idOsLis: REQ_A }],
      })

      const { exams } = await buscar()

      expect(repo.elos()).toEqual({ '444444404': REQ_A })
      expect(exams).toHaveLength(1)
    })

    it('cada pedido funde só as suas O.S.', async () => {
      const { buscar } = montar({
        requisicoes: [requisicao(REQ_A), requisicao(REQ_B)],
        pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])], [REQ_B]: [pdf(['444444404', '222222202'])] },
      })

      const { exams } = await buscar()

      expect(exams).toHaveLength(2)
      expect(osNaTela([cardDe(exams, REQ_A)!])).toEqual(['111111101', '333333303'])
      expect(osNaTela([cardDe(exams, REQ_B)!])).toEqual(['222222202', '444444404'])
    })

    it('O.S. reprovada pelo CPF do laudo não ganha elo nem derruba as outras do pedido', async () => {
      const { repo, buscar } = montar({
        pdfs: {
          [REQ_A]: [pdf(['333333303', '222222202', '111111101'], CPF, { '222222202': OUTRO_CPF })],
        },
      })

      const { exams } = await buscar()

      expect(repo.elos()).toEqual({ '111111101': REQ_A })
      expect(exams).toHaveLength(1)
      expect(osNaTela(exams)).toEqual(['111111101', '333333303'])
    })

    it('O.S. com elo bloqueada pela barreira do Álvaro fica fora; as outras do pedido saem', async () => {
      const { aol, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202', '111111101'])] } })
      aol.fetchExam.mockImplementation(async (os: string) => [
        exameDaOs(os, os === '222222202' ? OUTRO_CPF : CPF),
      ])

      const { exams } = await buscar()

      expect(exams).toHaveLength(1)
      expect(osNaTela(exams)).toEqual(['111111101', '333333303'])
    })

    it('a O.S. principal bloqueada pela barreira do Álvaro não leva junto as demais', async () => {
      const { aol, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] } })
      aol.fetchExam.mockImplementation(async (os: string) => [
        exameDaOs(os, os === '333333303' ? OUTRO_CPF : CPF),
      ])

      const { exams } = await buscar()

      expect(osNaTela(exams)).toEqual(['111111101'])
    })

    it('elo já gravado para outra requisição não é sobrescrito: fica o registro da divergência', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: [requisicao(REQ_A), requisicao(REQ_B)],
        pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] },
      })
      repo.semente(null, '111111101', REQ_B)

      await buscar()

      expect(repo.elos()).toEqual({ '111111101': REQ_B })
      expect(resumoDoPdf(log)).toMatchObject({ divergentes: 1 })
    })

    it('repetir a busca não regrava o elo', async () => {
      const { repo, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202'])] } })
      repo.semente(REQ_A, '333333303')
      repo.semente(null, '222222202')
      const gravar = vi.spyOn(repo, 'setPedidoDeOrigem')

      await buscar()
      await buscar()

      expect(gravar).toHaveBeenCalledTimes(1)
    })

    it('a cache normal e a consulta administrativa servem o mesmo card fundido', async () => {
      const { servico, aol, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202'])] } })
      await buscar()
      aol.listOrders.mockClear()

      const daCache = await servico.fetchAndCacheExams(PACIENTE, CPF)
      const doAdmin = await servico.readCachedExams(PACIENTE, CPF)

      expect(daCache.source).toBe('cached')
      expect(aol.listOrders).not.toHaveBeenCalled()
      for (const exams of [daCache.exams, doAdmin]) {
        expect(exams).toHaveLength(1)
        expect(osNaTela(exams)).toEqual(['222222202', '333333303'])
      }
    })

    it('o log da busca conta os elos gravados', async () => {
      const { repo, log, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['333333303', '222222202', '111111101'])] } })
      repo.semente(null, '111111101')

      await buscar()

      expect(resumoDoPdf(log)).toMatchObject({ extrasPeloPdf: 1, elosGravados: 2 })
    })
  })

  describe('divergência entre o PDF e o idOsLis: vence o PDF', () => {
    const REQ_C = '0040000000003'
    const duas = [requisicao(REQ_A), requisicao(REQ_B)]
    /** O log de cada correção de vínculo. */
    const correcoes = (log: { warn: ReturnType<typeof vi.fn> }): unknown[] =>
      log.warn.mock.calls.filter((c) => /Vínculo da O\.S\. corrigido/.test(String(c[1]))).map((c) => c[0])

    it('vínculo gravado antes pelo idOsLis é corrigido: a O.S. vai para a requisição do laudo', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', [REQ_B]: null })
      expect(osNaTela(exams).filter(Boolean)).toEqual(['111111101'])
      expect(exams.find((e) => e.codigo_os === '111111101')?.codigo_lis).toBe(REQ_A)
      expect(correcoes(log)).toEqual([
        {
          pacienteId: PACIENTE,
          codigoOs: '111111101',
          requisicaoOrigem: REQ_B,
          requisicaoDestino: REQ_A,
          fontesDivergem: true,
          fonteQueVenceu: 'pdf',
        },
      ])
      expect(resumoDoPdf(log)).toMatchObject({ vinculosCorrigidos: 1 })
    })

    it('o outro sentido: vínculo gravado pelo PDF não é desfeito pelo idOsLis', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_A, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', [REQ_B]: null })
      expect(correcoes(log)).toEqual([])
    })

    it('O.S. nova com as fontes divergindo: entra uma vez só, na requisição do laudo', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', [REQ_B]: null })
      expect(correcoes(log)).toEqual([])
    })

    it('o laudo em cache da requisição que perde a O.S. sai junto', async () => {
      const { repo, buscar, servico } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')
      await buscar()

      const emCache = await servico.readCachedExams(PACIENTE, CPF)

      expect(osNaTela(emCache).filter(Boolean)).toEqual(['111111101'])
      expect(repo.linhas.find((l) => l.codigo_lis === REQ_B)?.result?.some((l) => l.codigo_os)).toBeFalsy()
    })

    it('a requisição do laudo já tem outra O.S.: a corrigida entra em linha própria, com o elo', async () => {
      const { repo, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_A, '333333303')
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '333333303', [REQ_B]: null, 'avulsa:111111101': '111111101' })
      expect(repo.elos()).toEqual({ '111111101': REQ_A })
    })

    it('O.S. em linha própria com o elo para a requisição do idOsLis: o elo é corrigido', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_A, '333333303')
      repo.semente(null, '111111101', REQ_B)

      await buscar()

      expect(repo.elos()).toEqual({ '111111101': REQ_A })
      expect(correcoes(log)).toHaveLength(1)
    })

    it('repetir a busca depois da correção não corrige de novo', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()
      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', [REQ_B]: null })
      expect(correcoes(log)).toHaveLength(1)
    })

    it('as fontes passaram a concordar e o gravado é outro: corrige também', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_A }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', [REQ_B]: null })
      expect(correcoes(log)).toMatchObject([{ fontesDivergem: false }])
    })

    it('CPF divergente no laudo: a regra não move a O.S. para a requisição desse laudo', async () => {
      // O laudo anexado em A atribui a O.S. a outra pessoa: para a regra, o PDF
      // não afirma nada. A conferência de identidade decide antes.
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'], OUTRO_CPF)] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
      expect(correcoes(log)).toEqual([])
    })

    it('idOsLis com requisição que não é do paciente: a O.S. fica na requisição do laudo, sem correção', async () => {
      const { repo, log, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: '0200000000009' }],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
      expect(correcoes(log)).toEqual([])
    })

    it('o mesmo laudo anexado em duas requisições e o idOsLis numa delas: é essa', async () => {
      const { repo, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])], [REQ_B]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
    })

    it('laudo anexado em duas requisições e o idOsLis numa terceira: nada é movido, fica o registro', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: [...duas, requisicao(REQ_C)],
        pdfs: { [REQ_A]: [pdf(['111111101'])], [REQ_C]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null, [REQ_C]: null })
      expect(correcoes(log)).toEqual([])
      expect(resumoDoPdf(log)).toMatchObject({ divergentes: 2 })
    })

    it('laudo de uma requisição não pôde ser lido: nada é corrigido nesta busca', async () => {
      // O laudo está anexado em A e em B e o idOsLis diz B. Se a leitura de B
      // falha, o PDF parece apontar só A — corrigir aqui moveria a O.S. para A
      // e a busca seguinte a traria de volta.
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: {
          [REQ_A]: [pdf(['111111101'])],
          [REQ_B]: async () => {
            throw new IntegrationError('site fora do ar', 'aplis')
          },
        },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
      expect(correcoes(log)).toEqual([])
    })

    it('O.S. recusada pela identidade no laudo de outra requisição: nada é corrigido', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])], [REQ_B]: [pdf(['111111101'], null)] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
      expect(correcoes(log)).toEqual([])
    })

    it('a correção é logada mesmo se a regravação da O.S. falhar depois de desvinculá-la', async () => {
      const { repo, log, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')
      vi.spyOn(repo, 'setCodigoOs').mockRejectedValueOnce(new Error('banco fora do ar'))

      await buscar()

      expect(correcoes(log)).toMatchObject([{ requisicaoOrigem: REQ_B, requisicaoDestino: REQ_A }])
    })

    it('listagem do Álvaro fora do ar: sem a segunda fonte, nada é corrigido', async () => {
      const { repo, aol, log, buscar } = montar({ requisicoes: duas, pdfs: { [REQ_A]: [pdf(['111111101'])] } })
      aol.listOrders.mockRejectedValue(new IntegrationError('AOL fora do ar', 'aol'))
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
      expect(correcoes(log)).toEqual([])
    })

    it('flag desligada: o vínculo do idOsLis fica como está', async () => {
      vi.stubEnv('LAUDOS_OS_VIA_PDF', 'false')
      const { repo, externos, buscar } = montar({
        requisicoes: duas,
        pdfs: { [REQ_A]: [pdf(['111111101'])] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_B }],
      })
      repo.semente(REQ_B, '111111101')

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_B]: '111111101', [REQ_A]: null })
      expect(externos.lerDaRequisicao).not.toHaveBeenCalled()
    })
  })

  describe('barreira de identidade sobre o PDF', () => {
    it('PDF com O.S. de pessoas diferentes: só as do paciente entram, e a principal é a maior DELE', async () => {
      // O caso real: a maior O.S. do arquivo (a primeira da lista) é de outro CPF.
      const { repo, aol, log, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909', '222222202', '111111101'], CPF, { '999999909': OUTRO_CPF })] },
      })

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '222222202', 'avulsa:111111101': '111111101' })
      expect(osNaTela(exams)).toEqual(['111111101', '222222202'])
      // A O.S. alheia nem chega a ser consultada no Álvaro.
      expect(aol.fetchExam).not.toHaveBeenCalledWith('999999909')
      expect(resumoDoPdf(log)).toMatchObject({ cpfDivergente: 1, vinculadasPeloPdf: 1, extrasPeloPdf: 1 })
    })

    it('CPF divergente descarta a O.S. e loga erro com requisição e O.S., sem CPF', async () => {
      const { repo, log, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111101'], OUTRO_CPF)] } })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
      const erro = log.error.mock.calls.find((c) => /Laudo EXTERNO/.test(String(c[1])))
      expect(erro?.[0]).toMatchObject({ codigoLis: REQ_A, codigoOs: '111111101' })
      expect(JSON.stringify(log.error.mock.calls)).not.toContain(OUTRO_CPF)
      expect(JSON.stringify(log.error.mock.calls)).not.toContain(CPF)
    })

    it('O.S. sem CPF legível também é descartada (falha fechada)', async () => {
      const { repo, log, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111101'], null)] } })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
      expect(resumoDoPdf(log)).toMatchObject({ cpfIndisponivel: 1 })
    })

    it('o descarte de um anexo não atinge o outro anexo da mesma requisição', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909'], OUTRO_CPF), pdf(['111111101'])] },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
    })

    it('O.S. que confere num anexo e diverge em outro da mesma requisição é descartada', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101', '222222202']), pdf(['111111101'], OUTRO_CPF)] },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '222222202' })
    })

    it('nenhum log do passo carrega CPF nem nome do paciente', async () => {
      const { log, buscar } = montar({
        pdfs: {
          [REQ_A]: [
            pdf(
              ['111111101', '222222202', '333333303', '444444404'],
              CPF,
              { '222222202': OUTRO_CPF, '333333303': null, '444444404': OUTRO_CPF },
              { '444444404': MESMA_PESSOA, '333333303': { nome: 'Outra Pessoa Qualquer', nascimento: NASCIMENTO } },
            ),
          ],
        },
      })

      await buscar()

      const tudo = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
      expect(tudo).not.toContain(CPF)
      expect(tudo).not.toContain(OUTRO_CPF)
      expect(tudo.toUpperCase()).not.toContain('PACIENTE EXEMPLO')
      expect(tudo.toUpperCase()).not.toContain('OUTRA PESSOA')
      expect(tudo).not.toContain('1990')
    })

    it('o PDF nunca remove o que o idOsLis já mostra: O.S. recusada no laudo ainda chega pela varredura', async () => {
      // Caso real: a O.S. saiu do laboratório de apoio com CPF e nascimento
      // errados, mas é do paciente — e o idOsLis a aponta para a requisição.
      const { repo, aol, log, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909', '111111101'], CPF, { '999999909': OUTRO_CPF })] },
        ordens: [{ orderId: '999999909', idOsLis: REQ_A }],
      })
      aol.fetchExam.mockImplementation(async (os: string) => [exameDaOs(os, null)])

      const { exams } = await buscar()

      // Pelo PDF só entrou a que conferiu; a outra veio pelo idOsLis.
      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101', 'avulsa:999999909': '999999909' })
      expect(osNaTela(exams)).toEqual(['111111101', '999999909'])
      // Fica o rastro para a recepção corrigir o cadastro na origem.
      const aviso = log.warn.mock.calls.find((c) => /atribui a outro CPF/.test(String(c[1])))
      expect(aviso?.[0]).toMatchObject({ orderId: '999999909' })
    })

    it('idem quando a requisição ainda está sem O.S.: o idOsLis a preenche, como hoje', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909'], OUTRO_CPF)] },
        ordens: [{ orderId: '999999909', idOsLis: REQ_A }],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '999999909' })
    })

    it('a que chega pelo idOsLis continua sob a barreira do Álvaro: CPF de outro no payload bloqueia', async () => {
      const { aol, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909', '111111101'], CPF, { '999999909': OUTRO_CPF })] },
        ordens: [{ orderId: '999999909', idOsLis: REQ_A }],
      })
      aol.fetchExam.mockImplementation(async (os: string) => [exameDaOs(os, os === '999999909' ? OUTRO_CPF : CPF)])

      const { exams } = await buscar()

      expect(osNaTela(exams)).toEqual(['111111101'])
    })

    it('O.S. sem CPF no laudo continua podendo chegar pelo idOsLis, como antes', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'], null)] },
        ordens: [{ orderId: '111111101', idOsLis: REQ_A }],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
    })

    it('a barreira sobre o payload do Álvaro continua valendo para a O.S. vinda do PDF', async () => {
      const { aol, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111101'])] } })
      aol.fetchExam.mockImplementation(async (os: string) => [exameDaOs(os, OUTRO_CPF)])

      const { exams } = await buscar()

      // A O.S. foi vinculada, mas o Álvaro diz que é de outra pessoa: bloqueada.
      expect(exams.filter((e) => e.source !== 'aplis')).toEqual([])
    })
  })

  describe('segunda prova: nome + nascimento do laudo contra o cadastro da requisição', () => {
    it('O.S. sem CPF no laudo entra quando nome e nascimento conferem', async () => {
      const { repo, log, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'], null, {}, { '111111101': MESMA_PESSOA })] },
      })

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
      expect(osNaTela(exams)).toEqual(['111111101'])
      expect(resumoDoPdf(log)).toMatchObject({ aceitasPorNomeENascimento: 1, cpfIndisponivel: 0 })
    })

    it('O.S. com CPF divergente aparece se nome e nascimento conferem, e o caso é logado para correção', async () => {
      const { repo, log, buscar } = montar({
        pdfs: {
          [REQ_A]: [pdf(['999999909', '111111101'], CPF, { '999999909': OUTRO_CPF }, { '999999909': MESMA_PESSOA })],
        },
      })

      const { exams } = await buscar()

      // A maior do arquivo volta a ser a principal: ela é do paciente.
      expect(repo.vinculos()).toEqual({ [REQ_A]: '999999909', 'avulsa:111111101': '111111101' })
      expect(osNaTela(exams)).toEqual(['111111101', '999999909'])
      const aviso = log.warn.mock.calls.find((c) => /CPF diferente do cadastro/.test(String(c[1])))
      expect(aviso?.[0]).toMatchObject({ codigoLis: REQ_A, codigoOs: '999999909' })
      expect(resumoDoPdf(log)).toMatchObject({ aceitasPorNomeENascimento: 1, cpfDivergente: 0 })
    })

    it('CPF divergente com nome igual e nascimento DIFERENTE não entra pelo PDF', async () => {
      const { repo, buscar } = montar({
        pdfs: {
          [REQ_A]: [
            pdf(['999999909'], OUTRO_CPF, {}, { '999999909': { nome: 'PACIENTE EXEMPLO', nascimento: '1990-01-02' } }),
          ],
        },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
    })

    it('sem CPF e com outro nome no laudo: fora', async () => {
      const { repo, log, buscar } = montar({
        pdfs: {
          [REQ_A]: [pdf(['111111101'], null, {}, { '111111101': { nome: 'Outra Pessoa Qualquer', nascimento: NASCIMENTO } })],
        },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
      expect(resumoDoPdf(log)).toMatchObject({ cpfIndisponivel: 1, aceitasPorNomeENascimento: 0 })
    })

    it('a mesma O.S. em dois anexos: basta um deles trazer outra pessoa para a segunda prova cair', async () => {
      const { repo, buscar } = montar({
        pdfs: {
          [REQ_A]: [
            pdf(['111111101'], null, {}, { '111111101': MESMA_PESSOA }),
            pdf(['111111101'], null, {}, { '111111101': { nome: 'Outra Pessoa Qualquer', nascimento: NASCIMENTO } }),
          ],
        },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
    })

    it('o cadastro da requisição só serve de referência se o CPF dele for o do paciente', async () => {
      // Requisição listada para o paciente cujo detalhe vem com outro CPF: o
      // nome e o nascimento de lá não provam nada sobre o paciente do token.
      const { repo, aplis, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'], null, {}, { '111111101': MESMA_PESSOA })] },
      })
      aplis.requisicaoResultado.mockImplementation(async (codigo: string) =>
        requisicao(codigo, { paciente: { nome: NOME, cpf: OUTRO_CPF, data_nascimento: '01/01/1990', sexo: null } }),
      )

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
    })

    it('apLIS fora do ar na hora de buscar o cadastro: a O.S. fica de fora, sem derrubar a busca', async () => {
      const { repo, aplis, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['111111101'], null, {}, { '111111101': MESMA_PESSOA }), pdf(['222222202'])] },
      })
      aplis.requisicaoResultado.mockRejectedValue(new IntegrationError('ApLIS: HTTP 500', 'aplis'))

      await expect(buscar()).resolves.toBeDefined()
      expect(repo.vinculos()).toEqual({ [REQ_A]: '222222202' })
    })

    it('quando o CPF de todas as O.S. confere, o cadastro nem é consultado para o vínculo', async () => {
      const { aplis, aol, buscar } = montar({ pdfs: { [REQ_A]: [pdf(['111111101'])] } })
      // Sem OS no Álvaro para mapear, a FASE 3 também não consulta o detalhe.
      aol.fetchExam.mockResolvedValue([])
      aplis.requisicaoResultado.mockClear()

      await buscar()

      // A única consulta é a da FASE 3 (capa do apLIS), uma por requisição.
      expect(aplis.requisicaoResultado).toHaveBeenCalledTimes(1)
    })
  })

  describe('falhas do site e da extração', () => {
    it('site fora do ar não interrompe a busca: a varredura por idOsLis vincula', async () => {
      const { repo, log, buscar } = montar({
        pdfs: {
          [REQ_A]: async () => {
            throw new IntegrationError('apLIS site: HTTP 500', 'aplis-site')
          },
        },
        ordens: [{ orderId: '111111101', idOsLis: REQ_A }],
      })

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
      expect(osNaTela(exams)).toEqual(['111111101'])
      expect(resumoDoPdf(log)).toMatchObject({ falhas: 1 })
    })

    it('a falha de uma requisição não impede o vínculo das outras', async () => {
      const { repo, buscar } = montar({
        requisicoes: [requisicao(REQ_A), requisicao(REQ_B)],
        pdfs: {
          [REQ_A]: async () => {
            throw new Error('inesperado')
          },
          [REQ_B]: [pdf(['222222202'])],
        },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null, [REQ_B]: '222222202' })
    })

    it('layout não reconhecido não vincula nada e é contado no log', async () => {
      const { repo, log, buscar } = montar({
        pdfs: { [REQ_A]: [{ os: [], layout: 'desconhecido' }] },
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
      expect(resumoDoPdf(log)).toMatchObject({ layoutNaoReconhecido: 1 })
    })
  })

  it('log estruturado por busca: o que veio do PDF, do idOsLis e o que faltou', async () => {
    const { log, buscar } = montar({
      requisicoes: [requisicao(REQ_A), requisicao(REQ_B)],
      pdfs: { [REQ_A]: [pdf(['333333303', '111111101'])] }, // REQ_B sem anexo
      ordens: [{ orderId: '222222202', idOsLis: REQ_B }],
    })

    await buscar()

    expect(resumoDoPdf(log)).toMatchObject({
      pacienteId: PACIENTE,
      requisicoes: 2,
      vinculadasPeloPdf: 1,
      extrasPeloPdf: 1,
      semAnexo: 1,
      falhas: 0,
    })
    const varredura = log.info.mock.calls.find((c) => /orders\/status OK/.test(String(c[1])))
    expect(varredura?.[0]).toMatchObject({ vinculadasPeloIdOsLis: 1 })
  })

  it('o log conta o que não pôde ser lido: requisição sem id e PDF com rótulo de O.S. ilegível', async () => {
    const { log, buscar } = montar({
      requisicoes: [requisicao(REQ_A, { id_requisicao: null }), requisicao(REQ_B)],
      pdfs: { [REQ_B]: [{ os: [], layout: 'atual' }] },
    })

    await buscar()

    expect(resumoDoPdf(log)).toMatchObject({ semIdRequisicao: 1, semOsLegivel: 1 })
  })

  it('os downloads respeitam o limite de concorrência', async () => {
    const codigos = Array.from({ length: 9 }, (_, i) => `004000000010${i}`)
    let emAndamento = 0
    let pico = 0
    const lento = async (): Promise<VinculoLaudoExterno[]> => {
      pico = Math.max(pico, ++emAndamento)
      await new Promise((resolve) => setTimeout(resolve, 5))
      emAndamento--
      return []
    }
    const { externos, buscar } = montar({
      requisicoes: codigos.map((c) => requisicao(c)),
      pdfs: Object.fromEntries(codigos.map((c) => [c, lento])),
    })

    await buscar()

    expect(externos.lerDaRequisicao).toHaveBeenCalledTimes(9)
    expect(pico).toBeLessThanOrEqual(3)
    expect(pico).toBeGreaterThan(1) // e não virou fila de um
  })
})

describe('LaudosExternosDoSite', () => {
  // PDF mínimo de uma página com as linhas dadas (mesmo formato do teste do
  // extrator): prova a costura site → leitura do PDF sem arquivo no repositório.
  function pdfSintetico(linhas: string[]): Uint8Array {
    const conteudo = ['BT', '/F1 10 Tf', '50 780 Td', ...linhas.map((l) => `(${l}) Tj 0 -14 Td`), 'ET'].join('\n')
    const objetos = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let corpo = '%PDF-1.4\n'
    const posicoes: number[] = []
    objetos.forEach((objeto, i) => {
      posicoes.push(corpo.length)
      corpo += `${i + 1} 0 obj\n${objeto}\nendobj\n`
    })
    const inicioXref = corpo.length
    corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
    for (const posicao of posicoes) corpo += `${String(posicao).padStart(10, '0')} 00000 n \n`
    corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`
    return new TextEncoder().encode(corpo)
  }

  it('lê cada anexo tipo 14 da requisição, na ordem da listagem', async () => {
    const arquivos: Record<string, Uint8Array> = {
      '10': pdfSintetico(['OS: 111111101', 'CPF: 529.982.247-25']),
      '11': pdfSintetico(['OS: 222222202', 'CPF: 529.982.247-25']),
    }
    const site = {
      listarLaudosExternos: vi.fn(async () => [
        { idAnexo: '10', nomeArquivo: 'a_1', retificacao: false },
        { idAnexo: '11', nomeArquivo: 'a_2', retificacao: false },
      ]),
      baixarAnexo: vi.fn(async (anexo: { idAnexo: string }) => arquivos[anexo.idAnexo]!),
    }

    const lidos = await new LaudosExternosDoSite(site).lerDaRequisicao('500', REQ_A)

    expect(site.listarLaudosExternos).toHaveBeenCalledWith('500', REQ_A)
    expect(lidos).toEqual([
      { os: [{ numero: '111111101', cpf: CPF, nome: null, nascimento: null, paginas: 1 }], layout: 'atual' },
      { os: [{ numero: '222222202', cpf: CPF, nome: null, nascimento: null, paginas: 1 }], layout: 'atual' },
    ])
  })

  it('requisição sem anexo devolve lista vazia; falha do site sobe como erro', async () => {
    const vazio = { listarLaudosExternos: async () => [], baixarAnexo: vi.fn() }
    expect(await new LaudosExternosDoSite(vazio).lerDaRequisicao('500', REQ_A)).toEqual([])

    const fora = {
      listarLaudosExternos: async () => {
        throw new IntegrationError('apLIS site: HTTP 500', 'aplis-site')
      },
      baixarAnexo: vi.fn(),
    }
    await expect(new LaudosExternosDoSite(fora).lerDaRequisicao('500', REQ_A)).rejects.toBeInstanceOf(IntegrationError)
  })
})
