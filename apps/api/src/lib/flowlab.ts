import type { AgendamentoPayloadFlowLab, PostoDisponivel } from '@lab-hub/shared'
import { requireEnv } from './env.js'

const BASE = requireEnv('FLOWLAB_EDGE_FUNCTION_URL')
const API_KEY = requireEnv('FLOWLAB_API_KEY')

// Chamada genérica a uma Edge Function do FlowLab (server-to-server).
async function call<T>(fn: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${fn}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      // FLOWLAB_API_KEY — confirmar com o FlowLab se espera também header `apikey`.
      Authorization: `Bearer ${API_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    throw new Error(`FlowLab ${fn}: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export interface ReceiveAgendamentoResposta {
  flowlabId: string // id do agendamento criado no FlowLab
}

export const flowlab = {
  getDisponibilidade: () => call<PostoDisponivel[]>('get-disponibilidade'),

  receiveAgendamento: (payload: AgendamentoPayloadFlowLab) =>
    call<ReceiveAgendamentoResposta>('receive-agendamento', payload),
}
