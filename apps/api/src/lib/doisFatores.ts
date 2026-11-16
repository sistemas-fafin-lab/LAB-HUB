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

export interface LinhaDaSessao {
  session_id: string
  paciente_id: string
  verificada_em: string | null
  enviado_em: string | null
  tentativas: number
}

export async function linhaDaSessao(sessionId: string): Promise<LinhaDaSessao | null> {
  const { data } = await supabase
    .from('sessoes_dois_fatores')
    .select('session_id, paciente_id, verificada_em, enviado_em, tentativas')
    .eq('session_id', sessionId)
    .maybeSingle()
  return (data as LinhaDaSessao | null) ?? null
}
