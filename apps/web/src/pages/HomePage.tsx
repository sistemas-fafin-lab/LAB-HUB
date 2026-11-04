import { useId } from 'react'
import type { ReactNode } from 'react'
import type { Agendamento, AgendamentoStatus } from '@lab-hub/shared'
import type { IconName } from '../ds'
import { Btn, EmptyState, ETAPAS, IconTile, Node, PageHeader, Pill, Panel, PanelHead, SkeletonRows } from '../components/portal'
import type { Exam } from '../components/shared/WebHero'
import { DestaqueCarregando, DestaqueExame, DestaquePrimeiraColeta } from '../components/visao-geral/Destaque'
import { LinhaExame } from '../components/visao-geral/LinhaExame'
import { formatDataHora } from '../lib/datetime'
import {
  MOSTRAR_ACOMPANHAMENTO,
  MOSTRAR_EXAMES_RECENTES,
  MOSTRAR_PROXIMOS_PASSOS_EXTRAS,
  MOSTRAR_RESULTADO_HERO,
  rotaOculta,
} from '../lib/flags'
import { primeiroNome } from '../lib/paciente'
import { useAgendamentos } from '../lib/useAgendamentos'
import { atualizaResultados, useResultados } from '../lib/useResultados'

function saudacao(agora: Date): string {
  const hora = agora.getHours()
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}

const agendada = (a: Agendamento) => a.status === 'pendente' || a.status === 'confirmado'
const noFuturo = (a: Agendamento) => new Date(a.dataHora).getTime() > Date.now()

/** Coleta futura ainda de pé mais próxima de agora. */
function proximaColeta(agendamentos: readonly Agendamento[]): Agendamento | undefined {
  return agendamentos
    .filter((a) => agendada(a) && noFuturo(a))
    .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())[0]
}

// Situação de uma coleta ativa, no modelo do nó (`passo` = etapas alcançadas;
// `alerta` = índice da etapa em atenção). Mesmas etapas e rótulos da tela da
// coleta (ColetaTimeline, AgendamentoStatusBadge).
type StatusAtivo = 'pendente' | 'confirmado' | 'em_coleta' | 'bloqueado'

const SITUACAO: Record<StatusAtivo, { rotulo: string; passo: number; alerta: number }> = {
  pendente: { rotulo: 'Pendente', passo: 1, alerta: -1 },
  confirmado: { rotulo: 'Confirmado', passo: 1, alerta: -1 },
  em_coleta: { rotulo: 'Check-in feito', passo: 3, alerta: -1 },
  bloqueado: { rotulo: 'Pendência', passo: 2, alerta: 1 },
}

function ehStatusAtivo(status: AgendamentoStatus): status is StatusAtivo {
  return status in SITUACAO
}

/**
 * Coletas em andamento, as com pendência primeiro e depois por data. Fora:
 * cancelada; realizada (o portal não recebe o aviso de liberação, ela ficaria
 * aqui para sempre); e agendada cuja hora passou sem check-in, porque ninguém
 * avisa a falta e o relógio é o único juiz (ver preparoAplicavel).
 */
function coletasEmAndamento(agendamentos: readonly Agendamento[]): (Agendamento & { status: StatusAtivo })[] {
  return agendamentos
    .filter((a): a is Agendamento & { status: StatusAtivo } => ehStatusAtivo(a.status))
    .filter((a) => !agendada(a) || noFuturo(a))
    .sort(
      (a, b) =>
        Number(b.status === 'bloqueado') - Number(a.status === 'bloqueado') ||
        new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime(),
    )
}

interface Passo {
  icon: IconName
  title: string
  sub: string
  action: string
  onClick?: () => void
}

// Mockups sem fonte de dados real: só aparecem com as flags ligadas (lib/flags).
const ACOMPANHAMENTO: readonly { label: string; note: string; icon: IconName; atencao?: boolean }[] = [
  { label: 'Colesterol LDL', note: 'Acima da referência', icon: 'trending-up', atencao: true },
  { label: 'Vitamina D', note: 'Subindo após suplementação', icon: 'trending-up' },
  { label: 'Glicemia', note: 'Estável há 3 meses', icon: 'minus' },
]

const PASSOS_EXTRAS: readonly Passo[] = [
  { icon: 'send', title: 'Compartilhar com médico', sub: 'Dr. Carlos Silva — última troca há 2 sem.', action: 'Enviar' },
  { icon: 'download', title: 'Baixar todos os laudos', sub: 'ZIP com 12 PDFs · 4,2 MB', action: 'Baixar' },
]

