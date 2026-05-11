import { View, Text, Pressable } from 'react-native'
import { WIcon } from '../primitives/WIcon'

// ---------------------------------------------------------------------------
// MobileHeader — sticky app header
//
// Extracted from Header() in base-from-claude/app.jsx (line 107).
// <header> → <View>, <button> → <Pressable>, <span> → <Text>.
// All className values preserved verbatim for NativeWind.
// ---------------------------------------------------------------------------
interface MobileHeaderProps {
  patientName:      string
  onNotifications?: () => void
}

export function MobileHeader({ patientName, onNotifications }: MobileHeaderProps) {
  return (
    <View className="bg-white/80 sticky top-0 z-30 px-6 py-4 flex-row justify-between items-center border-b border-gray-100">
      {/* Greeting block */}
      <View className="flex-col">
        <Text className="text-[11px] font-medium text-gray-400 tracking-wide">
          Bom dia
        </Text>
        <Text className="text-xl font-bold text-gray-800 leading-tight">
          Olá, {patientName} 👋
        </Text>
      </View>

      {/* Action cluster */}
      <View className="flex-row items-center gap-2">
        {/* Notification bell */}
        <Pressable
          onPress={onNotifications}
          className="relative h-10 w-10 rounded-full bg-white border border-gray-100 items-center justify-center active:scale-95"
          accessibilityLabel="Notificações"
          accessibilityRole="button"
          style={{ minHeight: 44, minWidth: 44 }}>
          <WIcon name="bell" className="w-5 h-5" color="#6b7280" strokeWidth={2} />
          {/* Unread indicator dot */}
          <View className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        </Pressable>

        {/* Avatar initial */}
        <View className="h-10 w-10 bg-blue-100 rounded-full items-center justify-center ring-2 ring-white shadow-sm">
          <Text className="text-blue-600 font-bold">
            {patientName.charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  )
}
