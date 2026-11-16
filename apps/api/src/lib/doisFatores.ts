import { createClient } from '@supabase/supabase-js'
import { chaveSupabase, requireEnv } from './env.js'
import { supabase } from './supabase.js'

// ---------------------------------------------------------------------------
// Verificação em duas etapas por e-mail (PV2-26). Desenho em
// .scratch/portal-v2-paridade/desenho-dois-fatores.md.
// ---------------------------------------------------------------------------

export const TENTATIVAS_POR_CODIGO = 5
export const INTERVALO_ENTRE_ENVIOS_MS = 60_000
/** Linhas de `sessoes_dois_fatores` mais velhas que isto são expurgadas. */
export const VALIDADE_DA_LINHA_MS = 30 * 24 * 60 * 60 * 1000

export interface ClaimsDaSessao {
  sessionId: string
  /** Métodos de autenticação da sessão (`amr` do JWT): "password", "otp"… */
  metodos: string[]
  /** Quando a senha foi digitada (epoch s, do `amr`); null sem senha. */
  senhaEm: number | null
}

/** A senha precisa ter sido digitada há pouco para pedir e conferir o código de entrada. */
export const SENHA_RECENTE_MS = 30 * 60 * 1000

/**
 * `session_id` e `amr` do JWT do Supabase. Só deve ser chamado DEPOIS de
 * `auth.getUser(token)` aceitar o token: aqui o payload só é decodificado.
 */
export function claimsDoToken(token: string): ClaimsDaSessao | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      session_id?: unknown
      amr?: unknown
    }
    if (typeof json.session_id !== 'string') return null
    const amr = Array.isArray(json.amr) ? (json.amr as unknown[]) : []
    const entradas = amr
      .filter((a): a is { method: unknown; timestamp?: unknown } => !!a && typeof a === 'object' && 'method' in a)
      .map((a) => ({ metodo: String(a.method), em: typeof a.timestamp === 'number' ? a.timestamp : null }))
    const senha = entradas.find((e) => e.metodo === 'password')
    return { sessionId: json.session_id, metodos: entradas.map((e) => e.metodo), senhaEm: senha?.em ?? null }
  } catch {
    return null
  }
}

/** Só a sessão que entrou pela senha pode valer como "senha + código". */
export function entrouPelaSenha(claims: ClaimsDaSessao | null): claims is ClaimsDaSessao {
  return claims?.metodos.includes('password') === true
}

/** Entrou pela senha há menos de SENHA_RECENTE_MS (para a etapa de entrada). */
export function senhaRecente(claims: ClaimsDaSessao | null, agora = Date.now()): claims is ClaimsDaSessao {
  return entrouPelaSenha(claims) && claims.senhaEm !== null && agora - claims.senhaEm * 1000 < SENHA_RECENTE_MS
}

/**
 * Cliente NOVO a cada uso, sem guardar sessão. `verifyOtp` cria uma sessão no
 * cliente que o chama; no cliente compartilhado (chave secreta), as consultas
 * seguintes ao banco passariam a sair com o token desse usuário.
 */
