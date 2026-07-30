import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type {
  BuscarPacientesResposta,
  CorrigirIdentidadeResposta,
  CriarAgendamentoRecepcaoResposta,
  DocumentoFlowLab,
  PacienteBuscaItem,
  TipoDocumento,
} from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { flowlab } from '../lib/flowlab.js'
import { sincronizarAgendamento, type AgendamentoSyncRow } from '../lib/agendamentoSync.js'
import { autenticarFlowlab } from '../middlewares/apiKey.js'
import { detectarTipoArquivo } from '../lib/fileType.js'
import {
  labhubIdParamSchema,
  uploadDocumentoIntegracaoQuerySchema,
} from '../schemas/documento.js'
import {
  buscarPacientesQuerySchema,
  correcaoIdentidadeParamSchema,
  corrigirIdentidadeSchema,
  criarAgendamentoRecepcaoSchema,
} from '../schemas/recepcao.js'
import type { DocumentoRow } from '../lib/mappers.js'

// Rotas consumidas PELO FlowLab (server-to-server, autenticadas por API key).
// Ficam num arquivo separado de propósito: este módulo não importa `authenticate`,
// então não há como esquecer o preHandler e cair no buraco do middlewares/auth.ts
// (`pacienteId: string` é declarado não-opcional via declaration merging — uma
// rota sem o preHandler compila e faz .eq('paciente_id', undefined) em silêncio).

const BUCKET = 'documentos'

// TTL maior que o do paciente (300s): é a duração de uma sessão de conferência no
// balcão. O funcionário abre a ficha, olha identidade/carteirinha/pedido e
// registra a coleta.
const FLOWLAB_URL_TTL_SEGUNDOS = 900

// Casa com o file_size_limit do bucket e com o teto do upload do paciente
// (routes/documentos.ts). O corpo binário do upload de integração é limitado a isto.
const TAMANHO_MAX_BYTES = 10 * 1024 * 1024

// Limite do nome exibido (idêntico ao de routes/documentos.ts). O nome NÃO compõe o
// path (que é UUID) — vai só para exibição e para o Content-Disposition do download.
const NOME_MAX_CHARS = 120

// Teto de resultados do typeahead de pacientes: o suficiente p/ o operador
// reconhecer a pessoa sem transformar a busca num despejo da base.
const BUSCA_PACIENTES_LIMITE = 8

// Só exibição: corta, remove quebras de linha (que envenenariam o header
// Content-Disposition) e garante algo não-vazio. Espelha sanitizarNome de
// routes/documentos.ts — mantido local para não acoplar os dois arquivos de rota.
function sanitizarNome(original: string | undefined, extensao: string): string {
  const limpo = (original ?? '').replace(/[\r\n\t]/g, '').trim().slice(0, NOME_MAX_CHARS)
  return limpo || `documento.${extensao}`
}

// Mascara o CPF revelando só os 2 últimos dígitos (verificadores) — o operador
// já digitou/tem o CPF em mãos; isto serve só para ele confirmar que a linha é a
// certa, sem devolver o documento inteiro pelo canal de busca.
function mascararCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '').padStart(11, '0')
  return `•••.•••.•••-${d.slice(9)}`
}

// Colunas mínimas do paciente devolvidas ao FlowLab (sem e-mail/telefone/convênio).
interface PacienteBuscaRow {
  id: string
  nome: string
  cpf: string
  data_nascimento: string
}

function toPacienteBuscaItem(row: PacienteBuscaRow): PacienteBuscaItem {
  return {
    id: row.id,
    nome: row.nome,
    cpfMascarado: mascararCpf(row.cpf),
    dataNascimento: row.data_nascimento,
  }
}

