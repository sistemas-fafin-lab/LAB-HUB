import type { FastifyInstance } from 'fastify'
import type { AgendamentoPayloadFlowLab } from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { flowlab } from '../lib/flowlab.js'
import { authenticate } from '../middlewares/auth.js'
import { criarAgendamentoSchema } from '../schemas/agendamento.js'
import { toAgendamento } from '../lib/mappers.js'

export async function agendamentosRoutes(app: FastifyInstance): Promise<void> {
  // POST /agendamentos — cria o agendamento e sincroniza com o FlowLab.
  app.post(
    '/agendamentos',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = criarAgendamentoSchema.safeParse(request.body)
      if (!parsed.success) {
        throw app.httpErrors.badRequest(parsed.error.message)
      }
      const { postoFlowlabId, dataHora } = parsed.data

      // 1) Confirma o posto/horário contra a disponibilidade do FlowLab.
      const disponiveis = await flowlab.getDisponibilidade()
      const posto = disponiveis.find((p) => p.id === postoFlowlabId)
      if (!posto) {
        throw app.httpErrors.badRequest('Posto indisponível')
      }
      if (!posto.slots.includes(dataHora)) {
        throw app.httpErrors.badRequest('Horário indisponível')
      }

      // 2) Insere o agendamento (status pendente) com o snapshot do nome.
      const { data: criado, error } = await supabase
        .from('agendamentos')
        .insert({
          paciente_id: request.pacienteId,
          posto_flowlab_id: postoFlowlabId,
          posto_nome: posto.nome,
          data_hora: dataHora,
          status: 'pendente',
        })
        .select()
        .single()
      if (error || !criado) {
        throw app.httpErrors.internalServerError('Falha ao criar agendamento')
      }

      // 3) Carrega dados do paciente para o payload do FlowLab.
      const { data: paciente } = await supabase
        .from('pacientes')
        .select('nome, telefone')
        .eq('id', request.pacienteId)
        .single()

      // 4) Notifica o FlowLab; ao receber o flowlabId, confirma o agendamento.
      const payload: AgendamentoPayloadFlowLab = {
        labhubId: criado.id,
        pacienteNome: paciente?.nome ?? '',
        pacienteTelefone: paciente?.telefone ?? '',
        postoFlowlabId,
        dataHora,
      }
      try {
        const { flowlabId } = await flowlab.receiveAgendamento(payload)
        await supabase
          .from('agendamentos')
          .update({ flowlab_id: flowlabId, status: 'confirmado' })
          .eq('id', criado.id)
        criado.flowlab_id = flowlabId
        criado.status = 'confirmado'
      } catch (err) {
        // Mantém status 'pendente' p/ reprocessamento posterior; não falha o request.
        request.log.error({ err }, 'Falha ao sincronizar agendamento com o FlowLab')
      }

      return reply.code(201).send(toAgendamento(criado))
    },
  )

  // GET /agendamentos — lista os agendamentos do paciente autenticado.
  app.get('/agendamentos', { preHandler: authenticate }, async (request) => {
    const { data, error } = await supabase
      .from('agendamentos')
      .select('*')
      .eq('paciente_id', request.pacienteId)
      .order('data_hora', { ascending: false })
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao listar agendamentos')
    }
    return (data ?? []).map(toAgendamento)
  })
}