/** Cartão da grade com título acessível: leitor de tela navega por blocos. */
function Bloco({ title, right, className, children }: { title: string; right?: ReactNode; className: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={className}>
      <Panel style={{ height: '100%' }}>
        <PanelHead title={<span id={id}>{title}</span>} right={right} className="mb-1" />
        {children}
      </Panel>
    </section>
  )
}

/** Esqueleto dentro de um Bloco: encosta nas bordas do cartão (padding 20). */
function BlocoCarregando({ linhas = 1 }: { linhas?: number }) {
  return (
    <div className="-mx-5 -mb-5">
      <SkeletonRows n={linhas} />
    </div>
  )
}

/** Erro de uma lista: a mensagem da API, sem fingir que a lista está vazia. */
function FalhaAoCarregar({ titulo, erro, onTentar }: { titulo: string; erro: string; onTentar: () => void }) {
  return (
    <EmptyState
      icon="alert-triangle"
      title={titulo}
      text={erro}
      action={
        <Btn variant="secondary" size="sm" onClick={onTentar}>
          Tentar novamente
        </Btn>
      }
    />
  )
}

function SemResultados() {
  return <EmptyState icon="file-text" title="Nenhum resultado ainda" text="Os resultados aparecem aqui assim que forem liberados." />
}

export interface HomePageProps {
  /** Nome do paciente; vazio enquanto o cadastro carrega. */
  nome: string
  onOpenExam: (exam: Exam) => void
  onOpenColeta: (agendamentoId: string) => void
  onAgendar: () => void
  onVerColetas: () => void
  onVerResultados: () => void
}

