import { casa } from './router'

// ---------------------------------------------------------------------------
// Tabela de rotas do portal: URL ⇄ tela. Único lugar que conhece os caminhos —
// menu, busca, páginas e App montam links por aqui.
// ---------------------------------------------------------------------------

/** Telas do portal autenticado (a 404 fica de fora: não é destino de menu). */
export type AppRoute =
  | 'home'
  | 'results'
  | 'exam'
  | 'laudo'
  | 'schedule'
  | 'trends'
  | 'documents'
  | 'billing'
  | 'settings'
  | 'profile'

export type AbaColetas = 'agendar' | 'minhas'

/** Telas sem parâmetro: um caminho fixo cada. */
type TelaEstatica = Exclude<AppRoute, 'exam' | 'laudo' | 'schedule'>

export type Rota =
  | { tela: TelaEstatica }
  | { tela: 'exam' | 'laudo'; id: string }
  | { tela: 'schedule'; aba: AbaColetas; coletaId: string | null }
  | { tela: 'nao-encontrada' }

/** Rota de entrada (login/cadastro), fora do shell autenticado. */
export const CAMINHO_ENTRAR = '/entrar'

export const ehEntrada = (pathname: string) => casa(CAMINHO_ENTRAR, pathname) !== null

/**
 * O que a entrada mostra, pela query `modo`: login (padrão), cadastro, pedido
 * de link para recuperar a senha, ou a nova senha — destino do link que o
 * Supabase manda por e-mail (ver `urlNovaSenha`).
 */
export type ModoEntrada = 'login' | 'cadastro' | 'recuperar' | 'nova-senha'

const MODOS: readonly ModoEntrada[] = ['login', 'cadastro', 'recuperar', 'nova-senha']

export function modoDaEntrada(search: string): ModoEntrada {
  const modo = new URLSearchParams(search).get('modo')
  return MODOS.find((m) => m === modo) ?? 'login'
}

/** Entrada em `modo`, mantendo o `next` de `search` (para onde voltar após o login). */
export function caminhoDaEntrada(modo: ModoEntrada, search: string): string {
  const params = new URLSearchParams()
  if (modo !== 'login') params.set('modo', modo)
  const next = new URLSearchParams(search).get('next')
  if (next !== null) params.set('next', next)
  const query = params.toString()
  return query === '' ? CAMINHO_ENTRAR : `${CAMINHO_ENTRAR}?${query}`
}

/**
 * Para onde o link de recuperação do e-mail leva. Precisa estar em
 * "Redirect URLs" do Supabase Auth (por ambiente), senão o Supabase manda para
 * a Site URL e a tela de nova senha não abre.
 */
export const urlNovaSenha = () => `${window.location.origin}${CAMINHO_ENTRAR}?modo=nova-senha`

/**
 * Valida o `next` do login: só caminhos DESTE site. Barra o open redirect
 * (`https://outro.site`, `//outro.site`, `/\\outro.site`, `javascript:`, e
 * `/.//outro.site`, que o URL normaliza para `//outro.site`) e o `next` que
 * aponta de volta para a própria entrada. Devolve o caminho normalizado
 * (pathname + query + hash) ou `null`.
 */
export function caminhoInterno(next: string | null): string | null {
  if (next === null || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null
  }
  let url: URL
  try {
    url = new URL(next, window.location.origin)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null
  // Checado DEPOIS de normalizar: é a forma que vai para o history.
  if (url.pathname.startsWith('//') || url.pathname.startsWith('/\\')) return null
  if (ehEntrada(url.pathname)) return null
  return url.pathname + url.search + url.hash
}

const CAMINHO_ESTATICO: Record<TelaEstatica, string> = {
  home:      '/',
  results:   '/resultados',
  trends:    '/tendencias',
  documents: '/documentos',
  billing:   '/faturamento',
  settings:  '/configuracoes',
  profile:   '/perfil',
}

const CAMINHO_DA_ABA: Record<AbaColetas, string> = { agendar: '/agendar', minhas: '/coletas' }

export function resolveRota(pathname: string): Rota {
  for (const [tela, padrao] of Object.entries(CAMINHO_ESTATICO) as [TelaEstatica, string][]) {
    if (casa(padrao, pathname) !== null) return { tela }
  }
  const exame = casa('/exame/:id', pathname)
  if (exame !== null) return { tela: 'exam', id: exame.id! }
  const laudo = casa('/laudo/:id', pathname)
  if (laudo !== null) return { tela: 'laudo', id: laudo.id! }
  for (const [aba, padrao] of Object.entries(CAMINHO_DA_ABA) as [AbaColetas, string][]) {
    if (casa(padrao, pathname) !== null) return { tela: 'schedule', aba, coletaId: null }
  }
  const coleta = casa('/coleta/:id', pathname)
  if (coleta !== null) return { tela: 'schedule', aba: 'minhas', coletaId: coleta.id! }
  return { tela: 'nao-encontrada' }
}

/**
 * Destino de cada item do menu/busca. Exame e laudo precisam de um id; sem ele
 * o destino coerente é a lista de onde eles são abertos. Agendas/Coletas abre
 * na aba "Agendar", como antes do router.
 */
export const CAMINHO_DA_TELA: Record<AppRoute, string> = {
  ...CAMINHO_ESTATICO,
  exam:     CAMINHO_ESTATICO.results,
  laudo:    CAMINHO_ESTATICO.results,
  schedule: CAMINHO_DA_ABA.agendar,
}

export const caminhoDoExame = (id: string) => `/exame/${encodeURIComponent(id)}`
export const caminhoDoLaudo = (id: string) => `/laudo/${encodeURIComponent(id)}`
export const caminhoDaColeta = (id: string) => `/coleta/${encodeURIComponent(id)}`
export const caminhoDaAba = (aba: AbaColetas) => CAMINHO_DA_ABA[aba]
