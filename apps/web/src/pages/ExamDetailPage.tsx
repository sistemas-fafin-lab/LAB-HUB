import { WIcon } from '../components/primitives/WIcon'
import { WStatus } from '../components/primitives/WStatus'
import { Sparkline } from '../components/primitives/Sparkline'
import type { Exam } from '../components/shared/WebHero'
import { api } from '../lib/api'

interface ExamDetailPageProps {
  exam: Exam
  onBack: () => void
  dark: boolean
  onViewLaudo: () => void
}

export function ExamDetailPage({ exam, onBack, dark, onViewLaudo }: ExamDetailPageProps) {
  const handleDownload = async () => {
    try {
      const { url } = await api.declaracao(exam.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      /* sem declaração disponível */
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 text-sm font-medium mb-4 ${
          dark ? 'text-gray-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />Voltar para visão geral
      </button>

      {/* Header card */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-6 shadow-sm mb-5`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <WStatus status={exam.status} />
              <span className="text-xs text-gray-400">#{exam.id.toUpperCase()}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-400">{exam.category}</span>
            </div>
            <h1
              className={`text-2xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
            >
              {exam.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {exam.fullDate} · {exam.unit} · {exam.doctor} ({exam.crm})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onViewLaudo}
              className="bg-blue-50 text-blue-600 rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-blue-100"
            >
              <WIcon name="file-text" className="w-4 h-4" strokeWidth={2.2} />Ver laudo
            </button>
            {exam.declaracaoUrl && (
              <button
                onClick={() => void handleDownload()}
                className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700"
              >
                <WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        {exam.summary && (
          <div
            className={`rounded-xl border ${
              dark ? 'border-blue-500/20 bg-blue-500/5' : 'border-blue-100 bg-blue-50/60'
            } p-4 flex gap-3`}
          >
            <div className="h-8 w-8 rounded-lg bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <WIcon name="sparkles" className="w-4 h-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Resumo</div>
              <p className={`text-sm leading-snug ${dark ? 'text-gray-200' : 'text-slate-700'}`}>{exam.summary}</p>
            </div>
          </div>
        )}
      </div>

      {/* Panels table */}
      {exam.panels.length > 0 && (
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-5 shadow-sm`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Marcadores</h3>
            <span className="text-xs text-gray-400">{exam.panels.length} marcadores</span>
          </div>

          {/* Column headers */}
          <div
            className={`grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b ${
              dark ? 'border-gray-800' : 'border-gray-100'
            }`}
          >
            <span>Marcador</span>
            <span>Resultado</span>
            <span>Referência</span>
            <span>Status</span>
            <span>Tendência</span>
          </div>

          {exam.panels.map((p, i) => (
            <div
              key={p.name}
              className={`grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 items-center px-4 py-3 ${
                i !== exam.panels.length - 1
                  ? `border-b ${dark ? 'border-gray-800' : 'border-gray-50'}`
                  : ''
              }`}
            >
              <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{p.name}</div>
              <div
                className={`text-sm font-bold tabular-nums ${
                  p.ok ? (dark ? 'text-white' : 'text-slate-900') : 'text-amber-600'
                }`}
              >
                {p.value}{' '}
                <span className="text-[11px] font-medium text-gray-400">{p.unit}</span>
              </div>
              <div className="text-xs text-gray-500">{p.ref}</div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${p.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                <span
                  className={`text-xs font-medium ${
                    p.ok
                      ? dark ? 'text-emerald-400' : 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {p.ok ? 'Normal' : 'Atenção'}
                </span>
              </div>
              <Sparkline data={p.trend} ok={p.ok} width={90} height={26} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
