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

// Chamada a uma função do banco via supabase.rpc(). Fica separada das SupaCall
// porque não tem tabela nem filtros — é uma chamada de função com argumentos.
export interface RpcCall {
  fn: string
  args: Record<string, unknown>
}
export type RpcHandler = (call: RpcCall) => SupaResult

// Chamada ao Storage registrada pelo mock (upload/remove/signed URLs).
export interface StorageCall {
  bucket: string
  op: 'upload' | 'remove' | 'createSignedUrl' | 'createSignedUrls'
  paths: string[]
  // TTL da signed URL, em segundos. Registrado porque é decisão de segurança
  // (P-05): sem isto, alguém troca 300 por 3600 e nenhum teste reclama.
  ttl?: number
  options?: unknown
}
export type StorageHandler = (call: StorageCall) => SupaResult

// Mock encadeável do client Supabase: replica o query builder (from/select/insert/
// update/eq/is/lt/or/order/single/maybeSingle), o storage (upload/remove/signed
// URLs) e auth.getUser. Cada terminal (single/maybeSingle/await) consulta o
// `handler` do teste e registra a chamada.
export function createSupabaseMock(opts: {
  handler: SupaHandler
  getUser?: SupaResult
  storage?: StorageHandler
  rpc?: RpcHandler
}) {
  const calls: SupaCall[] = []
  const storageCalls: StorageCall[] = []
  const rpcCalls: RpcCall[] = []

  // Default: a função existe e não devolve nada. Os testes sobrescrevem via
  // opts.rpc p/ exercitar sucesso com payload e as recusas por SQLSTATE.
  const rpcHandler: RpcHandler = opts.rpc ?? (() => ({ data: null, error: null }))

  function rpc(fn: string, args?: Record<string, unknown>) {
    const call: RpcCall = { fn, args: args ?? {} }
    rpcCalls.push(call)
    return Promise.resolve(rpcHandler(call))
  }
  const getUser = vi.fn(async () =>
    opts.getUser ?? { data: { user: { id: 'auth-user-1' } }, error: null },
  )

  // Default: tudo dá certo. Os testes sobrescrevem via opts.storage p/ exercitar
  // falha de upload, de assinatura, etc.
  const storageHandler: StorageHandler =
    opts.storage ??
    ((call) => {
      if (call.op === 'createSignedUrl') {
        return { data: { signedUrl: `https://signed.test/${call.paths[0]}` }, error: null }
      }
      if (call.op === 'createSignedUrls') {
        return {
          data: call.paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}`, error: null })),
          error: null,
        }
      }
      return { data: { path: call.paths[0] }, error: null }
    })

  function storageFrom(bucket: string) {
    const run = (op: StorageCall['op'], paths: string[], ttl?: number, options?: unknown) => {
      const call: StorageCall = {
        bucket,
        op,
        paths,
        ...(ttl === undefined ? {} : { ttl }),
        ...(options ? { options } : {}),
      }
      storageCalls.push(call)
      return Promise.resolve(storageHandler(call))
    }
    return {
      upload: (path: string, _body: unknown, options?: unknown) =>
        run('upload', [path], undefined, options),
      remove: (paths: string[]) => run('remove', paths),
      createSignedUrl: (path: string, ttl: number, options?: unknown) =>
        run('createSignedUrl', [path], ttl, options),
      createSignedUrls: (paths: string[], ttl: number) => run('createSignedUrls', paths, ttl),
    }
  }

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
      not: (c: string, op: string, v: unknown) => ((state.filters[`${c}__not_${op}`] = v), builder),
      lt: (c: string, v: unknown) => ((state.filters[`${c}__lt`] = v), builder),
      or: (f: string) => ((state.filters.__or = f), builder),
      order: () => builder,
      limit: () => builder,
      single: () => run(),
      maybeSingle: () => run(),
      then: (resolve: (r: SupaResult) => unknown, reject?: (e: unknown) => unknown) =>
        run().then(resolve, reject),
    }
    return builder
  }

  return {
    client: {
      auth: { getUser },
      from: vi.fn(from),
      rpc: vi.fn(rpc),
      storage: { from: vi.fn(storageFrom) },
    },
    calls,
    rpcCalls,
    storageCalls,
    getUser,
  }
}
