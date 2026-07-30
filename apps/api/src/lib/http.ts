// Configuração da borda HTTP: CORS, cabeçalhos de segurança e o que o logger
// pode ou não gravar. Fica fora do `server.ts` porque lá o módulo se auto-inicia
// (`void start()`) e não dá para importar num teste.

/**
 * Origens de frontend aceitas pelo CORS.
 *
 * Em produção, `CORS_ORIGIN` é OBRIGATÓRIA e a ausência derruba o boot. O
 * fallback de dev libera qualquer porta de localhost — o Vite troca de porta
 * (5173 → 5174 → …) quando a anterior está ocupada —, e essa mesma permissão
 * escapando para produção deixaria qualquer página em `http://localhost` de
 * qualquer máquina falar com a API com credenciais. O `.env.example` já avisava
 * que a variável é obrigatória; aviso que depende de alguém lembrar é aviso que
 * um dia falta, então aqui ele vira falha.
 *
 * Uma entrada entre barras (ex.: `/^https:\/\/.*\.vercel\.app$/`) vira RegExp —
 * útil p/ os previews da Vercel, cujo subdomínio muda a cada deploy.
 */
export function resolverCorsOrigin(): (string | RegExp)[] {
  const bruto = process.env.CORS_ORIGIN?.trim()
  const origens = bruto
    ? bruto
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => (o.startsWith('/') && o.endsWith('/') ? new RegExp(o.slice(1, -1)) : o))
    : []

  if (origens.length > 0) return origens

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ORIGIN é obrigatória em produção: defina o(s) domínio(s) do frontend separados por vírgula.',
    )
  }
  return [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
}

/**
 * Caminhos que o pino substitui por `[Redacted]`.
 *
 * Os serializers padrão do Fastify não gravam headers, então o `authorization`
 * não vaza hoje — as entradas de header aqui são para o dia em que alguém ligar
 * um logger mais verboso. Já os `*.cpf` / `*.password` valem agora: qualquer
 * `log.info({ paciente })` ou `log.error({ body })` carregaria o dado junto.
 */
export const CAMPOS_REDIGIDOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-webhook-signature"]',
  '*.cpf',
  '*.password',
  '*.senha',
  '*.email',
  '*.dataNascimento',
  '*.data_nascimento',
]

// Params de query cujo VALOR pode aparecer no log. Tudo que não está aqui é
// redigido — inclusive parâmetro novo que alguém acrescentar depois. O `q` da
// busca da recepção é o caso que motiva a lista: ele carrega nome ou CPF de
// paciente, e sem isto cada busca no balcão grava um identificador em claro no
// log da API.
const PARAMS_VISIVEIS = new Set(['download', 'refresh', 'escopo', 'tipo', 'agendamentoId'])

/** Troca por `<redigido>` o valor de todo param que não esteja na lista. */
export function redigirUrl(url: string): string {
  const corte = url.indexOf('?')
  if (corte === -1) return url

  const caminho = url.slice(0, corte)
  const consulta = url
    .slice(corte + 1)
    .split('&')
    .filter(Boolean)
    .map((par) => {
      const igual = par.indexOf('=')
      if (igual === -1) return par
      const chave = par.slice(0, igual)
      return PARAMS_VISIVEIS.has(decodeURIComponent(chave)) ? par : `${chave}=<redigido>`
    })
    .join('&')

  return consulta ? `${caminho}?${consulta}` : caminho
}

interface RequestLogavel {
  method: string
  url: string
  hostname?: string
  ip?: string
}

/** Serializer de request: igual ao padrão do Fastify, com a query redigida. */
export function serializarRequest(req: RequestLogavel): Record<string, unknown> {
  return {
    method: req.method,
    url: redigirUrl(req.url),
    hostname: req.hostname,
    remoteAddress: req.ip,
  }
}
