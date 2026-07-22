import { useState } from 'react'
import { WIcon } from '../components/primitives/WIcon'
import { ExamRow } from '../components/shared/ExamRow'
import { ExamRowSkeleton } from '../components/shared/ExamRowSkeleton'
import type { Exam } from '../components/shared/WebHero'
import { atualizaResultados, useResultados } from '../lib/useResultados'

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

type PeriodoId = 'all' | '30d' | '90d' | '12m'

interface PeriodoOption {
  id: PeriodoId
  label: string
  dias: number | null // null = sem corte
}

const PERIODO_OPTIONS: PeriodoOption[] = [
  { id: 'all', label: 'Todo o período',   dias: null },
  { id: '30d', label: 'Últimos 30 dias',  dias: 30   },
  { id: '90d', label: 'Últimos 90 dias',  dias: 90   },
  { id: '12m', label: 'Últimos 12 meses', dias: 365  },
]

interface ResultsPageProps {
  dark: boolean
  onOpenExam: (exam: Exam) => void
}

export function ResultsPage({ dark, onOpenExam }: ResultsPageProps) {
  const { exams, loading, error } = useResultados()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery]   = useState('')
  const [periodo, setPeriodo]         = useState<PeriodoId>('all')
  const [periodoAberto, setPeriodoAberto] = useState(false)
  const [atualizando, setAtualizando] = useState(false)

  const periodoSel = PERIODO_OPTIONS.find((p) => p.id === periodo)!
  // Corte em ISO (YYYY-MM-DD) comparável por string com Exam.coletadoEm.
  const corte = periodoSel.dias === null
    ? ''
    : new Date(Date.now() - periodoSel.dias * 86_400_000).toISOString().slice(0, 10)

  const filtered = exams.filter((e) =>
    (filter === 'all' || e.status === filter) &&
    (!corte || (e.coletadoEm ?? '') >= corte) &&
    (
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.category.toLowerCase().includes(query.toLowerCase())
    )
  )

  const handleAtualizar = async () => {
    setAtualizando(true)
    try {
      await atualizaResultados()
    } finally {
      setAtualizando(false)
    }
  }

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

        {/* Período / Atualizar */}
        <div className="hidden md:flex items-center gap-1.5 ml-auto">
          <div className="relative">
            <button
              onClick={() => setPeriodoAberto((v) => !v)}
              className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
                periodo !== 'all'
                  ? 'border-blue-200 text-blue-700 bg-blue-50'
                  : dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
              }`}
            >
              <WIcon name="calendar" className="w-3.5 h-3.5" strokeWidth={2.2} />
              {periodo === 'all' ? 'Período' : periodoSel.label}
            </button>
            {periodoAberto && (
              <>
                {/* Backdrop invisível: clicar fora fecha o menu. */}
                <div className="fixed inset-0 z-10" onClick={() => setPeriodoAberto(false)} />
                <div
                  className={`absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border shadow-lg p-1 ${
                    dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                  }`}
                >
                  {PERIODO_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setPeriodo(p.id); setPeriodoAberto(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                        periodo === p.id
                          ? 'bg-blue-600 text-white'
                          : dark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleAtualizar}
            disabled={atualizando}
            className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 disabled:opacity-60 ${
              dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
            }`}
          >
            <WIcon
              name="refresh-cw"
              className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`}
              strokeWidth={2.2}
            />
            {atualizando ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* List */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-2 shadow-sm flex flex-col gap-1`}
      >
        {loading && <ExamRowSkeleton dark={dark} />}
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
