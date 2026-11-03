import { useEffect, useRef, useState } from 'react'
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
import { NotFoundPage }    from './pages/NotFoundPage'
import { useAuth }         from './lib/AuthContext'
import { usePaciente }     from './lib/usePaciente'
import { useResultados }   from './lib/useResultados'
import { iniciais, primeiroNome } from './lib/paciente'
import { MOSTRAR_CHATBOT, rotaOculta } from './lib/flags'
import { track, trackPageview } from './lib/analytics'
import type { TelaPageview } from './lib/analytics'
import { Redireciona, navegar, useInterceptaLinks, useLocal } from './lib/router'
import type { Local } from './lib/router'
import {
  CAMINHO_DA_TELA,
  CAMINHO_ENTRAR,
  caminhoDaAba,
  caminhoInterno,
  ehEntrada,
  caminhoDaColeta,
  caminhoDoExame,
  caminhoDoLaudo,
  resolveRota,
} from './lib/rotas'
import { lerTema, salvarTema } from './lib/tema'
import type { AppRoute } from './components/layout/Topbar'
import type { Exam } from './components/shared/WebHero'

// Logout feito nesta aba. Enquanto vale, a entrada não guarda `next`: o
// voltar do navegador leva às telas de quem saiu, e quem entrar em seguida
// (talvez outra pessoa) não deve cair nelas. Sessão que expira sozinha não
// marca isto — aí voltar à tela após o login é justamente o desejado.
let saiuNestaAba = false

// ---------------------------------------------------------------------------
// App — porta de autenticação sobre a URL. Sem sessão, qualquer rota vai para
// /entrar?next=<rota>; com sessão, /entrar devolve ao `next` (só caminhos
// internos) e o resto monta o shell autenticado.
// ---------------------------------------------------------------------------
export function App() {
  const { session, loading, signOut } = useAuth()
  const local = useLocal()
  useInterceptaLinks()

  // Segue o tema salvo (a classe `dark` já foi aplicada em main.tsx) para quem
  // usa o modo escuro não tomar um flash branco enquanto a sessão carrega.
  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 dark:bg-gray-950 flex items-center justify-center text-sm text-slate-400 dark:text-gray-500">
        Carregando…
      </div>
    )
  }

  const naEntrada = ehEntrada(local.pathname)
  if (session === null) {
    if (naEntrada) return <AuthGate />
    const rota = local.pathname + local.search
    const semNext = rota === CAMINHO_DA_TELA.home || saiuNestaAba
    const destino = semNext ? CAMINHO_ENTRAR : `${CAMINHO_ENTRAR}?next=${encodeURIComponent(rota)}`
    return <Redireciona para={destino} />
  }
  if (naEntrada) {
    const next = new URLSearchParams(local.search).get('next')
    return <Redireciona para={caminhoInterno(next) ?? CAMINHO_DA_TELA.home} />
  }
  saiuNestaAba = false

  // Sair leva à entrada sem `next`: quem entrar em seguida (talvez outra
  // pessoa, na mesma aba) começa pela Visão geral, não no Perfil de quem saiu.
  const handleLogout = async () => {
    saiuNestaAba = true
    await signOut()
    navegar(CAMINHO_ENTRAR, { substituir: true })
  }

  return <AuthedApp local={local} onLogout={handleLogout} />
}

// ---------------------------------------------------------------------------
// AuthedApp — shell que possui tema e resolve o paciente real uma única vez
// (GET /pacientes/me), propagando nome/iniciais para a UI. A tela exibida
// deriva só da URL.
// ---------------------------------------------------------------------------
interface AuthedAppProps {
  local: Local
  onLogout: () => void | Promise<void>
}

