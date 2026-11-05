import type { IconName } from '../../ds'
import { rotaOculta } from '../../lib/flags'
import { CAMINHO_DA_TELA, caminhoDaAba } from '../../lib/rotas'
import type { AppRoute, Rota } from '../../lib/rotas'

// ---------------------------------------------------------------------------
// Itens do menu (e das páginas da busca). Agendas/Coletas, que era um item só,
// vira dois — "Minhas coletas" e "Agendar coleta", como no design —, cada um
// numa das abas que já existem (/coletas e /agendar).
// ---------------------------------------------------------------------------

export type ItemMenu =
  | 'home'
  | 'results'
  | 'coletas'
  | 'agendar'
  | 'trends'
  | 'profile'
  | 'documents'
  | 'billing'
  | 'settings'

export interface Item {
  id: ItemMenu
  label: string
  icon: IconName
  href: string
  /** Tela por trás do item: é ela que a flag de rota oculta esconde. */
  tela: AppRoute
}

interface Secao {
  title: string
  items: Item[]
}

const SECOES: Secao[] = [
  {
    title: 'Saúde',
    items: [
      { id: 'home', label: 'Visão geral', icon: 'layout-dashboard', href: CAMINHO_DA_TELA.home, tela: 'home' },
      { id: 'results', label: 'Resultados', icon: 'file-text', href: CAMINHO_DA_TELA.results, tela: 'results' },
      { id: 'coletas', label: 'Minhas coletas', icon: 'activity', href: caminhoDaAba('minhas'), tela: 'schedule' },
      { id: 'agendar', label: 'Agendar coleta', icon: 'calendar-plus', href: caminhoDaAba('agendar'), tela: 'schedule' },
      { id: 'trends', label: 'Tendências', icon: 'trending-up', href: CAMINHO_DA_TELA.trends, tela: 'trends' },
    ],
  },
  {
    title: 'Conta',
    items: [
      { id: 'profile', label: 'Perfil', icon: 'user-round', href: CAMINHO_DA_TELA.profile, tela: 'profile' },
      { id: 'documents', label: 'Documentos', icon: 'folder', href: CAMINHO_DA_TELA.documents, tela: 'documents' },
      { id: 'billing', label: 'Faturamento', icon: 'receipt', href: CAMINHO_DA_TELA.billing, tela: 'billing' },
      { id: 'settings', label: 'Configurações', icon: 'settings', href: CAMINHO_DA_TELA.settings, tela: 'settings' },
    ],
  },
]

/** Seções com os itens visíveis (rotas ocultas por flag saem; seção vazia some). */
export function secoesVisiveis(): Secao[] {
  return SECOES.map((s) => ({ ...s, items: s.items.filter((it) => !rotaOculta(it.tela)) })).filter(
    (s) => s.items.length > 0,
  )
}

/** Itens visíveis, na ordem do menu (as páginas da busca). */
export function itensVisiveis(): Item[] {
  return secoesVisiveis().flatMap((s) => s.items)
}

/** Item do menu que fica marcado em cada rota (exame e laudo ficam sob Resultados). */
export function itemDaRota(rota: Rota): ItemMenu | null {
  switch (rota.tela) {
    case 'nao-encontrada':
      return null
    case 'exam':
    case 'laudo':
      return 'results'
    case 'schedule':
      return rota.aba === 'minhas' ? 'coletas' : 'agendar'
    default:
      return rota.tela
  }
}
