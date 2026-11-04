import type { Agendamento } from '@lab-hub/shared'
import { BackLink, ETAPAS, Ico, IconTile, InfoGrid, Node, Panel, PanelHead, Pill, Timeline } from '../portal'
import { DocumentUploader } from '../documents/DocumentUploader'
import { DocumentList } from '../documents/DocumentList'
import { situacaoDaColeta } from '../../lib/coletas'
import { TIPOS_DA_COLETA } from '../../lib/documentos'
import { formatDataHoraDetalhe, formatDiaRelativo, formatEtapaHora } from '../../lib/datetime'
import { JEJUM_LABEL, preparoAplicavel } from '../../lib/preparo'
import { useDocumentos } from '../../lib/useDocumentos'
import { BotoesDaColeta } from './LinhaColeta'
import type { AcoesColeta } from './LinhaColeta'
import { ConteudoPreparo } from './PreparoColeta'

interface ColetaTimelineProps extends AcoesColeta {
  agendamento: Agendamento
  dark: boolean
  onBack: () => void
}

const TITULO: Record<Agendamento['status'], string> = {
  pendente: 'Coleta agendada',
  confirmado: 'Coleta agendada',
  em_coleta: 'Coleta em andamento',
  realizado: 'Coleta realizada',
  bloqueado: 'Coleta com pendência',
  cancelado: 'Coleta cancelada',
}

// O texto padrão da etapa Coleta é "Amostra coletada.", o que ainda não é
// verdade enquanto ela é a etapa atual.
const DESCRICOES_EM_COLETA = { coleta: 'Amostra sendo coletada no posto.' }

/** Previsão de liberação: sem esse dado no backend, estima-se o dia seguinte à coleta. */
function previsaoDeLiberacao(dataHora: string): string {
  const d = new Date(dataHora)
  d.setDate(d.getDate() + 1)
  return `${formatDiaRelativo(d.toISOString())} até 14h`
}

// Detalhe da coleta em /coleta/:id. O agendamento vem de useAgendamentos, então
// sobrevive a recarregar a página.
export function ColetaTimeline({ agendamento, dark, onBack, ...acoes }: ColetaTimelineProps) {
  const { id, postoNome, dataHora, status, criadoEm, exames } = agendamento
  const { rotulo, tom, passo, alerta } = situacaoDaColeta(status)
  const cancelada = status === 'cancelado'
  const bloqueada = status === 'bloqueado'
  const comPreparo = preparoAplicavel(agendamento)

  // Documentos desta coleta (pedido médico). Identidade e carteirinha são perenes
  // e ficam na página Documentos: sobem uma vez e valem para toda coleta.
  const { documentos, loading: docsLoading, error: docsError, enviar, remover, enviando } = useDocumentos(id)

  // Depois da coleta feita não há mais check-in a adiantar: a seção vira
  // histórico (some o envio, ficam os arquivos já anexados).
  const podeEnviarDocs = !cancelada && status !== 'realizado'

  const etapaAtual = cancelada || bloqueada ? rotulo : (ETAPAS[passo - 1]?.nome ?? rotulo)

  return (
    <div className="lh-alvos max-w-6xl mx-auto">
      <BackLink label="Minhas coletas" onClick={onBack} />

      <Panel pad={24} style={{ marginBottom: 20 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="mb-3">
              <Pill tone={tom}>{rotulo}</Pill>
            </div>
            <h1 className="font-display font-medium text-[26px] md:text-[30px] leading-[1.1] tracking-[-0.02em]">{TITULO[status]}</h1>
            <p className="text-[14px] text-muted mt-2 tabular-nums">
              {postoNome} · {formatDataHoraDetalhe(dataHora)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <BotoesDaColeta agendamento={agendamento} rotuloCancelar="Cancelar coleta" {...acoes} />
          </div>
        </div>
        <div className="mt-5 pt-5 border-t border-line">
          <InfoGrid
            items={[
              // O '—' não se aplica a coleta encerrada (mesma regra do preparo).
              { label: 'Jejum', value: comPreparo ? JEJUM_LABEL : '—' },
              { label: 'Pedido médico', value: 'Leve no dia' },
              { label: 'Etapa atual', value: etapaAtual },
              { label: 'Previsão', value: cancelada || bloqueada ? '—' : previsaoDeLiberacao(dataHora) },
            ]}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <Panel pad={24}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <h2 className="text-[15px] font-semibold">Linha do tempo</h2>
              <Node step={passo} alert={alerta} ring size={56} />
            </div>
            {cancelada && (
              <div role="status" className="mb-5 rounded-[12px] bg-subtle p-3 text-[14px]">
                <div className="font-semibold">Esta coleta foi cancelada.</div>
                <div className="text-[12px] text-muted mt-0.5 tabular-nums">Agendada em {formatEtapaHora(criadoEm)}</div>
              </div>
            )}
            <Timeline
              passo={passo}
              alerta={alerta}
              quando={{
                agendada: formatEtapaHora(criadoEm),
                checkin: formatEtapaHora(dataHora),
                coleta: formatEtapaHora(dataHora),
              }}
              rotuloAlerta="Pendência na recepção"
              iconeAlerta="alert-triangle"
              motivoAlerta="Há uma pendência na recepção — verifique seus documentos (identidade, guia e pedido médico)"
              {...(status === 'em_coleta' ? { descricoes: DESCRICOES_EM_COLETA } : {})}
            />
          </Panel>

          {/* Adiantam a conferência da recepção. Some numa coleta cancelada que
              nunca teve anexo. As peças de documento migram na issue 10. */}
          {(podeEnviarDocs || documentos.length > 0) && (
            <Panel pad={24}>
              <PanelHead title="Documentos desta coleta" className="mb-1" />
              <p className="text-[13px] text-muted mb-4">
                Envie o pedido médico para a recepção conferir antes de você chegar. Identidade e carteirinha ficam em{' '}
                <strong className="font-semibold">Documentos</strong> e valem para todas as coletas.
              </p>
              {docsError && (
                <div role="alert" className="rounded-[12px] bg-coral-soft p-3 text-[14px] mb-4">
                  {docsError}
                </div>
              )}
              <div className="lh-legado font-sans subpixel-antialiased text-slate-900 dark:text-gray-100">
                {podeEnviarDocs && (
                  <div className="mb-4">
                    <DocumentUploader tipos={TIPOS_DA_COLETA} onEnviar={enviar} enviando={enviando} dark={dark} />
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
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          <Panel>
            <PanelHead title="Local" className="mb-2" />
            <div className="flex items-center gap-2.5 text-[14px] font-semibold">
              <Ico name="map-pin" size={16} className="text-muted" />
              {postoNome}
            </div>
          </Panel>

          {comPreparo && (
            <Panel>
              <PanelHead title="Preparo" />
              <ConteudoPreparo dataHora={dataHora} />
            </Panel>
          )}

          {/* Snapshot vindo do FlowLab, só a partir de 'realizado'. */}
          {exames && exames.length > 0 && (
            <Panel>
              <PanelHead title="Exames coletados" />
              <ul className="flex flex-col gap-3">
                {exames.map((ex, i) => (
                  <li key={`${ex.nome}-${i}`} className="flex items-center gap-3">
                    <IconTile name={ex.isCultura ? 'flask-conical' : 'test-tube'} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-medium">{ex.nome}</span>
                        {ex.isCultura && <Pill>Cultura</Pill>}
                      </div>
                      {ex.material && <p className="text-[12px] text-muted mt-0.5">{ex.material}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
