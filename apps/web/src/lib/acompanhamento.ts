import type { IconName } from '../ds'
import type { Exam } from './exame'
import { norm } from './texto'
import { ICONE_DA_DIRECAO } from './tendencias'
import type { Tendencia } from './tendencias'

// ---------------------------------------------------------------------------
// "Acompanhamento" da Visão geral: até 3 marcadores, sem repetir, nesta ordem:
//   1. tendências fora da referência;
//   2. marcadores fora da referência do último exame liberado que ainda não
//      têm série (uma coleta só);
//   3. as demais tendências, da maior para a menor variação.
// Tudo sai dos resultados reais (lib/tendencias e o último exame).
// ---------------------------------------------------------------------------

export interface ItemAcompanhamento {
  chave: string
  titulo: string
  sub: string
  icone: IconName
  foraDaReferencia: boolean
  /** Para onde a linha leva. */
  destino: { tipo: 'tendencias' } | { tipo: 'exame'; id: string }
}

const LIMITE = 3

/** Variação relativa entre as duas últimas coletas (0 quando não há como medir). */
function tamanhoDaVariacao(t: Tendencia): number {
  const [anterior, ultimo] = t.serie.slice(-2)
  if (anterior === undefined || ultimo === undefined) return 0
  return anterior === 0 ? Math.abs(ultimo) : Math.abs(ultimo - anterior) / Math.abs(anterior)
}

const daTendencia = (t: Tendencia): ItemAcompanhamento => ({
  chave: `tendencia:${norm(t.marcador)}`,
  titulo: t.marcador,
  sub: t.variacao,
  icone: ICONE_DA_DIRECAO[t.direcao],
  foraDaReferencia: t.foraDaReferencia,
  destino: { tipo: 'tendencias' },
})

export function itensDeAcompanhamento(tendencias: readonly Tendencia[], ultimoLiberado: Exam | undefined): ItemAcompanhamento[] {
  const vistos = new Set<string>()
  const itens: ItemAcompanhamento[] = []
  const adiciona = (marcador: string, item: ItemAcompanhamento) => {
    const chave = norm(marcador)
    if (itens.length >= LIMITE || vistos.has(chave)) return
    vistos.add(chave)
    itens.push(item)
  }

  for (const t of tendencias.filter((t) => t.foraDaReferencia)) adiciona(t.marcador, daTendencia(t))

  if (ultimoLiberado) {
    const comSerie = new Set(tendencias.map((t) => norm(t.marcador)))
    const marcadores = ultimoLiberado.groups?.length ? ultimoLiberado.groups.flatMap((g) => g.panels) : ultimoLiberado.panels
    for (const p of marcadores) {
      if (p.ok || comSerie.has(norm(p.name))) continue
      adiciona(p.name, {
        chave: `exame:${ultimoLiberado.id}:${norm(p.name)}`,
        titulo: p.name,
        sub: `Fora da referência · ${`${p.value} ${p.unit}`.trim()}`,
        icone: 'alert-circle',
        foraDaReferencia: true,
        destino: { tipo: 'exame', id: ultimoLiberado.id },
      })
    }
  }

  const demais = tendencias.filter((t) => !t.foraDaReferencia).sort((a, b) => tamanhoDaVariacao(b) - tamanhoDaVariacao(a))
  for (const t of demais) adiciona(t.marcador, daTendencia(t))

  return itens
}
