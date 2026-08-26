import type { FastifyInstance } from 'fastify'
import type { Resultado } from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { authenticateAdmin } from '../middlewares/adminAuth.js'
import { toResultado } from '../lib/mappers.js'
import { marcarRetificados } from '../lib/retificacao.js'
import { mensagemZod } from '../lib/validacao.js'
import { adminConsultaResultadosQuerySchema } from '../schemas/admin.js'

// Nunca devolve capacidade de download do paciente-alvo (spec, Implementation
// Decisions): `laudoUrl`/`declaracaoUrl` são o PATH do arquivo no bucket, não
// uma signed URL, mas a consulta admin não tem por que carregar nem essa
// referência — esta fatia é só a lista, sem laudo nem declaração.
function semReferenciaDeArquivo(r: Resultado): Resultado {
  const { laudoUrl: _laudoUrl, declaracaoUrl: _declaracaoUrl, ...resto } = r
  return resto
}

// Consulta administrativa de DESENVOLVIMENTO: dado um CPF, devolve a
// identidade mínima do paciente e os `resultado` FlowLab dele. Read-only —
// nunca edita nem exclui nada, e não grava trilha de auditoria própria (decisão
// explícita da spec para esta versão). Autorização (ambiente + e-mail) fica
// inteira em middlewares/adminAuth.ts; esta rota só resolve o paciente pelo
// CPF e lista o que já é exposto por GET /resultados, agora para um paciente
// escolhido pelo servidor (nunca por um id vindo do navegador). Ver
// .scratch/consulta-dev-resultados-por-cpf.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/resultados-por-cpf', { preHandler: authenticateAdmin }, async (request) => {
    const parsed = adminConsultaResultadosQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      throw app.httpErrors.badRequest(mensagemZod(parsed.error))
    }
    const { cpf } = parsed.data

    // excluido_em: mesmo corte de exclusão de conta (LGPD art. 18 VI) — um CPF
    // de conta apagada não deve reaparecer numa consulta nova só porque a
    // coluna sobrevive ao expurgo (ver lib/apagarPaciente.ts).
    const { data: paciente, error } = await supabase
      .from('pacientes')
      .select('id, nome, cpf')
      .eq('cpf', cpf)
      .is('excluido_em', null)
      .maybeSingle()
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao buscar paciente')
    }
    if (!paciente) {
      throw app.httpErrors.notFound('Paciente não encontrado')
    }

    const pacienteId = paciente.id as string

    const { data: resultadosRows, error: resultadosError } = await supabase
      .from('resultados')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('liberado_em', { ascending: false, nullsFirst: false })
      .order('criado_em', { ascending: false })
    if (resultadosError) {
      throw app.httpErrors.internalServerError('Falha ao listar resultados')
    }
    const resultados = marcarRetificados((resultadosRows ?? []).map(toResultado)).map(
      semReferenciaDeArquivo,
    )

    return {
      paciente: { id: pacienteId, nome: paciente.nome as string, cpf: paciente.cpf as string },
      resultados,
    }
  })
}
