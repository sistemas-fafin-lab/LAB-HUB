// Erros internos do pipeline de laudos. Existem para o serviço poder RAMIFICAR
// (LIS fora do ar ≠ banco fora do ar ≠ entrada inválida) longe do Fastify: os
// mapeadores e clientes HTTP não conhecem app.httpErrors.
// A tradução para HTTP acontece num lugar só: routes/laudos.ts.

export class LaudoError extends Error {
  readonly context: Record<string, unknown>

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name = this.constructor.name
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }
}

// Entrada inválida na fronteira do módulo (CPF malformado, código ausente) → 400.
export class ValidationError extends LaudoError {}

// Falha de rede/timeout/protocolo ao falar com ApLIS ou AOL → 502.
// É esperada e recuperável: o laudo pode vir na próxima revalidação.
export class IntegrationError extends LaudoError {
  readonly service: 'aol' | 'aplis' | 'unknown'

  constructor(
    message: string,
    service: 'aol' | 'aplis' | 'unknown' = 'unknown',
    context?: Record<string, unknown>,
  ) {
    super(message, { ...context, service })
    this.service = service
  }
}

// Falha ao ler/gravar no Supabase → 500.
export class DatabaseError extends LaudoError {}
