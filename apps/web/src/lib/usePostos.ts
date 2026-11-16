import type { PostoDisponivel } from '@lab-hub/shared'
import { api } from './api'
import { criarCacheDeModulo } from './cacheDeModulo'

// GET /postos/disponibilidade num cache de módulo: o agendamento (horários),
// a próxima coleta e o detalhe (endereço e "Como chegar") leem daqui, com uma
// requisição por sessão. `recarregar` força a revalidação.
const cache = criarCacheDeModulo<PostoDisponivel[]>({
  buscar: () => api.get<PostoDisponivel[]>('/postos/disponibilidade'),
  vazio: [],
  erroPadrao: 'Erro ao carregar disponibilidade',
})

export const usePostos = cache.useEstado
export const recarregarPostos = () => cache.recarregar()
export const alterarPostos = cache.alterar

export interface LocalDoPosto {
  nome: string
  endereco: string
}

/** postoFlowlabId → nome e endereço da unidade. */
export function useLocaisDosPostos(): ReadonlyMap<string, LocalDoPosto> {
  const { dado } = cache.useEstado()
  return new Map(dado.map((p) => [p.id, { nome: p.nome, endereco: p.endereco }]))
}

/** Link do Google Maps para a unidade; sem endereço, procura pelo nome do laboratório. */
export function linkComoChegar(nome: string, endereco: string | undefined): string {
  const busca = endereco ? `${nome}, ${endereco}` : `LAB Medicina Diagnóstica ${nome}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`
}

/** Só para testes. */
export const descartarPostos = () => cache.descartar()
