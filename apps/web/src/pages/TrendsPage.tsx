import { useId } from 'react'
import type { IconName } from '../ds'
import { Btn, EmptyState, FalhaAoCarregar, PageHeader, Panel, Pill, Skel, TrendLine } from '../components/portal'
import type { Exam } from '../lib/exame'
import { resumoDasTendencias, tendenciasDosExames } from '../lib/tendencias'
import type { Direcao, Tendencia } from '../lib/tendencias'
import { atualizaResultados, useResultados } from '../lib/useResultados'

// Tendências montadas dos resultados reais do paciente (lib/tendencias): um
// marcador aparece a partir de duas coletas com valor numérico.

interface TrendsPageProps {
  onOpenExam: (exam: Exam) => void
  onVerResultados: () => void
}

const ICONE_DA_DIRECAO: Record<Direcao, IconName> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'minus',
}

function CartaoDoMarcador({ tendencia: t, onVerExame }: { tendencia: Tendencia; onVerExame: () => void }) {
  const id = useId()
  return (
    <Panel>
      <section aria-labelledby={id}>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div className="min-w-0">
            <h2 id={id} className="text-[13px] text-muted">
              {t.marcador}
            </h2>
            <div className="font-display font-medium text-[36px] leading-none tracking-[-0.02em] mt-2 tabular-nums">
              {t.valor}
              {t.unidade && <span className="lh-sup">{t.unidade}</span>}
            </div>
          </div>
          <Pill tone={t.tom} icon={ICONE_DA_DIRECAO[t.direcao]}>
            {t.variacao}
          </Pill>
        </div>
        <TrendLine data={t.serie} out={t.foraDaReferencia} />
        <div className="flex justify-between text-[11px] text-muted mt-1.5 tabular-nums">
          <span>Primeira coleta</span>
          <span>Última</span>
        </div>
        <div className="rounded-[12px] bg-subtle p-3 mt-4">
          <p className="text-[13px] leading-relaxed">{t.nota}</p>
        </div>
        <div className="mt-3 -mb-1">
          <Btn variant="ghost" size="sm" iconRight="arrow-right" onClick={onVerExame} style={{ paddingLeft: 0 }}>
            Ver exame
          </Btn>
        </div>
      </section>
    </Panel>
  )
}

function Carregando() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5" role="status" aria-busy="true" aria-label="Carregando">
      {[0, 1].map((i) => (
        <Panel key={i}>
          <Skel className="h-3.5 w-1/3" />
          <Skel className="h-9 w-1/4 mt-3" />
          <Skel className="h-12 w-full mt-4" />
        </Panel>
      ))}
    </div>
  )
}

export function TrendsPage({ onOpenExam, onVerResultados }: TrendsPageProps) {
  const idResumo = useId()
  const { exams, loading, error } = useResultados()
  const tendencias = tendenciasDosExames(exams)

  let corpo: React.ReactNode
  if (loading && exams.length === 0) {
    corpo = <Carregando />
  } else if (error !== null && exams.length === 0) {
    corpo = (
      <Panel pad={0}>
        <FalhaAoCarregar
          titulo="Não foi possível carregar seus resultados"
          erro={error}
          onTentar={() => void atualizaResultados()}
        />
      </Panel>
    )
  } else if (tendencias.length === 0) {
    corpo = (
      <Panel pad={0}>
        <EmptyState
          icon="activity"
          title="Ainda não há histórico suficiente"
          text="As tendências aparecem a partir de duas coletas do mesmo marcador."
          action={
            <Btn variant="secondary" onClick={onVerResultados}>
              Ver resultados
            </Btn>
          }
        />
      </Panel>
    )
  } else {
    const verExame = (id: string) => {
      const exame = exams.find((e) => e.id === id)
      if (exame) onOpenExam(exame)
    }
    corpo = (
      <>
        <div className="mb-5">
          <Panel>
            <section aria-labelledby={idResumo}>
              <h2 id={idResumo} className="lh-ov mb-2">
                Em resumo
              </h2>
              <p className="text-[15px] leading-relaxed max-w-3xl">{resumoDasTendencias(tendencias)}</p>
            </section>
          </Panel>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {tendencias.map((t) => (
            <CartaoDoMarcador key={t.marcador + t.unidade} tendencia={t} onVerExame={() => verExame(t.exameId)} />
          ))}
        </div>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Como você está evoluindo"
        sub="Comparação dos seus principais marcadores ao longo do tempo, em linguagem simples."
      />
      {corpo}
    </div>
  )
}
