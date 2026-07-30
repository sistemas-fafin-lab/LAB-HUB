import { z } from 'zod'

// Body do POST /api/v1/cadastro (auto-cadastro do paciente).
// O CPF pode chegar formatado; normalizamos para 11 dígitos antes de validar.
// As mensagens são em português porque chegam à TELA do paciente: a rota manda
// a primeira issue no corpo do 400 (ver lib/validacao.ts) e o web mostra
// `error.message` cru. Sem `message`, o zod devolve o texto padrão em inglês.
export const cadastroSchema = z.object({
  email: z.string().email('E-mail inválido'),
  // Espelha a política do Supabase Auth (S-04): mín. 12 + minúscula, maiúscula
  // e dígito. Sem isso o zod deixa passar e o Auth recusa depois, devolvendo ao
  // paciente uma mensagem em inglês vinda da biblioteca.
  password: z
    .string()
    .min(12, 'Senha deve ter ao menos 12 caracteres')
    .regex(/[a-z]/, 'Senha deve ter ao menos uma letra minúscula')
    .regex(/[A-Z]/, 'Senha deve ter ao menos uma letra maiúscula')
    .regex(/\d/, 'Senha deve ter ao menos um número'),
  nome: z.string().min(1, 'Informe seu nome'),
  cpf: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => /^\d{11}$/.test(s), 'CPF inválido'),
  sexo: z.enum(['M', 'F']),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  telefone: z.string().optional(),
})

export type CadastroInput = z.infer<typeof cadastroSchema>
