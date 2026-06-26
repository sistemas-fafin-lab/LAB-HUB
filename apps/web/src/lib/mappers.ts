import type { Resultado } from '@lab-hub/shared'
import type { Exam } from '../components/shared/WebHero'

// Mapeia o tipo de domínio Resultado (@lab-hub/shared) para o Exam usado pela UI.
// Campos sem origem no Resultado (unidade/médico/CRM) ficam como placeholder até
// virem do snapshot do agendamento/laudo.
const PLACEHOLDER = '—'

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const longDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

export function resultadoToExam(r: Resultado): Exam {
  const liberado = r.liberadoEm ? new Date(r.liberadoEm) : null

  return {
    id: r.id,
    name: r.exameNome,
    category: r.categoria ?? PLACEHOLDER,
    date: liberado ? shortDate.format(liberado) : PLACEHOLDER,
    fullDate: liberado ? longDate.format(liberado) : PLACEHOLDER,
    unit: PLACEHOLDER,
    doctor: PLACEHOLDER,
    crm: PLACEHOLDER,
    status: r.status,
    summary: r.resumo ?? '',
    panels: r.paineis.map((p) => ({
      name: p.nome,
      value: p.valor,
      unit: p.unidade,
      ref: p.ref,
      ok: p.ok,
      trend: p.trend ?? [],
    })),
    ...(r.declaracaoUrl ? { declaracaoUrl: r.declaracaoUrl } : {}),
  }
}
