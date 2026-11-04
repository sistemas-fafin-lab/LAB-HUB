// Formatters de data/hora pt-BR reutilizados nas telas de Coletas. Todos
// seguem o fuso escolhido nas Configurações (lib/regiao), não o do aparelho.
import { diaNoFuso, formatador } from './regiao'

/** Ex.: "07:00" */
export const timeFmt = { format: (d: Date) => formatador({ hour: '2-digit', minute: '2-digit' }).format(d) }

// Formatter base por extenso: "terça-feira, 30 de junho".
const diaFmt = () => formatador({ weekday: 'long', day: '2-digit', month: 'long' })

/** Ex.: "terça, 30 de junho" — remove o sufixo "-feira" dos dias úteis. */
export function formatDia(date: Date): string {
  return diaFmt().format(date).replace('-feira', '')
}

const diaSemanaCurtoFmt = () => formatador({ weekday: 'short' })

/** Ex.: "TER" — dia da semana abreviado, em maiúsculas (p/ pílulas de dia). */
export function formatDiaSemanaCurto(date: Date): string {
  return diaSemanaCurtoFmt().format(date).replace('.', '').toUpperCase()
}

/** Ex.: "30" — número do dia com dois dígitos. */
export const dayNumFmt = { format: (d: Date) => formatador({ day: '2-digit' }).format(d) }

const mesCurtoFmt = () => formatador({ month: 'short' })

/** Ex.: "jun" — mês abreviado, sem ponto. */
export function formatMesCurto(date: Date): string {
  return mesCurtoFmt().format(date).replace('.', '')
}

/** Ex.: "terça, 30 de junho às 07:00" — usado na lista de agendamentos. */
export function formatDataHora(iso: string): string {
  const d = new Date(iso)
  return `${formatDia(d)} às ${timeFmt.format(d)}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "Hoje"/"Ontem"/"Amanhã" quando a data cai perto de hoje; senão null.
export function relDia(d: Date, agora = new Date()): string | null {
  const delta = diaNoFuso(d) - diaNoFuso(agora)
  return delta === 0 ? 'Hoje' : delta === -1 ? 'Ontem' : delta === 1 ? 'Amanhã' : null
}

/** Ex.: "Hoje, 06 Mai às 07:30" ou "Qua, 08 Jul às 15:30" — cabeçalho do detalhe. */
export function formatDataHoraDetalhe(iso: string): string {
  const d = new Date(iso)
  const prefixo = relDia(d) ?? cap(formatDiaSemanaCurto(d).toLowerCase())
  return `${prefixo}, ${dayNumFmt.format(d)} ${cap(formatMesCurto(d))} às ${timeFmt.format(d)}`
}

/** Ex.: "Hoje · 07:26" ou "02 Mai · 14:12" — carimbo de etapa na linha do tempo. */
export function formatEtapaHora(iso: string): string {
  const d = new Date(iso)
  const prefixo = relDia(d) ?? `${dayNumFmt.format(d)} ${cap(formatMesCurto(d))}`
  return `${prefixo} · ${timeFmt.format(d)}`
}

/** Ex.: "Amanhã" ou "06 Mai" — dia relativo quando cabe, senão dia + mês curto. */
export function formatDiaRelativo(iso: string): string {
  const d = new Date(iso)
  return relDia(d) ?? `${dayNumFmt.format(d)} ${cap(formatMesCurto(d))}`
}

/** Ex.: "hoje" | "amanhã" | "06 Mai" — como formatDiaRelativo, mas em caixa de
 *  frase: para uso no MEIO de um texto ("até 20:00 de hoje"), onde o "Hoje"
 *  maiúsculo soaria como título. Datas absolutas mantêm o "06 Mai". */
export function formatDiaRelativoEmFrase(iso: string): string {
  const rel = relDia(new Date(iso))
  return rel ? rel.toLowerCase() : formatDiaRelativo(iso)
}
