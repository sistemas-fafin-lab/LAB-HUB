interface SparklineProps {
  data: number[]
  ok?: boolean
  width?: number
  height?: number
}

export function Sparkline({ data, ok = true, width = 80, height = 28 }: SparklineProps) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const pts = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ')

  const stroke = ok ? '#10b981' : '#f59e0b'
  const lastX = (data.length - 1) * stepX
  const lastY = height - ((data[data.length - 1]! - min) / range) * (height - 4) - 2

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} />
    </svg>
  )
}
