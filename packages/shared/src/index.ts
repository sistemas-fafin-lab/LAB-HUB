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
