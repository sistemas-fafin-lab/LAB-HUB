import { z } from 'zod'

// Body do POST /api/v1/agendamentos.
// O cliente envia só o id do posto (escolhido na lista proxy do FlowLab);
// a rota resolve o nome contra a disponibilidade e grava o snapshot.
export const criarAgendamentoSchema = z.object({
  postoFlowlabId: z.guid(),
  dataHora: z.iso.datetime(),
})

export type CriarAgendamentoInput = z.infer<typeof criarAgendamentoSchema>
