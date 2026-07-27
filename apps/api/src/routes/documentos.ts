import { randomUUID } from 'node:crypto'
import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { flowlab } from '../lib/flowlab.js'
import { authenticate } from '../middlewares/auth.js'
import { detectarTipoArquivo } from '../lib/fileType.js'
import { toDocumento, type DocumentoRow } from '../lib/mappers.js'
import {
  documentoIdParamSchema,
  listarDocumentosSchema,
  uploadDocumentoSchema,
} from '../schemas/documento.js'

const BUCKET = 'documentos'

const TAMANHO_MAX_BYTES = 10 * 1024 * 1024 // casa com o file_size_limit do bucket

// TTL curto: signed URL é capability ao portador sobre dado pessoal sensível —
// vaza por histórico do browser, Referer, log e tela compartilhada. 5 min bastam
// para abrir/baixar, e o cliente pede outra quando precisar. Bem menor que os
// 3600s de resultados.ts, que servem um laudo já entregue ao paciente.
const URL_TTL_SEGUNDOS = 300

// Limite do nome exibido. O nome original NÃO compõe o path (que é UUID), mas vai
// para o Content-Disposition da signed URL de download e é renderizado no FlowLab.
const NOME_MAX_CHARS = 120

// Só exibição: corta, remove quebras de linha (que envenenariam o header
// Content-Disposition) e garante algo não-vazio.
function sanitizarNome(original: string | undefined, extensao: string): string {
  const limpo = (original ?? '').replace(/[\r\n\t]/g, '').trim().slice(0, NOME_MAX_CHARS)
  return limpo || `documento.${extensao}`
}

