import type { AolExam, AplisExam, LaudoLaboratorio, LaudoPainel } from './types.js'

// Peças compartilhadas por todas as estratégias de mapeamento.

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const MESES_CURTO = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

// Os LIS misturam formatos: o ApLIS manda "12/05/2026 14:12" e a AOL manda ISO.
// Tudo é lido em UTC para a data não escorregar um dia por fuso.
function parseData(bruta: string): Date | null {
  if (!bruta) return null

  const br = bruta.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00Z`)

  const normalizada = bruta.replace(' ', 'T').replace(/T\d{2}:\d{2}:\d{2}$/, (s) => `${s}Z`)
  const d = new Date(normalizada)
  return isNaN(d.getTime()) ? null : d
}

// Gera de uma vez as três formas usadas no laudo: card, texto e chave ISO.
export function buildDateStrings(bruta: string | null): { date: string; fullDate: string; iso: string } {
  if (!bruta) return { date: '—', fullDate: '—', iso: '' }

  const d = parseData(bruta)
  // Formato desconhecido: repassa o texto cru em vez de mostrar '—'. O iso fica
  // vazio, então esta data não é usada para ordenar.
  if (!d) return { date: bruta, fullDate: bruta, iso: '' }

  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = d.getUTCMonth()
  const ano = d.getUTCFullYear()

  return {
    date: `${dia} ${MESES_CURTO[mes]} ${ano}`,
    fullDate: `${dia} de ${MESES_EXTENSO[mes]} de ${ano}`,
    iso: `${ano}-${String(mes + 1).padStart(2, '0')}-${dia}`,
  }
}

// ---------------------------------------------------------------------------
// Laboratório
// ---------------------------------------------------------------------------

// Fallback para quando o LIS não informa o laboratório executor. Herdado do
// pipeline original — confirmar se é o executor certo antes de exibir em laudo
// impresso.
export const DEFAULT_LABORATORIO: LaudoLaboratorio = {
  nome: 'DASA – Diagnósticos da América',
  cnes: '2337378',
  endereco: 'SIA Trecho 3, Lotes 1.110/1.120 – Brasília, DF',
}

// ---------------------------------------------------------------------------
// Material de coleta
// ---------------------------------------------------------------------------

// A AOL escreve o material como instrução interna de bancada: "soro infecciosas"
// (roteado p/ bancada de infecciosas), "soro congelado ambar vitac" (tubo âmbar
// congelado p/ vitamina C), "soro-trace s/aditivo zn" (tubo trace-element p/
// zinco). O prefixo diz o que o material É; o resto é logística que não
// interessa ao paciente.
const MATERIAL_EXIBICAO: Record<string, string> = {
  'urina': 'Urina (Jato Médio)', // herdado do pipeline original
  'urina jato médio': 'Urina (Jato Médio)',
  'urina jato medio': 'Urina (Jato Médio)',
}

// Ordem importa: o primeiro prefixo que casar ganha ("sangue total" antes de
// "sangue").
const MATERIAL_PREFIXOS: Array<[string, string]> = [
  ['soro', 'Soro'],
  ['sangue total', 'Sangue Total com EDTA'],
  ['sangue', 'Sangue'],
  ['plasma', 'Plasma'],
  // Genérico de propósito: "urina 24h" NÃO é jato médio — o prefixo não pode
  // afirmar o tipo de coleta.
  ['urina', 'Urina'],
  ['fezes', 'Fezes'],
]

export function normalizeMaterial(bruto: string | null): string {
  if (!bruto) return 'Soro'
  const chave = bruto.toLowerCase().trim()

  const exato = MATERIAL_EXIBICAO[chave]
  if (exato) return exato

  const porPrefixo = MATERIAL_PREFIXOS.find(([prefixo]) => chave.startsWith(prefixo))
  // Material desconhecido passa cru — feio na tela, mas melhor que esconder.
  return porPrefixo?.[1] ?? bruto
}

// ---------------------------------------------------------------------------
// Metadados comuns
// ---------------------------------------------------------------------------

export interface ExamMeta {
  date: string
  fullDate: string
  data_coleta: string
  data_registro: string
  data_emissao: string
  material: string
  metodo: string
  laboratorio: LaudoLaboratorio
  unit: string
  doctor: string
  crm: string
}

// Cabeçalho do laudo, igual para qualquer tipo de exame. A data de emissão do
// ApLIS ganha da AOL por ser a da liberação oficial; o card exibe a emissão
// quando existe e cai para a coleta enquanto o resultado não saiu.
export function buildMeta(aol: AolExam, aplis: AplisExam | null): ExamMeta {
  const coleta = buildDateStrings(aol.data_solicitacao)
  const emissao = buildDateStrings(aplis?.data_liberacao ?? aol.data_liberacao)
  const exibicao = emissao.iso ? emissao : coleta

  return {
    date: exibicao.date,
    fullDate: exibicao.fullDate,
    data_coleta: coleta.iso || emissao.iso,
    data_registro: coleta.iso || emissao.iso,
    data_emissao: emissao.iso || coleta.iso,
    material: normalizeMaterial(aol.material),
    metodo: aol.metodo ?? '',
    laboratorio: DEFAULT_LABORATORIO,
    unit: 'DASA',
    doctor: aol.doctor ?? '',
    crm: aol.crm_documento ?? '',
  }
}

// ---------------------------------------------------------------------------
// Marcadores
// ---------------------------------------------------------------------------

// Decide se um valor está fora da faixa. Os LIS mandam a referência como TEXTO
// livre ("3,5 - 5,1", "70 a 99", "< 200", "Inferior a 1,20"), então só dá para
// avaliar os formatos reconhecidos — qualquer outro é tratado como dentro da
// faixa, para não alarmar o paciente com um falso positivo.
export function isOutOfRange(valor: string | null, ref: string | null): boolean {
  if (!valor || !ref) return false

  // Referência multilinha = tabela estratificada que NÃO foi reduzida à linha
  // do paciente. Avaliá-la casaria a primeira faixa etária ("0 - 1 mês") como
  // se fosse a faixa do valor — o Colesterol de um adulto sairia marcado como
  // ATENÇÃO. Sem redução, não há comparação.
  if (ref.includes('\n')) return false

  const num = parseFloat(valor.replace(',', '.'))
  if (isNaN(num)) return false

  const n = (s: string) => parseFloat(s.replace(',', '.'))

  // "3,5 - 5,1" e a variante por extenso da AOL, "70 a 99".
  const faixa = ref.match(/^([\d.,]+)(?:\s*[–-]\s*|\s+a\s+)([\d.,]+)/)
  if (faixa?.[1] && faixa[2]) {
    return num < n(faixa[1]) || num > n(faixa[2])
  }

  // "ou igual" primeiro: o limite é inclusivo. O "a" some em algumas variantes
  // da AOL ("Inferior ou igual 40 U/L") e vira "à" em outras.
  const menorIgual = ref.match(/^inferior\s+ou\s+igual\s+(?:[aà]\s+)?([\d.,]+)/i)
  if (menorIgual?.[1]) return num > n(menorIgual[1])

  const menorEstrito = ref.match(/^<\s*([\d.,]+)/) ?? ref.match(/^inferior\s+(?:[aà]\s+)?([\d.,]+)/i)
  if (menorEstrito?.[1]) return num >= n(menorEstrito[1])

  const maiorIgual = ref.match(/^superior\s+ou\s+igual\s+(?:[aà]\s+)?([\d.,]+)/i)
  if (maiorIgual?.[1]) return num < n(maiorIgual[1])

  const maiorEstrito = ref.match(/^>\s*([\d.,]+)/) ?? ref.match(/^superior\s+(?:[aà]\s+)?([\d.,]+)/i)
  if (maiorEstrito?.[1]) return num <= n(maiorEstrito[1])

  return false
}

// ---------------------------------------------------------------------------
// Referência estratificada por idade/sexo
// ---------------------------------------------------------------------------

// Quem o laudo descreve — usado só para escolher a linha certa da tabela de
// referência. Idade fracionária de propósito: as faixas pediátricas são em dias
// e meses ("0 - 15 dias"), e um bebê de 100 dias com idade inteira 0 casaria a
// faixa errada.
export interface PerfilPaciente {
  idadeAnos: number
  sexo: 'M' | 'F'
}

export function idadeEmAnos(nascimentoIso: string, referencia = new Date()): number {
  const nasc = new Date(`${nascimentoIso.slice(0, 10)}T00:00:00Z`)
  if (isNaN(nasc.getTime())) return NaN
  return (referencia.getTime() - nasc.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

const UNIDADE_EM_ANOS: Record<string, number> = {
  dia: 1 / 365.25, dias: 1 / 365.25,
  mês: 1 / 12, mes: 1 / 12, meses: 1 / 12,
  ano: 1, anos: 1,
}

const RE_FAIXA_ATE = /^(\d+)\s*(dias?|m[eê]s(?:es)?|anos?)?\s*-\s*(\d+)\s*(dias?|m[eê]s(?:es)?|anos?)$/i
const RE_FAIXA_ACIMA = /^(\d+)\s*(dias?|m[eê]s(?:es)?|anos?)\s+e\s+acima$/i

// "0 - 1 ano" → [0, 1); "15 dias - 1 ano" → [0.04, 1); "19 anos e acima" → [19, ∞).
// A unidade do início herda a do fim quando omitida ("0 - 1 ano").
function parseFaixaEtaria(texto: string): { min: number; max: number } | null {
  const ate = RE_FAIXA_ATE.exec(texto)
  if (ate) {
    const unidadeFim = UNIDADE_EM_ANOS[ate[4]!.toLowerCase()] ?? 1
    const unidadeIni = ate[2] ? (UNIDADE_EM_ANOS[ate[2].toLowerCase()] ?? 1) : unidadeFim
    return { min: Number(ate[1]) * unidadeIni, max: Number(ate[3]) * unidadeFim }
  }
  const acima = RE_FAIXA_ACIMA.exec(texto)
  if (acima) {
    const unidade = UNIDADE_EM_ANOS[acima[2]!.toLowerCase()] ?? 1
    return { min: Number(acima[1]) * unidade, max: Infinity }
  }
  return null
}

const RE_SEXO = /^(Feminino|Masculino)\t+(.+)$/

type ValoresPorSexo = Partial<Record<'M' | 'F', string>>

// Lê a sequência de sub-linhas "Feminino\t… / Masculino\t…" a partir de
// `inicio`. Linha sem o prefixo de sexo é CONTINUAÇÃO do sexo corrente (as
// fases do ciclo na progesterona, por exemplo) — mas só no formato "rótulo:
// valor"; sem os dois pontos é título de outra seção ("Gestantes*") e encerra
// o bloco, assim como uma faixa etária nova. Devolve null se não havia nenhuma
// linha de sexo.
function leValoresPorSexo(
  linhas: string[],
  inicio: number,
): { valores: ValoresPorSexo; fim: number } | null {
  const valores: ValoresPorSexo = {}
  let atual: 'M' | 'F' | null = null
  let i = inicio

  for (; i < linhas.length; i++) {
    const linha = linhas[i]!.trim()
    const sexo = RE_SEXO.exec(linha)
    if (sexo) {
      atual = sexo[1] === 'Feminino' ? 'F' : 'M'
      valores[atual] = sexo[2]!.replace(/\t+/g, ' ').trim()
      continue
    }
    if (parseFaixaEtaria(linha.split('\t')[0]!.trim())) break
    if (!atual || !linha.includes(':')) break
    valores[atual] += `\n${linha.replace(/\t+/g, ' ')}`
  }

  if (!valores.F && !valores.M) return null
  return { valores, fim: i }
}

/**
 * Reduz uma referência estratificada por idade/sexo à linha do paciente.
 *
 * Entende três formatos da AOL: faixa etária com valor na linha ("19 anos e
 * acima\t2,5 a 13,1"), faixa com sub-linhas de sexo, e tabela só por sexo, sem
 * idade ("Feminino\tInferior a 40 U/L"). Só simplifica quando entende o texto
 * INTEIRO: escolher a faixa errada mostraria uma referência clinicamente
 * errada, então qualquer linha não reconhecida devolve null e o chamador exibe
 * o texto completo — feio, mas nunca errado. (É o que acontece com o TSH, cuja
 * tabela termina numa seção "Gestantes*" que não sabemos aplicar.)
 */
export function simplificaReferencia(texto: string, perfil: PerfilPaciente): string | null {
  const linhas = texto.split('\n').filter((l) => l.trim() !== '')
  if (linhas.length < 2) return null

  interface Banda {
    min: number
    max: number
    ref?: string
    porSexo?: ValoresPorSexo
  }
  const bandas: Banda[] = []

  if (RE_SEXO.test(linhas[0]!.trim())) {
    // Tabela só por sexo — vale para qualquer idade.
    const bloco = leValoresPorSexo(linhas, 0)
    if (!bloco || bloco.fim !== linhas.length) return null
    bandas.push({ min: 0, max: Infinity, porSexo: bloco.valores })
  } else {
    for (let i = 0; i < linhas.length; ) {
      const [cabeca = '', ...resto] = linhas[i]!.trim().split('\t')
      const faixa = parseFaixaEtaria(cabeca.trim())
      if (!faixa) return null

      const ref = resto.join(' ').trim()
      if (ref) {
        bandas.push({ ...faixa, ref })
        i++
        continue
      }

      // Faixa sem valor na própria linha: os valores vêm por sexo logo abaixo.
      const bloco = leValoresPorSexo(linhas, i + 1)
      if (!bloco) return null
      bandas.push({ ...faixa, porSexo: bloco.valores })
      i = bloco.fim
    }
  }

  const banda = bandas.find((b) => perfil.idadeAnos >= b.min && perfil.idadeAnos < b.max)
  if (!banda) return null
  return banda.ref ?? banda.porSexo?.[perfil.sexo] ?? null
}

// A série histórica do marcador (sparkline) só existe quando há vários laudos do
// mesmo analito. Aqui sai o ponto deste laudo; montar a série é trabalho da UI.
export function toTrend(valor: string | null): number[] {
  if (!valor) return []
  const num = parseFloat(valor.replace(',', '.'))
  return isNaN(num) ? [] : [num]
}

// ATENÇÃO — o `ok` de um marcador SEM faixa de referência é `true` por construção
// (`isOutOfRange` devolve false quando não há o que comparar). Contar esses como
// "dentro da referência" faria o laudo AFIRMAR normalidade sobre um valor que nunca
// foi comparado com nada. Num app de saúde isso não é um detalhe de texto.
//
// Desde 22/07/2026 pedimos `referenciaResultado=true` à AOL, então a maioria dos
// analitos TEM referência — mas seguem sem: os do hemograma (texto da AOL sem
// rótulo por analito, descartado no parser) e os de referência em texto livre
// que o isOutOfRange não avalia.
export function buildSummaryQuantitative(panels: LaudoPainel[]): string {
  const comReferencia = panels.filter((p) => p.ref)
  const semReferencia = panels.length - comReferencia.length

  if (comReferencia.length === 0) {
    return 'Resultado liberado. O laboratório não enviou os valores de referência — a interpretação deve ser feita pelo seu médico.'
  }

  const foraDaFaixa = comReferencia.filter((p) => !p.ok)
  const ressalva =
    semReferencia > 0 ? ` ${semReferencia} analito(s) vieram sem valor de referência.` : ''

  if (foraDaFaixa.length === 0) {
    return `Todos os analitos com referência informada estão dentro da faixa.${ressalva}`
  }
  return `${foraDaFaixa.length} analito(s) fora da referência: ${foraDaFaixa.map((p) => p.name).join(', ')}.${ressalva}`
}
