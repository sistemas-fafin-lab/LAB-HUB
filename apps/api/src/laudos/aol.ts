import { XMLParser } from 'fast-xml-parser'
import type { AolAnalito, AolExam } from './types.js'
import { IntegrationError, ValidationError } from './errors.js'

// Cliente do AOL (Álvaro Online). Diferente do ApLIS em tudo: é PUT, o corpo é
// XML e a resposta também. A senha viaja no próprio XML além do header Basic —
// é o que o webservice exige.

// HTTPS: é a URL de produção na doc de referência da AOL. O default anterior era
// http:// — em texto puro trafegariam as credenciais Basic e o laudo do paciente.
const BASE_URL = process.env.AOL_BASE_URL ?? 'https://webservice.alvaro.com.br'
const IDAGENTE = process.env.AOL_IDAGENTE ?? ''
const SENHA = process.env.AOL_SENHA ?? ''
const ENTIDADE = process.env.AOL_ENTIDADE ?? ''
const TIMEOUT_MS = 15_000

function basicAuth(): string {
  return `Basic ${Buffer.from(`${IDAGENTE}:${SENHA}`).toString('base64')}`
}

// Os dados do AOL vêm quase todos em ATRIBUTOS, não em nós de texto — daí o
// prefixo '@_'. `isArray` força os nós repetíveis a serem sempre array: sem isso
// uma solicitação com um único exame viraria objeto e quebraria o .map().
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) =>
    ['solicitacao', 'exame', 'resultado', 'amostra', 'material', 'paciente'].includes(name),
})

function buildResultadosXml(codigoOs: string): string {
  // exame codigo="" = todos os exames da solicitação.
  return `<?xml version="1.0" encoding="UTF-8"?>
<resultados idagente="${IDAGENTE}" lis="LAB-HUB" operador="API" senha="${SENHA}">
  <entidade codigo="${ENTIDADE}">
    <solicitacao idAlvaro="${codigoOs}">
      <exame codigo="" />
    </solicitacao>
  </entidade>
</resultados>`
}

// `?referenciaResultado=true` faz o XML vir com um <valorreferencia> (CDATA de
// texto livre) por exame do cadastro — sem ele, nenhum analito tem faixa de
// referência (o ApLIS de teste também não manda).
const QUERY_RESULTADOS = '?referenciaResultado=true'

// ---------------------------------------------------------------------------
// Parsing do XML
//
// A resposta tem duas metades: `cadastros` (dicionários — o que cada código
// significa) e `solicitacao` (os resultados, que referenciam esses códigos).
// Os mapas abaixo resolvem uma pela outra.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LinhaInfo {
  descricao: string
  unidade: string
}
interface ExameInfo {
  descricao: string
  linhas: Map<string, LinhaInfo>
  // Texto cru do <valorreferencia>: UM por exame, cobrindo todas as linhas.
  referencia: string | null
}

// fast-xml-parser devolve nó único como objeto e repetido como array, exceto os
// que forçamos em `isArray`. Este helper normaliza o resto.
function comoArray(valor: any): any[] {
  if (Array.isArray(valor)) return valor
  return valor ? [valor] : []
}

// código do material → descrição ("01" → "soro")
function buildMaterialMap(cadastros: any): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of comoArray(cadastros?.materiais?.material)) {
    const cod = String(m?.['@_codigo'] ?? '')
    if (cod) map.set(cod, String(m?.['@_descricao'] ?? '').toLowerCase())
  }
  return map
}

// código do exame → nome + dicionário de linhas de resultado (os analitos)
function buildExameMap(cadastros: any): Map<string, ExameInfo> {
  const map = new Map<string, ExameInfo>()
  for (const ex of comoArray(cadastros?.exame)) {
    const cod = String(ex?.['@_codigo'] ?? '')
    if (!cod) continue

    const linhas = new Map<string, LinhaInfo>()
    for (const l of comoArray(ex?.linhasresultado?.linha)) {
      const lCod = String(l?.['@_codigo'] ?? '')
      if (lCod) {
        linhas.set(lCod, {
          descricao: String(l?.['@_descricao'] ?? ''),
          unidade: String(l?.['@_unidade'] ?? ''),
        })
      }
    }
    const referencia = comoArray(ex?.valorreferencia).map(String).join('\n\n').trim() || null
    map.set(cod, { descricao: String(ex?.['@_descricao'] ?? ''), linhas, referencia })
  }
  return map
}

// ---------------------------------------------------------------------------
// Distribuição do <valorreferencia> pelos analitos
// ---------------------------------------------------------------------------

