import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import type { ControlSize } from './Button'

export type IconButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'inverse'

export interface IconButtonProps {
  icon: IconName
  /** Rótulo acessível (obrigatório) */
  label: string
  variant?: IconButtonVariant
  size?: ControlSize
  disabled?: boolean
  onClick?: () => void
  style?: CSSProperties
}

const LADO: Record<ControlSize, number> = { sm: 36, md: 44, lg: 56 }
const ICONE: Record<ControlSize, number> = { sm: 18, md: 22, lg: 26 }

const TONS: Record<IconButtonVariant, readonly [fundo: string, hover: string, texto: string]> = {
  primary: ['var(--action-primary)', 'var(--action-primary-hover)', '#fff'],
  accent: ['var(--action-accent)', 'var(--action-accent-hover)', '#fff'],
  secondary: ['var(--lab-gray-100)', 'var(--lab-gray-300)', 'var(--text-body)'],
  ghost: ['transparent', 'var(--lab-blue-50)', 'var(--lab-blue)'],
  inverse: ['rgba(255,255,255,.14)', 'rgba(255,255,255,.26)', '#fff'],
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', disabled = false, onClick, style }: IconButtonProps) {
  const [hover, setHover] = useState(false)
  const [fundo, fundoHover, texto] = TONS[variant]
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: LADO[size],
        height: LADO[size],
        display: 'inline-grid',
        placeItems: 'center',
        border: 0,
        borderRadius: 'var(--radius-md)',
        background: hover && !disabled ? fundoHover : fundo,
        color: texto,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 'var(--opacity-disabled)' : 1,
        transition: 'background var(--duration-fast) var(--ease-standard)',
        ...style,
      }}
    >
      <Icon name={icon} size={ICONE[size]} />
    </button>
  )
}
