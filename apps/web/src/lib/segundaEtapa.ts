import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { EstadoDoisFatores } from './doisFatores'

// ---------------------------------------------------------------------------
// Situação da segunda etapa da sessão ABERTA, para o App decidir entre o
// portal e a tela do código sem esperar a rede:
//   - o login consulta a API dentro da própria transição e grava aqui;
//   - recarregando a página, a situação começa desconhecida: o portal abre, e
//     o primeiro 403 DOIS_FATORES_PENDENTE da API marca a sessão como pendente.
// A chave é o session_id do token: outra sessão (outro login) recomeça.
// ---------------------------------------------------------------------------

export type SituacaoDaSegundaEtapa =
  | { tipo: 'desconhecida' }
  | { tipo: 'liberada' }
  | { tipo: 'pendente'; enviadoEm: string | null; entrarDeNovo: boolean }

let chaveAtual: string | null = null
let situacao: SituacaoDaSegundaEtapa = { tipo: 'desconhecida' }
const ouvintes = new Set<() => void>()

const definir = (chave: string | null, nova: SituacaoDaSegundaEtapa) => {
  chaveAtual = chave
  situacao = nova
  for (const avisa of ouvintes) avisa()
}

/** session_id do JWT (só para separar uma sessão da outra; não é verificação). */
export function chaveDaSessao(sessao: Pick<Session, 'access_token'> | null): string | null {
  const token = sessao?.access_token
  if (typeof token !== 'string') return null
  const payload = token.split('.')[1]
  if (!payload) return token
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: unknown }
    return typeof json.session_id === 'string' ? json.session_id : token
  } catch {
    return token
  }
}

export function registrarSituacao(
  chave: string | null,
  estado: Pick<EstadoDoisFatores, 'pendente' | 'enviadoEm' | 'entrarDeNovo'>,
): void {
  definir(
    chave,
    estado.pendente
      ? { tipo: 'pendente', enviadoEm: estado.enviadoEm, entrarDeNovo: estado.entrarDeNovo === true }
      : { tipo: 'liberada' },
  )
}

/** A API recusou com DOIS_FATORES_PENDENTE. */
export function marcarPendente(chave: string | null): void {
  if (chave === chaveAtual && situacao.tipo === 'pendente') return
  definir(chave, { tipo: 'pendente', enviadoEm: null, entrarDeNovo: false })
}

export function marcarLiberada(chave: string | null): void {
  definir(chave, { tipo: 'liberada' })
}

const inscreve = (avisa: () => void) => {
  ouvintes.add(avisa)
  return () => {
    ouvintes.delete(avisa)
  }
}

export function useSituacaoDaSegundaEtapa(chave: string | null): SituacaoDaSegundaEtapa {
  return useSyncExternalStore(inscreve, () => (chave === chaveAtual ? situacao : DESCONHECIDA))
}

const DESCONHECIDA: SituacaoDaSegundaEtapa = { tipo: 'desconhecida' }
