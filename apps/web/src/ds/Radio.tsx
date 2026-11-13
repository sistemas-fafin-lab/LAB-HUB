import type { CSSProperties, KeyboardEvent } from 'react'
import { ativarComTeclado, navegarNoGrupoDeRadio } from './teclado'

export interface OpcaoDS {
  value: string
  label: string
  /** Só no Select: opção visível que ainda não pode ser escolhida. */
  disabled?: boolean
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
    if (disabled) return
    const alvo = navegarNoGrupoDeRadio(e, i, options.length)
    const opcao = alvo === null ? undefined : options[alvo]
    if (opcao) escolher(opcao.value)
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
