import { ScrollView, View, Text, TouchableOpacity } from 'react-native'
import { WIcon } from '../components/primitives/WIcon'

// ---------------------------------------------------------------------------
// ScheduleScreen — appointment booking
//
// Ported from ScheduleView() in base-from-claude/app.jsx.
// ---------------------------------------------------------------------------

const SLOTS = [
  { date: 'Hoje',       times: ['14:30', '15:00', '16:15'] },
  { date: 'Amanhã',     times: ['07:00', '07:30', '08:00', '09:15'] },
  { date: 'Sex, 8 Mai', times: ['07:00', '08:30', '10:00'] },
]

export function ScheduleScreen() {
  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}>

      <View className="px-6 pt-5 pb-4">
        <Text className="text-xl font-bold text-slate-800 mb-1">Agendar coleta</Text>
        <Text className="text-sm text-gray-500 mb-4">Unidade Asa Sul · 2,4 km</Text>

        {/* Location card */}
        <View className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
          <View className="h-10 w-10 rounded-xl bg-white items-center justify-center shrink-0">
            <WIcon name="map-pin" className="w-5 h-5" color="#2563eb" strokeWidth={2.2} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-semibold text-slate-800">SGAS 915, Bloco B</Text>
            <Text className="text-xs text-gray-500">Asa Sul, Brasília · DF</Text>
          </View>
          <TouchableOpacity accessibilityRole="button">
            <Text className="text-xs font-semibold text-blue-600">Trocar</Text>
          </TouchableOpacity>
        </View>

        {/* Time slots */}
        <View className="gap-4">
          {SLOTS.map((s) => (
            <View key={s.date}>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                {s.date}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {s.times.map((t) => (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Agendar às ${t}`}
                    className="bg-white border border-gray-100 rounded-xl py-3 items-center justify-center"
                    style={{ width: '30%', minHeight: 44 }}>
                    <Text className="text-sm font-semibold text-slate-700">{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}
