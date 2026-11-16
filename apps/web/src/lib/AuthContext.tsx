import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthValue {
  session: Session | null
  loading: boolean
  /** Sem escopo: encerra a conta em todos os aparelhos (padrão do Supabase). 'local': só esta sessão. */
  signOut: (escopo?: 'local' | 'global') => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Sessão inicial (restaurada do storage) + assina mudanças (login/logout).
    // getSession() pode rejeitar (storage corrompido, JWT inválido); o .catch
    // garante que loading sai de true e a tela não trava em "Carregando…".
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session)
      })
      .catch(() => {
        if (!cancelled) setSession(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!cancelled) setSession(s)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      signOut: async (escopo) => {
        await supabase.auth.signOut(escopo ? { scope: escopo } : undefined)
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
