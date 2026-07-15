import type { FastifyRequest } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { requireEnv } from '../lib/env.js'

const API_KEY = requireEnv('FLOWLAB_API_KEY')

// preHandler das rotas de integração (FlowLab → LAB-HUB). Canal server-to-server:
// autentica pela FLOWLAB_API_KEY, nunca por JWT de paciente.
//
// Header próprio (x-api-key) e NÃO Authorization, de propósito — mantém uma regra
// única e greppável: neste servidor, `Authorization: Bearer` significa sempre
// "JWT de paciente" e é consumido só pelo middlewares/auth.ts. Também segue o
// precedente do tráfego de ENTRADA vindo do FlowLab, que já usa header próprio
// (x-webhook-signature em /webhooks/*). O Bearer em lib/flowlab.ts é a direção
// oposta (LAB-HUB → FlowLab) e não é o mesmo canal.
export async function autenticarFlowlab(request: FastifyRequest): Promise<void> {
  const recebida = request.headers['x-api-key']
  if (typeof recebida !== 'string' || !chaveConfere(recebida)) {
    throw request.server.httpErrors.unauthorized('Chave de integração inválida')
  }
}

// Comparação em tempo constante — não vaza o segredo por timing. O early return
// no tamanho é seguro: revela só o comprimento, e timingSafeEqual exige buffers
// de tamanho igual (lançaria RangeError sem essa guarda).
function chaveConfere(recebida: string): boolean {
  const a = Buffer.from(recebida)
  const b = Buffer.from(API_KEY)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
