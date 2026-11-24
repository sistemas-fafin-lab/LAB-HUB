import { createCipheriv } from 'node:crypto'
import { IntegrationError } from './errors.js'

// ---------------------------------------------------------------------------
// Cliente do SITE INTERNO do apLIS — só para os anexos "Laudo EXTERNO".
// ---------------------------------------------------------------------------
//
// A API de integração (`requisicaoImagem`, ver aplis.ts) só devolve as imagens
// dos tipos 1 e 5. O PDF do laboratório de apoio é o tipo 14 e só sai pelas
// chamadas que as telas do site fazem por trás (`/areas/shared/imagem.php`).
//
// SEM CONTRATO. Isto não é API do fornecedor: pode mudar sem aviso. Por isso
// toda falha — login, 3xx, 404, 500, JSON em outro formato, arquivo que não é
// PDF — sai como `IntegrationError('aplis-site')`, e quem chama trata como
// "sem dado do PDF", nunca como erro para o paciente.
//
// SOMENTE LEITURA, de propósito e por construção: o módulo de imagens do site
// também grava (`salvarImagem`, `deleteImagem`, `inativarImagem`…) e o usuário
// configurado pode ter permissão para isso. Aqui existem DUAS leituras e nada
// mais; não acrescente uma função de gravação a este arquivo.
//
// LOGIN É RECURSO COMPARTILHADO. Recusas seguidas ativam captcha para TODOS que
// usam o mesmo usuário (inclusive outros sistemas do laboratório). Depois de
// uma recusa, nenhuma nova tentativa por 10 minutos — ver `TravaLogin`.

const TIMEOUT_MS = 20_000
const ESPERA_APOS_RECUSA_MS = 10 * 60 * 1000
const TIPO_LAUDO_EXTERNO = 14
/** Teto do anexo em memória. O maior laudo da amostra tinha poucas centenas de KB. */
const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024

const CAMINHO_LOGIN = '/index.php'
const CAMINHO_AUTENTICAR = '/areas/shared/autenticar.php'
const CAMINHO_LOGOFF = '/areas/shared/logoff.php'
const CAMINHO_IMAGEM = '/areas/shared/imagem.php'

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export interface AplisSiteConfig {
  url: string
  usuario: string
  senha: string
}

/**
 * Lê `APLIS_WEB_URL`, `APLIS_WEB_USUARIO` e `APLIS_WEB_SENHA`. Faltando
 * qualquer uma devolve `null` e o caminho do PDF fica inerte.
 *
 * Não cai em `APLIS_USUARIO`/`APLIS_SENHA` de propósito: o site deve ser
 * acessado por um usuário próprio e somente leitura, e herdar a credencial da
 * API de integração em silêncio ligaria o caminho sem ninguém ter decidido.
 */
export function lerConfigAplisSite(
  env: Record<string, string | undefined> = process.env,
): AplisSiteConfig | null {
  const url = env.APLIS_WEB_URL?.trim().replace(/\/+$/, '')
  const usuario = env.APLIS_WEB_USUARIO?.trim()
  const senha = env.APLIS_WEB_SENHA?.trim()
  return url && usuario && senha ? { url, usuario, senha } : null
}

// ---------------------------------------------------------------------------
// Trava de login
// ---------------------------------------------------------------------------

/**
 * Onde fica registrado o instante da última recusa de login. É uma interface
 * porque o alcance certo depende de quem roda: no servidor basta a memória do
 * processo; um script de linha de comando precisa de algo que sobreviva à
 * execução, senão rodar duas vezes seguidas são duas recusas.
 */
export interface TravaLogin {
  /** Epoch em ms da última recusa, ou `null` se não houve. */
  recusadoEm(): number | null
  registrarRecusa(quando: number): void
  limpar(): void
}

export class TravaLoginEmMemoria implements TravaLogin {
  #quando: number | null = null

  recusadoEm(): number | null {
    return this.#quando
  }

  registrarRecusa(quando: number): void {
    this.#quando = quando
  }

  limpar(): void {
    this.#quando = null
  }
}

