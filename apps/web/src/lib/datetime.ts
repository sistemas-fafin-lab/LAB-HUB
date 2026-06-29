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

/** Ex.: "terça, 30 de junho às 07:00" — usado na lista de agendamentos. */
export function formatDataHora(iso: string): string {
  const d = new Date(iso)
  return `${formatDia(d)} às ${timeFmt.format(d)}`
}
