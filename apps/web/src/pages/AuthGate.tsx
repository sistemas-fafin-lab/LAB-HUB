import { useState } from 'react'
import { LoginPage } from './LoginPage'
import { CadastroPage } from './CadastroPage'

// Tela de entrada para usuários sem sessão: alterna entre login e cadastro.
export function AuthGate() {
  const [view, setView] = useState<'login' | 'cadastro'>('login')

  return view === 'login' ? (
    <LoginPage onGoToCadastro={() => setView('cadastro')} />
  ) : (
    <CadastroPage onGoToLogin={() => setView('login')} />
  )
}
