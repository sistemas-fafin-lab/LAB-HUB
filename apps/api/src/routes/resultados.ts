import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { toResultado } from '../lib/mappers.js'

export async function resultadosRoutes(app: FastifyInstance): Promise<void> {
  // GET /resultados — lista os resultados do paciente autenticado.
  app.get('/resultados', { preHandler: authenticate }, async (request) => {
    const { data, error } = await supabase
      .from('resultados')
      .select('*')
      .eq('paciente_id', request.pacienteId)
      .order('liberado_em', { ascending: false, nullsFirst: false })
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao listar resultados')
    }
    return (data ?? []).map(toResultado)
  })

  // GET /resultados/:id/declaracao — gera signed URL do PDF no bucket privado.
  app.get('/resultados/:id/declaracao', { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string }

    // Garante que o resultado é do paciente e possui declaração.
    const { data: resultado, error } = await supabase
      .from('resultados')
      .select('declaracao_url')
      .eq('id', id)
      .eq('paciente_id', request.pacienteId)
      .single()
    if (error || !resultado?.declaracao_url) {
      throw app.httpErrors.notFound('Declaração não encontrada')
    }

    // declaracao_url guarda o path do arquivo no bucket 'laudos'.
    const { data: signed, error: signedError } = await supabase.storage
      .from('laudos')
      .createSignedUrl(resultado.declaracao_url as string, 3600)
    if (signedError || !signed) {
      throw app.httpErrors.internalServerError('Falha ao gerar URL assinada')
    }

    return { url: signed.signedUrl }
  })
}
