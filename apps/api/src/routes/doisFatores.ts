import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { mensagemZod } from '../lib/validacao.js'
import { authenticateParcial } from '../middlewares/auth.js'
import {
  FalhaAoGravar,
  INTERVALO_ENTRE_ENVIOS_MS,
  RECUSAS,
  conferirCodigoDaSessao,
  contaBloqueada,
  expurgarSessoesVencidas,
  otp,
  precisaEntrarDeNovo,
  registrarEnvio,
  senhaRecente,
  situacaoDaSessao,
} from '../lib/doisFatores.js'
import type { Recusa } from '../lib/doisFatores.js'
import { enviarCodigoSchema, preferenciaSchema, verificarCodigoSchema } from '../schemas/doisFatores.js'

// ---------------------------------------------------------------------------
// Verificação em duas etapas por e-mail (PV2-26). Estas rotas aceitam a
// sessão que ainda não passou pelo código (authenticateParcial); todas as
// outras rotas de dados exigem que ela tenha passado (authenticate).
// ---------------------------------------------------------------------------

/** Resposta de erro com `codigo` estável, no mesmo formato do 403 do authenticate. */
export function enviarRecusa(reply: FastifyReply, r: Recusa) {
  return reply.code(r.status).send({ statusCode: r.status, error: 'Recusado', codigo: r.codigo, message: r.message })
}

function sessionIdDe(request: FastifyRequest): string {
  const id = request.sessao.claims?.sessionId
  if (!id) throw request.server.httpErrors.unauthorized('Sessão sem identificador')
  return id
}

const agoraIso = () => new Date().toISOString()

export async function doisFatoresRoutes(app: FastifyInstance): Promise<void> {
  // Gravação que falhou vira 500, nunca um "deu certo" sem ter gravado.
  app.setErrorHandler((erro, request, reply) => {
    if (erro instanceof FalhaAoGravar) {
      request.log.error({ err: erro.cause }, erro.message)
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Não foi possível concluir. Tente de novo em instantes.' })
    }
    // O resto segue para o tratamento padrão (o do app pai).
    throw erro
  })

  // GET /auth/dois-fatores — preferência e situação da sessão atual.
  app.get('/auth/dois-fatores', { preHandler: authenticateParcial }, async (request) => {
    const { sessao } = request
    const { liberada, linha } = await situacaoDaSessao(sessao)
    return {
      ativa: sessao.doisFatores,
      pendente: !liberada,
      // A sessão pendente que não consegue fazer a etapa do código (senha
      // antiga, link de recuperação): o web manda entrar de novo.
      entrarDeNovo: !liberada && precisaEntrarDeNovo(sessao),
      enviadoEm: linha?.enviado_em ?? null,
    }
  })

  // POST /auth/dois-fatores/enviar — manda o código ao e-mail da conta.
  app.post(
    '/auth/dois-fatores/enviar',
    { preHandler: authenticateParcial, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = enviarCodigoSchema.safeParse(request.body)
      if (!parsed.success) throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      const { sessao } = request
      const { liberada, linha } = await situacaoDaSessao(sessao)
      if (parsed.data.finalidade === 'login') {
        // A etapa de entrada só existe para quem ligou a verificação, e só
        // logo depois da senha.
        if (!sessao.doisFatores || liberada) throw app.httpErrors.forbidden('Esta sessão não precisa do código.')
        if (precisaEntrarDeNovo(sessao)) return enviarRecusa(reply, RECUSAS.entreDeNovo)
      } else if (!liberada) {
        // O código de confirmação confirma uma mudança; não abre acesso.
        throw app.httpErrors.forbidden('Confirme o código de entrada antes.')
      }
      if (!sessao.email) throw app.httpErrors.forbidden('Conta sem e-mail.')
      if (await contaBloqueada(request.pacienteId)) return enviarRecusa(reply, RECUSAS.bloqueada)
      if (linha?.enviado_em && Date.now() - Date.parse(linha.enviado_em) < INTERVALO_ENTRE_ENVIOS_MS) {
        return enviarRecusa(reply, RECUSAS.aguarde)
      }

      const envio = await otp.enviar(sessao.email)
      if (!envio.ok) return enviarRecusa(reply, envio.limite ? RECUSAS.aguarde : RECUSAS.envioFalhou)

      const enviadoEm = await registrarEnvio(sessionIdDe(request), request.pacienteId)
      expurgarSessoesVencidas(request.log)
      return { enviadoEm }
    },
  )

  // POST /auth/dois-fatores/verificar — confere o código e libera a sessão.
  app.post(
    '/auth/dois-fatores/verificar',
    { preHandler: authenticateParcial, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = verificarCodigoSchema.safeParse(request.body)
      if (!parsed.success) throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      // A sessão aberta só pelo código nunca vira "senha + código"; e a senha
      // precisa ser recente.
      if (!senhaRecente(request.sessao.claims)) return enviarRecusa(reply, RECUSAS.entreDeNovo)
      const recusa = await conferirCodigoDaSessao(request.sessao, request.pacienteId, parsed.data.codigo, {
        verificada_em: agoraIso(),
      })
      if (recusa) return enviarRecusa(reply, recusa)
      return { verificada: true }
    },
  )

  // POST /auth/dois-fatores/preferencia — liga ou desliga, com o código.
  app.post(
    '/auth/dois-fatores/preferencia',
    { preHandler: authenticateParcial, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = preferenciaSchema.safeParse(request.body)
      if (!parsed.success) throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      const { sessao } = request
      if (!(await situacaoDaSessao(sessao)).liberada) throw app.httpErrors.forbidden('Confirme o código de entrada antes.')
      // Ligar numa sessão que não entrou pela senha (link de recuperação) a
      // deixaria pendente na hora, sem como fazer a etapa do código.
      if (parsed.data.ativa && precisaEntrarDeNovo(sessao)) return enviarRecusa(reply, RECUSAS.entreDeNovo)

      // Ao ligar, a sessão atual já provou o e-mail: fica verificada na mesma
      // gravação que consome o código.
      const recusa = await conferirCodigoDaSessao(
        sessao,
        request.pacienteId,
        parsed.data.codigo,
        parsed.data.ativa ? { verificada_em: agoraIso() } : {},
      )
      if (recusa) return enviarRecusa(reply, recusa)

      const { error } = await supabase
        .from('pacientes')
        .update({ dois_fatores_email: parsed.data.ativa })
        .eq('id', request.pacienteId)
      if (error) throw new FalhaAoGravar('preferência', error)
      return { ativa: parsed.data.ativa }
    },
  )
}
