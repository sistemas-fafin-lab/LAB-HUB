import { Modal, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { WIcon } from '../components/primitives/WIcon'
import { WStatus } from '../components/primitives/WStatus'
import type { Exam, ExamPanel } from '../mocks/exams'

// ---------------------------------------------------------------------------
// MetaItem — labelled field with icon, used in the meta strip
//
// Extracted from MetaItem() in base-from-claude/app.jsx (line ~415).
// ---------------------------------------------------------------------------
interface MetaItemProps {
  icon:  string
  label: string
  value: string
  sub?:  string
}

function MetaItem({ icon, label, value, sub }: MetaItemProps) {
  return (
    <View className="flex-row items-start gap-2.5 min-w-0">
      <View className="h-8 w-8 rounded-lg bg-white items-center justify-center shrink-0 border border-gray-100">
        <WIcon name={icon} className="w-4 h-4" color="#64748b" strokeWidth={2} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
          {label}
        </Text>
        <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>
          {value}
        </Text>
        {sub ? (
          <Text className="text-[11px] text-gray-500" numberOfLines={1}>{sub}</Text>
        ) : null}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// PanelRow — single marker row inside the panels table
// ---------------------------------------------------------------------------
interface PanelRowProps {
  panel:    ExamPanel
  isLast:   boolean
}

function PanelRow({ panel, isLast }: PanelRowProps) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${
        isLast ? '' : 'border-b border-gray-100'
      }`}>
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>
          {panel.name}
        </Text>
        <Text className="text-[11px] text-gray-400 mt-0.5">Ref. {panel.ref}</Text>
      </View>
      <View className="flex-row items-center gap-2 shrink-0 pl-2">
        <Text
          className={`text-sm font-bold tabular-nums ${
            panel.ok ? 'text-slate-800' : 'text-amber-600'
          }`}>
          {panel.value}
        </Text>
        <View
          className={`h-2 w-2 rounded-full ${
            panel.ok ? 'bg-green-500' : 'bg-amber-500'
          }`}
        />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// ExamDetailScreen — slide-up exam detail (bottom sheet)
//
// Extracted from BottomSheet() in base-from-claude/app.jsx (line ~285).
// CSS transitions replaced by <Modal animationType="slide">.
// <div> → <View>, <p>/<span> → <Text>, <button> → <TouchableOpacity>.
// overflow-y-auto → <ScrollView>.
// ---------------------------------------------------------------------------
interface ExamDetailScreenProps {
  exam:    Exam | null
  visible: boolean
  onClose: () => void
}

export function ExamDetailScreen({ exam, visible, onClose }: ExamDetailScreenProps) {
  if (!exam) return null

  const collectedTime = exam.collected.includes('às')
    ? 'às' + exam.collected.split('às')[1]
    : ''
  const collectedDate = exam.fullDate

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent>

      {/* Scrim */}
      <TouchableOpacity
        className="flex-1 bg-black/40"
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Fechar detalhe do exame"
      />

      {/* Sheet panel */}
      <View
        className="bg-white rounded-t-3xl"
        style={{ maxHeight: '88%' }}>

        {/* Drag handle */}
        <View className="pt-3 pb-1 items-center">
          <View className="w-10 h-1.5 rounded-full bg-gray-200" />
        </View>

        <ScrollView
          className="px-6 pt-2"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          bounces={false}>

          {/* Header row */}
          <View className="flex-row items-start justify-between gap-3 mb-4">
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2 mb-1">
                <WStatus status={exam.status} />
                <Text className="text-xs text-gray-400">
                  #{exam.id.toUpperCase()}
                </Text>
              </View>
              <Text className="text-xl font-bold text-slate-800 leading-tight">
                {exam.name}
              </Text>
              <Text className="text-sm text-gray-500 mt-0.5">{exam.fullDate}</Text>
            </View>

            {/* Close button */}
            <TouchableOpacity
              onPress={onClose}
              className="h-10 w-10 rounded-full bg-gray-100 items-center justify-center shrink-0"
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              style={{ minHeight: 44, minWidth: 44 }}>
              <WIcon name="x" className="w-5 h-5" color="#6b7280" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Meta strip — 2-col grid */}
          <View className="bg-slate-50 rounded-2xl p-4 mb-4 gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <MetaItem icon="user-round" label="Médico" value={exam.doctor} sub={exam.crm} />
              </View>
              <View className="flex-1">
                <MetaItem icon="calendar" label="Coleta" value={collectedDate} sub={collectedTime} />
              </View>
            </View>
            <MetaItem icon="map-pin" label="Unidade" value={exam.unit} sub={exam.address} />
          </View>

          {/* Status-dependent content */}
          {exam.status === 'ready' ? (
            <>
              {/* Summary card */}
              <View className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 mb-4 flex-row gap-3">
                <View className="h-9 w-9 rounded-xl bg-white items-center justify-center shrink-0">
                  <WIcon name="sparkles" className="w-5 h-5" color="#2563eb" strokeWidth={2} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">
                    Resumo
                  </Text>
                  <Text className="text-sm text-slate-700 leading-snug">{exam.summary}</Text>
                </View>
              </View>

              {/* Markers panel */}
              {exam.panels.length > 0 && (
                <View className="mb-4">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Principais marcadores
                  </Text>
                  <View className="rounded-2xl border border-gray-100 overflow-hidden">
                    {exam.panels.map((p, i) => (
                      <PanelRow
                        key={p.name}
                        panel={p}
                        isLast={i === exam.panels.length - 1}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* CTA buttons */}
              <TouchableOpacity
                className="w-full bg-blue-600 rounded-xl py-3.5 mt-4 flex-row items-center justify-center gap-2"
                activeOpacity={0.85}
                onPress={() => Alert.alert('Laudo', 'Baixando laudo…')}
                accessibilityRole="button"
                style={{ minHeight: 44 }}>
                <WIcon name="download" className="w-5 h-5" color="#ffffff" strokeWidth={2.2} />
                <Text className="text-white font-medium">Baixar Laudo PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="w-full bg-blue-50 rounded-xl py-3.5 mt-3 flex-row items-center justify-center gap-2"
                activeOpacity={0.85}
                onPress={() => Alert.alert('Laudo', 'Enviado ao médico responsável.')}
                accessibilityRole="button"
                style={{ minHeight: 44 }}>
                <WIcon name="send" className="w-5 h-5" color="#2563eb" strokeWidth={2.2} />
                <Text className="text-blue-600 font-medium">Enviar para o Médico</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="w-full rounded-xl py-3 mt-1 flex-row items-center justify-center gap-2"
                activeOpacity={0.8}
                onPress={onClose}
                accessibilityRole="button">
                <WIcon name="bookmark" className="w-4 h-4" color="#9ca3af" strokeWidth={2} />
                <Text className="text-gray-500 font-medium text-sm">Salvar para depois</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Analyzing state summary */}
              <View className="rounded-2xl border border-yellow-100 bg-yellow-50/60 p-4 mb-4 flex-row gap-3">
                <View className="h-9 w-9 rounded-xl bg-white items-center justify-center shrink-0">
                  <WIcon name="hourglass" className="w-5 h-5" color="#ca8a04" strokeWidth={2} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-yellow-700 mb-0.5">
                    Em análise
                  </Text>
                  <Text className="text-sm text-slate-700 leading-snug">{exam.summary}</Text>
                </View>
              </View>

              <TouchableOpacity
                className="w-full bg-blue-50 rounded-xl py-3.5 mt-2 flex-row items-center justify-center gap-2"
                activeOpacity={0.85}
                onPress={() =>
                  Alert.alert('Notificação', 'Você será avisado quando o resultado estiver pronto.')
                }
                accessibilityRole="button"
                style={{ minHeight: 44 }}>
                <WIcon name="bell-ring" className="w-5 h-5" color="#2563eb" strokeWidth={2.2} />
                <Text className="text-blue-600 font-medium">Avisar quando ficar pronto</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}
