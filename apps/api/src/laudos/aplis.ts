import type {
  AplisLocal,
  AplisPaciente,
  AplisPainelMolecular,
  AplisProcedimento,
  AplisRequisicao,
  AplisResponsavel,
} from './types.js'
import { IntegrationError, ValidationError } from './errors.js'

// Cliente do ApLIS. Todas as operações são POST no MESMO endpoint, com o comando
// no corpo: { ver, cmd, dat }. A resposta vem envelopada em { ver, cmd, dat },
// e `dat.sucesso === 0` é erro LÓGICO com HTTP 200 — por isso não basta olhar
// res.ok.

const BASE_URL = process.env.APLIS_BASE_URL ?? 'https://lab.aplis.inf.br/api/integracao.php'
const USUARIO = process.env.APLIS_USUARIO ?? ''
const SENHA = process.env.APLIS_SENHA ?? ''
const VER = 2
const TIMEOUT_MS = 10_000

// Quantas páginas do requisicaoListar buscar em paralelo. O ApLIS não filtra por
// CPF na listagem (ver requisicaoListar), então uma varredura pode ter mais de
// cem páginas; sequencial demoraria minutos.
const LISTAR_CONCURRENCY = 10

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // Autenticação é opcional no ApLIS: instalações internas liberam por IP.
    ...(USUARIO
      ? { Authorization: `Basic ${Buffer.from(`${USUARIO}:${SENHA}`).toString('base64')}` }
      : {}),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AplisDat = Record<string, any>

// Executa um comando e devolve o `dat` da resposta. Toda falha (rede, timeout,
// HTTP, erro lógico) sai como IntegrationError com contexto.
async function comando(cmd: string, dat: Record<string, unknown>): Promise<AplisDat> {
  let res: Response
  try {
    res = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ver: VER, cmd, dat }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new IntegrationError(`ApLIS ${cmd}: timeout após ${TIMEOUT_MS}ms`, 'aplis', {
        cmd,
        timeout_ms: TIMEOUT_MS,
      })
    }
    throw new IntegrationError(
      `ApLIS ${cmd}: falha de rede (${err instanceof Error ? err.message : String(err)})`,
      'aplis',
      { cmd },
    )
  }

  if (!res.ok) {
    throw new IntegrationError(`ApLIS ${cmd}: HTTP ${res.status}`, 'aplis', {
      cmd,
      http_status: res.status,
      http_body: await res.text().catch(() => ''),
    })
  }

  let body: { dat?: AplisDat }
  try {
    body = (await res.json()) as { dat?: AplisDat }
  } catch {
    throw new IntegrationError(`ApLIS ${cmd}: resposta não é JSON`, 'aplis', { cmd })
  }

  const resposta = body?.dat ?? {}
  if (resposta.sucesso === 0) {
    throw new IntegrationError(
      `ApLIS ${cmd}: ${resposta.msgErro ?? 'erro desconhecido'}`,
      'aplis',
      { cmd, codErro: resposta.codErro, msgErro: resposta.msgErro },
    )
  }
  return resposta
}

// ---------------------------------------------------------------------------
// Parsers — o ApLIS varia o nome dos campos entre versões e entre módulos
// (laboratório × patologia), daí as cadeias de fallback.
// ---------------------------------------------------------------------------

function parsePaciente(data: AplisDat): AplisPaciente {
  return {
    nome: String(data?.nome ?? data?.nomePaciente ?? ''),
    cpf: String(data?.cpf ?? data?.documento ?? ''),
    data_nascimento: data?.dtaNasc ?? data?.data_nascimento ?? data?.dataNascimento ?? null,
    sexo: data?.sexo ?? null,
    matricula_convenio: data?.matConvenio ?? undefined,
  }
}

