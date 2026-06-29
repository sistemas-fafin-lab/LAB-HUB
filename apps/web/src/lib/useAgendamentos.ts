import { useCallback, useEffect, useState } from 'react'
import type { Agendamento, AgendamentoStatus } from '@lab-hub/shared'
import { api } from './api'

interface UseAgendamentos {
  agendamentos: Agendamento[]
  loading: boolean
  error: string | null
  reload: () => void
  /** Atualiza o status de um agendamento na lista local (optimistic UI). */
  setStatus: (id: string, status: AgendamentoStatus) => void
}

// Busca os agendamentos do paciente autenticado (GET /agendamentos).
export function useAgendamentos(): UseAgendamentos {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const setStatus = useCallback((id: string, status: AgendamentoStatus) => {
    setAgendamentos((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get<Agendamento[]>('/agendamentos')
      .then((data) => {
        if (!alive) return
        setAgendamentos(data)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar agendamentos')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [nonce])

  return { agendamentos, loading, error, reload, setStatus }
}
