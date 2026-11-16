import { api } from './api'

// ---------------------------------------------------------------------------
// Verificação em duas etapas por e-mail (PV2-26): chamadas à API e o e-mail
// mascarado das telas. Desenho em .scratch/portal-v2-paridade/.
// ---------------------------------------------------------------------------

export interface EstadoDoisFatores {
  /** O paciente ligou a verificação. */
  ativa: boolean
  /** Esta sessão ainda precisa do código. */
  pendente: boolean
  /** Último envio de código para esta sessão (ISO), para o "Reenviar em 0:SS". */
  enviadoEm: string | null
  /** Pendente, mas sem como fazer a etapa do código (senha antiga, link de recuperação). */
  entrarDeNovo?: boolean
}

/** Código da API para "entre de novo com a senha". */
export const ENTRE_DE_NOVO = 'ENTRE_DE_NOVO'
export const AVISO_ENTRE_DE_NOVO = 'Por segurança, entre de novo com a sua senha.'

export type FinalidadeDoCodigo = 'login' | 'confirmacao'

export const doisFatores = {
  estado: () => api.get<EstadoDoisFatores>('/auth/dois-fatores'),
  enviar: (finalidade: FinalidadeDoCodigo) => api.post<{ enviadoEm: string }>('/auth/dois-fatores/enviar', { finalidade }),
  verificar: (codigo: string) => api.post<{ verificada: true }>('/auth/dois-fatores/verificar', { codigo }),
  preferencia: (ativa: boolean, codigo: string) =>
    api.post<{ ativa: boolean }>('/auth/dois-fatores/preferencia', { ativa, codigo }),
}

export const ESPERA_PARA_REENVIAR_S = 60

/** "m•••@exemplo.com": a primeira letra, "•••" e o domínio. */
export function mascararEmail(email: string): string {
  const arroba = email.indexOf('@')
  if (arroba <= 0) return '•••'
  return `${email[0]}•••${email.slice(arroba)}`
}
