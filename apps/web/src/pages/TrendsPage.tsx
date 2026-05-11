import { WIcon } from '../components/primitives/WIcon'

interface TrendsPageProps {
  dark: boolean
}

type StoryTone = 'amber' | 'green' | 'blue'
type Direction  = 'up' | 'down' | 'flat'

interface Story {
  marker:    string
  value:     string
  delta:     string
  tone:      StoryTone
  direction: Direction
  note:      string
  spark:     number[]
}

const STORIES: Story[] = [
  {
    marker:    'Colesterol LDL',
    value:     '138 mg/dL',
    delta:     '+12 nos últimos 6 meses',
    tone:      'amber',
    direction: 'up',
    note:      'Está acima do valor recomendado (até 130 mg/dL). Vale conversar com seu médico sobre alimentação e atividade física.',
    spark:     [108, 115, 120, 124, 130, 138],
  },
  {
    marker:    'Vitamina D',
    value:     '42 ng/mL',
    delta:     '+18 desde a suplementação',
    tone:      'green',
    direction: 'up',
    note:      'Excelente resposta à suplementação iniciada em fevereiro. Você está dentro da faixa ideal (30–60).',
    spark:     [22, 24, 28, 33, 38, 42],
  },
  {
    marker:    'Glicemia em jejum',
    value:     '92 mg/dL',
    delta:     'Estável há 3 coletas',
    tone:      'blue',
    direction: 'flat',
    note:      'Tudo certo por aqui. Continue mantendo a rotina de exames anuais.',
    spark:     [91, 93, 92, 91, 92, 92],
  },
  {
    marker:    'Hemoglobina',
    value:     '14,2 g/dL',
    delta:     '+0,3 desde a última coleta',
    tone:      'blue',
    direction: 'up',
    note:      'Dentro da referência (13,0–17,5). Nenhuma preocupação no momento.',
    spark:     [13.4, 13.8, 14.0, 13.9, 14.0, 14.2],
  },
]

const TONE_CLASSES: Record<StoryTone, { bg: (dark: boolean) => string; text: string; chip: string; line: string }> = {
  amber: { bg: (d) => d ? 'bg-amber-500/10'   : 'bg-amber-50',   text: 'text-amber-700',   chip: 'bg-amber-100 text-amber-700',   line: 'stroke-amber-500'   },
  green: { bg: (d) => d ? 'bg-emerald-500/10' : 'bg-emerald-50', text: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700', line: 'stroke-emerald-500' },
  blue:  { bg: (d) => d ? 'bg-blue-500/10'    : 'bg-blue-50',    text: 'text-blue-700',    chip: 'bg-blue-100 text-blue-700',     line: 'stroke-blue-500'    },
}

const DIR_ICON: Record<Direction, string> = {
  up:   'trending-up',
  down: 'trending-down',
  flat: 'minus',
}

function sparkPath(vals: number[]): string {
  const min   = Math.min(...vals)
  const max   = Math.max(...vals)
  const range = max - min || 1
  return vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (vals.length - 1)) * 100} ${30 - ((v - min) / range) * 26}`)
    .join(' ')
}

export function TrendsPage({ dark }: TrendsPageProps) {
  return (
    <div>
      <div className="mb-5">
        <h1
          className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          Como você está evoluindo
        </h1>
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Comparação dos seus principais marcadores ao longo do tempo, em linguagem simples.
        </p>
      </div>

      {/* Summary narrative card */}
      <div className={`rounded-2xl p-5 mb-5 ${dark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100'}`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
            <WIcon name="sparkles" className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div>
            <div className={`text-sm font-bold mb-0.5 ${dark ? 'text-blue-100' : 'text-blue-900'}`}>Em resumo</div>
            <p className={`text-sm leading-relaxed ${dark ? 'text-blue-100/80' : 'text-blue-900/80'}`}>
              De 4 marcadores acompanhados, <b>3 estão na faixa ideal</b> e <b>1 precisa de atenção</b> (LDL).
              Sua vitamina D respondeu muito bem à suplementação. Considere agendar retorno com a Dra. Renata.
            </p>
          </div>
        </div>
      </div>

      {/* Marker grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STORIES.map((s) => {
          const t = TONE_CLASSES[s.tone]
          return (
            <div key={s.marker} className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className={`text-xs font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{s.marker}</div>
                  <div
                    className={`text-2xl font-bold mt-0.5 tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}
                    style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
                  >
                    {s.value}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md ${t.chip}`}>
                  <WIcon name={DIR_ICON[s.direction]} className="w-3 h-3" strokeWidth={2.6} />
                  {s.delta}
                </span>
              </div>
              <svg viewBox="0 0 100 32" className="w-full h-12 mb-3" preserveAspectRatio="none">
                <path
                  d={sparkPath(s.spark)}
                  className={t.line}
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className={`rounded-xl p-3 ${t.bg(dark)}`}>
                <p className={`text-xs leading-relaxed ${dark ? 'text-gray-200' : 'text-slate-700'}`}>{s.note}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
