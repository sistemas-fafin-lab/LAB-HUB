import type { FastifyBaseLogger } from 'fastify'
import { normalizaIdOsLis, type IAolService } from './aol.js'
import type { IAplisService } from './aplis.js'
import type { IExamResultRepository } from './repository.js'
import type { AolExam, AplisExam, AplisRequisicao, ExamResultRow, Laudo } from './types.js'
import { consolidaLaudosDaOs, fundirPedidosPorColeta, mapAplisResult, mapExamResult } from './mappers.js'
import { DatabaseError, ValidationError } from './errors.js'
import { conferirCpf, deveBloquear } from './identidade.js'
import { cpfValido } from '../lib/cpf.js'
import { numeroEnv } from '../lib/env.js'
import { idadeEmAnos, type PerfilPaciente } from './mapperHelpers.js'

const TTL_MS = numeroEnv('EXAM_CACHE_TTL_HOURS', 24) * 60 * 60 * 1000

// Janela retroativa da descoberta, para o ApLIS E para a listagem de OS da AOL.
// O default é 90 e não 45 porque errar para baixo é o lado perigoso: exame mais
// antigo que a janela e ainda não descoberto nunca entra, e some da tela sem
// nenhum sinal. Errar para cima só custa tempo de varredura (~47s em 90 dias),
// que o cache SWR amortiza. Mínimo 1: zero dias não descobriria nada.
const PERIODO_DIAS = numeroEnv('APLIS_PERIODO_DIAS', 90, 1)

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

export class LaudoService {
  constructor(
    private readonly repo: IExamResultRepository,
    private readonly aplis: IAplisService,
    private readonly aol: IAolService,
  ) {}

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
        return { exams: fundirPedidosPorColeta(cacheados), source: 'cached' }
      }
    }

    return {
      exams: fundirPedidosPorColeta(await this.#buscarAoVivo(pacienteId, cpf, perfil, log)),
      source: 'live',
    }
  }

  // A resposta já foi enviada quando isto roda: falha aqui não pode derrubar a
  // requisição, só virar log.
  #revalidarEmBackground(
    pacienteId: string,
    cpf: string,
    perfil?: PerfilPaciente,
    log?: FastifyBaseLogger,
  ): void {
    this.#buscarAoVivo(pacienteId, cpf, perfil, log).catch((err) => {
      log?.error({ pacienteId, err }, 'Revalidação de laudos em background falhou')
    })
  }

  async #buscarAoVivo(
    pacienteId: string,
    cpf: string,
    perfil?: PerfilPaciente,
    log?: FastifyBaseLogger,
  ): Promise<Laudo[]> {
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

    // FASE 2.5 — descobrir as OS do paciente na AOL, que é onde estão os
    // valores. A listagem não filtra por paciente (⚠ ver aviso de custo em
    // aol.listOrders); uma falha aqui não derruba o caminho ApLIS — as OS
    // entram na próxima revalidação.
    //
    // O `idOsLis` é digitado à mão pela recepção e vem em dois sabores úteis:
    //  - codRequisicao do ApLIS (a maioria) → link DETERMINÍSTICO: a OS entra na
    //    MESMA linha da requisição e o laudo sai fundido (valores da AOL +
    //    metadados do ApLIS), sem card duplicado;
    //  - CPF do paciente → linha própria, só-AOL. Se a coleta bater com a
    //    dtaColeta de exatamente uma requisição, o card se funde ao do pedido na
    //    hora de servir (fundirPedidosPorColeta) — a linha continua separada.
    try {
      const ordens = await this.aol.listOrders(periodoIni, periodoFim)
      const codigosDoPaciente = new Set(requisicoes.map((r) => r.cod_requisicao))
      const cpfDigitos = cpf.replace(/\D/g, '')
      let doPaciente = 0

      for (const { orderId, idOsLis } of ordens) {
        const chave = normalizaIdOsLis(idOsLis)

        if (codigosDoPaciente.has(chave)) {
          doPaciente++
          const linha = await this.repo.findByCodigoLis(pacienteId, chave)
          if (linha && !linha.codigo_os) {
            await this.repo
              .setCodigoOs(linha.id, orderId)
              .catch((err) => log?.warn({ pacienteId, orderId, err }, 'setCodigoOs falhou'))
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
      log?.info({ pacienteId, total: ordens.length, doPaciente }, 'AOL orders/status OK')
    } catch (err) {
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
      laudos.push(...grupo)
      await this.#gravarSeMudou(linha, grupo, log)
    }

    // Nada a mostrar E o ApLIS falhou: devolver lista vazia aqui seria afirmar
    // que o paciente não tem exames, quando na verdade não conseguimos perguntar.
    if (laudos.length === 0 && falhaNaListagem) throw falhaNaListagem

    // Mesma ordenação do caminho cacheado (findByPaciente): mais recente primeiro.
    return laudos.sort((a, b) => (b.data_emissao ?? '').localeCompare(a.data_emissao ?? ''))
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
