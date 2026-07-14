import { z } from 'zod'

// Body do PUT /api/v1/pacientes/me — apenas os campos editáveis do perfil.
// Identidade (cpf, dataNascimento, sexo) e e-mail (login) NÃO entram aqui.
export const pacienteUpdateSchema = z.object({
  nome: z.string().trim().min(1, 'Informe seu nome'),
  telefone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => s === '' || /^\d{10,11}$/.test(s), 'Telefone inválido')
    .optional(),
  convenio: z
    .object({
      operadora: z.string().trim().min(1, 'Informe a operadora'),
      plano: z.string().trim().optional(),
    })
    .nullable()
    .optional(),
})

export type PacienteUpdateInput = z.infer<typeof pacienteUpdateSchema>
