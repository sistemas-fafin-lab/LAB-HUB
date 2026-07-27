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
import { AuthGate }        from './pages/AuthGate'
import { useAuth }         from './lib/AuthContext'
import { usePaciente }     from './lib/usePaciente'
import { iniciais, primeiroNome } from './lib/paciente'
import { MOSTRAR_CHATBOT, rotaOculta } from './lib/flags'
import { track, trackPageview } from './lib/analytics'
import type { AppRoute } from './components/layout/Topbar'
import type { Exam } from './components/shared/WebHero'

// ---------------------------------------------------------------------------
// App — porta de autenticação. Sem sessão, mostra o login; com sessão, monta
// o shell autenticado (que já pode buscar o paciente com segurança).
// ---------------------------------------------------------------------------
export function App() {
  const { session, loading, signOut } = useAuth()

  // Passada única no mount como fallback: cada WIcon já cria o próprio ícone no seu
  // useEffect, então não é preciso re-rodar createIcons a cada render.
  useEffect(() => {
    const win = window as Window & typeof globalThis & { lucide?: { createIcons: (opts: object) => void } }
    win.lucide?.createIcons({ attrs: { 'stroke-width': 2 } })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center text-sm text-slate-400">
        Carregando…
      </div>
    )
  }
  if (session === null) {
    return <AuthGate />
  }

  return <AuthedApp onLogout={signOut} />
}

// ---------------------------------------------------------------------------
// AuthedApp — shell que possui navegação/tema e resolve o paciente real uma
// única vez (GET /pacientes/me), propagando nome/iniciais para a UI.
// ---------------------------------------------------------------------------
interface AuthedAppProps {
  onLogout: () => void | Promise<void>
}

function AuthedApp({ onLogout }: AuthedAppProps) {
  const { paciente, setPaciente } = usePaciente()
  const [route,    setRoute]    = useState<AppRoute>('home')
  const [openExam, setOpenExam] = useState<Exam | null>(null)
  const [coletaId, setColetaId] = useState<string | null>(null)
  const [dark,     setDark]     = useState(false)

  const handleNav = (id: AppRoute) => {
    setRoute(id)
    setOpenExam(null)
    setColetaId(null) // navegação pelo menu limpa a coleta pré-selecionada
  }

  const handleOpenExam = (exam: Exam) => {
    setOpenExam(exam)
    setRoute('exam')
  }

  // Abre a SchedulePage já na linha do tempo de um agendamento específico.
  const handleOpenColeta = (agendamentoId: string) => {
    setColetaId(agendamentoId)
    setOpenExam(null)
    setRoute('schedule')
  }

  // Fechar um exame volta para a lista de Resultados (de onde ele foi aberto).
  // Se a rota estiver oculta por flag, o filtro de rota oculta cai na Visão geral.
  const handleBack = () => {
    setOpenExam(null)
    setRoute('results')
  }

  // Ponto único do tema: o botão da Topbar e as opções em Configurações passam
  // por aqui, então um só track() cobre os dois. Fora do updater do setState —
  // em <StrictMode> o updater roda duas vezes e duplicaria o evento.
  const handleSetDark = (next: boolean) => {
    track('tema_alternado', { modo: next ? 'dark' : 'light' })
    setDark(next)
  }

  const nome = paciente?.nome ?? ''

  // Rotas ocultas por flag não são acessíveis nem por acesso direto: caem na
  // Visão geral. Mantém o que é exibido coerente com o menu.
  const rotaAtual: AppRoute = rotaOculta(route) ? 'home' : route

  // Pageview a cada troca de tela. Derivado de `rotaAtual` (e não de `route`)
  // para registrar a tela realmente exibida depois do filtro de rota oculta.
  // Em dev o <StrictMode> roda o efeito duas vezes e o primeiro pageview sai
  // duplicado; no build de produção isso não acontece.
  useEffect(() => {
    trackPageview(rotaAtual)
  }, [rotaAtual])

  // ---------------------------------------------------------------------------
  // Route → page
  // ---------------------------------------------------------------------------
  let content: React.ReactNode

  if (rotaAtual === 'laudo' && openExam !== null) {
    // Voltar do laudo retorna ao detalhe do exame (um nível acima), não à lista.
    content = <LaudoPage exam={openExam} onBack={() => setRoute('exam')} dark={dark} />
  } else if (openExam !== null) {
    content = (
      <ExamDetailPage
        exam={openExam}
        onBack={handleBack}
        dark={dark}
        onViewLaudo={() => setRoute('laudo')}
      />
    )
  } else if (rotaAtual === 'results') {
    content = <ResultsPage  dark={dark} onOpenExam={handleOpenExam} />
  } else if (rotaAtual === 'schedule') {
    content = <SchedulePage  dark={dark} initialSelectedId={coletaId} />
  } else if (rotaAtual === 'trends') {
    content = <TrendsPage    dark={dark} />
  } else if (rotaAtual === 'documents') {
    content = <DocumentsPage dark={dark} />
  } else if (rotaAtual === 'billing') {
    content = <BillingPage   dark={dark} />
  } else if (rotaAtual === 'settings') {
    content = <SettingsPage  dark={dark} onSetDark={handleSetDark} />
  } else if (rotaAtual === 'profile') {
    content = <ProfilePage paciente={paciente} dark={dark} onLogout={onLogout} onSaved={setPaciente} />
  } else {
    content = (
      <HomePage
        dark={dark}
        onOpenExam={handleOpenExam}
        onOpenColeta={handleOpenColeta}
        onAgendar={() => handleNav('schedule')}
      />
    )
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
        nome={nome}
        iniciais={iniciais(nome)}
        dark={dark}
        onToggleDark={() => handleSetDark(!dark)}
        onOpenExam={handleOpenExam}
        onNav={handleNav}
      />
      <div className="flex">
        <Sidebar route={rotaAtual} onNav={handleNav} dark={dark} />
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {content}
          </div>
        </main>
      </div>
      {/* Chatbot "Lia" — oculto por flag; sem backend de suporte ainda. */}
      {MOSTRAR_CHATBOT && <SupportDock dark={dark} primeiroNome={primeiroNome(nome)} />}
    </div>
  )
}
