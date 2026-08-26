import type { FastifyInstance } from 'fastify'
import type { Resultado } from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { authenticateAdmin } from '../middlewares/adminAuth.js'
import { decifrarCpfPaciente, hashCpf } from '../lib/crypto.js'
import { toResultado } from '../lib/mappers.js'
import { marcarRetificados } from '../lib/retificacao.js'
import { mensagemZod } from '../lib/validacao.js'
import { adminConsultaResultadosQuerySchema } from '../schemas/admin.js'
import { laudoService } from '../laudos/index.js'

// Nunca devolve capacidade de download do paciente-alvo (spec, Implementation
// Decisions): `laudoUrl`/`declaracaoUrl` são o PATH do arquivo no bucket, não
// uma signed URL, mas a consulta admin não tem por que carregar nem essa
// referência — esta fatia é só a lista, sem laudo nem declaração.
function semReferenciaDeArquivo(r: Resultado): Resultado {
  const { laudoUrl: _laudoUrl, declaracaoUrl: _declaracaoUrl, ...resto } = r
  return resto
}

// Consulta administrativa de DESENVOLVIMENTO: dado um CPF, devolve a
// identidade mínima do paciente, os `resultado` FlowLab e os `laudo` do cache
// LIS (exam_results) dele — a mesma composição de fontes da aba Resultados do
// portal. Read-only — nunca edita nem exclui nada, e não grava trilha de
// auditoria própria (decisão explícita da spec para esta versão). Autorização
// (ambiente + e-mail) fica inteira em middlewares/adminAuth.ts; esta rota só
// resolve o paciente pelo CPF e lista o que já é exposto por GET /resultados e
// GET /laudos, agora para um paciente escolhido pelo servidor (nunca por um id
// vindo do navegador). Os laudos vêm só do cache — nunca dispara busca ao vivo
// no ApLIS/AOL (ver LaudoService#readCachedExams). Ver
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
    // Fase 2b (S-06, ticket 02): busca pelo índice cego — `cpf` em claro não é
    // mais lido por este caminho. PRECONDIÇÃO DE DEPLOY: exige o backfill de
    // cpf_hash/cpf_enc já ter rodado (ver crypto.ts#decifrarCpfPaciente).
    const { data: paciente, error } = await supabase
      .from('pacientes')
      .select('id, nome, cpf_enc')
      .eq('cpf_hash', hashCpf(cpf))
      .is('excluido_em', null)
      .maybeSingle()
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao buscar paciente')
    }
    if (!paciente) {
      throw app.httpErrors.notFound('Paciente não encontrado')
    }

    const pacienteId = paciente.id as string
    const cpfDecifrado = decifrarCpfPaciente(pacienteId, paciente.cpf_enc as string)

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

    // Cache-only: `readCachedExams` nunca chama ApLIS/AOL nem grava linha —
    // ver o porquê no próprio método. Falha aqui (banco ou descriptografia)
    // vira 500 seguro: não pode aparecer como "paciente sem laudo".
    let laudos: Awaited<ReturnType<typeof laudoService.readCachedExams>>
    try {
      laudos = await laudoService.readCachedExams(pacienteId, cpfDecifrado)
    } catch {
      throw app.httpErrors.internalServerError('Falha ao consultar laudos')
    }

    return {
      paciente: { id: pacienteId, nome: paciente.nome as string, cpf: cpfDecifrado },
      resultados,
      laudos,
    }
  })
}
