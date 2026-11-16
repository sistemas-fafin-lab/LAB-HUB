import { useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import { ativarComTeclado } from './teclado'

export interface CheckboxProps {
  /** Texto ou conteúdo rico (com links). Link dentro do rótulo não marca a caixa. */
  label?: ReactNode
  description?: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  style?: CSSProperties
}

export function Checkbox({ label, checked, defaultChecked = false, onChange, disabled = false, description, style }: CheckboxProps) {
  const idRotulo = useId()
  const rotuloEmTexto = typeof label === 'string'
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
        // O link do rótulo abre o documento; não marca a caixa.
        if (e.target instanceof Element && e.target.closest('a')) return
        e.preventDefault()
        alternar()
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 'var(--opacity-disabled)' : 1,
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      <span
        role="checkbox"
        aria-checked={ligado}
        aria-disabled={disabled || undefined}
        {...(rotuloEmTexto ? { 'aria-label': label } : label ? { 'aria-labelledby': idRotulo } : {})}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={ativarComTeclado(alternar, [' '])}
        style={{
          width: 22,
          height: 22,
          flex: 'none',
          borderRadius: 7,
          border: '1.5px solid ' + (ligado ? 'var(--lab-blue)' : 'var(--border-strong)'),
          background: ligado ? 'var(--lab-blue)' : '#fff',
          display: 'grid',
          placeItems: 'center',
          transition: 'background var(--duration-fast)',
          marginTop: 1,
        }}
      >
        {ligado && <Icon name="check" size={14} strokeWidth={2.5} color="#fff" />}
      </span>
      {(label || description) && (
        <span style={{ display: 'grid', gap: 2 }}>
          {label && (
            <span id={idRotulo} style={{ font: 'var(--type-body)', lineHeight: 1.4 }}>
              {label}
            </span>
          )}
          {description && <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>{description}</span>}
        </span>
      )}
    </label>
  )
}
