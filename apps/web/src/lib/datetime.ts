// Formatters de data/hora pt-BR reutilizados nas telas de Coletas.

/** Ex.: "ter., 30 de jun." */
export const dayFmt = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})

/** Ex.: "07:00" */
export const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

/** Ex.: "ter., 30 de jun. às 07:00" — usado na lista de agendamentos. */
export function formatDataHora(iso: string): string {
  const d = new Date(iso)
  return `${dayFmt.format(d)} às ${timeFmt.format(d)}`
}