export function HomePage({ nome, onOpenExam, onOpenColeta, onAgendar, onVerColetas, onVerResultados }: HomePageProps) {
  const { exams, loading: carregandoExames, error: erroExames } = useResultados()
  const { agendamentos, loading: carregandoColetas, error: erroColetas, reload: recarregarColetas } = useAgendamentos()

  const proxima = proximaColeta(agendamentos)
  const passoDaColeta: Passo = proxima
    ? {
        icon: 'calendar-check',
        title: 'Preparo para a próxima coleta',
        sub: `${formatDataHora(proxima.dataHora)} · ${proxima.postoNome}`,
        action: 'Ver',
        onClick: () => onOpenColeta(proxima.id),
      }
    : {
        icon: 'calendar-plus',
        title: 'Agendar nova coleta',
        sub: 'Escolha a unidade, o dia e o horário',
        action: 'Agendar',
        onClick: onAgendar,
      }
  const passos = MOSTRAR_PROXIMOS_PASSOS_EXTRAS ? [passoDaColeta, ...PASSOS_EXTRAS] : [passoDaColeta]
  const emAndamento = coletasEmAndamento(agendamentos)

  const ultimoLiberado = exams.find((e) => e.status === 'ready')
  // "Primeira coleta" é uma afirmação sobre a conta: só com as duas listas
  // carregadas e sem erro. Conta como coleta a realizada (mesmo sem resultado
  // ainda) e a em andamento; cancelada e falta não contam.
  const carregando = carregandoExames || carregandoColetas
  const nuncaColetou =
    !carregando &&
    !erroExames &&
    !erroColetas &&
    exams.length === 0 &&
    emAndamento.length === 0 &&
    !agendamentos.some((a) => a.status === 'realizado')

  // A flag governa o cartão do último exame. O convite à primeira coleta não
  // depende dela: não há exame nenhum a esconder, e sem ele o paciente novo
  // não teria estado vazio.
  let destaque: ReactNode = null
  if (nuncaColetou) destaque = <DestaquePrimeiraColeta onAgendar={onAgendar} />
  else if (MOSTRAR_RESULTADO_HERO) {
    if (ultimoLiberado) destaque = <DestaqueExame exam={ultimoLiberado} onOpen={() => onOpenExam(ultimoLiberado)} />
    else if (carregando) destaque = <DestaqueCarregando />
    else if (erroExames)
      destaque = (
        <Panel style={{ height: '100%' }}>
          <FalhaAoCarregar titulo="Não foi possível carregar seus exames" erro={erroExames} onTentar={() => void atualizaResultados()} />
        </Panel>
      )
    else
      destaque = (
        <Panel style={{ height: '100%' }}>
          <SemResultados />
        </Panel>
      )
  }

  const ola = saudacao(new Date())
  const primeiro = primeiroNome(nome)

  return (
    <div className="lh-alvos grid grid-cols-12 gap-5">
      <div className="col-span-12">
        <PageHeader
          className="mb-1"
          eyebrow={primeiro ? `${ola}, ${primeiro}` : ola}
          title="Que bom te ver de volta"
          sub="Aqui está um resumo dos seus exames mais recentes."
        />
      </div>

      {destaque && <div className={'col-span-12 ' + (MOSTRAR_ACOMPANHAMENTO ? 'lg:col-span-8' : '')}>{destaque}</div>}

      {MOSTRAR_ACOMPANHAMENTO && (
        <Bloco title="Acompanhamento" className="col-span-12 lg:col-span-4" right={<Pill tone="brand">Ativo</Pill>}>
          <div>
            {ACOMPANHAMENTO.map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-3 border-t border-line first:border-t-0">
                <IconTile name={item.icon} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold truncate">{item.label}</span>
                  <span className="text-[12px] text-muted truncate flex items-center gap-1.5">
                    {item.atencao && <span className="lh-bl" style={{ background: 'var(--lh-coral)' }} />}
                    {item.note}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Bloco>
      )}

      <Bloco title="Próximos passos" className="col-span-12 lg:col-span-7">
        {carregandoColetas ? (
          <BlocoCarregando />
        ) : (
          <div>
            {passos.map((p) => (
              <div key={p.title} className="flex items-center gap-3 py-3 border-t border-line first:border-t-0">
                <IconTile name={p.icon} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold">{p.title}</div>
                  <div className="text-[12px] text-muted tabular-nums">{p.sub}</div>
                </div>
                <Btn variant="ghost" size="sm" {...(p.onClick ? { onClick: p.onClick } : {})}>
                  {p.action}
                </Btn>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco
        title="Em andamento"
        className="col-span-12 lg:col-span-5"
        right={
          <Btn variant="ghost" size="sm" onClick={onVerColetas}>
            Minhas coletas
          </Btn>
        }
      >
        {carregandoColetas ? (
          <BlocoCarregando linhas={2} />
        ) : erroColetas ? (
          <FalhaAoCarregar titulo="Não foi possível carregar suas coletas" erro={erroColetas} onTentar={recarregarColetas} />
        ) : emAndamento.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nenhuma coleta em andamento"
            action={
              <Btn size="sm" icon="calendar-plus" onClick={onAgendar}>
                Agendar coleta
              </Btn>
            }
          />
        ) : (
          <>
            <div>
              {emAndamento.slice(0, 3).map((c) => {
                const { rotulo, passo, alerta } = SITUACAO[c.status]
                return (
                  <div key={c.id} className="flex items-center gap-4 py-3.5 border-t border-line first:border-t-0">
                    <button type="button" onClick={() => onOpenColeta(c.id)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                      <Node step={passo} alert={alerta} size={40} ring />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{c.postoNome}</span>
                        <span className="block text-[12px] text-muted tabular-nums">
                          {rotulo} · {formatDataHora(c.dataHora)}
                        </span>
                      </span>
                    </button>
                    <span className="text-[12px] text-muted tabular-nums shrink-0">{passo} de {ETAPAS.length}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11.5px] text-muted mt-3 pt-3 border-t border-line">
              Cada ramificação do nó é uma etapa: {ETAPAS.map((e) => e.nome).join(' · ')}.
            </p>
          </>
        )}
      </Bloco>

      {MOSTRAR_EXAMES_RECENTES && (
        <ExamesRecentes
          exams={exams}
          carregando={carregandoExames}
          erro={erroExames}
          onOpenExam={onOpenExam}
          onVerResultados={onVerResultados}
        />
      )}
    </div>
  )
}

interface ExamesRecentesProps {
  exams: readonly Exam[]
  carregando: boolean
  erro: string | null
  onOpenExam: (exam: Exam) => void
  onVerResultados: () => void
}

function ExamesRecentes({ exams, carregando, erro, onOpenExam, onVerResultados }: ExamesRecentesProps) {
  const id = useId()
  let corpo: ReactNode
  if (exams.length > 0) {
    corpo = (
      <div className="divide-y divide-line">
        {exams.slice(0, 5).map((e) => (
          <LinhaExame key={e.id} exam={e} onClick={() => onOpenExam(e)} />
        ))}
      </div>
    )
  } else if (carregando) {
    corpo = <SkeletonRows n={3} />
  } else if (erro) {
    corpo = <FalhaAoCarregar titulo="Não foi possível carregar seus exames" erro={erro} onTentar={() => void atualizaResultados()} />
  } else {
    corpo = <SemResultados />
  }
  return (
    <section aria-labelledby={id} className="col-span-12">
      <Panel pad={0}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 min-h-[60px]">
          <h3 id={id} className="text-[15px] font-semibold">
            Exames recentes
          </h3>
          {exams.length > 0 && !rotaOculta('results') && (
            <Btn variant="ghost" size="sm" onClick={onVerResultados}>
              Ver todos
            </Btn>
          )}
        </div>
        <div className="border-t border-line">{corpo}</div>
      </Panel>
    </section>
  )
}
