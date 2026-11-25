import type { AnexoLaudoExterno, IAplisSiteService } from './aplisSite.js'
import {
  lerLaudoExterno,
  lerLaudoExternoParaEntrega,
  type LaudoExternoParaEntrega,
  type VinculoLaudoExterno,
} from './laudoExterno.js'

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

/**
 * Os anexos em si, para ENTREGAR o laudo original ao paciente (ver
 * laudoOriginal.ts). Separada de `ILaudosExternos` porque o vínculo só precisa
 * do que o PDF diz, e a entrega precisa também dos bytes.
 */
/** O PDF em memória e o que ele traz impresso sobre de quem é. */
export interface AnexoBaixado extends LaudoExternoParaEntrega {
  pdf: Uint8Array
}

export interface IAnexosLaudoExterno {
  /** Anexos tipo 14 ativos da requisição. Lança `IntegrationError` se o site falhar. */
  listarAnexos(idRequisicao: string, codRequisicao: string): Promise<AnexoLaudoExterno[]>
  /**
   * O PDF em memória e o que ele traz impresso — quem entrega confere a
   * identidade antes. Nada é gravado em disco.
   */
  baixarAnexo(anexo: AnexoLaudoExterno): Promise<AnexoBaixado>
}

export class LaudosExternosDoSite implements ILaudosExternos, IAnexosLaudoExterno {
  constructor(private readonly site: IAplisSiteService) {}

  async lerDaRequisicao(idRequisicao: string, codRequisicao: string): Promise<VinculoLaudoExterno[]> {
    const anexos = await this.site.listarLaudosExternos(idRequisicao, codRequisicao)
    const lidos: VinculoLaudoExterno[] = []
    // Um de cada vez dentro da requisição: quem limita a concorrência é quem
    // chama, por requisição. O PDF é lido em memória e descartado aqui.
    for (const anexo of anexos) lidos.push(await lerLaudoExterno(await this.site.baixarAnexo(anexo)))
    return lidos
  }

  listarAnexos(idRequisicao: string, codRequisicao: string): Promise<AnexoLaudoExterno[]> {
    return this.site.listarLaudosExternos(idRequisicao, codRequisicao)
  }

  async baixarAnexo(anexo: AnexoLaudoExterno): Promise<AnexoBaixado> {
    const pdf = await this.site.baixarAnexo(anexo)
    return { pdf, ...(await lerLaudoExternoParaEntrega(pdf)) }
  }
}
