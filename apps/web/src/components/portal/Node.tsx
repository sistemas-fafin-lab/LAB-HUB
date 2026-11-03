import type { CSSProperties } from 'react'

// O nó da marca: 5 ramificações = 5 etapas (Agendamento → Check-in → Coleta →
// Análise → Liberação), no sentido horário a partir do topo. É decorativo
// (aria-hidden): quem usa o nó mostra sempre o rótulo da etapa em texto.
const ANGULOS = [-90, -15.7, 51.8, 128.2, 195.7] as const

export interface NodeProps {
  /** Quantas etapas já foram alcançadas (0–5) */
  step?: number
  /** Índice da etapa em atenção (coral), ou -1 */
  alert?: number
  size?: number
  /** Etapa atual vazada (anel) */
  ring?: boolean
  /** Sobre fundo azul: etapas em branco */
  onBrand?: boolean
  /** Animado, como indicador de carregamento */
  loading?: boolean
}

export function Node({ step = 5, alert = -1, size = 22, ring = false, onBrand = false, loading = false }: NodeProps) {
  const feito = onBrand ? '#fff' : 'var(--lh-brand)'
  const trilho = onBrand ? 'rgba(255,255,255,.35)' : 'var(--lh-track)'
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -54.3 100 100"
      aria-hidden="true"
      className={loading ? 'lh-node-loading' : undefined}
      style={{ display: 'block', flex: 'none' }}
    >
      {ANGULOS.map((a, i) => {
        const r = (a * Math.PI) / 180
        const x = 40 * Math.cos(r)
        const y = 40 * Math.sin(r)
        const cor = i === alert ? 'var(--lh-coral)' : i < step ? feito : trilho
        const atual = ring && i === step - 1 && step < 5 && alert < 0
        return (
          <g key={a} className="arm" style={{ '--i': i } as CSSProperties}>
            <line x1="0" y1="0" x2={x} y2={y} style={{ stroke: cor }} strokeWidth="7.2" strokeLinecap="round" />
            {atual ? (
              <circle cx={x} cy={y} r="6.2" style={{ fill: 'var(--lh-card)', stroke: cor }} strokeWidth="3.6" />
            ) : (
              <circle cx={x} cy={y} r="7.4" style={{ fill: cor }} />
            )}
          </g>
        )
      })}
      <circle cx="0" cy="0" r="11" style={{ fill: step > 0 || loading ? feito : trilho }} />
    </svg>
  )
}
