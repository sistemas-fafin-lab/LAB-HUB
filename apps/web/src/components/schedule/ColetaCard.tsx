import { useState } from 'react'
import type { Agendamento } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { formatDataHora } from '../../lib/datetime'
import { AgendamentoStatusBadge } from './AgendamentoStatusBadge'

interface ColetaCardProps {
  agendamento: Agendamento
  dark: boolean
  /** Reenvia ao FlowLab um agendamento que ficou 'pendente'. */
  onResync?: (id: string) => void
  resyncing?: boolean
  /** Marca o agendamento como 'cancelado' (mantém o histórico). */
  onCancel?: (id: string) => void
  cancelling?: boolean
}

// Cartão de uma coleta já agendada (aba "Minhas coletas").
export function ColetaCard({
  agendamento,
  dark,
  onResync,
  resyncing,
  onCancel,
  cancelling,
}: ColetaCardProps) {
  const { id, postoNome, dataHora, status } = agendamento
  const isPendente = status === 'pendente'
  const isCancelado = status === 'cancelado'
  // Cancelável enquanto não foi realizada nem já cancelada.
  const canCancel = onCancel && (status === 'pendente' || status === 'confirmado')
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      className={`rounded-2xl border ${
        dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
      } p-4 shadow-sm flex items-center gap-4 ${isCancelado ? 'opacity-60' : ''}`}
    >
      <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <WIcon name="calendar" className="w-5 h-5" strokeWidth={2.2} />
      </div>

      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <span className={`text-sm font-semibold truncate min-w-0 ${dark ? 'text-white' : 'text-slate-800'}`}>
          {postoNome}
        </span>
        <span className="text-gray-400 shrink-0">-</span>
        <span className="text-xs text-gray-500 shrink-0">{formatDataHora(dataHora)}</span>
      </div>

      {confirming ? (
        // Confirmação inline do cancelamento.
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500 hidden sm:inline">Cancelar coleta?</span>
          <button
            onClick={() => {
              onCancel?.(id)
              setConfirming(false)
            }}
            disabled={cancelling}
            className="text-xs font-semibold text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
          >
            {cancelling ? 'Cancelando…' : 'Sim, cancelar'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={cancelling}
            className="text-xs font-semibold text-gray-500 px-2 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition"
          >
            Voltar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 shrink-0">
          {isPendente && onResync && (
            <button
              onClick={() => onResync(id)}
              disabled={resyncing}
              className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1 disabled:opacity-50 hover:text-blue-700 transition"
            >
              <WIcon name="refresh-cw" className="w-3.5 h-3.5" strokeWidth={2.4} />
              {resyncing ? 'Reenviando…' : 'Reenviar'}
            </button>
          )}
          <AgendamentoStatusBadge status={status} />
          {canCancel && (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs font-semibold text-gray-400 inline-flex items-center gap-1 hover:text-red-600 transition"
            >
              <WIcon name="x" className="w-3.5 h-3.5" strokeWidth={2.4} />
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
