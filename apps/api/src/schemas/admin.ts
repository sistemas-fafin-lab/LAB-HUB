import { z } from 'zod'
import { cpfDigitosSchema } from '../lib/cpf.js'

// Query do GET /admin/resultados-por-cpf — consulta administrativa de dev
// (ver .scratch/consulta-dev-resultados-por-cpf).
export const adminConsultaResultadosQuerySchema = z.object({
  cpf: cpfDigitosSchema,
})