/** Compartilhada por todas as instâncias do processo que não receberem outra. */
const travaDoProcesso = new TravaLoginEmMemoria()

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Um anexo "Laudo EXTERNO" (tipo 14) ativo de uma requisição. */
export interface AnexoLaudoExterno {
  /** `requisicaoimagem.IdRequisicaoImagem` (o `IdRI` da listagem). */
  idAnexo: string
  nomeArquivo: string
  /** O anexo foi marcado como retificação de um laudo anterior. */
  retificacao: boolean
}

export interface IAplisSiteService {
  /**
   * Anexos tipo 14 ativos da requisição. `idRequisicao` é o id interno (vem do
   * `requisicaoListar`); `codRequisicao` é conferido contra o que a listagem
   * diz ser a requisição daquele id.
   */
  listarLaudosExternos(idRequisicao: string, codRequisicao: string): Promise<AnexoLaudoExterno[]>
  /** O PDF do anexo, em memória. Nada é gravado em disco. */
  baixarAnexo(anexo: AnexoLaudoExterno): Promise<Uint8Array>
}

interface Sessao {
  cookies: Map<string, string>
  au: string
}

function falha(mensagem: string, contexto: Record<string, unknown> = {}): IntegrationError {
  return new IntegrationError(`apLIS site: ${mensagem}`, 'aplis-site', contexto)
}

/** Igual ao `encriptar` do js/index.js do site: AES-CBC/PKCS7, chave e IV em hex → Base64. */
function encriptar(texto: string, chaveHex: string, ivHex: string): string {
  const chave = Buffer.from(chaveHex, 'hex')
  const cifra = createCipheriv(`aes-${chave.length * 8}-cbc`, chave, Buffer.from(ivHex, 'hex'))
  return Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]).toString('base64')
}

function campoOculto(html: string, id: string): string {
  const achado = new RegExp(`id="${id}"\\s+value="([^"]*)"`).exec(html)
  if (!achado?.[1]) throw falha(`campo #${id} ausente na página de login — o site mudou?`, { campo: id })
  return achado[1]
}

const ehRedirecionamento = (res: Response): boolean => res.status >= 300 && res.status < 400

export class AplisSiteService implements IAplisSiteService {
  readonly #config: AplisSiteConfig
  readonly #trava: TravaLogin
  #sessao: Sessao | null = null
  /** Login em andamento, para chamadas simultâneas não abrirem duas sessões. */
  #entrando: Promise<Sessao> | null = null

  constructor(config: AplisSiteConfig, opcoes: { trava?: TravaLogin } = {}) {
    this.#config = config
    this.#trava = opcoes.trava ?? travaDoProcesso
  }

  async listarLaudosExternos(idRequisicao: string, codRequisicao: string): Promise<AnexoLaudoExterno[]> {
    const contexto = { funcao: 'listarImagem', idRequisicao, codRequisicao }
    const res = await this.#ler('listarImagem', { id: idRequisicao, rn: String(Date.now()) }, contexto)

    let corpo: { Lista?: unknown; Info?: { CodRequisicao?: unknown } }
    try {
      corpo = (await res.json()) as typeof corpo
    } catch {
      throw falha('listarImagem: resposta não é JSON', contexto)
    }
    if (!Array.isArray(corpo?.Lista)) {
      throw falha('listarImagem: resposta em formato inesperado', contexto)
    }

    // O id interno e o código da requisição chegam aqui por caminhos diferentes.
    // Se a listagem for de outra requisição, os anexos são de outro pedido —
    // possivelmente de outro paciente. O contexto do erro leva só os códigos;
    // o `Info` também traz o nome do paciente, que não sai daqui.
    const codigoListado = String(corpo.Info?.CodRequisicao ?? '')
    if (codigoListado !== codRequisicao) {
      throw falha('listarImagem: a listagem é de outra requisição', { ...contexto, codigoListado })
    }

    const anexos: AnexoLaudoExterno[] = []
    for (const item of corpo.Lista as Record<string, unknown>[]) {
      if (Number(item?.Tipo) !== TIPO_LAUDO_EXTERNO || Number(item?.Inativo ?? 0) !== 0) continue
      if (item.IdRI == null || !item.NomArquivo) {
        throw falha('listarImagem: anexo sem identificador', contexto)
      }
      anexos.push({
        idAnexo: String(item.IdRI),
        nomeArquivo: String(item.NomArquivo),
        retificacao: Number(item.Retificacao ?? 0) !== 0,
      })
    }
    return anexos
  }

