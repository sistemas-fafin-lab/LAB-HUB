import { z } from 'zod'

// Body do POST /api/v1/cadastro (auto-cadastro do paciente).
// O CPF pode chegar formatado; normalizamos para 11 dígitos antes de validar.
export const cadastroSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  nome: z.string().min(1),
  cpf: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => /^\d{11}$/.test(s), 'CPF inválido'),
  sexo: z.enum(['M', 'F']),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  telefone: z.string().optional(),
})

export type CadastroInput = z.infer<typeof cadastroSchema>
