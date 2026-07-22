// Lab Hub — Shared package entry point
// Tipos de domínio compartilhados entre apps/web, apps/mobile e apps/api.
// Ref.: docs/PLANO_ANALISES_CLINICAS.md (Fase 3)

// ---------------------------------------------------------------------------
// Agendamentos
// ---------------------------------------------------------------------------

// Fluxo da coleta. 'em_coleta' (check-in feito na recepção) e 'bloqueado' (pendência
// na recepção) chegam do FlowLab via POST /webhooks/coletas; 'realizado' = coleta feita.
export type AgendamentoStatus =
  | 'pendente'
  | 'confirmado'
  | 'em_coleta'
  | 'realizado'
  | 'bloqueado'
  | 'cancelado'

// Exame marcado no check-in da coleta (snapshot vindo do FlowLab via
// /webhooks/coletas). `isCultura` destaca os microbiológicos que geram
// acompanhamento de cultura; `material` é o tipo de amostra (ex.: "Soro").
export interface ExameColeta {
  nome: string
  isCultura: boolean
  material?: string
}

export interface Agendamento {
  id: string
  pacienteId: string
  postoFlowlabId: string // id canônico do posto no FlowLab
  postoNome: string // snapshot do nome p/ exibição
  dataHora: string // ISO 8601
  status: AgendamentoStatus
  flowlabId?: string
  criadoEm: string
  // Exames coletados (snapshot). Só chega a partir de 'realizado' — os exames são
  // selecionados no FlowLab na hora de registrar a coleta.
  exames?: ExameColeta[]
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

// Marcador individual — espelha ExamPanel de apps/web (WebHero.tsx)
export interface PainelResultado {
  nome: string
  valor: string
  unidade: string
  ref: string
  ok: boolean
  trend?: number[]
}

export type ResultadoStatus = 'analyzing' | 'ready'

export interface Resultado {
  id: string
  pacienteId: string
  agendamentoId?: string
  exameNome: string
  categoria?: string
  status: ResultadoStatus
  resumo?: string
  paineis: PainelResultado[] // D1: dados estruturados, não só PDF
  laudoUrl?: string // PDF opcional
  declaracaoUrl?: string // PDF opcional
  liberadoEm?: string
  flowlabAnaliseId?: string
}

// ---------------------------------------------------------------------------
// Documentos do paciente
// ---------------------------------------------------------------------------

// Só documentos que o PACIENTE envia para adiantar o check-in. Atestado,
// declaração e laudo são emitidos pelo laboratório e vivem em `Resultado`.
export type TipoDocumento = 'identidade' | 'carteirinha' | 'pedido_medico' | 'outro'

// Não expõe o storagePath: o cliente lê o arquivo por GET /documentos/:id/url.
export interface Documento {
  id: string
  pacienteId: string
  // Ausente = documento perene do paciente (identidade, carteirinha), vale para
  // toda coleta. Presente = documento daquela coleta (pedido médico).
  agendamentoId?: string
  tipo: TipoDocumento
  nomeArquivo: string // nome original, só exibição
  mimeType: string // tipo real (magic bytes), não o declarado no upload
  tamanhoBytes: number
  criadoEm: string
}

// O upload é multipart, não JSON: os campos (file, tipo, agendamentoId) estão
// documentados em apps/api/src/schemas/documento.ts. A resposta é `Documento`.

// GET /documentos/:id/url — signed URL temporária do bucket privado.
export interface DocumentoUrl {
  url: string
  expiraEm: string // ISO — quando a signed URL vence
}

// ---------------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------------

export type Sexo = 'M' | 'F'

// Convênio do paciente. Ambos snapshots de texto: `operadora` é a empresa
// (ex.: "Unimed") e `plano` o nome do plano (ex.: "Premium"). Opcional pois
// nem todo paciente tem convênio cadastrado.
export interface Convenio {
  operadora: string
  plano?: string
}

export interface Paciente {
  id: string
  authUserId: string
  nome: string
  email: string
  cpf: string // só dígitos (11 chars)
  sexo: Sexo
  dataNascimento: string // ISO date (YYYY-MM-DD)
  telefone?: string
  convenio?: Convenio
}

// Body do PUT /api/v1/pacientes/me — campos editáveis do perfil. Identidade
// (cpf, dataNascimento, sexo) e e-mail (credencial de login) não são editáveis
// por aqui. `convenio: null` limpa o convênio.
export interface AtualizarPacientePayload {
  nome: string
  telefone?: string
  convenio?: Convenio | null
}

// Entrada do auto-cadastro (POST /api/v1/cadastro): cria o usuário no Auth
// e a linha de paciente. O CPF pode vir formatado; a API normaliza p/ dígitos.
export interface CadastroPacientePayload {
  email: string
  password: string
  nome: string
  cpf: string
  sexo: Sexo
  dataNascimento: string // YYYY-MM-DD
  telefone?: string
}

// ---------------------------------------------------------------------------
// Contratos de integração com o FlowLab
// ---------------------------------------------------------------------------

// Disponibilidade de um posto de coleta (proxy em tempo real do FlowLab — D3).
// O LAB-HUB não mantém tabela de postos: este shape vem da Edge Function
// get-disponibilidade e também tipa GET /api/v1/postos/disponibilidade.
export interface PostoDisponivel {
  id: string // → posto_flowlab_id
  nome: string // → posto_nome (snapshot)
  endereco: string
  slots: string[] // horários ISO 8601 disponíveis
}

// Payload enviado ao FlowLab ao criar um agendamento
export interface AgendamentoPayloadFlowLab {
  labhubId: string
  pacienteNome: string
  pacienteTelefone: string
  postoFlowlabId: string
  dataHora: string
}

// Payload enviado ao FlowLab ao cancelar um agendamento. O FlowLab identifica o
// agendamento pelo labhubId (chave de idempotência usada também no receive) e o
// marca como 'cancelado', liberando o slot.
export interface CancelamentoPayloadFlowLab {
  labhubId: string
}

// Item de GET /integracao/agendamentos/:labhubId/documentos, consumido pelo
// FlowLab no check-in. `url` é signed URL FRESCA gerada sob demanda: os bytes
// nunca saem do LAB-HUB e nada é copiado para o FlowLab.
export interface DocumentoFlowLab {
  id: string
  tipo: TipoDocumento
  nomeArquivo: string
  mimeType: string
  tamanhoBytes: number
  criadoEm: string
  url: string
  expiraEm: string // ISO — as URLs vencem juntas; o painel precisa refazer a busca
}

export interface DocumentosAgendamentoFlowLab {
  agendamentoLabhubId: string
  documentos: DocumentoFlowLab[]
}

// ---------------------------------------------------------------------------
// Agendamento manual pela recepção (FlowLab → LAB-HUB, canal /integracao)
// ---------------------------------------------------------------------------

// Item da busca de pacientes usada no typeahead da recepção
// (GET /integracao/pacientes/buscar). Campos mínimos p/ o operador confirmar a
// identidade sem expor a linha inteira: o CPF vem MASCARADO (só os últimos
// dígitos) e não trafega e-mail/telefone/convênio.
export interface PacienteBuscaItem {
  id: string
  nome: string
  cpfMascarado: string // ex.: "•••.•••.•**-•3" — só os últimos dígitos visíveis
  dataNascimento: string // ISO date (YYYY-MM-DD)
}

export interface BuscarPacientesResposta {
  pacientes: PacienteBuscaItem[]
}

// Body do POST /integracao/agendamentos (recepção cria um agendamento).
// Dois modos, resolvidos pelo servidor:
//   - paciente EXISTENTE: envia `pacienteId` (escolhido no typeahead).
//   - paciente NOVO: envia `nome` + `cpf` + `dataNascimento`. O servidor faz
//     find-or-create por CPF; se o CPF já existir (fantasma ou real), reusa a
//     linha em vez de duplicar.
export interface CriarAgendamentoRecepcaoPayload {
  pacienteId?: string
  nome?: string
  cpf?: string // pode vir formatado; a API normaliza p/ 11 dígitos
  dataNascimento?: string // YYYY-MM-DD
  telefone?: string
  postoFlowlabId: string
  dataHora: string // ISO 8601
}

// Resposta do POST /integracao/agendamentos. `flowlabId` só vem presente quando o
// sync com o FlowLab foi confirmado na hora; se o FlowLab estiver fora, o
// agendamento fica 'pendente' no LAB-HUB (sincronizado=false) para reprocesso.
export interface CriarAgendamentoRecepcaoResposta {
  agendamentoLabhubId: string
  flowlabId?: string
  sincronizado: boolean
  paciente: PacienteBuscaItem
  pacienteCriado: boolean // true = fantasma recém-criado; false = reusou existente
}

// Payload recebido do FlowLab via webhook de resultado (D1)
export interface ResultadoWebhookPayload {
  agendamentoLabhubId: string
  exameNome: string
  categoria?: string
  resumo?: string
  paineis: PainelResultado[]
  laudoUrl?: string
  declaracaoUrl?: string
  liberadoEm: string
}

// ---------------------------------------------------------------------------
// Laudos vindos dos LIS (ApLIS / AOL)
// ---------------------------------------------------------------------------

// Segunda fonte de resultado, independente do webhook do FlowLab acima: a API
// BUSCA o laudo nos sistemas do laboratório (ApLIS e Álvaro Online) e cacheia em
// `exam_results`. Ver docs/LAUDOS_LIS.md.
//
// Os nomes de campo aqui são em inglês e snake_case misturados de propósito —
// são os do pipeline original (LabHubExam), preservados para que as 11
// estratégias de mapeamento portadas não precisassem ser reescritas. O resto do
// pacote segue camelCase em português; esta seção é a exceção conhecida.

export interface LaudoLaboratorio {
  nome: string
  cnes: string
  endereco: string
}

// Marcador já formatado para exibição. Equivale ao PainelResultado do FlowLab,
// com os nomes de campo do pipeline LIS.
export interface LaudoPainel {
  name: string
  value: string
  unit: string
  ref: string
  ok: boolean
  trend: number[]
}

// Subgrupo de marcadores — hoje só hemograma (Série Branca / Vermelha / Plaquetas).
export interface LaudoGrupo {
  name: string
  panels: LaudoPainel[]
}

// Linha de resultado crua, preservando null (valor ainda não liberado) — o
// LaudoPainel correspondente já troca null por '—' para a tela.
export interface LaudoResultado {
  name: string
  value: string | null
  unit: string
  reference_value: string | null
  is_out_of_range: boolean | null
  status: 'ok' | 'abnormal' | 'pending' | 'error'
}

export interface Laudo {
  id: string
  name: string
  category: string
  date: string // "DD Mmm YYYY" — exibição curta no card
  fullDate: string // "DD de mês de YYYY"
  data_coleta: string // ISO YYYY-MM-DD
  data_registro: string // ISO YYYY-MM-DD
  data_emissao: string // ISO YYYY-MM-DD
  material: string // ex.: "Soro", "Sangue Total com EDTA"
  metodo: string // ex.: "Hexoquinase"
  laboratorio: LaudoLaboratorio
  unit: string
  doctor: string
  crm: string
  status: 'ready' | 'pending' | 'partial'
  summary: string
  panels: LaudoPainel[]
  results?: LaudoResultado[]
  groups?: LaudoGrupo[]
  // Metadados internos — a UI não renderiza, mas servem de chave de deduplicação
  // e de rastro da origem.
  exam_type: string
  codigo_os: string // '' quando o laudo só existe no ApLIS; fundido = lista separada por vírgula
  codigo_lis: string | null
  // Data de coleta da REQUISIÇÃO no ApLIS (ISO) — pode diferir de `data_coleta`
  // quando a OS da AOL é de outra remessa (fezes entregues dias após o sangue).
  // É a chave que liga uma OS órfã (idOsLis digitado como CPF) de volta ao
  // pedido; ver fundirPedidosPorColeta.
  data_coleta_pedido?: string
  source: 'aol' | 'aplis' | 'merged'
  partial: boolean // true = faltou uma das fontes; o dado pode mudar
  cached_at?: string // ISO 8601 — quando este laudo foi cacheado
}

// GET /api/v1/laudos. `source` diz se veio do cache ou de uma busca ao vivo nos
// LIS — útil para a tela sinalizar "atualizando…" numa revalidação em background.
export interface RespostaLaudos {
  exams: Laudo[]
  source: 'cached' | 'live'
}
