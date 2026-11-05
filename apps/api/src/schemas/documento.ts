import { z } from 'zod'

// Campos de TEXTO do multipart POST /documentos (o arquivo vem na parte `file`).
// O tipo do arquivo não é validado aqui: vem dos magic bytes (lib/fileType.ts),
// não de nada que o cliente declare.
export const uploadDocumentoSchema = z.object({
  tipo: z.enum(['identidade', 'carteirinha', 'pedido_medico', 'outro']),
  // Presente = documento daquela coleta (pedido médico). Ausente = perene
  // (identidade, carteirinha), vale para toda coleta.
  agendamentoId: z.guid().optional(),
})

// Query do GET /documentos.
export const listarDocumentosSchema = z.object({
  agendamentoId: z.guid().optional(),
  // 'perenes' = só os sem agendamento (identidade/carteirinha).
  escopo: z.enum(['perenes', 'todos']).optional(),
})

// Params das rotas por id.
export const documentoIdParamSchema = z.object({ id: z.guid() })

// Param da rota de integração (labhubId = agendamentos.id). O z.guid() não é
// cosmético aqui: é ele que torna seguro interpolar o valor no filtro .or() do
// PostgREST em routes/integracao.ts (só passa hex e hífen, 8-4-4-4-12).
//
// z.guid(), e não z.uuid(), em todo o projeto: no zod 4 o z.uuid() exige versão e
// variante RFC 9562, e o z.guid() é o formato que o .uuid() do zod 3 aceitava.
// IDs vêm também do FlowLab; apertar a validação na troca de versão recusaria
// sem aviso qualquer um que não siga o RFC.
export const labhubIdParamSchema = z.object({ labhubId: z.guid() })

// Query do POST /integracao/agendamentos/:labhubId/documentos (upload pela recepção
// do FlowLab). O arquivo vem no corpo binário; só o `tipo` viaja na query. O tipo
// REAL do arquivo continua vindo dos magic bytes (lib/fileType.ts), não daqui.
export const uploadDocumentoIntegracaoQuerySchema = z.object({
  tipo: z.enum(['identidade', 'carteirinha', 'pedido_medico', 'outro']),
})
