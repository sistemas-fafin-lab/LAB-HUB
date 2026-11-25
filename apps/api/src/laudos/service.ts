import type { FastifyBaseLogger } from 'fastify'
import { normalizaIdOsLis, type IAolService } from './aol.js'
import type { IAplisService } from './aplis.js'
import type { IExamResultRepository } from './repository.js'
import type { AolExam, AplisExam, AplisRequisicao, ExamResultRow, Laudo } from './types.js'
import { consolidaLaudosDaOs, fundirPedidos, mapAplisResult, mapExamResult } from './mappers.js'
import { DatabaseError, ValidationError } from './errors.js'
import {
  conferirCpf,
  conferirPessoa,
  deveBloquear,
  deveBloquearFechado,
  identidadeDoLaudoExterno,
  piorVeredito,
  type Pessoa,
  type Veredito,
} from './identidade.js'
import type { OsDoLaudoExterno } from './laudoExterno.js'
import { cpfValido } from '../lib/cpf.js'
import { booleanEnv, numeroEnv } from '../lib/env.js'
import { idadeEmAnos, type PerfilPaciente } from './mapperHelpers.js'
import type { ILaudosExternos } from './vinculoPdf.js'
import { emParalelo } from '../lib/concorrencia.js'

const TTL_MS = numeroEnv('EXAM_CACHE_TTL_HOURS', 24) * 60 * 60 * 1000

// Janela retroativa da descoberta, para o ApLIS E para a listagem de OS da AOL.
// O default é 90 e não 45 porque errar para baixo é o lado perigoso: exame mais
// antigo que a janela e ainda não descoberto nunca entra, e some da tela sem
// nenhum sinal. Errar para cima só custa tempo de varredura (~47s em 90 dias),
// que o cache SWR amortiza. Mínimo 1: zero dias não descobriria nada.
const PERIODO_DIAS = numeroEnv('APLIS_PERIODO_DIAS', 90, 1)

// Quantas requisições têm os PDFs lidos ao mesmo tempo no site interno do
// apLIS. Baixo de propósito: é o site que a recepção usa, sem contrato de
// carga, e um paciente raramente tem mais que meia dúzia de requisições.
const CONCORRENCIA_PDF = 3

/**
 * Liga o vínculo requisição ↔ O.S. pelo PDF "Laudo EXTERNO". Desligada por
 * padrão; lida a cada chamada, como `LAUDOS_SOMENTE_ALVARO`, para dar para
 * desligar sem deploy se o site do apLIS mudar.
 */
const osViaPdfLigada = (): boolean => booleanEnv('LAUDOS_OS_VIA_PDF', false)

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Compara só os campos CLÍNICOS de dois laudos.
 *
 * Ficam de fora: `id` (UUID sorteado a cada mapeamento), `date`/`fullDate`
 * (derivados das datas ISO já comparadas) e `cached_at`. Sem esse recorte todo
 * laudo pareceria alterado a cada busca e o banco levaria uma escrita por
 * revalidação.
 */
export function areExamResultsEqual(anterior: Laudo | null, novo: Laudo): boolean {
  if (!anterior) return false

  const clinico = (e: Laudo) => ({
    name: e.name,
    category: e.category,
    status: e.status,
    summary: e.summary,
    panels: e.panels,
    groups: e.groups,
    material: e.material,
    metodo: e.metodo,
    doctor: e.doctor,
    crm: e.crm,
    laboratorio: e.laboratorio,
    data_coleta: e.data_coleta,
    data_coleta_pedido: e.data_coleta_pedido,
    data_registro: e.data_registro,
    data_emissao: e.data_emissao,
    exam_type: e.exam_type,
    codigo_os: e.codigo_os,
    codigo_lis: e.codigo_lis,
    source: e.source,
    partial: e.partial,
  })

  return JSON.stringify(clinico(anterior)) === JSON.stringify(clinico(novo))
}

/**
 * Compara as LISTAS de laudos de uma linha. Hoje a lista tem um elemento (o
 * pedido consolidado), mas a comparação continua posicional: a ordem interna
 * (grupos/exames) vem do XML da AOL e é estável entre buscas.
 */
export function saoListasIguais(anterior: Laudo[] | null, novos: Laudo[]): boolean {
  if (!anterior || anterior.length !== novos.length) return false
  return novos.every((laudo, i) => areExamResultsEqual(anterior[i] ?? null, laudo))
}

export function isCacheStale(cachedAt: string, ttlMs = TTL_MS): boolean {
  return Date.now() - new Date(cachedAt).getTime() > ttlMs
}

// ---------------------------------------------------------------------------
// Corte de fonte
// ---------------------------------------------------------------------------

// Fontes cujo laudo carrega valor MEDIDO no Álvaro Online. 'merged' entra
// porque os valores são do Álvaro — o ApLIS só empresta a capa (nome do exame,
// faixas de referência, responsável). 'aplis' fica de fora: é a requisição sem
// OS no Álvaro, ou seja, não há resultado dele para mostrar.
const FONTES_ALVARO: ReadonlySet<Laudo['source']> = new Set(['aol', 'merged'])

