import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ativarComTeclado } from './teclado'

export interface SwitchProps {
  label?: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  style?: CSSProperties
}

export function Switch({ label, checked, defaultChecked = false, onChange, disabled = false, style }: SwitchProps) {
  const [interno, setInterno] = useState(defaultChecked)
  const ligado = checked ?? interno
  const alternar = () => {
    if (disabled) return
    setInterno(!ligado)
    onChange?.(!ligado)
  }
  return (
    <label
      onClick={(e) => {
        e.preventDefault()
        alternar()
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 'var(--opacity-disabled)' : 1,
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      <span
        role="switch"
        aria-checked={ligado}
        aria-disabled={disabled || undefined}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={ativarComTeclado(alternar)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          background: ligado ? 'var(--lab-blue)' : 'var(--lab-gray-300)',
          position: 'relative',
          transition: 'background var(--duration-normal) var(--ease-standard)',
          flex: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: ligado ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left var(--duration-normal) var(--ease-standard)',
          }}
        />
      </span>
      {label && <span style={{ font: 'var(--type-body)' }}>{label}</span>}
    </label>
  )
}
