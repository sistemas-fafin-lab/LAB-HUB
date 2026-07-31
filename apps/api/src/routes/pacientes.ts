import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { toPaciente } from '../lib/mappers.js'
import { pacienteUpdateSchema } from '../schemas/pacienteUpdate.js'
import { mensagemZod } from '../lib/validacao.js'
import { excluirContaPaciente } from '../lib/expurgo.js'

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
      throw app.httpErrors.badRequest(mensagemZod(parsed.error))
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

  // DELETE /pacientes/me — exclusão de conta a pedido do titular (LGPD art. 18, VI).
  //
  // O que some: o acesso (usuário no Auth), os documentos que o paciente enviou,
  // e-mail, telefone e convênio. O que fica: nome, CPF, nascimento, agendamentos
  // e laudos — prontuário, retido por obrigação legal (CFM 1.821/2007, ressalvado
  // pela LGPD art. 16, I). O detalhe do porquê está na migration 20260731170000.
  //
  // Rate limit baixo: é irreversível e ninguém exclui a conta duas vezes por
  // minuto. Se chegar em rajada, é bug de front ou abuso — nos dois casos, segurar.
  app.delete(
    '/pacientes/me',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      await excluirContaPaciente(request.pacienteId, request.log)
      return reply.code(204).send()
    },
  )
}
