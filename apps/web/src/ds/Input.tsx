import { useId, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import type { ControlSize } from './Button'

export interface InputProps {
  label?: string
  hint?: string | undefined
  /** Mensagem de erro; deixa a borda coral */
  error?: string | undefined
  icon?: IconName
  placeholder?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  type?: string
  disabled?: boolean
  size?: ControlSize
  style?: CSSProperties
  /** id do <input>; sem ele, um id gerado liga o rótulo e a mensagem */
  id?: string
  autoComplete?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  onBlur?: () => void
  /** Conteúdo à direita, dentro do campo (ex.: botão de mostrar senha). Fica
   *  fora do <label>, para não entrar no nome acessível do campo. */
  trailing?: ReactNode
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
  id,
  autoComplete,
  inputMode,
  onBlur,
  trailing,
}: InputProps) {
  const [foco, setFoco] = useState(false)
  const gerado = useId()
  const idCampo = id ?? gerado
  const idMensagem = `${idCampo}-msg`
  const mensagem = error || hint
  const campoRef = useRef<HTMLInputElement>(null)
  const borda = error ? 'var(--lab-coral)' : foco ? 'var(--lab-blue)' : 'var(--border-strong)'
  return (
    // minmax(0, 1fr): a coluna não cresce até a largura mínima do controle (o
    // input de data tem uma) e o campo cabe em colunas estreitas.
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, fontFamily: 'var(--font-body)', opacity: disabled ? 'var(--opacity-disabled)' : 1, ...style }}>
      {label && (
        <label htmlFor={idCampo} style={{ font: 'var(--type-label)', color: 'var(--text-body)' }}>
          {label}
        </label>
      )}
      <span
        // Clicar na moldura (fora do texto) foca o campo, como fazia o <label> envolvente.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            campoRef.current?.focus()
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: ALTURA[size],
          padding: trailing ? '0 4px 0 14px' : '0 14px',
          background: disabled ? 'var(--lab-gray-50)' : '#fff',
          border: '1.5px solid ' + borda,
          borderRadius: 'var(--radius-md)',
          boxShadow: foco ? 'var(--focus-ring)' : 'none',
          transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
        }}
      >
        {icon && <Icon name={icon} size={18} color="var(--text-subtle)" />}
        <input
          ref={campoRef}
          id={idCampo}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-describedby={mensagem ? idMensagem : undefined}
          type={type}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFoco(true)}
          onBlur={() => {
            setFoco(false)
            onBlur?.()
          }}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'var(--type-body)', color: 'var(--text-body)' }}
        />
        {trailing}
      </span>
      {mensagem && (
        // `lh-in-erro`: no portal, o tema troca o texto coral por tinta com um
        // marcador coral (contraste do texto pequeno), ver styles/lh/tema.css.
        <span
          id={idMensagem}
          className={error ? 'lh-in-erro' : undefined}
          role={error ? 'alert' : undefined}
          style={{ font: 'var(--type-caption)', color: error ? 'var(--lab-coral)' : 'var(--text-subtle)' }}
        >
          {mensagem}
        </span>
      )}
    </div>
  )
}
