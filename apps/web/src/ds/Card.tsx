import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { ativarComTeclado } from './teclado'

export type CardVariant = 'default' | 'muted' | 'brand' | 'accent' | 'dark' | 'outline'

export interface CardProps {
  children?: ReactNode
  title?: string
  description?: string
  /** Ícone acima do título */
  icon?: IconName
  /** default = branco sobre página cinza; muted = #d6dfea sobre página branca; brand = azul */
  variant?: CardVariant
  padding?: number
  radius?: string
  /** Torna o cartão clicável (sobe no hover) */
  onClick?: () => void
  selected?: boolean
  /** URL de imagem no topo */
  image?: string
  style?: CSSProperties
}

const TONS: Record<CardVariant, readonly [fundo: string, texto: string]> = {
  default: ['#fff', 'var(--text-body)'],
  muted: ['var(--lab-gray-100)', 'var(--text-body)'],
  brand: ['var(--lab-blue)', '#fff'],
  accent: ['var(--lab-coral)', '#fff'],
  dark: ['#000', '#fff'],
  outline: ['transparent', 'var(--text-body)'],
}

export function Card({
  children,
  title,
  description,
  icon,
  variant = 'default',
  padding = 24,
  radius = 'var(--radius-lg)',
  onClick,
  selected = false,
  image,
  style,
}: CardProps) {
  const [hover, setHover] = useState(false)
  const [fundo, texto] = TONS[variant]
  const clicavel = onClick !== undefined
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...(clicavel ? { role: 'button', tabIndex: 0, onKeyDown: ativarComTeclado(onClick) } : {})}
      style={{
        background: selected ? 'var(--lab-blue)' : fundo,
        color: selected ? '#fff' : texto,
        borderRadius: radius,
        padding,
        border: variant === 'outline' ? '1.5px solid var(--border-default)' : 0,
        fontFamily: 'var(--font-body)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: clicavel ? 'pointer' : 'default',
        transition: 'transform var(--duration-normal) var(--ease-standard), background var(--duration-fast)',
        transform: clicavel && hover ? 'translateY(-2px)' : 'none',
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {image && (
        <img
          src={image}
          alt=""
          style={{
            width: `calc(100% + ${padding * 2}px)`,
            margin: `${-padding}px -${padding}px ${padding / 2}px`,
            height: 160,
            objectFit: 'cover',
          }}
        />
      )}
      {icon && <Icon name={icon} size={26} style={{ marginBottom: 4 }} />}
      {title && (
        <div style={{ font: 'var(--type-h4)', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, lineHeight: 1.2 }}>
          {title}
        </div>
      )}
      {description && <div style={{ font: 'var(--type-body-sm)', opacity: 0.85 }}>{description}</div>}
      {children}
    </div>
  )
}
