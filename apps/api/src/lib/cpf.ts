import { z } from 'zod'

// Validação de CPF pelos dígitos verificadores. Opera sobre qualquer string
// (normaliza para dígitos); rejeita tamanho errado e sequências repetidas
// (000.000.000-00 … 999.999.999-99), que passam na conta mas não são CPFs reais.
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false

  const digito = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 || resto === 11 ? 0 : resto
  }

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

// CPF pode chegar formatado; normaliza para 11 dígitos e valida os dígitos
// verificadores (não só o comprimento) antes de deixar passar. Compartilhado
// por todo schema que recebe CPF de entrada (recepção, consulta admin).
export const cpfDigitosSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .refine((s) => /^\d{11}$/.test(s), 'CPF deve ter 11 dígitos')
  .refine(cpfValido, 'CPF inválido')
