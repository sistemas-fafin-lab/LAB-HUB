import type { PillTone } from '../components/portal'
import type { Exam, ExamPanel } from './exame'

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
  data: string
  numero: number
  painel: ExamPanel
  exameId: string
}

// "14,2" / "1.234,5" / "14.2" → número; "<5", "Negativo" → null.
function numeroDoValor(valor: string): number | null {
  const v = valor.trim()
  const normalizado = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null
  return Number(normalizado)
}

const casasDecimais = (valor: string) => /[.,](\d+)$/.exec(valor.trim())?.[1]?.length ?? 0

function formataNumero(n: number, casas: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n)
}

const chaveDoMarcador = (p: ExamPanel) => `${p.name.trim().toLowerCase()}|${p.unit.trim().toLowerCase()}`

function variacaoDe(pontos: Ponto[]): { direcao: Direcao; texto: string } {
  const ultimo = pontos[pontos.length - 1]!
  const anterior = pontos[pontos.length - 2]!
  const diferenca = ultimo.numero - anterior.numero
  const casas = Math.max(casasDecimais(ultimo.painel.value), casasDecimais(anterior.painel.value))
  if (Number(diferenca.toFixed(casas)) === 0) {
    // Quantas das últimas coletas seguidas têm o mesmo valor.
    let iguais = 1
    for (let i = pontos.length - 2; i >= 0 && pontos[i]!.numero === ultimo.numero; i--) iguais++
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

export function tendenciasDosExames(exams: readonly Exam[]): Tendencia[] {
  const porMarcador = new Map<string, Map<string, Ponto>>()
  for (const e of exams) {
    // Em análise ainda não tem resultado; o substituído foi corrigido por outro.
    if (e.status !== 'ready' || e.retificado || e.somenteLeituraAdmin || !e.coletadoEm) continue
    const data = e.coletadoEm.slice(0, 10)
    const paineis = [...e.panels, ...(e.groups ?? []).flatMap((g) => g.panels)]
    for (const p of paineis) {
      const numero = numeroDoValor(p.value)
      if (numero === null) continue
      const chave = chaveDoMarcador(p)
      const pontos = porMarcador.get(chave) ?? new Map<string, Ponto>()
      // Uma coleta por dia: o mesmo marcador em dois laudos do mesmo dia conta uma vez.
      pontos.set(data, { data, numero, painel: p, exameId: e.id })
      porMarcador.set(chave, pontos)
    }
  }

  const tendencias: Tendencia[] = []
  for (const mapa of porMarcador.values()) {
    if (mapa.size < 2) continue
    const pontos = [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data))
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
