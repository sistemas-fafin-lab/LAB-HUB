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
import type { Agendamento } from '@lab-hub/shared'
import type { IconName } from '../../ds'
import { useAgendamentos } from '../../lib/useAgendamentos'
import { situacaoDaColeta } from '../../lib/coletas'
import { formatDataHoraCurta } from '../../lib/datetime'
import { caminhoDaColeta } from '../../lib/rotas'

// ---------------------------------------------------------------------------
// Busca do cabeçalho (Ctrl/⌘ K). Com termo, nesta ordem: exames (nome,
// categoria ou médico, até 4), marcadores (até 4), coletas (unidade, até 3) e
// páginas (rótulo ou palavras-chave, até 3), sem diferenciar acentos. Sem
// termo: os atalhos e os exames mais recentes.
// ---------------------------------------------------------------------------

const PLACEHOLDER = '—'

type Item =
  | { kind: 'exam'; exam: Exam }
  | { kind: 'marcador'; exam: Exam }
  | { kind: 'coleta'; id: string }
  | { kind: 'page'; href: string }

interface Opcao {
  chave: string
  item: Item
  icone: IconName
  titulo: string
  sub: string
}

interface Grupo {
  rotulo: string
  opcoes: Opcao[]
}

const opcaoDoExame = (exam: Exam): Opcao => ({
  chave: `exame:${exam.id}`,
  item: { kind: 'exam', exam },
  icone: exam.status === 'ready' ? 'file-check-2' : 'file-clock',
  titulo: exam.name,
  // A situação vai no subtítulo, no lugar da pílula.
  sub: `${exam.category !== PLACEHOLDER ? exam.category : exam.date !== PLACEHOLDER ? exam.date : 'Exame'} · ${situacaoDoExame(exam).rotulo}`,
})

const opcaoDaPagina = (p: Pagina): Opcao => ({
  chave: `pagina:${p.id}`,
  item: { kind: 'page', href: p.href },
  icone: p.icon,
  titulo: p.label,
  sub: p.sub,
})

function examesQueCasam(exams: readonly Exam[], q: string): Opcao[] {
  return exams
    .filter(
      (e) =>
        norm(e.name).includes(q) ||
        (e.category !== PLACEHOLDER && norm(e.category).includes(q)) ||
        (e.doctor !== PLACEHOLDER && norm(e.doctor).includes(q)),
    )
    .slice(0, 4)
    .map(opcaoDoExame)
}

function marcadoresQueCasam(exams: readonly Exam[], q: string): Opcao[] {
  const opcoes: Opcao[] = []
  for (const exam of exams) {
    const marcadores = exam.groups?.length ? exam.groups.flatMap((g) => g.panels) : exam.panels
    for (const [i, p] of marcadores.entries()) {
      if (!norm(p.name).includes(q)) continue
      opcoes.push({
        chave: `marcador:${exam.id}:${i}`,
        item: { kind: 'marcador', exam },
        icone: 'activity',
        titulo: p.name,
        sub: [`${p.value} ${p.unit}`.trim(), exam.name].filter(Boolean).join(' · '),
      })
      if (opcoes.length === 4) return opcoes
    }
  }
  return opcoes
}

function coletasQueCasam(agendamentos: readonly Agendamento[], q: string): Opcao[] {
  return agendamentos
    .filter((a) => norm(a.postoNome).includes(q))
    .slice(0, 3)
    .map((a) => ({
      chave: `coleta:${a.id}`,
      item: { kind: 'coleta', id: a.id },
      icone: 'calendar' as const,
      titulo: a.postoNome,
      sub: `${formatDataHoraCurta(a.dataHora)} · ${situacaoDaColeta(a.status).rotulo}`,
    }))
}

/** Sem termo: estas páginas, nesta ordem (as ocultas por flag saem). */
const ATALHOS: readonly ItemMenu[] = ['agendar', 'coletas', 'results']
const EXAMES_RECENTES = 3

function gruposDaBusca(q: string, exams: readonly Exam[], agendamentos: readonly Agendamento[]): Grupo[] {
  const paginas = itensVisiveis()
  const grupos: Grupo[] =
    q === ''
      ? [
          { rotulo: 'Atalhos', opcoes: ATALHOS.flatMap((id) => paginas.filter((p) => p.id === id)).map(opcaoDaPagina) },
          { rotulo: 'Exames recentes', opcoes: exams.slice(0, EXAMES_RECENTES).map(opcaoDoExame) },
        ]
      : [
          { rotulo: 'Exames', opcoes: examesQueCasam(exams, q) },
          { rotulo: 'Marcadores', opcoes: marcadoresQueCasam(exams, q) },
          { rotulo: 'Coletas', opcoes: coletasQueCasam(agendamentos, q) },
          {
            rotulo: 'Páginas',
            opcoes: paginas
              .filter((p) => norm(p.label).includes(q) || norm(p.palavras).includes(q))
              .slice(0, 3)
              .map(opcaoDaPagina),
          },
        ]
  return grupos.filter((g) => g.opcoes.length > 0)
}

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
  const { agendamentos } = useAgendamentos()
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
  const grupos = gruposDaBusca(q, exams, agendamentos)
  // A ordem do teclado é a da tela: os grupos, um depois do outro.
  const opcoes = grupos.flatMap((g) => g.opcoes)
  const items: Item[] = opcoes.map((o) => o.item)

  const activate = (item: Item) => {
    // Só o tipo do resultado escolhido. O termo digitado NUNCA é enviado: numa
    // busca de exames ele é, na prática, dado de saúde do paciente.
    track('busca_resultado_clique', { tipo: item.kind })
    if (item.kind === 'exam' || item.kind === 'marcador') onOpenExam(item.exam)
    else if (item.kind === 'coleta') navegar(caminhoDaColeta(item.id))
    else navegar(item.href)
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
          placeholder="Buscar exames, coletas, marcadores"
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
          {grupos.map((g) => {
            const inicio = opcoes.indexOf(g.opcoes[0]!)
            return (
              <div key={g.rotulo} role="group" aria-label={g.rotulo} className="mb-1">
                <div className="lh-ov px-2 pt-2 pb-1.5" aria-hidden="true">
                  {g.rotulo}
                </div>
                {g.opcoes.map((o, j) => linha(inicio + j, o.chave, o.item, tile(o.icone), o.titulo, o.sub))}
              </div>
            )
          })}

          {hasQuery && items.length === 0 && (
            <p className="text-[13px] text-muted px-3 py-5 text-center">Nenhum resultado para “{query.trim()}”.</p>
          )}
        </div>
      )}
    </div>
  )
}
