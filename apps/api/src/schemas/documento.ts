import { z } from 'zod'

// Campos de TEXTO do multipart POST /documentos (o arquivo vem na parte `file`).
// O tipo do arquivo não é validado aqui: vem dos magic bytes (lib/fileType.ts),
// não de nada que o cliente declare.
export const uploadDocumentoSchema = z.object({
  tipo: z.enum(['identidade', 'carteirinha', 'pedido_medico', 'outro']),
  // Presente = documento daquela coleta (pedido médico). Ausente = perene
  // (identidade, carteirinha), vale para toda coleta.
  agendamentoId: z.string().uuid().optional(),
})

// Query do GET /documentos.
export const listarDocumentosSchema = z.object({
  agendamentoId: z.string().uuid().optional(),
  // 'perenes' = só os sem agendamento (identidade/carteirinha).
  escopo: z.enum(['perenes', 'todos']).optional(),
})

// Params das rotas por id.
export const documentoIdParamSchema = z.object({ id: z.string().uuid() })

// Param da rota de integração (labhubId = agendamentos.id). O .uuid() não é
// cosmético aqui: é ele que torna seguro interpolar o valor no filtro .or() do
// PostgREST em routes/integracao.ts.
export const labhubIdParamSchema = z.object({ labhubId: z.string().uuid() })

// Query do POST /integracao/agendamentos/:labhubId/documentos (upload pela recepção
// do FlowLab). O arquivo vem no corpo binário; só o `tipo` viaja na query. O tipo
// REAL do arquivo continua vindo dos magic bytes (lib/fileType.ts), não daqui.
export const uploadDocumentoIntegracaoQuerySchema = z.object({
  tipo: z.enum(['identidade', 'carteirinha', 'pedido_medico', 'outro']),
})
