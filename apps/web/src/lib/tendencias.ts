import type { PillTone } from '../components/portal'
import type { Exam, ExamPanel } from './exame'
import { diaNoFuso } from './regiao'

// ---------------------------------------------------------------------------
// Tendências: a evolução de cada marcador ao longo das coletas do paciente,
// montada dos resultados que ele já tem (useResultados). Um marcador entra a
// partir de duas coletas com valor numérico. As notas só repetem o que o laudo
// diz (dentro ou fora da referência) — nenhuma interpretação clínica é
// inventada aqui.
// ---------------------------------------------------------------------------

export type Direcao = 'up' | 'down' | 'flat'

export interface Tendencia {
  marcador: string
  /** Último valor, como veio do laudo ("14,2"). */
  valor: string
  unidade: string
  variacao: string
  /** accent = último valor fora da referência; neutral = dentro. */
  tom: PillTone
  direcao: Direcao
  nota: string
  /** Valores em ordem de coleta, da primeira para a última. */
  serie: number[]
  /** Exame da última coleta, para o "Ver exame". */
  exameId: string
  foraDaReferencia: boolean
}

interface Ponto {
  /** Dia da coleta (dias desde 1970). */
  dia: number
  numero: number
  /** Casas decimais como o valor foi escrito, para a variação sair igual. */
  casas: number
  painel: ExamPanel
  exameId: string
}

