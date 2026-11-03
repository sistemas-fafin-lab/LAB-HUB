import { useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { OpcaoDS } from './Radio'

export interface TabsProps {
  items: readonly OpcaoDS[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  variant?: 'underline' | 'segmented'
  /** Nome acessível do grupo de abas */
  label?: string
  style?: CSSProperties
}

// Padrão WAI-ARIA de abas: só a aba ativa entra no Tab; setas ←/→ (com volta),
// Home e End trocam de aba e levam o foco junto.
export function Tabs({ items, value, defaultValue, onChange, variant = 'underline', label, style }: TabsProps) {
  const [interno, setInterno] = useState(defaultValue ?? items[0]?.value)
  const atual = value ?? interno
  const escolher = (v: string) => {
    setInterno(v)
    onChange?.(v)
  }
  const navegar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = items.length
    const alvo =
      e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    const item = items[alvo]
    if (!item) return
    e.preventDefault()
    escolher(item.value)
    e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[alvo]?.focus()
  }
  const segmentado = variant === 'segmented'
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: 'flex',
        gap: segmentado ? 4 : 24,
        padding: segmentado ? 4 : 0,
        background: segmentado ? 'var(--lab-gray-100)' : 'transparent',
        borderRadius: segmentado ? 'var(--radius-md)' : 0,
        borderBottom: segmentado ? 0 : '1px solid var(--border-default)',
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      {items.map((it, i) => {
        const ativo = it.value === atual
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => escolher(it.value)}
            onKeyDown={(e) => navegar(e, i)}
            style={{
              flex: segmentado ? 1 : 'none',
              height: segmentado ? 36 : 44,
              padding: segmentado ? '0 14px' : 0,
              border: 0,
              background: segmentado && ativo ? '#fff' : 'transparent',
              borderRadius: segmentado ? 8 : 0,
              color: ativo ? (segmentado ? 'var(--text-body)' : 'var(--lab-blue)') : 'var(--text-muted)',
              font: 'var(--type-label)',
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: segmentado ? 'none' : 'inset 0 -2px 0 ' + (ativo ? 'var(--lab-blue)' : 'transparent'),
              transition: 'color var(--duration-fast), box-shadow var(--duration-fast)',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
