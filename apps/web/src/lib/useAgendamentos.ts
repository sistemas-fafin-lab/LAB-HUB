import type { Agendamento, AgendamentoStatus } from '@lab-hub/shared'
import { api } from './api'
import { criarCacheDeModulo } from './cacheDeModulo'
import { coletasEmAndamento } from './coletas'

interface UseAgendamentos {
  agendamentos: Agendamento[]
  loading: boolean
  error: string | null
  reload: () => void
  /** Atualiza o status de um agendamento na lista local (optimistic UI). */
  setStatus: (id: string, status: AgendamentoStatus) => void
}

// GET /agendamentos num cache de módulo: Visão geral, Minhas coletas, o detalhe
// da coleta e o contador do menu dividem a mesma lista e a mesma requisição.
const cache = criarCacheDeModulo<Agendamento[]>({
  buscar: () => api.get<Agendamento[]>('/agendamentos'),
  vazio: [],
  erroPadrao: 'Erro ao carregar agendamentos',
})

const reload = () => void cache.recarregar()
const setStatus = (id: string, status: AgendamentoStatus) =>
  cache.alterar((lista) => lista.map((a) => (a.id === id ? { ...a, status } : a)))

export function useAgendamentos(): UseAgendamentos {
  const { dado, loading, error } = cache.useEstado()
  return { agendamentos: dado, loading, error, reload, setStatus }
}

/** Coletas em andamento, para o menu; null antes da primeira busca. */
export function useContagemColetasAtivas(): number | null {
  return cache.useDerivado((e) => (e.carregado ? coletasEmAndamento(e.dado).length : null))
}

/** Só para testes: zera o cache entre um caso e outro. */
export const descartarAgendamentos = () => cache.descartar()
