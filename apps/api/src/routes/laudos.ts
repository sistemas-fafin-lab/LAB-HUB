import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Laudo } from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { laudoService } from '../laudos/index.js'
import { filtraPorFonte } from '../laudos/service.js'
import { DatabaseError, IntegrationError, ValidationError } from '../laudos/errors.js'

// Laudos buscados nos LIS (ApLIS / AOL). Fonte independente da tabela
// `resultados`, que continua sendo alimentada pelo webhook do FlowLab.
// Ver docs/LAUDOS_LIS.md.

export async function laudosRoutes(app: FastifyInstance): Promise<void> {
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
    const { data, error } = await supabase
      .from('pacientes')
      .select('cpf, data_nascimento, sexo')
      .eq('id', pacienteId)
      .single()
    if (error || !data?.cpf) {
      throw app.httpErrors.notFound('Paciente não encontrado')
    }
    return {
      cpf: data.cpf as string,
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

      try {
        return await laudoService.fetchAndCacheExams(
          request.pacienteId,
          cpf,
          refresh === 'true',
          request.log,
          { nascimento, sexo },
        )
      } catch (err) {
        throw comoHttpError(err)
      }
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
      .select('result')
      .eq('id', id)
      .eq('paciente_id', request.pacienteId)
      .maybeSingle()

    if (error) {
      throw app.httpErrors.internalServerError('Falha ao consultar o laudo')
    }
    if (!data?.result) {
      throw app.httpErrors.notFound('Laudo não encontrado')
    }
    // Linha anterior à mudança de granularidade guardava objeto único.
    const laudos = (Array.isArray(data.result) ? data.result : [data.result]) as Laudo[]

    // O mesmo corte de fonte do GET /laudos — senão esta rota seria o buraco
    // por onde o laudo escondido da lista continuaria saindo. Linha que sobra
    // vazia é 404: para o cliente, ela não está disponível.
    const visiveis = filtraPorFonte(laudos)
    if (visiveis.length === 0) {
      throw app.httpErrors.notFound('Laudo não encontrado')
    }
    return visiveis
  })
}
