import { View, Text, TouchableOpacity } from 'react-native'
import { WIcon } from '../primitives/WIcon'

// ---------------------------------------------------------------------------
// NotificationsPanel — slide-down overlay from header
//
// Ported from NotificationsPanel() in base-from-claude/app.jsx.
// ---------------------------------------------------------------------------

const NOTIFS = [
  { id: 1, icon: 'file-check-2', title: 'Hemograma Completo liberado',    time: 'agora',  tone: 'green' },
  { id: 2, icon: 'calendar',     title: 'Lembrete: jejum a partir das 22h', time: 'ontem', tone: 'blue'  },
  { id: 3, icon: 'info',         title: 'Atualização nos termos do app',   time: '2 dias', tone: 'gray'  },
]

const TONE_BG: Record<string, string> = {
  green: 'bg-green-50',
  blue:  'bg-blue-50',
  gray:  'bg-gray-100',
}
const TONE_COLOR: Record<string, string> = {
  green: '#16a34a',
  blue:  '#2563eb',
  gray:  '#6b7280',
}

interface NotificationsPanelProps {
  visible: boolean
  onClose: () => void
}

export function NotificationsPanel({ visible, onClose }: NotificationsPanelProps) {
  if (!visible) return null

  return (
    // Full-screen scrim
    <TouchableOpacity
      className="absolute inset-0 z-40 bg-black/30"
      activeOpacity={1}
      onPress={onClose}
      accessibilityLabel="Fechar notificações">

      {/* Panel — stop propagation so tapping inside doesn't close */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={(e) => e.stopPropagation()}
        className="absolute top-[72px] right-4 left-4 bg-white rounded-2xl border border-gray-100 p-3"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 12,
        }}>

        {/* Header */}
        <View className="flex-row items-center justify-between px-2 pt-1 pb-2">
          <Text className="text-sm font-bold text-slate-800">Notificações</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Text className="text-xs font-semibold text-blue-600">Marcar todas</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        <View className="gap-1">
          {NOTIFS.map((n) => (
            <View key={n.id} className="flex-row items-center gap-3 p-2 rounded-xl">
              <View className={`h-9 w-9 rounded-xl ${TONE_BG[n.tone]} items-center justify-center shrink-0`}>
                <WIcon name={n.icon} className="w-4 h-4" color={TONE_COLOR[n.tone]} strokeWidth={2.2} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>
                  {n.title}
                </Text>
                <Text className="text-[11px] text-gray-400">{n.time}</Text>
              </View>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}
