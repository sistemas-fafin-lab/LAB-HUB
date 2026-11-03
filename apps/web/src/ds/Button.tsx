import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'inverse'
export type ControlSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  children?: ReactNode
  /** primary = azul; accent = CTA coral; inverse = branco sobre painéis azuis */
  variant?: ButtonVariant
  size?: ControlSize
  /** Formato pílula, usado em CTAs */
  pill?: boolean
  /** Ícone à esquerda */
  icon?: IconName
  iconRight?: IconName
  disabled?: boolean
  fullWidth?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  style?: CSSProperties
}

interface Paleta {
  bg: string
  hover: string
  active: string
  fg: string
  border: string
}

const ALTURA: Record<ControlSize, string> = {
  sm: 'var(--control-height-sm)',
  md: 'var(--control-height-md)',
  lg: 'var(--control-height-lg)',
}
const RECUO: Record<ControlSize, string> = { sm: '14px', md: '20px', lg: '28px' }
const FONTE: Record<ControlSize, string> = { sm: '14px', md: '15px', lg: '17px' }

const PALETAS: Record<ButtonVariant, Paleta> = {
  primary: { bg: 'var(--action-primary)', hover: 'var(--action-primary-hover)', active: 'var(--action-primary-active)', fg: 'var(--text-on-brand)', border: 'transparent' },
  accent: { bg: 'var(--action-accent)', hover: 'var(--action-accent-hover)', active: '#e04c4d', fg: 'var(--text-on-accent)', border: 'transparent' },
  secondary: { bg: 'var(--lab-gray-100)', hover: 'var(--lab-gray-300)', active: '#a9b7c4', fg: 'var(--text-body)', border: 'transparent' },
  outline: { bg: 'transparent', hover: 'var(--lab-blue-50)', active: 'var(--lab-blue-100)', fg: 'var(--lab-blue)', border: 'var(--lab-blue)' },
  ghost: { bg: 'transparent', hover: 'var(--lab-blue-50)', active: 'var(--lab-blue-100)', fg: 'var(--lab-blue)', border: 'transparent' },
  inverse: { bg: 'var(--lab-white)', hover: '#eef2f6', active: 'var(--lab-gray-100)', fg: 'var(--lab-blue)', border: 'transparent' },
}

type EstadoPonteiro = 'idle' | 'hover' | 'active'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  pill = false,
  icon,
  iconRight,
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  style,
}: ButtonProps) {
  const [estado, setEstado] = useState<EstadoPonteiro>('idle')
  const p = PALETAS[variant]
  const fundo = disabled ? p.bg : estado === 'active' ? p.active : estado === 'hover' ? p.hover : p.bg
  const tamanhoIcone = size === 'sm' ? 16 : 18
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setEstado('hover')}
      onMouseLeave={() => setEstado('idle')}
      onMouseDown={() => setEstado('active')}
      onMouseUp={() => setEstado('hover')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: ALTURA[size],
        padding: '0 ' + RECUO[size],
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: FONTE[size],
        lineHeight: 1,
        color: p.fg,
        background: fundo,
        border: '1.5px solid ' + p.border,
        borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 'var(--opacity-disabled)' : 1,
        width: fullWidth ? '100%' : undefined,
        transition: 'background var(--duration-fast) var(--ease-standard)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={tamanhoIcone} />}
      {children}
      {iconRight && <Icon name={iconRight} size={tamanhoIcone} />}
    </button>
  )
}
