import { useEffect, useMemo, useState } from 'react'
import type { Agendamento, PostoDisponivel } from '@lab-hub/shared'
import { Btn, EmptyState, FalhaAoCarregar, Panel, PanelHead, SkeletonRows } from '../portal'
import { api } from '../../lib/api'
import { track } from '../../lib/analytics'
import { avisar } from '../../lib/avisos'
import { formatDataHora, formatDataHoraCurta } from '../../lib/datetime'
import { JEJUM_LABEL } from '../../lib/preparo'
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
  /** "Cancelar" do resumo: sai do agendamento sem marcar nada. */
  onCancelar?: () => void
}

const ETAPAS_AGENDAMENTO = ['Local', 'Data e horário', 'Confirmação'] as const

/** Onde o paciente está no fluxo. Só indica: o fluxo continua numa tela só. */
function EtapasDoAgendamento({ atual }: { atual: number }) {
  return (
    <ol aria-label="Etapas do agendamento" className="flex items-center gap-x-6 gap-y-2 mb-5 flex-wrap">
      {ETAPAS_AGENDAMENTO.map((rotulo, i) => {
        const estado = i < atual ? 'feita' : i === atual ? 'atual' : 'futura'
        return (
          <li key={rotulo} className="flex items-center gap-2" {...(estado === 'atual' ? { 'aria-current': 'step' as const } : {})}>
            <span
              className={
                'font-display font-medium text-[22px] leading-none tabular-nums ' +
                (estado === 'atual' ? 'text-brand' : estado === 'feita' ? 'text-ink' : 'text-faint')
              }
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={'text-[13px] font-medium ' + (estado === 'futura' ? 'text-muted' : '')}>{rotulo}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Escolhe a unidade, mostra a disponibilidade e confirma a coleta. A validação
// do horário e a janela retroativa do FlowLab ficam na API.
export function BookingPanel({ onBooked, refreshKey, onCancelar }: BookingPanelProps) {
  const [postos, setPostos] = useState<PostoDisponivel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [horario, setHorario] = useState<string | null>(null) // horário escolhido
  const [confirmando, setConfirmando] = useState(false) // caixa de confirmação aberta

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

  // O horário escolhido é de uma unidade: trocar de unidade o descarta.
  const escolherUnidade = (id: string) => {
    if (id !== selectedId) setHorario(null)
    setSelectedId(id)
  }

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
      setHorario(null)
      onBooked?.(criado)
    } catch (e: unknown) {
      const motivo = e instanceof Error ? e.message : 'Falha ao agendar'
      setError(motivo)
      track('agendamento_erro', { motivo })
    } finally {
      setSubmitting(false)
      setConfirmando(false)
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

  const etapaAtual = !selected ? 0 : !horario ? 1 : 2

  return (
    <>
      <EtapasDoAgendamento atual={etapaAtual} />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <UnitSelector postos={postos} selectedId={selectedId} onSelect={escolherUnidade} />
          {selected && <SlotPicker posto={selected.nome} slots={selected.slots} selecionado={horario} onPick={setHorario} />}
        </div>
        <aside className="lg:sticky lg:top-24 flex flex-col gap-5">
          <Panel>
            <div className="lh-ov mb-2">Resumo</div>
            <dl className="text-[13px]">
              {[
                ['Local', selected?.nome ?? '—'],
                ['Data', horario ? formatDataHoraCurta(horario) : '—'],
                ['Preparo', `Jejum de ${JEJUM_LABEL}`],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between gap-4 py-2 border-t border-line first:border-t-0">
                  <dt className="text-muted">{rotulo}</dt>
                  <dd className="font-medium text-right tabular-nums">{valor}</dd>
                </div>
              ))}
            </dl>
            {error && (
              <p role="alert" className="flex items-start gap-2 text-[13px] mt-3">
                <span className="lh-bl mt-1.5" style={{ background: 'var(--lh-coral)' }} />
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2 mt-4">
              <Btn fullWidth disabled={!horario} onClick={() => setConfirmando(true)}>
                Confirmar agendamento
              </Btn>
              {onCancelar && (
                <Btn variant="ghost" fullWidth onClick={onCancelar}>
                  Cancelar
                </Btn>
              )}
            </div>
          </Panel>
          <Panel>
            <PanelHead title="Preparo" />
            <ConteudoPreparo {...(horario ? { dataHora: horario } : {})} />
          </Panel>
        </aside>

        {confirmando && horario && selected && (
          <ConfirmBookingModal
            postoNome={selected.nome}
            dataHora={horario}
            submitting={submitting}
            onConfirm={() => void handleConfirm(horario)}
            onCancel={() => setConfirmando(false)}
          />
        )}
      </div>
    </>
  )
}
