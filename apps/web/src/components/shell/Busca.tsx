import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { KeyboardEvent as KeyboardEventReact, ReactNode } from 'react'
import { useResultados } from '../../lib/useResultados'
import { track } from '../../lib/analytics'
import { navegar } from '../../lib/router'
import { Ico, useDismiss } from '../portal'
import type { Exam } from '../../lib/exame'
import { situacaoDoExame } from '../../lib/exibicaoExame'
import { norm } from '../../lib/texto'
import { itensVisiveis } from './menu'
import type { Item as Pagina, ItemMenu } from './menu'

// ---------------------------------------------------------------------------
// Busca do cabeçalho (Ctrl/⌘ K): exames por nome, categoria, médico ou
// marcador (sem acento, até 4) e páginas do menu pelo rótulo (até 3). Sem
// termo, mostra os atalhos e os exames mais recentes, como no protótipo.
// ---------------------------------------------------------------------------

const PLACEHOLDER = '—'


interface ExamMatch {
  exam: Exam
  hint?: string // marcador que casou, quando o casamento não foi pelo nome/categoria
}

type Item = ({ kind: 'exam' } & ExamMatch) | { kind: 'page'; page: Pagina }

function buscaExames(exams: Exam[], q: string): ExamMatch[] {
  return exams
    .flatMap((exam): ExamMatch[] => {
      const inName = norm(exam.name).includes(q)
      const inCat = exam.category !== PLACEHOLDER && norm(exam.category).includes(q)
      const inDoc = exam.doctor !== PLACEHOLDER && norm(exam.doctor).includes(q)
      const panel = exam.panels.find((p) => norm(p.name).includes(q))
      if (!inName && !inCat && !inDoc && !panel) return []
      // Casou só pelo marcador → mostra qual marcador levou até aqui.
      return [panel && !inName && !inCat ? { exam, hint: panel.name } : { exam }]
    })
    .slice(0, 4)
}

// A situação vai no subtítulo, no lugar da pílula que a linha tinha.
const subtituloDoExame = (m: ExamMatch) => {
  const contexto = m.hint
    ? `Marcador · ${m.hint}`
    : m.exam.category !== PLACEHOLDER
      ? m.exam.category
      : m.exam.date !== PLACEHOLDER
        ? m.exam.date
        : 'Exame'
  return `${contexto} · ${situacaoDoExame(m.exam).rotulo}`
}

const SUBTITULO_DA_PAGINA: Partial<Record<ItemMenu, string>> = {
  home: 'Resumo dos seus exames',
  results: 'Todos os exames',
  coletas: 'Acompanhe cada etapa',
  agendar: 'Escolha unidade, dia e horário',
  trends: 'Evolução dos marcadores',
  profile: 'Seus dados',
  documents: 'Identidade, carteirinha e pedidos',
  settings: 'Tema, fuso e privacidade',
}

/** Sem termo: estas páginas, nesta ordem (as ocultas por flag saem). */
const ATALHOS: readonly ItemMenu[] = ['agendar', 'coletas', 'results']
const EXAMES_RECENTES = 3

const ehMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

interface BuscaProps {
  onOpenExam: (exam: Exam) => void
  /** O atalho Ctrl/⌘ K precisa mostrar a busca antes de focá-la (no celular ela fica recolhida). */
  onAtalho?: () => void
  /** Escolher um resultado (ou Esc) fecha a busca recolhível do celular. */
  onConcluir?: () => void
  className?: string
}

