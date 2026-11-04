import type { ReactNode } from 'react'
import type { IconName } from '../ds'
import { BackLink, Btn, EmptyState, ETAPAS, Ico, Node, Panel, PanelHead, Pill, Spark, Timeline } from '../components/portal'
import { Referencia } from '../components/shared/Referencia'
import { LaudoTexto } from '../components/shared/LaudoTexto'
import { LaudoSecoes, isLaudoEmSecoes } from '../components/shared/LaudoSecoes'
import type { Exam, ExamPanel } from '../components/shared/WebHero'
import { track } from '../lib/analytics'
import { baixarDeclaracao } from '../lib/declaracao'
import { situacaoDoExame } from '../lib/exibicaoExame'

interface ExamDetailPageProps {
  exam: Exam
  onBack: () => void
  onViewLaudo: () => void
}

const PLACEHOLDER = '—'

// O resultado do FlowLab não tem médico/CRM e chega como '—'. Melhor omitir o
// trecho inteiro do que imprimir "— (—)" ao lado da data.
function preenchido(valor: string | undefined): valor is string {
  return Boolean(valor) && valor !== PLACEHOLDER
}

// A coluna "Tendência" só existe quando há série histórica para desenhar. Hoje
// o laudo dos LIS traz UM valor por marcador (toTrend devolve no máximo um
// ponto) e o gráfico precisa de dois — o cabeçalho ficava sobre uma coluna
// vazia em todas as linhas. Com histórico real ela volta sozinha.
const GRADE = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-x-4 gap-y-1 px-5'
const COLUNAS = GRADE + ' md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.5fr)]'
const COLUNAS_COM_TENDENCIA = GRADE + ' md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_96px]'

const temSerie = (p: ExamPanel): boolean => p.trend.length >= 2

function LinhaMarcador({ p, comTendencia }: { p: ExamPanel; comTendencia: boolean }) {
  return (
    <div className={(comTendencia ? COLUNAS_COM_TENDENCIA : COLUNAS) + ' items-center py-3.5'}>
      <div className="text-[14px] font-semibold min-w-0 break-words">{p.name}</div>
      <div className="text-[14px] font-semibold tabular-nums min-w-0 break-words">
        <span>{p.value}</span>
        <span className="text-[11px] font-medium text-muted ml-1">{p.unit}</span>
      </div>
      {/* Abaixo de md a referência e a situação descem para linhas próprias. */}
      <div className="col-span-2 md:col-span-1 order-last md:order-none flex items-baseline gap-1 min-w-0">
        <span className="md:hidden text-[13px] text-muted shrink-0">Ref.</span>
        <div className="min-w-0 flex-1">
          <Referencia texto={p.ref} />
        </div>
      </div>
      <div className="col-span-2 md:col-span-1 flex items-center gap-2 text-[13px]">
        <span className="lh-bl" style={{ background: p.ok ? 'var(--lh-brand)' : 'var(--lh-coral)' }} />
        <span>{p.ok ? 'Dentro da referência' : 'Fora da referência'}</span>
      </div>
      {comTendencia && (
        <div className="hidden md:block">
          <Spark data={p.trend} out={!p.ok} width={90} />
        </div>
      )}
    </div>
  )
}

