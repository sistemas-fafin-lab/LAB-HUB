import type { CSSProperties, ReactNode } from 'react'
import * as DS from '../../ds'
import { Ico } from './controles'

export interface PanelProps {
  children?: ReactNode
  pad?: number
  className?: string
  style?: CSSProperties
}

/** Cartão do portal: raio 20, borda 1 px, sem sombra. */
export function Panel({ children, pad = 20, className = '', style }: PanelProps) {
  return (
    <DS.Card
      padding={pad}
      radius="20px"
      style={{ display: 'block', background: 'var(--lh-card)', color: 'var(--lh-ink)', border: '1px solid var(--lh-line)', ...style }}
    >
      <div className={className}>{children}</div>
    </DS.Card>
  )
}

export function PanelHead({ title, right, className = 'mb-3' }: { title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={'flex items-center justify-between gap-3 ' + className}>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {right}
    </div>
  )
}

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  className?: string
}

/** Título da página em Ranade terminando no ponto azul da marca. */
export function PageHeader({ eyebrow, title, sub, right, className = 'mb-6' }: PageHeaderProps) {
  return (
    <div className={'flex items-end justify-between gap-4 flex-wrap ' + className}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[14px] text-muted mb-1.5">{eyebrow}</p>}
        <h1 className="font-display font-medium text-[28px] md:text-[34px] leading-[1.08] tracking-[-0.02em] text-ink">
          {title}
          <span className="lh-dot" />
        </h1>
        {sub && <p className="text-[14px] text-muted mt-2">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  )
}

export function BackLink({ label = 'Voltar', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink mb-4 whitespace-nowrap"
    >
      <Ico name="arrow-left" size={16} />
      {label}
    </button>
  )
}

export interface InfoItem {
  label: string
  value: ReactNode
}

export function InfoGrid({ items }: { items: readonly InfoItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <div className="lh-ov mb-1.5">{f.label}</div>
          <div className="text-[14px] font-semibold truncate">{f.value}</div>
        </div>
      ))}
    </div>
  )
}
