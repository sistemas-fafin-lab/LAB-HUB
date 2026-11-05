import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MOSTRAR_CHATBOT } from '../../lib/flags'
import { iniciais, primeiroNome } from '../../lib/paciente'
import { aoExpirarSessao } from '../../lib/sessao'
import { useOnline } from '../../lib/useConexao'
import { Btn, Ico, Modal } from '../portal'
import type { Exam } from '../../lib/exame'
import { Avisos } from './Avisos'
import { Cabecalho } from './Cabecalho'
import { Gaveta, NavLista } from './Navegacao'
import { Suporte } from './Suporte'
import type { ItemMenu } from './menu'

// ---------------------------------------------------------------------------
// Shell do portal v2: cabeçalho, navegação (barra lateral a partir de 1024 px,
// gaveta abaixo), busca, suporte, avisos, barra de troca de página, faixa sem
// conexão e caixa de sessão expirada.
// ---------------------------------------------------------------------------

export interface ShellProps {
  /** Nome do paciente da sessão (usePaciente); vazio enquanto carrega. */
  nome: string
  ativo: ItemMenu | null
  /** Muda a cada URL: dispara a barra de progresso e fecha a gaveta. */
  href: string
  /** Muda a cada TELA (não a cada URL): reanima a entrada da página. */
  chaveDaPagina: string
  dark: boolean
  onToggleDark: () => void
  onOpenExam: (exam: Exam) => void
  onLogout: () => void | Promise<void>
  onSessaoExpirada: () => void | Promise<void>
  children: ReactNode
}

export function Shell({
  nome,
  ativo,
  href,
  chaveDaPagina,
  dark,
  onToggleDark,
  onOpenExam,
  onLogout,
  onSessaoExpirada,
  children,
}: ShellProps) {
  const [gaveta, setGaveta] = useState(false)
  const fechaGaveta = useCallback(() => setGaveta(false), [])
  const [sessaoExpirou, setSessaoExpirou] = useState(false)
  const online = useOnline()

  // Qualquer 401 do cliente `api` abre a caixa (uma só, por mais 401 que venham).
  useEffect(() => aoExpirarSessao(() => setSessaoExpirou(true)), [])

  // Barra de 2 px a cada troca de URL (não no primeiro render) e gaveta fechada.
  const [progresso, setProgresso] = useState(0)
  const primeiraUrl = useRef(true)
  useEffect(() => {
    setGaveta(false)
    if (primeiraUrl.current) {
      primeiraUrl.current = false
      return
    }
    setProgresso((p) => p + 1)
  }, [href])

  return (
    <div className="min-h-screen w-full" data-screen-label="01 Lab Hub Web">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-card focus:px-3 focus:py-2 focus:rounded-lg"
        onClick={(e) => {
          // O router não intercepta âncora da mesma página, mas o foco precisa ir junto.
          e.preventDefault()
          document.getElementById('conteudo')?.focus()
        }}
      >
        Ir para o conteúdo
      </a>
      {progresso > 0 && <div key={progresso} className="lh-progress lh-noprint" aria-hidden="true" />}
      <Cabecalho
        nome={nome}
        iniciais={iniciais(nome)}
        dark={dark}
        onToggleDark={onToggleDark}
        onOpenExam={onOpenExam}
        onAbrirMenu={() => setGaveta(true)}
        onLogout={onLogout}
      />
      {!online && (
        <div className="lh-banner bg-subtle text-ink border-b border-line" role="status">
          <div className="px-4 md:px-6 py-2 flex items-center gap-3 text-[13px]">
            <Ico name="wifi-off" size={16} />
            <span className="flex-1">Você está sem conexão. Confira sua internet para continuar usando o portal.</span>
          </div>
        </div>
      )}
      <div className="flex">
        <aside className="lh-side hidden lg:block w-60 shrink-0 bg-card border-r border-line sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto p-3">
          <NavLista ativo={ativo} />
        </aside>
        <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 outline-none">
          <div className="max-w-7xl mx-auto lh-page" key={chaveDaPagina}>
            {children}
          </div>
        </main>
      </div>
      {/* Chatbot "Lia" — oculto por flag; sem backend de suporte ainda. */}
      {MOSTRAR_CHATBOT && <Suporte primeiroNome={primeiroNome(nome)} />}
      <Gaveta aberta={gaveta} onFechar={fechaGaveta} ativo={ativo} dark={dark} />
      <Avisos />
      <Modal
        open={sessaoExpirou}
        // Fechar (Esc, fundo, X) também leva ao login: com o token recusado, ficar
        // na tela só mostraria erros.
        onClose={() => {
          setSessaoExpirou(false)
          void onSessaoExpirada()
        }}
        title="Sua sessão expirou"
        description="Por segurança, entre novamente para continuar de onde parou."
        footer={
          <Btn
            onClick={() => {
              setSessaoExpirou(false)
              void onSessaoExpirada()
            }}
          >
            Entrar novamente
          </Btn>
        }
      />
    </div>
  )
}
