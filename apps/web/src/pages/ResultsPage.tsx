import { useState } from 'react'
import { WIcon } from '../components/primitives/WIcon'
import { ExamRow } from '../components/shared/ExamRow'
import type { Exam } from '../components/shared/WebHero'
import { useResultados } from '../lib/useResultados'

type FilterId = 'all' | 'ready' | 'analyzing'

interface FilterOption {
  id: FilterId
  label: string
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all',       label: 'Todos'      },
  { id: 'ready',     label: 'Liberados'  },
  { id: 'analyzing', label: 'Em análise' },
]

interface ResultsPageProps {
  dark: boolean
  onOpenExam: (exam: Exam) => void
}

export function ResultsPage({ dark, onOpenExam }: ResultsPageProps) {
  const { exams, loading, error } = useResultados()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery]   = useState('')

  const filtered = exams.filter((e) =>
    (filter === 'all' || e.status === filter) &&
    (
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.category.toLowerCase().includes(query.toLowerCase())
    )
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1
          className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          Seus resultados
        </h1>
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Histórico completo dos exames realizados nas nossas unidades.
        </p>
      </div>

      {/* Toolbar */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-4 shadow-sm mb-4 flex items-center gap-3 flex-wrap`}
      >
        {/* Search */}
        <div
          className={`flex items-center gap-2 flex-1 min-w-[260px] ${
            dark ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-100'
          } border rounded-xl px-3 h-10`}
        >
          <WIcon name="search" className="w-4 h-4 text-gray-400" strokeWidth={2.2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou categoria…"
            className={`bg-transparent outline-none text-sm flex-1 ${
              dark ? 'text-white placeholder:text-gray-500' : 'text-slate-800 placeholder:text-gray-400'
            }`}
          />
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-1.5">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 h-9 rounded-lg text-xs font-semibold transition ${
                filter === f.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : dark
                  ? 'bg-gray-800 text-gray-300'
                  : 'bg-slate-50 text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Period / Export */}
        <div className="hidden md:flex items-center gap-1.5 ml-auto">
          <button
            className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
              dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
            }`}
          >
            <WIcon name="calendar" className="w-3.5 h-3.5" strokeWidth={2.2} />Período
          </button>
          <button
            className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
              dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
            }`}
          >
            <WIcon name="download" className="w-3.5 h-3.5" strokeWidth={2.2} />Exportar
          </button>
        </div>
      </div>

      {/* List */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-2 shadow-sm flex flex-col gap-1`}
      >
        {loading && (
          <div className="text-center text-sm text-gray-400 py-10">Carregando resultados…</div>
        )}
        {error && !loading && (
          <div className="text-center text-sm text-red-500 py-10">{error}</div>
        )}
        {!loading && !error && filtered.map((e) => (
          <ExamRow key={e.id} exam={e} onClick={() => onOpenExam(e)} dark={dark} />
        ))}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10">Nenhum exame encontrado.</div>
        )}
      </div>
    </div>
  )
}
