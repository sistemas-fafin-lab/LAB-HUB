import { useEffect } from 'react'
import { WIcon } from '../primitives/WIcon'
import { formatDataHora } from '../../lib/datetime'

interface ConfirmBookingModalProps {
  /** Nome da unidade escolhida. */
  postoNome: string
  /** Horário ISO 8601 prestes a ser agendado. */
  dataHora: string
  /** Enquanto true, exibe estado de carregamento e bloqueia o fechamento. */
  submitting: boolean
  /** Confirma o agendamento (posto + data/hora). */
  onConfirm: () => void
  onCancel: () => void
  dark: boolean
}

// Diálogo de confirmação exibido antes de efetivar o agendamento: revê a
// unidade/horário. Os exames NÃO são escolhidos aqui — o paciente leva o pedido
// médico e a recepção seleciona os exames no check-in (FlowLab).
export function ConfirmBookingModal({
  postoNome,
  dataHora,
  submitting,
  onConfirm,
  onCancel,
  dark,
}: ConfirmBookingModalProps) {
  // Fecha com Esc e trava o scroll do body enquanto o modal está aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [submitting, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => !submitting && onCancel()}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        }`}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <WIcon name="calendar-plus" className="w-5 h-5" strokeWidth={2.2} />
            </div>
            <div className="flex-1">
              <div className={`text-base font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>
                Confirmar agendamento
              </div>
              <p className={`mt-1 text-sm leading-snug ${dark ? 'text-gray-400' : 'text-slate-600'}`}>
                Coleta na <strong>{postoNome}</strong> para{' '}
                <strong className="capitalize">{formatDataHora(dataHora)}</strong>.
              </p>
            </div>
          </div>

          {/* Os exames são conferidos no check-in a partir do pedido médico. */}
          <div
            className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3 ${
              dark ? 'border-gray-800 bg-gray-800/40' : 'border-gray-100 bg-slate-50'
            }`}
          >
            <WIcon
              name="clipboard-list"
              className="w-4 h-4 mt-0.5 shrink-0 text-blue-600"
              strokeWidth={2.2}
            />
            <p className={`text-sm leading-snug ${dark ? 'text-gray-300' : 'text-slate-600'}`}>
              Leve o <strong>pedido médico</strong> no dia da coleta — a recepção confere os
              exames no check-in.
            </p>
          </div>
        </div>

        <div
          className={`px-5 py-3 flex items-center gap-2 border-t ${
            dark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-slate-50'
          }`}
        >
          <button
            onClick={onCancel}
            disabled={submitting}
            className={`ml-auto px-4 h-9 rounded-xl text-sm font-semibold border transition disabled:opacity-50 ${
              dark
                ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                : 'border-gray-200 text-slate-700 hover:bg-white'
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm()}
            disabled={submitting}
            className="px-4 h-9 rounded-xl text-sm font-semibold bg-blue-600 text-white inline-flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition disabled:opacity-60"
          >
            {submitting ? (
              'Agendando…'
            ) : (
              <>
                <WIcon name="check" className="w-4 h-4" strokeWidth={2.4} />
                Confirmar coleta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
