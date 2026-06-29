import { createHmac } from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify'
import sensible from '@fastify/sensible'
import { vi } from 'vitest'

// App de teste mínimo: só sensible (p/ app.httpErrors) + a rota sob teste.
// Não registra rate-limit/cors — o `config.rateLimit` das rotas é ignorado sem o plugin.
export async function buildApp(route: FastifyPluginAsync): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(sensible)
  await app.register(route)
  await app.ready()
  return app
}

// Assinatura HMAC-SHA256 igual à que o FlowLab enviaria no header x-webhook-signature.
export function signHmac(body: string, secret = process.env.FLOWLAB_WEBHOOK_SECRET!): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export interface SupaCall {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: Record<string, unknown>
}
export interface SupaResult {
  data?: unknown
  error?: unknown
}
// Roteia cada query pela tabela/operação/filtros, devolvendo o resultado do cenário.
export type SupaHandler = (call: SupaCall) => SupaResult

// Mock encadeável do client Supabase: replica o query builder (from/select/insert/
// update/eq/is/lt/order/single/maybeSingle) e auth.getUser. Cada terminal
// (single/maybeSingle/await) consulta o `handler` do teste e registra a chamada.
export function createSupabaseMock(opts: { handler: SupaHandler; getUser?: SupaResult }) {
  const calls: SupaCall[] = []
  const getUser = vi.fn(async () =>
    opts.getUser ?? { data: { user: { id: 'auth-user-1' } }, error: null },
  )

  function from(table: string) {
    const state: SupaCall = { table, op: 'select', filters: {} }
    const run = (): Promise<SupaResult> => {
      calls.push({ ...state, filters: { ...state.filters } })
      return Promise.resolve(opts.handler(state))
    }
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: unknown) => ((state.op = 'insert'), (state.payload = p), builder),
      update: (p: unknown) => ((state.op = 'update'), (state.payload = p), builder),
      delete: () => ((state.op = 'delete'), builder),
      eq: (c: string, v: unknown) => ((state.filters[c] = v), builder),
      is: (c: string, v: unknown) => ((state.filters[c] = v), builder),
      lt: (c: string, v: unknown) => ((state.filters[`${c}__lt`] = v), builder),
      order: () => builder,
      limit: () => builder,
      single: () => run(),
      maybeSingle: () => run(),
      then: (resolve: (r: SupaResult) => unknown, reject?: (e: unknown) => unknown) =>
        run().then(resolve, reject),
    }
    return builder
  }

  return { client: { auth: { getUser }, from: vi.fn(from) }, calls, getUser }
}
