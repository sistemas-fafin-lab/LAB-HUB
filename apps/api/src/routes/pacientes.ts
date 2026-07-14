import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { toPaciente } from '../lib/mappers.js'
import { pacienteUpdateSchema } from '../schemas/pacienteUpdate.js'

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

  // PUT /pacientes/me — atualiza os campos editáveis do próprio perfil.
  // Sempre no pacienteId do token (sem :id na URL), evitando IDOR.
  app.put('/pacientes/me', { preHandler: authenticate }, async (request) => {
    const parsed = pacienteUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message)
    }
    const { nome, telefone, convenio } = parsed.data

    const update: Record<string, unknown> = { nome }
    if (telefone !== undefined) update.telefone = telefone === '' ? null : telefone
    if (convenio !== undefined) {
      update.convenio_operadora = convenio?.operadora ?? null
      update.convenio_plano = convenio?.plano ?? null
    }

    const { data, error } = await supabase
      .from('pacientes')
      .update(update)
      .eq('id', request.pacienteId)
      .select()
      .single()
    if (error || !data) {
      throw app.httpErrors.internalServerError('Falha ao atualizar paciente')
    }
    return toPaciente(data)
  })
}
