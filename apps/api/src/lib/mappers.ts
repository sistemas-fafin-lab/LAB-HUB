import type {
  Agendamento,
  AgendamentoStatus,
  ExameColeta,
  Paciente,
  PainelResultado,
  Resultado,
  ResultadoStatus,
  Sexo,
} from '@lab-hub/shared'

// Converte as linhas snake_case do Postgres nos tipos camelCase de @lab-hub/shared,
// para que a API exponha o mesmo contrato consumido por web e mobile.

interface AgendamentoRow {
  id: string
  paciente_id: string
  posto_flowlab_id: string
  posto_nome: string
  data_hora: string
  status: string
  flowlab_id: string | null
  criado_em: string
  exames: ExameColeta[] | null
}

export function toAgendamento(row: AgendamentoRow): Agendamento {
  return {
    id: row.id,
    pacienteId: row.paciente_id,
    postoFlowlabId: row.posto_flowlab_id,
    postoNome: row.posto_nome,
    dataHora: row.data_hora,
    status: row.status as AgendamentoStatus,
    ...(row.flowlab_id ? { flowlabId: row.flowlab_id } : {}),
    criadoEm: row.criado_em,
    ...(row.exames ? { exames: row.exames } : {}),
  }
}

interface ResultadoRow {
  id: string
  paciente_id: string
  agendamento_id: string | null
  exame_nome: string
  categoria: string | null
  status: string
  resumo: string | null
  paineis: PainelResultado[] | null
  laudo_url: string | null
  declaracao_url: string | null
  liberado_em: string | null
  flowlab_analise_id: string | null
}

export function toResultado(row: ResultadoRow): Resultado {
  return {
    id: row.id,
    pacienteId: row.paciente_id,
    ...(row.agendamento_id ? { agendamentoId: row.agendamento_id } : {}),
    exameNome: row.exame_nome,
    ...(row.categoria ? { categoria: row.categoria } : {}),
    status: row.status as ResultadoStatus,
    ...(row.resumo ? { resumo: row.resumo } : {}),
    paineis: row.paineis ?? [],
    ...(row.laudo_url ? { laudoUrl: row.laudo_url } : {}),
    ...(row.declaracao_url ? { declaracaoUrl: row.declaracao_url } : {}),
    ...(row.liberado_em ? { liberadoEm: row.liberado_em } : {}),
    ...(row.flowlab_analise_id ? { flowlabAnaliseId: row.flowlab_analise_id } : {}),
  }
}

interface PacienteRow {
  id: string
  auth_user_id: string
  nome: string
  email: string
  cpf: string
  sexo: string
  data_nascimento: string
  telefone: string | null
  convenio_operadora: string | null
  convenio_plano: string | null
}

export function toPaciente(row: PacienteRow): Paciente {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    nome: row.nome,
    email: row.email,
    cpf: row.cpf,
    sexo: row.sexo as Sexo,
    dataNascimento: row.data_nascimento,
    ...(row.telefone ? { telefone: row.telefone } : {}),
    ...(row.convenio_operadora
      ? {
          convenio: {
            operadora: row.convenio_operadora,
            ...(row.convenio_plano ? { plano: row.convenio_plano } : {}),
          },
        }
      : {}),
  }
}
