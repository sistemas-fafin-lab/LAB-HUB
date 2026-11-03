import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { OpcaoDS } from './Radio'

export interface TabsProps {
  items: readonly OpcaoDS[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  variant?: 'underline' | 'segmented'
  style?: CSSProperties
}

export function Tabs({ items, value, defaultValue, onChange, variant = 'underline', style }: TabsProps) {
  const [interno, setInterno] = useState(defaultValue ?? items[0]?.value)
  const atual = value ?? interno
  const escolher = (v: string) => {
    setInterno(v)
    onChange?.(v)
  }
  const seg = variant === 'segmented'
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: seg ? 4 : 24,
        padding: seg ? 4 : 0,
        background: seg ? 'var(--lab-gray-100)' : 'transparent',
        borderRadius: seg ? 'var(--radius-md)' : 0,
        borderBottom: seg ? 0 : '1px solid var(--border-default)',
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      {items.map((it) => {
        const ativo = it.value === atual
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => escolher(it.value)}
            style={{
              flex: seg ? 1 : 'none',
              height: seg ? 36 : 44,
              padding: seg ? '0 14px' : 0,
              border: 0,
              background: seg && ativo ? '#fff' : 'transparent',
              borderRadius: seg ? 8 : 0,
              color: ativo ? (seg ? 'var(--text-body)' : 'var(--lab-blue)') : 'var(--text-muted)',
              font: 'var(--type-label)',
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: seg ? 'none' : 'inset 0 -2px 0 ' + (ativo ? 'var(--lab-blue)' : 'transparent'),
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
