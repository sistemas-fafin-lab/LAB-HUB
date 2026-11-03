import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import type { ControlSize } from './Button'

export interface InputProps {
  label?: string
  hint?: string
  /** Mensagem de erro; deixa a borda coral */
  error?: string
  icon?: IconName
  placeholder?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  type?: string
  disabled?: boolean
  size?: ControlSize
  style?: CSSProperties
}

const ALTURA: Record<ControlSize, string> = {
  sm: 'var(--control-height-sm)',
  md: 'var(--control-height-md)',
  lg: 'var(--control-height-lg)',
}

export function Input({
  label,
  hint,
  error,
  icon,
  placeholder,
  value,
  defaultValue,
  onChange,
  type = 'text',
  disabled = false,
  size = 'md',
  style,
}: InputProps) {
  const [foco, setFoco] = useState(false)
  const borda = error ? 'var(--lab-coral)' : foco ? 'var(--lab-blue)' : 'var(--border-strong)'
  return (
    <label style={{ display: 'grid', gap: 6, fontFamily: 'var(--font-body)', opacity: disabled ? 'var(--opacity-disabled)' : 1, ...style }}>
      {label && <span style={{ font: 'var(--type-label)', color: 'var(--text-body)' }}>{label}</span>}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: ALTURA[size],
          padding: '0 14px',
          background: disabled ? 'var(--lab-gray-50)' : '#fff',
          border: '1.5px solid ' + borda,
          borderRadius: 'var(--radius-md)',
          boxShadow: foco ? 'var(--focus-ring)' : 'none',
          transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
        }}
      >
        {icon && <Icon name={icon} size={18} color="var(--text-subtle)" />}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'var(--type-body)', color: 'var(--text-body)' }}
        />
      </span>
      {(error || hint) && (
        // `lh-in-erro`: no portal, o tema troca o texto coral por tinta com um
        // marcador coral (contraste do texto pequeno), ver styles/lh/tema.css.
        <span
          className={error ? 'lh-in-erro' : undefined}
          role={error ? 'alert' : undefined}
          style={{ font: 'var(--type-caption)', color: error ? 'var(--lab-coral)' : 'var(--text-subtle)' }}
        >
          {error || hint}
        </span>
      )}
    </label>
  )
}
