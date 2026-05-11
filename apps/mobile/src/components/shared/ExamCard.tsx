import { View, Text, TouchableOpacity } from 'react-native'
import { WIcon } from '../primitives/WIcon'
import { WStatus } from '../primitives/WStatus'
import type { Exam } from '../../mocks/exams'

// ---------------------------------------------------------------------------
// ExamCard — tappable exam list row
//
// Extracted from ExamCard() in base-from-claude/app.jsx (line ~245).
// <button> → <TouchableOpacity>, <div> → <View>, <p> → <Text>.
// All className values preserved verbatim for NativeWind.
// ---------------------------------------------------------------------------
interface ExamCardProps {
  exam:    Exam
  onPress: () => void
}

export function ExamCard({ exam, onPress }: ExamCardProps) {
  const iconName = exam.status === 'ready' ? 'file-check-2' : 'file-clock'

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex-row items-center justify-between"
      accessibilityRole="button"
      accessibilityLabel={`Exame: ${exam.name}`}
      style={{ minHeight: 44 }}>

      {/* Left: icon + text */}
      <View className="flex-row items-center gap-3 flex-1 min-w-0">
        <View className="h-11 w-11 rounded-xl bg-blue-50 items-center justify-center shrink-0">
          <WIcon name={iconName} className="w-5 h-5" color="#2563eb" strokeWidth={2} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-xs text-gray-500 font-medium mb-0.5">{exam.date}</Text>
          <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
            {exam.name}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {exam.unit}
          </Text>
        </View>
      </View>

      {/* Right: status badge + chevron */}
      <View className="flex-row items-center gap-2 shrink-0 pl-2">
        <WStatus status={exam.status} />
        <WIcon name="chevron-right" className="w-5 h-5" color="#d1d5db" strokeWidth={2} />
      </View>
    </TouchableOpacity>
  )
}