/**
 * Aplica o corte de fonte decidido pela operação: por ora o portal exibe só o
 * que foi medido no Álvaro Online.
 *
 * O corte é de EXIBIÇÃO e fica só aqui, na saída. Nada a montante muda:
 *
 *  - o ApLIS continua sendo consultado, e tem que continuar — é a listagem dele
 *    que descobre as requisições do paciente, e é o `cod_requisicao` que liga a
 *    OS do Álvaro a ele na FASE 2.5. Sem isso, só as OS digitadas com o CPF
 *    seriam achadas e a maior parte dos laudos do Álvaro sumiria junto;
 *  - o laudo ApLIS-only continua sendo buscado, mapeado e GRAVADO no cache.
 *
 * Ou seja: desligar a flag devolve os laudos na hora, do próprio cache, sem
 * refazer busca nos LIS.
 *
 * A env é lida a cada chamada (e não uma vez no módulo) para os testes
 * exercitarem os dois lados sem recarregar o módulo; o custo é uma leitura de
 * `process.env` por requisição.
 */
export function filtraPorFonte(laudos: Laudo[]): Laudo[] {
  if (!booleanEnv('LAUDOS_SOMENTE_ALVARO', true)) return laudos
  return laudos.filter((l) => FONTES_ALVARO.has(l.source))
}

/**
 * Loga a falha de um `insertAwaiting` separando os dois casos que ela esconde.
 *
 * `codigo_lis` é UNIQUE GLOBAL (não por paciente), então uma violação de
 * unicidade não é ruído de banco: é o código já pertencendo à linha de OUTRO
 * paciente. O insert falhar está certo (ninguém vê o laudo alheio), mas o efeito
 * colateral é que o paciente LEGÍTIMO também nunca vê o dele — e como warn
 * genérico isso some no log. Erro de posse sai em `error` e nomeado, para o
 * script de auditoria e o operador acharem.
 */
function logInsertFalhou(
  err: unknown,
  contexto: Record<string, unknown>,
  log?: FastifyBaseLogger,
): void {
  if (err instanceof DatabaseError && err.context.conflitoDePosse) {
    log?.error(
      { ...contexto, err },
      'codigo_lis já pertence à linha de outro paciente — laudo retido para AMBOS até revisão manual',
    )
    return
  }
  log?.warn({ ...contexto, err }, 'insertAwaiting falhou')
}

// Converte a requisição do ApLIS no shape achatado que as estratégias esperam.
function toAplisExam(req: AplisRequisicao): AplisExam {
  return {
    codigo_lis: req.cod_requisicao,
    data_solicitacao: req.data_solicitacao,
    data_liberacao: req.data_liberacao,
    tipo_exame: req.tipo_exame,
    analitos: req.procedimentos.map((p) => ({
      nome: p.nome,
      resultado: p.resultado,
      unidade: p.unidade,
      valor_referencia: p.valor_referencia,
    })),
  }
}

// ---------------------------------------------------------------------------

/** O que uma busca ao vivo devolve: os laudos e a falha de integração, se houve. */
interface BuscaAoVivo {
  laudos: Laudo[]
  falha: unknown
}

export class LaudoService {
  constructor(
    private readonly repo: IExamResultRepository,
    private readonly aplis: IAplisService,
    private readonly aol: IAolService,
    // `null` = credenciais do site interno ausentes: o caminho do PDF fica
    // inerte mesmo com a flag ligada.
    private readonly laudosExternos: ILaudosExternos | null = null,
  ) {}

  // Buscas ao vivo em andamento, por paciente. Toda leitura com cache vencido
  // dispara uma revalidação, então duas quase juntas são o caso comum — e as
  // fases de descoberta fazem "já existe? então insere" sem transação: duas
  // varreduras paralelas gravariam a mesma O.S. em duas linhas, e a partir daí
  // a busca por O.S. deixaria de ser única. A segunda chamada pega carona na
  // primeira (que ainda economiza uma varredura inteira dos LIS).
  //
  // Vale dentro de UM processo. Com mais de uma instância da API a proteção
  // teria que ser do banco (unicidade de paciente + O.S.).
  readonly #buscasEmAndamento = new Map<string, Promise<BuscaAoVivo>>()

