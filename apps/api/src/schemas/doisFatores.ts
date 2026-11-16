import { z } from 'zod'

const codigo = z.string().regex(/^\d{6}$/, 'Digite os 6 dígitos do código.')

export const enviarCodigoSchema = z.object({
  // login: a segunda etapa depois da senha. confirmacao: ligar/desligar a
  // verificação e excluir a conta, numa sessão já liberada.
  finalidade: z.enum(['login', 'confirmacao']),
})

export const verificarCodigoSchema = z.object({ codigo })

export const preferenciaSchema = z.object({ ativa: z.boolean(), codigo })

export const codigoOpcionalSchema = z.object({ codigo: codigo.optional() }).optional()