// Casa o rótulo do bloco com a descrição da linha tolerando as variações que a
// própria AOL comete ("Anti-T. pallidum" × "Anti-T.Pallidum").
function chaveRotulo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Reparte o texto do <valorreferencia> entre as linhas (analitos) do exame.
 *
 * O texto vem em blocos separados por linha em branco; num exame multi-analito
 * cada bloco abre com "<descrição da linha>: ". As regras, na ordem:
 *  - bloco cujo rótulo casa com uma linha → referência daquela linha;
 *  - bloco sem rótulo conhecido → continuação do bloco anterior (a AOL usa
 *    linha em branco também DENTRO de uma referência longa);
 *  - rótulo repetido → o primeiro vence;
 *  - exame de UMA linha sem rótulos → o texto inteiro é dela;
 *  - multi-analito sem rótulo nenhum → descarta tudo. É o caso do HEMOGRAMA,
 *    cujo texto é uma tabela gigante sem rótulos (centenas de linhas, muitas
 *    "0,0 a 0,0") — inutilizável na tela.
 */
export function distribuiReferencias(
  texto: string | null,
  linhas: Map<string, LinhaInfo>,
): Map<string, string> {
  const porLinha = new Map<string, string>()
  if (!texto) return porLinha

  const rotuloParaCod = new Map<string, string>()
  for (const [cod, info] of linhas) {
    const chave = chaveRotulo(info.descricao)
    if (chave && !rotuloParaCod.has(chave)) rotuloParaCod.set(chave, cod)
  }

  const blocos = texto.split(/\n[ \t]*\n/)
  let codAtual: string | null = null

  for (const bloco of blocos) {
    const corpo = bloco.trim()
    if (!corpo) continue

    const [primeira = '', ...resto] = corpo.split('\n')
    const rotulo = /^(.{1,120}?):[ \t]*$/.exec(primeira.trim())
    const cod = rotulo ? rotuloParaCod.get(chaveRotulo(rotulo[1]!)) : undefined

    if (cod !== undefined) {
      codAtual = cod
      const semRotulo = resto.join('\n').trim()
      if (semRotulo && !porLinha.has(cod)) porLinha.set(cod, semRotulo)
    } else if (codAtual !== null && porLinha.has(codAtual)) {
      porLinha.set(codAtual, `${porLinha.get(codAtual)}\n${corpo}`)
    }
  }

  // Sem nenhum rótulo casado: texto é do exame como um todo. Só dá para
  // atribuir quando o exame tem uma linha só.
  if (porLinha.size === 0 && linhas.size === 1) {
    const unica = linhas.keys().next().value as string
    porLinha.set(unica, texto.trim())
  }

  return porLinha
}

// índice da amostra na solicitação → material já resolvido
function buildAmostraMap(sol: any, materialMap: Map<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const a of comoArray(sol?.amostras?.amostra)) {
    const idx = String(a?.['@_codigo'] ?? '')
    const matCod = String(a?.['@_material'] ?? '')
    if (idx) map.set(idx, materialMap.get(matCod) ?? matCod)
  }
  return map
}

function mapAnalitos(rawResultados: any[], cadastro: ExameInfo | undefined): AolAnalito[] {
  const referencias = distribuiReferencias(cadastro?.referencia ?? null, cadastro?.linhas ?? new Map())
  return rawResultados.map((r) => {
    const linhaCod = String(r?.['@_linharesultado'] ?? '')
    const linha = cadastro?.linhas.get(linhaCod)
    return {
      // Sem o cadastro correspondente sobra o código cru — feio na tela, mas
      // melhor que descartar o valor.
      nome: linha?.descricao ?? linhaCod,
      valor: r?.['@_resultado'] ?? null,
      unidade: linha?.unidade ?? r?.['@_unidade'] ?? null,
      // Texto livre do <valorreferencia> do exame, repartido por analito. Pode
      // ser tabela estratificada por idade/sexo — quem simplifica é o mapper.
      referencia: referencias.get(linhaCod) ?? null,
    }
  })
}

// CPF de um nó <paciente>. O atributo é `codigo_lis` (confirmado em resposta
// real de produção, OS 379779766 em 27/07/2026); a varredura dos demais
// atributos é rede de segurança para instalações que nomeiem diferente.
function cpfDoNoPaciente(p: any): string | null {
  const direto = String(p?.['@_codigo_lis'] ?? '').replace(/\D/g, '')
  if (direto.length === 11) return direto

  for (const [chave, valor] of Object.entries(p ?? {})) {
    if (!chave.startsWith('@_')) continue
    const digitos = String(valor ?? '').replace(/\D/g, '')
    if (digitos.length === 11) return digitos
  }
  return null
}

