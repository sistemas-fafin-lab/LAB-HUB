import type { Agendamento } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { ColetaCard } from './ColetaCard'

interface ColetasListProps {
  agendamentos: Agendamento[]
  loading: boolean
  error: string | null
  dark: boolean
  /** ID em reenvio (controla o estado de loading do botão "Reenviar"). */
  resyncingId: string | null
  onResync: (id: string) => void
  /** ID em cancelamento (controla o estado de loading do botão "Cancelar"). */
  cancellingId: string | null
  onCancel: (id: string) => void
  /** Acionado pelo CTA do estado vazio p/ ir à aba "Agendar". */
  onAgendar: () => void
}

// Aba "Minhas coletas": lista os agendamentos do paciente.
export function ColetasList({
  agendamentos,
  loading,
  error,
  dark,
  resyncingId,
  onResync,
  cancellingId,
  onCancel,
  onAgendar,
}: ColetasListProps) {
  if (loading) {
    return <div className="text-center text-sm text-gray-400 py-10">Carregando suas coletas…</div>
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 text-sm">
        {error}
      </div>
    )
  }

  if (agendamentos.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed ${
          dark ? 'border-gray-800' : 'border-gray-200'
        } p-10 text-center`}
      >
        <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <WIcon name="calendar" className="w-6 h-6" strokeWidth={2} />
        </div>
        <div className={`text-sm font-semibold ${dark ? 'text-gray-200' : 'text-slate-700'}`}>
          Você ainda não tem coletas agendadas
        </div>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          Escolha uma unidade e um horário para agendar a sua primeira coleta.
        </p>
        <button
          onClick={onAgendar}
          className="bg-blue-600 text-white text-xs font-semibold h-9 px-4 rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25"
        >
          <WIcon name="calendar-plus" className="w-4 h-4" strokeWidth={2.2} />
          Agendar coleta
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {agendamentos.map((ag) => (
        <ColetaCard
          key={ag.id}
          agendamento={ag}
          dark={dark}
          onResync={onResync}
          resyncing={resyncingId === ag.id}
          onCancel={onCancel}
          cancelling={cancellingId === ag.id}
        />
      ))}
    </div>
  )
}
