import { normalizaIdOsLis, type AolOrderRef } from './aol.js'

// ---------------------------------------------------------------------------
// Comparação das duas fontes do vínculo requisição ↔ O.S., usada pelo script
// de auditoria (scripts/auditar-vinculos.ts --os-pdf):
//
//  - PDF: a O.S. impressa no "Laudo EXTERNO" anexado à requisição no apLIS;
//  - idOsLis: o código que a recepção digitou à mão na AOL — o método atual
//    (FASE 2.5 do LaudoService).
//
// A unidade é a O.S., não a requisição: um pedido pode sair em duas remessas.
// ---------------------------------------------------------------------------

export type ClasseOs =
  /** O PDF traz a O.S.; o `idOsLis` está vazio, é o CPF ou é ilegível. */
  | 'so_pdf'
  /** O `idOsLis` aponta a requisição, mas nenhum PDF anexado traz a O.S. */
  | 'so_idoslis'
  /** As duas fontes apontam a mesma requisição. */
  | 'iguais'
  /** O PDF está anexado numa requisição e o `idOsLis` aponta outra. */
  | 'divergentes'

export interface OsClassificada {
  os: string
  classe: ClasseOs
  requisicaoPdf: string | null
  requisicaoIdOsLis: string | null
  /**
   * O `idOsLis` é o CPF do paciente. O método atual ACHA essa O.S., mas como
   * card avulso, sem ligá-la à requisição — por isso a classe continua
   * `so_pdf`, e este sinal impede de contá-la como laudo que não aparecia.
   */
  idOsLisEhCpf: boolean
}

export interface OsDoPdf {
  requisicao: string
  os: string
  /** CPF do paciente da requisição, só para reconhecer o `idOsLis` = CPF. */
  cpf?: string
}

// O `cod_requisicao` do apLIS tem 13 dígitos. Um CPF (11) ou um texto qualquer
// no `idOsLis` não aponta requisição nenhuma — o método atual não os liga a um
// pedido, então do ponto de vista do vínculo a O.S. só existe no PDF.
const pareceRequisicao = (chave: string): boolean => /^\d{13}$/.test(chave)

/**
 * Classifica cada O.S. que toca as requisições auditadas.
 *
 * `ordens` é a listagem da AOL da entidade inteira (ela não filtra por
 * paciente); as O.S. que não aparecem em PDF nenhum nem apontam uma requisição
 * auditada ficam de fora.
 */
export function classificarOs(
  doPdf: OsDoPdf[],
  ordens: AolOrderRef[],
  requisicoesAuditadas: string[],
): OsClassificada[] {
  const idOsLisPorOs = new Map(ordens.map((o) => [o.orderId, normalizaIdOsLis(o.idOsLis)]))
  const auditadas = new Set(requisicoesAuditadas)
  const classificadas: OsClassificada[] = []
  const vistasNoPdf = new Set<string>()

  for (const { requisicao, os, cpf } of doPdf) {
    const par = `${requisicao}|${os}`
    if (vistasNoPdf.has(par)) continue
    vistasNoPdf.add(par)
    vistasNoPdf.add(os)

    const chave = idOsLisPorOs.get(os)
    const base = { os, requisicaoPdf: requisicao, idOsLisEhCpf: false }
    if (chave === requisicao) {
      classificadas.push({ ...base, classe: 'iguais', requisicaoIdOsLis: chave })
    } else if (chave && pareceRequisicao(chave)) {
      // Qualquer código de requisição diferente conta, inclusive de fora da
      // auditoria: a saída mostra o código para a conferência manual.
      classificadas.push({ ...base, classe: 'divergentes', requisicaoIdOsLis: chave })
    } else {
      const idOsLisEhCpf = chave !== undefined && chave === (cpf ?? '').replace(/\D/g, '')
      classificadas.push({ ...base, classe: 'so_pdf', requisicaoIdOsLis: null, idOsLisEhCpf })
    }
  }

  for (const [os, chave] of idOsLisPorOs) {
    if (auditadas.has(chave) && !vistasNoPdf.has(os)) {
      classificadas.push({
        os,
        classe: 'so_idoslis',
        requisicaoPdf: null,
        requisicaoIdOsLis: chave,
        idOsLisEhCpf: false,
      })
    }
  }

  return classificadas
}
