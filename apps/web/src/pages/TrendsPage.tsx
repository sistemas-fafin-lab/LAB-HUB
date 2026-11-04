import { useId } from 'react'
import type { IconName } from '../ds'
import { PageHeader, Panel, Pill, TrendLine } from '../components/portal'
import type { PillTone } from '../components/portal'

// Conteúdo estático, o mesmo de hoje: a tela continua atrás de
// MOSTRAR_TENDENCIAS até existir uma fonte de dados real para os marcadores.

type Direcao = 'up' | 'down' | 'flat'

interface TendenciaDoMarcador {
  marcador: string
  valor: string
  unidade: string
  variacao: string
  /** accent = precisa de atenção; brand = dentro da referência, com melhora; neutral = estável */
  tom: PillTone
  direcao: Direcao
  nota: string
  serie: number[]
}

const TENDENCIAS: TendenciaDoMarcador[] = [
  {
    marcador: 'Colesterol LDL',
    valor: '138',
    unidade: 'mg/dL',
    variacao: '+12 nos últimos 6 meses',
    tom: 'accent',
    direcao: 'up',
    nota: 'Está acima do valor recomendado (até 130 mg/dL). Vale conversar com seu médico sobre alimentação e atividade física.',
    serie: [108, 115, 120, 124, 130, 138],
  },
  {
    marcador: 'Vitamina D',
    valor: '42',
    unidade: 'ng/mL',
    variacao: '+18 desde a suplementação',
    tom: 'brand',
    direcao: 'up',
    nota: 'Excelente resposta à suplementação iniciada em fevereiro. Você está dentro da faixa ideal (30–60).',
    serie: [22, 24, 28, 33, 38, 42],
  },
  {
    marcador: 'Glicemia em jejum',
    valor: '92',
    unidade: 'mg/dL',
    variacao: 'Estável há 3 coletas',
    tom: 'neutral',
    direcao: 'flat',
    nota: 'Tudo certo por aqui. Continue mantendo a rotina de exames anuais.',
    serie: [91, 93, 92, 91, 92, 92],
  },
  {
    marcador: 'Hemoglobina',
    valor: '14,2',
    unidade: 'g/dL',
    variacao: '+0,3 desde a última coleta',
    tom: 'neutral',
    direcao: 'up',
    nota: 'Dentro da referência (13,0–17,5). Nenhuma preocupação no momento.',
    serie: [13.4, 13.8, 14.0, 13.9, 14.0, 14.2],
  },
]

const ICONE_DA_DIRECAO: Record<Direcao, IconName> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'minus',
}

function CartaoDoMarcador({ tendencia: h }: { tendencia: TendenciaDoMarcador }) {
  const id = useId()
  return (
    <Panel>
      <section aria-labelledby={id}>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 id={id} className="text-[13px] text-muted">
              {h.marcador}
            </h2>
            <div className="font-display font-medium text-[36px] leading-none tracking-[-0.02em] mt-2 tabular-nums">
              {h.valor}
              <span className="lh-sup">{h.unidade}</span>
            </div>
          </div>
          <Pill tone={h.tom} icon={ICONE_DA_DIRECAO[h.direcao]}>
            {h.variacao}
          </Pill>
        </div>
        <TrendLine data={h.serie} out={h.tom === 'accent'} />
        <div className="rounded-[12px] bg-subtle p-3 mt-4">
          <p className="text-[13px] leading-relaxed">{h.nota}</p>
        </div>
      </section>
    </Panel>
  )
}

export function TrendsPage() {
  const idResumo = useId()
  return (
    <div>
      <PageHeader
        title="Como você está evoluindo"
        sub="Comparação dos seus principais marcadores ao longo do tempo, em linguagem simples."
      />

      <div className="mb-5">
        <Panel>
          <section aria-labelledby={idResumo}>
            <h2 id={idResumo} className="lh-ov mb-2">
              Em resumo
            </h2>
            <p className="text-[15px] leading-relaxed max-w-3xl">
              De 4 marcadores acompanhados, <b className="font-semibold">3 estão na faixa ideal</b> e{' '}
              <b className="font-semibold">1 precisa de atenção</b> (LDL). Sua vitamina D respondeu muito bem à
              suplementação. Considere agendar retorno com a Dra. Renata.
            </p>
          </section>
        </Panel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {TENDENCIAS.map((t) => (
          <CartaoDoMarcador key={t.marcador} tendencia={t} />
        ))}
      </div>
    </div>
  )
}
