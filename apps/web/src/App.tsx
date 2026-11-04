import { useEffect, useRef, useState } from 'react'
import { Shell }       from './components/shell/Shell'
import { itemDaRota }  from './components/shell/menu'
import { Node }        from './components/portal'
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
import { rotaOculta } from './lib/flags'
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
  modoDaEntrada,
  caminhoDaColeta,
  caminhoDoExame,
  caminhoDoLaudo,
  resolveRota,
} from './lib/rotas'
import type { Rota } from './lib/rotas'
import { lerTema, salvarTema } from './lib/tema'
import type { Exam } from './components/shared/WebHero'

// Logout feito nesta aba. Enquanto vale, a entrada não guarda `next`: o
// voltar do navegador leva às telas de quem saiu, e quem entrar em seguida
// (talvez outra pessoa) não deve cair nelas. Sessão que expira sozinha não
// marca isto — aí voltar à tela após o login é justamente o desejado.
let saiuNestaAba = false

/**
 * Entrada para quem está sem sessão em `rota`: com `next` para voltar a ela
 * depois do login — menos da Visão geral (é o destino padrão) e depois de um
 * logout nesta aba (ver `saiuNestaAba`).
 */
function entradaPara(rota: string): string {
  const semNext = rota === CAMINHO_DA_TELA.home || saiuNestaAba
  return semNext ? CAMINHO_ENTRAR : `${CAMINHO_ENTRAR}?next=${encodeURIComponent(rota)}`
}

// Telas já no visual novo: montadas direto na raiz `.lh-v2` do shell. As
// demais ganham o invólucro `.lh-legado`, que devolve a fonte, a cor e os links
// do visual antigo (ver styles/lh/tema.css). Cada PR de tela entra aqui.
const TELAS_V2: ReadonlySet<Rota['tela']> = new Set(['home', 'results', 'exam', 'laudo', 'schedule', 'documents'])

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
    if (naEntrada) return <AuthGate comSessao={false} />
    return <Redireciona para={entradaPara(local.pathname + local.search)} />
  }
  if (naEntrada) {
    // O link de recuperação do e-mail chega já com sessão (o Supabase o troca
    // por uma): a nova senha é a única tela da entrada que se usa logado.
    if (modoDaEntrada(local.search) === 'nova-senha') return <AuthGate comSessao />
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

  // Sessão recusada pela API (401): sai SEM marcar `saiuNestaAba`, para o
  // login devolver o paciente à tela onde a sessão caiu.
  const handleSessaoExpirada = async () => {
    const destino = entradaPara(local.pathname + local.search)
    try {
      await signOut()
    } finally {
      navegar(destino, { substituir: true })
    }
  }

  return <AuthedApp local={local} onLogout={handleLogout} onSessaoExpirada={handleSessaoExpirada} />
}

// ---------------------------------------------------------------------------
// AuthedApp — shell que possui tema e resolve o paciente real uma única vez
// (GET /pacientes/me), propagando nome/iniciais para a UI. A tela exibida
// deriva só da URL.
// ---------------------------------------------------------------------------
interface AuthedAppProps {
  local: Local
  onLogout: () => void | Promise<void>
  onSessaoExpirada: () => void | Promise<void>
}

function AuthedApp({ local, onLogout, onSessaoExpirada }: AuthedAppProps) {
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

  const handleOpenExam = (exam: Exam) => {
    examesAbertos.current.set(exam.id, exam)
    navegar(caminhoDoExame(exam.id))
  }

  // Ponto único do tema: o botão do cabeçalho e as opções em Configurações passam
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

  if (redireciona !== null) {
    content = <Redireciona para={redireciona} />
  } else if (idExame !== null) {
    if (exam === null) {
      content = !exameInexistente ? (
        <div role="status" className="py-16 flex flex-col items-center gap-3 text-[14px] text-muted">
          <Node loading size={40} />
          Carregando exame…
        </div>
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
      content = <LaudoPage exam={exam} onBack={() => navegar(caminhoDoExame(exam.id))} />
    } else {
      content = (
        <ExamDetailPage
          exam={exam}
          // Fechar um exame volta para a lista de Resultados (de onde ele foi aberto).
          onBack={() => navegar(CAMINHO_DA_TELA.results)}
          onViewLaudo={() => navegar(caminhoDoLaudo(exam.id))}
        />
      )
    }
  } else if (rota.tela === 'results') {
    content = <ResultsPage onOpenExam={handleOpenExam} onAgendar={() => navegar(caminhoDaAba('agendar'))} paciente={paciente} />
  } else if (rota.tela === 'schedule') {
    content = (
      <SchedulePage
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
    content = <DocumentsPage />
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
        nome={nome}
        onOpenExam={handleOpenExam}
        onOpenColeta={(id) => navegar(caminhoDaColeta(id))}
        onAgendar={() => navegar(caminhoDaAba('agendar'))}
        onVerColetas={() => navegar(caminhoDaAba('minhas'))}
        onVerResultados={() => navegar(CAMINHO_DA_TELA.results)}
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Shell layout
  // ---------------------------------------------------------------------------
  // A animação de entrada reinicia por TELA, não por URL: trocar de aba em
  // Agendas/Coletas não pode desmontar a tela (e perder o agendamento em curso).
  const chaveDaPagina = rota.tela + (idExame !== null ? `:${idExame}` : '')
  return (
    <Shell
      nome={nome}
      ativo={itemDaRota(rota)}
      href={href}
      chaveDaPagina={chaveDaPagina}
      dark={dark}
      onToggleDark={() => handleSetDark(!dark)}
      onOpenExam={handleOpenExam}
      onLogout={onLogout}
      onSessaoExpirada={onSessaoExpirada}
    >
      {/* O "exame não encontrado" é a 404 antiga até a issue 13. */}
      {TELAS_V2.has(rota.tela) && !exameInexistente ? (
        content
      ) : (
        <div className="lh-legado font-sans subpixel-antialiased text-slate-900 dark:text-gray-100">{content}</div>
      )}
    </Shell>
  )
}
