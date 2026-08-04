import { z } from 'zod'

// Marcador estruturado (espelha PainelResultado de @lab-hub/shared).
export const painelResultadoSchema = z.object({
  nome: z.string(),
  valor: z.string(),
  unidade: z.string(),
  ref: z.string(),
  ok: z.boolean(),
  trend: z.array(z.number()).optional(),
})

// Payload do webhook FlowLab → LAB-HUB (D1: inclui painéis estruturados).
export const resultadoWebhookSchema = z.object({
  agendamentoLabhubId: z.string().uuid(),
  // Id do resultado no FlowLab (`ac_resultados.id`). Opcional porque o FlowLab
  // já entrega sem ele hoje — exigir quebraria a integração no ar. É a chave
  // que permitirá trocar a unicidade de (agendamento, exame_nome) por uma
  // opaca, e com isso derrubar o `exame_nome` em claro (S-06).
  exameFlowlabId: z.string().uuid().optional(),
  exameNome: z.string().min(1),
  categoria: z.string().optional(),
  resumo: z.string().optional(),
  paineis: z.array(painelResultadoSchema),
  laudoUrl: z.string().url().optional(),
  // Path relativo no bucket 'laudos' (não URL absoluta) — é o que createSignedUrl espera.
  declaracaoUrl: z
    .string()
    .refine((s) => !/^https?:\/\//i.test(s), 'declaracaoUrl deve ser um path no bucket, não uma URL completa')
    .optional(),
  liberadoEm: z.string().datetime(),
})

export type ResultadoWebhookInput = z.infer<typeof resultadoWebhookSchema>
