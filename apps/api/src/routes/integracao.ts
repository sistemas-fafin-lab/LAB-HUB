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
import { registrarAcesso } from '../lib/auditoria.js'
import { detectarTipoArquivo } from '../lib/fileType.js'
import { sanitizarNome } from '../lib/nomeArquivo.js'
import { mensagemZod } from '../lib/validacao.js'
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
import { nomeArquivoDe, type DocumentoRow } from '../lib/mappers.js'
import { aadDe, cifrar, decifrarCpfPaciente, hashCpf } from '../lib/crypto.js'

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
// `cpf_enc`, não `cpf`: fase 2b (S-06, ticket 02) — a coluna em claro não é mais
// lida por este caminho.
interface PacienteBuscaRow {
  id: string
  nome: string
  cpf_enc: string
  data_nascimento: string
}

function toPacienteBuscaItem(row: PacienteBuscaRow): PacienteBuscaItem {
  return {
    id: row.id,
    nome: row.nome,
    cpfMascarado: mascararCpf(decifrarCpfPaciente(row.id, row.cpf_enc)),
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
        .select('id, nome, cpf_enc, data_nascimento')
        .ilike('nome', `%${termo}%`)
        .order('nome', { ascending: true })
        .limit(BUSCA_PACIENTES_LIMITE)
      if (error) {
        throw app.httpErrors.internalServerError('Falha ao buscar pacientes')
      }

      const pacientes = (data ?? []).map((r) => toPacienteBuscaItem(r as PacienteBuscaRow))

      // Fora da lista mínima do § S-08 e o mais importante dos que entraram por
      // fora dela: esta é a rota por onde a `FLOWLAB_API_KEY` sozinha varre a
      // base de pacientes, e essa chave é o P-06 — fraca, conhecida e aceita
      // como risco por decisão explícita. Risco aceito sem trilha é risco que
      // ninguém consegue verificar depois; com trilha, dá para ver a varredura.
      //
      // Sem `titularId` e sem o termo buscado, de propósito. O termo carrega
      // nome ou CPF (é o que motiva a redação de query em lib/http.ts) e gravá-lo
      // faria da trilha mais um lugar com PII em claro. Os ids dos até 8
      // pacientes devolvidos também ficam de fora: é um typeahead, dispara por
      // tecla digitada, e o volume afogaria as linhas que importam. Fica o
      // `quantidade`, que é o que revela a varredura — e a granularidade
      // "exatamente quem apareceu" é a dívida conhecida deste registro.
      await registrarAcesso(request, {
        atorTipo: 'flowlab',
        acao: 'integracao.pacientes.buscar',
        recursoTipo: 'paciente',
        quantidade: pacientes.length,
      })

      return { pacientes }
    },
  )

  // POST /integracao/pacientes/:pacienteId/correcao-identidade
  //
  // Corrige CPF/data de nascimento do paciente. Depois do claim os dois campos são
  // imutáveis no banco (trigger de 20260730120000), e a ÚNICA saída é a RPC chamada
  // aqui, que exige e registra a autorização.
  //
  // Vale também para o paciente SEM conta, que o trigger nem trava (31/07/2026):
  // não porque precise da saída de emergência, mas porque é a mesma decisão um
  // passo antes — o CPF do fantasma é o que define quem poderá reivindicar aquele
  // registro no cadastro (P-01). Antes disto a RPC recusava esse caso mandando
  // "corrija direto no cadastro", lugar que não existe nem aqui nem no FlowLab.
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
        // O chamador aqui é o FlowLab, não uma pessoa: quem depura a integração lê
        // ESTE log, não a tela. A mensagem curta vai na resposta e o detalhe fica
        // aqui. As issues do zod carregam `path` e `code`, não os valores enviados.
        request.log.warn({ issues: bodyParsed.error.issues }, 'payload inválido')
        throw app.httpErrors.badRequest(mensagemZod(bodyParsed.error))
      }
      const { cpf, dataNascimento, motivo, autorizadoPor, documentoConferido } = bodyParsed.data

      // Calculado ANTES da RPC, com as variantes que falham fechado (não as
      // tolerantes): sem `CPF_HASH_KEY`/`PII_KEY_K1` a correção falha aqui, e a
      // RPC nem chega a rodar — nenhuma trilha, nenhuma invalidação de cache de
      // laudos, nenhuma escrita (S-06, ticket 03). Envolto em try/catch, como
      // os outros dois pontos que calculam o índice cego na escrita, para não
      // vazar a mensagem interna de crypto.ts (chave ausente/malformada) para
      // o FlowLab — só o 500 genérico sai daqui.
      let cpfHash: string
      let cpfEnc: string
      try {
        cpfHash = hashCpf(cpf)
        cpfEnc = cifrar(cpf, aadDe('pacientes', 'cpf', paramParsed.data.pacienteId))
      } catch (cryptoError) {
        request.log.error(
          { err: cryptoError, pacienteId: paramParsed.data.pacienteId },
          'Falha ao gerar índice cego do CPF — correção de identidade abortada',
        )
        throw app.httpErrors.internalServerError('Falha ao corrigir identidade')
      }

      // `pacientes.cpf` em claro saiu no drop (S-06, ticket 04) — a RPC não tem
      // mais de onde ler o CPF anterior, e não tem a chave para decifrar
      // `cpf_enc` sozinha (§ S-06, cabeçalho de crypto.ts). A API busca e
      // decifra aqui, ANTES da troca: neste ponto `cpf_enc` ainda guarda o
      // valor de antes, porque o UPDATE que o substitui só roda DEPOIS da RPC
      // voltar (ver abaixo). É o único jeito de continuar mascarando o CPF
      // anterior na resposta e de gravar a trilha com o valor de antes da troca.
      //
      // Sem lock: ao contrário do `select ... for update` que a RPC faz logo
      // em seguida, esta leitura não serializa contra outra correção
      // concorrente do MESMO paciente. Duas requisições coladas (duplo clique,
      // retry do FlowLab) podem ler o mesmo `cpf_enc` "antigo" e a trilha da
      // segunda correção registraria um `cpf_anterior` uma correção defasado.
      // Aceito pelo mesmo motivo do resto desta rota: operação rara, manual,
      // limitada a 10/min — não o caminho a otimizar por uma trava que exigiria
      // reestruturar a RPC (ticket 03) para também escrever cpf_hash/cpf_enc.
      const { data: pacAtual, error: pacAtualErr } = await supabase
        .from('pacientes')
        .select('cpf_enc')
        .eq('id', paramParsed.data.pacienteId)
        .maybeSingle()
      if (pacAtualErr) {
        throw app.httpErrors.internalServerError('Falha ao corrigir identidade')
      }
      if (!pacAtual) {
        throw app.httpErrors.notFound('Paciente não encontrado')
      }

      let cpfAnteriorTexto: string
      try {
        cpfAnteriorTexto = decifrarCpfPaciente(paramParsed.data.pacienteId, pacAtual.cpf_enc as string)
      } catch (cryptoError) {
        request.log.error(
          { err: cryptoError, pacienteId: paramParsed.data.pacienteId },
          'Falha ao decifrar o CPF anterior — correção de identidade abortada',
        )
        throw app.httpErrors.internalServerError('Falha ao corrigir identidade')
      }

      const { data, error } = await supabase.rpc('corrigir_identidade_paciente', {
        p_paciente_id: paramParsed.data.pacienteId,
        p_cpf_novo: cpf,
        p_cpf_hash_novo: cpfHash,
        p_cpf_anterior_texto: cpfAnteriorTexto,
        p_nascimento_novo: dataNascimento,
        p_motivo: motivo,
        p_autorizado_por: autorizadoPor,
        p_documento_conferido: documentoConferido,
      })

      if (error) {
        // A RPC classifica as recusas por SQLSTATE para não virar 500 genérico:
        //   22023 = entrada inválida (CPF malformado, nada a corrigir)
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
        laudosInvalidados: number
        corrigidoEm: string
      }

      // A RPC não grava `cpf` (a coluna em claro foi dropada, ticket 04) nem
      // `cpf_hash`/`cpf_enc` — só `data_nascimento`. Este UPDATE é quem grava
      // `cpf_hash`/`cpf_enc` com o CPF novo, usando os valores já calculados (e
      // já validados) acima. Fica FORA da função SQL de propósito: a chave de
      // cifra/hash nunca entra no banco (§ S-06, cabeçalho de crypto.ts).
      // Best-effort e não falha a resposta — o CPF já foi corrigido (a trilha
      // e o cache de laudos já refletem a troca), que é o efeito que a
      // recepção pediu.
      try {
        const { error: syncError } = await supabase
          .from('pacientes')
          .update({ cpf_hash: cpfHash, cpf_enc: cpfEnc })
          .eq('id', resultado.pacienteId)
        if (syncError) throw syncError
      } catch (syncError) {
        // Não há mais backfill de CPF para "reencontrar" a linha (o ticket 04
        // removeu backfillPacientes() junto do drop de `pacientes.cpf` — não
        // sobrou coluna em claro para migrar). Por isso NÃO zera cpf_hash/
        // cpf_enc: zerar deixaria a linha sem nenhuma forma de busca até
        // alguém notar, e nada mais recalcula o par a partir do CPF novo. A
        // linha fica com o índice cego do CPF anterior (não apaga nada), e a
        // correção precisa ser reaplicada manualmente — pior que uma escrita
        // perdida seria uma escrita errada que ninguém percebe.
        request.log.error(
          { err: syncError, pacienteId: resultado.pacienteId },
          'CPF corrigido, mas cpf_hash/cpf_enc não sincronizaram — linha ficou com o índice cego do ' +
            'CPF anterior; reaplique a correção manualmente',
        )
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
        // Vem do CPF que a própria API decifrou ANTES de chamar a RPC (ver acima)
        // — a RPC não devolve mais `cpfAnterior` (ticket 04): a API já tinha o
        // valor decifrado, devolvê-lo de volta seria eco.
        cpfAnteriorMascarado: mascararCpf(cpfAnteriorTexto),
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
        // O chamador aqui é o FlowLab, não uma pessoa: quem depura a integração lê
        // ESTE log, não a tela. A mensagem curta vai na resposta e o detalhe fica
        // aqui. As issues do zod carregam `path` e `code`, não os valores enviados.
        request.log.warn({ issues: parsed.error.issues }, 'payload inválido')
        throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      }
      const { pacienteId, nome, cpf, dataNascimento, telefone, postoFlowlabId, dataHora } =
        parsed.data

      // 1) Confirma posto + horário contra a disponibilidade AO VIVO do FlowLab
      //    (mesma checagem do fluxo do paciente). A recepção escolhe um slot real da
      //    grade — não é encaixe livre — então validamos aqui p/ pegar o horário que
      //    ficou ocupado entre o operador abrir o modal e enviar.
      //    A grade vem com a janela retroativa: o registro é assíncrono e o horário
      //    lançado costuma já ter passado. Continua sendo um slot real e livre da
      //    grade — o que muda é só o piso da janela.
      const disponiveis = await flowlab.getDisponibilidadeRetroativa()
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
          .select('id, nome, cpf_enc, data_nascimento')
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
        // Fase 2b (S-06, ticket 02): busca pelo índice cego — `cpf` em claro não
        // é mais lido por este caminho. PRECONDIÇÃO DE DEPLOY: exige o backfill
        // de cpf_hash/cpf_enc já ter rodado (ver crypto.ts#decifrarCpfPaciente)
        // — sem isso, um paciente/fantasma antigo não é achado por CPF e a
        // recepção acaba criando um duplicado (que esbarra no `unique(cpf_hash)`,
        // a fonte definitiva de unicidade desde o drop de `cpf` — ticket 04).
        const { data: existente, error: buscaErr } = await supabase
          .from('pacientes')
          .select('id, nome, cpf_enc, data_nascimento')
          .eq('cpf_hash', hashCpf(cpfNorm))
          .maybeSingle()
        if (buscaErr) {
          throw app.httpErrors.internalServerError('Falha ao verificar CPF')
        }
        if (existente) {
          // Já existe (fantasma OU paciente real): reusa, nunca duplica o CPF.
          pacienteRow = existente as PacienteBuscaRow
        } else {
          // Id gerado aqui, e não pelo `gen_random_uuid()` do banco, porque o AAD
          // de `cpf_enc` é `pacientes:cpf:<id>` e precisa existir ANTES de cifrar
          // — mesmo motivo do `insertAwaiting` de exam_results.
          const novoPacienteId = randomUUID()
          // Fase 2b (S-06, ticket 03): índice cego + envelope cifrado são a
          // ÚNICA forma gravada — `cpf` em claro parou de ser escrito (ver a
          // migration do corte). `hashCpf`/`cifrar` direto, não as variantes
          // tolerantes: sem `CPF_HASH_KEY`/`PII_KEY_K1` a criação do fantasma
          // falha fechada, antes de qualquer INSERT.
          let cpfHash: string
          let cpfEnc: string
          try {
            cpfHash = hashCpf(cpfNorm)
            cpfEnc = cifrar(cpfNorm, aadDe('pacientes', 'cpf', novoPacienteId))
          } catch (cryptoError) {
            request.log.error(
              { err: cryptoError },
              'Falha ao gerar índice cego do CPF — paciente não criado',
            )
            throw app.httpErrors.internalServerError('Falha ao criar paciente')
          }
          const { data: criado, error: insErr } = await supabase
            .from('pacientes')
            .insert({
              id: novoPacienteId,
              nome,
              cpf_hash: cpfHash,
              cpf_enc: cpfEnc,
              data_nascimento: dataNascimento,
              ...(telefone ? { telefone } : {}),
            })
            .select('id, nome, cpf_enc, data_nascimento')
            .single()
          if (insErr || !criado) {
            // Corrida: outro request inseriu o mesmo CPF entre o SELECT e o INSERT.
            if (insErr?.code === '23505') {
              const { data: agora } = await supabase
                .from('pacientes')
                .select('id, nome, cpf_enc, data_nascimento')
                .eq('cpf_hash', hashCpf(cpfNorm))
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
      // labhubId passou pelo z.guid() do zod. Remover qualquer um dos dois abre
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

      // O acesso do FlowLab a um agendamento fica registrado mesmo quando não há
      // documento nenhum. A resposta vazia ainda conta uma coisa a quem
      // perguntou — que aquele agendamento existe —, e é justamente a sequência
      // de respostas vazias que desenha uma varredura de ids. Omitir o caso
      // vazio deixaria a varredura invisível e só o acerto visível.
      const auditar = async (quantidade: number): Promise<void> =>
        registrarAcesso(request, {
          atorTipo: 'flowlab',
          titularId: ag.paciente_id as string,
          acao: 'integracao.documentos.listar',
          recursoTipo: 'agendamento',
          recursoId: ag.id as string,
          quantidade,
        })

      // Curto-circuito: createSignedUrls([]) é uma ida ao Storage sem propósito.
      if (docs.length === 0) {
        await auditar(0)
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
            nomeArquivo: nomeArquivoDe(d),
            mimeType: d.mime_type,
            tamanhoBytes: d.tamanho_bytes,
            criadoEm: d.criado_em,
            url: assinada.signedUrl,
            expiraEm,
          },
        ]
      })

      // `documentos.length` e não `docs.length`: o flatMap acima descarta o
      // documento cuja assinatura falhou, e a trilha conta o que saiu daqui.
      await auditar(documentos.length)

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

      // Mesmo tratamento do upload do paciente (S-06 fase 2a): o nome descreve o
      // documento, então entra cifrado junto.
      const nomeArquivo = sanitizarNome(nomeOriginal, formato.extensao)

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          id: documentoId,
          paciente_id: ag.paciente_id,
          agendamento_id: ag.id, // anexa À COLETA (aparece no check-in deste agendamento)
          tipo,
          // Só cifrado (S-06, o corte) — mesmo tratamento do upload do paciente.
          nome_arquivo_enc: cifrar(nomeArquivo, aadDe('documentos', 'nome_arquivo', documentoId)),
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
        nomeArquivo: nomeArquivoDe(doc),
        mimeType: doc.mime_type,
        tamanhoBytes: doc.tamanho_bytes,
        criadoEm: doc.criado_em,
      }
      return reply.code(201).send(resposta)
    },
  )
}