  /**
   * Busca os laudos do paciente nos LIS, com estratégia stale-while-revalidate.
   *
   * - cache fresco  → devolve na hora, sem tocar nos LIS
   * - cache vencido → devolve o dado velho na hora e revalida em background
   * - sem cache     → busca ao vivo (o paciente espera)
   *
   * `forceRefresh` pula tudo isso e espera o dado fresco. É caro: ver o aviso de
   * custo em aplis.ts.
   */
  async fetchAndCacheExams(
    pacienteId: string,
    cpf: string,
    forceRefresh = false,
    log?: FastifyBaseLogger,
    demografia?: { nascimento: string; sexo: 'M' | 'F' },
  ): Promise<{ exams: Laudo[]; source: 'cached' | 'live' }> {
    if (!cpfValido(cpf)) {
      throw new ValidationError('CPF do paciente é inválido', { pacienteId })
    }

    // Idade/sexo escolhem a linha certa das referências estratificadas da AOL.
    // Sem demografia o laudo sai com a tabela completa — nunca com faixa errada.
    let perfil: PerfilPaciente | undefined
    if (demografia?.nascimento && demografia.sexo) {
      const idadeAnos = idadeEmAnos(demografia.nascimento)
      if (!isNaN(idadeAnos)) perfil = { idadeAnos, sexo: demografia.sexo }
    }

    if (!forceRefresh) {
      const cacheados = await this.repo.findByPaciente(pacienteId, cpf)
      if (cacheados.length > 0) {
        // Um único laudo vencido obriga a revalidar o conjunto: a tela mostra a
        // lista inteira, então não adianta metade estar em dia.
        const todosFrescos = cacheados.every((l) => (l.cached_at ? !isCacheStale(l.cached_at) : false))
        if (!todosFrescos) this.#revalidarEmBackground(pacienteId, cpf, perfil, log)
        // A fusão roda ao SERVIR (não ao gravar): a linha do banco continua uma
        // por OS — unidade natural do cache — e o card do pedido com as suas
        // remessas órfãs é montado aqui, nos dois caminhos.
        //
        // O corte de fonte vem DEPOIS da fusão, e o `length > 0` acima olha a
        // lista inteira de propósito: paciente que só tem laudo ApLIS tem cache
        // (é só que nada nele é exibível hoje), e cair no caminho ao vivo o
        // faria varrer os LIS a cada requisição para chegar na mesma lista vazia.
        return { exams: LaudoService.#compoe(cacheados), source: 'cached' }
      }
    }

    const { laudos, falha } = await this.#buscarAoVivo(pacienteId, cpf, perfil, log)
    const exams = LaudoService.#compoe(laudos)

    // A checagem vem DEPOIS do corte de fonte, e não dentro do #buscarAoVivo,
    // porque é aqui que se sabe o que o paciente realmente vai ver.
    //
    // O caso que motivou isto: a AOL fora do ar não zera a busca — o ApLIS
    // responde e os laudos saem com `source: 'aplis'`. Só que o corte de fonte
    // (LAUDOS_SOMENTE_ALVARO, ligado por padrão) descarta tudo que não é da
    // AOL, e a lista chegava vazia à tela SEM erro nenhum. O portal afirmava
    // "você não tem exames" quando o certo era "não conseguimos consultar".
    // Pior que o 502: o 502 pelo menos pede para tentar de novo.
    if (exams.length === 0 && falha) throw falha

    return { exams, source: 'live' }
  }

  /**
   * Laudos JÁ CACHEADOS do paciente, sem tocar nos LIS — nem para revalidar em
   * background. Usado pela consulta administrativa de dev
   * (GET /admin/resultados-por-cpf): ela nunca pode disparar ApLIS/AOL nem
   * gravar linha nenhuma, então não pode passar por `fetchAndCacheExams`, que
   * revalida em background e busca ao vivo quando o cache está vazio.
   *
   * Mesma composição do caminho cacheado normal (fusão de pedidos + corte de
   * fonte, ver #compoe) — só sem o efeito colateral de revalidar.
   */
  async readCachedExams(pacienteId: string, cpf: string): Promise<Laudo[]> {
    const cacheados = await this.repo.findByPaciente(pacienteId, cpf)
    return LaudoService.#compoe(cacheados)
  }

  // Fusão de pedidos + corte de fonte — a composição de exibição, num lugar
  // só para os três caminhos (cache normal, ao vivo, cache-only do admin)
  // não poderem divergir silenciosamente.
  static #compoe(laudos: Laudo[]): Laudo[] {
    return filtraPorFonte(fundirPedidos(laudos))
  }

