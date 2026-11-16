import type { FastifyReply, FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { claimsDoToken, entrouPelaSenha, linhaDaSessao } from '../lib/doisFatores.js'
import type { ClaimsDaSessao } from '../lib/doisFatores.js'

export interface SessaoDoPaciente {
  email: string | null
  claims: ClaimsDaSessao | null
  /** Preferência do paciente: verificação em duas etapas por e-mail. */
  doisFatores: boolean
}

// Disponibiliza request.pacienteId nas rotas autenticadas.
declare module 'fastify' {
  interface FastifyRequest {
    pacienteId: string
    sessao: SessaoDoPaciente
  }
}

/** Código do 403 que leva o web à tela do código. */
export const DOIS_FATORES_PENDENTE = 'DOIS_FATORES_PENDENTE'

// preHandler das rotas da própria verificação: valida o JWT Supabase e resolve
// o paciente, SEM exigir a segunda etapa. Deriva o paciente do próprio token
// (D4) — evita IDOR via :pacienteId na URL.
export async function authenticateParcial(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw request.server.httpErrors.unauthorized('Token ausente')
  }
  const token = header.slice('Bearer '.length)

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw request.server.httpErrors.unauthorized('Token inválido')
  }

  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, dois_fatores_email')
    .eq('auth_user_id', data.user.id)
    .single()

  if (pacienteError || !paciente) {
    throw request.server.httpErrors.unauthorized('Paciente não encontrado')
  }

  request.pacienteId = paciente.id as string
  request.sessao = {
    email: data.user.email ?? null,
    // O token já foi aceito pelo Auth acima: decodificar o payload é seguro.
    claims: claimsDoToken(token),
    doisFatores: (paciente as { dois_fatores_email?: boolean }).dois_fatores_email === true,
  }
}

/** A sessão já passou pelas duas etapas (ou o paciente não usa a verificação). */
export async function sessaoLiberada(sessao: SessaoDoPaciente): Promise<boolean> {
  if (!sessao.doisFatores) return true
  // Só a sessão aberta pela senha vale: a aberta só pelo código, nunca.
  if (!entrouPelaSenha(sessao.claims)) return false
  const linha = await linhaDaSessao(sessao.claims!.sessionId)
  return linha?.verificada_em != null
}

// preHandler das rotas de dados: o paciente da sessão, já com a segunda etapa
// conferida quando ele a usa. Sem ela, 403 DOIS_FATORES_PENDENTE.
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticateParcial(request)
  if (await sessaoLiberada(request.sessao)) return
  return reply.code(403).send({
    statusCode: 403,
    error: 'Forbidden',
    codigo: DOIS_FATORES_PENDENTE,
    message: 'Confirme o código enviado ao seu e-mail.',
  })
}
