import { useEffect, useState } from 'react'
import type { Resultado } from '@lab-hub/shared'
import { api } from './api'
import { resultadoToExam } from './mappers'
import type { Exam } from '../components/shared/WebHero'

interface UseResultados {
  exams: Exam[]
  loading: boolean
  error: string | null
}

// Busca os resultados do paciente autenticado e os mapeia para o tipo da UI.
export function useResultados(): UseResultados {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get<Resultado[]>('/resultados')
      .then((data) => {
        if (!alive) return
        setExams(data.map(resultadoToExam))
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar resultados')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { exams, loading, error }
}
