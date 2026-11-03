import type { CSSProperties, KeyboardEvent } from 'react'
import { ativarComTeclado } from './teclado'

const PROXIMA: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

export interface OpcaoDS {
  value: string
  label: string
}

export interface RadioProps {
  options: readonly OpcaoDS[]
  value?: string
  onChange?: (value: string) => void
  /** Nome acessível do grupo */
  name?: string
  direction?: 'row' | 'column'
  disabled?: boolean
  style?: CSSProperties
}

export function Radio({ options, value, onChange, name, direction = 'column', disabled = false, style }: RadioProps) {
  const escolher = (v: string) => {
    if (!disabled) onChange?.(v)
  }
  // Grupo de rádio: só a opção marcada (ou a primeira) entra no Tab.
  const focavel = options.some((o) => o.value === value) ? value : options[0]?.value
  // Setas: marcam a opção vizinha (com volta) e levam o foco até ela.
  const navegar = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const delta = PROXIMA[e.key]
    if (delta === undefined || disabled || options.length === 0) return
    e.preventDefault()
    const alvo = (i + delta + options.length) % options.length
    const opcao = options[alvo]
    if (!opcao) return
    escolher(opcao.value)
    const radios = e.currentTarget.closest('[role=radiogroup]')?.querySelectorAll<HTMLElement>('[role=radio]')
    radios?.[alvo]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={name}
      aria-disabled={disabled || undefined}
      style={{
        display: 'flex',
        flexDirection: direction,
        gap: direction === 'row' ? 20 : 12,
        fontFamily: 'var(--font-body)',
        opacity: disabled ? 'var(--opacity-disabled)' : 1,
        ...style,
      }}
    >
      {options.map((o, i) => {
        const marcado = o.value === value
        return (
          <label
            key={o.value}
            onClick={(e) => {
              e.preventDefault()
              escolher(o.value)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            <span
              role="radio"
              aria-checked={marcado}
              aria-label={o.label}
              tabIndex={!disabled && o.value === focavel ? 0 : -1}
              onKeyDown={(e) => {
                navegar(e, i)
                ativarComTeclado(() => escolher(o.value), [' '])(e)
              }}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1.5px solid ' + (marcado ? 'var(--lab-blue)' : 'var(--border-strong)'),
                background: '#fff',
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: 'var(--lab-blue)',
                  transform: marcado ? 'scale(1)' : 'scale(0)',
                  transition: 'transform var(--duration-fast) var(--ease-out)',
                }}
              />
            </span>
            <span style={{ font: 'var(--type-body)' }}>{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
