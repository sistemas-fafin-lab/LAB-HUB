import { useEffect, useState } from 'react'
import type { Paciente } from '@lab-hub/shared'
import { api } from './api'

interface UsePaciente {
  paciente: Paciente | null
  loading: boolean
  error: string | null
}

// Busca os dados do paciente autenticado (GET /pacientes/me).
export function usePaciente(): UsePaciente {
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get<Paciente>('/pacientes/me')
      .then((data) => {
        if (!alive) return
        setPaciente(data)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar perfil')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { paciente, loading, error }
}