  // A resposta já foi enviada quando isto roda: falha aqui não pode derrubar a
  // requisição, só virar log.
  #revalidarEmBackground(
    pacienteId: string,
    cpf: string,
    perfil?: PerfilPaciente,
    log?: FastifyBaseLogger,
  ): void {
    this.#buscarAoVivo(pacienteId, cpf, perfil, log)
      .then(({ falha }) => {
        // A resposta já saiu; a falha aqui não vira HTTP, mas some do log se
        // ninguém olhar — e é ela que explica um cache que nunca enriquece.
        if (falha) log?.warn({ pacienteId, err: falha }, 'Revalidação de laudos: LIS falhou')
      })
      .catch((err) => {
        log?.error({ pacienteId, err }, 'Revalidação de laudos em background falhou')
      })
  }

  /**
   * Busca ao vivo nos dois LIS.
   *
   * Devolve os laudos E a falha de integração, se houve — em vez de lançar. Quem
   * decide se a falha vira erro HTTP é `fetchAndCacheExams`, que é onde o corte
   * de fonte já foi aplicado e portanto onde se sabe se sobrou algo para o
   * paciente ver. Engolir a falha aqui foi o que produziu a tela vazia mentirosa.
   */
  #buscarAoVivo(
    pacienteId: string,
    cpf: string,
    perfil?: PerfilPaciente,
    log?: FastifyBaseLogger,
  ): Promise<BuscaAoVivo> {
    const emAndamento = this.#buscasEmAndamento.get(pacienteId)
    if (emAndamento) return emAndamento

    const busca = this.#varrerLis(pacienteId, cpf, perfil, log).finally(() => {
      this.#buscasEmAndamento.delete(pacienteId)
    })
    this.#buscasEmAndamento.set(pacienteId, busca)
    return busca
  }

  async #varrerLis(
    pacienteId: string,
    cpf: string,
    perfil?: PerfilPaciente,
    log?: FastifyBaseLogger,
  ): Promise<BuscaAoVivo> {
    // A mesma janela vale para as duas fontes: capa no ApLIS, valores na AOL.
    const hoje = new Date()
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - PERIODO_DIAS)
    const periodoIni = inicio.toISOString().slice(0, 10)
    const periodoFim = hoje.toISOString().slice(0, 10)

    // FASE 1 — descobrir quais requisições o paciente tem no ApLIS.
    let requisicoes: AplisRequisicao[] = []
    let falhaNaListagem: unknown = null
    try {
      requisicoes = await this.aplis.requisicaoListar(cpf, periodoIni, periodoFim)
      log?.info({ pacienteId, total: requisicoes.length }, 'ApLIS requisicaoListar OK')
    } catch (err) {
      if (err instanceof ValidationError) throw err
      // ApLIS fora do ar não zera a tela: seguimos com as linhas que já estão no
      // banco, que ainda podem render resultado pela AOL. Mas guardamos a falha
      // — se no fim não houver NADA para mostrar, ela precisa chegar ao cliente.
      falhaNaListagem = err
      log?.warn({ pacienteId, err }, 'ApLIS requisicaoListar falhou — usando linhas já gravadas')
    }

    // FASE 2 — registrar as requisições novas como pendentes.
    for (const req of requisicoes) {
      const existente = await this.repo.findByCodigoLis(pacienteId, req.cod_requisicao)
      if (existente) continue

      await this.repo
        .insertAwaiting(pacienteId, cpf, req.cod_requisicao, null)
        .catch((err) => logInsertFalhou(err, { pacienteId, codigoLis: req.cod_requisicao }, log))
    }

    // FASE 2.2 — vínculo pelo PDF "Laudo EXTERNO" anexado à requisição. Roda
    // ANTES da varredura: é determinístico (o PDF está anexado naquele pedido)
    // e não depende do campo digitado à mão. A FASE 2.5 preenche o que sobrar.
    const viaPdf = osViaPdfLigada() && this.laudosExternos !== null
    const recusadasPeloPdf = viaPdf
      ? await this.#vincularPeloPdf(pacienteId, cpf, requisicoes, log)
      : new Set<string>()

    // FASE 2.5 — descobrir as OS do paciente na AOL, que é onde estão os
    // valores. A listagem não filtra por paciente (⚠ ver aviso de custo em
    // aol.listOrders); uma falha aqui não derruba o caminho ApLIS — as OS
    // entram na próxima revalidação.
    //
    // O `idOsLis` é digitado à mão pela recepção e vem em dois sabores úteis:
    //  - codRequisicao do ApLIS (a maioria) → link DETERMINÍSTICO: a OS entra na
    //    MESMA linha da requisição e o laudo sai fundido (valores da AOL +
    //    metadados do ApLIS), sem card duplicado;
    //  - CPF do paciente → linha própria, só-AOL. O card se funde ao do pedido na
    //    hora de servir (fundirPedidos) se a linha tiver o elo para ele — que o
    //    PDF grava, na FASE 2.2 — ou, sem elo, se a coleta bater com a dtaColeta
    //    de exatamente uma requisição. A linha continua separada.
    let falhaAol: unknown = null
    try {
      const ordens = await this.aol.listOrders(periodoIni, periodoFim)
      const codigosDoPaciente = new Set(requisicoes.map((r) => r.cod_requisicao))
      const cpfDigitos = cpf.replace(/\D/g, '')
      let doPaciente = 0
      let vinculadasPeloIdOsLis = 0

      for (const { orderId, idOsLis } of ordens) {
        const chave = normalizaIdOsLis(idOsLis)

        // O PDF NUNCA REMOVE o que o `idOsLis` já mostra — só acrescenta. O
        // laudo anexado atribuir esta O.S. a outro CPF não a tira daqui: no
        // caso real que motivou a regra (25/11/2026) a O.S. era do próprio
        // paciente, registrada no laboratório de apoio com CPF e nascimento
        // errados. A conferência dela continua sendo a do payload da AOL, na
        // FASE 3, como sempre foi. Fica só o rastro, para a recepção corrigir
        // o cadastro na origem. (Conjunto vazio com a flag desligada.)
        if (recusadasPeloPdf.has(orderId) && (codigosDoPaciente.has(chave) || chave === cpfDigitos)) {
          log?.warn(
            { pacienteId, orderId },
            'idOsLis aponta para o paciente uma O.S. que o Laudo EXTERNO atribui a outro CPF — mantida; revisar o cadastro da O.S.',
          )
        }

        if (codigosDoPaciente.has(chave)) {
          doPaciente++
          const linha = await this.repo.findByCodigoLis(pacienteId, chave)
          if (linha && !linha.codigo_os) {
            vinculadasPeloIdOsLis++
            await this.repo
              .setCodigoOs(linha.id, orderId)
              .catch((err) => log?.warn({ pacienteId, orderId, err }, 'setCodigoOs falhou'))
          } else if (linha && viaPdf && linha.codigo_os !== orderId) {
            // A linha da requisição já está ocupada por OUTRA O.S. (do PDF, ou
            // de uma remessa anterior) e esta também é do pedido. Sem o caminho
            // do PDF ela era simplesmente ignorada; com ele ligado, vale a
            // regra de que o paciente vê todos os seus exames — entra como
            // linha própria, igual às O.S. extras do PDF, e com o mesmo elo
            // para o pedido: aqui quem diz de qual requisição ela é é o
            // próprio `idOsLis`.
            //
            // A identidade desta O.S. é a do `idOsLis`, nem mais nem menos do
            // que a da O.S. que a mesma varredura põe na linha da requisição:
            // quem a confere é a barreira sobre o payload da AOL, na FASE 3.
            //
            // Falha aqui fica nesta O.S.; não pode abortar a varredura.
            try {
              const existente = await this.repo.findByCodigoOs(pacienteId, orderId)
              if (!existente) {
                await this.repo.insertAwaiting(pacienteId, cpf, null, orderId, chave)
                vinculadasPeloIdOsLis++
              } else {
                await this.#ligarAoPedido(existente, chave, 'idOsLis', log)
              }
            } catch (err) {
              logInsertFalhou(err, { pacienteId, orderId }, log)
            }
          } else if (!linha) {
            // insertAwaiting da FASE 2 falhou: registra já com os dois códigos.
            await this.repo
              .insertAwaiting(pacienteId, cpf, chave, orderId)
              .catch((err) => logInsertFalhou(err, { pacienteId, codigoLis: chave, orderId }, log))
          }
          continue
        }

        if (chave === cpfDigitos) {
          doPaciente++
          const existente = await this.repo.findByCodigoOs(pacienteId, orderId)
          if (existente) continue

          await this.repo
            .insertAwaiting(pacienteId, cpf, null, orderId)
            .catch((err) => logInsertFalhou(err, { pacienteId, orderId }, log))
        }
      }
      log?.info({ pacienteId, total: ordens.length, doPaciente, vinculadasPeloIdOsLis }, 'AOL orders/status OK')
    } catch (err) {
      // A AOL é a fonte que SOBREVIVE ao corte de LAUDOS_SOMENTE_ALVARO. Se ela
      // cair, o paciente pode acabar com a lista vazia mesmo tendo laudo no
      // ApLIS — por isso a falha é guardada, não só logada.
      falhaAol = err
      log?.warn({ pacienteId, err }, 'AOL orders/status falhou — descoberta de OS pulada')
    }

    // FASE 3 — buscar, mapear e gravar os laudos de cada linha. Uma linha rende
    // uma LISTA de laudos; hoje ela tem um elemento (o pedido consolidado), mas
    // o shape de lista fica — o banco já guarda assim e ele reabre a porta para
    // granularidades diferentes sem migração.
    const linhas = await this.repo.findAllRows(pacienteId)
    const laudos: Laudo[] = []

    for (const linha of linhas) {
      // Linha ligada (codigo_os + codigo_lis) cujo fetch na AOL falhar cai para
      // a capa do ApLIS — melhor o card sem valores do que o exame sumir.
      const grupo = linha.codigo_os
        ? ((await this.#mapearComAol(linha, cpf, perfil, log)) ??
          (await this.#mapearSoApLIS(linha, cpf, log)))
        : await this.#mapearSoApLIS(linha, cpf, log)

      if (!grupo) continue
      // O elo para o pedido de origem acompanha o laudo só na resposta, como
      // no caminho cacheado (findByPaciente): ele é coluna da linha, não parte
      // do conteúdo clínico gravado.
      const pedido = linha.codigo_lis_pedido
      laudos.push(...(pedido ? grupo.map((l) => ({ ...l, codigo_lis_pedido: pedido })) : grupo))
      await this.#gravarSeMudou(linha, grupo, log)
    }

    // A falha do ApLIS vem primeiro: sem a listagem dele não há nem o que
    // enriquecer, então ela explica melhor uma tela vazia do que a da AOL.
    // Quem transforma isto em erro HTTP é fetchAndCacheExams — ver lá o porquê.
    return {
      // Mesma ordenação do caminho cacheado (findByPaciente): mais recente primeiro.
      laudos: laudos.sort((a, b) => (b.data_emissao ?? '').localeCompare(a.data_emissao ?? '')),
      falha: falhaNaListagem ?? falhaAol,
    }
  }

  /**
   * Vínculo pelo PDF "Laudo EXTERNO": para cada requisição do paciente, lê os
   * anexos tipo 14 e grava as O.S. que eles trazem.
   *
   * O PACIENTE VÊ TODOS OS SEUS EXAMES. Um PDF pode trazer 2 ou 3 O.S. (15% dos
   * arquivos na medição de 24/11/2026) e a linha de `exam_results` guarda uma
   * só. A principal — a maior entre as do paciente, ver laudoExterno.ts — entra na
   * linha da requisição; cada uma das outras ganha linha própria, só com a
   * O.S., exatamente como a FASE 2.5 já faz com a O.S. achada pelo CPF. Assim
   * nenhuma fica só no log.
   *
   * UM PEDIDO, UM CARD. A linha própria carrega o ELO para a requisição em cujo
   * anexo a O.S. apareceu (`codigo_lis_pedido`), e é ele que a funde no card do
   * pedido ao servir, com a coleta em qualquer data (ver fundirPedidos). Ganha
   * o elo também a linha que já existia sem ele: a O.S. achada antes pelo CPF e
   * a linha própria gravada antes de o elo existir.
   *
   * Por isso TODAS as requisições são lidas, e não só as que estão sem O.S.:
   * a que já foi vinculada pelo `idOsLis` também pode ter outras O.S. no PDF.
   *
   * Nada daqui chega ao paciente como erro. Site fora do ar, layout que mudou,
   * PDF ilegível: a requisição fica como estava e a varredura por `idOsLis`
   * segue cobrindo. E nada é sobrescrito: linha que já tem O.S. fica com ela,
   * e elo já gravado para outra requisição fica como está.
   */
  async #vincularPeloPdf(
    pacienteId: string,
    cpf: string,
    requisicoes: AplisRequisicao[],
    log?: FastifyBaseLogger,
  ): Promise<Set<string>> {
    // O.S. que algum laudo anexado afirma ser de OUTRO CPF, sem a segunda
    // prova. Sai daqui só para a varredura por `idOsLis` AVISAR quando vincular
    // uma delas — não para bloquear (ver a FASE 2.5).
    const deOutroPaciente = new Set<string>()
    const externos = this.laudosExternos
    if (!externos) return deOutroPaciente

    const resumo = {
      requisicoes: requisicoes.length,
      vinculadasPeloPdf: 0,
      extrasPeloPdf: 0,
      elosGravados: 0,
      semIdRequisicao: 0,
      semAnexo: 0,
      layoutNaoReconhecido: 0,
      semOsLegivel: 0,
      aceitasPorNomeENascimento: 0,
      cpfDivergente: 0,
      cpfIndisponivel: 0,
      divergentes: 0,
      falhas: 0,
    }

    // Leitura em paralelo (limitada); gravação em série logo abaixo, para duas
    // requisições com a mesma O.S. não disputarem a mesma linha.
    const lidas = await emParalelo(requisicoes, CONCORRENCIA_PDF, async (req) => {
      if (!req.id_requisicao) {
        resumo.semIdRequisicao++
        return null
      }
      try {
        return await externos.lerDaRequisicao(req.id_requisicao, req.cod_requisicao)
      } catch (err) {
        resumo.falhas++
        log?.warn({ pacienteId, codigoLis: req.cod_requisicao, err }, 'Laudo EXTERNO: leitura do anexo falhou')
        return null
      }
    })

    for (const [i, req] of requisicoes.entries()) {
      const pdfs = lidas[i]
      if (!pdfs) continue
      const codigoLis = req.cod_requisicao
      if (pdfs.length === 0) {
        resumo.semAnexo++
        continue
      }

      // Barreira de identidade, por O.S. e FECHADA.
      //
      // Por O.S., e não por arquivo: um mesmo PDF já veio com O.S. de CPFs
      // diferentes. Cada O.S. responde pelo que está impresso nas páginas dela.
      //
      // Fechada: aqui `indisponivel` também descarta (ao contrário de
      // `deveBloquear`). O PDF é fonte nova, e a AOL muitas vezes não devolve
      // CPF — a barreira de lá não seguraria uma O.S. alheia que passasse aqui.
      //
      // Duas provas (ver identidadeDoLaudoExterno): o CPF e, quando ele falta
      // ou diverge, nome + nascimento contra o cadastro da requisição.
      //
      // O veredito de uma O.S. junta TODOS os anexos da requisição: se ela
      // confere num arquivo e diverge em outro, não confere. O Map guarda a
      // ordem — anexos na ordem da listagem e, dentro do PDF, a maior O.S.
      // primeiro —, então a principal é a maior ENTRE AS QUE SÃO DO PACIENTE.
      const impressoes = new Map<string, OsDoLaudoExterno[]>()
      for (const pdf of pdfs) {
        if (pdf.layout !== 'atual') {
          resumo.layoutNaoReconhecido++
          continue
        }
        // Layout atual sem O.S. nenhuma = rótulo ilegível: é o primeiro sinal
        // de que o modelo do laudo mudou.
        if (pdf.os.length === 0) resumo.semOsLegivel++

        for (const os of pdf.os) impressoes.set(os.numero, [...(impressoes.get(os.numero) ?? []), os])
      }

      // O cadastro só é consultado se alguma O.S. precisar da segunda prova —
      // a maioria fecha no CPF — e uma vez por requisição.
      let cadastro: Promise<Pessoa | null> | null = null
      const cadastroDaRequisicao = (): Promise<Pessoa | null> =>
        (cadastro ??= this.#cadastroDaRequisicao(codigoLis, cpf, log))

      const osDaRequisicao: string[] = []
      for (const [codigoOs, vezes] of impressoes) {
        const pior = (cada: (os: OsDoLaudoExterno) => Veredito): Veredito =>
          vezes.reduce<Veredito | undefined>((acumulado, os) => piorVeredito(acumulado, cada(os)), undefined)!

        const peloCpf = pior((os) => conferirCpf(cpf, os.cpf))
        let pelaPessoa: Veredito = 'indisponivel'
        if (peloCpf !== 'confere') {
          const esperado = await cadastroDaRequisicao()
          if (esperado) pelaPessoa = pior((os) => conferirPessoa(esperado, os))
        }
        const { veredito, prova } = identidadeDoLaudoExterno(peloCpf, pelaPessoa)

        if (!deveBloquearFechado(veredito)) {
          osDaRequisicao.push(codigoOs)
          if (prova === 'nome_nascimento') {
            resumo.aceitasPorNomeENascimento++
            // O exame aparece, mas o cadastro está inconsistente em algum lado:
            // fica o rastro para a recepção corrigir na origem.
            if (peloCpf === 'diverge') {
              log?.warn(
                { pacienteId, codigoLis, codigoOs },
                'Laudo EXTERNO: O.S. com CPF diferente do cadastro, aceita por nome e nascimento — revisar o CPF da O.S.',
              )
            }
          }
        } else if (veredito === 'diverge') {
          resumo.cpfDivergente++
          deOutroPaciente.add(codigoOs)
          log?.error(
            { pacienteId, codigoLis, codigoOs },
            'Laudo EXTERNO: O.S. com CPF de outro paciente — DESCARTADA (PDF anexado na requisição errada)',
          )
        } else {
          resumo.cpfIndisponivel++
          log?.warn(
            { pacienteId, codigoLis, codigoOs },
            'Laudo EXTERNO: O.S. sem CPF e sem nome e nascimento que confiram — descartada',
          )
        }
      }

      try {
        const linha = await this.repo.findByCodigoLis(pacienteId, codigoLis)
        let linhaTemOs = Boolean(linha?.codigo_os)

        for (const os of osDaRequisicao) {
          const existente = await this.repo.findByCodigoOs(pacienteId, os)
          if (existente) {
            // Já é do paciente. Se está na linha de OUTRA requisição, as duas
            // fontes discordam sobre de qual pedido ela é: nada é sobrescrito,
            // só registrado — decidir quem vence depende de olhar os casos.
            const efeito = await this.#ligarAoPedido(existente, codigoLis, 'Laudo EXTERNO', log)
            if (efeito === 'divergente') resumo.divergentes++
            if (efeito === 'elo gravado') resumo.elosGravados++
            continue
          }

          if (linha && !linhaTemOs) {
            await this.repo.setCodigoOs(linha.id, os)
            linhaTemOs = true
            resumo.vinculadasPeloPdf++
          } else {
            await this.repo.insertAwaiting(pacienteId, cpf, null, os, codigoLis)
            resumo.extrasPeloPdf++
            resumo.elosGravados++
          }
        }
      } catch (err) {
        resumo.falhas++
        logInsertFalhou(err, { pacienteId, codigoLis }, log)
      }
    }

    log?.info({ pacienteId, ...resumo }, 'Laudo EXTERNO: vínculo pelo PDF concluído')
    return deOutroPaciente
  }

  /**
   * Uma O.S. que o paciente JÁ TEM gravada e que uma fonte (o PDF, ou o
   * `idOsLis`) diz ser da requisição `codigoLis`.
   *
   * - linha avulsa, sem pedido conhecido (achada pelo CPF, ou gravada antes de
   *   o elo existir): ganha o elo;
   * - já é dessa requisição, pela própria linha ou pelo elo: nada a fazer;
   * - já é de OUTRA requisição: as fontes discordam. Nada é sobrescrito, só
   *   registrado — decidir quem vence depende de olhar os casos.
   */
  async #ligarAoPedido(
    existente: ExamResultRow,
    codigoLis: string,
    fonte: 'Laudo EXTERNO' | 'idOsLis',
    log?: FastifyBaseLogger,
  ): Promise<'elo gravado' | 'divergente' | 'nada'> {
    const pedidoAtual = existente.codigo_lis ?? existente.codigo_lis_pedido
    if (!pedidoAtual) {
      await this.repo.setPedidoDeOrigem(existente.id, codigoLis)
      return 'elo gravado'
    }
    if (pedidoAtual === codigoLis) return 'nada'

    log?.warn(
      {
        pacienteId: existente.paciente_id,
        codigoLis,
        codigoOs: existente.codigo_os,
        codigoLisVinculado: pedidoAtual,
      },
      `${fonte}: O.S. já está vinculada a outra requisição do paciente`,
    )
    return 'divergente'
  }

  /**
   * Nome e nascimento do paciente como o apLIS os tem NAQUELA requisição — a
   * referência da segunda prova de identidade do Laudo EXTERNO.
   *
   * Só vale se o CPF do cadastro for o do paciente do token: é isso que amarra
   * "o nome que está no apLIS" a "quem está pedindo". Qualquer outra coisa
   * (apLIS fora do ar, CPF ausente ou de outra pessoa) devolve `null`, e sem
   * referência a segunda prova simplesmente não existe.
   *
   * Nome e nascimento ficam em memória; não vão para log.
   */
  async #cadastroDaRequisicao(
    codigoLis: string,
    cpf: string,
    log?: FastifyBaseLogger,
  ): Promise<Pessoa | null> {
    try {
      const { paciente } = await this.aplis.requisicaoResultado(codigoLis)
      if (conferirCpf(cpf, paciente?.cpf) !== 'confere') return null
      return { nome: paciente.nome, nascimento: paciente.data_nascimento }
    } catch (err) {
      log?.warn({ codigoLis, err }, 'Laudo EXTERNO: cadastro da requisição indisponível para conferir nome e nascimento')
      return null
    }
  }

  // Caminho ApLIS puro — hoje o mais comum: a requisição não tem OS na AOL.
  async #mapearSoApLIS(
    linha: ExamResultRow,
    cpf: string,
    log?: FastifyBaseLogger,
  ): Promise<Laudo[] | null> {
    if (!linha.codigo_lis) return null

    try {
      const resultado = await this.aplis.requisicaoResultado(linha.codigo_lis)

      // Barreira de identidade: `requisicaoResultado` recebe só o código da
      // requisição — não há escopo de paciente no protocolo do ApLIS, então o
      // CPF que volta no payload é a ÚNICA prova de que este resultado é de quem
      // pediu. Se a linha estiver vinculada ao codigo_lis errado, é aqui que se
      // descobre.
      const veredito = conferirCpf(cpf, resultado.paciente?.cpf)
      if (deveBloquear(veredito)) {
        log?.error(
          { pacienteId: linha.paciente_id, codigoLis: linha.codigo_lis },
          'Identidade divergente no ApLIS — laudo BLOQUEADO (linha vinculada a outro paciente)',
        )
        return null
      }
      if (veredito === 'indisponivel') {
        log?.warn(
          { codigoLis: linha.codigo_lis },
          'ApLIS não informou o CPF do paciente — identidade não verificada',
        )
      }

      return [mapAplisResult(resultado)]
    } catch (err) {
      // Uma requisição que falha não invalida as outras — some desta resposta e
      // volta na próxima revalidação.
      log?.warn({ codigoLis: linha.codigo_lis, err }, 'ApLIS requisicaoResultado falhou — linha pulada')
      return null
    }
  }

  // Caminho AOL (+ ApLIS quando houver): só alcança linhas que já tenham OS.
  async #mapearComAol(
    linha: ExamResultRow,
    cpf: string,
    perfil?: PerfilPaciente,
    log?: FastifyBaseLogger,
  ): Promise<Laudo[] | null> {
    const codigoOs = linha.codigo_os
    if (!codigoOs) return null

    let exames: AolExam[]
    try {
      exames = await this.aol.fetchExam(codigoOs)
    } catch (err) {
      log?.error({ codigoOs, err }, 'AOL fetchExam falhou — linha pulada')
      return null
    }

    if (exames.length === 0) {
      log?.warn({ codigoOs }, 'AOL não devolveu exames para a OS')
      return null
    }

    // Barreira de identidade. É o ponto mais crítico do pipeline: esta OS foi
    // atribuída ao paciente por um `idOsLis` DIGITADO À MÃO (ver a FASE 2.5), e
    // até aqui nada confirmou que ela é mesmo dele. Basta um exame da OS acusar
    // outro CPF para a OS inteira cair — uma solicitação é de um paciente só.
    const cpfDaOs = exames.find((e) => e.paciente_cpf)?.paciente_cpf ?? null
    const veredito = conferirCpf(cpf, cpfDaOs)
    if (deveBloquear(veredito)) {
      log?.error(
        { pacienteId: linha.paciente_id, codigoOs, codigoLis: linha.codigo_lis },
        'Identidade divergente na AOL — OS BLOQUEADA (idOsLis casou com o paciente errado)',
      )
      return null
    }
    if (veredito === 'indisponivel') {
      log?.warn({ codigoOs }, 'AOL não informou o CPF do paciente — identidade não verificada')
    }

    let aplis: AplisRequisicao | null = null
    if (linha.codigo_lis) {
      try {
        aplis = await this.aplis.requisicaoResultado(linha.codigo_lis)
        // A capa do ApLIS entra no mesmo card: se ela for de outro paciente, o
        // laudo sairia com nome de exame e datas alheios sobre valores certos.
        // Descartar só a capa preserva os valores da AOL, já verificados acima.
        if (deveBloquear(conferirCpf(cpf, aplis.paciente?.cpf))) {
          log?.error(
            { pacienteId: linha.paciente_id, codigoOs, codigoLis: linha.codigo_lis },
            'Identidade divergente na capa do ApLIS — metadados DESCARTADOS, mantidos os valores da AOL',
          )
          aplis = null
        }
      } catch (err) {
        // Sem o ApLIS o laudo sai sem faixas de referência; a estratégia marca
        // `partial` e o cache revalida antes do TTL normal.
        log?.warn({ codigoLis: linha.codigo_lis, err }, 'ApLIS falhou — laudo parcial só com a AOL')
      }
    }

    // Cada exame da OS resolve a própria estratégia pelo seu código de tipo —
    // e depois o pedido vira UM laudo só, com um grupo (seção) por exame. Isso
    // preserva nome, método e responsável de cada exame sem inundar a lista de
    // resultados com um card por analito. (Sem os grupos, o consolidado antigo
    // era um card "ANTI - TIREOGLOBULINA" com 75 marcadores soltos dentro.)
    const aplisExam = aplis ? toAplisExam(aplis) : null
    const porExame = exames.map((exame) => {
      const tipo = exame.codigo_tipo ?? aplis?.tipo_exame ?? exame.nome_exame ?? 'unknown'
      return mapExamResult(exame, aplisExam, tipo, perfil)
    })
    return [consolidaLaudosDaOs(porExame, aplis?.tipo_exame ?? null, aplis?.data_solicitacao ?? null)]
  }

  async #gravarSeMudou(linha: ExamResultRow, novos: Laudo[], log?: FastifyBaseLogger): Promise<void> {
    if (saoListasIguais(linha.result, novos)) {
      await this.repo
        .renewCachedAt(linha.id)
        .catch((err) => log?.error({ id: linha.id, err }, 'Falha ao renovar o cache do laudo'))
      return
    }

    await this.repo
      .saveResult(linha.id, novos)
      .catch((err) => log?.error({ id: linha.id, err }, 'Falha ao gravar o laudo'))
  }
}