  async baixarAnexo(anexo: AnexoLaudoExterno): Promise<Uint8Array> {
    const contexto = { funcao: 'downloadImagem', idAnexo: anexo.idAnexo }
    const res = await this.#ler('downloadImagem', { id: anexo.idAnexo, nom: anexo.nomeArquivo }, contexto)

    // O tamanho declarado é conferido ANTES de puxar o corpo para a memória; a
    // conferência depois da leitura cobre o servidor que não o declara.
    const declarado = Number(res.headers.get('content-length') ?? 0)
    if (declarado > TAMANHO_MAXIMO_BYTES) {
      throw falha('downloadImagem: anexo acima do tamanho máximo', { ...contexto, bytes: declarado })
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      throw falha(`downloadImagem: falha ao ler o arquivo (${err instanceof Error ? err.message : String(err)})`, contexto)
    }
    if (bytes.length > TAMANHO_MAXIMO_BYTES) {
      throw falha('downloadImagem: anexo acima do tamanho máximo', { ...contexto, bytes: bytes.length })
    }
    // Os quatro primeiros bytes, e não o Content-Type: uma página de erro com
    // status 200 é o que o site devolve quando algo dá errado.
    if (Buffer.from(bytes.subarray(0, 4)).toString('latin1') !== '%PDF') {
      throw falha('downloadImagem: o conteúdo não é um PDF', { ...contexto, bytes: bytes.length })
    }
    return bytes
  }

  /** Fecha a sessão no site. Opcional: a sessão ociosa cai sozinha em minutos. */
  async encerrar(): Promise<void> {
    const sessao = this.#sessao
    this.#sessao = null
    if (!sessao) return
    await this.#http(CAMINHO_LOGOFF, sessao.cookies).catch(() => undefined)
  }

  // -------------------------------------------------------------------------
  // Leitura autenticada
  // -------------------------------------------------------------------------

