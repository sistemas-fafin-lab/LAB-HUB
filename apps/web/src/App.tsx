import { useState, useEffect } from 'react'
import { Topbar }      from './components/layout/Topbar'
import { Sidebar }     from './components/layout/Sidebar'
import { SupportDock } from './components/layout/SupportDock'
import { HomePage }        from './pages/HomePage'
import { ResultsPage }     from './pages/ResultsPage'
import { ExamDetailPage }  from './pages/ExamDetailPage'
import { LaudoPage }       from './pages/LaudoPage'
import { SchedulePage }    from './pages/SchedulePage'
import { TrendsPage }      from './pages/TrendsPage'
import { DocumentsPage }   from './pages/DocumentsPage'
import { BillingPage }     from './pages/BillingPage'
import { SettingsPage }    from './pages/SettingsPage'
import { ProfilePage }     from './pages/ProfilePage'
import type { AppRoute, Dependent } from './components/layout/Topbar'
import type { Exam } from './components/shared/WebHero'

// ---------------------------------------------------------------------------
// DEPENDENTS — single source of truth for patient switcher
// (mirrors the DEPENDENTS constant in Topbar.tsx so App.tsx can seed state)
// ---------------------------------------------------------------------------
const DEPENDENTS: Dependent[] = [
  { id: 'p1', name: 'João Madeiro',   relation: 'Você',   initials: 'JM', color: 'from-blue-500 to-indigo-600'   },
  { id: 'p2', name: 'Marina Madeiro', relation: 'Esposa', initials: 'MM', color: 'from-rose-500 to-pink-600'     },
  { id: 'p3', name: 'Tomás Madeiro',  relation: 'Filho',  initials: 'TM', color: 'from-emerald-500 to-teal-600' },
]

// ---------------------------------------------------------------------------
// App — shell that owns all navigation and theme state
// ---------------------------------------------------------------------------
export function App() {
  const [route,    setRoute]    = useState<AppRoute>('home')
  const [openExam, setOpenExam] = useState<Exam | null>(null)
  const [dark,     setDark]     = useState(false)
  const [patient,  setPatient]  = useState<Dependent>(DEPENDENTS[0]!)

  // Re-create Lucide icons after every render (CDN-loaded icons need this)
  useEffect(() => {
    const win = window as Window & typeof globalThis & { lucide?: { createIcons: (opts: object) => void } }
    win.lucide?.createIcons({ attrs: { 'stroke-width': 2 } })
  })

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  const handleNav = (id: AppRoute) => {
    setRoute(id)
    setOpenExam(null)
  }

  const handleOpenExam = (exam: Exam) => {
    setOpenExam(exam)
    setRoute('exam')
  }

  const handleBack = () => {
    setOpenExam(null)
    setRoute('home')
  }

  // ---------------------------------------------------------------------------
  // Route → page
  // ---------------------------------------------------------------------------
  let content: React.ReactNode

  if (route === 'laudo' && openExam !== null) {
    content = <LaudoPage exam={openExam} onBack={handleBack} dark={dark} />
  } else if (openExam !== null) {
    content = (
      <ExamDetailPage
        exam={openExam}
        onBack={handleBack}
        dark={dark}
        onViewLaudo={() => setRoute('laudo')}
      />
    )
  } else if (route === 'results') {
    content = <ResultsPage  dark={dark} onOpenExam={handleOpenExam} />
  } else if (route === 'schedule') {
    content = <SchedulePage  dark={dark} />
  } else if (route === 'trends') {
    content = <TrendsPage    dark={dark} />
  } else if (route === 'documents') {
    content = <DocumentsPage dark={dark} />
  } else if (route === 'billing') {
    content = <BillingPage   dark={dark} />
  } else if (route === 'settings') {
    content = <SettingsPage  dark={dark} />
  } else if (route === 'profile') {
    content = <ProfilePage patient={patient} dark={dark} />
  } else {
    content = <HomePage dark={dark} onOpenExam={handleOpenExam} />
  }

  // ---------------------------------------------------------------------------
  // Shell layout
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`min-h-screen w-full ${dark ? 'bg-gray-950 text-gray-100' : 'bg-slate-50 text-slate-900'}`}
      data-screen-label="01 Lab Hub Web"
    >
      <Topbar
        patient={patient}
        onPickPatient={setPatient}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        route={route}
        onNav={handleNav}
      />
      <div className="flex">
        <Sidebar route={route} onNav={handleNav} dark={dark} />
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {content}
          </div>
        </main>
      </div>
      <SupportDock dark={dark} />
    </div>
  )
}
