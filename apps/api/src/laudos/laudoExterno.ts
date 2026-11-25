// ---------------------------------------------------------------------------
// "Laudo EXTERNO": o PDF que o laboratório de apoio emite e a recepção anexa à
// requisição no apLIS (imagem tipo 14). O que liga a O.S. à requisição é o PDF
// ESTAR ANEXADO nela; daqui saem só os dois campos que sustentam esse vínculo:
// o número de cada O.S. e o CPF impresso junto dela (para a barreira de
// identidade).
//
// Extração FECHADA: só o layout atual ("OS: <número>" no cabeçalho, rodapé
// Álvaro ou Dasa). Qualquer outra coisa — modelo antigo de jan–fev/2026, PDF
// sem texto, relatório de outro tipo — devolve `os: []`. Nunca um número
// achado por aproximação: uma O.S. errada aqui vira laudo de outra pessoa.
//
// UM PDF PODE TRAZER VÁRIAS O.S. Medição de 24/11/2026 (398 requisições, 80
// dias): em 15% dos arquivos há 2 ou 3 O.S., cada página com o cabeçalho da
// sua. Por isso `os` é lista.
//
// E O CPF É POR O.S., NÃO POR ARQUIVO. Caso real (25/11/2026): um PDF anexado
// a uma requisição com três O.S. — duas com o CPF do paciente e a terceira, a
// maior, com o CPF de OUTRA pessoa. Um CPF único por arquivo ou aprovaria as
// três ou reprovaria as três; o certo é cada O.S. responder pelo CPF das
// páginas em que ela aparece.
//
// A leitura do texto usa `unpdf` (pdf.js empacotado, sem binário nativo): o
// teste de viabilidade usou o `pdftotext`, que não existe na imagem de produção.
// ---------------------------------------------------------------------------

import { extractText, getDocumentProxy } from 'unpdf'

/** `ilegivel` = o arquivo não abriu como PDF ou não tem texto (digitalização). */
export type LayoutLaudoExterno = 'atual' | 'antigo' | 'desconhecido' | 'ilegivel'

/** Uma O.S. impressa no laudo, com a identidade que as páginas dela trazem. */
export interface OsDoLaudoExterno {
  numero: string
  /**
   * CPF impresso nas páginas desta O.S., só dígitos. `null` = não dá para
   * afirmar de quem ela é: página sem CPF, com CPF ilegível, com dois CPFs,
   * páginas da mesma O.S. com CPFs diferentes, ou página com mais de uma O.S.
   */
  cpf: string | null
  /**
   * Nome do paciente e data de nascimento (ISO, aaaa-mm-dd) impressos nas
   * páginas desta O.S. — a segunda prova de identidade, para o laudo que saiu
   * sem CPF ou com um CPF diferente do cadastro. Mesma regra do CPF: `null`
   * quando as páginas da O.S. não concordam num valor único. O nome vem como
   * está no laudo; quem compara é que normaliza (ver identidade.ts).
   */
  nome: string | null
  nascimento: string | null
  /** Em quantas páginas do arquivo a O.S. aparece. */
  paginas: number
}

export interface VinculoLaudoExterno {
  /**
   * As O.S. distintas do laudo; vazia = não deu para afirmar nenhuma.
   *
   * A MAIOR VEM PRIMEIRO: a que ocupa mais páginas (empate: a que aparece
   * antes). Quem só pode guardar uma O.S. na linha da requisição fica com a
   * remessa que tem mais exames, e não com a que abre o arquivo — nos laudos
   * reais a primeira costuma ser a menor. Página é aproximação de "mais
   * exames". As demais O.S. também podem ser do paciente e precisam chegar a
   * ele por outro caminho; e a ordem não diz nada sobre identidade — confira o
   * `cpf` de cada uma antes de usar.
   */
  os: OsDoLaudoExterno[]
  layout: LayoutLaudoExterno
}

// O rótulo precisa estar no começo da linha ou depois de espaço, e colado no
// ":" — é isso que deixa de fora o "OS Lis: …", que repete o `idOsLis` digitado
// à mão (código da requisição, CPF ou vazio) e NÃO é a O.S.
const ROTULO_OS = /(?:^|\s)OS:[ \t]*(\S*)/gm
const ROTULO_CPF = /(?:^|\s)CPF:[ \t]*(\S*)/gm
const MODELO_ANTIGO = /Ordem\s+Servi[çc]o/i

// "DN: dd/mm/aaaa | 36 anos…" — a linha do nascimento. O nome do paciente é a
// linha imediatamente acima dela (conferido contra laudos reais em 25/11/2026).
const LINHA_NASCIMENTO = /^DN:[ \t]*(\S*)/

const OS_VALIDA = /^\d{6,12}$/
const CPF_VALIDO = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/

/**
 * Os valores distintos que acompanham um rótulo no texto, só dígitos, na ordem
 * em que aparecem; `null` quando alguma ocorrência está fora do formato.
 *
 * O cabeçalho pode se repetir, então o mesmo valor várias vezes é normal. Já
 * uma ocorrência que não entendemos invalida as outras: se o rótulo apareceu
 * com algo estranho, não dá para afirmar que o resto conta a história toda.
 */
function valoresDoRotulo(texto: string, rotulo: RegExp, formato: RegExp): string[] | null {
  const valores = new Set<string>()
  for (const achado of texto.matchAll(rotulo)) {
    const valor = achado[1] ?? ''
    if (!formato.test(valor)) return null
    valores.add(valor.replace(/\D/g, ''))
  }
  return [...valores]
}