export async function integracaoRoutes(app: FastifyInstance): Promise<void> {
  // Parser do corpo BINÁRIO do upload de documento (application/octet-stream).
  // Server-to-server: o FlowLab manda os bytes crus e o `tipo` na query, então
  // não há multipart aqui (evita depender do registro de @fastify/multipart de
  // routes/documentos.ts). Escopo encapsulado neste plugin — não afeta as rotas
  // JSON vizinhas, que seguem no parser padrão por casarem outro content-type.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: TAMANHO_MAX_BYTES },
    (_req, body, done) => done(null, body),
  )

  // GET /integracao/pacientes/buscar?q=<nome>
  //
  // Typeahead da recepção do FlowLab: busca pacientes por nome (case/acento-
  // insensível via ilike) para o operador escolher um paciente já cadastrado.
  // Exposição de PII deliberadamente mínima — só nome + CPF mascarado + data de
  // nascimento, o bastante p/ confirmar identidade no balcão.
  app.get(
    '/integracao/pacientes/buscar',
    {
      preHandler: autenticarFlowlab, // API key, NÃO JWT de paciente
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request): Promise<BuscarPacientesResposta> => {
      const parsed = buscarPacientesQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        throw app.httpErrors.badRequest('Parâmetro de busca inválido')
      }
      // Escapa os curingas do LIKE (%, _) e a própria \ no termo do usuário, senão
      // "50%" ou "a_b" viram padrões e a busca varre linhas que o operador não pediu.
      const termo = parsed.data.q.replace(/[\\%_]/g, (c) => `\\${c}`)

      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, cpf, data_nascimento')
        .ilike('nome', `%${termo}%`)
        .order('nome', { ascending: true })
        .limit(BUSCA_PACIENTES_LIMITE)
      if (error) {
        throw app.httpErrors.internalServerError('Falha ao buscar pacientes')
      }

      return { pacientes: (data ?? []).map((r) => toPacienteBuscaItem(r as PacienteBuscaRow)) }
    },
  )

  // POST /integracao/pacientes/:pacienteId/correcao-identidade
  //
  // Corrige CPF/data de nascimento de um paciente que JÁ vinculou conta. Depois do
  // claim os dois campos são imutáveis no banco (trigger de 20260730120000), e a
  // ÚNICA saída é a RPC chamada aqui, que exige e registra a autorização.
  //
  // Por que só a recepção pode: nenhum dado que o sistema guarda prova que o CPF
  // novo pertence a quem pede — CPF antigo, nascimento, e-mail, telefone e até
  // código por SMS são todos coisas que o dono da conta já tem. Quem prova é o
  // operador olhando o documento físico, a mesma conferência do cadastro no
  // balcão. Por isso esta rota vive no canal de API key e não no portal.
  //
  // A RPC também descarta o cache de laudos do paciente: aquelas linhas foram
  // buscadas nos LIS com o CPF ANTIGO.
  app.post(
    '/integracao/pacientes/:pacienteId/correcao-identidade',
    {
      preHandler: autenticarFlowlab, // API key, NÃO JWT de paciente
      // Teto baixo de propósito: é operação de exceção, feita a pedido no balcão.
      // Um pico aqui é sinal de abuso, não de uso.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request): Promise<CorrigirIdentidadeResposta> => {
      const paramParsed = correcaoIdentidadeParamSchema.safeParse(request.params)
      if (!paramParsed.success) {
        throw app.httpErrors.badRequest('pacienteId inválido')
      }
      const bodyParsed = corrigirIdentidadeSchema.safeParse(request.body)
      if (!bodyParsed.success) {
        throw app.httpErrors.badRequest(bodyParsed.error.message)
      }
      const { cpf, dataNascimento, motivo, autorizadoPor, documentoConferido } = bodyParsed.data

      const { data, error } = await supabase.rpc('corrigir_identidade_paciente', {
        p_paciente_id: paramParsed.data.pacienteId,
        p_cpf_novo: cpf,
        p_nascimento_novo: dataNascimento,
        p_motivo: motivo,
        p_autorizado_por: autorizadoPor,
        p_documento_conferido: documentoConferido,
      })

      if (error) {
        // A RPC classifica as recusas por SQLSTATE para não virar 500 genérico:
        //   22023 = entrada inválida (CPF malformado, nada a corrigir, sem conta)
        //   P0002 = paciente inexistente
        //   23505 = CPF já é de outro cadastro → é caso de FUSÃO, não de correção
        //   42501 = o trigger recusou (não deve acontecer por este caminho)
        const mapa: Record<string, (m: string) => Error> = {
          '22023': (m) => app.httpErrors.badRequest(m),
          P0002: () => app.httpErrors.notFound('Paciente não encontrado'),
          '23505': (m) => app.httpErrors.conflict(m),
        }
        const construir = mapa[error.code ?? '']
        if (construir) {
          throw construir(error.message)
        }
        request.log.error(
          { err: error, pacienteId: paramParsed.data.pacienteId },
          'Falha ao corrigir identidade do paciente',
        )
        throw app.httpErrors.internalServerError('Falha ao corrigir identidade')
      }

      const resultado = data as {
        correcaoId: string
        pacienteId: string
        cpfAnterior: string
        laudosInvalidados: number
        corrigidoEm: string
      }

      // Trilha permanente é a da tabela; este log é o eco operacional. Sem CPF
      // (nem o antigo, nem o novo) — quem precisa do valor consulta a trilha.
      request.log.info(
        {
          correcaoId: resultado.correcaoId,
          pacienteId: resultado.pacienteId,
          autorizadoPor,
          documentoConferido,
          laudosInvalidados: resultado.laudosInvalidados,
        },
        'Identidade de paciente corrigida pela recepção',
      )

      return {
        correcaoId: resultado.correcaoId,
        pacienteId: resultado.pacienteId,
        // Mascarado pelo mesmo motivo do typeahead: confirma para o operador que a
        // linha certa foi alterada sem devolver o documento inteiro pelo canal.
        cpfAnteriorMascarado: mascararCpf(resultado.cpfAnterior),
        laudosInvalidados: resultado.laudosInvalidados,
        corrigidoEm: resultado.corrigidoEm,
      }
    },
  )

  // POST /integracao/agendamentos
  //
  // Recepção do FlowLab cria um agendamento (walk-in / encaixe). Dois modos:
  //   - paciente EXISTENTE (pacienteId): usa a linha escolhida no typeahead.
  //   - paciente NOVO (nome+cpf+dataNascimento): find-or-create por CPF. Não achou
  //     → cria um paciente "fantasma" (sem auth_user_id/email/sexo) que a pessoa
  //     reivindica depois ao se cadastrar com o MESMO CPF (ver routes/cadastro.ts).
  //
  // Depois cria o agendamento (status 'pendente') e o sincroniza com o FlowLab
  // pelo MESMO caminho do agendamento do paciente (lock atômico + receive), então
  // o ac_agendamentos nasce lá com labhub_id como qualquer outro.
  app.post(
    '/integracao/agendamentos',
    {
      preHandler: autenticarFlowlab, // API key, NÃO JWT de paciente
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = criarAgendamentoRecepcaoSchema.safeParse(request.body)
      if (!parsed.success) {
        throw app.httpErrors.badRequest(parsed.error.message)
      }
      const { pacienteId, nome, cpf, dataNascimento, telefone, postoFlowlabId, dataHora } =
        parsed.data

      // 1) Confirma posto + horário contra a disponibilidade AO VIVO do FlowLab
      //    (mesma checagem do fluxo do paciente). A recepção escolhe um slot real da
      //    grade — não é encaixe livre — então validamos aqui p/ pegar o horário que
      //    ficou ocupado entre o operador abrir o modal e enviar.
      const disponiveis = await flowlab.getDisponibilidade()
      const posto = disponiveis.find((p) => p.id === postoFlowlabId)
      if (!posto) {
        throw app.httpErrors.badRequest('Posto desconhecido')
      }
      if (!posto.slots.includes(dataHora)) {
        throw app.httpErrors.badRequest('Horário indisponível')
      }

      // 2) Resolve o paciente (existente por id, ou find-or-create por CPF).
      let pacienteRow: PacienteBuscaRow
      let pacienteCriado = false

      if (pacienteId) {
        const { data, error } = await supabase
          .from('pacientes')
          .select('id, nome, cpf, data_nascimento')
          .eq('id', pacienteId)
          .maybeSingle()
        if (error) {
          throw app.httpErrors.internalServerError('Falha ao carregar paciente')
        }
        if (!data) {
          throw app.httpErrors.notFound('Paciente não encontrado')
        }
        pacienteRow = data as PacienteBuscaRow
      } else {
        // Modo NOVO — o refine do schema garante nome+cpf+dataNascimento presentes.
        const cpfNorm = cpf as string
        const { data: existente, error: buscaErr } = await supabase
          .from('pacientes')
          .select('id, nome, cpf, data_nascimento')
          .eq('cpf', cpfNorm)
          .maybeSingle()
        if (buscaErr) {
          throw app.httpErrors.internalServerError('Falha ao verificar CPF')
        }
        if (existente) {
          // Já existe (fantasma OU paciente real): reusa, nunca duplica o CPF.
          pacienteRow = existente as PacienteBuscaRow
        } else {
          const { data: criado, error: insErr } = await supabase
            .from('pacientes')
            .insert({
              nome,
              cpf: cpfNorm,
              data_nascimento: dataNascimento,
              ...(telefone ? { telefone } : {}),
            })
            .select('id, nome, cpf, data_nascimento')
            .single()
          if (insErr || !criado) {
            // Corrida: outro request inseriu o mesmo CPF entre o SELECT e o INSERT.
            if (insErr?.code === '23505') {
              const { data: agora } = await supabase
                .from('pacientes')
                .select('id, nome, cpf, data_nascimento')
                .eq('cpf', cpfNorm)
                .single()
              pacienteRow = agora as PacienteBuscaRow
            } else {
              throw app.httpErrors.internalServerError('Falha ao criar paciente')
            }
          } else {
            pacienteRow = criado as PacienteBuscaRow
            pacienteCriado = true
          }
        }
      }

      // 3) Cria o agendamento (status 'pendente') e sincroniza com o FlowLab.
      const { data: agCriado, error: agErr } = await supabase
        .from('agendamentos')
        .insert({
          paciente_id: pacienteRow.id,
          posto_flowlab_id: postoFlowlabId,
          posto_nome: posto.nome,
          data_hora: dataHora,
          status: 'pendente',
        })
        .select()
        .single()
      if (agErr || !agCriado) {
        throw app.httpErrors.internalServerError('Falha ao criar agendamento')
      }

      // O slot reservado deixa de estar disponível: descarta o cache de exibição.
      flowlab.invalidarDisponibilidade()

      // Sincroniza (best-effort): se o FlowLab estiver fora, o agendamento fica
      // 'pendente' aqui e pode ser reprocessado — não falhamos o request.
      const ag = agCriado as AgendamentoSyncRow
      const resultado = await sincronizarAgendamento(ag, request.log)

      const resposta: CriarAgendamentoRecepcaoResposta = {
        agendamentoLabhubId: ag.id,
        ...(ag.flowlab_id ? { flowlabId: ag.flowlab_id } : {}),
        sincronizado: resultado === 'confirmado',
        paciente: toPacienteBuscaItem(pacienteRow),
        pacienteCriado,
      }
      return reply.code(201).send(resposta)
    },
  )

  // GET /integracao/agendamentos/:labhubId/documentos
  //
  // Consumida pelo FlowLab no check-in. Devolve signed URLs FRESCAS, geradas
  // agora: os arquivos ficam só aqui e nada é copiado p/ o FlowLab (uma cópia dos
  // bytes, um lugar p/ apagar — LGPD).
  app.get(
    '/integracao/agendamentos/:labhubId/documentos',
    {
      preHandler: autenticarFlowlab, // API key, NÃO JWT de paciente
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request) => {
      const parsed = labhubIdParamSchema.safeParse(request.params)
      if (!parsed.success) {
        throw app.httpErrors.badRequest('labhubId inválido')
      }

      // O FlowLab só conhece o agendamento (labhub_id = agendamentos.id) e NUNCA
      // envia paciente_id — resolvemos o paciente a partir do agendamento. Assim
      // não existe forma de pedir "os documentos do paciente X": o escopo é
      // sempre derivado de um agendamento que o FlowLab já recebeu.
      const { data: ag, error: agError } = await supabase
        .from('agendamentos')
        .select('id, paciente_id')
        .eq('id', parsed.data.labhubId)
        .maybeSingle()
      if (agError) {
        throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
      }
      if (!ag) {
        throw app.httpErrors.notFound('Agendamento não encontrado')
      }

      // Documentos daquela coleta (pedido médico) + os perenes do paciente
      // (identidade, carteirinha) — exatamente o que o check-in precisa ver.
      // A interpolação no .or() é segura porque ag.id vem de uma coluna uuid e o
      // labhubId passou pelo .uuid() do zod. Remover qualquer um dos dois abre
      // injeção de filtro no PostgREST.
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('paciente_id', ag.paciente_id as string)
        .or(`agendamento_id.eq.${ag.id as string},agendamento_id.is.null`)
        .order('criado_em', { ascending: false })
      if (error) {
        throw app.httpErrors.internalServerError('Falha ao listar documentos')
      }

      const docs = (data ?? []) as DocumentoRow[]
      // Curto-circuito: createSignedUrls([]) é uma ida ao Storage sem propósito.
      if (docs.length === 0) {
        return { agendamentoLabhubId: ag.id as string, documentos: [] }
      }

      // createSignedUrls (plural): uma ida ao Storage p/ N documentos, não N.
      const { data: assinadas, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          docs.map((d) => d.storage_path),
          FLOWLAB_URL_TTL_SEGUNDOS,
        )
      if (signError || !assinadas) {
        throw app.httpErrors.internalServerError('Falha ao gerar URLs assinadas')
      }

      const expiraEm = new Date(Date.now() + FLOWLAB_URL_TTL_SEGUNDOS * 1000).toISOString()
      // Casa por path, não por índice: createSignedUrls devolve erro POR ITEM e
      // confiar na ordem faria a URL de um documento sair no lugar de outro —
      // o funcionário veria a identidade de um paciente sob o rótulo de outro doc.
      const porPath = new Map(assinadas.map((a) => [a.path, a]))
      const documentos = docs.flatMap<DocumentoFlowLab>((d) => {
        const assinada = porPath.get(d.storage_path)
        if (!assinada?.signedUrl) {
          request.log.error(
            { storagePath: d.storage_path },
            'Falha ao assinar documento — omitido da resposta',
          )
          return []
        }
        return [
          {
            id: d.id,
            tipo: d.tipo as TipoDocumento,
            nomeArquivo: d.nome_arquivo,
            mimeType: d.mime_type,
            tamanhoBytes: d.tamanho_bytes,
            criadoEm: d.criado_em,
            url: assinada.signedUrl,
            expiraEm,
          },
        ]
      })

      return { agendamentoLabhubId: ag.id as string, documentos }
    },
  )

  // POST /integracao/agendamentos/:labhubId/documentos?tipo=<tipo>
  //
  // A recepção do FlowLab anexa um documento do paciente (identidade, carteirinha,
  // pedido médico) ao criar/preparar a coleta. O arquivo chega como corpo binário
  // cru; o `tipo` vem na query e o nome exibível no header x-nome-arquivo.
  //
  // Espelha o POST /documentos do paciente: mesma validação por magic bytes, mesmo
  // layout de path ({paciente_id}/{uuid}.{ext}) e a MESMA compensação de órfão. A
  // diferença é a autorização (API key, não JWT) e o paciente ser derivado do
  // agendamento — o FlowLab nunca escolhe paciente_id, igual ao GET acima.
  app.post(
    '/integracao/agendamentos/:labhubId/documentos',
    {
      preHandler: autenticarFlowlab, // API key, NÃO JWT de paciente
      bodyLimit: TAMANHO_MAX_BYTES,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const paramParsed = labhubIdParamSchema.safeParse(request.params)
      if (!paramParsed.success) {
        throw app.httpErrors.badRequest('labhubId inválido')
      }
      const queryParsed = uploadDocumentoIntegracaoQuerySchema.safeParse(request.query)
      if (!queryParsed.success) {
        throw app.httpErrors.badRequest('tipo inválido')
      }
      const { tipo } = queryParsed.data

      const buffer = request.body
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw app.httpErrors.badRequest('Arquivo ausente')
      }

      // Resolve o paciente A PARTIR do agendamento (o FlowLab só conhece o
      // labhub_id do agendamento). Sem isto, o FlowLab poderia anexar ao paciente
      // de outro — igual ao cuidado do GET de documentos.
      const { data: ag, error: agError } = await supabase
        .from('agendamentos')
        .select('id, paciente_id')
        .eq('id', paramParsed.data.labhubId)
        .maybeSingle()
      if (agError) {
        throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
      }
      if (!ag) {
        throw app.httpErrors.notFound('Agendamento não encontrado')
      }

      // Tipo REAL pelos magic bytes, nunca pelo que o cliente declarou.
      const formato = detectarTipoArquivo(buffer)
      if (!formato) {
        throw app.httpErrors.badRequest('Formato não suportado. Envie JPG, PNG, WEBP ou PDF.')
      }

      // Id pré-gerado p/ derivar o path antes do insert — deixa UMA janela de
      // falha (o insert), e ela tem compensação.
      const documentoId = randomUUID()
      const storagePath = `${ag.paciente_id as string}/${documentoId}.${formato.extensao}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: formato.mimeType, // o SNIFFADO, nunca o header do cliente
          upsert: false,
        })
      if (uploadError) {
        request.log.error({ err: uploadError, storagePath }, 'Falha ao enviar arquivo ao Storage')
        throw app.httpErrors.internalServerError('Falha ao enviar arquivo')
      }

      const nomeHeader = request.headers['x-nome-arquivo']
      let nomeOriginal: string | undefined
      try {
        // O FlowLab manda o nome URL-encoded (evita caracteres inválidos em header).
        nomeOriginal = typeof nomeHeader === 'string' ? decodeURIComponent(nomeHeader) : undefined
      } catch {
        nomeOriginal = undefined // header malformado → cai no nome-padrão do sanitizador
      }

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          id: documentoId,
          paciente_id: ag.paciente_id,
          agendamento_id: ag.id, // anexa À COLETA (aparece no check-in deste agendamento)
          tipo,
          nome_arquivo: sanitizarNome(nomeOriginal, formato.extensao),
          storage_path: storagePath,
          mime_type: formato.mimeType,
          tamanho_bytes: buffer.length,
        })
        .select()
        .single()

      if (error || !data) {
        // Compensação: o objeto subiu mas a linha não existe — remove p/ não deixar
        // lixo (e dado pessoal) no bucket. Idêntico ao POST /documentos.
        const { error: limpezaError } = await supabase.storage.from(BUCKET).remove([storagePath])
        if (limpezaError) {
          request.log.error(
            { err: limpezaError, storagePath },
            'Objeto órfão no bucket após insert falho',
          )
        }
        throw app.httpErrors.internalServerError('Falha ao registrar documento')
      }

      // Devolve o metadado do documento (sem URL: a recepção não precisa exibi-lo
      // agora; o check-in pede signed URLs frescas quando for conferir).
      const doc = data as DocumentoRow
      const resposta: Omit<DocumentoFlowLab, 'url' | 'expiraEm'> = {
        id: doc.id,
        tipo: doc.tipo as TipoDocumento,
        nomeArquivo: doc.nome_arquivo,
        mimeType: doc.mime_type,
        tamanhoBytes: doc.tamanho_bytes,
        criadoEm: doc.criado_em,
      }
      return reply.code(201).send(resposta)
    },
  )
}
