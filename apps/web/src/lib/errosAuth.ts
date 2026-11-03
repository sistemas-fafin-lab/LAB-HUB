// O Supabase Auth responde em inglês. Estas funções traduzem o que o paciente
// lê; quem registra no analytics continua enviando a mensagem crua, para não
// quebrar a série histórica no Umami.

const ehLimite = (m: string) => m.includes('rate limit') || m.includes('for security purposes')

const MSG_LIMITE = 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.'

export function mensagemErroLogin(original: string): string {
  const m = original.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  }
  if (ehLimite(m)) return MSG_LIMITE
  return 'Não foi possível entrar agora. Tente novamente em instantes.'
}

export function mensagemErroRecuperacao(original: string): string {
  if (ehLimite(original.toLowerCase())) return MSG_LIMITE
  return 'Não foi possível enviar o link agora. Tente novamente em instantes.'
}

/** Resultado de uma falha ao salvar a nova senha: onde mostrar e o quê. */
export type ErroNovaSenha =
  | { tipo: 'campo'; mensagem: string }
  | { tipo: 'aviso'; mensagem: string }
  /** Sem sessão de recuperação (link vencido ou já usado). */
  | { tipo: 'link-expirado' }

export function erroNovaSenha(original: string): ErroNovaSenha {
  const m = original.toLowerCase()
  if (m.includes('different from the old password')) {
    return { tipo: 'campo', mensagem: 'A nova senha precisa ser diferente da atual.' }
  }
  if (m.includes('session missing') || m.includes('session_not_found') || m.includes('session not found')) {
    return { tipo: 'link-expirado' }
  }
  if (ehLimite(m)) return { tipo: 'aviso', mensagem: MSG_LIMITE }
  return { tipo: 'aviso', mensagem: 'Não foi possível salvar a nova senha agora. Tente novamente em instantes.' }
}
