import type { AgendamentoPayloadFlowLab, PostoDisponivel } from '@lab-hub/shared'
import { requireEnv } from './env.js'

const BASE = requireEnv('FLOWLAB_EDGE_FUNCTION_URL')
const API_KEY = requireEnv('FLOWLAB_API_KEY')
// Timeout das chamadas ao FlowLab: sem ele, uma função lenta/travada segura o
// POST /agendamentos indefinidamente. Configurável via FLOWLAB_TIMEOUT_MS.
// Guard: valor vazio/inválido cairia em 0 (aborta na hora) ou NaN — usa 8000.
const parsedTimeout = Number(process.env.FLOWLAB_TIMEOUT_MS)
const TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 8000

// Chamada genérica a uma Edge Function do FlowLab (server-to-server).
async function call<T>(fn: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/${fn}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        // FLOWLAB_API_KEY — confirmar com o FlowLab se espera também header `apikey`.
        Authorization: `Bearer ${API_KEY}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // AbortSignal.timeout dispara um TimeoutError ao estourar o prazo.
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`FlowLab ${fn}: timeout após ${TIMEOUT_MS}ms`)
    }
    throw err
  }
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