function Marcadores({ exam }: { exam: Exam }) {
  // Uma coluna a mais só se ALGUM marcador tiver série — misturar linhas com e
  // sem gráfico desalinharia o grid.
  const comTendencia = (exam.groups?.flatMap((g) => g.panels) ?? exam.panels).some(temSerie)
  const linhas = (panels: readonly ExamPanel[]) => (
    <div className="divide-y divide-line">
      {/* key com o índice: laudos de OS multiexame repetem nomes genéricos
          ("Resultado", "Conclusão"). */}
      {panels.map((p, i) => (
        <LinhaMarcador key={`${p.name}-${i}`} p={p} comTendencia={comTendencia} />
      ))}
    </div>
  )
  return (
    // overflow visível: a tabela de uma referência longa abre por cima do cartão.
    <Panel pad={0} style={{ overflow: 'visible' }}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold">Marcadores</h2>
        <span className="text-[12px] text-muted tabular-nums">
          {exam.panels.length} {exam.panels.length === 1 ? 'marcador' : 'marcadores'}
        </span>
      </div>
      <div className={(comTendencia ? COLUNAS_COM_TENDENCIA : COLUNAS) + ' lh-ov py-2.5 border-y border-line'}>
        <span>Marcador</span>
        <span>Resultado</span>
        <span className="hidden md:block">Referência</span>
        <span className="hidden md:block">Situação</span>
        {comTendencia && <span className="hidden md:block">Tendência</span>}
      </div>
      {/* Laudo compilado por pedido traz um grupo por exame (e o hemograma, um
          por série) — sem isso são dezenas de marcadores numa lista só. Exame
          avulso não tem grupos e cai na lista simples. */}
      {exam.groups?.length
        ? exam.groups.map((g, gi) => (
            <div key={`${g.name}-${gi}`} className={gi > 0 ? 'border-t border-line' : ''}>
              <div className="lh-ov px-5 pt-4 pb-1" style={{ color: 'var(--lh-link)' }}>
                {g.name}
              </div>
              {linhas(g.panels)}
            </div>
          ))
        : linhas(exam.panels)}
    </Panel>
  )
}

// Laudo descritivo (citologia, biópsia, patologia): o resultado é texto corrido
// em vez de marcadores numéricos. Formato legado: um único panel "Laudo".
// O formato novo do ApLIS — groups com seções — é detectado pelo
// isLaudoEmSecoes e renderizado pelo LaudoSecoes.
function laudoDescritivo(exam: Exam): string | null {
  const unico = exam.panels.length === 1 ? exam.panels[0] : null
  return unico?.name === 'Laudo' ? unico.value : null
}

function Aviso({ icon, atencao = false, children }: { icon: IconName; atencao?: boolean; children: ReactNode }) {
  return (
    <div className={'rounded-[14px] p-4 mb-5 flex items-start gap-3 ' + (atencao ? 'bg-coral-soft' : 'bg-subtle')}>
      <Ico name={icon} size={18} />
      <p className="text-[14px] leading-snug min-w-0">{children}</p>
    </div>
  )
}

/** O que há de resultado: laudo em texto, marcadores ou o aviso de que não há. */
function Resultado({ exam }: { exam: Exam }) {
  const laudoTexto = laudoDescritivo(exam)
  if (isLaudoEmSecoes(exam)) {
    return (
      <Panel>
        <LaudoSecoes groups={exam.groups!} />
      </Panel>
    )
  }
  if (laudoTexto !== null) {
    return (
      <Panel>
        <PanelHead title="Laudo" />
        <LaudoTexto texto={laudoTexto} />
      </Panel>
    )
  }
  if (exam.panels.length > 0) return <Marcadores exam={exam} />
  if (exam.status === 'ready') {
    return (
      <Panel>
        <EmptyState icon="file-text" title="Nenhum marcador para mostrar" />
      </Panel>
    )
  }
  return (
    <Panel>
      <div className="flex flex-col items-center text-center py-10 px-4">
        <Node loading size={56} />
        <div className="text-[15px] font-semibold mt-4">Resultado em andamento</div>
        <p className="text-[13px] text-muted mt-1 max-w-sm">O resultado aparece aqui assim que for liberado.</p>
      </div>
    </Panel>
  )
}

