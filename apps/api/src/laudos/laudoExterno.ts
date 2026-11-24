// ---------------------------------------------------------------------------
// "Laudo EXTERNO": o PDF que o laboratório de apoio emite e a recepção anexa à
// requisição no apLIS (imagem tipo 14). O que liga a O.S. à requisição é o PDF
// ESTAR ANEXADO nela; daqui saem só os dois campos que sustentam esse vínculo:
// o número da O.S. e o CPF do paciente (para a barreira de identidade).
//
// Extração FECHADA: só o layout atual ("OS: <número>" no cabeçalho, rodapé
// Álvaro ou Dasa). Qualquer outra coisa — modelo antigo de jan–fev/2026, PDF
// sem texto, relatório de outro tipo — devolve `os: []`. Nunca um número
// achado por aproximação: uma O.S. errada aqui vira laudo de outra pessoa.
//
// UM PDF PODE TRAZER VÁRIAS O.S. Medição de 24/11/2026 (398 requisições, 80
// dias): em 15% delas o anexo é um arquivo só com 2 ou 3 O.S., cada página com
// o cabeçalho da sua. Por isso `os` é lista. O CPF não: é um paciente por
// requisição, e dois CPFs diferentes no mesmo arquivo anulam a identidade.
//
// A leitura do texto usa `unpdf` (pdf.js empacotado, sem binário nativo): o
// teste de viabilidade usou o `pdftotext`, que não existe na imagem de produção.
// ---------------------------------------------------------------------------

import { extractText, getDocumentProxy } from 'unpdf'

/** `ilegivel` = o arquivo não abriu como PDF ou não tem texto (digitalização). */
export type LayoutLaudoExterno = 'atual' | 'antigo' | 'desconhecido' | 'ilegivel'

export interface VinculoLaudoExterno {
  /** As O.S. distintas impressas no laudo, na ordem; vazia = não deu para afirmar. */
  os: string[]
  /** CPF impresso no laudo, só dígitos; `null` = ausente ou ilegível. */
  cpf: string | null
  layout: LayoutLaudoExterno
}

// O rótulo precisa estar no começo da linha ou depois de espaço, e colado no
// ":" — é isso que deixa de fora o "OS Lis: …", que repete o `idOsLis` digitado
// à mão (código da requisição, CPF ou vazio) e NÃO é a O.S.
const ROTULO_OS = /(?:^|\s)OS:[ \t]*(\S*)/gm
const ROTULO_CPF = /(?:^|\s)CPF:[ \t]*(\S*)/gm
const MODELO_ANTIGO = /Ordem\s+Servi[çc]o/i

const OS_VALIDA = /^\d{6,12}$/
const CPF_VALIDO = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/

/**
 * Os valores distintos que acompanham um rótulo no texto, só dígitos, na ordem
 * em que aparecem. O cabeçalho se repete a cada página, então o mesmo valor
 * várias vezes é o normal.
 *
 * Uma única ocorrência fora do formato esvazia o resultado inteiro: se o
 * rótulo apareceu com algo que não entendemos, não dá para afirmar que as
 * outras ocorrências contam a história toda.
 */
function valoresDoRotulo(texto: string, rotulo: RegExp, formato: RegExp): string[] {
  const valores = new Set<string>()
  for (const achado of texto.matchAll(rotulo)) {
    const valor = achado[1] ?? ''
    if (!formato.test(valor)) return []
    valores.add(valor.replace(/\D/g, ''))
  }
  return [...valores]
}

/** Função pura: texto extraído do PDF → O.S., CPF e o layout reconhecido. */
export function extrairVinculoDoLaudoExterno(texto: string): VinculoLaudoExterno {
  const temRotuloOs = [...texto.matchAll(ROTULO_OS)].length > 0
  const layout: LayoutLaudoExterno = temRotuloOs
    ? 'atual'
    : MODELO_ANTIGO.test(texto)
      ? 'antigo'
      : 'desconhecido'

  // Dois CPFs diferentes no mesmo laudo: nenhum serve de identidade.
  const cpfs = valoresDoRotulo(texto, ROTULO_CPF, CPF_VALIDO)

  return {
    os: layout === 'atual' ? valoresDoRotulo(texto, ROTULO_OS, OS_VALIDA) : [],
    cpf: cpfs.length === 1 ? cpfs[0]! : null,
    layout,
  }
}

/**
 * PDF em memória → O.S., CPF e layout. Nunca lança: arquivo corrompido, cifrado
 * ou sem camada de texto devolve `layout: 'ilegivel'` sem O.S. nem CPF,
 * que para quem chama é só mais um jeito de ficar sem vínculo pelo PDF.
 */
export async function lerLaudoExterno(pdf: Uint8Array): Promise<VinculoLaudoExterno> {
  let texto: string
  try {
    // Cópia: o pdf.js pode transferir o buffer para si, e quem chamou ainda
    // pode precisar dos bytes (entregar o arquivo ao paciente, por exemplo).
    const documento = await getDocumentProxy(pdf.slice(), { verbosity: 0 })
    const { text } = await extractText(documento, { mergePages: false })
    texto = text.join('\n')
  } catch {
    texto = ''
  }
  if (!texto.trim()) return { os: [], cpf: null, layout: 'ilegivel' }
  return extrairVinculoDoLaudoExterno(texto)
}
