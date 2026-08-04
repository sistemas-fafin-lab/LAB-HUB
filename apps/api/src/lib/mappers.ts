import { aadDe, decifrar, decifrarJson } from './crypto.js'
import type {
  Agendamento,
  AgendamentoStatus,
  Documento,
  ExameColeta,
  Paciente,
  PainelResultado,
  Resultado,
  ResultadoStatus,
  Sexo,
  TipoDocumento,
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
  // S-06 fase 2a: quais exames a pessoa vai fazer é a mesma revelação que o
  // resultado. A coluna em claro foi dropada no corte; esta é a única que
  // sobrou. Opcional porque nem todo select a traz.
  exames_enc?: string | null
}

export function toAgendamento(row: AgendamentoRow): Agendamento {
  const exames = row.exames_enc
    ? decifrarJson<ExameColeta[]>(row.exames_enc, aadDe('agendamentos', 'exames', row.id))
    : null

  return {
    id: row.id,
    pacienteId: row.paciente_id,
    postoFlowlabId: row.posto_flowlab_id,
    postoNome: row.posto_nome,
    dataHora: row.data_hora,
    status: row.status as AgendamentoStatus,
    ...(row.flowlab_id ? { flowlabId: row.flowlab_id } : {}),
    criadoEm: row.criado_em,
    ...(exames ? { exames } : {}),
  }
}

interface ResultadoRow {
  id: string
  paciente_id: string
  agendamento_id: string | null
  // `exame_nome` é a última coluna em claro que sobrou: ela participa de
  // `uq_resultado_agendamento_exame`, e unicidade não existe sobre coluna
  // cifrada com IV aleatório. Sai quando a unicidade migrar para o
  // `exame_flowlab_id`.
  exame_nome: string
  status: string
  // S-06: o conteúdo clínico vive SÓ nestas. Opcionais porque nem todo select as
  // traz — não porque possam faltar na linha.
  resumo_enc?: string | null
  paineis_enc?: string | null
  // Fase 2a: o rótulo entra junto — "TESTE RÁPIDO COVID-19" ao lado do nome do
  // paciente conta a história sem precisar de nenhum valor medido.
  exame_nome_enc?: string | null
  categoria_enc?: string | null
  laudo_url: string | null
  declaracao_url: string | null
  liberado_em: string | null
  flowlab_analise_id: string | null
}

export function toResultado(row: ResultadoRow): Resultado {
  // Decifra (S-06). Não há mais coluna em claro para onde cair — ela foi
  // dropada no corte, e falha de decifragem propaga em vez de virar fallback
  // silencioso: chave errada tem de aparecer como erro, não como "tudo normal".
  // A exceção é `exame_nome`, a última que ainda tem as duas.
  const resumo = row.resumo_enc
    ? decifrar(row.resumo_enc, aadDe('resultados', 'resumo', row.id))
    : null
  const paineis = row.paineis_enc
    ? decifrarJson<PainelResultado[]>(row.paineis_enc, aadDe('resultados', 'paineis', row.id))
    : null
  const exameNome = row.exame_nome_enc
    ? decifrar(row.exame_nome_enc, aadDe('resultados', 'exame_nome', row.id))
    : row.exame_nome
  const categoria = row.categoria_enc
    ? decifrar(row.categoria_enc, aadDe('resultados', 'categoria', row.id))
    : null

  return {
    id: row.id,
    pacienteId: row.paciente_id,
    ...(row.agendamento_id ? { agendamentoId: row.agendamento_id } : {}),
    exameNome,
    ...(categoria ? { categoria } : {}),
    status: row.status as ResultadoStatus,
    ...(resumo ? { resumo } : {}),
    paineis: paineis ?? [],
    ...(row.laudo_url ? { laudoUrl: row.laudo_url } : {}),
    ...(row.declaracao_url ? { declaracaoUrl: row.declaracao_url } : {}),
    ...(row.liberado_em ? { liberadoEm: row.liberado_em } : {}),
    ...(row.flowlab_analise_id ? { flowlabAnaliseId: row.flowlab_analise_id } : {}),
  }
}

export interface DocumentoRow {
  id: string
  paciente_id: string
  agendamento_id: string | null
  tipo: string
  storage_path: string
  mime_type: string
  tamanho_bytes: number
  criado_em: string
  // S-06 fase 2a: o nome do arquivo descreve o documento ("pedido_medico_
  // hemograma.pdf"), então é dado clínico como qualquer outro rótulo.
  nome_arquivo_enc?: string | null
}

/** Nome do arquivo já decifrado (S-06). Usado também fora do `toDocumento`. */
export function nomeArquivoDe(row: Pick<DocumentoRow, 'id' | 'nome_arquivo_enc'>): string {
  if (row.nome_arquivo_enc) {
    return decifrar(row.nome_arquivo_enc, aadDe('documentos', 'nome_arquivo', row.id))
  }
  // Sem coluna em claro para onde cair — ela foi dropada no corte. Lançar em vez
  // de devolver string vazia: um `Content-Disposition` com nome vazio seria um
  // download quebrado que ninguém liga ao banco.
  throw new Error(`Documento ${row.id} está sem nome_arquivo_enc`)
}

// storage_path fica DE FORA de propósito: é detalhe interno e o cliente lê o
// arquivo por GET /documentos/:id/url. (toResultado expõe laudo_url/declaracao_url,
// que são paths — vazamento menor herdado; não replicar aqui.)
export function toDocumento(row: DocumentoRow): Documento {
  return {
    id: row.id,
    pacienteId: row.paciente_id,
    ...(row.agendamento_id ? { agendamentoId: row.agendamento_id } : {}),
    tipo: row.tipo as TipoDocumento,
    nomeArquivo: nomeArquivoDe(row),
    mimeType: row.mime_type,
    tamanhoBytes: row.tamanho_bytes,
    criadoEm: row.criado_em,
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
