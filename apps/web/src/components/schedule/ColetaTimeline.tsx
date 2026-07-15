import type { Agendamento, AgendamentoStatus } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { DocumentUploader } from '../documents/DocumentUploader'
import { DocumentList } from '../documents/DocumentList'
import { useDocumentos } from '../../lib/useDocumentos'
import { TIPOS_DA_COLETA } from '../../lib/documentos'
import { JEJUM_LABEL, preparoAplicavel } from '../../lib/preparo'
import {
  formatDataHoraDetalhe,
  formatDiaRelativo,
  formatEtapaHora,
} from '../../lib/datetime'

interface ColetaTimelineProps {
  agendamento: Agendamento
  dark: boolean
  onBack: () => void
}

// Etapas fixas do ciclo de vida de uma coleta (base da linha do tempo).
interface Etapa {
  label: string
  desc: string
  icon: string
}

const ETAPAS: Etapa[] = [
  { label: 'Agendada', desc: 'Seu horário está reservado.', icon: 'calendar-check' },
  { label: 'Check-in no posto', desc: 'Recepção conferiu seu pedido e guia.', icon: 'clipboard-check' },
  { label: 'Coleta realizada', desc: 'Amostra coletada com sucesso.', icon: 'syringe' },
  { label: 'Em análise', desc: 'Amostra no laboratório sendo processada.', icon: 'flask-conical' },
  { label: 'Resultado liberado', desc: 'Laudo e declaração disponíveis.', icon: 'file-text' },
]

// Mapeia cada status para a etapa "atual" da linha do tempo (etapas anteriores
// contam como concluídas). 'confirmado' = reservada, aguardando o dia (etapa 0);
// 'em_coleta' = recepção já conferiu e liberou — o check-in (etapa 1) está
// concluído (verde) e a etapa atual é a "Coleta" (etapa 2); 'realizado' = coleta
// feita, então "Coleta realizada" (etapa 2) fica concluída e a atual é "Em
// análise" (etapa 3). 'cancelado' e 'bloqueado' (pendência na recepção, etapa 1)
// são tratados à parte (banner + destaque).
const STATUS_ETAPA: Record<AgendamentoStatus, number> = {
  pendente: 0,
  confirmado: 0,
  em_coleta: 2,
  realizado: 3,
  bloqueado: 1,
  cancelado: 0,
}

type EtapaEstado = 'done' | 'current' | 'future'

// Rótulo/descrição de uma etapa. A "Coleta" (índice 2) é a única sensível ao
// estado: enquanto é a etapa atual (status 'em_coleta') a amostra ainda está
// sendo coletada no posto; quando concluída (verde), passa a "Coleta realizada".
function textoEtapa(
  i: number,
  estado: EtapaEstado,
  etapa: Etapa,
): { label: string; desc: string } {
  if (i === 2 && estado === 'current') {
    return { label: 'Coleta', desc: 'Amostra sendo coletada no posto.' }
  }
  return { label: etapa.label, desc: etapa.desc }
}

