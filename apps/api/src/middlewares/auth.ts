import type { FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'

// Disponibiliza request.pacienteId nas rotas autenticadas.
declare module 'fastify' {
  interface FastifyRequest {
    pacienteId: string
  }
}

// preHandler: valida o JWT Supabase e resolve o pacienteId a partir do token.
// Deriva o paciente do próprio token (D4) — evita IDOR via :pacienteId na URL.
export async function authenticate(request: FastifyRequest): Promise<void> {
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
    .select('id')
    .eq('auth_user_id', data.user.id)
    .single()

  if (pacienteError || !paciente) {
    throw request.server.httpErrors.unauthorized('Paciente não encontrado')
  }

  request.pacienteId = paciente.id as string
}
