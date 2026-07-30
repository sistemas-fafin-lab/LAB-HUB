import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { mensagemZod } from '../src/lib/validacao.js'

// O defeito que motivou este helper: `parsed.error.message` do zod é o JSON das
// issues, e ele ia inteiro para o corpo do 400. O `api.ts` do web usa
// `body.message` verbatim e as telas mostram `error.message` cru — ou seja, o
// paciente via `[{"validation":"regex","code":"invalid_string",…}]` na tela.

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(12, 'Senha deve ter ao menos 12 caracteres'),
})

function erroDe(entrada: unknown): z.ZodError {
  const r = schema.safeParse(entrada)
  if (r.success) throw new Error('esperava falha de validação')
  return r.error
}

describe('mensagemZod', () => {
  it('devolve a frase do schema, não o JSON das issues', () => {
    const msg = mensagemZod(erroDe({ email: 'maria@exemplo.test', password: 'curta' }))

    expect(msg).toBe('Senha deve ter ao menos 12 caracteres')
    // A garantia que importa: nada de JSON chegando à tela.
    expect(msg).not.toContain('{')
    expect(msg).not.toContain('validation')
  })

  it('com várias pendências, devolve a primeira', () => {
    // Os formulários destacam campo a campo do lado do cliente; a primeira
    // pendência é o que a pessoa precisa corrigir agora.
    expect(mensagemZod(erroDe({ email: 'nao-e-email', password: 'curta' }))).toBe('E-mail inválido')
  })

  it('cai num texto genérico se não houver issue alguma', () => {
    expect(mensagemZod({ issues: [] } as unknown as z.ZodError)).toBe('Dados inválidos')
  })

  it('não vaza o valor enviado junto da mensagem', () => {
    // Vale para dado de saúde: a mensagem vai para a tela e para o log.
    const msg = mensagemZod(erroDe({ email: 'paciente.real@exemplo.test', password: 'x' }))

    expect(msg).not.toContain('paciente.real')
  })
})
