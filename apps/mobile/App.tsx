import './global.css'
import { useState } from 'react'
import { View, StatusBar } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { MobileHeader } from './src/components/layout/MobileHeader'
import { BottomTabBar, type TabId } from './src/components/layout/BottomTabBar'
import { NotificationsPanel } from './src/components/shared/NotificationsPanel'

import { HomeScreen } from './src/screens/HomeScreen'
import { ResultsScreen } from './src/screens/ResultsScreen'
import { ScheduleScreen } from './src/screens/ScheduleScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import { ExamDetailScreen } from './src/screens/ExamDetailScreen'

import { MOBILE_EXAMS, type Exam } from './src/mocks/exams'

const PATIENT_NAME = 'João'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)

  function handleAction(id: string) {
    if (id === 'results' || id === 'schedule' || id === 'profile') {
      setActiveTab(id as TabId)
    }
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
        <MobileHeader
          patientName={PATIENT_NAME}
          onNotifications={() => setNotifOpen(true)}
        />

        <View className="flex-1">
          {activeTab === 'home' && (
            <HomeScreen
              exams={MOBILE_EXAMS}
              onSelectExam={setSelectedExam}
              heroVariant="premium-dark"
              onAction={handleAction}
            />
          )}

          {activeTab === 'results' && (
            <ResultsScreen
              exams={MOBILE_EXAMS}
              onSelectExam={setSelectedExam}
            />
          )}

          {activeTab === 'schedule' && <ScheduleScreen />}

          {activeTab === 'profile' && (
            <ProfileScreen patientName={PATIENT_NAME} />
          )}
        </View>

        <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
      </SafeAreaView>

      <ExamDetailScreen
        exam={selectedExam}
        visible={selectedExam !== null}
        onClose={() => setSelectedExam(null)}
      />

      <NotificationsPanel
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
      />
    </SafeAreaProvider>
  )
}