  /**
   * GET numa função do módulo de imagens, com a sessão da instância. As duas
   * funções aceitas estão no tipo: é a trava que mantém este cliente somente
   * leitura.
   */
  async #ler(
    funcao: 'listarImagem' | 'downloadImagem',
    params: Record<string, string>,
    contexto: Record<string, unknown>,
  ): Promise<Response> {
    const sessao = await this.#entrar()
    let res = await this.#chamar(funcao, params, sessao)

    // Qualquer 3xx = sessão expirada (a ociosa cai em menos de 5 minutos).
    // Refaz o login UMA vez; se ainda assim redirecionar, o problema é outro.
    if (ehRedirecionamento(res)) {
      // Só descarta a sessão que falhou: uma chamada simultânea pode já ter
      // relogado, e jogar fora a sessão nova custaria um login a mais.
      if (this.#sessao === sessao) this.#sessao = null
      res = await this.#chamar(funcao, params, await this.#entrar())
      if (ehRedirecionamento(res)) {
        throw falha(`${funcao}: sessão recusada mesmo após novo login`, { ...contexto, http_status: res.status })
      }
    }

    if (res.status !== 200) {
      throw falha(`${funcao}: HTTP ${res.status}`, { ...contexto, http_status: res.status })
    }
    return res
  }

  #chamar(funcao: 'listarImagem' | 'downloadImagem', params: Record<string, string>, sessao: Sessao): Promise<Response> {
    return this.#http(CAMINHO_IMAGEM, sessao.cookies, { query: { f: funcao, ...params, au: sessao.au } })
  }

  // -------------------------------------------------------------------------
  // Sessão
  // -------------------------------------------------------------------------

  #entrar(): Promise<Sessao> {
    if (this.#sessao) return Promise.resolve(this.#sessao)
    this.#entrando ??= this.#login()
      .then((sessao) => (this.#sessao = sessao))
      .finally(() => {
        this.#entrando = null
      })
    return this.#entrando
  }

  async #login(): Promise<Sessao> {
    const recusadoEm = this.#trava.recusadoEm()
    if (recusadoEm !== null) {
      const falta = recusadoEm + ESPERA_APOS_RECUSA_MS - Date.now()
      if (falta > 0) {
        throw falha(
          `login recusado há pouco — nova tentativa em ${Math.ceil(falta / 60_000)} min ` +
            '(recusas seguidas ativam captcha para todos que usam o mesmo usuário)',
          { funcao: 'login', espera_ms: falta },
        )
      }
    }

    const cookies = new Map<string, string>()
    const pagina = await this.#http(CAMINHO_LOGIN, cookies)
    if (pagina.status !== 200) {
      throw falha(`página de login: HTTP ${pagina.status}`, { funcao: 'login', http_status: pagina.status })
    }
    const html = await pagina.text()
    const ck = campoOculto(html, 'ck')
    const ci = campoOculto(html, 'ci')
    const au = campoOculto(html, 'auth_token')

    // Aceite da política de cookies (LGPD) que o site exige antes do login.
    await this.#http(CAMINHO_AUTENTICAR, cookies, { query: { f: 'prosseguir' }, form: { Prosseguir: '1' } })

    // A partir daqui as credenciais foram ENVIADAS: tudo que não for um
    // "sucesso" inequívoco conta como recusa, inclusive resposta ilegível. Na
    // dúvida a trava fecha — o custo de errar para o outro lado é captcha para
    // os outros sistemas do laboratório.
    let res: Response
    try {
      res = await this.#http(CAMINHO_AUTENTICAR, cookies, {
        form: {
          l: encriptar(this.#config.usuario, ck, ci),
          s: encriptar(this.#config.senha, ck, ci),
          t: au,
          w: '1280',
          f: '',
          c: '',
        },
      })
    } catch (err) {
      this.#trava.registrarRecusa(Date.now())
      throw err
    }
    const status = res.status
    const corpo = (await res.json().catch(() => null)) as {
      sucesso?: unknown
      tfa?: unknown
      vc?: unknown
    } | null

    if (status !== 200 || corpo?.sucesso !== true || corpo.tfa || corpo.vc) {
      this.#trava.registrarRecusa(Date.now())
      const motivo = corpo?.tfa
        ? 'pede 2FA'
        : corpo?.vc
          ? 'captcha ativado'
          : status === 200
            ? 'credenciais não aceitas'
            : `HTTP ${status}`
      // A mensagem do site não é repetida: pode ecoar o usuário.
      throw falha(`login recusado (${motivo}); nova tentativa só em 10 min`, {
        funcao: 'login',
        http_status: status,
      })
    }

    this.#trava.limpar()
    return { cookies, au }
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  async #http(
    caminho: string,
    cookies: Map<string, string>,
    opcoes: { query?: Record<string, string>; form?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = new URL(this.#config.url + caminho)
    for (const [chave, valor] of Object.entries(opcoes.query ?? {})) url.searchParams.set(chave, valor)

    let res: Response
    try {
      res = await fetch(url, {
        method: opcoes.form ? 'POST' : 'GET',
        headers: {
          Cookie: [...cookies].map(([chave, valor]) => `${chave}=${valor}`).join('; '),
          ...(opcoes.form ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
        },
        ...(opcoes.form ? { body: new URLSearchParams(opcoes.form).toString() } : {}),
        // O 3xx é o sinal de sessão expirada; seguir o redirecionamento
        // entregaria a página de login com status 200.
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      // Só o caminho no contexto: a query carrega o token da sessão.
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw falha(`${caminho}: timeout após ${TIMEOUT_MS}ms`, { caminho, timeout_ms: TIMEOUT_MS })
      }
      throw falha(`${caminho}: falha de rede (${err instanceof Error ? err.message : String(err)})`, { caminho })
    }

    for (const cabecalho of res.headers.getSetCookie?.() ?? []) {
      const par = cabecalho.split(';')[0] ?? ''
      const corte = par.indexOf('=')
      if (corte > 0) cookies.set(par.slice(0, corte).trim(), par.slice(corte + 1).trim())
    }
    return res
  }
}
