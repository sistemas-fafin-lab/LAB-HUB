import type { FastifyInstance, FastifyBaseLogger } from 'fastify'
import type { AgendamentoPayloadFlowLab } from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { flowlab } from '../lib/flowlab.js'
import { authenticate } from '../middlewares/auth.js'
import { criarAgendamentoSchema } from '../schemas/agendamento.js'
import { toAgendamento } from '../lib/mappers.js'

interface AgendamentoSyncRow {
  id: string
  paciente_id: string
  posto_flowlab_id: string
  data_hora: string
  flowlab_id?: string | null
  status?: string
}

// TTL do lock de sync (coluna sincronizando_em). Deve ser > FLOWLAB_TIMEOUT_MS
// para não reivindicar um agendamento cuja chamada ao FlowLab ainda está em
// andamento; se um processo cair segurando o lock, a linha volta a ser
// sincronizável após esse prazo.
const SYNC_LOCK_TTL_MS = 2 * 60 * 1000
const EPOCH_ISO = new Date(0).toISOString() // "sem lock" (igual ao default da coluna)

// Resultado da sincronização:
//   'confirmado'   — enviado ao FlowLab e confirmado agora (ag mutado).
//   'em_andamento' — outro processo detém o lock; não chamamos o FlowLab.
//   'falhou'       — FlowLab indisponível/erro; lock liberado, segue 'pendente'.
type ResultadoSync = 'confirmado' | 'em_andamento' | 'falhou'

// Sincroniza um agendamento 'pendente' com o FlowLab. Reivindica a linha via
// lock atômico (sincronizando_em) para garantir um único envio mesmo sob syncs
// concorrentes — evita duplicar o agendamento no FlowLab. Em sucesso marca
// 'confirmado' e muta `ag`; em falha libera o lock e mantém 'pendente'.
async function sincronizarAgendamento(
  ag: AgendamentoSyncRow,
  log: FastifyBaseLogger,
): Promise<ResultadoSync> {
  // 1) Reivindica a linha: este UPDATE condicional é atômico no Postgres e só
  //    afeta a linha se ela ainda está 'pendente', sem flowlab_id e com o lock
  //    livre/vencido (sincronizando_em anterior a now() - TTL). Dois processos
  //    concorrentes disputam o mesmo UPDATE; apenas um recebe a linha de volta.
  const lockLivreAntesDe = new Date(Date.now() - SYNC_LOCK_TTL_MS).toISOString()
  const { data: reivindicado, error: lockError } = await supabase
    .from('agendamentos')
    .update({ sincronizando_em: new Date().toISOString() })
    .eq('id', ag.id)
    .eq('status', 'pendente')
    .is('flowlab_id', null)
    .lt('sincronizando_em', lockLivreAntesDe)
    .select()
    .maybeSingle()
  if (lockError) {
    log.error({ err: lockError, agendamentoId: ag.id }, 'Falha ao reivindicar lock de sync')
    return 'falhou'
  }
  if (!reivindicado) {
    // Outro processo detém o lock (ou o agendamento já saiu de 'pendente').
    return 'em_andamento'
  }

  // 2) Carrega dados do paciente para o payload do FlowLab.
  const { data: paciente } = await supabase
    .from('pacientes')
    .select('nome, telefone')
    .eq('id', ag.paciente_id)
    .single()

  const payload: AgendamentoPayloadFlowLab = {
    labhubId: ag.id,
    pacienteNome: paciente?.nome ?? '',
    pacienteTelefone: paciente?.telefone ?? '',
    postoFlowlabId: ag.posto_flowlab_id,
    dataHora: ag.data_hora,
  }
  try {
    const { flowlabId } = await flowlab.receiveAgendamento(payload)
    await supabase
      .from('agendamentos')
      .update({ flowlab_id: flowlabId, status: 'confirmado', sincronizando_em: EPOCH_ISO })
      .eq('id', ag.id)
    ag.flowlab_id = flowlabId
    ag.status = 'confirmado'
    return 'confirmado'
  } catch (err) {
    // Libera o lock (volta ao default) p/ permitir nova tentativa; segue 'pendente'.
    await supabase
      .from('agendamentos')
      .update({ sincronizando_em: EPOCH_ISO })
      .eq('id', ag.id)
    log.error({ err, agendamentoId: ag.id }, 'Falha ao sincronizar agendamento com o FlowLab')
    return 'falhou'
  }
}

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
}
