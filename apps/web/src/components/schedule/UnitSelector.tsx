import type { KeyboardEvent } from 'react'
import type { PostoDisponivel } from '@lab-hub/shared'
import { Panel, PanelHead } from '../portal'

interface UnitSelectorProps {
  postos: PostoDisponivel[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const PROXIMA: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

/** Unidades como um grupo de rádio: um cartão por unidade, só uma marcada. */
export function UnitSelector({ postos, selectedId, onSelect }: UnitSelectorProps) {
  const titulo = 'Onde você prefere fazer a coleta?'
  // Só a marcada (ou a primeira) entra no Tab; as setas andam entre elas.
  const focavel = postos.some((p) => p.id === selectedId) ? selectedId : postos[0]?.id
  const navegar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = PROXIMA[e.key]
    if (delta === undefined || postos.length === 0) return
    e.preventDefault()
    const alvo = (i + delta + postos.length) % postos.length
    const posto = postos[alvo]
    if (!posto) return
    onSelect(posto.id)
    e.currentTarget.closest('[role=radiogroup]')?.querySelectorAll<HTMLElement>('[role=radio]')[alvo]?.focus()
  }
  return (
    <Panel>
      <PanelHead title={titulo} />
      <div role="radiogroup" aria-label={titulo} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {postos.map((p, i) => {
          const ativo = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={p.id === focavel ? 0 : -1}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => navegar(e, i)}
              className="lh-row p-4 rounded-[16px] border text-left flex items-start gap-3"
              style={{
                borderColor: ativo ? 'var(--lh-action)' : 'var(--lh-line)',
                boxShadow: ativo ? 'inset 0 0 0 1px var(--lh-action)' : 'none',
              }}
            >
              {/* O desenho do rádio do DS, com as cores do portal (claro e escuro). */}
              <span
                aria-hidden="true"
                className="mt-0.5 w-[22px] h-[22px] rounded-full grid place-items-center shrink-0 bg-card border-[1.5px]"
                style={{ borderColor: ativo ? 'var(--lh-action)' : 'var(--lh-line-strong)' }}
              >
                <span
                  className="w-3 h-3 rounded-full transition-transform duration-[120ms]"
                  style={{ background: 'var(--lh-action)', transform: ativo ? 'scale(1)' : 'scale(0)' }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{p.nome}</span>
                <span className="block text-[12px] text-muted mt-0.5">{p.endereco}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}
