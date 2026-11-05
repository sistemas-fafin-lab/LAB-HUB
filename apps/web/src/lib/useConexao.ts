import { useSyncExternalStore } from 'react'

function inscreve(avisa: () => void): () => void {
  window.addEventListener('online', avisa)
  window.addEventListener('offline', avisa)
  return () => {
    window.removeEventListener('online', avisa)
    window.removeEventListener('offline', avisa)
  }
}

/** `false` enquanto o navegador diz que está sem conexão. */
export function useOnline(): boolean {
  return useSyncExternalStore(inscreve, () => navigator.onLine)
}
