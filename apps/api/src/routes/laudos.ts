import type { FastifyInstance, FastifyRequest } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middlewares/auth.js'
import { registrarAcesso } from '../lib/auditoria.js'
import { laudoService } from '../laudos/index.js'
import { laudosDaLinha } from '../laudos/repository.js'
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
      .select('id, result, result_enc')
      .eq('id', id)
      .eq('paciente_id', request.pacienteId)
      .maybeSingle()

    if (error) {
      throw app.httpErrors.internalServerError('Falha ao consultar o laudo')
    }
    if (!data?.result && !data?.result_enc) {
      throw app.httpErrors.notFound('Laudo não encontrado')
    }
    // Decodifica pelo mesmo caminho do repositório — inclusive a normalização da
    // linha antiga, que guardava objeto único em vez de lista. Duplicar isso
    // aqui é como a duplicata de `sanitizarNome` do P-05 terminou: uma cópia
    // esquece o AAD e a outra não, e a divergência só aparece em produção.
    const laudos = laudosDaLinha(data as { id: string; result?: unknown; result_enc?: string | null })

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
}
