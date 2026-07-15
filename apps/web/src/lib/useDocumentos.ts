import { useCallback, useEffect, useState } from 'react'
import type { Documento, TipoDocumento } from '@lab-hub/shared'
import { api } from './api'

interface UseDocumentos {
  documentos: Documento[]
  loading: boolean
  error: string | null
  reload: () => void
  enviar: (file: File, tipo: TipoDocumento) => Promise<void>
  remover: (id: string) => Promise<void>
  enviando: boolean
  /** Descarta o erro atual. Para telas que exibem a falha por conta própria. */
  limparErro: () => void
}

// Busca os documentos do paciente autenticado (GET /documentos).
//
// Assinatura com primitivos e NÃO com um objeto de escopo (`{ agendamentoId }`):
// um objeto novo a cada render entraria como dep instável no useEffect e o hook
// entraria em loop de fetch.
//
//   useDocumentos()               → todos
//   useDocumentos(agendamentoId)  → os daquela coleta
//   useDocumentos(undefined, true)→ só os perenes (identidade, carteirinha)
export function useDocumentos(agendamentoId?: string, apenasPerenes = false): UseDocumentos {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const querystring = apenasPerenes
    ? '?escopo=perenes'
    : agendamentoId
      ? `?agendamentoId=${agendamentoId}`
      : ''

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get<Documento[]>(`/documentos${querystring}`)
      .then((data) => {
        if (!alive) return
        setDocumentos(data)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar documentos')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [querystring, nonce])

  const enviar = useCallback(
    async (file: File, tipo: TipoDocumento) => {
      setEnviando(true)
      setError(null)
      try {
        const form = new FormData()
        // Campos de texto antes do arquivo: a API bufferiza primeiro e não
        // depende da ordem, mas mandar assim é o caminho previsível.
        form.append('tipo', tipo)
        if (agendamentoId) form.append('agendamentoId', agendamentoId)
        form.append('file', file)

        const novo = await api.upload<Documento>('/documentos', form)
        setDocumentos((prev) => [novo, ...prev])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar documento')
        throw e
      } finally {
        setEnviando(false)
      }
    },
    [agendamentoId],
  )

  // Optimistic removal: some da lista na hora; em caso de falha, recarrega do
  // servidor p/ voltar ao estado correto (mesmo padrão de SchedulePage.handleCancel).
  const remover = useCallback(
    async (id: string) => {
      const anterior = documentos
      setDocumentos((prev) => prev.filter((d) => d.id !== id))
      try {
        await api.del<void>(`/documentos/${id}`)
      } catch (e: unknown) {
        setDocumentos(anterior)
        setError(e instanceof Error ? e.message : 'Falha ao excluir documento')
        reload()
      }
    },
    [documentos, reload],
  )

  const limparErro = useCallback(() => setError(null), [])

  return { documentos, loading, error, reload, enviar, remover, enviando, limparErro }
}
