import type { FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'

/**
 * E-mail autorizado a usar a consulta administrativa — só fora de produção.
 *
 * As duas travas (ambiente + config) implementam o "falha fechada" do ticket:
 * em produção a função nem lê `ADMIN_EMAIL` (um valor esquecido lá não reabre
 * nada), e em local/dev sem a variável configurada não existe e-mail nenhum
 * para comparar — os dois casos negam por ausência, nunca autorizam por ela.
 */
function emailAdminHabilitado(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  return email || null
}

/**
 * preHandler das rotas `/admin/*`: mesma sessão do portal (JWT Supabase),
 * autorizada só para o e-mail configurado em `ADMIN_EMAIL` (ver
 * emailAdminHabilitado). Token ausente ou inválido → 401; sessão válida mas
 * não autorizada (fora de dev, sem config, ou e-mail diferente) → 403.
 *
 * Não resolve nem depende do `pacienteId` do admin: o caminho administrativo
 * nunca deve tratar quem está logado como se fosse o titular do CPF
 * consultado (ver spec, Implementation Decisions).
 */
export async function authenticateAdmin(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw request.server.httpErrors.unauthorized('Token ausente')
  }
  const token = header.slice('Bearer '.length)

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw request.server.httpErrors.unauthorized('Token inválido')
  }

  const emailHabilitado = emailAdminHabilitado()
  const emailSessao = data.user.email?.trim().toLowerCase()
  if (!emailHabilitado || emailSessao !== emailHabilitado) {
    throw request.server.httpErrors.forbidden('Acesso não autorizado')
  }
}
