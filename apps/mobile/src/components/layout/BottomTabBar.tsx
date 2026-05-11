import { View, Text, TouchableOpacity, Platform } from 'react-native'
import { WIcon } from '../primitives/WIcon'

// ---------------------------------------------------------------------------
// Tab IDs — source of truth for navigation state
// Mirrors the 4 tabs defined in BottomNav() in base-from-claude/app.jsx (line 432).
// ---------------------------------------------------------------------------
export type TabId = 'home' | 'results' | 'schedule' | 'profile'

interface Tab {
  id:    TabId
  label: string
  icon:  string
}

const TABS: Tab[] = [
  { id: 'home',     label: 'Início',      icon: 'home'          },
  { id: 'results',  label: 'Resultados',  icon: 'file-text'     },
  { id: 'schedule', label: 'Agendar',     icon: 'calendar-plus' },
  { id: 'profile',  label: 'Perfil',      icon: 'user-round'    },
]

// ---------------------------------------------------------------------------
// BottomTabBar — native-style bottom navigation bar
//
// Extracted from BottomNav() in base-from-claude/app.jsx (line 432).
// <nav>/<button> → <View>/<TouchableOpacity>.
// safe-area inset handled via paddingBottom on the outer View.
// className values preserved verbatim for NativeWind.
// ---------------------------------------------------------------------------
interface BottomTabBarProps {
  activeTab: TabId
  onChange:  (tab: TabId) => void
}

export function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <View
      className="absolute bottom-0 left-0 w-full bg-white/95 border-t border-gray-100 px-2 py-2 z-30"
      // Respect iOS home-indicator safe area; Android needs no extra inset.
      style={{ paddingBottom: Platform.OS === 'ios' ? 20 : 8 }}>
      <View className="flex-row justify-between items-center">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id

          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onChange(tab.id)}
              activeOpacity={0.7}
              className="flex-1 flex-col items-center gap-1 py-1.5"
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={{ minHeight: 44 }}>
              {/* Icon pill — highlighted when active */}
              <View
                className={`relative items-center justify-center h-8 w-12 rounded-xl ${
                  isActive ? 'bg-blue-50' : 'bg-transparent'
                }`}>
                <WIcon
                  name={tab.icon}
                  className="w-5 h-5"
                  color={isActive ? '#2563eb' : '#9ca3af'}
                  strokeWidth={isActive ? 2.4 : 2}
                />
              </View>

              {/* Tab label */}
              <Text
                className={`text-[10px] font-semibold tracking-tight ${
                  isActive ? 'text-blue-600' : 'text-gray-400'
                }`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
