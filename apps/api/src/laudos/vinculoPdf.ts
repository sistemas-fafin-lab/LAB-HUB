import type { IAplisSiteService } from './aplisSite.js'
import { lerLaudoExterno, type VinculoLaudoExterno } from './laudoExterno.js'

// ---------------------------------------------------------------------------
// De onde o LaudoService tira o que os PDFs "Laudo EXTERNO" de uma requisição
// dizem. É uma interface para o serviço não conhecer site nem PDF — se o
// fornecedor expuser o tipo 14 na API de integração, troca-se a implementação
// daqui e o resto não muda.
// ---------------------------------------------------------------------------

export interface ILaudosExternos {
  /**
   * O que cada anexo tipo 14 ativo da requisição traz, na ordem da listagem.
   * Lista vazia = requisição sem anexo. Lança `IntegrationError` quando o site
   * falha; PDF ilegível NÃO é falha (vem com `layout: 'ilegivel'`).
   */
  lerDaRequisicao(idRequisicao: string, codRequisicao: string): Promise<VinculoLaudoExterno[]>
}

export class LaudosExternosDoSite implements ILaudosExternos {
  constructor(private readonly site: IAplisSiteService) {}

  async lerDaRequisicao(idRequisicao: string, codRequisicao: string): Promise<VinculoLaudoExterno[]> {
    const anexos = await this.site.listarLaudosExternos(idRequisicao, codRequisicao)
    const lidos: VinculoLaudoExterno[] = []
    // Um de cada vez dentro da requisição: quem limita a concorrência é quem
    // chama, por requisição. O PDF é lido em memória e descartado aqui.
    for (const anexo of anexos) lidos.push(await lerLaudoExterno(await this.site.baixarAnexo(anexo)))
    return lidos
  }
}

/** Executa `tarefa` para cada item com no máximo `limite` em andamento. */
export async function emParalelo<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length)
  let proximo = 0
  const operario = async (): Promise<void> => {
    while (proximo < itens.length) {
      const i = proximo++
      resultados[i] = await tarefa(itens[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, operario))
  return resultados
}
