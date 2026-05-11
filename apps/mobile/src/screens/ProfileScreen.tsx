import { ScrollView, View, Text, TouchableOpacity } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { WIcon } from '../components/primitives/WIcon'

// ---------------------------------------------------------------------------
// ProfileScreen — patient profile & menu
//
// Ported from ProfileView() in base-from-claude/app.jsx.
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  { icon: 'user-round',   label: 'Dados pessoais'   },
  { icon: 'shield-check', label: 'Convênio e plano'  },
  { icon: 'users',        label: 'Dependentes'        },
  { icon: 'file-text',    label: 'Documentos'         },
  { icon: 'bell',         label: 'Notificações'       },
  { icon: 'lock',         label: 'Privacidade'        },
  { icon: 'circle-help',  label: 'Central de ajuda'  },
]

interface ProfileScreenProps {
  patientName?: string
}

export function ProfileScreen({ patientName = 'João' }: ProfileScreenProps) {
  const initial = patientName.charAt(0).toUpperCase()

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}>

      <View className="px-6 pt-5 pb-4">
        {/* Avatar + name */}
        <View className="items-center text-center mb-6">
          <LinearGradient
            colors={['#3b82f6', '#4f46e5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="h-20 w-20 rounded-full items-center justify-center mb-3"
            style={{ shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}>
            <Text className="text-white text-2xl font-bold">{initial}</Text>
          </LinearGradient>

          <Text className="text-xl font-bold text-slate-800">{patientName} Almeida</Text>
          <Text className="text-sm text-gray-500">CPF ••••.•••.123-45</Text>

          {/* Premium badge */}
          <View className="mt-2 flex-row items-center gap-1.5 bg-blue-50 rounded-full px-3 py-1">
            <WIcon name="shield-check" className="w-3.5 h-3.5" color="#1d4ed8" strokeWidth={2.4} />
            <Text className="text-[11px] font-semibold text-blue-700">Plano Premium · Unimed</Text>
          </View>
        </View>

        {/* Menu list */}
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              className={`flex-row items-center gap-3 px-4 py-3.5 ${
                i !== MENU_ITEMS.length - 1 ? 'border-b border-gray-50' : ''
              }`}
              style={{ minHeight: 44 }}>
              <View className="h-9 w-9 rounded-xl bg-slate-50 items-center justify-center shrink-0">
                <WIcon name={item.icon} className="w-4 h-4" color="#475569" strokeWidth={2.2} />
              </View>
              <Text className="flex-1 text-sm font-medium text-slate-700">{item.label}</Text>
              <WIcon name="chevron-right" className="w-4 h-4" color="#d1d5db" strokeWidth={2} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          className="w-full mt-4 py-3 items-center"
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta">
          <Text className="text-red-600 text-sm font-semibold">Sair da conta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
