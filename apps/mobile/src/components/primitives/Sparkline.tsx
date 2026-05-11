import { View } from 'react-native'
import { Svg, Polyline, Circle } from 'react-native-svg'

// ---------------------------------------------------------------------------
// Sparkline — inline mini-chart using react-native-svg
//
// Ported from apps/web/src/components/primitives/Sparkline.tsx.
// Uses react-native-svg primitives instead of HTML <svg>.
// className on the wrapper View is kept for NativeWind layout control.
// ---------------------------------------------------------------------------
interface SparklineProps {
  data:      number[]
  ok?:       boolean
  width?:    number
  height?:   number
  className?: string
}

export function Sparkline({
  data,
  ok       = true,
  width    = 80,
  height   = 28,
  className,
}: SparklineProps) {
  if (!data || data.length < 2) return null

  const min   = Math.min(...data)
  const max   = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ')

  const stroke = ok ? '#10b981' : '#f59e0b' // emerald-500 / amber-500

  const lastX = (data.length - 1) * stepX
  const lastY = height - ((data[data.length - 1]! - min) / range) * (height - 4) - 2

  return (
    <View className={className}>
      <Svg width={width} height={height} overflow="visible">
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={lastX} cy={lastY} r="2.5" fill={stroke} />
      </Svg>
    </View>
  )
}
