import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { mensagemZod } from '../lib/validacao.js'
import { authenticateParcial, sessaoLiberada } from '../middlewares/auth.js'
import {
  INTERVALO_ENTRE_ENVIOS_MS,
  TENTATIVAS_POR_CODIGO,
  VALIDADE_DA_LINHA_MS,
  conferirCodigo,
  enviarCodigo,
  entrouPelaSenha,
  linhaDaSessao,
} from '../lib/doisFatores.js'
import { enviarCodigoSchema, preferenciaSchema, verificarCodigoSchema } from '../schemas/doisFatores.js'

// ---------------------------------------------------------------------------
// Verificação em duas etapas por e-mail (PV2-26). Estas rotas aceitam a
// sessão que ainda não passou pelo código (authenticateParcial); todas as
// outras rotas de dados exigem que ela tenha passado (authenticate).
// ---------------------------------------------------------------------------

/** Resposta de erro com `codigo` estável, que o web usa para escolher o texto. */
function recusa(reply: FastifyReply, status: number, codigo: string, message: string) {
  return reply.code(status).send({ statusCode: status, codigo, message })
}

function sessionIdDe(request: FastifyRequest): string {
  const id = request.sessao.claims?.sessionId
  if (!id) throw request.server.httpErrors.unauthorized('Sessão sem identificador')
  return id
}

/**
 * Confere o código da sessão atual: contagem de tentativas e consumo do
 * código. Devolve true quando confere; false quando recusou (e a resposta já
 * foi enviada). Booleano de propósito: o FastifyReply é "thenable", e
 * devolvê-lo de uma função async faz o `await` resolvê-lo para undefined, o
 * que transformaria toda recusa num "confere".
 */
export async function conferirCodigoDaSessao(request: FastifyRequest, reply: FastifyReply, codigo: string): Promise<boolean> {
  const sessionId = sessionIdDe(request)
  const linha = await linhaDaSessao(sessionId)
  if (!linha?.enviado_em) {
    void recusa(reply, 400, 'CODIGO_INVALIDO', 'Código inválido ou expirado. Confira a mensagem ou peça um novo código.')
    return false
  }
  if (linha.tentativas >= TENTATIVAS_POR_CODIGO) {
    void recusa(reply, 429, 'TENTATIVAS_ESGOTADAS', 'Muitas tentativas. Peça um novo código.')
    return false
  }
  const email = request.sessao.email
  const confere = email !== null && (await conferirCodigo(email, codigo))
  if (!confere) {
    await supabase
      .from('sessoes_dois_fatores')
      .update({ tentativas: linha.tentativas + 1 })
      .eq('session_id', sessionId)
    void recusa(reply, 400, 'CODIGO_INVALIDO', 'Código inválido ou expirado. Confira a mensagem ou peça um novo código.')
    return false
  }
  // Código usado: não serve de novo (o Supabase também não aceita).
  await supabase
    .from('sessoes_dois_fatores')
    .update({ enviado_em: null, tentativas: 0 })
    .eq('session_id', sessionId)
  return true
}

export async function doisFatoresRoutes(app: FastifyInstance): Promise<void> {
  // GET /auth/dois-fatores — preferência e situação da sessão atual.
  app.get('/auth/dois-fatores', { preHandler: authenticateParcial }, async (request) => {
    const liberada = await sessaoLiberada(request.sessao)
    const id = request.sessao.claims?.sessionId
    const linha = id ? await linhaDaSessao(id) : null
    return { ativa: request.sessao.doisFatores, pendente: !liberada, enviadoEm: linha?.enviado_em ?? null }
  })

  // POST /auth/dois-fatores/enviar — manda o código ao e-mail da conta.
  app.post(
    '/auth/dois-fatores/enviar',
    { preHandler: authenticateParcial, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = enviarCodigoSchema.safeParse(request.body)
      if (!parsed.success) throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      const { sessao } = request
      // login: só a sessão que entrou pela senha recebe o código da segunda
      // etapa. confirmacao: só a sessão já liberada (o código confirma uma
      // mudança, não abre acesso).
      const pode =
        parsed.data.finalidade === 'login' ? entrouPelaSenha(sessao.claims) : await sessaoLiberada(sessao)
      if (!pode || !sessao.email) throw app.httpErrors.forbidden('Esta sessão não pode pedir o código.')

      const sessionId = sessionIdDe(request)
      const linha = await linhaDaSessao(sessionId)
      if (linha?.enviado_em && Date.now() - Date.parse(linha.enviado_em) < INTERVALO_ENTRE_ENVIOS_MS) {
        return recusa(reply, 429, 'AGUARDE_REENVIO', 'Aguarde um minuto para pedir outro código.')
      }

      const envio = await enviarCodigo(sessao.email)
      if (!envio.ok) {
        return envio.limite
          ? recusa(reply, 429, 'AGUARDE_REENVIO', 'Aguarde um minuto para pedir outro código.')
          : recusa(reply, 502, 'ENVIO_FALHOU', 'Não foi possível enviar o código. Tente de novo em instantes.')
      }

      const agora = new Date().toISOString()
      await supabase.from('sessoes_dois_fatores').upsert(
        { session_id: sessionId, paciente_id: request.pacienteId, enviado_em: agora, tentativas: 0 },
        { onConflict: 'session_id' },
      )
      // Expurgo das linhas vencidas, aproveitando o envio.
      await supabase
        .from('sessoes_dois_fatores')
        .delete()
        .lt('criada_em', new Date(Date.now() - VALIDADE_DA_LINHA_MS).toISOString())
      return { enviadoEm: agora }
    },
  )

  // POST /auth/dois-fatores/verificar — confere o código e libera a sessão.
  app.post(
    '/auth/dois-fatores/verificar',
    { preHandler: authenticateParcial, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = verificarCodigoSchema.safeParse(request.body)
      if (!parsed.success) throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      // A sessão aberta só pelo código nunca vira "senha + código".
      if (!entrouPelaSenha(request.sessao.claims)) {
        throw app.httpErrors.forbidden('Entre com a sua senha antes do código.')
      }
      if (!(await conferirCodigoDaSessao(request, reply, parsed.data.codigo))) return reply
      await supabase
        .from('sessoes_dois_fatores')
        .update({ verificada_em: new Date().toISOString() })
        .eq('session_id', sessionIdDe(request))
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
      if (!(await sessaoLiberada(request.sessao))) {
        throw app.httpErrors.forbidden('Confirme o código de entrada antes.')
      }
      if (!(await conferirCodigoDaSessao(request, reply, parsed.data.codigo))) return reply

      const { error } = await supabase
        .from('pacientes')
        .update({ dois_fatores_email: parsed.data.ativa })
        .eq('id', request.pacienteId)
      if (error) throw app.httpErrors.internalServerError('Falha ao salvar a preferência')
      // Ao ligar, a sessão atual já provou o e-mail: fica verificada, para o
      // paciente não cair na tela do código logo depois de ligar.
      if (parsed.data.ativa && entrouPelaSenha(request.sessao.claims)) {
        await supabase
          .from('sessoes_dois_fatores')
          .update({ verificada_em: new Date().toISOString() })
          .eq('session_id', sessionIdDe(request))
      }
      return { ativa: parsed.data.ativa }
    },
  )
}
