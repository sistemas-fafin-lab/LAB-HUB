import type { FastifyInstance } from 'fastify'
import { flowlab } from '../lib/flowlab.js'
import { authenticate } from '../middlewares/auth.js'

export async function postosRoutes(app: FastifyInstance): Promise<void> {
  // GET /postos/disponibilidade — proxy da Edge Function get-disponibilidade (D3).
  // A disponibilidade pertence ao FlowLab; o LAB-HUB não mantém tabela de postos.
  app.get('/postos/disponibilidade', { preHandler: authenticate }, async () => {
    return flowlab.getDisponibilidade()
  })
}
