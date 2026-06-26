import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { toPaciente } from '../lib/mappers.js'

export async function pacientesRoutes(app: FastifyInstance): Promise<void> {
  // GET /pacientes/me — dados do paciente autenticado (derivado do JWT, D4).
  // Evita IDOR: não recebe :id na URL, usa o pacienteId resolvido do token.
  app.get('/pacientes/me', { preHandler: authenticate }, async (request) => {
    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', request.pacienteId)
      .single()
    if (error || !data) {
      throw app.httpErrors.notFound('Paciente não encontrado')
    }
    return toPaciente(data)
  })
}
