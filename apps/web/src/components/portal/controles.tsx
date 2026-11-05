import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
import * as DS from '../../ds'
import type { IconName } from '../../ds'
import { Node } from './Node'

// Adaptadores do LAB DS para o tema do portal (--lh-*): os componentes do DS
// têm cores fixas da marca; aqui eles passam a seguir claro/escuro.

export function Ico({ name, size = 18, stroke = 1.5, className = '' }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <span className={'inline-flex shrink-0 ' + className}>
      <DS.Icon name={name} size={size} strokeWidth={stroke} />
    </span>
  )
}

export interface BtnProps extends DS.ButtonProps {
  /** Mostra o nó animado e bloqueia o botão enquanto a ação roda */
  loading?: boolean
}

const COR_TEXTO: Partial<Record<DS.ButtonVariant, string>> = {
  ghost: 'var(--lh-link)',
  outline: 'var(--lh-link)',
  secondary: 'var(--lh-ink)',
  inverse: 'var(--lh-action)',
}

export function Btn({ variant = 'primary', loading = false, icon, iconRight, children, style, disabled, ...rest }: BtnProps) {
  const cor = COR_TEXTO[variant]
  return (
    <DS.Button
      {...rest}
      variant={variant}
      {...(icon && !loading ? { icon } : {})}
      {...(iconRight && !loading ? { iconRight } : {})}
      disabled={Boolean(disabled || loading)}
      style={{
        ...(cor ? { color: cor } : null),
        ...(loading ? { opacity: 1, cursor: 'progress' } : null),
        ...style,
      }}
    >
      {loading ? (
        <>
          <Node loading size={18} onBrand={variant === 'primary'} />
          {children}
        </>
      ) : (
        children
      )}
    </DS.Button>
  )
}

export function IconBtn({ variant = 'ghost', size = 'sm', style, ...rest }: DS.IconButtonProps) {
  return <DS.IconButton {...rest} size={size} variant={variant} style={variant === 'ghost' ? { color: 'var(--lh-ink)', ...style } : (style ?? {})} />
}

export interface ChipProps {
  selected?: boolean
  onClick?: () => void
  /** Indisponível: riscado e não clicável (ex.: horário lotado) */
  disabled?: boolean
  children: ReactNode
}

export function Chip({ selected = false, onClick, disabled = false, children }: ChipProps) {
  const estilo = disabled
    ? { background: 'transparent', color: 'var(--lh-faint)', border: '1.5px dashed var(--lh-line)', textDecoration: 'line-through', cursor: 'not-allowed' }
    : selected
      ? { background: 'var(--lh-action)', border: '1.5px solid var(--lh-action)' }
      : { background: 'var(--lh-card)', color: 'var(--lh-ink)', border: '1.5px solid var(--lh-line-strong)' }
  return (
    <DS.Tag selected={!disabled && selected} disabled={disabled} {...(onClick ? { onClick } : {})} style={estilo}>
      {children}
    </DS.Tag>
  )
}

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  icon?: IconName
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  /** Enter no campo, para quem busca só ao confirmar */
  onEnter?: () => void
  rotuloLimpar?: string
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
  icon = 'search',
  inputMode,
  onEnter,
  rotuloLimpar = 'Limpar busca',
}: SearchFieldProps) {
  return (
    <label className={'lh-field flex items-center gap-2 h-10 px-3 rounded-xl bg-subtle text-muted flex-1 min-w-[200px] ' + className}>
      <Ico name={icon} size={16} />
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="bg-transparent outline-none text-[14px] text-ink flex-1 min-w-0 placeholder:text-muted"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={rotuloLimpar} className="text-muted hover:text-ink">
          <Ico name="x" size={14} />
        </button>
      )}
    </label>
  )
}

export function Field({ className = '', ...p }: DS.InputProps & { className?: string }) {
  return (
    <div className={'lh-in ' + className}>
      <DS.Input {...p} />
    </div>
  )
}

export function SelectField({ className = '', ...p }: DS.SelectProps & { className?: string }) {
  return (
    <div className={'lh-in ' + className}>
      <DS.Select {...p} />
    </div>
  )
}

export interface ModalProps extends Omit<ComponentProps<typeof DS.Dialog>, 'open' | 'inline' | 'style'> {
  open: boolean
}

/** Caixa de diálogo no tema do portal (Esc e clique no fundo fecham, via DS.Dialog). */
export function Modal({ open, onClose, width = 480, ...rest }: ModalProps) {
  if (!open) return null
  return (
    <DS.Dialog
      {...rest}
      {...(onClose ? { onClose } : {})}
      width={width}
      style={{ background: 'var(--lh-card)', color: 'var(--lh-ink)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}
    />
  )
}
