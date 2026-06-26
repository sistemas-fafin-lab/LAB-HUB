import { useEffect, useState } from 'react'
import type { Agendamento } from '@lab-hub/shared'
import { api } from './api'

interface UseAgendamentos {
  agendamentos: Agendamento[]
  loading: boolean
  error: string | null
}

// Busca os agendamentos do paciente autenticado (GET /agendamentos).
export function useAgendamentos(): UseAgendamentos {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [])

  return { agendamentos, loading, error }
}