export async function documentosRoutes(app: FastifyInstance): Promise<void> {
  // Parser multipart. @fastify/multipart é fp-wrapped, então este registro sobe
  // p/ a raiz mesmo declarado aqui — inofensivo (não conflita com o parser JSON
  // local de webhooks.ts, que tem escopo próprio) e necessário: o buildApp dos
  // testes (test/helpers.ts) só registra a rota sob teste, então o parser
  // precisa vir junto do plugin.
  await app.register(multipart, {
    limits: { fileSize: TAMANHO_MAX_BYTES, files: 1, fields: 4 },
  })

  // POST /documentos — recebe o arquivo, valida os bytes e grava.
  //
  // Ordem deliberada: tudo que pode falhar sem custo acontece ANTES do upload,
  // de forma que só o insert (passo final) deixa algo para limpar — e ele tem
  // compensação. O id é pré-gerado para que o path exista antes do insert.
  app.post(
    '/documentos',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parte = await request.file()
      if (!parte) {
        throw app.httpErrors.badRequest('Arquivo ausente')
      }

      // Bufferiza ANTES de ler parte.fields: com request.file(), os campos de
      // texto só estão todos populados depois que o stream do arquivo é
      // consumido. Ler antes perderia em silêncio os campos que vieram após o
      // arquivo no FormData.
      let buffer: Buffer
      try {
        buffer = await parte.toBuffer()
      } catch {
        // fileSize estourado → RequestFileTooLargeError do @fastify/multipart.
        throw app.httpErrors.payloadTooLarge(
          `Arquivo maior que ${TAMANHO_MAX_BYTES / 1024 / 1024} MB`,
        )
      }

      const parsed = uploadDocumentoSchema.safeParse({
        tipo: parte.fields.tipo && 'value' in parte.fields.tipo ? parte.fields.tipo.value : undefined,
        agendamentoId:
          parte.fields.agendamentoId && 'value' in parte.fields.agendamentoId
            ? parte.fields.agendamentoId.value || undefined
            : undefined,
      })
      if (!parsed.success) {
        throw app.httpErrors.badRequest(parsed.error.message)
      }
      const { tipo, agendamentoId } = parsed.data

      // Posse do agendamento ANTES de subir bytes: falha aqui não deixa nada p/
      // limpar. Sem isto, um paciente anexaria um "pedido médico" ao agendamento
      // de outro.
      if (agendamentoId) {
        const { data: ag, error: agError } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('id', agendamentoId)
          .eq('paciente_id', request.pacienteId)
          .maybeSingle()
        if (agError) {
          throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
        }
        if (!ag) {
          throw app.httpErrors.notFound('Agendamento não encontrado')
        }
      }

      const formato = detectarTipoArquivo(buffer)
      if (!formato) {
        throw app.httpErrors.badRequest('Formato não suportado. Envie JPG, PNG, WEBP ou PDF.')
      }

      // Id pré-gerado: permite derivar o path antes do insert, deixando UMA
      // janela de falha (o insert) — e ela tem compensação.
      // Path = {paciente_id}/{documento_id}.{ext}: o prefixo namespeia por dono e
      // o nome é UUID, não o nome do usuário (sem traversal, colisão ou unicode).
      const documentoId = randomUUID()
      const storagePath = `${request.pacienteId}/${documentoId}.${formato.extensao}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: formato.mimeType, // o SNIFFADO, nunca parte.mimetype
          upsert: false,
        })
      if (uploadError) {
        request.log.error({ err: uploadError, storagePath }, 'Falha ao enviar arquivo ao Storage')
        throw app.httpErrors.internalServerError('Falha ao enviar arquivo')
      }

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          id: documentoId,
          paciente_id: request.pacienteId,
          agendamento_id: agendamentoId ?? null,
          tipo,
          nome_arquivo: sanitizarNome(parte.filename, formato.extensao),
          storage_path: storagePath,
          mime_type: formato.mimeType,
          tamanho_bytes: buffer.length,
        })
        .select()
        .single()

      if (error || !data) {
        // Compensação: o objeto subiu mas a linha não existe — nada aponta p/ o
        // path, então o arquivo é inalcançável. Remove p/ não deixar lixo (e dado
        // pessoal) no bucket. Se a própria remoção falhar, logamos: o path é
        // determinístico e não-referenciado, dá p/ reconciliar depois comparando
        // o bucket com a tabela.
        const { error: limpezaError } = await supabase.storage.from(BUCKET).remove([storagePath])
        if (limpezaError) {
          request.log.error(
            { err: limpezaError, storagePath },
            'Objeto órfão no bucket após insert falho',
          )
        }
        throw app.httpErrors.internalServerError('Falha ao registrar documento')
      }

      // Avisa o FlowLab que o pedido médico chegou, para o enfileiramento
      // automático ao apoio (Álvaro). Só o pedido médico interessa ao OCR — os
      // outros tipos (identidade, carteirinha) não disparam nada. Best-effort e
      // NÃO-bloqueante: a resposta ao paciente não pode depender do FlowLab, e uma
      // falha aqui não invalida o documento já persistido (o FlowLab reconcilia
      // pelo gatilho de receive-agendamento e pelo "Processar pendentes").
      if (agendamentoId && tipo === 'pedido_medico') {
        void flowlab
          .notifyDocumento({ labhubId: agendamentoId, tipo })
          .catch((err: unknown) => {
            request.log.error({ err, agendamentoId }, 'Falha ao notificar FlowLab do pedido médico')
          })
      }

      return reply.code(201).send(toDocumento(data as DocumentoRow))
    },
  )

  // GET /documentos — lista os documentos do paciente autenticado.
  //   ?escopo=perenes         → só os sem agendamento (identidade, carteirinha)
  //   ?agendamentoId=<uuid>   → os daquela coleta
  //   (nenhum)                → todos
  app.get('/documentos', { preHandler: authenticate }, async (request) => {
    const parsed = listarDocumentosSchema.safeParse(request.query)
    if (!parsed.success) {
      throw app.httpErrors.badRequest(parsed.error.message)
    }
    const { escopo, agendamentoId } = parsed.data

    let query = supabase.from('documentos').select('*').eq('paciente_id', request.pacienteId)
    if (escopo === 'perenes') {
      query = query.is('agendamento_id', null)
    } else if (agendamentoId) {
      query = query.eq('agendamento_id', agendamentoId)
    }

    const { data, error } = await query.order('criado_em', { ascending: false })
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao listar documentos')
    }
    return ((data ?? []) as DocumentoRow[]).map(toDocumento)
  })

  // GET /documentos/:id/url — signed URL temporária do bucket privado.
  // ?download=true força o download com o nome original (Content-Disposition).
  app.get('/documentos/:id/url', { preHandler: authenticate }, async (request) => {
    const parsed = documentoIdParamSchema.safeParse(request.params)
    if (!parsed.success) {
      throw app.httpErrors.badRequest('Id inválido')
    }
    const { download } = request.query as { download?: string }

    // maybeSingle + erro separado de "não encontrado": resultados.ts:31 funde os
    // dois, e aí uma falha transitória do banco vira um 404 mentiroso.
    const { data: doc, error } = await supabase
      .from('documentos')
      .select('storage_path, nome_arquivo')
      .eq('id', parsed.data.id)
      .eq('paciente_id', request.pacienteId)
      .maybeSingle()
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao carregar documento')
    }
    if (!doc) {
      throw app.httpErrors.notFound('Documento não encontrado')
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(
        doc.storage_path as string,
        URL_TTL_SEGUNDOS,
        download === 'true' ? { download: doc.nome_arquivo as string } : undefined,
      )
    if (signedError || !signed) {
      throw app.httpErrors.internalServerError('Falha ao gerar URL assinada')
    }

    return {
      url: signed.signedUrl,
      expiraEm: new Date(Date.now() + URL_TTL_SEGUNDOS * 1000).toISOString(),
    }
  })

  // DELETE /documentos/:id — remove o arquivo e a linha.
  app.delete('/documentos/:id', { preHandler: authenticate }, async (request, reply) => {
    const parsed = documentoIdParamSchema.safeParse(request.params)
    if (!parsed.success) {
      throw app.httpErrors.badRequest('Id inválido')
    }

    const { data: doc, error } = await supabase
      .from('documentos')
      .select('storage_path')
      .eq('id', parsed.data.id)
      .eq('paciente_id', request.pacienteId)
      .maybeSingle()
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao carregar documento')
    }
    if (!doc) {
      throw app.httpErrors.notFound('Documento não encontrado')
    }

    // Ordem deliberada: Storage primeiro, linha depois. Apagar os bytes é a parte
    // irreversível e juridicamente relevante (LGPD), então fazemos primeiro. Se a
    // remoção falhar, abortamos e a linha permanece — o paciente reclica
    // "excluir" e tenta de novo (storage.remove é idempotente: path inexistente
    // não é erro). A ordem inversa (linha primeiro) trocaria isso por bytes
    // órfãos, invisíveis e SEM caminho de retry — a linha que apontava p/ eles já
    // teria sumido. Risco residual aceito: linha viva apontando p/ objeto já
    // removido, se o delete do banco falhar depois. Feio (a URL 404), mas retriável.
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([doc.storage_path as string])
    if (storageError) {
      request.log.error(
        { err: storageError, storagePath: doc.storage_path },
        'Falha ao remover arquivo do Storage',
      )
      throw app.httpErrors.internalServerError('Falha ao excluir arquivo')
    }

    const { error: delError } = await supabase
      .from('documentos')
      .delete()
      .eq('id', parsed.data.id)
      .eq('paciente_id', request.pacienteId)
    if (delError) {
      throw app.httpErrors.internalServerError('Falha ao excluir documento')
    }

    return reply.code(204).send()
  })
}
