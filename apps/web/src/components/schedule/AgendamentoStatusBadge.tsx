import type { AgendamentoStatus } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'

interface StatusConfig {
  label: string
  icon: string
  classes: string
}

const STATUS: Record<AgendamentoStatus, StatusConfig> = {
  pendente: {
    label: 'Pendente',
    icon: 'clock',
    classes: 'bg-amber-100 text-amber-800',
  },
  confirmado: {
    label: 'Confirmado',
    icon: 'check-circle',
    classes: 'bg-emerald-100 text-emerald-800',
  },
  em_coleta: {
    label: 'Check-in feito',
    icon: 'clipboard-check',
    classes: 'bg-indigo-100 text-indigo-800',
  },
  realizado: {
    label: 'Realizado',
    icon: 'badge-check',
    classes: 'bg-blue-100 text-blue-800',
  },
  bloqueado: {
    label: 'Pendência',
    icon: 'alert-triangle',
    classes: 'bg-red-100 text-red-700',
  },
  cancelado: {
    label: 'Cancelado',
    icon: 'x-circle',
    classes: 'bg-slate-200 text-slate-600',
  },
}

interface AgendamentoStatusBadgeProps {
  status: AgendamentoStatus
}

export function AgendamentoStatusBadge({ status }: AgendamentoStatusBadgeProps) {
  const { label, icon, classes } = STATUS[status]
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 ${classes}`}
    >
      <WIcon name={icon} className="w-3 h-3" strokeWidth={2.4} />
      {label}
    </span>
  )
}
