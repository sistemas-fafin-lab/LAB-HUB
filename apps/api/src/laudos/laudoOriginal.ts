import type { FastifyBaseLogger } from 'fastify'
import type { IAplisService } from './aplis.js'
import type { AnexoLaudoExterno } from './aplisSite.js'
import { EntregaRecusadaError, IntegrationError, NaoEncontradoError } from './errors.js'
import { conferirCpf, deveBloquear, piorVeredito, type Veredito } from './identidade.js'
import type { LaudoExternoParaEntrega } from './laudoExterno.js'
import type { IExamResultRepository } from './repository.js'
import { PERIODO_DIAS, osViaPdfLigada } from './service.js'
import type { ExamResultRow } from './types.js'
import type { IAnexosLaudoExterno } from './vinculoPdf.js'

// ---------------------------------------------------------------------------
// "Baixar laudo original": o PDF que o laboratório de apoio emitiu, o mesmo
// anexado à requisição no apLIS (imagem tipo 14, "Laudo EXTERNO").
//
// AO VIVO E SEM GUARDAR. O arquivo é buscado no site interno do apLIS a cada
// pedido, conferido e entregue; não passa por disco nem pelo Storage.
//
// TRÊS TRAVAS, nesta ordem:
//  1. a requisição é do paciente do token — a linha de `exam_results` é
//     procurada com o `paciente_id` dele, e a de outra pessoa não existe;
//  2. o anexo pedido é um dos que o site lista NAQUELA requisição — o id que
//     vem do navegador nunca é usado direto para baixar;
//  3. o CPF impresso no PDF é o do paciente — em TODAS as O.S. do arquivo e
//     em qualquer página que traga CPF sem trazer O.S.
//
// A terceira é mais dura que a do vínculo (service.ts, FASE 2.2): lá vale a
// segunda prova por nome e nascimento, e depois ainda há a barreira sobre o
// payload da AOL. Aqui o arquivo inteiro sai para a mão do paciente e não há
// barreira depois — então só o CPF, e um arquivo com uma O.S. que não confira
// não é entregue, mesmo que as outras sejam dele.
// ---------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000
/** Folga entre a solicitação no apLIS e as datas que o laudo em cache guarda. */
const FOLGA_DIAS = 30

/** Um laudo original que o paciente pode baixar. */
export interface ArquivoOriginal {
  /** Id do anexo no apLIS; só vale junto da requisição em que foi listado. */
  id: string
  retificacao: boolean
}

/**
 * O que o PDF afirma sobre o dono, para decidir a entrega do ARQUIVO: o pior
 * veredito entre as O.S. dele e os CPFs das páginas sem O.S. Layout não
 * reconhecido, sem O.S. legível ou com CPF ilegível não afirma nada.
 *
 * O que escapa: página sem O.S. E sem CPF em texto (uma digitalização no meio
 * do arquivo). Recusar toda página sem cabeçalho fecharia isso, mas não há
 * medição de quantos laudos legítimos têm página assim.
 */
function identidadeDoArquivo(cpf: string, { vinculo, cpfsSemOs }: LaudoExternoParaEntrega): Veredito {
  if (vinculo.layout !== 'atual' || vinculo.os.length === 0 || cpfsSemOs === null) return 'indisponivel'
  return [...vinculo.os.map((os) => os.cpf), ...cpfsSemOs].reduce<Veredito>(
    (pior, impresso) => piorVeredito(pior, conferirCpf(cpf, impresso)),
    'confere',
  )
}

const isoDoDia = (data: Date): string => data.toISOString().slice(0, 10)

export class LaudoOriginalService {
  constructor(
    private readonly repo: IExamResultRepository,
    private readonly aplis: IAplisService,
    // `null` = credenciais do site interno ausentes: o recurso não existe.
    private readonly anexos: IAnexosLaudoExterno | null,
  ) {}

  /** Os laudos originais anexados à requisição do paciente. */
  async listar(pacienteId: string, cpf: string, codigoLis: string): Promise<ArquivoOriginal[]> {
    const { anexos } = await this.#anexosDaRequisicao(pacienteId, cpf, codigoLis)
    return anexos.map((anexo) => ({ id: anexo.idAnexo, retificacao: anexo.retificacao }))
  }

