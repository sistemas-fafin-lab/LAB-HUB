import { api } from './api'
import { avisar } from './avisos'

/** Abre a declaração do exame. Busca a URL assinada só na hora: ela expira. */
export async function baixarDeclaracao(exameId: string): Promise<void> {
  try {
    const { url } = await api.declaracao(exameId)
    window.open(url, '_blank', 'noopener')
  } catch {
    avisar({ tone: 'alert', title: 'Não foi possível baixar o PDF', message: 'Tente novamente em instantes.' })
  }
}
