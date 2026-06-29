import { useState } from 'react'
import type { Agendamento } from '@lab-hub/shared'
import { WTabs } from '../components/primitives/WTabs'
import { BookingPanel } from '../components/schedule/BookingPanel'
import { ColetasList } from '../components/schedule/ColetasList'
import { useAgendamentos } from '../lib/useAgendamentos'
import { api } from '../lib/api'

interface SchedulePageProps {
  dark: boolean
}

type ColetaTab = 'agendar' | 'minhas'

export function SchedulePage({ dark }: SchedulePageProps) {
  const [tab, setTab] = useState<ColetaTab>('agendar')
  const [resyncingId, setResyncingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const { agendamentos, loading, error, reload, setStatus } = useAgendamentos()

  // Reenvia ao FlowLab um agendamento que ficou 'pendente' (POST .../sync).
  const handleResync = async (id: string) => {
    setResyncingId(id)
    try {
      await api.post<Agendamento>(`/agendamentos/${id}/sync`, {})
    } finally {
      setResyncingId(null)
      reload()
    }
  }

  // Marca o agendamento como 'cancelado' — mantém o histórico (POST .../cancelar).
  // Optimistic UI: o item permanece na lista e já exibe o status 'cancelado'; em
  // caso de falha, recarrega do servidor p/ voltar ao estado correto.
  const handleCancel = async (id: string) => {
    setCancellingId(id)
    setStatus(id, 'cancelado')
    try {
      await api.post<Agendamento>(`/agendamentos/${id}/cancelar`, {})
    } catch {
      reload()
    } finally {
      setCancellingId(null)
    }
  }

  // Badge da aba: só coletas em andamento (pendente/confirmado); ignora
  // canceladas e realizadas.
  const emAndamento = agendamentos.filter(
    (a) => a.status === 'pendente' || a.status === 'confirmado',
  ).length

  const tabs = [
    { id: 'agendar' as const, label: 'Agendar' },
    { id: 'minhas' as const, label: 'Minhas coletas', count: emAndamento },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <h1
        className={`text-2xl font-bold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}
        style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
      >
        Coletas
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Agende uma nova coleta ou acompanhe os seus agendamentos.
      </p>

      <div className="mb-6">
        <WTabs items={tabs} value={tab} onChange={setTab} dark={dark} />
      </div>

      {tab === 'agendar' ? (
        <BookingPanel
          dark={dark}
          onBooked={() => {
            reload()
            setTab('minhas')
          }}
        />
      ) : (
        <ColetasList
          agendamentos={agendamentos}
          loading={loading}
          error={error}
          dark={dark}
          resyncingId={resyncingId}
          onResync={(id) => void handleResync(id)}
          cancellingId={cancellingId}
          onCancel={(id) => void handleCancel(id)}
          onAgendar={() => setTab('agendar')}
        />
      )}
    </div>
  )
}