/**
 * código do paciente → CPF. É o dicionário que a barreira de identidade usa.
 *
 * O <paciente> é um CADASTRO (fica em <cadastros><pacientes>), como materiais e
 * exames — a <solicitacao> só o referencia pelo atributo `paciente`:
 *
 *   <cadastros><pacientes>
 *     <paciente codigo="442086219" codigo_lis="179.532.547-00" nome="..."/>
 *   </pacientes></cadastros>
 *   <solicitacao codigo="379779766" paciente="442086219" .../>
 *
 * NÃO usar o `<solicitacao codigo_lis>`: ele às vezes traz o codRequisicao do
 * ApLIS e às vezes o CPF, variando por origem (LAUDOS_LIS.md, "Pendência
 * conhecida"). Um campo que muda de significado não serve de identidade.
 */
export function buildPacienteMap(cadastros: any): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of comoArray(cadastros?.pacientes?.paciente)) {
    const cod = String(p?.['@_codigo'] ?? '')
    const cpf = cpfDoNoPaciente(p)
    if (cod && cpf) map.set(cod, cpf)
  }
  return map
}

function parseSolicitacao(
  sol: any,
  exameMap: Map<string, ExameInfo>,
  materialMap: Map<string, string>,
  pacienteMap: Map<string, string>,
): AolExam[] {
  const codigoOs = String(sol?.['@_codigo'] ?? '')
  const dataColeta = sol?.['@_dataColeta'] ?? sol?.['@_data_coleta'] ?? null
  const dataLaudo = sol?.['@_data_laudo'] ?? null
  const amostraMap = buildAmostraMap(sol, materialMap)
  // null quando o cadastro não trouxer o paciente: vira veredito `indisponivel`
  // e NÃO bloqueia (ver laudos/identidade.ts).
  const pacienteCpf = pacienteMap.get(String(sol?.['@_paciente'] ?? '')) ?? null

  return comoArray(sol?.exame).map((ex): AolExam => {
    const exCodigo = String(ex?.['@_codigo'] ?? '')
    const cadastro = exameMap.get(exCodigo)
    const rawResultados = comoArray(ex?.resultado)

    return {
      codigo_os: codigoOs,
      data_solicitacao: dataColeta,
      data_liberacao: ex?.['@_dataresultado'] ?? dataLaudo,
      nome_exame: cadastro?.descricao ?? exCodigo,
      codigo_tipo: exCodigo,
      status: ex?.['@_normal'] === 'S' ? 'normal' : (ex?.['@_normal'] ?? null),
      // O material do exame é o da primeira amostra: um exame pode ter mais de
      // uma, mas na prática o laudo exibe uma só.
      material: amostraMap.get(String(rawResultados[0]?.['@_amostra'] ?? '')) ?? null,
      metodo: ex?.['@_metodo'] ?? null,
      doctor: ex?.['@_responsaveltecnico'] ?? null,
      crm_documento: ex?.['@_responsaveltecnicodocumento'] ?? null,
      paciente_cpf: pacienteCpf,
      analitos: mapAnalitos(rawResultados, cadastro),
    }
  })
}

