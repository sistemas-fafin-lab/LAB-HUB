import { useId, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { IconName } from '../ds'
import { Btn, EmptyState, ETAPAS, FalhaAoCarregar, Ico, IconTile, Node, PageHeader, Panel, PanelHead, SkeletonRows } from '../components/portal'
import type { Exam } from '../lib/exame'
import { DestaqueCarregando, DestaqueExame, DestaquePrimeiraColeta } from '../components/visao-geral/Destaque'
import { ExamRow } from '../components/shared/ExamRow'
import { coletasEmAndamento, proximaColeta, situacaoDaColeta } from '../lib/coletas'
import { formatDataHora } from '../lib/datetime'
import {
  MOSTRAR_ACOMPANHAMENTO,
  MOSTRAR_DOCUMENTOS,
  MOSTRAR_EXAMES_RECENTES,
  MOSTRAR_PROXIMOS_PASSOS_EXTRAS,
  MOSTRAR_RESULTADO_HERO,
  rotaOculta,
} from '../lib/flags'
import { primeiroNome } from '../lib/paciente'
import { JEJUM_LABEL, preparoAplicavel } from '../lib/preparo'
import { partesNoFuso } from '../lib/regiao'
import { useAgendamentos } from '../lib/useAgendamentos'
import { atualizaResultados, useResultados } from '../lib/useResultados'
import { useExamesNovos } from '../lib/vistos'
import { tendenciasDosExames } from '../lib/tendencias'
import { itensDeAcompanhamento } from '../lib/acompanhamento'
import type { ItemAcompanhamento } from '../lib/acompanhamento'

function saudacao(agora: Date): string {
  const { hora } = partesNoFuso(agora)
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}

interface Passo {
  icon: IconName
  /** coral: algo que o paciente precisa resolver. */
  tone?: 'coral'
  title: string
  sub: string
  action: string
  onClick?: () => void
}

// Mockups sem fonte de dados real: só aparecem com as flags ligadas (lib/flags).
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
  /** Documentos com a caixa de envio aberta (/documentos?enviar=1). */
  onGuardarDocumento: () => void
  onVerTendencias: () => void
}