function AuthedApp({ local, onLogout }: AuthedAppProps) {
  const { paciente, setPaciente } = usePaciente()
  const { exams, loading: carregandoExames } = useResultados()
  const [dark, setDark] = useState(lerTema)

  // Exames abertos por clique, guardados em memória por id. A consulta
  // administrativa por CPF abre exames de OUTRO paciente, que não estão em
  // useResultados — sem isto, /exame/:id (inclusive pelo voltar) não os
  // acharia. Fica num ref (e não no history.state nem em storage) de
  // propósito: dado de outro paciente não sobrevive a recarregar a página, e
  // some junto com o shell no logout.
  const examesAbertos = useRef(new Map<string, Exam>())

  const handleNav = (id: AppRoute) => navegar(CAMINHO_DA_TELA[id])

  const handleOpenExam = (exam: Exam) => {
    examesAbertos.current.set(exam.id, exam)
    navegar(caminhoDoExame(exam.id))
  }

  // Ponto único do tema: o botão da Topbar e as opções em Configurações passam
  // por aqui, então um só track() cobre os dois. Fora do updater do setState —
  // em <StrictMode> o updater roda duas vezes e duplicaria o evento.
  const handleSetDark = (next: boolean) => {
    track('tema_alternado', { modo: next ? 'dark' : 'light' })
    salvarTema(next) // sobrevive ao reload e vale também para as telas de auth
    setDark(next)
  }

  const nome = paciente?.nome ?? ''
  const rota = resolveRota(local.pathname)

  // Exame da rota: a lista da conta primeiro (a versão mais nova), o aberto em
  // memória depois (consulta administrativa).
  const idExame = rota.tela === 'exam' || rota.tela === 'laudo' ? rota.id : null
  const exam =
    idExame === null
      ? null
      : (exams.find((e) => e.id === idExame) ?? examesAbertos.current.get(idExame) ?? null)
  const exameInexistente = idExame !== null && exam === null && !carregandoExames

  // Para onde redirecionar em vez de mostrar a rota, ou null.
  //  - Rotas ocultas por flag não são acessíveis nem por acesso direto: caem
  //    na Visão geral, coerente com o menu.
  //  - O laudo monta o documento com a identidade da SESSÃO (usePaciente); o
  //    de um exame da consulta administrativa sairia com o nome de outra
  //    pessoa. A tela de detalhe já esconde o botão; aqui fecha o acesso direto.
  let redireciona: string | null = null
  if (rota.tela !== 'nao-encontrada' && rotaOculta(rota.tela)) redireciona = CAMINHO_DA_TELA.home
  else if (rota.tela === 'laudo' && exam?.somenteLeituraAdmin === true) redireciona = caminhoDoExame(rota.id)

  // Pageview uma vez por mudança de URL, com o nome da tela (nunca o id — ver
  // lib/analytics.ts). Redirecionamento não conta: a URL de destino conta.
  // Exame ainda carregando também espera, para não registrar uma tela que
  // pode virar "não encontrado"; o que não existe conta como 404.
  // Em dev o <StrictMode> roda o efeito duas vezes e o primeiro pageview sai
  // duplicado; no build de produção isso não acontece.
  const href = local.pathname + local.search
  const telaPageview: TelaPageview | null =
    redireciona !== null || (idExame !== null && exam === null && !exameInexistente)
      ? null
      : exameInexistente
        ? 'nao-encontrada'
        : rota.tela
  useEffect(() => {
    if (telaPageview !== null) trackPageview(telaPageview)
  }, [href, telaPageview])

  // ---------------------------------------------------------------------------
  // Route → page
  // ---------------------------------------------------------------------------
  let content: React.ReactNode
  const telaDoMenu: AppRoute | null = rota.tela === 'nao-encontrada' ? null : rota.tela

  if (redireciona !== null) {
    content = <Redireciona para={redireciona} />
  } else if (idExame !== null) {
    if (exam === null) {
      content = !exameInexistente ? (
        <div className="py-16 text-center text-sm text-gray-500">Carregando exame…</div>
      ) : (
        <NotFoundPage
          dark={dark}
          titulo="Exame não encontrado"
          descricao="Este exame não está mais disponível neste endereço. Abra-o de novo pela lista de resultados."
          voltarPara={CAMINHO_DA_TELA.results}
          voltarRotulo="Voltar para resultados"
        />
      )
    } else if (rota.tela === 'laudo') {
      // Voltar do laudo retorna ao detalhe do exame (um nível acima), não à lista.
      content = <LaudoPage exam={exam} onBack={() => navegar(caminhoDoExame(exam.id))} dark={dark} />
    } else {
      content = (
        <ExamDetailPage
          exam={exam}
          // Fechar um exame volta para a lista de Resultados (de onde ele foi aberto).
          onBack={() => navegar(CAMINHO_DA_TELA.results)}
          dark={dark}
          onViewLaudo={() => navegar(caminhoDoLaudo(exam.id))}
        />
      )
    }
  } else if (rota.tela === 'results') {
    content = <ResultsPage  dark={dark} onOpenExam={handleOpenExam} paciente={paciente} />
  } else if (rota.tela === 'schedule') {
    content = (
      <SchedulePage
        dark={dark}
        aba={rota.aba}
        selectedId={rota.coletaId}
        onAba={(aba) => navegar(caminhoDaAba(aba))}
        onAbrirColeta={(id) => navegar(caminhoDaColeta(id))}
        onFecharColeta={() => navegar(caminhoDaAba('minhas'))}
      />
    )
  } else if (rota.tela === 'trends') {
    content = <TrendsPage    dark={dark} />
  } else if (rota.tela === 'documents') {
    content = <DocumentsPage dark={dark} />
  } else if (rota.tela === 'billing') {
    content = <BillingPage   dark={dark} />
  } else if (rota.tela === 'settings') {
    content = <SettingsPage  dark={dark} onSetDark={handleSetDark} />
  } else if (rota.tela === 'profile') {
    content = <ProfilePage paciente={paciente} dark={dark} onLogout={onLogout} onSaved={setPaciente} />
  } else if (rota.tela === 'nao-encontrada') {
    content = <NotFoundPage dark={dark} />
  } else {
    content = (
      <HomePage
        dark={dark}
        onOpenExam={handleOpenExam}
        onOpenColeta={(id) => navegar(caminhoDaColeta(id))}
        onAgendar={() => navegar(CAMINHO_DA_TELA.schedule)}
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
        <Sidebar route={telaDoMenu} onNav={handleNav} dark={dark} />
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
