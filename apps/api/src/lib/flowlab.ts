import type { AgendamentoPayloadFlowLab, CancelamentoPayloadFlowLab, PostoDisponivel } from '@lab-hub/shared'
import { numeroEnv, requireEnv } from './env.js'

const BASE = requireEnv('FLOWLAB_EDGE_FUNCTION_URL')
const API_KEY = requireEnv('FLOWLAB_API_KEY')
// Timeout das chamadas ao FlowLab: sem ele, uma função lenta/travada segura o
// POST /agendamentos indefinidamente. Mínimo 1 — zero abortaria na hora.
const TIMEOUT_MS = numeroEnv('FLOWLAB_TIMEOUT_MS', 8000, 1)

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
      throw new Error(`FlowLab ${fn}: timeout após ${TIMEOUT_MS}ms`, { cause: err })
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

export interface ReceiveCancelamentoResposta {
  flowlabId?: string // id do agendamento no FlowLab (ausente se nunca sincronizado)
  status?: string // 'cancelado' | 'nao_encontrado'
  idempotency?: string
}

export interface NotifyDocumentoPayload {
  labhubId: string // id do agendamento no LAB-HUB (= ac_agendamentos.labhub_id no FlowLab)
  tipo: string // tipo do documento (o FlowLab só age no pedido médico)
}

export interface NotifyDocumentoResposta {
  ok?: boolean
  ignored?: string // 'agendamento_nao_sincronizado' quando o FlowLab ainda não tem o agendamento
}

// Cache em memória da disponibilidade, com TTL curto (configurável via
// FLOWLAB_DISPONIBILIDADE_TTL_MS; default 30s). Serve só à LEITURA de exibição
// (GET /postos/disponibilidade), para evitar o cold start da Edge Function a
// cada acesso. O fluxo de criação de agendamento NÃO usa este cache: valida o
// slot ao vivo via getDisponibilidade(), então o cache nunca causa agendamento
// duplo — no pior caso, exibe um horário recém-tomado até o TTL expirar.
// Mínimo 0: zero é legítimo aqui — desliga o cache sem quebrar nada.
const DISP_TTL_MS = numeroEnv('FLOWLAB_DISPONIBILIDADE_TTL_MS', 30_000)

let dispCache: { expiraEm: number; data: PostoDisponivel[] } | null = null
let dispInFlight: Promise<PostoDisponivel[]> | null = null // coalesce de misses concorrentes

async function getDisponibilidadeCacheada(): Promise<PostoDisponivel[]> {
  if (dispCache && dispCache.expiraEm > Date.now()) return dispCache.data
  // Já há uma busca em andamento: reaproveita (evita estouro de chamadas no miss).
  if (dispInFlight) return dispInFlight
  dispInFlight = call<PostoDisponivel[]>('get-disponibilidade')
    .then((data) => {
      dispCache = { expiraEm: Date.now() + DISP_TTL_MS, data }
      return data
    })
    .finally(() => {
      dispInFlight = null
    })
  return dispInFlight
}

// Descarta o cache — chamar após criar um agendamento, pois o slot reservado
// deixa de estar disponível.
function invalidarDisponibilidade(): void {
  dispCache = null
}

export const flowlab = {
  // Leitura ao vivo (usada na validação do agendamento).
  getDisponibilidade: () => call<PostoDisponivel[]>('get-disponibilidade'),

  // Leitura com cache de TTL curto (usada só para exibição).
  getDisponibilidadeCacheada,
  invalidarDisponibilidade,

  receiveAgendamento: (payload: AgendamentoPayloadFlowLab) =>
    call<ReceiveAgendamentoResposta>('receive-agendamento', payload),

  // Propaga o cancelamento ao FlowLab (libera o slot). Idempotente do lado de lá.
  receiveCancelamento: (payload: CancelamentoPayloadFlowLab) =>
    call<ReceiveCancelamentoResposta>('receive-cancelamento', payload),

  // Avisa que um pedido médico foi anexado — o FlowLab enfileira a requisição ao
  // apoio (Álvaro) automaticamente. Idempotente do lado de lá.
  notifyDocumento: (payload: NotifyDocumentoPayload) =>
    call<NotifyDocumentoResposta>('receive-documento', payload),
}