export function HomePage({
  nome,
  onOpenExam,
  onOpenColeta,
  onAgendar,
  onVerColetas,
  onVerResultados,
  onGuardarDocumento,
  onVerTendencias,
}: HomePageProps) {
  const { exams, loading: carregandoExames, error: erroExames } = useResultados()
  const { agendamentos, loading: carregandoColetas, error: erroColetas, reload: recarregarColetas } = useAgendamentos()

  const proxima = proximaColeta(agendamentos)
  const passoDaColeta: Passo = proxima
    ? {
        icon: 'calendar-clock',
        title: 'Preparo para a próxima coleta',
        sub: `${formatDataHora(proxima.dataHora)} · ${preparoAplicavel(proxima) ? `Jejum de ${JEJUM_LABEL}` : proxima.postoNome}`,
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
  const emAndamento = coletasEmAndamento(agendamentos)
  const comPendencia = emAndamento.find((c) => c.status === 'bloqueado')
  const passoDaPendencia: Passo | null = comPendencia
    ? {
        icon: 'alert-triangle',
        tone: 'coral',
        title: 'Resolver pendência na recepção',
        sub: `${comPendencia.postoNome} · verifique identidade, guia e pedido médico`,
        action: 'Ver',
        onClick: () => onOpenColeta(comPendencia.id),
      }
    : null
  const passoDoDocumento: Passo | null = MOSTRAR_DOCUMENTOS
    ? {
        icon: 'upload',
        title: 'Guardar um documento',
        sub: 'Identidade, carteirinha e pedidos médicos',
        action: 'Enviar',
        onClick: onGuardarDocumento,
      }
    : null
  // Até 3, nesta ordem: o que precisa ser resolvido, a coleta e o documento.
  const passos = [
    ...(passoDaPendencia ? [passoDaPendencia] : []),
    passoDaColeta,
    ...(passoDoDocumento ? [passoDoDocumento] : []),
    ...(MOSTRAR_PROXIMOS_PASSOS_EXTRAS ? PASSOS_EXTRAS : []),
  ].slice(0, 3)

  const ultimoLiberado = exams.find((e) => e.status === 'ready')
  const tendencias = useMemo(() => tendenciasDosExames(exams), [exams])
  const acompanhamento = itensDeAcompanhamento(
    tendencias,
    exams.find((e) => e.status === 'ready' && !e.retificado),
  )
  const abrirItem = (item: ItemAcompanhamento) => {
    if (item.destino.tipo === 'tendencias') onVerTendencias()
    else {
      const { id } = item.destino
      const exame = exams.find((e) => e.id === id)
      if (exame) onOpenExam(exame)
    }
  }
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
          <FalhaAoCarregar titulo="Não foi possível carregar seus exames" erro={erroExames} onTentar={atualizaResultados} />
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

      {destaque && (
        <div className={'col-span-12 ' + (MOSTRAR_ACOMPANHAMENTO ? 'lg:col-span-8' : '')} style={{ height: '100%' }}>
          {destaque}
        </div>
      )}

      {MOSTRAR_ACOMPANHAMENTO && (
        <Bloco
          title="Acompanhamento"
          className="col-span-12 lg:col-span-4"
          right={
            acompanhamento.length > 0 && !rotaOculta('trends') ? (
              <Btn variant="ghost" size="sm" onClick={onVerTendencias}>
                Tendências
              </Btn>
            ) : undefined
          }
        >
          {carregandoExames && exams.length === 0 ? (
            <BlocoCarregando linhas={3} />
          ) : acompanhamento.length === 0 ? (
            <p className="text-[13px] text-muted py-3">Marcadores fora da referência ou em mudança aparecem aqui.</p>
          ) : (
            <div>
              {acompanhamento.map((item) => (
                <button
                  key={item.chave}
                  type="button"
                  onClick={() => abrirItem(item)}
                  className="w-full flex items-center gap-3 py-3 border-t border-line first:border-t-0 text-left"
                >
                  <IconTile name={item.icone} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold truncate">{item.titulo}</span>
                    <span className="text-[12px] text-muted truncate flex items-center gap-1.5">
                      {item.foraDaReferencia && <span className="lh-bl shrink-0" style={{ background: 'var(--lh-coral)' }} />}
                      <span className="truncate">{item.sub}</span>
                    </span>
                  </span>
                  <Ico name="chevron-right" size={16} className="text-faint shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Bloco>
      )}

      <Bloco title="Próximos passos" className="col-span-12 lg:col-span-7">
        {carregandoColetas ? (
          <BlocoCarregando />
        ) : (
          <div>
            {passos.map((p) => (
              <div key={p.title} className="flex items-center gap-3 py-3 border-t border-line first:border-t-0">
                <IconTile name={p.icon} size={36} {...(p.tone ? { tone: p.tone } : {})} />
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
                const { rotulo, passo, alerta } = situacaoDaColeta(c.status)
                const sub = `${rotulo} · ${formatDataHora(c.dataHora)}`
                return (
                  <div key={c.id} className="flex items-center gap-4 py-3.5 border-t border-line first:border-t-0">
                    <button type="button" onClick={() => onOpenColeta(c.id)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                      <Node step={passo} alert={alerta} size={40} ring />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold truncate" title={c.postoNome}>
                          {c.postoNome}
                        </span>
                        <span className="block text-[12px] text-muted tabular-nums truncate" title={sub}>
                          {sub}
                        </span>
                      </span>
                    </button>
                    {/* Coleta com pendência: a ação no lugar da etapa, como no protótipo. */}
                    {c.status === 'bloqueado' ? (
                      <Btn size="sm" onClick={() => onOpenColeta(c.id)}>
                        Ver
                      </Btn>
                    ) : (
                      <span className="text-[12px] text-muted tabular-nums shrink-0">{passo} de {ETAPAS.length}</span>
                    )}
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
  const novos = useExamesNovos()
  let corpo: ReactNode
  if (exams.length > 0) {
    corpo = (
      <div className="divide-y divide-line">
        {exams.slice(0, 5).map((e) => (
          <ExamRow key={e.id} exam={e} novo={novos.has(e.id)} onClick={() => onOpenExam(e)} />
        ))}
      </div>
    )
  } else if (carregando) {
    corpo = <SkeletonRows n={3} />
  } else if (erro) {
    corpo = <FalhaAoCarregar titulo="Não foi possível carregar seus exames" erro={erro} onTentar={atualizaResultados} />
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
