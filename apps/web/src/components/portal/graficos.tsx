// Mini-gráficos de tendência. Decorativos (aria-hidden): o valor vai em texto
// ao lado. O último ponto fica coral quando está fora da referência.

/** Posição de 0 (mínimo da série) a 1 (máximo) de cada valor; série plana fica em 0. */
function normalizar(data: readonly number[]): number[] {
  const min = Math.min(...data)
  const faixa = Math.max(...data) - min || 1
  return data.map((v) => (v - min) / faixa)
}

export function Spark({ data, out = false, width = 88, height = 26 }: { data: readonly number[]; out?: boolean; width?: number; height?: number }) {
  if (data.length < 2) return null
  const passo = width / (data.length - 1)
  const pontos = normalizar(data).map((t, i) => [i * passo, height - t * (height - 6) - 3] as const)
  const [ux, uy] = pontos[pontos.length - 1] ?? [0, 0]
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }} aria-hidden="true">
      <polyline
        points={pontos.map((p) => p.join(',')).join(' ')}
        fill="none"
        style={{ stroke: 'var(--lh-brand)' }}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x={ux - 3} y={uy - 3} width="6" height="6" rx="1.5" style={{ fill: out ? 'var(--lh-coral)' : 'var(--lh-brand)' }} />
    </svg>
  )
}

export function TrendLine({ data, out = false }: { data: readonly number[]; out?: boolean }) {
  if (data.length < 2) return null
  const n = data.length
  const pontos = normalizar(data).map((t, i) => [(i / (n - 1)) * 100, 30 - t * 26] as const)
  const uy = pontos[n - 1]?.[1] ?? 0
  return (
    <div className="relative h-12">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-full block" aria-hidden="true">
        <path
          d={pontos.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')}
          fill="none"
          style={{ stroke: 'var(--lh-brand)' }}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="lh-bl absolute"
        style={{ right: -3, top: `calc(${(uy / 32) * 100}% - 3.5px)`, background: out ? 'var(--lh-coral)' : 'var(--lh-brand)' }}
      />
    </div>
  )
}
