import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Fecha menus e popovers com clique fora de `ref` ou Esc. */
export function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const clique = (e: MouseEvent) => {
      if (ref.current && e.target instanceof globalThis.Node && !ref.current.contains(e.target)) close()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', clique)
    window.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', clique)
      window.removeEventListener('keydown', tecla)
    }
  }, [open, close, ref])
}
