// Formatters de data/hora pt-BR reutilizados nas telas de Coletas.

/** Ex.: "07:00" */
export const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

// Formatter base por extenso: "terça-feira, 30 de junho".
const diaFmt = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})

/** Ex.: "terça, 30 de junho" — remove o sufixo "-feira" dos dias úteis. */
export function formatDia(date: Date): string {
  return diaFmt.format(date).replace('-feira', '')
}

const diaSemanaCurtoFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })

/** Ex.: "TER" — dia da semana abreviado, em maiúsculas (p/ pílulas de dia). */
export function formatDiaSemanaCurto(date: Date): string {
  return diaSemanaCurtoFmt.format(date).replace('.', '').toUpperCase()
}

/** Ex.: "30" — número do dia com dois dígitos. */
export const dayNumFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' })

const mesCurtoFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

/** Ex.: "jun" — mês abreviado, sem ponto. */
export function formatMesCurto(date: Date): string {
  return mesCurtoFmt.format(date).replace('.', '')
}

/** Ex.: "terça, 30 de junho às 07:00" — usado na lista de agendamentos. */
export function formatDataHora(iso: string): string {
  const d = new Date(iso)
  return `${formatDia(d)} às ${timeFmt.format(d)}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "Hoje"/"Ontem"/"Amanhã" quando a data cai perto de hoje; senão null.
function relDia(d: Date): string | null {
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const delta = Math.round((dia(d) - dia(new Date())) / 86_400_000)
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
