import { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity } from 'react-native'
import { ExamCard } from '../components/shared/ExamCard'
import type { Exam } from '../mocks/exams'

// ---------------------------------------------------------------------------
// Filter chip type
// ---------------------------------------------------------------------------
type FilterId = 'all' | 'ready' | 'analyzing'

interface FilterChip {
  id:    FilterId
  label: string
}

const FILTERS: FilterChip[] = [
  { id: 'all',       label: 'Todos'       },
  { id: 'ready',     label: 'Liberados'   },
  { id: 'analyzing', label: 'Em análise'  },
]

// ---------------------------------------------------------------------------
// ResultsScreen — full exam history with filter chips
//
// Extracted from ResultsView() in base-from-claude/app.jsx (line ~519).
// <div> → <View>, <p> → <Text>, list → <FlatList>.
// Filter row uses horizontal ScrollView via FlatList's own scroll.
// ---------------------------------------------------------------------------
interface ResultsScreenProps {
  exams:       Exam[]
  onSelectExam: (exam: Exam) => void
}

export function ResultsScreen({ exams, onSelectExam }: ResultsScreenProps) {
  const [filter, setFilter] = useState<FilterId>('all')

  const filtered =
    filter === 'all' ? exams : exams.filter((e) => e.status === filter)

  return (
    <FlatList
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      data={filtered}
      keyExtractor={(item) => item.id}
      // Header: title + filter chips
      ListHeaderComponent={
        <View>
          <Text className="text-xl font-bold text-slate-800 mb-1">
            Todos os resultados
          </Text>
          <Text className="text-sm text-gray-500 mb-4">
            Histórico completo de exames realizados
          </Text>

          {/* Filter chips — horizontal scroll via flex-row */}
          <View className="flex-row gap-2 mb-4">
            {FILTERS.map((f) => {
              const isActive = filter === f.id
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  activeOpacity={0.8}
                  className={`px-3.5 py-1.5 rounded-full ${
                    isActive
                      ? 'bg-blue-600'
                      : 'bg-white border border-gray-100'
                  }`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={f.label}>
                  <Text
                    className={`text-xs font-semibold ${
                      isActive ? 'text-white' : 'text-gray-600'
                    }`}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      }
      // Each exam row
      renderItem={({ item }) => (
        <View className="mb-3">
          <ExamCard exam={item} onPress={() => onSelectExam(item)} />
        </View>
      )}
      // Empty state
      ListEmptyComponent={
        <View className="py-12 items-center">
          <Text className="text-sm text-gray-400">Nenhum exame nesse filtro.</Text>
        </View>
      }
    />
  )
}
