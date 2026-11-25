import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { decifrarCpfPaciente } from '../lib/crypto.js'
import { registrarAcesso } from '../lib/auditoria.js'
import { laudoOriginalService, laudoService } from '../laudos/index.js'
import type { LaudoOriginalService } from '../laudos/laudoOriginal.js'
import { laudosDaLinha } from '../laudos/repository.js'
import { filtraPorFonte } from '../laudos/service.js'
import {
  DatabaseError,
  EntregaRecusadaError,
  IntegrationError,
  NaoEncontradoError,
  ValidationError,
} from '../laudos/errors.js'

// Laudos buscados nos LIS (ApLIS / AOL). Fonte independente da tabela
// `resultados`, que continua sendo alimentada pelo webhook do FlowLab.
// Ver docs/LAUDOS_LIS.md.

// Formatos aceitos na URL do laudo original. Fora deles a resposta é o mesmo
// 404 de "não existe": nenhum valor estranho chega ao apLIS nem ao cabeçalho.
const CODIGO_REQUISICAO = /^[A-Za-z0-9-]{1,40}$/
const ID_ANEXO = /^\d{1,20}$/

const LAUDO_ORIGINAL_INDISPONIVEL = 'O laudo original está indisponível no momento. Tente novamente mais tarde.'

// Tão apertado quanto o `?refresh=true` do GET /laudos: cada chamada vai ao
// apLIS e ao site interno, que é o que a recepção usa e não tem contrato de carga.
const LIMITE_LAUDO_ORIGINAL = { rateLimit: { max: 5, timeWindow: '1 minute' } }

export interface LaudosRoutesOptions {
  /** Só os testes passam: troca o serviço por um montado com dublês. */
  laudoOriginal?: LaudoOriginalService
}

