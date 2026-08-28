import type { FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'

/**
 * E-mail autorizado a usar a consulta administrativa.
 *
 * Fora de produção, a checagem é só o e-mail (comportamento original, sem
 * exigir disjuntor). Em produção, o disjuntor `ADMIN_RESULTS_ENABLED` (exigido
 * exatamente `"true"`, sem trim — qualquer outro valor, incluindo ausência, é
 * "desligado") precisa estar ligado ANTES de `ADMIN_EMAIL` sequer ser lido —
 * um valor esquecido lá não reabre nada sozinho. Falha fechada em qualquer
 * combinação incompleta: disjuntor desligado, ou e-mail ausente/vazio.
 */
function emailAdminHabilitado(): string | null {
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_RESULTS_ENABLED !== 'true') {
    return null
  }
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

  // Log de auditoria (ticket 02): só a linha de SUCESSO existe — qualquer throw
  // acima (disjuntor desligado, e-mail não autorizado, config ausente) já saiu
  // da função antes de chegar aqui, então uma negação nunca gera esta linha.
  // O CPF consultado não é lido nem passa por este middleware — não há como
  // esta linha vazá-lo. `request.log` é o pino do server.ts, com CAMPOS_REDIGIDOS
  // já configurado (ver lib/http.ts): mesmo mecanismo de redação dos demais
  // logs HTTP, reaproveitado aqui em vez de reinventado.
  request.log.info(
    { adminEmail: emailSessao, horario: new Date().toISOString() },
    'Consulta administrativa por CPF autorizada',
  )
}
