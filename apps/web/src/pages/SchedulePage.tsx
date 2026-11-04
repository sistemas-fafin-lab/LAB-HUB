import { useState } from 'react'
import type { Agendamento } from '@lab-hub/shared'
import { BackLink, Btn, EmptyState, FalhaAoCarregar, Modal, Node, PageHeader, Panel } from '../components/portal'
import { BookingPanel } from '../components/schedule/BookingPanel'
import { ColetasList } from '../components/schedule/ColetasList'
import { ColetaTimeline } from '../components/schedule/ColetaTimeline'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { avisar } from '../lib/avisos'
import { formatDataHora } from '../lib/datetime'
import type { AbaColetas } from '../lib/rotas'
import { useAgendamentos } from '../lib/useAgendamentos'

interface SchedulePageProps {
  // Aba e coleta aberta vêm da URL (/agendar, /coletas, /coleta/:id): recarregar
  // a página ou usar voltar/avançar mantém o paciente onde estava. A página só
  // pede a troca; quem muda a URL é o App.
  aba: AbaColetas
  selectedId: string | null
  onAba: (aba: AbaColetas) => void
  onAbrirColeta: (id: string) => void
  onFecharColeta: () => void
}

const mensagemDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao)

export function SchedulePage({ aba, selectedId, onAba, onAbrirColeta, onFecharColeta }: SchedulePageProps) {
  const [resyncingId, setResyncingId] = useState<string | null>(null)
  const [aCancelar, setACancelar] = useState<Agendamento | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // A coleta recém-agendada abre antes de a lista recarregar: sem ela, o paciente
  // veria "não encontrada" entre confirmar e a resposta do GET.
  const [recemCriada, setRecemCriada] = useState<Agendamento | null>(null)
  const { agendamentos, loading, error, reload, setStatus } = useAgendamentos()

  // Reenvia ao FlowLab um agendamento que ficou 'pendente' (POST .../sync).
  const handleResync = async (id: string) => {
    track('agendamento_resync')
    setResyncingId(id)
    try {
      await api.post<Agendamento>(`/agendamentos/${id}/sync`, {})
    } catch (e: unknown) {
      avisar({ tone: 'alert', title: 'Não foi possível reenviar', message: mensagemDe(e, 'Tente novamente em instantes.') })
    } finally {
      setResyncingId(null)
      reload()
    }
  }

  // Marca o agendamento como 'cancelado' e mantém o histórico (POST .../cancelar).
  // Otimista: a coleta já aparece cancelada; se falhar, recarrega do servidor
  // para voltar ao estado correto.
  const handleCancel = async ({ id, postoNome }: Agendamento) => {
    setACancelar(null)
    track('agendamento_cancelado')
    setStatus(id, 'cancelado')
    try {
      await api.post<Agendamento>(`/agendamentos/${id}/cancelar`, {})
      avisar({ title: 'Coleta cancelada', message: postoNome })
    } catch (e: unknown) {
      avisar({ tone: 'alert', title: 'Não foi possível cancelar', message: mensagemDe(e, 'Tente novamente em instantes.') })
      reload()
    }
  }

  const acoes = {
    onResync: (id: string) => void handleResync(id),
    resyncingId,
    onCancel: setACancelar,
  }

  const confirmaCancelamento = aCancelar && (
    <Modal
      open
      title="Cancelar coleta?"
      description={`${aCancelar.postoNome}, ${formatDataHora(aCancelar.dataHora)}.`}
      onClose={() => setACancelar(null)}
      footer={
        <>
          <Btn variant="secondary" onClick={() => setACancelar(null)}>
            Manter coleta
          </Btn>
          <Btn onClick={() => void handleCancel(aCancelar)}>Cancelar coleta</Btn>
        </>
      }
    />
  )

  const recarregar = (
    <Btn
      variant="secondary"
      icon="refresh-cw"
      onClick={() => {
        setRefreshKey((k) => k + 1)
        reload()
      }}
    >
      Recarregar
    </Btn>
  )

  // Detalhe em /coleta/:id. Fica montado durante um recarregamento (o agendamento
  // já está na lista), para não perder o envio de documentos em curso.
  if (selectedId !== null) {
    const selected = agendamentos.find((a) => a.id === selectedId) ?? (recemCriada?.id === selectedId ? recemCriada : undefined)
    if (selected) {
      return (
        <>
          <ColetaTimeline key={selected.id} agendamento={selected} onBack={onFecharColeta} {...acoes} />
          {confirmaCancelamento}
        </>
      )
    }
    return (
      <div className="lh-alvos max-w-6xl mx-auto">
        <BackLink label="Minhas coletas" onClick={onFecharColeta} />
        {loading ? (
          <div role="status" className="py-16 flex flex-col items-center gap-3 text-[14px] text-muted">
            <Node loading size={40} />
            Carregando coleta…
          </div>
        ) : error ? (
          <Panel>
            <FalhaAoCarregar titulo="Não foi possível carregar a coleta" erro={error} onTentar={reload} />
          </Panel>
        ) : (
          <Panel>
            <EmptyState
              icon="calendar"
              title={<h1>Coleta não encontrada</h1>}
              text="Esta coleta não está mais disponível neste endereço. Abra-a de novo pela lista de coletas."
              action={
                <Btn variant="secondary" onClick={onFecharColeta}>
                  Voltar para minhas coletas
                </Btn>
              }
            />
          </Panel>
        )}
      </div>
    )
  }

  if (aba === 'agendar') {
    return (
      <div className="lh-alvos max-w-6xl mx-auto">
        <BackLink label="Minhas coletas" onClick={() => onAba('minhas')} />
        <PageHeader title="Agendar coleta" sub="Escolha a unidade, o dia e o horário." right={recarregar} className="mb-5" />
        <BookingPanel
          refreshKey={refreshKey}
          // Abre a coleta recém-criada: é onde o paciente anexa os documentos,
          // no momento de maior motivação ("adiante seu check-in").
          onBooked={(ag) => {
            setRecemCriada(ag)
            reload()
            onAbrirColeta(ag.id)
          }}
        />
      </div>
    )
  }

  return (
    <div className="lh-alvos max-w-6xl mx-auto">
      <PageHeader
        title="Minhas coletas"
        sub="Acompanhe cada etapa, do agendamento ao resultado."
        right={
          <>
            {recarregar}
            <Btn icon="calendar-plus" onClick={() => onAba('agendar')}>
              Agendar coleta
            </Btn>
          </>
        }
      />
      <ColetasList
        agendamentos={agendamentos}
        loading={loading}
        error={error}
        onRetry={reload}
        onAgendar={() => onAba('agendar')}
        onOpen={onAbrirColeta}
        {...acoes}
      />
      {confirmaCancelamento}
    </div>
  )
}