/** "dd/mm/aaaa" → "aaaa-mm-dd"; `null` se não for uma data que existe. */
function dataIso(bruto: string): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto)
  if (!partes) return null
  const [, dia, mes, ano] = partes
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  // O Date "corrige" 31/02 para março; se o mês mudou, a data não existia.
  return data.getUTCMonth() === Number(mes) - 1 ? `${ano}-${mes}-${dia}` : null
}

/**
 * Nome e nascimento que a página afirma, ou nulos. Uma página com duas linhas
 * "DN:" de pessoas diferentes não identifica ninguém.
 */
function pessoaDaPagina(pagina: string): { nome: string | null; nascimento: string | null } {
  const linhas = pagina.split('\n')
  const nomes = new Set<string>()
  const nascimentos = new Set<string | null>()
  linhas.forEach((linha, i) => {
    const achado = LINHA_NASCIMENTO.exec(linha)
    if (!achado) return
    nascimentos.add(dataIso(achado[1] ?? ''))
    nomes.add((linhas[i - 1] ?? '').trim())
  })
  const nome = nomes.size === 1 ? [...nomes][0]! : ''
  return {
    nome: nome || null,
    nascimento: nascimentos.size === 1 ? [...nascimentos][0]! : null,
  }
}

/** O valor em que todas as páginas concordam, ou `null`. */
const unico = <T>(valores: Set<T | null>): T | null => (valores.size === 1 ? [...valores][0]! : null)

/**
 * Função pura: texto extraído do PDF → as O.S., a identidade de cada uma e o layout.
 * Recebe o texto página a página (ou inteiro, que vale como uma página só).
 */
export function extrairVinculoDoLaudoExterno(textoOuPaginas: string | string[]): VinculoLaudoExterno {
  const paginas = Array.isArray(textoOuPaginas) ? textoOuPaginas : [textoOuPaginas]
  const texto = paginas.join('\n')

  if ([...texto.matchAll(ROTULO_OS)].length === 0) {
    return { os: [], layout: MODELO_ANTIGO.test(texto) ? 'antigo' : 'desconhecido' }
  }

  // O Map guarda a ordem em que as O.S. aparecem; `cpfs` junta o que cada
  // página dela afirma (`null` = aquela página não serve de identidade).
  const porOs = new Map<
    string,
    { paginas: number; cpfs: Set<string | null>; nomes: Set<string | null>; nascimentos: Set<string | null> }
  >()
  for (const pagina of paginas) {
    const osDaPagina = valoresDoRotulo(pagina, ROTULO_OS, OS_VALIDA)
    // Um rótulo de O.S. ilegível em QUALQUER página esvazia o laudo inteiro.
    if (osDaPagina === null) return { os: [], layout: 'atual' }

    const cpfsDaPagina = valoresDoRotulo(pagina, ROTULO_CPF, CPF_VALIDO)
    // A página só identifica alguém quando tem UMA O.S. e UM CPF: com duas
    // O.S. não se sabe de qual é o CPF, e com dois CPFs não se sabe qual vale.
    const umaOsSo = osDaPagina.length === 1
    const cpfDaPagina = umaOsSo && cpfsDaPagina?.length === 1 ? cpfsDaPagina[0]! : null
    const pessoa = umaOsSo ? pessoaDaPagina(pagina) : { nome: null, nascimento: null }

    for (const numero of osDaPagina) {
      const acumulado = porOs.get(numero) ?? {
        paginas: 0,
        cpfs: new Set(),
        nomes: new Set(),
        nascimentos: new Set(),
      }
      acumulado.paginas++
      acumulado.cpfs.add(cpfDaPagina)
      acumulado.nomes.add(pessoa.nome)
      acumulado.nascimentos.add(pessoa.nascimento)
      porOs.set(numero, acumulado)
    }
  }

  // Todas as páginas da O.S. precisam concordar: num único CPF, num único
  // nome, num único nascimento — cada campo por si.
  const os = [...porOs].map(([numero, acumulado]) => ({
    numero,
    cpf: unico(acumulado.cpfs),
    nome: unico(acumulado.nomes),
    nascimento: unico(acumulado.nascimentos),
    paginas: acumulado.paginas,
  }))
  // O sort é estável: no empate fica a O.S. que apareceu antes.
  os.sort((a, b) => b.paginas - a.paginas)
  return { os, layout: 'atual' }
}

/**
 * PDF em memória → O.S. (com o CPF de cada uma) e layout. Nunca lança: arquivo
 * corrompido, cifrado ou sem camada de texto devolve `layout: 'ilegivel'` sem
 * O.S., que para quem chama é só mais um jeito de ficar sem vínculo pelo PDF.
 */
export async function lerLaudoExterno(pdf: Uint8Array): Promise<VinculoLaudoExterno> {
  let paginas: string[]
  try {
    // Cópia: o pdf.js pode transferir o buffer para si, e quem chamou ainda
    // pode precisar dos bytes (entregar o arquivo ao paciente, por exemplo).
    const documento = await getDocumentProxy(pdf.slice(), { verbosity: 0 })
    paginas = (await extractText(documento, { mergePages: false })).text
  } catch {
    paginas = []
  }
  if (!paginas.join('').trim()) return { os: [], layout: 'ilegivel' }
  return extrairVinculoDoLaudoExterno(paginas)
}
