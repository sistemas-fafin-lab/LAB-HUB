import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { toResultado } from '../lib/mappers.js'

// Mesmo TTL de documentos.ts, e pela mesma razão: signed URL é capability ao
// portador sobre dado de saúde — vaza por histórico do browser, Referer, log de
// proxy e tela compartilhada. Uma URL de laudo válida por uma hora (o valor
// anterior aqui) sobrevive ao link colado no lugar errado; 5 min bastam para
// abrir ou baixar, e o cliente pede outra quando precisar.
const URL_TTL_SEGUNDOS = 300

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
    //
    // maybeSingle + erro separado de "não encontrado": fundir os dois fazia uma
    // falha transitória do banco virar um 404 mentiroso — o paciente lia
    // "declaração não encontrada" para um laudo que existe, e desistia em vez de
    // tentar de novo. Quem investiga também perdia o rastro: 404 não é anomalia,
    // então nada aparecia no log.
    const { data: resultado, error } = await supabase
      .from('resultados')
      .select('declaracao_url')
      .eq('id', id)
      .eq('paciente_id', request.pacienteId)
      .maybeSingle()
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao carregar resultado')
    }
    // Resultado de outro paciente, id inexistente e resultado sem declaração
    // caem no mesmo 404 de propósito: a resposta não conta a quem o id pertence.
    if (!resultado?.declaracao_url) {
      throw app.httpErrors.notFound('Declaração não encontrada')
    }

    // declaracao_url guarda o path do arquivo no bucket 'laudos'.
    const { data: signed, error: signedError } = await supabase.storage
      .from('laudos')
      .createSignedUrl(resultado.declaracao_url as string, URL_TTL_SEGUNDOS)
    if (signedError || !signed) {
      throw app.httpErrors.internalServerError('Falha ao gerar URL assinada')
    }

    return { url: signed.signedUrl }
  })
}
