import { useEffect, useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Router por URL — pequeno e sem dependência, sobre a History API.
//
// A URL é a fonte da verdade: a tela exibida deriva de `location`, então
// recarregar a página, abrir um link salvo e usar voltar/avançar do navegador
// caem todos no mesmo caminho. O estado vive fora do React (como o cache de
// useResultados) e os componentes o observam com useSyncExternalStore.
// ---------------------------------------------------------------------------

export interface Local {
  pathname: string
  search: string
}

/** Evento próprio: pushState/replaceState não disparam `popstate`. */
const EVENTO_NAVEGOU = 'lh:navegou'

let cache: Local | null = null

// Lê a location real a cada chamada e só troca o objeto quando ela mudou —
// useSyncExternalStore exige o MESMO objeto enquanto nada mudou. Ler sempre
// (em vez de guardar no navegar) mantém o router certo mesmo se algo de fora
// mexer no history, como os testes que montam o App numa URL inicial.
function snapshot(): Local {
  const { pathname, search } = window.location
  if (cache === null || cache.pathname !== pathname || cache.search !== search) {
    cache = { pathname, search }
  }
  return cache
}

function inscreve(avisa: () => void): () => void {
  window.addEventListener('popstate', avisa)
  window.addEventListener(EVENTO_NAVEGOU, avisa)
  return () => {
    window.removeEventListener('popstate', avisa)
    window.removeEventListener(EVENTO_NAVEGOU, avisa)
  }
}

/** Caminho + query string atuais. Re-renderiza a cada mudança de URL. */
export function useLocal(): Local {
  return useSyncExternalStore(inscreve, snapshot)
}

/**
 * Navegação programática. `substituir` troca a entrada atual do histórico em
 * vez de empilhar uma nova — para redirecionamentos, que não devem virar um
 * passo a mais no botão voltar.
 */
export function navegar(para: string, { substituir = false }: { substituir?: boolean } = {}): void {
  const atual = window.location.pathname + window.location.search + window.location.hash
  if (para === atual) return
  if (substituir) window.history.replaceState(null, '', para)
  else window.history.pushState(null, '', para)
  window.dispatchEvent(new Event(EVENTO_NAVEGOU))
  // Tela nova começa do topo, como numa navegação real.
  if (!substituir) window.scrollTo(0, 0)
}

/** Redireciona assim que monta, sem deixar a rota antiga no histórico. */
export function Redireciona({ para }: { para: string }): null {
  useEffect(() => {
    navegar(para, { substituir: true })
  }, [para])
  return null
}

// ---------------------------------------------------------------------------
// Casamento de rotas
// ---------------------------------------------------------------------------

type Params = Record<string, string>

/**
 * Casa `pathname` com um padrão como `/exame/:id`. Cada `:nome` casa um
 * segmento não vazio, entregue já decodificado. Barra final é ignorada.
 * Devolve `null` quando não casa.
 */
export function casa(padrao: string, pathname: string): Params | null {
  const segmentos = (s: string) => s.split('/').filter((p) => p !== '')
  const esperado = segmentos(padrao)
  const recebido = segmentos(pathname)
  if (esperado.length !== recebido.length) return null

  const params: Params = {}
  for (let i = 0; i < esperado.length; i++) {
    const e = esperado[i]!
    const r = recebido[i]!
    if (e.startsWith(':')) {
      try {
        params[e.slice(1)] = decodeURIComponent(r)
      } catch {
        return null // %E0%A4%A malformado: trata como rota que não existe
      }
    } else if (e !== r) {
      return null
    }
  }
  return params
}

// ---------------------------------------------------------------------------
// Interceptação de links internos
// ---------------------------------------------------------------------------

/**
 * Faz `<a href="/algum/caminho">` navegar pelo router em vez de recarregar a
 * página. Fica de fora tudo o que o navegador deve tratar sozinho: clique com
 * modificador ou botão do meio (nova aba), `target` diferente de `_self`,
 * `download`, outro domínio, âncora na mesma página e links que alguém já
 * tratou (`preventDefault`).
 */
export function useInterceptaLinks(): void {
  useEffect(() => {
    const aoClicar = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0) return
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
      // `closest('a')` também acha o <a> de SVG, cujo `href` não é string.
      const alvo = ev.target instanceof Element ? ev.target.closest('a') : null
      if (!(alvo instanceof HTMLAnchorElement) || !alvo.hasAttribute('href')) return
      if (alvo.target !== '' && alvo.target !== '_self') return
      if (alvo.hasAttribute('download')) return

      const url = new URL(alvo.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Âncora na mesma página (#secao): o navegador rola até ela sozinho.
      const { pathname, search } = window.location
      if (url.hash !== '' && url.pathname === pathname && url.search === search) return

      ev.preventDefault()
      navegar(url.pathname + url.search + url.hash)
    }
    document.addEventListener('click', aoClicar)
    return () => document.removeEventListener('click', aoClicar)
  }, [])
}
