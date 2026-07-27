// Tipos crus dos LIS, antes da normalização. O tipo canônico que sai daqui
// (`Laudo`) mora em @lab-hub/shared, porque o front também o consome.

export type { Laudo, LaudoGrupo, LaudoLaboratorio, LaudoPainel, LaudoResultado } from '@lab-hub/shared'

// ---------------------------------------------------------------------------
// AOL (Álvaro Online) — XML
// ---------------------------------------------------------------------------

// Um exame da resposta XML da AOL, já parseado. Uma mesma OS pode render
// VÁRIOS destes quando a solicitação tem tipos de exame distintos.
export interface AolExam {
  codigo_os: string
  data_solicitacao: string | null // dataColeta da solicitação
  data_liberacao: string | null // dataresultado do exame
  nome_exame: string | null
  codigo_tipo: string | null // código numérico do tipo (ex.: "040", "085")
  status: string | null
  material: string | null // material de coleta resolvido (ex.: "soro")
  metodo: string | null // método analítico (ex.: "Hexoquinase")
  doctor: string | null // responsável técnico
  crm_documento: string | null // documento do responsável (CRM / CRF)
  // CPF do dono da OS, lido do nó <paciente> da solicitação. É o que a barreira
  // de identidade confere contra o paciente do token (ver laudos/identidade.ts).
  // null = a OS não trouxe identidade utilizável — não bloqueia, só não confirma.
  paciente_cpf: string | null
  analitos: AolAnalito[]
}

export interface AolAnalito {
  nome: string
  valor: string | null
  unidade: string | null
  referencia: string | null
}

// ---------------------------------------------------------------------------
// ApLIS — JSON
// ---------------------------------------------------------------------------

// Uma "Requisição" completa do ApLIS: paciente + procedimentos + resultados.
// O `requisicaoListar` devolve o shape com `procedimentos` vazio (só a capa);
// o `requisicaoResultado` devolve preenchido.
//
// O resultado vem em TRÊS formatos, conforme o módulo do ApLIS:
//  - `procedimentos` — análises clínicas (na prática vem null; ver LAUDOS_LIS.md)
//  - `paineis` — biologia molecular (PCR): alvos Positivo/Negativo por painel
//  - `laudo_texto` — patologia/citologia: o laudo descritivo (laudoMacro/Micro)
export interface AplisRequisicao {
  cod_requisicao: string
  data_solicitacao: string | null
  data_liberacao: string | null
  tipo_exame: string | null
  paciente: AplisPaciente
  procedimentos: AplisProcedimento[]
  local: AplisLocal
  paineis?: AplisPainelMolecular[]
  laudo_texto?: string | null
  responsavel?: AplisResponsavel | null
}

// Painel de biologia molecular (dat.exames[]): "GENOTIPAGEM HPV 28 TIPOS" com
// um alvo por linha. A referência é do PAINEL (ex.: "NEGATIVO") e vale para
// todos os alvos; `conclusao` é o Positivo/Negativo já interpretado pelo
// laboratório (o campo `resultado` cru é o Ct da reação — técnico, não exibido).
export interface AplisPainelMolecular {
  nome: string
  metodo: string | null
  referencia: string | null
  resultados: Array<{ nome: string; conclusao: string | null }>
}

// Quem assina o laudo no ApLIS: patologista (citologia/biópsia) ou o primeiro
// assinante (biologia molecular).
export interface AplisResponsavel {
  nome: string
  crm: string
}

export interface AplisPaciente {
  nome: string
  cpf: string
  data_nascimento: string | null
  sexo: string | null
  matricula_convenio?: string
}

export interface AplisProcedimento {
  codigo: string
  nome: string
  resultado: string | null
  unidade: string | null
  valor_referencia: string | null
  valor_total?: string
  status?: string
}

export interface AplisLocal {
  nome: string
  endereco: string | null
  numero: string | null
  cnes?: string
}

// Shape reduzido que as estratégias de mapeamento consomem. É a AplisRequisicao
// achatada: as estratégias só precisam dos analitos e das datas, não do paciente
// nem do local (que já vêm resolvidos no metadado comum).
export interface AplisExam {
  codigo_lis: string
  data_solicitacao: string | null
  data_liberacao: string | null
  tipo_exame: string | null
  analitos: AplisAnalito[]
}

export interface AplisAnalito {
  nome: string
  resultado: string | null
  unidade: string | null
  valor_referencia: string | null
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

import type { Laudo } from '@lab-hub/shared'

// Linha de `exam_results`. `result` null = requisição conhecida, resultado ainda
// não liberado pelo laboratório.
//
// `result` guarda a LISTA de laudos da linha — hoje um elemento: o pedido
// consolidado (cada exame da OS vira um grupo dentro dele; ver
// consolidaLaudosDaOs). A linha é uma por OS porque o PUT /v2/resultados
// devolve a OS inteira — é a unidade natural do cache. O shape de lista fica
// para permitir outras granularidades sem migração.
export interface ExamResultRow {
  id: string
  paciente_id: string
  cpf: string
  codigo_os: string | null
  codigo_lis: string | null
  result: Laudo[] | null
  cached_at: string | null
}
