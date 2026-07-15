import type { FastifyInstance } from 'fastify'
import type { DocumentoFlowLab, TipoDocumento } from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { autenticarFlowlab } from '../middlewares/apiKey.js'
import { labhubIdParamSchema } from '../schemas/documento.js'
import type { DocumentoRow } from '../lib/mappers.js'

// Rotas consumidas PELO FlowLab (server-to-server, autenticadas por API key).
// Ficam num arquivo separado de propósito: este módulo não importa `authenticate`,
// então não há como esquecer o preHandler e cair no buraco do middlewares/auth.ts
// (`pacienteId: string` é declarado não-opcional via declaration merging — uma
// rota sem o preHandler compila e faz .eq('paciente_id', undefined) em silêncio).

const BUCKET = 'documentos'

// TTL maior que o do paciente (300s): é a duração de uma sessão de conferência no
// balcão. O funcionário abre a ficha, olha identidade/carteirinha/pedido e
// registra a coleta.
const FLOWLAB_URL_TTL_SEGUNDOS = 900

export async function integracaoRoutes(app: FastifyInstance): Promise<void> {
  // GET /integracao/agendamentos/:labhubId/documentos
  //
  // Consumida pelo FlowLab no check-in. Devolve signed URLs FRESCAS, geradas
  // agora: os arquivos ficam só aqui e nada é copiado p/ o FlowLab (uma cópia dos
  // bytes, um lugar p/ apagar — LGPD).
  app.get(
    '/integracao/agendamentos/:labhubId/documentos',
    {
      preHandler: autenticarFlowlab, // API key, NÃO JWT de paciente
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request) => {
      const parsed = labhubIdParamSchema.safeParse(request.params)
      if (!parsed.success) {
        throw app.httpErrors.badRequest('labhubId inválido')
      }

      // O FlowLab só conhece o agendamento (labhub_id = agendamentos.id) e NUNCA
      // envia paciente_id — resolvemos o paciente a partir do agendamento. Assim
      // não existe forma de pedir "os documentos do paciente X": o escopo é
      // sempre derivado de um agendamento que o FlowLab já recebeu.
      const { data: ag, error: agError } = await supabase
        .from('agendamentos')
        .select('id, paciente_id')
        .eq('id', parsed.data.labhubId)
        .maybeSingle()
      if (agError) {
        throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
      }
      if (!ag) {
        throw app.httpErrors.notFound('Agendamento não encontrado')
      }

      // Documentos daquela coleta (pedido médico) + os perenes do paciente
      // (identidade, carteirinha) — exatamente o que o check-in precisa ver.
      // A interpolação no .or() é segura porque ag.id vem de uma coluna uuid e o
      // labhubId passou pelo .uuid() do zod. Remover qualquer um dos dois abre
      // injeção de filtro no PostgREST.
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('paciente_id', ag.paciente_id as string)
        .or(`agendamento_id.eq.${ag.id as string},agendamento_id.is.null`)
        .order('criado_em', { ascending: false })
      if (error) {
        throw app.httpErrors.internalServerError('Falha ao listar documentos')
      }

      const docs = (data ?? []) as DocumentoRow[]
      // Curto-circuito: createSignedUrls([]) é uma ida ao Storage sem propósito.
      if (docs.length === 0) {
        return { agendamentoLabhubId: ag.id as string, documentos: [] }
      }

      // createSignedUrls (plural): uma ida ao Storage p/ N documentos, não N.
      const { data: assinadas, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          docs.map((d) => d.storage_path),
          FLOWLAB_URL_TTL_SEGUNDOS,
        )
      if (signError || !assinadas) {
        throw app.httpErrors.internalServerError('Falha ao gerar URLs assinadas')
      }

      const expiraEm = new Date(Date.now() + FLOWLAB_URL_TTL_SEGUNDOS * 1000).toISOString()
      // Casa por path, não por índice: createSignedUrls devolve erro POR ITEM e
      // confiar na ordem faria a URL de um documento sair no lugar de outro —
      // o funcionário veria a identidade de um paciente sob o rótulo de outro doc.
      const porPath = new Map(assinadas.map((a) => [a.path, a]))
      const documentos = docs.flatMap<DocumentoFlowLab>((d) => {
        const assinada = porPath.get(d.storage_path)
        if (!assinada?.signedUrl) {
          request.log.error(
            { storagePath: d.storage_path },
            'Falha ao assinar documento — omitido da resposta',
          )
          return []
        }
        return [
          {
            id: d.id,
            tipo: d.tipo as TipoDocumento,
            nomeArquivo: d.nome_arquivo,
            mimeType: d.mime_type,
            tamanhoBytes: d.tamanho_bytes,
            criadoEm: d.criado_em,
            url: assinada.signedUrl,
            expiraEm,
          },
        ]
      })

      return { agendamentoLabhubId: ag.id as string, documentos }
    },
  )
}
