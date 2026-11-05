import type { ReactNode } from 'react'
import * as DS from '../../ds'
import type { IconName } from '../../ds'

// Pílula de status. Regra da marca: azul = liberado/dentro da referência,
// coral = atenção, cinza = em andamento — sempre com rótulo, nunca só a cor.
export type PillTone = 'brand' | 'neutral' | 'accent'

const TONS: Record<PillTone, readonly [fundo: string, texto: string, marcador: string]> = {
  brand: ['var(--lh-brand-soft)', 'var(--lh-brand-text)', 'var(--lh-brand)'],
  neutral: ['var(--lh-chip)', 'var(--lh-ink)', 'var(--lh-faint)'],
  accent: ['var(--lh-coral-soft)', 'var(--lh-ink)', 'var(--lh-coral)'],
}

export function Pill({ tone = 'neutral', icon, children }: { tone?: PillTone; icon?: IconName; children: ReactNode }) {
  const [fundo, texto, marcador] = TONS[tone]
  return (
    <DS.Badge tone="neutral" style={{ background: fundo, color: texto }}>
      {icon ? (
        <DS.Icon name={icon} size={13} strokeWidth={1.8} />
      ) : (
        <span style={{ width: 6, height: 6, borderRadius: 1.5, background: marcador, flex: 'none' }} />
      )}
      {children}
    </DS.Badge>
  )
}
