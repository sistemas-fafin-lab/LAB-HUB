import type { ZodError } from 'zod'

/**
 * Mensagem de erro de validação legível para quem recebe o 400.
 *
 * O `error.message` do zod é o JSON das issues (`[{"validation":"regex",…}]`).
 * O `api.ts` do web usa `body.message` verbatim e as telas mostram
 * `error.message` cru — então mandar o dump para o cliente coloca um bloco de
 * JSON na frente do paciente, no lugar da frase que o schema já escreveu.
 *
 * Devolve a mensagem da PRIMEIRA issue: os formulários destacam campo a campo
 * do lado do cliente, então a primeira pendência é o que a pessoa precisa
 * corrigir agora. O detalhe completo continua disponível em `error.issues` para
 * quem quiser registrar no log.
 */
export function mensagemZod(erro: ZodError): string {
  return erro.issues[0]?.message ?? 'Dados inválidos'
}
