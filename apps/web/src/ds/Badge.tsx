import type { CSSProperties, ReactNode } from 'react'

export type BadgeTone = 'brand' | 'accent' | 'neutral' | 'solid' | 'solid-accent' | 'dark'

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  dot?: boolean
  style?: CSSProperties
}

const TONS: Record<BadgeTone, readonly [fundo: string, texto: string]> = {
  brand: ['var(--lab-blue-100)', 'var(--lab-blue-700)'],
  accent: ['var(--lab-coral-100)', '#c93d3e'],
  neutral: ['var(--lab-gray-100)', 'var(--text-muted)'],
  solid: ['var(--lab-blue)', '#fff'],
  'solid-accent': ['var(--lab-coral)', '#fff'],
  dark: ['#000', '#fff'],
}

export function Badge({ children, tone = 'brand', dot = false, style }: BadgeProps) {
  const [fundo, texto] = TONS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 10px',
        borderRadius: 'var(--radius-pill)',
        background: fundo,
        color: texto,
        font: 'var(--type-overline)',
        fontWeight: 500,
        fontSize: 12,
        letterSpacing: '.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />}
      {children}
    </span>
  )
}
