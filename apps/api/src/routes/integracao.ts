import type { FastifyInstance } from 'fastify'
import type {
  BuscarPacientesResposta,
  CriarAgendamentoRecepcaoResposta,
  DocumentoFlowLab,
  PacienteBuscaItem,
  TipoDocumento,
} from '@lab-hub/shared'
import { supabase } from '../lib/supabase.js'
import { flowlab } from '../lib/flowlab.js'
import { sincronizarAgendamento, type AgendamentoSyncRow } from '../lib/agendamentoSync.js'
import { autenticarFlowlab } from '../middlewares/apiKey.js'
import { labhubIdParamSchema } from '../schemas/documento.js'
import {
  buscarPacientesQuerySchema,
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

// Teto de resultados do typeahead de pacientes: o suficiente p/ o operador
// reconhecer a pessoa sem transformar a busca num despejo da base.
const BUSCA_PACIENTES_LIMITE = 8

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
}
