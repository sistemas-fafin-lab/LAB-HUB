import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { OpcaoDS } from './Radio'

export interface SelectProps {
  label?: string
  /** Nome acessível quando o controle não tem rótulo visível */
  ariaLabel?: string
  options: readonly OpcaoDS[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  hint?: string
  style?: CSSProperties
}

export function Select({ label, ariaLabel, options, value, defaultValue, onChange, placeholder, disabled = false, hint, style }: SelectProps) {
  const [foco, setFoco] = useState(false)
  return (
    <label style={{ display: 'grid', gap: 6, fontFamily: 'var(--font-body)', opacity: disabled ? 'var(--opacity-disabled)' : 1, ...style }}>
      {label && <span style={{ font: 'var(--type-label)' }}>{label}</span>}
      <span
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: 'var(--control-height-md)',
          background: '#fff',
          border: '1.5px solid ' + (foco ? 'var(--lab-blue)' : 'var(--border-strong)'),
          borderRadius: 'var(--radius-md)',
          boxShadow: foco ? 'var(--focus-ring)' : 'none',
        }}
      >
        <select
          aria-label={ariaLabel}
          value={value}
          defaultValue={value === undefined ? (defaultValue ?? '') : undefined}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            flex: 1,
            height: '100%',
            padding: '0 40px 0 14px',
            border: 0,
            outline: 0,
            background: 'transparent',
            font: 'var(--type-body)',
            color: 'var(--text-body)',
            cursor: 'pointer',
          }}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{ position: 'absolute', right: 12, pointerEvents: 'none', display: 'flex' }}>
          <Icon name="chevron-down" size={18} color="var(--text-subtle)" />
        </span>
      </span>
      {hint && <span style={{ font: 'var(--type-caption)', color: 'var(--text-subtle)' }}>{hint}</span>}
    </label>
  )
}
