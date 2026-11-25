// ---------------------------------------------------------------------------
// De qual requisição é uma O.S., quando as duas fontes do vínculo falam dela:
//
//  - PDF: a O.S. está impressa no "Laudo EXTERNO" anexado àquela requisição;
//  - idOsLis: o código de requisição que a recepção digitou na O.S., na AOL.
//
// Aqui só entram requisições DO PACIENTE e O.S. que já passaram pela
// conferência de identidade do PDF: a regra escolhe entre pedidos da mesma
// pessoa, nunca decide de quem a O.S. é.
// ---------------------------------------------------------------------------

export type FonteDoVinculo = 'pdf' | 'idOsLis'

/**
 * A fonte que vence quando as duas situam a O.S. em requisições diferentes.
 * O porquê está em docs/LAUDOS_LIS.md, "Quando o PDF e o idOsLis divergem".
 */
export const FONTE_QUE_VENCE: FonteDoVinculo = 'pdf'

export interface PedidoDaOs {
  /** A requisição em que a O.S. deve ficar; `null` = as fontes não permitem dizer. */
  pedido: string | null
  /**
   * As DUAS fontes afirmam algo e há um pedido. Só isto autoriza corrigir um
   * vínculo já gravado: com uma fonte só (o site fora do ar, o `idOsLis` em
   * branco) o que está no banco pode ser justamente o que a outra disse antes.
   */
  decidido: boolean
  /** As duas afirmam, e requisições diferentes. */
  divergem: boolean
}

/**
 * @param pdf requisições do paciente cujo Laudo EXTERNO traz a O.S.
 * @param idOsLis requisição do paciente que o `idOsLis` da O.S. aponta, se aponta
 */
export function pedidoDaOs(
  pdf: readonly string[],
  idOsLis: string | null,
  vence: FonteDoVinculo = FONTE_QUE_VENCE,
): PedidoDaOs {
  const doPdf = [...new Set(pdf)]
  // O laudo anexado em mais de uma requisição não aponta nenhuma sozinho.
  const unicoDoPdf = doPdf.length === 1 ? doPdf[0]! : null

  if (idOsLis === null) return { pedido: unicoDoPdf, decidido: false, divergem: false }
  if (doPdf.length === 0) return { pedido: idOsLis, decidido: false, divergem: false }
  if (doPdf.includes(idOsLis)) return { pedido: idOsLis, decidido: true, divergem: false }

  const pedido = vence === 'idOsLis' ? idOsLis : unicoDoPdf
  return { pedido, decidido: pedido !== null, divergem: true }
}