  /**
   * O PDF de um anexo, já conferido. `linhaId` é a linha de `exam_results` da
   * requisição, para a trilha de auditoria.
   */
  async baixar(
    pacienteId: string,
    cpf: string,
    codigoLis: string,
    idAnexo: string,
    log?: FastifyBaseLogger,
  ): Promise<{ pdf: Uint8Array; linhaId: string }> {
    const { fonte, linha, anexos } = await this.#anexosDaRequisicao(pacienteId, cpf, codigoLis)
    const anexo = anexos.find((a) => a.idAnexo === idAnexo)
    if (!anexo) throw new NaoEncontradoError('Anexo não pertence à requisição', { codigoLis, idAnexo })

    const { pdf, ...impresso } = await fonte.baixarAnexo(anexo)
    const veredito = identidadeDoArquivo(cpf, impresso)
    if (veredito !== 'confere') {
      // `diverge` = PDF anexado na requisição errada; `indisponivel` = não deu
      // para ler de quem é. Os dois pedem revisão humana, por isso `error`.
      // Só códigos no log: nome e CPF do laudo não saem daqui.
      log?.error(
        { pacienteId, codigoLis, idAnexo, veredito, layout: impresso.vinculo.layout },
        'Laudo original: o CPF do PDF não confere com o do paciente — entrega RECUSADA',
      )
      throw new EntregaRecusadaError('Laudo original recusado pela conferência de identidade', {
        codigoLis,
        idAnexo,
        veredito,
      })
    }
    return { pdf, linhaId: linha.id }
  }

  async #anexosDaRequisicao(
    pacienteId: string,
    cpf: string,
    codigoLis: string,
  ): Promise<{ fonte: IAnexosLaudoExterno; linha: ExamResultRow; anexos: AnexoLaudoExterno[] }> {
    const fonte = this.anexos
    if (!fonte || !osViaPdfLigada()) throw new NaoEncontradoError('Laudo original desligado')

    // Escopo pelo paciente do token. O CPF gravado na linha é a segunda chave,
    // como em `findByPaciente`: linha vinculada ao paciente errado não serve.
    const linha = await this.repo.findByCodigoLis(pacienteId, codigoLis)
    if (!linha || deveBloquear(conferirCpf(cpf, linha.cpf))) {
      throw new NaoEncontradoError('Requisição não encontrada para o paciente', { codigoLis })
    }

    // O site lista os anexos pelo id INTERNO da requisição, que só a listagem
    // do apLIS devolve — e ela já vem filtrada pelo CPF do paciente.
    const requisicoes = await this.aplis.requisicaoListar(cpf, this.#inicioDaJanela(linha), isoDoDia(new Date()))
    const idRequisicao = requisicoes.find((r) => r.cod_requisicao === codigoLis)?.id_requisicao
    if (!idRequisicao) {
      throw new IntegrationError('ApLIS: requisição do paciente fora da listagem', 'aplis', { codigoLis })
    }

    return { fonte, linha, anexos: await fonte.listarAnexos(idRequisicao, codigoLis) }
  }

  /**
   * De quando listar. A janela da busca de laudos basta para o que é recente;
   * o laudo em cache pode ser mais antigo que ela, e aí a janela recua até a
   * data dele (com folga, porque a listagem filtra pela SOLICITAÇÃO).
   */
  #inicioDaJanela(linha: ExamResultRow): string {
    const hoje = Date.now()
    const datas = (linha.result ?? [])
      .flatMap((laudo) => [laudo.data_coleta_pedido, laudo.data_registro, laudo.data_coleta])
      .map((iso) => Date.parse(iso ?? ''))
      .filter((ms) => !Number.isNaN(ms))
      .map((ms) => ms - FOLGA_DIAS * DIA_MS)
    return isoDoDia(new Date(Math.min(hoje - PERIODO_DIAS * DIA_MS, ...datas)))
  }
}
