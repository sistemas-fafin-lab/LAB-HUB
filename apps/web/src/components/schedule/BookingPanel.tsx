import { useEffect, useMemo, useState } from 'react'
import type { Agendamento, PostoDisponivel } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { api } from '../../lib/api'
import { formatDataHora } from '../../lib/datetime'
import { UnitSelector } from './UnitSelector'
import { SlotPicker } from './SlotPicker'
import { BookingSkeleton } from './BookingSkeleton'

interface BookingPanelProps {
  dark: boolean
  /** Chamado após confirmar uma coleta, p/ que a lista possa recarregar. */
  onBooked?: () => void
}

// Aba "Agendar": escolhe a unidade, exibe a disponibilidade e confirma a coleta.
export function BookingPanel({ dark, onBooked }: BookingPanelProps) {
  const [postos, setPostos] = useState<PostoDisponivel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null) // slot ISO em envio
  const [confirmed, setConfirmed] = useState<{ posto: string; dataHora: string } | null>(null)

  useEffect(() => {
    let alive = true
    api
      .get<PostoDisponivel[]>('/postos/disponibilidade')
      .then((data) => {
        if (!alive) return
        setPostos(data)
        setSelectedId(data[0]?.id ?? null)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar disponibilidade')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const selected = useMemo(
    () => postos.find((p) => p.id === selectedId) ?? null,
    [postos, selectedId],
  )

  const handleConfirm = async (dataHora: string) => {
    if (!selected) return
    setSubmitting(dataHora)
    setError(null)
    try {
      await api.post<Agendamento>('/agendamentos', {
        postoFlowlabId: selected.id,
        dataHora,
      })
      setConfirmed({ posto: selected.nome, dataHora })
      // Remove o horário recém-agendado da lista local.
      setPostos((prev) =>
        prev.map((p) =>
          p.id === selected.id ? { ...p, slots: p.slots.filter((s) => s !== dataHora) } : p,
        ),
      )
      onBooked?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao agendar')
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return <BookingSkeleton dark={dark} />
  }

  return (
    <div className="flex flex-col gap-5">
      {confirmed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-4 flex items-center gap-3">
          <WIcon name="check-circle" className="w-5 h-5" strokeWidth={2.2} />
          <div className="text-sm">
            Coleta confirmada na <strong>{confirmed.posto}</strong> para{' '}
            <strong>{formatDataHora(confirmed.dataHora)}</strong>.
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 text-sm">
          {error}
        </div>
      )}

      {postos.length === 0 && !error && (
        <div className="text-center text-sm text-gray-400 py-10">
          Nenhuma unidade disponível no momento.
        </div>
      )}

      {postos.length > 0 && (
        <>
          <UnitSelector
            postos={postos}
            selectedId={selectedId}
            onSelect={setSelectedId}
            dark={dark}
          />
          {selected && (
            <SlotPicker
              slots={selected.slots}
              submitting={submitting}
              onPick={(iso) => void handleConfirm(iso)}
              dark={dark}
            />
          )}
        </>
      )}
    </div>
  )
}
