import { View } from 'react-native'
import * as Icons from 'lucide-react-native'

// ---------------------------------------------------------------------------
// Tailwind w-* class → numeric pixel size for lucide-react-native's size prop
// ---------------------------------------------------------------------------
const SIZE_MAP: Record<string, number> = {
  'w-3':   12,
  'w-3.5': 14,
  'w-4':   16,
  'w-5':   20,
  'w-6':   24,
  'w-7':   28,
  'w-8':   32,
  'w-10':  40,
  'w-12':  48,
}

function sizeFromClassName(className: string): number {
  for (const token of className.split(' ')) {
    const mapped = SIZE_MAP[token]
    if (mapped !== undefined) return mapped
  }
  return 20 // default: w-5
}

// Convert kebab-case icon name to PascalCase module key
// e.g. 'file-text' → 'FileText', 'arrow-left' → 'ArrowLeft'
function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// ---------------------------------------------------------------------------
// WIcon — NativeWind-compatible icon wrapper using lucide-react-native
//
// Usage:  <WIcon name="file-text" className="w-5 h-5" color="#2563eb" />
//
// • className  → applied to the View wrapper (NativeWind handles sizing)
// • color      → forwarded to the icon component (no CSS color inheritance in RN)
// • strokeWidth → forwarded to the icon component
// ---------------------------------------------------------------------------
interface WIconProps {
  name:        string
  className?:  string
  color?:      string
  strokeWidth?: number
}

export function WIcon({
  name,
  className  = 'w-5 h-5',
  color      = '#64748b', // slate-500 default
  strokeWidth = 2,
}: WIconProps) {
  const key = toPascalCase(name) as keyof typeof Icons
  const IconComponent = Icons[key] as React.ComponentType<{
    size:        number
    strokeWidth: number
    color:       string
  }> | undefined

  if (!IconComponent) return null

  const size = sizeFromClassName(className)

  return (
    <View className={className}>
      <IconComponent size={size} strokeWidth={strokeWidth} color={color} />
    </View>
  )
}
