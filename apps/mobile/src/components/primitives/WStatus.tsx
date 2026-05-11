import { View, Text } from 'react-native'

// ---------------------------------------------------------------------------
// ExamStatus — domain type (mirrors packages/shared when migrated)
// ---------------------------------------------------------------------------
export type ExamStatus = 'ready' | 'analyzing'

interface WStatusProps {
  status: ExamStatus
}

// ---------------------------------------------------------------------------
// WStatus — exam status badge
//
// Extracted from StatusBadge in base-from-claude/app.jsx.
// span → View/Text for React Native; className kept verbatim for NativeWind.
// ---------------------------------------------------------------------------
export function WStatus({ status }: WStatusProps) {
  if (status === 'ready') {
    return (
      <View className="bg-green-100 rounded-full px-2.5 py-1">
        <Text className="text-green-800 text-[11px] font-semibold tracking-tight">
          Liberado
        </Text>
      </View>
    )
  }

  return (
    <View className="bg-yellow-100 rounded-full px-2.5 py-1 flex-row items-center gap-1">
      <View className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
      <Text className="text-yellow-800 text-[11px] font-semibold tracking-tight">
        Em Análise
      </Text>
    </View>
  )
}