function clienteAvulso() {
  return createClient(requireEnv('SUPABASE_URL'), chaveSupabase('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Pede ao Supabase o código de 6 dígitos para o e-mail da conta. */
export async function enviarCodigo(email: string): Promise<{ ok: boolean; limite: boolean }> {
  const { error } = await clienteAvulso().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (!error) return { ok: true, limite: false }
  return { ok: false, limite: error.status === 429 }
}

/**
 * Confere o código. A verificação cria uma sessão nova (a do código); ela é
 * encerrada na hora: quem fica valendo é a sessão que entrou pela senha.
 */
export async function conferirCodigo(email: string, codigo: string): Promise<boolean> {
  const { data, error } = await clienteAvulso().auth.verifyOtp({ email, token: codigo, type: 'email' })
  if (error || !data.session) return false
  await supabase.auth.admin.signOut(data.session.access_token, 'local')
  return true
}

/**
 * O envio e a conferência no Supabase Auth, num objeto: as funções deste
 * módulo chamam por aqui, e os testes trocam só estas duas.
 */
export const otp = { enviar: enviarCodigo, conferir: conferirCodigo }

export interface LinhaDaSessao {
  session_id: string
  paciente_id: string
  verificada_em: string | null
  enviado_em: string | null
  tentativas: number
  usada_em: string | null
}

const COLUNAS_DA_LINHA = 'session_id, paciente_id, verificada_em, enviado_em, tentativas, usada_em'

/** Erro de gravação no banco: a rota responde 500 em vez de seguir como se tivesse gravado. */
export class FalhaAoGravar extends Error {
  constructor(onde: string, causa: unknown) {
    super(`Falha ao gravar (${onde})`)
    this.name = 'FalhaAoGravar'
    this.cause = causa
  }
}

function conferirGravacao(onde: string, resultado: { error: unknown }) {
  if (resultado.error) throw new FalhaAoGravar(onde, resultado.error)
}

export async function linhaDaSessao(sessionId: string): Promise<LinhaDaSessao | null> {
  const { data } = await supabase
    .from('sessoes_dois_fatores')
    .select(COLUNAS_DA_LINHA)
    .eq('session_id', sessionId)
    .maybeSingle()
  return (data as LinhaDaSessao | null) ?? null
}

// ---------------------------------------------------------------------------
// Situação da sessão: a regra única de "liberada", usada pelo authenticate e
// pelas rotas da verificação.
// ---------------------------------------------------------------------------

export interface SessaoDoPaciente {
  email: string | null
  claims: ClaimsDaSessao | null
  /** Preferência do paciente: verificação em duas etapas por e-mail. */
  doisFatores: boolean
}

export interface SituacaoDaSessao {
  /** Pode ler dado: a verificação está desligada ou a sessão passou pelo código. */
  liberada: boolean
  linha: LinhaDaSessao | null
}

/** Renovar o "último uso" no máximo uma vez por dia: não é uma escrita por request. */
const RENOVAR_USO_A_CADA_MS = 24 * 60 * 60 * 1000

export async function situacaoDaSessao(sessao: SessaoDoPaciente, agora = Date.now()): Promise<SituacaoDaSessao> {
  const linha = sessao.claims ? await linhaDaSessao(sessao.claims.sessionId) : null
  if (!sessao.doisFatores) return { liberada: true, linha }
  // Só a sessão aberta pela senha vale: a aberta só pelo código, nunca.
  const liberada = entrouPelaSenha(sessao.claims) && linha?.verificada_em != null
  if (liberada && linha && (!linha.usada_em || agora - Date.parse(linha.usada_em) > RENOVAR_USO_A_CADA_MS)) {
    // Sem esperar: é só para o expurgo não levar uma sessão em uso.
    void supabase
      .from('sessoes_dois_fatores')
      .update({ usada_em: new Date(agora).toISOString() })
      .eq('session_id', linha.session_id)
      .then(() => undefined)
  }
  return { liberada, linha }
}

/**
 * Por que a sessão pendente não consegue fazer a etapa do código: entrou por
 * outro caminho (link de recuperação) ou a senha já não é recente. Nos dois
 * casos o caminho é entrar de novo com a senha.
 */
export const precisaEntrarDeNovo = (sessao: SessaoDoPaciente, agora = Date.now()) => !senhaRecente(sessao.claims, agora)

// ---------------------------------------------------------------------------
// Códigos errados por conta (tabela bloqueios_dois_fatores).
// ---------------------------------------------------------------------------

export const FALHAS_POR_CONTA = 10
export const JANELA_DE_FALHAS_MS = 60 * 60 * 1000

interface Bloqueio {
  falhas: number
  desde: string
}

async function bloqueioDa(pacienteId: string): Promise<Bloqueio | null> {
  const { data } = await supabase
    .from('bloqueios_dois_fatores')
    .select('falhas, desde')
    .eq('paciente_id', pacienteId)
    .maybeSingle()
  return (data as Bloqueio | null) ?? null
}

const janelaAberta = (b: Bloqueio, agora: number) => agora - Date.parse(b.desde) < JANELA_DE_FALHAS_MS

export async function contaBloqueada(pacienteId: string, agora = Date.now()): Promise<boolean> {
  const b = await bloqueioDa(pacienteId)
  return b !== null && janelaAberta(b, agora) && b.falhas >= FALHAS_POR_CONTA
}

async function registrarFalha(pacienteId: string, agora: number) {
  const b = await bloqueioDa(pacienteId)
  const novo = b && janelaAberta(b, agora) ? { falhas: b.falhas + 1, desde: b.desde } : { falhas: 1, desde: new Date(agora).toISOString() }
  conferirGravacao(
    'bloqueio',
    await supabase.from('bloqueios_dois_fatores').upsert({ paciente_id: pacienteId, ...novo }, { onConflict: 'paciente_id' }),
  )
}

// ---------------------------------------------------------------------------
// Envio e conferência do código da sessão.
// ---------------------------------------------------------------------------

export type Recusa = { status: number; codigo: string; message: string }

export const RECUSAS = {
  invalido: { status: 400, codigo: 'CODIGO_INVALIDO', message: 'Código inválido ou expirado. Confira a mensagem ou peça um novo código.' },
  esgotado: { status: 429, codigo: 'TENTATIVAS_ESGOTADAS', message: 'Muitas tentativas. Peça um novo código.' },
  aguarde: { status: 429, codigo: 'AGUARDE_REENVIO', message: 'Aguarde um minuto para pedir outro código.' },
  bloqueada: { status: 429, codigo: 'CONTA_BLOQUEADA', message: 'Muitas tentativas erradas. Tente de novo em uma hora.' },
  entreDeNovo: { status: 403, codigo: 'ENTRE_DE_NOVO', message: 'Por segurança, entre de novo com a sua senha.' },
  envioFalhou: { status: 502, codigo: 'ENVIO_FALHOU', message: 'Não foi possível enviar o código. Tente de novo em instantes.' },
  obrigatorio: { status: 400, codigo: 'CODIGO_OBRIGATORIO', message: 'Digite os 6 dígitos do código.' },
} as const satisfies Record<string, Recusa>

/** Registra o envio na linha da sessão (cria a linha na primeira vez). */
export async function registrarEnvio(sessionId: string, pacienteId: string, agora = Date.now()): Promise<string> {
  const quando = new Date(agora).toISOString()
  conferirGravacao(
    'envio',
    await supabase
      .from('sessoes_dois_fatores')
      .upsert(
        { session_id: sessionId, paciente_id: pacienteId, enviado_em: quando, tentativas: 0, usada_em: quando },
        { onConflict: 'session_id' },
      ),
  )
  return quando
}

/**
 * Confere o código da sessão. A tentativa é reservada ANTES de conferir, com
 * update condicional: conferências em paralelo não passam do limite. Quando
 * confere, o código é consumido e `aoConferir` (ex.: verificada_em) entra na
 * MESMA gravação.
 */
export async function conferirCodigoDaSessao(
  sessao: SessaoDoPaciente,
  pacienteId: string,
  codigo: string,
  aoConferir: Partial<Pick<LinhaDaSessao, 'verificada_em'>> = {},
  agora = Date.now(),
): Promise<Recusa | null> {
  const sessionId = sessao.claims?.sessionId
  if (!sessionId || !sessao.email) return RECUSAS.invalido
  if (await contaBloqueada(pacienteId, agora)) return RECUSAS.bloqueada
  const linha = await linhaDaSessao(sessionId)
  if (!linha?.enviado_em) return RECUSAS.invalido
  if (linha.tentativas >= TENTATIVAS_POR_CODIGO) return RECUSAS.esgotado

  const reserva = await supabase
    .from('sessoes_dois_fatores')
    .update({ tentativas: linha.tentativas + 1 })
    .eq('session_id', sessionId)
    .eq('tentativas', linha.tentativas)
    .select('session_id')
  conferirGravacao('tentativa', reserva)
  if (!Array.isArray(reserva.data) ? !reserva.data : reserva.data.length === 0) return RECUSAS.esgotado

  if (!(await otp.conferir(sessao.email, codigo))) {
    await registrarFalha(pacienteId, agora)
    return RECUSAS.invalido
  }
  conferirGravacao(
    'código conferido',
    await supabase
      .from('sessoes_dois_fatores')
      .update({ enviado_em: null, tentativas: 0, usada_em: new Date(agora).toISOString(), ...aoConferir })
      .eq('session_id', sessionId),
  )
  return null
}

/** Linhas sem uso há mais de VALIDADE_DA_LINHA_MS. Roda fora do caminho do envio. */
export function expurgarSessoesVencidas(log: { warn: (o: unknown, m: string) => void }, agora = Date.now()): void {
  void supabase
    .from('sessoes_dois_fatores')
    .delete()
    .lt('usada_em', new Date(agora - VALIDADE_DA_LINHA_MS).toISOString())
    .then(({ error }) => {
      if (error) log.warn({ err: error }, 'expurgo de sessoes_dois_fatores falhou')
    })
}
