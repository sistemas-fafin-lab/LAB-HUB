import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { flowlab } from '../lib/flowlab.js'
import { authenticate } from '../middlewares/auth.js'
import { criarAgendamentoSchema } from '../schemas/agendamento.js'
import { toAgendamento } from '../lib/mappers.js'
import { sincronizarAgendamento } from '../lib/agendamentoSync.js'
import { mensagemZod } from '../lib/validacao.js'

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
        throw app.httpErrors.badRequest(mensagemZod(parsed.error))
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

      // O slot reservado deixa de estar disponível: descarta o cache de exibição
      // para que a próxima leitura (GET /postos/disponibilidade) já o reflita.
      flowlab.invalidarDisponibilidade()

      // 3) Sincroniza com o FlowLab. Se falhar, mantém 'pendente' (sem falhar o
      //    request) p/ reprocessamento via POST /agendamentos/:id/sync.
      await sincronizarAgendamento(criado, request.log)

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

  // POST /agendamentos/:id/sync — reprocessa um agendamento que ficou 'pendente'
  // porque o sync com o FlowLab falhou na criação (FlowLab fora/timeout).
  app.post(
    '/agendamentos/:id/sync',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { id } = request.params as { id: string }

      // Carrega com checagem de dono (evita IDOR): só o próprio paciente.
      const { data: ag, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('id', id)
        .eq('paciente_id', request.pacienteId)
        .maybeSingle()
      if (error) {
        throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
      }
      if (!ag) {
        throw app.httpErrors.notFound('Agendamento não encontrado')
      }
      // Já sincronizado (ou não está pendente): idempotente, devolve como está.
      if (ag.flowlab_id || ag.status !== 'pendente') {
        return toAgendamento(ag)
      }

      const resultado = await sincronizarAgendamento(ag, request.log)
      if (resultado === 'falhou') {
        throw app.httpErrors.badGateway('FlowLab indisponível; tente novamente em instantes')
      }
      // 'confirmado' (ag já mutado) ou 'em_andamento' (outro request detém o lock):
      // devolve o estado atual; o cliente pode reconsultar via GET /agendamentos.
      return toAgendamento(ag)
    },
  )

  // POST /agendamentos/:id/cancelar — marca o agendamento como 'cancelado'.
  // Não remove a linha: preserva o histórico do paciente. Após o cancelamento
  // local, propaga ao FlowLab (best-effort) para liberar o slot.
  app.post(
    '/agendamentos/:id/cancelar',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { id } = request.params as { id: string }

      // Carrega com checagem de dono (evita IDOR): só o próprio paciente.
      const { data: ag, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('id', id)
        .eq('paciente_id', request.pacienteId)
        .maybeSingle()
      if (error) {
        throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
      }
      if (!ag) {
        throw app.httpErrors.notFound('Agendamento não encontrado')
      }
      // Já cancelado: idempotente, devolve como está.
      if (ag.status === 'cancelado') {
        return toAgendamento(ag)
      }
      // Coleta já realizada não pode ser cancelada (resultado já gerado).
      if (ag.status === 'realizado') {
        throw app.httpErrors.conflict('Coleta já realizada não pode ser cancelada')
      }

      const { error: updateError } = await supabase
        .from('agendamentos')
        .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (updateError) {
        throw app.httpErrors.internalServerError('Falha ao cancelar agendamento')
      }
      ag.status = 'cancelado'

      // Propaga ao FlowLab para liberar o slot (ocupação derivada de
      // ac_agendamentos). Só faz sentido se o agendamento chegou a ser
      // sincronizado (tem flowlab_id). Best-effort: o cancelamento local já está
      // gravado — se o FlowLab estiver fora, logamos e seguimos sem falhar o
      // request do paciente. A próxima leitura de disponibilidade volta a
      // refletir o slot só após a propagação ter sucesso.
      if (ag.flowlab_id) {
        try {
          await flowlab.receiveCancelamento({ labhubId: ag.id })
          flowlab.invalidarDisponibilidade()
        } catch (err) {
          request.log.error(
            { err, agendamentoId: ag.id },
            'Falha ao propagar cancelamento ao FlowLab',
          )
        }
      }

      return toAgendamento(ag)
    },
  )
}
