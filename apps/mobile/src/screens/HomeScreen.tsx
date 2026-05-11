import { ScrollView, View, Text, TouchableOpacity } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { WIcon } from '../components/primitives/WIcon'
import { ExamCard } from '../components/shared/ExamCard'
import type { Exam } from '../mocks/exams'

// ---------------------------------------------------------------------------
// HeroCard — gradient highlight for the last available exam
// ---------------------------------------------------------------------------
type GradientColors = [string, string, ...string[]]

const GRADIENT_COLORS: Record<string, GradientColors> = {
  'premium-dark': ['#1e3a8a', '#1d4ed8', '#3730a3'],  // blue-900 → blue-700 → indigo-800
  'ocean':        ['#0e7490', '#2563eb', '#4338ca'],   // cyan-700 → blue-600 → indigo-700
  'midnight':     ['#0f172a', '#1e3a8a', '#1e1b4b'],   // slate-900 → blue-900 → indigo-950
}

interface HeroCardProps {
  exam:       Exam
  onOpen:     () => void
  variant?:   string
}

function HeroCard({ exam, onOpen, variant = 'premium-dark' }: HeroCardProps) {
  const colors = GRADIENT_COLORS[variant] ?? GRADIENT_COLORS['premium-dark']

  return (
    <View className="px-6 pt-5 pb-2">
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="rounded-3xl p-6 overflow-hidden"
        style={{
          shadowColor: '#1e3a8a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 6,
        }}>

        {/* Decorative orb top-right */}
        <View
          className="absolute rounded-full bg-white/10"
          style={{ width: 176, height: 176, top: -48, right: -32 }}
          pointerEvents="none"
        />
        {/* Decorative orb bottom-left */}
        <View
          className="absolute rounded-full"
          style={{ width: 128, height: 128, bottom: -24, left: -24, backgroundColor: 'rgba(165,180,252,0.1)' }}
          pointerEvents="none"
        />
        {/* Decorative giant file icon (opacity-10) */}
        <View
          className="absolute opacity-10"
          style={{ bottom: -16, right: -16 }}
          pointerEvents="none">
          <WIcon name="file-text" className="w-40 h-40" color="#ffffff" strokeWidth={1.4} />
        </View>

        {/* Availability chip */}
        <View className="flex-row items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 mb-4 self-start">
          <View className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <Text className="text-white text-[11px] font-semibold tracking-wide">
            Resultado disponível
          </Text>
        </View>

        <Text className="text-white font-semibold text-lg mb-1 leading-snug">
          Seu último exame está pronto!
        </Text>
        <Text className="text-blue-100 text-sm mb-5 leading-snug">{exam.short}</Text>

        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={onOpen}
            activeOpacity={0.85}
            className="bg-white rounded-xl px-4 py-2.5 flex-row items-center gap-2"
            style={{ minHeight: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Ver resultado">
            <Text className="text-blue-600 font-semibold text-sm">Ver resultado</Text>
            <WIcon name="arrow-right" className="w-4 h-4" color="#2563eb" strokeWidth={2.4} />
          </TouchableOpacity>
          <Text className="text-blue-100/80 text-xs">{exam.date}</Text>
        </View>
      </LinearGradient>
    </View>
  )
}

// ---------------------------------------------------------------------------
// QuickActions — 4-button grid linking to top-level nav actions
//
// Extracted from QuickActions() in base-from-claude/app.jsx (line ~181).
// ---------------------------------------------------------------------------
const QUICK_TONE_MAP: Record<string, string> = {
  blue:   'bg-blue-50',
  indigo: 'bg-indigo-50',
  cyan:   'bg-cyan-50',
  violet: 'bg-violet-50',
}
const QUICK_TONE_ICON_COLOR: Record<string, string> = {
  blue:   '#2563eb',
  indigo: '#4f46e5',
  cyan:   '#0891b2',
  violet: '#7c3aed',
}

interface QuickAction {
  id:    string
  label: string
  icon:  string
  tone:  string
}

const ACTIONS: QuickAction[] = [
  { id: 'schedule',     label: 'Agendar',        icon: 'calendar-plus', tone: 'blue'   },
  { id: 'home-collect', label: 'Coleta em casa',  icon: 'home',          tone: 'indigo' },
  { id: 'results',      label: 'Resultados',      icon: 'file-text',     tone: 'cyan'   },
  { id: 'support',      label: 'Suporte',          icon: 'headphones',    tone: 'violet' },
]

interface QuickActionsProps {
  onAction?: (id: string) => void
}

function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <View className="px-6 pt-3 pb-2">
      <View className="flex-row justify-between gap-2">
        {ACTIONS.map((a) => (
          <TouchableOpacity
            key={a.id}
            onPress={() => onAction?.(a.id)}
            activeOpacity={0.8}
            className="flex-1 flex-col items-center gap-1.5"
            accessibilityRole="button"
            accessibilityLabel={a.label}>
            <View
              className={`h-12 w-12 rounded-2xl ${QUICK_TONE_MAP[a.tone]} items-center justify-center`}>
              <WIcon
                name={a.icon}
                className="w-5 h-5"
                color={QUICK_TONE_ICON_COLOR[a.tone]}
                strokeWidth={2}
              />
            </View>
            <Text className="text-[11px] font-medium text-gray-600 text-center leading-tight">
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// HomeScreen — main patient dashboard
//
// Extracted from HomeView() in base-from-claude/app.jsx (line ~667).
// <div> → <View>, <p> → <Text>, wraps list in <ScrollView>.
// ---------------------------------------------------------------------------
export type HeroVariant = 'premium-dark' | 'ocean' | 'midnight'

interface HomeScreenProps {
  exams:       Exam[]
  onSelectExam: (exam: Exam) => void
  heroVariant?: HeroVariant
  onAction?:   (id: string) => void
}

export function HomeScreen({
  exams,
  onSelectExam,
  heroVariant = 'premium-dark',
  onAction,
}: HomeScreenProps) {
  const last = exams[0]

  if (!last) return null

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}>

      {/* Last exam hero */}
      <HeroCard exam={last} onOpen={() => onSelectExam(last)} variant={heroVariant} />

      {/* Quick-action grid */}
      <QuickActions onAction={onAction} />

      {/* Section header */}
      <View className="px-6 pt-4 pb-3 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-gray-800">Histórico de Exames</Text>
        <TouchableOpacity accessibilityRole="button">
          <Text className="text-xs font-semibold text-blue-600">Ver todos</Text>
        </TouchableOpacity>
      </View>

      {/* Exam list */}
      <View className="px-6 gap-3 pb-6">
        {exams.map((e) => (
          <ExamCard key={e.id} exam={e} onPress={() => onSelectExam(e)} />
        ))}
      </View>

      {/* Care card */}
      <View className="px-6 pb-6">
        <View className="rounded-2xl border border-gray-100 bg-white p-4 flex-row items-center gap-3"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          <LinearGradient
            colors={['#06b6d4', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="h-11 w-11 rounded-xl items-center justify-center shrink-0">
            <WIcon name="heart-pulse" className="w-5 h-5" color="#ffffff" strokeWidth={2.2} />
          </LinearGradient>
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-semibold text-slate-800">Acompanhamento</Text>
            <Text className="text-xs text-gray-500 leading-snug">
              Veja a evolução dos seus marcadores ao longo do tempo.
            </Text>
          </View>
          <WIcon name="chevron-right" className="w-5 h-5" color="#d1d5db" strokeWidth={2} />
        </View>
      </View>
    </ScrollView>
  )
}
