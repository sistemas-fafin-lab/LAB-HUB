import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Tela de transição do portal ("Preparando seus resultados", "Saindo com
// segurança"…). Quem dispara uma operação longa de acesso a embrulha em
// `comTransicao`; o App lê `useTransicao` e mostra a `TelaDeTransicao`.
//
// A tela acompanha a chamada real: aparece quando ela começa e sai quando ela
// termina — sem espera artificial no resultado. Só a saída da tela respeita um
// mínimo curto, para não piscar quando a chamada é rápida.
// ---------------------------------------------------------------------------

/** Tempo mínimo na tela, em ms, contado do início da operação. */
const MINIMO_DA_TRANSICAO = 400

let textoAtual: string | null = null
// Cada transição tem um número: uma saída atrasada não apaga a seguinte.
let geracao = 0
const ouvintes = new Set<() => void>()

function mostra(texto: string | null) {
  textoAtual = texto
  for (const avisa of ouvintes) avisa()
}

/**
 * Mostra `texto` enquanto `operacao` roda. O resultado (ou o erro) volta na
 * hora; a tela sai depois, quando completar o mínimo.
 */
export async function comTransicao<T>(texto: string, operacao: () => Promise<T>): Promise<T> {
  const estaTransicao = ++geracao
  const inicio = Date.now()
  mostra(texto)
  try {
    return await operacao()
  } finally {
    const falta = MINIMO_DA_TRANSICAO - (Date.now() - inicio)
    const sai = () => {
      if (geracao === estaTransicao) mostra(null)
    }
    if (falta > 0) setTimeout(sai, falta)
    else sai()
  }
}

function inscreve(avisa: () => void) {
  ouvintes.add(avisa)
  return () => {
    ouvintes.delete(avisa)
  }
}

/** Texto da transição em curso, ou `null`. */
export function useTransicao(): string | null {
  return useSyncExternalStore(inscreve, () => textoAtual)
}