// Formato brasileiro dos laudos: vírgula é decimal e ponto é milhar ("14,2",
// "6.500", "212.000", "1.234,5"). Milhar não começa em 0, então "0.500" é
// decimal; sem vírgula, ponto que não forma milhar é decimal ("14.2", "0.5").
// Texto ("Negativo"), faixa ("<5") ou vazio → null. Devolve também as casas
// decimais como foram escritas ("6.500" → 0, "14,2" → 1).
function lerValor(valor: string): { numero: number; casas: number } | null {
  const v = valor.trim()
  const brasileiro = /^-?(?:[1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(v)
  if (brasileiro) return { numero: Number(v.replace(/\./g, '').replace(',', '.')), casas: brasileiro[1]?.length ?? 0 }
  const comPonto = /^-?\d+\.(\d+)$/.exec(v)
  if (comPonto) return { numero: Number(v), casas: comPonto[1]!.length }
  return null
}

// Diferença menor que isto é "igual": absorve o erro de ponto flutuante
// (14,5 − 12,8 = 1,6999…), já que os valores vêm de texto decimal.
const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 1e-9

function formataNumero(n: number, casas: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n)
}

const normaliza = (s: string) => s.trim().toLowerCase()

// O mesmo marcador é o mesmo nome e unidade DENTRO do mesmo exame (ou grupo do
// pedido): "Neutrófilos" do hemograma não é o do líquor, e o "Resultado" do TSH
// não é o do T4.
const chaveDoMarcador = (contexto: string, p: ExamPanel) =>
  [normaliza(contexto), normaliza(p.name), normaliza(p.unit)].join('|')

// Dia da coleta. Data sem hora ("2026-07-24") é o dia em si; um instante
// (liberação do FlowLab) vira o dia no fuso escolhido nas Configurações.
function diaDaColeta(iso: string): number {
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (soData) return Date.UTC(Number(soData[1]), Number(soData[2]) - 1, Number(soData[3])) / 86_400_000
  return diaNoFuso(new Date(iso))
}

// Os marcadores do exame com o contexto de cada um. No pedido do laboratório,
// `panels` já é a união dos grupos: usa os grupos quando há, senão os painéis.
function marcadoresDo(e: Exam): { contexto: string; painel: ExamPanel }[] {
  if (e.groups?.length) return e.groups.flatMap((g) => g.panels.map((painel) => ({ contexto: g.name, painel })))
  return e.panels.map((painel) => ({ contexto: e.name, painel }))
}

function variacaoDe(pontos: Ponto[]): { direcao: Direcao; texto: string } {
  const ultimo = pontos[pontos.length - 1]!
  const anterior = pontos[pontos.length - 2]!
  const diferenca = ultimo.numero - anterior.numero
  const casas = Math.max(ultimo.casas, anterior.casas)
  if (mesmoValor(ultimo.numero, anterior.numero)) {
    // Quantas das últimas coletas seguidas têm o mesmo valor (mesma comparação).
    let iguais = 1
    for (let i = pontos.length - 2; i >= 0 && mesmoValor(pontos[i]!.numero, ultimo.numero); i--) iguais++
    return { direcao: 'flat', texto: iguais >= 3 ? `Estável há ${iguais} coletas` : 'Igual à coleta anterior' }
  }
  const sinal = diferenca > 0 ? '+' : '−'
  return {
    direcao: diferenca > 0 ? 'up' : 'down',
    texto: `${sinal}${formataNumero(Math.abs(diferenca), casas)} desde a coleta anterior`,
  }
}

function notaDe(p: ExamPanel): string {
  const ref = p.ref.trim() ? ` (${p.ref.trim()})` : ''
  return p.ok
    ? `Dentro da referência${ref}.`
    : `Fora da referência${ref}. Converse com seu médico sobre este resultado.`
}

/**
 * `exams` na ordem de useResultados: do mais novo para o mais antigo. É ela que
 * decide qual versão vale quando há dois laudos do mesmo marcador no mesmo dia.
 */
export function tendenciasDosExames(exams: readonly Exam[]): Tendencia[] {
  // Por marcador, a série de cada fonte separada: o FlowLab só informa a
  // liberação (não a coleta), então o mesmo exame vindo também do laboratório
  // cairia noutro dia e contaria como duas coletas. Fica a fonte mais completa.
  const porMarcador = new Map<string, Map<string, Map<number, Ponto>>>()
  for (const e of exams) {
    // O substituído foi corrigido por outro. Exame ainda em análise entra: um
    // pedido parcial já tem valores liberados (os pendentes vêm sem número).
    if (e.retificado || e.somenteLeituraAdmin || !e.coletadoEm) continue
    const dia = diaDaColeta(e.coletadoEm)
    for (const { contexto, painel: p } of marcadoresDo(e)) {
      const lido = lerValor(p.value)
      if (lido === null) continue
      const chave = chaveDoMarcador(contexto, p)
      const fontes = porMarcador.get(chave) ?? new Map<string, Map<number, Ponto>>()
      const fonte = e.origem ?? 'lis'
      const pontos = fontes.get(fonte) ?? new Map<number, Ponto>()
      // Uma coleta por dia; vale a primeira vista, que é a versão mais recente.
      if (!pontos.has(dia)) pontos.set(dia, { dia, ...lido, painel: p, exameId: e.id })
      fontes.set(fonte, pontos)
      porMarcador.set(chave, fontes)
    }
  }

  const tendencias: Tendencia[] = []
  for (const fontes of porMarcador.values()) {
    // Mais coletas vence; no empate, o laboratório (traz a data da coleta).
    const mapa = [...fontes.entries()].sort(
      ([fa, a], [fb, b]) => b.size - a.size || Number(fb === 'lis') - Number(fa === 'lis'),
    )[0]![1]
    if (mapa.size < 2) continue
    const pontos = [...mapa.values()].sort((a, b) => a.dia - b.dia)
    const ultimo = pontos[pontos.length - 1]!
    const { direcao, texto } = variacaoDe(pontos)
    tendencias.push({
      marcador: ultimo.painel.name,
      valor: ultimo.painel.value,
      unidade: ultimo.painel.unit,
      variacao: texto,
      tom: ultimo.painel.ok ? 'neutral' : 'accent',
      direcao,
      nota: notaDe(ultimo.painel),
      serie: pontos.map((p) => p.numero),
      exameId: ultimo.exameId,
      foraDaReferencia: !ultimo.painel.ok,
    })
  }

  // Fora da referência primeiro; depois quem tem mais coletas; depois o nome.
  return tendencias.sort(
    (a, b) =>
      Number(b.foraDaReferencia) - Number(a.foraDaReferencia) ||
      b.serie.length - a.serie.length ||
      a.marcador.localeCompare(b.marcador, 'pt-BR'),
  )
}

/** "De 4 marcadores acompanhados, 3 estão dentro da referência e 1 está fora (LDL)." */
export function resumoDasTendencias(tendencias: readonly Tendencia[]): string {
  const total = tendencias.length
  const fora = tendencias.filter((t) => t.foraDaReferencia)
  const dentro = total - fora.length
  const acompanhados = total === 1 ? '1 marcador acompanhado' : `${total} marcadores acompanhados`
  const partes: string[] = []
  if (dentro > 0) partes.push(`${dentro} ${dentro === 1 ? 'está' : 'estão'} dentro da referência`)
  if (fora.length > 0) {
    partes.push(`${fora.length} ${fora.length === 1 ? 'está' : 'estão'} fora (${fora.map((t) => t.marcador).join(', ')})`)
  }
  return `De ${acompanhados}, ${partes.join(' e ')}.`
}
