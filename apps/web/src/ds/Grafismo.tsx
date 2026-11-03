import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { grafismoPath } from './grafismoPath'
import type { CantoRecorte } from './grafismoPath'

export interface GrafismoProps {
  /** Cor sólida (ignorada quando há `image`) */
  fill?: string
  /** URL de imagem — a forma vira máscara da foto */
  image?: string
  /** Contorno fino de 1,5 px em vez de preenchimento */
  outline?: boolean
  strokeColor?: string
  /** Raio dos cantos (px, numa caixa de ~250 px); vale para cantos convexos E côncavos */
  radius?: number
  /** Canto que leva o degrau/recorte */
  notch?: CantoRecorte
  /** Fração da largura/altura removida no recorte, ex.: [0.42, 0.38] */
  step?: readonly [number, number]
  width?: string | number
  height?: string | number
  children?: ReactNode
  style?: CSSProperties
  contentStyle?: CSSProperties
}

// A forma em degrau da marca. Mede a própria caixa e monta o path em px, para
// o raio ser verdadeiro (e não esticado).
export function Grafismo({
  fill = 'var(--lab-blue)',
  image,
  outline = false,
  strokeColor = '#fff',
  radius = 28,
  notch = 'bottom-right',
  step = [0.42, 0.38],
  width = '100%',
  height = 240,
  children,
  style,
  contentStyle,
}: GrafismoProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [caixa, setCaixa] = useState({ w: 300, h: typeof height === 'number' ? height : 240 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      if (r.width && r.height) setCaixa({ w: r.width, h: r.height })
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const d = grafismoPath(caixa.w, caixa.h, caixa.w * step[0], caixa.h * step[1], radius, notch)
  const forma = image ? (
    <div style={{ position: 'absolute', inset: 0, background: `url(${image}) center/cover`, clipPath: `path('${d}')` }} />
  ) : outline ? (
    <svg
      width={caixa.w}
      height={caixa.h}
      viewBox={`0 0 ${caixa.w} ${caixa.h}`}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }}
    >
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={1.5} />
    </svg>
  ) : (
    <div style={{ position: 'absolute', inset: 0, background: fill, clipPath: `path('${d}')` }} />
  )
  return (
    <div ref={ref} style={{ position: 'relative', width, height, ...style }}>
      {forma}
      {children && <div style={{ position: 'absolute', inset: 0, padding: 28, boxSizing: 'border-box', ...contentStyle }}>{children}</div>}
    </div>
  )
}