function parseProcedimento(data: AplisDat): AplisProcedimento {
  return {
    codigo: String(data?.codigo ?? data?.num ?? data?.codigoExame ?? ''),
    nome: String(data?.nome ?? data?.nomeExame ?? data?.descricao ?? ''),
    // Patologia devolve o texto do laudo em laudoMicro/laudoMacro; o laboratório
    // devolve valor numérico em resultado/valor.
    resultado: data?.resultado ?? data?.valor ?? data?.laudoMicro ?? data?.laudoMacro ?? null,
    unidade: data?.unidade ?? null,
    valor_referencia: data?.valor_referencia ?? data?.referencia ?? null,
    valor_total: data?.valorTotal ?? undefined,
    status: data?.status ?? undefined,
  }
}

function parseLocal(data: AplisDat): AplisLocal {
  return {
    nome: String(data?.nome ?? data?.laboratório ?? data?.nomeLocal ?? ''),
    endereco: data?.endereco ?? data?.endereço ?? null,
    numero: data?.numero ?? data?.nro ?? null,
    cnes: data?.cnes ?? undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comoLista = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/**
 * Reduz o HTML dos laudos de patologia (laudoMicro/notas) a texto puro. Os
 * laudos usam só <b>/<i>/<br> e entidades básicas — não é um parser de HTML,
 * é o suficiente para o que o ApLIS emite.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Painéis de biologia molecular (dat.exames[]) — o formato do PCR. Cada exame
 * é um painel com uma lista de alvos; a conclusão interpretada (Positivo/
 * Negativo) vem em desConclusao/textoConclusao. O `resultado` numérico é o Ct
 * da reação e fica de fora: sem contexto ele só confundiria o paciente.
 */
export function parsePaineisMoleculares(data: AplisDat): AplisPainelMolecular[] {
  return comoLista(data?.exames)
    .map((ex) => ({
      nome: String(ex?.titulo ?? '').trim(),
      metodo: ex?.metodo ?? null,
      referencia: (ex?.referencias ?? null) && String(ex.referencias).trim(),
      resultados: comoLista(ex?.resultados).map((r) => ({
        nome: String(r?.tituloResultado ?? r?.tituloConclusao ?? '').trim(),
        conclusao: r?.desConclusao ?? r?.textoConclusao ?? null,
      })),
    }))
    .filter((p) => p.nome && p.resultados.length > 0)
}

/**
 * Laudo descritivo de patologia/citologia: macroscopia (descrição da amostra)
 * seguida do laudoMicro de cada diagnóstico — a estrutura que a colpocitologia
 * usa (procedimentos[].topografias[].diagnosticos[]).
 */
export function parseLaudoTexto(data: AplisDat): string | null {
  const blocos: string[] = []
  for (const proc of comoLista(data?.procedimentos)) {
    for (const topo of comoLista(proc?.topografias)) {
      if (topo?.laudoMacro) blocos.push(`MACROSCOPIA:\n${stripHtml(String(topo.laudoMacro))}`)
      for (const diag of comoLista(topo?.diagnosticos)) {
        if (diag?.laudoMicro) blocos.push(stripHtml(String(diag.laudoMicro)))
      }
    }
  }
  return blocos.length ? blocos.join('\n\n') : null
}

/** Quem assina: o patologista quando há, senão o primeiro assinante dos painéis. */
export function parseResponsavel(data: AplisDat): AplisResponsavel | null {
  const bruto = data?.patologista1 ?? comoLista(data?.exames)[0]?.assinatura1 ?? null
  if (!bruto?.nome) return null
  return {
    nome: String(bruto.nome).trim(),
    crm: [bruto.crm, bruto.uf]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' '),
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface IAplisService {
  requisicaoListar(cpf: string, periodoIni: string, periodoFim: string): Promise<AplisRequisicao[]>
  requisicaoResultado(codRequisicao: string): Promise<AplisRequisicao>
}

export class AplisService implements IAplisService {
  /**
   * Lista as requisições de um paciente numa janela de datas.
   *
   * O filtro por paciente vai no `nomPaciente` ("Nome ou CPF do paciente" no
   * perfil de usuário interno, doc apLIS v2 §9 — existe desde 12/09/2023). O
   * filtro local por CPF logo abaixo é rede de segurança: se a instalação for
   * antiga e ignorar o campo, a varredura ainda devolve só o paciente certo.
   *
   * Instalações no perfil EXTERNO usam `pesquisa` no lugar de `nomPaciente`.
   */
  async requisicaoListar(
    cpf: string,
    periodoIni: string,
    periodoFim: string,
  ): Promise<AplisRequisicao[]> {
    const cpfDigits = cpf.replace(/\D/g, '')
    if (cpfDigits.length !== 11) {
      throw new ValidationError('CPF inválido para consulta no ApLIS', { cpf: `${cpfDigits.slice(0, 3)}***` })
    }

    const primeira = await this.#listarPagina(periodoIni, periodoFim, 1, cpfDigits)
    const totalPaginas: number = primeira.qtdPaginas ?? 1
    let itens: AplisDat[] = primeira.lista ?? []

    for (let inicio = 2; inicio <= totalPaginas; inicio += LISTAR_CONCURRENCY) {
      const lote = Array.from(
        { length: Math.min(LISTAR_CONCURRENCY, totalPaginas - inicio + 1) },
        (_, i) => inicio + i,
      )
      const paginas = await Promise.all(
        lote.map((p) =>
          this.#listarPagina(periodoIni, periodoFim, p, cpfDigits)
            .then((d) => (d.lista ?? []) as AplisDat[])
            // Página que falha é silenciada de propósito: perder uma página é
            // perder alguns laudos daquela varredura (a próxima os pega), e
            // abortar o lote inteiro perderia todos.
            .catch(() => [] as AplisDat[]),
        ),
      )
      for (const pagina of paginas) itens = itens.concat(pagina)
    }

    return itens
      .filter((item) => String(item.CPF ?? item.Cpf ?? item.cpf ?? '').replace(/\D/g, '') === cpfDigits)
      .map((item) => ({
        cod_requisicao: String(item.CodRequisicao ?? item.codRequisicao ?? ''),
        data_solicitacao: item.DtaSolicitacao ?? null,
        data_liberacao: item.DtaFinalizacao ?? null,
        tipo_exame: item.NomExame ?? null,
        paciente: {
          nome: String(item.NomPaciente ?? ''),
          cpf: cpfDigits,
          data_nascimento: null,
          sexo: null,
        },
        // A listagem é só a capa da requisição; os procedimentos e o resultado
        // vêm do requisicaoResultado, um por requisição.
        procedimentos: [],
        local: { nome: String(item.NomFantasia ?? ''), endereco: null, numero: null },
      }))
  }

  async #listarPagina(
    periodoIni: string,
    periodoFim: string,
    pagina: number,
    cpf: string,
  ): Promise<AplisDat> {
    // tipoData: 1 = filtra pela data de solicitação.
    return comando('requisicaoListar', {
      tipoData: 1,
      periodoIni,
      periodoFim,
      pagina,
      nomPaciente: cpf,
    })
  }

  async requisicaoResultado(codRequisicao: string): Promise<AplisRequisicao> {
    if (!codRequisicao) {
      throw new ValidationError('codRequisicao é obrigatório', { codRequisicao })
    }

    const dat = await comando('requisicaoResultado', { codRequisicao })

    return {
      cod_requisicao: dat?.codRequisicao ?? codRequisicao,
      data_solicitacao: dat?.dtaColeta ?? dat?.dtaEntrada ?? null,
      data_liberacao: dat?.dtaSaida ?? null,
      tipo_exame: dat?.nomExame ?? null,
      paciente: parsePaciente(dat?.paciente ?? {}),
      procedimentos: (dat?.procedimentos ?? []).map(parseProcedimento),
      local: parseLocal(dat?.localOrigem ?? {}),
      paineis: parsePaineisMoleculares(dat),
      laudo_texto: parseLaudoTexto(dat),
      responsavel: parseResponsavel(dat),
    }
  }
}
