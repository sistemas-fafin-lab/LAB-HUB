import { z } from 'zod'
import { cpfDigitosSchema } from '../lib/cpf.js'

// Query do GET /admin/resultados-por-cpf — consulta administrativa
// (ver .scratch/consulta-admin-cpf-producao).
export const adminConsultaResultadosQuerySchema = z.object({
  cpf: cpfDigitosSchema,
})