export async function laudosRoutes(app: FastifyInstance, opts: LaudosRoutesOptions = {}): Promise<void> {
  const laudoOriginal = opts.laudoOriginal ?? laudoOriginalService

  // Erros do módulo de laudos → HTTP. O 502 é o que importa distinguir: LIS fora
  // do ar não é defeito nosso e a tela deve poder dizer "tente de novo".
  const comoHttpError = (err: unknown): Error => {
    if (err instanceof IntegrationError) {
      return app.httpErrors.badGateway('O sistema do laboratório não respondeu. Tente novamente em instantes.')
    }
    if (err instanceof ValidationError) {
      return app.httpErrors.badRequest(err.message)
    }
    if (err instanceof DatabaseError) {
      return app.httpErrors.internalServerError('Falha ao consultar seus laudos')
    }
    return err as Error
  }

  // O CPF sai SEMPRE do paciente do token — nunca da query string. É ele que
  // identifica o paciente nos LIS, então aceitá-lo do cliente daria a qualquer
  // um os laudos de qualquer CPF. Nascimento e sexo vão junto: escolhem a linha
  // certa das referências estratificadas por idade/sexo da AOL.
  const dadosDoPaciente = async (
    pacienteId: string,
  ): Promise<{ cpf: string; nascimento: string; sexo: 'M' | 'F' }> => {
    // Fase 2b (S-06, ticket 02): `cpf` em claro não é mais lido — só `cpf_enc`.
    const { data, error } = await supabase
      .from('pacientes')
      .select('cpf_enc, data_nascimento, sexo')
      .eq('id', pacienteId)
      .single()
    if (error || !data?.cpf_enc) {
      throw app.httpErrors.notFound('Paciente não encontrado')
    }
    return {
      cpf: decifrarCpfPaciente(pacienteId, data.cpf_enc as string),
      nascimento: data.data_nascimento as string,
      sexo: data.sexo as 'M' | 'F',
    }
  }

  // GET /laudos — lista os laudos do paciente autenticado.
  //
  // Sem ?refresh: responde do cache na hora e revalida em background (SWR).
  // Com ?refresh=true: espera a busca ao vivo nos LIS, varrendo todas as páginas
  // do período no ApLIS (ver aviso de custo em laudos/aplis.ts).
  //
  // O limite é APERTADO só no refresh. A leitura normal precisa de folga: três
  // telas montam o hook useResultados (lista, home e busca do topo), então uma
  // navegação comum já dispara várias chamadas por minuto.
  app.get(
    '/laudos',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: (request: FastifyRequest) =>
            (request.query as { refresh?: string })?.refresh === 'true' ? 5 : 60,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const { refresh } = request.query as { refresh?: string }
      const { cpf, nascimento, sexo } = await dadosDoPaciente(request.pacienteId)

      let resposta: Awaited<ReturnType<typeof laudoService.fetchAndCacheExams>>
      try {
        resposta = await laudoService.fetchAndCacheExams(
          request.pacienteId,
          cpf,
          refresh === 'true',
          request.log,
          { nascimento, sexo },
        )
      } catch (err) {
        throw comoHttpError(err)
      }

      // Registrado DEPOIS do sucesso e antes do return: a trilha conta o que foi
      // entregue, não o que foi tentado. A revalidação em background do caminho
      // SWR não gera linha nenhuma — ela não devolve nada a ninguém, e uma
      // trilha que registra o que o servidor faz sozinho enterra o que as
      // pessoas fizeram.
      await registrarAcesso(request, {
        atorTipo: 'paciente',
        atorId: request.pacienteId,
        titularId: request.pacienteId,
        acao: 'laudos.listar',
        recursoTipo: 'exam_result',
        quantidade: resposta.exams.length,
      })

      return resposta
    },
  )

  // GET /laudos/:id — os laudos de uma linha do cache (uma requisição ApLIS = 1;
  // uma OS da AOL = um por exame). Devolve sempre a lista.
  // Filtra por paciente_id junto com o id: sem isso, um UUID vazado devolveria o
  // laudo de outra pessoa.
  app.get('/laudos/:id', { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string }

    const { data, error } = await supabase
      .from('exam_results')
      // Sem `result`: a coluna em claro sai no drop do S-06, e nomear coluna
      // inexistente no PostgREST não devolve campo vazio — é 400, esta rota
      // inteira fora do ar. O envelope é a única fonte.
      .select('id, result_enc')
      .eq('id', id)
      .eq('paciente_id', request.pacienteId)
      .maybeSingle()

    if (error) {
      throw app.httpErrors.internalServerError('Falha ao consultar o laudo')
    }
    if (!data?.result_enc) {
      throw app.httpErrors.notFound('Laudo não encontrado')
    }
    // Decodifica pelo mesmo caminho do repositório — inclusive a normalização da
    // linha antiga, que guardava objeto único em vez de lista. Duplicar isso
    // aqui é como a duplicata de `sanitizarNome` do P-05 terminou: uma cópia
    // esquece o AAD e a outra não, e a divergência só aparece em produção.
    const laudos = laudosDaLinha(data as { id: string; result_enc?: string | null })

    // O mesmo corte de fonte do GET /laudos — senão esta rota seria o buraco
    // por onde o laudo escondido da lista continuaria saindo. Linha que sobra
    // vazia é 404: para o cliente, ela não está disponível.
    const visiveis = filtraPorFonte(laudos)
    if (visiveis.length === 0) {
      throw app.httpErrors.notFound('Laudo não encontrado')
    }

    // `recursoId` é o id da LINHA do cache (o `:id` da URL), estável no banco —
    // e não o id de cada laudo mapeado, que é sorteado a cada mapeamento
    // (laudos/service.ts) e não apontaria para nada meses depois.
    await registrarAcesso(request, {
      atorTipo: 'paciente',
      atorId: request.pacienteId,
      titularId: request.pacienteId,
      acao: 'laudos.ler',
      recursoTipo: 'exam_result',
      recursoId: id,
      quantidade: visiveis.length,
    })

    return visiveis
  })

  // ---------------------------------------------------------------------------
  // Laudo original — o PDF do laboratório de apoio, anexado à requisição no
  // apLIS. Buscado ao vivo e nunca guardado (ver laudos/laudoOriginal.ts).
  // ---------------------------------------------------------------------------

  // Tudo que sai daqui é do paciente e de agora: nem o navegador nem um proxy
  // podem guardar.
  const semCache = (reply: FastifyReply): FastifyReply =>
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache')

  const naoEncontrado = (): Error => app.httpErrors.notFound('Laudo original não encontrado')

  // O paciente nunca vê erro técnico: site fora do ar e entrega recusada têm a
  // mesma mensagem. O status separa os dois para quem opera.
  const comoErroDoOriginal = (err: unknown): Error => {
    if (err instanceof NaoEncontradoError) return naoEncontrado()
    if (err instanceof IntegrationError) return app.httpErrors.badGateway(LAUDO_ORIGINAL_INDISPONIVEL)
    if (err instanceof EntregaRecusadaError) return app.httpErrors.conflict(LAUDO_ORIGINAL_INDISPONIVEL)
    return comoHttpError(err)
  }

  // GET /laudos/requisicoes/:codigoLis/original — os laudos originais da
  // requisição. Só ids: o nome que a recepção deu ao arquivo pode trazer o nome
  // de alguém, e aqui o PDF ainda não foi conferido.
  app.get(
    '/laudos/requisicoes/:codigoLis/original',
    { preHandler: authenticate, config: LIMITE_LAUDO_ORIGINAL },
    async (request, reply) => {
      const { codigoLis } = request.params as { codigoLis: string }
      if (!CODIGO_REQUISICAO.test(codigoLis)) throw naoEncontrado()
      const { cpf } = await dadosDoPaciente(request.pacienteId)

      semCache(reply)
      try {
        return { arquivos: await laudoOriginal.listar(request.pacienteId, cpf, codigoLis) }
      } catch (err) {
        if (err instanceof IntegrationError) request.log.warn({ codigoLis, err }, 'Laudo original: listagem falhou')
        throw comoErroDoOriginal(err)
      }
    },
  )

  // GET /laudos/requisicoes/:codigoLis/original/:idAnexo — o PDF.
  app.get(
    '/laudos/requisicoes/:codigoLis/original/:idAnexo',
    { preHandler: authenticate, config: LIMITE_LAUDO_ORIGINAL },
    async (request, reply) => {
      const { codigoLis, idAnexo } = request.params as { codigoLis: string; idAnexo: string }
      if (!CODIGO_REQUISICAO.test(codigoLis) || !ID_ANEXO.test(idAnexo)) throw naoEncontrado()
      const { cpf } = await dadosDoPaciente(request.pacienteId)

      semCache(reply)
      let entrega: Awaited<ReturnType<LaudoOriginalService['baixar']>>
      try {
        entrega = await laudoOriginal.baixar(request.pacienteId, cpf, codigoLis, idAnexo, request.log)
      } catch (err) {
        if (err instanceof IntegrationError) {
          request.log.warn({ codigoLis, idAnexo, err }, 'Laudo original: download falhou')
        }
        throw comoErroDoOriginal(err)
      }

      // Depois da conferência e antes do envio: a trilha conta o que foi entregue.
      await registrarAcesso(request, {
        atorTipo: 'paciente',
        atorId: request.pacienteId,
        titularId: request.pacienteId,
        acao: 'laudo.original',
        recursoTipo: 'exam_result',
        recursoId: entrega.linhaId,
      })
      // A trilha guarda a linha do laudo; QUAL dos anexos saiu fica aqui.
      request.log.info({ codigoLis, idAnexo, linhaId: entrega.linhaId }, 'Laudo original entregue')

      return reply
        .type('application/pdf')
        // O nome é montado aqui, com o código já validado acima — o do arquivo
        // no apLIS não é repetido.
        .header('Content-Disposition', `attachment; filename="laudo-original-${codigoLis}.pdf"`)
        .send(Buffer.from(entrega.pdf))
    },
  )
}
