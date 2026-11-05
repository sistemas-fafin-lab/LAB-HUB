// ---------------------------------------------------------------------------
// Umami Analytics — único ponto de contato do app com o tracker.
// ---------------------------------------------------------------------------
// Portal de saúde: NENHUM identificador de paciente pode sair daqui. Não usamos
// `umami.identify()`, e propriedade de evento só recebe categoria/contagem —
// nunca nome, e-mail, CPF, id de exame ou termo digitado na busca.
//
// O app roteia por URL (lib/router.ts), mas a URL real carrega ids de exame,
// laudo e coleta (`/exame/<id>`) — dado de paciente. O auto-track do Umami
// enviaria essa URL crua a cada pushState, então o script sobe com
// `data-auto-track="false"` e todos os pageviews saem de `trackPageview()`,
// chamado pelo App uma vez por mudança de URL com o nome da tela, nunca o id.
// ---------------------------------------------------------------------------
import type { Rota } from './rotas'

/** Tela registrada no pageview: as do menu mais a página 404. */
export type TelaPageview = Rota['tela']

const SCRIPT_ID = 'umami-tracker'

// Tela atual, mantida por trackPageview(). Com auto-track desligado o tracker
// nunca atualiza a URL dele (só o faz nos hooks de pushState, que não são
// instalados), então sem isto TODO evento seria atribuído à URL inicial e o
// relatório de eventos não diria de qual tela cada um veio. Fica `null` até o
// primeiro pageview — nas telas deslogadas (login/cadastro), fora do shell, o
// fallback é a URL real da página, que é o correto ali.
let urlAtual: string | null = null
let tituloAtual: string | null = null

/**
 * URL virtual de cada rota. Mapa explícito (e não o próprio `AppRoute`) para o
 * relatório "Pages" do Umami ter rótulos estáveis e legíveis, alinhados aos do
 * menu. Sem id de exame no caminho: `/exame/123` viraria dado de paciente.
 */
const URL_POR_ROTA: Record<TelaPageview, string> = {
  home:      '/visao-geral',
  results:   '/resultados',
  exam:      '/exame',
  laudo:     '/laudo',
  schedule:  '/agendas-coletas',
  trends:    '/tendencias',
  documents: '/documentos',
  billing:   '/faturamento',
  settings:  '/configuracoes',
  profile:   '/perfil',
  'nao-encontrada': '/404',
}

const TITULO_POR_ROTA: Record<TelaPageview, string> = {
  home:      'Visão geral',
  results:   'Resultados',
  exam:      'Detalhe do exame',
  laudo:     'Laudo',
  schedule:  'Agendas/Coletas',
  trends:    'Tendências',
  documents: 'Documentos',
  billing:   'Faturamento',
  settings:  'Configurações',
  profile:   'Perfil',
  'nao-encontrada': 'Página não encontrada',
}

/**
 * Injeta o script do tracker no <head>, uma única vez por carregamento.
 * Sem `VITE_UMAMI_WEBSITE_ID` configurado não faz nada — todo o resto do módulo
 * então vira no-op, e o app roda normalmente sem analytics (dev, CI, preview).
 */
export function initAnalytics(): void {
  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID
  const src = import.meta.env.VITE_UMAMI_TRACKER_SRC
  if (!websiteId || !src) return
  if (document.getElementById(SCRIPT_ID) !== null) return

  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.src = src
  script.defer = true
  script.setAttribute('data-website-id', websiteId)
  // Ver comentário do topo: a navegação é registrada por trackPageview().
  script.setAttribute('data-auto-track', 'false')
  document.head.appendChild(script)
}

/**
 * Pageview virtual da rota atual.
 *
 * Usa a forma de FUNÇÃO do `track()`, e não a de objeto. No tracker, só as
 * formas de string e de função recebem o payload padrão para mesclar:
 *
 *   "object" == typeof t ? { ...t }        ← substitui o payload INTEIRO
 *   "function" == typeof t ? t(R())        ← mescla com o padrão
 *
 * Com `track({ url })` o hit sai sem `website`/`screen`/`language`/`hostname`,
 * o servidor não consegue atribuí-lo e descarta — nenhum pageview é gravado e
 * visitors, views, visits, bounce rate e visit duration ficam todos zerados
 * (eventos nomeados continuam funcionando, porque usam a forma de string).
 */
export function trackPageview(route: TelaPageview): void {
  urlAtual = URL_POR_ROTA[route]
  tituloAtual = TITULO_POR_ROTA[route]
  window.umami?.track((payload) => ({
    ...payload,
    url: URL_POR_ROTA[route],
    title: TITULO_POR_ROTA[route],
  }))
}

/**
 * Evento nomeado, na convenção `objeto_acao`. Wrapper fino para o resto do app
 * não tocar em `window` e o optional-chaining ficar num lugar só — chamar antes
 * de o script carregar (ou sem envs) é seguro e simplesmente não envia nada.
 */
export function track(evento: string, data?: Record<string, unknown>): void {
  window.umami?.track((payload) => ({
    ...payload,
    ...(urlAtual !== null ? { url: urlAtual, title: tituloAtual ?? payload.title } : {}),
    name: evento,
    ...(data ? { data } : {}),
  }))
}
