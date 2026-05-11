import { WIcon } from '../components/primitives/WIcon'
import { WebHero } from '../components/shared/WebHero'
import { ExamRow } from '../components/shared/ExamRow'
import type { Exam } from '../components/shared/WebHero'
import { WEB_EXAMS } from '../mocks/exams'

// ---------------------------------------------------------------------------
// Inline data for "Acompanhamento" and "Próximos passos" cards
// ---------------------------------------------------------------------------
type Tone = 'amber' | 'green' | 'blue'

interface TrackingItem {
  label: string
  note: string
  icon: string
  tone: Tone
}

const TRACKING_ITEMS: TrackingItem[] = [
  { label: 'Colesterol LDL', note: 'Acima da referência',           icon: 'trending-up', tone: 'amber' },
  { label: 'Vitamina D',     note: 'Subindo após suplementação',    icon: 'trending-up', tone: 'green' },
  { label: 'Glicemia',       note: 'Estável há 3 meses',            icon: 'minus',       tone: 'blue'  },
]

interface NextStep {
  icon: string
  title: string
  sub: string
  action: string
}

const NEXT_STEPS: NextStep[] = [
  { icon: 'calendar-plus', title: 'Agendar nova coleta',       sub: 'Próxima recomendada: 06 Mai',            action: 'Agendar' },
  { icon: 'send',          title: 'Compartilhar com médico',   sub: 'Dr. Carlos Silva — última troca há 2 sem.', action: 'Enviar'  },
  { icon: 'download',      title: 'Baixar todos os laudos',    sub: 'ZIP com 12 PDFs · 4,2 MB',               action: 'Baixar'  },
]

const TONE_CLASSES: Record<Tone, string> = {
  amber: 'bg-amber-100 text-amber-600',
  green: 'bg-emerald-100 text-emerald-600',
  blue:  'bg-blue-100 text-blue-600',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface HomePageProps {
  dark: boolean
  onOpenExam: (exam: Exam) => void
}

export function HomePage({ dark, onOpenExam }: HomePageProps) {
  const last = WEB_EXAMS[0]!

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Greeting */}
      <div className="col-span-12">
        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Bom dia,</p>
        <h1
          className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          Que bom te ver de volta.
        </h1>
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Aqui está um resumo dos seus exames mais recentes.
        </p>
      </div>

      {/* Hero */}
      <div className="col-span-12 lg:col-span-8">
        <WebHero exam={last} onOpen={() => onOpenExam(last)} dark={dark} />
      </div>

      {/* Acompanhamento */}
      <div className="col-span-12 lg:col-span-4">
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-5 shadow-sm h-full`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Acompanhamento</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Ativo
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {TRACKING_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 p-2.5 rounded-xl ${dark ? 'bg-gray-800/50' : 'bg-slate-50'}`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${TONE_CLASSES[item.tone]}`}>
                  <WIcon name={item.icon} className="w-4 h-4" strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-800'}`}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">{item.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Próximos passos */}
      <div className="col-span-12 lg:col-span-7">
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-5 shadow-sm`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Próximos passos</h3>
          </div>
          <div className="flex flex-col gap-2">
            {NEXT_STEPS.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  dark ? 'border-gray-800 hover:bg-gray-800/50' : 'border-gray-100 hover:bg-slate-50'
                } transition`}
              >
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <WIcon name={s.icon} className="w-4 h-4" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-800'}`}>
                    {s.title}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">{s.sub}</div>
                </div>
                <button className="text-xs font-semibold text-blue-600 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 transition">
                  {s.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Exames recentes */}
      <div className="col-span-12">
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-5 shadow-sm`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Exames recentes</h3>
            <div className="flex items-center gap-2">
              <button
                className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${
                  dark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'
                }`}
              >
                <WIcon name="filter" className="w-3.5 h-3.5 inline mr-1" strokeWidth={2.2} />Filtrar
              </button>
              <button className="text-xs font-semibold text-blue-600">Ver todos</button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {WEB_EXAMS.map((e) => (
              <ExamRow key={e.id} exam={e} onClick={() => onOpenExam(e)} dark={dark} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
