import type { FastifyBaseLogger } from 'fastify'
import type { AgendamentoPayloadFlowLab } from '@lab-hub/shared'
import { supabase } from './supabase.js'
import { flowlab } from './flowlab.js'

// Sincronização de um agendamento 'pendente' com o FlowLab. Extraído de
// routes/agendamentos.ts para ser reusado também pelo canal de integração
// (recepção cria agendamento — routes/integracao.ts): a lógica de lock atômico
// precisa ser ÚNICA para não abrir caminho a envio duplicado ao FlowLab.

export interface AgendamentoSyncRow {
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
export type ResultadoSync = 'confirmado' | 'em_andamento' | 'falhou'

// Sincroniza um agendamento 'pendente' com o FlowLab. Reivindica a linha via
// lock atômico (sincronizando_em) para garantir um único envio mesmo sob syncs
// concorrentes — evita duplicar o agendamento no FlowLab. Em sucesso marca
// 'confirmado' e muta `ag`; em falha libera o lock e mantém 'pendente'.
export async function sincronizarAgendamento(
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