/** Dados da coleta, só o que a fonte informou; só o laudo dos LIS traz a maioria. */
function FichaDaColeta({ exam }: { exam: Exam }) {
  const campos: readonly (readonly [string, string | undefined])[] = [
    ['Unidade', exam.unit],
    ['Data da coleta', exam.dataColeta],
    ['Material', exam.material],
    ['Método', exam.metodo],
  ]
  const itens = campos.filter((item): item is readonly [string, string] => preenchido(item[1]))
  if (itens.length === 0) return null
  return (
    <Panel>
      <PanelHead title="Coleta" className="mb-2" />
      <dl className="text-[13px]">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-4 py-2 border-t border-line first:border-t-0">
            <dt className="text-muted">{rotulo}</dt>
            <dd className="font-medium text-right tabular-nums min-w-0">{valor}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

export function ExamDetailPage({ exam, onBack, onViewLaudo }: ExamDetailPageProps) {
  const { rotulo, tom, passo } = situacaoDoExame(exam)

  const handleDownload = () => {
    // Só a origem do clique — `exam.id`/nome do exame são dados do paciente.
    track('laudo_download', { origem: 'exame' })
    void baixarDeclaracao(exam.id)
  }

  return (
    <div className="lh-alvos max-w-6xl mx-auto">
      <BackLink label="Resultados" onClick={onBack} />

      {/* Na lista, "Versão anterior" é um selo discreto — lá o paciente está
          escolhendo. Aqui ele está LENDO valores, e ler um valor superado como
          se fosse o atual é o dano concreto que essa marcação existe para
          evitar. Por isso o aviso vem antes do laudo, não dentro dele. */}
      {exam.retificado && (
        <Aviso icon="alert-triangle" atencao>
          <span className="font-semibold">Este laudo foi substituído.</span> O laboratório liberou uma versão mais
          recente deste exame — ela está no topo da sua lista de resultados. Esta página mostra a versão anterior.
        </Aviso>
      )}

      {/* Sem isso, nada na tela distingue "meu resultado" de "resultado que
          abri consultando outro paciente pelo modo admin" — o mesmo risco de
          confusão que a retificação acima evita, mas na identidade do
          titular em vez da versão do laudo. */}
      {exam.somenteLeituraAdmin && (
        <Aviso icon="eye">
          Consulta administrativa — este resultado é de outro paciente, somente leitura.
        </Aviso>
      )}

      <Panel pad={24} style={{ marginBottom: 20 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Pill tone={tom}>{rotulo}</Pill>
              {/* O número do laboratório, quando existe — `exam.id` é UUID
                  interno e não serve de referência para o paciente citar. */}
              <span className="text-[12px] text-muted tabular-nums">
                {exam.numeroLaudo ? `#${exam.numeroLaudo} · ${exam.category}` : exam.category}
              </span>
            </div>
            <h1 className="font-display font-medium text-[28px] md:text-[30px] leading-[1.1] tracking-[-0.02em]">{exam.name}</h1>
            <p className="text-[14px] text-muted mt-2">
              {[
                exam.fullDate,
                preenchido(exam.laboratorio) ? exam.laboratorio : preenchido(exam.unit) ? exam.unit : null,
                preenchido(exam.doctor) ? `${exam.doctor}${preenchido(exam.crm) ? ` (${exam.crm})` : ''}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {/* "Ver laudo"/declaração montam o documento a partir da sessão LOGADA
              (usePaciente() em LaudoPage) — em consulta admin isso imprimiria o
              exame de outro paciente com o CPF/nascimento do admin. Sem correção
              de identidade nesta fatia, os dois ficam fora quando
              somenteLeituraAdmin (ver WebHero.tsx). */}
          {!exam.somenteLeituraAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <Btn variant="secondary" icon="file-text" onClick={onViewLaudo}>
                Ver laudo
              </Btn>
              {exam.declaracaoUrl && (
                <Btn icon="download" onClick={handleDownload}>
                  Baixar PDF
                </Btn>
              )}
            </div>
          )}
        </div>
        {exam.summary && (
          <div className="mt-5 rounded-[14px] p-4 bg-subtle">
            <div className="lh-ov mb-1.5" style={{ color: 'var(--lh-ink)' }}>
              Resumo
            </div>
            <p className="text-[14px] leading-relaxed">{exam.summary}</p>
          </div>
        )}
      </Panel>

      {/* Lado a lado só a partir de xl (o protótipo usa lg): com o menu lateral, em
          1024 px a tabela de marcadores não cabe ao lado das etapas. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <Resultado exam={exam} />
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHead
              title="Etapas"
              className="mb-4"
              right={
                <span className="flex items-center gap-2 text-[12px] text-muted tabular-nums">
                  <Node step={passo} size={22} ring />
                  {passo} de {ETAPAS.length}
                </span>
              }
            />
            <Timeline passo={passo} />
          </Panel>
          <FichaDaColeta exam={exam} />
        </div>
      </div>
    </div>
  )
}
