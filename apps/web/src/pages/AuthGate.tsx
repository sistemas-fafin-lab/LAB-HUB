import { useState } from 'react'
import { LoginPage } from './LoginPage'
import { CadastroPage } from './CadastroPage'
import { AuthShell } from '../components/auth/AuthShell'
import { AuthTabs } from '../components/auth/AuthTabs'
import type { AuthView } from '../components/auth/AuthTabs'
import { WIcon } from '../components/primitives/WIcon'
import { track } from '../lib/analytics'
import { lerTema, salvarTema } from '../lib/tema'

// ---------------------------------------------------------------------------
// AuthGate — tela de entrada para usuários sem sessão. Detém a view, o tema e
// o estado de "aguardando confirmação de e-mail"; login e cadastro cuidam só
// dos próprios formulários.
// ---------------------------------------------------------------------------
export function AuthGate() {
  const [view, setView] = useState<AuthView>('login')
  const [dark, setDark] = useState(lerTema)
  // E-mail da conta recém-criada que ainda precisa ser confirmado.
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null)

  // Mesmo evento e payload usados pelo toggle da Topbar (App.tsx).
  const handleToggleDark = () => {
    const next = !dark
    track('tema_alternado', { modo: next ? 'dark' : 'light' })
    salvarTema(next)
    setDark(next)
  }

  return (
    <AuthShell dark={dark} onToggleDark={handleToggleDark}>
      {emailEnviado !== null ? (
        <ConfirmacaoEmail
          email={emailEnviado}
          onVoltarAoLogin={() => {
            setEmailEnviado(null)
            setView('login')
          }}
        />
      ) : (
        <>
          <Cabecalho view={view} />
          <AuthTabs view={view} onChange={setView} />
          {view === 'login' ? (
            <LoginPage />
          ) : (
            <CadastroPage onEmailSent={setEmailEnviado} />
          )}
        </>
      )}
    </AuthShell>
  )
}

function Cabecalho({ view }: { view: AuthView }) {
  const login = view === 'login'
  return (
    <div className="text-center mb-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1.5 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
        {login ? 'Bem-vindo de volta' : 'Crie sua conta'}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {login ? 'Acesse seus exames com segurança' : 'Em menos de 1 minuto você está pronto'}
      </p>
    </div>
  )
}

interface ConfirmacaoEmailProps {
  email: string
  onVoltarAoLogin: () => void
}

// Substitui o card inteiro (inclusive as abas): nesse ponto não há mais o que
// preencher, só confirmar o e-mail.
function ConfirmacaoEmail({ email, onVoltarAoLogin }: ConfirmacaoEmailProps) {
  return (
    <div className="text-center">
      <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
        <WIcon name="mail-check" className="w-6 h-6" strokeWidth={2.2} />
      </div>
      <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-gray-100 mb-1.5">
        Confirme seu e-mail
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Enviamos um link de confirmação para{' '}
        <strong className="text-slate-700 dark:text-gray-200">{email}</strong>. Confirme para
        acessar o portal.
      </p>
      <button
        type="button"
        onClick={onVoltarAoLogin}
        className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-xl active:scale-[0.98]"
      >
        Ir para o login
      </button>
    </div>
  )
}
