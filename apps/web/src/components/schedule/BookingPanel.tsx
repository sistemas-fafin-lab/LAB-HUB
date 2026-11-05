import { useEffect, useMemo, useState } from 'react'
import type { Agendamento, PostoDisponivel } from '@lab-hub/shared'
import { EmptyState, FalhaAoCarregar, Panel, PanelHead, SkeletonRows } from '../portal'
import { api } from '../../lib/api'
import { track } from '../../lib/analytics'
import { avisar } from '../../lib/avisos'
import { formatDataHora } from '../../lib/datetime'
import { ConfirmBookingModal } from './ConfirmBookingModal'
import { ConteudoPreparo } from './PreparoColeta'
import { SlotPicker } from './SlotPicker'
import { UnitSelector } from './UnitSelector'

interface BookingPanelProps {
  /**
   * Chamado após confirmar uma coleta, para a lista recarregar. Recebe o
   * agendamento criado: é dele que sai o id para abrir a coleta e anexar
   * documentos a ela.
   */
  onBooked?: (agendamento: Agendamento) => void
  /** Força recarregamento da disponibilidade quando o valor muda. */
  refreshKey?: number
}

// Escolhe a unidade, mostra a disponibilidade e confirma a coleta. A validação
// do horário e a janela retroativa do FlowLab ficam na API.
export function BookingPanel({ onBooked, refreshKey }: BookingPanelProps) {
  const [postos, setPostos] = useState<PostoDisponivel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pending, setPending] = useState<string | null>(null) // horário aguardando confirmação

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get<PostoDisponivel[]>('/postos/disponibilidade')
      .then((data) => {
        if (!alive) return
        setPostos(data)
        setSelectedId((prev) => prev ?? data[0]?.id ?? null)
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
  }, [refreshKey, tentativa])

  const selected = useMemo(() => postos.find((p) => p.id === selectedId) ?? null, [postos, selectedId])

  const handleConfirm = async (dataHora: string) => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      // O POST /agendamentos só aceita posto + data/hora. Os exames não são
      // escolhidos aqui: o paciente leva o pedido médico e a recepção seleciona
      // os exames no check-in (FlowLab).
      const criado = await api.post<Agendamento>('/agendamentos', {
        postoFlowlabId: selected.id,
        dataHora,
      })
      // Nome da unidade é dado do laboratório, não do paciente.
      track('agendamento_confirmado', { posto: selected.nome })
      avisar({ title: 'Coleta confirmada', message: `${selected.nome}, ${formatDataHora(dataHora)}` })
      // Remove o horário recém-agendado da lista local.
      setPostos((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, slots: p.slots.filter((s) => s !== dataHora) } : p)),
      )
      onBooked?.(criado)
    } catch (e: unknown) {
      const motivo = e instanceof Error ? e.message : 'Falha ao agendar'
      setError(motivo)
      track('agendamento_erro', { motivo })
    } finally {
      setSubmitting(false)
      setPending(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <Panel pad={0}>
          <SkeletonRows n={2} />
        </Panel>
        <Panel pad={0}>
          <SkeletonRows n={2} />
        </Panel>
      </div>
    )
  }

  if (postos.length === 0) {
    return (
      <Panel>
        {error ? (
          <FalhaAoCarregar
            titulo="Não foi possível carregar os horários"
            erro={error}
            onTentar={() => setTentativa((t) => t + 1)}
          />
        ) : (
          <EmptyState icon="map-pin" title="Nenhuma unidade disponível no momento." />
        )}
      </Panel>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <div className="flex flex-col gap-5 min-w-0">
        {error && (
          <div role="alert" className="rounded-[16px] bg-coral-soft p-4 text-[14px]">
            {error}
          </div>
        )}
        <UnitSelector postos={postos} selectedId={selectedId} onSelect={setSelectedId} />
        {selected && <SlotPicker posto={selected.nome} slots={selected.slots} selecionado={pending} onPick={setPending} />}
      </div>
      <aside className="lg:sticky lg:top-24">
        <Panel>
          <PanelHead title="Preparo" />
          <ConteudoPreparo />
        </Panel>
      </aside>

      {pending && selected && (
        <ConfirmBookingModal
          postoNome={selected.nome}
          dataHora={pending}
          submitting={submitting}
          onConfirm={() => void handleConfirm(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
