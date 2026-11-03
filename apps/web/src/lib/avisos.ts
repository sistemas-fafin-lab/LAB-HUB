// ---------------------------------------------------------------------------
// Avisos (toasts) do portal. Qualquer tela chama `avisar(...)`; o shell
// autenticado é quem escuta e mostra. Sem shell montado (telas de entrada), o
// aviso simplesmente não aparece.
// ---------------------------------------------------------------------------

export type TomAviso = 'success' | 'info' | 'alert'

export interface Aviso {
  title?: string
  message?: string
  /** Padrão: success. `alert` é para erro. */
  tone?: TomAviso
  /** Em ms; padrão 3600. */
  duracao?: number
}

type Ouvinte = (aviso: Aviso) => void

const ouvintes = new Set<Ouvinte>()

export function avisar(aviso: Aviso): void {
  for (const ouvinte of ouvintes) ouvinte(aviso)
}

/** Inscreve `ouvinte`; devolve a função que cancela a inscrição. */
export function aoAvisar(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}
