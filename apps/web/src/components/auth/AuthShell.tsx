import type { ReactNode } from 'react'
import { WIcon } from '../primitives/WIcon'

interface AuthShellProps {
  dark: boolean
  onToggleDark: () => void
  children: ReactNode
}

// Destaques do painel da marca. Texto conservador de propósito: só promete o
// que o app entrega hoje (nada de multi-perfil, prazo de laudo ou certificação).
const DESTAQUES = [
  { icone: 'lock', texto: 'Dados protegidos e criptografados' },
  { icone: 'activity', texto: 'Acompanhe o status em tempo real' },
  { icone: 'history', texto: 'Histórico completo dos exames' },
] as const

// Inter é a fonte da marca e já vem do Google Fonts. Fica escopada ao auth (em
// vez de virar o `sans` global) para não mudar a tipografia do app inteiro.
const FONTE_AUTH = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif"

// ---------------------------------------------------------------------------
// AuthShell — cromo das telas sem sessão: painel da marca à esquerda (só em
// telas grandes) e a coluna do formulário à direita. O conteúdo do card vem
// por children, então login, cadastro e confirmação de e-mail compartilham a
// mesma moldura.
// ---------------------------------------------------------------------------
export function AuthShell({ dark, onToggleDark, children }: AuthShellProps) {
  return (
    <div
      className="min-h-screen w-full flex bg-slate-50 dark:bg-gray-900 transition-colors"
      style={{ fontFamily: FONTE_AUTH }}
      data-screen-label="01 Auth"
    >
      {/* Painel da marca — sai de cena abaixo de lg para o formulário ocupar a tela toda */}
      <div className="hidden lg:flex relative flex-1 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 overflow-hidden">
        {/* Orbs desfocados: decoração pura, invisível para leitores de tela */}
        <div aria-hidden className="orb1 absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-400/30 blur-3xl" />
        <div aria-hidden className="orb2 absolute bottom-0 -right-20 w-[28rem] h-[28rem] rounded-full bg-indigo-500/30 blur-3xl" />
        <div aria-hidden className="orb1 absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <img src="/logo-white.svg" alt="Lab Hub" className="h-9 w-auto self-start" />

          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Plataforma do paciente
            </div>

            <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight tracking-tight mb-4">
              Seus resultados na palma da mão.
            </h1>
            <p className="text-blue-100/90 text-base leading-relaxed mb-8">
              Acesse exames, agende coletas e compartilhe laudos com seu médico — com a segurança de
              um laboratório clínico de referência.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {DESTAQUES.map((d) => (
                <div key={d.texto} className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-3.5">
                  <span className="text-blue-200 inline-flex mb-2">
                    <WIcon name={d.icone} className="w-4 h-4" />
                  </span>
                  <div className="text-[11px] text-blue-100 leading-tight">{d.texto}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-blue-200/80">© 2026 Lab Hub Diagnósticos</p>
        </div>
      </div>

      {/* Coluna do formulário */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 relative">
        <button
          type="button"
          onClick={onToggleDark}
          aria-label={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          className="absolute top-5 right-5 h-10 w-10 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 flex items-center justify-center shadow-sm hover:shadow-md transition"
        >
          <WIcon name={dark ? 'sun' : 'moon'} className="w-4 h-4" />
        </button>

        <div className="w-full max-w-md mx-auto">
          {/* Logo só no mobile: no desktop ela já está no painel da marca */}
          <div className="lg:hidden flex justify-center mb-6">
            <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Lab Hub" className="h-9 w-auto" />
          </div>

          <div className="p-6 sm:p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-black/40 border border-slate-100 dark:border-gray-700">
            {children}
          </div>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6 inline-flex items-center justify-center gap-1.5 w-full">
            <WIcon name="shield" className="w-3.5 h-3.5" />
            Conexão segura · Conformidade com a LGPD
          </p>
        </div>
      </div>
    </div>
  )
}
