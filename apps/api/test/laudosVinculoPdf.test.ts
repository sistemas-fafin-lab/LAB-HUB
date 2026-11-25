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

  semente(codigoLis: string | null, codigoOs: string | null): ExamResultRow {
    const linha: ExamResultRow = {
      id: `linha-${++this.#serial}`,
      paciente_id: PACIENTE,
      cpf: CPF,
      codigo_lis: codigoLis,
      codigo_os: codigoOs,
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

  async findByPaciente(): Promise<Laudo[]> {
    return []
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
  async insertAwaiting(_p: string, _cpf: string, codigoLis: string | null, codigoOs: string | null): Promise<void> {
    this.semente(codigoLis, codigoOs)
  }
  async setCodigoOs(id: string, codigoOs: string): Promise<void> {
    this.linhas.find((l) => l.id === id)!.codigo_os = codigoOs
  }
  async saveResult(id: string, result: Laudo[]): Promise<void> {
    this.linhas.find((l) => l.id === id)!.result = result
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

  return { repo, aplis, aol, externos, log, buscar }
}

/** As O.S. dos laudos que o paciente recebe, em ordem estável. */
const osNaTela = (exams: Laudo[]): string[] => exams.map((e) => e.codigo_os ?? '').sort()

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

    it('O.S. que o PDF atribui a outro CPF não volta pela varredura do idOsLis', async () => {
      // O campo digitado à mão aponta a O.S. alheia para esta requisição — e a
      // AOL, sem CPF no payload, não a barraria.
      const { repo, aol, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909', '111111101'], CPF, { '999999909': OUTRO_CPF })] },
        ordens: [{ orderId: '999999909', idOsLis: REQ_A }],
      })
      aol.fetchExam.mockImplementation(async (os: string) => [exameDaOs(os, null)])

      const { exams } = await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: '111111101' })
      expect(osNaTela(exams)).toEqual(['111111101'])
      expect(aol.fetchExam).not.toHaveBeenCalledWith('999999909')
    })

    it('nem quando a requisição ainda está sem O.S. e o idOsLis a preencheria', async () => {
      const { repo, buscar } = montar({
        pdfs: { [REQ_A]: [pdf(['999999909'], OUTRO_CPF)] },
        ordens: [{ orderId: '999999909', idOsLis: REQ_A }],
      })

      await buscar()

      expect(repo.vinculos()).toEqual({ [REQ_A]: null })
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

    it('CPF divergente com nome igual e nascimento DIFERENTE continua fora', async () => {
      const { repo, buscar } = montar({
        pdfs: {
          [REQ_A]: [
            pdf(['999999909'], OUTRO_CPF, {}, { '999999909': { nome: 'PACIENTE EXEMPLO', nascimento: '1990-01-02' } }),
          ],
        },
        ordens: [{ orderId: '999999909', idOsLis: REQ_A }],
      })

      await buscar()

      // Nem pelo idOsLis: o CPF do laudo é de outra pessoa e nada o desmentiu.
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
