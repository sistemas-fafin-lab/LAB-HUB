import { useEffect, useRef, useState } from 'react'
import { WIcon } from '../primitives/WIcon'
import { WStatus } from '../primitives/WStatus'
import { useResultados } from '../../lib/useResultados'
import { rotaOculta } from '../../lib/flags'
import { track } from '../../lib/analytics'
import type { Exam } from '../shared/WebHero'
import type { AppRoute } from './Topbar'

// Páginas navegáveis pela busca. Respeitam as flags de rota oculta (as escondidas
// não aparecem nem são acessíveis), então o índice fica coerente com o menu.
interface PageItem {
  route: AppRoute
  label: string
  icon: string
}

const PAGES: PageItem[] = [
  { route: 'home',      label: 'Visão geral',     icon: 'layout-dashboard' },
  { route: 'results',   label: 'Resultados',      icon: 'file-text' },
  { route: 'schedule',  label: 'Agendas/Coletas', icon: 'calendar-plus' },
  { route: 'trends',    label: 'Tendências',      icon: 'trending-up' },
  { route: 'profile',   label: 'Perfil',          icon: 'user-round' },
  { route: 'documents', label: 'Documentos',      icon: 'folder' },
  { route: 'billing',   label: 'Faturamento',     icon: 'receipt' },
  { route: 'settings',  label: 'Configurações',   icon: 'settings' },
]

const PLACEHOLDER = '—'

// Busca acento-insensível: "hemacia" casa "Hemácia", "glicose" casa "Glicose".
const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

interface ExamMatch {
  exam: Exam
  hint?: string // marcador que casou, quando o casamento não foi pelo nome/categoria
}

type Item =
  | ({ kind: 'exam' } & ExamMatch)
  | { kind: 'page'; page: PageItem }

interface TopbarSearchProps {
  dark: boolean
  onOpenExam: (exam: Exam) => void
  onNav: (route: AppRoute) => void
}

export function TopbarSearch({ dark, onOpenExam, onNav }: TopbarSearchProps) {
  const { exams } = useResultados()
  const [query, setQuery]             = useState('')
  const [open, setOpen]               = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K foca a busca de qualquer lugar do app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Nova consulta → volta a seleção para o primeiro resultado.
  useEffect(() => { setActiveIndex(0) }, [query])

  const q = norm(query)
  const hasQuery = q.length > 0

  const examMatches: ExamMatch[] = hasQuery
    ? exams
        .flatMap((exam): ExamMatch[] => {
          const inName = norm(exam.name).includes(q)
          const inCat  = exam.category !== PLACEHOLDER && norm(exam.category).includes(q)
          const inDoc  = exam.doctor !== PLACEHOLDER && norm(exam.doctor).includes(q)
          const panel  = exam.panels.find((p) => norm(p.name).includes(q))
          if (!inName && !inCat && !inDoc && !panel) return []
          // Casou só pelo marcador → mostra qual marcador levou até aqui.
          return [panel && !inName && !inCat ? { exam, hint: panel.name } : { exam }]
        })
        .slice(0, 6)
    : []

  const visiblePages = PAGES.filter((p) => !rotaOculta(p.route))
  const pageMatches = hasQuery
    ? visiblePages.filter((p) => norm(p.label).includes(q)).slice(0, 4)
    : visiblePages

  const items: Item[] = [
    ...examMatches.map((m): Item => ({ kind: 'exam', ...m })),
    ...pageMatches.map((page): Item => ({ kind: 'page', page })),
  ]

  const activate = (item: Item) => {
    // Só o tipo do resultado escolhido. O termo digitado NUNCA é enviado: numa
    // busca de exames ele é, na prática, dado de saúde do paciente.
    track('busca_resultado_clique', { tipo: item.kind })
    if (item.kind === 'exam') onOpenExam(item.exam)
    else onNav(item.page.route)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const item = items[activeIndex]
      if (item) activate(item)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const rowClass = (active: boolean) =>
    `w-full flex items-center gap-3 p-2 rounded-xl text-left transition ${
      active
        ? dark ? 'bg-blue-500/10' : 'bg-blue-50'
        : dark ? 'hover:bg-gray-800' : 'hover:bg-slate-50'
    }`

  const examSubtitle = (m: ExamMatch) =>
    m.hint
      ? `Marcador · ${m.hint}`
      : m.exam.category !== PLACEHOLDER
        ? m.exam.category
        : m.exam.date !== PLACEHOLDER
          ? m.exam.date
          : 'Exame'

  return (
    <div className="flex-1 max-w-xl relative">
      {/* Overlay para fechar ao clicar fora (mesmo padrão do seletor de dependentes). */}
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}

      <div className="relative z-40">
        <div
          className={`flex items-center gap-2 ${
            dark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-slate-50 border-gray-100 text-gray-500'
          } border rounded-xl px-3 h-10`}
        >
          <WIcon name="search" className="w-4 h-4" strokeWidth={2.2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar exames, médicos, marcadores…"
            className={`bg-transparent outline-none text-sm flex-1 ${
              dark ? 'text-white placeholder:text-gray-500' : 'text-slate-800 placeholder:text-gray-400'
            }`}
          />
          <kbd
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              dark ? 'bg-gray-700 text-gray-400' : 'bg-white border border-gray-200 text-gray-400'
            }`}
          >
            ⌘K
          </kbd>
        </div>

        {open && (items.length > 0 || hasQuery) && (
          <div
            className={`absolute left-0 right-0 top-12 rounded-2xl border shadow-xl z-40 p-2 max-h-[70vh] overflow-y-auto ${
              dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
            }`}
          >
            {examMatches.length > 0 && (
              <>
                <div className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Exames
                </div>
                {examMatches.map((m, i) => {
                  const active = activeIndex === i
                  return (
                    <button
                      key={m.exam.id}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => activate({ kind: 'exam', ...m })}
                      className={rowClass(active)}
                    >
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          m.exam.status === 'ready' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'
                        }`}
                      >
                        <WIcon
                          name={m.exam.status === 'ready' ? 'file-check-2' : 'file-clock'}
                          className="w-4 h-4"
                          strokeWidth={2}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-800'}`}>
                          {m.exam.name}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">{examSubtitle(m)}</div>
                      </div>
                      <WStatus status={m.exam.status} />
                    </button>
                  )
                })}
              </>
            )}

            {pageMatches.length > 0 && (
              <>
                <div className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {hasQuery ? 'Páginas' : 'Ir para'}
                </div>
                {pageMatches.map((page, j) => {
                  const index = examMatches.length + j
                  const active = activeIndex === index
                  return (
                    <button
                      key={page.route}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => activate({ kind: 'page', page })}
                      className={rowClass(active)}
                    >
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          dark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <WIcon name={page.icon} className="w-4 h-4" strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${dark ? 'text-white' : 'text-slate-800'}`}>
                          {page.label}
                        </div>
                      </div>
                      <WIcon name="arrow-right" className="w-4 h-4 text-gray-300" strokeWidth={2} />
                    </button>
                  )
                })}
              </>
            )}

            {hasQuery && items.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-400">
                Nenhum resultado para “{query.trim()}”.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