export function Busca({ onOpenExam, onAtalho, onConcluir, className = '' }: BuscaProps) {
  const { exams } = useResultados()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const idLista = useId()
  useDismiss(open, () => setOpen(false), caixaRef)

  // ⌘K / Ctrl+K foca a busca de qualquer lugar do app.
  const atalhoRef = useRef(onAtalho)
  atalhoRef.current = onAtalho
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        // Mostra a busca (sincronamente) antes de focar: escondida, não recebe foco.
        flushSync(() => atalhoRef.current?.())
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Nova consulta → volta a seleção para o primeiro resultado.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const q = norm(query)
  const hasQuery = q.length > 0
  const paginas = itensVisiveis()
  const pageMatches = hasQuery
    ? paginas.filter((p) => norm(p.label).includes(q)).slice(0, 3)
    : ATALHOS.flatMap((id) => paginas.filter((p) => p.id === id))
  const examMatches: ExamMatch[] = hasQuery ? buscaExames(exams, q) : exams.slice(0, EXAMES_RECENTES).map((exam) => ({ exam }))
  // Com termo, exames antes das páginas; sem termo, os atalhos antes dos recentes.
  const exameItems = examMatches.map((m): Item => ({ kind: 'exam', ...m }))
  const paginaItems = pageMatches.map((page): Item => ({ kind: 'page', page }))
  const items: Item[] = hasQuery ? [...exameItems, ...paginaItems] : [...paginaItems, ...exameItems]
  const inicioExames = hasQuery ? 0 : pageMatches.length
  const inicioPaginas = hasQuery ? examMatches.length : 0

  const activate = (item: Item) => {
    // Só o tipo do resultado escolhido. O termo digitado NUNCA é enviado: numa
    // busca de exames ele é, na prática, dado de saúde do paciente.
    track('busca_resultado_clique', { tipo: item.kind })
    if (item.kind === 'exam') onOpenExam(item.exam)
    else navegar(item.page.href)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
    onConcluir?.()
  }

  const handleKeyDown = (e: KeyboardEventReact<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
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
      onConcluir?.()
    }
  }

  const mostraLista = open && (items.length > 0 || hasQuery)
  const idOpcao = (i: number) => `${idLista}-${i}`

  const linha = (i: number, key: string, item: Item, icone: ReactNode, titulo: string, sub: string | null) => {
    const on = activeIndex === i
    return (
      <button
        key={key}
        id={idOpcao(i)}
        type="button"
        role="option"
        aria-selected={on}
        tabIndex={-1}
        // Não tira o foco do campo: as setas continuam funcionando.
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setActiveIndex(i)}
        onClick={() => activate(item)}
        className={'w-full flex items-center gap-3 px-2 py-2 rounded-[10px] text-left ' + (on ? 'bg-subtle' : '')}
      >
        {icone}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink truncate">{titulo}</span>
          {sub && <span className="block text-[12px] text-muted truncate">{sub}</span>}
        </span>
        {on && <Ico name="corner-down-left" size={14} className="text-muted" />}
      </button>
    )
  }

  const tile = (icone: Parameters<typeof Ico>[0]['name']) => (
    <span className="w-8 h-8 rounded-[8px] bg-subtle text-ink inline-flex items-center justify-center shrink-0">
      <Ico name={icone} size={16} />
    </span>
  )

  const grupoPaginas = pageMatches.length > 0 && (
    <div role="group" aria-label={hasQuery ? 'Páginas' : 'Atalhos'} className="mb-1">
      <div className="lh-ov px-2 pt-2 pb-1.5" aria-hidden="true">
        {hasQuery ? 'Páginas' : 'Atalhos'}
      </div>
      {pageMatches.map((page, j) =>
        linha(inicioPaginas + j, page.id, { kind: 'page', page }, tile(page.icon), page.label, SUBTITULO_DA_PAGINA[page.id] ?? null),
      )}
    </div>
  )

  return (
    <div ref={caixaRef} className={'relative ' + className}>
      <label className="lh-field flex items-center gap-2 h-10 px-3 rounded-xl bg-subtle text-muted">
        <Ico name="search" size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar exames, médicos, marcadores"
          aria-label="Buscar"
          role="combobox"
          aria-expanded={mostraLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={mostraLista && items[activeIndex] ? idOpcao(activeIndex) : undefined}
          // O anel de foco é o do campo inteiro (.lh-field:focus-within).
          className="bg-transparent outline-none focus-visible:outline-none text-[14px] text-ink flex-1 min-w-0 placeholder:text-muted"
        />
        <kbd className="hidden md:inline text-[10.5px] font-medium font-sans text-muted bg-card rounded-md px-1.5 py-0.5">
          {ehMac() ? '⌘K' : 'Ctrl K'}
        </kbd>
      </label>

      {mostraLista && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Resultados da busca"
          className="absolute left-0 right-0 top-[48px] bg-card border border-line rounded-[16px] shadow-float p-2 max-h-[440px] overflow-y-auto z-50"
        >
          {!hasQuery && grupoPaginas}
          {examMatches.length > 0 && (
            <div role="group" aria-label={hasQuery ? 'Exames' : 'Exames recentes'} className="mb-1">
              <div className="lh-ov px-2 pt-2 pb-1.5" aria-hidden="true">
                {hasQuery ? 'Exames' : 'Exames recentes'}
              </div>
              {examMatches.map((m, i) =>
                linha(
                  inicioExames + i,
                  m.exam.id,
                  { kind: 'exam', ...m },
                  tile(m.exam.status === 'ready' ? 'file-check-2' : 'file-clock'),
                  m.exam.name,
                  subtituloDoExame(m),
                ),
              )}
            </div>
          )}
          {hasQuery && grupoPaginas}

          {hasQuery && items.length === 0 && (
            <p className="text-[13px] text-muted px-3 py-5 text-center">Nenhum resultado para “{query.trim()}”.</p>
          )}
        </div>
      )}
    </div>
  )
}