function parseResultados(xml: string): AolExam[] {
  const root: any = parser.parse(xml)
  const resultados: any = root?.resultados ?? root?.Resultados ?? {}
  const materialMap = buildMaterialMap(resultados?.cadastros ?? {})
  const exameMap = buildExameMap(resultados?.cadastros ?? {})
  const pacienteMap = buildPacienteMap(resultados?.cadastros ?? {})

  return comoArray(resultados?.solicitacao).flatMap((sol) =>
    parseSolicitacao(sol, exameMap, materialMap, pacienteMap),
  )
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Descoberta de OS por CPF (Status Consolidado — GET /v1/orders/status)
// ---------------------------------------------------------------------------

// Registro da listagem. Só os campos que usamos: `idOsLis` é o campo da Álvaro
// para o identificador da OS NO LIS — preenchido À MÃO pela recepção do
// laboratório. Medição de 22/07/2026 (528 OS / 90 dias): 65% trazem o
// codRequisicao do ApLIS (13 dígitos), 30% vêm vazios e o resto é erro de
// digitação (letra "O" no lugar do zero, dígito a menos) ou o CPF do paciente.
// `?cpf=` e afins são ignorados pelo endpoint (verificado em 21/07/2026).
interface OrderStatusRecord {
  orderId?: number | string
  idOsLis?: string
}

interface OrderStatusPage {
  data?: OrderStatusRecord[]
  hasNext?: boolean
  nextCursor?: string
}

/** Registro de OS já reduzido ao que o serviço precisa para casar com o paciente. */
export interface AolOrderRef {
  orderId: string
  idOsLis: string
}

/**
 * Normaliza o `idOsLis` digitado à mão: caixa alta, letra "O" → zero e sem
 * separadores. "OO4OOO1920006" → "0040001920006"; "179.532.547-00" →
 * "17953254700". O que sobrar com letra (ex.: "SOL-2901101") não casa com nada,
 * de propósito.
 */
export function normalizaIdOsLis(bruto: string): string {
  return bruto.toUpperCase().replace(/O/g, '0').replace(/[^0-9A-Z]/g, '')
}

// Teto da varredura. Num período de ~75 dias a entidade rendeu 24 páginas; o
// teto segura um período atipicamente cheio sem deixar a request pendurada.
const MAX_PAGINAS_ORDERS = 40

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface IAolService {
  fetchExam(codigoOs: string): Promise<AolExam[]>
  listOrders(dataInicial: string, dataFinal: string): Promise<AolOrderRef[]>
}

export class AolService implements IAolService {
  /** Busca os exames de uma OS. Uma OS pode render vários AolExam (um por tipo). */
  async fetchExam(codigoOs: string): Promise<AolExam[]> {
    const xml = await this.fetchXml(codigoOs)
    try {
      return parseResultados(xml)
    } catch (err) {
      throw new IntegrationError('AOL resultados: falha ao parsear o XML', 'aol', {
        codigoOs,
        cause: err,
      })
    }
  }

  /**
   * A resposta CRUA do PUT /v2/resultados, sem parsear.
   *
   * Existe para o `fetchExam` e para `scripts/auditar-vinculos.ts --dump-xml`,
   * que precisa do XML original para confirmar em qual atributo do nó
   * <paciente> a AOL manda o CPF (ver extrairCpfPaciente). Fazer o script
   * remontar a requisição por fora duplicaria credenciais e o corpo XML.
   */
  async fetchXml(codigoOs: string): Promise<string> {
    if (!codigoOs) {
      throw new ValidationError('codigoOs é obrigatório', { codigoOs })
    }

    const url = `${BASE_URL}/webserviceaol/rest/producao/v2/resultados${QUERY_RESULTADOS}`

    let res: Response
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml', Authorization: basicAuth() },
        body: buildResultadosXml(codigoOs),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new IntegrationError(`AOL resultados: timeout após ${TIMEOUT_MS}ms`, 'aol', {
          codigoOs,
          timeout_ms: TIMEOUT_MS,
        })
      }
      throw new IntegrationError(
        `AOL resultados: falha de rede (${err instanceof Error ? err.message : String(err)})`,
        'aol',
        { codigoOs },
      )
    }

    if (!res.ok) {
      throw new IntegrationError(`AOL resultados: HTTP ${res.status}`, 'aol', {
        codigoOs,
        http_status: res.status,
      })
    }

    return res.text()
  }

  /**
   * Lista as OS da entidade no período, reduzidas a { orderId, idOsLis }.
   * Quem casa cada OS com o paciente (por codRequisicao ou CPF) é o serviço.
   *
   * ⚠ CUSTO: a listagem NÃO filtra por paciente — isto pagina TODAS as OS da
   * entidade no período. Serve para a fatia de teste; em produção precisa virar
   * um job de fundo que varre uma vez e alimenta um índice compartilhado entre
   * pacientes (ver docs/LAUDOS_LIS.md).
   */
  async listOrders(dataInicial: string, dataFinal: string): Promise<AolOrderRef[]> {
    if (!dataInicial || !dataFinal) {
      throw new ValidationError('período é obrigatório', { dataInicial, dataFinal })
    }

    const ordens: AolOrderRef[] = []
    let cursor: string | null = null

    for (let pagina = 0; pagina < MAX_PAGINAS_ORDERS; pagina++) {
      const url = new URL(`${BASE_URL}/webserviceaol/rest/producao/v1/orders/status/${ENTIDADE}`)
      url.searchParams.set('dataInicial', dataInicial)
      url.searchParams.set('dataFinal', dataFinal)
      if (cursor) url.searchParams.set('nextCursor', cursor)

      let res: Response
      try {
        res = await fetch(url, {
          headers: { Authorization: basicAuth() },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new IntegrationError(`AOL orders/status: timeout após ${TIMEOUT_MS}ms`, 'aol', {
            pagina,
            timeout_ms: TIMEOUT_MS,
          })
        }
        throw new IntegrationError(
          `AOL orders/status: falha de rede (${err instanceof Error ? err.message : String(err)})`,
          'aol',
          { pagina },
        )
      }

      if (!res.ok) {
        throw new IntegrationError(`AOL orders/status: HTTP ${res.status}`, 'aol', {
          pagina,
          http_status: res.status,
        })
      }

      let corpo: OrderStatusPage
      try {
        corpo = (await res.json()) as OrderStatusPage
      } catch (err) {
        throw new IntegrationError('AOL orders/status: resposta não é JSON', 'aol', {
          pagina,
          cause: err,
        })
      }

      for (const reg of corpo.data ?? []) {
        if (reg.orderId != null && reg.idOsLis) {
          ordens.push({ orderId: String(reg.orderId), idOsLis: String(reg.idOsLis) })
        }
      }

      if (!corpo.hasNext || !corpo.nextCursor) break
      cursor = corpo.nextCursor
    }

    return ordens
  }
}
