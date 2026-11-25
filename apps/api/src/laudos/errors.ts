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

/** De onde veio a falha: os dois LIS e o site interno do apLIS (anexos). */
export type ServicoIntegrado = 'aol' | 'aplis' | 'aplis-site' | 'unknown'

// Falha de rede/timeout/protocolo ao falar com ApLIS ou AOL → 502.
// É esperada e recuperável: o laudo pode vir na próxima revalidação.
export class IntegrationError extends LaudoError {
  readonly service: ServicoIntegrado

  constructor(
    message: string,
    service: ServicoIntegrado = 'unknown',
    context?: Record<string, unknown>,
  ) {
    super(message, { ...context, service })
    this.service = service
  }
}

// Falha ao ler/gravar no Supabase → 500.
export class DatabaseError extends LaudoError {}

// O recurso não existe PARA ESTE PACIENTE → 404. Cobre o que não existe e o que
// é de outra pessoa, de propósito indistinguíveis.
export class NaoEncontradoError extends LaudoError {}

// O arquivo existe, mas a conferência de identidade não deixou entregá-lo → 409.
export class EntregaRecusadaError extends LaudoError {}
