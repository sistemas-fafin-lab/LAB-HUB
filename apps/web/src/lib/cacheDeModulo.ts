import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Cache de módulo para uma leitura da API, no mesmo desenho de useResultados:
// o estado vive fora do React, todos os consumidores veem o mesmo snapshot, e
// componentes montados juntos dividem UMA requisição. Montar um consumidor
// revalida em silêncio (o dado antigo fica na tela); `recarregar()` mostra o
// carregamento. Troca de usuário na mesma aba descarta tudo: o dado de uma
// conta não pode aparecer para a seguinte.
// ---------------------------------------------------------------------------

export interface EstadoDoCache<T> {
  dado: T
  loading: boolean
  error: string | null
  /** Já houve uma busca boa (com o usuário atual). */
  carregado: boolean
}

interface OpcoesDoCache<T> {
  buscar: () => Promise<T>
  vazio: T
  erroPadrao: string
}

export interface CacheDeModulo<T> {
  /** Lê o cache e revalida ao montar. */
  useEstado: () => EstadoDoCache<T>
  /** Lê só um valor derivado (re-renderiza quando ele muda). */
  useDerivado: <R>(derivar: (estado: EstadoDoCache<T>) => R) => R
  /** Busca de novo mostrando o carregamento; adere à busca em curso, se houver. */
  recarregar: () => Promise<void>
  /** Altera o dado local (atualização otimista). */
  alterar: (mudar: (dado: T) => T) => void
  /** Volta ao estado inicial (troca de usuário; testes). */
  descartar: () => void
}

export function criarCacheDeModulo<T>({ buscar, vazio, erroPadrao }: OpcoesDoCache<T>): CacheDeModulo<T> {
  const inicial = (): EstadoDoCache<T> => ({ dado: vazio, loading: true, error: null, carregado: false })
  let estado = inicial()
  let buscando: Promise<void> | null = null
  const ouvintes = new Set<() => void>()

  const definir = (novo: EstadoDoCache<T>) => {
    estado = novo
    for (const avisa of ouvintes) avisa()
  }
  const inscreve = (avisa: () => void) => {
    ouvintes.add(avisa)
    return () => {
      ouvintes.delete(avisa)
    }
  }

  function carregar(mostrarCarregamento: boolean): Promise<void> {
    if (buscando) return buscando
    if (mostrarCarregamento && !estado.loading) definir({ ...estado, loading: true })
    const esta: Promise<void> = buscar().then(
      (dado) => {
        if (buscando === esta) definir({ dado, loading: false, error: null, carregado: true })
      },
      (e: unknown) => {
        if (buscando === esta) definir({ ...estado, loading: false, error: e instanceof Error ? e.message : erroPadrao })
      },
    )
    buscando = esta
    void esta.finally(() => {
      if (buscando === esta) buscando = null
    })
    return esta
  }

  const descartar = () => {
    buscando = null // a resposta em voo, se chegar, é de quem saiu: é ignorada
    definir(inicial())
  }

  let usuarioDoCache: string | null = null
  supabase.auth.onAuthStateChange((_evento, sessao) => {
    const usuario = sessao?.user?.id ?? null
    if (usuario === usuarioDoCache) return
    usuarioDoCache = usuario
    descartar()
  })

  function useEstado(): EstadoDoCache<T> {
    const atual = useSyncExternalStore(inscreve, () => estado)
    useEffect(() => {
      void carregar(!estado.carregado)
    }, [])
    return atual
  }

  return {
    useEstado,
    useDerivado: (derivar) => useSyncExternalStore(inscreve, () => derivar(estado)),
    recarregar: () => carregar(true),
    alterar: (mudar) => definir({ ...estado, dado: mudar(estado.dado) }),
    descartar,
  }
}
