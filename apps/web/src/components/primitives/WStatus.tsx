/** Domain-level exam status values */
export type ExamStatus = 'ready' | 'analyzing'

interface WStatusProps {
  status: ExamStatus
}

export function WStatus({ status }: WStatusProps) {
  if (status === 'ready') {
    return (
      <span className="bg-green-100 text-green-800 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
        Liberado
      </span>
    )
  }

  return (
    <span className="bg-yellow-100 text-yellow-800 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
      Em análise
    </span>
  )
}
