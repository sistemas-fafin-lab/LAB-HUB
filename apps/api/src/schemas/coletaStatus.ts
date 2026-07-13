import { z } from 'zod'

// Payload do webhook FlowLab → LAB-HUB que propaga o status da coleta.
// O FlowLab envia o PRÓPRIO status (vocabulário dele); o mapeamento p/ o status
// do LAB-HUB é feito na rota (POST /webhooks/coletas), que é a autoridade.
export const coletaStatusWebhookSchema = z.object({
  agendamentoLabhubId: z.string().uuid(),
  // Só os estados que o LAB-HUB precisa refletir (check-in, coleta e bloqueio).
  status: z.enum(['em_coleta', 'coletado', 'bloqueado']),
  // Momento da mudança no FlowLab (informativo; opcional).
  ocorridoEm: z.string().datetime().optional(),
  // Exames marcados no check-in (snapshot). Só acompanham o 'coletado'; opcional.
  exames: z
    .array(
      z.object({
        nome: z.string(),
        isCultura: z.boolean(),
        material: z.string().optional(),
      }),
    )
    .optional(),
})

export type ColetaStatusWebhookInput = z.infer<typeof coletaStatusWebhookSchema>