export function ColetaTimeline({ agendamento, dark, onBack }: ColetaTimelineProps) {
  const { id, postoNome, dataHora, status, criadoEm, exames } = agendamento
  const isCancelado = status === 'cancelado'
  const isBloqueado = status === 'bloqueado'
  const currentIndex = STATUS_ETAPA[status]

  // Documentos desta coleta (pedido médico). Identidade e carteirinha são perenes
  // e ficam na página Documentos — sobem uma vez e valem para toda coleta.
  const {
    documentos,
    loading: docsLoading,
    error: docsError,
    enviar,
    remover,
    enviando,
  } = useDocumentos(id)

  // Depois da coleta feita não há mais check-in a adiantar: a seção vira
  // histórico (some o envio, ficam os arquivos já anexados).
  const podeEnviarDocs = !isCancelado && status !== 'realizado'

  const titulo = 'Coleta agendada'

  const estadoDe = (i: number): EtapaEstado =>
    i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'future'

  // Etapa atual exibida no cabeçalho.
  const etapaAtual = ETAPAS[currentIndex]
  const etapaAtualLabel = isCancelado
    ? 'Cancelado'
    : isBloqueado
      ? 'Pendência'
      : etapaAtual
        ? textoEtapa(currentIndex, 'current', etapaAtual).label
        : 'Agendada'

  // Previsão de liberação: sem esse dado no backend, estimamos o dia seguinte à
  // coleta. Não faz sentido enquanto cancelado ou bloqueado.
  const previsao = (() => {
    if (isCancelado || isBloqueado) return '—'
    const d = new Date(dataHora)
    d.setDate(d.getDate() + 1)
    return `${formatDiaRelativo(d.toISOString())} até 14h`
  })()

  // Carimbo de horário por etapa. Só temos duas marcas reais: quando foi criado
  // (Agendada) e o horário agendado (Check-in/Coleta). As demais ficam sem hora.
  const carimbo = (i: number, estado: EtapaEstado): string | null => {
    if (estado === 'future') return null
    if (i === 0) return formatEtapaHora(criadoEm)
    if (i === 1 || i === 2) return formatEtapaHora(dataHora)
    return null
  }

  const cardBase = dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 text-sm font-medium mb-4 ${
          dark ? 'text-gray-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />
        Voltar
      </button>

      {/* Cabeçalho */}
      <div className={`rounded-2xl border ${cardBase} p-6 shadow-sm mb-5`}>
        <h1
          className={`text-xl font-bold leading-snug ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          {titulo}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {postoNome} · {formatDataHoraDetalhe(dataHora)}
        </p>

        <div className={`mt-5 pt-5 border-t ${dark ? 'border-gray-800' : 'border-gray-100'} grid grid-cols-2 sm:grid-cols-4 gap-4`}>
          {/* Mesma fonte do popover do card (lib/preparo) — antes eram duas
              strings hardcoded que já divergiam ("8h" vs "8 horas"). O '—' segue
              o precedente do `previsao`: não se aplica a coleta encerrada. */}
          <InfoTile
            icon="hourglass"
            label="Jejum"
            value={preparoAplicavel(agendamento) ? JEJUM_LABEL : '—'}
            dark={dark}
          />
          <InfoTile
            icon="clipboard-list"
            label="Pedido médico"
            value="Leve no dia"
            dark={dark}
          />
          <InfoTile
            icon="activity"
            label="Etapa atual"
            value={etapaAtualLabel}
            dark={dark}
            danger={isCancelado || isBloqueado}
          />
          <InfoTile icon="clock" label="Previsão" value={previsao} dark={dark} />
        </div>
      </div>

      {/* Exames coletados — snapshot vindo do FlowLab (só a partir de 'realizado') */}
      {exames && exames.length > 0 && (
        <div className={`rounded-2xl border ${cardBase} p-6 shadow-sm mb-5`}>
          <h2 className={`text-sm font-bold mb-4 ${dark ? 'text-white' : 'text-slate-800'}`}>
            Exames coletados
          </h2>
          <ul className="space-y-2.5">
            {exames.map((ex, i) => (
              <li key={`${ex.nome}-${i}`} className="flex items-center gap-3">
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    ex.isCultura
                      ? 'bg-purple-50 text-purple-600'
                      : dark
                        ? 'bg-gray-800 text-gray-300'
                        : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  <WIcon
                    name={ex.isCultura ? 'flask-conical' : 'test-tube'}
                    className="w-4 h-4"
                    strokeWidth={2.2}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${dark ? 'text-white' : 'text-slate-800'}`}>
                      {ex.nome}
                    </span>
                    {ex.isCultura && (
                      <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5">
                        Cultura
                      </span>
                    )}
                  </div>
                  {ex.material && <p className="text-xs text-gray-500 mt-0.5">{ex.material}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documentos desta coleta — adiantam a conferência da recepção. Some numa
          coleta cancelada que nunca teve anexo. */}
      {(podeEnviarDocs || documentos.length > 0) && (
        <div className={`rounded-2xl border ${cardBase} p-6 shadow-sm mb-5`}>
          <h2 className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>
            Documentos desta coleta
          </h2>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Envie o pedido médico para a recepção conferir antes de você chegar. Identidade e
            carteirinha ficam em <strong>Documentos</strong> e valem para todas as coletas.
          </p>

          {docsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm mb-4">
              {docsError}
            </div>
          )}

          {podeEnviarDocs && (
            <div className="mb-4">
              <DocumentUploader
                tipos={TIPOS_DA_COLETA}
                onEnviar={enviar}
                enviando={enviando}
                dark={dark}
              />
            </div>
          )}

          <DocumentList
            documentos={documentos}
            loading={docsLoading}
            dark={dark}
            colunas={2}
            {...(podeEnviarDocs ? { onRemover: (docId: string) => void remover(docId) } : {})}
            vazio="Nenhum documento anexado a esta coleta."
          />
        </div>
      )}

      {/* Linha do tempo */}
      <div className={`rounded-2xl border ${cardBase} p-6 shadow-sm`}>
        <h2 className={`text-sm font-bold mb-5 ${dark ? 'text-white' : 'text-slate-800'}`}>
          Linha do tempo
        </h2>

        {isCancelado && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
              dark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <WIcon name="x-circle" className="w-4 h-4 shrink-0" strokeWidth={2.2} />
            Esta coleta foi cancelada.
          </div>
        )}

        {isBloqueado && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
              dark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            <WIcon name="alert-triangle" className="w-4 h-4 shrink-0" strokeWidth={2.2} />
            Há uma pendência na recepção — verifique seus documentos (identidade, guia e pedido médico).
          </div>
        )}

        <div>
          {ETAPAS.map((etapa, i) => {
            const estado = estadoDe(i)
            const isLast = i === ETAPAS.length - 1
            const ts = carimbo(i, estado)
            const { label, desc } = textoEtapa(i, estado, etapa)
            return (
              <div key={etapa.label} className={`flex gap-4 ${isLast ? '' : 'pb-6'}`}>
                {/* Trilho: nó + linha conectora */}
                <div className="flex flex-col items-center">
                  <TimelineNode etapa={etapa} estado={estado} dark={dark} />
                  {!isLast && (
                    <div
                      className={`w-0.5 flex-1 mt-1.5 rounded-full ${
                        estado === 'done'
                          ? 'bg-emerald-400'
                          : dark
                            ? 'bg-gray-800'
                            : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0 flex items-start justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-semibold ${
                          estado === 'future'
                            ? 'text-gray-400'
                            : estado === 'current'
                              ? 'text-blue-600'
                              : dark
                                ? 'text-white'
                                : 'text-slate-800'
                        }`}
                      >
                        {label}
                      </span>
                      {estado === 'current' && !isCancelado && !isBloqueado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5">
                          <WIcon name="map-pin" className="w-3 h-3" strokeWidth={2.6} />
                          Você está aqui
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        estado === 'future' ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      {desc}
                    </p>
                  </div>
                  {ts && <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{ts}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Um dos quatro indicadores do cabeçalho (Jejum, Exames, Etapa atual, Previsão).
function InfoTile({
  icon,
  label,
  value,
  dark,
  danger,
}: {
  icon: string
  label: string
  value: string
  dark: boolean
  danger?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
        <WIcon name={icon} className="w-3.5 h-3.5" strokeWidth={2.2} />
        {label}
      </div>
      <div
        className={`text-sm font-semibold ${
          danger ? 'text-red-500' : dark ? 'text-white' : 'text-slate-800'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

// Nó circular da linha do tempo: verde (concluído), azul (atual) ou cinza (futuro).
function TimelineNode({
  etapa,
  estado,
  dark,
}: {
  etapa: Etapa
  estado: EtapaEstado
  dark: boolean
}) {
  if (estado === 'done') {
    return (
      <div className="h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
        <WIcon name="check" className="w-4 h-4" strokeWidth={3} />
      </div>
    )
  }
  if (estado === 'current') {
    return (
      <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/30 ring-4 ring-blue-500/15">
        <WIcon name={etapa.icon} className="w-4 h-4" strokeWidth={2.4} />
      </div>
    )
  }
  return (
    <div
      className={`h-9 w-9 rounded-full border-2 flex items-center justify-center shrink-0 ${
        dark ? 'border-gray-700 text-gray-600' : 'border-gray-200 text-gray-300'
      }`}
    >
      <WIcon name={etapa.icon} className="w-4 h-4" strokeWidth={2.2} />
    </div>
  )
}
